import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savedAddressesTable, savedContactsTable } from "@workspace/db";
import { z } from "zod";

const AddressBody = z.object({
  partnerId: z.number().int(),
  label: z.string().min(1),
  fullName: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().optional(),
  phone: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

const ContactBody = z.object({
  partnerId: z.number().int(),
  label: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

const router: IRouter = Router();

router.get("/saved-addresses", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const rows = partnerId
    ? await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.partnerId, partnerId))
    : await db.select().from(savedAddressesTable);
  res.json(rows);
});

router.post("/saved-addresses", async (req, res): Promise<void> => {
  const parsed = AddressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(savedAddressesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/saved-addresses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AddressBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(savedAddressesTable).set(parsed.data).where(eq(savedAddressesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/saved-addresses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(savedAddressesTable).where(eq(savedAddressesTable.id, id));
  res.json({ success: true });
});

router.get("/saved-contacts", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const rows = partnerId
    ? await db.select().from(savedContactsTable).where(eq(savedContactsTable.partnerId, partnerId))
    : await db.select().from(savedContactsTable);
  res.json(rows);
});

router.post("/saved-contacts", async (req, res): Promise<void> => {
  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(savedContactsTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/saved-contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ContactBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(savedContactsTable).set(parsed.data).where(eq(savedContactsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/saved-contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(savedContactsTable).where(eq(savedContactsTable.id, id));
  res.json({ success: true });
});

export default router;
