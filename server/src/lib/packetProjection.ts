/**
 * Role-specific Event Execution Packet projections (Final Event Schedule /
 * Event Execution Packet completion phase, Part 4, 2026-08-09).
 *
 * Pure, no DB, no config -- matches the lib/pricingMath.ts / lib/quoteMath.ts
 * / lib/eventRoles.ts / lib/quantityComparison.ts convention. All type
 * imports below are `import type`, fully erased at compile time, so this
 * file never actually loads db/executionPacket.ts (which imports pool.js)
 * at runtime -- that is what keeps this independently unit-testable under
 * the strip-types test loader.
 *
 * The master snapshot is not automatically appropriate for every recipient:
 * projectPacket() narrows it per audience. Backend-enforced -- the caller
 * (db/executionPacket.ts) always resolves the actor's REAL event role via
 * getEventRole and always projects; there is no client-selectable "give me
 * the full packet" parameter anywhere in the request surface.
 *
 * Zero em dashes.
 */
import type { EventRole } from "./eventRoles.js";
import type {
  ExecutionPacketSnapshot,
  KeyContact,
  VendorAssignment,
  FloorplanRef,
} from "../db/executionPacket.js";

export type PacketAudience = "full" | "venue" | "vendor" | "vendor_staff" | "sponsor" | "event_staff";

/** Map an event_members role (lib/eventRoles.ts) onto a packet audience. */
export function audienceForRole(role: EventRole): PacketAudience {
  switch (role) {
    case "event_owner":
    case "planner":
      return "full";
    case "venue":
      return "venue";
    case "vendor_owner":
      return "vendor";
    case "vendor_staff":
      return "vendor_staff";
    case "sponsor":
      return "sponsor";
    // finance, guest_manager, event_staff, read_only: none of these map to a
    // richer itinerary role than "all" in the existing itinerary system
    // (ITINERARY_ROLES has no finance/sponsor/guest_manager/staff
    // distinction), so they all get the same narrow, safe-default
    // projection rather than a fabricated finer grain the underlying
    // schedule data cannot actually support.
    default:
      return "event_staff";
  }
}

// The itinerary system's role set (server/src/db/itinerary.ts) is coarser
// than the event-member RBAC role set -- this is the honest mapping between
// them, not a 1:1 correspondence.
const SCHEDULE_ROLE_FOR_AUDIENCE: Record<
  PacketAudience,
  "all" | "client" | "venue" | "vendor" | "installer" | "planner"
> = {
  full: "planner",
  venue: "venue",
  vendor: "vendor",
  vendor_staff: "vendor",
  sponsor: "all",
  event_staff: "all",
};

export type PacketProjection = {
  audience: PacketAudience;
  event: ExecutionPacketSnapshot["event"];
  venue: {
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    space: string | null;
    /** Freeform venue_notes may carry sensitive logistics -- withheld from
     *  sponsor/event_staff, who have no operational need for it. */
    notes: string | null;
    /** Setup/access logistics -- same audience gate as notes: an
     *  operational necessity for full/venue/vendor, not for sponsor or the
     *  minimal event_staff view. */
    access_time: string | null;
    parking_info: string | null;
    loading_dock: string | null;
    vendor_entrance: string | null;
    guest_entrance: string | null;
    restrictions: string | null;
  };
  schedule_items: ExecutionPacketSnapshot["schedule"]["items"];
  floorplans: FloorplanRef[];
  vendor_assignments: VendorAssignment[] | null;
  final_count: ExecutionPacketSnapshot["final_count"];
  /** The viewer's OWN vendor's final quantities only -- never another
   *  vendor's. Null for non-vendor audiences. */
  my_final_quantity: ExecutionPacketSnapshot["vendor_final_quantities"] | null;
  key_contacts: KeyContact[];
  generated_at: string;
};

/**
 * Narrow a full snapshot to what a given audience may see. ownOrgId scopes
 * "my final quantity" to the viewer's own vendor org -- never resolved from
 * anything client-supplied, always the actor's own org id from the caller.
 */
