/**
 * F1 Event Memory Engine + F10 Post-Event Intelligence - data-access layer.
 *
 * recordEventMemory() gathers the raw rows from the existing operational tables
 * (events, event_vendors, quotes, invoices, payments, reviews, change_orders,
 * installations, sponsorship_opportunities, contract_pricing), assembles them
 * with the pure helper assembleSnapshot(), and upserts one event_memory row per
 * event. getMemory() reads it back. listSimilar() returns the comparable
 * snapshots for an event type + venue. Feedback create/list back F10.
 *
 * Authorization: every event-scoped operation funnels through the events repo
 * getEvent() IDOR gate, so a user only ever touches memory/feedback for events
 * their org / role can already see.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { recomputeScoreInternal } from "./divini-score.js";
import { type DiviniEntityType } from "../lib/diviniScore.js";
import {
  assembleSnapshot,
  surfaceInsights,
  type SnapshotParts,
  type MemoryRow,
  type MemoryInsights,
  type VendorUsed,
  type SponsorUsed,
} from "../lib/eventMemory.js";

export interface EventMemoryRow {
  id: string;
  event_id: string;
  event_type: string | null;
  venue_id: string | null;
  guest_count: number | null;
  budget: string | null;
  vendors_used: VendorUsed[] | null;
  sponsors_used: SponsorUsed[] | null;
  revenue: string | null;
  timeline: unknown;
  approvals: unknown;
  change_orders: unknown;
  contracts: unknown;
  install_minutes: number | null;
  teardown_minutes: number | null;
  issues: unknown;
  resolutions: unknown;
  reviews: unknown;
  photos: unknown;
  outcome: string | null;
  created_at: string;
}

/**
 * Gather + persist the durable snapshot for an event. Event-access scoped via
 * getEvent(). Upserts (one row per event_id).
 */
