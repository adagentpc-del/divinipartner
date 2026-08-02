/**
 * Event Scope Builder tests (server/src/lib/recommend.ts: buildEventScope).
 * Pure and deterministic; no DB, no network. Covers the pieces the new
 * "suggest bid items" flow in the Event Workspace depends on: category
 * detection, budget skeleton allocation, and guest/budget parsing.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventScope } from "../server/src/lib/eventScope.ts";

test("wedding description with an explicit budget detects categories and allocates the full budget", () => {
  const scope = buildEventScope(
    "Wedding reception for 180 guests. We need catering, a florist for centerpieces, and a DJ.",
    { budget: 60000 },
  );
  assert.equal(scope.event_type, "wedding");
  assert.equal(scope.budget, 60000);
  const keys = scope.categories.map((c) => c.category);
  assert.ok(keys.includes("catering"));
  assert.ok(keys.includes("florals"));
  assert.ok(keys.includes("music"));
  assert.ok(keys.includes("venue"), "venue is always seeded");

  const total = scope.budget_skeleton.reduce((s, b) => s + b.amount, 0);
  // Rounding per-category can drift by at most a few dollars from the total.
  assert.ok(Math.abs(total - 60000) <= scope.budget_skeleton.length, `sum ${total} should be close to 60000`);
  for (const line of scope.budget_skeleton) {
    assert.ok(line.amount >= 0, `${line.category} amount should not be negative`);
  }
});

test("no explicit budget and none mentioned in text leaves every skeleton amount at 0, not fabricated", () => {
  const scope = buildEventScope("A corporate offsite with AV and catering.");
  assert.equal(scope.budget, null);
  for (const line of scope.budget_skeleton) {
    assert.equal(line.amount, 0);
  }
});

test("budget mentioned in free text is parsed when no explicit budget option is given", () => {
  const scope = buildEventScope("Birthday party for 40 people, budget around $15k.");
  assert.equal(scope.budget, 15000);
  assert.equal(scope.guest_count, 40);
});

test("explicit guest_count/budget options always win over text-guessed values", () => {
  const scope = buildEventScope("Gala for 500 guests, $200k budget.", { guest_count: 120, budget: 40000 });
  assert.equal(scope.guest_count, 120);
  assert.equal(scope.budget, 40000);
});

test("category confidence is always clamped to [0, 1]", () => {
  const scope = buildEventScope(
    "wedding wedding venue venue venue catering catering catering catering florist florist florist florist florist",
    { budget: 10000 },
  );
  for (const c of scope.categories) {
    assert.ok(c.confidence >= 0 && c.confidence <= 1, `${c.category} confidence ${c.confidence} out of range`);
  }
});

test("venue is always present even when not mentioned in the description", () => {
  const scope = buildEventScope("Just a small get-together with cake and drinks.", { budget: 5000 });
  assert.ok(scope.categories.some((c) => c.category === "venue"));
});
