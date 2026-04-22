import { db, inventoryTable, productFamiliesTable, productFamilyMembersTable, productCatalogTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Connected product families (Section 26) availability resolver.
 *
 * For each family, "available" is the partner's owned hardware count minus
 * everything that's already accounted-for. The numbers come from existing
 * `inventoryTable` rows keyed by (partnerId, productId) — the family is just
 * a relationship layer, no inventory state of its own.
 *
 * Math is kept consistent with `reserveForItem` in routes/orders.ts which uses
 * `total_quantity - reserved - in_use - damaged - retired` per inventory row.
 */
export type FamilyAvailability = {
  familyId: number;
  familySlug: string;
  familyName: string;
  hardwareProductId: number | null;
  hardwareProductName: string | null;
  totalOwned: number;
  reserved: number;
  inUse: number;
  available: number;
  requiresHardware: boolean;
  mode: "component" | "full_unit_required" | "no_hardware_assigned";
  // UI threshold. Stored value if set, otherwise max(2, ceil(15% of total)).
  lowStockThreshold: number;
  // Convenience for status-card styling.
  statusLevel: "healthy" | "low" | "exhausted" | "unconfigured";
  inventoryRowIds: number[];
};

export function resolveLowStockThreshold(stored: number | null, totalOwned: number): number {
  if (stored != null && stored >= 0) return stored;
  return Math.max(2, Math.ceil(totalOwned * 0.15));
}

export async function getPartnerFamilyAvailability(
  partnerId: number,
  familyId?: number,
): Promise<FamilyAvailability[]> {
  const families = familyId
    ? await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.id, familyId))
    : await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.isActive, true));
  if (families.length === 0) return [];

  const hwIds = families.map(f => f.hardwareProductId).filter((x): x is number => x != null);
  const hwProducts = hwIds.length
    ? await db.select({ id: productCatalogTable.id, name: productCatalogTable.name, displayName: productCatalogTable.displayName })
        .from(productCatalogTable).where(inArray(productCatalogTable.id, hwIds))
    : [];
  const hwById = new Map(hwProducts.map(p => [p.id, p]));

  const invRows = hwIds.length ? await db
    .select({
      productId: inventoryTable.productId,
      id: inventoryTable.id,
      totalQuantity: inventoryTable.totalQuantity,
      reserved: inventoryTable.reserved,
      inUse: inventoryTable.inUse,
      damaged: inventoryTable.damaged,
      retired: inventoryTable.retired,
    })
    .from(inventoryTable)
    .where(and(
      eq(inventoryTable.partnerId, partnerId),
      inArray(inventoryTable.productId, hwIds),
    )) : [];

  const invByProduct = new Map<number, typeof invRows>();
  for (const r of invRows) {
    if (r.productId == null) continue;
    const arr = invByProduct.get(r.productId) ?? [];
    arr.push(r);
    invByProduct.set(r.productId, arr);
  }

  return families.map(f => {
    const hw = f.hardwareProductId ? hwById.get(f.hardwareProductId) : null;
    const rows = (f.hardwareProductId && invByProduct.get(f.hardwareProductId)) || [];
    let totalOwned = 0, reserved = 0, inUse = 0, accountedFor = 0;
    for (const r of rows) {
      totalOwned += r.totalQuantity;
      reserved += r.reserved;
      inUse += r.inUse;
      accountedFor += r.reserved + r.inUse + r.damaged + r.retired;
    }
    const available = Math.max(0, totalOwned - accountedFor);
    let mode: FamilyAvailability["mode"];
    if (!f.hardwareProductId) mode = "no_hardware_assigned";
    else if (f.requiresHardwareDefault && available === 0) mode = "full_unit_required";
    else mode = "component";
    const lowStockThreshold = resolveLowStockThreshold(f.lowStockThreshold ?? null, totalOwned);
    let statusLevel: FamilyAvailability["statusLevel"];
    if (!f.hardwareProductId || totalOwned === 0) statusLevel = "unconfigured";
    else if (available === 0) statusLevel = "exhausted";
    else if (available <= lowStockThreshold) statusLevel = "low";
    else statusLevel = "healthy";
    return {
      familyId: f.id,
      familySlug: f.slug,
      familyName: f.name,
      hardwareProductId: f.hardwareProductId,
      hardwareProductName: hw?.displayName || hw?.name || null,
      totalOwned, reserved, inUse, available,
      requiresHardware: f.requiresHardwareDefault,
      mode,
      lowStockThreshold,
      statusLevel,
      inventoryRowIds: rows.map(r => r.id),
    };
  });
}

