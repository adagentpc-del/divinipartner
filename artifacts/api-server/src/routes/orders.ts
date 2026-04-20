import { Router, type IRouter } from "express";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, partnersTable, eventsTable, packagesTable, suppliersTable, venuesTable, productCatalogTable, partnerBrandingLocationsTable, citiesTable, inventoryTable, inventoryReservationsTable } from "@workspace/db";
import { z } from "zod";

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
  artworkFileUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const OrderBody = z.object({
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
  createdByUserId: z.string().nullable().optional(),
  items: z.array(OrderItemBody).optional(),
});

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

// Reserve inventory for an item. Locks inventory row, creates reservation, returns ids+shortage.
async function reserveForItem(tx: any, inventoryId: number, eventId: number | null, requestedQty: number, expectedPartnerId?: number | null) {
  const lockRows: any = await tx.execute(sql`SELECT id, total_quantity, reserved, in_use, damaged, retired, partner_id FROM inventory WHERE id = ${inventoryId} FOR UPDATE`);
  if (expectedPartnerId != null && lockRows.rows?.[0] && lockRows.rows[0].partner_id != null && Number(lockRows.rows[0].partner_id) !== expectedPartnerId) {
    throw new Error(`Inventory ${inventoryId} does not belong to partner ${expectedPartnerId}`);
  }
  const inv = lockRows.rows?.[0];
  if (!inv) return { reservationId: null, reservedQty: 0, shortageQty: requestedQty, error: "inventory_not_found" as const };
  const total = Number(inv.total_quantity) || 0;
  const used = (Number(inv.reserved) || 0) + (Number(inv.in_use) || 0) + (Number(inv.damaged) || 0) + (Number(inv.retired) || 0);
  const available = Math.max(0, total - used);
  const reserveNow = Math.min(available, requestedQty);
  const shortage = Math.max(0, requestedQty - reserveNow);
  let reservationId: number | null = null;
  if (reserveNow > 0 && eventId) {
    const [r] = await tx.insert(inventoryReservationsTable).values({ inventoryId, eventId, quantity: reserveNow, status: "active", notes: "Auto-reserved by order item" }).returning();
    await tx.update(inventoryTable).set({ reserved: sql`${inventoryTable.reserved} + ${reserveNow}` }).where(eq(inventoryTable.id, inventoryId));
    reservationId = r.id;
  } else if (reserveNow > 0 && !eventId) {
    // No event — store as standalone reservation isn't possible (event required). Treat all as shortage.
    return { reservationId: null, reservedQty: 0, shortageQty: requestedQty, error: "no_event" as const };
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
    contactName: ordersTable.contactName,
    contactEmail: ordersTable.contactEmail,
    companyName: ordersTable.companyName,
    totalEstimate: ordersTable.totalEstimate,
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
  res.json(filtered);
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
    artworkFileUrl: orderItemsTable.artworkFileUrl,
    notes: orderItemsTable.notes,
    sortOrder: orderItemsTable.sortOrder,
  }).from(orderItemsTable)
    .leftJoin(productCatalogTable, eq(orderItemsTable.productId, productCatalogTable.id))
    .leftJoin(packagesTable, eq(orderItemsTable.packageId, packagesTable.id))
    .leftJoin(partnerBrandingLocationsTable, eq(orderItemsTable.brandingZoneId, partnerBrandingLocationsTable.id))
    .leftJoin(citiesTable, eq(orderItemsTable.inventorySourceCityId, citiesTable.id))
    .where(eq(orderItemsTable.orderId, id))
    .orderBy(orderItemsTable.sortOrder);

  const [partner] = order.partnerId ? await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId)) : [null];
  const [event] = order.eventId ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [null];
  const [venue] = order.shippingVenueId ? await db.select().from(venuesTable).where(eq(venuesTable.id, order.shippingVenueId)) : [null];
  const [supplier] = order.assignedSupplierId ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.assignedSupplierId)) : [null];

  res.json({ ...order, items, partner, event, venue, supplier });
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;
  const orderNumber = generateOrderNumber();

  try {
    const order = await db.transaction(async (tx) => {
      const [createdOrder] = await tx.insert(ordersTable).values({ ...orderData, orderNumber }).returning();
      if (items && items.length) {
        const productIds = items.map(i => i.productId).filter((x): x is number => !!x);
        const caps = await loadProductCaps(tx as any, productIds);
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
          await tx.insert(orderItemsTable).values({
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
            artworkFileUrl: it.artworkFileUrl ?? null,
            notes: it.notes ?? null,
            sortOrder: it.sortOrder ?? idx,
          });
        }
      }
      return createdOrder;
    });
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
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(ordersTable).set(orderData).where(eq(ordersTable.id, id)).returning();
      if (!row) return null;
      if (items) {
        const existing = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
        for (const ex of existing) {
          if (ex.inventoryReservationId) await releaseReservation(tx, ex.inventoryReservationId);
        }
        await tx.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
        const productIds = items.map(i => i.productId).filter((x): x is number => !!x);
        const caps = await loadProductCaps(tx as any, productIds);
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
          await tx.insert(orderItemsTable).values({
            orderId: id, itemType: it.itemType, productId: it.productId ?? null, packageId: it.packageId ?? null, brandingZoneId: it.brandingZoneId ?? null,
            name: it.name, quantity: qty, unitPrice: it.unitPrice ?? null, fulfillmentMode: it.fulfillmentMode ?? null,
            hardwareRequired: math.hardwareRequired, printDemandQuantity: math.printDemand, hardwareDemandQuantity: math.hardwareDemand,
            reservedQuantity: reservedQty, shortageQuantity: shortageQty,
            inventorySourceCityId: it.inventorySourceCityId ?? null, inventorySourceInventoryId: it.inventorySourceInventoryId ?? null,
            inventoryReservationId: reservationId, internalFulfillmentNotes: it.internalFulfillmentNotes ?? null,
            artworkFileUrl: it.artworkFileUrl ?? null, notes: it.notes ?? null, sortOrder: it.sortOrder ?? idx,
          });
        }
      }
      return row;
    });
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
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
  res.json({ success: true });
});

router.get("/vendor/orders", async (req, res): Promise<void> => {
  const supplierId = req.query.supplierId ? parseInt(String(req.query.supplierId)) : null;
  if (!supplierId) { res.status(400).json({ error: "supplierId required" }); return; }
  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    partnerId: ordersTable.partnerId,
    partnerName: partnersTable.companyName,
    eventId: ordersTable.eventId,
    eventName: eventsTable.name,
    venueName: venuesTable.name,
    fulfillmentMode: ordersTable.fulfillmentMode,
    status: ordersTable.status,
    fulfillmentStatus: ordersTable.fulfillmentStatus,
    contactName: ordersTable.contactName,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(venuesTable, eq(ordersTable.shippingVenueId, venuesTable.id))
    .where(eq(ordersTable.assignedSupplierId, supplierId))
    .orderBy(desc(ordersTable.createdAt));
  res.json(rows);
});

export default router;
