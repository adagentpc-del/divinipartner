/**
 * Regression tests for unit-aware vendor final quantity comparison semantics
 * (lib/quantityComparison.ts). Fixes a real, deferred gap: the original
 * vendor_final_quantities discrepancy compared EVERY vendor's quantity
 * directly against the event's guest final count, which is only valid for
 * headcount-proportional scopes -- a security officer count or a hotel room
 * count is not the same unit as guest count.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeComparison,
  isComparisonType,
  COMPARISON_TYPES,
  COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE,
} from "../server/src/lib/quantityComparison.ts";

test("comparison_type 'none' never computes a discrepancy, even with a resolvable reference", () => {
  const r = computeComparison("none", 475, 1, 488);
  assert.equal(r.expected_quantity, null);
  assert.equal(r.discrepancy, null);
  assert.equal(r.discrepancy_status, "not_applicable");
});

test("a requested comparison with no resolvable reference is 'unresolved', not a fabricated 0", () => {
  const r = computeComparison("event_final_count", null, 1, 488);
  assert.equal(r.expected_quantity, null);
  assert.equal(r.discrepancy, null);
  assert.equal(r.discrepancy_status, "unresolved");
});

test("exact match against guest count (meals 1:1) is reported as 'match'", () => {
  const r = computeComparison("event_final_count", 475, 1, 475);
  assert.equal(r.expected_quantity, 475);
  assert.equal(r.discrepancy, 0);
  assert.equal(r.discrepancy_status, "match");
});

test("caterer over guest count (488 meals vs 475 guests) is 'over' with the correct signed delta", () => {
  const r = computeComparison("event_final_count", 475, 1, 488);
  assert.equal(r.expected_quantity, 475);
  assert.equal(r.discrepancy, 13);
  assert.equal(r.discrepancy_status, "over");
});

test("under guest count is 'under' with a negative delta", () => {
  const r = computeComparison("event_final_count", 475, 1, 460);
  assert.equal(r.discrepancy, -15);
  assert.equal(r.discrepancy_status, "under");
});

test("a ratio scales the expected quantity before comparing, e.g. bar servings at 1.15x guest count", () => {
  const r = computeComparison("event_final_count", 400, 1.15, 460);
  assert.equal(r.expected_quantity, 460);
  assert.equal(r.discrepancy, 0);
  assert.equal(r.discrepancy_status, "match");
});

test("a non-positive or non-finite ratio falls back to 1x rather than corrupting the comparison", () => {
  const zero = computeComparison("event_final_count", 400, 0, 400);
  assert.equal(zero.expected_quantity, 400);
  const negative = computeComparison("event_final_count", 400, -2, 400);
  assert.equal(negative.expected_quantity, 400);
  const nanRatio = computeComparison("event_final_count", 400, Number.NaN, 400);
  assert.equal(nanRatio.expected_quantity, 400);
});

test("awarded_quantity behaves identically to event_final_count once a reference number is resolved -- the comparison math does not care about the source label", () => {
  const r = computeComparison("awarded_quantity", 8, 1, 8);
  assert.equal(r.discrepancy_status, "match");
});

test("custom_expected_quantity (e.g. security officer headcount, not a guest-count ratio at all) compares against exactly the caller-supplied number", () => {
  // 8 officers required (custom_expected_quantity resolved upstream to 8), 8 submitted.
  const r = computeComparison("custom_expected_quantity", 8, 1, 8);
  assert.equal(r.expected_quantity, 8);
  assert.equal(r.discrepancy, 0);
  assert.equal(r.discrepancy_status, "match");
  // 6 submitted against a required 8 -- understaffed.
  const under = computeComparison("custom_expected_quantity", 8, 1, 6);
  assert.equal(under.discrepancy, -2);
  assert.equal(under.discrepancy_status, "under");
});

test("isComparisonType accepts every real type and rejects garbage", () => {
  for (const t of COMPARISON_TYPES) {
    assert.equal(isComparisonType(t), true);
  }
  assert.equal(isComparisonType("guest_count"), false);
  assert.equal(isComparisonType(""), false);
  assert.equal(isComparisonType(42), false);
  assert.equal(isComparisonType(undefined), false);
});

test("contract_quantity, scope_requirement, and custom_expected_quantity all require an explicit caller-supplied value -- there is no structured source for them", () => {
  for (const t of ["contract_quantity", "scope_requirement", "custom_expected_quantity"] as const) {
    assert.equal(COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE.includes(t), true);
  }
  // event_final_count and awarded_quantity DO have a structured auto-resolution
  // path and must not be in this list.
  assert.equal(COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE.includes("event_final_count"), false);
  assert.equal(COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE.includes("awarded_quantity"), false);
});
