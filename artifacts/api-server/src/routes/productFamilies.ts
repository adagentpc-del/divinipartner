import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  db,
  productFamiliesTable, productFamilyMembersTable, productCatalogTable,
  inventoryTable, citiesTable,
  inventoryBlackoutsTable, inventoryReservationsTable, eventsTable,
  partnerEmailRecipientsTable, ordersTable, usageEvents, partnersTable, partnerContactsTable,
} from "@workspace/db";
import {
  getPartnerFamilyAvailability,
  getFamilyContextForProduct,
} from "../lib/familyAvailability";
import {
  ListProductFamiliesResponse, GetProductFamilyResponse, UpdateProductFamilyResponse, DeleteProductFamilyResponse,
  UpdateProductFamilyMemberResponse, DeleteProductFamilyMemberResponse,
  GetPartnerFamilyAvailabilityResponse, GetProductFamilyContextResponse, SeedEasyUpFamilyResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

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

router.get("/product-families", async (req, res) => {
  const families = await db.select().from(productFamiliesTable).orderBy(asc(productFamiliesTable.name));
  if (families.length === 0) { sendValidated(req, res, ListProductFamiliesResponse, [], "Product families"); return; }
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
  sendValidated(req, res, ListProductFamiliesResponse, families.map(f => ({ ...f, members: byFamily.get(f.id) ?? [] })), "Product families");
});

router.get("/product-families/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [family] = await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.id, id));
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }
  const members = await db.select().from(productFamilyMembersTable)
    .where(eq(productFamilyMembersTable.familyId, id))
    .orderBy(asc(productFamilyMembersTable.sortOrder));
  sendValidated(req, res, GetProductFamilyResponse, { ...family, members }, "Product family");
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
  sendValidated(req, res, UpdateProductFamilyResponse, updated, "Family update");
});

router.delete("/product-families/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productFamiliesTable).where(eq(productFamiliesTable.id, id));
  sendValidated(req, res, DeleteProductFamilyResponse, { ok: true }, "Family delete");
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
  sendValidated(req, res, UpdateProductFamilyMemberResponse, m, "Family member update");
});

router.delete("/product-families/:id/members/:memberId", async (req, res): Promise<void> => {
  const memberId = parseInt(req.params.memberId);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid memberId" }); return; }
  await db.delete(productFamilyMembersTable).where(eq(productFamilyMembersTable.id, memberId));
  sendValidated(req, res, DeleteProductFamilyMemberResponse, { ok: true }, "Family member delete");
});

// ----- Availability views ---------------------------------------------------

router.get("/partners/:partnerId/family-availability", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }
  const familyId = req.query.familyId ? parseInt(String(req.query.familyId)) : undefined;
  const data = await getPartnerFamilyAvailability(partnerId, familyId);
  sendValidated(req, res, GetPartnerFamilyAvailabilityResponse, data, "Partner family availability");
});

