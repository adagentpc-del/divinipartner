/**
 * Phase 3 - Events data-access layer (Event Workspace).
 *
 * Org-scoped CRUD over the `events` table from db/schema.sql plus event-vendor
 * association (stored in event_vendors, see db/schema-phase3.sql). Every read
 * is scoped to the acting org: a user sees an event when their org is the
 * owning organization, or they are the named client or planner, or their org
 * is attached to the event as a vendor. Writes require ownership (org match,
 * planner, or super_admin).
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { buildItinerary } from "./itinerary.js";
import { upsertEventMember, getEventRole } from "./eventMembers.js";
import { recordFieldChanges, recordEventChange, type ChangeCategory } from "./eventChanges.js";
import { logAction } from "../lib/audit.js";

// ---- Status model (blueprint section 13) -----------------------------------
export type EventStatus =
  | "inquiry"
  | "venue_reviewing"
  | "venue_hold"
  | "vendor_bidding"
  | "quotes_received"
  | "vendor_selected"
  | "deposit_due"
  | "in_production"
  | "install_scheduled"
  | "itinerary_confirmed"
  | "event_day"
  | "completed"
  | "closed"
  | "archived";

/** Ordered list with human labels (display order matches the lifecycle). */
export const EVENT_STATUSES: { key: EventStatus; label: string }[] = [
  { key: "inquiry", label: "Inquiry" },
  { key: "venue_reviewing", label: "Venue reviewing" },
  { key: "venue_hold", label: "Venue hold placed" },
  { key: "vendor_bidding", label: "Vendor bidding" },
  { key: "quotes_received", label: "Quotes received" },
  { key: "vendor_selected", label: "Vendor selected" },
  { key: "deposit_due", label: "Deposit due" },
  { key: "in_production", label: "In production" },
  { key: "install_scheduled", label: "Install scheduled" },
  { key: "itinerary_confirmed", label: "Itinerary confirmed" },
  { key: "event_day", label: "Event day active" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
];

const STATUS_KEYS = new Set<string>(EVENT_STATUSES.map((s) => s.key));
export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}

export type EventRow = {
  id: string;
  name: string;
  type: string | null;
  client_id: string | null;
  planner_id: string | null;
  venue_id: string | null;
  organization_id: string | null;
  date_time: string | null;
  guest_count: number | null;
  budget: string | null;
  event_goals: string | null;
  required_services: string[] | null;
  branding_opportunity_id: string | null;
  status: EventStatus | null;
  itinerary: unknown;
  /** Host opt-in: automatically email guests the /agenda/:id link before the event. */
  notify_guests_schedule: boolean;
  // ---- Shared Authoritative Event Record (Phase A item 4) ------------------
  // Timing beyond the single date_time "start". end_at, together with
  // date_time, is what makes a multi-day event representable.
  load_in_at: string | null;
  setup_at: string | null;
  rehearsal_at: string | null;
  vendor_call_at: string | null;
  doors_at: string | null;
  end_at: string | null;
  strike_at: string | null;
  // Per-event venue booking detail (venues table stays the venue's general profile).
  venue_space: string | null;
  venue_notes: string | null;
  // Structured attendance breakdown, additive alongside the legacy guest_count.
  // attendance_final deliberately does not exist here -- Phase A item 6 (Final
  // Count Workflow) owns that value and versions it instead of a plain column.
  attendance_estimated: number | null;
  attendance_invited: number | null;
  attendance_rsvp_yes: number | null;
  attendance_confirmed: number | null;
  attendance_guaranteed: number | null;
  attendance_vip: number | null;
  attendance_staff: number | null;
  attendance_vendor_staff: number | null;
  // Configurable due date for the Final Count Workflow (Phase A item 6). The
  // count values themselves live in event_final_counts, versioned.
  final_count_due_at: string | null;
  // Final Event Schedule data-model completion: timezone (IANA zone name)
  // and structured venue logistics / emergency contact, previously nowhere
  // (or only findable inside freeform venue_notes).
  timezone: string | null;
  venue_access_time: string | null;
  venue_parking_info: string | null;
  venue_loading_dock: string | null;
  venue_vendor_entrance: string | null;
  venue_guest_entrance: string | null;
  venue_restrictions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  // Run of Show finalization (completion phase, Part 15). Owned by
  // db/itinerary.ts's approveItinerary()/revertItineraryToDraft(), never
  // set through the generic updateEvent() patch path -- a distinct
  // workflow action, same pattern as executionPacket.ts's markPacketFinal.
  itinerary_status: "draft" | "approved";
  itinerary_approved_at: string | null;
  itinerary_approved_by: string | null;
  created_at: string;
  updated_at: string;
};

