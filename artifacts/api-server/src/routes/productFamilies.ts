import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  db,
  productFamiliesTable, productFamilyMembersTable, productCatalogTable,
  inventoryTable, citiesTable,
} from "@workspace/db";
import {
  getPartnerFamilyAvailability,
  getFamilyContextForProduct,
} from "../lib/familyAvailability";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}
router.use([
  "/product-families",
  "/partners/:partnerId/family-availability",
  "/products/:productId/family-context",
  "/dev/seed-easy-up-family",
], requireAuth);

// ----- Family CRUD -----------------------------------------------------------

router.get("/product-families", async (_req, res) => {
  const families = await db.select().from(productFamiliesTable).orderBy(asc(productFamiliesTable.name));
  if (families.length === 0) { res.json([]); return; }
  // Eager-load members + product display info so the admin UI can render
  // everything in a single round trip.
  const ids = families.map(f => f.id);
  const members = await db.select({
    familyId: productFamilyMembersTable.familyId,
    id: productFamilyMembersTable.id,
    productId: productFamilyMembersTable.productId,
    role: productFamilyMembersTable.role,
    requiresHardwareUnits: productFamilyMembersTable.requiresHardwareUnits,
    isOptional: productFamilyMembersTable.isOptional,
    sortOrder: productFamilyMembersTable.sortOrder,
    productName: productCatalogTable.name,
    productDisplayName: productCatalogTable.displayName,
  })
    .from(productFamilyMembersTable)
    .leftJoin(productCatalogTable, eq(productCatalogTable.id, productFamilyMembersTable.productId))
    .where(inArray(productFamilyMembersTable.familyId, ids))
    .orderBy(asc(productFamilyMembersTable.sortOrder), asc(productFamilyMembersTable.id));
  const byFamily = new Map<number, typeof members>();
  for (const m of members) {
    const arr = byFamily.get(m.familyId) ?? [];
    arr.push(m);
    byFamily.set(m.familyId, arr);
  }
  res.json(families.map(f => ({ ...f, members: byFamily.get(f.id) ?? [] })));
});

router.get("/product-families/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [family] = await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.id, id));
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }
  const members = await db.select().from(productFamilyMembersTable)
    .where(eq(productFamilyMembersTable.familyId, id))
    .orderBy(asc(productFamilyMembersTable.sortOrder));
  res.json({ ...family, members });
});

const FamilyBody = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase letters, digits, and hyphens"),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  hardwareProductId: z.number().int().nullable().optional(),
  requiresHardwareDefault: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.post("/product-families", async (req, res): Promise<void> => {
  const parsed = FamilyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [family] = await db.insert(productFamiliesTable).values(parsed.data).returning();
    // Auto-add the hardware product as a `hardware`-role member so the family
    // is internally consistent; admin can still edit afterward.
    if (family.hardwareProductId) {
      await db.insert(productFamilyMembersTable).values({
        familyId: family.id,
        productId: family.hardwareProductId,
        role: "hardware",
        requiresHardwareUnits: 0,
        sortOrder: 0,
      }).onConflictDoNothing();
    }
    res.status(201).json(family);
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate key")) {
      res.status(409).json({ error: "A family with that slug already exists" });
      return;
    }
    res.status(500).json({ error: e?.message || "Failed to create family" });
  }
});

router.patch("/product-families/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = FamilyBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(productFamiliesTable).set(parsed.data)
    .where(eq(productFamiliesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Family not found" }); return; }
  res.json(updated);
});

router.delete("/product-families/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productFamiliesTable).where(eq(productFamiliesTable.id, id));
  res.json({ ok: true });
});

// ----- Family member management ---------------------------------------------

const MemberBody = z.object({
  productId: z.number().int(),
  role: z.enum(["hardware", "component", "accessory"]).optional(),
  requiresHardwareUnits: z.number().int().min(0).optional(),
  isOptional: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/product-families/:id/members", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = MemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [m] = await db.insert(productFamilyMembersTable)
      .values({ familyId: id, ...parsed.data })
      .returning();
    res.status(201).json(m);
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate key")) {
      res.status(409).json({ error: "Product is already a member of this family" });
      return;
    }
    res.status(500).json({ error: e?.message || "Failed to add member" });
  }
});

router.patch("/product-families/:id/members/:memberId", async (req, res): Promise<void> => {
  const memberId = parseInt(req.params.memberId);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid memberId" }); return; }
  const parsed = MemberBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [m] = await db.update(productFamilyMembersTable).set(parsed.data)
    .where(eq(productFamilyMembersTable.id, memberId)).returning();
  if (!m) { res.status(404).json({ error: "Member not found" }); return; }
  res.json(m);
});

router.delete("/product-families/:id/members/:memberId", async (req, res): Promise<void> => {
  const memberId = parseInt(req.params.memberId);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid memberId" }); return; }
  await db.delete(productFamilyMembersTable).where(eq(productFamilyMembersTable.id, memberId));
  res.json({ ok: true });
});

// ----- Availability views ---------------------------------------------------

router.get("/partners/:partnerId/family-availability", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }
  const familyId = req.query.familyId ? parseInt(String(req.query.familyId)) : undefined;
  const data = await getPartnerFamilyAvailability(partnerId, familyId);
  res.json(data);
});

