import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, partnerBrandingLocationsTable, withMmColumns } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const LocationBody = z.object({
  name: z.string().min(1),
  internalCode: z.string().optional(),
  category: z.string().min(1),
  description: z.string().optional(),
  sizeWidth: z.number().optional(),
  sizeHeight: z.number().optional(),
  sizeDepth: z.number().optional(),
  sizeDiameter: z.number().optional(),
  sizeUnit: z.string().optional(),
  sourcePageNumber: z.number().optional(),
  sourceFileUrl: z.string().optional(),
  previewImageUrl: z.string().optional(),
  confidenceScore: z.number().optional(),
  productionNotesInternal: z.string().optional(),
  installNotesInternal: z.string().optional(),
  templateFileUrl: z.string().optional(),
  artworkGuidelines: z.string().optional(),
  reviewStatus: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const UpdateLocationBody = LocationBody.partial();

router.get("/partners/:id/branding-locations", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const locations = await db.select().from(partnerBrandingLocationsTable)
    .where(eq(partnerBrandingLocationsTable.partnerId, partnerId))
    .orderBy(partnerBrandingLocationsTable.sortOrder);
  res.json(locations);
});

router.post("/partners/:id/branding-locations", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = LocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [location] = await db.insert(partnerBrandingLocationsTable).values(withMmColumns({ ...parsed.data, partnerId })).returning();
  res.status(201).json(location);
});

router.post("/partners/:id/branding-locations/bulk", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = z.array(LocationBody).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const results = [];
  for (const loc of parsed.data) {
    const [created] = await db.insert(partnerBrandingLocationsTable).values(withMmColumns({ ...loc, partnerId })).returning();
    results.push(created);
  }
  res.status(201).json(results);
});

router.patch("/partners/:id/branding-locations/:locationId", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  if (isNaN(partnerId) || isNaN(locationId)) { res.status(400).json({ error: "Invalid ids" }); return; }

  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [location] = await db.update(partnerBrandingLocationsTable)
    .set(withMmColumns(parsed.data))
    .where(and(eq(partnerBrandingLocationsTable.id, locationId), eq(partnerBrandingLocationsTable.partnerId, partnerId)))
    .returning();

  if (!location) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(location);
});

router.delete("/partners/:id/branding-locations/:locationId", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  if (isNaN(partnerId) || isNaN(locationId)) { res.status(400).json({ error: "Invalid ids" }); return; }

  const [deleted] = await db.delete(partnerBrandingLocationsTable)
    .where(and(eq(partnerBrandingLocationsTable.id, locationId), eq(partnerBrandingLocationsTable.partnerId, partnerId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Location not found" }); return; }
  res.sendStatus(204);
});

router.post("/partners/:id/branding-locations/bulk-update", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = z.object({
    ids: z.array(z.number()),
    update: UpdateLocationBody,
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const results = [];
  for (const id of parsed.data.ids) {
    const [updated] = await db.update(partnerBrandingLocationsTable)
      .set(withMmColumns(parsed.data.update))
      .where(and(eq(partnerBrandingLocationsTable.id, id), eq(partnerBrandingLocationsTable.partnerId, partnerId)))
      .returning();
    if (updated) results.push(updated);
  }
  res.json(results);
});

export default router;
