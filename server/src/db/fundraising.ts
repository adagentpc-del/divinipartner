/**
 * Nonprofit / Charity core - fundraising data-access layer (Workstream B).
 *
 * Org-scoped, IDOR-safe CRUD over the tables created in db/schema-np-p1.sql:
 *   - fundraising_events    (list / get / create / update / delete)
 *   - sponsorship_packages  (list / create / update / delete) tiered layer
 *   - ticket_packages       (list / create / update / delete)
 * plus getNonprofitDashboard - a read-only, best-effort rollup for the actor's
 * organization.
 *
 * Authorization mirrors server/src/db/venue-twin.ts: every row belongs to the
 * organization that created it (organization_id). An actor may read/write when
 * their org owns the row, or they are an admin / super_admin. Every parent id is
 * validated against the actor's org before any write so a forged id from another
 * tenant is rejected (ForbiddenError) rather than silently acted on.
 *
 * Revenue + related-data handling is BEST-EFFORT and deterministic (see
 * server/src/lib/fundraising.ts). When payments tied to the org's fundraising
 * events resolve, that sum is the collected figure; otherwise we fall back to
 * committed revenue (sold * price). Optional related tables (sponsor fulfillment)
 * are probed with to_regclass and simply omitted when absent. Empty data yields
 * zeros - nothing is fabricated.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  isFundraisingKind,
  isSponsorTier,
  isTicketType,
  computeNonprofitRollup,
  num,
  type NonprofitRollup,
} from "../lib/fundraising.js";

// ---- Row types --------------------------------------------------------------

export type FundraisingEventRow = {
  id: string;
  event_id: string | null;
  organization_id: string | null;
  name: string;
  cause: string | null;
  kind: string | null;
  goal_amount: string | null;
  budget: string | null;
  event_date: string | null;
  guest_target: number | null;
  status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorshipPackageRow = {
  id: string;
  fundraising_event_id: string | null;
  organization_id: string | null;
  tier: string | null;
  name: string | null;
  price: string | null;
  benefits: unknown;
  tickets_included: number | null;
  quantity: number | null;
  sold: number | null;
  fulfillment_checklist: unknown;
  status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketPackageRow = {
  id: string;
  fundraising_event_id: string | null;
  organization_id: string | null;
  name: string | null;
  type: string | null;
  price: string | null;
  seats: number | null;
  quantity: number | null;
  sold: number | null;
  status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

/**
 * Resolve + authorize a fundraising event the actor may act on. Throws
 * NotFoundError when missing, ForbiddenError when owned by another org.
 */
async function assertFundraisingEvent(
  actor: Actor,
  fundraisingEventId: string,
): Promise<FundraisingEventRow> {
  const row = await q1<FundraisingEventRow>(
    `select * from fundraising_events where id = $1`,
    [fundraisingEventId],
  );
  if (!row) throw new NotFoundError("fundraising event not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this fundraising event");
  }
  return row;
}

// ---- fundraising_events: CRUD ----------------------------------------------

/** List the actor org's fundraising events, newest first. */
export async function listFundraisingEvents(actor: Actor): Promise<FundraisingEventRow[]> {
  if (isAdmin(actor) && !actor.org?.id) {
    return q<FundraisingEventRow>(
      `select * from fundraising_events order by created_at desc`,
    );
  }
  const orgId = requireOrgId(actor);
  return q<FundraisingEventRow>(
    `select * from fundraising_events where organization_id = $1 order by created_at desc`,
    [orgId],
  );
}

/** Get one fundraising event (org-scoped). */
export async function getFundraisingEvent(
  actor: Actor,
  id: string,
): Promise<FundraisingEventRow> {
  return assertFundraisingEvent(actor, id);
}

export type FundraisingEventInput = {
  name?: string | null;
  cause?: string | null;
  kind?: string | null;
  goal_amount?: number | null;
  budget?: number | null;
  event_date?: string | null;
  guest_target?: number | null;
  status?: string | null;
  event_id?: string | null;
};

/**
 * Verify an optional events link belongs to the actor's org (so a nonprofit
 * cannot attach a fundraising event to another tenant's event row).
 */
async function assertEventLink(actor: Actor, eventId: string): Promise<void> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from events where id = $1`,
    [eventId],
  );
  if (!row) throw new NotFoundError("linked event not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to the linked event");
  }
}

/** Create a fundraising event for the actor's org. */
export async function createFundraisingEvent(
  actor: Actor,
  input: FundraisingEventInput,
): Promise<FundraisingEventRow> {
  const orgId = requireOrgId(actor);
  if (!input.name || typeof input.name !== "string") {
    throw new ForbiddenError("name required");
  }
  if (input.kind != null && !isFundraisingKind(input.kind)) {
    throw new ForbiddenError("invalid kind");
  }
  if (input.event_id) await assertEventLink(actor, input.event_id);
  const row = await q1<FundraisingEventRow>(
    `insert into fundraising_events
       (event_id, organization_id, name, cause, kind, goal_amount, budget,
        event_date, guest_target, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      input.event_id ?? null,
      orgId,
      input.name,
      input.cause ?? null,
      input.kind ?? null,
      input.goal_amount ?? 0,
      input.budget ?? 0,
      input.event_date ?? null,
      input.guest_target ?? null,
      input.status ?? "draft",
      actor.user.id,
    ],
  );
  return row as FundraisingEventRow;
}

