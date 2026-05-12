import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, asc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, partnerEmailRecipientsTable, partnersTable, RECIPIENT_ROLES } from "@workspace/db";
import { z } from "zod";

// Recipient role allow-list mirrors the schema enum so the API can never
// persist an unrecognized role that the email router wouldn't know how to handle.
const RoleSchema = z.enum(RECIPIENT_ROLES);

const RecipientCreateBody = z.object({
  role: RoleSchema,
  email: z.string().email().max(200),
  label: z.string().max(120).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const RecipientUpdateBody = RecipientCreateBody.partial();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

const router: IRouter = Router();

// List all recipients for a partner. Auth-gated because the response
// contains operational/billing/vendor email addresses — these are internal
// contacts and partner IDs are enumerable, so a public endpoint would let any
// caller harvest the routing book.
router.get("/partners/:id/email-recipients", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const rows = await db
    .select()
    .from(partnerEmailRecipientsTable)
    .where(eq(partnerEmailRecipientsTable.partnerId, partnerId))
    .orderBy(asc(partnerEmailRecipientsTable.role), asc(partnerEmailRecipientsTable.sortOrder), asc(partnerEmailRecipientsTable.id));
  res.json(rows);
});

router.post("/partners/:id/email-recipients", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const parsed = RecipientCreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  // Validate the partner exists so we never insert orphaned rows.
  const [partner] = await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  const [created] = await db.insert(partnerEmailRecipientsTable).values({
    partnerId,
    role: parsed.data.role,
    email: parsed.data.email.trim().toLowerCase(),
    label: parsed.data.label ?? null,
    isActive: parsed.data.isActive ?? true,
    notes: parsed.data.notes ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(created);
});

router.put("/partners/:id/email-recipients/:rid", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  const rid = parseInt(String(req.params.rid));
  if (isNaN(partnerId) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RecipientUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email.trim().toLowerCase();
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No updates provided" }); return; }
  const [updated] = await db.update(partnerEmailRecipientsTable)
    .set(updates)
    .where(and(eq(partnerEmailRecipientsTable.id, rid), eq(partnerEmailRecipientsTable.partnerId, partnerId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Recipient not found" }); return; }
  res.json(updated);
});

router.delete("/partners/:id/email-recipients/:rid", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  const rid = parseInt(String(req.params.rid));
  if (isNaN(partnerId) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(partnerEmailRecipientsTable)
    .where(and(eq(partnerEmailRecipientsTable.id, rid), eq(partnerEmailRecipientsTable.partnerId, partnerId)))
    .returning({ id: partnerEmailRecipientsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Recipient not found" }); return; }
  res.json({ ok: true });
});

// Test send to a single role: assembles a sample order context and routes
// through the matching template. Useful for admins to verify each audience.
router.post("/partners/:id/test-role-email", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const Body = z.object({
    role: z.enum(["customer", ...RECIPIENT_ROLES] as const),
    to: z.string().email().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  try {
    const email = await import("../lib/email");
    const ctxBuilder = (await import("./partners")).buildSampleOrderContext;
    const ctx = await ctxBuilder(partnerId, parsed.data.to || "demo.customer@example.com");
    if (!ctx) { res.status(404).json({ error: "Partner not found" }); return; }
    const role = parsed.data.role;
    const overrideTo = parsed.data.to || null;
    let result;
    if (role === "customer") {
      // For the customer template we override the order's contactEmail so the
      // confirmation actually goes to the test address.
      if (overrideTo) ctx.order = { ...ctx.order, contactEmail: overrideTo };
      result = await email.sendOrderConfirmation(ctx);
    } else if (role === "ops") {
      result = await email.sendOpsForward(ctx, overrideTo ? [overrideTo] : undefined);
    } else if (role === "finance") {
      result = await email.sendFinanceNotification(ctx, overrideTo ? [overrideTo] : undefined);
    } else if (role === "partner_contact") {
      result = await email.sendPartnerContactNotification(ctx, overrideTo ? [overrideTo] : undefined);
    } else if (role === "vendor") {
      result = await email.sendVendorNotification(ctx, overrideTo ? [overrideTo] : undefined);
    } else {
      // cc / bcc roles are only meaningful in the context of an ops send.
      result = await email.sendOpsForward(ctx, overrideTo ? [overrideTo] : undefined);
    }
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export default router;
