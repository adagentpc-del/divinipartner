import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, venuesTable, citiesTable } from "@workspace/db";
import { z } from "zod";

const VenueBody = z.object({
  partnerId: z.number().int().nullable().optional(),
  cityId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  venueAddress: z.string().nullable().optional(),
  shippingAddress: z.string().nullable().optional(),
  onsiteContactName: z.string().nullable().optional(),
  onsiteContactPhone: z.string().nullable().optional(),
  onsiteContactEmail: z.string().nullable().optional(),
  installNotes: z.string().nullable().optional(),
  shippingInstructions: z.string().nullable().optional(),
  deadlineNotes: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const router: IRouter = Router();

router.get("/venues", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const cityId = req.query.cityId ? parseInt(String(req.query.cityId)) : null;
  const conditions = [];
  if (partnerId) conditions.push(eq(venuesTable.partnerId, partnerId));
  if (cityId) conditions.push(eq(venuesTable.cityId, cityId));
  const rows = await db.select({
    id: venuesTable.id,
    partnerId: venuesTable.partnerId,
    cityId: venuesTable.cityId,
    cityName: citiesTable.name,
    name: venuesTable.name,
    venueAddress: venuesTable.venueAddress,
    shippingAddress: venuesTable.shippingAddress,
    onsiteContactName: venuesTable.onsiteContactName,
    onsiteContactPhone: venuesTable.onsiteContactPhone,
    onsiteContactEmail: venuesTable.onsiteContactEmail,
    installNotes: venuesTable.installNotes,
    shippingInstructions: venuesTable.shippingInstructions,
    deadlineNotes: venuesTable.deadlineNotes,
    imageUrl: venuesTable.imageUrl,
    isActive: venuesTable.isActive,
    sortOrder: venuesTable.sortOrder,
    createdAt: venuesTable.createdAt,
  }).from(venuesTable).leftJoin(citiesTable, eq(venuesTable.cityId, citiesTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(venuesTable.sortOrder, venuesTable.name);
  res.json(rows);
});

router.post("/venues", async (req, res): Promise<void> => {
  const parsed = VenueBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(venuesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.post("/venues/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [src] = await db.select().from(venuesTable).where(eq(venuesTable.id, id));
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  const { id: _, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [row] = await db.insert(venuesTable).values({ ...rest, name: `${src.name} (Copy)` }).returning();
  res.status(201).json(row);
});

router.patch("/venues/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = VenueBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(venuesTable).set(parsed.data).where(eq(venuesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/venues/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(venuesTable).where(eq(venuesTable.id, id));
  res.json({ success: true });
});

export default router;
