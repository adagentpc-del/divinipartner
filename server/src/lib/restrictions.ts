/**
 * Venue Intelligence - structured restriction lookups (Phase 1 foundation).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md requires restrictions to be structured (never
 * free-text only) so quote automation can consume them deterministically. This
 * module reads the venue_restrictions table and returns allowed/prohibited rules
 * for a venue, optionally narrowed to a single branding opportunity (which also
 * includes the venue-wide rules).
 *
 * Reads use the q/q1 helpers. These are intentionally unscoped helpers: the
 * route layer (server/src/routes/*) and the repo (server/src/db/venue-twin.ts)
 * own authorization; the quote automation engines call these once a venue is
 * already authorized.
 */
import { q } from "../pool.js";

export interface RestrictionRow {
  id: string;
  venue_id: string | null;
  branding_opportunity_id: string | null;
  organization_id: string | null;
  rule_type: "allowed" | "prohibited" | null;
  category: string | null;
  value: string | null;
  notes: string | null;
  created_at: string;
}

/** Restrictions split into the two structured buckets quote automation reads. */
export interface StructuredRestrictions {
  allowed: RestrictionRow[];
  prohibited: RestrictionRow[];
}

/** Split a flat list of restriction rows into allowed / prohibited buckets. */
export function splitRestrictions(rows: RestrictionRow[]): StructuredRestrictions {
  const allowed: RestrictionRow[] = [];
  const prohibited: RestrictionRow[] = [];
  for (const r of rows) {
    if (r.rule_type === "prohibited") prohibited.push(r);
    else if (r.rule_type === "allowed") allowed.push(r);
  }
  return { allowed, prohibited };
}

/**
 * All restriction rows for a venue (venue-wide and opportunity-specific),
 * newest first.
 */
export async function listVenueRestrictions(venueId: string): Promise<RestrictionRow[]> {
  return q<RestrictionRow>(
    `select * from venue_restrictions
      where venue_id = $1
      order by created_at desc`,
    [venueId],
  );
}

/**
 * Structured allowed/prohibited restrictions for a venue. When
 * `brandingOpportunityId` is given, the result is limited to that opportunity
 * PLUS the venue-wide rules (branding_opportunity_id is null), since venue-wide
 * rules always apply. When omitted, every restriction for the venue is returned.
 */
export async function getStructuredRestrictions(
  venueId: string,
  brandingOpportunityId?: string | null,
): Promise<StructuredRestrictions> {
  let rows: RestrictionRow[];
  if (brandingOpportunityId) {
    rows = await q<RestrictionRow>(
      `select * from venue_restrictions
        where venue_id = $1
          and (branding_opportunity_id = $2 or branding_opportunity_id is null)
        order by created_at desc`,
      [venueId, brandingOpportunityId],
    );
  } else {
    rows = await listVenueRestrictions(venueId);
  }
  return splitRestrictions(rows);
}

/**
 * The venue-wide restrictions only (branding_opportunity_id is null). Useful as
 * the baseline ruleset before an opportunity is selected.
 */
export async function getVenueWideRestrictions(
  venueId: string,
): Promise<StructuredRestrictions> {
  const rows = await q<RestrictionRow>(
    `select * from venue_restrictions
      where venue_id = $1 and branding_opportunity_id is null
      order by created_at desc`,
    [venueId],
  );
  return splitRestrictions(rows);
}
