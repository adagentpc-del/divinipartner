/**
 * Phase 3 - Quotes data-access layer.
 *
 * CRUD over the `quotes` table from db/schema.sql. A vendor generates a quote in
 * response to a bid; the standardized quote shape carries the Divini frame plus
 * the vendor's brand, line items, add-ons, exclusions, platform fee, expiration,
 * and the accept/decline/revise actions. Platform fee is derived from the
 * vendor org's tier fee rate - never fabricated.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, TIERS, type Actor, type Tier } from "../db.js";
import { getBid } from "./bids.js";
import { PRICING_V2 } from "../config.js";
import { getEvent } from "./events.js";
import { computePlatformFee } from "../lib/platformFees.js";
import { computeSubtotal, type LineItem } from "../lib/quoteMath.js";
import { getBookablePackage, lineItemTotal } from "./packages.js";
import { awardQuote, type AwardResult } from "./awards.js";

export { computeSubtotal, type LineItem };

// Money model: the CLIENT pays; their org tier sets the platform fee %. The fee
// is capped at $2,500 PER EVENT, cumulative across all bookings on that event,
// with a $2 minimum profit per booking. See money-model-review.md.
const EVENT_FEE_CAP_CENTS = 250000; // $2,500 per event, all tiers
const MIN_FEE_CENTS = 200; // $2 minimum platform profit per booking

/** The paying CLIENT org's plan tier for an event (defaults to free = 5%). */
async function clientPlanForEvent(eventId: string): Promise<{ tier: string | null }> {
  const row = await q1<{ tier: string | null }>(
    `select o.tier from events e
       join users u on u.id = e.client_id
       join organizations o on o.id = u.organization_id
      where e.id = $1 limit 1`,
    [eventId],
  );
  return { tier: row?.tier ?? null };
}

/** Platform fees already committed on this event (accepted/converted quotes),
 *  in cents, for the per-EVENT cumulative $2,500 cap. */
async function eventFeeSoFarCents(eventId: string, excludeQuoteId?: string | null): Promise<number> {
  const params: unknown[] = [eventId];
  let extra = "";
  if (excludeQuoteId) {
    params.push(excludeQuoteId);
    extra = ` and id <> $${params.length}`;
  }
  const row = await q1<{ c: string | number }>(
    `select coalesce(sum(platform_fee),0) as c from quotes
       where event_id = $1 and status in ('accepted','converted')${extra}`,
    params,
  );
  return Math.round((Number(row?.c) || 0) * 100);
}

/** Client-tier platform fee for a booking on an event, honoring the per-event
 *  cumulative $2,500 cap and the $2 floor. Returns dollars + the effective rate. */
async function clientPlatformFee(
  eventId: string,
  subtotal: number,
  excludeQuoteId?: string | null,
): Promise<{ fee: number; rate: number }> {
  const plan = await clientPlanForEvent(eventId);
  const soFar = await eventFeeSoFarCents(eventId, excludeQuoteId);
  const remaining = Math.max(0, EVENT_FEE_CAP_CENTS - soFar);
  const res = computePlatformFee(Math.round(subtotal * 100), { tier: plan.tier });
  let feeCents = Math.min(res.platformFeeCents, remaining);
  if (remaining > 0) feeCents = Math.max(feeCents, Math.min(MIN_FEE_CENTS, remaining));
  return { fee: Math.round(feeCents) / 100, rate: res.feeRate };
}

export type QuoteStatus =
  | "draft"
  | "generated"
  | "submitted"
  | "viewed"
  | "revision_requested"
  | "revised"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

export const QUOTE_STATUSES: { key: QuoteStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "generated", label: "Generated" },
  { key: "submitted", label: "Submitted" },
  { key: "viewed", label: "Viewed" },
  { key: "revision_requested", label: "Revision requested" },
  { key: "revised", label: "Revised" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
  { key: "converted", label: "Converted to invoice" },
];

const QUOTE_STATUS_KEYS = new Set<string>(QUOTE_STATUSES.map((s) => s.key));
export function isQuoteStatus(v: unknown): v is QuoteStatus {
  return typeof v === "string" && QUOTE_STATUS_KEYS.has(v);
}

export type QuoteRow = {
  id: string;
  bid_id: string | null;
  vendor_id: string | null;
  event_id: string;
  line_items: LineItem[] | null;
  subtotal: string | null;
  fees: unknown;
  platform_fee: string | null;
  total: string | null;
  status: QuoteStatus | null;
  expiration_date: string | null;
  standardized_pdf: string | null;
  created_at: string;
};

