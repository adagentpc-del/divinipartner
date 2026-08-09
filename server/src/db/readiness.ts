/**
 * Event Execution Readiness Engine (Final Event Schedule / Event Execution
 * Packet completion phase, 2026-08-09).
 *
 * Every check here reads real, already-persisted data -- nothing is a
 * cosmetic percentage assembled from arbitrary fields. Each check declares
 * its own severity (blocking vs warning) up front, so the aggregate state is
 * a deterministic function of which real checks passed, not a tuned score.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent, type EventRow } from "./events.js";
import { buildItinerary } from "./itinerary.js";

export type ReadinessCategory = "core" | "schedule" | "vendors" | "venue" | "packet";
export type ReadinessSeverity = "blocking" | "warning";
export type ReadinessCheckStatus = "complete" | "missing";

export type ReadinessCheck = {
  id: string;
  category: ReadinessCategory;
  label: string;
  status: ReadinessCheckStatus;
  severity: ReadinessSeverity;
  message: string;
  /** Where to go in the app to fix this. Always a real, always-valid route
   *  (the event workspace) -- this codebase has no per-section deep-link
   *  convention yet to point to more precisely. */
  fix_link: string;
};

export type ReadinessState = "not_ready" | "needs_attention" | "ready" | "ready_with_warnings";

export type ReadinessReport = {
  event_id: string;
  state: ReadinessState;
  percent: number;
  total_checks: number;
  completed: ReadinessCheck[];
  blocking: ReadinessCheck[];
  warnings: ReadinessCheck[];
  generated_at: string;
};

function check(
  id: string,
  category: ReadinessCategory,
  label: string,
  ok: boolean,
  severity: ReadinessSeverity,
  okMessage: string,
  missingMessage: string,
  eventId: string,
): ReadinessCheck {
  return {
    id,
    category,
    label,
    status: ok ? "complete" : "missing",
    severity,
    message: ok ? okMessage : missingMessage,
    fix_link: `/events/${eventId}`,
  };
}

/**
 * Compute readiness deterministically from stored data. No caching, no
 * stored "readiness score" column -- always fresh, so it can never drift
 * from the data it describes.
 */
