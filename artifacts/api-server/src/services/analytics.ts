// @ts-nocheck
import {
  db,
  ordersTable,
  orderItemsTable,
  invoicesTable,
  invoicePaymentsTable,
  partnersTable,
  eventsTable,
  suppliersTable,
  productCatalogTable,
  packagesTable,
  partnerBrandingLocationsTable,
  citiesTable,
  venuesTable,
  workflowAlertsTable,
  workflowTasksTable,
} from "@workspace/db";
import { and, gte, lte, eq, inArray, isNotNull } from "drizzle-orm";

// ===== Filters =====
export type Filters = {
  from?: Date | null;
  to?: Date | null;
  partnerId?: number | null;
  portalType?: string | null;
  cityId?: number | null;
  supplierId?: number | null;
  billingExecModel?: string | null;
};

const TERMINAL_ORDER_STATUSES = new Set(["cancelled"]);

function num(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function inRange(d: Date | string | null, from?: Date | null, to?: Date | null): boolean {
  if (!d) return !from && !to;
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return false;
  if (from && x < from) return false;
  if (to && x > to) return false;
  return true;
}

// =====================================================================
// Workspace loader — pull once, aggregate in memory.
// =====================================================================
export async function loadWorkspace(filters: Filters = {}) {
  const [orders, items, invoices, payments, partners, events, suppliers, products, packages, zones, cities, venues] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(orderItemsTable),
    db.select().from(invoicesTable),
    db.select().from(invoicePaymentsTable),
    db.select().from(partnersTable),
    db.select().from(eventsTable),
    db.select().from(suppliersTable),
    db.select().from(productCatalogTable),
    db.select().from(packagesTable),
    db.select().from(partnerBrandingLocationsTable),
    db.select().from(citiesTable),
    db.select().from(venuesTable),
  ]);

  const partnerById = new Map(partners.map(p => [p.id, p]));
  const eventById = new Map(events.map(e => [e.id, e]));
  const supplierById = new Map(suppliers.map(s => [s.id, s]));
  const productById = new Map(products.map(p => [p.id, p]));
  const packageById = new Map(packages.map(p => [p.id, p]));
  const zoneById = new Map(zones.map(z => [z.id, z]));
  const cityById = new Map(cities.map(c => [c.id, c]));
  const venueById = new Map(venues.map(v => [v.id, v]));
  const itemsByOrder = new Map<number, any[]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderId) || [];
    arr.push(it); itemsByOrder.set(it.orderId, arr);
  }
  const invoicesByOrder = new Map<number, any[]>();
  for (const inv of invoices) {
    const arr = invoicesByOrder.get(inv.orderId) || [];
    arr.push(inv); invoicesByOrder.set(inv.orderId, arr);
  }
  const paymentsByInvoice = new Map<number, any[]>();
  for (const p of payments) {
    const arr = paymentsByInvoice.get(p.invoiceId) || [];
    arr.push(p); paymentsByInvoice.set(p.invoiceId, arr);
  }

  // Apply filters at the order level. Date filter applies to createdAt by default.
  const filteredOrders = orders.filter(o => {
    if (TERMINAL_ORDER_STATUSES.has(o.status)) return false;
    if (filters.partnerId && o.partnerId !== filters.partnerId) return false;
    if (filters.portalType && o.portalType !== filters.portalType) return false;
    if (filters.supplierId && o.assignedSupplierId !== filters.supplierId) return false;
    if (filters.billingExecModel && o.billingExecModel !== filters.billingExecModel) return false;
    if (filters.cityId) {
      const ev = o.eventId ? eventById.get(o.eventId) : null;
      const venueCityId = ev?.cityId ?? (o.shippingVenueId ? venueById.get(o.shippingVenueId)?.cityId : null);
      if (venueCityId !== filters.cityId) return false;
    }
    if ((filters.from || filters.to) && !inRange(o.createdAt, filters.from, filters.to)) return false;
    return true;
  });

  return {
    orders: filteredOrders,
    allOrders: orders,
    items, itemsByOrder,
    invoices, invoicesByOrder,
    payments, paymentsByInvoice,
    partners, partnerById,
    events, eventById,
    suppliers, supplierById,
    products, productById,
    packages, packageById,
    zones, zoneById,
    cities, cityById,
    venues, venueById,
  };
}

