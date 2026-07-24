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

export type LineItem = {
  label: string;
  qty?: number;
  unit_price?: number;
  amount?: number;
  kind?: "service" | "add_on" | "exclusion" | "rental";
  note?: string;
};

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

/** Sum of priced line items (amount, or qty*unit_price). */
function computeSubtotal(items: LineItem[]): number {
  return items
    .filter((li) => li.kind !== "exclusion")
    .reduce((sum, li) => {
      if (typeof li.amount === "number") return sum + li.amount;
      if (typeof li.qty === "number" && typeof li.unit_price === "number") {
        return sum + li.qty * li.unit_price;
      }
      return sum;
    }, 0);
}

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
 */
export async function authorizeQuoteAccess(actor: Actor, id: string): Promise<QuoteRow> {
  const quote = await getQuote(id);
  if (!quote.event_id) throw new NotFoundError("quote not found");
  await getEvent(actor, quote.event_id); // event-access gate (owner or attached vendor)
  if (await isEventOwner(actor, quote.event_id)) return quote;
  const mine = await orgVendorIds(actor);
  if (quote.vendor_id && mine.includes(quote.vendor_id)) return quote;
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
      input.vendor_id ?? null,
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
  return row as QuoteRow;
}

/** Revise an existing quote (new line items recompute totals). */
export async function reviseQuote(
  actor: Actor,
  id: string,
  patch: { line_items?: LineItem[]; expiration_date?: string | null },
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
  const row = await q1<QuoteRow>(
    `update quotes set
        line_items = $2, subtotal = $3, platform_fee = $4, total = $5,
        expiration_date = coalesce($6, expiration_date), status = 'revised'
      where id = $1 returning *`,
    [id, JSON.stringify(items), subtotal, platformFee, total, patch.expiration_date ?? null],
  );
  return row as QuoteRow;
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

  const items = quote.line_items ?? [];
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
