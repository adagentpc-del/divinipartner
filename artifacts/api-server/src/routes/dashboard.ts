import { Router, type IRouter } from "express";
import { eq, desc, sql, count, gte, and, lte, isNull } from "drizzle-orm";
import { db, requestsTable, partnersTable, requestUploadsTable, partnerAssetsTable, ordersTable, inventoryTable, eventsTable, citiesTable, productCatalogTable } from "@workspace/db";
import {
  GetRecentRequestsQueryParams,
  GetDashboardSummaryResponse,
  GetRecentRequestsResponse,
  GetRequestsByStatusResponse,
  GetAssetsLibraryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [totalPartners] = await db.select({ count: count() }).from(partnersTable);
  const [activePartners] = await db.select({ count: count() }).from(partnersTable).where(eq(partnersTable.isActive, true));
  const [orderingPartners] = await db.select({ count: count() }).from(partnersTable).where(eq(partnersTable.partnerType, "ordering"));
  const [brandingPartners] = await db.select({ count: count() }).from(partnersTable).where(eq(partnersTable.partnerType, "branding"));
  const [totalRequests] = await db.select({ count: count() }).from(requestsTable);
  const [totalOrders] = await db.select({ count: count() }).from(ordersTable);
  const [pendingOrders] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "new"));
  const [unassignedOrders] = await db.select({ count: count() }).from(ordersTable).where(isNull(ordersTable.assignedSupplierId));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [newToday] = await db.select({ count: count() }).from(requestsTable).where(gte(requestsTable.createdAt, today));
  const [ordersToday] = await db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, today));

  const statusCounts = await db.select({ status: requestsTable.status, count: count() }).from(requestsTable).groupBy(requestsTable.status);

  const recentPartners = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt)).limit(5);

  const recentOrders = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    partnerName: partnersTable.companyName,
    status: ordersTable.status,
    createdAt: ordersTable.createdAt,
    contactName: ordersTable.contactName,
    totalEstimate: ordersTable.totalEstimate,
  }).from(ordersTable).leftJoin(partnersTable, eq(ordersTable.partnerId, partnersTable.id)).orderBy(desc(ordersTable.createdAt)).limit(6);

  const lowInventory = await db.select({
    id: inventoryTable.id,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    onHand: inventoryTable.hardwareOnHand,
    reserved: inventoryTable.reserved,
    threshold: inventoryTable.lowInventoryThreshold,
  }).from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .where(sql`${inventoryTable.hardwareOnHand} - ${inventoryTable.reserved} <= ${inventoryTable.lowInventoryThreshold}`)
    .limit(8);

  const upcomingEvents = await db.select({
    id: eventsTable.id,
    name: eventsTable.name,
    eventStartDate: eventsTable.eventStartDate,
    shippingDeadline: eventsTable.shippingDeadline,
    partnerName: partnersTable.companyName,
    cityName: citiesTable.name,
  }).from(eventsTable)
    .leftJoin(partnersTable, eq(eventsTable.partnerId, partnersTable.id))
    .leftJoin(citiesTable, eq(eventsTable.cityId, citiesTable.id))
    .where(eq(eventsTable.status, "upcoming"))
    .orderBy(eventsTable.eventStartDate)
    .limit(6);

  // Catalog intelligence widgets
  const fulfillmentBreakdown: any = await db.execute(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN oi.fulfillment_mode = 'use_existing_partner_inventory' THEN o.id END)::int AS partner_inventory_orders,
      COUNT(DISTINCT CASE WHEN oi.fulfillment_mode = 'graphic_only' THEN o.id END)::int AS print_only_orders,
      COUNT(DISTINCT CASE WHEN oi.shortage_quantity > 0 THEN o.id END)::int AS orders_with_shortages,
      COALESCE(SUM(oi.shortage_quantity), 0)::int AS total_shortage_units
    FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status NOT IN ('cancelled','completed')
  `);
  const fb = fulfillmentBreakdown.rows?.[0] || {};

  const productsWithoutQuote: any = await db.execute(sql`
    SELECT COUNT(*)::int AS missing FROM product_catalog p
    WHERE p.is_active = true AND NOT EXISTS (
      SELECT 1 FROM quote_assets q WHERE q.attachable_type = 'product' AND q.attachable_id = p.id
    )
  `);

  const payload = {
    totalPartners: totalPartners?.count || 0,
    activePartners: activePartners?.count || 0,
    orderingPartners: orderingPartners?.count || 0,
    brandingPartners: brandingPartners?.count || 0,
    totalRequests: totalRequests?.count || 0,
    newRequestsToday: newToday?.count || 0,
    totalOrders: totalOrders?.count || 0,
    pendingOrders: pendingOrders?.count || 0,
    unassignedOrders: unassignedOrders?.count || 0,
    ordersToday: ordersToday?.count || 0,
    requestsByStatus: statusCounts,
    recentPartners,
    recentOrders,
    lowInventory,
    upcomingEvents,
    partnerInventoryOrders: Number(fb.partner_inventory_orders) || 0,
    printOnlyOrders: Number(fb.print_only_orders) || 0,
    ordersWithShortages: Number(fb.orders_with_shortages) || 0,
    totalShortageUnits: Number(fb.total_shortage_units) || 0,
    productsMissingQuote: Number(productsWithoutQuote.rows?.[0]?.missing) || 0,
  };
  const parsed = GetDashboardSummaryResponse.safeParse(payload);
  if (!parsed.success) {
    req.log.error({ err: parsed.error.flatten() }, "Dashboard summary response failed schema validation");
    res.status(500).json({ error: "Dashboard summary response failed schema validation", details: parsed.error.issues });
    return;
  }
  res.json(payload);
});

router.get("/dashboard/recent-requests", async (req, res): Promise<void> => {
  const params = GetRecentRequestsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 10) : 10;

  const requests = await db
    .select({
      id: requestsTable.id,
      partnerId: requestsTable.partnerId,
      partnerName: partnersTable.companyName,
      companyName: requestsTable.companyName,
      contactName: requestsTable.contactName,
      email: requestsTable.email,
      eventName: requestsTable.eventName,
      eventDate: requestsTable.eventDate,
      status: requestsTable.status,
      estimatedScopeLevel: requestsTable.estimatedScopeLevel,
      createdAt: requestsTable.createdAt,
    })
    .from(requestsTable)
    .leftJoin(partnersTable, eq(requestsTable.partnerId, partnersTable.id))
    .orderBy(desc(requestsTable.createdAt))
    .limit(limit);

  const parsed = GetRecentRequestsResponse.safeParse(requests);
  if (!parsed.success) {
    req.log.error({ err: parsed.error.flatten() }, "Recent requests response failed schema validation");
    res.status(500).json({ error: "Recent requests response failed schema validation", details: parsed.error.issues });
    return;
  }
  res.json(requests);
});

router.get("/dashboard/requests-by-status", async (req, res): Promise<void> => {
  const statusCounts = await db
    .select({
      status: requestsTable.status,
      count: count(),
    })
    .from(requestsTable)
    .groupBy(requestsTable.status);

  const parsed = GetRequestsByStatusResponse.safeParse(statusCounts);
  if (!parsed.success) {
    req.log.error({ err: parsed.error.flatten() }, "Requests-by-status response failed schema validation");
    res.status(500).json({ error: "Requests-by-status response failed schema validation", details: parsed.error.issues });
    return;
  }
  res.json(statusCounts);
});

router.get("/assets/library", async (req, res): Promise<void> => {
  const partners = await db.select().from(partnersTable).orderBy(partnersTable.companyName);
  const allPartnerAssets = await db.select().from(partnerAssetsTable);
  const allRequestUploads = await db
    .select({
      id: requestUploadsTable.id,
      requestId: requestUploadsTable.requestId,
      uploadType: requestUploadsTable.uploadType,
      fileUrl: requestUploadsTable.fileUrl,
      fileName: requestUploadsTable.fileName,
      mimeType: requestUploadsTable.mimeType,
      createdAt: requestUploadsTable.createdAt,
      eventName: requestsTable.eventName,
      partnerId: requestsTable.partnerId,
      partnerName: partnersTable.companyName,
    })
    .from(requestUploadsTable)
    .leftJoin(requestsTable, eq(requestUploadsTable.requestId, requestsTable.id))
    .leftJoin(partnersTable, eq(requestsTable.partnerId, partnersTable.id));

  const partnerAssetGroups = partners.map((p) => ({
    partnerId: p.id,
    partnerName: p.companyName,
    assets: allPartnerAssets.filter((a) => a.partnerId === p.id),
  })).filter((g) => g.assets.length > 0);

  const requestUploadMap = new Map<number, any>();
  for (const u of allRequestUploads) {
    if (!requestUploadMap.has(u.requestId)) {
      requestUploadMap.set(u.requestId, {
        requestId: u.requestId,
        eventName: u.eventName || "Unknown",
        partnerName: u.partnerName || "Unknown",
        uploads: [],
      });
    }
    requestUploadMap.get(u.requestId)!.uploads.push({
      id: u.id,
      requestId: u.requestId,
      uploadType: u.uploadType,
      fileUrl: u.fileUrl,
      fileName: u.fileName,
      mimeType: u.mimeType,
      createdAt: u.createdAt,
    });
  }

  const payload = {
    partnerAssets: partnerAssetGroups,
    requestUploads: Array.from(requestUploadMap.values()),
  };
  const parsed = GetAssetsLibraryResponse.safeParse(payload);
  if (!parsed.success) {
    req.log.error({ err: parsed.error.flatten() }, "Assets library response failed schema validation");
    res.status(500).json({ error: "Assets library response failed schema validation", details: parsed.error.issues });
    return;
  }
  res.json(payload);
});

export default router;
