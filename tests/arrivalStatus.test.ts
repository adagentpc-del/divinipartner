/**
 * Regression tests for deriveArrivalStatus (lib/arrivalStatus.ts). Covers
 * all 8 states, using DEFAULT_ARRIVAL_TOLERANCES throughout so the
 * scenarios match what production actually uses.
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveArrivalStatus, DEFAULT_ARRIVAL_TOLERANCES } from "../server/src/lib/arrivalStatus.ts";

const SCHEDULED = "2026-11-05T17:00:00Z";
const scheduledMs = new Date(SCHEDULED).getTime();
function minutesFromScheduled(min: number): string {
  return new Date(scheduledMs + min * 60000).toISOString();
}

test("no scheduled time and not checked in -> not_due", () => {
  assert.equal(deriveArrivalStatus(null, null, null, Date.now()), "not_due");
});

test("well before scheduled time and not checked in -> not_due", () => {
  const now = scheduledMs - (DEFAULT_ARRIVAL_TOLERANCES.dueSoonMinutes + 10) * 60000;
  assert.equal(deriveArrivalStatus(SCHEDULED, null, null, now), "not_due");
});

test("within the due-soon window and not checked in -> due_soon", () => {
  const now = scheduledMs - 10 * 60000;
  assert.equal(deriveArrivalStatus(SCHEDULED, null, null, now), "due_soon");
});

test("past scheduled time within grace, not checked in -> late (a real gap, not yet a no-show)", () => {
  const now = scheduledMs + (DEFAULT_ARRIVAL_TOLERANCES.lateGraceMinutes + 5) * 60000;
  assert.equal(deriveArrivalStatus(SCHEDULED, null, null, now), "late");
});

test("seven minutes late is NOT flagged late -- within the default grace period", () => {
  const now = scheduledMs + 7 * 60000;
  assert.equal(deriveArrivalStatus(SCHEDULED, null, null, now), "due_soon");
});

test("well past scheduled time with no check-in -> no_show", () => {
  const now = scheduledMs + (DEFAULT_ARRIVAL_TOLERANCES.noShowMinutes + 30) * 60000;
  assert.equal(deriveArrivalStatus(SCHEDULED, null, null, now), "no_show");
});

test("checked in notably before scheduled time -> early", () => {
  const checkedInAt = minutesFromScheduled(-(DEFAULT_ARRIVAL_TOLERANCES.earlyThresholdMinutes + 5));
  assert.equal(deriveArrivalStatus(SCHEDULED, checkedInAt, null, Date.now()), "early");
});

test("checked in close to scheduled time -> on_time", () => {
  const checkedInAt = minutesFromScheduled(2);
  assert.equal(deriveArrivalStatus(SCHEDULED, checkedInAt, null, Date.now()), "on_time");
});

test("checked in well after scheduled time -> late", () => {
  const checkedInAt = minutesFromScheduled(DEFAULT_ARRIVAL_TOLERANCES.lateGraceMinutes + 20);
  assert.equal(deriveArrivalStatus(SCHEDULED, checkedInAt, null, Date.now()), "late");
});

test("checked in with no scheduled time -> checked_in (nothing to compare against)", () => {
  assert.equal(deriveArrivalStatus(null, new Date().toISOString(), null, Date.now()), "checked_in");
});

test("checked out -> completed, regardless of timing", () => {
  const checkedInAt = minutesFromScheduled(-30);
  const checkedOutAt = minutesFromScheduled(60);
  assert.equal(deriveArrivalStatus(SCHEDULED, checkedInAt, checkedOutAt, Date.now()), "completed");
  // Even a very late arrival that eventually checked out is "completed",
  // not "late" -- the live status reflects where they are now.
  const lateCheckIn = minutesFromScheduled(200);
  assert.equal(deriveArrivalStatus(SCHEDULED, lateCheckIn, checkedOutAt, Date.now()), "completed");
});
