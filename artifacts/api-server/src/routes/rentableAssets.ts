import { Router } from "express";
import { db, inventoryTable, inventoryBlackoutsTable, inventoryReservationsTable, citiesTable, productCatalogTable, partnersTable, eventsTable, insertInventoryBlackoutSchema } from "@workspace/db";
import { and, eq, asc, desc, sql, isNull, or, lte, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { getInventoryAvailabilityForRange, isEligibleForEvent, parseDateRange } from "../lib/rentalAvailability";
import {
  ListPartnerRentableAssetsResponse, UpdateRentalInventoryResponse,
  ListInventoryBlackoutsResponse, UpdateInventoryBlackoutResponse, DeleteInventoryBlackoutResponse,
  GetInventoryBookingsResponse, GetInventoryAvailabilityResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: Router = Router();

/**
 * Section 27 — Partner rentable assets.
 * One row per inventory item, with optional date-window filter so the UI can
 * show "what's free for THIS event range" rather than just lifetime totals.
 */
router.get("/partners/:partnerId/rentable-assets", async (req, res): Promise<void> => {
  const partnerId = Number(req.params.partnerId);
  if (!partnerId) { res.status(400).json({ error: "invalid partnerId" }); return; }
  const dr = parseDateRange(req.query.start as string | undefined, req.query.end as string | undefined);
  if (!dr.ok) { res.status(400).json({ error: dr.error }); return; }
  const { start: startDate, end: endDate } = dr;
  const includeArchived = req.query.includeArchived === "1" || req.query.includeArchived === "true";

  const conditions = [eq(inventoryTable.partnerId, partnerId)];
  if (!includeArchived) conditions.push(isNull(inventoryTable.archivedAt));

  const rows = await db.select({
    id: inventoryTable.id,
    name: inventoryTable.name,
    category: inventoryTable.category,
    assetType: inventoryTable.assetType,
    rentable: inventoryTable.rentable,
    rentalPrice: inventoryTable.rentalPrice,
    priceBasis: inventoryTable.priceBasis,
    eligibilityMode: inventoryTable.eligibilityMode,
    eligibleEventIds: inventoryTable.eligibleEventIds,
    eligibleCityIds: inventoryTable.eligibleCityIds,
    archivedAt: inventoryTable.archivedAt,
    totalQuantity: inventoryTable.totalQuantity,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    productDisplayName: productCatalogTable.displayName,
    notes: inventoryTable.notes,
  })
    .from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .where(and(...conditions))
    .orderBy(desc(inventoryTable.rentable), asc(inventoryTable.name));

  // Per-row availability for the (optional) date window.
  const enriched = await Promise.all(rows.map(async (r) => {
    const avail = await getInventoryAvailabilityForRange(r.id, startDate, endDate);
    return { ...r, availability: avail };
  }));

  sendValidated(req, res, ListPartnerRentableAssetsResponse, { rows: enriched, window: { startDate, endDate } }, "Rentable assets");
});

/**
 * Patch the rentable-asset attributes of an existing inventory row. Quantity
 * mutations stay in the existing /api/inventory route — this endpoint is for
 * the rentable + pricing + eligibility + archive layer only.
 */
const patchRentalSchema = z.object({
  rentable: z.boolean().optional(),
  rentalPrice: z.string().nullable().optional(),
  priceBasis: z.enum(["per_event", "per_day"]).optional(),
  eligibilityMode: z.enum(["all", "allowlist"]).optional(),
  eligibleEventIds: z.array(z.number()).optional(),
  eligibleCityIds: z.array(z.number()).optional(),
  archivedAt: z.string().nullable().optional(),
  name: z.string().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
router.patch("/inventory/:id/rental", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = patchRentalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const patch: any = { ...parsed.data };
  if (patch.archivedAt) patch.archivedAt = new Date(patch.archivedAt);
  const [updated] = await db.update(inventoryTable).set(patch).where(eq(inventoryTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "not found" }); return; }
  sendValidated(req, res, UpdateRentalInventoryResponse, { row: updated }, "Rental inventory update");
});

/**
 * Blackouts CRUD — list, create, update, delete. List supports an optional
 * date-window filter for calendar-style UI.
 */
router.get("/inventory/:id/blackouts", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dr = parseDateRange(req.query.start as string | undefined, req.query.end as string | undefined);
  if (!dr.ok) { res.status(400).json({ error: dr.error }); return; }
  const conditions = [eq(inventoryBlackoutsTable.inventoryId, id)];
  if (dr.start && dr.end) {
    conditions.push(lte(inventoryBlackoutsTable.startDate, dr.end));
    conditions.push(gte(inventoryBlackoutsTable.endDate, dr.start));
  }
  const rows = await db.select().from(inventoryBlackoutsTable)
    .where(and(...conditions))
    .orderBy(asc(inventoryBlackoutsTable.startDate));
  sendValidated(req, res, ListInventoryBlackoutsResponse, { rows }, "Inventory blackouts");
});

router.post("/inventory/:id/blackouts", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = insertInventoryBlackoutSchema.safeParse({ ...req.body, inventoryId: id });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.startDate > parsed.data.endDate) { res.status(400).json({ error: "startDate must be on or before endDate" }); return; }
  const [row] = await db.insert(inventoryBlackoutsTable).values(parsed.data).returning();
  res.status(201).json({ row });
});

