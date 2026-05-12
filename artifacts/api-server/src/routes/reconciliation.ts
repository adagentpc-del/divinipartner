import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, or, isNotNull } from "drizzle-orm";
import { db, ordersTable, partnersTable, eventsTable, suppliersTable, discrepanciesTable, commissionPayoutsTable } from "@workspace/db";
import { z } from "zod";
import {
  GetReconciliationSummaryResponse, ListReconciliationOrdersResponse, UpdateReconciliationOrderResponse,
  AutoFlagReconciliationResponse, ListDiscrepanciesResponse, UpdateDiscrepancyResponse, DeleteDiscrepancyResponse,
  ListCommissionPayoutsResponse, DeleteCommissionPayoutResponse, BulkUpdateReconciliationResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ===== Reconciliation summary cards =====
router.get("/reconciliation/summary", async (req, res) => {
  const orders = await db.select().from(ordersTable);
  const discr = await db.select().from(discrepanciesTable);
  const totals = orders.reduce((a, o) => {
    a.retail += num(o.totalEstimate);
    a.estCost += num(o.supplierEstimatedCost);
    a.finalCost += num(o.supplierFinalCost);
    a.expCom += num(o.expectedCommission);
    a.paidCom += num(o.paidCommission);
    return a;
  }, { retail: 0, estCost: 0, finalCost: 0, expCom: 0, paidCom: 0 });

  const byBilling: Record<string, number> = {};
  const byRecon: Record<string, number> = {};
  for (const o of orders) {
    byBilling[o.paymentModel] = (byBilling[o.paymentModel] || 0) + 1;
    byRecon[o.reconciliationStatus] = (byRecon[o.reconciliationStatus] || 0) + 1;
  }
  const openDiscr = discr.filter(d => d.status === "open" || d.status === "in_review").length;
  const supplierCostVarianceTotal = orders.reduce((a, o) => {
    const e = num(o.supplierEstimatedCost), f = num(o.supplierFinalCost);
    if (f > 0 && e > 0) return a + (f - e);
    return a;
  }, 0);
  const commissionVarianceTotal = totals.paidCom - totals.expCom;
  sendValidated(req, res, GetReconciliationSummaryResponse, {
    totalRetailBooked: totals.retail,
    totalEstimatedSupplierCost: totals.estCost,
    totalFinalSupplierCost: totals.finalCost,
    expectedCommission: totals.expCom,
    paidCommission: totals.paidCom,
    commissionVarianceTotal,
    supplierCostVarianceTotal,
    openDiscrepanciesCount: openDiscr,
    awaitingReconciliationCount: orders.filter(o => o.reconciliationStatus !== "reconciled").length,
    byBillingModel: byBilling,
    byReconciliationStatus: byRecon,
    ordersTotal: orders.length,
  }, "Reconciliation summary");
});

// ===== Reconciliation orders list =====
router.get("/reconciliation/orders", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (q.partnerId) conds.push(eq(ordersTable.partnerId, parseInt(q.partnerId)));
  if (q.assignedSupplierId) conds.push(eq(ordersTable.assignedSupplierId, parseInt(q.assignedSupplierId)));
  if (q.reconciliationStatus) conds.push(eq(ordersTable.reconciliationStatus, q.reconciliationStatus));
  if (q.commissionStatus) conds.push(eq(ordersTable.commissionStatus, q.commissionStatus));
  if (q.paymentModel) conds.push(eq(ordersTable.paymentModel, q.paymentModel));
  if (q.paymentStatus) conds.push(eq(ordersTable.paymentStatus, q.paymentStatus));
  if (q.supplierPayableStatus) conds.push(eq(ordersTable.supplierPayableStatus, q.supplierPayableStatus));

  let rows = conds.length ? await db.select().from(ordersTable).where(and(...conds)) : await db.select().from(ordersTable);
  if (q.discrepancyOnly === "true") {
    const discr = await db.select().from(discrepanciesTable);
    const open = new Set(discr.filter(d => d.status === "open" || d.status === "in_review").map(d => d.orderId));
    rows = rows.filter(o => open.has(o.id));
  }
  if (q.missingSupplierFinal === "true") rows = rows.filter(o => !o.supplierFinalCost || num(o.supplierFinalCost) === 0);
  if (q.missingCommissionVerification === "true") rows = rows.filter(o => o.commissionStatus !== "verified" && o.commissionStatus !== "paid");
  if (q.missingPaymentConfirmation === "true") rows = rows.filter(o => o.paymentStatus !== "paid");

  const partners = await db.select().from(partnersTable);
  const events = await db.select().from(eventsTable);
  const suppliers = await db.select().from(suppliersTable);
  const discrAll = await db.select().from(discrepanciesTable);
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const eventById = new Map(events.map(e => [e.id, e]));
  const supById = new Map(suppliers.map(s => [s.id, s]));
  const discrByOrder = new Map<number, any[]>();
  for (const d of discrAll) {
    const cur = discrByOrder.get(d.orderId) || [];
    cur.push(d);
    discrByOrder.set(d.orderId, cur);
  }

  const decorated = rows.map(o => {
    const ds = discrByOrder.get(o.id) || [];
    const open = ds.filter(d => d.status === "open" || d.status === "in_review");
    const grossMargin = num(o.totalEstimate) - num(o.supplierFinalCost || o.supplierEstimatedCost);
    return {
      ...o,
      partnerName: partnerById.get(o.partnerId)?.companyName || null,
      eventName: o.eventId ? eventById.get(o.eventId)?.name || null : null,
      supplierName: o.assignedSupplierId ? supById.get(o.assignedSupplierId)?.name || null : null,
      grossMargin,
      commissionVariance: num(o.paidCommission) - num(o.expectedCommission),
      supplierCostVariance: o.supplierFinalCost ? num(o.supplierFinalCost) - num(o.supplierEstimatedCost) : 0,
      openDiscrepancies: open.length,
      discrepancies: ds,
    };
  });

  decorated.sort((a, b) => (b.id - a.id));
  sendValidated(req, res, ListReconciliationOrdersResponse, decorated, "Reconciliation orders");
});

