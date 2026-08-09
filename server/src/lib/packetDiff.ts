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
