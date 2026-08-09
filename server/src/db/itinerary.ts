/**
 * Phase 6 - Auto-built Itinerary (blueprint 15).
 *
 * buildItinerary(eventId) assembles a derived day-of itinerary from the event
 * record, accepted/submitted quotes, load-in/out windows, deliveries, payment
 * deadlines and the program (blueprint 15.2). It then layers any persisted
 * itinerary_items (manual edits, confirmations, pins) on top, returns
 * role-specific views (client / venue / vendor / installer / planner per 15.3)
 * and deterministic itinerary checks / prompts (blueprint 15.5). Nothing is
 * fabricated: every derived item is traceable to a stored field, and absent
 * data is surfaced as a check rather than invented.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent, type EventRow } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { audienceForRole } from "../lib/packetProjection.js";
import { toIso } from "../lib/dates.js";

async function canSee(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId);
}
/**
 * Owner or planner-role member (canManageEvent, Phase A item 3) may edit the
 * itinerary -- previously this duplicated a pre-Phase-A owner-only check
 * that had no idea an invited planner-role event_members row exists, so a
 * Planner/Event Manager who could edit the event itself still could not
 * build its Run of Show. Reuses the canonical check from events.ts rather
 * than keeping a second, drifted copy.
 */
async function requireOwner(actor: Actor, eventId: string): Promise<void> {
  await canSee(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can edit the itinerary");
  }
}

// ---- Reference data --------------------------------------------------------
export const ITINERARY_CATEGORIES: { key: string; label: string }[] = [
  { key: "load_in", label: "Load-in" },
  { key: "setup", label: "Setup" },
  { key: "delivery", label: "Delivery" },
  { key: "program", label: "Program" },
  { key: "service", label: "Service" },
  { key: "milestone", label: "Milestone" },
  { key: "payment", label: "Payment" },
  { key: "breakdown", label: "Breakdown" },
  { key: "load_out", label: "Load-out" },
];

