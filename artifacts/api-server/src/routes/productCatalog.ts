import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productCatalogTable, withMmColumns } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ProductBody = z.object({
  name: z.string().min(1),
  displayName: z.string().nullable().optional(),
  slug: z.string().min(1),
  sku: z.string().nullable().optional(),
  category: z.string().min(1),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  galleryImagesJson: z.array(z.string()).nullable().optional(),
  visibleDimensions: z.string().nullable().optional(),
  sizeWidth: z.number().nullable().optional(),
  sizeHeight: z.number().nullable().optional(),
  sizeDepth: z.number().nullable().optional(),
  sizeDiameter: z.number().nullable().optional(),
  sizeUnit: z.string().nullable().optional(),
  backendProductionNotes: z.string().nullable().optional(),
  installNotes: z.string().nullable().optional(),
  internalOpsSummary: z.string().nullable().optional(),
  featureBadgesJson: z.array(z.string()).nullable().optional(),
  hardwareIncluded: z.boolean().optional(),
  printOnlyAvailable: z.boolean().optional(),
  rentalEligible: z.boolean().optional(),
  usePartnerInventoryEligible: z.boolean().optional(),
  reusableHardwareCompatible: z.boolean().optional(),
  inventoryTracked: z.boolean().optional(),
  requiresAttachmentSelection: z.boolean().optional(),
  requiresMaterialSelection: z.boolean().optional(),
  attachmentMethod: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  finishing: z.string().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  leadTimeDays: z.number().int().nullable().optional(),
  isOrderable: z.boolean().optional(),
  allowsDesignRequest: z.boolean().optional(),
  sizeOptionsJson: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.string().nullable().optional(),
  customerFacingSummary: z.string().nullable().optional(),
  reviewStatus: z.enum(["new", "in_review", "needs_clarification", "approved", "archived"]).optional(),
  missingDataFlagsJson: z.array(z.string()).nullable().optional(),
});

const UpdateProductBody = ProductBody.partial();

router.get("/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(productCatalogTable).orderBy(productCatalogTable.category, productCatalogTable.name);
  res.json(products);
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = ProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.insert(productCatalogTable).values(withMmColumns(parsed.data)).returning();
  res.status(201).json(product);
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [product] = await db.select().from(productCatalogTable).where(eq(productCatalogTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.update(productCatalogTable).set(withMmColumns(parsed.data)).where(eq(productCatalogTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(productCatalogTable).where(eq(productCatalogTable.id, id));
  res.sendStatus(204);
});

export default router;
