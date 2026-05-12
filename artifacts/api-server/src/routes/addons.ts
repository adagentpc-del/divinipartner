/**
 * Partner-specific add-ons (Section 35).
 *
 * - GET    /api/partners/:id/addons             → list (joined with product info)
 * - PUT    /api/partners/:id/addons             → bulk replace selection
 * - GET    /api/events/:id/addons/effective     → resolved list given partner +
 *                                                 event override
 * - GET    /api/public/partners/:slug/events/:eventId/addons
 *                                                → public ordering helper
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  db, partnerAddonsTable, productCatalogTable, partnersTable, eventsTable,
} from "@workspace/db";
import {
  ListPartnerAddonsResponse,
  ReplacePartnerAddonsResponse,
  GetEventEffectiveAddonsResponse,
  GetPublicEventAddonsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

// Same posture as other admin routes in this codebase: per-route auth guard
// because app.ts only mounts clerkMiddleware() (no global requireAuth).
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

// Public ordering surfaces are gated by partner launch state, mirroring
// publicPortal.ts so anonymous callers can't enumerate add-on configuration
// for partners that aren't live or in preview.
const PUBLIC_LAUNCH_STATES = ["live", "preview"] as const;

const ReplaceBody = z.object({
  addons: z.array(z.object({
    productId: z.number().int().positive(),
    sortOrder: z.number().int().nonnegative().optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // Section 36: optional per-add-on category override (null/empty = use product's catalog category).
    categoryOverride: z.string().max(80).nullable().optional(),
  })).max(500),
});

async function listPartnerAddons(partnerId: number) {
  const rows = await db.select({
    id: partnerAddonsTable.id,
    partnerId: partnerAddonsTable.partnerId,
    productId: partnerAddonsTable.productId,
    sortOrder: partnerAddonsTable.sortOrder,
    isFeatured: partnerAddonsTable.isFeatured,
    isActive: partnerAddonsTable.isActive,
    categoryOverride: partnerAddonsTable.categoryOverride,
    productName: productCatalogTable.name,
    productCategory: productCatalogTable.category,
    productImageUrl: productCatalogTable.imageUrl,
    productSlug: productCatalogTable.slug,
    productIsActive: productCatalogTable.isActive,
  }).from(partnerAddonsTable)
    .leftJoin(productCatalogTable, eq(partnerAddonsTable.productId, productCatalogTable.id))
    .where(eq(partnerAddonsTable.partnerId, partnerId))
    .orderBy(asc(partnerAddonsTable.sortOrder), asc(partnerAddonsTable.id));
  // Section 36: compute the "effective category" — categoryOverride if set,
  // else the product's catalog category, else "Uncategorized" so the tile
  // view always has a bucket.
  return rows.map((r) => ({
    ...r,
    effectiveCategory: (r.categoryOverride && r.categoryOverride.trim())
      || r.productCategory
      || "Uncategorized",
  }));
}

router.get("/partners/:id/addons", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  sendValidated(req, res, ListPartnerAddonsResponse, await listPartnerAddons(id), "List partner addons");
});

router.put("/partners/:id/addons", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReplaceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [partner] = await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.id, id));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  // Bulk replace: simplest correct strategy is delete-then-insert in a tx.
  // Volumes are tiny (typically <50 add-ons per partner) so this is fine.
  await db.transaction(async (tx) => {
    await tx.delete(partnerAddonsTable).where(eq(partnerAddonsTable.partnerId, id));
    if (parsed.data.addons.length > 0) {
      // De-duplicate by productId in case the client sent the same product twice.
      const seen = new Set<number>();
      const rows = parsed.data.addons
        .filter((a) => { if (seen.has(a.productId)) return false; seen.add(a.productId); return true; })
        .map((a, idx) => ({
          partnerId: id,
          productId: a.productId,
          sortOrder: a.sortOrder ?? idx,
          isFeatured: a.isFeatured ?? false,
          isActive: a.isActive ?? true,
          categoryOverride: a.categoryOverride && a.categoryOverride.trim() ? a.categoryOverride.trim() : null,
        }));
      if (rows.length > 0) await tx.insert(partnerAddonsTable).values(rows);
    }
  });

  sendValidated(req, res, ReplacePartnerAddonsResponse, await listPartnerAddons(id), "Replace partner addons");
});

/**
 * Resolve the add-on list for a single event given the inheritance rules:
 *   - addonOverrideJson is null OR { mode: "inherit" }
 *       → all active partner add-ons
 *   - { mode: "override", productIds: [ids] }
 *       → intersection with the partner's active add-on set (we never surface
 *         a product the partner hasn't approved)
 */
