import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql, or, isNull } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoicePaymentsTable,
  ordersTable,
  partnersTable,
  eventsTable,
} from "@workspace/db";
import { z } from "zod";
import { resolveBillingExecModel } from "./billingResolver";

const router: IRouter = Router();

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ===== Resolve billing model for an order =====
router.get("/billing/orders/:id/resolve", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId));
  const [event] = order.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [null];
  res.json({
    resolved: resolveBillingExecModel({ order, event, partner }),
    partnerDefault: partner?.defaultBillingExecModel,
    eventOverride: event?.billingExecModelOverride,
    orderOverride: order.billingExecModelSource === "order" ? order.billingExecModel : null,
    allowOrderOverride: partner?.allowOrderOverride ?? true,
  });
});

// ===== Override billing model on an order =====
const OverrideBody = z.object({
  billingExecModel: z.enum([
    "a3_collected",
    "alyssa_entity_collected",
    "manual_invoice",
    "split_payout",
    "external_payment_pending",
  ]).nullable(),
});
router.post("/billing/orders/:id/override", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OverrideBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId));
  if (!(partner?.allowOrderOverride ?? true)) { res.status(403).json({ error: "Partner does not allow per-order override" }); return; }

  if (parsed.data.billingExecModel == null) {
    // Clear override -> inherit again
    const [event] = order.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [null];
    const resolved = resolveBillingExecModel({ order: { ...order, billingExecModel: null, billingExecModelSource: null }, event, partner });
    await db.update(ordersTable).set({ billingExecModel: resolved.model, billingExecModelSource: resolved.source } as any).where(eq(ordersTable.id, id));
  } else {
    await db.update(ordersTable).set({ billingExecModel: parsed.data.billingExecModel, billingExecModelSource: "order" } as any).where(eq(ordersTable.id, id));
  }
  const [fresh] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  res.json(fresh);
});

// ===== Billing command center summary =====
router.get("/billing/summary", async (_req, res) => {
  const invoices = await db.select().from(invoicesTable);
  const orders = await db.select().from(ordersTable);
  const today = new Date().toISOString().slice(0, 10);

  const byStatus: Record<string, number> = {};
  let totalInvoiced = 0, totalPaid = 0, totalBalance = 0, overdueCount = 0;
  for (const inv of invoices) {
    const k = inv.status === "sent" && inv.dueDate && inv.dueDate < today ? "overdue" : inv.status;
    byStatus[k] = (byStatus[k] || 0) + 1;
    totalInvoiced += num(inv.totalAmount);
    totalPaid += num(inv.amountPaid);
    totalBalance += num(inv.balanceDue);
    if (k === "overdue") overdueCount++;
  }

  const invoicedOrderIds = new Set(invoices.filter(i => i.status !== "cancelled").map(i => i.orderId));
  const ordersNeedingInvoice = orders.filter(o => o.invoiceRequired !== false && !invoicedOrderIds.has(o.id) && o.status !== "cancelled").length;

  const byBilling: Record<string, number> = {};
  for (const o of orders) {
    const k = o.billingExecModel || "unresolved";
    byBilling[k] = (byBilling[k] || 0) + 1;
  }

  const missingBillingContact = orders.filter(o => {
    const c = o.billingContactJson as any;
    return (!c || (!c.email && !c.name));
  }).length;

  res.json({
    totalInvoiced,
    totalPaid,
    totalBalance,
    overdueCount,
    ordersNeedingInvoice,
    missingBillingContact,
    byStatus,
    byBilling,
    invoicesCount: invoices.length,
  });
});

