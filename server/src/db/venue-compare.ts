/**
 * Friction Elimination - UPGRADE 3 Venue Comparison Engine (data access).
 *
 * Org-scoped, IDOR-safe CRUD over venue_compare_attrs (one row per venue,
 * db/schema-fe-venue-compare.sql) plus buildComparison(), which reads the venue,
 * its venue_twin, its venue_compare_attrs, and its venue_restrictions count to
 * produce a normalized side-by-side comparison row including an Estimated Total
 * Cost (server/src/lib/venueCompare.ts).
 *
 * Authorization mirrors server/src/db/venue-twin.ts exactly: attrs belong to the
 * organization that owns the underlying `venues` row (venues.organization_id). An
 * actor may read/write a venue's compare attrs when their org owns the venue, or
 * they are admin / super_admin. Every venue id is validated against the actor's
 * org before any write, so a forged id from another tenant is rejected
 * (ForbiddenError) rather than silently acted on.
 *
 * buildComparison is deliberately read-only and per-venue access-checked: any
 * authenticated user may compare venues they are allowed to see; venues they do
 * not own (and are not admin for) are skipped rather than throwing, so a mixed
 * list still returns the rows the caller is entitled to.
 */
import { q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  buildComparisonRow,
  type ComparisonRow,
  type CompareVenue,
  type CompareTwin,
  type CompareAttrs,
  type EstimateInputs,
} from "../lib/venueCompare.js";

// ---- Row type ---------------------------------------------------------------

export type VenueCompareAttrsRow = {
  id: string;
  venue_id: string | null;
  rental_cost: string | null;
  av_included: boolean | null;
  tables_included: boolean | null;
  furniture_included: boolean | null;
  fnb_minimum: string | null;
  security_required: boolean | null;
  insurance_required: boolean | null;
  setup_window: unknown;
  teardown_window: unknown;
  extras: unknown;
  updated_at: string;
};

// ---- Authorization (mirrors venue-twin.ts) ----------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** Resolve the organization that owns a venue, or throw NotFound. */
async function venueOrgId(venueId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  return row.organization_id;
}

/**
 * Assert the actor may act on this venue (their org owns it, or admin). Throws
 * NotFoundError when the venue does not exist, ForbiddenError when it belongs to
 * another org. Returns the venue's owning org id.
 */