async function resolveEventAddons(eventId: number) {
  const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!ev) return null;
  const [partner] = await db.select({
    id: partnersTable.id,
    addonDisplayFormat: partnersTable.addonDisplayFormat,
    addonCategoryGroupingEnabled: partnersTable.addonCategoryGroupingEnabled,
  }).from(partnersTable).where(eq(partnersTable.id, ev.partnerId));

  const partnerAddons = await listPartnerAddons(ev.partnerId);
  const activePartnerAddons = partnerAddons.filter((a) => a.isActive && a.productIsActive);

  const override = ev.addonOverrideJson;
  let inheritance: "inherit" | "override" = "inherit";
  let chosen = activePartnerAddons;

  if (override && override.mode === "override") {
    inheritance = "override";
    const allow = new Set<number>(Array.isArray(override.productIds) ? override.productIds : []);
    chosen = activePartnerAddons.filter((a) => a.productId != null && allow.has(a.productId));
  }

  // Section 36: optional per-event category filter (works regardless of mode
  // — useful for "this venue only allows tables/chairs"). Trim/dedupe so
  // whitespace-padded inputs (e.g. " Tables ") don't silently produce zero
  // matches against the case-folded effectiveCategory comparison below.
  const categoryFilter = Array.isArray(override?.categories)
    ? Array.from(new Set(
        override!.categories!
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim())
          .filter(Boolean)
      ))
    : [];
  if (categoryFilter.length > 0) {
    const allowCats = new Set(categoryFilter.map((c) => c.toLowerCase()));
    chosen = chosen.filter((a) => allowCats.has(a.effectiveCategory.toLowerCase()));
  }

  // Section 36: resolve display format. Event override wins; falls back to
  // partner default; falls back to "grid" if neither is set.
  const partnerDefaultFormat = partner?.addonDisplayFormat || "grid";
  const eventFormat = ev.addonDisplayFormat || null;
  const effectiveDisplayFormat = (eventFormat || partnerDefaultFormat) as "flat" | "grid" | "category_tiles";

  // Pre-group by effective category so the client doesn't have to.
  const grouped: Record<string, typeof chosen> = {};
  for (const a of chosen) {
    const key = a.effectiveCategory;
    (grouped[key] ||= []).push(a);
  }
  // Stable ordered category list (alphabetical, "Uncategorized" last).
  const categoryOrder = Object.keys(grouped).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  return {
    eventId: ev.id,
    partnerId: ev.partnerId,
    inheritance,
    addons: chosen,
    partnerAddonCount: activePartnerAddons.length,
    // Display config
    displayFormat: effectiveDisplayFormat,
    displayFormatSource: eventFormat ? ("event_override" as const) : ("partner_default" as const),
    partnerDefaultFormat,
    categoryGroupingEnabled: !!partner?.addonCategoryGroupingEnabled,
    categoryFilter,
    categoryOrder,
    addonsByCategory: categoryOrder.map((cat) => ({ category: cat, addons: grouped[cat] })),
  };
}

router.get("/events/:id/addons/effective", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const out = await resolveEventAddons(id);
  if (!out) { res.status(404).json({ error: "Event not found" }); return; }
  sendValidated(req, res, GetEventEffectiveAddonsResponse, out, "Effective event addons");
});

// Public ordering helper — keeps the admin endpoint behind auth (when the
// admin gate is configured) while letting the partner portal fetch the same
// resolved list anonymously for a known partner+event pair.
router.get("/public/partners/:slug/events/:eventId/addons", async (req, res): Promise<void> => {
  const eventId = Number(req.params.eventId);
  if (!Number.isFinite(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
  // Mirror publicPortal.ts gating: partner must be active AND in a publicly
  // visible launch state. Otherwise treat as not found so we don't reveal
  // existence of unpublished partners.
  const [partner] = await db.select({ id: partnersTable.id })
    .from(partnersTable)
    .where(and(
      eq(partnersTable.slug, req.params.slug),
      eq(partnersTable.isActive, true),
      inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES]),
    ));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  const [ev] = await db.select({ id: eventsTable.id, partnerId: eventsTable.partnerId, isActive: eventsTable.isActive })
    .from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!ev || ev.partnerId !== partner.id || !ev.isActive) { res.status(404).json({ error: "Event not found" }); return; }
  const out = await resolveEventAddons(eventId);
  sendValidated(req, res, GetPublicEventAddonsResponse, out, "Public event addons");
});

export { resolveEventAddons };
export default router;
