/**
 * Nonprofit Volunteer Management - data-access layer (Phase 2).
 *
 * Org-scoped, IDOR-safe CRUD over the tables created in
 * db/schema-np-volunteer.sql:
 *   - volunteers       (list / get / create / assign / check-in / update / remove)
 *   - volunteer_tasks  (list / add / complete per volunteer)
 * plus listUpcomingShiftVolunteers - the roster the shift-reminder endpoint walks.
 *
 * Authorization mirrors server/src/db/fundraising.ts: every row belongs to the
 * organization that created it (organization_id). An actor may read/write when
 * their org owns the row, or they are an admin / super_admin. Any parent id
 * (an optional fundraising_event link) is validated against the actor's org
 * before a write so a forged id from another tenant is rejected (ForbiddenError)
 * rather than silently acted on. Deterministic - nothing is fabricated.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

// ---- Row types --------------------------------------------------------------

export type VolunteerRow = {
  id: string;
  fundraising_event_id: string | null;
  organization_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  emergency_contact: string | null;
  role: string | null;
  shift: string | null;
  status: string | null;
  checked_in_at: string | null;
  created_at: string;
};

export type VolunteerTaskRow = {
  id: string;
  volunteer_id: string | null;
  label: string | null;
  status: string | null;
  created_at: string;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** The actor's org id, or throw Forbidden when they have no org (and not admin). */
function requireOrgId(actor: Actor): string {
  if (actor.org?.id) return actor.org.id;
  throw new ForbiddenError("no organization");
}

/**
 * Verify an optional fundraising-event link belongs to the actor's org (so a
 * volunteer cannot be attached to another tenant's fundraising event).
 */
async function assertFundraisingEventLink(actor: Actor, fundraisingEventId: string): Promise<void> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from fundraising_events where id = $1`,
    [fundraisingEventId],
  );
  if (!row) throw new NotFoundError("fundraising event not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to the linked fundraising event");
  }
}

/** Resolve + authorize a volunteer the actor may act on. */
async function assertVolunteer(actor: Actor, id: string): Promise<VolunteerRow> {
  const row = await q1<VolunteerRow>(`select * from volunteers where id = $1`, [id]);
  if (!row) throw new NotFoundError("volunteer not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this volunteer");
  }
  return row;
}

/** Resolve + authorize a volunteer task the actor may act on (via its volunteer). */
async function assertVolunteerTask(actor: Actor, id: string): Promise<VolunteerTaskRow> {
  const row = await q1<VolunteerTaskRow>(`select * from volunteer_tasks where id = $1`, [id]);
  if (!row) throw new NotFoundError("volunteer task not found");
  if (!row.volunteer_id) throw new NotFoundError("volunteer task not found");
  // Authorize through the parent volunteer's org.
  await assertVolunteer(actor, row.volunteer_id);
  return row;
}

// ---- volunteers: CRUD -------------------------------------------------------

/** List the actor org's volunteers, optionally filtered to one fundraising event. */
export async function listVolunteers(
  actor: Actor,
  fundraisingEventId?: string | null,
): Promise<VolunteerRow[]> {
  if (isAdmin(actor) && !actor.org?.id) {
    if (fundraisingEventId) {
      return q<VolunteerRow>(
        `select * from volunteers where fundraising_event_id = $1 order by created_at desc`,
        [fundraisingEventId],
      );
    }
    return q<VolunteerRow>(`select * from volunteers order by created_at desc`);
  }
  const orgId = requireOrgId(actor);
  if (fundraisingEventId) {
    return q<VolunteerRow>(
      `select * from volunteers
        where organization_id = $1 and fundraising_event_id = $2
        order by created_at desc`,
      [orgId, fundraisingEventId],
    );
  }
  return q<VolunteerRow>(
    `select * from volunteers where organization_id = $1 order by created_at desc`,
    [orgId],
  );
}

/** Get one volunteer (org-scoped). */
export async function getVolunteer(actor: Actor, id: string): Promise<VolunteerRow> {
  return assertVolunteer(actor, id);
}

export type VolunteerInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
  fundraising_event_id?: string | null;
};

/** Register a volunteer for the actor's org. */
export async function createVolunteer(
  actor: Actor,
  input: VolunteerInput,
): Promise<VolunteerRow> {
  const orgId = requireOrgId(actor);
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name required");
  }
  if (input.fundraising_event_id) {
    await assertFundraisingEventLink(actor, input.fundraising_event_id);
  }
  const row = await q1<VolunteerRow>(
    `insert into volunteers
       (fundraising_event_id, organization_id, name, email, phone, emergency_contact, status)
     values ($1,$2,$3,$4,$5,$6,'registered')
     returning *`,
    [
      input.fundraising_event_id ?? null,
      orgId,
      input.name,
      input.email ?? null,
      input.phone ?? null,
      input.emergency_contact ?? null,
    ],
  );
  return row as VolunteerRow;
}

export type VolunteerPatch = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
  status?: string | null;
};

const VALID_STATUS = ["registered", "assigned", "checked_in", "no_show", "cancelled"];

/** Patch a volunteer's contact fields / status (org-scoped). */
export async function updateVolunteer(
  actor: Actor,
  id: string,
  patch: VolunteerPatch,
): Promise<VolunteerRow> {
  await assertVolunteer(actor, id);
  if (patch.status != null && !VALID_STATUS.includes(patch.status)) {
    throw new ForbiddenError("invalid status");
  }
  const row = await q1<VolunteerRow>(
    `update volunteers set
        name = coalesce($2, name),
        email = coalesce($3, email),
        phone = coalesce($4, phone),
        emergency_contact = coalesce($5, emergency_contact),
        status = coalesce($6, status)
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.email ?? null,
      patch.phone ?? null,
      patch.emergency_contact ?? null,
      patch.status ?? null,
    ],
  );
  return row as VolunteerRow;
}

