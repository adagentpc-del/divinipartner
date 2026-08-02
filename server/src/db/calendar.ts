/**
 * Org availability calendar (blueprint follow-up: bookings, holds, installs,
 * deliveries, meetings) + the private .ics subscribe feed token. CRUD over
 * calendar_events / calendar_feed_tokens (db/schema-calendar.sql).
 *
 * Ownership model: a calendar row belongs to organization_id (the org whose
 * time is being tracked - a venue, vendor, planner, installer, ...). Writes
 * are scoped to the acting org except for request-hold, which lets ANY signed-
 * in user place a tentative hold on a DIFFERENT org's calendar (the "book it"
 * flow on a public profile) - the target org must confirm or cancel it, same
 * as they would any other calendar row on their own calendar.
 */
import { q, q1 } from "../pool.js";
import { randomToken } from "../lib/session.js";
import { mergeBusyWindows, type BusyWindow } from "../lib/availability.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";

export const CALENDAR_KINDS = ["booking", "hold", "block", "install", "delivery", "meeting", "other"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const CALENDAR_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export type CalendarEventRow = {
  id: string;
  organization_id: string;
  event_id: string | null;
  kind: CalendarKind;
  status: CalendarStatus;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function requireOrg(actor: Actor): string {
  if (!actor.org?.id) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

export interface CreateCalendarEventInput {
  event_id?: string | null;
  kind?: CalendarKind;
  status?: CalendarStatus;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
}

/** Create a calendar row on the acting org's own calendar. */
export async function createCalendarEvent(actor: Actor, input: CreateCalendarEventInput): Promise<CalendarEventRow> {
  const orgId = requireOrg(actor);
  return insertCalendarEvent(orgId, actor.user.id, input);
}

async function insertCalendarEvent(
  orgId: string,
  createdBy: string | null,
  input: CreateCalendarEventInput,
): Promise<CalendarEventRow> {
  if (!input.title?.trim()) throw new Error("title required");
  if (!input.starts_at || !input.ends_at) throw new Error("starts_at and ends_at required");
  if (new Date(input.ends_at).getTime() < new Date(input.starts_at).getTime()) {
    throw new Error("ends_at must not be before starts_at");
  }
  const row = await q1<CalendarEventRow>(
    `insert into calendar_events
       (organization_id, event_id, kind, status, title, description, starts_at, ends_at, all_day, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      orgId,
      input.event_id ?? null,
      input.kind ?? "other",
      input.status ?? "confirmed",
      input.title.trim(),
      input.description ?? null,
      input.starts_at,
      input.ends_at,
      input.all_day ?? false,
      createdBy,
    ],
  );
  return row as CalendarEventRow;
}

/** List the acting org's own calendar rows in a date range (default: next 90 days). */
export async function listMyCalendar(
  actor: Actor,
  range?: { from?: string; to?: string },
): Promise<CalendarEventRow[]> {
  const orgId = requireOrg(actor);
  const from = range?.from ?? new Date().toISOString();
  const to = range?.to ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  return q<CalendarEventRow>(
    `select * from calendar_events
      where organization_id = $1 and ends_at >= $2 and starts_at <= $3
      order by starts_at asc`,
    [orgId, from, to],
  );
}

async function getOwnRow(actor: Actor, id: string): Promise<CalendarEventRow> {
  const orgId = requireOrg(actor);
  const row = await q1<CalendarEventRow>(`select * from calendar_events where id = $1 and organization_id = $2`, [id, orgId]);
  if (!row) throw new NotFoundError("calendar event not found");
  return row;
}

export interface UpdateCalendarEventInput {
  kind?: CalendarKind;
  status?: CalendarStatus;
  title?: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string;
  all_day?: boolean;
}

/** Update a row on the acting org's own calendar (confirming a hold into a
 *  booking is just status: 'tentative' -> 'confirmed' through this). */
export async function updateCalendarEvent(
  actor: Actor,
  id: string,
  patch: UpdateCalendarEventInput,
): Promise<CalendarEventRow> {
  const existing = await getOwnRow(actor, id);
  const next = {
    kind: patch.kind ?? existing.kind,
    status: patch.status ?? existing.status,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    description: patch.description !== undefined ? patch.description : existing.description,
    starts_at: patch.starts_at ?? existing.starts_at,
    ends_at: patch.ends_at ?? existing.ends_at,
    all_day: patch.all_day !== undefined ? patch.all_day : existing.all_day,
  };
  if (!next.title) throw new Error("title required");
  if (new Date(next.ends_at).getTime() < new Date(next.starts_at).getTime()) {
    throw new Error("ends_at must not be before starts_at");
  }
  const row = await q1<CalendarEventRow>(
    `update calendar_events set
       kind = $3, status = $4, title = $5, description = $6,
       starts_at = $7, ends_at = $8, all_day = $9, updated_at = now()
     where id = $1 and organization_id = $2
     returning *`,
    [id, existing.organization_id, next.kind, next.status, next.title, next.description, next.starts_at, next.ends_at, next.all_day],
  );
  return row as CalendarEventRow;
}

/** Delete a row from the acting org's own calendar. */
export async function deleteCalendarEvent(actor: Actor, id: string): Promise<void> {
  const orgId = requireOrg(actor);
  const result = await q1<{ id: string }>(`delete from calendar_events where id = $1 and organization_id = $2 returning id`, [id, orgId]);
  if (!result) throw new NotFoundError("calendar event not found");
}

/** Public, unauthenticated: merged busy windows only (no titles/kind/notes). */
export async function publicAvailability(
  orgId: string,
  range?: { from?: string; to?: string },
): Promise<BusyWindow[]> {
  const from = range?.from ?? new Date().toISOString();
  const to = range?.to ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await q<{ starts_at: string; ends_at: string; status: CalendarStatus }>(
    `select starts_at, ends_at, status from calendar_events
      where organization_id = $1 and status != 'cancelled' and ends_at >= $2 and starts_at <= $3`,
    [orgId, from, to],
  );
  return mergeBusyWindows(rows);
}

export interface RequestHoldInput {
  starts_at: string;
  ends_at: string;
  title?: string | null;
  note?: string | null;
  event_id?: string | null;
}

/**
 * "Book it" on a public profile: any signed-in user places a TENTATIVE hold on
 * a DIFFERENT org's calendar. The target org must confirm (status ->
 * confirmed) or cancel it themselves via the normal update/delete routes -
 * this never auto-confirms. When event_id is supplied it must be an event the
 * caller can see (so a client can only tie the hold to their own event).
 */
export async function requestHold(actor: Actor, targetOrgId: string, input: RequestHoldInput): Promise<CalendarEventRow> {
  if (!input.starts_at || !input.ends_at) throw new Error("starts_at and ends_at required");
  if (input.event_id) {
    const { getEvent } = await import("./events.js");
    await getEvent(actor, input.event_id); // throws NotFoundError/ForbiddenError if not visible to the caller
  }
  return insertCalendarEvent(targetOrgId, actor.user.id, {
    event_id: input.event_id ?? null,
    kind: "hold",
    status: "tentative",
    title: input.title?.trim() || "Availability hold requested",
    description: input.note ?? null,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    all_day: false,
  });
}

/** Get-or-create the acting org's private feed token. */
export async function getOrCreateFeedToken(actor: Actor): Promise<string> {
  const orgId = requireOrg(actor);
  const existing = await q1<{ token: string }>(`select token from calendar_feed_tokens where organization_id = $1`, [orgId]);
  if (existing) return existing.token;
  const token = randomToken(24);
  const row = await q1<{ token: string }>(
    `insert into calendar_feed_tokens (organization_id, token) values ($1, $2)
     on conflict (organization_id) do nothing
     returning token`,
    [orgId, token],
  );
  if (row) return row.token;
  // Lost the race to a concurrent get-or-create; re-select the winner's token.
  const winner = await q1<{ token: string }>(`select token from calendar_feed_tokens where organization_id = $1`, [orgId]);
  return winner?.token ?? token;
}

/** Rotate (replace) the acting org's feed token, invalidating the old link. */
export async function rotateFeedToken(actor: Actor): Promise<string> {
  const orgId = requireOrg(actor);
  const token = randomToken(24);
  await q1(
    `insert into calendar_feed_tokens (organization_id, token, rotated_at) values ($1, $2, now())
     on conflict (organization_id) do update set token = excluded.token, rotated_at = now()`,
    [orgId, token],
  );
  return token;
}

/** Resolve an org id from a feed token (used by the public .ics route). Also
 *  returns the org name for X-WR-CALNAME. Null when the token is unknown. */
export async function orgForFeedToken(token: string): Promise<{ orgId: string; orgName: string } | null> {
  const row = await q1<{ organization_id: string; name: string | null }>(
    `select t.organization_id, o.name
       from calendar_feed_tokens t join organizations o on o.id = t.organization_id
      where t.token = $1`,
    [token],
  );
  return row ? { orgId: row.organization_id, orgName: row.name ?? "Divini Partners calendar" } : null;
}

/** All (non-cancelled-only is NOT applied here - the feed shows the org's own
 *  cancellations too, see buildIcsCalendar) calendar rows for the ICS feed. */
export async function calendarEventsForFeed(orgId: string): Promise<CalendarEventRow[]> {
  return q<CalendarEventRow>(
    `select * from calendar_events
      where organization_id = $1 and starts_at >= now() - interval '30 days'
      order by starts_at asc
      limit 1000`,
    [orgId],
  );
}
