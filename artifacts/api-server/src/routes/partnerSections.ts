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

  // Section 22 fix: bulk replace MUST be atomic. Without a transaction, a
  // mid-operation failure could leave the partner with deleted-but-not-
  // re-inserted sections (data loss). Wrap delete + inserts in a single
  // db.transaction so any failure rolls back to the prior state.
  try {
    const results = await db.transaction(async (tx) => {
      await tx.delete(partnerSectionsTable).where(eq(partnerSectionsTable.partnerId, partnerId));
      const inserted: any[] = [];
      for (let i = 0; i < sections.data.length; i++) {
        const section = sections.data[i];
        // Normalize sortOrder to the request array index so the client's
        // visual order is the source of truth, regardless of any stale
        // sortOrder values the client may have sent.
        const [created] = await tx.insert(partnerSectionsTable)
          .values({ ...section, partnerId, sortOrder: i })
          .returning();
        inserted.push(created);
      }
      return inserted;
    });
    res.json(results);
  } catch (e: any) {
    console.error("[partnerSections.bulk] transaction failed:", e?.message || e);
    res.status(500).json({ error: "Failed to save sections; existing sections were not modified." });
  }
});

export default router;
