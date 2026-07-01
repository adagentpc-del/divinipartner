/**
 * Venue Intelligence - quote prefill engine (Phase 3).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md "Engines": quoteAutomation, given a venue, a
 * branding opportunity, and (optionally) a vendor's service category, reads the
 * stored venue intelligence ONCE and returns a structured prefill object so a
 * draft quote can be assembled in seconds instead of days. It pulls:
 *   - measurements (width / height / depth / sqft / weight limit)
 *   - restrictions (allowed / prohibited, via lib/restrictions.ts)
 *   - install rules + removal rules
 *   - power / internet / rigging availability
 *   - permit / engineering / fire-marshal flags
 *   - access (loading dock, freight elevator, install + removal windows)
 *
 * This module is read-only and unscoped: the route layer
 * (server/src/routes/quote-drafts.ts) owns authorization and only calls these
 * once a venue/opportunity is already authorized. Everything is derived from
 * stored columns. No fabrication, no AI: absent data is reported as absent.
 */
import { q1 } from "../pool.js";
import { getStructuredRestrictions, type StructuredRestrictions } from "./restrictions.js";

/** The branding-opportunity columns the prefill reads. */
interface OpportunityRow {
  id: string;
  venue_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  width: string | number | null;
  height: string | number | null;
  depth: string | number | null;
  sqft: string | number | null;
  weight_limit: string | number | null;
  material_type: string | null;
  surface_type: string | null;
  mounting_options: unknown;
  power_available: boolean | null;
  internet_available: boolean | null;
  rigging_available: boolean | null;
  permit_required: boolean | null;
  engineering_required: boolean | null;
  fire_marshal_required: boolean | null;
  insurance_required: boolean | null;
  allowed_install_types: unknown;
  prohibited_install_types: unknown;
  time_restrictions: unknown;
  noise_restrictions: unknown;
  removal_requirements: unknown;
  approval_mode: string | null;
}

/** The venue_twin columns the prefill reads (access + windows). */
interface TwinRow {
  loading_dock: unknown;
  freight_elevator: unknown;
  power: unknown;
  internet: unknown;
  security_requirements: unknown;
  insurance_requirements: unknown;
  union_requirements: unknown;
  install_windows: unknown;
  removal_windows: unknown;
}

/** Numeric measurements derived from the opportunity. nulls preserved. */
export interface PrefillMeasurements {
  width: number | null;
  height: number | null;
  depth: number | null;
  sqft: number | null;
  weight_limit: number | null;
  material_type: string | null;
  surface_type: string | null;
  mounting_options: unknown;
}

/** Compliance flags pulled from the opportunity. */
export interface PrefillCompliance {
  permit_required: boolean;
  engineering_required: boolean;
  fire_marshal_required: boolean;
  insurance_required: boolean;
}

/** Power / connectivity / rigging availability. */
export interface PrefillPower {
  power_available: boolean;
  internet_available: boolean;
  rigging_available: boolean;
  power_detail: unknown;
  internet_detail: unknown;
}

/** Install rules sourced from the opportunity. */
export interface PrefillInstall {
  allowed_install_types: unknown;
  prohibited_install_types: unknown;
  time_restrictions: unknown;
  noise_restrictions: unknown;
}

/** Removal rules sourced from the opportunity + twin. */
export interface PrefillRemoval {
  removal_requirements: unknown;
}

/** Site access detail sourced from the twin. */
export interface PrefillAccess {
  loading_dock: unknown;
  freight_elevator: unknown;
  install_windows: unknown;
  removal_windows: unknown;
}

/** The full structured prefill returned to draftQuote and the surface. */
export interface QuotePrefill {
  generated_at: string;
  source: "venue-intelligence";
  venue_id: string;
  branding_opportunity_id: string;
  service_category: string | null;
  opportunity: {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    approval_mode: string | null;
  };
  measurements: PrefillMeasurements;
  restrictions: StructuredRestrictions;
  install: PrefillInstall;
  removal: PrefillRemoval;
  power: PrefillPower;
  compliance: PrefillCompliance;
  access: PrefillAccess;
  requirements: {
    security_requirements: unknown;
    insurance_requirements: unknown;
    union_requirements: unknown;
  };
  /** Notes about data the twin/opportunity did not record (no fabrication). */
  missing: string[];
}

/** Coerce a numeric-ish column (numeric comes back as string from pg) to number|null. */
function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** True when a jsonb-ish value carries real content. */
function hasContent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return true;
  return false;
}

