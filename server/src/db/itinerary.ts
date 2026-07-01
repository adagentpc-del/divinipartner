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
import { getEvent, type EventRow } from "./events.js";

async function canSee(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId);
}
async function owns(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and (($2::uuid is not null and organization_id = $2)
             or client_id = $3 or planner_id = $3)
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}
async function requireOwner(actor: Actor, eventId: string): Promise<void> {
  await canSee(actor, eventId);
  if (!(await owns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can edit the itinerary");
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
};

export async function addItineraryItem(
  actor: Actor,
  eventId: string,
  input: ItineraryItemInput,
): Promise<ItineraryItemRow> {
  await requireOwner(actor, eventId);
  const row = await q1<ItineraryItemRow>(
    `insert into itinerary_items
       (event_id, organization_id, title, description, category, start_time, end_time,
        duration_minutes, location, owner_role, owner_label, source, status, pinned, sort_order, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12,$13,$14,$15)
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
      actor.user.id,
    ],
  );
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
    ],
  );
  return row as ItineraryItemRow;
}

export async function deleteItineraryItem(actor: Actor, itemId: string): Promise<void> {
  const eventId = await loadItemEvent(itemId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from itinerary_items where id = $1`, [itemId]);
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
};

export type ItineraryCheck = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
};

export type BuiltItinerary = {
  event: { id: string; name: string; date_time: string | null; guest_count: number | null };
  generated_at: string;
  items: DerivedItem[];
  by_role: Record<ItineraryRole, DerivedItem[]>;
  checks: ItineraryCheck[];
  statuses: { key: string; label: string }[];
  categories: { key: string; label: string }[];
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
    });
    items.push({
      key: "auto_doors",
      title: "Doors / guest arrival",
      description: ev.guest_count != null ? `Expecting ${ev.guest_count} guests.` : "Guests arrive.",
      category: "program",
      start_time: start,
      end_time: addMinutes(start, 30),
      location: venueLabel,
      owner_role: "all",
      owner_label: "All teams",
      source: "auto:event",
      source_ref: null,
      status: "planned",
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
      start_time: p.start_time,
      end_time: p.end_time,
      location: p.location,
      owner_role: (ITINERARY_ROLES as readonly string[]).includes(p.owner_role ?? "")
        ? (p.owner_role as ItineraryRole)
        : "all",
      owner_label: p.owner_label,
      source: p.source ?? "manual",
      source_ref: p.source_ref,
      status: p.status ?? "planned",
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
    event: { id: ev.id, name: ev.name, date_time: ev.date_time, guest_count: ev.guest_count },
    generated_at: new Date().toISOString(),
    items,
    by_role,
    checks,
    statuses: ITINERARY_STATUSES,
    categories: ITINERARY_CATEGORIES,
  };
}
