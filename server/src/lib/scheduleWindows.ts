/**
 * Automated schedule-of-events distribution: WHEN an event is due for a send.
 * PURE, dependency-free (no DB, no config, no node modules) so it can be unit
 * tested in isolation, same rationale as pricingMath.ts / eventScope.ts /
 * ics.ts / availability.ts.
 *
 * Two milestones, both counted down from the event's date_time:
 *   - week_before: due while between 1 and 7 days out (the preliminary send
 *     of the schedule to the venue, vendors, and host).
 *   - day_before:  due while within 24 hours out but still in the future
 *     (the final send, plus the guest-facing agenda if the host opted in).
 *
 * The actual "have we already sent this" check lives in the DB
 * (event_schedule_sends, unique on event_id+milestone+audience), so this
 * predicate can be evaluated on every scheduler tick without ever double-
 * sending - a wide, simple window here is safe precisely because the
 * idempotency guarantee lives elsewhere.
 *
 * Zero em dashes.
 */

export type ScheduleMilestone = "week_before" | "day_before";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** True when `eventDateTime` is currently inside the given milestone's window,
 *  relative to `now`. Both bounds are in the future (an event that already
 *  started or already passed is never due). */
export function isDueForMilestone(
  eventDateTime: Date,
  milestone: ScheduleMilestone,
  now: Date = new Date(),
): boolean {
  const msUntil = eventDateTime.getTime() - now.getTime();
  if (msUntil <= 0) return false; // event already started or passed
  if (milestone === "week_before") {
    return msUntil <= 7 * DAY_MS && msUntil > DAY_MS;
  }
  // day_before
  return msUntil <= DAY_MS;
}

/** Event lifecycle statuses that should never receive an automated send
 *  (nothing left to schedule, or the event never happened). */
export const TERMINAL_EVENT_STATUSES = new Set(["completed", "closed", "archived"]);

export function isEligibleStatus(status: string | null | undefined): boolean {
  return !!status && !TERMINAL_EVENT_STATUSES.has(status);
}
