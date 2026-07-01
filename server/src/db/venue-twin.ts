/**
 * Venue Intelligence - venue-twin data-access layer (Phase 1 foundation).
 *
 * Org-scoped, IDOR-safe CRUD over the Venue Intelligence tables created in
 * db/schema-venue-intelligence.sql:
 *   - venue_twin            (get / upsert, one row per venue)
 *   - venue_assets          (list / add / delete)
 *   - branding_opportunities (list / get / create / update / delete)
 *   - venue_restrictions    (list / add / delete)
 *
 * Authorization mirrors server/src/db/events.ts: a venue twin and everything
 * hanging off it belong to the organization that owns the underlying `venues`
 * row (venues.organization_id). An actor may read/write when their org owns the
 * venue, or they are an admin / super_admin. Every venue id is validated against
 * the actor's org before any write so a forged id from another tenant is
 * rejected (ForbiddenError) rather than silently acted on.
 *
 * On every write that can change completeness, the venue_twin.readiness_score is
 * recomputed via computeQuoteReadinessScore (server/src/lib/venueTwin.ts) and
 * persisted, so the stored score always reflects current data.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  computeQuoteReadinessScore,
  readinessBreakdown,
  type ReadinessTwin,
  type ReadinessCounts,
  type ReadinessDimension,
} from "../lib/venueTwin.js";

// ---- Row types --------------------------------------------------------------

export type VenueTwinRow = {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string | null;
  type: string | null;
  address: string | null;
  website: string | null;
  capacity: number | null;
  indoor_capacity: number | null;
  outdoor_capacity: number | null;
  parking_capacity: number | null;
  loading_dock: unknown;
  freight_elevator: unknown;
  power: unknown;
  internet: unknown;
  security_requirements: unknown;
  insurance_requirements: unknown;
  union_requirements: unknown;
  install_windows: unknown;
  removal_windows: unknown;
  contacts: unknown;
  emergency_contacts: unknown;
  readiness_score: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueAssetKind =
  | "photo"
  | "video"
  | "pdf"
  | "floorplan"
  | "cad"
  | "sitemap"
  | "install_guide"
  | "rulebook"
  | "insurance"
  | "branding_guideline";

const ASSET_KINDS = new Set<string>([
  "photo",
  "video",
  "pdf",
  "floorplan",
  "cad",
  "sitemap",
  "install_guide",
  "rulebook",
  "insurance",
  "branding_guideline",
]);
export function isAssetKind(v: unknown): v is VenueAssetKind {
  return typeof v === "string" && ASSET_KINDS.has(v);
}

/** Kinds that count as compliance documents for the readiness score. */
const COMPLIANCE_KINDS = ["insurance", "rulebook", "install_guide"];
/** Kinds that count as photos for the readiness score. */
const PHOTO_KINDS = ["photo"];
/** Kinds that count as floorplans for the readiness score. */
const FLOORPLAN_KINDS = ["floorplan", "cad", "sitemap"];

export type VenueAssetRow = {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  kind: VenueAssetKind | null;
  url: string | null;
  label: string | null;
  meta: unknown;
  created_by: string | null;
  created_at: string;
};

