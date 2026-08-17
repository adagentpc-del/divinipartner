/**
 * Workstream C - Sponsor Purchases data-access.
 *
 * A sponsor (an org whose type/role is 'sponsor') engages with a sponsorship
 * package offered by a nonprofit for a fundraising event. This module owns the
 * sponsor_purchases lifecycle (interested -> agreed -> paid -> fulfilled) and the
 * sponsor_fulfillment_tasks the nonprofit works.
 *
 * IDOR model: every row is anchored to sponsor_org_id (the sponsor) and, through
 * the package, to the nonprofit org that owns the offering. A sponsor sees/edits
 * only their own org's purchases; the nonprofit sees purchases for the packages
 * its org created. Both sides are checked here, in the data layer, so a forged id
 * from another tenant resolves to NotFound/Forbidden.
 *
 * Cross-workstream tables (sponsorship_packages, fundraising_events) are queried
 * by name via the shared pool. They are created by Workstream B and aggregated
 * into apply-all.sql, so there is no TS import and no compile dependency. Every
 * cross-table read degrades gracefully (best-effort, swallow errors) so this
 * layer keeps working before B is seeded.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { guestSync } from "../lib/guestSync.js";

export type PurchaseStatus = "interested" | "agreed" | "paid" | "fulfilled" | "cancelled";
export const PURCHASE_STATUSES: PurchaseStatus[] = [
  "interested",
  "agreed",
  "paid",
  "fulfilled",
  "cancelled",
];

export type SponsorPurchase = {
  id: string;
  sponsorship_package_id: string | null;
  fundraising_event_id: string | null;
  sponsor_org_id: string | null;
  status: string;
  agreement_doc_id: string | null;
  logo_url: string | null;
  ad_file_url: string | null;
  guest_allotment: number | null;
  payment_id: string | null;
  amount: string | null;
  created_at: string;
};

const COLS = `
  id, sponsorship_package_id, fundraising_event_id, sponsor_org_id, status,
  agreement_doc_id, logo_url, ad_file_url, guest_allotment, payment_id, amount,
  created_at
`;

/**
 * The package a purchase targets, read by name from the Workstream B table.
 * Best-effort: returns null when the table is missing or empty. We only select
 * the columns this workstream needs; B may have more.
 */
export type PackageView = {
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
};

export async function getPackageById(packageId: string): Promise<PackageView | null> {
  return q1<PackageView>(
    `select id, fundraising_event_id, organization_id, tier, name, price, benefits,
            tickets_included, quantity, sold, fulfillment_checklist, status
       from sponsorship_packages where id = $1`,
    [packageId],
  ).catch(() => null);
}

