/**
 * Nonprofit donor + donations + follow-up + recap data-access layer (Phase 2).
 *
 * Org-scoped, IDOR-safe CRUD over the tables created in db/schema-np-donor.sql:
 *   - donors          (list / get / create / update / delete)
 *   - donations       (list / create / update / delete) - recording a donation
 *                     rolls the gift into the donor's total_given + last_gift_at
 *   - followup_tasks  (generate workflow / list / advance) for a fundraising event
 * plus loadRecapInputs - the deterministic recap data loader that reuses the
 * fundraising-dashboard revenue logic (payments when linked, else committed) and
 * probes optional tables (auction_items, event_registrations, guests) with
 * to_regclass so it degrades gracefully when they are absent.
 *
 * Authorization mirrors server/src/db/fundraising.ts: every row belongs to the
 * organization that created it (organization_id). An actor may read/write when
 * their org owns the row, or they are an admin / super_admin. Every parent id is
 * validated against the actor's org before any write so a forged id from another
 * tenant is rejected (ForbiddenError) rather than silently acted on.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  isDonationStatus,
  isFollowupKind,
  isFollowupStatus,
  FOLLOWUP_WORKFLOW,
  FOLLOWUP_LABELS,
  type FollowupKind,
} from "../lib/donor.js";
import { num } from "../lib/fundraising.js";
import { computeRecap, type RecapInputs, type RecapReport } from "../lib/recap.js";

// ---- Row types --------------------------------------------------------------

export type DonorRow = {
  id: string;
  organization_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  total_given: string | null;
  last_gift_at: string | null;
  notes: string | null;
  created_at: string;
};

export type DonationRow = {
  id: string;
  organization_id: string | null;
  fundraising_event_id: string | null;
  donor_id: string | null;
  amount: string | null;
  method: string | null;
  status: string | null;
  created_at: string;
};

export type FollowupTaskRow = {
  id: string;
  organization_id: string | null;
  fundraising_event_id: string | null;
  kind: string | null;
  target: string | null;
  status: string | null;
  due_date: string | null;
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

/** Resolve + authorize a fundraising event the actor may act on. */
async function assertFundraisingEvent(
  actor: Actor,
  fundraisingEventId: string,
): Promise<{ id: string; organization_id: string | null; name: string; kind: string | null; goal_amount: string | null; budget: string | null; event_date: string | null; event_id: string | null }> {
  const row = await q1<{ id: string; organization_id: string | null; name: string; kind: string | null; goal_amount: string | null; budget: string | null; event_date: string | null; event_id: string | null }>(
    `select id, organization_id, name, kind, goal_amount, budget, event_date, event_id
       from fundraising_events where id = $1`,
    [fundraisingEventId],
  );
  if (!row) throw new NotFoundError("fundraising event not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this fundraising event");
  }
  return row;
}

/** True when a relation exists in the current database (graceful optional joins). */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

// ---- donors: CRUD -----------------------------------------------------------

/** List the actor org's donors, highest lifetime giving first. */
export async function listDonors(actor: Actor): Promise<DonorRow[]> {
  if (isAdmin(actor) && !actor.org?.id) {
    return q<DonorRow>(`select * from donors order by total_given desc nulls last, created_at desc`);
  }
  const orgId = requireOrgId(actor);
  return q<DonorRow>(
    `select * from donors where organization_id = $1 order by total_given desc nulls last, created_at desc`,
    [orgId],
  );
}

/** Resolve + authorize a donor the actor may act on. */
async function assertDonor(actor: Actor, id: string): Promise<DonorRow> {
  const row = await q1<DonorRow>(`select * from donors where id = $1`, [id]);
  if (!row) throw new NotFoundError("donor not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this donor");
  }
  return row;
}

/** Get one donor (org-scoped). */
export async function getDonor(actor: Actor, id: string): Promise<DonorRow> {
  return assertDonor(actor, id);
}

