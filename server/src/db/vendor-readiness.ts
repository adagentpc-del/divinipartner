/**
 * Venue Intelligence - vendor-readiness + preferred-vendors data-access (Phase 4).
 *
 * Org-scoped, IDOR-safe access over the Phase 4 tables created in
 * db/schema-vi-p4.sql:
 *   - vendor_readiness   (get / upsert, one row per vendor; recompute on write)
 *   - preferred_vendors  (venue-scoped list / set / remove)
 *
 * Authorization mirrors server/src/db/venue-twin.ts and events.ts:
 *   - vendor_readiness belongs to the organization that owns the underlying
 *     `vendors` row (vendors.organization_id). An actor may read/write when
 *     their org owns the vendor, or they are an admin / super_admin.
 *   - preferred_vendors belongs to the organization that owns the `venues` row
 *     (venues.organization_id). Only a venue's own org (or admin) may curate its
 *     preferred list. The venue id is validated against the actor's org before
 *     any write so a forged id from another tenant is rejected (ForbiddenError).
 *
 * On every vendor_readiness write the `score` is recomputed via
 * computeVendorReadiness (server/src/lib/vendorReadiness.ts) and persisted, so
 * the stored score always reflects current signals.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  computeVendorReadiness,
  vendorReadinessBreakdown,
  type VendorReadinessSignals,
  type VendorReadinessFactor,
  type PreferredTier,
} from "../lib/vendorReadiness.js";

// ---- Row types --------------------------------------------------------------

export type VendorReadinessRow = {
  id: string;
  vendor_id: string | null;
  response_speed: string | null;
  quote_speed: string | null;
  approval_rate: string | null;
  win_rate: string | null;
  profile_completeness: string | null;
  insurance_uploaded: boolean | null;
  w9_uploaded: boolean | null;
  reviews_score: string | null;
  completion_history: string | null;
  score: number | null;
  updated_at: string;
};

export type PreferredVendorRow = {
  id: string;
  venue_id: string | null;
  vendor_id: string | null;
  tier: PreferredTier | null;
  preloaded_pricing: unknown;
  created_at: string;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** Resolve the org that owns a vendor, or throw NotFound. */
async function vendorOrgId(vendorId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [vendorId],
  );
  if (!row) throw new NotFoundError("vendor not found");
  return row.organization_id;
}

/**
 * Assert the actor may act on this vendor (their org owns it, or admin). Throws
 * NotFoundError when the vendor does not exist, ForbiddenError when it belongs
 * to another org. Returns the vendor's owning org id.
 */
async function assertVendorAccess(actor: Actor, vendorId: string): Promise<string | null> {
  const orgId = await vendorOrgId(vendorId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this vendor");
  }
  return orgId;
}

/** Resolve the org that owns a venue, or throw NotFound. */
async function venueOrgId(venueId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  return row.organization_id;
}

/**
 * Assert the actor may curate this venue's preferred list (their org owns the
 * venue, or admin). Returns the venue's owning org id.
 */
