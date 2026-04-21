import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  partnersTable,
  eventsTable,
  venuesTable,
  citiesTable,
  suppliersTable,
  productCatalogTable,
  packagesTable,
  partnerBrandingLocationsTable,
  quoteAssetsTable,
  quoteAssetMappingsTable,
  discrepanciesTable,
  commissionPayoutsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ===== CSV helpers =====
function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // CSV formula injection hardening: prefix any cell starting with =,+,-,@,\t,\r with a single quote
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: Record<string, any>[], headers: string[]): string {
  const head = headers.join(",");
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(",")).join("\n");
  return head + "\n" + body;
}
function sendCsv(res: any, name: string, rows: Record<string, any>[], headers: string[]) {
  const csv = toCsv(rows, headers);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}
function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function buildOrderFilters(q: Record<string, string | undefined>): any[] {
  const c: any[] = [];
  if (q.partnerId) c.push(eq(ordersTable.partnerId, parseInt(q.partnerId)));
  if (q.eventId) c.push(eq(ordersTable.eventId, parseInt(q.eventId)));
  if (q.status) c.push(eq(ordersTable.status, q.status));
  if (q.paymentStatus) c.push(eq(ordersTable.paymentStatus, q.paymentStatus));
  if (q.paymentModel) c.push(eq(ordersTable.paymentModel, q.paymentModel));
  if (q.reconciliationStatus) c.push(eq(ordersTable.reconciliationStatus, q.reconciliationStatus));
  if (q.commissionStatus) c.push(eq(ordersTable.commissionStatus, q.commissionStatus));
  // Accept both `assignedSupplierId` and the dashboard's `supplierId` querystring shape
  const supId = q.assignedSupplierId || q.supplierId;
  if (supId) c.push(eq(ordersTable.assignedSupplierId, parseInt(supId)));
  return c;
}

// ===== Order export =====
router.get("/exports/orders.csv", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conditions = buildOrderFilters(q);
  const orders = conditions.length
    ? await db.select().from(ordersTable).where(and(...conditions))
    : await db.select().from(ordersTable);
  const partners = await db.select().from(partnersTable);
  const events = await db.select().from(eventsTable);
  const venues = await db.select().from(venuesTable);
  const cities = await db.select().from(citiesTable);
  const pById = new Map(partners.map(p => [p.id, p]));
  const eById = new Map(events.map(e => [e.id, e]));
  const vById = new Map(venues.map(v => [v.id, v]));
  const cById = new Map(cities.map(c => [c.id, c]));

  const rows = orders.map(o => {
    const e = o.eventId ? eById.get(o.eventId) : null;
    const v = o.shippingVenueId ? vById.get(o.shippingVenueId) : null;
    const c = v?.cityId ? cById.get(v.cityId) : (e?.cityId ? cById.get(e.cityId) : null);
    const expected = num(o.expectedCommission);
    const paid = num(o.paidCommission);
    return {
      order_id: o.id,
      order_number: o.orderNumber,
      created_date: o.createdAt?.toISOString().slice(0, 10),
      partner: pById.get(o.partnerId)?.name || "",
      portal_type: o.portalType,
      event: e?.name || "",
      city: c?.name || "",
      venue: v?.name || "",
      client_contact: o.contactName,
      client_email: o.contactEmail,
      billing_entity: o.billingEntity || "",
      payment_model: o.paymentModel,
      payment_status: o.paymentStatus,
      total_retail_amount: o.totalEstimate || "",
      supplier_estimated_cost: o.supplierEstimatedCost || "",
      supplier_final_cost: o.supplierFinalCost || "",
      expected_commission: o.expectedCommission || "",
      paid_commission: o.paidCommission || "",
      commission_status: o.commissionStatus,
      commission_variance: (paid - expected).toFixed(2),
      reconciliation_status: o.reconciliationStatus,
      supplier_payable_status: o.supplierPayableStatus,
      status: o.status,
      fulfillment_status: o.fulfillmentStatus || "",
    };
  });
  sendCsv(res, "orders", rows, [
    "order_id","order_number","created_date","partner","portal_type","event","city","venue",
    "client_contact","client_email","billing_entity","payment_model","payment_status",
    "total_retail_amount","supplier_estimated_cost","supplier_final_cost",
    "expected_commission","paid_commission","commission_status","commission_variance",
    "reconciliation_status","supplier_payable_status","status","fulfillment_status",
  ]);
});

