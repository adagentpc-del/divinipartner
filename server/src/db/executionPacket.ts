/**
 * Final Event Schedule / Event Execution Packet FOUNDATION (Divini Partners
 * 63-section Event Operations spec, Phase A item 8, 2026-08-09).
 *
 * buildExecutionPacket() is a pure aggregator: it assembles a packet purely
 * by reading already-existing systems (buildItinerary for schedule/Run of
 * Show, events for venue/venue_space/venue_notes, floorplans, event_vendors
 * + event_members for vendor assignments, event_final_counts +
 * vendor_final_quantities for counts, event_members joined to users for key
 * contacts). Nothing here is a new source of truth, and nothing is
 * fabricated -- any missing piece (no venue set, no final count set yet)
 * shows up as null/empty in the snapshot rather than an invented value.
 *
 * generatePacketVersion() is the only write path and, like every other
 * versioned record in this branch, always inserts a new version (marking
 * the previous one 'superseded') rather than overwriting -- so a vendor who
 * saw packet v2 can always be shown exactly what v2 said.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent, type EventRow } from "./events.js";
import { buildItinerary, type BuiltItinerary } from "./itinerary.js";
import { recordEventChange } from "./eventChanges.js";
import { getEventRole } from "./eventMembers.js";
import type { EventRole } from "../lib/eventRoles.js";

/**
 * node-pg returns `timestamptz` columns as native Date objects, not
 * strings, even though EventRow's TypeScript type declares them as
 * `string | null` (the type matches what a JSON response over the wire
 * actually looks like, since Express's res.json() implicitly stringifies
 * Dates -- but that stringification never happens for values compared
 * in-process before serialization). A snapshot stored to jsonb and read
 * back is always a plain string; a snapshot freshly built from a raw
 * EventRow was a Date object until this coercion. Without it,
 * diffPacketSnapshots() (lib/packetDiff.ts) would report every single
 * timestamp field as "changed" on every comparison between a stored
 * snapshot and a live rebuild, even when nothing actually changed --
 * exactly the bug packetInvalidation.ts's checkAndMarkPacketStale()
 * exposed live-testing Part 18. Always normalize to ISO string (or null)
 * here so a snapshot's shape never depends on whether it just came out of
 * the DB raw or round-tripped through jsonb.
 */
function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export type KeyContact = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  organization_name: string | null;
};

export type VendorAssignment = {
  organization_id: string;
  vendor_name: string;
  role: string | null;
  status: string | null;
};

export type FloorplanRef = {
  id: string;
  name: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  is_primary: boolean | null;
};

