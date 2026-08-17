/**
 * Public ticket purchase flow - data access.
 *
 * ticket_packages (db/fundraising.ts) was CRUD-only: a nonprofit could
 * publish individual/VIP/table ticket packages for a fundraising event, but
 * there was no public path for anyone to actually buy one. This module owns
 * the ticket_purchases lifecycle (pending -> paid | cancelled), mirroring
 * sponsor_purchases (Workstream C) but simplified: no agreement-signing or
 * fulfillment-task ladder, since a ticket purchase has nothing to fulfill
 * beyond the seats themselves.
 *
 * IDOR model: every row is anchored to buyer_org_id (the purchaser) and,
 * through the package, to the nonprofit org that owns the offering. A buyer
 * sees/edits only their own org's purchases; the nonprofit sees purchases
 * against packages its org created.
 *
 * ticket_packages.sold is recomputed from truth (count of this package's
 * paid purchases * quantity) on every status-affecting write, the same
 * self-healing pattern sponsor_purchases uses after the Codex review on #45
 * (cancel-reversal + concurrent-double-count safety) rather than an
 * independently incremented counter.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

export type TicketPurchaseStatus = "pending" | "paid" | "cancelled";
export const TICKET_PURCHASE_STATUSES: TicketPurchaseStatus[] = ["pending", "paid", "cancelled"];

export type TicketPurchase = {
  id: string;
  ticket_package_id: string | null;
  fundraising_event_id: string | null;
  buyer_org_id: string | null;
  buyer_user_id: string | null;
  quantity: number;
  status: string;
  payment_id: string | null;
  amount: string | null;
  created_at: string;
};

const COLS = `
  id, ticket_package_id, fundraising_event_id, buyer_org_id, buyer_user_id,
  quantity, status, payment_id, amount, created_at
`;

export type TicketPackageView = {
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
};

export async function getPackageById(packageId: string): Promise<TicketPackageView | null> {
  return q1<TicketPackageView>(
    `select id, fundraising_event_id, organization_id, name, type, price, seats,
            quantity, sold, status
       from ticket_packages where id = $1`,
    [packageId],
  ).catch(() => null);
}

export interface PackageOwner {
  orgId: string;
  tier: string | null;
  platformFeeRate: number | null;
}

/** The nonprofit org that owns a package, plus its fee context (checkout
 *  destination routing + platform fee), mirroring publicCheckout.ts's
 *  getEventOwner. Null when the package or its org cannot be resolved. */
export async function getPackageOwner(packageId: string): Promise<PackageOwner | null> {
  const row = await q1<{ organization_id: string | null; tier: string | null; platform_fee_rate: number | null }>(
    `select tp.organization_id, o.tier, o.platform_fee_rate
       from ticket_packages tp
       left join organizations o on o.id = tp.organization_id
      where tp.id = $1`,
    [packageId],
  );
  if (!row?.organization_id) return null;
  return { orgId: row.organization_id, tier: row.tier, platformFeeRate: row.platform_fee_rate };
}

