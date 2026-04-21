import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoicePaymentsTable,
  ordersTable,
  orderItemsTable,
  partnersTable,
  eventsTable,
} from "@workspace/db";
import { z } from "zod";
import crypto from "crypto";
import { resolveBillingExecModel } from "./billingResolver";
import { fire } from "../services/workflowEngine";

const router: IRouter = Router();

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function genInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `INV-${ts}-${rnd}`;
}
function genToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function recomputeInvoiceTotals(invoiceId: number) {
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv) return;
  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
  const paid = payments.reduce((a, p) => a + num(p.amount), 0);
  const depositPaid = payments.some(p => p.isDeposit);
  const total = num(inv.totalAmount);
  const balance = Math.max(0, total - paid);
  let status = inv.status;
  if (status !== "draft" && status !== "ready" && status !== "cancelled") {
    if (paid >= total && total > 0) status = "paid";
    else if (paid > 0) status = "partially_paid";
    else if (inv.dueDate && new Date(inv.dueDate) < new Date() && (status === "sent" || status === "overdue")) status = "overdue";
    else status = "sent";
  }
  const patch: any = {
    amountPaid: paid.toFixed(2),
    balanceDue: balance.toFixed(2),
    depositPaid,
    status,
  };
  if (status === "paid" && !inv.paidAt) patch.paidAt = new Date();
  await db.update(invoicesTable).set(patch).where(eq(invoicesTable.id, invoiceId));

  // Mirror to order — full bidirectional mapping driven by invoice status & paid amount
  const order = await db.select().from(ordersTable).where(eq(ordersTable.id, inv.orderId)).then(r => r[0]);
  if (order) {
    let payStatus: string;
    if (status === "cancelled") payStatus = "not_charged";
    else if (paid >= total && total > 0) payStatus = "paid";
    else if (paid > 0) payStatus = "partially_paid";
    else if (status === "sent" || status === "overdue") payStatus = "invoiced";
    else payStatus = "not_charged";
    if (payStatus !== order.paymentStatus) {
      await db.update(ordersTable).set({ paymentStatus: payStatus } as any).where(eq(ordersTable.id, inv.orderId));
    }
  }
}

// ===== List invoices =====
router.get("/invoices", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (q.orderId) conds.push(eq(invoicesTable.orderId, parseInt(q.orderId)));
  if (q.partnerId) conds.push(eq(invoicesTable.partnerId, parseInt(q.partnerId)));
  if (q.eventId) conds.push(eq(invoicesTable.eventId, parseInt(q.eventId)));
  if (q.status) conds.push(eq(invoicesTable.status, q.status));
  if (q.billingExecModel) conds.push(eq(invoicesTable.billingExecModel, q.billingExecModel));
  if (q.internalBillingOwnerUserId) conds.push(eq(invoicesTable.internalBillingOwnerUserId, q.internalBillingOwnerUserId));

  const rows = conds.length
    ? await db.select().from(invoicesTable).where(and(...conds)).orderBy(desc(invoicesTable.createdAt))
    : await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));

  const orderIds = [...new Set(rows.map(r => r.orderId))];
  const partnerIds = [...new Set(rows.map(r => r.partnerId))];
  const orders = orderIds.length ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds)) : [];
  const partners = partnerIds.length ? await db.select().from(partnersTable).where(inArray(partnersTable.id, partnerIds)) : [];
  const oById = new Map(orders.map(o => [o.id, o]));
  const pById = new Map(partners.map(p => [p.id, p]));

  const today = new Date().toISOString().slice(0, 10);
  const decorated = rows.map(r => ({
    ...r,
    orderNumber: oById.get(r.orderId)?.orderNumber || null,
    partnerName: pById.get(r.partnerId)?.companyName || null,
    isOverdue: r.status === "sent" && r.dueDate && r.dueDate < today,
  }));
  res.json(decorated);
});

// ===== Get one invoice (with payments) =====
router.get("/invoices/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) return res.status(404).json({ error: "Not found" });
  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id)).orderBy(desc(invoicePaymentsTable.createdAt));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, inv.orderId));
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, inv.partnerId));
  const [event] = inv.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, inv.eventId)) : [null];
  res.json({ ...inv, payments, order, partner, event });
});