/** Patch a fundraising event (org-scoped). */
export async function updateFundraisingEvent(
  actor: Actor,
  id: string,
  patch: FundraisingEventInput,
): Promise<FundraisingEventRow> {
  await assertFundraisingEvent(actor, id);
  if (patch.kind != null && !isFundraisingKind(patch.kind)) {
    throw new ForbiddenError("invalid kind");
  }
  if (patch.event_id) await assertEventLink(actor, patch.event_id);
  const row = await q1<FundraisingEventRow>(
    `update fundraising_events set
        event_id = coalesce($2, event_id),
        name = coalesce($3, name),
        cause = coalesce($4, cause),
        kind = coalesce($5, kind),
        goal_amount = coalesce($6, goal_amount),
        budget = coalesce($7, budget),
        event_date = coalesce($8, event_date),
        guest_target = coalesce($9, guest_target),
        status = coalesce($10, status),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.event_id ?? null,
      patch.name ?? null,
      patch.cause ?? null,
      patch.kind ?? null,
      patch.goal_amount ?? null,
      patch.budget ?? null,
      patch.event_date ?? null,
      patch.guest_target ?? null,
      patch.status ?? null,
    ],
  );
  return row as FundraisingEventRow;
}

/** Delete a fundraising event (org-scoped). Cascades to its packages. */
export async function deleteFundraisingEvent(actor: Actor, id: string): Promise<void> {
  await assertFundraisingEvent(actor, id);
  await pool.query(`delete from fundraising_events where id = $1`, [id]);
}

// ---- sponsorship_packages: CRUD --------------------------------------------

/** List tiered sponsorship packages for a fundraising event (org-scoped). */
export async function listSponsorshipPackages(
  actor: Actor,
  fundraisingEventId: string,
): Promise<SponsorshipPackageRow[]> {
  await assertFundraisingEvent(actor, fundraisingEventId);
  return q<SponsorshipPackageRow>(
    `select * from sponsorship_packages where fundraising_event_id = $1 order by created_at`,
    [fundraisingEventId],
  );
}

export type SponsorshipPackageInput = {
  tier?: string | null;
  name?: string | null;
  price?: number | null;
  benefits?: unknown;
  tickets_included?: number | null;
  quantity?: number | null;
  sold?: number | null;
  fulfillment_checklist?: unknown;
  status?: string | null;
};

/** Create a tiered sponsorship package for a fundraising event (org-scoped). */
export async function createSponsorshipPackage(
  actor: Actor,
  fundraisingEventId: string,
  input: SponsorshipPackageInput,
): Promise<SponsorshipPackageRow> {
  const fe = await assertFundraisingEvent(actor, fundraisingEventId);
  if (input.tier != null && !isSponsorTier(input.tier)) {
    throw new ForbiddenError("invalid tier");
  }
  const row = await q1<SponsorshipPackageRow>(
    `insert into sponsorship_packages
       (fundraising_event_id, organization_id, tier, name, price, benefits,
        tickets_included, quantity, sold, fulfillment_checklist, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning *`,
    [
      fundraisingEventId,
      fe.organization_id,
      input.tier ?? null,
      input.name ?? null,
      input.price ?? 0,
      jsonbParam(input.benefits) ?? null,
      input.tickets_included ?? 0,
      input.quantity ?? 1,
      input.sold ?? 0,
      jsonbParam(input.fulfillment_checklist) ?? null,
      input.status ?? "open",
      actor.user.id,
    ],
  );
  return row as SponsorshipPackageRow;
}

/** Resolve + authorize a sponsorship package the actor may act on. */
async function assertSponsorshipPackage(
  actor: Actor,
  id: string,
): Promise<SponsorshipPackageRow> {
  const row = await q1<SponsorshipPackageRow>(
    `select * from sponsorship_packages where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("sponsorship package not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this sponsorship package");
  }
  return row;
}

/** Patch a sponsorship package (org-scoped). */
export async function updateSponsorshipPackage(
  actor: Actor,
  id: string,
  patch: SponsorshipPackageInput,
): Promise<SponsorshipPackageRow> {
  await assertSponsorshipPackage(actor, id);
  if (patch.tier != null && !isSponsorTier(patch.tier)) {
    throw new ForbiddenError("invalid tier");
  }
  const row = await q1<SponsorshipPackageRow>(
    `update sponsorship_packages set
        tier = coalesce($2, tier),
        name = coalesce($3, name),
        price = coalesce($4, price),
        benefits = coalesce($5, benefits),
        tickets_included = coalesce($6, tickets_included),
        quantity = coalesce($7, quantity),
        sold = coalesce($8, sold),
        fulfillment_checklist = coalesce($9, fulfillment_checklist),
        status = coalesce($10, status),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.tier ?? null,
      patch.name ?? null,
      patch.price ?? null,
      jsonbParam(patch.benefits) ?? null,
      patch.tickets_included ?? null,
      patch.quantity ?? null,
      patch.sold ?? null,
      jsonbParam(patch.fulfillment_checklist) ?? null,
      patch.status ?? null,
    ],
  );
  return row as SponsorshipPackageRow;
}

/** Delete a sponsorship package (org-scoped). */
export async function deleteSponsorshipPackage(actor: Actor, id: string): Promise<void> {
  await assertSponsorshipPackage(actor, id);
  await pool.query(`delete from sponsorship_packages where id = $1`, [id]);
}

// ---- ticket_packages: CRUD --------------------------------------------------

/** List ticket / table packages for a fundraising event (org-scoped). */
export async function listTicketPackages(
  actor: Actor,
  fundraisingEventId: string,
): Promise<TicketPackageRow[]> {
  await assertFundraisingEvent(actor, fundraisingEventId);
  return q<TicketPackageRow>(
    `select * from ticket_packages where fundraising_event_id = $1 order by created_at`,
    [fundraisingEventId],
  );
}

export type TicketPackageInput = {
  name?: string | null;
  type?: string | null;
  price?: number | null;
  seats?: number | null;
  quantity?: number | null;
  sold?: number | null;
  status?: string | null;
};

/** Create a ticket / table package for a fundraising event (org-scoped). */
export async function createTicketPackage(
  actor: Actor,
  fundraisingEventId: string,
  input: TicketPackageInput,
): Promise<TicketPackageRow> {
  const fe = await assertFundraisingEvent(actor, fundraisingEventId);
  if (input.type != null && !isTicketType(input.type)) {
    throw new ForbiddenError("invalid type");
  }
  const row = await q1<TicketPackageRow>(
    `insert into ticket_packages
       (fundraising_event_id, organization_id, name, type, price, seats,
        quantity, sold, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      fundraisingEventId,
      fe.organization_id,
      input.name ?? null,
      input.type ?? null,
      input.price ?? 0,
      input.seats ?? 1,
      input.quantity ?? 0,
      input.sold ?? 0,
      input.status ?? "open",
      actor.user.id,
    ],
  );
  return row as TicketPackageRow;
}

/** Resolve + authorize a ticket package the actor may act on. */
async function assertTicketPackage(actor: Actor, id: string): Promise<TicketPackageRow> {
  const row = await q1<TicketPackageRow>(`select * from ticket_packages where id = $1`, [id]);
  if (!row) throw new NotFoundError("ticket package not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this ticket package");
  }
  return row;
}

