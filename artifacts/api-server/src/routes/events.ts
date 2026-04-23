import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, eventsTable, citiesTable, venuesTable } from "@workspace/db";
import { z } from "zod";
import { emit as usageEmit, emitFirst as usageEmitFirst } from "../services/usageTracking";

const EventBody = z.object({
  partnerId: z.number().int(),
  cityId: z.number().int().nullable().optional(),
  venueId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  slug: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  eventStartDate: z.string().nullable().optional(),
  eventEndDate: z.string().nullable().optional(),
  installDate: z.string().nullable().optional(),
  teardownDate: z.string().nullable().optional(),
  shippingDeadline: z.string().nullable().optional(),
  orderingOpensAt: z.string().nullable().optional(),
  orderingClosesAt: z.string().nullable().optional(),
  venueContactsJson: z.array(z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional() })).nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["draft", "upcoming", "live", "completed", "archived"]).optional(),
  availablePackageIdsJson: z.array(z.number().int()).nullable().optional(),
  availableProductIdsJson: z.array(z.number().int()).nullable().optional(),
  quantityLimitsJson: z.record(z.string(), z.number()).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  unitPreference: z.enum(["imperial", "metric"]).nullable().optional(),
  // Currency / tax overrides (nullable = inherit from partner default).
  currency: z.string().nullable().optional(),
  taxMode: z.string().nullable().optional(),
  taxLabel: z.string().nullable().optional(),
  taxRate: z.union([z.string(), z.number()]).nullable().optional().transform(v => v == null || v === "" ? null : String(v)),
  taxInclusive: z.boolean().nullable().optional(),
  // Partner-add-on override (Section 35). null/undefined → inherit.
  addonOverrideJson: z.object({
    mode: z.enum(["inherit", "override"]),
    productIds: z.array(z.number().int().positive()).optional(),
  }).nullable().optional(),
});

const router: IRouter = Router();

router.get("/events", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const conditions = [];
  if (partnerId) conditions.push(eq(eventsTable.partnerId, partnerId));
  const rows = await db.select({
    id: eventsTable.id,
    partnerId: eventsTable.partnerId,
    cityId: eventsTable.cityId,
    cityName: citiesTable.name,
    venueId: eventsTable.venueId,
    venueName: venuesTable.name,
    name: eventsTable.name,
    slug: eventsTable.slug,
    description: eventsTable.description,
    eventStartDate: eventsTable.eventStartDate,
    eventEndDate: eventsTable.eventEndDate,
    installDate: eventsTable.installDate,
    teardownDate: eventsTable.teardownDate,
    shippingDeadline: eventsTable.shippingDeadline,
    orderingOpensAt: eventsTable.orderingOpensAt,
    orderingClosesAt: eventsTable.orderingClosesAt,
    venueContactsJson: eventsTable.venueContactsJson,
    notes: eventsTable.notes,
    status: eventsTable.status,
    availablePackageIdsJson: eventsTable.availablePackageIdsJson,
    availableProductIdsJson: eventsTable.availableProductIdsJson,
    quantityLimitsJson: eventsTable.quantityLimitsJson,
    imageUrl: eventsTable.imageUrl,
    isActive: eventsTable.isActive,
    createdAt: eventsTable.createdAt,
    unitPreference: eventsTable.unitPreference,
    addonOverrideJson: eventsTable.addonOverrideJson,
  }).from(eventsTable)
    .leftJoin(citiesTable, eq(eventsTable.cityId, citiesTable.id))
    .leftJoin(venuesTable, eq(eventsTable.venueId, venuesTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(eventsTable.eventStartDate);
  res.json(rows);
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = EventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(eventsTable).values(parsed.data).returning();
  if (row?.partnerId) {
    usageEmit("event.created", { partnerId: row.partnerId, objectType: "event", objectId: row.id }).catch(() => {});
    usageEmitFirst("first_event_created", { partnerId: row.partnerId, objectType: "event", objectId: row.id }).catch(() => {});
  }
  res.status(201).json(row);
});

router.post("/events/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [src] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  const { id: _, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [row] = await db.insert(eventsTable).values({ ...rest, name: `${src.name} (Copy)`, status: "draft", isActive: false }).returning();
  res.status(201).json(row);
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = EventBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(eventsTable).set(parsed.data).where(eq(eventsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.json({ success: true });
});

export default router;