// Whitelisted mutable fields. inventoryId is intentionally excluded so a PATCH
// can't re-parent a blackout to a different inventory row after the auth check.
const patchBlackoutSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  quantity: z.number().int().nonnegative().optional(),
  reason: z.enum(["manual", "maintenance", "damage", "internal", "venue", "pending_event"]).optional(),
  reasonNote: z.string().nullable().optional(),
  eventId: z.number().int().nullable().optional(),
}).strict();
router.patch("/inventory/:id/blackouts/:blackoutId", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const blackoutId = Number(req.params.blackoutId);
  const parsed = patchBlackoutSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.startDate > parsed.data.endDate) {
    res.status(400).json({ error: "startDate must be on or before endDate" }); return;
  }
  // Scope by parent inventory id so a guessed blackoutId can't reach a row
  // belonging to a different inventory.
  const [row] = await db.update(inventoryBlackoutsTable).set(parsed.data)
    .where(and(eq(inventoryBlackoutsTable.id, blackoutId), eq(inventoryBlackoutsTable.inventoryId, id)))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  sendValidated(req, res, UpdateInventoryBlackoutResponse, { row }, "Blackout update");
});

router.delete("/inventory/:id/blackouts/:blackoutId", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const blackoutId = Number(req.params.blackoutId);
  const result = await db.delete(inventoryBlackoutsTable)
    .where(and(eq(inventoryBlackoutsTable.id, blackoutId), eq(inventoryBlackoutsTable.inventoryId, id)))
    .returning();
  if (!result.length) { res.status(404).json({ error: "not found" }); return; }
  sendValidated(req, res, DeleteInventoryBlackoutResponse, { ok: true }, "Blackout delete");
});

/**
 * Combined bookings list: every reservation + blackout for an inventory row,
 * joined with event metadata. Powers the right-hand "upcoming bookings"
 * panel in the rentable assets card.
 */
router.get("/inventory/:id/bookings", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const reservations = await db.select({
    id: inventoryReservationsTable.id,
    quantity: inventoryReservationsTable.quantity,
    startDate: inventoryReservationsTable.startDate,
    endDate: inventoryReservationsTable.endDate,
    status: inventoryReservationsTable.status,
    holdReason: inventoryReservationsTable.holdReason,
    notes: inventoryReservationsTable.notes,
    eventId: inventoryReservationsTable.eventId,
    eventName: eventsTable.name,
    eventDate: eventsTable.eventStartDate,
  }).from(inventoryReservationsTable)
    .leftJoin(eventsTable, eq(eventsTable.id, inventoryReservationsTable.eventId))
    .where(and(
      eq(inventoryReservationsTable.inventoryId, id),
      eq(inventoryReservationsTable.status, "active"),
    ))
    .orderBy(asc(inventoryReservationsTable.startDate));

  const blackouts = await db.select({
    id: inventoryBlackoutsTable.id,
    quantity: inventoryBlackoutsTable.quantity,
    startDate: inventoryBlackoutsTable.startDate,
    endDate: inventoryBlackoutsTable.endDate,
    reason: inventoryBlackoutsTable.reason,
    reasonNote: inventoryBlackoutsTable.reasonNote,
    eventId: inventoryBlackoutsTable.eventId,
    eventName: eventsTable.name,
  }).from(inventoryBlackoutsTable)
    .leftJoin(eventsTable, eq(eventsTable.id, inventoryBlackoutsTable.eventId))
    .where(eq(inventoryBlackoutsTable.inventoryId, id))
    .orderBy(asc(inventoryBlackoutsTable.startDate));

  sendValidated(req, res, GetInventoryBookingsResponse, { reservations, blackouts }, "Inventory bookings");
});

/**
 * Date-windowed availability lookup for a single inventory row. Powers the
 * "is this asset free for Event X" checks in ordering UIs.
 */
router.get("/inventory/:id/availability", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dr = parseDateRange(req.query.start as string | undefined, req.query.end as string | undefined);
  if (!dr.ok) { res.status(400).json({ error: dr.error }); return; }
  const eventId = req.query.eventId ? Number(req.query.eventId) : null;
  const eventCityId = req.query.eventCityId ? Number(req.query.eventCityId) : null;

  const avail = await getInventoryAvailabilityForRange(id, dr.start, dr.end);
  if (!avail) { res.status(404).json({ error: "not found" }); return; }
  const [row] = await db.select({
    eligibilityMode: inventoryTable.eligibilityMode,
    eligibleEventIds: inventoryTable.eligibleEventIds,
    eligibleCityIds: inventoryTable.eligibleCityIds,
    cityId: inventoryTable.cityId,
  }).from(inventoryTable).where(eq(inventoryTable.id, id));
  const eligible = row ? isEligibleForEvent(row as any, eventId, eventCityId) : false;
  sendValidated(req, res, GetInventoryAvailabilityResponse, { availability: avail, eligible }, "Inventory availability");
});

export default router;