/**
 * For any product, find its family + member row. Includes role=hardware so
 * the order code can detect when a partner is buying the hardware itself
 * (which short-circuits the "must reserve from existing stock" check).
 */
export async function getFamilyContextForProduct(productId: number): Promise<{
  family: typeof productFamiliesTable.$inferSelect;
  member: typeof productFamilyMembersTable.$inferSelect;
} | null> {
  const rows = await db
    .select({
      family: productFamiliesTable,
      member: productFamilyMembersTable,
    })
    .from(productFamilyMembersTable)
    .innerJoin(productFamiliesTable, eq(productFamiliesTable.id, productFamilyMembersTable.familyId))
    .where(and(
      eq(productFamilyMembersTable.productId, productId),
      eq(productFamiliesTable.isActive, true),
    ))
    .limit(1);
  return rows[0] || null;
}

/**
 * Pick the best inventory row for a given family + partner + (optional) city.
 * Accepts an `allocatedByRow` map so callers stitching multiple items in the
 * same order don't re-pick a row that was already drained earlier in the loop.
 *
 * Preference: same-city + most-available → any with availability (most first)
 * → same-city fallback (avail=0) → first row.
 */
export async function pickInventoryRowForFamily(
  partnerId: number,
  hardwareProductId: number,
  preferCityId: number | null,
  allocatedByRow?: Map<number, number>,
): Promise<{ inventoryId: number; cityId: number; available: number } | null> {
  const rows = await db.select({
    id: inventoryTable.id,
    cityId: inventoryTable.cityId,
    totalQuantity: inventoryTable.totalQuantity,
    reserved: inventoryTable.reserved,
    inUse: inventoryTable.inUse,
    damaged: inventoryTable.damaged,
    retired: inventoryTable.retired,
  }).from(inventoryTable)
    .where(and(
      eq(inventoryTable.partnerId, partnerId),
      eq(inventoryTable.productId, hardwareProductId),
    ));
  if (!rows.length) return null;
  const enriched = rows.map(r => {
    const used = r.reserved + r.inUse + r.damaged + r.retired + (allocatedByRow?.get(r.id) ?? 0);
    return { id: r.id, cityId: r.cityId, available: Math.max(0, r.totalQuantity - used) };
  });
  enriched.sort((a, b) => b.available - a.available);
  const cityMatch = enriched.find(r => r.cityId === preferCityId && r.available > 0);
  if (cityMatch) return { inventoryId: cityMatch.id, cityId: cityMatch.cityId, available: cityMatch.available };
  const anyAvail = enriched.find(r => r.available > 0);
  if (anyAvail) return { inventoryId: anyAvail.id, cityId: anyAvail.cityId, available: anyAvail.available };
  const cityFallback = rows.find(r => r.cityId === preferCityId);
  const pick = cityFallback || rows[0];
  return { inventoryId: pick.id, cityId: pick.cityId, available: 0 };
}

/**
 * Shared family-aware enforcement used by BOTH the admin POST /orders and the
 * public POST /public/partners/:slug/orders so the rules apply uniformly.
 *
 * Mutates `items` in place: prefills `inventorySourceInventoryId`,
 * `inventorySourceCityId`, and forces `fulfillmentMode = use_existing_partner_inventory`
 * so the existing `reserveForItem` path actually reserves.
 *
 * Returns `{ ok: true }` on success or a structured 409 payload on exhaustion.
 *
 * Limitations (explicit, not silent): we currently reject orders whose
 * components have `requiresHardwareUnits > 1` because the existing
 * `reserveForItem` reserves quantity 1:1 from the inventory row. Multi-unit
 * components would need a separate reservation per extra unit; out of scope
 * for the seed flow which uses 1.
 */
export async function planFamilyReservations(
  partnerId: number,
  items: Array<{ productId?: number | null; quantity?: number; inventorySourceInventoryId?: number | null; inventorySourceCityId?: number | null; fulfillmentMode?: string | null }>,
  eventCityId: number | null,
): Promise<
  | { ok: true }
  | { ok: false; status: 409; body: { code: "HARDWARE_REQUIRED" | "MULTI_UNIT_NOT_SUPPORTED"; familyId?: number; familyName?: string; hardwareProductId?: number; available?: number; needed?: number; error: string } }
