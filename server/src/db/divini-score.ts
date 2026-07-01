/**
 * Intelligence Moat - Divini Score data-access (Feature 12).
 *
 * Org-scoped, IDOR-safe access over the divini_scores cache (db/schema-im-
 * divini-score.sql). The Divini Score is an AGGREGATE: this repo gathers signals
 * from the tables the platform already maintains, hands them to the pure
 * computeDiviniScore (server/src/lib/diviniScore.ts), and persists the resulting
 * 0-100 score + component breakdown so reads are a single cached lookup.
 *
 * Tables aggregated, by entity type (every type also folds in the F10
 * post-event feedback factor: role-matched event_feedback ratings joined through
 * events / event_vendors, graceful-absent when the entity has none yet):
 *   - venue   : venues, venue_twin (readiness_score), reviews, events
 *               (completed + repeat), invoices/payments (revenue),
 *               event_feedback (role='venue'); vendor_compliance via the venue's
 *               vendors is not used; venue compliance comes from venue_twin
 *               completeness + insurance reqs.
 *   - vendor  : vendor_readiness (performance/response/quote/win), vendor_compliance
 *               (compliance/on-time), reviews, events (completed),
 *               event_feedback (role='vendor', via event_vendors).
 *   - planner : events (success rate + volume = organization), reviews,
 *               event_feedback (role='planner').
 *   - sponsor : organizations + their sponsorship_opportunities + sponsorship_metrics
 *               (revenue/engagement/renewal via performance_history), events,
 *               event_feedback (role='sponsor').
 *   - client  : invoices/payments (payment history), events (completion),
 *               reviews, messages (communication / reliability proxy),
 *               event_feedback (role='client').
 *
 * Authorization mirrors server/src/db/vendor-readiness.ts and venue-twin.ts:
 *   - the entity is resolved to an owning organization id per type, and an actor
 *     may read/recompute when their org owns the entity, or they are admin /
 *     super_admin. A forged id from another tenant is rejected (ForbiddenError);
 *     a missing id is NotFoundError.
 *
 * On every write the score is recomputed from freshly-gathered signals and
 * persisted, so the stored score always reflects current data.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  computeDiviniScore,
  isDiviniEntityType,
  type DiviniEntityType,
  type DiviniSignals,
  type DiviniScoreResult,
} from "../lib/diviniScore.js";

// ---- Row type ---------------------------------------------------------------

export type DiviniScoreRow = {
  id: string;
  entity_type: DiviniEntityType;
  entity_id: string;
  score: number;
  components: unknown;
  updated_at: string;
};

export type DiviniScoreView = {
  entity_type: DiviniEntityType;
  entity_id: string;
  score: number;
  components: DiviniScoreResult["components"];
  updated_at: string | null;
  signals: DiviniSignals;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the organization that owns an entity (or null for an org-less owner),
 * validating the entity exists. Throws NotFoundError when it does not.
 *   - venue/vendor : the owning organization_id column.
 *   - sponsor      : the organizations row itself (its own id is the owner).
 *   - planner/client : the users row; its organization_id is the boundary, and
 *                      the user's own id also grants access (self).
 */
async function resolveOwner(
  entityType: DiviniEntityType,
  entityId: string,
): Promise<{ orgId: string | null; userId: string | null }> {
  if (entityType === "venue") {
    const row = await q1<{ organization_id: string | null }>(
      `select organization_id from venues where id = $1`,
      [entityId],
    );
    if (!row) throw new NotFoundError("venue not found");
    return { orgId: row.organization_id, userId: null };
  }
  if (entityType === "vendor") {
    const row = await q1<{ organization_id: string | null }>(
      `select organization_id from vendors where id = $1`,
      [entityId],
    );
    if (!row) throw new NotFoundError("vendor not found");
    return { orgId: row.organization_id, userId: null };
  }
  if (entityType === "sponsor") {
    const row = await q1<{ id: string }>(
      `select id from organizations where id = $1`,
      [entityId],
    );
    if (!row) throw new NotFoundError("sponsor not found");
    return { orgId: entityId, userId: null };
  }
  // planner | client -> a users row.
  const row = await q1<{ id: string; organization_id: string | null }>(
    `select id, organization_id from users where id = $1`,
    [entityId],
  );
  if (!row) throw new NotFoundError(`${entityType} not found`);
  return { orgId: row.organization_id, userId: row.id };
}

