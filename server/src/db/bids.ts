/**
 * Phase 3 - Bids data-access layer (Bid Board).
 *
 * CRUD over the `bids` table from db/schema.sql. Bids belong to an event; the
 * event owner posts them, vendors discover and act on them. Tier-access windows
 * (blueprint section 17) gate when a vendor org may see / act on a public bid:
 *   - 0 to 48h after posting: Premier only
 *   - 48h to 7d after posting: Partner + Premier
 *   - after 7d: all tiers
 *   - private bids: invited vendor orgs only (any time)
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { PRICING_V2 } from "../config.js";

// ---- Type + status models (blueprint section 17) ---------------------------
export const BID_TYPES = [
  "public",
  "private",
  "preferred",
  "premier",
  "rush",
  "venue",
  "planner",
] as const;
export type BidType = (typeof BID_TYPES)[number];

export type BidStatus =
  | "draft"
  | "posted"
  | "invited"
  | "reviewing"
  | "questions"
  | "quote_submitted"
  | "clarification"
  | "shortlisted"
  | "awarded"
  | "declined"
  | "expired"
  | "closed";

export const BID_STATUSES: { key: BidStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "posted", label: "Posted" },
  { key: "invited", label: "Invited" },
  { key: "reviewing", label: "Vendor reviewing" },
  { key: "questions", label: "Questions asked" },
  { key: "quote_submitted", label: "Quote submitted" },
  { key: "clarification", label: "Clarification needed" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "awarded", label: "Awarded" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
  { key: "closed", label: "Closed" },
];

const BID_STATUS_KEYS = new Set<string>(BID_STATUSES.map((s) => s.key));
export function isBidStatus(v: unknown): v is BidStatus {
  return typeof v === "string" && BID_STATUS_KEYS.has(v);
}

/** schema.sql tier_access enum: 'premier' | 'partner' | 'free' | 'private'. */
export type TierAccess = "premier" | "partner" | "free" | "private";

export type BidRow = {
  id: string;
  event_id: string;
  category: string | null;
  scope: string | null;
  budget_min: string | null;
  budget_max: string | null;
  deadline: string | null;
  invited_vendors: unknown;
  visibility: string | null;
  tier_access: TierAccess | null;
  rush: boolean;
  status: BidStatus | null;
  bid_type?: string | null;
  posted_at?: string | null;
  created_at: string;
};

const PREMIER_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h
const PARTNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7d

/** Normalize an org tier string to the access rank used by the windows. */
function tierRank(tier: string | null | undefined): "premier" | "partner" | "free" | "client" {
  if (tier === "premier") return "premier";
  if (tier === "partner") return "partner";
  if (tier === "free_partner") return "free";
  return "client";
}

/**
 * Tier-access window decision. Returns whether a vendor org of the given tier
 * may access the bid at `now`, plus a human reason. Private bids require the
 * vendor org id to be in the invited list.
 */
export function canVendorAccessBid(
  bid: Pick<BidRow, "tier_access" | "visibility" | "invited_vendors" | "posted_at" | "created_at" | "status">,
  vendorOrgTier: string | null | undefined,
  now: Date,
  vendorOrgId?: string | null,
): { allowed: boolean; reason: string } {
  const status = bid.status ?? "draft";
  if (status === "draft") return { allowed: false, reason: "Bid is still a draft." };

  // Private / invite-only path.
  const isPrivate = bid.tier_access === "private" || bid.visibility === "private";
  if (isPrivate) {
    const invited = Array.isArray(bid.invited_vendors)
      ? (bid.invited_vendors as unknown[]).map(String)
      : [];
    if (vendorOrgId && invited.includes(String(vendorOrgId))) {
      return { allowed: true, reason: "Invited to this private bid." };
    }
    return { allowed: false, reason: "Private bid - invitation required." };
  }

  const rank = tierRank(vendorOrgTier);
  if (rank === "client") return { allowed: false, reason: "Clients cannot bid." };

  // Pricing V2: no tier-access windows. Every non-client vendor org can see
  // and act on every public opportunity immediately (the only gate left is the
  // private / invite-only path handled above). Legacy time windows below are
  // skipped entirely when the flag is on.
  if (PRICING_V2) {
    return { allowed: true, reason: "Open to all vendors (Pricing V2)." };
  }

  const postedRaw = bid.posted_at ?? bid.created_at;
  const posted = postedRaw ? new Date(postedRaw).getTime() : now.getTime();
  const elapsed = now.getTime() - posted;

  if (elapsed < PREMIER_WINDOW_MS) {
    if (rank === "premier") return { allowed: true, reason: "Premier early-access window (0-48h)." };
    return {
      allowed: false,
      reason: "Premier-only window (first 48h). Opens to Partner at 48h.",
    };
  }
  if (elapsed < PARTNER_WINDOW_MS) {
    if (rank === "premier" || rank === "partner") {
      return { allowed: true, reason: "Partner + Premier window (48h-7d)." };
    }
    return { allowed: false, reason: "Opens to all tiers after 7 days." };
  }
  return { allowed: true, reason: "Open to all tiers (after 7 days)." };
}