export async function computeReadiness(actor: Actor, eventId: string): Promise<ReadinessReport> {
  const ev: EventRow = await getEvent(actor, eventId);
  const checks: ReadinessCheck[] = [];

  const venue = ev.venue_id
    ? await q1<{ address: string | null }>(`select address from venues where id = $1`, [ev.venue_id])
    : null;

  const plannerRow = await q1<{ ok: boolean }>(
    `select true as ok from event_members where event_id = $1 and status = 'active' and role = 'planner'`,
    [eventId],
  );
  const hasPlanner = ev.planner_id != null || !!plannerRow?.ok;

  const finalCount = await q1<{ version: number; count: number }>(
    `select version, count from event_final_counts where event_id = $1 order by version desc limit 1`,
    [eventId],
  );

  // ---- CORE -----------------------------------------------------------------
  checks.push(check("core.date_time", "core", "Event date/time", !!ev.date_time, "blocking",
    "Event date and time are set.", "Event date and time are not set.", eventId));
  checks.push(check("core.timezone", "core", "Timezone", !!ev.timezone, "blocking",
    "Event timezone is set.", "Event timezone is not set -- required for schedule and distribution timing.", eventId));
  checks.push(check("core.venue", "core", "Venue confirmed", !!ev.venue_id, "blocking",
    "Venue is confirmed.", "No venue has been selected for this event.", eventId));
  checks.push(check("core.venue_address", "core", "Venue address", !!venue?.address, "warning",
    "Venue address is on file.", ev.venue_id ? "The selected venue has no address on file." : "No venue selected yet.", eventId));
  checks.push(check("core.planner", "core", "Planner / event manager", hasPlanner, "blocking",
    "A planner or event manager is assigned.", "No planner or event manager is assigned to this event.", eventId));
  checks.push(check("core.final_count", "core", "Final count set", !!finalCount, "blocking",
    "The authoritative final count has been set.", "No final count has been set for this event yet.", eventId));

  // ---- SCHEDULE ---------------------------------------------------------------
  const schedule = await buildItinerary(actor, eventId);
  const persistedItems = await q<{ id: string; category: string | null; start_time: string | null; responsible_org_id: string | null }>(
    `select id, category, start_time, responsible_org_id from itinerary_items where event_id = $1`,
    [eventId],
  );
  const hasCategory = (cat: string) => schedule.items.some((i) => i.category === cat);
  checks.push(check("schedule.run_of_show", "schedule", "Run of Show", persistedItems.length > 0, "warning",
    "A Run of Show has been entered for this event.", "No Run of Show items have been entered yet (only the auto-derived skeleton exists).", eventId));
  checks.push(check("schedule.vendor_arrival", "schedule", "Vendor arrival schedule", persistedItems.some((i) => i.responsible_org_id && (i.category === "load_in" || i.category === "delivery")), "warning",
    "At least one vendor arrival/delivery time is scheduled.", "No vendor-specific arrival or delivery times have been entered.", eventId));
  checks.push(check("schedule.load_in", "schedule", "Load-in", hasCategory("load_in"), "warning",
    "Load-in is scheduled.", "No load-in window is scheduled.", eventId));
  checks.push(check("schedule.setup", "schedule", "Setup timing", hasCategory("setup"), "warning",
    "Setup timing is scheduled.", "No setup window is scheduled.", eventId));
  checks.push(check("schedule.strike", "schedule", "Strike / load-out", hasCategory("breakdown") || hasCategory("load_out"), "warning",
    "Strike / load-out is scheduled.", "No strike or load-out window is scheduled.", eventId));

  // ---- VENDORS ----------------------------------------------------------------
  const vendorRows = await q<{ organization_id: string; vendor_name: string }>(
    `select organization_id, vendor_name from (
       select ev.organization_id, coalesce(o.name, 'Vendor') as vendor_name
         from event_vendors ev left join organizations o on o.id = ev.organization_id
        where ev.event_id = $1
       union
       select em.organization_id, coalesce(o.name, 'Vendor') as vendor_name
         from event_members em left join organizations o on o.id = em.organization_id
        where em.event_id = $1 and em.status = 'active' and em.role in ('vendor_owner','vendor_staff')
          and em.organization_id is not null
     ) combined`,
    [eventId],
  );
  checks.push(check("vendors.attached", "vendors", "Vendors connected", vendorRows.length > 0, "warning",
    `${vendorRows.length} vendor(s) connected to this event.`, "No vendors are connected to this event yet.", eventId));

  if (vendorRows.length > 0) {
    const contacts = await q<{ organization_id: string }>(
      `select distinct em.organization_id
         from event_members em join users u on u.id = em.user_id
        where em.event_id = $1 and em.status = 'active' and em.organization_id is not null
          and (u.email is not null or u.phone is not null)`,
      [eventId],
    );
    const contactOrgIds = new Set(contacts.map((c) => c.organization_id));
    const missingContacts = vendorRows.filter((v) => !contactOrgIds.has(v.organization_id));
    checks.push(check("vendors.lead_contacts", "vendors", "Vendor lead contacts", missingContacts.length === 0, "warning",
      "Every connected vendor has a reachable lead contact.",
      `${missingContacts.length} of ${vendorRows.length} vendor(s) have no lead contact on file: ${missingContacts.map((v) => v.vendor_name).join(", ")}.`,
      eventId));

    const arrivalOrgIds = new Set(
      persistedItems.filter((i) => i.responsible_org_id && i.start_time).map((i) => i.responsible_org_id as string),
    );
    const missingArrival = vendorRows.filter((v) => !arrivalOrgIds.has(v.organization_id));
    checks.push(check("vendors.arrival_times", "vendors", "Vendor arrival times", missingArrival.length === 0, "warning",
      "Every connected vendor has an arrival or delivery time scheduled.",
      `${missingArrival.length} of ${vendorRows.length} vendor(s) have no arrival/delivery time scheduled: ${missingArrival.map((v) => v.vendor_name).join(", ")}.`,
      eventId));

    const quantityOrgIds = new Set(
      (await q<{ organization_id: string }>(
        `select distinct organization_id from vendor_final_quantities where event_id = $1`,
        [eventId],
      )).map((r) => r.organization_id),
    );
    const missingQuantities = vendorRows.filter((v) => !quantityOrgIds.has(v.organization_id));
    checks.push(check("vendors.final_quantities", "vendors", "Vendor final quantities submitted", missingQuantities.length === 0, "warning",
      "Every connected vendor has submitted a final quantity.",
      `${missingQuantities.length} of ${vendorRows.length} vendor(s) have not submitted a final quantity: ${missingQuantities.map((v) => v.vendor_name).join(", ")}.`,
      eventId));

    if (finalCount) {
      const ackRows = await q<{ acknowledged_at: string | null }>(
        `select a.acknowledged_at
           from event_change_acknowledgments a
           join event_changes c on c.id = a.change_id
          where c.event_id = $1 and c.field = 'final_count'
          order by c.created_at desc limit 100`,
        [eventId],
      );
      const pendingAcks = ackRows.filter((r) => !r.acknowledged_at).length;
      checks.push(check("vendors.final_count_ack", "vendors", "Final-count acknowledgments", ackRows.length > 0 && pendingAcks === 0, "warning",
        "All final-count acknowledgments are complete.",
        ackRows.length === 0
          ? "No final-count acknowledgments are on record yet."
          : `${pendingAcks} of ${ackRows.length} final-count acknowledgment(s) are still pending.`,
        eventId));
    }
  }

  // ---- VENUE / LOGISTICS --------------------------------------------------
  if (ev.venue_id) {
    const floorplanCount = await q1<{ n: string }>(
      `select count(*)::int as n from floorplans where event_id = $1`,
      [eventId],
    );
    checks.push(check("venue.floorplan", "venue", "Floor plan / setup plan", Number(floorplanCount?.n ?? 0) > 0, "warning",
      "A floor plan or setup plan is attached.", "No floor plan or setup plan has been attached.", eventId));
    checks.push(check("venue.loading", "venue", "Loading instructions", !!ev.venue_loading_dock, "warning",
      "Loading dock instructions are on file.", "No loading dock instructions are on file.", eventId));
    checks.push(check("venue.vendor_access", "venue", "Vendor access instructions", !!ev.venue_vendor_entrance, "warning",
      "Vendor entrance instructions are on file.", "No vendor entrance instructions are on file.", eventId));
    checks.push(check("venue.emergency_contact", "venue", "Emergency contact", !!(ev.emergency_contact_name && ev.emergency_contact_phone), "warning",
      "An emergency contact is on file.", "No emergency contact is on file for this event.", eventId));
    checks.push(check("venue.parking", "venue", "Parking / access instructions", !!ev.venue_parking_info, "warning",
      "Parking instructions are on file.", "No parking instructions are on file.", eventId));
  }

  // ---- PACKET -------------------------------------------------------------
  const packetRow = await q1<{ id: string; version: number }>(
    `select id, version from event_execution_packets where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  checks.push(check("packet.generated", "packet", "Execution packet generated", !!packetRow, "warning",
    "The execution packet has been generated.", "The execution packet has not been generated yet.", eventId));
  if (packetRow) {
    const recipientCount = await q1<{ n: string }>(
      `select count(*)::int as n from event_execution_packet_acknowledgments where packet_id = $1`,
      [packetRow.id],
    );
    checks.push(check("packet.recipients", "packet", "Packet recipients defined", Number(recipientCount?.n ?? 0) > 0, "warning",
      "Packet recipients are defined.", "The generated packet has no recipients on record.", eventId));
    const pendingAckCount = await q1<{ n: string }>(
      `select count(*)::int as n from event_execution_packet_acknowledgments
        where packet_id = $1 and acknowledged_at is null`,
      [packetRow.id],
    );
    checks.push(check("packet.acknowledgments", "packet", "Packet acknowledgments complete", Number(pendingAckCount?.n ?? 0) === 0, "warning",
      "All packet recipients have acknowledged.", `${pendingAckCount?.n ?? 0} packet recipient(s) have not yet acknowledged.`, eventId));
  }

  const completed = checks.filter((c) => c.status === "complete");
  const blocking = checks.filter((c) => c.status === "missing" && c.severity === "blocking");
  const warnings = checks.filter((c) => c.status === "missing" && c.severity === "warning");
  const percent = checks.length ? Math.round((completed.length / checks.length) * 100) : 0;

  let state: ReadinessState;
  if (blocking.length > 0) {
    state = "not_ready";
  } else if (warnings.length === 0) {
    state = "ready";
  } else if (checks.length > 0 && warnings.length / checks.length > 0.25) {
    state = "needs_attention";
  } else {
    state = "ready_with_warnings";
  }

  return {
    event_id: eventId,
    state,
    percent,
    total_checks: checks.length,
    completed,
    blocking,
    warnings,
    generated_at: new Date().toISOString(),
  };
}
