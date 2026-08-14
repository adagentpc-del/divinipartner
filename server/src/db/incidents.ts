/**
 * Incident Management (live-ops phase, Part 15-16, 2026-08-09).
 *
 * event_incidents (db/schema-event-incidents.sql) is the one durable
 * record per incident. Any active event member may report one (safety
 * awareness should never be gated behind a specific role); only
 * owner/planner or the incident's own assigned responder may update its
 * status, assignment, or resolution. Visibility is enforced server-side
 * via lib/incidentVisibility.ts -- "do not expose medical detail, guest
 * PII, security detail, internal investigations to general vendors or
 * sponsors" -- never a client-selectable filter, and never something the
 * frontend merely chooses not to render.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { audienceForRole } from "../lib/packetProjection.js";
import {
  filterIncidentsForAudience,
  isIncidentVisible,
  RESTRICTED_BY_DEFAULT_CATEGORIES,
  type IncidentCategory,
  type IncidentRow,
} from "../lib/incidentVisibility.js";
import { recordActivity } from "./eventActivity.js";

export type CreateIncidentInput = {
  category: IncidentCategory;
  severity?: "low" | "medium" | "high" | "critical";
  location?: string | null;
  description: string;
  restricted?: boolean;
  attachments?: unknown;
};

export async function createIncident(actor: Actor, eventId: string, input: CreateIncidentInput): Promise<IncidentRow> {
  await getEvent(actor, eventId);
  if (!input.description?.trim()) throw new ForbiddenError("incident description is required");
  const restricted = input.restricted ?? RESTRICTED_BY_DEFAULT_CATEGORIES.has(input.category);
  const row = await q1<IncidentRow>(
    `insert into event_incidents
       (event_id, category, severity, location, description, submitted_by, restricted, attachments)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      eventId,
      input.category,
      input.severity ?? "medium",
      input.location ?? null,
      input.description.trim(),
      actor.user.id,
      restricted,
      input.attachments == null ? null : JSON.stringify(input.attachments),
    ],
  );
  const incident = row as IncidentRow;

  // Activity timeline: the incident category (not "incident" generically)
  // means restricted medical/security/guest reports still get the
  // event_activity 'incident' category's own full-only default scope
  // (lib/activityVisibility.ts) -- never a broader activity-feed leak of
  // something the incident system itself is keeping restricted.
  await recordActivity(actor, eventId, {
    category: "incident",
    message: `Incident reported: ${input.category} (${input.severity ?? "medium"})`,
    relatedEntityType: "incident",
    relatedEntityId: incident.id,
    severity: input.severity === "critical" || input.severity === "high" ? "critical" : "warning",
  });

  return incident;
}

async function canManageIncident(actor: Actor, eventId: string, incident: IncidentRow): Promise<boolean> {
  if (await canManageEvent(actor, eventId)) return true;
  return incident.assigned_to === actor.user.id;
}

export type UpdateIncidentInput = {
  status?: "open" | "assigned" | "monitoring" | "resolved" | "closed";
  assigned_to?: string | null;
  resolution?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
};

export async function updateIncident(
  actor: Actor,
  eventId: string,
  incidentId: string,
  input: UpdateIncidentInput,
): Promise<IncidentRow> {
  await getEvent(actor, eventId);
  const existing = await q1<IncidentRow>(`select * from event_incidents where id = $1 and event_id = $2`, [
    incidentId,
    eventId,
  ]);
  if (!existing) throw new NotFoundError("incident not found");
  // Assigning a responder is itself an owner/planner action -- an
  // unassigned incident has no responder yet to authorize the change.
  if (input.assigned_to !== undefined && !(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can assign an incident");
  }
  if (!(await canManageIncident(actor, eventId, existing))) {
    throw new ForbiddenError("only the event owner, planner, or assigned responder can update this incident");
  }

  const status = input.status ?? existing.status;
  const row = await q1<IncidentRow>(
    `update event_incidents set
       status = $2,
       assigned_to = coalesce($3, assigned_to),
       resolution = coalesce($4, resolution),
       severity = coalesce($5, severity),
       resolved_at = case when $2 in ('resolved','closed') then coalesce(resolved_at, now()) else resolved_at end,
       updated_at = now()
     where id = $1
     returning *`,
    [incidentId, status, input.assigned_to ?? null, input.resolution ?? null, input.severity ?? null],
  );
  const updated = row as IncidentRow;

  if (status !== existing.status) {
    await recordActivity(actor, eventId, {
      category: "incident",
      message: `Incident ${status}: ${existing.category}`,
      relatedEntityType: "incident",
      relatedEntityId: incidentId,
    });
  }

  return updated;
}

/** Role-scoped incident list, newest first -- backend-enforced visibility,
 *  never a client-selectable filter (Part 16). */
export async function listIncidents(actor: Actor, eventId: string): Promise<IncidentRow[]> {
  await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  const rows = await q<IncidentRow>(`select * from event_incidents where event_id = $1 order by created_at desc`, [
    eventId,
  ]);
  return filterIncidentsForAudience(rows, audience, actor.user.id);
}

/** One incident by id -- 404s (not 403s) for a caller who cannot see it,
 *  the same not-found-not-forbidden pattern used to avoid confirming a
 *  restricted incident's existence to an unauthorized viewer. */
export async function getIncident(actor: Actor, eventId: string, incidentId: string): Promise<IncidentRow> {
  await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  const row = await q1<IncidentRow>(`select * from event_incidents where id = $1 and event_id = $2`, [
    incidentId,
    eventId,
  ]);
  if (!row || !isIncidentVisible(row, audience, actor.user.id)) throw new NotFoundError("incident not found");
  return row;
}