> {
  const productIds = Array.from(new Set(items.map(i => i.productId).filter((x): x is number => !!x)));
  if (!productIds.length) return { ok: true };
  const ctxByProduct = new Map<number, Awaited<ReturnType<typeof getFamilyContextForProduct>>>();
  await Promise.all(productIds.map(async pid => { ctxByProduct.set(pid, await getFamilyContextForProduct(pid)); }));

  // Reject multi-unit components up front (see Limitations above).
  for (const it of items) {
    if (!it.productId) continue;
    const ctx = ctxByProduct.get(it.productId);
    if (!ctx || ctx.member.role === "hardware") continue;
    if (!ctx.family.requiresHardwareDefault) continue;
    if ((ctx.member.requiresHardwareUnits ?? 1) > 1) {
      return { ok: false, status: 409, body: {
        code: "MULTI_UNIT_NOT_SUPPORTED",
        familyId: ctx.family.id, familyName: ctx.family.name,
        error: `${ctx.family.name}: multi-unit hardware components are not yet supported by automatic reservation.`,
      } };
    }
  }

  // Hardware product ids the order is bringing itself.
  const hardwareInOrder = new Set<number>();
  for (const it of items) {
    if (!it.productId) continue;
    const ctx = ctxByProduct.get(it.productId);
    if (ctx && ctx.member.role === "hardware") hardwareInOrder.add(it.productId);
  }

  // Aggregate demand per family for components/accessories that require hardware.
  const demandByFamily = new Map<number, { needed: number; familyName: string; hardwareProductId: number }>();
  for (const it of items) {
    if (!it.productId) continue;
    const ctx = ctxByProduct.get(it.productId);
    if (!ctx || ctx.member.role === "hardware") continue;
    if (!ctx.family.requiresHardwareDefault || !ctx.family.hardwareProductId) continue;
    if (hardwareInOrder.has(ctx.family.hardwareProductId)) continue; // bring-your-own frame
    const need = (it.quantity ?? 1) * (ctx.member.requiresHardwareUnits ?? 1);
    const cur = demandByFamily.get(ctx.family.id) ?? { needed: 0, familyName: ctx.family.name, hardwareProductId: ctx.family.hardwareProductId };
    cur.needed += need;
    demandByFamily.set(ctx.family.id, cur);
  }

  // Validate aggregate availability before the txn so we can fail fast.
  for (const [familyId, d] of demandByFamily) {
    const avail = await getPartnerFamilyAvailability(partnerId, familyId);
    const a = avail[0];
    if (!a || a.available < d.needed) {
      return { ok: false, status: 409, body: {
        code: "HARDWARE_REQUIRED",
        error: `${d.familyName}: not enough partner-owned hardware (${a?.available ?? 0} available, ${d.needed} needed). Add the hardware product to the order or pick a full-unit option.`,
        familyId, familyName: d.familyName,
        hardwareProductId: d.hardwareProductId,
        available: a?.available ?? 0, needed: d.needed,
      } };
    }
  }

  // Prefill inventorySourceInventoryId for components, accounting for prior
  // picks in the same order so we don't double-book a thin row.
  const allocatedByRow = new Map<number, number>();
  for (const it of items) {
    if (!it.productId) continue;
    const ctx = ctxByProduct.get(it.productId);
    if (!ctx || ctx.member.role === "hardware") continue;
    if (!ctx.family.requiresHardwareDefault || !ctx.family.hardwareProductId) continue;
    if (hardwareInOrder.has(ctx.family.hardwareProductId)) continue;
    if (it.inventorySourceInventoryId) {
      allocatedByRow.set(it.inventorySourceInventoryId, (allocatedByRow.get(it.inventorySourceInventoryId) ?? 0) + (it.quantity ?? 1));
      // Force the fulfillment mode so reserveForItem actually runs.
      it.fulfillmentMode = "use_existing_partner_inventory";
      continue;
    }
    const pick = await pickInventoryRowForFamily(partnerId, ctx.family.hardwareProductId, eventCityId, allocatedByRow);
    if (pick) {
      it.inventorySourceInventoryId = pick.inventoryId;
      it.inventorySourceCityId = it.inventorySourceCityId ?? pick.cityId;
      it.fulfillmentMode = "use_existing_partner_inventory";
      allocatedByRow.set(pick.inventoryId, (allocatedByRow.get(pick.inventoryId) ?? 0) + (it.quantity ?? 1));
    }
  }
  return { ok: true };
}
