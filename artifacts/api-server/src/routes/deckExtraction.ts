import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db, deckExtractionsTable, deckExtractionItemsTable,
  partnerBrandingLocationsTable, partnersTable
} from "@workspace/db";
import { z } from "zod";
import { processDeckExtraction } from "../lib/deckExtraction";

const router: IRouter = Router();

router.get("/partners/:partnerId/deck-extractions", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }

  const extractions = await db.select().from(deckExtractionsTable)
    .where(eq(deckExtractionsTable.partnerId, partnerId))
    .orderBy(desc(deckExtractionsTable.createdAt));

  res.json(extractions);
});

router.post("/partners/:partnerId/deck-extractions", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const schema = z.object({
    sourceFileUrl: z.string().min(1),
    sourceFileName: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.sourceFileUrl.startsWith("http")) {
    res.status(400).json({ error: "Only object storage paths are accepted, not external URLs" });
    return;
  }

  const [extraction] = await db.insert(deckExtractionsTable).values({
    partnerId,
    sourceFileUrl: parsed.data.sourceFileUrl,
    sourceFileName: parsed.data.sourceFileName,
    status: "processing",
  }).returning();

  try {
    const fileUrl = parsed.data.sourceFileUrl;
    let fileBuffer: Buffer;

    const internalRes = await fetch(`http://localhost:8080/api/storage/objects/${fileUrl.replace(/^\/+/, "")}`);
    if (internalRes.ok) {
      fileBuffer = Buffer.from(await internalRes.arrayBuffer());
    } else {
      const storageHost = process.env.REPLIT_OBJECT_STORAGE_URL || `https://${process.env.REPLIT_CONNECTORS_HOSTNAME}`;
      const fetchUrl = fileUrl.startsWith("/") ? `${storageHost}${fileUrl}` : `${storageHost}/${fileUrl}`;
      const externalRes = await fetch(fetchUrl);
      if (!externalRes.ok) throw new Error("Failed to fetch file from storage");
      fileBuffer = Buffer.from(await externalRes.arrayBuffer());
    }

    processDeckExtraction(extraction.id, partnerId, fileBuffer, parsed.data.sourceFileName).catch(err => {
      console.error("Background extraction failed:", err);
    });

    res.status(201).json(extraction);
  } catch (err: any) {
    await db.update(deckExtractionsTable)
      .set({ status: "failed", errorMessage: err.message })
      .where(eq(deckExtractionsTable.id, extraction.id));

    res.status(201).json({ ...extraction, status: "failed", errorMessage: err.message });
  }
});

router.get("/deck-extractions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [extraction] = await db.select().from(deckExtractionsTable).where(eq(deckExtractionsTable.id, id));
  if (!extraction) { res.status(404).json({ error: "Extraction not found" }); return; }

  const items = await db.select().from(deckExtractionItemsTable)
    .where(eq(deckExtractionItemsTable.extractionId, id))
    .orderBy(deckExtractionItemsTable.sourcePageNumber);

  res.json({ ...extraction, items });
});

router.patch("/deck-extraction-items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    locationName: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    sizeWidth: z.number().nullable().optional(),
    sizeHeight: z.number().nullable().optional(),
    sizeUnit: z.string().optional(),
    reviewStatus: z.string().optional(),
    isHidden: z.boolean().optional(),
    adminNotes: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db.update(deckExtractionItemsTable)
    .set(parsed.data)
    .where(eq(deckExtractionItemsTable.id, id))
    .returning();

  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(item);
});

router.delete("/deck-extraction-items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(deckExtractionItemsTable).where(eq(deckExtractionItemsTable.id, id));
  res.json({ ok: true });
});

router.post("/deck-extraction-items/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [original] = await db.select().from(deckExtractionItemsTable).where(eq(deckExtractionItemsTable.id, id));
  if (!original) { res.status(404).json({ error: "Item not found" }); return; }

  const { id: _, createdAt, updatedAt, ...rest } = original;
  const [dup] = await db.insert(deckExtractionItemsTable).values({
    ...rest,
    locationName: `${rest.locationName} (copy)`,
    reviewStatus: "pending",
  }).returning();

  res.status(201).json(dup);
});

router.post("/deck-extraction-items/approve", async (req, res): Promise<void> => {
  const schema = z.object({
    ids: z.array(z.number()).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const items = await db.select().from(deckExtractionItemsTable)
    .where(eq(deckExtractionItemsTable.extractionId, (
      await db.select({ extractionId: deckExtractionItemsTable.extractionId })
        .from(deckExtractionItemsTable)
        .where(eq(deckExtractionItemsTable.id, parsed.data.ids[0]))
    )[0]?.extractionId || 0));

  const toApprove = items.filter(i => parsed.data.ids.includes(i.id) && !i.isHidden);
  const created: number[] = [];

  for (const item of toApprove) {
    const [extraction] = await db.select().from(deckExtractionsTable)
      .where(eq(deckExtractionsTable.id, item.extractionId));

    const [loc] = await db.insert(partnerBrandingLocationsTable).values({
      partnerId: item.partnerId,
      name: item.locationName,
      category: item.category,
      description: item.description || "",
      sizeWidth: item.sizeWidth,
      sizeHeight: item.sizeHeight,
      sizeUnit: item.sizeUnit || "inches",
      sourcePageNumber: item.sourcePageNumber,
      sourceFileUrl: extraction?.sourceFileUrl || null,
      confidenceScore: item.confidenceScore,
      reviewStatus: "approved",
      isActive: true,
    }).returning();

    await db.update(deckExtractionItemsTable)
      .set({ reviewStatus: "approved" })
      .where(eq(deckExtractionItemsTable.id, item.id));

    created.push(loc.id);
  }

  res.json({ approved: created.length, locationIds: created });
});

export default router;