/** The nonprofit org that owns the package backing this purchase. */
async function nonprofitOrgForPurchase(purchaseId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select tp.organization_id
       from ticket_purchases p
       join ticket_packages tp on tp.id = p.ticket_package_id
      where p.id = $1`,
    [purchaseId],
  ).catch(() => null);
  return row?.organization_id ?? null;
}

// ---- Access helpers ---------------------------------------------------------

function buyerOrgId(actor: Actor): string | null {
  return actor.org?.id ?? null;
}

function isPrivileged(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Unscoped lookup, no IDOR check. For the payment-completion path only
 * (synchronous capture and the webhook backstop, server/src/routes/payments.ts):
 * by the time either calls this, a processor has already verified real money
 * moved for a purchase id this server itself generated and put in the
 * checkout metadata, so there is no actor to authorize against (the webhook
 * has none) and nothing to gain by forging an id here (it can only complete
 * a purchase that is already genuinely paid for). Never call this from a
 * route reachable by an unauthenticated request without independently
 * verifying the payment first.
 */
export async function getPurchaseById(id: string): Promise<TicketPurchase | null> {
  return q1<TicketPurchase>(`select ${COLS} from ticket_purchases where id = $1`, [id]);
}

/**
 * Load a purchase the actor is allowed to see. Allowed when the actor's org
 * is the buyer OR the nonprofit that owns the package.
 */
export async function getPurchaseScoped(actor: Actor, id: string): Promise<TicketPurchase> {
  const row = await q1<TicketPurchase>(`select ${COLS} from ticket_purchases where id = $1`, [id]);
  if (!row) throw new NotFoundError("ticket purchase not found");
  if (isPrivileged(actor)) return row;
  const myOrg = buyerOrgId(actor);
  if (myOrg && row.buyer_org_id === myOrg) return row;
  const nonprofitOrg = row.ticket_package_id ? await nonprofitOrgForPurchase(id) : null;
  if (myOrg && nonprofitOrg && myOrg === nonprofitOrg) return row;
  throw new ForbiddenError("not authorized for this ticket purchase");
}

export function actorIsBuyer(actor: Actor, row: TicketPurchase): boolean {
  if (isPrivileged(actor)) return true;
  const myOrg = buyerOrgId(actor);
  return !!myOrg && row.buyer_org_id === myOrg;
}

export async function actorIsNonprofitOwner(actor: Actor, id: string): Promise<boolean> {
  if (isPrivileged(actor)) return true;
  const myOrg = buyerOrgId(actor);
  if (!myOrg) return false;
  const nonprofitOrg = await nonprofitOrgForPurchase(id);
  return !!nonprofitOrg && nonprofitOrg === myOrg;
}

// ---- Reads -------------------------------------------------------------------

export async function listForBuyer(orgId: string): Promise<TicketPurchase[]> {
  return q<TicketPurchase>(
    `select ${COLS} from ticket_purchases where buyer_org_id = $1 order by created_at desc`,
    [orgId],
  );
}

export async function listForNonprofit(orgId: string): Promise<TicketPurchase[]> {
  return q<TicketPurchase>(
    `select ${COLS.split(",").map((c) => `p.${c.trim()}`).join(", ")}
       from ticket_purchases p
       join ticket_packages tp on tp.id = p.ticket_package_id
      where tp.organization_id = $1
      order by p.created_at desc`,
    [orgId],
  ).catch(() => [] as TicketPurchase[]);
}

// ---- Writes ------------------------------------------------------------------

/**
 * Recompute ticket_packages.sold from the actual current truth (sum of
 * quantity across this package's 'paid' purchases). See module doc for why
 * this is recomputed rather than incrementally maintained.
 */
async function recomputeSold(packageId: string | null): Promise<void> {
  if (!packageId) return;
  await q(
    `update ticket_packages
        set sold = coalesce((select sum(quantity) from ticket_purchases
                       where ticket_package_id = $1 and status = 'paid'), 0),
            updated_at = now()
      where id = $1`,
    [packageId],
  ).catch(() => undefined); // best-effort: never fail the caller's write over this
}

const PUBLISHED_STATUSES = new Set([null, "open", "active", "published"]);

/**
 * Create a pending purchase for `quantity` tickets against a package.
 * Rejects when the package is not in a publicly purchasable status (matches
 * the discovery filter ticket-portal.ts uses -- without this, a closed or
 * draft package's id, once known, could be bought directly even though it
 * never appears in the browse listing). Rejects when the purchase would
 * oversell the package's remaining capacity (quantity - sold), when the
 * package's own quantity is a set limit (0/null means unlimited, matching
 * how sponsorship_packages.quantity is treated elsewhere in this codebase).
 * Mirrors the "sold out" rejection event_exhibitor_packages already uses
 * (db/eventExhibitor.ts).
 *
 * This checks capacity against `sold` (paid purchases only, kept that way so
 * ticket_packages.sold stays revenue-accurate for the nonprofit dashboard,
 * unlike an exhibitor package's claim-at-order-time counter), so it is only
 * a soft/advisory check here -- two buyers can each pass it by reserving
 * concurrently before either pays. markPaid re-checks capacity atomically
 * against the real committed count at the point that actually matters.
 */
export async function createPurchase(
  buyerOrgIdValue: string,
  buyerUserId: string,
  packageId: string,
  quantityIn: number,
): Promise<TicketPurchase> {
  const pkg = await getPackageById(packageId);
  if (!pkg) throw new NotFoundError("ticket package not found");
  if (!PUBLISHED_STATUSES.has(pkg.status)) {
    throw new ForbiddenError("that ticket package is not currently available for purchase");
  }
  const quantity = Number.isFinite(quantityIn) && quantityIn > 0 ? Math.trunc(quantityIn) : 1;
  const cap = pkg.quantity != null ? Number(pkg.quantity) : 0;
  if (cap > 0) {
    const remaining = cap - Number(pkg.sold ?? 0);
    if (quantity > remaining) throw new ForbiddenError("that ticket package is sold out");
  }
  const amount = pkg.price != null ? Number(pkg.price) * quantity : 0;
  const row = await q1<TicketPurchase>(
    `insert into ticket_purchases
       (ticket_package_id, fundraising_event_id, buyer_org_id, buyer_user_id,
        quantity, status, amount)
     values ($1,$2,$3,$4,$5,'pending',$6)
     returning ${COLS}`,
    [packageId, pkg.fundraising_event_id, buyerOrgIdValue, buyerUserId, quantity, amount],
  );
  return row as TicketPurchase;
}

/**
 * Record the payment id + amount and move to 'paid'.
 *
 * createPurchase's capacity check is only advisory (checked against `sold`,
 * which counts paid purchases only): two buyers can each reserve the same
 * last seat concurrently, before either has paid, and both would pass it.
 * Codex review on #46 caught that nothing re-verified capacity at the point
 * that actually matters -- both could then finalize sequentially (no race
 * even required) and `sold` would exceed the package's quantity after real
 * money was accepted for the second one. Close it here with an atomic claim
 * against ticket_packages (the same row-locked "sold = sold + n WHERE ...
 * fits" pattern event_exhibitor_packages already uses), which genuinely
 * serializes two concurrent paid-transitions against the same package
 * because the second UPDATE blocks on the row lock and re-evaluates the
 * capacity predicate against the first's already-committed increment once
 * unblocked. Skipped for unlimited (quantity <= 0) packages.
 */
export async function markPaid(
  id: string,
  paymentId: string | null,
  amount: number | null,
): Promise<TicketPurchase> {
  const purchase = await q1<TicketPurchase>(`select ${COLS} from ticket_purchases where id = $1`, [id]);
  if (!purchase) throw new NotFoundError("ticket purchase not found");
  if (purchase.status === "paid") return purchase; // idempotent replay
  if (purchase.status !== "pending") {
    throw new ForbiddenError(`cannot mark paid from status '${purchase.status}'`);
  }

  if (purchase.ticket_package_id) {
    const claimed = await q1<{ id: string }>(
      `update ticket_packages
          set sold = sold + $2
        where id = $1 and (quantity is null or quantity <= 0 or sold + $2 <= quantity)
        returning id`,
      [purchase.ticket_package_id, purchase.quantity],
    );
    if (!claimed) {
      throw new ForbiddenError("that ticket package sold out before your payment could be confirmed");
    }
  }

  const row = await q1<TicketPurchase>(
    `update ticket_purchases
        set payment_id = coalesce($2, payment_id),
            amount = coalesce($3, amount),
            status = 'paid',
            updated_at = now()
      where id = $1
      returning ${COLS}`,
    [id, paymentId, amount],
  );
  if (!row) throw new NotFoundError("ticket purchase not found");
  // Recompute from truth: the claim above is a capacity GATE; this
  // converges `sold` to the exact real count so it stays correct and
  // self-healing (e.g. a crash between the claim and this write, or a
  // later cancellation) rather than trusting the claim's increment forever.
  await recomputeSold(row.ticket_package_id);
  return row;
}

/** Cancel a purchase (buyer, before paid, or nonprofit any time). */
export async function setStatus(id: string, status: TicketPurchaseStatus): Promise<TicketPurchase> {
  const row = await q1<TicketPurchase>(
    `update ticket_purchases set status = $2, updated_at = now() where id = $1 returning ${COLS}`,
    [id, status],
  );
  if (!row) throw new NotFoundError("ticket purchase not found");
  await recomputeSold(row.ticket_package_id);
  return row;
}