// ===== Billing list of orders w/ invoice context =====
router.get("/billing/orders", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (q.partnerId) conds.push(eq(ordersTable.partnerId, parseInt(q.partnerId)));
  if (q.eventId) conds.push(eq(ordersTable.eventId, parseInt(q.eventId)));
  // NOTE: billingExecModel filter is applied post-resolution below (not as SQL)
  // because the effective model comes from the resolver (order > event > partner).
  if (q.paymentStatus) conds.push(eq(ordersTable.paymentStatus, q.paymentStatus));
  const orders = conds.length
    ? await db.select().from(ordersTable).where(and(...conds)).orderBy(desc(ordersTable.createdAt))
    : await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  const orderIds = orders.map(o => o.id);
  const partners = await db.select().from(partnersTable);
  const events = await db.select().from(eventsTable);
  const invoices = orderIds.length ? await db.select().from(invoicesTable).where(inArray(invoicesTable.orderId, orderIds)) : [];
  const pById = new Map(partners.map(p => [p.id, p]));
  const eById = new Map(events.map(e => [e.id, e]));
  // Latest non-cancelled invoice per order
  const invByOrder = new Map<number, any>();
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const cur = invByOrder.get(inv.orderId);
    if (!cur || new Date(inv.createdAt) > new Date(cur.createdAt)) invByOrder.set(inv.orderId, inv);
  }
  const today = new Date().toISOString().slice(0, 10);
  let rows = orders.map(o => {
    const partner = pById.get(o.partnerId);
    const event = o.eventId ? eById.get(o.eventId) : null;
    const inv = invByOrder.get(o.id);
    const resolved = resolveBillingExecModel({ order: o, event, partner });
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      partnerId: o.partnerId,
      partnerName: partner?.companyName || null,
      eventId: o.eventId,
      eventName: event?.name || null,
      totalEstimate: o.totalEstimate,
      currency: (o as any).currency || "USD",
      taxMode: (o as any).taxMode || "none",
      taxLabel: (o as any).taxLabel || null,
      taxRate: (o as any).taxRate ?? null,
      taxInclusive: !!(o as any).taxInclusive,
      paymentStatus: o.paymentStatus,
      billingExecModel: resolved.model,
      billingExecModelSource: resolved.source,
      billingContact: o.billingContactJson || (partner ? { name: partner.billingContactName, email: partner.billingContactEmail, phone: partner.billingContactPhone } : null),
      internalBillingOwnerUserId: o.internalBillingOwnerUserId || partner?.internalBillingOwnerUserId || null,
      invoice: inv ? {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue,
        currency: (inv as any).currency || (o as any).currency || "USD",
        dueDate: inv.dueDate,
        isOverdue: inv.status === "sent" && inv.dueDate && inv.dueDate < today,
      } : null,
      hasBillingContact: !!(o.billingContactJson || partner?.billingContactEmail),
      missingBillingContact: !o.billingContactJson && !partner?.billingContactEmail,
      needsInvoice: o.invoiceRequired !== false && !inv && o.status !== "cancelled",
    };
  });
  if (q.needsInvoice === "true") rows = rows.filter(r => r.needsInvoice);
  if (q.overdueOnly === "true") rows = rows.filter(r => r.invoice?.isOverdue);
  if (q.missingBillingContact === "true") rows = rows.filter(r => r.missingBillingContact);
  if (q.invoiceStatus) rows = rows.filter(r => r.invoice?.status === q.invoiceStatus);
  if (q.billingExecModel) rows = rows.filter(r => r.billingExecModel === q.billingExecModel);
  res.json(rows);
});

// ===== Bulk actions =====
const BulkBody = z.object({
  action: z.enum(["create_invoices", "mark_ready", "mark_sent", "mark_overdue", "assign_owner"]),
  orderIds: z.array(z.number().int()).optional(),
  invoiceIds: z.array(z.number().int()).optional(),
  ownerUserId: z.string().optional(),
});
router.post("/billing/bulk", async (req, res) => {
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { action } = parsed.data;
  let count = 0;
  if (action === "create_invoices" && parsed.data.orderIds) {
    for (const oid of parsed.data.orderIds) {
      try {
        const r = await fetch(`http://localhost:${process.env.PORT || 8080}/api/invoices/from-order/${oid}`, { method: "POST" });
        if (r.ok) count++;
      } catch {}
    }
  } else if (parsed.data.invoiceIds && parsed.data.invoiceIds.length > 0) {
    let patch: any = null;
    if (action === "mark_ready") patch = { status: "ready" };
    if (action === "mark_sent") patch = { status: "sent", sentAt: new Date() };
    if (action === "mark_overdue") patch = { status: "overdue" };
    if (action === "assign_owner") patch = { internalBillingOwnerUserId: parsed.data.ownerUserId || null };
    if (patch) {
      await db.update(invoicesTable).set(patch).where(inArray(invoicesTable.id, parsed.data.invoiceIds));
      count = parsed.data.invoiceIds.length;
    }
  }
  res.json({ success: true, count });
});

export default router;