async function assertVenueAccess(actor: Actor, venueId: string): Promise<string | null> {
  const orgId = await venueOrgId(venueId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
  return orgId;
}

/**
 * Read-only access check that does NOT throw on a foreign venue: returns true
 * when the actor may read the venue, false when it belongs to another org.
 * Throws only when the venue does not exist. Used by buildComparison to skip
 * venues the caller is not entitled to rather than failing the whole compare.
 */
async function canReadVenue(actor: Actor, venueId: string): Promise<boolean> {
  const orgId = await venueOrgId(venueId);
  if (isAdmin(actor)) return true;
  return Boolean(actor.org?.id) && orgId === actor.org!.id;
}

// ---- venue_compare_attrs: get / upsert -------------------------------------

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

/** Get the compare attrs for a venue (or null if not started), org-scoped. */
export async function getCompareAttrs(
  actor: Actor,
  venueId: string,
): Promise<VenueCompareAttrsRow | null> {
  await assertVenueAccess(actor, venueId);
  return q1<VenueCompareAttrsRow>(
    `select * from venue_compare_attrs where venue_id = $1`,
    [venueId],
  );
}

export type CompareAttrsInput = {
  rental_cost?: number | null;
  av_included?: boolean | null;
  tables_included?: boolean | null;
  furniture_included?: boolean | null;
  fnb_minimum?: number | null;
  security_required?: boolean | null;
  insurance_required?: boolean | null;
  setup_window?: unknown;
  teardown_window?: unknown;
  extras?: unknown;
};

/**
 * Create or update the compare attrs for a venue (one row per venue). Idempotent
 * on venue_id. coalesce keeps existing values when a field is omitted (undefined
 * -> null param means "leave as-is" for scalars too, matching venue-twin.ts).
 */
export async function upsertCompareAttrs(
  actor: Actor,
  venueId: string,
  input: CompareAttrsInput,
): Promise<VenueCompareAttrsRow> {
  await assertVenueAccess(actor, venueId);
  await q1<VenueCompareAttrsRow>(
    `insert into venue_compare_attrs
       (venue_id, rental_cost, av_included, tables_included, furniture_included,
        fnb_minimum, security_required, insurance_required, setup_window,
        teardown_window, extras)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (venue_id) do update set
        rental_cost = coalesce(excluded.rental_cost, venue_compare_attrs.rental_cost),
        av_included = coalesce(excluded.av_included, venue_compare_attrs.av_included),
        tables_included = coalesce(excluded.tables_included, venue_compare_attrs.tables_included),
        furniture_included = coalesce(excluded.furniture_included, venue_compare_attrs.furniture_included),
        fnb_minimum = coalesce(excluded.fnb_minimum, venue_compare_attrs.fnb_minimum),
        security_required = coalesce(excluded.security_required, venue_compare_attrs.security_required),
        insurance_required = coalesce(excluded.insurance_required, venue_compare_attrs.insurance_required),
        setup_window = coalesce(excluded.setup_window, venue_compare_attrs.setup_window),
        teardown_window = coalesce(excluded.teardown_window, venue_compare_attrs.teardown_window),
        extras = coalesce(excluded.extras, venue_compare_attrs.extras),
        updated_at = now()
     returning *`,
    [
      venueId,
      input.rental_cost ?? null,
      input.av_included ?? null,
      input.tables_included ?? null,
      input.furniture_included ?? null,
      input.fnb_minimum ?? null,
      input.security_required ?? null,
      input.insurance_required ?? null,
      jsonbParam(input.setup_window) ?? null,
      jsonbParam(input.teardown_window) ?? null,
      jsonbParam(input.extras) ?? null,
    ],
  );
  const row = await q1<VenueCompareAttrsRow>(
    `select * from venue_compare_attrs where venue_id = $1`,
    [venueId],
  );
  return row as VenueCompareAttrsRow;
}

// ---- buildComparison --------------------------------------------------------

type VenueBaseRow = {
  id: string;
  name: string | null;
  city: string | null;
  region: string | null;
  venue_type: string | null;
  capacity: number | null;
  review_score: string | null;
};

type TwinSubsetRow = {
  capacity: number | null;
  indoor_capacity: number | null;
  outdoor_capacity: number | null;
  parking_capacity: number | null;
  security_requirements: unknown;
  insurance_requirements: unknown;
  install_windows: unknown;
  removal_windows: unknown;
};

/**
 * Build the side-by-side comparison for a set of venue ids. For each venue the
 * actor may read, reads the venue, its venue_twin (the columns the comparison
 * needs), its venue_compare_attrs, and counts its venue_restrictions, then
 * returns a normalized ComparisonRow including the Estimated Total Cost.
 *
 * Venues the actor cannot read are silently skipped; unknown venue ids are
 * skipped too. Order of the returned rows follows the input order (de-duped).
 */
export async function buildComparison(
  actor: Actor,
  venueIds: string[],
  inputs?: EstimateInputs | null,
): Promise<ComparisonRow[]> {
  const seen = new Set<string>();
  const rows: ComparisonRow[] = [];

  for (const venueId of venueIds) {
    if (!venueId || seen.has(venueId)) continue;
    seen.add(venueId);

    // Skip foreign / unknown venues rather than failing the whole comparison.
    let allowed = false;
    try {
      allowed = await canReadVenue(actor, venueId);
    } catch {
      continue; // not found
    }
    if (!allowed) continue;

    const venue = await q1<VenueBaseRow>(
      `select id, name, city, region, venue_type, capacity, review_score
         from venues where id = $1`,
      [venueId],
    );
    if (!venue) continue;

    const twin = await q1<TwinSubsetRow>(
      `select capacity, indoor_capacity, outdoor_capacity, parking_capacity,
              security_requirements, insurance_requirements, install_windows, removal_windows
         from venue_twin where venue_id = $1`,
      [venueId],
    );

    const attrs = await q1<VenueCompareAttrsRow>(
      `select * from venue_compare_attrs where venue_id = $1`,
      [venueId],
    );

    const restr = await q1<{ count: string }>(
      `select count(*) as count from venue_restrictions where venue_id = $1`,
      [venueId],
    );
    const restrictionsCount = Number(restr?.count ?? 0);

    const venueIn: CompareVenue = {
      id: venue.id,
      name: venue.name,
      city: venue.city,
      region: venue.region,
      venue_type: venue.venue_type,
      capacity: venue.capacity,
      review_score: venue.review_score,
    };
    const twinIn: CompareTwin | null = twin
      ? {
          capacity: twin.capacity,
          indoor_capacity: twin.indoor_capacity,
          outdoor_capacity: twin.outdoor_capacity,
          parking_capacity: twin.parking_capacity,
          security_requirements: twin.security_requirements,
          insurance_requirements: twin.insurance_requirements,
          install_windows: twin.install_windows,
          removal_windows: twin.removal_windows,
        }
      : null;
    const attrsIn: CompareAttrs | null = attrs
      ? {
          rental_cost: attrs.rental_cost,
          av_included: attrs.av_included,
          tables_included: attrs.tables_included,
          furniture_included: attrs.furniture_included,
          fnb_minimum: attrs.fnb_minimum,
          security_required: attrs.security_required,
          insurance_required: attrs.insurance_required,
          setup_window: attrs.setup_window,
          teardown_window: attrs.teardown_window,
          extras: attrs.extras,
        }
      : null;

    rows.push(buildComparisonRow(venueIn, twinIn, attrsIn, restrictionsCount, inputs));
  }

  return rows;
}
