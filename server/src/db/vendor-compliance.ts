/**
 * Friction Elimination - vendor-compliance data-access (U9 + U11).
 *
 * Org-scoped, IDOR-safe access over the vendor_compliance table created in
 * db/schema-fe-compliance.sql. This file EXTENDS the Phase-4 vendor-readiness
 * area without modifying it: it has its own table and its own pure scorer
 * (server/src/lib/vendorCompliance.ts), and it only READS the Phase-4
 * vendor_readiness table (optionally, if a row exists) to enrich the
 * Transparent Preferred Vendor "WHY" reasons.
 *
 * Authorization mirrors server/src/db/vendor-readiness.ts and venue-twin.ts:
 *   - vendor_compliance belongs to the organization that owns the underlying
 *     `vendors` row (vendors.organization_id). An actor may read/write when
 *     their org owns the vendor, or they are an admin / super_admin. A forged
 *     vendor id from another tenant is rejected (ForbiddenError); an unknown
 *     vendor id is a NotFoundError.
 *
 * On every write the `score` is recomputed via computeVendorCompliance and
 * persisted, so the stored score always reflects current signals.
 */
import { q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  computeVendorCompliance,
  vendorComplianceBreakdown,
  buildPreferredWhy,
  type VendorComplianceSignals,
  type VendorComplianceFactor,
  type VendorLicense,
  type VendorVenueRating,
  type ComplianceDocStatus,
  type PreferredWhyStats,
} from "../lib/vendorCompliance.js";

// ---- Row types --------------------------------------------------------------

export type VendorComplianceRow = {
  id: string;
  vendor_id: string | null;
  insurance_status: string | null;
  coi_status: string | null;
  w9_status: string | null;
  licenses: unknown;
  reviews_score: string | null;
  on_time_rate: string | null;
  completion_history: number | null;
  venue_ratings: unknown;
  score: number | null;
  updated_at: string;
};

// ---- Authorization (mirrors vendor-readiness.ts) ----------------------------

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

// ---- Signal mapping ---------------------------------------------------------