/** True when the actor owns the bid's event. */
async function actorOwnsBidEvent(actor: Actor, bid: BidRow): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and (($2::uuid is not null and organization_id = $2)
             or client_id = $3 or planner_id = $3)
      limit 1`,
    [bid.event_id, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

export async function getBid(id: string): Promise<BidRow> {
  const bid = await q1<BidRow>(`select * from bids where id = $1`, [id]);
  if (!bid) throw new NotFoundError("bid not found");
  return bid;
}

/** Bids posted on an event (event-owner view - all of them). */
export async function listEventBids(actor: Actor, eventId: string): Promise<BidRow[]> {
  await getEvent(actor, eventId); // access check
  return q<BidRow>(`select * from bids where event_id = $1 order by created_at desc`, [eventId]);
}

/**
 * Vendor-facing bid board: posted, non-draft bids, with the tier-access decision
 * attached for each. Owners/admins see everything; vendors see access flags.
 */
export async function listBoardBids(
  actor: Actor,
  filters?: { category?: string | null; rush?: boolean },
): Promise<(BidRow & { access: { allowed: boolean; reason: string } })[]> {
  const where: string[] = ["status <> 'draft'"];
  const params: unknown[] = [];
  if (filters?.category) {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters?.rush) where.push(`rush = true`);
  const rows = await q<BidRow>(
    `select * from bids where ${where.join(" and ")} order by coalesce(posted_at, created_at) desc limit 300`,
    params,
  );
  const now = new Date();
  const tier = actor.org?.tier ?? null;
  return rows.map((b) => ({
    ...b,
    access: canVendorAccessBid(b, tier, now, actor.org?.id ?? null),
  }));
}

export type CreateBidInput = {
  event_id: string;
  category?: string | null;
  scope?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  deadline?: string | null;
  bid_type?: BidType;
  tier_access?: TierAccess;
  visibility?: string | null;
  rush?: boolean;
  invited_vendors?: string[];
  post?: boolean; // when true, posted immediately (else draft)
};

/** Post (or draft) a bid on an event the actor owns. */
export async function createBid(actor: Actor, input: CreateBidInput): Promise<BidRow> {
  await getEvent(actor, input.event_id);
  const owns = await actorOwnsBidEvent(actor, { event_id: input.event_id } as BidRow);
  if (!owns) throw new ForbiddenError("only the event owner can post bids");

  const tierAccess: TierAccess = input.tier_access ?? (input.visibility === "private" ? "private" : "premier");
  const status: BidStatus = input.post === false ? "draft" : "posted";
  const row = await q1<BidRow>(
    `insert into bids
       (event_id, category, scope, budget_min, budget_max, deadline,
        invited_vendors, visibility, tier_access, rush, status, bid_type, posted_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $11 = 'draft' then null else now() end)
     returning *`,
    [
      input.event_id,
      input.category ?? null,
      input.scope ?? null,
      input.budget_min ?? null,
      input.budget_max ?? null,
      input.deadline ?? null,
      JSON.stringify(input.invited_vendors ?? []),
      input.visibility ?? (tierAccess === "private" ? "private" : "marketplace"),
      tierAccess,
      input.rush ?? false,
      status,
      input.bid_type ?? "public",
    ],
  );
  return row as BidRow;
}

/** Add invited vendor org ids to a (typically private) bid. */
export async function inviteVendors(
  actor: Actor,
  bidId: string,
  orgIds: string[],
): Promise<BidRow> {
  const bid = await getBid(bidId);
  if (!(await actorOwnsBidEvent(actor, bid))) {
    throw new ForbiddenError("only the event owner can invite vendors");
  }
  const existing = Array.isArray(bid.invited_vendors)
    ? (bid.invited_vendors as unknown[]).map(String)
    : [];
  const merged = Array.from(new Set([...existing, ...orgIds.map(String)]));
  const row = await q1<BidRow>(
    `update bids set invited_vendors = $2,
        status = case when status = 'draft' then 'invited' else status end
      where id = $1 returning *`,
    [bidId, JSON.stringify(merged)],
  );
  return row as BidRow;
}

/** Transition a bid's status (event owner only). */
export async function setBidStatus(
  actor: Actor,
  bidId: string,
  status: BidStatus,
): Promise<BidRow> {
  const bid = await getBid(bidId);
  if (!(await actorOwnsBidEvent(actor, bid))) {
    throw new ForbiddenError("only the event owner can change bid status");
  }
  if (!isBidStatus(status)) throw new ForbiddenError("invalid bid status");
  const row = await q1<BidRow>(`update bids set status = $2 where id = $1 returning *`, [
    bidId,
    status,
  ]);
  return row as BidRow;
}