export async function recordEventMemory(actor: Actor, eventId: string): Promise<EventMemoryRow> {
  // IDOR gate: throws NotFound/Forbidden if the actor cannot see this event.
  const ev = await getEvent(actor, eventId);

  // --- gather from the existing tables ---------------------------------------
  const vendors = await q<VendorUsed>(
    `select ev.organization_id, ev.vendor_id, ev.role, ev.status, o.name
       from event_vendors ev
       left join organizations o on o.id = ev.organization_id
      where ev.event_id = $1
      order by ev.created_at asc`,
    [eventId],
  );

  // Sponsorship opportunities are venue-scoped (no event_id column), so the
  // sponsor stack for the snapshot is the open inventory at this event's venue.
  const sponsors = ev.venue_id
    ? await q<SponsorUsed>(
        `select id, name, category, status
           from sponsorship_opportunities
          where venue_id = $1
          order by created_at asc`,
        [ev.venue_id],
      )
    : [];

  const invoices = await q<{ total: string | null; status: string | null }>(
    `select total, status from invoices where event_id = $1`,
    [eventId],
  );

  // Payments hang off invoices, not events; join through the invoice.
  const payments = await q<{ amount: string | null; status: string | null }>(
    `select p.amount, p.status
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.event_id = $1`,
    [eventId],
  );

  const reviews = await q<{ rating: string | null; body: string | null; status: string | null }>(
    `select rating, body, status from reviews where event_id = $1`,
    [eventId],
  );

  const changeOrders = await q<{
    id: string;
    description: string | null;
    amount: string | null;
    status: string | null;
    created_at: string | null;
  }>(
    `select id, description, amount, status, created_at
       from change_orders where event_id = $1 order by created_at asc`,
    [eventId],
  );

  const installations = await q<{
    arrival_time: string | null;
    setup_window: unknown;
    removal_schedule: unknown;
    completion_photos: unknown;
    status: string | null;
  }>(
    `select arrival_time, setup_window, removal_schedule, completion_photos, status
       from installations where event_id = $1`,
    [eventId],
  );

  // Contracts touching either side of this event's org (deterministic, best-effort).
  const contracts = ev.organization_id
    ? await q<Record<string, unknown>>(
        `select id, partner_type, pricing_type, discount_pct, fixed_rate, status
           from contract_pricing
          where partner_a_org = $1 or partner_b_org = $1
          order by created_at asc
          limit 50`,
        [ev.organization_id],
      )
    : [];

  // Feedback issues / resolutions already collected for this event (F10 feeds F1).
  const fb = await q<{ comments: string | null; drivers: unknown }>(
    `select comments, drivers from event_feedback where event_id = $1`,
    [eventId],
  );
  const feedbackIssues: string[] = [];
  const feedbackResolutions: string[] = [];
  for (const row of fb) {
    const d = (row.drivers ?? {}) as Record<string, unknown>;
    if (Array.isArray(d.failure)) for (const x of d.failure) if (typeof x === "string") feedbackIssues.push(x);
    if (Array.isArray(d.issues)) for (const x of d.issues) if (typeof x === "string") feedbackIssues.push(x);
    if (Array.isArray(d.resolutions)) for (const x of d.resolutions) if (typeof x === "string") feedbackResolutions.push(x);
  }

  const parts: SnapshotParts = {
    event: {
      type: ev.type,
      venue_id: ev.venue_id,
      guest_count: ev.guest_count,
      budget: ev.budget,
      status: ev.status,
      date_time: ev.date_time,
      created_at: ev.created_at,
      updated_at: ev.updated_at,
    },
    vendors,
    sponsors,
    invoices,
    payments,
    reviews,
    changeOrders,
    installations,
    contracts,
    feedbackIssues,
    feedbackResolutions,
  };

  const snap = assembleSnapshot(parts);

  const row = await q1<EventMemoryRow>(
    `insert into event_memory
       (event_id, event_type, venue_id, guest_count, budget, vendors_used, sponsors_used,
        revenue, timeline, approvals, change_orders, contracts, install_minutes,
        teardown_minutes, issues, resolutions, reviews, photos, outcome)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     on conflict (event_id) do update set
        event_type = excluded.event_type,
        venue_id = excluded.venue_id,
        guest_count = excluded.guest_count,
        budget = excluded.budget,
        vendors_used = excluded.vendors_used,
        sponsors_used = excluded.sponsors_used,
        revenue = excluded.revenue,
        timeline = excluded.timeline,
        approvals = excluded.approvals,
        change_orders = excluded.change_orders,
        contracts = excluded.contracts,
        install_minutes = excluded.install_minutes,
        teardown_minutes = excluded.teardown_minutes,
        issues = excluded.issues,
        resolutions = excluded.resolutions,
        reviews = excluded.reviews,
        photos = excluded.photos,
        outcome = excluded.outcome,
        created_at = now()
     returning *`,
    [
      eventId,
      snap.event_type,
      snap.venue_id,
      snap.guest_count,
      snap.budget,
      JSON.stringify(snap.vendors_used),
      JSON.stringify(snap.sponsors_used),
      snap.revenue,
      JSON.stringify(snap.timeline),
      JSON.stringify(snap.approvals),
      JSON.stringify(snap.change_orders),
      JSON.stringify(snap.contracts),
      snap.install_minutes,
      snap.teardown_minutes,
      JSON.stringify(snap.issues),
      JSON.stringify(snap.resolutions),
      JSON.stringify(snap.reviews),
      JSON.stringify(snap.photos),
      snap.outcome,
    ],
  );
  return row as EventMemoryRow;
}

/** Read the stored snapshot for an event (event-access scoped), or null. */
export async function getMemory(actor: Actor, eventId: string): Promise<EventMemoryRow | null> {
  await getEvent(actor, eventId); // IDOR gate
  return q1<EventMemoryRow>(`select * from event_memory where event_id = $1`, [eventId]);
}

/**
 * List comparable snapshots for an event type and/or venue, newest first.
 * Read-only intelligence rollup: snapshots are aggregate (no per-event PII), so
 * this surfaces cross-event learning without leaking individual event detail.
 */
export async function listSimilar(
  eventType: string | null,
  venueId: string | null,
  limit = 200,
): Promise<EventMemoryRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (eventType) {
    params.push(eventType);
    where.push(`event_type = $${params.length}`);
  }
  if (venueId) {
    params.push(venueId);
    where.push(`venue_id = $${params.length}`);
  }
  params.push(limit);
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  return q<EventMemoryRow>(
    `select * from event_memory ${clause} order by created_at desc limit $${params.length}`,
    params,
  );
}

/** Build the surfaced insights for an event type / venue from stored snapshots. */
export async function insightsFor(
  eventType: string | null,
  venueId: string | null,
): Promise<{ insights: MemoryInsights; sample: number }> {
  const rows = await listSimilar(eventType, venueId);
  const mapped: MemoryRow[] = rows.map((r) => ({
    event_id: r.event_id,
    event_type: r.event_type,
    venue_id: r.venue_id,
    guest_count: r.guest_count,
    budget: r.budget,
    revenue: r.revenue,
    install_minutes: r.install_minutes,
    teardown_minutes: r.teardown_minutes,
    vendors_used: (r.vendors_used ?? []) as VendorUsed[],
    reviews: (r.reviews ?? []) as { rating?: number | string | null }[],
    outcome: r.outcome,
  }));
  const label = eventType ?? undefined;
  return { insights: surfaceInsights(mapped, label), sample: rows.length };
}

