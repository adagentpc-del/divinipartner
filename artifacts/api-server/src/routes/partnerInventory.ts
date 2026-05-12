import { Router, type IRouter } from "express";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { db, inventoryTable, inventoryReservationsTable, citiesTable, eventsTable, partnersTable, productCatalogTable } from "@workspace/db";
import { GetPartnerInventorySummaryResponse } from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

router.get("/partners/:id/inventory-summary", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const inventory = await db.select({
    id: inventoryTable.id,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    name: inventoryTable.name,
    category: inventoryTable.category,
    assetType: inventoryTable.assetType,
    totalQuantity: inventoryTable.totalQuantity,
    reserved: inventoryTable.reserved,
    inUse: inventoryTable.inUse,
    damaged: inventoryTable.damaged,
    retired: inventoryTable.retired,
    onOrder: inventoryTable.onOrder,
    reorderThreshold: inventoryTable.reorderThreshold,
  }).from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .where(eq(inventoryTable.partnerId, partnerId))
    .orderBy(citiesTable.name, inventoryTable.name);

  const enriched = inventory.map(i => {
    const total = i.totalQuantity || 0;
    const used = (i.reserved || 0) + (i.inUse || 0) + (i.damaged || 0) + (i.retired || 0);
    const available = Math.max(0, total - used);
    const isLow = available <= (i.reorderThreshold || 0);
    const overcommitted = used > total;
    return { ...i, total, available, isLow, overcommitted, displayName: i.name || i.productName || "Unnamed asset" };
  });

  // Per-city aggregates
  const cityMap = new Map<number, { cityId: number; cityName: string | null; total: number; available: number; reserved: number; inUse: number; assetCount: number; lowCount: number }>();
  for (const r of enriched) {
    const k = r.cityId;
    if (!cityMap.has(k)) cityMap.set(k, { cityId: k, cityName: r.cityName, total: 0, available: 0, reserved: 0, inUse: 0, assetCount: 0, lowCount: 0 });
    const c = cityMap.get(k)!;
    c.total += r.total; c.available += r.available; c.reserved += (r.reserved || 0); c.inUse += (r.inUse || 0);
    c.assetCount += 1;
    if (r.isLow) c.lowCount += 1;
  }

  // Upcoming reservations (active or fulfilled), grouped by event
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const reservations = await db.select({
    id: inventoryReservationsTable.id,
    inventoryId: inventoryReservationsTable.inventoryId,
    inventoryName: inventoryTable.name,
    productName: productCatalogTable.name,
    eventId: inventoryReservationsTable.eventId,
    eventName: eventsTable.name,
    eventStartDate: eventsTable.eventStartDate,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    quantity: inventoryReservationsTable.quantity,
    status: inventoryReservationsTable.status,
    notes: inventoryReservationsTable.notes,
  }).from(inventoryReservationsTable)
    .innerJoin(inventoryTable, eq(inventoryReservationsTable.inventoryId, inventoryTable.id))
    .leftJoin(eventsTable, eq(inventoryReservationsTable.eventId, eventsTable.id))
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .where(and(eq(inventoryTable.partnerId, partnerId)))
    .orderBy(desc(eventsTable.eventStartDate));

  const todayStr = today.toISOString().slice(0, 10);
  const upcomingReservations = reservations.filter(r =>
    r.status !== "released" &&
    (!r.eventStartDate || r.eventStartDate >= todayStr)
  );

  // Group by event for the upcoming-commitments timeline
  const eventMap = new Map<number, { eventId: number; eventName: string | null; eventStartDate: string | null; cityName: string | null; reservations: typeof reservations; totalUnits: number; statuses: Record<string, number> }>();
  for (const r of upcomingReservations) {
    if (!r.eventId) continue;
    if (!eventMap.has(r.eventId)) eventMap.set(r.eventId, { eventId: r.eventId, eventName: r.eventName, eventStartDate: r.eventStartDate, cityName: r.cityName, reservations: [], totalUnits: 0, statuses: {} });
    const e = eventMap.get(r.eventId)!;
    e.reservations.push(r);
    e.totalUnits += r.quantity || 0;
    e.statuses[r.status] = (e.statuses[r.status] || 0) + 1;
  }

  const payload = {
    partnerId,
    partnerName: partner.companyName,
    cities: Array.from(cityMap.values()),
    inventory: enriched,
    reservations,
    upcomingByEvent: Array.from(eventMap.values()).sort((a, b) => (a.eventStartDate || "").localeCompare(b.eventStartDate || "")),
    totals: {
      assetCount: enriched.length,
      total: enriched.reduce((s, x) => s + x.total, 0),
      available: enriched.reduce((s, x) => s + x.available, 0),
      reserved: enriched.reduce((s, x) => s + (x.reserved || 0), 0),
      inUse: enriched.reduce((s, x) => s + (x.inUse || 0), 0),
      onOrder: enriched.reduce((s, x) => s + (x.onOrder || 0), 0),
      lowCount: enriched.filter(x => x.isLow).length,
      overcommittedCount: enriched.filter(x => x.overcommitted).length,
    },
  };
  sendValidated(req, res, GetPartnerInventorySummaryResponse, payload, "Get partner inventory summary");
});

export default router;