/**
 * Assert the actor may read/recompute this entity's score. Admins always may;
 * otherwise the actor's org must own the entity, or (for planner/client) the
 * actor must be that user. Returns the resolved owner.
 */
async function assertEntityAccess(
  actor: Actor,
  entityType: DiviniEntityType,
  entityId: string,
): Promise<{ orgId: string | null; userId: string | null }> {
  const owner = await resolveOwner(entityType, entityId);
  if (isAdmin(actor)) return owner;
  const sameOrg = !!actor.org?.id && owner.orgId === actor.org.id;
  const sameUser = !!owner.userId && owner.userId === actor.user.id;
  if (!sameOrg && !sameUser) {
    throw new ForbiddenError(`no access to this ${entityType}`);
  }
  return owner;
}

// ---- Numeric helpers --------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** A count saturated to [0, 1] at `sat` (e.g. repeat bookings, volume). */
function saturate(count: number, sat: number): number {
  if (sat <= 0) return 0;
  return clamp01(count / sat);
}

/**
 * Average a set of event_feedback ratings into a graceful-absence feedback
 * signal (0-5, on the same scale as `reviews`). Returns null when there are no
 * rated feedback rows so computeDiviniScore drops the factor and the entity is
 * NOT penalized for simply having no feedback yet (no fabrication, no penalty).
 */
function feedbackSignal(row: { avg: string | null; cnt: string | null } | null): number | null {
  const cnt = num(row?.cnt);
  if (cnt <= 0) return null;
  const avg = num(row?.avg);
  return avg > 0 ? Math.max(0, Math.min(5, avg)) : null;
}

// ---- Signal gathering -------------------------------------------------------

async function gatherVenueSignals(venueId: string): Promise<DiviniSignals> {
  const base = await q1<{ review_score: string | null }>(
    `select review_score from venues where id = $1`,
    [venueId],
  );
  const twin = await q1<{ readiness_score: number | null }>(
    `select readiness_score from venue_twin where venue_id = $1`,
    [venueId],
  );
  // Reviews of this venue come in via events held at the venue (reviewee can be
  // the venue's users); fall back to venues.review_score when present.
  const rev = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(r.rating) as avg, count(*) as cnt
       from reviews r
       join events e on e.id = r.event_id
      where e.venue_id = $1 and r.rating is not null`,
    [venueId],
  );
  const evt = await q1<{ total: string | null; completed: string | null }>(
    `select count(*) as total,
            count(*) filter (where status in ('completed','closed','archived')) as completed
       from events where venue_id = $1`,
    [venueId],
  );
  // Revenue performance: paid invoice totals for events at this venue, saturating.
  const revenue = await q1<{ total: string | null }>(
    `select coalesce(sum(i.total), 0) as total
       from invoices i
       join events e on e.id = i.event_id
      where e.venue_id = $1 and i.status in ('paid','closed','partially_paid','deposit_paid')`,
    [venueId],
  );
  // Repeat bookings: clients who booked this venue more than once.
  const repeat = await q1<{ repeats: string | null }>(
    `select count(*) as repeats from (
        select client_id, count(*) c
          from events
         where venue_id = $1 and client_id is not null
         group by client_id
        having count(*) > 1
     ) t`,
    [venueId],
  );

  // F10 post-event feedback addressed to this venue (role = 'venue') across the
  // events held here. Null when none exists (graceful absence -> no penalty).
  const fb = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(f.rating) as avg, count(f.rating) as cnt
       from event_feedback f
       join events e on e.id = f.event_id
      where e.venue_id = $1 and f.role = 'venue' and f.rating is not null`,
    [venueId],
  );

  const reviewsAvg = num(rev?.avg) > 0 ? num(rev?.avg) : num(base?.review_score);
  const completed = num(evt?.completed);
  const total = num(evt?.total);

  return {
    completeness: clamp01(num(twin?.readiness_score) / 100),
    responsiveness: clamp01(total > 0 ? completed / total : 0),
    revenue_performance: saturate(num(revenue?.total), 500_000),
    reviews: reviewsAvg, // 0-5, normalized /5 by the lib
    repeat_bookings: saturate(num(repeat?.repeats), 10),
    compliance: clamp01(num(twin?.readiness_score) / 100),
    feedback: feedbackSignal(fb), // 0-5 or null (no feedback = factor dropped)
  };
}

