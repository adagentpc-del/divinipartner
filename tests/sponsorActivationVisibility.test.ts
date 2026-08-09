/**
 * Regression tests for sponsor activation visibility (Part 23-24).
 * Locks in "Sponsor own activation only": full/venue coordinate every
 * sponsor's activation; a sponsor sees only their own org's items; every
 * other audience sees none.
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSponsorActivationVisible,
  filterSponsorActivationsForAudience,
  summarizeActivations,
  type SponsorActivationRow,
} from "../server/src/lib/sponsorActivationVisibility.ts";

const SPONSOR_A: SponsorActivationRow = { id: "1", event_id: "ev", sponsor_org_id: "org-a", status: "not_started" };
const SPONSOR_B: SponsorActivationRow = { id: "2", event_id: "ev", sponsor_org_id: "org-b", status: "complete" };

test("full sees every sponsor's items", () => {
  assert.equal(isSponsorActivationVisible(SPONSOR_A, "full", null), true);
  assert.equal(isSponsorActivationVisible(SPONSOR_B, "full", "org-a"), true);
});

test("venue sees every sponsor's items", () => {
  assert.equal(isSponsorActivationVisible(SPONSOR_A, "venue", null), true);
});

test("a sponsor sees only their own org's items", () => {
  assert.equal(isSponsorActivationVisible(SPONSOR_A, "sponsor", "org-a"), true);
  assert.equal(isSponsorActivationVisible(SPONSOR_B, "sponsor", "org-a"), false);
});

test("a sponsor with no org sees nothing", () => {
  assert.equal(isSponsorActivationVisible(SPONSOR_A, "sponsor", null), false);
});

test("vendor, vendor_staff, and event_staff see nothing -- sponsor activation is not their concern", () => {
  for (const audience of ["vendor", "vendor_staff", "event_staff"] as const) {
    assert.equal(isSponsorActivationVisible(SPONSOR_A, audience, "org-a"), false);
  }
});

test("filterSponsorActivationsForAudience: a sponsor's filtered list never includes another sponsor's row", () => {
  const filtered = filterSponsorActivationsForAudience([SPONSOR_A, SPONSOR_B], "sponsor", "org-a");
  assert.deepEqual(filtered, [SPONSOR_A]);
});

test("summarizeActivations: counts distinct sponsor orgs and status buckets", () => {
  const summary = summarizeActivations([
    SPONSOR_A,
    SPONSOR_B,
    { id: "3", event_id: "ev", sponsor_org_id: "org-a", status: "issue" },
  ]);
  assert.deepEqual(summary, {
    total_sponsors: 2,
    activations_total: 3,
    activations_complete: 1,
    activations_issue: 1,
  });
});

test("summarizeActivations: empty list is all zeros, never a fabricated number", () => {
  assert.deepEqual(summarizeActivations([]), {
    total_sponsors: 0,
    activations_total: 0,
    activations_complete: 0,
    activations_issue: 0,
  });
});