// ===== Order line item export =====
router.get("/exports/order-items.csv", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const orderConds = buildOrderFilters(q);
  const orders = orderConds.length
    ? await db.select().from(ordersTable).where(and(...orderConds))
    : await db.select().from(ordersTable);
  const orderIds = orders.map(o => o.id);
  if (orderIds.length === 0) return sendCsv(res, "order-items", [], []);

  const items = await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
  const partners = await db.select().from(partnersTable);
  const suppliers = await db.select().from(suppliersTable);
  const products = await db.select().from(productCatalogTable);
  const pkgs = await db.select().from(packagesTable);
  const zones = await db.select().from(partnerBrandingLocationsTable);
  const cities = await db.select().from(citiesTable);
  // Quote/spec mappings for line items via product
  const mappings = await db.select().from(quoteAssetMappingsTable);
  const assets = await db.select().from(quoteAssetsTable);
  const assetById = new Map(assets.map(a => [a.id, a]));
  const productMappings = new Map<number, string[]>();
  for (const m of mappings) {
    if (m.mappingType !== "product") continue;
    const a = assetById.get(m.quoteAssetId);
    if (!a) continue;
    const cur = productMappings.get(m.mappingId) || [];
    cur.push(a.name);
    productMappings.set(m.mappingId, cur);
  }
  const oById = new Map(orders.map(o => [o.id, o]));
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const supById = new Map(suppliers.map(s => [s.id, s]));
  const prodById = new Map(products.map(p => [p.id, p]));
  const pkgById = new Map(pkgs.map(p => [p.id, p]));
  const zoneById = new Map(zones.map(z => [z.id, z]));
  const cityById = new Map(cities.map(c => [c.id, c]));

  const rows = items.map(it => {
    const o = oById.get(it.orderId)!;
    const sup = it.assignedSupplierId ? supById.get(it.assignedSupplierId) : null;
    const prod = it.productId ? prodById.get(it.productId) : null;
    const pkg = it.packageId ? pkgById.get(it.packageId) : null;
    const zone = it.brandingZoneId ? zoneById.get(it.brandingZoneId) : null;
    const city = it.inventorySourceCityId ? cityById.get(it.inventorySourceCityId) : null;
    const quoteRefs = prod ? (productMappings.get(prod.id) || []).join("; ") : "";
    return {
      order_id: o.id,
      order_number: o.orderNumber,
      partner: partnerById.get(o.partnerId)?.name || "",
      line_item_id: it.id,
      product: prod?.displayName || prod?.name || it.name,
      package_or_zone: pkg?.name || zone?.name || "",
      quantity: it.quantity,
      fulfillment_mode: it.fulfillmentMode || "",
      print_demand_quantity: it.printDemandQuantity,
      hardware_demand_quantity: it.hardwareDemandQuantity,
      reserved_quantity: it.reservedQuantity,
      shortage_quantity: it.shortageQuantity,
      assigned_supplier: sup?.name || "",
      supplier_status: it.supplierStatus,
      supplier_due_date: it.supplierDueDate?.toISOString().slice(0, 10) || "",
      inventory_source_city: city?.name || "",
      unit_price: it.unitPrice || "",
      estimated_supplier_cost: it.estimatedSupplierCost || "",
      final_supplier_cost: it.finalSupplierCost || "",
      quote_spec_references: quoteRefs,
      ops_notes: it.internalFulfillmentNotes || it.notes || "",
    };
  });
  sendCsv(res, "order-items", rows, [
    "order_id","order_number","partner","line_item_id","product","package_or_zone","quantity",
    "fulfillment_mode","print_demand_quantity","hardware_demand_quantity","reserved_quantity","shortage_quantity",
    "assigned_supplier","supplier_status","supplier_due_date","inventory_source_city",
    "unit_price","estimated_supplier_cost","final_supplier_cost","quote_spec_references","ops_notes",
  ]);
});

// ===== Supplier export =====
router.get("/exports/suppliers.csv", async (_req, res) => {
  const suppliers = await db.select().from(suppliersTable);
  const items = await db.select().from(orderItemsTable);
  const today = Date.now();
  const soon = today + 7 * 24 * 3600 * 1000;
  const rows = suppliers.map(s => {
    const its = items.filter(i => i.assignedSupplierId === s.id);
    const orders = new Set(its.map(i => i.orderId));
    const dueSoon = its.filter(i => i.supplierDueDate && i.supplierDueDate.getTime() <= soon && i.supplierStatus !== "completed").length;
    const issues = its.filter(i => i.exceptionFlag).length;
    const est = its.reduce((a, i) => a + num(i.estimatedSupplierCost) * (i.quantity || 1), 0);
    const fin = its.reduce((a, i) => a + num(i.finalSupplierCost) * (i.quantity || 1), 0);
    return {
      supplier: s.name,
      assigned_orders_count: orders.size,
      assigned_line_items_count: its.length,
      due_soon_count: dueSoon,
      issue_flagged_count: issues,
      estimated_supplier_total: est.toFixed(2),
      final_supplier_total: fin > 0 ? fin.toFixed(2) : "",
    };
  });
  sendCsv(res, "suppliers", rows, ["supplier","assigned_orders_count","assigned_line_items_count","due_soon_count","issue_flagged_count","estimated_supplier_total","final_supplier_total"]);
});