export const ITINERARY_STATUSES: { key: string; label: string }[] = [
  { key: "planned", label: "Planned" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
  { key: "delayed", label: "Delayed" },
  { key: "cancelled", label: "Cancelled" },
];

export const ITINERARY_ROLES = [
  "all",
  "client",
  "venue",
  "vendor",
  "installer",
  "planner",
] as const;
export type ItineraryRole = (typeof ITINERARY_ROLES)[number];

// ---- Persisted itinerary_items --------------------------------------------
export type ItineraryItemRow = {
  id: string;
  event_id: string;
  organization_id: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  location: string | null;
  owner_role: string | null;
  owner_label: string | null;
  responsible_org_id: string | null;
  source: string | null;
  source_ref: string | null;
  status: string | null;
  pinned: boolean | null;
  sort_order: number | null;
  is_public: boolean | null;
  track: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function listItineraryItems(
  actor: Actor,
  eventId: string,
): Promise<ItineraryItemRow[]> {
  await canSee(actor, eventId);
  return q<ItineraryItemRow>(
    `select * from itinerary_items where event_id = $1
      order by coalesce(start_time, 'infinity'::timestamptz) asc, sort_order asc, created_at asc`,
    [eventId],
  );
}

export type ItineraryItemInput = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  location?: string | null;
  owner_role?: string | null;
  owner_label?: string | null;
  status?: string | null;
  pinned?: boolean | null;
  sort_order?: number | null;
  is_public?: boolean | null;
  track?: string | null;
  /** The vendor org this item is attributed to (arrival/delivery/service
   *  windows). Must already be attached to the event -- validated below --
   *  so an arrival record can never be attributed to an unrelated org. */
  responsible_org_id?: string | null;
};

/** True when orgId is attached to the event as a vendor (event_vendors, or
 *  an active event_members row with a vendor role). */
async function isAttachedVendorOrg(eventId: string, orgId: string): Promise<boolean> {
  const row = await q1<{ ok: boolean }>(
    `select true as ok from event_vendors where event_id = $1 and organization_id = $2
     union select true from event_members
      where event_id = $1 and organization_id = $2 and status = 'active'
        and role in ('vendor_owner','vendor_staff')
     limit 1`,
    [eventId, orgId],
  );
  return !!row?.ok;
}

export async function addItineraryItem(
  actor: Actor,
  eventId: string,
  input: ItineraryItemInput,
): Promise<ItineraryItemRow> {
  await requireOwner(actor, eventId);
  let responsibleOrgId: string | null = null;
  if (input.responsible_org_id) {
    if (!(await isAttachedVendorOrg(eventId, input.responsible_org_id))) {
      throw new ForbiddenError("responsible_org_id must be a vendor already attached to this event");
    }
    responsibleOrgId = input.responsible_org_id;
  }
  const row = await q1<ItineraryItemRow>(
    `insert into itinerary_items
       (event_id, organization_id, title, description, category, start_time, end_time,
        duration_minutes, location, owner_role, owner_label, source, status, pinned, sort_order,
        is_public, track, created_by, responsible_org_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12,$13,$14,$15,$16,$17,$18)
     returning *`,
    [
      eventId,
      actor.org?.id ?? null,
      input.title ?? "Itinerary item",
      input.description ?? null,
      input.category ?? "program",
      input.start_time ?? null,
      input.end_time ?? null,
      input.duration_minutes ?? null,
      input.location ?? null,
      input.owner_role ?? "all",
      input.owner_label ?? null,
      input.status ?? "planned",
      input.pinned ?? false,
      input.sort_order ?? 0,
      input.is_public ?? false,
      input.track ?? null,
      actor.user.id,
      responsibleOrgId,
    ],
  );
  await onItineraryItemMutated(eventId);
  return row as ItineraryItemRow;
}

async function loadItemEvent(itemId: string): Promise<string> {
  const i = await q1<{ event_id: string }>(`select event_id from itinerary_items where id = $1`, [
    itemId,
  ]);
  if (!i) throw new NotFoundError("itinerary item not found");
  return i.event_id;
}

export async function updateItineraryItem(
  actor: Actor,
  itemId: string,
  patch: ItineraryItemInput,
): Promise<ItineraryItemRow> {
  const eventId = await loadItemEvent(itemId);
  await requireOwner(actor, eventId);
  let responsibleOrgId: string | null = null;
  if (patch.responsible_org_id) {
    if (!(await isAttachedVendorOrg(eventId, patch.responsible_org_id))) {
      throw new ForbiddenError("responsible_org_id must be a vendor already attached to this event");
    }
    responsibleOrgId = patch.responsible_org_id;
  }
  const row = await q1<ItineraryItemRow>(
    `update itinerary_items set
        title = coalesce($2, title),
        description = coalesce($3, description),
        category = coalesce($4, category),
        start_time = coalesce($5, start_time),
        end_time = coalesce($6, end_time),
        duration_minutes = coalesce($7, duration_minutes),
        location = coalesce($8, location),
        owner_role = coalesce($9, owner_role),
        owner_label = coalesce($10, owner_label),
        status = coalesce($11, status),
        pinned = coalesce($12, pinned),
        sort_order = coalesce($13, sort_order),
        is_public = coalesce($14, is_public),
        track = coalesce($15, track),
        responsible_org_id = coalesce($16, responsible_org_id),
        updated_at = now()
      where id = $1 returning *`,
    [
      itemId,
      patch.title ?? null,
      patch.description ?? null,
      patch.category ?? null,
      patch.start_time ?? null,
      patch.end_time ?? null,
      patch.duration_minutes ?? null,
      patch.location ?? null,
      patch.owner_role ?? null,
      patch.owner_label ?? null,
      patch.status ?? null,
      patch.pinned ?? null,
      patch.sort_order ?? null,
      patch.is_public ?? null,
      patch.track ?? null,
      responsibleOrgId,
    ],
  );
  await onItineraryItemMutated(eventId);
  return row as ItineraryItemRow;
}

export async function deleteItineraryItem(actor: Actor, itemId: string): Promise<void> {
  const eventId = await loadItemEvent(itemId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from itinerary_items where id = $1`, [itemId]);
  await onItineraryItemMutated(eventId);
}

// ============================================================================
// AUTO-BUILDER
// ============================================================================
export type DerivedItem = {
  key: string;
  title: string;
  description: string | null;
  category: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  owner_role: ItineraryRole;
  owner_label: string | null;
  source: string;
  source_ref: string | null;
  status: string;
  /** The vendor org this item is attributed to, when known (persisted items
   *  only -- auto-derived items have no single org). Null for everything
   *  else. Used by the overlap check below: the same vendor org cannot be
   *  scheduled in two places at once. */
  responsible_org_id: string | null;
};

export type ItineraryCheck = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
};

export type ItineraryApproval = {
  status: "draft" | "approved";
  approved_at: string | null;
  approved_by: string | null;
};

export type BuiltItinerary = {
  event: { id: string; name: string; date_time: string | null; guest_count: number | null };
  generated_at: string;
  items: DerivedItem[];
  by_role: Record<ItineraryRole, DerivedItem[]>;
  checks: ItineraryCheck[];
  statuses: { key: string; label: string }[];
  categories: { key: string; label: string }[];
  /** Run of Show finalization (Part 15): whether this Run of Show has been
   *  explicitly approved. Reverts to 'draft' automatically the next time any
   *  itinerary item is added, edited, or removed -- an "approved" label that
   *  survives silent edits underneath it would be misleading. */
  approval: ItineraryApproval;
};

function addMinutes(iso: string | null, minutes: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

type QuoteForItin = {
  id: string;
  vendor_id: string | null;
  status: string | null;
  line_items: unknown;
};

/**
 * Build the derived itinerary skeleton + checks from the event record.
 * Pure-ish: only reads, no writes.
 */
export async function buildItinerary(actor: Actor, eventId: string): Promise<BuiltItinerary> {
  const ev: EventRow = await getEvent(actor, eventId);
  const checks: ItineraryCheck[] = [];
  const items: DerivedItem[] = [];

  const start = ev.date_time;
  let venueLabel: string | null = null;
  if (ev.venue_id) {
    const v = await q1<{ name: string; city: string | null }>(
      `select name, city from venues where id = $1`,
      [ev.venue_id],
    );
    venueLabel = v ? [v.name, v.city].filter(Boolean).join(", ") || v.name : null;
  }

  // --- Deterministic checks (blueprint 15.5) ---------------------------------
  if (!start) {
    checks.push({
      id: "missing_event_time",
      severity: "error",
      field: "date_time",
      message: "Event start time is not set, so timed itinerary items cannot be scheduled.",
    });
  }
  if (ev.guest_count == null || ev.guest_count <= 0) {
    checks.push({
      id: "missing_guest_count",
      severity: "warning",
      field: "guest_count",
      message: "Guest count is missing. Catering, seating and staffing windows cannot be sized.",
    });
  }
  if (!ev.venue_id) {
    checks.push({
      id: "missing_venue",
      severity: "warning",
      field: "venue_id",
      message: "No venue is selected. Load-in, setup and load-out locations are unknown.",
    });
  }

  // --- Core program windows derived from the event start ---------------------
  if (start) {
    const loadIn = addMinutes(start, -180);
    const setupEnd = addMinutes(start, -60);
    const breakdown = addMinutes(start, 240);
    const loadOut = addMinutes(start, 300);

    items.push({
      key: "auto_load_in",
      title: "Vendor load-in",
      description: "Vendors and installers arrive and begin bringing in equipment.",
      category: "load_in",
      start_time: loadIn,
      end_time: setupEnd,
      location: venueLabel,
      owner_role: "installer",
      owner_label: "Installers and vendors",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
    items.push({
      key: "auto_setup",
      title: "Setup and styling",
      description: "Tables, seating, staging and decor are set per the floorplan.",
      category: "setup",
      start_time: addMinutes(start, -120),
      end_time: setupEnd,
      location: venueLabel,
      owner_role: "venue",
      owner_label: "Venue and planner",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
    items.push({
      key: "auto_doors",
      title: "Doors / guest arrival",
      description: ev.guest_count != null ? `Expecting ${ev.guest_count} guests.` : "Guests arrive.",
      category: "program",
      // toIso(): `start` is ev.date_time straight off a raw pg query (a
      // Date object for a timestamptz column, not a string), while every
      // other item's start_time here already goes through addMinutes()
      // (which normalizes via .toISOString()). Passing the raw Date object
      // through would make this ONE item's start_time silently disagree in
      // TYPE (not value) with a jsonb-round-tripped snapshot's copy of it
      // -- exactly the bug that made packetInvalidation.ts's staleness
      // diff falsely report "6:00 PM -> 6:00 PM" as a change.
      start_time: toIso(start),
      end_time: addMinutes(start, 30),
      location: venueLabel,
      owner_role: "all",
      owner_label: "All teams",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
    items.push({
      key: "auto_program",
      title: `${ev.name} - main program`,
      description: ev.event_goals ? `Goals: ${ev.event_goals}` : "Main event program.",
      category: "program",
      start_time: addMinutes(start, 30),
      end_time: addMinutes(start, 240),
      location: venueLabel,
      owner_role: "all",
      owner_label: "All teams",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
    items.push({
      key: "auto_breakdown",
      title: "Breakdown",
      description: "Teardown of decor, staging and rentals begins.",
      category: "breakdown",
      start_time: breakdown,
      end_time: loadOut,
      location: venueLabel,
      owner_role: "vendor",
      owner_label: "Vendors and installers",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
    items.push({
      key: "auto_load_out",
      title: "Vendor load-out",
      description: "Equipment is removed and the venue is returned to base condition.",
      category: "load_out",
      start_time: loadOut,
      end_time: addMinutes(start, 360),
      location: venueLabel,
      owner_role: "installer",
      owner_label: "Installers and vendors",
      source: "auto:event",
      source_ref: null,
      status: "planned",
      responsible_org_id: null,
    });
  }

  // --- Vendor service windows from quotes ------------------------------------
  const quotes = await q<QuoteForItin>(
    `select id, vendor_id, status, line_items from quotes
      where event_id = $1 and status in ('accepted','submitted','converted','revised')
      order by created_at asc`,
    [eventId],
  );
  for (const qt of quotes) {
    const li = Array.isArray(qt.line_items) ? qt.line_items : [];
    const label =
      li.length > 0 && typeof li[0] === "object" && li[0] && "name" in (li[0] as object)
        ? String((li[0] as Record<string, unknown>).name)
        : "Vendor service";
    items.push({
      key: `auto_quote_${qt.id}`,
      title: `Vendor service: ${label}`,
      description: `Derived from quote ${qt.id} (status ${qt.status ?? "n/a"}).`,
      category: "service",
      start_time: start ? addMinutes(start, -60) : null,
      end_time: start ? addMinutes(start, 240) : null,
      location: venueLabel,
      owner_role: "vendor",
      owner_label: "Awarded vendor",
      source: "auto:quote",
      source_ref: qt.id,
      status: qt.status === "accepted" || qt.status === "converted" ? "confirmed" : "planned",
      responsible_org_id: null,
    });
  }
  if (quotes.length === 0) {
    checks.push({
      id: "no_accepted_quotes",
      severity: "info",
      message: "No accepted or submitted quotes yet, so vendor service windows are not scheduled.",
    });
  }

  // --- Payment deadlines from invoices ---------------------------------------
  const invoices = await q<{ id: string; due_date: string | null; balance_due: string | null; status: string | null }>(
    `select id, due_date, balance_due, status from invoices where event_id = $1 order by due_date asc nulls last`,
    [eventId],
  );
  for (const inv of invoices) {
    if (!inv.due_date) continue;
    items.push({
      key: `auto_payment_${inv.id}`,
      title: "Payment deadline",
      description:
        inv.balance_due != null
          ? `Balance due ${Number(inv.balance_due).toLocaleString()} (invoice ${inv.id}).`
          : `Invoice ${inv.id} payment due.`,
      category: "payment",
      start_time: inv.due_date,
      end_time: inv.due_date,
      location: null,
      owner_role: "client",
      owner_label: "Client / billing",
      source: "auto:payment",
      source_ref: inv.id,
      status: inv.status === "paid" ? "done" : "planned",
      responsible_org_id: null,
    });
  }

  // --- Layer persisted items on top (manual / confirmed / pinned) ------------
  const persisted = await listItineraryItems(actor, eventId);
  for (const p of persisted) {
    items.push({
      key: `item_${p.id}`,
      title: p.title ?? "Itinerary item",
      description: p.description,
      category: p.category ?? "program",
      // toIso(): p.start_time/end_time are raw timestamptz columns off
      // listItineraryItems()'s own query (Date objects), not the strings
      // ItineraryItemRow's type claims -- the same gap that made
      // auto_doors's start_time (below) leak a Date object into the
      // packet snapshot.
      start_time: toIso(p.start_time),
      end_time: toIso(p.end_time),
      location: p.location,
      owner_role: (ITINERARY_ROLES as readonly string[]).includes(p.owner_role ?? "")
        ? (p.owner_role as ItineraryRole)
        : "all",
      owner_label: p.owner_label,
      source: p.source ?? "manual",
      source_ref: p.source_ref,
      status: p.status ?? "planned",
      responsible_org_id: p.responsible_org_id,
    });
  }

  // --- Cross-checks: delivery must precede load-in ---------------------------
  const deliveries = persisted.filter((p) => p.category === "delivery" && p.start_time);
  const firstLoadIn = items
    .filter((i) => i.category === "load_in" && i.start_time)
    .map((i) => new Date(i.start_time as string).getTime())
    .sort((a, b) => a - b)[0];
  for (const d of deliveries) {
    if (firstLoadIn != null && new Date(d.start_time as string).getTime() > firstLoadIn) {
      checks.push({
        id: `delivery_after_load_in_${d.id}`,
        severity: "warning",
        message: `Delivery "${d.title ?? "item"}" is scheduled after vendor load-in begins. Deliveries should arrive before or at load-in.`,
      });
    }
  }

  // --- Run of Show finalization checks (completion phase, Part 15) -----------
  // Deterministic only -- every check below is a plain comparison of real
  // stored/derived timestamps, never an inferred or AI-generated suggestion.

  // Impossible timing: an item that ends before it starts.
  for (const item of items) {
    if (!item.start_time || !item.end_time) continue;
    const s = new Date(item.start_time).getTime();
    const e = new Date(item.end_time).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    if (e < s) {
      checks.push({
        id: `impossible_timing_${item.key}`,
        severity: "warning",
        message: `"${item.title}" is scheduled to end before it starts. Check its start/end time.`,
      });
    }
  }

  // Overlapping activities for the SAME responsible vendor org -- the same
  // vendor cannot be scheduled in two places at once. Deliberately scoped to
  // shared responsible_org_id rather than flagging every time-overlap in the
  // day, since independent teams (e.g. venue setup and vendor load-in)
  // legitimately run in parallel.
  const byOrg = new Map<string, DerivedItem[]>();
  for (const item of items) {
    if (!item.responsible_org_id || !item.start_time) continue;
    const bucket = byOrg.get(item.responsible_org_id) ?? [];
    bucket.push(item);
    byOrg.set(item.responsible_org_id, bucket);
  }
  for (const bucket of byOrg.values()) {
    const sorted = bucket
      .slice()
      .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime());
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const curEnd = cur.end_time ? new Date(cur.end_time).getTime() : new Date(cur.start_time as string).getTime();
      const nextStart = new Date(next.start_time as string).getTime();
      if (Number.isFinite(curEnd) && Number.isFinite(nextStart) && nextStart < curEnd) {
        checks.push({
          id: `overlap_${cur.key}_${next.key}`,
          severity: "warning",
          message: `"${cur.title}" and "${next.title}" overlap for the same vendor. The same team cannot be in two places at once.`,
        });
      }
    }
  }

  // Category-level timing sanity: vendor arrival before setup, setup ending
  // before doors, and strike not starting until the program/service window
  // ends. Reads from the FULL assembled items list (auto-derived + manual),
  // so a manual override of any of these windows is respected.
  const categoryTime = (
    category: string,
    field: "start_time" | "end_time",
    agg: "min" | "max",
  ): number | null => {
    const values = items
      .filter((i) => i.category === category && i[field])
      .map((i) => new Date(i[field] as string).getTime())
      .filter((n) => Number.isFinite(n));
    if (!values.length) return null;
    return agg === "min" ? Math.min(...values) : Math.max(...values);
  };

  const earliestLoadIn = categoryTime("load_in", "start_time", "min");
  const earliestSetupStart = categoryTime("setup", "start_time", "min");
  const latestSetupEnd = categoryTime("setup", "end_time", "max");
  const doorsTime = start ? new Date(start).getTime() : null;
  const latestServiceEnd = [categoryTime("program", "end_time", "max"), categoryTime("service", "end_time", "max")]
    .filter((v): v is number => v != null)
    .reduce((max, v) => (v > max ? v : max), Number.NEGATIVE_INFINITY);
  const earliestStrike = [categoryTime("breakdown", "start_time", "min"), categoryTime("load_out", "start_time", "min")]
    .filter((v): v is number => v != null)
    .reduce((min, v) => (v < min ? v : min), Number.POSITIVE_INFINITY);

  if (earliestLoadIn != null && earliestSetupStart != null && earliestLoadIn > earliestSetupStart) {
    checks.push({
      id: "vendor_arrival_after_setup",
      severity: "warning",
      message: "Vendor load-in is scheduled to start after setup begins. Vendors should arrive before setup starts.",
    });
  }
  if (latestSetupEnd != null && doorsTime != null && latestSetupEnd > doorsTime) {
    checks.push({
      id: "setup_after_doors",
      severity: "warning",
      message: "Setup is scheduled to run past doors / guest arrival. Setup should finish before guests arrive.",
    });
  }
  if (Number.isFinite(latestServiceEnd) && Number.isFinite(earliestStrike) && earliestStrike < latestServiceEnd) {
    checks.push({
      id: "strike_before_service_ends",
      severity: "warning",
      message: "Breakdown / strike is scheduled to begin before the program or service window ends.",
    });
  }

  // --- Sort all items chronologically (untimed last) -------------------------
  items.sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  // --- Role-specific views (blueprint 15.3) ----------------------------------
  const by_role = {} as Record<ItineraryRole, DerivedItem[]>;
  for (const r of ITINERARY_ROLES) {
    by_role[r] =
      r === "all" ? items.slice() : items.filter((i) => i.owner_role === r || i.owner_role === "all");
  }

  return {
    // toIso() for the same reason as the auto_doors item above --
    // ev.date_time is a raw Date object off a timestamptz column, and this
    // value ends up inside a packet snapshot that gets jsonb-round-tripped
    // (always a string) and later compared against a fresh rebuild.
    event: { id: ev.id, name: ev.name, date_time: toIso(ev.date_time), guest_count: ev.guest_count },
    generated_at: new Date().toISOString(),
    items,
    by_role,
    checks,
    statuses: ITINERARY_STATUSES,
    categories: ITINERARY_CATEGORIES,
    approval: {
      status: ev.itinerary_status,
      approved_at: ev.itinerary_approved_at,
      approved_by: ev.itinerary_approved_by,
    },
  };
}

/**
 * Approve the Run of Show. Owner or planner-role member only. Does not
 * block on the deterministic checks above (blocking, uncontrolled approval
 * is not this feature's job -- the packet's own pre-send readiness gate,
 * Part 9, is where "not ready yet" actually blocks a send); this simply
 * records that a human reviewed and signed off on the current schedule.
 */
export async function approveItinerary(actor: Actor, eventId: string): Promise<ItineraryApproval> {
  await requireOwner(actor, eventId);
  const row = await q1<{ itinerary_status: "draft" | "approved"; itinerary_approved_at: string | null; itinerary_approved_by: string | null }>(
    `update events set itinerary_status = 'approved', itinerary_approved_at = now(), itinerary_approved_by = $2
      where id = $1
      returning itinerary_status, itinerary_approved_at, itinerary_approved_by`,
    [eventId, actor.user.id],
  );
  if (!row) throw new NotFoundError("event not found");
  return { status: row.itinerary_status, approved_at: row.itinerary_approved_at, approved_by: row.itinerary_approved_by };
}

/** Explicit manual revert to draft. Owner or planner-role member only. */
export async function revertItineraryToDraft(actor: Actor, eventId: string): Promise<ItineraryApproval> {
  await requireOwner(actor, eventId);
  const row = await q1<{ itinerary_status: "draft" | "approved"; itinerary_approved_at: string | null; itinerary_approved_by: string | null }>(
    `update events set itinerary_status = 'draft', itinerary_approved_at = null, itinerary_approved_by = null
      where id = $1
      returning itinerary_status, itinerary_approved_at, itinerary_approved_by`,
    [eventId],
  );
  if (!row) throw new NotFoundError("event not found");
  return { status: row.itinerary_status, approved_at: row.itinerary_approved_at, approved_by: row.itinerary_approved_by };
}

/** An "approved" label that silently survives an edit underneath it would
 *  be misleading, so any itinerary item mutation reverts an approved Run
 *  of Show back to draft automatically. Best-effort: never blocks the
 *  actual mutation if this side effect fails. */
async function revertApprovalOnEdit(eventId: string): Promise<void> {
  await pool
    .query(
      `update events set itinerary_status = 'draft', itinerary_approved_at = null, itinerary_approved_by = null
        where id = $1 and itinerary_status = 'approved'`,
      [eventId],
    )
    .catch(() => undefined);
}

/**
 * Run of Show item mutations are part of the Execution Packet's own
 * snapshot (schedule.items), so a time/duration/location/responsible-
 * vendor change, or an item being added or removed, must not leave an
 * already-issued packet silently looking current (Live Event Operations
 * phase, Part 2). Reuses the SAME checkAndMarkPacketStale() the event-
 * record write paths already call (db/packetInvalidation.ts), via dynamic
 * import to avoid a static circular import (that module imports FROM
 * executionPacket.ts, which imports FROM this module).
 */
async function onItineraryItemMutated(eventId: string): Promise<void> {
  await revertApprovalOnEdit(eventId);
  try {
    const { checkAndMarkPacketStale } = await import("./packetInvalidation.js");
    await checkAndMarkPacketStale(eventId);
  } catch {
    // best-effort, never blocks the actual itinerary mutation
  }
}

// ============================================================================
// VENDOR ARRIVAL / DELIVERY SCHEDULE (completion phase, Part 16)
// ============================================================================

export type VendorArrivalRow = {
  start_time: string | null;
  end_time: string | null;
  vendor_org_id: string;
  vendor_name: string;
  action: string;
  category: string;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
};

/**
 * A unified Time/Vendor/Action/Location/Contact/Status table -- every
 * itinerary item attributed to a specific vendor org (responsible_org_id),
 * built from buildItinerary()'s own item list rather than a second source
 * of truth. The readiness engine's vendors.arrival_times check and the
 * packet's vendor roster both already read the same underlying
 * responsible_org_id data directly from itinerary_items; this endpoint is
 * the single place that JOINS it with vendor contact info and lays it out
 * as one operational table -- the natural home for a future Event Command
 * Center view or a packet Vendor Schedule enrichment, without either of
 * those needing to duplicate this join themselves.
 *
 * Role-scoped the same way projectPacket() scopes the packet's own vendor
 * roster: owner/planner/venue see every vendor's rows (they need to
 * coordinate all of them), a vendor sees only their own org's rows (never
 * another vendor's contact or schedule), sponsor/event_staff get none.
 */
export async function getVendorArrivalSchedule(actor: Actor, eventId: string): Promise<VendorArrivalRow[]> {
  const built = await buildItinerary(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);

  let relevant = built.items.filter((i): i is DerivedItem & { responsible_org_id: string } => !!i.responsible_org_id);
  if (audience === "sponsor" || audience === "event_staff") return [];
  if (audience === "vendor" || audience === "vendor_staff") {
    const ownOrgId = actor.org?.id ?? null;
    relevant = relevant.filter((i) => i.responsible_org_id === ownOrgId);
  }
  if (relevant.length === 0) return [];

  const orgIds = [...new Set(relevant.map((i) => i.responsible_org_id))];
  const contacts = await q<{
    organization_id: string;
    vendor_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  }>(
    `select em.organization_id, o.name as vendor_name, u.name as contact_name, u.email, u.phone
       from event_members em
       join users u on u.id = em.user_id
       left join organizations o on o.id = em.organization_id
      where em.event_id = $1 and em.status = 'active' and em.role = 'vendor_owner'
        and em.organization_id = any($2::uuid[])`,
    [eventId, orgIds],
  );
  const byOrg = new Map(contacts.map((c) => [c.organization_id, c]));

  return relevant
    .map((item) => {
      const c = byOrg.get(item.responsible_org_id);
      return {
        start_time: item.start_time,
        end_time: item.end_time,
        vendor_org_id: item.responsible_org_id,
        vendor_name: c?.vendor_name ?? "Vendor",
        action: item.title,
        category: item.category,
        location: item.location,
        contact_name: c?.contact_name ?? null,
        contact_email: c?.email ?? null,
        contact_phone: c?.phone ?? null,
        status: item.status,
      };
    })
    .sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
}
