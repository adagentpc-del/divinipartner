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
  };
  venue: {
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    space: string | null;
    notes: string | null;
  };
  schedule: BuiltItinerary;
  floorplans: FloorplanRef[];
  vendor_assignments: VendorAssignment[];
  final_count: { version: number; count: number; discrepancy: number | null } | null;
  vendor_final_quantities: Array<{
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
    vendor_name: string;
    scope: string;
    version: number;
    quantity: string;
    unit: string;
    discrepancy: string | null;
    discrepancy_status: string | null;
  }>(
    `select distinct on (vfq.vendor_id, vfq.scope)
            coalesce(o.name, 'Vendor') as vendor_name, vfq.scope, vfq.version, vfq.quantity,
            vfq.unit, vfq.discrepancy, vfq.discrepancy_status
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
      date_time: ev.date_time,
      end_at: ev.end_at,
      load_in_at: ev.load_in_at,
      setup_at: ev.setup_at,
      rehearsal_at: ev.rehearsal_at,
      vendor_call_at: ev.vendor_call_at,
      doors_at: ev.doors_at,
      strike_at: ev.strike_at,
    },
    venue: {
      id: venue?.id ?? null,
      name: venue?.name ?? null,
      address: venue?.address ?? null,
      city: venue?.city ?? null,
      region: venue?.region ?? null,
      space: ev.venue_space,
      notes: ev.venue_notes,
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

export type ExecutionPacketRow = {
  id: string;
  event_id: string;
  version: number;
  status: "generated" | "superseded";
  snapshot: ExecutionPacketSnapshot;
  generated_by: string | null;
  created_at: string;
};

/**
 * Generate a new packet version: snapshot the current live data, mark the
 * previous version superseded, seed one acknowledgment row per active
 * member, and record an event_changes entry (Phase A item 5) so a new
 * packet is exactly as visible as any other high-impact event change.
 * Owner/planner only.
 */
export async function generatePacketVersion(
  actor: Actor,
  eventId: string,
): Promise<ExecutionPacketRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can generate the execution packet");
  }
  const snapshot = await buildExecutionPacket(actor, eventId);
  const previous = await q1<{ version: number }>(
    `select version from event_execution_packets where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  const nextVersion = (previous?.version ?? 0) + 1;

  const row = await q1<ExecutionPacketRow>(
    `insert into event_execution_packets (event_id, version, snapshot, generated_by)
     values ($1,$2,$3,$4)
     returning *`,
    [eventId, nextVersion, JSON.stringify(snapshot), actor.user.id],
  );
  const packet = row as ExecutionPacketRow;

  if (previous) {
    await pool.query(
      `update event_execution_packets set status = 'superseded'
        where event_id = $1 and version = $2`,
      [eventId, previous.version],
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

/** Full version history, newest first. Any actor with event access may view it. */
export async function listPacketVersions(actor: Actor, eventId: string): Promise<ExecutionPacketRow[]> {
  await getEvent(actor, eventId);
  return q<ExecutionPacketRow>(
    `select * from event_execution_packets where event_id = $1 order by version desc`,
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

/** Acknowledge a packet version as the signed-in actor. */
export async function acknowledgePacket(
  actor: Actor,
  packetId: string,
): Promise<{ id: string; packet_id: string; user_id: string; acknowledged_at: string | null }> {
  const packet = await q1<{ event_id: string }>(
    `select event_id from event_execution_packets where id = $1`,
    [packetId],
  );
  if (!packet) throw new NotFoundError("packet version not found");
  await getEvent(actor, packet.event_id);
  const row = await q1<{ id: string; packet_id: string; user_id: string; acknowledged_at: string | null }>(
    `update event_execution_packet_acknowledgments
        set acknowledged_at = now()
      where packet_id = $1 and user_id = $2
      returning *`,
    [packetId, actor.user.id],
  );
  if (!row) {
    throw new ForbiddenError("you are not a recipient of this packet version");
  }
  return row;
}
