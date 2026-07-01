/**
 * Nonprofit Auction Management - data-access layer (Phase 2).
 *
 * Org-scoped, IDOR-safe CRUD over the tables created in db/schema-np-auction.sql:
 *   - auction_items  (list / get / create / update / remove)
 *   - auction_bids   (record / list, current high bid computed)
 * plus award (set winner) and the checkout helpers that mark payment_status.
 *
 * Authorization mirrors server/src/db/fundraising.ts: every row belongs to the
 * organization that created it (organization_id). An actor may read/write when
 * their org owns the row, or they are an admin / super_admin. Any optional
 * fundraising_event link is validated against the actor's org before a write so
 * a forged id from another tenant is rejected (ForbiddenError) rather than
 * silently acted on. Bids + award + checkout always resolve the parent item
 * through assertAuctionItem first, so they inherit the same boundary.
 *
 * This layer never charges anyone: it records bids, copies the winning bid onto
 * the item, and flips payment_status. The actual hosted checkout is initiated by
 * the route (server/src/routes/auction.ts) reusing the payments processors.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  isAuctionItemStatus,
  isAuctionPaymentStatus,
  normalizeImageUrls,
  positiveAmount,
  currentHighBid,
  num,
  type AuctionPaymentStatus,
} from "../lib/auction.js";

// ---- Row types --------------------------------------------------------------

export type AuctionItemRow = {
  id: string;
  fundraising_event_id: string | null;
  organization_id: string | null;
  donor_name: string | null;
  item_name: string | null;
  description: string | null;
  estimated_value: string | null;
  image_urls: unknown;
  restrictions: string | null;
  expiration_date: string | null;
  pickup_info: string | null;
  winning_bidder_name: string | null;
  winning_bidder_org_id: string | null;
  winning_bid: string | null;
  payment_status: string | null;
  status: string | null;
  created_at: string;
};

export type AuctionBidRow = {
  id: string;
  auction_item_id: string | null;
  bidder_name: string | null;
  bidder_org_id: string | null;
  amount: string | null;
  created_at: string;
};

/** An item enriched with its computed current high bid (read views). */
export type AuctionItemWithHigh = AuctionItemRow & { current_high_bid: number };

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
 * Resolve + authorize an auction item the actor may act on. Throws NotFoundError
 * when missing, ForbiddenError when owned by another org.
 */
async function assertAuctionItem(actor: Actor, id: string): Promise<AuctionItemRow> {
  const row = await q1<AuctionItemRow>(`select * from auction_items where id = $1`, [id]);
  if (!row) throw new NotFoundError("auction item not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to this auction item");
  }
  return row;
}

/**
 * Verify an optional fundraising_event link belongs to the actor's org (so a
 * nonprofit cannot attach an auction item to another tenant's fundraising event).
 */
