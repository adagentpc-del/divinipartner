import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, packagesTable, packageItemsTable, productCatalogTable } from "@workspace/db";
import { z } from "zod";

const PackageBody = z.object({
  partnerId: z.number().int().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  displayName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tier: z.number().int().min(1).max(10).optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  currency: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const PackageItemBody = z.object({
  productId: z.number().int(),
  quantity: z.number().int().min(1).optional(),
  isOptional: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const router: IRouter = Router();

router.get("/packages", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const conditions = partnerId ? [eq(packagesTable.partnerId, partnerId)] : [];
  const rows = await db.select().from(packagesTable)
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(packagesTable.tier, packagesTable.sortOrder);
  res.json(rows);
});

router.get("/packages/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
  if (!pkg) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select({
    id: packageItemsTable.id,
    packageId: packageItemsTable.packageId,
    productId: packageItemsTable.productId,
    quantity: packageItemsTable.quantity,
    isOptional: packageItemsTable.isOptional,
    notes: packageItemsTable.notes,
    sortOrder: packageItemsTable.sortOrder,
    productName: productCatalogTable.name,
    productCategory: productCatalogTable.category,
    productImageUrl: productCatalogTable.imageUrl,
  }).from(packageItemsTable)
    .leftJoin(productCatalogTable, eq(packageItemsTable.productId, productCatalogTable.id))
    .where(eq(packageItemsTable.packageId, id))
    .orderBy(packageItemsTable.sortOrder);
  res.json({ ...pkg, items });
});

router.post("/packages", async (req, res): Promise<void> => {
  const parsed = PackageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(packagesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.post("/packages/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [src] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  const { id: _, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [row] = await db.insert(packagesTable).values({ ...rest, name: `${src.name} (Copy)`, isActive: false }).returning();
  const items = await db.select().from(packageItemsTable).where(eq(packageItemsTable.packageId, id));
  if (items.length) {
    await db.insert(packageItemsTable).values(items.map(({ id: _i, createdAt: _ic, ...item }) => ({ ...item, packageId: row.id })));
  }
  res.status(201).json(row);
});

router.patch("/packages/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PackageBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(packagesTable).set(parsed.data).where(eq(packagesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/packages/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(packagesTable).where(eq(packagesTable.id, id));
  res.json({ success: true });
});

router.post("/packages/:id/items", async (req, res): Promise<void> => {
  const packageId = parseInt(req.params.id);
  if (isNaN(packageId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PackageItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(packageItemsTable).values({ ...parsed.data, packageId }).returning();
  res.status(201).json(row);
});

router.patch("/package-items/:itemId", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PackageItemBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(packageItemsTable).set(parsed.data).where(eq(packageItemsTable.id, itemId)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/package-items/:itemId", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(packageItemsTable).where(eq(packageItemsTable.id, itemId));
  res.json({ success: true });
});

export default router;