// ===== Get invoice by public token (client-facing) =====
router.get("/invoices/public/:token", async (req, res) => {
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.publicToken, req.params.token));
  if (!inv) return res.status(404).json({ error: "Not found" });
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, inv.partnerId));
  // Trim sensitive internal fields
  res.json({
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: inv.subtotal,
    tax: inv.tax,
    totalAmount: inv.totalAmount,
    amountPaid: inv.amountPaid,
    balanceDue: inv.balanceDue,
    depositAmount: inv.depositAmount,
    depositPaid: inv.depositPaid,
    paymentInstructions: inv.paymentInstructions,
    paymentLinkPlaceholder: inv.paymentLinkPlaceholder,
    billingContact: inv.billingContactJson,
    billingEntity: inv.billingEntity,
    lineItems: inv.lineItemsJson,
    notes: inv.notes,
    partnerName: partner?.companyName,
    partnerLogoUrl: partner?.logoUrl,
  });
});

// ===== Create invoice from order =====
router.post("/invoices/from-order/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid id" });
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });

  const existing = await db.select().from(invoicesTable).where(and(eq(invoicesTable.orderId, orderId), sql`${invoicesTable.status} != 'cancelled'`));
  if (existing.length > 0) return res.status(409).json({ error: "Invoice already exists for this order", invoiceId: existing[0].id });

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId));
  const [event] = order.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [null];
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const resolved = resolveBillingExecModel({ order, event, partner });
  const subtotal = num(order.totalEstimate);
  const tax = 0;
  const total = subtotal + tax;
  const depositPct = num(partner?.depositPct);
  const depositAmount = partner?.depositRequired && depositPct > 0 ? +(total * depositPct / 100).toFixed(2) : null;

  const dueDays = (() => {
    const t = (partner?.paymentTerms || "").toLowerCase();
    const m = t.match(/net[_\s]?(\d+)/);
    return m ? parseInt(m[1]) : 30;
  })();
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);

  const lineItems = items.map(it => {
    const qty = it.quantity || 1;
    const up = num(it.unitPrice);
    return {
      description: it.name + (it.notes ? ` — ${it.notes}` : ""),
      quantity: qty,
      unitPrice: it.unitPrice ?? undefined,
      amount: (qty * up).toFixed(2),
    };
  });

  const [inv] = await db.insert(invoicesTable).values({
    invoiceNumber: genInvoiceNumber(),
    publicToken: genToken(),
    orderId,
    partnerId: order.partnerId,
    eventId: order.eventId,
    billingExecModel: resolved.model,
    billingEntity: order.billingEntity || partner?.billingEntityName || partner?.companyName || null,
    status: "draft",
    issueDate,
    dueDate,
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    totalAmount: total.toFixed(2),
    amountPaid: "0",
    balanceDue: total.toFixed(2),
    depositAmount: depositAmount != null ? depositAmount.toFixed(2) : null,
    paymentInstructions: partner?.defaultBillingNotes || null,
    billingContactJson: order.billingContactJson || (partner ? { name: partner.billingContactName || undefined, email: partner.billingContactEmail || undefined, phone: partner.billingContactPhone || undefined } : null),
    lineItemsJson: lineItems,
    internalBillingOwnerUserId: order.internalBillingOwnerUserId || partner?.internalBillingOwnerUserId || null,
  } as any).returning();

  // Reflect on order
  await db.update(ordersTable).set({
    billingExecModel: resolved.model,
    billingExecModelSource: resolved.source,
    invoiceRequired: true,
  } as any).where(eq(ordersTable.id, orderId));

  res.status(201).json(inv);
});

