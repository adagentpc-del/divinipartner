/**
 * Intelligence Moat - F2 Event Playbook Engine (data-access layer).
 *
 * Org-scoped CRUD over event_playbooks (db/schema-im-playbooks.sql) plus the two
 * compounding operations:
 *
 *   saveEventAsPlaybook(actor, eventId, name, template_type)
 *     Reads the event + its children (vendors, derived timeline, tasks), runs
 *     the pure buildPayloadFromEvent() transform, and stores the playbook owned
 *     by the actor's org. IDOR-safe: getEvent() enforces the actor can see the
 *     event before anything is read.
 *
 *   cloneToEvent(actor, playbookId, overrides)
 *     Loads an org-visible playbook, runs the pure clonePlanFromPayload()
 *     transform, then creates a brand new event THROUGH THE EVENTS REPO
 *     (events.createEvent) so all of its ownership / org-scoping / status
 *     defaults apply unchanged, and repopulates timeline (itinerary_items),
 *     tasks and vendors (event_vendors) for the new event.
 *
 * Every read is scoped to the acting org; a playbook is visible only to the org
 * that owns it (or platform admins). This COMPLEMENTS event_templates and does
 * not touch that table.
 */

import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, createEvent, type CreateEventInput } from "./events.js";
import { buildItinerary } from "./itinerary.js";
import { listTasks } from "./tasks.js";
import {
  buildPayloadFromEvent,
  clonePlanFromPayload,
  type PlaybookPayload,
  type PlaybookTimelineInput,
  type PlaybookTaskInput,
  type PlaybookVendorInput,
  type CloneOverrides,
} from "../lib/playbooks.js";

export type PlaybookRow = {
  id: string;
  owner_org_id: string | null;
  name: string;
  template_type: string | null;
  payload: PlaybookPayload | Record<string, unknown>;
  created_from_event_id: string | null;
  created_at: string;
  updated_at: string;
};

const P_COLS = `
  id, owner_org_id, name, template_type, payload, created_from_event_id,
  created_at, updated_at
`;

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** List the playbooks the actor's org owns (admins see all), newest first. */
export async function listPlaybooks(actor: Actor): Promise<PlaybookRow[]> {
  if (isAdmin(actor)) {
    return q<PlaybookRow>(
      `select ${P_COLS} from event_playbooks order by created_at desc limit 500`,
    );
  }
  return q<PlaybookRow>(
    `select ${P_COLS} from event_playbooks
      where owner_org_id = $1
      order by created_at desc
      limit 500`,
    [actor.org?.id ?? null],
  );
}

/** Get one playbook visible to the actor, or throw. IDOR-safe (org-scoped). */
export async function getPlaybook(actor: Actor, id: string): Promise<PlaybookRow> {
  const row = await q1<PlaybookRow>(`select ${P_COLS} from event_playbooks where id = $1`, [id]);
  if (!row) throw new NotFoundError("playbook not found");
  if (!isAdmin(actor) && row.owner_org_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to playbook");
  }
  return row;
}

/**
 * Convert the event's derived itinerary into playbook timeline entries. Each
 * item's absolute start/end is stored as an offset (in minutes) from the event
 * start so a clone can re-anchor it to a new date. Items with no event start
 * keep null offsets.
 */
function timelineFromItinerary(
  items: Array<{
    title: string;
    description: string | null;
    category: string;
    owner_role: string;
    owner_label: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
  }>,
  eventStart: string | null,
): PlaybookTimelineInput[] {
  const baseMs = eventStart ? new Date(eventStart).getTime() : NaN;
  return items.map((i) => {
    let offset_minutes: number | null = null;
    let duration_minutes: number | null = null;
    if (i.start_time && Number.isFinite(baseMs)) {
      offset_minutes = Math.round((new Date(i.start_time).getTime() - baseMs) / 60_000);
    }
    if (i.start_time && i.end_time) {
      const dur = Math.round(
        (new Date(i.end_time).getTime() - new Date(i.start_time).getTime()) / 60_000,
      );
      if (Number.isFinite(dur) && dur > 0) duration_minutes = dur;
    }
    return {
      title: i.title,
      description: i.description,
      category: i.category,
      owner_role: i.owner_role,
      owner_label: i.owner_label,
      offset_minutes,
      duration_minutes,
      location: i.location,
    };
  });
}

/**
 * Convert the event's tasks into playbook task entries, storing each due_date
 * as an offset (in days) from the event date so a clone can re-anchor them.
 */
function tasksForPlaybook(
  tasks: Array<{
    name: string | null;
    description: string | null;
    category: string | null;
    priority: string | null;
    assigned_role: string | null;
    milestone: boolean | null;
    template_key: string | null;
    due_date: string | null;
  }>,
  eventDate: string | null,
): PlaybookTaskInput[] {
  const baseMs = eventDate ? new Date(eventDate).getTime() : NaN;
  return tasks.map((t) => {
    let offset_days: number | null = null;
    if (t.due_date && Number.isFinite(baseMs)) {
      offset_days = Math.round((new Date(t.due_date).getTime() - baseMs) / 86_400_000);
    }
    return {
      name: t.name,
      description: t.description,
      category: t.category,
      priority: t.priority,
      assigned_role: t.assigned_role,
      milestone: t.milestone,
      offset_days,
      template_key: t.template_key,
    };
  });
}