async function assertFundraisingEventLink(actor: Actor, fundraisingEventId: string): Promise<void> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from fundraising_events where id = $1`,
    [fundraisingEventId],
  );
  if (!row) throw new NotFoundError("linked fundraising event not found");
  if (!isAdmin(actor) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("no access to the linked fundraising event");
  }
}

// ---- Read helpers -----------------------------------------------------------

/** Current high bid per item id for a set of items (one query). */
async function highBidsFor(itemIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (itemIds.length === 0) return out;
  const rows = await q<{ auction_item_id: string; hi: string | null }>(
    `select auction_item_id, max(amount) as hi
       from auction_bids where auction_item_id = any($1::uuid[])
      group by auction_item_id`,
    [itemIds],
  );
  for (const r of rows) out[r.auction_item_id] = num(r.hi);
  return out;
}

// ---- auction_items: CRUD ----------------------------------------------------

/**
 * List the actor org's auction items, newest first, each with its computed
 * current high bid. Optionally filter by fundraising_event_id.
 */
export async function listAuctionItems(
  actor: Actor,
  opts: { fundraisingEventId?: string } = {},
): Promise<AuctionItemWithHigh[]> {
  let rows: AuctionItemRow[];
  if (isAdmin(actor) && !actor.org?.id) {
    rows = opts.fundraisingEventId
      ? await q<AuctionItemRow>(
          `select * from auction_items where fundraising_event_id = $1 order by created_at desc`,
          [opts.fundraisingEventId],
        )
      : await q<AuctionItemRow>(`select * from auction_items order by created_at desc`);
  } else {
    const orgId = requireOrgId(actor);
    rows = opts.fundraisingEventId
      ? await q<AuctionItemRow>(
          `select * from auction_items
            where organization_id = $1 and fundraising_event_id = $2
            order by created_at desc`,
          [orgId, opts.fundraisingEventId],
        )
      : await q<AuctionItemRow>(
          `select * from auction_items where organization_id = $1 order by created_at desc`,
          [orgId],
        );
  }
  const highs = await highBidsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, current_high_bid: highs[r.id] ?? 0 }));
}

/** Get one auction item (org-scoped) with its current high bid. */
export async function getAuctionItem(actor: Actor, id: string): Promise<AuctionItemWithHigh> {
  const row = await assertAuctionItem(actor, id);
  const highs = await highBidsFor([row.id]);
  return { ...row, current_high_bid: highs[row.id] ?? 0 };
}

export type AuctionItemInput = {
  fundraising_event_id?: string | null;
  donor_name?: string | null;
  item_name?: string | null;
  description?: string | null;
  estimated_value?: number | null;
  image_urls?: unknown;
  restrictions?: string | null;
  expiration_date?: string | null;
  pickup_info?: string | null;
  status?: string | null;
};

/** Create (intake) an auction item for the actor's org. */
export async function createAuctionItem(
  actor: Actor,
  input: AuctionItemInput,
): Promise<AuctionItemRow> {
  const orgId = requireOrgId(actor);
  if (!input.item_name || typeof input.item_name !== "string") {
    throw new ForbiddenError("item_name required");
  }
  if (input.status != null && !isAuctionItemStatus(input.status)) {
    throw new ForbiddenError("invalid status");
  }
  if (input.fundraising_event_id) {
    await assertFundraisingEventLink(actor, input.fundraising_event_id);
  }
  const row = await q1<AuctionItemRow>(
    `insert into auction_items
       (fundraising_event_id, organization_id, donor_name, item_name, description,
        estimated_value, image_urls, restrictions, expiration_date, pickup_info, status)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
     returning *`,
    [
      input.fundraising_event_id ?? null,
      orgId,
      input.donor_name ?? null,
      input.item_name,
      input.description ?? null,
      input.estimated_value ?? 0,
      JSON.stringify(normalizeImageUrls(input.image_urls)),
      input.restrictions ?? null,
      input.expiration_date ?? null,
      input.pickup_info ?? null,
      input.status ?? "open",
    ],
  );
  return row as AuctionItemRow;
}

/** Patch an auction item (org-scoped). */
export async function updateAuctionItem(
  actor: Actor,
  id: string,
  patch: AuctionItemInput,
): Promise<AuctionItemRow> {
  await assertAuctionItem(actor, id);
  if (patch.status != null && !isAuctionItemStatus(patch.status)) {
    throw new ForbiddenError("invalid status");
  }
  if (patch.fundraising_event_id) {
    await assertFundraisingEventLink(actor, patch.fundraising_event_id);
  }
  // image_urls: when provided (not undefined) we overwrite with the normalized
  // array; when omitted we keep the existing value via coalesce.
  const imagesProvided = patch.image_urls !== undefined;
  const imagesJson = imagesProvided ? JSON.stringify(normalizeImageUrls(patch.image_urls)) : null;
  const row = await q1<AuctionItemRow>(
    `update auction_items set
        fundraising_event_id = coalesce($2, fundraising_event_id),
        donor_name = coalesce($3, donor_name),
        item_name = coalesce($4, item_name),
        description = coalesce($5, description),
        estimated_value = coalesce($6, estimated_value),
        image_urls = coalesce($7::jsonb, image_urls),
        restrictions = coalesce($8, restrictions),
        expiration_date = coalesce($9, expiration_date),
        pickup_info = coalesce($10, pickup_info),
        status = coalesce($11, status)
      where id = $1
      returning *`,
    [
      id,
      patch.fundraising_event_id ?? null,
      patch.donor_name ?? null,
      patch.item_name ?? null,
      patch.description ?? null,
      patch.estimated_value ?? null,
      imagesJson,
      patch.restrictions ?? null,
      patch.expiration_date ?? null,
      patch.pickup_info ?? null,
      patch.status ?? null,
    ],
  );
  return row as AuctionItemRow;
}

/** Remove an auction item (org-scoped). Cascades to its bids. */
export async function removeAuctionItem(actor: Actor, id: string): Promise<void> {
  await assertAuctionItem(actor, id);
  await pool.query(`delete from auction_items where id = $1`, [id]);
}

// ---- auction_bids -----------------------------------------------------------

/** List bids for an item (org-scoped via the parent item), highest first. */
export async function listBids(actor: Actor, auctionItemId: string): Promise<AuctionBidRow[]> {
  await assertAuctionItem(actor, auctionItemId);
  return q<AuctionBidRow>(
    `select * from auction_bids where auction_item_id = $1 order by amount desc, created_at`,
    [auctionItemId],
  );
}

export type BidInput = {
  bidder_name?: string | null;
  bidder_org_id?: string | null;
  amount?: number | null;
};

/**
 * Record a bid against an item (org-scoped via the parent item). Returns the new
 * bid plus the recomputed current high bid. Rejects non-positive amounts and
 * bids on items that are not open.
 */
export async function recordBid(
  actor: Actor,
  auctionItemId: string,
  input: BidInput,
): Promise<{ bid: AuctionBidRow; current_high_bid: number }> {
  const item = await assertAuctionItem(actor, auctionItemId);
  if (item.status && item.status !== "open") {
    throw new ForbiddenError("auction item is not open for bids");
  }
  const amount = positiveAmount(input.amount);
  if (amount == null) throw new ForbiddenError("a positive bid amount is required");
  const bid = await q1<AuctionBidRow>(
    `insert into auction_bids (auction_item_id, bidder_name, bidder_org_id, amount)
     values ($1,$2,$3,$4)
     returning *`,
    [auctionItemId, input.bidder_name ?? null, input.bidder_org_id ?? null, amount],
  );
  const bids = await q<{ amount: string | null }>(
    `select amount from auction_bids where auction_item_id = $1`,
    [auctionItemId],
  );
  return { bid: bid as AuctionBidRow, current_high_bid: currentHighBid(bids) };
}

// ---- Award ------------------------------------------------------------------

export type AwardInput = {
  winning_bidder_name?: string | null;
  winning_bidder_org_id?: string | null;
  winning_bid?: number | null;
};

/**
 * Award an item to a winning bidder: set winner name/org + winning_bid and move
 * status to 'awarded'. When winning_bid is omitted we fall back to the current
 * high bid on the item. The item is left payment_status 'unpaid' (checkout is a
 * separate, explicit step - we NEVER charge here).
 */
export async function awardItem(
  actor: Actor,
  auctionItemId: string,
  input: AwardInput,
): Promise<AuctionItemRow> {
  await assertAuctionItem(actor, auctionItemId);
  if (!input.winning_bidder_name || typeof input.winning_bidder_name !== "string") {
    throw new ForbiddenError("winning_bidder_name required");
  }
  let amount = positiveAmount(input.winning_bid);
  if (amount == null) {
    const bids = await q<{ amount: string | null }>(
      `select amount from auction_bids where auction_item_id = $1`,
      [auctionItemId],
    );
    const hi = currentHighBid(bids);
    amount = hi > 0 ? hi : null;
  }
  if (amount == null) throw new ForbiddenError("a positive winning bid is required");
  const row = await q1<AuctionItemRow>(
    `update auction_items set
        winning_bidder_name = $2,
        winning_bidder_org_id = $3,
        winning_bid = $4,
        status = 'awarded',
        payment_status = case when payment_status = 'paid' then 'paid' else 'unpaid' end
      where id = $1
      returning *`,
    [auctionItemId, input.winning_bidder_name, input.winning_bidder_org_id ?? null, amount],
  );
  return row as AuctionItemRow;
}

// ---- Payment status ---------------------------------------------------------

/**
 * Set the payment_status of a won item (org-scoped). Used by the checkout flow:
 * 'pending' once a hosted checkout is initiated, 'paid' once a payment is
 * recorded, or back to 'unpaid'. Never moves money.
 */
export async function setPaymentStatus(
  actor: Actor,
  auctionItemId: string,
  status: AuctionPaymentStatus,
): Promise<AuctionItemRow> {
  await assertAuctionItem(actor, auctionItemId);
  if (!isAuctionPaymentStatus(status)) throw new ForbiddenError("invalid payment status");
  const row = await q1<AuctionItemRow>(
    `update auction_items set payment_status = $2 where id = $1 returning *`,
    [auctionItemId, status],
  );
  return row as AuctionItemRow;
}

/** Resolve the won amount + buyer label for an item, for checkout (org-scoped). */
export async function getAwardForCheckout(
  actor: Actor,
  auctionItemId: string,
): Promise<{ item: AuctionItemRow; amount: number; label: string }> {
  const item = await assertAuctionItem(actor, auctionItemId);
  const amount = positiveAmount(item.winning_bid);
  if (amount == null) throw new ForbiddenError("item has no awarded winning bid to charge");
  const label = `Auction item: ${item.item_name ?? "lot"}`;
  return { item, amount, label };
}