async function gatherVendorSignals(vendorId: string): Promise<DiviniSignals> {
  const base = await q1<{ review_score: string | null }>(
    `select review_score from vendors where id = $1`,
    [vendorId],
  );
  const readiness = await q1<{
    score: number | null;
    response_speed: string | null;
    quote_speed: string | null;
    approval_rate: string | null;
    win_rate: string | null;
  }>(
    `select score, response_speed, quote_speed, approval_rate, win_rate
       from vendor_readiness where vendor_id = $1`,
    [vendorId],
  );
  const compliance = await q1<{
    score: number | null;
    on_time_rate: string | null;
    reviews_score: string | null;
  }>(
    `select score, on_time_rate, reviews_score
       from vendor_compliance where vendor_id = $1`,
    [vendorId],
  );
  // Reviews of this vendor (reviewee_id = a user in the vendor's org). Fall back
  // to the compliance reviews_score, then the vendor.review_score column.
  const rev = await q1<{ avg: string | null }>(
    `select avg(rating) as avg
       from reviews r
       join users u on u.id = r.reviewee_id
       join vendors v on v.organization_id = u.organization_id
      where v.id = $1 and r.rating is not null`,
    [vendorId],
  );
  // F10 post-event feedback addressed to this vendor (role = 'vendor'), now
  // per-vendor granular and backward-compatible:
  //   - tagged rows (target_vendor_id set) count ONLY for that exact vendor;
  //   - legacy rows (target_vendor_id IS NULL) keep the old event-level behavior
  //     and count for every vendor on the event (mapped via event_vendors).
  // A `distinct f.id` guards against double-counting a legacy row when a vendor
  // appears more than once on the same event's roster. Null when none exists.
  const fb = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(rating) as avg, count(rating) as cnt
       from (
         select distinct f.id, f.rating
           from event_feedback f
           join event_vendors ev on ev.event_id = f.event_id
          where f.role = 'vendor'
            and f.rating is not null
            and (
                  f.target_vendor_id = $1
              or (f.target_vendor_id is null and ev.vendor_id = $1)
            )
       ) tagged`,
    [vendorId],
  );

  const reviewsAvg =
    num(rev?.avg) > 0
      ? num(rev?.avg)
      : num(compliance?.reviews_score) > 0
        ? num(compliance?.reviews_score)
        : num(base?.review_score);

  return {
    performance: clamp01(num(readiness?.score) / 100),
    reviews: reviewsAvg, // 0-5
    compliance: clamp01(num(compliance?.score) / 100),
    on_time: clamp01(num(compliance?.on_time_rate)),
    quote_accuracy: clamp01(num(readiness?.approval_rate)),
    response_speed: clamp01(num(readiness?.response_speed)),
    feedback: feedbackSignal(fb), // 0-5 or null
  };
}

async function gatherPlannerSignals(plannerUserId: string): Promise<DiviniSignals> {
  const evt = await q1<{ total: string | null; completed: string | null }>(
    `select count(*) as total,
            count(*) filter (where status in ('completed','closed','archived')) as completed
       from events where planner_id = $1`,
    [plannerUserId],
  );
  const rev = await q1<{ avg: string | null }>(
    `select avg(rating) as avg from reviews
      where reviewee_id = $1 and rating is not null`,
    [plannerUserId],
  );
  // F10 post-event feedback addressed to this planner (role = 'planner') across
  // the events they ran. Null when none exists (graceful absence -> no penalty).
  const fb = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(f.rating) as avg, count(f.rating) as cnt
       from event_feedback f
       join events e on e.id = f.event_id
      where e.planner_id = $1 and f.role = 'planner' and f.rating is not null`,
    [plannerUserId],
  );
  const total = num(evt?.total);
  const completed = num(evt?.completed);
  const successRate = total > 0 ? completed / total : 0;
  const rating5 = num(rev?.avg); // 0-5
  const ratingUnit = clamp01(rating5 / 5);

  return {
    event_success_rate: clamp01(successRate),
    // Organization: how much throughput the planner manages, saturating.
    organization: saturate(total, 25),
    // The platform does not split satisfaction by counterparty yet, so all three
    // satisfaction factors derive from the planner's review average (a single
    // honest signal). Per-role post-event feedback (F10) now feeds the separate
    // `feedback` factor below.
    vendor_satisfaction: ratingUnit,
    venue_satisfaction: ratingUnit,
    client_satisfaction: ratingUnit,
    feedback: feedbackSignal(fb), // 0-5 or null
  };
}