// ===== Event export =====
router.get("/exports/events.csv", async (_req, res) => {
  const events = await db.select().from(eventsTable);
  const partners = await db.select().from(partnersTable);
  const cities = await db.select().from(citiesTable);
  const venues = await db.select().from(venuesTable);
  const orders = await db.select().from(ordersTable);
  const items = await db.select().from(orderItemsTable);
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const cityById = new Map(cities.map(c => [c.id, c]));
  const venueById = new Map(venues.map(v => [v.id, v]));
  const rows = events.map(e => {
    const eOrders = orders.filter(o => o.eventId === e.id);
    const eOrderIds = new Set(eOrders.map(o => o.id));
    const eItems = items.filter(i => eOrderIds.has(i.orderId));
    return {
      partner: partnerById.get(e.partnerId)?.name || "",
      event: e.name,
      city: e.cityId ? cityById.get(e.cityId)?.name || "" : "",
      venue: e.venueId ? venueById.get(e.venueId)?.name || "" : "",
      start_date: e.startDate || "",
      end_date: e.endDate || "",
      reserved_units: eItems.reduce((a, i) => a + (i.reservedQuantity || 0), 0),
      shortage_units: eItems.reduce((a, i) => a + (i.shortageQuantity || 0), 0),
      orders_count: eOrders.length,
      total_retail_booked: eOrders.reduce((a, o) => a + num(o.totalEstimate), 0).toFixed(2),
    };
  });
  sendCsv(res, "events", rows, ["partner","event","city","venue","start_date","end_date","reserved_units","shortage_units","orders_count","total_retail_booked"]);
});

// ===== Finance / reconciliation export =====
router.get("/exports/finance.csv", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conditions = buildOrderFilters(q);
  const orders = conditions.length
    ? await db.select().from(ordersTable).where(and(...conditions))
    : await db.select().from(ordersTable);
  const partners = await db.select().from(partnersTable);
  const discr = await db.select().from(discrepanciesTable);
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const discrByOrder = new Map<number, any[]>();
  for (const d of discr) {
    const cur = discrByOrder.get(d.orderId) || [];
    cur.push(d);
    discrByOrder.set(d.orderId, cur);
  }
  const rows = orders.map(o => {
    const ds = discrByOrder.get(o.id) || [];
    return {
      order_id: o.id,
      order_number: o.orderNumber,
      partner: partnerById.get(o.partnerId)?.name || "",
      payment_model: o.paymentModel,
      billing_entity: o.billingEntity || "",
      retail_amount: o.totalEstimate || "",
      estimated_supplier_cost: o.supplierEstimatedCost || "",
      final_supplier_cost: o.supplierFinalCost || "",
      gross_margin: ((num(o.totalEstimate) - num(o.supplierFinalCost || o.supplierEstimatedCost))).toFixed(2),
      expected_commission: o.expectedCommission || "",
      paid_commission: o.paidCommission || "",
      commission_variance: (num(o.paidCommission) - num(o.expectedCommission)).toFixed(2),
      payment_status: o.paymentStatus,
      supplier_payable_status: o.supplierPayableStatus,
      payout_status: o.payoutStatus,
      commission_status: o.commissionStatus,
      reconciliation_status: o.reconciliationStatus,
      open_discrepancies: ds.filter(d => d.status === "open" || d.status === "in_review").length,
      discrepancy_reason: ds.map(d => d.type).join("; "),
      reconciliation_notes: o.reconciliationNotes || "",
    };
  });
  sendCsv(res, "finance-recon", rows, [
    "order_id","order_number","partner","payment_model","billing_entity",
    "retail_amount","estimated_supplier_cost","final_supplier_cost","gross_margin",
    "expected_commission","paid_commission","commission_variance",
    "payment_status","supplier_payable_status","payout_status","commission_status","reconciliation_status",
    "open_discrepancies","discrepancy_reason","reconciliation_notes",
  ]);
});

