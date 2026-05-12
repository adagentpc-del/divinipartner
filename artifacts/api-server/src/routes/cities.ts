import { Router, type IRouter } from "express";
import { eq, isNull, or } from "drizzle-orm";
import { db, citiesTable } from "@workspace/db";
import { z } from "zod";
import {
  ListCitiesResponse,
  UpdateCityResponse,
  DeleteCityResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const CityBody = z.object({
  partnerId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const router: IRouter = Router();

router.get("/cities", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : null;
  const rows = partnerId
    ? await db.select().from(citiesTable).where(or(eq(citiesTable.partnerId, partnerId), isNull(citiesTable.partnerId))).orderBy(citiesTable.sortOrder, citiesTable.name)
    : await db.select().from(citiesTable).orderBy(citiesTable.sortOrder, citiesTable.name);
  sendValidated(req, res, ListCitiesResponse, rows, "List cities");
});

router.post("/cities", async (req, res): Promise<void> => {
  const parsed = CityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(citiesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/cities/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CityBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(citiesTable).set(parsed.data).where(eq(citiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UpdateCityResponse, row, "Update city");
});

router.delete("/cities/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(citiesTable).where(eq(citiesTable.id, id));
  sendValidated(req, res, DeleteCityResponse, { success: true }, "Delete city");
});

export default router;