async function assertVenueAccess(actor: Actor, venueId: string): Promise<string | null> {
  const orgId = await venueOrgId(venueId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
  return orgId;
}

// ---- current vendor resolution ---------------------------------------------

/**
 * Resolve the vendor row id owned by the actor's own organization, or null when
 * the actor has no org or no vendor row. IDOR-safe by construction: it only ever
 * returns a vendor that belongs to the actor's own org (never an arbitrary id),
 * so a vendor can load their own readiness score without knowing the id. Mirrors
 * the vendorIdForOrg pattern used by db/inventory.ts and db/packages.ts.
 */
export async function getMyVendorId(actor: Actor): Promise<string | null> {
  if (!actor.org?.id) return null;
  const row = await q1<{ id: string }>(
    `select id from vendors where organization_id = $1 order by created_at asc limit 1`,
    [actor.org.id],
  );
  return row?.id ?? null;
}

// ---- vendor_readiness: get / upsert ----------------------------------------

/** Map a stored row to the pure signal bag the score reads. */
function rowToSignals(row: VendorReadinessRow | null): VendorReadinessSignals {
  return {
    response_speed: row?.response_speed != null ? Number(row.response_speed) : null,
    quote_speed: row?.quote_speed != null ? Number(row.quote_speed) : null,
    approval_rate: row?.approval_rate != null ? Number(row.approval_rate) : null,
    win_rate: row?.win_rate != null ? Number(row.win_rate) : null,
    profile_completeness:
      row?.profile_completeness != null ? Number(row.profile_completeness) : null,
    reviews_score: row?.reviews_score != null ? Number(row.reviews_score) : null,
    completion_history:
      row?.completion_history != null ? Number(row.completion_history) : null,
    insurance_uploaded: row?.insurance_uploaded ?? false,
    w9_uploaded: row?.w9_uploaded ?? false,
  };
}

/** Get the readiness row for a vendor (or null if never computed), org-scoped. */
export async function getVendorReadiness(
  actor: Actor,
  vendorId: string,
): Promise<{ row: VendorReadinessRow | null; score: number; breakdown: VendorReadinessFactor[] }> {
  await assertVendorAccess(actor, vendorId);
  const row = await q1<VendorReadinessRow>(
    `select * from vendor_readiness where vendor_id = $1`,
    [vendorId],
  );
  const signals = rowToSignals(row);
  return {
    row,
    score: row?.score ?? computeVendorReadiness(signals),
    breakdown: vendorReadinessBreakdown(signals),
  };
}

export type VendorReadinessInput = {
  response_speed?: number | null;
  quote_speed?: number | null;
  approval_rate?: number | null;
  win_rate?: number | null;
  profile_completeness?: number | null;
  insurance_uploaded?: boolean | null;
  w9_uploaded?: boolean | null;
  reviews_score?: number | null;
  completion_history?: number | null;
};

/**
 * Create or update the readiness signals for a vendor (one row per vendor) and
 * recompute + store the score. Idempotent on vendor_id. Any field left
 * undefined keeps its prior value (coalesce); pass null to clear it.
 */
export async function upsertVendorReadiness(
  actor: Actor,
  vendorId: string,
  input: VendorReadinessInput,
): Promise<{ row: VendorReadinessRow; score: number; breakdown: VendorReadinessFactor[] }> {
  await assertVendorAccess(actor, vendorId);

  // Merge incoming signals over the existing row, then compute the score from
  // the merged set so the persisted score matches the persisted signals.
  const existing = await q1<VendorReadinessRow>(
    `select * from vendor_readiness where vendor_id = $1`,
    [vendorId],
  );
  const merged: VendorReadinessSignals = {
    response_speed:
      input.response_speed !== undefined
        ? input.response_speed
        : existing?.response_speed != null
          ? Number(existing.response_speed)
          : null,
    quote_speed:
      input.quote_speed !== undefined
        ? input.quote_speed
        : existing?.quote_speed != null
          ? Number(existing.quote_speed)
          : null,
    approval_rate:
      input.approval_rate !== undefined
        ? input.approval_rate
        : existing?.approval_rate != null
          ? Number(existing.approval_rate)
          : null,
    win_rate:
      input.win_rate !== undefined
        ? input.win_rate
        : existing?.win_rate != null
          ? Number(existing.win_rate)
          : null,
    profile_completeness:
      input.profile_completeness !== undefined
        ? input.profile_completeness
        : existing?.profile_completeness != null
          ? Number(existing.profile_completeness)
          : null,
    reviews_score:
      input.reviews_score !== undefined
        ? input.reviews_score
        : existing?.reviews_score != null
          ? Number(existing.reviews_score)
          : null,
    completion_history:
      input.completion_history !== undefined
        ? input.completion_history
        : existing?.completion_history != null
          ? Number(existing.completion_history)
          : null,
    insurance_uploaded:
      input.insurance_uploaded !== undefined
        ? input.insurance_uploaded
        : (existing?.insurance_uploaded ?? false),
    w9_uploaded:
      input.w9_uploaded !== undefined
        ? input.w9_uploaded
        : (existing?.w9_uploaded ?? false),
  };
  const score = computeVendorReadiness(merged);

  const row = await q1<VendorReadinessRow>(
    `insert into vendor_readiness
       (vendor_id, response_speed, quote_speed, approval_rate, win_rate,
        profile_completeness, insurance_uploaded, w9_uploaded, reviews_score,
        completion_history, score, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (vendor_id) do update set
        response_speed = excluded.response_speed,
        quote_speed = excluded.quote_speed,
        approval_rate = excluded.approval_rate,
        win_rate = excluded.win_rate,
        profile_completeness = excluded.profile_completeness,
        insurance_uploaded = excluded.insurance_uploaded,
        w9_uploaded = excluded.w9_uploaded,
        reviews_score = excluded.reviews_score,
        completion_history = excluded.completion_history,
        score = excluded.score,
        updated_at = now()
     returning *`,
    [
      vendorId,
      merged.response_speed ?? null,
      merged.quote_speed ?? null,
      merged.approval_rate ?? null,
      merged.win_rate ?? null,
      merged.profile_completeness ?? null,
      merged.insurance_uploaded ?? false,
      merged.w9_uploaded ?? false,
      merged.reviews_score ?? null,
      merged.completion_history ?? null,
      score,
    ],
  );
  return { row: row as VendorReadinessRow, score, breakdown: vendorReadinessBreakdown(merged) };
}

/**
 * Recompute the score for a vendor from its currently-stored signals and
 * persist it. No-op (returns 0) when no readiness row exists yet. Callers run
 * this after upstream signals change. Org-scoped.
 */
export async function recomputeVendorReadiness(actor: Actor, vendorId: string): Promise<number> {
  await assertVendorAccess(actor, vendorId);
  const existing = await q1<VendorReadinessRow>(
    `select * from vendor_readiness where vendor_id = $1`,
    [vendorId],
  );
  if (!existing) return 0;
  const score = computeVendorReadiness(rowToSignals(existing));
  await pool.query(
    `update vendor_readiness set score = $2, updated_at = now() where vendor_id = $1`,
    [vendorId, score],
  );
  return score;
}

// ---- preferred_vendors: list / set / remove --------------------------------

const PREFERRED_TIERS = new Set<string>(["preferred", "approved", "exclusive", "recommended"]);
export function isPreferredTier(v: unknown): v is PreferredTier {
  return typeof v === "string" && PREFERRED_TIERS.has(v);
}

/** List the vendors a venue has marked preferred (org-scoped), newest first. */
export async function listPreferredVendors(
  actor: Actor,
  venueId: string,
): Promise<PreferredVendorRow[]> {
  await assertVenueAccess(actor, venueId);
  return q<PreferredVendorRow>(
    `select * from preferred_vendors where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

export type SetPreferredVendorInput = {
  vendor_id: string;
  tier: PreferredTier;
  preloaded_pricing?: unknown;
};

/** Serialize an optional jsonb input; undefined stays undefined (keep old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

/**
 * Mark (or update) a vendor as preferred for a venue. Idempotent on
 * (venue, vendor). Validates the tier and that the target vendor exists.
 * Org-scoped to the venue's owner.
 */
export async function setPreferredVendor(
  actor: Actor,
  venueId: string,
  input: SetPreferredVendorInput,
): Promise<PreferredVendorRow> {
  await assertVenueAccess(actor, venueId);
  if (!input.vendor_id || typeof input.vendor_id !== "string") {
    throw new ForbiddenError("vendor_id required");
  }
  if (!isPreferredTier(input.tier)) throw new ForbiddenError("invalid tier");
  // Confirm the vendor exists (a forged id from nowhere is rejected). The vendor
  // may belong to any org: a venue can prefer any vendor on the platform.
  const exists = await q1<{ id: string }>(`select id from vendors where id = $1`, [
    input.vendor_id,
  ]);
  if (!exists) throw new NotFoundError("vendor not found");

  const row = await q1<PreferredVendorRow>(
    `insert into preferred_vendors (venue_id, vendor_id, tier, preloaded_pricing)
       values ($1,$2,$3,$4)
     on conflict (venue_id, vendor_id) do update set
        tier = excluded.tier,
        preloaded_pricing = coalesce(excluded.preloaded_pricing, preferred_vendors.preloaded_pricing)
     returning *`,
    [venueId, input.vendor_id, input.tier, jsonbParam(input.preloaded_pricing) ?? null],
  );
  return row as PreferredVendorRow;
}

/** Remove a vendor from a venue's preferred list (org-scoped to the venue). */
export async function removePreferredVendor(
  actor: Actor,
  venueId: string,
  vendorId: string,
): Promise<void> {
  await assertVenueAccess(actor, venueId);
  await pool.query(`delete from preferred_vendors where venue_id = $1 and vendor_id = $2`, [
    venueId,
    vendorId,
  ]);
}
