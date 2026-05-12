import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productCatalogTable, withMmColumns, withWeightColumns } from "@workspace/db";
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
  artworkUnit: z.string().nullable().optional(),
  artworkWidth: z.number().nullable().optional(),
  artworkHeight: z.number().nullable().optional(),
  bleed: z.number().nullable().optional(),
  safeArea: z.number().nullable().optional(),
  visibleWidth: z.number().nullable().optional(),
  visibleHeight: z.number().nullable().optional(),
  pricingModel: z.enum(["fixed", "area", "linear", "quantity", "custom_quote"]).optional(),
  unitRate: z.union([z.number(), z.string(), z.null()]).optional()
    .transform((v) => (v == null ? null : String(v))),
  pricingUnit: z.enum(["per_unit", "per_sqft", "per_sqm", "per_linear_ft", "per_linear_m"]).nullable().optional(),
  minBillableSize: z.number().nullable().optional(),
  minCharge: z.union([z.number(), z.string(), z.null()]).optional()
    .transform((v) => (v == null ? null : String(v))),
  allowsCustomSize: z.boolean().optional(),
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
  // Shipping & packing defaults (April 2026 logistics extension).
  packedWidth: z.number().nullable().optional(),
  packedHeight: z.number().nullable().optional(),
  packedDepth: z.number().nullable().optional(),
  packedSizeUnit: z.string().nullable().optional(),
  shippingWeight: z.number().nullable().optional(),
  shippingWeightUnit: z.string().nullable().optional(),
  cartonCount: z.number().int().nullable().optional(),
  packingMode: z.enum(["rolled", "flat", "boxed", "crated"]).nullable().optional(),
  crateRequired: z.boolean().optional(),
  palletRequired: z.boolean().optional(),
  oversizeFlag: z.boolean().optional(),
  freightClass: z.string().nullable().optional(),
  installKitNotes: z.string().nullable().optional(),
});

const UpdateProductBody = ProductBody.partial();

router.get("/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(productCatalogTable).orderBy(productCatalogTable.category, productCatalogTable.name);
  res.json(products);
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = ProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.insert(productCatalogTable).values(withWeightColumns(withMmColumns(parsed.data))).returning();
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

  const [existing] = await db.select().from(productCatalogTable).where(eq(productCatalogTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  const [product] = await db.update(productCatalogTable).set(withWeightColumns(withMmColumns(parsed.data, { sizeUnit: existing.sizeUnit, artworkUnit: existing.artworkUnit, packedSizeUnit: existing.packedSizeUnit }), { shippingWeightUnit: existing.shippingWeightUnit })).where(eq(productCatalogTable.id, id)).returning();
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
