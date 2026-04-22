import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  db, partnersTable, partnerEmailRecipientsTable, partnerThemesTable,
  ordersTable, usageEvents,
} from "@workspace/db";
import { getPublicUrlInfo } from "../lib/publicUrl";
import {
  emailConfigStatus, buildOrderEmailContext,
  sendOrderConfirmation, sendOpsForward,
} from "../lib/email";
import { getUncachableResendClient } from "../lib/resend";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}
router.use("/admin/email-readiness", requireAuth);

type PartnerStatus = "ready" | "warning" | "incomplete";

function statusFor(missing: string[], warnings: string[]): PartnerStatus {
  if (missing.length > 0) return "incomplete";
  if (warnings.length > 0) return "warning";
  return "ready";
}

// GET /api/admin/email-readiness — single page snapshot of:
//  - system-level config (Resend key, public app URL source, default from)
//  - per-partner config status with missing/warnings details
//  - recent email failures (last 25)
router.get("/admin/email-readiness", async (_req, res): Promise<void> => {
  // System config
  const publicUrl = getPublicUrlInfo();
  let resendKeyConfigured = false;
  let defaultFromAddress: string | null = null;
  let resendError: string | null = null;
  try {
    const { fromEmail } = await getUncachableResendClient();
    resendKeyConfigured = true;
    defaultFromAddress = fromEmail || null;
  } catch (e: any) {
    resendError = e?.message || String(e);
  }

  // Partner readiness
  const partners = await db.select().from(partnersTable).orderBy(partnersTable.companyName);
  const partnerIds = partners.map(p => p.id);
  const recipientCounts = partnerIds.length > 0 ? await db.select({
    partnerId: partnerEmailRecipientsTable.partnerId,
    count: sql<number>`count(*)::int`,
  }).from(partnerEmailRecipientsTable)
    .where(inArray(partnerEmailRecipientsTable.partnerId, partnerIds))
    .groupBy(partnerEmailRecipientsTable.partnerId) : [];
  const recipientCountMap = new Map(recipientCounts.map(r => [r.partnerId, Number(r.count)]));

  const partnerRows = partners.map(p => {
    const { ready, missing, warnings } = emailConfigStatus(p);
    const recipientCount = recipientCountMap.get(p.id) ?? 0;
    // The send pipeline (sendOpsForward → getRecipientsByRole) treats
    // role-based partner_email_recipients rows as a fully valid routing
    // path. So if recipients exist, drop "internal_forward_email"-style
    // misses from emailConfigStatus to avoid false-negatives. Only flag a
    // gap when there is NO routing path at all.
    const internalForwardKeys = new Set([
      "internal_forward_email",
      "internalForwardEmail",
      "routing_email",
      "routingEmail",
    ]);
    const localMissing = recipientCount > 0
      ? missing.filter(m => !internalForwardKeys.has(m))
      : [...missing];
    if (!p.internalForwardEmail && !p.routingEmail && recipientCount === 0) {
      localMissing.push("No internal forward / routing recipients configured");
    }
    return {
      partnerId: p.id,
      slug: p.slug,
      name: p.companyName,
      emailEnabled: p.emailEnabled,
      fromName: p.emailFromName || p.companyName,
      replyToEmail: p.replyToEmail || p.contactEmail || null,
      internalForwardEmail: p.internalForwardEmail,
      routingEmail: p.routingEmail,
      ccEmail: p.ccEmail,
      recipientCount,
      missing: localMissing,
      warnings,
      status: statusFor(localMissing, warnings),
      ready: ready && localMissing.length === 0,
    };
  });

  // Recent email failures (last 25). Tied to partner + order via objectId.
  const recentFailures = await db.select({
    id: usageEvents.id,
    eventType: usageEvents.eventType,
    partnerId: usageEvents.partnerId,
    objectType: usageEvents.objectType,
    objectId: usageEvents.objectId,
    meta: usageEvents.meta,
    createdAt: usageEvents.createdAt,
  }).from(usageEvents)
    .where(eq(usageEvents.eventType, "email.failed"))
    .orderBy(desc(usageEvents.createdAt))
    .limit(25);

  const summary = partnerRows.reduce((acc, r) => {
    acc[r.status]++; return acc;
  }, { ready: 0, warning: 0, incomplete: 0 });

  res.json({
    system: {
      resendKeyConfigured,
      resendError,
      defaultFromAddress,
      publicUrl,
    },
    summary,
    partners: partnerRows,
    recentFailures,
  });
});

const TestBody = z.object({
  partnerId: z.number().int().positive(),
  toEmail: z.string().email(),
});

// Helper: find or build a tiny throwaway order context to render & send a
// realistic test message without polluting real order history.
async function pickTestOrderContext(partnerId: number) {
  const [latest] = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.partnerId, partnerId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);
  if (!latest) return null;
  return await buildOrderEmailContext(latest.id);
}

router.post("/admin/email-readiness/test/customer-confirmation", async (req, res): Promise<void> => {
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const ctx = await pickTestOrderContext(parsed.data.partnerId);
  if (!ctx) { res.status(409).json({ error: "Partner has no orders yet — create one first to test the customer confirmation template." }); return; }
  // Re-target the recipient to the supplied address so we don't email a real
  // customer during testing. We clone the order so we don't mutate the row.
  const testCtx = { ...ctx, order: { ...ctx.order, contactEmail: parsed.data.toEmail, contactName: ctx.order.contactName || "Test Recipient" } };
  const result = await sendOrderConfirmation(testCtx as any);
  res.status(result.ok ? 200 : 500).json({ ok: result.ok, error: (result as any).error, providerId: (result as any).id, sentTo: parsed.data.toEmail, basedOnOrderId: ctx.order.id });
});

router.post("/admin/email-readiness/test/internal-routing", async (req, res): Promise<void> => {
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const ctx = await pickTestOrderContext(parsed.data.partnerId);
  if (!ctx) { res.status(409).json({ error: "Partner has no orders yet — create one first to test internal routing." }); return; }
  // CRITICAL: do NOT call sendInternalOrderForward here — its underlying
  // sendOpsForward resolves recipients from partner_email_recipients first
  // and only falls back to partner fields, so configured ops/cc/bcc rows
  // would still receive the test email. Use sendOpsForward's explicit
  // overrideTo to force exactly one recipient and suppress all configured
  // cc/bcc routing.
  const result = await sendOpsForward(ctx as any, [parsed.data.toEmail]);
  res.status(result.ok ? 200 : 500).json({ ok: result.ok, error: (result as any).error, providerId: (result as any).id, sentTo: parsed.data.toEmail, basedOnOrderId: ctx.order.id });
});

export default router;