/** Patch a ticket package (org-scoped). */
export async function updateTicketPackage(
  actor: Actor,
  id: string,
  patch: TicketPackageInput,
): Promise<TicketPackageRow> {
  await assertTicketPackage(actor, id);
  if (patch.type != null && !isTicketType(patch.type)) {
    throw new ForbiddenError("invalid type");
  }
  const row = await q1<TicketPackageRow>(
    `update ticket_packages set
        name = coalesce($2, name),
        type = coalesce($3, type),
        price = coalesce($4, price),
        seats = coalesce($5, seats),
        quantity = coalesce($6, quantity),
        sold = coalesce($7, sold),
        status = coalesce($8, status),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.type ?? null,
      patch.price ?? null,
      patch.seats ?? null,
      patch.quantity ?? null,
      patch.sold ?? null,
      patch.status ?? null,
    ],
  );
  return row as TicketPackageRow;
}

/** Delete a ticket package (org-scoped). */
export async function deleteTicketPackage(actor: Actor, id: string): Promise<void> {
  await assertTicketPackage(actor, id);
  await pool.query(`delete from ticket_packages where id = $1`, [id]);
}

// ---- Dashboard rollup -------------------------------------------------------

/** True when a relation exists in the current database (graceful optional joins). */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

export type NonprofitDashboard = NonprofitRollup & {
  fundraisingEventCount: number;
};

/**
 * Read-only, best-effort dashboard rollup for the actor's organization. Loads
 * the org's fundraising events + their packages, resolves collected payments
 * when possible, counts guests/tasks/fulfillment, then hands everything to the
 * deterministic computeNonprofitRollup. Degrades gracefully: optional tables
 * that do not exist are skipped, empty data yields zeros.
 */
export async function getNonprofitDashboard(actor: Actor): Promise<NonprofitDashboard> {
  const orgId = requireOrgId(actor);

  const events = await q<FundraisingEventRow>(
    `select * from fundraising_events where organization_id = $1`,
    [orgId],
  );
  const eventIds = events.map((e) => e.id);
  const linkedEventIds = events.map((e) => e.event_id).filter((x): x is string => !!x);

  const goalAmount = events.reduce((s, e) => s + num(e.goal_amount), 0);
  const budget = events.reduce((s, e) => s + num(e.budget), 0);

  // Packages for these fundraising events.
  let sponsorPackages: { price: unknown; sold: unknown }[] = [];
  let ticketPackages: { price: unknown; sold: unknown; seats: unknown }[] = [];
  if (eventIds.length > 0) {
    sponsorPackages = await q<{ price: unknown; sold: unknown }>(
      `select price, sold from sponsorship_packages where fundraising_event_id = any($1::uuid[])`,
      [eventIds],
    );
    ticketPackages = await q<{ price: unknown; sold: unknown; seats: unknown }>(
      `select price, sold, seats from ticket_packages where fundraising_event_id = any($1::uuid[])`,
      [eventIds],
    );
  }

  // Collected payments tied to the org's LINKED events (events -> invoices ->
  // payments). Only resolvable when a fundraising event links to an events row.
  // Null (not zero) when nothing resolves, so the rollup falls back to committed.
  let paymentsCollected: number | null = null;
  if (linkedEventIds.length > 0) {
    const row = await q1<{ total: string | null; n: string }>(
      `select coalesce(sum(p.amount),0) as total, count(p.id) as n
         from payments p
         join invoices i on i.id = p.invoice_id
        where i.event_id = any($1::uuid[])
          and (p.status is null or p.status not in ('failed','refunded'))`,
      [linkedEventIds],
    );
    if (row && Number(row.n) > 0) paymentsCollected = num(row.total);
  }

  // Guest count from event_registrations + guests for the linked events.
  let guestCount = 0;
  if (linkedEventIds.length > 0) {
    if (await tableExists("event_registrations")) {
      const r = await q1<{ c: string }>(
        `select count(*) as c from event_registrations where event_id = any($1::uuid[])`,
        [linkedEventIds],
      );
      guestCount += Number(r?.c ?? 0);
    }
    if (await tableExists("guests")) {
      const r = await q1<{ c: string }>(
        `select count(*) as c from guests where event_id = any($1::uuid[])`,
        [linkedEventIds],
      );
      guestCount += Number(r?.c ?? 0);
    }
  }

  // Overdue tasks for the linked events (open + past due).
  let tasksOverdue = 0;
  if (linkedEventIds.length > 0 && (await tableExists("tasks"))) {
    const r = await q1<{ c: string }>(
      `select count(*) as c from tasks
        where event_id = any($1::uuid[])
          and due_date is not null and due_date < now()
          and (status is null or status not in ('done','complete','completed','closed','cancelled'))`,
      [linkedEventIds],
    );
    tasksOverdue = Number(r?.c ?? 0);
  }

  // Sponsor fulfillment status counts - optional Workstream C tables, graceful
  // when absent. C's sponsor_fulfillment_tasks is keyed by sponsor_purchase_id
  // (NOT organization_id); scope it to this org by joining task -> purchase ->
  // sponsorship_package and filtering on the package organization_id. Best-effort:
  // any schema mismatch degrades to null rather than failing the dashboard.
  let fulfillment: Record<string, number> | null = null;
  if (
    eventIds.length > 0 &&
    (await tableExists("sponsor_fulfillment_tasks")) &&
    (await tableExists("sponsor_purchases"))
  ) {
    try {
      const rows = await q<{ status: string | null; c: string }>(
        `select t.status, count(*) as c
           from sponsor_fulfillment_tasks t
           join sponsor_purchases sp on sp.id = t.sponsor_purchase_id
           join sponsorship_packages pk on pk.id = sp.sponsorship_package_id
          where pk.organization_id = $1
          group by t.status`,
        [orgId],
      );
      fulfillment = {};
      for (const r of rows) fulfillment[r.status ?? "unknown"] = Number(r.c);
    } catch {
      fulfillment = null; // schema differs - degrade rather than fail the dashboard
    }
  }

  const rollup = computeNonprofitRollup({
    goalAmount,
    budget,
    sponsorPackages,
    ticketPackages,
    paymentsCollected,
    guestCount,
    tasksOverdue,
    fulfillment,
  });

  return { ...rollup, fundraisingEventCount: events.length };
}
