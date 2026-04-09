import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, partnerSectionsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const SectionBody = z.object({
  sectionType: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  featuredImageUrl: z.string().optional(),
  featuredVideoUrl: z.string().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const UpdateSectionBody = SectionBody.partial();

router.get("/partners/:id/sections", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const sections = await db.select().from(partnerSectionsTable)
    .where(eq(partnerSectionsTable.partnerId, partnerId))
    .orderBy(partnerSectionsTable.sortOrder);
  res.json(sections);
});

router.post("/partners/:id/sections", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = SectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [section] = await db.insert(partnerSectionsTable).values({ ...parsed.data, partnerId }).returning();
  res.status(201).json(section);
});

router.patch("/partners/:id/sections/:sectionId", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  const sectionId = parseInt(req.params.sectionId);
  if (isNaN(partnerId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid ids" }); return; }

  const parsed = UpdateSectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [section] = await db.update(partnerSectionsTable)
    .set(parsed.data)
    .where(and(eq(partnerSectionsTable.id, sectionId), eq(partnerSectionsTable.partnerId, partnerId)))
    .returning();

  if (!section) { res.status(404).json({ error: "Section not found" }); return; }
  res.json(section);
});

router.delete("/partners/:id/sections/:sectionId", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  const sectionId = parseInt(req.params.sectionId);
  if (isNaN(partnerId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid ids" }); return; }

  const [deleted] = await db.delete(partnerSectionsTable)
    .where(and(eq(partnerSectionsTable.id, sectionId), eq(partnerSectionsTable.partnerId, partnerId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Section not found" }); return; }
  res.sendStatus(204);
});

router.put("/partners/:id/sections/bulk", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const sections = z.array(SectionBody).safeParse(req.body);
  if (!sections.success) { res.status(400).json({ error: sections.error.message }); return; }

  await db.delete(partnerSectionsTable).where(eq(partnerSectionsTable.partnerId, partnerId));

  const results = [];
  for (const section of sections.data) {
    const [created] = await db.insert(partnerSectionsTable).values({ ...section, partnerId }).returning();
    results.push(created);
  }

  res.json(results);
});

export default router;
