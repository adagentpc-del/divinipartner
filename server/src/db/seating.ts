/**
 * Phase 6 - Floorplans + Seating Charts data-access layer (blueprint 14.3, 14.4).
 *
 * Floorplans are uploaded references (file_url) scoped to an event. Seating
 * charts place tables/objects + zones on a floorplan and hold guest -> table
 * assignments, all inside a single jsonb `layout`. Read access follows the
 * event; mutation requires event ownership (mirrors events.ts).
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

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
    throw new ForbiddenError("only the event owner can edit floorplans and seating");
  }
}

// ---- Reference data --------------------------------------------------------
export const ZONE_TYPES: { key: string; label: string }[] = [
  { key: "catering", label: "Catering" },
  { key: "dance", label: "Dance floor" },
  { key: "stage", label: "Stage" },
  { key: "check_in", label: "Check-in" },
  { key: "photo", label: "Photo" },
  { key: "vendor", label: "Vendor zone" },
  { key: "bar", label: "Bar" },
  { key: "lounge", label: "Lounge" },
];
export const TABLE_SHAPES = ["round", "rectangle", "square", "oval", "head", "cocktail"];

// ============================================================================
// FLOORPLANS
// ============================================================================
export type FloorplanRow = {
  id: string;
  event_id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string | null;
  description: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  width: string | null;
  height: string | null;
  scale: string | null;
  is_primary: boolean | null;
  created_at: string;
  updated_at: string | null;
};

export async function listFloorplans(actor: Actor, eventId: string): Promise<FloorplanRow[]> {
  await canSee(actor, eventId);
  return q<FloorplanRow>(
    `select * from floorplans where event_id = $1 order by is_primary desc, created_at asc`,
    [eventId],
  );
}

export type FloorplanInput = {
  name?: string | null;
  description?: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  scale?: string | null;
  venue_id?: string | null;
  is_primary?: boolean | null;
};

export async function addFloorplan(
  actor: Actor,
  eventId: string,
  input: FloorplanInput,
): Promise<FloorplanRow> {
  await requireOwner(actor, eventId);
  const row = await q1<FloorplanRow>(
    `insert into floorplans
       (event_id, venue_id, organization_id, name, description, file_url, thumbnail_url,
        width, height, scale, is_primary, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning *`,
    [
      eventId,
      input.venue_id ?? null,
      actor.org?.id ?? null,
      input.name ?? "Floorplan",
      input.description ?? null,
      input.file_url ?? null,
      input.thumbnail_url ?? null,
      input.width ?? 1000,
      input.height ?? 700,
      input.scale ?? null,
      input.is_primary ?? false,
      actor.user.id,
    ],
  );
  return row as FloorplanRow;
}

async function loadFloorplanEvent(floorplanId: string): Promise<string> {
  const f = await q1<{ event_id: string }>(`select event_id from floorplans where id = $1`, [
    floorplanId,
  ]);
  if (!f) throw new NotFoundError("floorplan not found");
  return f.event_id;
}

export async function updateFloorplan(
  actor: Actor,
  floorplanId: string,
  patch: FloorplanInput,
): Promise<FloorplanRow> {
  const eventId = await loadFloorplanEvent(floorplanId);
  await requireOwner(actor, eventId);
  const row = await q1<FloorplanRow>(
    `update floorplans set
        name = coalesce($2, name),
        description = coalesce($3, description),
        file_url = coalesce($4, file_url),
        thumbnail_url = coalesce($5, thumbnail_url),
        width = coalesce($6, width),
        height = coalesce($7, height),
        scale = coalesce($8, scale),
        is_primary = coalesce($9, is_primary),
        updated_at = now()
      where id = $1 returning *`,
    [
      floorplanId,
      patch.name ?? null,
      patch.description ?? null,
      patch.file_url ?? null,
      patch.thumbnail_url ?? null,
      patch.width ?? null,
      patch.height ?? null,
      patch.scale ?? null,
      patch.is_primary ?? null,
    ],
  );
  return row as FloorplanRow;
}

export async function deleteFloorplan(actor: Actor, floorplanId: string): Promise<void> {
  const eventId = await loadFloorplanEvent(floorplanId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from floorplans where id = $1`, [floorplanId]);
}

// ============================================================================
// SEATING CHARTS
// ============================================================================
export type SeatingTable = {
  id: string;
  label: string;
  x: number;
  y: number;
  shape?: string;
  seats?: number;
  vip?: boolean;
  rotation?: number;
};
export type SeatingZone = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};
export type SeatingLayout = {
  tables?: SeatingTable[];
  zones?: SeatingZone[];
  assignments?: Record<string, string>; // guestId -> tableId
};

export type SeatingChartRow = {
  id: string;
  event_id: string;
  floorplan_id: string | null;
  organization_id: string | null;
  name: string | null;
  status: string | null;
  layout: SeatingLayout | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
};

export async function listSeatingCharts(
  actor: Actor,
  eventId: string,
): Promise<SeatingChartRow[]> {
  await canSee(actor, eventId);
  return q<SeatingChartRow>(
    `select * from seating_charts where event_id = $1 order by is_active desc, created_at asc`,
    [eventId],
  );
}

export async function getSeatingChart(actor: Actor, chartId: string): Promise<SeatingChartRow> {
  const chart = await q1<SeatingChartRow>(`select * from seating_charts where id = $1`, [chartId]);
  if (!chart) throw new NotFoundError("seating chart not found");
  await canSee(actor, chart.event_id);
  return chart;
}

export type SeatingChartInput = {
  name?: string | null;
  floorplan_id?: string | null;
  status?: string | null;
  layout?: SeatingLayout | null;
  is_active?: boolean | null;
};

export async function createSeatingChart(
  actor: Actor,
  eventId: string,
  input: SeatingChartInput,
): Promise<SeatingChartRow> {
  await requireOwner(actor, eventId);
  const row = await q1<SeatingChartRow>(
    `insert into seating_charts
       (event_id, floorplan_id, organization_id, name, status, layout, is_active, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      eventId,
      input.floorplan_id ?? null,
      actor.org?.id ?? null,
      input.name ?? "Seating chart",
      input.status ?? "draft",
      JSON.stringify(input.layout ?? { tables: [], zones: [], assignments: {} }),
      input.is_active ?? false,
      actor.user.id,
    ],
  );
  return row as SeatingChartRow;
}

async function loadChartEvent(chartId: string): Promise<string> {
  const c = await q1<{ event_id: string }>(`select event_id from seating_charts where id = $1`, [
    chartId,
  ]);
  if (!c) throw new NotFoundError("seating chart not found");
  return c.event_id;
}

/** Replace the layout / metadata of a seating chart (owner only). */
export async function updateSeatingChart(
  actor: Actor,
  chartId: string,
  patch: SeatingChartInput,
): Promise<SeatingChartRow> {
  const eventId = await loadChartEvent(chartId);
  await requireOwner(actor, eventId);
  const row = await q1<SeatingChartRow>(
    `update seating_charts set
        name = coalesce($2, name),
        floorplan_id = coalesce($3, floorplan_id),
        status = coalesce($4, status),
        layout = coalesce($5::jsonb, layout),
        is_active = coalesce($6, is_active),
        updated_at = now()
      where id = $1 returning *`,
    [
      chartId,
      patch.name ?? null,
      patch.floorplan_id ?? null,
      patch.status ?? null,
      patch.layout != null ? JSON.stringify(patch.layout) : null,
      patch.is_active ?? null,
    ],
  );
  return row as SeatingChartRow;
}

export async function deleteSeatingChart(actor: Actor, chartId: string): Promise<void> {
  const eventId = await loadChartEvent(chartId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from seating_charts where id = $1`, [chartId]);
}
