/**
 * Venue Intelligence - revenue inventory + sponsorship data-access layer
 * (Phase 5: Venue Revenue Inventory + Sponsorship Inventory Marketplace).
 *
 * Org-scoped, IDOR-safe CRUD over the Phase 5 tables created in
 * db/schema-vi-p5.sql:
 *   - revenue_inventory          (list / get / create / update / delete)
 *   - sponsorship_opportunities  (list / get / create / update / delete +
 *                                 a public-ish browse of open opportunities)
 *
 * Authorization mirrors server/src/db/venue-twin.ts: both tables hang off a
 * `venues` row and belong to the organization that owns it
 * (venues.organization_id). An actor may read/write when their org owns the
 * venue, or they are an admin / super_admin. Every venue id is validated
 * against the actor's org before any write, so a forged id from another tenant
 * is rejected (ForbiddenError) rather than silently acted on. The one exception
 * is the marketplace browse of OPEN sponsorship opportunities, which is
 * intentionally cross-org (read only, status = 'open').
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

// ---- Row types --------------------------------------------------------------

export type RevenueInventoryRow = {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string;
  category: string | null;
  pricing: unknown;
  availability: unknown;
  photos: unknown;
  audience_size: number | null;
  impression_estimate: number | null;
  restrictions: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorshipStatus = "open" | "paused" | "closed" | "draft";

export type SponsorshipOpportunityRow = {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string;
  category: string | null;
  audience_size: number | null;
  impression_estimate: number | null;
  pricing: unknown;
  deliverables: unknown;
  availability: unknown;
  photos: unknown;
  performance_history: unknown;
  status: SponsorshipStatus | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SPONSORSHIP_STATUSES = new Set<string>(["open", "paused", "closed", "draft"]);
export function isSponsorshipStatus(v: unknown): v is SponsorshipStatus {
  return typeof v === "string" && SPONSORSHIP_STATUSES.has(v);
}

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

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

// ============================================================================
// revenue_inventory: list / get / create / update / delete
// ============================================================================

/** List revenue inventory for a venue (org-scoped), newest first. */
export async function listRevenueInventory(
  actor: Actor,
  venueId: string,
): Promise<RevenueInventoryRow[]> {
  await assertVenueAccess(actor, venueId);
  return q<RevenueInventoryRow>(
    `select * from revenue_inventory where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

/** Get one revenue inventory item (org-scoped via its venue). */
export async function getRevenueInventory(
  actor: Actor,
  id: string,
): Promise<RevenueInventoryRow> {
  const row = await q1<RevenueInventoryRow>(`select * from revenue_inventory where id = $1`, [id]);
  if (!row) throw new NotFoundError("revenue inventory item not found");
  if (row.venue_id) await assertVenueAccess(actor, row.venue_id);
  else if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this revenue inventory item");
  }
  return row;
}

export type RevenueInventoryInput = {
  name?: string | null;
  category?: string | null;
  pricing?: unknown;
  availability?: unknown;
  photos?: unknown;
  audience_size?: number | null;
  impression_estimate?: number | null;
  restrictions?: unknown;
};

/** Create a revenue inventory item for a venue (org-scoped). */
export async function createRevenueInventory(
  actor: Actor,
  venueId: string,
  input: RevenueInventoryInput,
): Promise<RevenueInventoryRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name required");
  }
  const row = await q1<RevenueInventoryRow>(
    `insert into revenue_inventory
       (venue_id, organization_id, name, category, pricing, availability, photos,
        audience_size, impression_estimate, restrictions, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      venueId,
      orgId,
      input.name,
      input.category ?? null,
      jsonbParam(input.pricing) ?? null,
      jsonbParam(input.availability) ?? null,
      jsonbParam(input.photos) ?? null,
      input.audience_size ?? null,
      input.impression_estimate ?? null,
      jsonbParam(input.restrictions) ?? null,
      actor.user.id,
    ],
  );
  return row as RevenueInventoryRow;
}

