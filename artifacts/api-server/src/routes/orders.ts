import { Router, type IRouter } from "express";
import { eq, and, sql, desc, inArray, type SQL } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, partnersTable, eventsTable, packagesTable, suppliersTable, venuesTable, productCatalogTable, partnerBrandingLocationsTable, citiesTable, inventoryTable, inventoryReservationsTable, supplierAssignmentHistoryTable, supplierStatusEventsTable, quoteAssetsTable, usageEvents, partnerContactsTable, withMmColumns, withWeightColumns } from "@workspace/db";
import { z } from "zod";
import {
  ListOrdersResponse,
  GetOrderResponse,
  UpdateOrderResponse,
  DeleteOrderResponse,
  AssignOrderItemSupplierResponse,
  BulkAssignOrderItemSupplierResponse,
  UpdateOrderItemStatusResponse,
  SetOrderItemExceptionResponse,
  UpdateOrderItemDatesResponse,
  GetOrderItemHistoryResponse,
  GetOrderItemSupplierRecommendationsResponse,
  GetFulfillmentCommandCenterResponse,
  ListVendorOrdersResponse,
  GetVendorOrderPacketResponse,
  GetOrderIntakeAnalysisResponse,
  GetOrderEmailEventsResponse,
  SetOrderExceptionResponse,
  SetOrderArtworkNeededResponse,
  ListVendorItemsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const FULFILLMENT_MODES = [
  "full",
  "graphic_only",
  "use_existing_partner_inventory",
  "rental_plus_print",
  "new_hardware_required",
  // legacy
  "client_owned_plus_print",
] as const;

const AddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const SUPPLIER_STATUSES = [
  "unassigned", "assigned", "acknowledged", "in_production", "awaiting_assets",
  "awaiting_approval", "shipped", "delivered", "installed", "completed",
  "issue_flagged", "cancelled",
] as const;

const ASSIGNMENT_SOURCES = ["product", "package", "zone", "order", "manual", "none"] as const;

const VENDOR_ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  unassigned: [],
  assigned: ["acknowledged", "issue_flagged"],
  acknowledged: ["in_production", "awaiting_assets", "awaiting_approval", "issue_flagged"],
  in_production: ["awaiting_assets", "awaiting_approval", "shipped", "issue_flagged"],
  awaiting_assets: ["in_production", "issue_flagged"],
  awaiting_approval: ["in_production", "shipped", "issue_flagged"],
  shipped: ["delivered", "issue_flagged"],
  delivered: ["installed", "completed", "issue_flagged"],
  installed: ["completed", "issue_flagged"],
  issue_flagged: ["acknowledged", "in_production", "shipped"],
  completed: [],
  cancelled: [],
};

const OrderItemBody = z.object({
  itemType: z.enum(["product", "package", "package_addon", "branding_zone"]),
  productId: z.number().int().nullable().optional(),
  packageId: z.number().int().nullable().optional(),
  brandingZoneId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  fulfillmentMode: z.enum(FULFILLMENT_MODES).nullable().optional(),
  inventorySourceCityId: z.number().int().nullable().optional(),
  inventorySourceInventoryId: z.number().int().nullable().optional(),
  internalFulfillmentNotes: z.string().nullable().optional(),
  assignedSupplierId: z.number().int().nullable().optional(),
  supplierAssignmentSource: z.enum(ASSIGNMENT_SOURCES).nullable().optional(),
  supplierStatus: z.enum(SUPPLIER_STATUSES).optional(),
  supplierDueDate: z.string().nullable().optional(),
  supplierShipDate: z.string().nullable().optional(),
  supplierDeliveryDate: z.string().nullable().optional(),
  supplierInstallDate: z.string().nullable().optional(),
  supplierReference: z.string().nullable().optional(),
  supplierNotes: z.string().nullable().optional(),
  exceptionFlag: z.boolean().optional(),
  exceptionReason: z.string().nullable().optional(),
  exceptionNotes: z.string().nullable().optional(),
  artworkFileUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  // Per-line packed/shipping (April 2026 logistics extension).
  packedWidth: z.number().nullable().optional(),
  packedHeight: z.number().nullable().optional(),
  packedDepth: z.number().nullable().optional(),
  packedSizeUnit: z.string().nullable().optional(),
  shippingWeight: z.number().nullable().optional(),
  shippingWeightUnit: z.string().nullable().optional(),
  cartonCount: z.number().int().nullable().optional(),
  packingMode: z.enum(["rolled", "flat", "boxed", "crated"]).nullable().optional(),
  crateRequired: z.boolean().optional(),
  palletRequired: z.boolean().optional(),
  oversizeFlag: z.boolean().optional(),
  freightClass: z.string().nullable().optional(),
  installKitNotes: z.string().nullable().optional(),
});

type ResolveCtx = {
  productSuppliers: Map<number, number | null>;
  zoneSuppliers: Map<number, number | null>;
  orderSupplierId: number | null;
};

async function loadResolveContext(tx: any, items: Array<{ productId?: number | null; brandingZoneId?: number | null }>, orderSupplierId: number | null): Promise<ResolveCtx> {
  const productIds = Array.from(new Set(items.map(i => i.productId).filter((x): x is number => !!x)));
  const zoneIds = Array.from(new Set(items.map(i => i.brandingZoneId).filter((x): x is number => !!x)));
  const productSuppliers = new Map<number, number | null>();
  const zoneSuppliers = new Map<number, number | null>();
  if (productIds.length) {
    const rows = await tx.select({ id: productCatalogTable.id, supplierId: productCatalogTable.supplierId }).from(productCatalogTable).where(inArray(productCatalogTable.id, productIds));
    for (const r of rows) productSuppliers.set(r.id, r.supplierId ?? null);
  }
  if (zoneIds.length) {
    const rows = await tx.select({ id: partnerBrandingLocationsTable.id, supplierId: partnerBrandingLocationsTable.defaultSupplierId }).from(partnerBrandingLocationsTable).where(inArray(partnerBrandingLocationsTable.id, zoneIds));
    for (const r of rows) zoneSuppliers.set(r.id, r.supplierId ?? null);
  }
  return { productSuppliers, zoneSuppliers, orderSupplierId };
}

function resolveDefaultSupplier(item: { productId?: number | null; brandingZoneId?: number | null }, ctx: ResolveCtx): { supplierId: number | null; source: typeof ASSIGNMENT_SOURCES[number] } {
  if (item.productId) {
    const s = ctx.productSuppliers.get(item.productId);
    if (s) return { supplierId: s, source: "product" };
  }
  if (item.brandingZoneId) {
    const s = ctx.zoneSuppliers.get(item.brandingZoneId);
    if (s) return { supplierId: s, source: "zone" };
  }
  if (ctx.orderSupplierId) return { supplierId: ctx.orderSupplierId, source: "order" };
  return { supplierId: null, source: "none" };
}

const toDateOrNull = (v: any) => v ? new Date(v) : null;

const OrderBody = z.object({
  // Currency/tax overrides — admin may set these on PATCH; on POST they are usually
  // resolved from partner/event by resolveOrderBilling but are accepted here for
  // explicit overrides (e.g. import flows or admin one-offs).
  currency: z.string().optional().nullable(),
  taxMode: z.string().optional().nullable(),
  taxLabel: z.string().optional().nullable(),
  taxRate: z.union([z.string(), z.number()]).optional().nullable().transform(v => v == null || v === "" ? null : String(v)),
  taxInclusive: z.boolean().optional(),
  partnerId: z.number().int(),
  eventId: z.number().int().nullable().optional(),
  packageId: z.number().int().nullable().optional(),
  portalType: z.enum(["ordering", "branding", "intake"]).optional(),
  shippingVenueId: z.number().int().nullable().optional(),
  assignedSupplierId: z.number().int().nullable().optional(),
  fulfillmentMode: z.enum(FULFILLMENT_MODES).nullable().optional(),
  status: z.enum(["new", "approved", "in_production", "shipped", "delivered", "completed", "cancelled"]).optional(),
  paymentStatus: z.enum(["not_charged", "invoiced", "paid", "refunded"]).optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  shippingAddressJson: AddressSchema.nullable().optional(),
  billingAddressJson: AddressSchema.nullable().optional(),
  artworkFilesJson: z.array(z.object({ url: z.string(), name: z.string().optional(), size: z.number().optional(), type: z.string().optional() })).nullable().optional(),
  totalEstimate: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  vendorNotes: z.string().nullable().optional(),
  fulfillmentStatus: z.string().nullable().optional(),
  // Logistics summary (April 2026 logistics extension).
  shipDateTarget: z.union([z.string(), z.date()]).nullable().optional().transform((v) => v == null ? v : (v instanceof Date ? v : new Date(v))),
  deliveryByDate: z.union([z.string(), z.date()]).nullable().optional().transform((v) => v == null ? v : (v instanceof Date ? v : new Date(v))),
  packageCount: z.number().int().nullable().optional(),
  totalShipmentWeight: z.number().nullable().optional(),
  totalShipmentWeightUnit: z.string().nullable().optional(),
  measurementSystem: z.enum(["imperial", "metric"]).nullable().optional(),
  oversizeFlag: z.boolean().optional(),
  crateRequired: z.boolean().optional(),
  palletRequired: z.boolean().optional(),
  shippingContactJson: z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }).nullable().optional(),
  receivingContactJson: z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }).nullable().optional(),
  customsNotes: z.string().nullable().optional(),
  internationalShippingNotes: z.string().nullable().optional(),
  logisticsNotes: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  items: z.array(OrderItemBody).optional(),
});