async function gatherSponsorSignals(orgId: string): Promise<DiviniSignals> {
  // A sponsor org's footprint: sponsorship opportunities it owns (as a venue
  // org) plus the metrics behind them. Engagement = impressions strength;
  // renewal = historical_performance presence; activation = sold-through share.
  const opp = await q1<{
    total: string | null;
    closed: string | null;
    revenue: string | null;
    impressions: string | null;
    with_history: string | null;
  }>(
    `select count(o.*) as total,
            count(*) filter (where o.status = 'closed') as closed,
            coalesce(sum(m.revenue), 0) as revenue,
            coalesce(sum(m.impressions), 0) as impressions,
            count(*) filter (where m.historical_performance is not null) as with_history
       from sponsorship_opportunities o
       left join sponsorship_metrics m on m.sponsorship_opportunity_id = o.id
      where o.organization_id = $1`,
    [orgId],
  );
  const evt = await q1<{ total: string | null; completed: string | null }>(
    `select count(*) as total,
            count(*) filter (where status in ('completed','closed','archived')) as completed
       from events where organization_id = $1`,
    [orgId],
  );
  // F10 post-event feedback addressed to this sponsor org (role = 'sponsor')
  // across its events. Null when none exists (graceful absence -> no penalty).
  const fb = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(f.rating) as avg, count(f.rating) as cnt
       from event_feedback f
       join events e on e.id = f.event_id
      where e.organization_id = $1 and f.role = 'sponsor' and f.rating is not null`,
    [orgId],
  );
  const total = num(opp?.total);
  const closed = num(opp?.closed);
  const evtTotal = num(evt?.total);
  const evtDone = num(evt?.completed);

  return {
    activation_success: clamp01(total > 0 ? closed / total : 0),
    engagement: saturate(num(opp?.impressions), 1_000_000),
    renewal: clamp01(total > 0 ? num(opp?.with_history) / total : 0),
    performance: clamp01(
      evtTotal > 0 ? evtDone / evtTotal : saturate(num(opp?.revenue), 250_000),
    ),
    feedback: feedbackSignal(fb), // 0-5 or null
  };
}

async function gatherClientSignals(clientUserId: string): Promise<DiviniSignals> {
  // Payment history: share of the client's invoices that are paid (and not
  // overdue/disputed). Project completion: share of their events completed.
  const inv = await q1<{ total: string | null; paid: string | null; bad: string | null }>(
    `select count(*) as total,
            count(*) filter (where status in ('paid','closed')) as paid,
            count(*) filter (where status in ('overdue','disputed')) as bad
       from invoices where client_id = $1`,
    [clientUserId],
  );
  const evt = await q1<{ total: string | null; completed: string | null }>(
    `select count(*) as total,
            count(*) filter (where status in ('completed','closed','archived')) as completed
       from events where client_id = $1`,
    [clientUserId],
  );
  const rev = await q1<{ avg: string | null }>(
    `select avg(rating) as avg from reviews
      where reviewee_id = $1 and rating is not null`,
    [clientUserId],
  );
  // Communication proxy: did the client participate in event message threads.
  const msg = await q1<{ cnt: string | null }>(
    `select count(*) as cnt from messages where sender_id = $1`,
    [clientUserId],
  );
  // F10 post-event feedback addressed to this client (role = 'client') across
  // their events. Null when none exists (graceful absence -> no penalty).
  const fb = await q1<{ avg: string | null; cnt: string | null }>(
    `select avg(f.rating) as avg, count(f.rating) as cnt
       from event_feedback f
       join events e on e.id = f.event_id
      where e.client_id = $1 and f.role = 'client' and f.rating is not null`,
    [clientUserId],
  );

  const invTotal = num(inv?.total);
  const paid = num(inv?.paid);
  const bad = num(inv?.bad);
  const evtTotal = num(evt?.total);
  const evtDone = num(evt?.completed);
  const rating5 = num(rev?.avg);

  // Payment health: paid share minus a penalty for overdue/disputed invoices.
  const paymentHealth =
    invTotal > 0 ? clamp01(paid / invTotal - bad / invTotal) : 0;
  // Reliability blends review average with payment health.
  const reliability =
    rating5 > 0 ? clamp01((rating5 / 5) * 0.5 + paymentHealth * 0.5) : paymentHealth;

  return {
    payment_history: paymentHealth,
    communication: saturate(num(msg?.cnt), 20),
    project_completion: clamp01(evtTotal > 0 ? evtDone / evtTotal : 0),
    reliability,
    feedback: feedbackSignal(fb), // 0-5 or null
  };
}

/**
 * Gather the signal bag for an entity by joining the existing tables. Pure-ish:
 * read-only DB queries, no writes. Authorization is the caller's responsibility
 * (upsertScore / getScore assert access first). Returns all-zero signals for an
 * unknown type (guarded by isDiviniEntityType upstream).
 */
export async function gatherSignals(
  entityType: DiviniEntityType,
  entityId: string,
  owner?: { orgId: string | null; userId: string | null },
): Promise<DiviniSignals> {
  switch (entityType) {
    case "venue":
      return gatherVenueSignals(entityId);
    case "vendor":
      return gatherVendorSignals(entityId);
    case "planner":
      return gatherPlannerSignals(owner?.userId ?? entityId);
    case "sponsor":
      return gatherSponsorSignals(owner?.orgId ?? entityId);
    case "client":
      return gatherClientSignals(owner?.userId ?? entityId);
    default:
      return {};
  }
}

// ---- Cache read / write -----------------------------------------------------

function parseComponents(raw: unknown): DiviniScoreResult["components"] | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as DiviniScoreResult["components"];
    } catch {
      return null;
    }
  }
  return raw as DiviniScoreResult["components"];
}

/**
 * Get the cached Divini Score for an entity, computing (without persisting) a
 * fresh value when no cached row exists yet so a first read never returns null.
 * Org-scoped + IDOR-safe.
 */
export async function getScore(
  actor: Actor,
  entityType: DiviniEntityType,
  entityId: string,
): Promise<DiviniScoreView> {
  if (!isDiviniEntityType(entityType)) throw new NotFoundError("unknown entity type");
  const owner = await assertEntityAccess(actor, entityType, entityId);
  const row = await q1<DiviniScoreRow>(
    `select * from divini_scores where entity_type = $1 and entity_id = $2`,
    [entityType, entityId],
  );
  const signals = await gatherSignals(entityType, entityId, owner);
  if (row) {
    const cached = parseComponents(row.components);
    return {
      entity_type: entityType,
      entity_id: entityId,
      score: row.score,
      components: cached ?? computeDiviniScore(entityType, signals).components,
      updated_at: row.updated_at,
      signals,
    };
  }
  // No cached row yet: compute on the fly (read does not persist).
  const fresh = computeDiviniScore(entityType, signals);
  return {
    entity_type: entityType,
    entity_id: entityId,
    score: fresh.score,
    components: fresh.components,
    updated_at: null,
    signals,
  };
}

/**
 * Recompute the Divini Score for an entity from freshly-gathered signals and
 * persist it (upsert on entity_type + entity_id). Org-scoped + IDOR-safe.
 * Returns the stored view.
 */
export async function upsertScore(
  actor: Actor,
  entityType: DiviniEntityType,
  entityId: string,
): Promise<DiviniScoreView> {
  if (!isDiviniEntityType(entityType)) throw new NotFoundError("unknown entity type");
  const owner = await assertEntityAccess(actor, entityType, entityId);
  const signals = await gatherSignals(entityType, entityId, owner);
  const result = computeDiviniScore(entityType, signals);

  const row = await q1<DiviniScoreRow>(
    `insert into divini_scores (entity_type, entity_id, score, components, updated_at)
       values ($1, $2, $3, $4, now())
     on conflict (entity_type, entity_id) do update set
        score = excluded.score,
        components = excluded.components,
        updated_at = now()
     returning *`,
    [entityType, entityId, result.score, JSON.stringify(result.components)],
  );

  return {
    entity_type: entityType,
    entity_id: entityId,
    score: row?.score ?? result.score,
    components: parseComponents(row?.components) ?? result.components,
    updated_at: row?.updated_at ?? null,
    signals,
  };
}

/**
 * Recompute + persist the Divini Score for an entity WITHOUT the per-actor org
 * access check. This is for internal, event-scoped triggers (the F10 feedback
 * loop) where the caller has ALREADY passed the event IDOR gate (getEvent) and
 * is recomputing the scores of entities legitimately tied to that event, even
 * when the acting user does not personally own each one.
 *
 * It still validates the entity exists (resolveOwner throws NotFoundError on a
 * forged id), so it cannot be used to touch arbitrary rows. Deterministic and
 * idempotent: same signals in, same upserted score out. Returns null when the
 * entity does not resolve (caller treats that as a no-op).
 */
export async function recomputeScoreInternal(
  entityType: DiviniEntityType,
  entityId: string,
): Promise<DiviniScoreView | null> {
  if (!isDiviniEntityType(entityType) || !entityId) return null;
  let owner: { orgId: string | null; userId: string | null };
  try {
    owner = await resolveOwner(entityType, entityId);
  } catch {
    return null; // unknown / deleted entity: nothing to recompute
  }
  const signals = await gatherSignals(entityType, entityId, owner);
  const result = computeDiviniScore(entityType, signals);

  const row = await q1<DiviniScoreRow>(
    `insert into divini_scores (entity_type, entity_id, score, components, updated_at)
       values ($1, $2, $3, $4, now())
     on conflict (entity_type, entity_id) do update set
        score = excluded.score,
        components = excluded.components,
        updated_at = now()
     returning *`,
    [entityType, entityId, result.score, JSON.stringify(result.components)],
  );

  return {
    entity_type: entityType,
    entity_id: entityId,
    score: row?.score ?? result.score,
    components: parseComponents(row?.components) ?? result.components,
    updated_at: row?.updated_at ?? null,
    signals,
  };
}

/**
 * List cached scores for an entity type (admin / overview), highest first.
 * Admin-only: a non-admin actor gets only the entities their org owns is not
 * trivially expressible per type here, so this is gated to admins; the surface
 * uses per-entity getScore for non-admin contexts.
 */
export async function listScores(
  actor: Actor,
  entityType?: string,
  limit = 100,
): Promise<DiviniScoreRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("admin only");
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  if (entityType && isDiviniEntityType(entityType)) {
    return q<DiviniScoreRow>(
      `select * from divini_scores where entity_type = $1 order by score desc, updated_at desc limit $2`,
      [entityType, lim],
    );
  }
  return q<DiviniScoreRow>(
    `select * from divini_scores order by score desc, updated_at desc limit $1`,
    [lim],
  );
}