// =====================================================================
// Per-order metric snapshot
// =====================================================================
export function orderMetrics(o: any, ws: Awaited<ReturnType<typeof loadWorkspace>>) {
  const retail = num(o.totalEstimate);
  const estCost = num(o.supplierEstimatedCost);
  const finCost = num(o.supplierFinalCost);
  const expComm = num(o.expectedCommission);
  const paidComm = num(o.paidCommission);
  const invoices = ws.invoicesByOrder.get(o.id) || [];
  const invoiced = invoices.filter(i => i.status !== "cancelled" && i.status !== "draft").reduce((s, i) => s + num(i.totalAmount), 0);
  const collected = invoices.reduce((s, i) => s + num(i.amountPaid), 0);
  const outstanding = invoices.filter(i => i.status !== "cancelled").reduce((s, i) => s + num(i.balanceDue), 0);
  const items = ws.itemsByOrder.get(o.id) || [];
  const blockedItems = items.filter(i => i.productionBlockedReason).length;
  const shortageItems = items.filter(i => (i.shortageQuantity || 0) > 0).length;
  return {
    retail, estCost, finCost,
    estMargin: retail - estCost,
    actMargin: retail - (finCost || estCost),
    expComm, paidComm,
    commVariance: expComm - paidComm,
    invoiced, collected, outstanding,
    blockedItems, shortageItems,
    itemCount: items.length,
  };
}

// =====================================================================
// KPI summary
// =====================================================================
export async function kpis(filters: Filters = {}) {
  const ws = await loadWorkspace(filters);
  let totalRetail = 0, totalEst = 0, totalFin = 0, totalExpComm = 0, totalPaidComm = 0;
  let totalInvoiced = 0, totalCollected = 0, totalOutstanding = 0;
  const statusCounts: Record<string, number> = {};
  const billingCounts: Record<string, number> = {};
  let blockedOrderCount = 0, shortageOrderCount = 0;
  let openDiscrepancyCount = 0;

  for (const o of ws.orders) {
    const m = orderMetrics(o, ws);
    totalRetail += m.retail;
    totalEst += m.estCost;
    totalFin += m.finCost;
    totalExpComm += m.expComm;
    totalPaidComm += m.paidComm;
    totalInvoiced += m.invoiced;
    totalCollected += m.collected;
    totalOutstanding += m.outstanding;
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    const bm = o.billingExecModel || "unknown";
    billingCounts[bm] = (billingCounts[bm] || 0) + 1;
    if (m.blockedItems > 0) blockedOrderCount++;
    if (m.shortageItems > 0) shortageOrderCount++;
    if (o.reconciliationStatus === "discrepancy_found" || o.reconciliationStatus === "in_review") openDiscrepancyCount++;
  }

  // Invoice-level: overdue
  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = ws.invoices.filter(i => (i.status === "sent" && i.dueDate && i.dueDate < today) || i.status === "overdue").length;

  // Events upcoming / at risk
  const now = Date.now();
  const in60d = now + 60 * 86400_000;
  const upcomingEvents: any[] = [];
  const atRiskEvents: any[] = [];
  for (const ev of ws.events) {
    const startStr = ev.eventStartDate || ev.installDate;
    if (!startStr) continue;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) continue;
    const t = start.getTime();
    if (t < now || t > in60d) continue;
    upcomingEvents.push(ev);
    // risk = any associated order with blocked items or unfulfilled status close to event
    const evOrders = ws.allOrders.filter(o => o.eventId === ev.id);
    const hasBlocked = evOrders.some(o => (ws.itemsByOrder.get(o.id) || []).some(i => i.productionBlockedReason));
    const daysOut = Math.floor((t - now) / 86400_000);
    if (hasBlocked || (daysOut <= 14 && evOrders.some(o => !["completed", "fulfilled"].includes(o.status)))) atRiskEvents.push(ev);
  }

  return {
    counts: {
      orders: ws.orders.length,
      activePartners: new Set(ws.orders.map(o => o.partnerId).filter(Boolean)).size,
      blockedOrders: blockedOrderCount,
      shortageOrders: shortageOrderCount,
      openDiscrepancies: openDiscrepancyCount,
      overdueInvoices,
      upcomingEvents: upcomingEvents.length,
      atRiskEvents: atRiskEvents.length,
    },
    money: {
      totalRetail, totalEst, totalFin,
      estGrossMargin: totalRetail - totalEst,
      actGrossMargin: totalRetail - (totalFin || totalEst),
      estMarginPct: totalRetail > 0 ? ((totalRetail - totalEst) / totalRetail) * 100 : 0,
      actMarginPct: totalRetail > 0 ? ((totalRetail - (totalFin || totalEst)) / totalRetail) * 100 : 0,
      totalExpComm, totalPaidComm,
      commVariance: totalExpComm - totalPaidComm,
      totalInvoiced, totalCollected, totalOutstanding,
    },
    statusCounts,
    billingCounts,
  };
}

