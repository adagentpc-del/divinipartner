/**
 * Final Count Workflow, P0 (Divini Partners 63-section Event Operations
 * spec, Phase A item 6, 2026-08-09).
 *
 * setFinalCount() is the ONLY write path -- it always inserts a new
 * event_final_counts row (version N+1), never updates an existing one, so a
 * revision can never silently overwrite what vendors were already told. Every
 * call also records an event_changes row (Phase A item 5) with
 * requires_acknowledgment true and propagates to every active member,
 * computes the signed delta from the previous version, and flags a
 * discrepancy against the authoritative attendance figure already on the
 * event record (attendance_confirmed, falling back to attendance_estimated).
 *
 * "Packet refresh" is now wired (completion phase, Part 18): if an
 * Execution Packet was already issued for this event, a final-count
 * revision flips it to 'update_required' via checkAndMarkPacketStale()
 * rather than silently leaving it looking current. It does not
 * auto-regenerate or auto-send a new version -- that stays an explicit
 * planner action, per the spec's caution against uncontrolled auto-sends.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { recordEventChange } from "./eventChanges.js";
import type { EventRole } from "../lib/eventRoles.js";

export type FinalCountRow = {
  id: string;
  event_id: string;
  version: number;
  count: number;
  delta: number | null;
  discrepancy: number | null;
  notes: string | null;
  set_by: string | null;
  created_at: string;
};

/** Vendor-side roles currently attached to the event, for the "affected vendors" surface. */
const VENDOR_SCOPES: EventRole[] = ["vendor_owner", "vendor_staff"];

/** The most recent (current) final count version, or null if none set yet. */
export async function currentFinalCount(actor: Actor, eventId: string): Promise<FinalCountRow | null> {
  await getEvent(actor, eventId);
  return q1<FinalCountRow>(
    `select * from event_final_counts where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
}

/** The full, append-only version history, newest first. */
export async function listFinalCountVersions(actor: Actor, eventId: string): Promise<FinalCountRow[]> {
  await getEvent(actor, eventId);
  return q<FinalCountRow>(
    `select * from event_final_counts where event_id = $1 order by version desc`,
    [eventId],
  );
}

export type SetFinalCountInput = {
  count: number;
  notes?: string | null;
};

export type SetFinalCountResult = {
  version: FinalCountRow;
  affected_vendor_count: number;
};

/**
 * Set (version) the authoritative final count. Owner or planner-role member
 * only -- this is the authoritative figure, distinct from each vendor's own
 * final quantity (Phase A item 7). Explicit confirmed action: the caller
 * must pass a real integer count; there is no "leave unchanged" default that
 * could accidentally re-stamp a stale value as a new version.
 */
export async function setFinalCount(
  actor: Actor,
  eventId: string,
  input: SetFinalCountInput,
): Promise<SetFinalCountResult> {
  const ev = await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can set the final count");
  }
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new ForbiddenError("count must be a non-negative integer");
  }
  const previous = await q1<FinalCountRow>(
    `select * from event_final_counts where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  const nextVersion = (previous?.version ?? 0) + 1;
  const delta = previous ? input.count - previous.count : null;
  const authoritative =
    ev.attendance_confirmed != null
      ? Number(ev.attendance_confirmed)
      : ev.attendance_estimated != null
        ? Number(ev.attendance_estimated)
        : null;
  const discrepancy = authoritative != null ? input.count - authoritative : null;

  const row = await q1<FinalCountRow>(
    `insert into event_final_counts (event_id, version, count, delta, discrepancy, notes, set_by)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [eventId, nextVersion, input.count, delta, discrepancy, input.notes?.trim() || null, actor.user.id],
  );
  const version = row as FinalCountRow;

  // Change record + propagation (Phase A item 5): every active member is
  // notified, and a status-transition-equivalent acknowledgment is required
  // since a final-count revision is exactly the kind of thing vendors must
  // actually see, not just have logged.
  await recordEventChange(actor, eventId, {
    category: "attendance",
    field: "final_count",
    old_value: previous?.count ?? null,
    new_value: input.count,
    reason: input.notes ?? null,
    requires_acknowledgment: true,
    financial_impact: null,
  }).catch(() => undefined);

  const vendorCount = await q<{ n: string }>(
    `select count(*)::int as n from event_members
      where event_id = $1 and status = 'active' and role = any($2::text[])`,
    [eventId, VENDOR_SCOPES],
  );

  // Event Change -> Packet Invalidation (completion phase, Part 18).
  // Dynamic import to avoid a static circular import (packetInvalidation.ts
  // imports FROM executionPacket.ts, which does not import this module, but
  // keeping the pattern consistent with events.ts avoids two different
  // import styles for the same cross-cutting concern).
  const { checkAndMarkPacketStale } = await import("./packetInvalidation.js");
  await checkAndMarkPacketStale(eventId);

  return { version, affected_vendor_count: Number(vendorCount[0]?.n ?? 0) };
}