router.get("/products/:productId/family-context", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const ctx = await getFamilyContextForProduct(productId);
  if (!ctx) { sendValidated(req, res, GetProductFamilyContextResponse, { inFamily: false }, "Product family context"); return; }
  // If the caller passed a partnerId, also return that partner's current
  // availability so the UI can render the right messaging in one round trip.
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : NaN;
  let availability: any = null;
  if (!isNaN(partnerId)) {
    const all = await getPartnerFamilyAvailability(partnerId, ctx.family.id);
    availability = all[0] || null;
  }
  sendValidated(req, res, GetProductFamilyContextResponse, {
    inFamily: true,
    family: ctx.family,
    member: ctx.member,
    availability,
  }, "Product family context");
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

  // ----- Section 27 demo: rentable assets + blackouts + sample reservation -----
  // Idempotent: only inserts rows when missing. Adds chairs, cocktail tables,
  // banquet tables, banner stands, all marked rentable with prices, and a
  // demonstration manual blackout + reservation if events exist for the partner.
  const rentableSeeds: Array<{ key: string; name: string; category: string; total: number; price: string; basis: "per_event" | "per_day"; }> = [
    { key: "chairs",         name: "Folding Chairs",       category: "seating",  total: 120, price: "5.00",   basis: "per_event" },
    { key: "cocktail_tables",name: "Cocktail Tables",      category: "tables",   total:  20, price: "25.00",  basis: "per_event" },
    { key: "banquet_tables", name: "Banquet Tables",       category: "tables",   total:  15, price: "40.00",  basis: "per_event" },
    { key: "step_repeat",    name: "Step & Repeat Frames", category: "display",  total:   8, price: "150.00", basis: "per_event" },
    { key: "banner_stands",  name: "Retractable Banner Stands", category: "display", total: 40, price: "30.00", basis: "per_event" },
  ];
  const rentableInventoryIds: Record<string, number> = {};
  if (city) {
    for (const s of rentableSeeds) {
      const exists = await db.select().from(inventoryTable)
        .where(and(eq(inventoryTable.partnerId, partnerId), eq(inventoryTable.cityId, city.id), eq(inventoryTable.name, s.name)));
      if (exists[0]) {
        rentableInventoryIds[s.key] = exists[0].id;
        continue;
      }
      const [inv] = await db.insert(inventoryTable).values({
        partnerId, cityId: city.id, name: s.name, category: s.category,
        assetType: "rentable", rentable: true,
        totalQuantity: s.total, hardwareOnHand: s.total, reserved: 0,
        rentalPrice: s.price, priceBasis: s.basis,
        eligibilityMode: "all", eligibleEventIds: [], eligibleCityIds: [],
        notes: "Section 27 demo seed",
      } as any).returning();
      rentableInventoryIds[s.key] = inv.id;
    }

    // Demo manual blackout: 8 banquet tables out for maintenance next week.
    const inOneWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const banquetInvId = rentableInventoryIds["banquet_tables"];
    if (banquetInvId) {
      const existingBlk = await db.select().from(inventoryBlackoutsTable)
        .where(and(eq(inventoryBlackoutsTable.inventoryId, banquetInvId), eq(inventoryBlackoutsTable.reasonNote, "Section 27 demo seed")));
      if (!existingBlk[0]) {
        await db.insert(inventoryBlackoutsTable).values({
          inventoryId: banquetInvId, startDate: inOneWeek, endDate: inTenDays,
          quantity: 8, reason: "maintenance", reasonNote: "Section 27 demo seed",
        } as any);
      }
    }
    // Demo event reservation: half the chairs booked for the partner's next
    // upcoming event so the rentable card immediately shows partial booking.
    const upcomingEvent = await db.select({ id: eventsTable.id, eventStartDate: eventsTable.eventStartDate, installDate: eventsTable.installDate, teardownDate: eventsTable.teardownDate })
      .from(eventsTable).where(and(eq(eventsTable.partnerId, partnerId))).orderBy(asc(eventsTable.eventStartDate)).limit(1);
    const ev = upcomingEvent[0];
    const chairsInvId = rentableInventoryIds["chairs"];
    if (ev && chairsInvId) {
      const evStart: any = ev.installDate ?? ev.eventStartDate;
      const evEnd: any = ev.teardownDate ?? ev.eventStartDate;
      const existingRes = await db.select().from(inventoryReservationsTable)
        .where(and(eq(inventoryReservationsTable.inventoryId, chairsInvId), eq(inventoryReservationsTable.eventId, ev.id)));
      if (!existingRes[0]) {
        await db.insert(inventoryReservationsTable).values({
          inventoryId: chairsInvId, eventId: ev.id, quantity: 60, status: "active",
          startDate: evStart || undefined, endDate: evEnd || evStart || undefined,
          holdReason: "event", notes: "Section 27 demo seed",
        } as any);
        await db.update(inventoryTable).set({ reserved: sql`${inventoryTable.reserved} + 60` }).where(eq(inventoryTable.id, chairsInvId));
      }
    }
  }

  // ----- Section 28 demo: routing recipients + sample email log entries -----
  // Seeds the partner's email address book with two operational recipients
  // ("me" and "Sean / program manager") plus one CC, and writes two sample
  // usage_events so the OrderEmailDeliveryPanel on the partner's most recent
  // order has visible rows out of the box: one successful confirmation and
  // one bounced ops forward.
  let routingRecipientsCreated = 0;
  const routingSeeds: Array<{ role: "ops" | "cc"; email: string; label: string }> = [
    { role: "ops", email: "owner@a3-demo.test",         label: "A3 owner" },
    { role: "ops", email: "sean@a3-demo.test",          label: "Sean — program manager" },
    { role: "cc",  email: "ops-archive@a3-demo.test",   label: "Ops archive" },
  ];
  for (const r of routingSeeds) {
    const existing = await db.select().from(partnerEmailRecipientsTable).where(and(
      eq(partnerEmailRecipientsTable.partnerId, partnerId),
      eq(partnerEmailRecipientsTable.email, r.email),
    ));
    if (existing[0]) continue;
    await db.insert(partnerEmailRecipientsTable).values({
      partnerId, role: r.role, email: r.email, label: r.label, isActive: true,
    } as any);
    routingRecipientsCreated++;
  }

  // Sample email events on the partner's most recent order (if any) so the
  // delivery timeline shows realistic activity. Only inserted if no email
  // events already exist for that order — keeps re-runs idempotent.
  const [latestOrder] = await db.select({ id: ordersTable.id, partnerId: ordersTable.partnerId, orderNumber: ordersTable.orderNumber })
    .from(ordersTable).where(eq(ordersTable.partnerId, partnerId)).orderBy(desc(ordersTable.createdAt)).limit(1);
  let sampleEmailEvents = 0;
  if (latestOrder) {
    const existingEvents = await db.select({ id: usageEvents.id }).from(usageEvents).where(and(
      eq(usageEvents.objectType, "order"),
      eq(usageEvents.objectId, latestOrder.id),
      eq(usageEvents.eventType, "email.sent"),
    )).limit(1);
    if (!existingEvents[0]) {
      await db.insert(usageEvents).values({
        eventType: "email.sent", partnerId, objectType: "order", objectId: latestOrder.id,
        meta: {
          type: "order_confirmation", to: "customer@example.com",
          subject: `A3 — order received (${latestOrder.orderNumber})`,
          providerId: "demo_seed_success", attached: true, attachments: [`order_${latestOrder.orderNumber}.pdf`],
        },
      } as any);
      await db.insert(usageEvents).values({
        eventType: "email.sent", partnerId, objectType: "order", objectId: latestOrder.id,
        meta: {
          type: "order_ops_forward", to: ["owner@a3-demo.test", "sean@a3-demo.test"],
          subject: `[New order] A3 · ${latestOrder.orderNumber}`,
          providerId: "demo_seed_success_ops", attached: true, attachments: [`order_${latestOrder.orderNumber}.pdf`],
        },
      } as any);
      // Partial-failure example: one of the partner-contact addresses bounced.
      await db.insert(usageEvents).values({
        eventType: "email.failed", partnerId, objectType: "order", objectId: latestOrder.id,
        meta: {
          type: "order_partner_contact_notification", to: "stale-contact@a3-demo.test",
          subject: `New order received · ${latestOrder.orderNumber}`,
          error: "Resend 422: Invalid recipient address",
        },
      } as any);
      sampleEmailEvents = 3;
    }
  }

  // ----- Section 29 demo: order exceptions + artwork-needed states -----
  // Patches up to four of the partner's most recent orders into representative
  // exception states so the dashboard + order detail page show the workflow
  // visibly without needing to author them by hand. Idempotent: only applies
  // to orders that currently have exceptionState='none' AND no artworkNeededFlag.
  let exceptionDemosApplied = 0;
  const demoOrders = await db.select({
    id: ordersTable.id, exceptionState: ordersTable.exceptionState, artworkNeededFlag: ordersTable.artworkNeededFlag,
  }).from(ordersTable).where(eq(ordersTable.partnerId, partnerId)).orderBy(desc(ordersTable.createdAt)).limit(8);
  const eligible = demoOrders.filter(o => (o.exceptionState ?? "none") === "none" && !o.artworkNeededFlag);
  type Demo = { state: string; type: string; message: string; artwork?: { brief: string; name: string; email: string } };
  const demos: Demo[] = [
    { state: "exception", type: "missing_artwork", message: "Customer hasn't sent the back-wall artwork yet — production blocked." },
    { state: "warning", type: "artwork_creation_needed", message: "Customer asked us to design a new lockup for the side panels.", artwork: { brief: "8' backdrop with spring conference logo + 4 sponsor lockups across the bottom band.", name: "Riley — partner design", email: "design@a3-demo.test" } },
    { state: "waiting_client", type: "missing_dimensions", message: "Customer didn't specify finished size for the table runner — pinged them yesterday." },
    { state: "resolved", type: "wrong_file_or_spec_format", message: "Client sent a low-res JPG; replaced with a vector PDF on 4/22." },
  ];
  for (let i = 0; i < Math.min(eligible.length, demos.length); i++) {
    const o = eligible[i]; const d = demos[i];
    const patch: any = {
      exceptionState: d.state,
      exceptionType: d.type,
      exceptionMessage: d.message,
      exceptionUpdatedAt: new Date(),
      exceptionUpdatedBy: "seed_demo",
    };
    if (d.artwork) {
      patch.artworkNeededFlag = true;
      patch.artworkBrief = d.artwork.brief;
      patch.artworkContactName = d.artwork.name;
      patch.artworkContactEmail = d.artwork.email;
    }
    await db.update(ordersTable).set(patch).where(eq(ordersTable.id, o.id));
    exceptionDemosApplied++;
  }

  // Make sure the partner has a default design contact wired up so the
  // ArtworkNeededPanel pre-fills it when admins flip the toggle on a fresh order.
  await db.update(partnersTable).set({
    designContactName: sql`COALESCE(${partnersTable.designContactName}, 'Riley — partner design')`,
    designContactEmail: sql`COALESCE(${partnersTable.designContactEmail}, 'design@a3-demo.test')`,
  } as any).where(eq(partnersTable.id, partnerId));

  // Section 30 — seed role-based partner contacts so the contacts panel and
  // OrderDetail reference card have realistic data the moment a demo loads.
  const seedContacts = [
    { role: "primary",          fullName: "Avery Chen",     email: "avery@a3-demo.test",   phone: "+1 (415) 555-0102", isPrimary: true,  notes: "Main day-to-day contact, PT timezone." },
    { role: "billing",          fullName: "Morgan Patel",   email: "billing@a3-demo.test", phone: "+1 (415) 555-0144", isPrimary: true,  notes: "AP team, prefers PDF invoices." },
    { role: "graphic_designer", fullName: "Riley Park",     email: "design@a3-demo.test",  phone: "+1 (415) 555-0188", isPrimary: true,  notes: "Send all artwork briefs here." },
    { role: "support",          fullName: "Jordan Rivera",  email: "support@a3-demo.test", phone: "+1 (415) 555-0177", isPrimary: true,  notes: "Escalation for fulfillment issues." },
    { role: "onsite",           fullName: "Sam Okafor",     email: "onsite@a3-demo.test",  phone: "+1 (415) 555-0199", isPrimary: true,  notes: "Reach during event setup window." },
  ];
  let contactsCreated = 0;
  for (const c of seedContacts) {
    const existing = await db.select({ id: partnerContactsTable.id }).from(partnerContactsTable)
      .where(and(eq(partnerContactsTable.partnerId, partnerId), eq(partnerContactsTable.role, c.role), eq(partnerContactsTable.fullName, c.fullName)));
    if (existing.length === 0) {
      await db.insert(partnerContactsTable).values({ partnerId, ...c } as any);
      contactsCreated++;
    }
  }

  sendValidated(req, res, SeedEasyUpFamilyResponse, {
    exceptionDemosApplied,
    ok: true,
    familyId: family.id, slug: family.slug,
    productIds: { frame: frame.id, canopy: canopy.id, backdrop: backdrop.id, sideWall: sideWall.id },
    inventoryId, cityId: city?.id ?? null,
    state: stateParam, total: 60, reserved: reservedTarget, available: 60 - reservedTarget,
    rentableInventoryIds,
    routingRecipientsCreated,
    sampleEmailEvents,
  }, "Seed Easy-Up family");
});

export default router;