export type BrandingOpportunityRow = {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  photos: unknown;
  videos: unknown;
  width: string | null;
  height: string | null;
  depth: string | null;
  sqft: string | null;
  weight_limit: string | null;
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
  pricing: unknown;
  availability: unknown;
  audience_size: number | null;
  impression_estimate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueRestrictionRow = {
  id: string;
  venue_id: string | null;
  branding_opportunity_id: string | null;
  organization_id: string | null;
  rule_type: "allowed" | "prohibited" | null;
  category: string | null;
  value: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the organization that owns a venue, or throw NotFound. Used as the
 * IDOR gate: callers compare the result against the actor's org.
 */
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

// ---- Readiness recompute ----------------------------------------------------

/** Count the related rows the readiness score needs for a venue. */
async function readinessCounts(venueId: string): Promise<ReadinessCounts> {
  const row = await q1<{
    photos: string;
    floorplans: string;
    compliance: string;
    restrictions: string;
    branding: string;
  }>(
    `select
        (select count(*) from venue_assets a
           where a.venue_id = $1 and a.kind = any($2::text[])) as photos,
        (select count(*) from venue_assets a
           where a.venue_id = $1 and a.kind = any($3::text[])) as floorplans,
        (select count(*) from venue_assets a
           where a.venue_id = $1 and a.kind = any($4::text[])) as compliance,
        (select count(*) from venue_restrictions r
           where r.venue_id = $1) as restrictions,
        (select count(*) from branding_opportunities b
           where b.venue_id = $1) as branding`,
    [venueId, PHOTO_KINDS, FLOORPLAN_KINDS, COMPLIANCE_KINDS],
  );
  return {
    photos: Number(row?.photos ?? 0),
    floorplans: Number(row?.floorplans ?? 0),
    complianceDocs: Number(row?.compliance ?? 0),
    restrictions: Number(row?.restrictions ?? 0),
    brandingOpportunities: Number(row?.branding ?? 0),
  };
}

/**
 * Recompute and persist venue_twin.readiness_score for a venue from current
 * data. No-op (returns 0) when no twin row exists yet. Best-effort caller-side:
 * callers run this after any write that can change completeness.
 */
export async function recomputeReadiness(venueId: string): Promise<number> {
  const twin = await q1<VenueTwinRow>(`select * from venue_twin where venue_id = $1`, [venueId]);
  if (!twin) return 0;
  const counts = await readinessCounts(venueId);
  const twinInput: ReadinessTwin = {
    capacity: twin.capacity,
    indoor_capacity: twin.indoor_capacity,
    outdoor_capacity: twin.outdoor_capacity,
    parking_capacity: twin.parking_capacity,
    loading_dock: twin.loading_dock,
    freight_elevator: twin.freight_elevator,
    power: twin.power,
    internet: twin.internet,
  };
  const score = computeQuoteReadinessScore(twinInput, counts);
  await pool.query(
    `update venue_twin set readiness_score = $2, updated_at = now() where venue_id = $1`,
    [venueId, score],
  );
  return score;
}

/** The current readiness score + per-dimension breakdown for a venue (read-only). */
export async function getReadiness(
  actor: Actor,
  venueId: string,
): Promise<{ score: number; breakdown: ReadinessDimension[] }> {
  await assertVenueAccess(actor, venueId);
  const twin = await q1<VenueTwinRow>(`select * from venue_twin where venue_id = $1`, [venueId]);
  const counts = await readinessCounts(venueId);
  const twinInput: ReadinessTwin = {
    capacity: twin?.capacity ?? null,
    indoor_capacity: twin?.indoor_capacity ?? null,
    outdoor_capacity: twin?.outdoor_capacity ?? null,
    parking_capacity: twin?.parking_capacity ?? null,
    loading_dock: twin?.loading_dock ?? null,
    freight_elevator: twin?.freight_elevator ?? null,
    power: twin?.power ?? null,
    internet: twin?.internet ?? null,
  };
  return {
    score: computeQuoteReadinessScore(twinInput, counts),
    breakdown: readinessBreakdown(twinInput, counts),
  };
}

// ---- venue_twin: get / upsert ----------------------------------------------

/** Get the venue twin for a venue (or null if not started), org-scoped. */
export async function getVenueTwin(actor: Actor, venueId: string): Promise<VenueTwinRow | null> {
  await assertVenueAccess(actor, venueId);
  return q1<VenueTwinRow>(`select * from venue_twin where venue_id = $1`, [venueId]);
}

export type VenueTwinInput = {
  name?: string | null;
  type?: string | null;
  address?: string | null;
  website?: string | null;
  capacity?: number | null;
  indoor_capacity?: number | null;
  outdoor_capacity?: number | null;
  parking_capacity?: number | null;
  loading_dock?: unknown;
  freight_elevator?: unknown;
  power?: unknown;
  internet?: unknown;
  security_requirements?: unknown;
  insurance_requirements?: unknown;
  union_requirements?: unknown;
  install_windows?: unknown;
  removal_windows?: unknown;
  contacts?: unknown;
  emergency_contacts?: unknown;
};

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

/**
 * Create or update the venue twin (one row per venue). Idempotent on venue_id.
 * Recomputes and stores readiness_score afterwards.
 */
export async function upsertVenueTwin(
  actor: Actor,
  venueId: string,
  input: VenueTwinInput,
): Promise<VenueTwinRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  await q1<VenueTwinRow>(
    `insert into venue_twin
       (venue_id, organization_id, name, type, address, website, capacity,
        indoor_capacity, outdoor_capacity, parking_capacity, loading_dock,
        freight_elevator, power, internet, security_requirements,
        insurance_requirements, union_requirements, install_windows,
        removal_windows, contacts, emergency_contacts, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     on conflict (venue_id) do update set
        name = coalesce(excluded.name, venue_twin.name),
        type = coalesce(excluded.type, venue_twin.type),
        address = coalesce(excluded.address, venue_twin.address),
        website = coalesce(excluded.website, venue_twin.website),
        capacity = coalesce(excluded.capacity, venue_twin.capacity),
        indoor_capacity = coalesce(excluded.indoor_capacity, venue_twin.indoor_capacity),
        outdoor_capacity = coalesce(excluded.outdoor_capacity, venue_twin.outdoor_capacity),
        parking_capacity = coalesce(excluded.parking_capacity, venue_twin.parking_capacity),
        loading_dock = coalesce(excluded.loading_dock, venue_twin.loading_dock),
        freight_elevator = coalesce(excluded.freight_elevator, venue_twin.freight_elevator),
        power = coalesce(excluded.power, venue_twin.power),
        internet = coalesce(excluded.internet, venue_twin.internet),
        security_requirements = coalesce(excluded.security_requirements, venue_twin.security_requirements),
        insurance_requirements = coalesce(excluded.insurance_requirements, venue_twin.insurance_requirements),
        union_requirements = coalesce(excluded.union_requirements, venue_twin.union_requirements),
        install_windows = coalesce(excluded.install_windows, venue_twin.install_windows),
        removal_windows = coalesce(excluded.removal_windows, venue_twin.removal_windows),
        contacts = coalesce(excluded.contacts, venue_twin.contacts),
        emergency_contacts = coalesce(excluded.emergency_contacts, venue_twin.emergency_contacts),
        updated_at = now()
     returning *`,
    [
      venueId,
      orgId,
      input.name ?? null,
      input.type ?? null,
      input.address ?? null,
      input.website ?? null,
      input.capacity ?? null,
      input.indoor_capacity ?? null,
      input.outdoor_capacity ?? null,
      input.parking_capacity ?? null,
      jsonbParam(input.loading_dock) ?? null,
      jsonbParam(input.freight_elevator) ?? null,
      jsonbParam(input.power) ?? null,
      jsonbParam(input.internet) ?? null,
      jsonbParam(input.security_requirements) ?? null,
      jsonbParam(input.insurance_requirements) ?? null,
      jsonbParam(input.union_requirements) ?? null,
      jsonbParam(input.install_windows) ?? null,
      jsonbParam(input.removal_windows) ?? null,
      jsonbParam(input.contacts) ?? null,
      jsonbParam(input.emergency_contacts) ?? null,
      actor.user.id,
    ],
  );
  await recomputeReadiness(venueId);
  const row = await q1<VenueTwinRow>(`select * from venue_twin where venue_id = $1`, [venueId]);
  return row as VenueTwinRow;
}

// ---- venue_assets: list / add / delete -------------------------------------

/** List assets for a venue (org-scoped), newest first. Optional kind filter. */
export async function listVenueAssets(
  actor: Actor,
  venueId: string,
  kind?: VenueAssetKind | null,
): Promise<VenueAssetRow[]> {
  await assertVenueAccess(actor, venueId);
  if (kind) {
    return q<VenueAssetRow>(
      `select * from venue_assets where venue_id = $1 and kind = $2 order by created_at desc`,
      [venueId, kind],
    );
  }
  return q<VenueAssetRow>(
    `select * from venue_assets where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

export type AddAssetInput = {
  kind: VenueAssetKind;
  url?: string | null;
  label?: string | null;
  meta?: unknown;
};

/** Add an asset to a venue (org-scoped). Recomputes readiness afterwards. */
export async function addVenueAsset(
  actor: Actor,
  venueId: string,
  input: AddAssetInput,
): Promise<VenueAssetRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  if (!isAssetKind(input.kind)) throw new ForbiddenError("invalid asset kind");
  const row = await q1<VenueAssetRow>(
    `insert into venue_assets (venue_id, organization_id, kind, url, label, meta, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      venueId,
      orgId,
      input.kind,
      input.url ?? null,
      input.label ?? null,
      jsonbParam(input.meta) ?? null,
      actor.user.id,
    ],
  );
  await recomputeReadiness(venueId);
  return row as VenueAssetRow;
}

/** Delete an asset (org-scoped to the venue). Recomputes readiness afterwards. */
export async function deleteVenueAsset(
  actor: Actor,
  venueId: string,
  assetId: string,
): Promise<void> {
  await assertVenueAccess(actor, venueId);
  await pool.query(`delete from venue_assets where id = $1 and venue_id = $2`, [assetId, venueId]);
  await recomputeReadiness(venueId);
}

// ---- branding_opportunities: list / get / create / update / delete ---------

/** List branding opportunities for a venue (org-scoped), newest first. */
export async function listBrandingOpportunities(
  actor: Actor,
  venueId: string,
): Promise<BrandingOpportunityRow[]> {
  await assertVenueAccess(actor, venueId);
  return q<BrandingOpportunityRow>(
    `select * from branding_opportunities where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

/**
 * Public, unauthenticated read of a venue's brandable surfaces by its published
 * profile slug. A profile slug maps to an organization (profiles.slug), and a
 * venue belongs to an organization (venues.organization_id), so we resolve
 * slug -> organization -> branding opportunities. Returns only published
 * profiles' opportunities and only public-safe fields (no internal pricing rules
 * or approval internals beyond what a public visitor needs to see). Empty array
 * when the slug is unknown / unpublished, or the org has no opportunities.
 */
export type PublicBrandingOpportunity = {
  id: string;
  venue_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  photos: unknown;
  surface_type: string | null;
  audience_size: number | null;
  impression_estimate: number | null;
};

export async function listPublicBrandingOpportunitiesBySlug(
  slug: string,
): Promise<PublicBrandingOpportunity[]> {
  return q<PublicBrandingOpportunity>(
    `select b.id, b.venue_id, b.name, b.category, b.description, b.photos,
            b.surface_type, b.audience_size, b.impression_estimate
       from branding_opportunities b
       join venues v on v.id = b.venue_id
       join profiles p on p.organization_id = v.organization_id
      where p.slug = $1 and p.published_status = 'published'
      order by b.created_at desc`,
    [slug],
  );
}

/** Get one branding opportunity (org-scoped via its venue). */
export async function getBrandingOpportunity(
  actor: Actor,
  id: string,
): Promise<BrandingOpportunityRow> {
  const row = await q1<BrandingOpportunityRow>(
    `select * from branding_opportunities where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("branding opportunity not found");
  if (row.venue_id) await assertVenueAccess(actor, row.venue_id);
  else if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this branding opportunity");
  }
  return row;
}

export type BrandingOpportunityInput = {
  name?: string | null;
  category?: string | null;
  description?: string | null;
  photos?: unknown;
  videos?: unknown;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  sqft?: number | null;
  weight_limit?: number | null;
  material_type?: string | null;
  surface_type?: string | null;
  mounting_options?: unknown;
  power_available?: boolean | null;
  internet_available?: boolean | null;
  rigging_available?: boolean | null;
  permit_required?: boolean | null;
  engineering_required?: boolean | null;
  fire_marshal_required?: boolean | null;
  insurance_required?: boolean | null;
  allowed_install_types?: unknown;
  prohibited_install_types?: unknown;
  time_restrictions?: unknown;
  noise_restrictions?: unknown;
  removal_requirements?: unknown;
  approval_mode?: string | null;
  pricing?: unknown;
  availability?: unknown;
  audience_size?: number | null;
  impression_estimate?: number | null;
};

const APPROVAL_MODES = new Set<string>(["auto", "venue_approval", "manual_review"]);

/** Create a branding opportunity for a venue (org-scoped). Recomputes readiness. */
export async function createBrandingOpportunity(
  actor: Actor,
  venueId: string,
  input: BrandingOpportunityInput,
): Promise<BrandingOpportunityRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name required");
  }
  if (input.approval_mode != null && !APPROVAL_MODES.has(input.approval_mode)) {
    throw new ForbiddenError("invalid approval_mode");
  }
  const row = await q1<BrandingOpportunityRow>(
    `insert into branding_opportunities
       (venue_id, organization_id, name, category, description, photos, videos,
        width, height, depth, sqft, weight_limit, material_type, surface_type,
        mounting_options, power_available, internet_available, rigging_available,
        permit_required, engineering_required, fire_marshal_required, insurance_required,
        allowed_install_types, prohibited_install_types, time_restrictions,
        noise_restrictions, removal_requirements, approval_mode, pricing, availability,
        audience_size, impression_estimate, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
             $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
     returning *`,
    [
      venueId,
      orgId,
      input.name,
      input.category ?? null,
      input.description ?? null,
      jsonbParam(input.photos) ?? null,
      jsonbParam(input.videos) ?? null,
      input.width ?? null,
      input.height ?? null,
      input.depth ?? null,
      input.sqft ?? null,
      input.weight_limit ?? null,
      input.material_type ?? null,
      input.surface_type ?? null,
      jsonbParam(input.mounting_options) ?? null,
      input.power_available ?? null,
      input.internet_available ?? null,
      input.rigging_available ?? null,
      input.permit_required ?? null,
      input.engineering_required ?? null,
      input.fire_marshal_required ?? null,
      input.insurance_required ?? null,
      jsonbParam(input.allowed_install_types) ?? null,
      jsonbParam(input.prohibited_install_types) ?? null,
      jsonbParam(input.time_restrictions) ?? null,
      jsonbParam(input.noise_restrictions) ?? null,
      jsonbParam(input.removal_requirements) ?? null,
      input.approval_mode ?? null,
      jsonbParam(input.pricing) ?? null,
      jsonbParam(input.availability) ?? null,
      input.audience_size ?? null,
      input.impression_estimate ?? null,
      actor.user.id,
    ],
  );
  await recomputeReadiness(venueId);
  return row as BrandingOpportunityRow;
}