export type VolunteerAssignInput = {
  role?: string | null;
  shift?: string | null;
};

/** Assign a role + shift; advances status to 'assigned' (org-scoped). */
export async function assignVolunteer(
  actor: Actor,
  id: string,
  input: VolunteerAssignInput,
): Promise<VolunteerRow> {
  await assertVolunteer(actor, id);
  const row = await q1<VolunteerRow>(
    `update volunteers set
        role = coalesce($2, role),
        shift = coalesce($3, shift),
        status = 'assigned'
      where id = $1
      returning *`,
    [id, input.role ?? null, input.shift ?? null],
  );
  return row as VolunteerRow;
}

/** Check a volunteer in: stamps checked_in_at + status 'checked_in' (org-scoped). */
export async function checkInVolunteer(actor: Actor, id: string): Promise<VolunteerRow> {
  await assertVolunteer(actor, id);
  const row = await q1<VolunteerRow>(
    `update volunteers set
        status = 'checked_in',
        checked_in_at = now()
      where id = $1
      returning *`,
    [id],
  );
  return row as VolunteerRow;
}

/** Remove a volunteer (org-scoped). Cascades to their tasks. */
export async function removeVolunteer(actor: Actor, id: string): Promise<void> {
  await assertVolunteer(actor, id);
  await pool.query(`delete from volunteers where id = $1`, [id]);
}

// ---- volunteer_tasks: list / add / complete --------------------------------

/** List a volunteer's tasks (org-scoped through the volunteer). */
export async function listVolunteerTasks(
  actor: Actor,
  volunteerId: string,
): Promise<VolunteerTaskRow[]> {
  await assertVolunteer(actor, volunteerId);
  return q<VolunteerTaskRow>(
    `select * from volunteer_tasks where volunteer_id = $1 order by created_at`,
    [volunteerId],
  );
}

/** Add a task to a volunteer's checklist (org-scoped through the volunteer). */
export async function addVolunteerTask(
  actor: Actor,
  volunteerId: string,
  label: string,
): Promise<VolunteerTaskRow> {
  await assertVolunteer(actor, volunteerId);
  if (!label || typeof label !== "string") {
    throw new ForbiddenError("label required");
  }
  const row = await q1<VolunteerTaskRow>(
    `insert into volunteer_tasks (volunteer_id, label, status)
     values ($1,$2,'open')
     returning *`,
    [volunteerId, label],
  );
  return row as VolunteerTaskRow;
}

/** Mark a volunteer task done / open (org-scoped through the volunteer). */
export async function setVolunteerTaskStatus(
  actor: Actor,
  taskId: string,
  status: "open" | "done",
): Promise<VolunteerTaskRow> {
  await assertVolunteerTask(actor, taskId);
  if (status !== "open" && status !== "done") {
    throw new ForbiddenError("invalid status");
  }
  const row = await q1<VolunteerTaskRow>(
    `update volunteer_tasks set status = $2 where id = $1 returning *`,
    [taskId, status],
  );
  return row as VolunteerTaskRow;
}

// ---- Shift reminder ---------------------------------------------------------

/**
 * The actor org's volunteers that have a shift set and are not cancelled / no
 * show - the roster the manual shift-reminder endpoint walks. Deterministic;
 * shift is free text (no date math), so "upcoming" is any volunteer with an
 * assigned shift who is still active.
 */
export async function listUpcomingShiftVolunteers(
  actor: Actor,
  fundraisingEventId?: string | null,
): Promise<VolunteerRow[]> {
  const orgId = requireOrgId(actor);
  if (fundraisingEventId) {
    await assertFundraisingEventLink(actor, fundraisingEventId);
    return q<VolunteerRow>(
      `select * from volunteers
        where organization_id = $1 and fundraising_event_id = $2
          and shift is not null and shift <> ''
          and status not in ('cancelled','no_show')
        order by created_at`,
      [orgId, fundraisingEventId],
    );
  }
  return q<VolunteerRow>(
    `select * from volunteers
      where organization_id = $1
        and shift is not null and shift <> ''
        and status not in ('cancelled','no_show')
      order by created_at`,
    [orgId],
  );
}