// ===== Printable HTML packets =====
function packetHtml(opts: { title: string; sections: { heading: string; html: string }[]; subtitle?: string }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title>
<style>
  @media print { .no-print { display:none; } body { margin: 0.5in; } }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; max-width: 8.5in; margin: 0.5in auto; padding: 0 0.25in; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; vertical-align: top; }
  thead th { background: #f5f5f5; border-bottom: 1px solid #ccc; font-weight: 600; }
  tbody tr { border-bottom: 1px solid #eee; }
  .meta { font-size: 11px; color: #666; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px; }
  .grid b { color: #555; font-weight: 600; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef; font-size: 10px; margin-right: 4px; }
  .toolbar { background: #f9fafb; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
  .toolbar button { font: inherit; padding: 4px 12px; cursor: pointer; }
  pre { white-space: pre-wrap; font: 12px/1.4 inherit; background: #fafafa; padding: 8px; border-radius: 4px; }
</style></head><body>
<div class="toolbar no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${opts.title}</h1>
${opts.subtitle ? `<div class="meta">${opts.subtitle}</div>` : ""}
${opts.sections.map(s => `<h2>${s.heading}</h2>${s.html}`).join("")}
</body></html>`;
}
function esc(s: any): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
function addrLine(a: any): string {
  if (!a) return "—";
  return [a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(" "), a.country].filter(Boolean).map(esc).join("<br/>");
}

router.get("/exports/orders/:id/packet.html", async (req, res) => {
  const id = parseInt(req.params.id);
  const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : null;
  const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!o) { res.status(404).send("Order not found"); return; }
  const [partner] = o.partnerId ? await db.select().from(partnersTable).where(eq(partnersTable.id, o.partnerId)) : [null];
  const [evt] = o.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, o.eventId)) : [null];
  const [venue] = o.shippingVenueId ? await db.select().from(venuesTable).where(eq(venuesTable.id, o.shippingVenueId)) : [null];
  let items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  if (supplierId) items = items.filter(i => i.assignedSupplierId === supplierId);
  const suppliers = await db.select().from(suppliersTable);
  const supById = new Map(suppliers.map(s => [s.id, s]));
  const supScopeName = supplierId ? (supById.get(supplierId)?.name || "Supplier") : null;

  // Attached quote/spec assets via product mappings
  const productIds = items.map(i => i.productId).filter(Boolean) as number[];
  let assetList: { name: string; product: string }[] = [];
  if (productIds.length) {
    const mappings = await db.select().from(quoteAssetMappingsTable).where(and(eq(quoteAssetMappingsTable.mappingType, "product"), inArray(quoteAssetMappingsTable.mappingId, productIds)));
    if (mappings.length) {
      const assets = await db.select().from(quoteAssetsTable).where(inArray(quoteAssetsTable.id, mappings.map(m => m.quoteAssetId)));
      const assetById = new Map(assets.map(a => [a.id, a]));
      const products = await db.select().from(productCatalogTable).where(inArray(productCatalogTable.id, productIds));
      const prodById = new Map(products.map(p => [p.id, p]));
      assetList = mappings.map(m => ({
        name: assetById.get(m.quoteAssetId)?.name || `Asset #${m.quoteAssetId}`,
        product: prodById.get(m.mappingId)?.name || `Product #${m.mappingId}`,
      }));
    }
  }

  const sections: { heading: string; html: string }[] = [];
  sections.push({
    heading: "Order Summary",
    html: `<div class="grid">
      <div><b>Order #:</b> ${esc(o.orderNumber)}</div>
      <div><b>Created:</b> ${esc(o.createdAt?.toISOString().slice(0, 10))}</div>
      <div><b>Status:</b> <span class="pill">${esc(o.status)}</span> <span class="pill">${esc(o.fulfillmentStatus || "—")}</span></div>
      <div><b>Payment:</b> <span class="pill">${esc(o.paymentStatus)}</span> <span class="pill">${esc(o.paymentModel)}</span></div>
      <div><b>Partner:</b> ${esc(partner?.name || "—")}</div>
      <div><b>Portal:</b> ${esc(o.portalType)}</div>
      <div><b>Event:</b> ${esc(evt?.name || "—")}</div>
      <div><b>Venue:</b> ${esc(venue?.name || "—")}</div>
    </div>`,
  });

  if (!supplierId) {
    sections.push({
      heading: "Contacts & Addresses",
      html: `<div class="grid">
        <div><b>Onsite contact:</b><br/>${esc(o.contactName)}<br/>${esc(o.contactEmail)}<br/>${esc(o.contactPhone || "")}</div>
        <div><b>Billing entity:</b><br/>${esc(o.billingEntity || o.companyName || "—")}</div>
        <div><b>Shipping address:</b><br/>${addrLine(o.shippingAddressJson)}</div>
        <div><b>Billing address:</b><br/>${addrLine(o.billingAddressJson)}</div>
      </div>`,
    });
  } else {
    sections.push({
      heading: "Ship-to / Install",
      html: `<div class="grid">
        <div><b>Onsite contact:</b><br/>${esc(o.contactName)}<br/>${esc(o.contactEmail)}<br/>${esc(o.contactPhone || "")}</div>
        <div><b>Shipping address:</b><br/>${addrLine(o.shippingAddressJson)}</div>
      </div>`,
    });
  }

  sections.push({
    heading: supplierId ? `Line Items (${esc(supScopeName)} only)` : "Line Items",
    html: `<table><thead><tr>
      <th>#</th><th>Item</th><th>Qty</th><th>Print</th><th>Hardware</th>${supplierId ? "" : "<th>Supplier</th>"}<th>Status</th><th>Due</th>
    </tr></thead><tbody>
    ${items.length === 0 ? `<tr><td colspan="8" style="color:#999;text-align:center;padding:20px">No line items</td></tr>` :
      items.map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(it.name)}</b>${it.notes ? `<br/><span class="meta">${esc(it.notes)}</span>` : ""}</td>
        <td>${it.quantity}</td>
        <td>${it.printDemandQuantity}</td>
        <td>${it.hardwareDemandQuantity}</td>
        ${supplierId ? "" : `<td>${esc(supById.get(it.assignedSupplierId || 0)?.name || "—")}</td>`}
        <td><span class="pill">${esc(it.supplierStatus)}</span>${it.exceptionFlag ? ' <span class="pill" style="background:#fee">⚠ ' + esc(it.exceptionReason || "exception") + '</span>' : ""}</td>
        <td>${it.supplierDueDate ? esc(it.supplierDueDate.toISOString().slice(0, 10)) : "—"}</td>
      </tr>`).join("")}
    </tbody></table>`,
  });

  if (assetList.length > 0) {
    sections.push({
      heading: "Quote / Spec References",
      html: `<table><thead><tr><th>Reference</th><th>Linked Product</th></tr></thead><tbody>
        ${assetList.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.product)}</td></tr>`).join("")}
      </tbody></table>`,
    });
  }

  if (!supplierId && (o.notes || o.internalNotes)) {
    sections.push({
      heading: "Notes",
      html: `${o.notes ? `<div><b>Customer:</b><pre>${esc(o.notes)}</pre></div>` : ""}
        ${o.internalNotes ? `<div><b>Internal:</b><pre>${esc(o.internalNotes)}</pre></div>` : ""}`,
    });
  }
  if (supplierId && o.vendorNotes) {
    sections.push({ heading: "Supplier Notes", html: `<pre>${esc(o.vendorNotes)}</pre>` });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(packetHtml({
    title: supplierId ? `Supplier Packet — ${supScopeName} — ${o.orderNumber}` : `Operational Packet — ${o.orderNumber}`,
    subtitle: `${partner?.name || ""} · ${evt?.name || ""}`,
    sections,
  }));
});

