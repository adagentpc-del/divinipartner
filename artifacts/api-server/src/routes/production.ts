import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  assetsTable,
  assetLinksTable,
  ordersTable,
  orderItemsTable,
  partnersTable,
  eventsTable,
  productCatalogTable,
  suppliersTable,
  venuesTable,
  resolvePreference,
  formatWxH,
  formatWxHDual,
  formatPrimarySecondary,
  computePrice,
  PRICING_UNIT_LABELS,
  type UnitSystem,
  type PricingModel,
  type PricingUnit,
} from "@workspace/db";
import { fire } from "../services/workflowEngine";

const router: IRouter = Router();

// Heuristic: when does a line item need artwork / proof?
function expectations(item: any, product: any): { needsArtwork: boolean; needsProof: boolean } {
  const mode = (item.fulfillmentMode || product?.defaultFulfillmentMode || "").toLowerCase();
  const cap = (product?.capabilitiesJson || {}) as any;
  const printable = mode === "graphic_only" || mode === "rental_plus_print" || mode === "full" || cap?.printable === true || item.brandingZoneId != null;
  const hardwareOnly = item.itemType === "hardware" || mode === "hardware_only";
  return {
    needsArtwork: printable && !hardwareOnly,
    needsProof: !!cap?.proofRequired,
  };
}

async function readinessForOrder(orderId: number) {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  if (!items.length) return { orderId, items: [], summary: { total: 0, ready: 0, blocked: 0, missingArtwork: 0, missingProof: 0, awaitingApproval: 0 } };
  const itemIds = items.map(i => i.id);
  const links = await db.select().from(assetLinksTable).where(inArray(assetLinksTable.orderItemId, itemIds));
  const assetIds = [...new Set(links.map(l => l.assetId))];
  const assets = assetIds.length ? await db.select().from(assetsTable).where(inArray(assetsTable.id, assetIds)) : [];
  const aById = new Map(assets.map(a => [a.id, a]));
  const productIds = [...new Set(items.map(i => i.productId).filter((x): x is number => !!x))];
  const products = productIds.length ? await db.select().from(productCatalogTable).where(inArray(productCatalogTable.id, productIds)) : [];
  const pById = new Map(products.map(p => [p.id, p]));

  const linksByItem = new Map<number, any[]>();
  for (const l of links) {
    const arr = linksByItem.get(l.orderItemId) || [];
    const a = aById.get(l.assetId);
    if (a) arr.push({ ...l, asset: a });
    linksByItem.set(l.orderItemId, arr);
  }

  let ready = 0, blocked = 0, missingArtwork = 0, missingProof = 0, awaitingApproval = 0;
  const itemRows = items.map(it => {
    const exp = expectations(it, pById.get(it.productId || -1));
    const ils = linksByItem.get(it.id) || [];
    const currentArtwork = ils.find(l => l.role === "primary_artwork" && l.asset.isCurrent);
    const approvedArtwork = ils.find(l => l.role === "primary_artwork" && l.asset.isCurrent && l.asset.approvalStatus === "approved");
    const currentProof = ils.find(l => l.role === "proof" && l.asset.isCurrent);
    const approvedProof = ils.find(l => l.role === "proof" && l.asset.isCurrent && l.asset.approvalStatus === "approved");

    const flags: string[] = [];
    if (exp.needsArtwork && !currentArtwork) { flags.push("artwork_missing"); missingArtwork++; }
    else if (exp.needsArtwork && !approvedArtwork) { flags.push("artwork_awaiting_approval"); awaitingApproval++; }
    if (exp.needsProof && !currentProof) { flags.push("proof_missing"); missingProof++; }
    else if (exp.needsProof && !approvedProof) { flags.push("proof_awaiting_approval"); awaitingApproval++; }
    if (it.exceptionFlag) flags.push("exception");
    if (it.productionBlockedReason) flags.push("blocked");

    const itemReady = (!exp.needsArtwork || !!approvedArtwork) && (!exp.needsProof || !!approvedProof) && !it.productionBlockedReason;
    if (itemReady) ready++;
    if (it.productionBlockedReason || flags.includes("artwork_missing") || flags.includes("proof_missing")) blocked++;

    return {
      itemId: it.id,
      name: it.name,
      itemType: it.itemType,
      quantity: it.quantity,
      productId: it.productId,
      brandingZoneId: it.brandingZoneId,
      assignedSupplierId: it.assignedSupplierId,
      supplierStatus: it.supplierStatus,
      fulfillmentMode: it.fulfillmentMode,
      expectations: exp,
      assets: ils.map(l => ({ linkId: l.id, role: l.role, asset: l.asset })),
      currentArtworkAssetId: currentArtwork?.asset?.id || null,
      approvedArtworkAssetId: approvedArtwork?.asset?.id || null,
      flags,
      productionReady: itemReady,
      productionBlockedReason: it.productionBlockedReason || null,
    };
  });

  return {
    orderId,
    items: itemRows,
    summary: { total: items.length, ready, blocked, missingArtwork, missingProof, awaitingApproval },
  };
}