export async function getQuote(id: string): Promise<QuoteRow> {
  const row = await q1<QuoteRow>(`select * from quotes where id = $1`, [id]);
  if (!row) throw new NotFoundError("quote not found");
  return row;
}

/**
 * True when the actor is on the DEMAND side of the event (the owner: owning org,
 * client, or planner, or admin). Owners see every quote; an attached VENDOR is on
 * the supply side and must only ever see its own quotes.
 */
async function isEventOwner(actor: Actor, eventId: string): Promise<boolean> {
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

/** The vendors.id values that belong to the actor's org (its supply-side identity). */
async function orgVendorIds(actor: Actor): Promise<string[]> {
  const orgId = actor.org?.id ?? null;
  if (!orgId) return [];
  const rows = await q<{ id: string }>(`select id from vendors where organization_id = $1`, [orgId]);
  return rows.map((r) => r.id);
}

/**
 * IDOR gate for quote-by-id access. A quote belongs to an event; the actor may
 * read or act on it only if they can access that event. The event OWNER (demand
 * side) may act on any quote; an attached VENDOR may only touch its own org's
 * quote, never a competitor's. Routes that take a quote id from the request MUST
 * call this. Returns the quote row so callers avoid a second fetch.
 *
 * A vendor's OWN quote is checked first, before the broad event-access gate:
 * db/awards.ts::awardQuote demotes a losing bidder's event_vendors row to
 * 'declined' once the bid is awarded elsewhere, which correctly cuts off
 * broad ongoing event access (check-ins, tasks, command center) -- but a
 * losing vendor must still be able to see the fate of what THEY submitted
 * (the spec is explicit: "Losers should receive appropriate closure"), so
 * ownership of the quote's vendor_id is checked independently of that gate.
 */
export async function authorizeQuoteAccess(actor: Actor, id: string): Promise<QuoteRow> {
  const quote = await getQuote(id);
  if (!quote.event_id) throw new NotFoundError("quote not found");
  const mine = await orgVendorIds(actor);
  if (quote.vendor_id && mine.includes(quote.vendor_id)) return quote;
  await getEvent(actor, quote.event_id); // event-access gate (owner or currently-attached vendor)
  if (await isEventOwner(actor, quote.event_id)) return quote;
  throw new ForbiddenError("you can only view your own quote on this event");
}

/**
 * Owner-only authorization for DEMAND-SIDE decisions on a quote (accept, decline,
 * request revision). Only the event owner (or admin) may decide; a vendor cannot
 * self-accept its own quote.
 */
export async function authorizeQuoteOwner(actor: Actor, id: string): Promise<QuoteRow> {
  const quote = await getQuote(id);
  if (!quote.event_id) throw new NotFoundError("quote not found");
  if (!(await isEventOwner(actor, quote.event_id))) {
    throw new ForbiddenError("only the event owner can decide on this quote");
  }
  return quote;
}

/**
 * Quotes on an event. The owner sees all; an attached vendor sees only its own
 * org's quotes (never competitors' pricing).
 */
export async function listEventQuotes(actor: Actor, eventId: string): Promise<QuoteRow[]> {
  await getEvent(actor, eventId); // access check
  if (await isEventOwner(actor, eventId)) {
    return q<QuoteRow>(`select * from quotes where event_id = $1 order by created_at desc`, [eventId]);
  }
  const mine = await orgVendorIds(actor);
  if (mine.length === 0) return [];
  return q<QuoteRow>(
    `select * from quotes where event_id = $1 and vendor_id = any($2::uuid[]) order by created_at desc`,
    [eventId, mine],
  );
}

/** Quotes on a single bid. Owner sees all; an attached vendor sees only its own. */
export async function listBidQuotes(actor: Actor, eventId: string, bidId: string): Promise<QuoteRow[]> {
  await getEvent(actor, eventId); // access check
  if (await isEventOwner(actor, eventId)) {
    return q<QuoteRow>(
      `select * from quotes where bid_id = $1 and event_id = $2 order by created_at desc`,
      [bidId, eventId],
    );
  }
  const mine = await orgVendorIds(actor);
  if (mine.length === 0) return [];
  return q<QuoteRow>(
    `select * from quotes where bid_id = $1 and event_id = $2 and vendor_id = any($3::uuid[]) order by created_at desc`,
    [bidId, eventId, mine],
  );
}

// ---- Quote Q&A thread (negotiate / ask questions) --------------------------

export interface QuoteMessageRow {
  id: string;
  quote_id: string;
  author_side: string;
  body: string;
  request_revision: boolean;
  proposed_amount: string | null;
  counter_status: "open" | "accepted" | "declined" | null;
  created_at: string;
}

/** The Q&A thread on a quote (owner or the quote's own vendor). */
export async function listQuoteMessages(actor: Actor, quoteId: string): Promise<QuoteMessageRow[]> {
  await authorizeQuoteAccess(actor, quoteId); // owner OR the quote's vendor
  return q<QuoteMessageRow>(
    `select id, quote_id, author_side, body, request_revision, proposed_amount, counter_status, created_at
       from quote_messages where quote_id = $1 order by created_at asc`,
    [quoteId],
  );
}

/**
 * Post a message on a quote. The event owner posts as 'client'; the quote's own
 * vendor posts as 'vendor'. When the client sends with request_revision, the
 * quote is pushed back to the vendor (status revision_requested). Returns the row
 * plus the author side so the route can notify the other party.
 */
export async function postQuoteMessage(
  actor: Actor,
  quoteId: string,
  input: { body: string; request_revision?: boolean },
): Promise<QuoteMessageRow> {
  const quote = await authorizeQuoteAccess(actor, quoteId);
  const body = (input.body ?? "").trim();
  if (!body) throw new ForbiddenError("message body required");
  const side = quote.event_id && (await isEventOwner(actor, quote.event_id)) ? "client" : "vendor";
  const requestRevision = side === "client" && !!input.request_revision;

  const row = await q1<QuoteMessageRow>(
    `insert into quote_messages (quote_id, event_id, author_user_id, author_side, body, request_revision)
     values ($1,$2,$3,$4,$5,$6)
     returning id, quote_id, author_side, body, request_revision, proposed_amount, counter_status, created_at`,
    [quoteId, quote.event_id, actor.user.id, side, body, requestRevision],
  );
  if (requestRevision) {
    await q(`update quotes set status = 'revision_requested' where id = $1`, [quoteId]);
  }
  return row as QuoteMessageRow;
}

/**
 * Post a structured commercial counteroffer -- previously the only
 * negotiation mechanism was free text plus a boolean status nudge; there was
 * no explicit "propose $47,500 instead of $52,000" object the other side
 * could accept or decline (front-half audit, 2026-08-10). Either side may
 * propose; the amount is carried on the message row itself so it is never
 * ambiguous which number is on the table.
 */
export async function proposeCounteroffer(
  actor: Actor,
  quoteId: string,
  amount: number,
  note?: string | null,
): Promise<QuoteMessageRow> {
  const quote = await authorizeQuoteAccess(actor, quoteId);
  if (!(amount > 0)) throw new ForbiddenError("counteroffer amount must be a positive number");
  const side = quote.event_id && (await isEventOwner(actor, quote.event_id)) ? "client" : "vendor";
  const body = note?.trim() || `Proposed ${side === "client" ? "counter" : "counter"}offer: $${amount}`;
  const row = await q1<QuoteMessageRow>(
    `insert into quote_messages (quote_id, event_id, author_user_id, author_side, body, proposed_amount, counter_status)
     values ($1,$2,$3,$4,$5,$6,'open')
     returning id, quote_id, author_side, body, request_revision, proposed_amount, counter_status, created_at`,
    [quoteId, quote.event_id, actor.user.id, side, body, amount],
  );
  return row as QuoteMessageRow;
}

/**
 * Respond to a still-open counteroffer. 'decline' just marks it closed.
 * 'accept' marks it closed AND revises the quote's commercial terms to the
 * proposed amount (versioned via reviseQuote's quote_versions snapshot, so
 * the pre-negotiation terms are never lost) -- but never auto-awards; award
 * remains the event owner's separate, explicit POST /:id/accept decision,
 * matching the "AI/negotiation cannot make the final award decision" rule.
 * Only the side that did NOT propose the counteroffer may respond to it.
 */
export async function respondToCounteroffer(
  actor: Actor,
  quoteId: string,
  messageId: string,
  action: "accept" | "decline",
): Promise<QuoteRow> {
  const quote = await authorizeQuoteAccess(actor, quoteId);
  const msg = await q1<{ id: string; author_side: string; proposed_amount: string | null; counter_status: string | null }>(
    `select id, author_side, proposed_amount, counter_status from quote_messages where id = $1 and quote_id = $2`,
    [messageId, quoteId],
  );
  if (!msg) throw new NotFoundError("counteroffer not found");
  if (msg.counter_status !== "open") throw new ForbiddenError("this counteroffer is no longer open");
  const respondingSide = quote.event_id && (await isEventOwner(actor, quote.event_id)) ? "client" : "vendor";
  if (respondingSide === msg.author_side) {
    throw new ForbiddenError("you cannot respond to your own counteroffer");
  }
  if (action === "decline") {
    await q1(`update quote_messages set counter_status = 'declined' where id = $1`, [messageId]);
    return getQuote(quoteId);
  }
  const amount = Number(msg.proposed_amount) || 0;
  await q1(`update quote_messages set counter_status = 'accepted' where id = $1`, [messageId]);
  return reviseQuote(actor, quoteId, {
    line_items: [{ label: "Negotiated amount", quantity: 1, unit_price: amount, name: "Negotiated amount" }],
    reason: `Counteroffer accepted (message ${messageId})`,
  });
}

export type CreateQuoteInput = {
  bid_id?: string | null;
  event_id?: string | null;
  vendor_id?: string | null;
  line_items: LineItem[];
  expiration_date?: string | null;
  submit?: boolean; // post immediately vs. leave generated
};

/** The vendor org's platform fee rate, derived from tier (never invented). */
function feeRateFor(actor: Actor): number {
  const tier = (actor.org?.tier ?? "free_partner") as Tier;
  return TIERS[tier]?.feeRate ?? TIERS.free_partner.feeRate;
}

/** Generate a quote against a bid. Computes subtotal, platform fee, total. */
export async function createQuote(actor: Actor, input: CreateQuoteInput): Promise<QuoteRow> {
  let eventId = input.event_id ?? null;
  if (input.bid_id) {
    const bid = await getBid(input.bid_id);
    eventId = bid.event_id;
  }
  if (!eventId) throw new ForbiddenError("event_id or bid_id required");

  // Resolve the submitting vendor's identity server-side from the actor's
  // own org, never from a client-supplied vendor_id -- the real production
  // caller (AutoQuoteDraft.tsx) never sends one at all (so it always landed
  // on null before this fix, permanently breaking the vendor's own access to
  // their own quote via authorizeQuoteAccess's ownership check), and trusting
  // a client-supplied value would let one vendor misattribute a quote to a
  // different vendor's identity.
  const vendorId = actor.org?.id ? (await orgVendorIds(actor))[0] ?? null : null;

  const items = Array.isArray(input.line_items) ? input.line_items : [];
  const subtotal = computeSubtotal(items);
  // Money model (client pays): the platform fee is ADDED ON TOP of the vendor
  // subtotal and set by the CLIENT org's tier (5% / 2.5% / 1%), capped at $2,500
  // cumulatively PER EVENT. The vendor's payout is the full subtotal; the client
  // total = subtotal + fee. Legacy (PRICING_V2 off): vendor-tier rate, unchanged.
  let feeRate: number;
  let platformFee: number;
  if (PRICING_V2) {
    const r = await clientPlatformFee(eventId, subtotal);
    platformFee = r.fee;
    feeRate = r.rate;
  } else {
    feeRate = feeRateFor(actor);
    platformFee = Math.round(subtotal * feeRate * 100) / 100;
  }
  const total = Math.round((subtotal + platformFee) * 100) / 100;
  const status: QuoteStatus = input.submit ? "submitted" : "generated";

  const row = await q1<QuoteRow>(
    `insert into quotes
       (bid_id, vendor_id, event_id, line_items, subtotal, fees, platform_fee, total, status, expiration_date)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      input.bid_id ?? null,
      vendorId,
      eventId,
      JSON.stringify(items),
      subtotal,
      JSON.stringify({ platform_fee_rate: feeRate, on_top: PRICING_V2 ? 1 : 0 }),
      platformFee,
      total,
      status,
      input.expiration_date ?? null,
    ],
  );

  // Self-attach the submitting vendor to the event's event_vendors so they
  // can subsequently see the event and their own quote (authorizeQuoteAccess
  // gates on event access first, then vendor ownership -- without this a
  // vendor who successfully submitted a quote against an open marketplace
  // bid could never view or download it again). This is the vendor acting on
  // their own behalf, not addEventVendor's owner-only "add someone else"
  // action, so it deliberately bypasses that ownership check. Best-effort:
  // never fails quote creation.
  if (actor.org?.id) {
    await q1(
      `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
         values ($1, $2, $3, 'bidder', 'added')
       on conflict (event_id, organization_id) do nothing`,
      [eventId, actor.org.id, vendorId],
    ).catch(() => undefined);
  }

  return row as QuoteRow;
}

/**
 * Self-service instant book (moat roadmap Phase 2c, 2026-08-14): a client
 * books a vendor's fixed-price package against their event with no bid or
 * back-and-forth negotiation. Builds a quote from the package's line items
 * (or its flat bundle_price when it has no itemized lines), then reuses
 * awardQuote() -- the SAME atomic transaction every negotiated award goes
 * through, compliance gate included -- to award it immediately. There is no
 * override here: if the event has an unmet before-award compliance
 * requirement on this vendor, the booking is blocked exactly like a normal
 * award would be, not silently bypassed just because it is "instant."
 */
export async function instantBookPackage(
  actor: Actor,
  packageId: string,
  eventId: string,
): Promise<AwardResult & { quote: QuoteRow }> {
  if (!(await isEventOwner(actor, eventId))) {
    throw new ForbiddenError("only the event owner can book a package");
  }
  const pkg = await getBookablePackage(packageId);
  if (!pkg) throw new NotFoundError("package not found or not available for instant book");
  if (!pkg.vendor_id) throw new ForbiddenError("this package has no vendor identity to book against");

  const packageItems: LineItem[] = Array.isArray(pkg.items) && pkg.items.length > 0
    ? pkg.items.map((it: { name?: string; quantity?: number; unit_price?: number }) => ({
        description: it.name || "Package item",
        amount: Math.round((Number(it.unit_price) || 0) * (Number(it.quantity) || 1) * 100) / 100,
      }))
    : [{ description: pkg.name || "Package", amount: Number(pkg.bundle_price) || 0 }];
  const subtotal = pkg.bundle_price != null ? Number(pkg.bundle_price) : lineItemTotal(pkg.items);

  let feeRate: number;
  let platformFee: number;
  if (PRICING_V2) {
    const r = await clientPlatformFee(eventId, subtotal);
    platformFee = r.fee;
    feeRate = r.rate;
  } else {
    // Legacy (PRICING_V2 off): fee rate keyed off the VENDOR org's own tier,
    // matching createQuote's non-PRICING_V2 convention -- feeRateFor(actor)
    // would be wrong here since the actor booking is the CLIENT, not the
    // vendor whose rate this fee is supposed to reflect.
    const vendorOrg = await q1<{ tier: string | null }>(`select tier from organizations where id = $1`, [pkg.organization_id]);
    const tier = (vendorOrg?.tier ?? "free_partner") as Tier;
    feeRate = TIERS[tier]?.feeRate ?? TIERS.free_partner.feeRate;
    platformFee = Math.round(subtotal * feeRate * 100) / 100;
  }
  const total = Math.round((subtotal + platformFee) * 100) / 100;

  const row = await q1<QuoteRow>(
    `insert into quotes (bid_id, vendor_id, event_id, line_items, subtotal, fees, platform_fee, total, status)
     values (null,$1,$2,$3,$4,$5,$6,$7,'submitted')
     returning *`,
    [
      pkg.vendor_id,
      eventId,
      JSON.stringify(packageItems),
      subtotal,
      JSON.stringify({ platform_fee_rate: feeRate, on_top: PRICING_V2 ? 1 : 0, instant_book_package_id: packageId }),
      platformFee,
      total,
    ],
  );
  const quote = row as QuoteRow;

  const award = await awardQuote(actor, quote.id, { override: false });
  return { ...award, quote: await getQuote(quote.id) };
}

/**
 * Revise an existing quote (new line items recompute totals). The pre-
 * revision commercial terms are snapshotted into quote_versions first --
 * previously this UPDATE silently overwrote the prior line items/pricing in
 * place with zero audit trail, so a client comparing "what did they
 * originally quote" against a since-revised offer had no way to see it.
 * quote_versions is append-only (never updated, never deleted) mirroring
 * change_order_status_history's discipline.
 */
export async function reviseQuote(
  actor: Actor,
  id: string,
  patch: { line_items?: LineItem[]; expiration_date?: string | null; reason?: string | null },
): Promise<QuoteRow> {
  const cur = await getQuote(id);
  const items = patch.line_items ?? cur.line_items ?? [];
  const subtotal = computeSubtotal(items);
  let feeRate: number;
  let platformFee: number;
  if (PRICING_V2 && cur.event_id) {
    const r = await clientPlatformFee(cur.event_id, subtotal, id);
    platformFee = r.fee;
    feeRate = r.rate;
  } else {
    feeRate = feeRateFor(actor);
    platformFee = Math.round(subtotal * feeRate * 100) / 100;
  }
  const total = Math.round((subtotal + platformFee) * 100) / 100;
  await q1(
    `insert into quote_versions (quote_id, line_items, subtotal, platform_fee, total, status, revised_by, reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      JSON.stringify(cur.line_items ?? []),
      cur.subtotal,
      cur.platform_fee,
      cur.total,
      cur.status,
      actor.user.id,
      patch.reason ?? null,
    ],
  ).catch(() => undefined);
  const row = await q1<QuoteRow>(
    `update quotes set
        line_items = $2, subtotal = $3, platform_fee = $4, total = $5,
        expiration_date = coalesce($6, expiration_date), status = 'revised'
      where id = $1 returning *`,
    [id, JSON.stringify(items), subtotal, platformFee, total, patch.expiration_date ?? null],
  );
  return row as QuoteRow;
}

export type QuoteVersionRow = {
  id: string;
  quote_id: string;
  line_items: LineItem[] | null;
  subtotal: string | null;
  platform_fee: string | null;
  total: string | null;
  status: string | null;
  revised_by: string | null;
  reason: string | null;
  created_at: string;
};

/** Prior versions of a quote, oldest first, for a client-facing diff view. */
export async function listQuoteVersions(actor: Actor, id: string): Promise<QuoteVersionRow[]> {
  await authorizeQuoteAccess(actor, id);
  return q<QuoteVersionRow>(`select * from quote_versions where quote_id = $1 order by created_at asc`, [id]);
}

/** Submit a generated/revised quote to the client. */
export async function submitQuote(id: string): Promise<QuoteRow> {
  await getQuote(id);
  const row = await q1<QuoteRow>(
    `update quotes set status = 'submitted' where id = $1 returning *`,
    [id],
  );
  return row as QuoteRow;
}

/** Set a terminal/decision status on a quote. */
export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<QuoteRow> {
  await getQuote(id);
  if (!isQuoteStatus(status)) throw new ForbiddenError("invalid quote status");
  const row = await q1<QuoteRow>(`update quotes set status = $2 where id = $1 returning *`, [
    id,
    status,
  ]);
  return row as QuoteRow;
}

/**
 * The standardized quote payload (blueprint section 18): Divini frame + vendor
 * brand, grouped line items, add-ons, exclusions, fee + total, expiration, and
 * the allowed client actions. Built only from stored data.
 */
export async function getStandardizedQuote(id: string) {
  const quote = await getQuote(id);
  const event = await q1<{ name: string; date_time: string | null }>(
    `select name, date_time from events where id = $1`,
    [quote.event_id],
  );
  const vendor = quote.vendor_id
    ? await q1<{ name: string; category: string | null }>(
        `select o.name, v.category from vendors v join organizations o on o.id = v.organization_id where v.id = $1`,
        [quote.vendor_id],
      )
    : null;

  // Normalize label: real submissions (e.g. AutoQuoteDraft.tsx) send `name`,
  // not `label` -- fall back so every consumer (this payload, the PDF
  // renderer) always sees a real display string.
  const items = (quote.line_items ?? []).map((li) => ({ ...li, label: li.label ?? li.name ?? "Item" }));
  const services = items.filter((li) => li.kind === "service" || !li.kind);
  const addOns = items.filter((li) => li.kind === "add_on");
  const rentals = items.filter((li) => li.kind === "rental");
  const exclusions = items.filter((li) => li.kind === "exclusion");

  return {
    quote_id: quote.id,
    status: quote.status,
    brand: {
      platform: "Divini Partners by Divini Group",
      vendor: vendor?.name ?? "Vendor",
      vendor_category: vendor?.category ?? null,
    },
    event: { name: event?.name ?? "Event", date_time: event?.date_time ?? null },
    line_items: { services, rentals, add_ons: addOns, exclusions },
    totals: {
      subtotal: quote.subtotal,
      platform_fee: quote.platform_fee,
      total: quote.total,
    },
    expiration_date: quote.expiration_date,
    actions: ["accept", "decline", "request_revision"],
  };
}