/** Coerce a stored jsonb column into a typed array (or null). */
function asArray<T>(v: unknown): T[] | null {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Map a stored row to the pure signal bag the score reads. */
function rowToSignals(row: VendorComplianceRow | null): VendorComplianceSignals {
  return {
    insurance_status: (row?.insurance_status ?? null) as ComplianceDocStatus,
    coi_status: (row?.coi_status ?? null) as ComplianceDocStatus,
    w9_status: (row?.w9_status ?? null) as ComplianceDocStatus,
    licenses: asArray<VendorLicense>(row?.licenses),
    reviews_score: row?.reviews_score != null ? Number(row.reviews_score) : null,
    on_time_rate: row?.on_time_rate != null ? Number(row.on_time_rate) : null,
    completion_history: row?.completion_history != null ? Number(row.completion_history) : null,
    venue_ratings: asArray<VendorVenueRating>(row?.venue_ratings),
  };
}

// ---- get / upsert -----------------------------------------------------------

export type VendorComplianceResult = {
  row: VendorComplianceRow | null;
  score: number;
  breakdown: VendorComplianceFactor[];
  why: string[];
};

/** Get the compliance row for a vendor (or null if never computed), org-scoped. */
export async function getVendorCompliance(
  actor: Actor,
  vendorId: string,
): Promise<VendorComplianceResult> {
  await assertVendorAccess(actor, vendorId);
  const row = await q1<VendorComplianceRow>(
    `select * from vendor_compliance where vendor_id = $1`,
    [vendorId],
  );
  const signals = rowToSignals(row);
  return {
    row,
    score: row?.score ?? computeVendorCompliance(signals),
    breakdown: vendorComplianceBreakdown(signals),
    why: await getVendorWhy(actor, vendorId, { skipAuth: true }),
  };
}

export type VendorComplianceInput = {
  insurance_status?: string | null;
  coi_status?: string | null;
  w9_status?: string | null;
  licenses?: VendorLicense[] | null;
  reviews_score?: number | null;
  on_time_rate?: number | null;
  completion_history?: number | null;
  venue_ratings?: VendorVenueRating[] | null;
};

/** Serialize an optional jsonb input; undefined stays undefined (keep old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

/**
 * Create or update the compliance signals for a vendor (one row per vendor) and
 * recompute + store the score. Idempotent on vendor_id. Any field left
 * undefined keeps its prior value (coalesce); pass null to clear it.
 */
export async function upsertVendorCompliance(
  actor: Actor,
  vendorId: string,
  input: VendorComplianceInput,
): Promise<VendorComplianceResult> {
  await assertVendorAccess(actor, vendorId);

  const existing = await q1<VendorComplianceRow>(
    `select * from vendor_compliance where vendor_id = $1`,
    [vendorId],
  );
  const prior = rowToSignals(existing);

  // Merge incoming signals over the existing row, then compute the score from
  // the merged set so the persisted score matches the persisted signals.
  const merged: VendorComplianceSignals = {
    insurance_status:
      input.insurance_status !== undefined ? input.insurance_status : prior.insurance_status,
    coi_status: input.coi_status !== undefined ? input.coi_status : prior.coi_status,
    w9_status: input.w9_status !== undefined ? input.w9_status : prior.w9_status,
    licenses: input.licenses !== undefined ? input.licenses : prior.licenses,
    reviews_score:
      input.reviews_score !== undefined ? input.reviews_score : prior.reviews_score,
    on_time_rate: input.on_time_rate !== undefined ? input.on_time_rate : prior.on_time_rate,
    completion_history:
      input.completion_history !== undefined
        ? input.completion_history
        : prior.completion_history,
    venue_ratings:
      input.venue_ratings !== undefined ? input.venue_ratings : prior.venue_ratings,
  };
  const score = computeVendorCompliance(merged);

  const row = await q1<VendorComplianceRow>(
    `insert into vendor_compliance
       (vendor_id, insurance_status, coi_status, w9_status, licenses, reviews_score,
        on_time_rate, completion_history, venue_ratings, score, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (vendor_id) do update set
        insurance_status = excluded.insurance_status,
        coi_status = excluded.coi_status,
        w9_status = excluded.w9_status,
        licenses = excluded.licenses,
        reviews_score = excluded.reviews_score,
        on_time_rate = excluded.on_time_rate,
        completion_history = excluded.completion_history,
        venue_ratings = excluded.venue_ratings,
        score = excluded.score,
        updated_at = now()
     returning *`,
    [
      vendorId,
      merged.insurance_status ?? null,
      merged.coi_status ?? null,
      merged.w9_status ?? null,
      jsonbParam(merged.licenses) ?? null,
      merged.reviews_score ?? null,
      merged.on_time_rate ?? null,
      merged.completion_history ?? null,
      jsonbParam(merged.venue_ratings) ?? null,
      score,
    ],
  );
  return {
    row: row as VendorComplianceRow,
    score,
    breakdown: vendorComplianceBreakdown(merged),
    why: await getVendorWhy(actor, vendorId, { skipAuth: true }),
  };
}

/**
 * Recompute the score for a vendor from its currently-stored signals and
 * persist it. No-op (returns 0) when no compliance row exists yet. Callers run
 * this after upstream signals change. Org-scoped.
 */
export async function recomputeVendorCompliance(actor: Actor, vendorId: string): Promise<number> {
  await assertVendorAccess(actor, vendorId);
  const existing = await q1<VendorComplianceRow>(
    `select * from vendor_compliance where vendor_id = $1`,
    [vendorId],
  );
  if (!existing) return 0;
  const score = computeVendorCompliance(rowToSignals(existing));
  await pool.query(
    `update vendor_compliance set score = $2, updated_at = now() where vendor_id = $1`,
    [vendorId, score],
  );
  return score;
}

// ---- Transparent Preferred Vendor "WHY" (U11) -------------------------------

/** A partial Phase-4 readiness row, read only to enrich the WHY reasons. */
type ReadinessLite = {
  reviews_score: string | null;
  completion_history: string | null;
};

/**
 * Assemble the human "WHY" reasons for a vendor (U11). Org-scoped (pass
 * { skipAuth: true } from a caller that has already asserted access, to avoid a
 * redundant lookup). Combines the vendor_compliance row with the Phase-4
 * vendor_readiness row when present: compliance is authoritative, readiness
 * fills gaps (e.g. reviews / completion history) if compliance has not set
 * them. Returns an empty array when there is nothing real to say.
 */
export async function getVendorWhy(
  actor: Actor,
  vendorId: string,
  opts: { skipAuth?: boolean } = {},
): Promise<string[]> {
  if (!opts.skipAuth) await assertVendorAccess(actor, vendorId);

  const compliance = await q1<VendorComplianceRow>(
    `select * from vendor_compliance where vendor_id = $1`,
    [vendorId],
  );
  const readiness = await q1<ReadinessLite>(
    `select reviews_score, completion_history from vendor_readiness where vendor_id = $1`,
    [vendorId],
  );

  const signals = rowToSignals(compliance);

  // Prefer compliance values; fall back to the Phase-4 readiness row. Note the
  // readiness completion_history is a 0-1 share, so it is only a fallback for
  // a non-zero signal, not a literal project count.
  const reviewsScore =
    signals.reviews_score != null
      ? signals.reviews_score
      : readiness?.reviews_score != null
        ? Number(readiness.reviews_score)
        : null;

  const stats: PreferredWhyStats = {
    reviews_score: reviewsScore,
    on_time_rate: signals.on_time_rate,
    completion_history: signals.completion_history,
    venue_ratings: signals.venue_ratings,
    insurance_status: signals.insurance_status,
    coi_status: signals.coi_status,
    w9_status: signals.w9_status,
    licenses: signals.licenses,
    compliance_score: compliance?.score ?? null,
  };

  return buildPreferredWhy(stats);
}