router.get("/orders/:id/readiness", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  res.json(await readinessForOrder(id));
});

// Mark/clear blocked reason on a line item
router.patch("/order-items/:id/production-block", async (req, res) => {
  const id = parseInt(req.params.id);
  const reason: string | null = req.body?.reason ?? null;
  const overrideNote: string | null = req.body?.overrideNote ?? null;
  const result = await db.transaction(async (tx) => {
    const [prev] = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.id, id));
    if (!prev) return { notFound: true } as any;
    const [row] = await tx.update(orderItemsTable).set({ productionBlockedReason: reason } as any).where(eq(orderItemsTable.id, id)).returning();
    if (!reason && prev.productionBlockedReason && overrideNote) {
      const { logAudit } = await import("../services/workflowEngine");
      await logAudit({ eventType: "override_applied", summary: `Cleared production block on order item #${id}`, details: { previousReason: prev.productionBlockedReason }, isAutomated: false, objectType: "order_item", objectId: id, overrideNote }, tx as any);
    }
    return { row, prev };
  });
  if ((result as any).notFound) return res.status(404).json({ error: "Not found" });
  const { row, prev } = result as any;
  const ord = (await db.select().from(ordersTable).where(eq(ordersTable.id, row.orderId)))[0];
  if (reason && reason !== prev.productionBlockedReason) {
    fire("production.blocked", { objectType: "order_item", objectId: id, orderItemId: id, orderId: row.orderId, supplierId: row.assignedSupplierId ?? null, orderNumber: ord?.orderNumber, blockedReason: reason }).catch(() => {});
  } else if (!reason && prev.productionBlockedReason) {
    fire("production.unblocked", { objectType: "order_item", objectId: id, orderItemId: id, orderId: row.orderId, orderNumber: ord?.orderNumber, overrideNote }).catch(() => {});
  }
  res.json(row);
});

// ===== Production review dashboard =====
router.get("/production/dashboard", async (_req, res) => {
  const allAssets = await db.select().from(assetsTable);
  const counters = {
    awaitingReview: allAssets.filter(a => a.isCurrent && a.status === "uploaded").length,
    awaitingApproval: allAssets.filter(a => a.isCurrent && (a.status === "under_review" || a.approvalStatus === "pending") && a.status !== "vendor_released" && a.status !== "approved").length,
    approved: allAssets.filter(a => a.isCurrent && a.approvalStatus === "approved").length,
    vendorReleased: allAssets.filter(a => a.isCurrent && a.status === "vendor_released").length,
    revisionRequested: allAssets.filter(a => a.isCurrent && a.status === "revision_requested").length,
    superseded: allAssets.filter(a => a.status === "superseded").length,
  };
  // Latest uploads
  const latest = [...allAssets].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 10);
  // By event / supplier
  const byEvent: Record<string, number> = {};
  const bySupplier: Record<string, number> = {};
  for (const a of allAssets) {
    if (a.eventId) byEvent[a.eventId] = (byEvent[a.eventId] || 0) + 1;
    if (a.supplierId) bySupplier[a.supplierId] = (bySupplier[a.supplierId] || 0) + 1;
  }
  // Orders with asset issues
  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(200);
  const orderIssues: any[] = [];
  for (const o of orders.slice(0, 50)) {
    const r = await readinessForOrder(o.id);
    if (r.summary.blocked > 0 || r.summary.missingArtwork > 0 || r.summary.awaitingApproval > 0) {
      orderIssues.push({ orderId: o.id, orderNumber: o.orderNumber, partnerId: o.partnerId, ...r.summary });
    }
  }
  res.json({ counters, latest, byEvent, bySupplier, orderIssues });
});