export type DonorInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

/** Create a donor for the actor's org. */
export async function createDonor(actor: Actor, input: DonorInput): Promise<DonorRow> {
  const orgId = requireOrgId(actor);
  const row = await q1<DonorRow>(
    `insert into donors (organization_id, name, email, phone, notes)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [orgId, input.name ?? null, input.email ?? null, input.phone ?? null, input.notes ?? null],
  );
  return row as DonorRow;
}

/** Patch a donor (org-scoped). Does not touch the rollup columns. */
export async function updateDonor(actor: Actor, id: string, patch: DonorInput): Promise<DonorRow> {
  await assertDonor(actor, id);
  const row = await q1<DonorRow>(
    `update donors set
        name = coalesce($2, name),
        email = coalesce($3, email),
        phone = coalesce($4, phone),
        notes = coalesce($5, notes)
      where id = $1
      returning *`,
    [id, patch.name ?? null, patch.email ?? null, patch.phone ?? null, patch.notes ?? null],
  );
  return row as DonorRow;
}

/** Delete a donor (org-scoped). Donations keep their record (donor_id set null). */
export async function deleteDonor(actor: Actor, id: string): Promise<void> {
  await assertDonor(actor, id);
  await pool.query(`delete from donors where id = $1`, [id]);
}

// ---- donations: CRUD --------------------------------------------------------

/** List the actor org's donations, newest first. */
export async function listDonations(actor: Actor): Promise<DonationRow[]> {
  if (isAdmin(actor) && !actor.org?.id) {
    return q<DonationRow>(`select * from donations order by created_at desc`);
  }
  const orgId = requireOrgId(actor);
  return q<DonationRow>(
    `select * from donations where organization_id = $1 order by created_at desc`,
    [orgId],
  );
}

/** Resolve + authorize a donation the actor may act on. */
async function assertDonation(actor: Actor, id: string): Promise<DonationRow> {
  const row = await q1<DonationRow>(`select * from donations where id = $1`, [id]);
  if (!row) throw new NotFoundError("donation not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this donation");
  }
  return row;
}

export type DonationInput = {
  amount?: number | null;
  method?: string | null;
  status?: string | null;
  fundraising_event_id?: string | null;
  donor_id?: string | null;
};

/**
 * Recompute + persist a donor's total_given + last_gift_at from their non-refunded
 * donations. Idempotent and authoritative, so it stays correct after edits/deletes.
 */
async function recomputeDonorRollup(donorId: string): Promise<void> {
  await pool.query(
    `update donors d set
        total_given = coalesce((
          select sum(amount) from donations
           where donor_id = d.id and (status is null or status <> 'refunded')), 0),
        last_gift_at = (
          select max(created_at) from donations
           where donor_id = d.id and (status is null or status <> 'refunded'))
      where d.id = $1`,
    [donorId],
  );
}

/**
 * Record a donation for the actor's org. Validates any donor / event link
 * belongs to the same org (IDOR-safe), then refreshes the donor rollup.
 */
export async function createDonation(actor: Actor, input: DonationInput): Promise<DonationRow> {
  const orgId = requireOrgId(actor);
  if (input.status != null && !isDonationStatus(input.status)) {
    throw new ForbiddenError("invalid status");
  }
  if (input.fundraising_event_id) await assertFundraisingEvent(actor, input.fundraising_event_id);
  if (input.donor_id) await assertDonor(actor, input.donor_id);
  const row = await q1<DonationRow>(
    `insert into donations (organization_id, fundraising_event_id, donor_id, amount, method, status)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [
      orgId,
      input.fundraising_event_id ?? null,
      input.donor_id ?? null,
      input.amount ?? 0,
      input.method ?? null,
      input.status ?? "recorded",
    ],
  );
  if (input.donor_id) await recomputeDonorRollup(input.donor_id);
  return row as DonationRow;
}