// ---------------------------------------------------------------------------
// F10 feedback
// ---------------------------------------------------------------------------

export interface EventFeedbackRow {
  id: string;
  event_id: string;
  role: string | null;
  rating: number | null;
  comments: string | null;
  drivers: unknown;
  /** The specific vendor this feedback is about, or null (event-level/legacy). */
  target_vendor_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateFeedbackInput {
  event_id: string;
  role?: string | null;
  rating?: number | null;
  comments?: string | null;
  drivers?: unknown;
  /**
   * Optional: target a SPECIFIC vendor on this event. When set, the feedback is
   * attributed only to this vendor (vendors.id). Must be a vendor actually on
   * the event_vendors roster for event_id, or createFeedback rejects it.
   */
  target_vendor_id?: string | null;
}

const FEEDBACK_ROLES = new Set([
  "venue",
  "vendor",
  "planner",
  "sponsor",
  "client",
  "attendee",
]);

/**
 * The Divini Score subjects (entity_type + entity_id) legitimately tied to an
 * event: its venue, every attached vendor, its planner, client, and the owning
 * organization (as a sponsor subject). Derived ONLY from the event's own rows,
 * so the F10 loop can never recompute a score for an entity the event does not
 * touch. The caller must already have passed the getEvent IDOR gate.
 */
async function eventScoreSubjects(
  eventRow: EventMemoryEventRef,
): Promise<{ type: DiviniEntityType; id: string }[]> {
  const subjects: { type: DiviniEntityType; id: string }[] = [];
  const seen = new Set<string>();
  const add = (type: DiviniEntityType, id: string | null | undefined) => {
    if (!id) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    subjects.push({ type, id });
  };

  add("venue", eventRow.venue_id);
  add("planner", eventRow.planner_id);
  add("client", eventRow.client_id);
  add("sponsor", eventRow.organization_id); // sponsor subject = owning org

  const vendors = await q<{ vendor_id: string | null }>(
    `select vendor_id from event_vendors where event_id = $1 and vendor_id is not null`,
    [eventRow.id],
  );
  for (const v of vendors) add("vendor", v.vendor_id);

  return subjects;
}

type EventMemoryEventRef = {
  id: string;
  venue_id: string | null;
  planner_id: string | null;
  client_id: string | null;
  organization_id: string | null;
};

/**
 * F10 intelligence loop: recompute the Divini Score of every entity tied to an
 * event. Best-effort and idempotent: a single entity's recompute hiccup never
 * fails the loop (or the feedback response). Returns the list of subjects whose
 * stored score was refreshed. The event must already have passed the IDOR gate.
 */
export async function recomputeScoresForEvent(
  eventRow: EventMemoryEventRef,
): Promise<{ entity_type: DiviniEntityType; entity_id: string; score: number }[]> {
  const subjects = await eventScoreSubjects(eventRow);
  const updated: { entity_type: DiviniEntityType; entity_id: string; score: number }[] = [];
  for (const s of subjects) {
    try {
      const view = await recomputeScoreInternal(s.type, s.id);
      if (view) updated.push({ entity_type: s.type, entity_id: s.id, score: view.score });
    } catch (err) {
      // Best-effort: log and continue so one bad subject never blocks the rest.
      console.error(`[F10] divini-score recompute failed for ${s.type}:${s.id}`, err);
    }
  }
  return updated;
}

/** A successful event averages at or above this rating (out of 5). */
export const PLAYBOOK_ELIGIBLE_MIN_AVG = 4;
/** ...across at least this many feedback responses (avoids a single rave). */
export const PLAYBOOK_ELIGIBLE_MIN_RESPONSES = 1;

export interface PlaybookEligibility {
  eligible: boolean;
  reason: string;
  avg_rating: number | null;
  responses: number;
}

/**
 * F10 -> F2 feed: decide, deterministically, whether an event's feedback marks
 * it as a SUCCESS worth saving as a reusable playbook. Computed purely from the
 * stored event_feedback ratings (no fabrication, no schema). A full playbook is
 * never auto-created: this only signals the user to save one (matching the
 * existing user-initiated save/clone flow).
 */
export async function playbookEligibilityForEvent(eventId: string): Promise<PlaybookEligibility> {
  const rows = await q<{ rating: number | null }>(
    `select rating from event_feedback where event_id = $1 and rating is not null`,
    [eventId],
  );
  const ratings = rows
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n));
  const responses = ratings.length;
  const avg_rating =
    responses > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / responses) * 100) / 100 : null;

  if (responses < PLAYBOOK_ELIGIBLE_MIN_RESPONSES || avg_rating == null) {
    return { eligible: false, reason: "Not enough rated feedback yet.", avg_rating, responses };
  }
  if (avg_rating >= PLAYBOOK_ELIGIBLE_MIN_AVG) {
    return {
      eligible: true,
      reason: `Strong feedback (${avg_rating}/5 across ${responses} response${responses === 1 ? "" : "s"}). Save this event as a reusable playbook.`,
      avg_rating,
      responses,
    };
  }
  return {
    eligible: false,
    reason: `Average feedback ${avg_rating}/5 is below the ${PLAYBOOK_ELIGIBLE_MIN_AVG}/5 playbook threshold.`,
    avg_rating,
    responses,
  };
}