/** Patch a revenue inventory item (org-scoped via its venue). */
export async function updateRevenueInventory(
  actor: Actor,
  id: string,
  patch: RevenueInventoryInput,
): Promise<RevenueInventoryRow> {
  await getRevenueInventory(actor, id);
  const row = await q1<RevenueInventoryRow>(
    `update revenue_inventory set
        name = coalesce($2, name),
        category = coalesce($3, category),
        pricing = coalesce($4, pricing),
        availability = coalesce($5, availability),
        photos = coalesce($6, photos),
        audience_size = coalesce($7, audience_size),
        impression_estimate = coalesce($8, impression_estimate),
        restrictions = coalesce($9, restrictions),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.category ?? null,
      jsonbParam(patch.pricing) ?? null,
      jsonbParam(patch.availability) ?? null,
      jsonbParam(patch.photos) ?? null,
      patch.audience_size ?? null,
      patch.impression_estimate ?? null,
      jsonbParam(patch.restrictions) ?? null,
    ],
  );
  return row as RevenueInventoryRow;
}

/** Delete a revenue inventory item (org-scoped via its venue). */
export async function deleteRevenueInventory(actor: Actor, id: string): Promise<void> {
  await getRevenueInventory(actor, id);
  await pool.query(`delete from revenue_inventory where id = $1`, [id]);
}

// ============================================================================
// sponsorship_opportunities: list / get / create / update / delete + browse
// ============================================================================

/** List sponsorship opportunities for a venue (org-scoped), newest first. */
export async function listSponsorshipOpportunities(
  actor: Actor,
  venueId: string,
): Promise<SponsorshipOpportunityRow[]> {
  await assertVenueAccess(actor, venueId);
  return q<SponsorshipOpportunityRow>(
    `select * from sponsorship_opportunities where venue_id = $1 order by created_at desc`,
    [venueId],
  );
}

/**
 * Marketplace browse: the OPEN sponsorship opportunities across all venues, for
 * sponsors shopping the marketplace. Read only and intentionally cross-org
 * (status = 'open' only). Optional category filter and a sane row cap.
 */
export async function browseOpenSponsorships(
  category?: string | null,
  limit = 200,
): Promise<SponsorshipOpportunityRow[]> {
  const cap = Math.max(1, Math.min(500, Number.isFinite(limit) ? limit : 200));
  if (category) {
    return q<SponsorshipOpportunityRow>(
      `select * from sponsorship_opportunities
        where status = 'open' and category = $1
        order by created_at desc
        limit $2`,
      [category, cap],
    );
  }
  return q<SponsorshipOpportunityRow>(
    `select * from sponsorship_opportunities
      where status = 'open'
      order by created_at desc
      limit $1`,
    [cap],
  );
}

/** Get one sponsorship opportunity (org-scoped via its venue). */
export async function getSponsorshipOpportunity(
  actor: Actor,
  id: string,
): Promise<SponsorshipOpportunityRow> {
  const row = await q1<SponsorshipOpportunityRow>(
    `select * from sponsorship_opportunities where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("sponsorship opportunity not found");
  if (row.venue_id) await assertVenueAccess(actor, row.venue_id);
  else if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this sponsorship opportunity");
  }
  return row;
}

export type SponsorshipOpportunityInput = {
  name?: string | null;
  category?: string | null;
  audience_size?: number | null;
  impression_estimate?: number | null;
  pricing?: unknown;
  deliverables?: unknown;
  availability?: unknown;
  photos?: unknown;
  performance_history?: unknown;
  status?: string | null;
};

/** Create a sponsorship opportunity for a venue (org-scoped). */
export async function createSponsorshipOpportunity(
  actor: Actor,
  venueId: string,
  input: SponsorshipOpportunityInput,
): Promise<SponsorshipOpportunityRow> {
  const orgId = await assertVenueAccess(actor, venueId);
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name required");
  }
  if (input.status != null && !isSponsorshipStatus(input.status)) {
    throw new ForbiddenError("invalid status");
  }
  const row = await q1<SponsorshipOpportunityRow>(
    `insert into sponsorship_opportunities
       (venue_id, organization_id, name, category, audience_size, impression_estimate,
        pricing, deliverables, availability, photos, performance_history, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12,'open'),$13)
     returning *`,
    [
      venueId,
      orgId,
      input.name,
      input.category ?? null,
      input.audience_size ?? null,
      input.impression_estimate ?? null,
      jsonbParam(input.pricing) ?? null,
      jsonbParam(input.deliverables) ?? null,
      jsonbParam(input.availability) ?? null,
      jsonbParam(input.photos) ?? null,
      jsonbParam(input.performance_history) ?? null,
      input.status ?? null,
      actor.user.id,
    ],
  );
  return row as SponsorshipOpportunityRow;
}

/** Patch a sponsorship opportunity (org-scoped via its venue). */
export async function updateSponsorshipOpportunity(
  actor: Actor,
  id: string,
  patch: SponsorshipOpportunityInput,
): Promise<SponsorshipOpportunityRow> {
  await getSponsorshipOpportunity(actor, id);
  if (patch.status != null && !isSponsorshipStatus(patch.status)) {
    throw new ForbiddenError("invalid status");
  }
  const row = await q1<SponsorshipOpportunityRow>(
    `update sponsorship_opportunities set
        name = coalesce($2, name),
        category = coalesce($3, category),
        audience_size = coalesce($4, audience_size),
        impression_estimate = coalesce($5, impression_estimate),
        pricing = coalesce($6, pricing),
        deliverables = coalesce($7, deliverables),
        availability = coalesce($8, availability),
        photos = coalesce($9, photos),
        performance_history = coalesce($10, performance_history),
        status = coalesce($11, status),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.category ?? null,
      patch.audience_size ?? null,
      patch.impression_estimate ?? null,
      jsonbParam(patch.pricing) ?? null,
      jsonbParam(patch.deliverables) ?? null,
      jsonbParam(patch.availability) ?? null,
      jsonbParam(patch.photos) ?? null,
      jsonbParam(patch.performance_history) ?? null,
      patch.status ?? null,
    ],
  );
  return row as SponsorshipOpportunityRow;
}

/** Delete a sponsorship opportunity (org-scoped via its venue). */
export async function deleteSponsorshipOpportunity(actor: Actor, id: string): Promise<void> {
  await getSponsorshipOpportunity(actor, id);
  await pool.query(`delete from sponsorship_opportunities where id = $1`, [id]);
}
