/**
 * WHAT CHANGED diff between two Execution Packet snapshots (Final Event
 * Schedule / Event Execution Packet completion phase, Part 6, 2026-08-09).
 *
 * Pure, no DB, no config -- matches the lib/packetProjection.ts convention.
 * Deliberately NOT a raw JSON diff: every entry is a categorized,
 * human-readable "FIELD: OLD -> NEW" comparison over the snapshot's own
 * structured fields, because a JSON diff of two large nested objects is not
 * something a recipient should have to read to find out their arrival time
 * changed.
 *
 * The "sponsor" category exists in the type because the spec names it, but
 * is never populated here: ExecutionPacketSnapshot has no sponsor-specific
 * structured field yet (no sponsor activation data model exists in this
 * codebase), so there is nothing real to diff for it -- an unpopulated
 * category is honest; inventing sponsor fields to fill it would not be.
 *
 * Zero em dashes.
 */
import type { ExecutionPacketSnapshot } from "../db/executionPacket.js";

export type PacketDiffCategory =
  | "attendance"
  | "schedule"
  | "venue"
  | "vendor"
  | "quantity"
  | "location"
  | "contact"
  | "logistics"
  | "document"
  | "sponsor";

export type PacketDiffEntry = {
  category: PacketDiffCategory;
  label: string;
  old_value: string;
  new_value: string;
};

function fmt(v: unknown): string {
  if (v == null || v === "") return "Not set";
  return String(v);
}