// =====================================================================
// Profitability breakdown by dimension
// =====================================================================
type Dimension = "partner" | "event" | "city" | "portalType" | "billingModel" | "supplier" | "package" | "zone" | "productCategory";

export async function profitability(dimension: Dimension, filters: Filters = {}) {
  const ws = await loadWorkspace(filters);
  type Bucket = {
    key: string | number; label: string;
    retail: number; estCost: number; finCost: number;
    expComm: number; paidComm: number;
    invoiced: number; collected: number; outstanding: number;
    orderCount: number; itemCount: number; discrepancies: number;
  };
  const buckets = new Map<string | number, Bucket>();
  function get(key: string | number, label: string): Bucket {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, retail: 0, estCost: 0, finCost: 0, expComm: 0, paidComm: 0, invoiced: 0, collected: 0, outstanding: 0, orderCount: 0, itemCount: 0, discrepancies: 0 });
    }
    return buckets.get(key)!;
  }

  for (const o of ws.orders) {
    const m = orderMetrics(o, ws);
    const items = ws.itemsByOrder.get(o.id) || [];
    const ev = o.eventId ? ws.eventById.get(o.eventId) : null;
    const venue = o.shippingVenueId ? ws.venueById.get(o.shippingVenueId) : null;

    function addToOrderBucket(key: string | number | null, label: string) {
      if (key == null) return;
      const b = get(key, label);
      b.retail += m.retail;
      b.estCost += m.estCost;
      b.finCost += m.finCost;
      b.expComm += m.expComm;
      b.paidComm += m.paidComm;
      b.invoiced += m.invoiced;
      b.collected += m.collected;
      b.outstanding += m.outstanding;
      b.orderCount += 1;
      b.itemCount += items.length;
      if (o.reconciliationStatus === "discrepancy_found" || o.reconciliationStatus === "in_review") b.discrepancies++;
    }

    switch (dimension) {
      case "partner": {
        const p = o.partnerId ? ws.partnerById.get(o.partnerId) : null;
        addToOrderBucket(o.partnerId, p?.companyName || `Partner #${o.partnerId}`);
        break;
      }
      case "event": {
        if (!ev) break;
        addToOrderBucket(`event:${ev.id}`, ev.name);
        break;
      }
      case "city": {
        const cityId = ev?.cityId ?? venue?.cityId ?? null;
        if (!cityId) break;
        const c = ws.cityById.get(cityId);
        addToOrderBucket(`city:${cityId}`, c?.name || `City #${cityId}`);
        break;
      }
      case "portalType":
        addToOrderBucket(o.portalType || "unknown", o.portalType || "unknown");
        break;
      case "billingModel":
        addToOrderBucket(o.billingExecModel || "unknown", (o.billingExecModel || "unknown").replace(/_/g, " "));
        break;
      case "supplier": {
        const sid = o.assignedSupplierId;
        if (!sid) { addToOrderBucket("unassigned", "Unassigned"); break; }
        const s = ws.supplierById.get(sid);
        addToOrderBucket(`sup:${sid}`, s?.name || `Supplier #${sid}`);
        break;
      }
      case "package": {
        // sum from line items rather than order roll-up
        for (const it of items) {
          if (!it.packageId) continue;
          const pkg = ws.packageById.get(it.packageId);
          const b = get(`pkg:${it.packageId}`, pkg?.displayName || pkg?.name || `Package #${it.packageId}`);
          const r = num(it.unitPrice) * (it.quantity || 1);
          const e = num(it.estimatedSupplierCost);
          const f = num(it.finalSupplierCost);
          b.retail += r; b.estCost += e; b.finCost += f;
          b.itemCount += 1;
        }
        break;
      }
      case "zone": {
        for (const it of items) {
          if (!it.brandingZoneId) continue;
          const z = ws.zoneById.get(it.brandingZoneId);
          const b = get(`zn:${it.brandingZoneId}`, z?.name || `Zone #${it.brandingZoneId}`);
          const r = num(it.unitPrice) * (it.quantity || 1);
          b.retail += r; b.estCost += num(it.estimatedSupplierCost); b.finCost += num(it.finalSupplierCost);
          b.itemCount += 1;
        }
        break;
      }
      case "productCategory": {
        for (const it of items) {
          if (!it.productId) continue;
          const p = ws.productById.get(it.productId);
          const cat = p?.category || "uncategorized";
          const b = get(`cat:${cat}`, cat);
          const r = num(it.unitPrice) * (it.quantity || 1);
          b.retail += r; b.estCost += num(it.estimatedSupplierCost); b.finCost += num(it.finalSupplierCost);
          b.itemCount += 1;
        }
        break;
      }
    }
  }

  return [...buckets.values()].map(b => ({
    ...b,
    estMargin: b.retail - b.estCost,
    actMargin: b.retail - (b.finCost || b.estCost),
    estMarginPct: b.retail > 0 ? ((b.retail - b.estCost) / b.retail) * 100 : 0,
    actMarginPct: b.retail > 0 ? ((b.retail - (b.finCost || b.estCost)) / b.retail) * 100 : 0,
    commVariance: b.expComm - b.paidComm,
    avgOrderValue: b.orderCount > 0 ? b.retail / b.orderCount : 0,
  })).sort((a, b) => b.retail - a.retail);
}