export type ExecutionPacketSnapshot = {
  event: {
    id: string;
    name: string;
    status: string | null;
    date_time: string | null;
    end_at: string | null;
    load_in_at: string | null;
    setup_at: string | null;
    rehearsal_at: string | null;
    vendor_call_at: string | null;
    doors_at: string | null;
    strike_at: string | null;
    timezone: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
  venue: {
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    space: string | null;
    notes: string | null;
    access_time: string | null;
    parking_info: string | null;
    loading_dock: string | null;
    vendor_entrance: string | null;
    guest_entrance: string | null;
    restrictions: string | null;
  };
  schedule: BuiltItinerary;
  floorplans: FloorplanRef[];
  vendor_assignments: VendorAssignment[];
  final_count: { version: number; count: number; discrepancy: number | null } | null;
  vendor_final_quantities: Array<{
    organization_id: string;
    vendor_name: string;
    scope: string;
    version: number;
    quantity: string;
    unit: string;
    discrepancy: string | null;
    discrepancy_status: string | null;
  }>;
  key_contacts: KeyContact[];
  generated_at: string;
};

/** Assemble the packet's current data. Read-only, no persistence. */
export async function buildExecutionPacket(
  actor: Actor,
  eventId: string,
): Promise<ExecutionPacketSnapshot> {
  const ev: EventRow = await getEvent(actor, eventId);

  const venue = ev.venue_id
    ? await q1<{ id: string; name: string; address: string | null; city: string | null; region: string | null }>(
        `select id, name, address, city, region from venues where id = $1`,
        [ev.venue_id],
      )
    : null;

  const schedule = await buildItinerary(actor, eventId);

  const floorplans = await q<FloorplanRef>(
    `select id, name, file_url, thumbnail_url, is_primary
       from floorplans where event_id = $1
      order by is_primary desc nulls last, created_at asc`,
    [eventId],
  );

  // Union event_vendors (org-level attachment: owner-added or quote self-
  // attach) with event_members rows carrying a vendor role -- a vendor who
  // joined purely through the Phase A item 1 invitation flow (no
  // addEventVendor call yet, no quote submitted yet) has no event_vendors
  // row at all, and without this union the packet's vendor list would
  // silently omit them even though they are a real, active member.
  const vendor_assignments = await q<VendorAssignment>(
    `select organization_id, vendor_name, role, status from (
       select ev.organization_id, coalesce(o.name, 'Vendor') as vendor_name, ev.role, ev.status,
              ev.created_at
         from event_vendors ev
         left join organizations o on o.id = ev.organization_id
        where ev.event_id = $1
       union
       select em.organization_id, coalesce(o.name, 'Vendor') as vendor_name, em.role, em.status,
              em.created_at
         from event_members em
         left join organizations o on o.id = em.organization_id
        where em.event_id = $1 and em.status = 'active' and em.role in ('vendor_owner','vendor_staff')
          and em.organization_id is not null
     ) combined
     order by created_at asc`,
    [eventId],
  );

  const finalCountRow = await q1<{ version: number; count: number; discrepancy: number | null }>(
    `select version, count, discrepancy from event_final_counts
      where event_id = $1 order by version desc limit 1`,
    [eventId],
  );

  const vendorQuantities = await q<{
    organization_id: string;
    vendor_name: string;
    scope: string;
    version: number;
    quantity: string;
    unit: string;
    discrepancy: string | null;
    discrepancy_status: string | null;
  }>(
    `select distinct on (vfq.vendor_id, vfq.scope)
            vfq.organization_id, coalesce(o.name, 'Vendor') as vendor_name, vfq.scope, vfq.version,
            vfq.quantity, vfq.unit, vfq.discrepancy, vfq.discrepancy_status
       from vendor_final_quantities vfq
       left join organizations o on o.id = vfq.organization_id
      where vfq.event_id = $1
      order by vfq.vendor_id, vfq.scope, vfq.version desc`,
    [eventId],
  );

  const key_contacts = await q<KeyContact & { organization_name: string | null }>(
    `select em.user_id, u.name, u.email, u.phone, em.role, o.name as organization_name
       from event_members em
       join users u on u.id = em.user_id
       left join organizations o on o.id = em.organization_id
      where em.event_id = $1 and em.status = 'active'
      order by case em.role when 'event_owner' then 0 when 'planner' then 1 else 2 end asc`,
    [eventId],
  );

  return {
    event: {
      id: ev.id,
      name: ev.name,
      status: ev.status,
      date_time: toIso(ev.date_time),
      end_at: toIso(ev.end_at),
      load_in_at: toIso(ev.load_in_at),
      setup_at: toIso(ev.setup_at),
      rehearsal_at: toIso(ev.rehearsal_at),
      vendor_call_at: toIso(ev.vendor_call_at),
      doors_at: toIso(ev.doors_at),
      strike_at: toIso(ev.strike_at),
      timezone: ev.timezone,
      emergency_contact_name: ev.emergency_contact_name,
      emergency_contact_phone: ev.emergency_contact_phone,
    },
    venue: {
      id: venue?.id ?? null,
      name: venue?.name ?? null,
      address: venue?.address ?? null,
      city: venue?.city ?? null,
      region: venue?.region ?? null,
      space: ev.venue_space,
      notes: ev.venue_notes,
      access_time: toIso(ev.venue_access_time),
      parking_info: ev.venue_parking_info,
      loading_dock: ev.venue_loading_dock,
      vendor_entrance: ev.venue_vendor_entrance,
      guest_entrance: ev.venue_guest_entrance,
      restrictions: ev.venue_restrictions,
    },
    schedule,
    floorplans,
    vendor_assignments,
    final_count: finalCountRow
      ? { version: finalCountRow.version, count: Number(finalCountRow.count), discrepancy: finalCountRow.discrepancy != null ? Number(finalCountRow.discrepancy) : null }
      : null,
    vendor_final_quantities: vendorQuantities,
    key_contacts,
    generated_at: new Date().toISOString(),
  };
}

// Role-specific packet projections (Part 4): the pure narrowing logic lives
// in lib/packetProjection.ts (no DB, unit-testable). Re-exported here so
// existing callers of executionPacket.ts keep one import surface.
export {
  projectPacket,
  audienceForRole,
  type PacketAudience,
  type PacketProjection,
} from "../lib/packetProjection.js";
import { projectPacket, scopeSnapshotForDiff, type PacketProjection } from "../lib/packetProjection.js";
// WHAT CHANGED diff (Part 6): pure narrowing logic lives in lib/packetDiff.ts.
export { diffPacketSnapshots, type PacketDiffEntry, type PacketDiffCategory } from "../lib/packetDiff.js";
import { diffPacketSnapshots, type PacketDiffEntry } from "../lib/packetDiff.js";

/** Live preview, projected for the actor's real event role. Not persisted. */
export async function buildProjectedPreview(
  actor: Actor,
  eventId: string,
): Promise<PacketProjection> {
  const snapshot = await buildExecutionPacket(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  return projectPacket(snapshot, role, actor.org?.id ?? null);
}

export type PacketStatus = "draft" | "issued" | "superseded" | "final" | "update_required";

export type ExecutionPacketRow = {
  id: string;
  event_id: string;
  version: number;
  status: PacketStatus;
  snapshot: ExecutionPacketSnapshot;
  generated_by: string | null;
  /** The version that replaced this one, set only once this row transitions
   *  to 'superseded'. Null for the current/latest version. */
  superseded_by: string | null;
  created_at: string;
};

/**
 * Generate a new packet version: snapshot the current live data, mark the
 * previous version superseded (pointing forward at this one via
 * superseded_by), seed one acknowledgment row per active member, and record
 * an event_changes entry (Phase A item 5) so a new packet is exactly as
 * visible as any other high-impact event change. Owner/planner only.
 *
 * Issues immediately (status 'issued') rather than a separate draft step:
 * the pre-send distribution gate (Part 9) is where "not ready yet" blocking
 * actually lives, so a second draft/issue split here would just duplicate
 * that gate without adding a real capability.
 */
export async function generatePacketVersion(
  actor: Actor,
  eventId: string,
): Promise<ExecutionPacketRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can generate the execution packet");
  }
  const snapshot = await buildExecutionPacket(actor, eventId);
  const previous = await q1<{ id: string; version: number }>(
    `select id, version from event_execution_packets where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  const nextVersion = (previous?.version ?? 0) + 1;

  const row = await q1<ExecutionPacketRow>(
    `insert into event_execution_packets (event_id, version, snapshot, generated_by, status)
     values ($1,$2,$3,$4,'issued')
     returning *`,
    [eventId, nextVersion, JSON.stringify(snapshot), actor.user.id],
  );
  const packet = row as ExecutionPacketRow;

  if (previous) {
    await pool.query(
      `update event_execution_packets set status = 'superseded', superseded_by = $3
        where event_id = $1 and version = $2`,
      [eventId, previous.version, packet.id],
    );
  }

  const members = await q<{ user_id: string }>(
    `select user_id from event_members where event_id = $1 and status = 'active'`,
    [eventId],
  );
  if (members.length) {
    await pool
      .query(
        `insert into event_execution_packet_acknowledgments (packet_id, user_id)
         select $1, unnest($2::uuid[])
         on conflict (packet_id, user_id) do nothing`,
        [packet.id, members.map((m) => m.user_id)],
      )
      .catch(() => undefined);
  }

  await recordEventChange(actor, eventId, {
    category: "other",
    field: "execution_packet",
    old_value: previous?.version ?? null,
    new_value: nextVersion,
    requires_acknowledgment: true,
  }).catch(() => undefined);

  return packet;
}

export type PacketVersionSummary = {
  id: string;
  event_id: string;
  version: number;
  status: PacketStatus;
  generated_by: string | null;
  superseded_by: string | null;
  created_at: string;
};

/**
 * Version history, newest first -- metadata only (id, version, status,
 * dates), never the snapshot itself. Any actor with event access may call
 * this: it is what powers "which version is current" for every role
 * (needed by the acknowledge/PDF/mobile routes), so it deliberately omits
 * `snapshot` rather than gating the whole endpoint to owner/planner. A real
 * gap found while wiring the mobile packet view: this previously returned
 * the FULL raw ExecutionPacketRow (including the unprojected snapshot,
 * every vendor's quantities, the full roster, the full contact list) to
 * ANY event member with no role narrowing at all -- the same class of leak
 * fixed for the diff endpoint via scopeSnapshotForDiff. A caller that needs
 * actual content should use getProjectedPacketVersion (role-scoped) or
 * getPacketVersion (owner/planner-gated raw, via the /:id/full route).
 */
export async function listPacketVersions(actor: Actor, eventId: string): Promise<PacketVersionSummary[]> {
  await getEvent(actor, eventId);
  return q<PacketVersionSummary>(
    `select id, event_id, version, status, generated_by, superseded_by, created_at
       from event_execution_packets where event_id = $1 order by version desc`,
    [eventId],
  );
}

/** One packet version by id. */
export async function getPacketVersion(actor: Actor, packetId: string): Promise<ExecutionPacketRow> {
  const row = await q1<ExecutionPacketRow>(`select * from event_execution_packets where id = $1`, [
    packetId,
  ]);
  if (!row) throw new NotFoundError("packet version not found");
  await getEvent(actor, row.event_id);
  return row;
}

/**
 * WHAT CHANGED for a packet version, against either the immediately
 * preceding version (default) or an explicit earlier version number. Both
 * versions must belong to the SAME event -- sinceVersion is a version
 * number scoped to this packet's own event, never a cross-event id, so
 * there is no way to diff against another event's data.
 *
 * Both snapshots are scoped to the actor's OWN real event role before
 * diffing (scopeSnapshotForDiff, delegating to the same projectPacket used
 * everywhere else) -- diffing the raw, unprojected snapshots would leak
 * other vendors' quantity changes, the full vendor roster, and the full
 * contact list to any event member who can call this endpoint, defeating
 * the isolation Part 4 enforces on every other packet route.
 */
export async function diffPacketVersion(
  actor: Actor,
  packetId: string,
  sinceVersion?: number,
): Promise<{ from_version: number | null; to_version: number; changes: PacketDiffEntry[] }> {
  const to = await getPacketVersion(actor, packetId);
  const role = (await getEventRole(actor, to.event_id)) ?? "read_only";
  const ownOrgId = actor.org?.id ?? null;
  const fromVersionNumber = sinceVersion ?? to.version - 1;
  if (fromVersionNumber < 1) {
    return { from_version: null, to_version: to.version, changes: [] };
  }
  const from = await q1<ExecutionPacketRow>(
    `select * from event_execution_packets where event_id = $1 and version = $2`,
    [to.event_id, fromVersionNumber],
  );
  if (!from) {
    return { from_version: null, to_version: to.version, changes: [] };
  }
  return {
    from_version: from.version,
    to_version: to.version,
    changes: diffPacketSnapshots(
      scopeSnapshotForDiff(from.snapshot, role, ownOrgId),
      scopeSnapshotForDiff(to.snapshot, role, ownOrgId),
    ),
  };
}

/**
 * A specific historical packet version, projected for the actor's real
 * event role. This is the route every non-owner recipient should use --
 * the raw getPacketVersion() (full snapshot) is for owner/planner tooling
 * and internal use only.
 */
export async function getProjectedPacketVersion(
  actor: Actor,
  packetId: string,
): Promise<PacketProjection & { id: string; version: number; status: string; created_at: string }> {
  const row = await getPacketVersion(actor, packetId);
  const role = (await getEventRole(actor, row.event_id)) ?? "read_only";
  const projection = projectPacket(row.snapshot, role, actor.org?.id ?? null);
  return { ...projection, id: row.id, version: row.version, status: row.status, created_at: row.created_at };
}

export type AcknowledgmentMethod = "app" | "email_link";

/** Acknowledge a packet version as the signed-in actor. */
export async function acknowledgePacket(
  actor: Actor,
  packetId: string,
  method: AcknowledgmentMethod = "app",
): Promise<{ id: string; packet_id: string; user_id: string; acknowledged_at: string | null; method: string }> {
  const packet = await q1<{ event_id: string }>(
    `select event_id from event_execution_packets where id = $1`,
    [packetId],
  );
  if (!packet) throw new NotFoundError("packet version not found");
  await getEvent(actor, packet.event_id);
  const safeMethod: AcknowledgmentMethod = method === "email_link" ? "email_link" : "app";
  const row = await q1<{
    id: string;
    packet_id: string;
    user_id: string;
    acknowledged_at: string | null;
    method: string;
  }>(
    `update event_execution_packet_acknowledgments
        set acknowledged_at = now(), method = $3
      where packet_id = $1 and user_id = $2
      returning *`,
    [packetId, actor.user.id, safeMethod],
  );
  if (!row) {
    throw new ForbiddenError("you are not a recipient of this packet version");
  }
  return row;
}

/**
 * The signed-in actor's OWN acknowledgment row for a packet version, or
 * null if they are not a recipient of it. Backend-enforced to the caller's
 * own user_id only -- there is no way to pass another user's id in, so this
 * can never be used to check someone else's acknowledgment status. Powers
 * the mobile "Confirm Receipt" action state (Part 10/14).
 */
export async function getMyAcknowledgment(
  actor: Actor,
  packetId: string,
): Promise<{ acknowledged_at: string | null; method: string | null } | null> {
  const packet = await q1<{ event_id: string }>(
    `select event_id from event_execution_packets where id = $1`,
    [packetId],
  );
  if (!packet) throw new NotFoundError("packet version not found");
  await getEvent(actor, packet.event_id);
  return q1<{ acknowledged_at: string | null; method: string | null }>(
    `select acknowledged_at, method from event_execution_packet_acknowledgments
      where packet_id = $1 and user_id = $2`,
    [packetId, actor.user.id],
  );
}

export type ReceiptRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  organization_name: string | null;
  acknowledged_at: string | null;
  method: string | null;
};

export type ReceiptStatus = {
  packet_id: string;
  version: number;
  status: PacketStatus;
  total: number;
  acknowledged: number;
  pending: number;
  recipients: ReceiptRow[];
};

/**
 * "FINAL SCHEDULE RECEIPT" roster view for the current (latest) packet
 * version -- owner/planner only. Grouped by recipient with a name, role, and
 * organization so a planner can see at a glance who has confirmed receipt
 * and who is still pending, without cross-referencing raw user ids.
 */
export async function getReceiptStatus(actor: Actor, eventId: string): Promise<ReceiptStatus> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can view the packet receipt roster");
  }
  const packet = await q1<ExecutionPacketRow>(
    `select * from event_execution_packets where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  if (!packet) throw new NotFoundError("no execution packet has been generated for this event yet");

  const recipients = await q<ReceiptRow>(
    `select em.user_id, u.name, u.email, em.role,
            o.name as organization_name,
            a.acknowledged_at, a.method
       from event_execution_packet_acknowledgments a
       join event_members em on em.event_id = $2 and em.user_id = a.user_id and em.status = 'active'
       join users u on u.id = a.user_id
       left join organizations o on o.id = em.organization_id
      where a.packet_id = $1
      order by (a.acknowledged_at is null) desc, u.name asc`,
    [packet.id, eventId],
  );
  const acknowledged = recipients.filter((r) => r.acknowledged_at).length;
  return {
    packet_id: packet.id,
    version: packet.version,
    status: packet.status,
    total: recipients.length,
    acknowledged,
    pending: recipients.length - acknowledged,
    recipients,
  };
}

/**
 * Mark the latest packet version 'final' -- the version that was actually
 * used to execute the event, no further revisions expected. Owner/planner
 * only. Does not affect the snapshot itself (still immutable); this is a
 * status-only transition, and only ever applies to the current (highest-
 * version, non-superseded) packet.
 */
export async function markPacketFinal(actor: Actor, eventId: string): Promise<ExecutionPacketRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can mark the execution packet final");
  }
  const row = await q1<ExecutionPacketRow>(
    `update event_execution_packets set status = 'final'
      where event_id = $1 and version = (
        select max(version) from event_execution_packets where event_id = $1
      )
      returning *`,
    [eventId],
  );
  if (!row) throw new NotFoundError("no execution packet has been generated for this event yet");
  return row as ExecutionPacketRow;
}
