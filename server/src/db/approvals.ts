/**
 * Intelligence Moat - Feature 9: Approval Graph Engine data-access layer.
 *
 * Org / venue / event-scoped, IDOR-safe access over the tables created in
 * db/schema-im-approvals.sql:
 *   - approval_contacts   (list / create / delete, scoped to the actor's org
 *                          and/or a venue the actor's org owns)
 *   - approval_requests   (submit / decide / list-by-event / escalate-stalled)
 *
 * Authorization:
 *   - Contacts belong to an organization (org_id) and may be pinned to a venue
 *     (venue_id). A non-admin actor may only create/list/delete contacts for
 *     their OWN org, and any venue they pin must be a venue their org owns. A
 *     forged org_id or a venue from another tenant is rejected (ForbiddenError),
 *     never silently acted on.
 *   - Requests hang off an event. Read/submit/decide require the actor to be
 *     able to see the event (owning org, named client/planner, attached vendor,
 *     or admin) - the same visibility rule as server/src/db/events.ts.
 *
 * Routing + escalation logic lives in the pure helpers in lib/approvalGraph.ts.
 * Notifications are sent best-effort through lib/notify.ts (+ recipients.ts) and
 * never block or fail the request. Zero em dashes. Server imports .js.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  pickContactForType,
  buildEscalationCheck,
  isApprovalType,
  type ApprovalType,
  type ApprovalStatus,
} from "../lib/approvalGraph.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";

// ---- Row types --------------------------------------------------------------

export type ApprovalContactRow = {
  id: string;
  org_id: string | null;
  venue_id: string | null;
  approval_type: ApprovalType;
  name: string;
  email: string | null;
  role: string | null;
  created_at: string;
};

export type ApprovalRequestRow = {
  id: string;
  event_id: string | null;
  approval_type: ApprovalType;
  contact_id: string | null;
  subject: string | null;
  status: ApprovalStatus;
  submitted_at: string | null;
  decided_at: string | null;
  notes: string | null;
  escalated: boolean;
};

// ---- Authorization helpers --------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** The actor's org id, or throw Forbidden when they have no org (and are not admin). */
function requireOrg(actor: Actor): string {
  if (actor.org?.id) return actor.org.id;
  throw new ForbiddenError("an organization is required for this action");
}

/** Assert the actor's org owns this venue (or admin). Returns the owning org id. */
async function assertVenueAccess(actor: Actor, venueId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  if (isAdmin(actor)) return row.organization_id;
  if (!actor.org?.id || row.organization_id !== actor.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
  return row.organization_id;
}

/** True when the actor may see this event (owner org, client, planner, attached vendor, admin). */
async function actorCanSeeEvent(actor: Actor, eventId: string): Promise<boolean> {
  if (isAdmin(actor)) return true;
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
             where ev.event_id = e.id and ev.organization_id = $2
          )
        )
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

/** Load an event (for scoping) the actor can see, or throw NotFound/Forbidden. */
async function getVisibleEvent(
  actor: Actor,
  eventId: string,
): Promise<{ id: string; name: string; organization_id: string | null; venue_id: string | null }> {
  const ev = await q1<{
    id: string;
    name: string;
    organization_id: string | null;
    venue_id: string | null;
  }>(`select id, name, organization_id, venue_id from events where id = $1`, [eventId]);
  if (!ev) throw new NotFoundError("event not found");
  if (!(await actorCanSeeEvent(actor, eventId))) throw new ForbiddenError("no access to event");
  return ev;
}

// ============================================================================
// approval_contacts: list / create / delete
// ============================================================================

/**
 * List approval contacts the actor may manage. Admins see all; otherwise the
 * actor's org contacts. An optional venueId narrows to that venue's contacts
 * (plus org-wide ones with no venue), and is access-checked first.
 */
export async function listApprovalContacts(
  actor: Actor,
  opts: { venueId?: string | null } = {},
): Promise<ApprovalContactRow[]> {
  if (isAdmin(actor) && !opts.venueId) {
    return q<ApprovalContactRow>(
      `select * from approval_contacts order by approval_type asc, created_at desc limit 1000`,
    );
  }
  const orgId = isAdmin(actor) ? null : requireOrg(actor);
  if (opts.venueId) {
    await assertVenueAccess(actor, opts.venueId);
    return q<ApprovalContactRow>(
      `select * from approval_contacts
        where (venue_id = $1 or (venue_id is null and ($2::uuid is null or org_id = $2)))
        order by approval_type asc, created_at desc`,
      [opts.venueId, orgId],
    );
  }
  return q<ApprovalContactRow>(
    `select * from approval_contacts where org_id = $1 order by approval_type asc, created_at desc`,
    [orgId],
  );
}

export type CreateApprovalContactInput = {
  approval_type: string;
  name: string;
  email?: string | null;
  role?: string | null;
  venue_id?: string | null;
  /** Admins may target another org; non-admins are always pinned to their own. */
  org_id?: string | null;
};

