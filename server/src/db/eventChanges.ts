/**
 * Event Change Architecture / Propagation (Divini Partners 63-section Event
 * Operations spec, Phase A item 5, 2026-08-09).
 *
 * recordEventChange is the single write path: callers (events.ts's
 * updateEvent/setEventStatus) hand it a category/field/old/new value and it
 * inserts the change row, resolves which active event_members it affects
 * (either an explicit set of roles or every active member), creates one
 * acknowledgment row per affected member, and best-effort notifies them.
 * Propagation never reaches anyone outside the event's own roster.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { sendEmail } from "../lib/email.js";
import type { EventRole } from "../lib/eventRoles.js";

export type ChangeCategory =
  | "schedule"
  | "venue"
  | "attendance"
  | "budget"
  | "planning"
  | "vendor"
  | "status"
  | "other";

export type EventChangeRow = {
  id: string;
  event_id: string;
  category: ChangeCategory;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  reason: string | null;
  affected_scopes: EventRole[] | null;
  requires_acknowledgment: boolean;
  financial_impact: string | null;
  created_at: string;
};

export type AcknowledgmentRow = {
  id: string;
  change_id: string;
  user_id: string;
  acknowledged_at: string | null;
  created_at: string;
};

export type RecordChangeInput = {
  category: ChangeCategory;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason?: string | null;
  /** Event roles this change is relevant to, or omitted/null for "every active member". */
  affected_scopes?: EventRole[] | null;
  requires_acknowledgment?: boolean;
  financial_impact?: number | null;
};

/**
 * Record a change and propagate it. Best-effort by design (callers wrap this
 * so a notification failure never blocks the underlying event mutation) --
 * but the insert itself is awaited so the change row and its acknowledgment
 * rows are guaranteed to exist before this returns.
 */
export async function recordEventChange(
  actor: Actor,
  eventId: string,
  input: RecordChangeInput,
): Promise<EventChangeRow> {
  const row = await q1<EventChangeRow>(
    `insert into event_changes
       (event_id, category, field, old_value, new_value, changed_by, reason,
        affected_scopes, requires_acknowledgment, financial_impact)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      eventId,
      input.category,
      input.field,
      input.old_value === undefined ? null : JSON.stringify(input.old_value),
      input.new_value === undefined ? null : JSON.stringify(input.new_value),
      actor.user.id,
      input.reason ?? null,
      input.affected_scopes ?? null,
      input.requires_acknowledgment ?? false,
      input.financial_impact ?? null,
    ],
  );
  const change = row as EventChangeRow;

  // Resolve affected members: an explicit role set, or every active member
  // when omitted. Never reaches outside event_members -- no email/broadcast
  // path here queries anything but this event's own roster.
  const scopes = input.affected_scopes ?? null;
  const members = await q<{ user_id: string; email: string | null }>(
    `select em.user_id, u.email
       from event_members em
       join users u on u.id = em.user_id
      where em.event_id = $1 and em.status = 'active'
        and ($2::text[] is null or em.role = any($2::text[]))`,
    [eventId, scopes],
  );

  if (members.length) {
    await pool
      .query(
        `insert into event_change_acknowledgments (change_id, user_id)
         select $1, unnest($2::uuid[])
         on conflict (change_id, user_id) do nothing`,
        [change.id, members.map((m) => m.user_id)],
      )
      .catch(() => undefined);

    // Best-effort notification. Excludes the actor who made the change.
    const recipients = members
      .filter((m) => m.user_id !== actor.user.id && m.email)
      .map((m) => m.email as string);
    if (recipients.length) {
      const changeWord = input.reason ? ` (${input.reason})` : "";
      await sendEmail({
        to: recipients,
        subject: "An event you are part of has changed",
        text:
          `${input.field.replace(/_/g, " ")} changed on an event you are part of${changeWord}.\n\n` +
          (input.requires_acknowledgment
            ? "Please review and acknowledge this change in Divini Partners."
            : "No action is required, this is for your awareness."),
      }).catch(() => undefined);
    }
  }

  return change;
}

/**
 * new - old for a numeric-ish field, or null when either side is not a real
 * number. Postgres `numeric` columns come back from node-pg as strings
 * (e.g. "10000"), not JS numbers, so a plain `typeof x === "number"` check
 * always misses them -- Number() handles both the string and number cases.
 */
function financialDelta(oldVal: unknown, newVal: unknown): number | null {
  const a = Number(oldVal);
  const b = Number(newVal);
  if (oldVal == null || newVal == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}

/** Diff two field maps and record one change per field that actually changed. */
export async function recordFieldChanges(
  actor: Actor,
  eventId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  categoryFor: (field: string) => ChangeCategory,
  opts?: { requiresAckFields?: Set<string> },
): Promise<void> {
  for (const field of Object.keys(after)) {
    if (!(field in before)) continue;
    const oldVal = before[field];
    const newVal = after[field];
    if (JSON.stringify(oldVal ?? null) === JSON.stringify(newVal ?? null)) continue;
    await recordEventChange(actor, eventId, {
      category: categoryFor(field),
      field,
      old_value: oldVal ?? null,
      new_value: newVal ?? null,
      requires_acknowledgment: opts?.requiresAckFields?.has(field) ?? false,
      financial_impact: field === "budget" ? financialDelta(oldVal, newVal) : null,
    }).catch(() => undefined);
  }
}

/** List the changelog for an event. Any actor with event access (including read_only) may view it. */
export async function listEventChanges(actor: Actor, eventId: string): Promise<EventChangeRow[]> {
  await getEvent(actor, eventId);
  return q<EventChangeRow>(
    `select * from event_changes where event_id = $1 order by created_at desc limit 500`,
    [eventId],
  );
}

/** Acknowledge a change as the signed-in actor. Only their own pending row can be marked. */
export async function acknowledgeChange(actor: Actor, changeId: string): Promise<AcknowledgmentRow> {
  const change = await q1<{ event_id: string }>(
    `select event_id from event_changes where id = $1`,
    [changeId],
  );
  if (!change) throw new NotFoundError("change not found");
  await getEvent(actor, change.event_id);
  const row = await q1<AcknowledgmentRow>(
    `update event_change_acknowledgments
        set acknowledged_at = now()
      where change_id = $1 and user_id = $2
      returning *`,
    [changeId, actor.user.id],
  );
  if (!row) throw new ForbiddenError("you are not an affected party for this change, or already acknowledged");
  return row;
}

/** Acknowledgment status for a change: who has and has not acknowledged. Owner/planner only. */
export async function acknowledgmentStatus(
  actor: Actor,
  changeId: string,
): Promise<Array<AcknowledgmentRow & { email: string | null }>> {
  const change = await q1<{ event_id: string }>(
    `select event_id from event_changes where id = $1`,
    [changeId],
  );
  if (!change) throw new NotFoundError("change not found");
  await getEvent(actor, change.event_id);
  return q<AcknowledgmentRow & { email: string | null }>(
    `select a.*, u.email
       from event_change_acknowledgments a
       join users u on u.id = a.user_id
      where a.change_id = $1
      order by a.created_at asc`,
    [changeId],
  );
}
