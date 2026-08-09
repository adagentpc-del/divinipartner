/**
 * Live Activity Timeline (live-ops phase, Part 11-12, 2026-08-09).
 *
 * event_activity (db/schema-event-activity.sql) is the one authoritative,
 * append-only feed for this event. recordActivity() is called from every
 * system that produces a real, notable event -- currently check-in/
 * check-out (db/checkIns.ts), task completion (db/tasks.ts), and event
 * status transitions (db/events.ts, including Start Event). As later parts
 * of this phase ship (change requests, incidents, inventory, sponsor
 * activation, closeout), they call this same function -- never a second,
 * parallel "recent activity" list.
 *
 * recordActivity() is dynamically imported by its callers (the same
 * pattern used for checkAndMarkPacketStale in db/itinerary.ts) wherever a
 * static import would close an existing circular dependency, and is
 * always best-effort: a failure to log an activity entry must never break
 * the action it accompanies.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { audienceForRole } from "../lib/packetProjection.js";
import { filterActivityForAudience, type ActivityCategory, type ActivityRow } from "../lib/activityVisibility.js";
import { logger } from "../lib/logger.js";

export type RecordActivityInput = {
  category: ActivityCategory;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  payload?: unknown;
  severity?: "info" | "warning" | "critical";
  /** Narrows (never widens) the category's default visibility scope for
   *  this specific row -- e.g. a particular incident marked more
   *  restricted than the incident category default. */
  visibilityScope?: string[] | null;
  /** Defaults to actor.user.id / actor.org?.id; override for system-
   *  generated rows attributed to a specific user (e.g. checking in
   *  someone else). */
  actorId?: string | null;
  actorOrgId?: string | null;
};

/** Append one activity row. Best-effort -- never throws, matching
 *  lib/audit.ts's convention for non-critical-path writes. */
export async function recordActivity(actor: Actor, eventId: string, input: RecordActivityInput): Promise<void> {
  try {
    await q1(
      `insert into event_activity
         (event_id, actor_id, actor_org_id, category, related_entity_type, related_entity_id,
          message, payload, severity, visibility_scope)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        eventId,
        input.actorId !== undefined ? input.actorId : actor.user.id,
        input.actorOrgId !== undefined ? input.actorOrgId : actor.org?.id ?? null,
        input.category,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null,
        input.message,
        input.payload == null ? null : JSON.stringify(input.payload),
        input.severity ?? "info",
        input.visibilityScope ?? null,
      ],
    );
  } catch (e) {
    logger.error("activity log write failed", { eventId, category: input.category, error: (e as Error)?.message });
  }
}

/** Role-scoped activity feed, newest first -- backend-enforced visibility
 *  via lib/activityVisibility.ts, never a client-selectable filter. */
export async function listActivity(actor: Actor, eventId: string, limit = 100): Promise<ActivityRow[]> {
  await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  const rows = await q<ActivityRow>(
    `select * from event_activity where event_id = $1 order by created_at desc limit $2`,
    [eventId, Math.min(Math.max(limit, 1), 500)],
  );
  return filterActivityForAudience(rows, audience, actor.org?.id ?? null, actor.user.id);
}
