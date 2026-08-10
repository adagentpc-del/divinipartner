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

// ---------------------------------------------------------------------------
// Pre-bid Q&A / addenda. Previously nonexistent: "questions"/"clarification"
// were vestigial BidStatus enum values nothing ever set. bid_questions
// (db/schema-award-flow.sql) is the real table. A question defaults to
// 'private' (only the asking vendor org + the event owner can see it); the
// owner can answer it publicly as an addendum (is_addendum=true, promoted to
// visibility='public') so every vendor who currently has bid access sees the
// same clarified requirements -- never a materially different scope handed
// to one bidder silently.
// ---------------------------------------------------------------------------

export type BidQuestionRow = {
  id: string;
  bid_id: string;
  asked_by_org_id: string | null;
  question: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  visibility: "private" | "public";
  is_addendum: boolean;
  created_at: string;
};

/** Vendor asks a question on a bid it can currently access. */
export async function askBidQuestion(actor: Actor, bidId: string, question: string): Promise<BidQuestionRow> {
  const bid = await getBid(bidId);
  if (!question?.trim()) throw new ForbiddenError("question text is required");
  const isOwner = await actorOwnsBidEvent(actor, bid);
  if (!isOwner) {
    const access = canVendorAccessBid(bid, actor.org?.tier ?? null, new Date(), actor.org?.id ?? null);
    if (!access.allowed) throw new ForbiddenError(access.reason || "no access to this bid");
  }
  const row = await q1<BidQuestionRow>(
    `insert into bid_questions (bid_id, asked_by_org_id, question)
       values ($1,$2,$3) returning *`,
    [bidId, actor.org?.id ?? null, question.trim()],
  );
  return row as BidQuestionRow;
}

/**
 * Owner answers a question. addendum=true promotes it to visibility='public'
 * (an addendum every current bidder can see); addendum=false keeps it
 * private to the asking vendor.
 */
export async function answerBidQuestion(
  actor: Actor,
  bidId: string,
  questionId: string,
  answer: string,
  addendum: boolean,
): Promise<BidQuestionRow> {
  const bid = await getBid(bidId);
  if (!(await actorOwnsBidEvent(actor, bid))) {
    throw new ForbiddenError("only the event owner can answer bid questions");
  }
  if (!answer?.trim()) throw new ForbiddenError("answer text is required");
  const row = await q1<BidQuestionRow>(
    `update bid_questions set
        answer = $3, answered_by = $4, answered_at = now(),
        visibility = case when $5 then 'public' else visibility end,
        is_addendum = is_addendum or $5
      where id = $1 and bid_id = $2
      returning *`,
    [questionId, bidId, answer.trim(), actor.user.id, addendum],
  );
  if (!row) throw new NotFoundError("question not found");
  return row;
}

/**
 * Every org that currently has a stake in this bid -- invited, asked a
 * question, or submitted a quote -- so an addendum reaches everyone working
 * off the original scope, not just the vendor who happened to ask.
 */
export async function addendumAudienceOrgIds(bidId: string): Promise<string[]> {
  const bid = await getBid(bidId);
  const invited = Array.isArray(bid.invited_vendors) ? (bid.invited_vendors as unknown[]).map(String) : [];
  const askers = await q<{ asked_by_org_id: string | null }>(
    `select distinct asked_by_org_id from bid_questions where bid_id = $1 and asked_by_org_id is not null`,
    [bidId],
  );
  const quoters = await q<{ organization_id: string | null }>(
    `select distinct v.organization_id
       from quotes q join vendors v on v.id = q.vendor_id
      where q.bid_id = $1 and v.organization_id is not null`,
    [bidId],
  );
  return Array.from(
    new Set([
      ...invited,
      ...askers.map((r) => r.asked_by_org_id).filter((x): x is string => !!x),
      ...quoters.map((r) => r.organization_id).filter((x): x is string => !!x),
    ]),
  );
}

/**
 * Questions on a bid. Owner sees every question (public + private). A
 * vendor org sees every public question/addendum plus only its own private
 * ones -- never another vendor's still-private question.
 */
export async function listBidQuestions(actor: Actor, bidId: string): Promise<BidQuestionRow[]> {
  const bid = await getBid(bidId);
  const isOwner = await actorOwnsBidEvent(actor, bid);
  if (isOwner) {
    return q<BidQuestionRow>(`select * from bid_questions where bid_id = $1 order by created_at asc`, [bidId]);
  }
  return q<BidQuestionRow>(
    `select * from bid_questions
       where bid_id = $1 and (visibility = 'public' or asked_by_org_id = $2)
       order by created_at asc`,
    [bidId, actor.org?.id ?? null],
  );
}