/** Create an approval contact scoped to the actor's org (and optionally a venue). */
export async function createApprovalContact(
  actor: Actor,
  input: CreateApprovalContactInput,
): Promise<ApprovalContactRow> {
  if (!isApprovalType(input.approval_type)) {
    throw new ForbiddenError("invalid approval_type");
  }
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name is required");
  }

  // Resolve org scope: non-admins are forced onto their own org.
  let orgId: string | null;
  if (isAdmin(actor)) {
    orgId = input.org_id ?? actor.org?.id ?? null;
  } else {
    orgId = requireOrg(actor);
  }

  // If a venue is pinned, the actor's org must own it.
  if (input.venue_id) {
    await assertVenueAccess(actor, input.venue_id);
  }

  const row = await q1<ApprovalContactRow>(
    `insert into approval_contacts (org_id, venue_id, approval_type, name, email, role)
       values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [
      orgId,
      input.venue_id ?? null,
      input.approval_type,
      input.name.trim(),
      input.email ?? null,
      input.role ?? null,
    ],
  );
  return row as ApprovalContactRow;
}

/** Delete an approval contact the actor owns (their org, or admin). */
export async function deleteApprovalContact(actor: Actor, id: string): Promise<void> {
  const existing = await q1<ApprovalContactRow>(`select * from approval_contacts where id = $1`, [id]);
  if (!existing) throw new NotFoundError("contact not found");
  if (!isAdmin(actor)) {
    if (!actor.org?.id || existing.org_id !== actor.org.id) {
      throw new ForbiddenError("no access to this contact");
    }
  }
  await pool.query(`delete from approval_contacts where id = $1`, [id]);
}

// ============================================================================
// approval_requests: submit / decide / list-by-event / escalate
// ============================================================================

/** List approval requests for an event the actor can see, newest first. */
export async function listEventApprovals(
  actor: Actor,
  eventId: string,
): Promise<ApprovalRequestRow[]> {
  await getVisibleEvent(actor, eventId);
  return q<ApprovalRequestRow>(
    `select * from approval_requests where event_id = $1 order by submitted_at desc`,
    [eventId],
  );
}

/**
 * Candidate contacts that could own an approval of `type` for this event: the
 * event's venue contacts plus the event org's org-wide contacts. Used by
 * submitApproval to route to a contact deterministically.
 */
async function candidateContacts(
  eventOrgId: string | null,
  eventVenueId: string | null,
  type: ApprovalType,
): Promise<ApprovalContactRow[]> {
  return q<ApprovalContactRow>(
    `select * from approval_contacts
      where approval_type = $1
        and (
          ($2::uuid is not null and venue_id = $2)
          or ($3::uuid is not null and org_id = $3 and venue_id is null)
        )
      order by created_at desc`,
    [type, eventVenueId, eventOrgId],
  );
}

export type SubmitApprovalInput = {
  approval_type: string;
  subject?: string | null;
  notes?: string | null;
  /** Explicit contact; when omitted the engine routes by type. */
  contact_id?: string | null;
};

/**
 * Submit an approval request for an event. Routes to a contact: an explicit
 * contact_id is honored (and access-checked), otherwise lib/approvalGraph
 * pickContactForType chooses the most specific reachable owner from the event's
 * venue + org contacts. The chosen contact (if it has an email) is notified
 * best-effort via notify.ts. Returns the created request.
 */
export async function submitApproval(
  actor: Actor,
  eventId: string,
  input: SubmitApprovalInput,
): Promise<ApprovalRequestRow> {
  const ev = await getVisibleEvent(actor, eventId);
  if (!isApprovalType(input.approval_type)) throw new ForbiddenError("invalid approval_type");
  const type = input.approval_type as ApprovalType;

  // Resolve the routed contact.
  let contact: ApprovalContactRow | null = null;
  if (input.contact_id) {
    contact = await q1<ApprovalContactRow>(`select * from approval_contacts where id = $1`, [
      input.contact_id,
    ]);
    if (!contact) throw new NotFoundError("contact not found");
  } else {
    const candidates = await candidateContacts(ev.organization_id, ev.venue_id, type);
    contact = pickContactForType(candidates, type);
  }

  const row = await q1<ApprovalRequestRow>(
    `insert into approval_requests (event_id, approval_type, contact_id, subject, notes, status)
       values ($1,$2,$3,$4,$5,'submitted')
     returning *`,
    [eventId, type, contact?.id ?? null, input.subject ?? null, input.notes ?? null],
  );

  // Best-effort notification to the routed contact (direct email) and a fallback
  // ping to the event owners so the ask is visible even when no contact matched.
  await notifyApprovalSubmitted(ev.name, type, contact, eventId).catch(() => undefined);

  return row as ApprovalRequestRow;
}

export type DecideApprovalInput = {
  status: ApprovalStatus | string;
  notes?: string | null;
};

const DECISION_STATUSES = new Set<string>([
  "pending",
  "approved",
  "rejected",
  "requires_revision",
]);

/**
 * Record a decision on an approval request: set the status and stamp
 * decided_at for terminal/decision states. The actor must be able to see the
 * request's event. Notifies the event owners best-effort.
 */
export async function decideApproval(
  actor: Actor,
  id: string,
  input: DecideApprovalInput,
): Promise<ApprovalRequestRow> {
  const existing = await q1<ApprovalRequestRow>(`select * from approval_requests where id = $1`, [id]);
  if (!existing) throw new NotFoundError("approval request not found");
  if (!existing.event_id) throw new NotFoundError("approval request not linked to an event");
  const ev = await getVisibleEvent(actor, existing.event_id);

  if (!DECISION_STATUSES.has(String(input.status))) {
    throw new ForbiddenError("invalid decision status");
  }
  const status = input.status as ApprovalStatus;
  // "pending" means picked up but not decided; decided_at only stamps on a real
  // decision (approved / rejected / requires_revision).
  const stampDecided = status !== "pending";

  const row = await q1<ApprovalRequestRow>(
    `update approval_requests
        set status = $2,
            notes = coalesce($3, notes),
            decided_at = case when $4 then now() else decided_at end
      where id = $1
      returning *`,
    [id, status, input.notes ?? null, stampDecided],
  );

  await notifyApprovalDecision(ev.id, ev.name, existing.approval_type, status, actor).catch(
    () => undefined,
  );

  return row as ApprovalRequestRow;
}

/**
 * Escalate stalled approval requests for an event. Walks the event's open
 * requests, applies lib/approvalGraph buildEscalationCheck, marks the stalled
 * ones escalated, and notifies the event owners best-effort. Returns the
 * requests that were escalated this pass.
 */
export async function escalateStalled(
  actor: Actor,
  eventId: string,
  opts: { thresholdDays?: number } = {},
): Promise<ApprovalRequestRow[]> {
  const ev = await getVisibleEvent(actor, eventId);
  const threshold = typeof opts.thresholdDays === "number" ? opts.thresholdDays : 3;

  const open = await q<ApprovalRequestRow>(
    `select * from approval_requests
      where event_id = $1
        and decided_at is null
        and escalated = false
        and status in ('submitted','pending','requires_revision')`,
    [eventId],
  );

  const toEscalate = open.filter(
    (r) => buildEscalationCheck(r, threshold).shouldEscalate,
  );
  if (toEscalate.length === 0) return [];

  const ids = toEscalate.map((r) => r.id);
  const updated = await q<ApprovalRequestRow>(
    `update approval_requests set escalated = true where id = any($1::uuid[]) returning *`,
    [ids],
  );

  await notifyEscalation(ev.id, ev.name, updated.length, actor).catch(() => undefined);

  return updated;
}

// ---- Notification helpers (best-effort, never throw) ------------------------

/** Notify the routed contact and event owners that an approval was submitted. */
async function notifyApprovalSubmitted(
  eventName: string,
  type: ApprovalType,
  contact: ApprovalContactRow | null,
  eventId: string,
): Promise<void> {
  const subject = `${type} approval requested for ${eventName}`;
  const direct =
    contact?.email && contact.email.trim() ? [contact.email.trim().toLowerCase()] : [];
  const owners = await recipients.eventOwnerEmails(eventId).catch(() => [] as string[]);
  const to = Array.from(new Set([...direct, ...owners]));
  if (!to.length) return;
  await notify.bidPosted(to, eventName, {
    eventId,
    approvalType: type,
    message: subject,
  });
}

/** Notify the event owners of a decision (excluding the deciding actor). */
async function notifyApprovalDecision(
  eventId: string,
  eventName: string,
  type: ApprovalType,
  status: ApprovalStatus,
  actor: Actor,
): Promise<void> {
  const owners = await recipients.eventOwnerEmails(eventId).catch(() => [] as string[]);
  const to = recipients.excluding(owners, actor.user.email);
  if (!to.length) return;
  await notify.quoteDecision(to, `${type} ${status}`, {
    eventId,
    approvalType: type,
    status,
    message: `The ${type} approval for ${eventName} is now ${status}.`,
  });
}

/** Notify the event owners that stalled approvals were escalated. */
async function notifyEscalation(
  eventId: string,
  eventName: string,
  count: number,
  actor: Actor,
): Promise<void> {
  const owners = await recipients.eventOwnerEmails(eventId).catch(() => [] as string[]);
  const to = recipients.excluding(owners, actor.user.email);
  if (!to.length) return;
  await notify.eventStatusChanged(to, eventName, "approval escalated", {
    eventId,
    escalatedCount: count,
    message: `${count} approval request(s) for ${eventName} stalled and were escalated.`,
  });
}