export function projectPacket(
  snapshot: ExecutionPacketSnapshot,
  role: EventRole,
  ownOrgId: string | null,
): PacketProjection {
  const audience = audienceForRole(role);
  const scheduleRole = SCHEDULE_ROLE_FOR_AUDIENCE[audience];
  const schedule_items =
    audience === "full" ? snapshot.schedule.items : snapshot.schedule.by_role[scheduleRole] ?? [];

  // Contacts: owner/planner always visible (who to escalate to); a venue
  // audience additionally sees the venue-role contact; everyone else is
  // limited to owner/planner -- no cross-vendor contact list leakage.
  const visibleContactRoles = new Set<string>(["event_owner", "planner"]);
  if (audience === "venue") visibleContactRoles.add("venue");
  const key_contacts = snapshot.key_contacts.filter((c) => visibleContactRoles.has(c.role));

  const minimalAudience = audience === "sponsor" || audience === "event_staff";
  const venue = {
    id: snapshot.venue.id,
    name: snapshot.venue.name,
    address: snapshot.venue.address,
    city: snapshot.venue.city,
    region: snapshot.venue.region,
    space: snapshot.venue.space,
    notes: minimalAudience ? null : snapshot.venue.notes,
    access_time: minimalAudience ? null : snapshot.venue.access_time,
    parking_info: minimalAudience ? null : snapshot.venue.parking_info,
    loading_dock: minimalAudience ? null : snapshot.venue.loading_dock,
    vendor_entrance: minimalAudience ? null : snapshot.venue.vendor_entrance,
    guest_entrance: minimalAudience ? null : snapshot.venue.guest_entrance,
    restrictions: minimalAudience ? null : snapshot.venue.restrictions,
  };

  if (audience === "full") {
    return {
      audience,
      event: snapshot.event,
      venue,
      schedule_items,
      floorplans: snapshot.floorplans,
      vendor_assignments: snapshot.vendor_assignments,
      final_count: snapshot.final_count,
      my_final_quantity: snapshot.vendor_final_quantities,
      key_contacts: snapshot.key_contacts,
      generated_at: snapshot.generated_at,
    };
  }

  const myQuantities = ownOrgId
    ? snapshot.vendor_final_quantities.filter((q) => q.organization_id === ownOrgId)
    : [];

  if (audience === "venue") {
    return {
      audience,
      event: snapshot.event,
      venue,
      schedule_items,
      floorplans: snapshot.floorplans,
      vendor_assignments: snapshot.vendor_assignments,
      final_count: snapshot.final_count,
      my_final_quantity: null,
      key_contacts,
      generated_at: snapshot.generated_at,
    };
  }

  if (audience === "vendor" || audience === "vendor_staff") {
    return {
      audience,
      event: snapshot.event,
      venue,
      schedule_items,
      floorplans: snapshot.floorplans,
      // vendor_staff does not need the full roster of other vendors --
      // vendor (owner) does, for day-of coordination.
      vendor_assignments: audience === "vendor" ? snapshot.vendor_assignments : null,
      final_count: snapshot.final_count,
      my_final_quantity: myQuantities,
      key_contacts,
      generated_at: snapshot.generated_at,
    };
  }

  // sponsor / event_staff: minimal projection. No vendor roster, no other
  // vendors' quantities, no venue_notes (handled above).
  return {
    audience,
    event: snapshot.event,
    venue,
    schedule_items,
    floorplans: snapshot.floorplans,
    vendor_assignments: null,
    final_count: snapshot.final_count,
    my_final_quantity: null,
    key_contacts,
    generated_at: snapshot.generated_at,
  };
}

/**
 * Reshape a full snapshot back into an ExecutionPacketSnapshot-shaped
 * object narrowed to what `role`/`ownOrgId` may see, by delegating entirely
 * to projectPacket()'s existing audience decisions rather than duplicating
 * them. Exists so diffPacketSnapshots (lib/packetDiff.ts) can be fed two
 * SCOPED snapshots instead of two raw ones -- otherwise a WHAT CHANGED diff
 * would leak other vendors' quantity changes, the full vendor roster, and
 * the full contact list to any event member who can call the diff
 * endpoint, defeating the same isolation projectPacket enforces everywhere
 * else (a real gap found while wiring the diff into the Execution Packet
 * PDF's Change Summary section).
 */
export function scopeSnapshotForDiff(
  snapshot: ExecutionPacketSnapshot,
  role: EventRole,
  ownOrgId: string | null,
): ExecutionPacketSnapshot {
  const projection = projectPacket(snapshot, role, ownOrgId);
  return {
    event: snapshot.event,
    venue: {
      id: projection.venue.id,
      name: projection.venue.name,
      address: projection.venue.address,
      city: projection.venue.city,
      region: projection.venue.region,
      space: projection.venue.space,
      notes: projection.venue.notes,
      access_time: projection.venue.access_time,
      parking_info: projection.venue.parking_info,
      loading_dock: projection.venue.loading_dock,
      vendor_entrance: projection.venue.vendor_entrance,
      guest_entrance: projection.venue.guest_entrance,
      restrictions: projection.venue.restrictions,
    },
    // Narrowed to exactly the same items projectPacket() would show this
    // audience (schedule_items), not the full unfiltered item list -- a
    // Run of Show diff (lib/packetDiff.ts) built on top of this must never
    // surface a change to an item outside the viewer's own audience.
    schedule: { ...snapshot.schedule, items: projection.schedule_items },
    floorplans: projection.floorplans,
    vendor_assignments: projection.vendor_assignments ?? [],
    final_count: projection.final_count,
    vendor_final_quantities: projection.my_final_quantity ?? [],
    key_contacts: projection.key_contacts,
    generated_at: snapshot.generated_at,
  };
}
