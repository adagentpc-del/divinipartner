import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productCatalogTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ProductBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  isOrderable: z.boolean().optional(),
  allowsDesignRequest: z.boolean().optional(),
  sizeOptionsJson: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.string().optional(),
});

const UpdateProductBody = ProductBody.partial();

router.get("/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(productCatalogTable).orderBy(productCatalogTable.category, productCatalogTable.name);
  res.json(products);
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = ProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.insert(productCatalogTable).values(parsed.data).returning();
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

  const [product] = await db.update(productCatalogTable).set(parsed.data).where(eq(productCatalogTable.id, id)).returning();
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