router.get("/exports/suppliers/:id/packet.html", async (req, res) => {
  const sid = parseInt(req.params.id);
  const [sup] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, sid));
  if (!sup) { res.status(404).send("Supplier not found"); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.assignedSupplierId, sid));
  const orderIds = [...new Set(items.map(i => i.orderId))];
  const orders = orderIds.length ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds)) : [];
  const oById = new Map(orders.map(o => [o.id, o]));
  const sections = [{
    heading: "Active Assignments",
    html: `<table><thead><tr><th>Order #</th><th>Item</th><th>Qty</th><th>Status</th><th>Due</th><th>Ship-to</th></tr></thead><tbody>
      ${items.length === 0 ? `<tr><td colspan="6" style="color:#999;text-align:center;padding:20px">No assignments</td></tr>` :
        items.map(i => {
          const o = oById.get(i.orderId);
          const a = o?.shippingAddressJson;
          return `<tr>
            <td>${esc(o?.orderNumber || i.orderId)}</td>
            <td>${esc(i.name)}${i.notes ? `<br/><span class="meta">${esc(i.notes)}</span>` : ""}</td>
            <td>${i.quantity}</td>
            <td><span class="pill">${esc(i.supplierStatus)}</span></td>
            <td>${i.supplierDueDate ? esc(i.supplierDueDate.toISOString().slice(0, 10)) : "—"}</td>
            <td>${a ? esc([a.city, a.state].filter(Boolean).join(", ")) : "—"}</td>
          </tr>`;
        }).join("")}
    </tbody></table>`,
  }];
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(packetHtml({ title: `Supplier Packet — ${sup.name}`, sections }));
});

export default router;