// ===== Patch invoice (incl. status transitions) =====
const PatchBody = z.object({
  status: z.enum(["draft", "ready", "sent", "partially_paid", "paid", "overdue", "cancelled"]).optional(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  subtotal: z.string().nullable().optional(),
  tax: z.string().nullable().optional(),
  totalAmount: z.string().nullable().optional(),
  depositAmount: z.string().nullable().optional(),
  paymentInstructions: z.string().nullable().optional(),
  externalInvoiceRef: z.string().nullable().optional(),
  paymentLinkPlaceholder: z.string().nullable().optional(),
  billingEntity: z.string().nullable().optional(),
  billingContactJson: z.any().optional(),
  lineItemsJson: z.any().optional(),
  notes: z.string().nullable().optional(),
  internalBillingOwnerUserId: z.string().nullable().optional(),
});
router.patch("/invoices/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const patch: any = { ...parsed.data };
  if (patch.status === "sent") patch.sentAt = new Date();
  if (patch.status === "cancelled") patch.cancelledAt = new Date();
  // Recompute balance if total changed
  if (patch.totalAmount != null) {
    const total = num(patch.totalAmount);
    const [cur] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    const paid = num(cur?.amountPaid);
    patch.balanceDue = Math.max(0, total - paid).toFixed(2);
  }
  const [row] = await db.update(invoicesTable).set(patch).where(eq(invoicesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  // Only recompute when amounts changed; manual status changes (mark sent/paid/cancelled) are authoritative.
  if (patch.totalAmount != null || patch.tax != null || patch.subtotal != null) {
    await recomputeInvoiceTotals(id);
  } else if (patch.status === "paid") {
    // Treat manual "paid" as authoritative: zero balance, mirror to order, but don't fabricate a payment row.
    const total = num(row.totalAmount);
    const paid = num(row.amountPaid);
    await db.update(invoicesTable).set({ balanceDue: Math.max(0, total - Math.max(paid, total)).toFixed(2), paidAt: row.paidAt || new Date() }).where(eq(invoicesTable.id, id));
    await db.update(ordersTable).set({ paymentStatus: "paid" } as any).where(eq(ordersTable.id, row.orderId));
  } else if (patch.status === "cancelled") {
    await db.update(ordersTable).set({ paymentStatus: "not_charged" } as any).where(eq(ordersTable.id, row.orderId));
  } else if (patch.status === "sent") {
    await db.update(ordersTable).set({ paymentStatus: "invoiced" } as any).where(eq(ordersTable.id, row.orderId));
    fire("invoice.sent", { objectType: "invoice", objectId: id, invoiceId: id, orderId: row.orderId, partnerId: row.partnerId ?? null, invoiceNumber: row.invoiceNumber, dueDate: row.dueDate }).catch(() => {});
  }
  const [fresh] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  res.json(fresh);
});

// ===== Regenerate from order =====
router.post("/invoices/:id/regenerate", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) return res.status(404).json({ error: "Not found" });
  if (inv.status !== "draft") return res.status(409).json({ error: "Only draft invoices can be regenerated" });
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, inv.orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, inv.orderId));
  const subtotal = num(order.totalEstimate);
  const total = subtotal + num(inv.tax);
  const lineItems = items.map(it => {
    const qty = it.quantity || 1;
    const up = num(it.unitPrice);
    return {
      description: it.name + (it.notes ? ` — ${it.notes}` : ""),
      quantity: qty,
      unitPrice: it.unitPrice ?? undefined,
      amount: (qty * up).toFixed(2),
    };
  });
  await db.update(invoicesTable).set({
    subtotal: subtotal.toFixed(2),
    totalAmount: total.toFixed(2),
    balanceDue: Math.max(0, total - num(inv.amountPaid)).toFixed(2),
    lineItemsJson: lineItems,
  } as any).where(eq(invoicesTable.id, id));
  const [fresh] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  res.json(fresh);
});

// ===== Payments =====
const PaymentBody = z.object({
  amount: z.string(),
  paidDate: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  receivedByUserId: z.string().nullable().optional(),
  isDeposit: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/invoices/:id/payments", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PaymentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(invoicePaymentsTable).values({ invoiceId: id, ...parsed.data } as any).returning();
  await recomputeInvoiceTotals(id);
  res.status(201).json(row);
});
router.delete("/invoices/:id/payments/:pid", async (req, res) => {
  const id = parseInt(req.params.id);
  const pid = parseInt(req.params.pid);
  await db.delete(invoicePaymentsTable).where(and(eq(invoicePaymentsTable.id, pid), eq(invoicePaymentsTable.invoiceId, id)));
  await recomputeInvoiceTotals(id);
  res.json({ success: true });
});

// ===== Mark overdue scan (manual trigger) =====
router.post("/invoices/scan-overdue", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = await db.select().from(invoicesTable).where(eq(invoicesTable.status, "sent"));
  const toMark = candidates.filter(c => c.dueDate && c.dueDate < today);
  if (toMark.length > 0) {
    await db.update(invoicesTable).set({ status: "overdue" } as any).where(inArray(invoicesTable.id, toMark.map(c => c.id)));
    for (const inv of toMark) {
      const days = Math.floor((Date.now() - new Date(inv.dueDate!).getTime()) / 86400_000);
      fire("invoice.overdue", { objectType: "invoice", objectId: inv.id, invoiceId: inv.id, orderId: inv.orderId, partnerId: inv.partnerId ?? null, invoiceNumber: inv.invoiceNumber, daysOverdue: days }).catch(() => {});
    }
  }
  res.json({ markedOverdue: toMark.length });
});

export default router;