// ===== Update reconciliation fields on an order =====
const ReconUpdate = z.object({
  paymentModel: z.enum(["partner_billed", "client_direct", "a3_billed", "prepaid"]).optional(),
  billingEntity: z.string().nullable().optional(),
  paymentStatus: z.string().optional(),
  supplierEstimatedCost: z.string().nullable().optional(),
  supplierFinalCost: z.string().nullable().optional(),
  expectedCommission: z.string().nullable().optional(),
  paidCommission: z.string().nullable().optional(),
  commissionPaidDate: z.string().nullable().optional(),
  commissionPaidThrough: z.string().nullable().optional(),
  commissionStatus: z.enum(["not_started", "expected", "partially_paid", "paid", "disputed", "verified"]).optional(),
  supplierPayableStatus: z.enum(["not_started", "invoiced", "paid", "overdue"]).optional(),
  payoutStatus: z.string().optional(),
  reconciliationStatus: z.enum(["not_started", "in_review", "waiting_payment", "waiting_supplier_final", "waiting_commission", "discrepancy_found", "reconciled"]).optional(),
  reconciliationNotes: z.string().nullable().optional(),
  financeNotes: z.string().nullable().optional(),
});
router.patch("/reconciliation/orders/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReconUpdate.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(ordersTable).set(parsed.data as any).where(eq(ordersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UpdateReconciliationOrderResponse, updated, "Reconciliation order update");
});