/** Patch a branding opportunity (org-scoped via its venue). Recomputes readiness. */
export async function updateBrandingOpportunity(
  actor: Actor,
  id: string,
  patch: BrandingOpportunityInput,
): Promise<BrandingOpportunityRow> {
  const existing = await getBrandingOpportunity(actor, id);
  if (patch.approval_mode != null && !APPROVAL_MODES.has(patch.approval_mode)) {
    throw new ForbiddenError("invalid approval_mode");
  }
  const row = await q1<BrandingOpportunityRow>(
    `update branding_opportunities set
        name = coalesce($2, name),
        category = coalesce($3, category),
        description = coalesce($4, description),
        photos = coalesce($5, photos),
        videos = coalesce($6, videos),
        width = coalesce($7, width),
        height = coalesce($8, height),
        depth = coalesce($9, depth),
        sqft = coalesce($10, sqft),
        weight_limit = coalesce($11, weight_limit),
        material_type = coalesce($12, material_type),
        surface_type = coalesce($13, surface_type),
        mounting_options = coalesce($14, mounting_options),
        power_available = coalesce($15, power_available),
        internet_available = coalesce($16, internet_available),
        rigging_available = coalesce($17, rigging_available),
        permit_required = coalesce($18, permit_required),
        engineering_required = coalesce($19, engineering_required),
        fire_marshal_required = coalesce($20, fire_marshal_required),
        insurance_required = coalesce($21, insurance_required),
        allowed_install_types = coalesce($22, allowed_install_types),
        prohibited_install_types = coalesce($23, prohibited_install_types),
        time_restrictions = coalesce($24, time_restrictions),
        noise_restrictions = coalesce($25, noise_restrictions),
        removal_requirements = coalesce($26, removal_requirements),
        approval_mode = coalesce($27, approval_mode),
        pricing = coalesce($28, pricing),
        availability = coalesce($29, availability),
        audience_size = coalesce($30, audience_size),
        impression_estimate = coalesce($31, impression_estimate),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.category ?? null,
      patch.description ?? null,
      jsonbParam(patch.photos) ?? null,
      jsonbParam(patch.videos) ?? null,
      patch.width ?? null,
      patch.height ?? null,
      patch.depth ?? null,
      patch.sqft ?? null,
      patch.weight_limit ?? null,
      patch.material_type ?? null,
      patch.surface_type ?? null,
      jsonbParam(patch.mounting_options) ?? null,
      patch.power_available ?? null,
      patch.internet_available ?? null,
      patch.rigging_available ?? null,
      patch.permit_required ?? null,
      patch.engineering_required ?? null,
      patch.fire_marshal_required ?? null,
      patch.insurance_required ?? null,
      jsonbParam(patch.allowed_install_types) ?? null,
      jsonbParam(patch.prohibited_install_types) ?? null,
      jsonbParam(patch.time_restrictions) ?? null,
      jsonbParam(patch.noise_restrictions) ?? null,
      jsonbParam(patch.removal_requirements) ?? null,
      patch.approval_mode ?? null,
      jsonbParam(patch.pricing) ?? null,
      jsonbParam(patch.availability) ?? null,
      patch.audience_size ?? null,
      patch.impression_estimate ?? null,
    ],
  );
  if (existing.venue_id) await recomputeReadiness(existing.venue_id);
  return row as BrandingOpportunityRow;
}

/** Delete a branding opportunity (org-scoped via its venue). Recomputes readiness. */
export async function deleteBrandingOpportunity(actor: Actor, id: string): Promise<void> {
  const existing = await getBrandingOpportunity(actor, id);
  await pool.query(`delete from branding_opportunities where id = $1`, [id]);
  if (existing.venue_id) await recomputeReadiness(existing.venue_id);
}

// ---- venue_restrictions: list / add / delete -------------------------------

/**
 * List restrictions for a venue (org-scoped). Optionally narrowed to a branding
 * opportunity (always also including the venue-wide rules).
 */
export async function listVenueRestrictionRows(
  actor: Actor,
  venueId: string,
  brandingOpportunityId?: string | null,
): Promise<VenueRestrictionRow[]> {
  await assertVenueAccess(actor, venueId);
  if (brandingOpportunityId) {
    return q<VenueRestrictionRow>(
      `select * from venue_restrictions
        where venue_id = $1
          and (branding_opportunity_id = $2 or branding_opportunity_id is null)
        order by created_at desc`,
      [venueId, brandingOpportunityId],
    );
  }
  return q<VenueRestrictionRow>(
    `select * from venue_restrictions where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

export type AddRestrictionInput = {
  rule_type: "allowed" | "prohibited";
  category?: string | null;
  value?: string | null;
  notes?: string | null;
  branding_opportunity_id?: string | null;
};

const RULE_TYPES = new Set<string>(["allowed", "prohibited"]);

/** Add a structured restriction to a venue (org-scoped). Recomputes readiness. */
export async function addVenueRestriction(
  actor: Actor,
  venueId: string,
  input: AddRestrictionInput,
): Promise<VenueRestrictionRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  if (!RULE_TYPES.has(input.rule_type)) throw new ForbiddenError("invalid rule_type");
  // If scoped to a branding opportunity, confirm it belongs to this venue.
  if (input.branding_opportunity_id) {
    const opp = await q1<{ venue_id: string | null }>(
      `select venue_id from branding_opportunities where id = $1`,
      [input.branding_opportunity_id],
    );
    if (!opp) throw new NotFoundError("branding opportunity not found");
    if (opp.venue_id !== venueId) {
      throw new ForbiddenError("branding opportunity does not belong to this venue");
    }
  }
  const row = await q1<VenueRestrictionRow>(
    `insert into venue_restrictions
       (venue_id, branding_opportunity_id, organization_id, rule_type, category, value, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      venueId,
      input.branding_opportunity_id ?? null,
      orgId,
      input.rule_type,
      input.category ?? null,
      input.value ?? null,
      input.notes ?? null,
      actor.user.id,
    ],
  );
  await recomputeReadiness(venueId);
  return row as VenueRestrictionRow;
}

/** Delete a restriction (org-scoped to the venue). Recomputes readiness. */
export async function deleteVenueRestriction(
  actor: Actor,
  venueId: string,
  restrictionId: string,
): Promise<void> {
  await assertVenueAccess(actor, venueId);
  await pool.query(`delete from venue_restrictions where id = $1 and venue_id = $2`, [
    restrictionId,
    venueId,
  ]);
  await recomputeReadiness(venueId);
}
