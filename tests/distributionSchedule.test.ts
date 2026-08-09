/**
 * Regression tests for timezone-aware Execution Packet distribution
 * scheduling (lib/distributionSchedule.ts). Asserts DST-correct behavior
 * using only Intl.DateTimeFormat (no external timezone library).
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOffsetMinutes,
  computeSendMoment,
  isDueForDistribution,
  isDistributionPreset,
  DISTRIBUTION_PRESETS,
} from "../server/src/lib/distributionSchedule.ts";

test("every documented preset resolves to the correct minute offset", () => {
  assert.equal(resolveOffsetMinutes("14d", null), 14 * 24 * 60);
  assert.equal(resolveOffsetMinutes("10d", null), 10 * 24 * 60);
  assert.equal(resolveOffsetMinutes("7d", null), 7 * 24 * 60);
  assert.equal(resolveOffsetMinutes("5d", null), 5 * 24 * 60);
  assert.equal(resolveOffsetMinutes("72h", null), 72 * 60);
  assert.equal(resolveOffsetMinutes("48h", null), 48 * 60);
  assert.equal(resolveOffsetMinutes("24h", null), 24 * 60);
});

test("custom preset uses the caller-supplied minutes, falling back to 24h when absent or invalid", () => {
  assert.equal(resolveOffsetMinutes("custom", 90), 90);
  assert.equal(resolveOffsetMinutes("custom", null), 24 * 60);
  assert.equal(resolveOffsetMinutes("custom", -5), 24 * 60);
  assert.equal(resolveOffsetMinutes("custom", 0), 24 * 60);
});

test("isDistributionPreset accepts every real preset and rejects garbage", () => {
  for (const p of DISTRIBUTION_PRESETS) assert.equal(isDistributionPreset(p), true);
  assert.equal(isDistributionPreset("30d"), false);
  assert.equal(isDistributionPreset(""), false);
});

test("computeSendMoment: 9:00 AM America/New_York in winter (EST, UTC-5) resolves to 14:00 UTC", () => {
  // Event is Jan 22 2026, want the send 7 days before at 9:00 local NY time
  // -> Jan 15 2026, 9:00 EST -> 14:00 UTC.
  const event = new Date("2026-01-22T18:00:00Z");
  const moment = computeSendMoment(event, 7 * 24 * 60, "America/New_York", "09:00");
  assert.equal(moment.toISOString(), "2026-01-15T14:00:00.000Z");
});

test("computeSendMoment: 9:00 AM America/New_York in summer (EDT, UTC-4) resolves to 13:00 UTC", () => {
  // Event is July 22 2026, 7 days before -> July 15 2026, 9:00 EDT -> 13:00 UTC.
  const event = new Date("2026-07-22T18:00:00Z");
  const moment = computeSendMoment(event, 7 * 24 * 60, "America/New_York", "09:00");
  assert.equal(moment.toISOString(), "2026-07-15T13:00:00.000Z");
});

test("computeSendMoment respects a different timezone independently (Asia/Tokyo, UTC+9, no DST)", () => {
  const event = new Date("2026-03-10T00:00:00Z");
  const moment = computeSendMoment(event, 24 * 60, "Asia/Tokyo", "09:00");
  // 1 day before, 9:00 JST -> 00:00 UTC on the same calendar day as the event.
  assert.equal(moment.toISOString(), "2026-03-09T00:00:00.000Z");
});

test("isDueForDistribution is false before the send moment and true at/after it", () => {
  const event = new Date("2026-01-22T18:00:00Z");
  const sendMoment = computeSendMoment(event, 7 * 24 * 60, "America/New_York", "09:00");
  const before = new Date(sendMoment.getTime() - 60_000);
  const at = sendMoment;
  const after = new Date(sendMoment.getTime() + 60_000);
  assert.equal(isDueForDistribution(event, 7 * 24 * 60, "America/New_York", "09:00", before), false);
  assert.equal(isDueForDistribution(event, 7 * 24 * 60, "America/New_York", "09:00", at), true);
  assert.equal(isDueForDistribution(event, 7 * 24 * 60, "America/New_York", "09:00", after), true);
});

test("isDueForDistribution is always false once the event itself has started", () => {
  const event = new Date("2026-01-22T18:00:00Z");
  const afterEventStart = new Date("2026-01-22T19:00:00Z");
  assert.equal(isDueForDistribution(event, 7 * 24 * 60, "America/New_York", "09:00", afterEventStart), false);
});