// ===== Supplier packet (production handoff) =====
router.get("/orders/:orderId/supplier-packet/:supplierId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const supplierId = parseInt(req.params.supplierId);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId));
  const event = order.eventId ? (await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)))[0] : null;
  const venue = event?.venueId ? (await db.select().from(venuesTable).where(eq(venuesTable.id, event.venueId)))[0] : null;
  const resolved = resolvePreference({
    event: event ? { unitPreference: (event as any).unitPreference } : null,
    venue: venue ? { unitPreference: (venue as any).unitPreference, country: (venue as any).country } : null,
    partner: partner ? { unitPreference: (partner as any).unitPreference } : null,
    account: null,
  });
  const preferredSystem: UnitSystem = resolved.system;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });

  const items = await db.select().from(orderItemsTable).where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.assignedSupplierId, supplierId)));
  const itemIds = items.map(i => i.id);
  const links = itemIds.length ? await db.select().from(assetLinksTable).where(inArray(assetLinksTable.orderItemId, itemIds)) : [];
  const assetIds = [...new Set(links.map(l => l.assetId))];
  const allAssets = assetIds.length ? await db.select().from(assetsTable).where(inArray(assetsTable.id, assetIds)) : [];
  // Vendor sees only current, approved, vendor-visible assets — never status-only shortcut
  const visibleAssets = allAssets.filter(a => a.isCurrent && a.visibility === "vendor_visible" && a.approvalStatus === "approved");
  const aById = new Map(visibleAssets.map(a => [a.id, a]));

  const productIds = [...new Set(items.map(i => i.productId).filter((x): x is number => !!x))];
  const products = productIds.length ? await db.select().from(productCatalogTable).where(inArray(productCatalogTable.id, productIds)) : [];
  const pById = new Map(products.map(p => [p.id, p]));

  const linksByItem = new Map<number, any[]>();
  for (const l of links) {
    const arr = linksByItem.get(l.orderItemId) || [];
    const a = aById.get(l.assetId);
    arr.push({ ...l, asset: a || null, hidden: !a });
    linksByItem.set(l.orderItemId, arr);
  }

  const packetItems = items.map(it => {
    const exp = expectations(it, pById.get(it.productId || -1));
    const ils = (linksByItem.get(it.id) || []).filter(l => l.asset);
    const approvedArtwork = ils.find(l => l.role === "primary_artwork" && l.asset.approvalStatus === "approved");
    const flags: string[] = [];
    if (exp.needsArtwork && !approvedArtwork) flags.push("missing_approved_artwork");
    if (it.productionBlockedReason) flags.push("blocked");
    const prod = pById.get(it.productId || -1);
    const dimDisplay = prod && (prod.sizeWidth || prod.sizeHeight)
      ? formatWxH(prod.sizeWidth, prod.sizeHeight, prod.sizeUnit, preferredSystem)
      : null;
    // Build a structured spec block: each dim is rendered as primary (in its
    // native unit) plus an optional secondary in the resolved preferred system.
    const aUnit = prod?.artworkUnit || prod?.sizeUnit || null;
    const finished = prod && (prod.sizeWidth || prod.sizeHeight)
      ? formatWxHDual(prod.sizeWidth, prod.sizeHeight, prod.sizeUnit, preferredSystem) : null;
    const artwork = prod && (prod.artworkWidth || prod.artworkHeight)
      ? formatWxHDual(prod.artworkWidth, prod.artworkHeight, aUnit, preferredSystem) : null;
    const visible = prod && (prod.visibleWidth || prod.visibleHeight)
      ? formatWxHDual(prod.visibleWidth, prod.visibleHeight, aUnit, preferredSystem) : null;
    const bleed = prod && prod.bleed != null
      ? formatPrimarySecondary(prod.bleed, aUnit, preferredSystem) : null;
    const safeArea = prod && prod.safeArea != null
      ? formatPrimarySecondary(prod.safeArea, aUnit, preferredSystem) : null;
    const specs = (finished || artwork || visible || bleed || safeArea) ? {
      finished, artwork, visible, bleed, safeArea,
    } : null;

    // Pricing basis: prefer the snapshot persisted on the order item; if absent
    // and the product carries a pricing model, recompute from the item's
    // entered or product-native dimensions for display in the supplier packet.
    let pricingBasis: any = null;
    if ((it as any).pricingModel || (it as any).billableAreaSqm != null || (it as any).billableLinearM != null) {
      pricingBasis = {
        pricingModel: (it as any).pricingModel,
        pricingUnit: (it as any).pricingUnit,
        unitRate: prod?.unitRate ?? null,
        billableAreaSqm: (it as any).billableAreaSqm,
        billableLinearM: (it as any).billableLinearM,
        unitPrice: it.unitPrice,
        minBillableSize: prod?.minBillableSize ?? null,
        minCharge: prod?.minCharge ?? null,
        calculation: (it as any).calculationBasis,
        pricingUnitLabel: (it as any).pricingUnit ? PRICING_UNIT_LABELS[(it as any).pricingUnit as PricingUnit] : null,
      };
    } else if (prod?.pricingModel) {
      const r = computePrice({
        pricingModel: prod.pricingModel as PricingModel,
        unitRate: prod.unitRate,
        pricingUnit: prod.pricingUnit as PricingUnit | null,
        widthMm: (it as any).enteredWidthMm ?? prod.sizeWidthMm ?? null,
        heightMm: (it as any).enteredHeightMm ?? prod.sizeHeightMm ?? null,
        quantity: it.quantity,
        minBillableSize: prod.minBillableSize,
        minCharge: prod.minCharge,
      });
      pricingBasis = {
        pricingModel: r.pricingModel,
        pricingUnit: r.pricingUnit,
        unitRate: prod.unitRate,
        billableAreaSqm: r.billableAreaSqm,
        billableLinearM: r.billableLinearM,
        unitPrice: r.unitPrice,
        minBillableSize: prod.minBillableSize,
        minCharge: prod.minCharge,
        calculation: r.basis,
        pricingUnitLabel: r.pricingUnit ? PRICING_UNIT_LABELS[r.pricingUnit] : null,
        requiresQuote: r.requiresQuote,
      };
    }

    return {
      itemId: it.id,
      name: it.name,
      productId: it.productId,
      productName: prod?.name || null,
      dimensionDisplay: dimDisplay,
      specs,
      pricingBasis,
      quantity: it.quantity,
      fulfillmentMode: it.fulfillmentMode,
      supplierStatus: it.supplierStatus,
      supplierDueDate: it.supplierDueDate,
      supplierShipDate: it.supplierShipDate,
      supplierInstallDate: it.supplierInstallDate,
      internalFulfillmentNotes: it.internalFulfillmentNotes,
      productionBlockedReason: it.productionBlockedReason,
      assets: ils,
      flags,
      ready: flags.length === 0,
    };
  });

  // Order-level: only current + approved + vendor_visible
  const orderLevelAssets = (await db.select().from(assetsTable).where(and(eq(assetsTable.orderId, orderId), eq(assetsTable.isCurrent, true))))
    .filter(a => a.visibility === "vendor_visible" && a.approvalStatus === "approved");

  res.json({
    order: { id: order.id, orderNumber: order.orderNumber, status: order.status, dueDate: order.dueDate, internalNotes: order.internalNotes, vendorNotes: order.vendorNotes },
    partner: partner ? { id: partner.id, companyName: partner.companyName } : null,
    event: event ? { id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, venueId: event.venueId } : null,
    supplier: { id: supplier.id, name: supplier.name },
    items: packetItems,
    measurementContext: {
      system: preferredSystem,
      primarySystem: preferredSystem,
      secondarySystem: preferredSystem === "metric" ? "imperial" : "metric",
      source: resolved.source,
      reason: resolved.reason,
    },
    orderLevelAssets,
    summary: {
      totalItems: packetItems.length,
      ready: packetItems.filter(i => i.ready).length,
      blocked: packetItems.filter(i => !i.ready).length,
    },
  });
});

export { router as productionRouter };