function fmtDate(v: string | null): string {
  if (!v) return "Not set";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** A human clock time ("7:15 PM") for Run of Show item changes -- the raw
 *  ISO timestamp fmtDate() uses elsewhere is correct but not what a
 *  recipient reads as "moved from 7:15 PM to 7:30 PM". UTC only (no
 *  per-event timezone is threaded into this pure diff function); good
 *  enough for a human-readable change summary, not a scheduling source of
 *  truth. */
function fmtClock(v: string | null): string {
  if (!v) return "unscheduled";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
}

/** Compare two snapshots of the SAME event and produce a categorized, human-readable diff. */
export function diffPacketSnapshots(
  before: ExecutionPacketSnapshot,
  after: ExecutionPacketSnapshot,
): PacketDiffEntry[] {
  const entries: PacketDiffEntry[] = [];

  // ---- Attendance -----------------------------------------------------------
  if ((before.final_count?.count ?? null) !== (after.final_count?.count ?? null)) {
    entries.push({
      category: "attendance",
      label: "FINAL COUNT",
      old_value: fmt(before.final_count?.count),
      new_value: fmt(after.final_count?.count),
    });
  }

  // ---- Schedule (event-level timing) -----------------------------------------
  const scheduleFields: Array<[keyof ExecutionPacketSnapshot["event"], string]> = [
    ["date_time", "EVENT START"],
    ["end_at", "EVENT END"],
    ["load_in_at", "LOAD-IN"],
    ["setup_at", "SETUP"],
    ["rehearsal_at", "REHEARSAL"],
    ["vendor_call_at", "VENDOR CALL"],
    ["doors_at", "DOORS"],
    ["strike_at", "STRIKE"],
  ];
  for (const [field, label] of scheduleFields) {
    const b = before.event[field];
    const a = after.event[field];
    if (b !== a) {
      entries.push({ category: "schedule", label, old_value: fmtDate(b), new_value: fmtDate(a) });
    }
  }
  if (before.event.status !== after.event.status) {
    entries.push({
      category: "schedule",
      label: "EVENT STATUS",
      old_value: fmt(before.event.status),
      new_value: fmt(after.event.status),
    });
  }

  // ---- Venue / Location / Logistics ------------------------------------------
  if (before.venue.id !== after.venue.id || before.venue.name !== after.venue.name) {
    entries.push({ category: "venue", label: "VENUE", old_value: fmt(before.venue.name), new_value: fmt(after.venue.name) });
  }
  if (before.venue.address !== after.venue.address) {
    entries.push({ category: "location", label: "VENUE ADDRESS", old_value: fmt(before.venue.address), new_value: fmt(after.venue.address) });
  }
  if (before.venue.space !== after.venue.space) {
    entries.push({ category: "location", label: "VENUE SPACE", old_value: fmt(before.venue.space), new_value: fmt(after.venue.space) });
  }
  if (before.venue.notes !== after.venue.notes) {
    entries.push({ category: "logistics", label: "VENUE NOTES", old_value: fmt(before.venue.notes), new_value: fmt(after.venue.notes) });
  }

  // ---- Vendor roster (added / removed) ---------------------------------------
  const beforeVendorIds = new Set(before.vendor_assignments.map((v) => v.organization_id));
  const afterVendorIds = new Set(after.vendor_assignments.map((v) => v.organization_id));
  for (const v of after.vendor_assignments) {
    if (!beforeVendorIds.has(v.organization_id)) {
      entries.push({ category: "vendor", label: v.vendor_name.toUpperCase(), old_value: "Not on roster", new_value: `Added (${v.role ?? "vendor"})` });
    }
  }
  for (const v of before.vendor_assignments) {
    if (!afterVendorIds.has(v.organization_id)) {
      entries.push({ category: "vendor", label: v.vendor_name.toUpperCase(), old_value: `On roster (${v.role ?? "vendor"})`, new_value: "Removed" });
    }
  }

  // ---- Vendor final quantities (per vendor+scope) ----------------------------
  const qKey = (q: ExecutionPacketSnapshot["vendor_final_quantities"][number]) => `${q.organization_id}:${q.scope}`;
  const beforeQ = new Map(before.vendor_final_quantities.map((q) => [qKey(q), q]));
  const afterQ = new Map(after.vendor_final_quantities.map((q) => [qKey(q), q]));
  for (const [key, aq] of afterQ) {
    const bq = beforeQ.get(key);
    if (!bq || bq.quantity !== aq.quantity || bq.unit !== aq.unit) {
      entries.push({
        category: "quantity",
        label: `${aq.vendor_name.toUpperCase()} ${aq.scope.toUpperCase()}`,
        old_value: bq ? `${bq.quantity} ${bq.unit}` : "Not submitted",
        new_value: `${aq.quantity} ${aq.unit}`,
      });
    }
  }

  // ---- Key contacts (added / removed) ----------------------------------------
  const beforeContactIds = new Set(before.key_contacts.map((c) => c.user_id));
  const afterContactIds = new Set(after.key_contacts.map((c) => c.user_id));
  for (const c of after.key_contacts) {
    if (!beforeContactIds.has(c.user_id)) {
      entries.push({ category: "contact", label: `${c.role.toUpperCase()} CONTACT`, old_value: "Not assigned", new_value: fmt(c.name ?? c.email) });
    }
  }
  for (const c of before.key_contacts) {
    if (!afterContactIds.has(c.user_id)) {
      entries.push({ category: "contact", label: `${c.role.toUpperCase()} CONTACT`, old_value: fmt(c.name ?? c.email), new_value: "Removed" });
    }
  }

  // ---- Run of Show items (added / removed / time / duration / location / ----
  // ---- responsible vendor changed) -------------------------------------------
  // Matched by `key`, the stable identifier buildItinerary() already gives
  // every item (auto-derived items use a fixed key like "auto_doors";
  // persisted items use `item_<id>`), so a manual edit to an existing item
  // is recognized as a change to THAT item rather than a remove+add pair.
  // "Ordering change" and "dependency change" from the spec are not
  // implemented as separate diff entries: item order is always derived
  // from start_time (so a pure reorder is already captured as a time
  // change), and there is no dependency field in the itinerary_items data
  // model to diff -- inventing one here would not be honest.
  const beforeItems = new Map(before.schedule.items.map((i) => [i.key, i]));
  const afterItems = new Map(after.schedule.items.map((i) => [i.key, i]));
  for (const [key, item] of afterItems) {
    if (!beforeItems.has(key)) {
      entries.push({
        category: "schedule",
        label: `RUN OF SHOW: ${item.title}`,
        old_value: "Not scheduled",
        new_value: item.start_time ? `Added (${fmtClock(item.start_time)})` : "Added",
      });
    }
  }
  for (const [key, item] of beforeItems) {
    if (!afterItems.has(key)) {
      entries.push({
        category: "schedule",
        label: `RUN OF SHOW: ${item.title}`,
        old_value: item.start_time ? `Scheduled (${fmtClock(item.start_time)})` : "Scheduled",
        new_value: "Removed",
      });
    }
  }
  for (const [key, a] of afterItems) {
    const b = beforeItems.get(key);
    if (!b) continue;
    if (b.start_time !== a.start_time) {
      entries.push({
        category: "schedule",
        label: `${a.title.toUpperCase()} TIME`,
        old_value: fmtClock(b.start_time),
        new_value: fmtClock(a.start_time),
      });
    }
    if (b.end_time !== a.end_time) {
      entries.push({
        category: "schedule",
        label: `${a.title.toUpperCase()} DURATION`,
        old_value: fmtClock(b.end_time),
        new_value: fmtClock(a.end_time),
      });
    }
    if (b.location !== a.location) {
      entries.push({
        category: "location",
        label: `${a.title.toUpperCase()} LOCATION`,
        old_value: fmt(b.location),
        new_value: fmt(a.location),
      });
    }
    if (b.responsible_org_id !== a.responsible_org_id) {
      entries.push({
        category: "vendor",
        label: `${a.title.toUpperCase()} RESPONSIBLE VENDOR`,
        old_value: fmt(b.responsible_org_id),
        new_value: fmt(a.responsible_org_id),
      });
    }
  }

  // ---- Documents (floor plans) -----------------------------------------------
  if (before.floorplans.length !== after.floorplans.length) {
    entries.push({
      category: "document",
      label: "FLOOR PLANS",
      old_value: `${before.floorplans.length} file(s)`,
      new_value: `${after.floorplans.length} file(s)`,
    });
  }

  return entries;
}