/** True when the actor may see this event (owner org, client, planner, attached
 *  vendor org, or an active per-human event_members row -- Phase A item 2).
 *  ev.status <> 'declined': a losing bidder's self-attach row from
 *  db/quotes.ts::createQuote is demoted to 'declined' once its bid is
 *  awarded to someone else (db/awards.ts::awardQuote) -- that org must lose
 *  event access at that point, not retain it forever via this fallback. */
export async function actorCanSee(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok
       from events e
      where e.id = $1
        and (
          ($2::uuid is not null and e.organization_id = $2)
          or e.client_id = $3
          or e.planner_id = $3
          or exists (
            select 1 from event_vendors ev
             where ev.event_id = e.id and ev.organization_id = $2 and ev.status <> 'declined'
          )
          or exists (
            select 1 from event_members em
             where em.event_id = e.id and em.user_id = $3 and em.status = 'active'
          )
        )
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

/** List the events the actor can access, newest first. */
export async function listMyEvents(actor: Actor): Promise<EventRow[]> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") {
    return q<EventRow>(`select * from events order by created_at desc limit 500`);
  }
  return q<EventRow>(
    `select distinct e.*
       from events e
       left join event_vendors ev on ev.event_id = e.id
       left join event_members em on em.event_id = e.id and em.user_id = $2 and em.status = 'active'
      where ($1::uuid is not null and e.organization_id = $1)
         or e.client_id = $2
         or e.planner_id = $2
         or ($1::uuid is not null and ev.organization_id = $1)
         or em.id is not null
      order by e.created_at desc
      limit 500`,
    [actor.org?.id ?? null, actor.user.id],
  );
}

/** Count of the org's non-archived events, for the entitlements "events.active"
 *  limit (client/planner plans). Archived events never count against it. */
export async function countActiveEvents(orgId: string): Promise<number> {
  const row = await q1<{ n: string }>(
    `select count(*)::int as n from events where organization_id = $1 and status <> 'archived'`,
    [orgId],
  );
  return Number(row?.n ?? 0);
}

/** Get a single event the actor can access, or throw NotFound/Forbidden. */
export async function getEvent(actor: Actor, id: string): Promise<EventRow> {
  const ev = await q1<EventRow>(`select * from events where id = $1`, [id]);
  if (!ev) throw new NotFoundError("event not found");
  if (!(await actorCanSee(actor, id))) throw new ForbiddenError("no access to event");
  return ev;
}