router.get("/products/:productId/family-context", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const ctx = await getFamilyContextForProduct(productId);
  if (!ctx) { res.json({ inFamily: false }); return; }
  // If the caller passed a partnerId, also return that partner's current
  // availability so the UI can render the right messaging in one round trip.
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : NaN;
  let availability: any = null;
  if (!isNaN(partnerId)) {
    const all = await getPartnerFamilyAvailability(partnerId, ctx.family.id);
    availability = all[0] || null;
  }
  res.json({
    inFamily: true,
    family: ctx.family,
    member: ctx.member,
    availability,
  });
});

// ----- One-shot seed: Easy Up tent family -----------------------------------
// Idempotent. Creates frame + canopy + backdrop + side wall products if missing,
// the family + members, and 60 frames of inventory for the given partner+city.
router.post("/dev/seed-easy-up-family", async (req, res): Promise<void> => {
  const partnerId = Number(req.body?.partnerId);
  if (!Number.isFinite(partnerId)) { res.status(400).json({ error: "partnerId required" }); return; }

  const ensureProduct = async (sku: string, name: string, category: string, hardware = false) => {
    const existing = await db.select().from(productCatalogTable).where(eq(productCatalogTable.sku, sku));
    if (existing[0]) return existing[0];
    const [row] = await db.insert(productCatalogTable).values({
      sku, name, displayName: name, category,
      isActive: true,
      reusableHardwareCompatible: hardware,
      inventoryTracked: hardware,
      pricingModel: "fixed", unitRate: hardware ? "450.00" : "75.00", pricingUnit: "each",
    } as any).returning();
    return row;
  };

  const frame = await ensureProduct("EASYUP-FRAME", "Easy Up Tent Frame", "tent", true);
  const canopy = await ensureProduct("EASYUP-CANOPY", "Easy Up Canopy Top", "tent");
  const backdrop = await ensureProduct("EASYUP-BACKDROP", "Easy Up Backdrop", "tent");
  const sideWall = await ensureProduct("EASYUP-SIDEWALL", "Easy Up Side Wall", "tent");

  const existingFam = await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.slug, "easy-up-tent"));
  let family = existingFam[0];
  if (!family) {
    [family] = await db.insert(productFamiliesTable).values({
      slug: "easy-up-tent", name: "Easy Up Tent",
      description: "Tent frame plus dependent components (canopy, backdrop, side walls).",
      hardwareProductId: frame.id, requiresHardwareDefault: true, isActive: true,
    } as any).returning();
  } else if (family.hardwareProductId !== frame.id) {
    [family] = await db.update(productFamiliesTable).set({ hardwareProductId: frame.id }).where(eq(productFamiliesTable.id, family.id)).returning();
  }

  const upsertMember = async (productId: number, role: "hardware" | "component" | "accessory", units = 1, sortOrder = 0) => {
    const existing = await db.select().from(productFamilyMembersTable)
      .where(and(eq(productFamilyMembersTable.familyId, family!.id), eq(productFamilyMembersTable.productId, productId)));
    if (existing[0]) return existing[0];
    const [m] = await db.insert(productFamilyMembersTable).values({
      familyId: family!.id, productId, role, requiresHardwareUnits: units, sortOrder,
    } as any).returning();
    return m;
  };
  await upsertMember(frame.id, "hardware", 0, 0);
  await upsertMember(canopy.id, "component", 1, 1);
  await upsertMember(backdrop.id, "component", 1, 2);
  await upsertMember(sideWall.id, "component", 1, 3);

  // Seed 60 frames into the partner's first city.
  // Optional `state` param drives the demo claimed/available split:
  //   "healthy" (default)  → 60 total, 0 reserved → 60 available
  //   "claimed"            → 60 total, 42 reserved → 18 available
  //   "low"                → 60 total, 57 reserved → 3 available
  //   "exhausted"          → 60 total, 60 reserved → 0 available (full unit required)
  const stateParam = String(req.body?.state || "healthy").toLowerCase();
  const claimedByState: Record<string, number> = {
    healthy: 0, claimed: 42, low: 57, exhausted: 60,
  };
  const reservedTarget = claimedByState[stateParam] ?? 0;
  const [city] = await db.select().from(citiesTable).where(eq(citiesTable.partnerId, partnerId)).orderBy(asc(citiesTable.sortOrder));
  let inventoryId: number | null = null;
  if (city) {
    const existingInv = await db.select().from(inventoryTable)
      .where(and(eq(inventoryTable.partnerId, partnerId), eq(inventoryTable.productId, frame.id), eq(inventoryTable.cityId, city.id)));
    if (existingInv[0]) {
      inventoryId = existingInv[0].id;
      // Make the demo state predictable when the same endpoint is hit again.
      await db.update(inventoryTable).set({
        totalQuantity: 60, hardwareOnHand: 60, reserved: reservedTarget,
      } as any).where(eq(inventoryTable.id, existingInv[0].id));
    } else {
      const [inv] = await db.insert(inventoryTable).values({
        partnerId, productId: frame.id, cityId: city.id, name: "Easy Up Frames (seed)",
        totalQuantity: 60, hardwareOnHand: 60, reserved: reservedTarget,
      } as any).returning();
      inventoryId = inv.id;
    }
  }

  res.json({
    ok: true,
    familyId: family.id, slug: family.slug,
    productIds: { frame: frame.id, canopy: canopy.id, backdrop: backdrop.id, sideWall: sideWall.id },
    inventoryId, cityId: city?.id ?? null,
    state: stateParam, total: 60, reserved: reservedTarget, available: 60 - reservedTarget,
  });
});

export default router;