export interface CreateFeedbackResult {
  feedback: EventFeedbackRow;
  /** Divini Score subjects whose stored score was refreshed by this feedback. */
  scores_updated: { entity_type: DiviniEntityType; entity_id: string; score: number }[];
  /** Whether this event now qualifies to be saved as a playbook. */
  playbook: PlaybookEligibility;
}

/**
 * Create a feedback row for an event (event-access scoped), then run the F10
 * intelligence loop: recompute the Divini Scores of every entity tied to the
 * event and compute playbook eligibility. The loop is additive and best-effort:
 * a recompute failure is logged and never blocks the feedback write/response.
 */
export async function createFeedback(
  actor: Actor,
  input: CreateFeedbackInput,
): Promise<CreateFeedbackResult> {
  const ev = await getEvent(actor, input.event_id); // IDOR gate
  const role = input.role && FEEDBACK_ROLES.has(input.role) ? input.role : actor.user.role ?? null;
  let rating: number | null = null;
  if (input.rating != null) {
    const n = Number(input.rating);
    if (Number.isFinite(n)) rating = Math.max(1, Math.min(5, Math.round(n)));
  }

  // Per-vendor granularity: when target_vendor_id is supplied it must be a vendor
  // actually on THIS event's roster (event_vendors). Reject a forged/foreign id
  // so feedback can never be planted against a vendor not on the event
  // (IDOR/abuse-safe). NULL keeps the legacy event-level attribution.
  let targetVendorId: string | null = null;
  const rawTarget =
    typeof input.target_vendor_id === "string" ? input.target_vendor_id.trim() : "";
  if (rawTarget) {
    const onEvent = await q1<{ vendor_id: string }>(
      `select vendor_id from event_vendors
        where event_id = $1 and vendor_id = $2
        limit 1`,
      [input.event_id, rawTarget],
    );
    if (!onEvent) {
      throw new ForbiddenError("target_vendor_id is not a vendor on this event");
    }
    targetVendorId = onEvent.vendor_id;
  }

  const row = await q1<EventFeedbackRow>(
    `insert into event_feedback (event_id, role, rating, comments, drivers, target_vendor_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      input.event_id,
      role,
      rating,
      input.comments ?? null,
      input.drivers != null ? JSON.stringify(input.drivers) : null,
      targetVendorId,
      actor.user.id,
    ],
  );

  // --- F10 loop (additive, best-effort, deterministic) -----------------------
  let scores_updated: CreateFeedbackResult["scores_updated"] = [];
  let playbook: PlaybookEligibility = {
    eligible: false,
    reason: "Feedback recorded.",
    avg_rating: null,
    responses: 0,
  };
  try {
    scores_updated = await recomputeScoresForEvent({
      id: ev.id,
      venue_id: ev.venue_id,
      planner_id: ev.planner_id,
      client_id: ev.client_id,
      organization_id: ev.organization_id,
    });
  } catch (err) {
    console.error("[F10] score recompute loop failed", err);
  }
  try {
    playbook = await playbookEligibilityForEvent(input.event_id);
  } catch (err) {
    console.error("[F10] playbook eligibility check failed", err);
  }

  return { feedback: row as EventFeedbackRow, scores_updated, playbook };
}

/** List feedback for an event (event-access scoped), newest first. */
export async function listFeedback(actor: Actor, eventId: string): Promise<EventFeedbackRow[]> {
  await getEvent(actor, eventId); // IDOR gate
  return q<EventFeedbackRow>(
    `select * from event_feedback where event_id = $1 order by created_at desc`,
    [eventId],
  );
}
