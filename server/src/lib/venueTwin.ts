/**
 * Venue Intelligence - Quote Readiness Score (Phase 1 foundation).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md positions the Quote Readiness Score (0-100) as
 * the completeness meter for a venue twin: the more intelligence a venue stores
 * once, the faster every future quote is. This module is the single source of
 * truth for that score.
 *
 * `computeQuoteReadinessScore` is PURE: it does no DB work, takes the twin row
 * plus a small bag of counts, and returns an integer 0-100. The venue-twin repo
 * (server/src/db/venue-twin.ts) supplies the counts and persists the result on
 * every write, so the stored readiness_score always reflects current data and
 * the function stays unit-testable in isolation.
 *
 * Scoring (six weighted dimensions, summing to 100):
 *   - photos uploaded ............ 15
 *   - measurements present ....... 20  (capacity + at least one physical/access
 *                                       detail recorded on the twin)
 *   - floorplans uploaded ........ 20
 *   - restrictions completed ..... 15  (at least one structured restriction)
 *   - compliance docs uploaded ... 15  (insurance / rulebook / install guide)
 *   - branding opportunities ..... 15  (at least one branding opportunity)
 *
 * Each dimension is all-or-nothing in Phase 1 (present vs absent). The weights
 * are exported so the surface can render a per-dimension "missing info" nudge.
 */

/** The subset of venue_twin columns the score reads. All optional/nullable. */
export interface ReadinessTwin {
  capacity?: number | null;
  indoor_capacity?: number | null;
  outdoor_capacity?: number | null;
  parking_capacity?: number | null;
  loading_dock?: unknown;
  freight_elevator?: unknown;
  power?: unknown;
  internet?: unknown;
}

/** Counts of related rows the score reads (supplied by the repo, not the twin). */
export interface ReadinessCounts {
  photos?: number;
  floorplans?: number;
  complianceDocs?: number;
  restrictions?: number;
  brandingOpportunities?: number;
}

/** A readiness dimension: its weight and whether the data is present. */
export interface ReadinessDimension {
  key: string;
  label: string;
  weight: number;
  present: boolean;
  earned: number;
}

/** The exported weights (sum to 100), in display order. */
export const READINESS_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "photos", label: "Photos uploaded", weight: 15 },
  { key: "measurements", label: "Measurements present", weight: 20 },
  { key: "floorplans", label: "Floorplans uploaded", weight: 20 },
  { key: "restrictions", label: "Restrictions completed", weight: 15 },
  { key: "compliance", label: "Compliance docs uploaded", weight: 15 },
  { key: "branding", label: "Branding opportunities completed", weight: 15 },
];

/** True when a jsonb-ish value carries real content (non-empty object/array). */
function hasContent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return true;
  return false;
}

/** True when the twin records at least a capacity plus one physical/access detail. */
function hasMeasurements(twin: ReadinessTwin): boolean {
  const hasCapacity =
    (twin.capacity ?? 0) > 0 ||
    (twin.indoor_capacity ?? 0) > 0 ||
    (twin.outdoor_capacity ?? 0) > 0 ||
    (twin.parking_capacity ?? 0) > 0;
  const hasAccess =
    hasContent(twin.loading_dock) ||
    hasContent(twin.freight_elevator) ||
    hasContent(twin.power) ||
    hasContent(twin.internet);
  return hasCapacity && hasAccess;
}

/**
 * Compute the per-dimension breakdown. Pure. Useful for the surface's
 * "missing info" nudges; computeQuoteReadinessScore sums the earned weights.
 */
export function readinessBreakdown(
  twin: ReadinessTwin,
  counts: ReadinessCounts,
): ReadinessDimension[] {
  const present: Record<string, boolean> = {
    photos: (counts.photos ?? 0) > 0,
    measurements: hasMeasurements(twin),
    floorplans: (counts.floorplans ?? 0) > 0,
    restrictions: (counts.restrictions ?? 0) > 0,
    compliance: (counts.complianceDocs ?? 0) > 0,
    branding: (counts.brandingOpportunities ?? 0) > 0,
  };
  return READINESS_WEIGHTS.map((w) => {
    const isPresent = present[w.key] ?? false;
    return {
      key: w.key,
      label: w.label,
      weight: w.weight,
      present: isPresent,
      earned: isPresent ? w.weight : 0,
    };
  });
}

/**
 * Quote Readiness Score, 0-100. Pure: no DB calls. Sums the earned weight of
 * each present dimension and clamps to [0, 100].
 */
export function computeQuoteReadinessScore(
  twin: ReadinessTwin,
  counts: ReadinessCounts,
): number {
  const total = readinessBreakdown(twin, counts).reduce((sum, d) => sum + d.earned, 0);
  const clamped = Math.max(0, Math.min(100, Math.round(total)));
  return clamped;
}
