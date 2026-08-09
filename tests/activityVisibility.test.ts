/**
 * Regression tests for the Live Activity Timeline visibility projection
 * (lib/activityVisibility.ts). Adversarial-security-relevant: a vendor's
 * feed must never surface a finance/incident-restricted row, and every
 * actor must always see their own action regardless of category scope.
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isActivityVisible, filterActivityForAudience, type ActivityRow } from "../server/src/lib/activityVisibility.ts";

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "row-1",
    event_id: "event-1",
    actor_id: "user-a",
    actor_org_id: "org-a",
    category: "check_in",
    related_entity_type: null,
    related_entity_id: null,
    message: "Vendor checked in",
    payload: null,
    severity: "info",
    visibility_scope: null,
    created_at: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

test("check_in category defaults to broad visibility (full/venue/vendor/vendor_staff), never sponsor/event_staff", () => {
  const r = row();
  assert.equal(isActivityVisible(r, "full", null, "someone-else"), true);
  assert.equal(isActivityVisible(r, "venue", null, "someone-else"), true);
  assert.equal(isActivityVisible(r, "vendor", "org-b", "someone-else"), true);
  assert.equal(isActivityVisible(r, "sponsor", "org-b", "someone-else"), false);
  assert.equal(isActivityVisible(r, "event_staff", "org-b", "someone-else"), false);
});

test("a finance/incident-restricted row (change/incident category) is full-only by default", () => {
  const change = row({ category: "change" });
  const incident = row({ category: "incident" });
  for (const r of [change, incident]) {
    assert.equal(isActivityVisible(r, "full", null, "someone-else"), true);
    assert.equal(isActivityVisible(r, "venue", null, "someone-else"), false);
    assert.equal(isActivityVisible(r, "vendor", "org-b", "someone-else"), false);
    assert.equal(isActivityVisible(r, "sponsor", null, "someone-else"), false);
  }
});

test("an actor always sees their own org's row even when the category scope would otherwise exclude them", () => {
  const r = row({ category: "change", actor_org_id: "org-vendor" });
  assert.equal(isActivityVisible(r, "vendor", "org-vendor", "someone-else"), true);
  assert.equal(isActivityVisible(r, "vendor", "org-other", "someone-else"), false);
});

test("an actor always sees their own personal action even with no org attribution", () => {
  const r = row({ category: "incident", actor_org_id: null, actor_id: "user-x" });
  assert.equal(isActivityVisible(r, "event_staff", null, "user-x"), true);
  assert.equal(isActivityVisible(r, "event_staff", null, "user-y"), false);
});

test("an explicit visibility_scope narrows the category default rather than replacing it with something broader", () => {
  const r = row({ category: "check_in", visibility_scope: ["full"] });
  // Normally venue/vendor would see check_in -- this row explicitly narrowed it to full only.
  assert.equal(isActivityVisible(r, "venue", null, "someone-else"), false);
  assert.equal(isActivityVisible(r, "full", null, "someone-else"), true);
});

test("sponsor category is full + own-org-only, never venue, vendor, or a DIFFERENT sponsor org (Part 23-24 regression: a rival sponsor must never see another sponsor's activation activity via the shared timeline)", () => {
  const r = row({ category: "sponsor", actor_org_id: "org-sponsor" });
  assert.equal(isActivityVisible(r, "full", null, "someone-else"), true);
  assert.equal(isActivityVisible(r, "sponsor", "org-sponsor", "someone-else"), true);
  assert.equal(isActivityVisible(r, "sponsor", "org-other-sponsor", "someone-else"), false);
  assert.equal(isActivityVisible(r, "sponsor", null, "someone-else"), false);
  assert.equal(isActivityVisible(r, "venue", null, "someone-else"), false);
  assert.equal(isActivityVisible(r, "vendor", null, "someone-else"), false);
});

test("filterActivityForAudience only keeps rows the audience may see, preserving order", () => {
  const rows = [
    row({ id: "1", category: "check_in", created_at: "2026-08-09T10:00:00Z" }),
    row({ id: "2", category: "change", actor_org_id: "org-other", actor_id: "user-other", created_at: "2026-08-09T10:05:00Z" }),
    row({ id: "3", category: "task", created_at: "2026-08-09T10:10:00Z" }),
  ];
  const forVendor = filterActivityForAudience(rows, "vendor", "org-b", "someone-else");
  assert.deepEqual(forVendor.map((r) => r.id), ["1", "3"]);

  const forFull = filterActivityForAudience(rows, "full", null, "owner-user");
  assert.deepEqual(forFull.map((r) => r.id), ["1", "2", "3"]);
});