// =====================================================================
// Supplier performance
// =====================================================================
export async function supplierPerformance(filters: Filters = {}) {
  const ws = await loadWorkspace(filters);
  type Row = {
    supplierId: number; name: string;
    orderCount: number; itemCount: number;
    revenue: number; estCost: number; finCost: number;
    blockedItems: number; shortageItems: number;
    overdueItems: number; dueSoonItems: number;
    missingArtwork: number;
    completedItems: number;
  };
  const rows = new Map<number, Row>();
  function get(id: number, name: string): Row {
    if (!rows.has(id)) rows.set(id, { supplierId: id, name, orderCount: 0, itemCount: 0, revenue: 0, estCost: 0, finCost: 0, blockedItems: 0, shortageItems: 0, overdueItems: 0, dueSoonItems: 0, missingArtwork: 0, completedItems: 0 });
    return rows.get(id)!;
  }
  const now = Date.now();
  // Order-level (assigned supplier)
  const orderSuppliers = new Set<string>();
  for (const o of ws.orders) {
    if (!o.assignedSupplierId) continue;
    const s = ws.supplierById.get(o.assignedSupplierId);
    const r = get(o.assignedSupplierId, s?.name || `Supplier #${o.assignedSupplierId}`);
    const m = orderMetrics(o, ws);
    r.revenue += m.retail;
    r.estCost += m.estCost;
    r.finCost += m.finCost;
    const key = `${o.assignedSupplierId}:${o.id}`;
    if (!orderSuppliers.has(key)) { r.orderCount += 1; orderSuppliers.add(key); }
  }
  // Item-level (per-item supplier)
  for (const it of ws.items) {
    const sid = it.assignedSupplierId;
    if (!sid) continue;
    const s = ws.supplierById.get(sid);
    const r = get(sid, s?.name || `Supplier #${sid}`);
    r.itemCount += 1;
    if (it.productionBlockedReason) r.blockedItems += 1;
    if ((it.shortageQuantity || 0) > 0) r.shortageItems += 1;
    if (it.artworkRequired && !it.artworkFileUrl) r.missingArtwork += 1;
    if (it.supplierStatus === "completed" || it.supplierStatus === "delivered") r.completedItems += 1;
    if (it.supplierDueDate) {
      const d = new Date(it.supplierDueDate).getTime();
      const days = (d - now) / 86400_000;
      if (days < 0 && it.supplierStatus !== "completed") r.overdueItems += 1;
      else if (days <= 7 && days >= 0) r.dueSoonItems += 1;
    }
  }
  return [...rows.values()].map(r => ({
    ...r,
    costVariance: r.finCost - r.estCost,
    estMargin: r.revenue - r.estCost,
    actMargin: r.revenue - (r.finCost || r.estCost),
    issueRate: r.itemCount > 0 ? ((r.blockedItems + r.shortageItems + r.overdueItems) / r.itemCount) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

// =====================================================================
// Package, zone, product analytics
// =====================================================================
export async function packageAnalytics(filters: Filters = {}) {
  return profitability("package", filters);
}
export async function zoneAnalytics(filters: Filters = {}) {
  return profitability("zone", filters);
}
export async function productAnalytics(filters: Filters = {}) {
  const ws = await loadWorkspace(filters);
  type Row = { productId: number; name: string; category: string; orders: number; quantity: number; revenue: number; estCost: number; finCost: number; shortages: number; missingArtwork: number; printOnly: number; fullUnit: number };
  const rows = new Map<number, Row>();
  for (const it of ws.items) {
    if (!it.productId) continue;
    const p = ws.productById.get(it.productId);
    if (!rows.has(it.productId)) rows.set(it.productId, { productId: it.productId, name: p?.displayName || p?.name || `#${it.productId}`, category: p?.category || "uncategorized", orders: 0, quantity: 0, revenue: 0, estCost: 0, finCost: 0, shortages: 0, missingArtwork: 0, printOnly: 0, fullUnit: 0 });
    const r = rows.get(it.productId)!;
    r.orders += 1;
    r.quantity += it.quantity || 1;
    r.revenue += num(it.unitPrice) * (it.quantity || 1);
    r.estCost += num(it.estimatedSupplierCost);
    r.finCost += num(it.finalSupplierCost);
    if ((it.shortageQuantity || 0) > 0) r.shortages += 1;
    if (it.artworkRequired && !it.artworkFileUrl) r.missingArtwork += 1;
    if ((it.fulfillmentMode || "").toLowerCase().includes("graphic")) r.printOnly += 1;
    else r.fullUnit += 1;
  }
  return [...rows.values()].map(r => ({ ...r, estMargin: r.revenue - r.estCost, actMargin: r.revenue - (r.finCost || r.estCost) })).sort((a, b) => b.revenue - a.revenue);
}

// =====================================================================
// Forecast / pipeline
// =====================================================================
export async function forecast(filters: Filters = {}) {
  const ws = await loadWorkspace({ ...filters, from: null, to: null });
  const now = Date.now();
  type Bucket = { label: string; orderCount: number; retail: number; estCost: number; expComm: number; eventCount: number };
  function emptyBucket(label: string): Bucket { return { label, orderCount: 0, retail: 0, estCost: 0, expComm: 0, eventCount: 0 }; }
  const horizons = { "30d": now + 30 * 86400_000, "60d": now + 60 * 86400_000, "90d": now + 90 * 86400_000 };
  const horizonBuckets: Record<string, Bucket> = { "30d": emptyBucket("Next 30 days"), "60d": emptyBucket("Next 60 days"), "90d": emptyBucket("Next 90 days") };
  const stageBuckets: Record<string, Bucket> = {
    confirmed: emptyBucket("Confirmed"),
    awaiting_approval: emptyBucket("Awaiting approval"),
    awaiting_assets: emptyBucket("Awaiting assets"),
    awaiting_billing: emptyBucket("Awaiting billing"),
    at_risk: emptyBucket("At risk"),
    delayed: emptyBucket("Delayed"),
  };

  for (const o of ws.orders) {
    if (filters.partnerId && o.partnerId !== filters.partnerId) continue;
    if (filters.portalType && o.portalType !== filters.portalType) continue;
    if (filters.supplierId && o.assignedSupplierId !== filters.supplierId) continue;
    const m = orderMetrics(o, ws);
    const ev = o.eventId ? ws.eventById.get(o.eventId) : null;
    const startStr = ev?.eventStartDate || ev?.installDate;
    const eventTime = startStr ? new Date(startStr).getTime() : null;

    if (eventTime && eventTime > now) {
      for (const [k, t] of Object.entries(horizons)) {
        if (eventTime <= t) {
          horizonBuckets[k].orderCount += 1;
          horizonBuckets[k].retail += m.retail;
          horizonBuckets[k].estCost += m.estCost;
          horizonBuckets[k].expComm += m.expComm;
          break;
        }
      }
    }

    // Stage classification
    const items = ws.itemsByOrder.get(o.id) || [];
    const blocked = items.some(i => i.productionBlockedReason);
    const missingArt = items.some(i => i.artworkRequired && !i.artworkFileUrl);
    const noInvoice = (ws.invoicesByOrder.get(o.id) || []).length === 0;
    let stage = "confirmed";
    if (blocked) stage = "at_risk";
    else if (eventTime && eventTime < now && !["completed", "fulfilled"].includes(o.status)) stage = "delayed";
    else if (o.status === "new" || o.status === "draft") stage = "awaiting_approval";
    else if (missingArt) stage = "awaiting_assets";
    else if (noInvoice) stage = "awaiting_billing";
    const sb = stageBuckets[stage] || stageBuckets.confirmed;
    sb.orderCount += 1;
    sb.retail += m.retail;
    sb.estCost += m.estCost;
    sb.expComm += m.expComm;
  }

  // Event count per horizon
  for (const ev of ws.events) {
    const startStr = ev.eventStartDate || ev.installDate;
    if (!startStr) continue;
    const t = new Date(startStr).getTime();
    if (isNaN(t) || t < now) continue;
    if (filters.partnerId && ev.partnerId !== filters.partnerId) continue;
    for (const [k, h] of Object.entries(horizons)) {
      if (t <= h) { horizonBuckets[k].eventCount += 1; break; }
    }
  }

  return {
    horizons: Object.entries(horizonBuckets).map(([k, v]) => ({ key: k, ...v, estMargin: v.retail - v.estCost })),
    stages: Object.entries(stageBuckets).map(([k, v]) => ({ key: k, ...v, estMargin: v.retail - v.estCost })),
  };
}

// =====================================================================
// Operational risk
// =====================================================================
export async function risk(filters: Filters = {}) {
  const ws = await loadWorkspace(filters);
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const blockedOrders: any[] = [];
  const blockedItems: any[] = [];
  const shortages: any[] = [];
  const missingArtwork: any[] = [];
  const unassignedItems: any[] = [];
  const unreconciled: any[] = [];
  const commissionDiscrepancies: any[] = [];

  let revenueAtRisk = 0;
  for (const o of ws.orders) {
    const items = ws.itemsByOrder.get(o.id) || [];
    const m = orderMetrics(o, ws);
    let orderAtRisk = false;
    for (const it of items) {
      if (it.productionBlockedReason) {
        blockedItems.push({ orderId: o.id, orderNumber: o.orderNumber, itemId: it.id, name: it.name, reason: it.productionBlockedReason, partnerId: o.partnerId });
        orderAtRisk = true;
      }
      if ((it.shortageQuantity || 0) > 0) {
        shortages.push({ orderId: o.id, orderNumber: o.orderNumber, itemId: it.id, name: it.name, shortageQuantity: it.shortageQuantity, partnerId: o.partnerId });
        orderAtRisk = true;
      }
      if (it.artworkRequired && !it.artworkFileUrl) {
        missingArtwork.push({ orderId: o.id, orderNumber: o.orderNumber, itemId: it.id, name: it.name, partnerId: o.partnerId });
        orderAtRisk = true;
      }
      if (!it.assignedSupplierId && !o.assignedSupplierId) {
        unassignedItems.push({ orderId: o.id, orderNumber: o.orderNumber, itemId: it.id, name: it.name, partnerId: o.partnerId });
      }
    }
    if (items.some(i => i.productionBlockedReason)) blockedOrders.push({ orderId: o.id, orderNumber: o.orderNumber, partnerId: o.partnerId, retail: m.retail });
    if (o.reconciliationStatus === "discrepancy_found" || o.reconciliationStatus === "in_review") unreconciled.push({ orderId: o.id, orderNumber: o.orderNumber, status: o.reconciliationStatus, partnerId: o.partnerId, retail: m.retail });
    if (m.commVariance !== 0 && o.commissionStatus !== "reconciled") commissionDiscrepancies.push({ orderId: o.id, orderNumber: o.orderNumber, expected: m.expComm, paid: m.paidComm, variance: m.commVariance });
    if (orderAtRisk) revenueAtRisk += m.retail;
  }

  const overdueInvoices = ws.invoices.filter(i => (i.status === "sent" && i.dueDate && i.dueDate < today) || i.status === "overdue").map(i => ({
    invoiceId: i.id, invoiceNumber: i.invoiceNumber, orderId: i.orderId, partnerId: i.partnerId,
    dueDate: i.dueDate, balanceDue: num(i.balanceDue), totalAmount: num(i.totalAmount),
  }));

  // Events approaching with readiness issues
  const eventsApproaching: any[] = [];
  for (const ev of ws.events) {
    const startStr = ev.eventStartDate || ev.installDate;
    if (!startStr) continue;
    const t = new Date(startStr).getTime();
    if (isNaN(t) || t < now || t > now + 30 * 86400_000) continue;
    if (filters.partnerId && ev.partnerId !== filters.partnerId) continue;
    const evOrders = ws.allOrders.filter(o => o.eventId === ev.id);
    const issues = evOrders.flatMap(o => {
      const its = ws.itemsByOrder.get(o.id) || [];
      const out: string[] = [];
      if (its.some(i => i.productionBlockedReason)) out.push("blocked");
      if (its.some(i => i.artworkRequired && !i.artworkFileUrl)) out.push("missing_artwork");
      if ((o.shortageItems || its.filter(i => (i.shortageQuantity || 0) > 0).length) > 0) out.push("shortage");
      return out;
    });
    if (issues.length > 0) eventsApproaching.push({ eventId: ev.id, name: ev.name, partnerId: ev.partnerId, eventStartDate: startStr, daysOut: Math.floor((t - now) / 86400_000), issues: [...new Set(issues)] });
  }

  return {
    revenueAtRisk,
    counts: {
      blockedOrders: blockedOrders.length,
      blockedItems: blockedItems.length,
      shortages: shortages.length,
      missingArtwork: missingArtwork.length,
      unassignedItems: unassignedItems.length,
      overdueInvoices: overdueInvoices.length,
      unreconciled: unreconciled.length,
      commissionDiscrepancies: commissionDiscrepancies.length,
      eventsApproaching: eventsApproaching.length,
    },
    blockedOrders, blockedItems, shortages, missingArtwork, unassignedItems,
    overdueInvoices, unreconciled, commissionDiscrepancies, eventsApproaching,
  };
}

// =====================================================================
// Trends — bucket retail/margin/commission/cost over time
// =====================================================================
export async function trends(filters: Filters = {}, granularity: "day" | "week" | "month" = "month") {
  const ws = await loadWorkspace(filters);
  const buckets = new Map<string, { period: string; retail: number; estCost: number; finCost: number; estMargin: number; actMargin: number; expComm: number; paidComm: number; collected: number; orderCount: number }>();
  function periodKey(d: Date): string {
    if (granularity === "day") return d.toISOString().slice(0, 10);
    if (granularity === "week") {
      const j = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil((((d.getTime() - j.getTime()) / 86400_000) + j.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  for (const o of ws.orders) {
    const k = periodKey(o.createdAt);
    if (!buckets.has(k)) buckets.set(k, { period: k, retail: 0, estCost: 0, finCost: 0, estMargin: 0, actMargin: 0, expComm: 0, paidComm: 0, collected: 0, orderCount: 0 });
    const b = buckets.get(k)!;
    const m = orderMetrics(o, ws);
    b.retail += m.retail;
    b.estCost += m.estCost;
    b.finCost += m.finCost;
    b.estMargin += m.estMargin;
    b.actMargin += m.actMargin;
    b.expComm += m.expComm;
    b.paidComm += m.paidComm;
    b.collected += m.collected;
    b.orderCount += 1;
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

// =====================================================================
// CSV export helper
// =====================================================================
export function toCsv(rows: any[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}
