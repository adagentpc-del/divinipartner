import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, inventoryTable, citiesTable, productCatalogTable } from "@workspace/db";
import { z } from "zod";

const InventoryBody = z.object({
  cityId: z.number().int(),
  productId: z.number().int(),
  hardwareOnHand: z.number().int().min(0).optional(),
  reserved: z.number().int().min(0).optional(),
  damaged: z.number().int().min(0).optional(),
  graphicOnlyAvailable: z.boolean().optional(),
  lowInventoryThreshold: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const router: IRouter = Router();

router.get("/inventory", async (req, res) => {
  const cityId = req.query.cityId ? parseInt(String(req.query.cityId)) : null;
  const productId = req.query.productId ? parseInt(String(req.query.productId)) : null;
  const conditions = [];
  if (cityId) conditions.push(eq(inventoryTable.cityId, cityId));
  if (productId) conditions.push(eq(inventoryTable.productId, productId));
  const rows = await db.select({
    id: inventoryTable.id,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    productCategory: productCatalogTable.category,
    hardwareOnHand: inventoryTable.hardwareOnHand,
    reserved: inventoryTable.reserved,
    damaged: inventoryTable.damaged,
    graphicOnlyAvailable: inventoryTable.graphicOnlyAvailable,
    lowInventoryThreshold: inventoryTable.lowInventoryThreshold,
    notes: inventoryTable.notes,
    updatedAt: inventoryTable.updatedAt,
  }).from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(citiesTable.name, productCatalogTable.name);
  res.json(rows);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = InventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [row] = await db.insert(inventoryTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Insert failed" });
  }
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = InventoryBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(inventoryTable).set(parsed.data).where(eq(inventoryTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/inventory/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(inventoryTable).where(eq(inventoryTable.id, id));
  res.json({ success: true });
});

export default router;