// ===== Auto-flag discrepancies for an order =====
router.post("/reconciliation/orders/:id/auto-flag", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!o) { res.status(404).json({ error: "Not found" }); return; }
  const flagged: any[] = [];
  const exp = num(o.expectedCommission), paid = num(o.paidCommission);
  if (exp > 0 && Math.abs(exp - paid) > 0.01) {
    flagged.push({ orderId: id, type: "commission_variance", severity: paid < exp ? "high" : "medium", status: "open", reason: paid === 0 ? "Commission expected but no payment recorded" : "Commission paid does not match expected", expectedAmount: exp.toFixed(2), actualAmount: paid.toFixed(2), varianceAmount: (paid - exp).toFixed(2), autoFlagged: "commission_diff" });
  }
  const est = num(o.supplierEstimatedCost), fin = num(o.supplierFinalCost);
  if (est > 0 && fin > 0 && Math.abs(fin - est) > est * 0.05) {
    flagged.push({ orderId: id, type: "supplier_cost_variance", severity: fin > est * 1.15 ? "high" : "medium", status: "open", reason: "Supplier final cost diverges >5% from estimate", expectedAmount: est.toFixed(2), actualAmount: fin.toFixed(2), varianceAmount: (fin - est).toFixed(2), autoFlagged: "supplier_diff" });
  }
  if (o.totalEstimate && num(o.totalEstimate) > 0 && o.paymentStatus !== "paid" && o.status === "completed") {
    flagged.push({ orderId: id, type: "missing_payment", severity: "high", status: "open", reason: "Order completed but payment not marked paid", autoFlagged: "no_payment_on_completed" });
  }
  if (est > 0 && fin === 0 && (o.status === "completed" || o.fulfillmentStatus === "delivered")) {
    flagged.push({ orderId: id, type: "missing_supplier_final", severity: "medium", status: "open", reason: "Final supplier cost not entered", autoFlagged: "no_final_cost" });
  }
  // Avoid duplicates: skip if same type+autoFlagged already open
  const existing = await db.select().from(discrepanciesTable).where(eq(discrepanciesTable.orderId, id));
  const existingKey = new Set(existing.filter(e => e.status === "open" || e.status === "in_review").map(e => `${e.type}:${e.autoFlagged}`));
  const toInsert = flagged.filter(f => !existingKey.has(`${f.type}:${f.autoFlagged}`));
  if (toInsert.length > 0) await db.insert(discrepanciesTable).values(toInsert);
  sendValidated(req, res, AutoFlagReconciliationResponse, { flaggedCount: toInsert.length, items: toInsert }, "Auto-flag");
});

// ===== Discrepancies CRUD =====
router.get("/discrepancies", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (q.orderId) conds.push(eq(discrepanciesTable.orderId, parseInt(q.orderId)));
  if (q.status) conds.push(eq(discrepanciesTable.status, q.status));
  if (q.type) conds.push(eq(discrepanciesTable.type, q.type));
  if (q.severity) conds.push(eq(discrepanciesTable.severity, q.severity));
  let rows = conds.length ? await db.select().from(discrepanciesTable).where(and(...conds)) : await db.select().from(discrepanciesTable);
  // Decorate with order number + partner
  const orderIds = [...new Set(rows.map(r => r.orderId))];
  const orders = orderIds.length ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds)) : [];
  const partners = await db.select().from(partnersTable);
  const oById = new Map(orders.map(o => [o.id, o]));
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const decorated = rows.map(r => {
    const o = oById.get(r.orderId);
    return { ...r, orderNumber: o?.orderNumber || null, partnerName: o ? partnerById.get(o.partnerId)?.companyName : null };
  }).sort((a, b) => b.id - a.id);
  sendValidated(req, res, ListDiscrepanciesResponse, decorated, "Discrepancies");
});

