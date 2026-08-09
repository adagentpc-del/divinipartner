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
 * Several sections the full 48-part spec eventually wants (Staff check-in,
 * Incidents, Sponsor activations, Inventory alerts) do not have an
 * underlying system YET -- those parts of the live-ops phase come later in
 * the execution order (Part 7/8 check-in, Part 15/16 incidents, Part 24
 * sponsor activation, Part 17-20 inventory). This file is the one place
 * those sections will be filled in as each system ships; the honest
 * placeholder is `null`, never a fabricated number. Do not add a second
 * command-center aggregator when those parts land -- extend this one.
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
  vendors: { expected: number; rows: VendorScheduleRow[] } | null;
  /** Awaiting Part 7/8 (vendor/staff check-in + arrival status). */
  staff: null;
  tasks: { complete: number; active: number; blocked: number; total: number } | null;
  changes: { today_count: number; today_financial_impact: number | null } | null;
  /** Awaiting Part 15/16 (incident management). */
  incidents: null;
  /** Awaiting Part 24 (sponsor activation status). */
  sponsors: null;
  /** Awaiting Part 17-20 (event inventory model). */
  inventory: null;
  timeline: Array<{ at: string; label: string; kind: "change" }>;
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
  // single source of truth for that isolation rule.
  const vendorRows = await getVendorArrivalSchedule(actor, eventId);
  const vendors = audience === "sponsor" || audience === "event_staff" ? null : { expected: vendorRows.length, rows: vendorRows };

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

  // Changes + timeline: owner/planner only -- event_changes rows can carry
  // financial_impact and cross-scope field detail (budget, vendor terms)
  // that the packet system already treats as owner/planner-sensitive
  // everywhere else. Part 11 will replace/extend this with the real
  // per-role event_activity feed (visibility_scope-aware); until then this
  // is the honest subset of what already exists.
  let changes: CommandCenterProjection["changes"] = null;
  let timeline: CommandCenterProjection["timeline"] = [];
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
    const recent = await q<{ field: string; category: string; created_at: string }>(
      `select field, category, created_at from event_changes where event_id = $1
        order by created_at desc limit 20`,
      [eventId],
    );
    timeline = recent.map((r) => ({
      at: r.created_at,
      label: `${r.category.replace(/_/g, " ")}: ${r.field.replace(/_/g, " ")} changed`,
      kind: "change" as const,
    }));
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
    staff: null,
    tasks,
    changes,
    incidents: null,
    sponsors: null,
    inventory: null,
    timeline,
    generated_at: new Date().toISOString(),
  };
}