export type CreateEventInput = {
  name: string;
  type?: string | null;
  date_time?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  event_goals?: string | null;
  required_services?: string[] | null;
  venue_id?: string | null;
  branding_opportunity_id?: string | null;
  notify_guests_schedule?: boolean | null;
  load_in_at?: string | null;
  setup_at?: string | null;
  rehearsal_at?: string | null;
  vendor_call_at?: string | null;
  doors_at?: string | null;
  end_at?: string | null;
  strike_at?: string | null;
  venue_space?: string | null;
  venue_notes?: string | null;
  attendance_estimated?: number | null;
  attendance_invited?: number | null;
  attendance_rsvp_yes?: number | null;
  attendance_confirmed?: number | null;
  attendance_guaranteed?: number | null;
  attendance_vip?: number | null;
  attendance_staff?: number | null;
  attendance_vendor_staff?: number | null;
  final_count_due_at?: string | null;
  timezone?: string | null;
  venue_access_time?: string | null;
  venue_parking_info?: string | null;
  venue_loading_dock?: string | null;
  venue_vendor_entrance?: string | null;
  venue_guest_entrance?: string | null;
  venue_restrictions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

/** Create an event owned by the actor's org; the actor is client or planner by role. */
export async function createEvent(actor: Actor, input: CreateEventInput): Promise<EventRow> {
  const isPlanner = actor.user.role === "planner";
  const row = await q1<EventRow>(
    `insert into events
       (name, type, client_id, planner_id, venue_id, organization_id,
        date_time, guest_count, budget, event_goals, required_services,
        branding_opportunity_id, status,
        load_in_at, setup_at, rehearsal_at, vendor_call_at, doors_at, end_at, strike_at,
        venue_space, venue_notes,
        attendance_estimated, attendance_invited, attendance_rsvp_yes, attendance_confirmed,
        attendance_guaranteed, attendance_vip, attendance_staff, attendance_vendor_staff,
        final_count_due_at,
        timezone, venue_access_time, venue_parking_info, venue_loading_dock,
        venue_vendor_entrance, venue_guest_entrance, venue_restrictions,
        emergency_contact_name, emergency_contact_phone)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inquiry',
             $13,$14,$15,$16,$17,$18,$19,
             $20,$21,
             $22,$23,$24,$25,$26,$27,$28,$29,
             $30,
             $31,$32,$33,$34,$35,$36,$37,$38,$39)
     returning *`,
    [
      input.name,
      input.type ?? null,
      isPlanner ? null : actor.user.id,
      isPlanner ? actor.user.id : null,
      input.venue_id ?? null,
      actor.org?.id ?? null,
      input.date_time ?? null,
      input.guest_count ?? null,
      input.budget ?? null,
      input.event_goals ?? null,
      input.required_services ?? null,
      input.branding_opportunity_id ?? null,
      input.load_in_at ?? null,
      input.setup_at ?? null,
      input.rehearsal_at ?? null,
      input.vendor_call_at ?? null,
      input.doors_at ?? null,
      input.end_at ?? null,
      input.strike_at ?? null,
      input.venue_space ?? null,
      input.venue_notes ?? null,
      input.attendance_estimated ?? null,
      input.attendance_invited ?? null,
      input.attendance_rsvp_yes ?? null,
      input.attendance_confirmed ?? null,
      input.attendance_guaranteed ?? null,
      input.attendance_vip ?? null,
      input.attendance_staff ?? null,
      input.attendance_vendor_staff ?? null,
      input.final_count_due_at ?? null,
      input.timezone ?? null,
      input.venue_access_time ?? null,
      input.venue_parking_info ?? null,
      input.venue_loading_dock ?? null,
      input.venue_vendor_entrance ?? null,
      input.venue_guest_entrance ?? null,
      input.venue_restrictions ?? null,
      input.emergency_contact_name ?? null,
      input.emergency_contact_phone ?? null,
    ],
  );
  const ev = row as EventRow;
  // Seed the creator's own roster row (event_members, Phase A item 2) so the
  // membership list is complete from the start. Best-effort: getEventRole
  // already resolves the owner correctly via actorOwns regardless of this
  // row's presence, so a failure here never breaks event creation or access.
  await upsertEventMember({
    event_id: ev.id,
    user_id: actor.user.id,
    organization_id: actor.org?.id ?? null,
    role: "event_owner",
    status: "active",
  }).catch(() => undefined);
  return ev;
}

/** True when the actor owns the event (org match, named planner/client, or admin). */
export async function actorOwns(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and (($2::uuid is not null and organization_id = $2)
             or client_id = $3 or planner_id = $3)
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

/**
 * True when the actor may operationally manage this event: the owner, or an
 * event_members row with the 'planner' role (Phase A item 3 -- Event-Level
 * RBAC). This is intentionally broader than actorOwns (which stays a strict
 * "is this literally the owner" check used elsewhere, e.g. quotes.ts's
 * ownership-side branch) so a Planner/Event Manager invited onto the event
 * can run it day-to-day without being the owning org, named client, or the
 * single legacy events.planner_id.
 */
export async function canManageEvent(actor: Actor, eventId: string): Promise<boolean> {
  if (await actorOwns(actor, eventId)) return true;
  return (await getEventRole(actor, eventId)) === "planner";
}

export type UpdateEventInput = Partial<CreateEventInput>;

const SCHEDULE_FIELDS = new Set([
  "name", "type", "date_time", "end_at", "load_in_at", "setup_at",
  "rehearsal_at", "vendor_call_at", "doors_at", "strike_at",
]);
const VENUE_FIELDS = new Set([
  "venue_id", "venue_space", "venue_notes", "venue_access_time", "venue_parking_info",
  "venue_loading_dock", "venue_vendor_entrance", "venue_guest_entrance", "venue_restrictions",
  "emergency_contact_name", "emergency_contact_phone", "timezone",
]);
const ATTENDANCE_FIELDS = new Set([
  "guest_count", "attendance_estimated", "attendance_invited", "attendance_rsvp_yes",
  "attendance_confirmed", "attendance_guaranteed", "attendance_vip", "attendance_staff",
  "attendance_vendor_staff",
]);
const REQUIRES_ACK_FIELDS = new Set(["date_time", "end_at", "budget", "venue_id", "final_count_due_at"]);

/** Category a changed events-table field belongs to, for event_changes (Phase A item 5). */
function categoryForField(field: string): ChangeCategory {
  if (SCHEDULE_FIELDS.has(field)) return "schedule";
  if (VENUE_FIELDS.has(field)) return "venue";
  if (ATTENDANCE_FIELDS.has(field)) return "attendance";
  if (field === "budget") return "budget";
  return "planning";
}

/** Patch core event fields (owner or planner-role member). */
export async function updateEvent(
  actor: Actor,
  id: string,
  patch: UpdateEventInput,
): Promise<EventRow> {
  const before = await getEvent(actor, id);
  if (!(await canManageEvent(actor, id))) throw new ForbiddenError("only the event owner can edit");
  const row = await q1<EventRow>(
    `update events set
        name = coalesce($2, name),
        type = coalesce($3, type),
        date_time = coalesce($4, date_time),
        guest_count = coalesce($5, guest_count),
        budget = coalesce($6, budget),
        event_goals = coalesce($7, event_goals),
        required_services = coalesce($8, required_services),
        venue_id = coalesce($9, venue_id),
        notify_guests_schedule = coalesce($10, notify_guests_schedule),
        load_in_at = coalesce($11, load_in_at),
        setup_at = coalesce($12, setup_at),
        rehearsal_at = coalesce($13, rehearsal_at),
        vendor_call_at = coalesce($14, vendor_call_at),
        doors_at = coalesce($15, doors_at),
        end_at = coalesce($16, end_at),
        strike_at = coalesce($17, strike_at),
        venue_space = coalesce($18, venue_space),
        venue_notes = coalesce($19, venue_notes),
        attendance_estimated = coalesce($20, attendance_estimated),
        attendance_invited = coalesce($21, attendance_invited),
        attendance_rsvp_yes = coalesce($22, attendance_rsvp_yes),
        attendance_confirmed = coalesce($23, attendance_confirmed),
        attendance_guaranteed = coalesce($24, attendance_guaranteed),
        attendance_vip = coalesce($25, attendance_vip),
        attendance_staff = coalesce($26, attendance_staff),
        attendance_vendor_staff = coalesce($27, attendance_vendor_staff),
        final_count_due_at = coalesce($28, final_count_due_at),
        timezone = coalesce($29, timezone),
        venue_access_time = coalesce($30, venue_access_time),
        venue_parking_info = coalesce($31, venue_parking_info),
        venue_loading_dock = coalesce($32, venue_loading_dock),
        venue_vendor_entrance = coalesce($33, venue_vendor_entrance),
        venue_guest_entrance = coalesce($34, venue_guest_entrance),
        venue_restrictions = coalesce($35, venue_restrictions),
        emergency_contact_name = coalesce($36, emergency_contact_name),
        emergency_contact_phone = coalesce($37, emergency_contact_phone),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.type ?? null,
      patch.date_time ?? null,
      patch.guest_count ?? null,
      patch.budget ?? null,
      patch.event_goals ?? null,
      patch.required_services ?? null,
      patch.venue_id ?? null,
      patch.notify_guests_schedule ?? null,
      patch.load_in_at ?? null,
      patch.setup_at ?? null,
      patch.rehearsal_at ?? null,
      patch.vendor_call_at ?? null,
      patch.doors_at ?? null,
      patch.end_at ?? null,
      patch.strike_at ?? null,
      patch.venue_space ?? null,
      patch.venue_notes ?? null,
      patch.attendance_estimated ?? null,
      patch.attendance_invited ?? null,
      patch.attendance_rsvp_yes ?? null,
      patch.attendance_confirmed ?? null,
      patch.attendance_guaranteed ?? null,
      patch.attendance_vip ?? null,
      patch.attendance_staff ?? null,
      patch.attendance_vendor_staff ?? null,
      patch.final_count_due_at ?? null,
      patch.timezone ?? null,
      patch.venue_access_time ?? null,
      patch.venue_parking_info ?? null,
      patch.venue_loading_dock ?? null,
      patch.venue_vendor_entrance ?? null,
      patch.venue_guest_entrance ?? null,
      patch.venue_restrictions ?? null,
      patch.emergency_contact_name ?? null,
      patch.emergency_contact_phone ?? null,
    ],
  );
  const after = row as EventRow;
  // Change tracking + propagation (Phase A item 5). Only fields actually
  // present in the patch are diffed, so an untouched field never generates a
  // spurious change row. Best-effort: recordFieldChanges swallows its own
  // per-field failures, and a change-log failure must never undo an already-
  // committed event update.
  const patchedFields = Object.keys(patch).filter((k) => k in after);
  if (patchedFields.length) {
    const beforeSlice: Record<string, unknown> = {};
    const afterSlice: Record<string, unknown> = {};
    for (const f of patchedFields) {
      beforeSlice[f] = (before as unknown as Record<string, unknown>)[f];
      afterSlice[f] = (after as unknown as Record<string, unknown>)[f];
    }
    await recordFieldChanges(actor, id, beforeSlice, afterSlice, categoryForField, {
      requiresAckFields: REQUIRES_ACK_FIELDS,
    }).catch(() => undefined);
  }
  // A date_time change starts a new Execution Packet distribution cycle:
  // clear distributed_at so the scheduled distribution job (Final Event
  // Schedule completion phase Part 8) sends again for the new date instead
  // of staying silently suppressed by a "already sent" flag stamped against
  // the old date. Best-effort, no-op when distribution was never configured.
  if ("date_time" in patch && before.date_time !== after.date_time) {
    await pool
      .query(
        `update event_packet_distribution_settings set distributed_at = null, updated_at = now()
          where event_id = $1`,
        [id],
      )
      .catch(() => undefined);
  }
  // Event Change -> Packet Invalidation (completion phase, Part 18): if an
  // Execution Packet was already issued for this event, source-of-truth
  // fields (date/time, venue, key location, status) changing underneath it
  // must not leave that packet silently looking current. Dynamic import to
  // avoid a static circular import (packetInvalidation.ts imports FROM
  // executionPacket.ts, which imports FROM this module).
  if (patchedFields.length) {
    const { checkAndMarkPacketStale } = await import("./packetInvalidation.js");
    await checkAndMarkPacketStale(id);
  }
  return after;
}

/**
 * Move an event to a new lifecycle status (owner or planner-role member).
 *
 * Starting the event (Part 4 of the live-ops phase, 2026-08-09) is the one
 * transition in this lifecycle with a real operational consequence if the
 * event genuinely is not ready, so a transition INTO 'event_day' is gated
 * by the same readiness engine (db/readiness.ts) the Readiness UI already
 * shows -- never a second, looser check. This gate lives here, in the one
 * function every status-change path (the generic /status route and the
 * dedicated /start route) already calls, so there is no way to reach
 * 'event_day' without passing through it. An owner/planner may still
 * proceed with an explicit override; that override is always audited
 * (audit_logs: who, when, which blockers were live at the time).
 */
export async function setEventStatus(
  actor: Actor,
  id: string,
  status: EventStatus,
  opts: { override?: boolean } = {},
): Promise<EventRow> {
  const before = await getEvent(actor, id);
  if (!(await canManageEvent(actor, id))) throw new ForbiddenError("only the event owner can transition status");
  if (!isEventStatus(status)) throw new ForbiddenError("invalid status");

  let readinessAtStart: { state: string; blocking_count: number } | null = null;
  let overrodeReadiness = false;
  if (status === "event_day" && before.status !== "event_day") {
    const { computeReadiness, ReadinessBlockedError } = await import("./readiness.js");
    const readiness = await computeReadiness(actor, id);
    readinessAtStart = { state: readiness.state, blocking_count: readiness.blocking.length };
    if (readiness.blocking.length > 0) {
      if (!opts.override) throw new ReadinessBlockedError(readiness);
      overrodeReadiness = true;
    }
  }

  // Closing transition (Part 25 of the live-ops phase): the other end of
  // the lifecycle from Start Event, gated on the SAME audited-override
  // pattern via db/closeout.ts's computeCloseoutReadiness (all vendors
  // marked complete, no open high-priority incidents).
  let closeoutAtClose: { state: string; blocking_count: number } | null = null;
  let overrodeCloseout = false;
  if (status === "completed" && before.status === "event_day") {
    const { computeCloseoutReadiness, CloseoutBlockedError } = await import("./closeout.js");
    const closeout = await computeCloseoutReadiness(actor, id);
    closeoutAtClose = { state: closeout.state, blocking_count: closeout.blocking.length };
    if (closeout.blocking.length > 0) {
      if (!opts.override) throw new CloseoutBlockedError(closeout);
      overrodeCloseout = true;
    }
  }

  // Completion gate (Part 31 of the live-ops phase): the completed ->
  // closed transition is gated on the event having an event_settlements
  // record (db/reconciliation.ts's markEventSettled). Deliberately scoped
  // to ONLY this exact transition (completed -> closed), never a blanket
  // rule on every event reaching 'closed' -- most events in this app never
  // enter the live-ops reconciliation flow at all, and a broader gate
  // would regress those.
  let overrodeSettlement = false;
  if (status === "closed" && before.status === "completed") {
    const { isEventSettled, NotSettledError } = await import("./reconciliation.js");
    const settled = await isEventSettled(id);
    if (!settled) {
      if (!opts.override) throw new NotSettledError();
      overrodeSettlement = true;
    }
  }

  const row = await q1<EventRow>(
    `update events set status = $2, updated_at = now() where id = $1 returning *`,
    [id, status],
  );
  const after = row as EventRow;
  // Change tracking + propagation (Phase A item 5). A status transition is
  // the highest-visibility change an event has, so it always requires
  // acknowledgment and always reaches every active member (affected_scopes
  // omitted -- see recordEventChange).
  if (before.status !== after.status) {
    await recordEventChange(actor, id, {
      category: "status",
      field: "status",
      old_value: before.status,
      new_value: after.status,
      requires_acknowledgment: true,
    }).catch(() => undefined);
  }
  if (readinessAtStart) {
    await logAction(
      actor,
      overrodeReadiness ? "event.started_with_readiness_override" : "event.started",
      "event",
      id,
      { status: before.status, readiness: readinessAtStart },
      { status: after.status },
      {
        summary: overrodeReadiness
          ? `Started event with ${readinessAtStart.blocking_count} blocking readiness issue(s) overridden`
          : "Started event",
      },
    ).catch(() => undefined);
  }
  if (closeoutAtClose) {
    await logAction(
      actor,
      overrodeCloseout ? "event.closed_with_closeout_override" : "event.closed",
      "event",
      id,
      { status: before.status, closeout: closeoutAtClose },
      { status: after.status },
      {
        summary: overrodeCloseout
          ? `Closed event with ${closeoutAtClose.blocking_count} blocking closeout issue(s) overridden`
          : "Closed event",
      },
    ).catch(() => undefined);
  }
  if (overrodeSettlement) {
    await logAction(
      actor,
      "event.closed_with_settlement_override",
      "event",
      id,
      { status: before.status },
      { status: after.status },
      { summary: "Closed event without a completed financial settlement (overridden)" },
    ).catch(() => undefined);
  }
  if (before.status !== after.status) {
    const { recordActivity } = await import("./eventActivity.js");
    await recordActivity(actor, id, {
      category: "status",
      message: `Event status changed: ${before.status ?? "unknown"} -> ${after.status ?? "unknown"}`,
      relatedEntityType: "event",
      relatedEntityId: id,
    });
  }
  return after;
}

/**
 * Duplicate / rebook an event (live-ops phase, Part 39, 2026-08-09). For a
 * repeat booking with the same or a similar client -- start a fresh event
 * pre-filled with the source's reusable config, never its stale or
 * event-specific data.
 *
 * Reuses db/tours.ts's copyEventConfig() (already built for tour stops)
 * for the reusable public config -- landing settings, ticket tiers, public
 * agenda items, floorplans, exhibitor packages, booths -- rather than a
 * second, divergent copy routine. Reuses db/tasks.ts's seedWorkflow()
 * for the standard task checklist rather than copying the source's old
 * task rows, whose statuses/due dates are meaningless for a new date.
 *
 * Deliberately NEVER copied: date_time/load_in_at/.../strike_at (every
 * timing field -- always null on the new event until re-entered), status
 * (createEvent always starts a new event at 'inquiry'), guests, invoices,
 * payments, quotes, bids, or any other financial/attendee-specific
 * record. event_vendors is copy-on-request only ("same team" is a real
 * assumption but not always true -- vendor availability may differ for
 * the new date), never automatic.
 */
export type DuplicateEventInput = {
  name?: string | null;
  date_time?: string | null;
  include_vendors?: boolean;
  seed_workflow?: boolean;
};

export async function duplicateEvent(
  actor: Actor,
  sourceEventId: string,
  input: DuplicateEventInput = {},
): Promise<EventRow> {
  const source = await getEvent(actor, sourceEventId);
  if (!(await canManageEvent(actor, sourceEventId))) {
    throw new ForbiddenError("only the source event's owner or planner can duplicate it");
  }

  const newEvent = await createEvent(actor, {
    name: input.name?.trim() || `${source.name} (Copy)`,
    type: source.type,
    date_time: input.date_time ?? null,
    guest_count: source.guest_count,
    budget: source.budget != null ? Number(source.budget) : null,
    event_goals: source.event_goals,
    required_services: source.required_services,
    venue_id: source.venue_id,
    venue_space: source.venue_space,
    venue_notes: source.venue_notes,
    attendance_estimated: source.attendance_estimated,
    timezone: source.timezone,
    venue_access_time: source.venue_access_time,
    venue_parking_info: source.venue_parking_info,
    venue_loading_dock: source.venue_loading_dock,
    venue_vendor_entrance: source.venue_vendor_entrance,
    venue_guest_entrance: source.venue_guest_entrance,
    venue_restrictions: source.venue_restrictions,
    emergency_contact_name: source.emergency_contact_name,
    emergency_contact_phone: source.emergency_contact_phone,
  });

  const { copyEventConfig } = await import("./tours.js");
  await copyEventConfig(actor, sourceEventId, newEvent.id);

  if (input.include_vendors) {
    await q(
      `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
       select $2, organization_id, vendor_id, role, 'added'
         from event_vendors where event_id = $1`,
      [sourceEventId, newEvent.id],
    );
  }

  if (input.seed_workflow !== false) {
    const { seedWorkflow } = await import("./tasks.js");
    await seedWorkflow(actor, newEvent.id);
  }

  const { recordActivity } = await import("./eventActivity.js");
  await recordActivity(actor, newEvent.id, {
    category: "status",
    message: `Event duplicated from "${source.name}"`,
    relatedEntityType: "event",
    relatedEntityId: sourceEventId,
  });

  return newEvent;
}

export type EventVendorRow = {
  id: string;
  event_id: string;
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  created_at: string;
  vendor_name: string;
};

/** List vendors attached to an event. */
export async function listEventVendors(actor: Actor, eventId: string): Promise<EventVendorRow[]> {
  await getEvent(actor, eventId);
  // Additive, read-only LEFT JOIN to surface a human display name for each
  // attached vendor. The vendors table has no name of its own, so the name
  // source is the organization name (coalesced to 'Vendor' when missing).
  return q<EventVendorRow>(
    `select ev.*,
            coalesce(o.name, 'Vendor') as vendor_name
       from event_vendors ev
       left join organizations o on o.id = ev.organization_id
      where ev.event_id = $1
      order by ev.created_at asc`,
    [eventId],
  );
}

/** Attach a vendor org to an event (owner or planner-role member). Idempotent per (event, org). */
export async function addEventVendor(
  actor: Actor,
  eventId: string,
  input: { organization_id: string; vendor_id?: string | null; role?: string | null },
): Promise<EventVendorRow> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) throw new ForbiddenError("only the event owner can add vendors");
  const row = await q1<EventVendorRow>(
    `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
       values ($1,$2,$3,$4,'added')
     on conflict (event_id, organization_id) do update set
        vendor_id = coalesce(excluded.vendor_id, event_vendors.vendor_id),
        role = coalesce(excluded.role, event_vendors.role)
     returning *`,
    [eventId, input.organization_id, input.vendor_id ?? null, input.role ?? null],
  );
  return row as EventVendorRow;
}

/** Detach a vendor org from an event (owner or planner-role member). */
export async function removeEventVendor(
  actor: Actor,
  eventId: string,
  eventVendorId: string,
): Promise<void> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) throw new ForbiddenError("only the event owner can remove vendors");
  await pool.query(`delete from event_vendors where id = $1 and event_id = $2`, [
    eventVendorId,
    eventId,
  ]);
}

/**
 * Build a vendor-ready "bid package" from the event's own data. No fabrication:
 * every field is derived from stored columns; absent data is reported as such.
 */
export async function buildBidPackage(actor: Actor, eventId: string) {
  const ev = await getEvent(actor, eventId);
  const venue = ev.venue_id
    ? await q1<{ name: string; city: string | null; region: string | null; capacity: number | null }>(
        `select name, city, region, capacity from venues where id = $1`,
        [ev.venue_id],
      )
    : null;
  const required = ev.required_services ?? [];
  return {
    generated_at: new Date().toISOString(),
    source: "event-record",
    event: {
      id: ev.id,
      name: ev.name,
      type: ev.type,
      date_time: ev.date_time,
      guest_count: ev.guest_count,
      budget: ev.budget,
      status: ev.status,
    },
    venue: venue
      ? { name: venue.name, city: venue.city, region: venue.region, capacity: venue.capacity }
      : { note: "No venue selected yet." },
    scope: {
      goals: ev.event_goals ?? null,
      required_services: required,
      services_count: required.length,
    },
    notes:
      "This package is assembled from the event record only. Vendors should confirm details before quoting.",
  };
}

// ============================================================================
// ICS CALENDAR EXPORT (fully local string generation, no external API)
// ============================================================================

/** Fold an ICS content line to the 75-octet limit per RFC 5545 (3.1). */
function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return out.join("\r\n");
}

/** Escape a value for an ICS text property (RFC 5545 3.3.11). */
function icsText(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format an ISO timestamp as a UTC ICS date-time (YYYYMMDDTHHMMSSZ). */
function icsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Stable, calendar-safe slug for a UID seed. */
function slug(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "item";
}

/**
 * Build a valid text/calendar (.ics) document for an event from stored data
 * only: a VEVENT for the event itself plus VEVENTs for the key itinerary
 * milestones (load-in, program start/end, payment deadlines, etc). Pure string
 * generation, no library and no third-party calendar API.
 */
export async function buildEventIcs(
  actor: Actor,
  eventId: string,
): Promise<{ filename: string; ics: string }> {
  const ev = await getEvent(actor, eventId);
  const itinerary = await buildItinerary(actor, eventId);

  const stamp = icsDate(new Date().toISOString()) ?? "19700101T000000Z";
  const domain = "divinipartners.com";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Divini Partners//Event Day//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(ev.name)}`,
  ];

  const pushEvent = (opts: {
    uid: string;
    start: string | null;
    end: string | null;
    summary: string;
    description?: string | null;
    location?: string | null;
  }) => {
    const dtStart = icsDate(opts.start);
    if (!dtStart) return; // skip milestones with no usable time
    const dtEnd = icsDate(opts.end) ?? dtStart;
    lines.push("BEGIN:VEVENT");
    lines.push(icsFold(`UID:${opts.uid}@${domain}`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(icsFold(`SUMMARY:${icsText(opts.summary)}`));
    if (opts.description) lines.push(icsFold(`DESCRIPTION:${icsText(opts.description)}`));
    if (opts.location) lines.push(icsFold(`LOCATION:${icsText(opts.location)}`));
    lines.push("END:VEVENT");
  };

  // The event itself (anchor VEVENT).
  const eventLocation =
    itinerary.items.find((i) => i.location)?.location ?? null;
  pushEvent({
    uid: `event-${slug(ev.id)}`,
    start: ev.date_time,
    end: itinerary.items.find((i) => i.key === "auto_program")?.end_time ?? ev.date_time,
    summary: ev.name,
    description: ev.event_goals ? `Goals: ${ev.event_goals}` : "Event day",
    location: eventLocation,
  });

  // Key itinerary milestones (load-in, program, payment deadlines, etc).
  for (const item of itinerary.items) {
    if (!item.start_time) continue;
    if (item.key === "auto_doors") continue; // overlaps the anchor event start
    pushEvent({
      uid: `${slug(ev.id)}-${slug(item.key)}`,
      start: item.start_time,
      end: item.end_time,
      summary: item.title,
      description: item.description,
      location: item.location,
    });
  }

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n") + "\r\n";
  const filename = `${slug(ev.name) || "event"}.ics`;
  return { filename, ics };
}
