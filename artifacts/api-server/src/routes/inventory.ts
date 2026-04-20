import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  db,
  inventoryTable,
  inventoryReservationsTable,
  citiesTable,
  productCatalogTable,
  partnersTable,
  eventsTable,
} from "@workspace/db";
import { z } from "zod";

const InventoryBody = z.object({
  partnerId: z.number().int().nullable().optional(),
  cityId: z.number().int(),
  productId: z.number().int().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  assetType: z.enum(["hardware", "reusable_asset"]).optional(),
  storageLocation: z.string().max(200).nullable().optional(),
  totalQuantity: z.number().int().min(0).optional(),
  hardwareOnHand: z.number().int().min(0).optional(),
  reserved: z.number().int().min(0).optional(),
  inUse: z.number().int().min(0).optional(),
  damaged: z.number().int().min(0).optional(),
  retired: z.number().int().min(0).optional(),
  onOrder: z.number().int().min(0).optional(),
  reorderThreshold: z.number().int().min(0).optional(),
  graphicOnlyAvailable: z.boolean().optional(),
  lowInventoryThreshold: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const ReservationBody = z.object({
  inventoryId: z.number().int(),
  eventId: z.number().int(),
  quantity: z.number().int().min(1),
  status: z.enum(["active", "released", "fulfilled"]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

const router: IRouter = Router();

function shapeInventoryRow(r: any) {
  const total = r.totalQuantity > 0 ? r.totalQuantity : r.hardwareOnHand;
  const reorder = r.reorderThreshold > 0 ? r.reorderThreshold : r.lowInventoryThreshold;
  const accountedFor = r.reserved + r.inUse + r.damaged + r.retired;
  const available = Math.max(0, total - accountedFor);
  const overcommitted = accountedFor > total;
  const isLow = available <= reorder;
  return {
    ...r,
    total,
    available,
    accountedFor,
    overcommitted,
    isLow,
    reorderThreshold: reorder,
    displayName: r.name || r.productName || "Untracked Asset",
  };
}

router.get("/inventory", async (req, res) => {
  const cityId = req.query.cityId ? parseInt(String(req.query.cityId)) : null;
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const productId = req.query.productId ? parseInt(String(req.query.productId)) : null;
  const conditions = [];
  if (cityId) conditions.push(eq(inventoryTable.cityId, cityId));
  if (partnerId) conditions.push(eq(inventoryTable.partnerId, partnerId));
  if (productId) conditions.push(eq(inventoryTable.productId, productId));
  const rows = await db.select({
    id: inventoryTable.id,
    partnerId: inventoryTable.partnerId,
    partnerName: partnersTable.companyName,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    productCategory: productCatalogTable.category,
    name: inventoryTable.name,
    category: inventoryTable.category,
    assetType: inventoryTable.assetType,
    storageLocation: inventoryTable.storageLocation,
    totalQuantity: inventoryTable.totalQuantity,
    hardwareOnHand: inventoryTable.hardwareOnHand,
    reserved: inventoryTable.reserved,
    inUse: inventoryTable.inUse,
    damaged: inventoryTable.damaged,
    retired: inventoryTable.retired,
    onOrder: inventoryTable.onOrder,
    reorderThreshold: inventoryTable.reorderThreshold,
    graphicOnlyAvailable: inventoryTable.graphicOnlyAvailable,
    lowInventoryThreshold: inventoryTable.lowInventoryThreshold,
    notes: inventoryTable.notes,
    updatedAt: inventoryTable.updatedAt,
  }).from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .leftJoin(partnersTable, eq(inventoryTable.partnerId, partnersTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(citiesTable.name, inventoryTable.name, productCatalogTable.name);
  res.json(rows.map(shapeInventoryRow));
});

router.get("/inventory/shortages", async (_req, res) => {
  const rows = await db.select({
    id: inventoryTable.id,
    partnerId: inventoryTable.partnerId,
    partnerName: partnersTable.companyName,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
    productId: inventoryTable.productId,
    productName: productCatalogTable.name,
    name: inventoryTable.name,
    category: inventoryTable.category,
    assetType: inventoryTable.assetType,
    storageLocation: inventoryTable.storageLocation,
    totalQuantity: inventoryTable.totalQuantity,
    hardwareOnHand: inventoryTable.hardwareOnHand,
    reserved: inventoryTable.reserved,
    inUse: inventoryTable.inUse,
    damaged: inventoryTable.damaged,
    retired: inventoryTable.retired,
    onOrder: inventoryTable.onOrder,
    reorderThreshold: inventoryTable.reorderThreshold,
    lowInventoryThreshold: inventoryTable.lowInventoryThreshold,
    productCategory: productCatalogTable.category,
    graphicOnlyAvailable: inventoryTable.graphicOnlyAvailable,
    notes: inventoryTable.notes,
    updatedAt: inventoryTable.updatedAt,
  }).from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .leftJoin(partnersTable, eq(inventoryTable.partnerId, partnersTable.id));
  const shaped = rows.map(shapeInventoryRow).filter((r: any) => r.isLow || r.overcommitted);
  res.json(shaped);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = InventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const data: any = { ...parsed.data };
    if (data.totalQuantity != null && data.hardwareOnHand == null) data.hardwareOnHand = data.totalQuantity;
    if (data.reorderThreshold != null && data.lowInventoryThreshold == null) data.lowInventoryThreshold = data.reorderThreshold;
    const [row] = await db.insert(inventoryTable).values(data).returning();
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
  const data: any = { ...parsed.data };
  if (data.totalQuantity != null && data.hardwareOnHand == null) data.hardwareOnHand = data.totalQuantity;
  if (data.reorderThreshold != null && data.lowInventoryThreshold == null) data.lowInventoryThreshold = data.reorderThreshold;
  const [row] = await db.update(inventoryTable).set(data).where(eq(inventoryTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/inventory/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.delete(inventoryTable).where(eq(inventoryTable.id, id)).returning({ id: inventoryTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ---- Reservations ----

router.get("/inventory/reservations", async (req, res) => {
  const eventId = req.query.eventId ? parseInt(String(req.query.eventId)) : null;
  const inventoryId = req.query.inventoryId ? parseInt(String(req.query.inventoryId)) : null;
  const conditions = [];
  if (eventId) conditions.push(eq(inventoryReservationsTable.eventId, eventId));
  if (inventoryId) conditions.push(eq(inventoryReservationsTable.inventoryId, inventoryId));
  const rows = await db.select({
    id: inventoryReservationsTable.id,
    inventoryId: inventoryReservationsTable.inventoryId,
    eventId: inventoryReservationsTable.eventId,
    eventName: eventsTable.name,
    quantity: inventoryReservationsTable.quantity,
    status: inventoryReservationsTable.status,
    notes: inventoryReservationsTable.notes,
    createdAt: inventoryReservationsTable.createdAt,
    inventoryName: inventoryTable.name,
    productName: productCatalogTable.name,
    cityId: inventoryTable.cityId,
    cityName: citiesTable.name,
  }).from(inventoryReservationsTable)
    .leftJoin(eventsTable, eq(inventoryReservationsTable.eventId, eventsTable.id))
    .leftJoin(inventoryTable, eq(inventoryReservationsTable.inventoryId, inventoryTable.id))
    .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(desc(inventoryReservationsTable.createdAt));
  res.json(rows);
});

router.post("/inventory/reservations", async (req, res): Promise<void> => {
  const parsed = ReservationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { inventoryId, eventId, quantity, notes } = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(inventoryTable).where(eq(inventoryTable.id, inventoryId));
      if (!inv) return { error: "inventory_not_found" as const };
      const [evt] = await tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eventId));
      if (!evt) return { error: "event_not_found" as const };
      const [reservation] = await tx.insert(inventoryReservationsTable).values({
        inventoryId, eventId, quantity, status: "active", notes: notes ?? null,
      }).returning();
      await tx.update(inventoryTable)
        .set({ reserved: sql`${inventoryTable.reserved} + ${quantity}` })
        .where(eq(inventoryTable.id, inventoryId));
      return { reservation };
    });
    if ("error" in result) {
      res.status(404).json({ error: result.error }); return;
    }
    res.status(201).json(result.reservation);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Reservation failed" });
  }
});

router.patch("/inventory/reservations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const Body = z.object({
    status: z.enum(["active", "released", "fulfilled"]).optional(),
    quantity: z.number().int().min(1).optional(),
    notes: z.string().max(500).nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const lockRows: any = await tx.execute(sql`SELECT * FROM inventory_reservations WHERE id = ${id} FOR UPDATE`);
      const row = lockRows.rows?.[0];
      if (!row) return { error: "not_found" as const };
      const existing = { id: row.id, inventoryId: row.inventory_id, quantity: row.quantity, status: row.status };

      const newStatus = parsed.data.status ?? existing.status;
      const newQty = parsed.data.quantity ?? existing.quantity;

      const oldReserved = existing.status === "active" ? existing.quantity : 0;
      const newReserved = newStatus === "active" ? newQty : 0;
      const reservedDelta = newReserved - oldReserved;

      const oldInUse = existing.status === "fulfilled" ? existing.quantity : 0;
      const newInUse = newStatus === "fulfilled" ? newQty : 0;
      const inUseDelta = newInUse - oldInUse;

      const [updated] = await tx.update(inventoryReservationsTable)
        .set({ ...parsed.data })
        .where(eq(inventoryReservationsTable.id, id)).returning();

      if (reservedDelta !== 0 || inUseDelta !== 0) {
        await tx.update(inventoryTable).set({
          reserved: sql`GREATEST(0, ${inventoryTable.reserved} + ${reservedDelta})`,
          inUse: sql`GREATEST(0, ${inventoryTable.inUse} + ${inUseDelta})`,
        }).where(eq(inventoryTable.id, existing.inventoryId));
      }

      return { reservation: updated };
    });
    if ("error" in result) { res.status(404).json({ error: result.error }); return; }
    res.json(result.reservation);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Update failed" });
  }
});

router.delete("/inventory/reservations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const found = await db.transaction(async (tx) => {
    const lockRows: any = await tx.execute(sql`SELECT * FROM inventory_reservations WHERE id = ${id} FOR UPDATE`);
    const row = lockRows.rows?.[0];
    if (!row) return false;
    const status = row.status as string;
    const qty = row.quantity as number;
    const invId = row.inventory_id as number;
    if (status === "active") {
      await tx.update(inventoryTable)
        .set({ reserved: sql`GREATEST(0, ${inventoryTable.reserved} - ${qty})` })
        .where(eq(inventoryTable.id, invId));
    } else if (status === "fulfilled") {
      await tx.update(inventoryTable)
        .set({ inUse: sql`GREATEST(0, ${inventoryTable.inUse} - ${qty})` })
        .where(eq(inventoryTable.id, invId));
    }
    await tx.delete(inventoryReservationsTable).where(eq(inventoryReservationsTable.id, id));
    return true;
  });
  if (!found) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