// Helpers for shipping date columns (timestamps).
const _toShipDateOrNull = (v: any) => (v == null || v === "" ? null : new Date(v));
function normalizeOrderLogistics<T extends Record<string, any>>(data: T, existing?: Partial<{ totalShipmentWeightUnit: string | null }>): T {
  const out: any = { ...data };
  if ("shipDateTarget" in out) out.shipDateTarget = _toShipDateOrNull(out.shipDateTarget);
  if ("deliveryByDate" in out) out.deliveryByDate = _toShipDateOrNull(out.deliveryByDate);
  return withWeightColumns(out as any, existing as any) as T;
}
function normalizeItemLogistics<T extends Record<string, any>>(data: T, existing?: Partial<{ packedSizeUnit: string | null; shippingWeightUnit: string | null }>): T {
  return withWeightColumns(withMmColumns(data as any, existing as any), existing as any) as T;
}

function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PCP-${ts}-${rand}`;
}

type ProductCaps = { hardwareIncluded: boolean; usePartnerInventoryEligible: boolean; reusableHardwareCompatible: boolean; inventoryTracked: boolean };

function computeFulfillmentMath(mode: string | null | undefined, quantity: number, caps: ProductCaps | null) {
  const qty = quantity || 0;
  let printDemand = 0;
  let hardwareDemand = 0;
  let hardwareRequired = false;
  switch (mode) {
    case "graphic_only":
      printDemand = qty; break;
    case "use_existing_partner_inventory":
      printDemand = qty; hardwareRequired = !!caps?.hardwareIncluded; break;
    case "rental_plus_print":
      printDemand = qty; hardwareDemand = qty; hardwareRequired = true; break;
    case "new_hardware_required":
      hardwareDemand = qty; printDemand = caps?.hardwareIncluded ? qty : 0; hardwareRequired = true; break;
    case "full":
    case "client_owned_plus_print":
    default:
      printDemand = caps?.hardwareIncluded || mode === "full" ? qty : qty;
      hardwareDemand = mode === "full" ? qty : 0;
      hardwareRequired = !!caps?.hardwareIncluded;
  }
  return { printDemand, hardwareDemand, hardwareRequired };
}

async function loadProductCaps(tx: typeof db, productIds: number[]): Promise<Map<number, ProductCaps>> {
  const m = new Map<number, ProductCaps>();
  if (!productIds.length) return m;
  const rows = await tx.select({
    id: productCatalogTable.id,
    hardwareIncluded: productCatalogTable.hardwareIncluded,
    usePartnerInventoryEligible: productCatalogTable.usePartnerInventoryEligible,
    reusableHardwareCompatible: productCatalogTable.reusableHardwareCompatible,
    inventoryTracked: productCatalogTable.inventoryTracked,
  }).from(productCatalogTable).where(inArray(productCatalogTable.id, productIds));
  for (const r of rows) m.set(r.id, r as any);
  return m;
}

type ProductPackingDefaults = {
  packedWidth: number | null; packedHeight: number | null; packedDepth: number | null; packedSizeUnit: string | null;
  shippingWeight: number | null; shippingWeightUnit: string | null; cartonCount: number | null;
  packingMode: string | null; crateRequired: boolean; palletRequired: boolean; oversizeFlag: boolean;
  freightClass: string | null; installKitNotes: string | null;
};
async function loadProductPackingDefaults(tx: any, productIds: number[]): Promise<Map<number, ProductPackingDefaults>> {
  const m = new Map<number, ProductPackingDefaults>();
  if (!productIds.length) return m;
  const rows = await tx.select({
    id: productCatalogTable.id,
    packedWidth: productCatalogTable.packedWidth, packedHeight: productCatalogTable.packedHeight, packedDepth: productCatalogTable.packedDepth, packedSizeUnit: productCatalogTable.packedSizeUnit,
    shippingWeight: productCatalogTable.shippingWeight, shippingWeightUnit: productCatalogTable.shippingWeightUnit, cartonCount: productCatalogTable.cartonCount,
    packingMode: productCatalogTable.packingMode, crateRequired: productCatalogTable.crateRequired, palletRequired: productCatalogTable.palletRequired, oversizeFlag: productCatalogTable.oversizeFlag,
    freightClass: productCatalogTable.freightClass, installKitNotes: productCatalogTable.installKitNotes,
  }).from(productCatalogTable).where(inArray(productCatalogTable.id, productIds));
  for (const r of rows) m.set(r.id, r as any);
  return m;
}

// Merge per-line override (from request) on top of product defaults, then normalize to mm/g.
function buildItemLogisticsValues(it: z.infer<typeof OrderItemBody>, def: ProductPackingDefaults | null) {
  const pick = <K extends keyof ProductPackingDefaults>(k: K) => (it as any)[k] !== undefined ? (it as any)[k] : (def ? def[k] : null);
  const raw = {
    packedWidth: pick("packedWidth"), packedHeight: pick("packedHeight"), packedDepth: pick("packedDepth"),
    packedSizeUnit: pick("packedSizeUnit"),
    shippingWeight: pick("shippingWeight"), shippingWeightUnit: pick("shippingWeightUnit"),
    cartonCount: pick("cartonCount"), packingMode: pick("packingMode"),
    crateRequired: pick("crateRequired") ?? false, palletRequired: pick("palletRequired") ?? false, oversizeFlag: pick("oversizeFlag") ?? false,
    freightClass: pick("freightClass"), installKitNotes: pick("installKitNotes"),
  };
  return normalizeItemLogistics(raw);
}

// Reserve inventory for an item. Locks inventory row, creates reservation, returns ids+shortage.
//
// Section 27: now date-aware. If we have an event date window we ONLY count
// reservations and blackouts whose [startDate,endDate] overlaps that window
// against the row's capacity. Reservations with NULL dates are still counted
// (legacy / non-date-aware path) via the rolling inventory.reserved counter.
async function reserveForItem(tx: any, inventoryId: number, eventId: number | null, requestedQty: number, expectedPartnerId?: number | null) {
  const lockRows: any = await tx.execute(sql`SELECT id, total_quantity, reserved, in_use, damaged, retired, partner_id FROM inventory WHERE id = ${inventoryId} FOR UPDATE`);
  if (expectedPartnerId != null && lockRows.rows?.[0] && lockRows.rows[0].partner_id != null && Number(lockRows.rows[0].partner_id) !== expectedPartnerId) {
    throw new Error(`Inventory ${inventoryId} does not belong to partner ${expectedPartnerId}`);
  }
  const inv = lockRows.rows?.[0];
  if (!inv) return { reservationId: null, reservedQty: 0, shortageQty: requestedQty, error: "inventory_not_found" as const };
  if (!eventId) return { reservationId: null, reservedQty: 0, shortageQty: requestedQty, error: "no_event" as const };

  // Look up the event window so we can both stamp the reservation and scope
  // the conflict check.
  const evRows: any = await tx.execute(sql`SELECT install_date, teardown_date, event_date FROM events WHERE id = ${eventId}`);
  const ev = evRows.rows?.[0];
  const startDate: string | null = ev?.install_date ?? ev?.event_date ?? null;
  const endDate: string | null = ev?.teardown_date ?? ev?.event_date ?? startDate;

  const total = Number(inv.total_quantity) || 0;
  const inUse = Number(inv.in_use) || 0;
  const damaged = Number(inv.damaged) || 0;
  const retired = Number(inv.retired) || 0;

  let reservedInWindow = 0;
  let blackedOutInWindow = 0;
  if (startDate && endDate) {
    const r1: any = await tx.execute(sql`
      SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory_reservations
      WHERE inventory_id = ${inventoryId} AND status = 'active'
        AND start_date IS NOT NULL AND end_date IS NOT NULL
        AND start_date <= ${endDate}::date AND end_date >= ${startDate}::date`);
    reservedInWindow = Number(r1.rows?.[0]?.qty) || 0;
    const r2: any = await tx.execute(sql`
      SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory_blackouts
      WHERE inventory_id = ${inventoryId}
        AND start_date <= ${endDate}::date AND end_date >= ${startDate}::date`);
    blackedOutInWindow = Number(r2.rows?.[0]?.qty) || 0;
  }
  // Legacy NULL-date reservations are computed strictly from rows so that two
  // non-overlapping date windows see independent capacity. The rolling
  // inventory.reserved counter is kept up-to-date for backward-compat with
  // older code paths but is intentionally NOT used here.
  const legacyRows: any = await tx.execute(sql`
    SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory_reservations
    WHERE inventory_id = ${inventoryId} AND status = 'active'
      AND start_date IS NULL AND end_date IS NULL`);
  const legacyReserved = Number(legacyRows.rows?.[0]?.qty) || 0;
  const used = inUse + damaged + retired + reservedInWindow + blackedOutInWindow + legacyReserved;
  const available = Math.max(0, total - used);
  const reserveNow = Math.min(available, requestedQty);
  const shortage = Math.max(0, requestedQty - reserveNow);
  let reservationId: number | null = null;
  if (reserveNow > 0) {
    const [r] = await tx.insert(inventoryReservationsTable).values({
      inventoryId, eventId, quantity: reserveNow, status: "active",
      startDate: startDate || undefined, endDate: endDate || undefined,
      holdReason: "event",
      notes: "Auto-reserved by order item",
    }).returning();
    await tx.update(inventoryTable).set({ reserved: sql`${inventoryTable.reserved} + ${reserveNow}` }).where(eq(inventoryTable.id, inventoryId));
    reservationId = r.id;
  }
  return { reservationId, reservedQty: reserveNow, shortageQty: shortage, error: null as null };
}

async function releaseReservation(tx: any, reservationId: number) {
  const lockRows: any = await tx.execute(sql`SELECT inventory_id, quantity, status FROM inventory_reservations WHERE id = ${reservationId} FOR UPDATE`);
  const r = lockRows.rows?.[0];
  if (!r) return;
  if (r.status === "active") {
    await tx.update(inventoryTable).set({ reserved: sql`GREATEST(0, ${inventoryTable.reserved} - ${r.quantity})` }).where(eq(inventoryTable.id, r.inventory_id));
  } else if (r.status === "fulfilled") {
    await tx.update(inventoryTable).set({ inUse: sql`GREATEST(0, ${inventoryTable.inUse} - ${r.quantity})` }).where(eq(inventoryTable.id, r.inventory_id));
  }
  await tx.delete(inventoryReservationsTable).where(eq(inventoryReservationsTable.id, reservationId));
}

const router: IRouter = Router();

router.get("/orders", async (req, res) => {
  const conditions = [];
  if (req.query.partnerId) conditions.push(eq(ordersTable.partnerId, parseInt(String(req.query.partnerId))));
  if (req.query.eventId) conditions.push(eq(ordersTable.eventId, parseInt(String(req.query.eventId))));
  if (req.query.supplierId) conditions.push(eq(ordersTable.assignedSupplierId, parseInt(String(req.query.supplierId))));
  if (req.query.status) conditions.push(eq(ordersTable.status, String(req.query.status)));
  if (req.query.portalType) conditions.push(eq(ordersTable.portalType, String(req.query.portalType)));
  if (req.query.fulfillmentMode) {
    const m = String(req.query.fulfillmentMode);
    conditions.push(sql`(${ordersTable.fulfillmentMode} = ${m} OR EXISTS (SELECT 1 FROM order_items WHERE order_id = ${ordersTable.id} AND fulfillment_mode = ${m}))`);
  }

  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    partnerId: ordersTable.partnerId,
    partnerName: partnersTable.companyName,
    eventId: ordersTable.eventId,
    eventName: eventsTable.name,
    packageId: ordersTable.packageId,
    packageName: packagesTable.name,
    portalType: ordersTable.portalType,
    shippingVenueId: ordersTable.shippingVenueId,
    venueName: venuesTable.name,
    assignedSupplierId: ordersTable.assignedSupplierId,
    supplierName: suppliersTable.name,
    fulfillmentMode: ordersTable.fulfillmentMode,
    status: ordersTable.status,
    paymentStatus: ordersTable.paymentStatus,
    fulfillmentStatus: ordersTable.fulfillmentStatus,
    exceptionState: ordersTable.exceptionState,
    exceptionType: ordersTable.exceptionType,
    artworkNeededFlag: ordersTable.artworkNeededFlag,
    contactName: ordersTable.contactName,
    contactEmail: ordersTable.contactEmail,
    companyName: ordersTable.companyName,
    totalEstimate: ordersTable.totalEstimate,
    subtotal: ordersTable.subtotal,
    taxAmount: ordersTable.taxAmount,
    currency: ordersTable.currency,
    currencySource: ordersTable.currencySource,
    taxMode: ordersTable.taxMode,
    taxModeSource: ordersTable.taxModeSource,
    taxLabel: ordersTable.taxLabel,
    taxRate: ordersTable.taxRate,
    taxInclusive: ordersTable.taxInclusive,
    createdAt: ordersTable.createdAt,
    totalShortage: sql<number>`COALESCE((SELECT SUM(shortage_quantity) FROM order_items WHERE order_id = ${ordersTable.id}), 0)`,
    totalReserved: sql<number>`COALESCE((SELECT SUM(reserved_quantity) FROM order_items WHERE order_id = ${ordersTable.id}), 0)`,
    itemFulfillmentModes: sql<string[]>`COALESCE((SELECT ARRAY_AGG(DISTINCT fulfillment_mode) FILTER (WHERE fulfillment_mode IS NOT NULL) FROM order_items WHERE order_id = ${ordersTable.id}), ARRAY[]::text[])`,
  }).from(ordersTable)
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(packagesTable, eq(ordersTable.packageId, packagesTable.id))
    .leftJoin(venuesTable, eq(ordersTable.shippingVenueId, venuesTable.id))
    .leftJoin(suppliersTable, eq(ordersTable.assignedSupplierId, suppliersTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(desc(ordersTable.createdAt));

  let filtered = rows;
  const truthy = (v: any) => v === "true" || v === "1" || v === true || v === 1;
  if (truthy(req.query.shortageOnly)) filtered = filtered.filter(r => Number(r.totalShortage) > 0);
  if (truthy(req.query.reservedOnly)) filtered = filtered.filter(r => Number(r.totalReserved) > 0);
  if (req.query.sourceCityId) {
    const cid = parseInt(String(req.query.sourceCityId));
    const ids: any = await db.execute(sql`SELECT DISTINCT order_id FROM order_items WHERE inventory_source_city_id = ${cid}`);
    const set = new Set<number>(ids.rows?.map((r: any) => r.order_id) || []);
    filtered = filtered.filter(r => set.has(r.id));
  }
  sendValidated(req, res, ListOrdersResponse, filtered, "ListOrders");
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select({
    id: orderItemsTable.id,
    orderId: orderItemsTable.orderId,
    itemType: orderItemsTable.itemType,
    productId: orderItemsTable.productId,
    productName: productCatalogTable.name,
    productImageUrl: productCatalogTable.imageUrl,
    productHardwareIncluded: productCatalogTable.hardwareIncluded,
    productInventoryTracked: productCatalogTable.inventoryTracked,
    productUsePartnerInventoryEligible: productCatalogTable.usePartnerInventoryEligible,
    packageId: orderItemsTable.packageId,
    packageName: packagesTable.name,
    brandingZoneId: orderItemsTable.brandingZoneId,
    brandingZoneName: partnerBrandingLocationsTable.name,
    name: orderItemsTable.name,
    quantity: orderItemsTable.quantity,
    unitPrice: orderItemsTable.unitPrice,
    fulfillmentMode: orderItemsTable.fulfillmentMode,
    hardwareRequired: orderItemsTable.hardwareRequired,
    printDemandQuantity: orderItemsTable.printDemandQuantity,
    hardwareDemandQuantity: orderItemsTable.hardwareDemandQuantity,
    reservedQuantity: orderItemsTable.reservedQuantity,
    shortageQuantity: orderItemsTable.shortageQuantity,
    inventorySourceCityId: orderItemsTable.inventorySourceCityId,
    inventorySourceCityName: citiesTable.name,
    inventorySourceInventoryId: orderItemsTable.inventorySourceInventoryId,
    inventoryReservationId: orderItemsTable.inventoryReservationId,
    internalFulfillmentNotes: orderItemsTable.internalFulfillmentNotes,
    assignedSupplierId: orderItemsTable.assignedSupplierId,
    assignedSupplierName: suppliersTable.name,
    supplierAssignmentSource: orderItemsTable.supplierAssignmentSource,
    supplierStatus: orderItemsTable.supplierStatus,
    supplierDueDate: orderItemsTable.supplierDueDate,
    supplierShipDate: orderItemsTable.supplierShipDate,
    supplierDeliveryDate: orderItemsTable.supplierDeliveryDate,
    supplierInstallDate: orderItemsTable.supplierInstallDate,
    supplierAcknowledgedAt: orderItemsTable.supplierAcknowledgedAt,
    supplierReference: orderItemsTable.supplierReference,
    supplierNotes: orderItemsTable.supplierNotes,
    exceptionFlag: orderItemsTable.exceptionFlag,
    exceptionReason: orderItemsTable.exceptionReason,
    exceptionNotes: orderItemsTable.exceptionNotes,
    artworkFileUrl: orderItemsTable.artworkFileUrl,
    notes: orderItemsTable.notes,
    sortOrder: orderItemsTable.sortOrder,
    enteredWidth: orderItemsTable.enteredWidth,
    enteredHeight: orderItemsTable.enteredHeight,
    enteredSizeUnit: orderItemsTable.enteredSizeUnit,
    enteredWidthMm: orderItemsTable.enteredWidthMm,
    enteredHeightMm: orderItemsTable.enteredHeightMm,
    billableAreaSqm: orderItemsTable.billableAreaSqm,
    billableLinearM: orderItemsTable.billableLinearM,
    pricingModel: orderItemsTable.pricingModel,
    pricingUnit: orderItemsTable.pricingUnit,
    calculationBasis: orderItemsTable.calculationBasis,
  }).from(orderItemsTable)
    .leftJoin(productCatalogTable, eq(orderItemsTable.productId, productCatalogTable.id))
    .leftJoin(packagesTable, eq(orderItemsTable.packageId, packagesTable.id))
    .leftJoin(partnerBrandingLocationsTable, eq(orderItemsTable.brandingZoneId, partnerBrandingLocationsTable.id))
    .leftJoin(citiesTable, eq(orderItemsTable.inventorySourceCityId, citiesTable.id))
    .leftJoin(suppliersTable, eq(orderItemsTable.assignedSupplierId, suppliersTable.id))
    .where(eq(orderItemsTable.orderId, id))
    .orderBy(orderItemsTable.sortOrder);

  const [partner] = order.partnerId ? await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId)) : [null];
  const [event] = order.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [null];
  const [venue] = order.shippingVenueId ? await db.select().from(venuesTable).where(eq(venuesTable.id, order.shippingVenueId)) : [null];
  const [supplier] = order.assignedSupplierId ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.assignedSupplierId)) : [null];

  // Section 30 — attach partner role-based contacts so the Order Detail page
  // can surface primary / billing / design / support contacts inline without
  // a second round-trip.
  const partnerContacts = order.partnerId ? await db.select().from(partnerContactsTable)
    .where(eq(partnerContactsTable.partnerId, order.partnerId)) : [];

  sendValidated(req, res, GetOrderResponse, { ...order, items, partner, event, venue, supplier, partnerContacts }, "GetOrder");
});

import { fire } from "../services/workflowEngine";
import { emit, emitFirst } from "../services/usageTracking";

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;
  const orderNumber = generateOrderNumber();

  try {
    const { resolveOrderBilling, computeOrderTotals } = await import("../lib/billing");
    // Resolve currency + tax inheritance from partner → event → order override.
    const [partnerRow] = await db.select().from(partnersTable).where(eq(partnersTable.id, orderData.partnerId));
    const [eventRow] = orderData.eventId
      ? await db.select().from(eventsTable).where(eq(eventsTable.id, orderData.eventId))
      : [null];
    const billing = resolveOrderBilling(partnerRow as any, eventRow as any, orderData as any);
    const totals = computeOrderTotals(items || [], billing.taxRate, billing.taxInclusive);

    // ---- Section 26: Connected product family enforcement -----------------
    // Shared helper used by admin POST /orders and the public ordering route
    // so both paths apply the same family rules. Pre-check is non-locking; the
    // real race protection comes from `reserveForItem`'s `FOR UPDATE` below.
    if (items && items.length && orderData.partnerId) {
      const { planFamilyReservations } = await import("../lib/familyAvailability");
      const plan = await planFamilyReservations(orderData.partnerId, items as any, eventRow?.cityId ?? null);
      if (!plan.ok) { res.status(plan.status).json(plan.body); return; }
    }
    // -----------------------------------------------------------------------


    const order = await db.transaction(async (tx) => {
      const [createdOrder] = await tx.insert(ordersTable).values(normalizeOrderLogistics({
        ...orderData,
        orderNumber,
        currency: billing.currency,
        currencySource: billing.currencySource,
        taxMode: billing.taxMode,
        taxModeSource: billing.taxModeSource,
        taxLabel: billing.taxLabel,
        taxRate: billing.taxRate,
        taxInclusive: billing.taxInclusive,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        // Persist computed total when caller didn't already supply one.
        totalEstimate: orderData.totalEstimate ?? totals.total,
      })).returning();
      if (items && items.length) {
        const productIds = items.map(i => i.productId).filter((x): x is number => !!x);
        const caps = await loadProductCaps(tx as any, productIds);
        const packDefaults = await loadProductPackingDefaults(tx, productIds);
        const ctx = await loadResolveContext(tx, items, createdOrder.assignedSupplierId ?? null);
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const qty = it.quantity ?? 1;
          const productCaps = it.productId ? caps.get(it.productId) ?? null : null;
          const math = computeFulfillmentMath(it.fulfillmentMode, qty, productCaps);
          let reservedQty = 0, shortageQty = 0, reservationId: number | null = null;
          if (it.fulfillmentMode === "use_existing_partner_inventory" && it.inventorySourceInventoryId) {
            const r = await reserveForItem(tx, it.inventorySourceInventoryId, createdOrder.eventId ?? null, qty, createdOrder.partnerId ?? null);
            reservedQty = r.reservedQty; shortageQty = r.shortageQty; reservationId = r.reservationId;
          } else if (it.fulfillmentMode === "use_existing_partner_inventory") {
            shortageQty = qty;
          }
          let supplierId: number | null = it.assignedSupplierId ?? null;
          let source: string = it.supplierAssignmentSource ?? "none";
          if (it.assignedSupplierId !== undefined && it.assignedSupplierId !== null) {
            source = it.supplierAssignmentSource ?? "manual";
          } else {
            const r = resolveDefaultSupplier(it, ctx);
            supplierId = r.supplierId; source = r.source;
          }
          const supplierStatus = it.supplierStatus ?? (supplierId ? "assigned" : "unassigned");
          const logistics = buildItemLogisticsValues(it, it.productId ? (packDefaults.get(it.productId) ?? null) : null);
          const [created] = await tx.insert(orderItemsTable).values({
            ...logistics,
            orderId: createdOrder.id,
            itemType: it.itemType,
            productId: it.productId ?? null,
            packageId: it.packageId ?? null,
            brandingZoneId: it.brandingZoneId ?? null,
            name: it.name,
            quantity: qty,
            unitPrice: it.unitPrice ?? null,
            fulfillmentMode: it.fulfillmentMode ?? null,
            hardwareRequired: math.hardwareRequired,
            printDemandQuantity: math.printDemand,
            hardwareDemandQuantity: math.hardwareDemand,
            reservedQuantity: reservedQty,
            shortageQuantity: shortageQty,
            inventorySourceCityId: it.inventorySourceCityId ?? null,
            inventorySourceInventoryId: it.inventorySourceInventoryId ?? null,
            inventoryReservationId: reservationId,
            internalFulfillmentNotes: it.internalFulfillmentNotes ?? null,
            assignedSupplierId: supplierId,
            supplierAssignmentSource: source,
            supplierStatus,
            supplierDueDate: toDateOrNull(it.supplierDueDate),
            supplierShipDate: toDateOrNull(it.supplierShipDate),
            supplierDeliveryDate: toDateOrNull(it.supplierDeliveryDate),
            supplierInstallDate: toDateOrNull(it.supplierInstallDate),
            supplierReference: it.supplierReference ?? null,
            supplierNotes: it.supplierNotes ?? null,
            exceptionFlag: it.exceptionFlag ?? false,
            exceptionReason: it.exceptionReason ?? null,
            exceptionNotes: it.exceptionNotes ?? null,
            artworkFileUrl: it.artworkFileUrl ?? null,
            notes: it.notes ?? null,
            sortOrder: it.sortOrder ?? idx,
          }).returning();
          if (supplierId) {
            await tx.insert(supplierAssignmentHistoryTable).values({ orderItemId: created.id, fromSupplierId: null, toSupplierId: supplierId, source });
          }
          await tx.insert(supplierStatusEventsTable).values({ orderItemId: created.id, fromStatus: null, toStatus: supplierStatus, changedByRole: "system" });
        }
      }
      return createdOrder;
    });
    if (order?.partnerId) {
      emit("order.submitted", { partnerId: order.partnerId, objectType: "order", objectId: order.id, meta: { orderNumber: order.orderNumber } }).catch(() => {});
      emitFirst("first_order_submitted", { partnerId: order.partnerId, objectType: "order", objectId: order.id }).catch(() => {});
    }
    res.status(201).json(order);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Order create failed" });
  }
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OrderBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;

  try {
    const { resolveOrderBilling, computeOrderTotals } = await import("../lib/billing");
    let prevStatus: string | null = null;
    const updated = await db.transaction(async (tx) => {
      const [prev] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id));
      prevStatus = prev?.status ?? null;
      const existingOrder = prev ? { totalShipmentWeightUnit: prev.totalShipmentWeightUnit } : undefined;

      // If currency/tax fields were edited or partner/event changed, re-resolve.
      const hasBillingChange = ["currency","taxMode","taxLabel","taxRate","taxInclusive","partnerId","eventId"].some(k => (orderData as any)[k] !== undefined);
      const updateValues: any = normalizeOrderLogistics(orderData, existingOrder);
      if (prev && hasBillingChange) {
        const partnerId = orderData.partnerId ?? prev.partnerId;
        const eventId = orderData.eventId !== undefined ? orderData.eventId : prev.eventId;
        const [partnerRow] = await tx.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
        const [eventRow] = eventId ? await tx.select().from(eventsTable).where(eq(eventsTable.id, eventId)) : [null];
        const billing = resolveOrderBilling(partnerRow as any, eventRow as any, orderData as any);
        Object.assign(updateValues, {
          currency: billing.currency, currencySource: billing.currencySource,
          taxMode: billing.taxMode, taxModeSource: billing.taxModeSource,
          taxLabel: billing.taxLabel, taxRate: billing.taxRate, taxInclusive: billing.taxInclusive,
        });
      }

      const [row] = await tx.update(ordersTable).set(updateValues).where(eq(ordersTable.id, id)).returning();
      if (!row) return null;
      if (items) {
        const existing = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
        for (const ex of existing) {
          if (ex.inventoryReservationId) await releaseReservation(tx, ex.inventoryReservationId);
        }
        await tx.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
        const productIds = items.map(i => i.productId).filter((x): x is number => !!x);
        const caps = await loadProductCaps(tx as any, productIds);
        const packDefaults = await loadProductPackingDefaults(tx, productIds);
        const ctx = await loadResolveContext(tx, items, row.assignedSupplierId ?? null);
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const qty = it.quantity ?? 1;
          const productCaps = it.productId ? caps.get(it.productId) ?? null : null;
          const math = computeFulfillmentMath(it.fulfillmentMode, qty, productCaps);
          let reservedQty = 0, shortageQty = 0, reservationId: number | null = null;
          if (it.fulfillmentMode === "use_existing_partner_inventory" && it.inventorySourceInventoryId) {
            const r = await reserveForItem(tx, it.inventorySourceInventoryId, row.eventId ?? null, qty, row.partnerId ?? null);
            reservedQty = r.reservedQty; shortageQty = r.shortageQty; reservationId = r.reservationId;
          } else if (it.fulfillmentMode === "use_existing_partner_inventory") {
            shortageQty = qty;
          }
          let supplierId: number | null = it.assignedSupplierId ?? null;
          let source: string = it.supplierAssignmentSource ?? "none";
          if (it.assignedSupplierId !== undefined && it.assignedSupplierId !== null) {
            source = it.supplierAssignmentSource ?? "manual";
          } else {
            const r = resolveDefaultSupplier(it, ctx);
            supplierId = r.supplierId; source = r.source;
          }
          const supplierStatus = it.supplierStatus ?? (supplierId ? "assigned" : "unassigned");
          const logistics = buildItemLogisticsValues(it, it.productId ? (packDefaults.get(it.productId) ?? null) : null);
          const [created] = await tx.insert(orderItemsTable).values({
            ...logistics,
            orderId: id, itemType: it.itemType, productId: it.productId ?? null, packageId: it.packageId ?? null, brandingZoneId: it.brandingZoneId ?? null,
            name: it.name, quantity: qty, unitPrice: it.unitPrice ?? null, fulfillmentMode: it.fulfillmentMode ?? null,
            hardwareRequired: math.hardwareRequired, printDemandQuantity: math.printDemand, hardwareDemandQuantity: math.hardwareDemand,
            reservedQuantity: reservedQty, shortageQuantity: shortageQty,
            inventorySourceCityId: it.inventorySourceCityId ?? null, inventorySourceInventoryId: it.inventorySourceInventoryId ?? null,
            inventoryReservationId: reservationId, internalFulfillmentNotes: it.internalFulfillmentNotes ?? null,
            assignedSupplierId: supplierId, supplierAssignmentSource: source, supplierStatus,
            supplierDueDate: toDateOrNull(it.supplierDueDate), supplierShipDate: toDateOrNull(it.supplierShipDate),
            supplierDeliveryDate: toDateOrNull(it.supplierDeliveryDate), supplierInstallDate: toDateOrNull(it.supplierInstallDate),
            supplierReference: it.supplierReference ?? null, supplierNotes: it.supplierNotes ?? null,
            exceptionFlag: it.exceptionFlag ?? false, exceptionReason: it.exceptionReason ?? null, exceptionNotes: it.exceptionNotes ?? null,
            artworkFileUrl: it.artworkFileUrl ?? null, notes: it.notes ?? null, sortOrder: it.sortOrder ?? idx,
          }).returning();
          if (supplierId) await tx.insert(supplierAssignmentHistoryTable).values({ orderItemId: created.id, fromSupplierId: null, toSupplierId: supplierId, source });
          await tx.insert(supplierStatusEventsTable).values({ orderItemId: created.id, fromStatus: null, toStatus: supplierStatus, changedByRole: "system" });
        }
      }
      // Recompute totals if items changed OR tax config changed.
      if (items || hasBillingChange) {
        const finalItems = items ?? await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
        const totals = computeOrderTotals(finalItems as any, row.taxRate, !!row.taxInclusive);
        await tx.update(ordersTable).set({
          subtotal: totals.subtotal, taxAmount: totals.taxAmount,
          totalEstimate: orderData.totalEstimate ?? totals.total,
        } as any).where(eq(ordersTable.id, id));
        const [refreshed] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id));
        return refreshed;
      }
      return row;
    });
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    if (orderData.status && orderData.status !== prevStatus) {
      emit(`order.status.${orderData.status}`, { partnerId: updated.partnerId ?? null, objectType: "order", objectId: id, meta: { orderNumber: updated.orderNumber } }).catch(() => {});
      if (orderData.status === "completed") emitFirst("first_order_completed", { partnerId: updated.partnerId ?? null, objectType: "order", objectId: id }).catch(() => {});
      if (orderData.status === "approved") {
        fire("order.approved", { objectType: "order", objectId: id, orderId: id, partnerId: updated.partnerId ?? null, eventId: updated.eventId ?? null, orderNumber: updated.orderNumber }).catch(() => {});
      } else if (orderData.status === "in_production") {
        fire("order.in_production", { objectType: "order", objectId: id, orderId: id, partnerId: updated.partnerId ?? null, orderNumber: updated.orderNumber }).catch(() => {});
      }
    }
    sendValidated(req, res, UpdateOrderResponse, updated, "UpdateOrder");
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Update failed" });
  }
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    for (const ex of existing) if (ex.inventoryReservationId) await releaseReservation(tx, ex.inventoryReservationId);
    await tx.delete(ordersTable).where(eq(ordersTable.id, id));
  });
  sendValidated(req, res, DeleteOrderResponse, { success: true }, "DeleteOrder");
});

// ----- Per-item assignment / status / exception endpoints -----

const AssignSupplierBody = z.object({
  supplierId: z.number().int().nullable(),
  source: z.enum(ASSIGNMENT_SOURCES).optional(),
  note: z.string().nullable().optional(),
  changedByUserId: z.string().nullable().optional(),
});

router.post("/orders/:orderId/items/:itemId/assign-supplier", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  const parsed = AssignSupplierBody.safeParse(req.body);
  if (isNaN(itemId) || !parsed.success) { res.status(400).json({ error: parsed.success ? "bad id" : parsed.error.message }); return; }
  const { supplierId, source = "manual", note, changedByUserId } = parsed.data;
  const updated = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
    if (!item) return null;
    const newStatus = supplierId ? (item.supplierStatus === "unassigned" ? "assigned" : item.supplierStatus) : "unassigned";
    const [row] = await tx.update(orderItemsTable).set({
      assignedSupplierId: supplierId,
      supplierAssignmentSource: source,
      supplierStatus: newStatus,
    }).where(eq(orderItemsTable.id, itemId)).returning();
    await tx.insert(supplierAssignmentHistoryTable).values({ orderItemId: itemId, fromSupplierId: item.assignedSupplierId ?? null, toSupplierId: supplierId, source, note: note ?? null, changedByUserId: changedByUserId ?? null });
    if (item.supplierStatus !== newStatus) {
      await tx.insert(supplierStatusEventsTable).values({ orderItemId: itemId, fromStatus: item.supplierStatus, toStatus: newStatus, changedByUserId: changedByUserId ?? null, changedByRole: "admin" });
    }
    return row;
  });
  if (!updated) { res.status(404).json({ error: "Item not found" }); return; }
  fire("supplier.assigned", { objectType: "order_item", objectId: itemId, orderItemId: itemId, orderId: parseInt(req.params.orderId), supplierId, source }).catch(() => {});
  sendValidated(req, res, AssignOrderItemSupplierResponse, updated, "AssignOrderItemSupplier");
});

router.post("/orders/:orderId/bulk-assign-supplier", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId);
  const Body = z.object({ itemIds: z.array(z.number().int()).min(1), supplierId: z.number().int().nullable(), source: z.enum(ASSIGNMENT_SOURCES).optional(), note: z.string().optional(), changedByUserId: z.string().optional() });
  const parsed = Body.safeParse(req.body);
  if (isNaN(orderId) || !parsed.success) { res.status(400).json({ error: parsed.success ? "bad id" : parsed.error.message }); return; }
  const { itemIds, supplierId, source = "manual", note, changedByUserId } = parsed.data;
  const updatedCount = await db.transaction(async (tx) => {
    const items = await tx.select().from(orderItemsTable).where(and(eq(orderItemsTable.orderId, orderId), inArray(orderItemsTable.id, itemIds)));
    for (const item of items) {
      const newStatus = supplierId ? (item.supplierStatus === "unassigned" ? "assigned" : item.supplierStatus) : "unassigned";
      await tx.update(orderItemsTable).set({ assignedSupplierId: supplierId, supplierAssignmentSource: source, supplierStatus: newStatus }).where(eq(orderItemsTable.id, item.id));
      await tx.insert(supplierAssignmentHistoryTable).values({ orderItemId: item.id, fromSupplierId: item.assignedSupplierId ?? null, toSupplierId: supplierId, source, note: note ?? null, changedByUserId: changedByUserId ?? null });
      if (item.supplierStatus !== newStatus) {
        await tx.insert(supplierStatusEventsTable).values({ orderItemId: item.id, fromStatus: item.supplierStatus, toStatus: newStatus, changedByUserId: changedByUserId ?? null, changedByRole: "admin" });
      }
    }
    return items.length;
  });
  sendValidated(req, res, BulkAssignOrderItemSupplierResponse, { updated: updatedCount }, "BulkAssignOrderItemSupplier");
});

const StatusBody = z.object({
  status: z.enum(SUPPLIER_STATUSES),
  note: z.string().nullable().optional(),
  changedByUserId: z.string().nullable().optional(),
  role: z.enum(["admin", "vendor", "system"]).optional(),
});

router.post("/orders/:orderId/items/:itemId/status", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  const parsed = StatusBody.safeParse(req.body);
  if (isNaN(itemId) || !parsed.success) { res.status(400).json({ error: parsed.success ? "bad id" : parsed.error.message }); return; }
  const { status, note, changedByUserId, role = "admin" } = parsed.data;
  const updated = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
    if (!item) return null;
    if (role === "vendor") {
      const allowed = VENDOR_ALLOWED_TRANSITIONS[item.supplierStatus] ?? [];
      if (!allowed.includes(status)) {
        const err: any = new Error(`Vendor cannot transition from ${item.supplierStatus} to ${status}`);
        err.code = 403; throw err;
      }
    }
    const patch: any = { supplierStatus: status };
    const now = new Date();
    if (status === "acknowledged" && !item.supplierAcknowledgedAt) patch.supplierAcknowledgedAt = now;
    if (status === "shipped" && !item.supplierShipDate) patch.supplierShipDate = now;
    if (status === "delivered" && !item.supplierDeliveryDate) patch.supplierDeliveryDate = now;
    if (status === "installed" && !item.supplierInstallDate) patch.supplierInstallDate = now;
    if (status === "issue_flagged") patch.exceptionFlag = true;
    const [row] = await tx.update(orderItemsTable).set(patch).where(eq(orderItemsTable.id, itemId)).returning();
    await tx.insert(supplierStatusEventsTable).values({ orderItemId: itemId, fromStatus: item.supplierStatus, toStatus: status, changedByUserId: changedByUserId ?? null, changedByRole: role, note: note ?? null });
    return row;
  }).catch(e => { if (e.code === 403) { res.status(403).json({ error: e.message }); return null; } throw e; });
  if (res.headersSent) return;
  if (!updated) { res.status(404).json({ error: "Item not found" }); return; }
  sendValidated(req, res, UpdateOrderItemStatusResponse, updated, "UpdateOrderItemStatus");
});

const ExceptionBody = z.object({ flag: z.boolean(), reason: z.string().nullable().optional(), notes: z.string().nullable().optional(), changedByUserId: z.string().nullable().optional(), role: z.enum(["admin", "vendor", "system"]).optional() });

router.post("/orders/:orderId/items/:itemId/exception", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  const parsed = ExceptionBody.safeParse(req.body);
  if (isNaN(itemId) || !parsed.success) { res.status(400).json({ error: parsed.success ? "bad id" : parsed.error.message }); return; }
  const { flag, reason, notes, changedByUserId, role = "admin" } = parsed.data;
  const [item] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const patch: any = { exceptionFlag: flag, exceptionReason: reason ?? null, exceptionNotes: notes ?? null };
  if (flag && item.supplierStatus !== "issue_flagged") patch.supplierStatus = "issue_flagged";
  await db.transaction(async (tx) => {
    await tx.update(orderItemsTable).set(patch).where(eq(orderItemsTable.id, itemId));
    if (patch.supplierStatus) await tx.insert(supplierStatusEventsTable).values({ orderItemId: itemId, fromStatus: item.supplierStatus, toStatus: "issue_flagged", changedByUserId: changedByUserId ?? null, changedByRole: role, note: reason ?? null });
  });
  const [row] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
  sendValidated(req, res, SetOrderItemExceptionResponse, row, "SetOrderItemException");
});

const DatesBody = z.object({ supplierDueDate: z.string().nullable().optional(), supplierShipDate: z.string().nullable().optional(), supplierDeliveryDate: z.string().nullable().optional(), supplierInstallDate: z.string().nullable().optional(), supplierReference: z.string().nullable().optional(), supplierNotes: z.string().nullable().optional() });

router.post("/orders/:orderId/items/:itemId/dates", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  const parsed = DatesBody.safeParse(req.body);
  if (isNaN(itemId) || !parsed.success) { res.status(400).json({ error: parsed.success ? "bad id" : parsed.error.message }); return; }
  const d = parsed.data;
  const patch: any = {};
  if ("supplierDueDate" in d) patch.supplierDueDate = toDateOrNull(d.supplierDueDate);
  if ("supplierShipDate" in d) patch.supplierShipDate = toDateOrNull(d.supplierShipDate);
  if ("supplierDeliveryDate" in d) patch.supplierDeliveryDate = toDateOrNull(d.supplierDeliveryDate);
  if ("supplierInstallDate" in d) patch.supplierInstallDate = toDateOrNull(d.supplierInstallDate);
  if ("supplierReference" in d) patch.supplierReference = d.supplierReference ?? null;
  if ("supplierNotes" in d) patch.supplierNotes = d.supplierNotes ?? null;
  const [row] = await db.update(orderItemsTable).set(patch).where(eq(orderItemsTable.id, itemId)).returning();
  if (!row) { res.status(404).json({ error: "Item not found" }); return; }
  sendValidated(req, res, UpdateOrderItemDatesResponse, row, "UpdateOrderItemDates");
});

router.get("/orders/:orderId/items/:itemId/history", async (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const [assignments, statuses] = await Promise.all([
    db.select({
      id: supplierAssignmentHistoryTable.id, fromSupplierId: supplierAssignmentHistoryTable.fromSupplierId,
      toSupplierId: supplierAssignmentHistoryTable.toSupplierId, source: supplierAssignmentHistoryTable.source,
      note: supplierAssignmentHistoryTable.note, changedByUserId: supplierAssignmentHistoryTable.changedByUserId,
      createdAt: supplierAssignmentHistoryTable.createdAt,
      fromSupplierName: sql<string | null>`(SELECT name FROM suppliers WHERE id = ${supplierAssignmentHistoryTable.fromSupplierId})`,
      toSupplierName: sql<string | null>`(SELECT name FROM suppliers WHERE id = ${supplierAssignmentHistoryTable.toSupplierId})`,
    }).from(supplierAssignmentHistoryTable).where(eq(supplierAssignmentHistoryTable.orderItemId, itemId)).orderBy(desc(supplierAssignmentHistoryTable.createdAt)),
    db.select().from(supplierStatusEventsTable).where(eq(supplierStatusEventsTable.orderItemId, itemId)).orderBy(desc(supplierStatusEventsTable.createdAt)),
  ]);
  sendValidated(req, res, GetOrderItemHistoryResponse, { assignments, statuses }, "GetOrderItemHistory");
});

// ----- Recommended suppliers for an item -----
router.get("/orders/:orderId/items/:itemId/supplier-recommendations", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  const [item] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, item.orderId));
  const recs: Array<{ supplierId: number; name: string; reason: string }> = [];
  const seen = new Set<number>();
  if (item.productId) {
    const [p] = await db.select({ id: productCatalogTable.id, supplierId: productCatalogTable.supplierId, name: suppliersTable.name }).from(productCatalogTable).leftJoin(suppliersTable, eq(productCatalogTable.supplierId, suppliersTable.id)).where(eq(productCatalogTable.id, item.productId));
    if (p?.supplierId && p.name) { recs.push({ supplierId: p.supplierId, name: p.name, reason: "Default supplier on product" }); seen.add(p.supplierId); }
  }
  if (item.brandingZoneId) {
    const [z] = await db.select({ supplierId: partnerBrandingLocationsTable.defaultSupplierId, name: suppliersTable.name }).from(partnerBrandingLocationsTable).leftJoin(suppliersTable, eq(partnerBrandingLocationsTable.defaultSupplierId, suppliersTable.id)).where(eq(partnerBrandingLocationsTable.id, item.brandingZoneId));
    if (z?.supplierId && z.name && !seen.has(z.supplierId)) { recs.push({ supplierId: z.supplierId, name: z.name, reason: "Default supplier on branding zone" }); seen.add(z.supplierId); }
  }
  if (order?.assignedSupplierId && !seen.has(order.assignedSupplierId)) {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.assignedSupplierId));
    if (s) { recs.push({ supplierId: s.id, name: s.name, reason: "Assigned at order level" }); seen.add(s.id); }
  }
  // Active suppliers as fallback options
  const others = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
  for (const s of others) if (!seen.has(s.id)) recs.push({ supplierId: s.id, name: s.name, reason: "Active supplier" });
  sendValidated(req, res, GetOrderItemSupplierRecommendationsResponse, recs, "GetOrderItemSupplierRecommendations");
});

// ----- Internal Fulfillment Command Center -----

router.get("/fulfillment/command-center", async (req, res) => {
  const conditions: any[] = [];
  const q = req.query;
  if (q.supplierId) conditions.push(eq(orderItemsTable.assignedSupplierId, parseInt(String(q.supplierId))));
  if (q.status) conditions.push(eq(orderItemsTable.supplierStatus, String(q.status)));
  if (q.partnerId) conditions.push(eq(ordersTable.partnerId, parseInt(String(q.partnerId))));
  if (q.portalType) conditions.push(eq(ordersTable.portalType, String(q.portalType)));
  if (q.eventId) conditions.push(eq(ordersTable.eventId, parseInt(String(q.eventId))));
  if (q.fulfillmentMode) conditions.push(eq(orderItemsTable.fulfillmentMode, String(q.fulfillmentMode)));
  const truthy = (v: any) => v === "1" || v === "true" || v === true;
  if (truthy(q.shortageOnly)) conditions.push(sql`${orderItemsTable.shortageQuantity} > 0`);
  if (truthy(q.issueOnly)) conditions.push(eq(orderItemsTable.exceptionFlag, true));
  if (truthy(q.unassignedOnly)) conditions.push(sql`${orderItemsTable.assignedSupplierId} IS NULL`);
  if (q.dueWithinDays) {
    const days = parseInt(String(q.dueWithinDays));
    conditions.push(sql`${orderItemsTable.supplierDueDate} IS NOT NULL AND ${orderItemsTable.supplierDueDate} <= NOW() + (${days} || ' days')::interval`);
  }

  const items = await db.select({
    id: orderItemsTable.id,
    orderId: orderItemsTable.orderId,
    orderNumber: ordersTable.orderNumber,
    partnerId: ordersTable.partnerId,
    partnerName: partnersTable.companyName,
    eventId: ordersTable.eventId,
    eventName: eventsTable.name,
    eventStartDate: eventsTable.eventStartDate,
    portalType: ordersTable.portalType,
    name: orderItemsTable.name,
    quantity: orderItemsTable.quantity,
    productId: orderItemsTable.productId,
    fulfillmentMode: orderItemsTable.fulfillmentMode,
    printDemandQuantity: orderItemsTable.printDemandQuantity,
    hardwareDemandQuantity: orderItemsTable.hardwareDemandQuantity,
    shortageQuantity: orderItemsTable.shortageQuantity,
    assignedSupplierId: orderItemsTable.assignedSupplierId,
    supplierName: suppliersTable.name,
    supplierAssignmentSource: orderItemsTable.supplierAssignmentSource,
    supplierStatus: orderItemsTable.supplierStatus,
    supplierDueDate: orderItemsTable.supplierDueDate,
    supplierShipDate: orderItemsTable.supplierShipDate,
    supplierAcknowledgedAt: orderItemsTable.supplierAcknowledgedAt,
    supplierReference: orderItemsTable.supplierReference,
    exceptionFlag: orderItemsTable.exceptionFlag,
    exceptionReason: orderItemsTable.exceptionReason,
    hasQuoteSpec: sql<boolean>`EXISTS (SELECT 1 FROM quote_assets qa WHERE qa.attachable_type='product' AND qa.attachable_id = ${orderItemsTable.productId})`,
    cityId: sql<number | null>`(SELECT city_id FROM events WHERE id = ${ordersTable.eventId})`,
    createdAt: orderItemsTable.createdAt,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(suppliersTable, eq(orderItemsTable.assignedSupplierId, suppliersTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(desc(ordersTable.createdAt));

  let filtered = items;
  if (q.cityId) filtered = filtered.filter(i => Number(i.cityId) === parseInt(String(q.cityId)));
  if (q.hasQuoteSpec === "true" || q.hasQuoteSpec === "1") filtered = filtered.filter(i => i.hasQuoteSpec);
  if (q.hasQuoteSpec === "false" || q.hasQuoteSpec === "0") filtered = filtered.filter(i => !i.hasQuoteSpec);

  // Stats are computed over the DB-filter result (pre in-memory cityId/hasQuoteSpec narrow-down)
  // so toggling the "missing spec" / "city" chips doesn't make the rest of the cards lie.
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const stats = {
    total: items.length,
    unassigned: items.filter(i => !i.assignedSupplierId).length,
    awaitingAcknowledge: items.filter(i => i.supplierStatus === "assigned").length,
    dueSoon: items.filter(i => i.supplierDueDate && new Date(i.supplierDueDate) <= in7 && !["completed", "cancelled", "delivered", "installed"].includes(i.supplierStatus)).length,
    awaitingAssets: items.filter(i => i.supplierStatus === "awaiting_assets").length,
    issues: items.filter(i => i.exceptionFlag).length,
    shippedNotDelivered: items.filter(i => i.supplierStatus === "shipped").length,
    installUpcoming: items.filter(i => i.supplierStatus === "delivered" || i.supplierStatus === "installed").length,
    completedToday: items.filter(i => i.supplierStatus === "completed" && i.createdAt && new Date(i.createdAt) >= today).length,
    missingQuoteSpec: items.filter(i => !i.hasQuoteSpec).length,
    withShortage: items.filter(i => (i.shortageQuantity || 0) > 0).length,
  };
  sendValidated(req, res, GetFulfillmentCommandCenterResponse, { items: filtered, stats }, "GetFulfillmentCommandCenter");
});

// ----- Vendor (supplier-scoped) endpoints -----

function vendorOrderJoin(supplierId: number, extra?: SQL) {
  return db.select({
    id: orderItemsTable.id,
    orderId: orderItemsTable.orderId,
    orderNumber: ordersTable.orderNumber,
    partnerName: partnersTable.companyName,
    eventName: eventsTable.name,
    eventStartDate: eventsTable.eventStartDate,
    venueName: venuesTable.name,
    name: orderItemsTable.name,
    quantity: orderItemsTable.quantity,
    fulfillmentMode: orderItemsTable.fulfillmentMode,
    printDemandQuantity: orderItemsTable.printDemandQuantity,
    hardwareDemandQuantity: orderItemsTable.hardwareDemandQuantity,
    supplierStatus: orderItemsTable.supplierStatus,
    supplierDueDate: orderItemsTable.supplierDueDate,
    supplierShipDate: orderItemsTable.supplierShipDate,
    supplierReference: orderItemsTable.supplierReference,
    supplierNotes: orderItemsTable.supplierNotes,
    exceptionFlag: orderItemsTable.exceptionFlag,
    exceptionReason: orderItemsTable.exceptionReason,
    artworkFileUrl: orderItemsTable.artworkFileUrl,
    notes: orderItemsTable.notes,
    productId: orderItemsTable.productId,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(venuesTable, eq(ordersTable.shippingVenueId, venuesTable.id))
    .where(extra ? and(eq(orderItemsTable.assignedSupplierId, supplierId), extra) : eq(orderItemsTable.assignedSupplierId, supplierId));
}

router.get("/vendor/orders", async (req, res): Promise<void> => {
  const supplierId = req.query.supplierId ? parseInt(String(req.query.supplierId)) : null;
  if (!supplierId) { res.status(400).json({ error: "supplierId required" }); return; }
  const items = await vendorOrderJoin(supplierId).orderBy(desc(ordersTable.createdAt));
  // Group by order so vendor sees only their items inside each order
  const orderMap = new Map<number, any>();
  for (const it of items) {
    if (!orderMap.has(it.orderId)) orderMap.set(it.orderId, { id: it.orderId, orderNumber: it.orderNumber, partnerName: it.partnerName, eventName: it.eventName, eventStartDate: it.eventStartDate, venueName: it.venueName, items: [], itemCount: 0, dueSoon: 0, issues: 0 });
    const o = orderMap.get(it.orderId)!;
    o.items.push(it);
    o.itemCount++;
    if (it.exceptionFlag) o.issues++;
    if (it.supplierDueDate && new Date(it.supplierDueDate).getTime() - Date.now() < 7 * 86400000) o.dueSoon++;
  }
  sendValidated(req, res, ListVendorOrdersResponse, Array.from(orderMap.values()), "ListVendorOrders");
});

router.get("/vendor/items", async (req, res): Promise<void> => {
  const supplierId = req.query.supplierId ? parseInt(String(req.query.supplierId)) : null;
  if (!supplierId) { res.status(400).json({ error: "supplierId required" }); return; }
  const bucket = String(req.query.bucket || "all");
  const items = await vendorOrderJoin(supplierId).orderBy(desc(ordersTable.createdAt));
  const now = Date.now();
  const filtered = items.filter(i => {
    switch (bucket) {
      case "due_soon": return i.supplierDueDate && new Date(i.supplierDueDate).getTime() - now < 7 * 86400000 && !["completed", "cancelled", "delivered", "installed"].includes(i.supplierStatus);
      case "awaiting_assets": return i.supplierStatus === "awaiting_assets";
      case "in_production": return i.supplierStatus === "in_production";
      case "issues": return i.exceptionFlag;
      case "recent": return true;
      default: return true;
    }
  });
  // Compute counts for all buckets in one pass
  const buckets = { all: items.length, due_soon: 0, awaiting_assets: 0, in_production: 0, issues: 0, recent: items.length };
  for (const i of items) {
    if (i.supplierDueDate && new Date(i.supplierDueDate).getTime() - now < 7 * 86400000 && !["completed", "cancelled", "delivered", "installed"].includes(i.supplierStatus)) buckets.due_soon++;
    if (i.supplierStatus === "awaiting_assets") buckets.awaiting_assets++;
    if (i.supplierStatus === "in_production") buckets.in_production++;
    if (i.exceptionFlag) buckets.issues++;
  }
  sendValidated(req, res, ListVendorItemsResponse, { items: filtered, buckets }, "List vendor items");
});

router.get("/vendor/orders/:orderId/packet", async (req, res): Promise<void> => {
  const supplierId = req.query.supplierId ? parseInt(String(req.query.supplierId)) : null;
  const orderId = parseInt(req.params.orderId);
  if (!supplierId || isNaN(orderId)) { res.status(400).json({ error: "supplierId & orderId required" }); return; }
  const [order] = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    partnerName: partnersTable.companyName,
    eventName: eventsTable.name,
    eventStartDate: eventsTable.eventStartDate,
    venueName: venuesTable.name,
    cityName: citiesTable.name,
    contactName: ordersTable.contactName,
    contactEmail: ordersTable.contactEmail,
    contactPhone: ordersTable.contactPhone,
    shippingAddressJson: ordersTable.shippingAddressJson,
    notes: ordersTable.notes,
    vendorNotes: ordersTable.vendorNotes,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(venuesTable, eq(ordersTable.shippingVenueId, venuesTable.id))
    .leftJoin(citiesTable, eq(eventsTable.cityId, citiesTable.id))
    .where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const items = await vendorOrderJoin(supplierId, eq(orderItemsTable.orderId, orderId));
  if (!items.length) { res.status(404).json({ error: "No items assigned to this supplier" }); return; }
  const productIds = Array.from(new Set(items.map(i => i.productId).filter((x): x is number => !!x)));
  const products = productIds.length ? await db.select().from(productCatalogTable).where(inArray(productCatalogTable.id, productIds)) : [];
  const quoteAssets = productIds.length ? await db.select().from(quoteAssetsTable).where(and(eq(quoteAssetsTable.attachableType, "product"), inArray(quoteAssetsTable.attachableId, productIds), eq(quoteAssetsTable.vendorVisible, true))) : [];
  const supplier = (await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId)))[0];
  sendValidated(req, res, GetVendorOrderPacketResponse, { order, supplier, items, products, quoteAssets }, "GetVendorOrderPacket");
});

// ---------------------------------------------------------------------------
// Per-order email delivery log.
// ---------------------------------------------------------------------------
// Reads `usage_events` rows where objectType='order' + objectId=orderId and
// the eventType is one of email.sent / email.failed. The email pipeline emits
// these for every confirmation / ops / finance / partner_contact / vendor send
// (and for failures), so this single read gives admins a complete delivery
// timeline without a dedicated table. Auth-gated because recipient emails are
// internal data.
// Pass 7 (April 2026) — A3-side intake analysis for an order. Used by the
// OrderDetail "Internal A3 Intake" panel; the same builder powers the
// internal ops email so the inbox view and the admin UI never disagree.
router.get("/orders/:id/intake-analysis", async (req, res): Promise<void> => {
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req as any);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order id" }); return; }
  try {
    const { buildOrderEmailContext } = await import("../lib/email");
    const ctx = await buildOrderEmailContext(id);
    if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
    const { buildA3IntakeAnalysis } = await import("../lib/internalIntakeEmail");
    const analysis = await buildA3IntakeAnalysis(ctx);
    sendValidated(req, res, GetOrderIntakeAnalysisResponse, { analysis }, "GetOrderIntakeAnalysis");
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to build intake analysis" });
  }
});

router.get("/orders/:id/email-events", async (req, res): Promise<void> => {
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req as any);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const rows = await db.select().from(usageEvents)
    .where(and(
      eq(usageEvents.objectType, "order"),
      eq(usageEvents.objectId, id),
      inArray(usageEvents.eventType, ["email.sent", "email.failed", "pdf.generated", "pdf.failed"]),
    ))
    .orderBy(desc(usageEvents.occurredAt))
    .limit(200);
  sendValidated(req, res, GetOrderEmailEventsResponse, { events: rows }, "GetOrderEmailEvents");
});

// ----- Section 29: order-level exception + artwork-needed workflow -----
const EXCEPTION_STATES = ["none", "warning", "exception", "waiting_client", "waiting_internal", "resolved"] as const;
const EXCEPTION_TYPES = [
  "missing_artwork",
  "artwork_creation_needed",
  "wrong_file_or_spec_format",
  "missing_dimensions",
  "missing_contact_info",
  "unclear_order_notes",
  "custom_review_needed",
  "rush_request",
  "incomplete_package_selection",
  "asset_mismatch",
  "manual_follow_up_required",
] as const;
export const SECTION_29_EXCEPTION_STATES = EXCEPTION_STATES;
export const SECTION_29_EXCEPTION_TYPES = EXCEPTION_TYPES;

const ExceptionPatch = z.object({
  state: z.enum(EXCEPTION_STATES),
  type: z.enum(EXCEPTION_TYPES).nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
});

router.post("/orders/:id/exception", async (req, res): Promise<void> => {
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req as any);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order id" }); return; }
  const parsed = ExceptionPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const { state, type, message } = parsed.data;
  // When clearing, also wipe type/message so the UI is clean.
  const clearing = state === "none";
  const [updated] = await db.update(ordersTable).set({
    exceptionState: state,
    exceptionType: clearing ? null : (type ?? null),
    exceptionMessage: clearing ? null : (message ?? null),
    exceptionUpdatedAt: new Date(),
    exceptionUpdatedBy: auth.userId,
  }).where(eq(ordersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Order not found" }); return; }
  sendValidated(req, res, SetOrderExceptionResponse, { ok: true, order: updated }, "SetOrderException");
});

const ArtworkNeededPatch = z.object({
  flag: z.boolean(),
  brief: z.string().max(2000).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
});

router.post("/orders/:id/artwork-needed", async (req, res): Promise<void> => {
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req as any);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order id" }); return; }
  const parsed = ArtworkNeededPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const { flag, brief, contactName, contactEmail } = parsed.data;
  const patch: any = {
    artworkNeededFlag: flag,
    artworkBrief: flag ? (brief ?? null) : null,
    artworkContactName: flag ? (contactName ?? null) : null,
    artworkContactEmail: flag ? (contactEmail || null) : null,
  };
  // Bumping the artwork-needed flag also nudges the exception state if the
  // order has nothing else flagged — surfaces it on the dashboard immediately.
  if (flag) {
    const [cur] = await db.select({ exceptionState: ordersTable.exceptionState }).from(ordersTable).where(eq(ordersTable.id, id));
    if (cur && cur.exceptionState === "none") {
      patch.exceptionState = "warning";
      patch.exceptionType = "artwork_creation_needed";
      patch.exceptionUpdatedAt = new Date();
      patch.exceptionUpdatedBy = auth.userId;
    }
  }
  const [updated] = await db.update(ordersTable).set(patch).where(eq(ordersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Order not found" }); return; }
  sendValidated(req, res, SetOrderArtworkNeededResponse, { ok: true, order: updated }, "SetOrderArtworkNeeded");
});

// Branded order summary PDF download/preview. Audience flag picks which
// template/sensitivity-level to render. Auth-gated: even the customer-facing
// PDF should not be enumerable by random callers.
router.get("/orders/:id/summary-pdf", async (req, res): Promise<void> => {
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req as any);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order id" }); return; }
  const audienceRaw = String(req.query.audience || "internal").toLowerCase();
  const audience = (["customer", "internal", "finance"] as const).find(a => a === audienceRaw);
  if (!audience) { res.status(400).json({ error: "audience must be customer | internal | finance" }); return; }
  const disposition = (req.query.download === "1" ? "attachment" : "inline");
  try {
    const { buildOrderEmailContext } = await import("../lib/email");
    const { generateOrderSummaryPdf } = await import("../lib/pdf");
    const ctx = await buildOrderEmailContext(id);
    if (!ctx) { res.status(404).json({ error: "Order not found" }); return; }
    const pdf = await generateOrderSummaryPdf(ctx, audience);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${pdf.filename}"`);
    res.setHeader("Content-Length", String(pdf.buffer.length));
    res.send(pdf.buffer);
  } catch (err: any) {
    res.status(500).json({ error: "PDF generation failed", details: err?.message });
  }
});

export default router;
