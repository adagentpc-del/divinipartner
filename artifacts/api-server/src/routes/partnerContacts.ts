import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, asc, ne } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db, partnerContactsTable, partnersTable, PARTNER_CONTACT_ROLES } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}
router.use(["/partners/:partnerId/contacts", "/partner-contacts/:id"], requireAuth);

const ContactBody = z.object({
  role: z.enum(PARTNER_CONTACT_ROLES).default("other"),
  fullName: z.string().min(1).max(200),
  title: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const ContactPatch = ContactBody.partial();

router.get("/partners/:partnerId/contacts", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const rows = await db.select().from(partnerContactsTable)
    .where(eq(partnerContactsTable.partnerId, partnerId))
    .orderBy(asc(partnerContactsTable.sortOrder), asc(partnerContactsTable.id));
  res.json(rows);
});

router.post("/partners/:partnerId/contacts", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const [partner] = await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const { isPrimary, email, title, ...rest } = parsed.data;
  const normalizedTitle = typeof title === "string" ? (title.trim() || null) : (title ?? null);
  try {
    const row = await db.transaction(async (tx) => {
      // First contact in a role auto-becomes primary so the order/exception
      // panels always have something to surface for that role.
      const existingInRole = await tx.select({ id: partnerContactsTable.id })
        .from(partnerContactsTable)
        .where(and(eq(partnerContactsTable.partnerId, partnerId), eq(partnerContactsTable.role, parsed.data.role)));
      const wantsPrimary = isPrimary || existingInRole.length === 0;
      if (wantsPrimary) {
        await tx.update(partnerContactsTable).set({ isPrimary: false })
          .where(and(eq(partnerContactsTable.partnerId, partnerId), eq(partnerContactsTable.role, parsed.data.role), eq(partnerContactsTable.isPrimary, true)));
      }
      const [created] = await tx.insert(partnerContactsTable).values({
        partnerId, ...rest, title: normalizedTitle, email: email || null, isPrimary: wantsPrimary,
      } as any).returning();
      return created;
    });
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "Another primary contact exists for this role" }); return; }
    throw e;
  }
});

router.patch("/partner-contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ContactPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const patch: any = { ...parsed.data };
  if (patch.email === "") patch.email = null;
  if (typeof patch.title === "string" && patch.title.trim() === "") patch.title = null;
  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(partnerContactsTable).where(eq(partnerContactsTable.id, id));
      if (!existing) return null;
      const newRole = patch.role ?? existing.role;
      const newIsPrimary = patch.isPrimary ?? existing.isPrimary;
      // If the resulting record will be primary in a (partner, role) bucket
      // and either (a) we're flipping isPrimary on, or (b) we're moving
      // an already-primary contact into a different role, demote the
      // existing primary in that target role first. This closes the
      // role-change-leaves-dual-primaries gap.
      const willBePrimary = newIsPrimary === true;
      const roleChanged = patch.role !== undefined && patch.role !== existing.role;
      if (willBePrimary && (patch.isPrimary === true || roleChanged)) {
        await tx.update(partnerContactsTable).set({ isPrimary: false })
          .where(and(
            eq(partnerContactsTable.partnerId, existing.partnerId),
            eq(partnerContactsTable.role, newRole),
            eq(partnerContactsTable.isPrimary, true),
            ne(partnerContactsTable.id, id),
          ));
      }
      const [updated] = await tx.update(partnerContactsTable).set(patch).where(eq(partnerContactsTable.id, id)).returning();
      return updated;
    });
    if (!row) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json(row);
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "Another primary contact exists for this role" }); return; }
    throw e;
  }
});

router.delete("/partner-contacts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(partnerContactsTable).where(eq(partnerContactsTable.id, id)).returning({ id: partnerContactsTable.id });
  if (!deleted) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json({ ok: true });
});

router.post("/partner-contacts/:id/make-primary", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(partnerContactsTable).where(eq(partnerContactsTable.id, id));
      if (!existing) return null;
      await tx.update(partnerContactsTable).set({ isPrimary: false })
        .where(and(
          eq(partnerContactsTable.partnerId, existing.partnerId),
          eq(partnerContactsTable.role, existing.role),
          eq(partnerContactsTable.isPrimary, true),
          ne(partnerContactsTable.id, id),
        ));
      const [updated] = await tx.update(partnerContactsTable).set({ isPrimary: true }).where(eq(partnerContactsTable.id, id)).returning();
      return updated;
    });
    if (!row) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json(row);
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "Another primary contact exists for this role" }); return; }
    throw e;
  }
});

export default router;
