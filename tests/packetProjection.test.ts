/**
 * Regression tests for role-specific Event Execution Packet projections
 * (lib/packetProjection.ts). This is the adversarial-security-critical
 * piece for Part 4: Vendor A must never see Vendor B's quantities, a venue
 * must never see private vendor pricing/contracts, a sponsor must never see
 * the full vendor roster or venue logistics notes.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectPacket, audienceForRole, scopeSnapshotForDiff } from "../server/src/lib/packetProjection.ts";
import { diffPacketSnapshots } from "../server/src/lib/packetDiff.ts";
import type { ExecutionPacketSnapshot } from "../server/src/db/executionPacket.ts";

function fixtureSnapshot(): ExecutionPacketSnapshot {
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
      vendor_call_at: null,
      doors_at: null,
      strike_at: null,
      timezone: "America/New_York",
      emergency_contact_name: "Jamie Rivera",
      emergency_contact_phone: "555-0100",
    },
    venue: {
      id: "venue-1",
      name: "Grand Hall",
      address: "123 Main St",
      city: "Metropolis",
      region: "NY",
      space: "Main Ballroom",
      notes: "Loading dock code 4471 -- sensitive logistics detail",
      access_time: "2026-11-05T14:00:00Z",
      parking_info: "Valet at the west entrance",
      loading_dock: "Rear alley, dock B",
      vendor_entrance: "Service door 2",
      guest_entrance: "Main lobby",
      restrictions: "No open flame",
    },
    schedule: {
      event: { id: "event-1", name: "Test Gala", date_time: null, guest_count: null },
      generated_at: "2026-08-09T00:00:00Z",
      items: [
        { key: "a", title: "All-teams item", description: null, category: "program", start_time: null, end_time: null, location: null, owner_role: "all", owner_label: null, source: "auto:event", source_ref: null, status: "planned" },
        { key: "b", title: "Vendor-only item", description: null, category: "load_in", start_time: null, end_time: null, location: null, owner_role: "vendor", owner_label: null, source: "manual", source_ref: null, status: "planned" },
        { key: "c", title: "Venue-only item", description: null, category: "setup", start_time: null, end_time: null, location: null, owner_role: "venue", owner_label: null, source: "manual", source_ref: null, status: "planned" },
      ],
      by_role: {
        all: [{ key: "a", title: "All-teams item", description: null, category: "program", start_time: null, end_time: null, location: null, owner_role: "all", owner_label: null, source: "auto:event", source_ref: null, status: "planned" }],
        client: [],
        venue: [
          { key: "a", title: "All-teams item", description: null, category: "program", start_time: null, end_time: null, location: null, owner_role: "all", owner_label: null, source: "auto:event", source_ref: null, status: "planned" },
          { key: "c", title: "Venue-only item", description: null, category: "setup", start_time: null, end_time: null, location: null, owner_role: "venue", owner_label: null, source: "manual", source_ref: null, status: "planned" },
        ],
        vendor: [
          { key: "a", title: "All-teams item", description: null, category: "program", start_time: null, end_time: null, location: null, owner_role: "all", owner_label: null, source: "auto:event", source_ref: null, status: "planned" },
          { key: "b", title: "Vendor-only item", description: null, category: "load_in", start_time: null, end_time: null, location: null, owner_role: "vendor", owner_label: null, source: "manual", source_ref: null, status: "planned" },
        ],
        installer: [],
        planner: [
          { key: "a", title: "All-teams item", description: null, category: "program", start_time: null, end_time: null, location: null, owner_role: "all", owner_label: null, source: "auto:event", source_ref: null, status: "planned" },
          { key: "b", title: "Vendor-only item", description: null, category: "load_in", start_time: null, end_time: null, location: null, owner_role: "vendor", owner_label: null, source: "manual", source_ref: null, status: "planned" },
          { key: "c", title: "Venue-only item", description: null, category: "setup", start_time: null, end_time: null, location: null, owner_role: "venue", owner_label: null, source: "manual", source_ref: null, status: "planned" },
        ],
      },
      checks: [],
      statuses: [],
      categories: [],
    },
    floorplans: [{ id: "fp-1", name: "Main floor", file_url: "https://example.com/fp.pdf", thumbnail_url: null, is_primary: true }],
    vendor_assignments: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", role: "vendor_owner", status: "active" },
      { organization_id: "org-av", vendor_name: "AV Co", role: "vendor_owner", status: "active" },
    ],
    vendor_contacts: [
      { organization_id: "org-caterer", contact_name: "Caterer Lead", contact_email: "lead@caterer.local", contact_phone: "555-0111" },
      { organization_id: "org-av", contact_name: "AV Lead", contact_email: "lead@av.local", contact_phone: "555-0122" },
    ],
    final_count: { version: 2, count: 475, discrepancy: 0 },
    vendor_final_quantities: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", scope: "catering", version: 1, quantity: "488", unit: "meals", discrepancy: "13", discrepancy_status: "over" },
      { organization_id: "org-av", vendor_name: "AV Co", scope: "av", version: 1, quantity: "475", unit: "seats", discrepancy: "0", discrepancy_status: "match" },
    ],
    key_contacts: [
      { user_id: "u-owner", name: "Owner Person", email: "owner@test.local", phone: null, role: "event_owner", organization_name: "Owner Co" },
      { user_id: "u-planner", name: "Planner Person", email: "planner@test.local", phone: null, role: "planner", organization_name: "Owner Co" },
      { user_id: "u-venue", name: "Venue Person", email: "venue@test.local", phone: null, role: "venue", organization_name: "Grand Hall Co" },
      { user_id: "u-vendor", name: "Caterer Person", email: "caterer@test.local", phone: null, role: "vendor_owner", organization_name: "Caterer Co" },
    ],
    generated_at: "2026-08-09T00:00:00Z",
  };
}

test("audienceForRole maps every RBAC role to a defined packet audience", () => {
  assert.equal(audienceForRole("event_owner"), "full");
  assert.equal(audienceForRole("planner"), "full");
  assert.equal(audienceForRole("venue"), "venue");
  assert.equal(audienceForRole("vendor_owner"), "vendor");
  assert.equal(audienceForRole("vendor_staff"), "vendor_staff");
  assert.equal(audienceForRole("sponsor"), "sponsor");
  // finance, guest_manager, event_staff, read_only all fall back to the
  // same narrow default -- the itinerary system has no finer role for them.
  assert.equal(audienceForRole("finance"), "event_staff");
  assert.equal(audienceForRole("guest_manager"), "event_staff");
  assert.equal(audienceForRole("event_staff"), "event_staff");
  assert.equal(audienceForRole("read_only"), "event_staff");
});

test("event_owner / planner get the full packet, including every vendor's quantities and all contacts", () => {
  const snapshot = fixtureSnapshot();
  const p = projectPacket(snapshot, "event_owner", "org-owner");
  assert.equal(p.audience, "full");
  assert.equal(p.vendor_assignments?.length, 2);
  assert.equal(p.my_final_quantity?.length, 2);
  assert.equal(p.key_contacts.length, 4);
  assert.equal(p.venue.notes, "Loading dock code 4471 -- sensitive logistics detail");
});

test("vendor A cannot see vendor B's final quantity in their own projection", () => {
  const snapshot = fixtureSnapshot();
  const asCaterer = projectPacket(snapshot, "vendor_owner", "org-caterer");
  assert.equal(asCaterer.my_final_quantity?.length, 1);
  assert.equal(asCaterer.my_final_quantity?.[0].organization_id, "org-caterer");
  assert.equal(
    asCaterer.my_final_quantity?.some((q) => q.organization_id === "org-av"),
    false,
  );

  const asAv = projectPacket(snapshot, "vendor_owner", "org-av");
  assert.equal(asAv.my_final_quantity?.length, 1);
  assert.equal(asAv.my_final_quantity?.[0].organization_id, "org-av");
});

test("a vendor with no resolvable org id gets an empty my_final_quantity, not another vendor's data", () => {
  const snapshot = fixtureSnapshot();
  const p = projectPacket(snapshot, "vendor_owner", null);
  assert.deepEqual(p.my_final_quantity, []);
});

test("vendor_staff does not see the vendor roster (vendor_assignments), unlike vendor_owner", () => {
  const snapshot = fixtureSnapshot();
  const owner = projectPacket(snapshot, "vendor_owner", "org-caterer");
  const staff = projectPacket(snapshot, "vendor_staff", "org-caterer");
  assert.notEqual(owner.vendor_assignments, null);
  assert.equal(staff.vendor_assignments, null);
  // Both still see their own vendor's own final quantity.
  assert.equal(staff.my_final_quantity?.length, 1);
});

test("venue sees the vendor roster and venue notes but never any vendor's final quantity", () => {
  const snapshot = fixtureSnapshot();
  const p = projectPacket(snapshot, "venue", "org-grandhall");
  assert.equal(p.audience, "venue");
  assert.notEqual(p.vendor_assignments, null);
  assert.equal(p.my_final_quantity, null);
  assert.equal(p.venue.notes, "Loading dock code 4471 -- sensitive logistics detail");
});

test("sponsor gets no vendor roster, no vendor quantities, and no venue logistics notes", () => {
  const snapshot = fixtureSnapshot();
  const p = projectPacket(snapshot, "sponsor", null);
  assert.equal(p.audience, "sponsor");
  assert.equal(p.vendor_assignments, null);
  assert.equal(p.my_final_quantity, null);
  assert.equal(p.venue.notes, null);
  // Sponsor still sees basic venue identity (name/address) for logistics.
  assert.equal(p.venue.name, "Grand Hall");
  // Setup/access logistics (loading dock, vendor entrance, restrictions)
  // withheld from the minimal sponsor projection -- same audience gate as notes.
  assert.equal(p.venue.loading_dock, null);
  assert.equal(p.venue.vendor_entrance, null);
  assert.equal(p.venue.restrictions, null);
});

test("vendor and venue see full setup/access logistics, needed for day-of coordination", () => {
  const snapshot = fixtureSnapshot();
  const vendor = projectPacket(snapshot, "vendor_owner", "org-caterer");
  assert.equal(vendor.venue.loading_dock, "Rear alley, dock B");
  assert.equal(vendor.venue.vendor_entrance, "Service door 2");
  assert.equal(vendor.venue.restrictions, "No open flame");

  const venue = projectPacket(snapshot, "venue", "org-grandhall");
  assert.equal(venue.venue.parking_info, "Valet at the west entrance");
  assert.equal(venue.venue.guest_entrance, "Main lobby");
});

test("event_staff (and the finance/guest_manager/read_only fallback) gets the same minimal projection as sponsor", () => {
  const snapshot = fixtureSnapshot();
  const staff = projectPacket(snapshot, "event_staff", null);
  const finance = projectPacket(snapshot, "finance", null);
  assert.deepEqual(staff, finance);
  assert.equal(staff.vendor_assignments, null);
  assert.equal(staff.venue.notes, null);
});

test("key_contacts is always narrowed to event_owner/planner (+ venue for the venue audience) outside 'full'", () => {
  const snapshot = fixtureSnapshot();
  const vendor = projectPacket(snapshot, "vendor_owner", "org-caterer");
  assert.equal(vendor.key_contacts.every((c) => c.role === "event_owner" || c.role === "planner"), true);
  // The vendor contact row must never leak to another vendor's projection.
  assert.equal(vendor.key_contacts.some((c) => c.role === "vendor_owner"), false);

  const venue = projectPacket(snapshot, "venue", "org-grandhall");
  assert.equal(venue.key_contacts.some((c) => c.role === "venue"), true);
});

// --- scopeSnapshotForDiff: the WHAT CHANGED diff must never leak more than
// the recipient's own projection would show (a real gap found while wiring
// the diff into the packet PDF's Change Summary section -- the raw,
// unprojected diffPacketVersion() would otherwise expose another vendor's
// quantity change, the full roster, and the full contact list). ---

test("scopeSnapshotForDiff: a vendor's diff never reveals another vendor's quantity change", () => {
  const before = fixtureSnapshot();
  const after: ExecutionPacketSnapshot = {
    ...before,
    vendor_final_quantities: [
      { organization_id: "org-caterer", vendor_name: "Caterer Co", scope: "catering", version: 1, quantity: "488", unit: "meals", discrepancy: "13", discrepancy_status: "over" },
      { organization_id: "org-av", vendor_name: "AV Co", scope: "av", version: 2, quantity: "480", unit: "seats", discrepancy: "5", discrepancy_status: "over" },
    ],
  };
  // Vendor B (AV Co) changed their own quantity -- Vendor A (Caterer) must not see it.
  const scopedBefore = scopeSnapshotForDiff(before, "vendor_owner", "org-caterer");
  const scopedAfter = scopeSnapshotForDiff(after, "vendor_owner", "org-caterer");
  const diff = diffPacketSnapshots(scopedBefore, scopedAfter);
  assert.equal(diff.some((d) => d.label.includes("AV CO")), false);

  // AV Co's own projection DOES see their own change.
  const avBefore = scopeSnapshotForDiff(before, "vendor_owner", "org-av");
  const avAfter = scopeSnapshotForDiff(after, "vendor_owner", "org-av");
  const avDiff = diffPacketSnapshots(avBefore, avAfter);
  assert.equal(avDiff.some((d) => d.label.includes("AV CO")), true);
});

test("scopeSnapshotForDiff: sponsor's diff never reveals vendor roster adds/removes or venue notes changes", () => {
  const before = fixtureSnapshot();
  const after: ExecutionPacketSnapshot = {
    ...before,
    vendor_assignments: [
      ...before.vendor_assignments,
      { organization_id: "org-new-vendor", vendor_name: "New Vendor Co", role: "vendor_owner", status: "active" },
    ],
    venue: { ...before.venue, notes: "Updated sensitive loading dock code 9911" },
  };
  const scopedBefore = scopeSnapshotForDiff(before, "sponsor", null);
  const scopedAfter = scopeSnapshotForDiff(after, "sponsor", null);
  const diff = diffPacketSnapshots(scopedBefore, scopedAfter);
  assert.equal(diff.some((d) => d.category === "vendor"), false);
  assert.equal(diff.some((d) => d.category === "logistics"), false);

  // The same underlying change IS visible to the owner/planner's own diff.
  const ownerDiff = diffPacketSnapshots(before, after);
  assert.equal(ownerDiff.some((d) => d.category === "vendor"), true);
  assert.equal(ownerDiff.some((d) => d.category === "logistics"), true);
});

test("scopeSnapshotForDiff: a vendor's diff never reveals another vendor's contact being added or removed", () => {
  const before = fixtureSnapshot();
  const after: ExecutionPacketSnapshot = {
    ...before,
    key_contacts: [
      ...before.key_contacts,
      { user_id: "u-new-vendor", name: "New Vendor Person", email: "new@vendor.local", phone: null, role: "vendor_owner", organization_name: "New Vendor Co" },
    ],
  };
  const scopedBefore = scopeSnapshotForDiff(before, "vendor_owner", "org-caterer");
  const scopedAfter = scopeSnapshotForDiff(after, "vendor_owner", "org-caterer");
  const diff = diffPacketSnapshots(scopedBefore, scopedAfter);
  assert.equal(diff.some((d) => d.category === "contact"), false);
});

test("schedule_items is filtered per audience using the itinerary system's own by_role views", () => {
  const snapshot = fixtureSnapshot();
  const vendorItems = projectPacket(snapshot, "vendor_owner", "org-caterer").schedule_items;
  assert.equal(vendorItems.some((i) => i.key === "b"), true); // vendor-only item visible
  assert.equal(vendorItems.some((i) => i.key === "c"), false); // venue-only item NOT visible

  const venueItems = projectPacket(snapshot, "venue", "org-grandhall").schedule_items;
  assert.equal(venueItems.some((i) => i.key === "c"), true);
  assert.equal(venueItems.some((i) => i.key === "b"), false);

  const sponsorItems = projectPacket(snapshot, "sponsor", null).schedule_items;
  assert.equal(sponsorItems.length, 1);
  assert.equal(sponsorItems[0].key, "a");

  const fullItems = projectPacket(snapshot, "event_owner", null).schedule_items;
  assert.equal(fullItems.length, 3);
});

test("scopeSnapshotForDiff narrows schedule.items to the audience's own by_role view, not the full Run of Show", () => {
  const snapshot = fixtureSnapshot();
  const scopedForVendor = scopeSnapshotForDiff(snapshot, "vendor_owner", "org-caterer");
  assert.equal(scopedForVendor.schedule.items.some((i) => i.key === "b"), true);
  assert.equal(scopedForVendor.schedule.items.some((i) => i.key === "c"), false); // venue-only item hidden

  const scopedForSponsor = scopeSnapshotForDiff(snapshot, "sponsor", null);
  assert.equal(scopedForSponsor.schedule.items.length, 1);
  assert.equal(scopedForSponsor.schedule.items[0].key, "a");

  const scopedForOwner = scopeSnapshotForDiff(snapshot, "event_owner", null);
  assert.equal(scopedForOwner.schedule.items.length, 3);
});

// --- vendor_schedule (completion phase, Part 3): the unified Time/Vendor/
// Action/Location/Contact/Status arrival table, derived from
// responsible_org_id itinerary items. Vendor isolation applies here exactly
// like everywhere else -- a vendor must only ever see their own rows. ---

function snapshotWithVendorScheduleItems(): ExecutionPacketSnapshot {
  const base = fixtureSnapshot();
  return {
    ...base,
    schedule: {
      ...base.schedule,
      items: [
        ...base.schedule.items,
        { key: "d", title: "Caterer load-in", description: null, category: "load_in", start_time: "2026-11-05T15:00:00Z", end_time: null, location: "Dock B", owner_role: "vendor", owner_label: null, source: "manual", source_ref: null, status: "planned", responsible_org_id: "org-caterer" },
        { key: "e", title: "AV load-in", description: null, category: "load_in", start_time: "2026-11-05T14:00:00Z", end_time: null, location: "Dock A", owner_role: "vendor", owner_label: null, source: "manual", source_ref: null, status: "planned", responsible_org_id: "org-av" },
      ],
    },
  };
}

test("vendor_schedule is derived from responsible_org_id items and audience-narrowed the same way vendor isolation is enforced everywhere else", () => {
  const snapshot = snapshotWithVendorScheduleItems();

  const full = projectPacket(snapshot, "event_owner", null);
  assert.equal(full.vendor_schedule.length, 2);
  // Sorted by start_time: AV (14:00) before Caterer (15:00).
  assert.equal(full.vendor_schedule[0].vendor_org_id, "org-av");
  assert.equal(full.vendor_schedule[0].vendor_name, "AV Co");
  assert.equal(full.vendor_schedule[0].contact_phone, "555-0122");

  const venue = projectPacket(snapshot, "venue", "org-grandhall");
  assert.equal(venue.vendor_schedule.length, 2);

  const caterer = projectPacket(snapshot, "vendor_owner", "org-caterer");
  assert.equal(caterer.vendor_schedule.length, 1);
  assert.equal(caterer.vendor_schedule[0].vendor_org_id, "org-caterer");
  assert.equal(
    caterer.vendor_schedule.some((v) => v.vendor_org_id === "org-av"),
    false,
  );

  const sponsor = projectPacket(snapshot, "sponsor", null);
  assert.deepEqual(sponsor.vendor_schedule, []);
  const eventStaff = projectPacket(snapshot, "event_staff", null);
  assert.deepEqual(eventStaff.vendor_schedule, []);
});

test("scopeSnapshotForDiff narrows vendor_contacts to only the orgs visible in the audience's own vendor_schedule", () => {
  const snapshot = snapshotWithVendorScheduleItems();

  const scopedForCaterer = scopeSnapshotForDiff(snapshot, "vendor_owner", "org-caterer");
  assert.equal(scopedForCaterer.vendor_contacts.length, 1);
  assert.equal(scopedForCaterer.vendor_contacts[0].organization_id, "org-caterer");

  const scopedForOwner = scopeSnapshotForDiff(snapshot, "event_owner", null);
  assert.equal(scopedForOwner.vendor_contacts.length, 2);

  const scopedForSponsor = scopeSnapshotForDiff(snapshot, "sponsor", null);
  assert.deepEqual(scopedForSponsor.vendor_contacts, []);
});
