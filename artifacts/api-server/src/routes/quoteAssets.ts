import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, quoteAssetsTable } from "@workspace/db";
import { z } from "zod";

const QuoteAssetBody = z.object({
  attachableType: z.enum(["product", "package", "branding_zone", "supplier"]),
  attachableId: z.number().int(),
  name: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  isApprovedStandard: z.boolean().optional(),
  internalOnly: z.boolean().optional(),
  vendorVisible: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  uploadedBy: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  dimensionsSummary: z.string().nullable().optional(),
  materialSummary: z.string().nullable().optional(),
  attachmentSummary: z.string().nullable().optional(),
  hardwareSummary: z.string().nullable().optional(),
});

function isValidStoragePath(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.includes("..")) return false;
  // Allow internal object paths like "/objects/..." (returned by storage normalize)
  if (url.startsWith("/") && !url.startsWith("/objects/")) return false;
  return true;
}

const router: IRouter = Router();

router.get("/quote-assets", async (req, res) => {
  const { attachableType, attachableId } = req.query;
  const conditions = [];
  if (attachableType) conditions.push(eq(quoteAssetsTable.attachableType, String(attachableType)));
  if (attachableId) conditions.push(eq(quoteAssetsTable.attachableId, parseInt(String(attachableId))));
  const rows = conditions.length
    ? await db.select().from(quoteAssetsTable).where(and(...conditions)).orderBy(quoteAssetsTable.createdAt)
    : await db.select().from(quoteAssetsTable).orderBy(quoteAssetsTable.createdAt);
  res.json(rows);
});

router.post("/quote-assets", async (req, res): Promise<void> => {
  const parsed = QuoteAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isValidStoragePath(parsed.data.fileUrl)) {
    res.status(400).json({ error: "Invalid file URL" });
    return;
  }
  const [row] = await db.insert(quoteAssetsTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/quote-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = QuoteAssetBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.fileUrl && !isValidStoragePath(parsed.data.fileUrl)) {
    res.status(400).json({ error: "Invalid file URL" });
    return;
  }
  const [row] = await db.update(quoteAssetsTable).set(parsed.data).where(eq(quoteAssetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/quote-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(quoteAssetsTable).where(eq(quoteAssetsTable.id, id));
  res.json({ success: true });
});

export default router;
