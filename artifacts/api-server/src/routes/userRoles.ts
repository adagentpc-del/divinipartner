import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userRolesTable } from "@workspace/db";
import { z } from "zod";

const UserRoleBody = z.object({
  userId: z.string().nullable().optional(),
  email: z.string().email(),
  fullName: z.string().nullable().optional(),
  role: z.enum(["super_admin", "internal_admin", "partner_manager", "client_user", "vendor_user"]),
  partnerId: z.number().int().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  permissionsJson: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const router: IRouter = Router();

router.get("/user-roles", async (_req, res) => {
  const rows = await db.select().from(userRolesTable).orderBy(userRolesTable.email);
  res.json(rows);
});

router.post("/user-roles", async (req, res): Promise<void> => {
  const parsed = UserRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [row] = await db.insert(userRolesTable).values({ ...parsed.data, invitedAt: new Date() }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Insert failed (email may already exist)" });
  }
});

router.patch("/user-roles/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UserRoleBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(userRolesTable).set(parsed.data).where(eq(userRolesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/user-roles/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(userRolesTable).where(eq(userRolesTable.id, id));
  res.json({ success: true });
});

export default router;
