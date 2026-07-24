/**
 * Tour Series - data layer.
 *
 * A tour is a named series owned by an org. Each stop is a full events row tied
 * to the tour via events.tour_id, so a stop automatically has every event
 * capability: the public landing, floorplans, schedule, ticket tiers, bids,
 * packages, and booth zones. Creating a stop reuses events.createEvent.
 *
 * Org-scoped/IDOR-safe. Deterministic, no AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { createEvent } from "./events.js";

export interface TourRow {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TourStop {
  event_id: string;
  name: string | null;
  date_time: string | null;
  stop_city: string | null;
  tour_stop_order: number | null;
  status: string | null;
  venue_id: string | null;
}

function ownerOrgId(actor: Actor): string {
  const id = actor.org?.id ?? null;
  if (!id) throw new ForbiddenError("join or create an organization to run a tour");
  return id;
}

async function assertOwnsTour(actor: Actor, tourId: string): Promise<TourRow> {
  const row = await q1<TourRow>(`select * from tour_series where id = $1`, [tourId]);
  if (!row) throw new NotFoundError("tour not found");
  const isAdmin = actor.user.role === "super_admin" || actor.user.role === "admin";
  if (!isAdmin && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("only the tour owner can manage it");
  }
  return row;
}

export async function createTour(
  actor: Actor,
  input: { name: string; description?: string | null },
): Promise<TourRow> {
  const owner = ownerOrgId(actor);
  if (!input.name || typeof input.name !== "string") throw new ForbiddenError("name required");
  const row = await q1<TourRow>(
    `insert into tour_series (organization_id, name, description, created_by)
     values ($1,$2,$3,$4) returning *`,
    [owner, input.name, input.description ?? null, actor.user.id],
  );
  return row as TourRow;
}

export async function listTours(actor: Actor): Promise<(TourRow & { stop_count: number })[]> {
  const owner = ownerOrgId(actor);
  return q<TourRow & { stop_count: number }>(
    `select t.*, (select count(*) from events e where e.tour_id = t.id)::int as stop_count
       from tour_series t
      where t.organization_id = $1
      order by t.created_at desc
      limit 200`,
    [owner],
  );
}

export async function listStops(tourId: string): Promise<TourStop[]> {
  return q<TourStop>(
    `select id as event_id, name, date_time, stop_city, tour_stop_order, status, venue_id
       from events where tour_id = $1
      order by tour_stop_order asc, coalesce(date_time, 'infinity'::timestamptz) asc`,
    [tourId],
  );
}

export async function getTour(actor: Actor, tourId: string): Promise<{ tour: TourRow; stops: TourStop[] }> {
  const tour = await assertOwnsTour(actor, tourId);
  const stops = await listStops(tourId);
  return { tour, stops };
}

export async function updateTour(
  actor: Actor,
  tourId: string,
  patch: { name?: string; description?: string | null; status?: string },
): Promise<TourRow> {
  await assertOwnsTour(actor, tourId);
  const status = patch.status === "active" || patch.status === "archived" ? patch.status : null;
  const row = await q1<TourRow>(
    `update tour_series set
        name = coalesce($2, name),
        description = coalesce($3, description),
        status = coalesce($4, status),
        updated_at = now()
      where id = $1 returning *`,
    [tourId, patch.name ?? null, patch.description ?? null, status],
  );
  return row as TourRow;
}

/**
 * Copy the reusable public config from a source event onto a target event:
 * landing settings, ticket tiers, public agenda items, floorplans, exhibitor
 * packages, and booths. Times/sold/status reset so the copy is a fresh setup.
 * The source must belong to the same org (or the caller is an admin).
 */