const DiscrepancyBody = z.object({
  orderId: z.number().int(),
  type: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "in_review", "resolved", "wont_fix"]).optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedAmount: z.string().nullable().optional(),
  actualAmount: z.string().nullable().optional(),
  varianceAmount: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
});
router.post("/discrepancies", async (req, res) => {
  const parsed = DiscrepancyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(discrepanciesTable).values(parsed.data as any).returning();
  res.status(201).json(row);
});
router.patch("/discrepancies/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = DiscrepancyBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const patch: any = { ...parsed.data };
  if (patch.status === "resolved" || patch.status === "wont_fix") patch.resolvedAt = new Date();
  const [row] = await db.update(discrepanciesTable).set(patch).where(eq(discrepanciesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UpdateDiscrepancyResponse, row, "Discrepancy update");
});
router.delete("/discrepancies/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(discrepanciesTable).where(eq(discrepanciesTable.id, id));
  sendValidated(req, res, DeleteDiscrepancyResponse, { success: true }, "Discrepancy delete");
});

// ===== Commission payouts =====
router.get("/orders/:id/commission-payouts", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(commissionPayoutsTable).where(eq(commissionPayoutsTable.orderId, id)).orderBy(commissionPayoutsTable.createdAt);
  sendValidated(req, res, ListCommissionPayoutsResponse, rows, "Commission payouts");
});
const PayoutBody = z.object({
  amount: z.string(),
  paidDate: z.string().nullable().optional(),
  paidThrough: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/orders/:id/commission-payouts", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(commissionPayoutsTable).values({ orderId: id, ...parsed.data } as any).returning();
  // Recompute paidCommission as sum of payouts and bump status
  const allPayouts = await db.select().from(commissionPayoutsTable).where(eq(commissionPayoutsTable.orderId, id));
  const totalPaid = allPayouts.reduce((a, p) => a + num(p.amount), 0);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  const expected = num(order?.expectedCommission);
  let status = order?.commissionStatus || "expected";
  if (expected > 0) {
    if (Math.abs(totalPaid - expected) < 0.01) status = "paid";
    else if (totalPaid > 0 && totalPaid < expected) status = "partially_paid";
    else if (totalPaid > expected) status = "disputed";
  } else if (totalPaid > 0) {
    status = "paid";
  }
  await db.update(ordersTable).set({ paidCommission: totalPaid.toFixed(2), commissionStatus: status, commissionPaidDate: parsed.data.paidDate || order?.commissionPaidDate, commissionPaidThrough: parsed.data.paidThrough || order?.commissionPaidThrough } as any).where(eq(ordersTable.id, id));
  res.status(201).json(row);
});
router.delete("/orders/:id/commission-payouts/:payoutId", async (req, res) => {
  const id = parseInt(req.params.id);
  const pid = parseInt(req.params.payoutId);
  await db.delete(commissionPayoutsTable).where(and(eq(commissionPayoutsTable.id, pid), eq(commissionPayoutsTable.orderId, id)));
  const allPayouts = await db.select().from(commissionPayoutsTable).where(eq(commissionPayoutsTable.orderId, id));
  const totalPaid = allPayouts.reduce((a, p) => a + num(p.amount), 0);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  const expected = num(order?.expectedCommission);
  let status = order?.commissionStatus || "expected";
  if (expected > 0) {
    if (totalPaid === 0) status = "expected";
    else if (Math.abs(totalPaid - expected) < 0.01) status = "paid";
    else if (totalPaid < expected) status = "partially_paid";
    else status = "disputed";
  } else if (totalPaid === 0) {
    status = "not_started";
  } else {
    status = "paid";
  }
  await db.update(ordersTable).set({ paidCommission: totalPaid.toFixed(2), commissionStatus: status } as any).where(eq(ordersTable.id, id));
  sendValidated(req, res, DeleteCommissionPayoutResponse, { success: true }, "Commission payout delete");
});


// ===== Bulk reconciliation actions =====
const BulkBody = z.object({
  ids: z.array(z.number().int()).min(1),
  patch: ReconUpdate,
});
router.post("/reconciliation/bulk-update", async (req, res) => {
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { ids, patch } = parsed.data;
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Empty patch" }); return; }
  await db.update(ordersTable).set(patch as any).where(inArray(ordersTable.id, ids));
  sendValidated(req, res, BulkUpdateReconciliationResponse, { success: true, count: ids.length }, "Reconciliation bulk update");
});

export default router;
