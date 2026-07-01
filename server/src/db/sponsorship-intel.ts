/**
 * Friction Elimination - Sponsorship Intelligence data-access layer (Upgrade 16).
 *
 * Org-scoped, IDOR-safe access over the sponsorship_metrics table created in
 * db/schema-fe-sponsorship-intel.sql, plus query helpers that load
 * sponsorship_opportunities joined to their metrics for the deterministic
 * recommendation engine (server/src/lib/sponsorshipIntel.ts).
 *
 * Authorization mirrors server/src/db/revenue-inventory.ts: a metrics row hangs
 * off a sponsorship_opportunities row, which hangs off a `venues` row owned by
 * an organization. An actor may read/write when their org owns the opportunity's
 * venue, or they are an admin / super_admin. Every opportunity id is validated
 * against the actor's org before any write, so a forged id from another tenant
 * is rejected (ForbiddenError) rather than silently acted on.
 *
 * The brand-matching helper that scans OPEN opportunities across all venues is
 * intentionally cross-org (read only, status = 'open'), matching the existing
 * marketplace browse semantics.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import type { SponsorshipCandidate } from "../lib/sponsorshipIntel.js";

// ---- Row types --------------------------------------------------------------

export type SponsorshipMetricsRow = {
  id: string;
  sponsorship_opportunity_id: string | null;
  impressions: number | null;
  demographics: unknown;
  historical_performance: unknown;
  revenue: number | null;
  asset_availability: unknown;
  updated_at: string;
};

export type SponsorshipMetricsInput = {
  impressions?: number | null;
  demographics?: unknown;
  historical_performance?: unknown;
  revenue?: number | null;
  asset_availability?: unknown;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the organization that owns a sponsorship opportunity (via its venue),
 * or throw NotFound. Used as the IDOR gate: callers compare the result against
 * the actor's org. An opportunity also carries its own organization_id, so we
 * prefer the venue's owning org and fall back to the opportunity's org column.
 */
async function opportunityOrgId(opportunityId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null; venue_org: string | null }>(
    `select so.organization_id, ve.organization_id as venue_org
       from sponsorship_opportunities so
       left join venues ve on ve.id = so.venue_id
      where so.id = $1`,
    [opportunityId],
  );
  if (!row) throw new NotFoundError("sponsorship opportunity not found");
  return row.venue_org ?? row.organization_id;
}

/**
 * Assert the actor may act on this opportunity (their org owns it, or admin).
 * Throws NotFoundError when missing, ForbiddenError when it belongs to another
 * org. Returns the owning org id.
 */
async function assertOpportunityAccess(
  actor: Actor,
  opportunityId: string,
): Promise<string | null> {
  const orgId = await opportunityOrgId(opportunityId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this sponsorship opportunity");
  }
  return orgId;
}

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

// ============================================================================
// sponsorship_metrics: get / upsert
// ============================================================================

/**
 * Get the metrics row for an opportunity (org-scoped via the opportunity's
 * venue). Returns null when no metrics row exists yet (the opportunity is still
 * valid, it just has no intelligence captured).
 */
export async function getMetrics(
  actor: Actor,
  opportunityId: string,
): Promise<SponsorshipMetricsRow | null> {
  await assertOpportunityAccess(actor, opportunityId);
  return q1<SponsorshipMetricsRow>(
    `select * from sponsorship_metrics where sponsorship_opportunity_id = $1`,
    [opportunityId],
  );
}

/**
 * Upsert the metrics row for an opportunity (org-scoped via its venue). One row
 * per opportunity (unique). On conflict each column coalesces so a partial PUT
 * leaves untouched fields intact.
 */
export async function upsertMetrics(
  actor: Actor,
  opportunityId: string,
  input: SponsorshipMetricsInput,
): Promise<SponsorshipMetricsRow> {
  await assertOpportunityAccess(actor, opportunityId);
  const row = await q1<SponsorshipMetricsRow>(
    `insert into sponsorship_metrics
       (sponsorship_opportunity_id, impressions, demographics, historical_performance,
        revenue, asset_availability, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (sponsorship_opportunity_id) do update set
       impressions = coalesce($2, sponsorship_metrics.impressions),
       demographics = coalesce($3, sponsorship_metrics.demographics),
       historical_performance = coalesce($4, sponsorship_metrics.historical_performance),
       revenue = coalesce($5, sponsorship_metrics.revenue),
       asset_availability = coalesce($6, sponsorship_metrics.asset_availability),
       updated_at = now()
     returning *`,
    [
      opportunityId,
      input.impressions ?? null,
      jsonbParam(input.demographics) ?? null,
      jsonbParam(input.historical_performance) ?? null,
      input.revenue ?? null,
      jsonbParam(input.asset_availability) ?? null,
    ],
  );
  return row as SponsorshipMetricsRow;
}

// ============================================================================
// Query helpers for the recommendation engine
// ============================================================================

const CANDIDATE_SELECT = `
  select so.id, so.venue_id, so.organization_id, so.name, so.category,
         so.audience_size, so.impression_estimate, so.pricing, so.deliverables,
         so.availability, so.status,
         sm.impressions, sm.demographics, sm.historical_performance,
         sm.revenue, sm.asset_availability
    from sponsorship_opportunities so
    left join sponsorship_metrics sm on sm.sponsorship_opportunity_id = so.id`;

/**
 * Load a venue's sponsorship opportunities joined to their metrics, for the
 * event-side recommendation (recommendSponsorships). Org-scoped + IDOR-safe via
 * the venue's owning org.
 */
export async function candidatesForVenue(
  actor: Actor,
  venueId: string,
): Promise<SponsorshipCandidate[]> {
  // Authorize the venue the same way the revenue-inventory repo does.
  const venue = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!venue) throw new NotFoundError("venue not found");
  if (!isAdmin(actor) && (!actor.org?.id || venue.organization_id !== actor.org.id)) {
    throw new ForbiddenError("no access to this venue");
  }
  return q<SponsorshipCandidate>(`${CANDIDATE_SELECT} where so.venue_id = $1`, [venueId]);
}

/**
 * Load OPEN sponsorship opportunities across all venues joined to their metrics,
 * for the brand-side match (matchBrandsToVenues). Intentionally cross-org (read
 * only, status = 'open'), matching the marketplace browse. Optional category
 * filter and a sane row cap.
 */
export async function openCandidates(
  category?: string | null,
  limit = 200,
): Promise<SponsorshipCandidate[]> {
  const cap = Math.max(1, Math.min(500, Number.isFinite(limit) ? limit : 200));
  if (category) {
    return q<SponsorshipCandidate>(
      `${CANDIDATE_SELECT} where so.status = 'open' and so.category = $1
        order by so.created_at desc limit $2`,
      [category, cap],
    );
  }
  return q<SponsorshipCandidate>(
    `${CANDIDATE_SELECT} where so.status = 'open' order by so.created_at desc limit $1`,
    [cap],
  );
}