export async function copyEventConfig(actor: Actor, sourceEventId: string, targetEventId: string): Promise<void> {
  const isAdmin = actor.user.role === "super_admin" || actor.user.role === "admin";
  const src = await q1<{ organization_id: string | null }>(
    `select organization_id from events where id = $1`,
    [sourceEventId],
  );
  if (!src) throw new NotFoundError("source event not found");
  if (!isAdmin && src.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("you do not own the source event");
  }

  await q(
    `insert into event_landing_settings (event_id, attend_mode, vendor_cta_enabled, headline, description)
     select $2, attend_mode, vendor_cta_enabled, headline, description
       from event_landing_settings where event_id = $1
     on conflict (event_id) do nothing`,
    [sourceEventId, targetEventId],
  );
  await q(
    `insert into event_ticket_tiers (event_id, name, price_cents, quantity, sort_order)
     select $2, name, price_cents, quantity, sort_order
       from event_ticket_tiers where event_id = $1`,
    [sourceEventId, targetEventId],
  );
  await q(
    `insert into itinerary_items (event_id, title, description, category, location, track, is_public, source, status)
     select $2, title, description, category, location, track, true, 'manual', 'planned'
       from itinerary_items where event_id = $1 and is_public = true`,
    [sourceEventId, targetEventId],
  );
  await q(
    `insert into floorplans (event_id, name, description, file_url, thumbnail_url, width, height, scale, place_name, place_address, source_kind)
     select $2, name, description, file_url, thumbnail_url, width, height, scale, place_name, place_address, source_kind
       from floorplans where event_id = $1`,
    [sourceEventId, targetEventId],
  );
  await q(
    `insert into event_exhibitor_packages (event_id, name, price_cents, quantity, includes_booth, benefits, sort_order)
     select $2, name, price_cents, quantity, includes_booth, benefits, sort_order
       from event_exhibitor_packages where event_id = $1`,
    [sourceEventId, targetEventId],
  );
  await q(
    `insert into event_booths (event_id, label, price_cents, zone_ref, sort_order)
     select $2, label, price_cents, zone_ref, sort_order
       from event_booths where event_id = $1`,
    [sourceEventId, targetEventId],
  );
}

/**
 * Add a stop: create a full event (reusing createEvent so it gets the standard
 * lifecycle + org scoping), then tie it to the tour with an order + city.
 * Optionally copy the whole public setup from a previous stop (copy_from_event_id).
 */
export async function addStop(
  actor: Actor,
  tourId: string,
  input: {
    name: string;
    city?: string | null;
    date_time?: string | null;
    venue_id?: string | null;
    type?: string | null;
    copy_from_event_id?: string | null;
  },
): Promise<TourStop> {
  await assertOwnsTour(actor, tourId);
  if (!input.name || typeof input.name !== "string") throw new ForbiddenError("stop name required");

  const ev = await createEvent(actor, {
    name: input.name,
    type: input.type ?? "tour_stop",
    date_time: input.date_time ?? null,
    venue_id: input.venue_id ?? null,
  });

  const nextOrder = await q1<{ n: number }>(
    `select coalesce(max(tour_stop_order), 0) + 1 as n from events where tour_id = $1`,
    [tourId],
  );
  await q(
    `update events set tour_id = $2, tour_stop_order = $3, stop_city = $4 where id = $1`,
    [ev.id, tourId, nextOrder?.n ?? 1, input.city ?? null],
  );

  if (input.copy_from_event_id) {
    await copyEventConfig(actor, input.copy_from_event_id, ev.id);
  }

  const stop = await q1<TourStop>(
    `select id as event_id, name, date_time, stop_city, tour_stop_order, status, venue_id
       from events where id = $1`,
    [ev.id],
  );
  return stop as TourStop;
}

/** Detach a stop from a tour (keeps the underlying event). Owner only. */
export async function removeStop(actor: Actor, tourId: string, eventId: string): Promise<boolean> {
  await assertOwnsTour(actor, tourId);
  const rows = await q(
    `update events set tour_id = null, tour_stop_order = 0, stop_city = null
      where id = $1 and tour_id = $2 returning id`,
    [eventId, tourId],
  );
  return rows.length > 0;
}

// ---- Public -----------------------------------------------------------------

export interface PublicTour {
  tour: { id: string; name: string; description: string | null; organizer: string | null };
  stops: { event_id: string; name: string | null; date_time: string | null; stop_city: string | null }[];
}

export async function getPublicTour(tourId: string): Promise<PublicTour | null> {
  const tour = await q1<{ id: string; name: string; description: string | null; organizer: string | null; status: string }>(
    `select t.id, t.name, t.description, o.name as organizer, t.status
       from tour_series t
       left join organizations o on o.id = t.organization_id
      where t.id = $1`,
    [tourId],
  );
  if (!tour || tour.status !== "active") return null;
  const stops = await q<{ event_id: string; name: string | null; date_time: string | null; stop_city: string | null }>(
    `select id as event_id, name, date_time, stop_city
       from events where tour_id = $1
      order by tour_stop_order asc, coalesce(date_time, 'infinity'::timestamptz) asc`,
    [tourId],
  );
  return {
    tour: { id: tour.id, name: tour.name, description: tour.description, organizer: tour.organizer },
    stops,
  };
}
