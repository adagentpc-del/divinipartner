/**
 * Schedule-of-events distribution timing tests (server/src/lib/
 * scheduleWindows.ts). Pure and deterministic; no DB, no network.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDueForMilestone, isEligibleStatus, TERMINAL_EVENT_STATUSES } from "../server/src/lib/scheduleWindows.ts";

const NOW = new Date("2026-09-10T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);

test("week_before: due between 1 and 7 days out", () => {
  assert.equal(isDueForMilestone(days(7), "week_before", NOW), true);
  assert.equal(isDueForMilestone(days(4), "week_before", NOW), true);
  assert.equal(isDueForMilestone(hours(25), "week_before", NOW), true); // just over 1 day
});

test("week_before: not due more than 7 days out", () => {
  assert.equal(isDueForMilestone(days(8), "week_before", NOW), false);
  assert.equal(isDueForMilestone(days(30), "week_before", NOW), false);
});

test("week_before: not due within the last day (that is day_before's window)", () => {
  assert.equal(isDueForMilestone(hours(23), "week_before", NOW), false);
  assert.equal(isDueForMilestone(hours(1), "week_before", NOW), false);
});

test("day_before: due within 24 hours out", () => {
  assert.equal(isDueForMilestone(hours(24), "day_before", NOW), true);
  assert.equal(isDueForMilestone(hours(1), "day_before", NOW), true);
  assert.equal(isDueForMilestone(hours(0.5), "day_before", NOW), true);
});

test("day_before: not due more than 24 hours out", () => {
  assert.equal(isDueForMilestone(hours(25), "day_before", NOW), false);
  assert.equal(isDueForMilestone(days(3), "day_before", NOW), false);
});

test("neither milestone is due once the event has started or passed", () => {
  assert.equal(isDueForMilestone(NOW, "day_before", NOW), false);
  assert.equal(isDueForMilestone(hours(-1), "day_before", NOW), false);
  assert.equal(isDueForMilestone(days(-2), "week_before", NOW), false);
});

test("isEligibleStatus excludes terminal statuses, includes everything else", () => {
  assert.equal(isEligibleStatus("in_production"), true);
  assert.equal(isEligibleStatus("itinerary_confirmed"), true);
  assert.equal(isEligibleStatus("completed"), false);
  assert.equal(isEligibleStatus("closed"), false);
  assert.equal(isEligibleStatus("archived"), false);
  assert.equal(isEligibleStatus(null), false);
  assert.equal(isEligibleStatus(undefined), false);
});

test("TERMINAL_EVENT_STATUSES contains exactly the expected set", () => {
  assert.deepEqual([...TERMINAL_EVENT_STATUSES].sort(), ["archived", "closed", "completed"]);
});
