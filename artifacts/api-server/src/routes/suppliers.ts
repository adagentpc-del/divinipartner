import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { z } from "zod";

const SupplierBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  categoriesJson: z.array(z.string()).nullable().optional(),
  capabilitiesJson: z.array(z.string()).nullable().optional(),
  territoryJson: z.array(z.string()).nullable().optional(),
  fulfillmentNotes: z.string().nullable().optional(),
  internalContactsJson: z.array(z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional() })).nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const router: IRouter = Router();

router.get("/suppliers", async (_req, res) => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(rows);
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = SupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(suppliersTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SupplierBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(suppliersTable).set(parsed.data).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.json({ success: true });
});

export default router;
