/**
 * Regression tests for Incident Management visibility (lib/incidentVisibility.ts).
 * Adversarial-security-relevant: "do not expose medical detail, guest PII,
 * security detail, internal investigations to general vendors or sponsors."
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIncidentVisible,
  filterIncidentsForAudience,
  RESTRICTED_BY_DEFAULT_CATEGORIES,
  type IncidentRow,
} from "../server/src/lib/incidentVisibility.ts";

function incident(overrides: Partial<IncidentRow> = {}): IncidentRow {
  return {
    id: "inc-1",
    event_id: "event-1",
    category: "vendor",
    severity: "medium",
    location: "Main hall",
    description: "Spilled drinks near stage",
    submitted_by: "reporter-1",
    assigned_to: null,
    status: "open",
    resolution: null,
    restricted: false,
    attachments: null,
    created_at: "2026-08-09T10:00:00Z",
    updated_at: "2026-08-09T10:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

test("medical/security/guest categories are always restricted by default (pre-flag)", () => {
  assert.equal(RESTRICTED_BY_DEFAULT_CATEGORIES.has("medical"), true);
  assert.equal(RESTRICTED_BY_DEFAULT_CATEGORIES.has("security"), true);
  assert.equal(RESTRICTED_BY_DEFAULT_CATEGORIES.has("guest"), true);
  assert.equal(RESTRICTED_BY_DEFAULT_CATEGORIES.has("vendor"), false);
});

test("full audience sees everything, including restricted incidents", () => {
  const i = incident({ category: "medical", restricted: true, submitted_by: "someone-else" });
  assert.equal(isIncidentVisible(i, "full", "unrelated-user"), true);
});

test("an operational (vendor) category incident is visible to venue but not sponsor/event_staff", () => {
  const i = incident({ category: "vendor" });
  assert.equal(isIncidentVisible(i, "venue", "unrelated-user"), true);
  assert.equal(isIncidentVisible(i, "vendor", "unrelated-user"), false);
  assert.equal(isIncidentVisible(i, "sponsor", "unrelated-user"), false);
  assert.equal(isIncidentVisible(i, "event_staff", "unrelated-user"), false);
});

test("a medical incident is hidden from venue, vendor, and sponsor even though it is not explicitly restricted-flagged", () => {
  const i = incident({ category: "medical", restricted: false, submitted_by: "reporter-1" });
  assert.equal(isIncidentVisible(i, "venue", "unrelated-user"), false);
  assert.equal(isIncidentVisible(i, "vendor", "unrelated-user"), false);
  assert.equal(isIncidentVisible(i, "sponsor", "unrelated-user"), false);
});

test("restricted=true hard-caps an otherwise-venue-visible category down to full only", () => {
  const i = incident({ category: "vendor", restricted: true, submitted_by: "reporter-1" });
  assert.equal(isIncidentVisible(i, "venue", "unrelated-user"), false);
  assert.equal(isIncidentVisible(i, "full", "unrelated-user"), true);
});

test("the reporter always sees their own submission, even a restricted one, but no one else at their audience level does", () => {
  const i = incident({ category: "security", restricted: true, submitted_by: "reporter-1" });
  assert.equal(isIncidentVisible(i, "venue", "reporter-1"), true);
  assert.equal(isIncidentVisible(i, "venue", "some-other-venue-user"), false);
});

test("the assigned responder always sees the incident regardless of category/restriction", () => {
  const i = incident({ category: "security", restricted: true, submitted_by: "reporter-1", assigned_to: "responder-1" });
  assert.equal(isIncidentVisible(i, "vendor", "responder-1"), true);
  assert.equal(isIncidentVisible(i, "vendor", "someone-else"), false);
});

test("filterIncidentsForAudience only keeps incidents the audience may see", () => {
  const rows = [
    incident({ id: "1", category: "vendor" }),
    incident({ id: "2", category: "medical", submitted_by: "someone-else" }),
    incident({ id: "3", category: "venue" }),
  ];
  const forVenue = filterIncidentsForAudience(rows, "venue", "unrelated-user");
  assert.deepEqual(forVenue.map((r) => r.id), ["1", "3"]);

  const forFull = filterIncidentsForAudience(rows, "full", "owner-user");
  assert.deepEqual(forFull.map((r) => r.id), ["1", "2", "3"]);
});