/**
 * Save a whole event as a reusable playbook owned by the actor's org. Reads are
 * IDOR-safe: getEvent() throws unless the actor can see the event.
 */
export async function saveEventAsPlaybook(
  actor: Actor,
  eventId: string,
  name: string,
  template_type: string | null,
): Promise<PlaybookRow> {
  const ev = await getEvent(actor, eventId); // enforces access

  const venue = ev.venue_id
    ? await q1<{ name: string; city: string | null; region: string | null; capacity: number | null }>(
        `select name, city, region, capacity from venues where id = $1`,
        [ev.venue_id],
      )
    : null;

  const vendorRows = await q<{
    organization_id: string;
    vendor_id: string | null;
    role: string | null;
    status: string | null;
  }>(
    `select organization_id, vendor_id, role, status from event_vendors where event_id = $1 order by created_at asc`,
    [eventId],
  );
  const vendors: PlaybookVendorInput[] = vendorRows.map((v) => ({
    organization_id: v.organization_id,
    vendor_id: v.vendor_id,
    role: v.role,
    status: v.status,
  }));

  // Derived day-of itinerary (auto windows + persisted items) -> offsets.
  const itinerary = await buildItinerary(actor, eventId);
  const timeline = timelineFromItinerary(itinerary.items, ev.date_time);

  // Tasks (workflow + manual) -> day offsets.
  const taskRows = await listTasks(actor, eventId);
  const tasks = tasksForPlaybook(taskRows, ev.date_time);

  // Documents scope: derived from the required-services list (no fabrication).
  const documents = (ev.required_services ?? []).map((s) => ({
    label: `Confirm documents for ${s}`,
    kind: s,
    required: true,
  }));

  const payload = buildPayloadFromEvent({
    event: {
      id: ev.id,
      name: ev.name,
      type: ev.type,
      guest_count: ev.guest_count,
      budget: ev.budget,
      event_goals: ev.event_goals,
      required_services: ev.required_services,
      venue_id: ev.venue_id,
      branding_opportunity_id: ev.branding_opportunity_id,
      status: ev.status,
    },
    venue,
    vendors,
    timeline,
    tasks,
    documents,
  });

  const row = await q1<PlaybookRow>(
    `insert into event_playbooks (owner_org_id, name, template_type, payload, created_from_event_id, updated_at)
       values ($1,$2,$3,$4,$5, now())
     returning ${P_COLS}`,
    [
      actor.org?.id ?? null,
      name?.trim() || `${ev.name} playbook`,
      template_type ?? ev.type ?? null,
      JSON.stringify(payload),
      ev.id,
    ],
  );
  return row as PlaybookRow;
}

export type CloneToEventResult = {
  event: Awaited<ReturnType<typeof createEvent>>;
  vendors_added: number;
  timeline_added: number;
  tasks_added: number;
};

/**
 * Clone a playbook into a brand new event. The event itself is created through
 * the events repo (events.createEvent), so org ownership, planner/client
 * assignment and the 'inquiry' default status are applied exactly as for any
 * normal new event. Child rows (event_vendors, itinerary_items, tasks) are then
 * inserted for the new event id inside one transaction.
 */
export async function cloneToEvent(
  actor: Actor,
  playbookId: string,
  overrides: CloneOverrides = {},
): Promise<CloneToEventResult> {
  const pb = await getPlaybook(actor, playbookId); // IDOR-safe
  const payload = pb.payload as PlaybookPayload;
  const plan = clonePlanFromPayload(payload, overrides);

  // Reuse the events repo create path so the new event is owned + scoped to the
  // actor's org just like a hand-created event.
  const createInput: CreateEventInput = plan.createEvent;
  const event = await createEvent(actor, createInput);

  let vendors_added = 0;
  let timeline_added = 0;
  let tasks_added = 0;

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const v of plan.vendors) {
      await client.query(
        `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
           values ($1,$2,$3,$4,'added')
         on conflict (event_id, organization_id) do nothing`,
        [event.id, v.organization_id, v.vendor_id, v.role],
      );
      vendors_added += 1;
    }

    let order = 0;
    for (const t of plan.timeline) {
      await client.query(
        `insert into itinerary_items
           (event_id, organization_id, title, description, category, start_time, end_time,
            duration_minutes, location, owner_role, owner_label, source, status, pinned, sort_order, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'playbook','planned',false,$12,$13)`,
        [
          event.id,
          actor.org?.id ?? null,
          t.title,
          t.description,
          t.category,
          t.start_time,
          t.end_time,
          t.duration_minutes,
          t.location,
          t.owner_role,
          t.owner_label,
          order++,
          actor.user.id,
        ],
      );
      timeline_added += 1;
    }

    let torder = 0;
    for (const t of plan.tasks) {
      await client.query(
        `insert into tasks
           (event_id, organization_id, name, description, category, priority, status, milestone,
            assigned_role, due_date, template_key, sort_order, created_by)
         values ($1,$2,$3,$4,$5,$6,'todo',$7,$8,$9,$10,$11,$12)`,
        [
          event.id,
          actor.org?.id ?? null,
          t.name,
          t.description,
          t.category,
          t.priority,
          t.milestone,
          t.assigned_role,
          t.due_date,
          t.template_key,
          torder++,
          actor.user.id,
        ],
      );
      tasks_added += 1;
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  return { event, vendors_added, timeline_added, tasks_added };
}