export interface BuildPrefillInput {
  venueId: string;
  brandingOpportunityId: string;
  serviceCategory?: string | null;
}

/**
 * Build the structured prefill for a (venue, branding opportunity[, service])
 * triple. Returns null when the opportunity does not exist or does not belong to
 * the given venue (the route turns that into a 404). Read-only.
 */
export async function buildQuotePrefill(input: BuildPrefillInput): Promise<QuotePrefill | null> {
  const opp = await q1<OpportunityRow>(
    `select id, venue_id, name, category, description, width, height, depth, sqft,
            weight_limit, material_type, surface_type, mounting_options,
            power_available, internet_available, rigging_available,
            permit_required, engineering_required, fire_marshal_required,
            insurance_required, allowed_install_types, prohibited_install_types,
            time_restrictions, noise_restrictions, removal_requirements, approval_mode
       from branding_opportunities
      where id = $1`,
    [input.brandingOpportunityId],
  );
  if (!opp) return null;
  if (opp.venue_id && opp.venue_id !== input.venueId) return null;

  const twin = await q1<TwinRow>(
    `select loading_dock, freight_elevator, power, internet, security_requirements,
            insurance_requirements, union_requirements, install_windows, removal_windows
       from venue_twin where venue_id = $1`,
    [input.venueId],
  );

  const restrictions = await getStructuredRestrictions(input.venueId, input.brandingOpportunityId);

  const measurements: PrefillMeasurements = {
    width: num(opp.width),
    height: num(opp.height),
    depth: num(opp.depth),
    sqft: num(opp.sqft),
    weight_limit: num(opp.weight_limit),
    material_type: opp.material_type,
    surface_type: opp.surface_type,
    mounting_options: opp.mounting_options ?? null,
  };

  const compliance: PrefillCompliance = {
    permit_required: !!opp.permit_required,
    engineering_required: !!opp.engineering_required,
    fire_marshal_required: !!opp.fire_marshal_required,
    insurance_required: !!opp.insurance_required,
  };

  const power: PrefillPower = {
    power_available: !!opp.power_available,
    internet_available: !!opp.internet_available,
    rigging_available: !!opp.rigging_available,
    power_detail: twin?.power ?? null,
    internet_detail: twin?.internet ?? null,
  };

  const install: PrefillInstall = {
    allowed_install_types: opp.allowed_install_types ?? null,
    prohibited_install_types: opp.prohibited_install_types ?? null,
    time_restrictions: opp.time_restrictions ?? null,
    noise_restrictions: opp.noise_restrictions ?? null,
  };

  const removal: PrefillRemoval = {
    removal_requirements: opp.removal_requirements ?? null,
  };

  const access: PrefillAccess = {
    loading_dock: twin?.loading_dock ?? null,
    freight_elevator: twin?.freight_elevator ?? null,
    install_windows: twin?.install_windows ?? null,
    removal_windows: twin?.removal_windows ?? null,
  };

  // Report what was not recorded so the vendor knows what to confirm (no fabrication).
  const missing: string[] = [];
  if (measurements.width == null && measurements.height == null && measurements.sqft == null) {
    missing.push("measurements");
  }
  if (restrictions.allowed.length === 0 && restrictions.prohibited.length === 0) {
    missing.push("restrictions");
  }
  if (!twin) missing.push("venue_twin");
  if (!hasContent(access.loading_dock) && !hasContent(access.freight_elevator)) {
    missing.push("loading_access");
  }
  if (!hasContent(access.install_windows)) missing.push("install_windows");
  if (!hasContent(access.removal_windows)) missing.push("removal_windows");

  return {
    generated_at: new Date().toISOString(),
    source: "venue-intelligence",
    venue_id: input.venueId,
    branding_opportunity_id: input.brandingOpportunityId,
    service_category: input.serviceCategory ?? null,
    opportunity: {
      id: opp.id,
      name: opp.name,
      category: opp.category,
      description: opp.description,
      approval_mode: opp.approval_mode,
    },
    measurements,
    restrictions,
    install,
    removal,
    power,
    compliance,
    access,
    requirements: {
      security_requirements: twin?.security_requirements ?? null,
      insurance_requirements: twin?.insurance_requirements ?? null,
      union_requirements: twin?.union_requirements ?? null,
    },
    missing,
  };
}
