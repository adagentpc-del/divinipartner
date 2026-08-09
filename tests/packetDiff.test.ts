/**
 * Regression tests for the WHAT CHANGED Execution Packet diff generator
 * (lib/packetDiff.ts). Deliberately not testing raw JSON diffing -- these
 * assert the categorized, human-readable output a recipient would actually
 * read.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPacketSnapshots } from "../server/src/lib/packetDiff.ts";
import type { ExecutionPacketSnapshot } from "../server/src/db/executionPacket.ts";

function baseSnapshot(overrides: Partial<ExecutionPacketSnapshot> = {}): ExecutionPacketSnapshot {
  return {
    event: {
      id: "event-1",
      name: "Test Gala",
      status: "vendor_bidding",
      date_time: "2026-11-05T18:00:00Z",
      end_at: null,
      load_in_at: null,
      setup_at: null,
      rehearsal_at: null,
      vendor_call_at: "2026-11-05T14:00:00Z",
      doors_at: null,
      strike_at: null,
      timezone: "America/New_York",
      emergency_contact_name: null,
      emergency_contact_phone: null,
    },
    venue: {
      id: "venue-1",
      name: "Grand Hall",
      address: "123 Main St",
      city: "Metropolis",
      region: "NY",
      space: "Ballroom B",
      notes: "Loading dock code 4471",
      access_time: null,
      parking_info: null,
      loading_dock: null,
      vendor_entrance: null,
      guest_entrance: null,
      restrictions: null,
    },
    schedule: {
      event: { id: "event-1", name: "Test Gala", date_time: null, guest_count: null },
      generated_at: "2026-08-09T00:00:00Z",
      items: [],
      by_role: { all: [], client: [], venue: [], vendor: [], installer: [], planner: [] },
      checks: [],
      statuses: [],
      categories: [],
    },
    floorplans: [],
    vendor_assignments: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", role: "vendor_owner", status: "active" },
    ],
    final_count: { version: 1, count: 475, discrepancy: 0 },
    vendor_final_quantities: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", scope: "catering", version: 1, quantity: "475", unit: "meals", discrepancy: "0", discrepancy_status: "match" },
    ],
    key_contacts: [
      { user_id: "u-owner", name: "Owner Person", email: "owner@test.local", phone: null, role: "event_owner", organization_name: null },
    ],
    generated_at: "2026-08-09T00:00:00Z",
    ...overrides,
  };
}

test("identical snapshots produce zero diff entries", () => {
  const a = baseSnapshot();
  const b = baseSnapshot();
  assert.deepEqual(diffPacketSnapshots(a, b), []);
});

test("final count change produces a single ATTENDANCE entry with the old and new counts", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({ final_count: { version: 2, count: 488, discrepancy: 13 } });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "FINAL COUNT");
  assert.ok(entry);
  assert.equal(entry?.category, "attendance");
  assert.equal(entry?.old_value, "475");
  assert.equal(entry?.new_value, "488");
});

test("a vendor call-time change produces a SCHEDULE entry, not a raw JSON blob", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    event: { ...before.event, vendor_call_at: "2026-11-05T13:30:00Z" },
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "VENDOR CALL");
  assert.ok(entry);
  assert.equal(entry?.category, "schedule");
  assert.equal(entry?.old_value, "2026-11-05T14:00:00.000Z");
  assert.equal(entry?.new_value, "2026-11-05T13:30:00.000Z");
});

test("a VIP reception location change (venue.space) produces a LOCATION entry", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({ venue: { ...before.venue, space: "Terrace" } });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "VENUE SPACE");
  assert.ok(entry);
  assert.equal(entry?.category, "location");
  assert.equal(entry?.old_value, "Ballroom B");
  assert.equal(entry?.new_value, "Terrace");
});

test("a newly added vendor produces a VENDOR entry, a removed vendor produces a separate VENDOR entry", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    vendor_assignments: [
      { organization_id: "org-av", vendor_name: "AV Co", role: "vendor_owner", status: "active" },
    ],
  });
  const diff = diffPacketSnapshots(before, after);
  const added = diff.find((d) => d.label === "AV CO");
  const removed = diff.find((d) => d.label === "CATERER CO");
  assert.ok(added);
  assert.equal(added?.new_value, "Added (vendor_owner)");
  assert.ok(removed);
  assert.equal(removed?.new_value, "Removed");
});

test("a vendor quantity revision produces a QUANTITY entry with old and new figures", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    vendor_final_quantities: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", scope: "catering", version: 2, quantity: "488", unit: "meals", discrepancy: "13", discrepancy_status: "over" },
    ],
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.category === "quantity");
  assert.ok(entry);
  assert.equal(entry?.label, "CATERER CO CATERING");
  assert.equal(entry?.old_value, "475 meals");
  assert.equal(entry?.new_value, "488 meals");
});

test("security staff count change (a custom-scope vendor quantity, not headcount) still diffs correctly", () => {
  const before = baseSnapshot({
    vendor_assignments: [{ organization_id: "org-sec", vendor_name: "Security Co", role: "vendor_owner", status: "active" }],
    vendor_final_quantities: [
      { organization_id: "org-sec", vendor_name: "Security Co", scope: "security", version: 1, quantity: "6", unit: "officers", discrepancy: null, discrepancy_status: "not_applicable" },
    ],
  });
  const after = baseSnapshot({
    vendor_assignments: before.vendor_assignments,
    vendor_final_quantities: [
      { organization_id: "org-sec", vendor_name: "Security Co", scope: "security", version: 2, quantity: "8", unit: "officers", discrepancy: null, discrepancy_status: "not_applicable" },
    ],
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "SECURITY CO SECURITY");
  assert.ok(entry);
  assert.equal(entry?.old_value, "6 officers");
  assert.equal(entry?.new_value, "8 officers");
});

test("a contact swap produces both an added and a removed CONTACT entry", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    key_contacts: [
      { user_id: "u-planner", name: "New Planner", email: "planner@test.local", phone: null, role: "planner", organization_name: null },
    ],
  });
  const diff = diffPacketSnapshots(before, after);
  assert.equal(diff.filter((d) => d.category === "contact").length, 2);
  assert.ok(diff.find((d) => d.label === "PLANNER CONTACT" && d.new_value === "New Planner"));
  assert.ok(diff.find((d) => d.label === "EVENT_OWNER CONTACT" && d.new_value === "Removed"));
});

test("floor plan count change produces a DOCUMENT entry", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    floorplans: [{ id: "fp-1", name: "Main floor", file_url: "https://example.com/fp.pdf", thumbnail_url: null, is_primary: true }],
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.category === "document");
  assert.ok(entry);
  assert.equal(entry?.old_value, "0 file(s)");
  assert.equal(entry?.new_value, "1 file(s)");
});

test("multiple simultaneous changes each produce their own correctly-categorized entry", () => {
  const before = baseSnapshot();
  const after = baseSnapshot({
    final_count: { version: 2, count: 488, discrepancy: 13 },
    event: { ...before.event, vendor_call_at: "2026-11-05T13:30:00Z" },
    venue: { ...before.venue, space: "Terrace" },
  });
  const diff = diffPacketSnapshots(before, after);
  const categories = new Set(diff.map((d) => d.category));
  assert.equal(categories.has("attendance"), true);
  assert.equal(categories.has("schedule"), true);
  assert.equal(categories.has("location"), true);
  assert.equal(diff.length, 3);
});

// --- Run of Show item diff (Live Event Operations phase, Part 2) ---

function rosItem(overrides: Partial<ExecutionPacketSnapshot["schedule"]["items"][number]> = {}) {
  return {
    key: "item-dinner",
    title: "Dinner Service",
    description: null,
    category: "service",
    start_time: "2026-11-05T19:15:00Z",
    end_time: "2026-11-05T20:15:00Z",
    location: "Ballroom",
    owner_role: "vendor" as const,
    owner_label: null,
    source: "manual",
    source_ref: null,
    status: "planned",
    responsible_org_id: "org-caterer",
    ...overrides,
  };
}

test("a Run of Show item time change moves 7:15 PM to 7:30 PM in a human-readable TIME entry", () => {
  const before = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const after = baseSnapshot({
    schedule: { ...baseSnapshot().schedule, items: [rosItem({ start_time: "2026-11-05T19:30:00Z" })] },
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "DINNER SERVICE TIME");
  assert.ok(entry);
  assert.equal(entry?.category, "schedule");
  assert.equal(entry?.old_value, "7:15 PM");
  assert.equal(entry?.new_value, "7:30 PM");
});

test("a Run of Show item duration (end time) change produces a DURATION entry", () => {
  const before = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const after = baseSnapshot({
    schedule: { ...baseSnapshot().schedule, items: [rosItem({ end_time: "2026-11-05T21:00:00Z" })] },
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "DINNER SERVICE DURATION");
  assert.ok(entry);
  assert.equal(entry?.old_value, "8:15 PM");
  assert.equal(entry?.new_value, "9:00 PM");
});

test("a Run of Show item location change produces a LOCATION category entry", () => {
  const before = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const after = baseSnapshot({
    schedule: { ...baseSnapshot().schedule, items: [rosItem({ location: "Terrace" })] },
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "DINNER SERVICE LOCATION");
  assert.ok(entry);
  assert.equal(entry?.category, "location");
  assert.equal(entry?.old_value, "Ballroom");
  assert.equal(entry?.new_value, "Terrace");
});

test("a Run of Show item responsible-vendor change produces a VENDOR category entry", () => {
  const before = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const after = baseSnapshot({
    schedule: { ...baseSnapshot().schedule, items: [rosItem({ responsible_org_id: "org-av" })] },
  });
  const diff = diffPacketSnapshots(before, after);
  const entry = diff.find((d) => d.label === "DINNER SERVICE RESPONSIBLE VENDOR");
  assert.ok(entry);
  assert.equal(entry?.category, "vendor");
  assert.equal(entry?.old_value, "org-caterer");
  assert.equal(entry?.new_value, "org-av");
});

test("a newly added Run of Show item produces an Added entry, a removed one produces a Removed entry", () => {
  const before = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [] } });
  const after = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const addedDiff = diffPacketSnapshots(before, after);
  const added = addedDiff.find((d) => d.label === "RUN OF SHOW: Dinner Service");
  assert.ok(added);
  assert.equal(added?.old_value, "Not scheduled");
  assert.equal(added?.new_value, "Added (7:15 PM)");

  const removedDiff = diffPacketSnapshots(after, before);
  const removed = removedDiff.find((d) => d.label === "RUN OF SHOW: Dinner Service");
  assert.ok(removed);
  assert.equal(removed?.new_value, "Removed");
});

test("an unchanged Run of Show item produces zero diff entries", () => {
  const snapshot = baseSnapshot({ schedule: { ...baseSnapshot().schedule, items: [rosItem()] } });
  const diff = diffPacketSnapshots(snapshot, { ...snapshot, schedule: { ...snapshot.schedule, items: [rosItem()] } });
  assert.deepEqual(diff, []);
});
