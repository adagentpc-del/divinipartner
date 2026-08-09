/**
 * Event Command Center (live-ops phase, Part 5-6, 2026-08-09).
 *
 * A single aggregator over systems that already exist -- current/next Run of
 * Show item (buildItinerary), the vendor arrival/delivery schedule
 * (getVendorArrivalSchedule, already role-scoped), guest headcount, task
 * status counts, and today's event changes. Nothing here is a stored or
 * incrementally-maintained counter: every field is computed fresh from the
 * underlying tables on each call, so it can never drift from the systems it
 * describes.
 *
 * Vendor and staff arrival status (Part 7/8) is now real, layered on top of
 * getVendorArrivalSchedule via db/checkIns.ts's vendorArrivalsSummary and a
 * fresh event_members/event_check_ins aggregate. Incidents (Part 15-16) is
 * now real too, via db/incidents.ts's listIncidents (already visibility-
 * projected, so a restricted incident never inflates a count an
 * unauthorized audience can see). Inventory (Part 17-20) is now real too,
 * via db/eventInventory.ts's listInventoryAlerts (thresholded, deterministic,
 * never a fabricated number). Sponsor activations still has no underlying
 * system yet (Part 24). This file is the one place that section will be
 * filled in when it ships; the honest placeholder is `null`, never a
 * fabricated number. Do not add a second command-center aggregator when
 * that part lands -- extend this one.
 *
 * Authorization (Part 6): every section is narrowed to the actor's real
 * event role, backend-enforced, before the response is built -- the same
 * PacketAudience buckets and audienceForRole() mapping the Execution Packet
 * projection already uses (lib/packetProjection.ts), so there is exactly
 * one role-to-audience mapping in this codebase, not two that could drift
 * apart. No role receives a section merely because the frontend chooses not
 * to render it.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { buildItinerary, getVendorArrivalSchedule, type DerivedItem } from "./itinerary.js";
import { audienceForRole, type PacketAudience, type VendorScheduleRow } from "../lib/packetProjection.js";
import { vendorArrivalsSummary, type VendorArrivalSummaryRow } from "./checkIns.js";
import { listActivity } from "./eventActivity.js";
import { listIncidents } from "./incidents.js";
import { listInventoryAlerts } from "./eventInventory.js";

export type CommandCenterScheduleItem = {
  title: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
};

export type CommandCenterProjection = {
  audience: PacketAudience;
  event: { id: string; name: string; status: string | null; date_time: string | null; timezone: string | null };
  current_status: {
    current_item: CommandCenterScheduleItem | null;
    next_item: CommandCenterScheduleItem | null;
    /** Minutes since the event's date_time, only once the event is live
     *  (status 'event_day'); null before or if date_time is unset. */
    elapsed_minutes: number | null;
  };
  guests: { checked_in: number; vip_checked_in: number; total: number } | null;
  vendors: { expected: number; rows: VendorScheduleRow[]; arrivals: VendorArrivalSummaryRow[] } | null;
  staff: { expected: number; checked_in: number } | null;
  tasks: { complete: number; active: number; blocked: number; total: number } | null;
  changes: { today_count: number; today_financial_impact: number | null } | null;
  incidents: { open: number; high_priority: number } | null;
  /** Awaiting Part 24 (sponsor activation status). */
  sponsors: null;
  inventory: { alert_count: number; alerts: Array<{ severity: string; message: string }> } | null;
  timeline: Array<{ at: string; label: string; kind: string }>;
  generated_at: string;
};

function toScheduleItem(i: DerivedItem): CommandCenterScheduleItem {
  return { title: i.title, start_time: i.start_time, end_time: i.end_time, location: i.location };
}

/** Same now/next derivation the mobile Event Day Mode already computes
 *  client-side, done here server-side so the Command Center's answer is
 *  authoritative rather than re-derived (and possibly diverging) per
 *  client. */
function currentAndNext(items: DerivedItem[], nowMs: number): { current: DerivedItem | null; next: DerivedItem | null } {
  const timed = items
    .filter((i) => i.start_time)
    .slice()
    .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime());

  let currentIdx = -1;
  for (let i = 0; i < timed.length; i += 1) {
    const start = new Date(timed[i].start_time as string).getTime();
    const end = timed[i].end_time ? new Date(timed[i].end_time as string).getTime() : start;
    if (nowMs >= start && nowMs <= Math.max(end, start)) {
      currentIdx = i;
      break;
    }
  }
  if (currentIdx === -1) {
    const nextIdx = timed.findIndex((i) => new Date(i.start_time as string).getTime() > nowMs);
    return { current: null, next: nextIdx >= 0 ? timed[nextIdx] : null };
  }
  return { current: timed[currentIdx], next: timed[currentIdx + 1] ?? null };
}

