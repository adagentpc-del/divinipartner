/**
 * Friction Elimination - U14 Installation Management (data-access layer).
 *
 * Org-scoped CRUD over the NEW `installations` table (db/schema-fe-install-guest.sql).
 * An installation is the shared venue / vendor / planner timeline for getting a
 * vendor in and out of a venue: arrival, setup window, live progress, completion
 * photos, removal schedule and the venue's sign-off.
 *
 * IDOR: visibility/edit rights piggyback on the parent event exactly like the
 * guest list (a user who can see the event can read its installations; an owner
 * of the event can mutate them). We never trust a raw event_id from the client;
 * getEvent() throws NotFound/Forbidden for events outside the actor's tenant.
 *
 * Additive only. Does not touch the existing guests / event-day files.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

// ---- Reference data --------------------------------------------------------
export const INSTALL_STATUSES: { key: string; label: string }[] = [
  { key: "scheduled", label: "Scheduled" },
  { key: "en_route", label: "En route" },
  { key: "on_site", label: "On site" },
  { key: "setting_up", label: "Setting up" },
  { key: "installed", label: "Installed" },
  { key: "removing", label: "Removing" },
  { key: "removed", label: "Removed" },
  { key: "complete", label: "Complete" },
];
const STATUS_KEYS = new Set(INSTALL_STATUSES.map((s) => s.key));

// Access helpers: read => can see event; write => owns event (mirrors guests.ts).
async function canSee(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId); // throws NotFound / Forbidden
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
    throw new ForbiddenError("only the event owner can manage installations");
  }
}

export type InstallationRow = {
  id: string;
  event_id: string;
  vendor_id: string | null;
  arrival_time: string | null;
  setup_window: unknown;
  status: string | null;
  progress: number | null;
  completion_photos: unknown;
  removal_schedule: unknown;
  venue_approved: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

const SELECT = `select
  id, event_id, vendor_id, arrival_time, setup_window, status, progress,
  completion_photos, removal_schedule, venue_approved, notes, created_at, updated_at
from installations`;

function normStatus(v: string | null | undefined): string | null {
  if (v == null) return null;
  return STATUS_KEYS.has(v) ? v : null;
}

function clampProgress(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}

/** List installations on an event (read access). */
export async function listInstallations(actor: Actor, eventId: string): Promise<InstallationRow[]> {
  await canSee(actor, eventId);
  return q<InstallationRow>(
    `${SELECT} where event_id = $1 order by arrival_time asc nulls last, created_at asc`,
    [eventId],
  );
}

export type InstallationInput = {
  vendor_id?: string | null;
  arrival_time?: string | null;
  setup_window?: unknown;
  status?: string | null;
  progress?: number | null;
  completion_photos?: unknown;
  removal_schedule?: unknown;
  venue_approved?: boolean | null;
  notes?: string | null;
};

/** Create an installation row on an event (owner only). */
export async function createInstallation(
  actor: Actor,
  eventId: string,
  input: InstallationInput,
): Promise<InstallationRow> {
  await requireOwner(actor, eventId);
  const row = await q1<InstallationRow>(
    `insert into installations
       (event_id, vendor_id, arrival_time, setup_window, status, progress,
        completion_photos, removal_schedule, venue_approved, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      eventId,
      input.vendor_id ?? null,
      input.arrival_time ?? null,
      input.setup_window ?? null,
      normStatus(input.status) ?? "scheduled",
      clampProgress(input.progress) ?? 0,
      input.completion_photos ?? null,
      input.removal_schedule ?? null,
      input.venue_approved ?? false,
      input.notes ?? null,
    ],
  );
  return row as InstallationRow;
}

/** Resolve the parent event of an installation (or throw NotFound). */
async function loadInstallEvent(installId: string): Promise<string> {
  const r = await q1<{ event_id: string }>(
    `select event_id from installations where id = $1`,
    [installId],
  );
  if (!r) throw new NotFoundError("installation not found");
  return r.event_id;
}

/** Patch an installation (owner only). */
export async function updateInstallation(
  actor: Actor,
  installId: string,
  patch: InstallationInput,
): Promise<InstallationRow> {
  const eventId = await loadInstallEvent(installId);
  await requireOwner(actor, eventId);
  const row = await q1<InstallationRow>(
    `update installations set
        vendor_id = coalesce($2, vendor_id),
        arrival_time = coalesce($3, arrival_time),
        setup_window = coalesce($4, setup_window),
        status = coalesce($5, status),
        progress = coalesce($6, progress),
        completion_photos = coalesce($7, completion_photos),
        removal_schedule = coalesce($8, removal_schedule),
        venue_approved = coalesce($9, venue_approved),
        notes = coalesce($10, notes),
        updated_at = now()
      where id = $1
      returning *`,
    [
      installId,
      patch.vendor_id ?? null,
      patch.arrival_time ?? null,
      patch.setup_window ?? null,
      normStatus(patch.status),
      clampProgress(patch.progress),
      patch.completion_photos ?? null,
      patch.removal_schedule ?? null,
      patch.venue_approved ?? null,
      patch.notes ?? null,
    ],
  );
  if (!row) throw new NotFoundError("installation not found");
  return row;
}

/** Set live progress 0-100 (owner only); optional status change. */
export async function setProgress(
  actor: Actor,
  installId: string,
  progress: number,
  status?: string | null,
): Promise<InstallationRow> {
  const eventId = await loadInstallEvent(installId);
  await requireOwner(actor, eventId);
  const row = await q1<InstallationRow>(
    `update installations set
        progress = $2,
        status = coalesce($3, status),
        updated_at = now()
      where id = $1
      returning *`,
    [installId, clampProgress(progress) ?? 0, normStatus(status)],
  );
  if (!row) throw new NotFoundError("installation not found");
  return row;
}

/** Venue sign-off on an installation (owner only). */
export async function setVenueApproved(
  actor: Actor,
  installId: string,
  approved: boolean,
): Promise<InstallationRow> {
  const eventId = await loadInstallEvent(installId);
  await requireOwner(actor, eventId);
  const row = await q1<InstallationRow>(
    `update installations set venue_approved = $2, updated_at = now()
      where id = $1 returning *`,
    [installId, !!approved],
  );
  if (!row) throw new NotFoundError("installation not found");
  return row;
}

/** Delete an installation (owner only). */
export async function deleteInstallation(actor: Actor, installId: string): Promise<void> {
  const eventId = await loadInstallEvent(installId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from installations where id = $1`, [installId]);
}