/** Patch a donation (org-scoped). Refreshes the affected donor rollup(s). */
export async function updateDonation(
  actor: Actor,
  id: string,
  patch: DonationInput,
): Promise<DonationRow> {
  const before = await assertDonation(actor, id);
  if (patch.status != null && !isDonationStatus(patch.status)) {
    throw new ForbiddenError("invalid status");
  }
  if (patch.fundraising_event_id) await assertFundraisingEvent(actor, patch.fundraising_event_id);
  if (patch.donor_id) await assertDonor(actor, patch.donor_id);
  const row = await q1<DonationRow>(
    `update donations set
        amount = coalesce($2, amount),
        method = coalesce($3, method),
        status = coalesce($4, status),
        fundraising_event_id = coalesce($5, fundraising_event_id),
        donor_id = coalesce($6, donor_id)
      where id = $1
      returning *`,
    [
      id,
      patch.amount ?? null,
      patch.method ?? null,
      patch.status ?? null,
      patch.fundraising_event_id ?? null,
      patch.donor_id ?? null,
    ],
  );
  const affected = new Set<string>();
  if (before.donor_id) affected.add(before.donor_id);
  if (row?.donor_id) affected.add(row.donor_id);
  for (const d of affected) await recomputeDonorRollup(d);
  return row as DonationRow;
}

/** Delete a donation (org-scoped). Refreshes the affected donor rollup. */
export async function deleteDonation(actor: Actor, id: string): Promise<void> {
  const before = await assertDonation(actor, id);
  await pool.query(`delete from donations where id = $1`, [id]);
  if (before.donor_id) await recomputeDonorRollup(before.donor_id);
}

// ---- followup_tasks ---------------------------------------------------------

/** List follow-up tasks for a fundraising event (org-scoped), oldest first. */
export async function listFollowupTasks(
  actor: Actor,
  fundraisingEventId: string,
): Promise<FollowupTaskRow[]> {
  await assertFundraisingEvent(actor, fundraisingEventId);
  return q<FollowupTaskRow>(
    `select * from followup_tasks where fundraising_event_id = $1 order by created_at`,
    [fundraisingEventId],
  );
}

/**
 * Generate the post-event follow-up workflow for a fundraising event: create one
 * followup_task per FOLLOWUP_WORKFLOW kind that does not already exist for the
 * event (idempotent - re-running only fills gaps). Returns the full task list.
 */
export async function generateFollowupWorkflow(
  actor: Actor,
  fundraisingEventId: string,
): Promise<FollowupTaskRow[]> {
  const fe = await assertFundraisingEvent(actor, fundraisingEventId);
  const existing = await q<{ kind: string | null }>(
    `select kind from followup_tasks where fundraising_event_id = $1`,
    [fundraisingEventId],
  );
  const have = new Set(existing.map((r) => r.kind));
  const toCreate = FOLLOWUP_WORKFLOW.filter((k) => !have.has(k));
  for (const kind of toCreate) {
    await pool.query(
      `insert into followup_tasks (organization_id, fundraising_event_id, kind, target, status)
       values ($1,$2,$3,$4,'pending')`,
      [fe.organization_id, fundraisingEventId, kind, FOLLOWUP_LABELS[kind as FollowupKind]],
    );
  }
  return listFollowupTasks(actor, fundraisingEventId);
}

/** Resolve + authorize a follow-up task the actor may act on. */
async function assertFollowupTask(actor: Actor, id: string): Promise<FollowupTaskRow> {
  const row = await q1<FollowupTaskRow>(`select * from followup_tasks where id = $1`, [id]);
  if (!row) throw new NotFoundError("follow-up task not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this follow-up task");
  }
  return row;
}