export async function getCommandCenter(actor: Actor, eventId: string): Promise<CommandCenterProjection> {
  const ev = await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  const now = Date.now();

  const built = await buildItinerary(actor, eventId);
  const { current, next } = currentAndNext(built.items, now);
  const elapsed_minutes =
    ev.status === "event_day" && ev.date_time
      ? Math.max(0, Math.floor((now - new Date(ev.date_time).getTime()) / 60000))
      : null;

  // Vendors: getVendorArrivalSchedule already applies the exact same
  // audience narrowing this projection uses (full/venue see every vendor,
  // vendor/vendor_staff see only their own org, sponsor/event_staff see
  // none) -- calling it here instead of re-deriving is what keeps this a
  // single source of truth for that isolation rule. arrivals (Part 7/8)
  // layers real check-in-derived status on top via the same narrowing.
  const vendorRows = await getVendorArrivalSchedule(actor, eventId);
  const vendorArrivals = await vendorArrivalsSummary(actor, eventId);
  const vendors =
    audience === "sponsor" || audience === "event_staff"
      ? null
      : { expected: vendorRows.length, rows: vendorRows, arrivals: vendorArrivals };

  // Staff (Part 7/8): owner/planner/venue only -- an operational headcount
  // of assigned event_staff members and how many have checked in, derived
  // straight from event_members + event_check_ins, never a stored counter.
  let staff: CommandCenterProjection["staff"] = null;
  if (audience === "full" || audience === "venue") {
    const row = await q1<{ expected: string; checked_in: string }>(
      `select count(*) as expected,
              count(*) filter (
                where exists (
                  select 1 from event_check_ins c
                   where c.event_id = em.event_id and c.user_id = em.user_id
                )
              ) as checked_in
         from event_members em
        where em.event_id = $1 and em.status = 'active' and em.role = 'event_staff'`,
      [eventId],
    );
    staff = { expected: Number(row?.expected ?? 0), checked_in: Number(row?.checked_in ?? 0) };
  }

  // Guests: owner/planner only -- guest identity/VIP status is not
  // operational information a vendor, venue, or sponsor needs from this
  // view (the same gate packetProjection.ts applies to key_contacts).
  let guests: CommandCenterProjection["guests"] = null;
  if (audience === "full") {
    const row = await q1<{ total: string; checked_in: string; vip_checked_in: string }>(
      `select count(*) as total,
              count(*) filter (where checked_in) as checked_in,
              count(*) filter (where checked_in and vip) as vip_checked_in
         from guests where event_id = $1`,
      [eventId],
    );
    guests = {
      total: Number(row?.total ?? 0),
      checked_in: Number(row?.checked_in ?? 0),
      vip_checked_in: Number(row?.vip_checked_in ?? 0),
    };
  }

  // Tasks: aggregate counts only (no per-task PII), useful to every
  // operational role except sponsor, who has no task visibility per spec
  // ("Sponsor own activation only").
  let tasks: CommandCenterProjection["tasks"] = null;
  if (audience !== "sponsor") {
    const row = await q1<{ complete: string; active: string; blocked: string; total: string }>(
      `select
          count(*) filter (where status = 'done') as complete,
          count(*) filter (where status in ('todo','in_progress')) as active,
          count(*) filter (where status = 'blocked') as blocked,
          count(*) as total
         from tasks where event_id = $1`,
      [eventId],
    );
    tasks = {
      complete: Number(row?.complete ?? 0),
      active: Number(row?.active ?? 0),
      blocked: Number(row?.blocked ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  // Changes: owner/planner only -- event_changes rows can carry
  // financial_impact and cross-scope field detail (budget, vendor terms)
  // that the packet system already treats as owner/planner-sensitive
  // everywhere else.
  let changes: CommandCenterProjection["changes"] = null;
  if (audience === "full") {
    const row = await q1<{ today_count: string; impact: string | null }>(
      `select count(*) as today_count, sum(financial_impact) filter (where financial_impact is not null) as impact
         from event_changes where event_id = $1 and created_at >= date_trunc('day', now())`,
      [eventId],
    );
    changes = {
      today_count: Number(row?.today_count ?? 0),
      today_financial_impact: row?.impact != null ? Number(row.impact) : null,
    };
  }

  // Timeline (Part 11-12): the real, authoritative event_activity feed --
  // listActivity already applies the per-category visibility projection
  // (lib/activityVisibility.ts), so this is never a full-audience-only
  // view like the old event_changes-derived version was; a vendor sees
  // their own check-ins and broadly-visible activity, never another
  // vendor's or a finance/incident-restricted row.
  const activity = await listActivity(actor, eventId, 20);
  const timeline: CommandCenterProjection["timeline"] = activity.map((a) => ({
    at: a.created_at,
    label: a.message,
    kind: a.category,
  }));

  // Incidents (Part 15-16): listIncidents already applies the visibility
  // projection (lib/incidentVisibility.ts), so a restricted incident's
  // existence never inflates a count this audience should not know about.
  const visibleIncidents = await listIncidents(actor, eventId);
  const openIncidents = visibleIncidents.filter((i) => i.status !== "resolved" && i.status !== "closed");
  const incidents: CommandCenterProjection["incidents"] = {
    open: openIncidents.length,
    high_priority: openIncidents.filter((i) => i.severity === "high" || i.severity === "critical").length,
  };

  // Inventory (Part 17-20): full/venue only, matching the same default
  // scope inventory-category activity/incident rows already use.
  let inventory: CommandCenterProjection["inventory"] = null;
  if (audience === "full" || audience === "venue") {
    const alerts = await listInventoryAlerts(actor, eventId);
    inventory = { alert_count: alerts.length, alerts: alerts.slice(0, 10).map((a) => ({ severity: a.severity, message: a.message })) };
  }

  return {
    audience,
    event: { id: ev.id, name: ev.name, status: ev.status, date_time: ev.date_time, timezone: ev.timezone },
    current_status: {
      current_item: current ? toScheduleItem(current) : null,
      next_item: next ? toScheduleItem(next) : null,
      elapsed_minutes,
    },
    guests,
    vendors,
    staff,
    tasks,
    changes,
    incidents,
    sponsors: null,
    inventory,
    timeline,
    generated_at: new Date().toISOString(),
  };
}