/** The nonprofit org that owns the package backing this purchase (for notify). */
export async function nonprofitOrgForPurchase(purchaseId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select pk.organization_id
       from sponsor_purchases sp
       join sponsorship_packages pk on pk.id = sp.sponsorship_package_id
      where sp.id = $1`,
    [purchaseId],
  ).catch(() => null);
  return row?.organization_id ?? null;
}

// ---- Access helpers --------------------------------------------------------

function sponsorOrgId(actor: Actor): string | null {
  return actor.org?.id ?? null;
}

function isPrivileged(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Load a purchase the actor is allowed to see. Allowed when the actor's org is
 * the sponsor (sponsor_org_id) OR the nonprofit that owns the package. Throws
 * NotFound when missing, Forbidden when the actor is neither party.
 */
export async function getPurchaseScoped(actor: Actor, id: string): Promise<SponsorPurchase> {
  const row = await q1<SponsorPurchase>(`select ${COLS} from sponsor_purchases where id = $1`, [id]);
  if (!row) throw new NotFoundError("sponsor purchase not found");
  if (isPrivileged(actor)) return row;
  const myOrg = sponsorOrgId(actor);
  if (myOrg && row.sponsor_org_id === myOrg) return row;
  // Nonprofit side: does the actor's org own the package?
  const nonprofitOrg = row.sponsorship_package_id
    ? await nonprofitOrgForPurchase(id)
    : null;
  if (myOrg && nonprofitOrg && myOrg === nonprofitOrg) return row;
  throw new ForbiddenError("not authorized for this sponsor purchase");
}

/** Is the actor the nonprofit owner of this purchase's package? */
export async function actorIsNonprofitOwner(actor: Actor, id: string): Promise<boolean> {
  if (isPrivileged(actor)) return true;
  const myOrg = sponsorOrgId(actor);
  if (!myOrg) return false;
  const nonprofitOrg = await nonprofitOrgForPurchase(id);
  return !!nonprofitOrg && nonprofitOrg === myOrg;
}

/** Is the actor the sponsor that owns this purchase? */
export function actorIsSponsor(actor: Actor, row: SponsorPurchase): boolean {
  if (isPrivileged(actor)) return true;
  const myOrg = sponsorOrgId(actor);
  return !!myOrg && row.sponsor_org_id === myOrg;
}

// ---- Reads -----------------------------------------------------------------

/** All purchases the sponsor's org has made. */
export async function listForSponsor(orgId: string): Promise<SponsorPurchase[]> {
  return q<SponsorPurchase>(
    `select ${COLS} from sponsor_purchases where sponsor_org_id = $1 order by created_at desc`,
    [orgId],
  );
}

/**
 * All purchases against packages owned by the nonprofit org. Joins the
 * Workstream B sponsorship_packages by name; degrades to [] when B is absent.
 */
export async function listForNonprofit(orgId: string): Promise<SponsorPurchase[]> {
  return q<SponsorPurchase>(
    `select ${COLS.split(",").map((c) => `sp.${c.trim()}`).join(", ")}
       from sponsor_purchases sp
       join sponsorship_packages pk on pk.id = sp.sponsorship_package_id
      where pk.organization_id = $1
      order by sp.created_at desc`,
    [orgId],
  ).catch(() => [] as SponsorPurchase[]);
}

// ---- Writes ----------------------------------------------------------------

/**
 * Express interest: create an 'interested' purchase for the sponsor's org against
 * a package. Resolves fundraising_event_id, amount (package price), and
 * guest_allotment (package tickets_included) from the package when available.
 */
export async function createInterest(
  sponsorOrgIdValue: string,
  packageId: string,
): Promise<SponsorPurchase> {
  const pkg = await getPackageById(packageId);
  const eventId = pkg?.fundraising_event_id ?? null;
  const amount = pkg?.price != null ? Number(pkg.price) : 0;
  const allotment = pkg?.tickets_included != null ? Number(pkg.tickets_included) : 0;
  const row = await q1<SponsorPurchase>(
    `insert into sponsor_purchases
       (sponsorship_package_id, fundraising_event_id, sponsor_org_id, status,
        guest_allotment, amount)
     values ($1,$2,$3,'interested',$4,$5)
     returning ${COLS}`,
    [packageId, eventId, sponsorOrgIdValue, allotment, amount],
  );
  return row as SponsorPurchase;
}

/** Set the agreement document and advance to 'agreed' (sponsor side). */
export async function markAgreed(id: string, agreementDocId: string | null): Promise<SponsorPurchase> {
  const row = await q1<SponsorPurchase>(
    `update sponsor_purchases
        set agreement_doc_id = coalesce($2, agreement_doc_id),
            status = case when status = 'interested' then 'agreed' else status end
      where id = $1
      returning ${COLS}`,
    [id, agreementDocId],
  );
  if (!row) throw new NotFoundError("sponsor purchase not found");
  return row;
}

/**
 * Recompute sponsorship_packages.sold from the actual current truth (count of
 * this package's non-cancelled paid/fulfilled purchases) rather than
 * maintaining an independently-mutated counter. Codex review on #45 caught
 * two real problems with the earlier increment-on-paid version: (1) a
 * nonprofit cancelling an already-paid purchase (the supported
 * PATCH /:id/status -> 'cancelled' path) never reversed the increment, so a
 * cancelled deal permanently inflated both the dashboard's committed-revenue
 * figure and the package's remaining inventory; and (2) the increment and the
 * paid-status transition were two separate statements, so two concurrent
 * `/:id/paid` requests could both observe "not yet paid" and each apply their
 * own +1, double-counting one purchase. Recomputing the count from source on
 * every status-affecting write sidesteps both: it is idempotent (recomputing
 * twice from the same truth yields the same number, so a race just means a
 * harmless redundant write, never a double-count), and self-healing
 * (cancelling a paid purchase changes what the count query matches, so the
 * very next recompute -- triggered by that same cancellation -- corrects it).
 */
async function recomputeSold(packageId: string | null): Promise<void> {
  if (!packageId) return;
  await q(
    `update sponsorship_packages
        set sold = (select count(*) from sponsor_purchases
                      where sponsorship_package_id = $1 and status in ('paid','fulfilled')),
            updated_at = now()
      where id = $1`,
    [packageId],
  ).catch(() => undefined); // best-effort: never fail the caller's write over this
}

/**
 * Record the payment id + amount and move to 'paid'.
 *
 * Live-traced (auditing the sponsor/nonprofit fundraising flow): a real
 * sponsor going through the complete, real purchase flow (express interest ->
 * sign agreement -> confirm payment) never moved sponsorship_packages.sold,
 * and the payment this records is never linked to an `invoices` row (the
 * sponsor checkout flow has no invoice concept), so getNonprofitDashboard's
 * paymentsCollected join (payments -> invoices -> event_id) can never see it
 * either. The dashboard's revenue figure -- the nonprofit's headline number --
 * was permanently stuck at $0 no matter how many real sponsors paid, since
 * computeNonprofitRollup's documented fallback (committed revenue = sold *
 * price) only works if `sold` is ever incremented, and nothing did.
 */
export async function markPaid(
  id: string,
  paymentId: string | null,
  amount: number | null,
): Promise<SponsorPurchase> {
  const row = await q1<SponsorPurchase>(
    `update sponsor_purchases
        set payment_id = coalesce($2, payment_id),
            amount = coalesce($3, amount),
            status = 'paid'
      where id = $1
      returning ${COLS}`,
    [id, paymentId, amount],
  );
  if (!row) throw new NotFoundError("sponsor purchase not found");
  await recomputeSold(row.sponsorship_package_id);
  return row;
}

/** Store a brand asset url (logo or ad). Field is validated by the caller. */
export async function setAsset(
  id: string,
  field: "logo_url" | "ad_file_url",
  url: string | null,
): Promise<SponsorPurchase> {
  const row = await q1<SponsorPurchase>(
    `update sponsor_purchases set ${field} = $2 where id = $1 returning ${COLS}`,
    [id, url],
  );
  if (!row) throw new NotFoundError("sponsor purchase not found");
  return row;
}

/** Advance status explicitly (used by the nonprofit to mark fulfilled/cancelled). */
export async function setStatus(id: string, status: PurchaseStatus): Promise<SponsorPurchase> {
  const row = await q1<SponsorPurchase>(
    `update sponsor_purchases set status = $2 where id = $1 returning ${COLS}`,
    [id, status],
  );
  if (!row) throw new NotFoundError("sponsor purchase not found");
  // Cancelling a paid purchase (or advancing to fulfilled) changes what counts
  // as sold; recompute so a cancellation always reverses out (Codex review on #45).
  await recomputeSold(row.sponsorship_package_id);
  return row;
}

// ---- Sponsor guests (reuse guests/event_registrations) ---------------------

/**
 * How many guest names the sponsor has already registered for this purchase. We
 * tag sponsor guests in guests.guest_group as `sponsor:<purchaseId>` so they are
 * counted against the allotment without touching the shared guests schema.
 */
export async function sponsorGuestCount(purchaseId: string): Promise<number> {
  const row = await q1<{ n: string }>(
    `select count(*) as n from guests where guest_group = $1`,
    [`sponsor:${purchaseId}`],
  ).catch(() => null);
  return Number(row?.n ?? 0);
}

export type SponsorGuest = { id: string; name: string | null; email: string | null };

/** List the sponsor's guest names for this purchase. */
export async function listSponsorGuests(purchaseId: string): Promise<SponsorGuest[]> {
  return q<SponsorGuest>(
    `select id, name, email from guests where guest_group = $1 order by created_at asc`,
    [`sponsor:${purchaseId}`],
  ).catch(() => [] as SponsorGuest[]);
}

/**
 * Add a guest name for a purchase, up to the allotment. `guests.event_id` is a
 * foreign key into the native `events` table, which is a DIFFERENT id space
 * than `sponsor_purchases.fundraising_event_id` (a `fundraising_events.id`) --
 * inserting the fundraising event's own id there always violated the FK and
 * 500'd, found via a live sponsor persona walkthrough. A fundraising event
 * only rolls into a native event's guest list when it has been linked to one
 * via `fundraising_events.event_id`; when unlinked (the common case), the
 * guest is still recorded (tagged by the sponsor group below) but not
 * attached to any `events` row. Returns the new row, or throws ForbiddenError
 * when the allotment is exhausted.
 */
export async function addSponsorGuest(
  purchase: SponsorPurchase,
  createdBy: string,
  name: string,
  email: string | null,
): Promise<SponsorGuest> {
  const allotment = Number(purchase.guest_allotment ?? 0);
  const used = await sponsorGuestCount(purchase.id);
  if (allotment > 0 && used >= allotment) {
    throw new ForbiddenError("guest allotment is full for this sponsorship");
  }
  let linkedEventId: string | null = null;
  if (purchase.fundraising_event_id) {
    const fe = await q1<{ event_id: string | null }>(
      `select event_id from fundraising_events where id = $1`,
      [purchase.fundraising_event_id],
    ).catch(() => null);
    linkedEventId = fe?.event_id ?? null;
  }
  const group = `sponsor:${purchase.id}`;
  const row = await q1<SponsorGuest>(
    `insert into guests (event_id, name, email, rsvp_status, guest_group, created_by)
     values ($1,$2,$3,'invited',$4,$5)
     returning id, name, email`,
    [linkedEventId, name, email, group, createdBy],
  );
  // When the fundraising event IS linked to a native event, this guest just
  // joined that event's guest list -- mirror guests.ts's fireGuestSync so
  // vendors with needs_guest_list / needs_headcount subscriptions still hear
  // about it (Codex review on this PR, verified: they otherwise silently
  // miss sponsor-added guests). Best-effort, fire-and-forget, never blocks.
  if (linkedEventId) {
    void q1<{ total: string; confirmed: string }>(
      `select count(*) as total,
              count(*) filter (where rsvp_status = 'confirmed') as confirmed
         from guests where event_id = $1`,
      [linkedEventId],
    )
      .then((counts) =>
        guestSync.onGuestListChanged(linkedEventId as string, {
          action: "add",
          total: Number(counts?.total ?? 0),
          confirmed: Number(counts?.confirmed ?? 0),
        }),
      )
      .catch(() => undefined);
    void guestSync.syncEventAttendanceFromGuests(linkedEventId).catch(() => undefined);
  }
  return row as SponsorGuest;
}

// ---- Fulfillment tasks -----------------------------------------------------

export type FulfillmentStatus =
  | "not_started"
  | "in_progress"
  | "waiting_on_sponsor"
  | "completed"
  | "issue";
export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "not_started",
  "in_progress",
  "waiting_on_sponsor",
  "completed",
  "issue",
];

export type FulfillmentTask = {
  id: string;
  sponsor_purchase_id: string | null;
  label: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

const TASK_COLS = `
  id, sponsor_purchase_id, label, status, due_date, completed_at, created_at
`;

/** List tasks for a purchase, oldest first. */
export async function listTasks(purchaseId: string): Promise<FulfillmentTask[]> {
  return q<FulfillmentTask>(
    `select ${TASK_COLS} from sponsor_fulfillment_tasks where sponsor_purchase_id = $1 order by created_at asc`,
    [purchaseId],
  );
}

/** Insert one fulfillment task. */
export async function addTask(
  purchaseId: string,
  label: string,
  dueDate: string | null,
): Promise<FulfillmentTask> {
  const row = await q1<FulfillmentTask>(
    `insert into sponsor_fulfillment_tasks (sponsor_purchase_id, label, due_date)
     values ($1,$2,$3)
     returning ${TASK_COLS}`,
    [purchaseId, label, dueDate],
  );
  return row as FulfillmentTask;
}

/**
 * Seed tasks from the package's fulfillment_checklist (jsonb array). Idempotent:
 * does nothing when the purchase already has tasks. Each checklist entry may be a
 * plain string (the label) or an object { label, due_date }. Best-effort: when
 * the package is missing or has no checklist, no tasks are created.
 */
export async function seedTasksFromChecklist(
  purchaseId: string,
  checklist: unknown,
): Promise<FulfillmentTask[]> {
  const existing = await listTasks(purchaseId);
  if (existing.length > 0) return existing;
  const items = normalizeChecklist(checklist);
  if (items.length === 0) return [];
  const client = await pool.connect();
  const out: FulfillmentTask[] = [];
  try {
    await client.query("begin");
    for (const it of items.slice(0, 100)) {
      const r = await client.query<FulfillmentTask>(
        `insert into sponsor_fulfillment_tasks (sponsor_purchase_id, label, due_date)
         values ($1,$2,$3)
         returning ${TASK_COLS}`,
        [purchaseId, it.label, it.due_date ?? null],
      );
      if (r.rows[0]) out.push(r.rows[0]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return out;
}

type ChecklistItem = { label: string; due_date?: string | null };
function normalizeChecklist(checklist: unknown): ChecklistItem[] {
  const arr = Array.isArray(checklist) ? checklist : [];
  const out: ChecklistItem[] = [];
  for (const raw of arr) {
    if (typeof raw === "string") {
      const label = raw.trim();
      if (label) out.push({ label });
    } else if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : typeof o.name === "string" ? o.name.trim() : "";
      const due = typeof o.due_date === "string" ? o.due_date : null;
      if (label) out.push({ label, due_date: due });
    }
  }
  return out;
}

/** Load one task scoped to its purchase (caller authorizes the purchase). */
export async function getTask(taskId: string): Promise<FulfillmentTask | null> {
  return q1<FulfillmentTask>(
    `select ${TASK_COLS} from sponsor_fulfillment_tasks where id = $1`,
    [taskId],
  );
}

/** Update a task's status (and stamp completed_at when moving to completed). */
export async function updateTaskStatus(
  taskId: string,
  status: FulfillmentStatus,
): Promise<FulfillmentTask> {
  const row = await q1<FulfillmentTask>(
    `update sponsor_fulfillment_tasks
        set status = $2,
            completed_at = case when $2 = 'completed' then now() else null end
      where id = $1
      returning ${TASK_COLS}`,
    [taskId, status],
  );
  if (!row) throw new NotFoundError("fulfillment task not found");
  return row;
}