/** Advance a follow-up task to a new status (pending/sent/done/skipped). */
export async function advanceFollowupTask(
  actor: Actor,
  id: string,
  status: string,
): Promise<FollowupTaskRow> {
  await assertFollowupTask(actor, id);
  if (!isFollowupStatus(status)) throw new ForbiddenError("invalid status");
  const row = await q1<FollowupTaskRow>(
    `update followup_tasks set status = $2 where id = $1 returning *`,
    [id, status],
  );
  return row as FollowupTaskRow;
}

// ---- Recap data loading -----------------------------------------------------

/**
 * Load the deterministic recap inputs for one fundraising event (org-scoped),
 * then compute the structured recap. Reuses the fundraising-dashboard revenue
 * logic: resolved payments when the event links to an `events` row, else
 * committed (sponsorship sold*price + ticket sold*price + donations + paid
 * auction). Optional tables (auction_items, event_registrations, guests) are
 * probed with to_regclass and omitted/zeroed when absent.
 */
export async function generateRecap(
  actor: Actor,
  fundraisingEventId: string,
): Promise<RecapReport> {
  const fe = await assertFundraisingEvent(actor, fundraisingEventId);

  const sponsorPackages = await q<{ price: unknown; sold: unknown }>(
    `select price, sold from sponsorship_packages where fundraising_event_id = $1`,
    [fundraisingEventId],
  );
  const ticketPackages = await q<{ price: unknown; sold: unknown; seats: unknown }>(
    `select price, sold, seats from ticket_packages where fundraising_event_id = $1`,
    [fundraisingEventId],
  );

  // Donations tied to this fundraising event (exclude refunded).
  const donRow = await q1<{ total: string | null; n: string }>(
    `select coalesce(sum(amount),0) as total, count(*) as n
       from donations
      where fundraising_event_id = $1 and (status is null or status <> 'refunded')`,
    [fundraisingEventId],
  );
  const donationsTotal = num(donRow?.total);
  const donationCount = Number(donRow?.n ?? 0);

  // Auction revenue: sum of winning_bid for paid items tied to this event.
  // Optional table - probe to_regclass and degrade to null when absent.
  let auctionRevenue: number | null = null;
  if (await tableExists("auction_items")) {
    const r = await q1<{ total: string | null }>(
      `select coalesce(sum(winning_bid),0) as total
         from auction_items
        where fundraising_event_id = $1 and payment_status = 'paid'`,
      [fundraisingEventId],
    );
    auctionRevenue = num(r?.total);
  }

  // Collected payments tied to the linked events row (events -> invoices ->
  // payments). Null (not zero) when nothing resolves, so the recap falls back
  // to committed revenue.
  let paymentsCollected: number | null = null;
  if (fe.event_id) {
    const row = await q1<{ total: string | null; n: string }>(
      `select coalesce(sum(p.amount),0) as total, count(p.id) as n
         from payments p
         join invoices i on i.id = p.invoice_id
        where i.event_id = $1
          and (p.status is null or p.status not in ('failed','refunded'))`,
      [fe.event_id],
    );
    if (row && Number(row.n) > 0) paymentsCollected = num(row.total);
  }

  // Guest count from event_registrations + guests for the linked event.
  let guestCount = 0;
  if (fe.event_id) {
    if (await tableExists("event_registrations")) {
      const r = await q1<{ c: string }>(
        `select count(*) as c from event_registrations where event_id = $1`,
        [fe.event_id],
      );
      guestCount += Number(r?.c ?? 0);
    }
    if (await tableExists("guests")) {
      const r = await q1<{ c: string }>(
        `select count(*) as c from guests where event_id = $1`,
        [fe.event_id],
      );
      guestCount += Number(r?.c ?? 0);
    }
  }

  const inputs: RecapInputs = {
    eventName: fe.name,
    eventKind: fe.kind,
    eventDate: fe.event_date,
    goalAmount: fe.goal_amount,
    budget: fe.budget,
    sponsorPackages,
    ticketPackages,
    donationsTotal,
    donationCount,
    auctionRevenue,
    paymentsCollected,
    guestCount,
  };
  return computeRecap(inputs);
}
