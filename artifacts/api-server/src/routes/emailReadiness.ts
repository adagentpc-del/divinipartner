import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import dns from "node:dns/promises";
import {
  db, partnersTable, partnerEmailRecipientsTable, partnerThemesTable,
  ordersTable, usageEvents,
} from "@workspace/db";
import { getPublicUrlInfo } from "../lib/publicUrl";
import {
  emailConfigStatus, buildOrderEmailContext,
  sendOrderConfirmation, sendOpsForward,
  sendFinanceNotification, sendPartnerContactNotification, sendVendorNotification,
  sendGenericBrandedTest,
} from "../lib/email";
import { getUncachableResendClient } from "../lib/resend";
import {
  GetEmailReadinessResponse,
  GetEmailReadinessDnsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

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
router.get("/admin/email-readiness", async (req, res): Promise<void> => {
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
    createdAt: usageEvents.occurredAt,
  }).from(usageEvents)
    .where(eq(usageEvents.eventType, "email.failed"))
    .orderBy(desc(usageEvents.occurredAt))
    .limit(25);

  const summary = partnerRows.reduce((acc, r) => {
    acc[r.status]++; return acc;
  }, { ready: 0, warning: 0, incomplete: 0 });

  sendValidated(req, res, GetEmailReadinessResponse, {
    system: {
      resendKeyConfigured,
      resendError,
      defaultFromAddress,
      publicUrl,
    },
    summary,
    partners: partnerRows,
    recentFailures,
  }, "GetEmailReadiness");
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

// Task #27: dedicated test send for the PM intake packet template. Reuses
// sendOpsForward (which is what production uses) but with the same single-
// recipient + cc/bcc suppression guarantees as the internal-routing test
// so admins can preview the packet without spamming routing addresses.
router.post("/admin/email-readiness/test/pm-intake", async (req, res): Promise<void> => {
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const ctx = await pickTestOrderContext(parsed.data.partnerId);
  if (!ctx) { res.status(409).json({ error: "Partner has no orders yet — create one first to preview the PM intake packet." }); return; }
  const result = await sendOpsForward(ctx as any, [parsed.data.toEmail], { suppressCcBcc: true });
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
  // overrideTo to force exactly one recipient AND suppressCcBcc to skip
  // every configured cc/bcc address — together they guarantee the test
  // reaches only the address the admin entered.
  const result = await sendOpsForward(ctx as any, [parsed.data.toEmail], { suppressCcBcc: true });
  res.status(result.ok ? 200 : 500).json({ ok: result.ok, error: (result as any).error, providerId: (result as any).id, sentTo: parsed.data.toEmail, basedOnOrderId: ctx.order.id });
});

// ---------------------------------------------------------------------------
// Generic branded test send — does not require an existing order. Lets the
// admin verify branding + provider connectivity for a freshly onboarded
// partner before any orders flow.
// ---------------------------------------------------------------------------
const GenericTestBody = z.object({
  partnerId: z.number().int().positive(),
  toEmail: z.string().email(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

router.post("/admin/email-readiness/test/generic", async (req, res): Promise<void> => {
  const parsed = GenericTestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, parsed.data.partnerId)).limit(1);
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  const result = await sendGenericBrandedTest({
    partner,
    to: parsed.data.toEmail,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });
  res.status(result.ok ? 200 : 500).json({ ok: result.ok, error: (result as any).error, providerId: (result as any).id, sentTo: parsed.data.toEmail });
});

// ---------------------------------------------------------------------------
// Domain Authentication — performs *real* DNS lookups against the sender
// domain so admins can see whether SPF, DKIM (Resend's CNAME), and DMARC
// records actually resolve in public DNS. We do NOT claim a record is
// "verified" by the email provider — that's done at the Resend dashboard.
// We only report what public DNS returns. Anything we cannot resolve is
// surfaced as "manual verification required" rather than "missing", because
// transient lookup failures and unusual provider configs are common.
// ---------------------------------------------------------------------------
type DnsRecordStatus = "present" | "missing" | "unknown";
type DnsCheck = {
  label: string;
  recordType: "TXT" | "CNAME";
  hostname: string;
  status: DnsRecordStatus;
  values: string[];
  matchedExpectation: boolean | null;
  expectationHint: string;
  note: string;
  error: string | null;
};

function senderDomainOf(addressOrNull: string | null): string | null {
  if (!addressOrNull) return null;
  // Allow either "Name <user@host>" or "user@host"
  const m = /<([^>]+)>/.exec(addressOrNull);
  const raw = (m ? m[1] : addressOrNull).trim();
  const at = raw.indexOf("@");
  if (at < 0) return null;
  const host = raw.slice(at + 1).trim().toLowerCase();
  return host || null;
}

function rootDomainOf(host: string): string {
  // Best-effort eTLD+1 — good enough for alignment hints. We avoid pulling in
  // a public-suffix list because admins read this as a hint, not enforcement.
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

async function lookupTxt(hostname: string): Promise<{ values: string[]; error: string | null }> {
  try {
    const records = await dns.resolveTxt(hostname);
    return { values: records.map(chunks => chunks.join("")), error: null };
  } catch (e: any) {
    if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") return { values: [], error: null };
    return { values: [], error: e?.code || e?.message || "lookup_failed" };
  }
}

async function lookupCname(hostname: string): Promise<{ values: string[]; error: string | null }> {
  try {
    const records = await dns.resolveCname(hostname);
    return { values: records, error: null };
  } catch (e: any) {
    if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") return { values: [], error: null };
    return { values: [], error: e?.code || e?.message || "lookup_failed" };
  }
}

router.get("/admin/email-readiness/dns", async (req, res): Promise<void> => {
  const publicUrl = getPublicUrlInfo();
  let defaultFromAddress: string | null = null;
  try {
    const { fromEmail } = await getUncachableResendClient();
    defaultFromAddress = fromEmail || null;
  } catch { /* surfaced separately on the main readiness endpoint */ }

  const senderDomain = senderDomainOf(defaultFromAddress);
  // getPublicUrlInfo() returns { url, host, ... } — use the host directly
  // rather than re-parsing, so the alignment hint is computed from the same
  // canonical value other parts of the system use. Strip any explicit port
  // (e.g. PUBLIC_APP_URL=https://staging.example.com:3000) before the
  // root-domain comparison so a non-default port can't silently break it.
  const canonicalHost = publicUrl.host
    ? publicUrl.host.toLowerCase().replace(/:\d+$/, "")
    : null;

  // Alignment is a hint — we compare eTLD+1 because subdomain senders are
  // common (e.g. mail.example.com sending for example.com).
  const alignment = senderDomain && canonicalHost
    ? rootDomainOf(senderDomain) === rootDomainOf(canonicalHost)
    : null;

  const checks: DnsCheck[] = [];

  if (!senderDomain || senderDomain === "resend.dev") {
    sendValidated(req, res, GetEmailReadinessDnsResponse, {
      senderDomain,
      canonicalHost,
      alignment,
      checks: [],
      note: senderDomain === "resend.dev"
        ? "Default Resend sandbox sender in use. Configure RESEND_FROM_EMAIL with an address on a domain you own and verify it in the Resend dashboard before relying on inbox placement."
        : "No sender domain detected. Set RESEND_FROM_EMAIL to enable Domain Authentication checks.",
    }, "GetEmailReadinessDns");
    return;
  }

  // SPF — TXT at apex. Look for v=spf1 anywhere in returned strings.
  const spfHost = senderDomain;
  const spf = await lookupTxt(spfHost);
  const spfRecords = spf.values.filter(v => v.toLowerCase().startsWith("v=spf1"));
  const spfMentionsResend = spfRecords.some(v => /include:_spf\.resend\.com|include:resend\.com/i.test(v));
  checks.push({
    label: "SPF (Sender Policy Framework)",
    recordType: "TXT",
    hostname: spfHost,
    status: spf.error ? "unknown" : (spfRecords.length > 0 ? "present" : "missing"),
    values: spfRecords,
    matchedExpectation: spfRecords.length === 0 ? null : spfMentionsResend,
    expectationHint: 'Include Resend in your SPF record, e.g. "v=spf1 include:_spf.resend.com ~all"',
    note: spf.error
      ? "DNS lookup failed — manual verification required. Check the record in your DNS provider."
      : (spfRecords.length === 0
        ? "No SPF record found at the sender domain. Manual verification required — your provider may still authenticate via DKIM, but SPF is recommended."
        : (spfMentionsResend
          ? "Resend appears in your SPF record."
          : "An SPF record exists but does not appear to authorize Resend. Provider verification ultimately decides — confirm in the Resend dashboard.")),
    error: spf.error,
  });

  // DMARC — TXT at _dmarc.<domain>
  const dmarcHost = `_dmarc.${senderDomain}`;
  const dmarc = await lookupTxt(dmarcHost);
  const dmarcRecords = dmarc.values.filter(v => v.toLowerCase().startsWith("v=dmarc1"));
  checks.push({
    label: "DMARC",
    recordType: "TXT",
    hostname: dmarcHost,
    status: dmarc.error ? "unknown" : (dmarcRecords.length > 0 ? "present" : "missing"),
    values: dmarcRecords,
    matchedExpectation: dmarcRecords.length > 0 ? true : null,
    expectationHint: 'A minimal policy looks like: "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"',
    note: dmarc.error
      ? "DNS lookup failed — manual verification required."
      : (dmarcRecords.length === 0
        ? "No DMARC record found. Inbox providers increasingly require DMARC for branded sender domains. Manual setup recommended."
        : "DMARC record present. Review the policy (p=none / quarantine / reject) in your DNS provider to match your enforcement goals."),
    error: dmarc.error,
  });

  // DKIM (Resend) — Resend publishes a CNAME at resend._domainkey.<domain>
  const dkimHost = `resend._domainkey.${senderDomain}`;
  const dkim = await lookupCname(dkimHost);
  checks.push({
    label: "DKIM (Resend selector)",
    recordType: "CNAME",
    hostname: dkimHost,
    status: dkim.error ? "unknown" : (dkim.values.length > 0 ? "present" : "missing"),
    values: dkim.values,
    matchedExpectation: dkim.values.length > 0 ? dkim.values.some(v => /resend\.com$/i.test(v)) : null,
    expectationHint: "Resend provides a CNAME target in its dashboard, typically pointing to a *.resend.com host.",
    note: dkim.error
      ? "DNS lookup failed — manual verification required."
      : (dkim.values.length === 0
        ? "No CNAME found at resend._domainkey — Resend's standard DKIM selector is not delegated. Confirm the DKIM record set you copied from Resend matches your DNS, then verify the domain in the Resend dashboard."
        : "DKIM CNAME resolves. Final authentication state is reported by the Resend dashboard — DNS resolution alone does not guarantee Resend has marked the domain as verified."),
    error: dkim.error,
  });

  sendValidated(req, res, GetEmailReadinessDnsResponse, {
    senderDomain,
    canonicalHost,
    alignment,
    checks,
    note: alignment === false
      ? "Your sender domain and your public app URL are on different root domains. Branded links and sender identity won't share a domain — this is allowed but reduces brand consistency."
      : null,
  }, "GetEmailReadinessDns");
});

// ---------------------------------------------------------------------------
// Retry a failed email send — only valid when the failure is tied to an
// order (objectType=order) AND the original meta.type is one we know how to
// re-trigger. We never store full email bodies, so retry means "rebuild the
// context from current data and resend" — the user sees a refreshed message
// with current branding/recipients, not a literal replay of the failed send.
// ---------------------------------------------------------------------------
const RETRYABLE_TYPES = new Set([
  "order_confirmation",
  "order_ops_forward",
  "order_finance_notification",
  "order_partner_contact_notification",
  "order_vendor_notification",
]);

router.post("/admin/email-readiness/retry/:eventId", async (req, res): Promise<void> => {
  const eventId = Number(req.params.eventId);
  if (!Number.isFinite(eventId) || eventId <= 0) { res.status(400).json({ error: "Invalid event id" }); return; }

  const [event] = await db.select().from(usageEvents).where(eq(usageEvents.id, eventId)).limit(1);
  if (!event) { res.status(404).json({ error: "Email event not found" }); return; }
  if (event.eventType !== "email.failed") { res.status(409).json({ error: "Only failed email events can be retried" }); return; }
  if (event.objectType !== "order" || !event.objectId) {
    res.status(409).json({ error: "This failure isn't tied to an order, so it can't be retried automatically. Re-send manually from the relevant page." });
    return;
  }

  const meta = (event.meta as any) || {};
  const emailType = typeof meta.type === "string" ? meta.type : null;
  if (!emailType || !RETRYABLE_TYPES.has(emailType)) {
    res.status(409).json({ error: `Unsupported email type for retry: ${emailType || "unknown"}` });
    return;
  }

  const ctx = await buildOrderEmailContext(event.objectId);
  if (!ctx) { res.status(404).json({ error: "Order no longer exists or its data is incomplete; cannot rebuild email context." }); return; }

  let result: { ok: boolean; id?: string; error?: string };
  switch (emailType) {
    case "order_confirmation": result = await sendOrderConfirmation(ctx); break;
    case "order_ops_forward": result = await sendOpsForward(ctx); break;
    case "order_finance_notification": result = await sendFinanceNotification(ctx); break;
    case "order_partner_contact_notification": result = await sendPartnerContactNotification(ctx); break;
    case "order_vendor_notification": result = await sendVendorNotification(ctx); break;
    default: res.status(409).json({ error: `Unsupported email type for retry: ${emailType}` }); return;
  }

  res.status(result.ok ? 200 : 500).json({
    ok: result.ok,
    error: (result as any).error,
    providerId: (result as any).id,
    retriedEventId: eventId,
    emailType,
    orderId: event.objectId,
  });
});

export default router;

