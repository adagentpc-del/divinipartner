/**
 * Arrival status derivation (live-ops phase, Part 8, 2026-08-09).
 *
 * Pure, no DB -- takes a scheduled arrival time, a check-in/check-out state,
 * and "now", and returns exactly one of the eight states the spec's mockup
 * calls for. Configurable via ArrivalTolerances so a caller can pass
 * event-specific grace periods later; no per-event settings screen exists
 * yet, so every caller uses DEFAULT_ARRIVAL_TOLERANCES today. The default
 * late grace (15 minutes) is deliberately lenient: do not label someone
 * seven minutes late as an operational failure.
 *
 * Precedence (checked in order):
 *   1. checked out                          -> completed
 *   2. checked in, no scheduled time         -> checked_in
 *   3. checked in, notably before schedule   -> early
 *   4. checked in, notably after schedule    -> late
 *   5. checked in, within the window         -> on_time
 *   6. not checked in, no scheduled time     -> not_due
 *   7. not checked in, long past schedule    -> no_show
 *   8. not checked in, past schedule         -> late
 *   9. not checked in, within due-soon window -> due_soon
 *  10. not checked in, well before schedule  -> not_due
 *
 * Zero em dashes.
 */

export type ArrivalStatus =
  | "not_due"
  | "due_soon"
  | "on_time"
  | "early"
  | "late"
  | "checked_in"
  | "completed"
  | "no_show";

export type ArrivalTolerances = {
  /** How many minutes before the scheduled time counts as "due soon". */
  dueSoonMinutes: number;
  /** A check-in this many minutes or more before the scheduled time is "early". */
  earlyThresholdMinutes: number;
  /** A check-in (or non-check-in) up to this many minutes after the
   *  scheduled time is still "on_time" / not yet flagged late. */
  lateGraceMinutes: number;
  /** No check-in this many minutes after the scheduled time becomes "no_show". */
  noShowMinutes: number;
};

export const DEFAULT_ARRIVAL_TOLERANCES: ArrivalTolerances = {
  dueSoonMinutes: 30,
  earlyThresholdMinutes: 15,
  lateGraceMinutes: 15,
  noShowMinutes: 120,
};

export function deriveArrivalStatus(
  scheduledAt: string | null,
  checkedInAt: string | null,
  checkedOutAt: string | null,
  nowMs: number,
  tol: ArrivalTolerances = DEFAULT_ARRIVAL_TOLERANCES,
): ArrivalStatus {
  if (checkedOutAt) return "completed";

  if (checkedInAt) {
    if (!scheduledAt) return "checked_in";
    const diffMin = (new Date(checkedInAt).getTime() - new Date(scheduledAt).getTime()) / 60000;
    if (diffMin <= -tol.earlyThresholdMinutes) return "early";
    if (diffMin > tol.lateGraceMinutes) return "late";
    return "on_time";
  }

  if (!scheduledAt) return "not_due";
  const diffMin = (nowMs - new Date(scheduledAt).getTime()) / 60000;
  if (diffMin > tol.noShowMinutes) return "no_show";
  if (diffMin > tol.lateGraceMinutes) return "late";
  if (diffMin >= -tol.dueSoonMinutes) return "due_soon";
  return "not_due";
}
