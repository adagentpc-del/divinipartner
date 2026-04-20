import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, partnersTable, eventsTable, packagesTable, suppliersTable, venuesTable, productCatalogTable, partnerBrandingLocationsTable } from "@workspace/db";
import { z } from "zod";

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
  fulfillmentMode: z.string().nullable().optional(),
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
  fulfillmentMode: z.enum(["full", "graphic_only", "rental_plus_print", "client_owned_plus_print"]).nullable().optional(),
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

const router: IRouter = Router();

router.get("/orders", async (req, res) => {
  const conditions = [];
  if (req.query.partnerId) conditions.push(eq(ordersTable.partnerId, parseInt(String(req.query.partnerId))));
  if (req.query.eventId) conditions.push(eq(ordersTable.eventId, parseInt(String(req.query.eventId))));
  if (req.query.supplierId) conditions.push(eq(ordersTable.assignedSupplierId, parseInt(String(req.query.supplierId))));
  if (req.query.status) conditions.push(eq(ordersTable.status, String(req.query.status)));
  if (req.query.portalType) conditions.push(eq(ordersTable.portalType, String(req.query.portalType)));
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
  }).from(ordersTable)
    .leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id))
    .leftJoin(eventsTable, eq(ordersTable.eventId, eventsTable.id))
    .leftJoin(packagesTable, eq(ordersTable.packageId, packagesTable.id))
    .leftJoin(venuesTable, eq(ordersTable.shippingVenueId, venuesTable.id))
    .leftJoin(suppliersTable, eq(ordersTable.assignedSupplierId, suppliersTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(desc(ordersTable.createdAt));
  res.json(rows);
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
    packageId: orderItemsTable.packageId,
    packageName: packagesTable.name,
    brandingZoneId: orderItemsTable.brandingZoneId,
    brandingZoneName: partnerBrandingLocationsTable.name,
    name: orderItemsTable.name,
    quantity: orderItemsTable.quantity,
    unitPrice: orderItemsTable.unitPrice,
    fulfillmentMode: orderItemsTable.fulfillmentMode,
    artworkFileUrl: orderItemsTable.artworkFileUrl,
    notes: orderItemsTable.notes,
    sortOrder: orderItemsTable.sortOrder,
  }).from(orderItemsTable)
    .leftJoin(productCatalogTable, eq(orderItemsTable.productId, productCatalogTable.id))
    .leftJoin(packagesTable, eq(orderItemsTable.packageId, packagesTable.id))
    .leftJoin(partnerBrandingLocationsTable, eq(orderItemsTable.brandingZoneId, partnerBrandingLocationsTable.id))
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
  const [order] = await db.insert(ordersTable).values({ ...orderData, orderNumber }).returning();
  if (items && items.length) {
    await db.insert(orderItemsTable).values(items.map((it, idx) => ({ ...it, orderId: order.id, sortOrder: it.sortOrder ?? idx })));
  }
  res.status(201).json(order);
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OrderBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;
  const [row] = await db.update(ordersTable).set(orderData).where(eq(ordersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(ordersTable).where(eq(ordersTable.id, id));
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
