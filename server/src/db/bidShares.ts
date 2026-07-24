/**
 * Shareable Bid Links - data layer.
 *
 * An organizer mints a public share link for a bid (regular or charity event),
 * hands it out in person, and a vendor/sponsor opens a public page, registers,
 * and submits. Owner-only management is IDOR-gated (the caller must own the
 * bid's event); the public reads expose only a whitelisted payload and never a
 * draft/closed bid.
 *
 * Deterministic, no AI. Zero em dashes.
 */
import { randomBytes } from "node:crypto";
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";

export type ShareAudience = "vendor" | "sponsor" | "any";
export type ShareFunnelKind = "view" | "register_start" | "registered" | "submitted";

export interface BidShareLinkRow {
  id: string;
  bid_id: string;
  event_id: string | null;
  token: string;
  label: string | null;
  audience: ShareAudience;
  created_by_org: string | null;
  created_by: string | null;
  is_active: boolean;
  view_count: number;
  register_count: number;
  submit_count: number;
  created_at: string;
}

function isAudience(v: unknown): v is ShareAudience {
  return v === "vendor" || v === "sponsor" || v === "any";
}

/** A URL-safe share token. */
function newToken(): string {
  return randomBytes(9).toString("base64url"); // ~12 chars, URL-safe
}

/** Throws ForbiddenError unless the actor owns the bid's event. */
async function assertOwnsBid(actor: Actor, bidId: string): Promise<{ event_id: string | null }> {
  const row = await q1<{ event_id: string | null }>(
    `select b.event_id
       from bids b
       join events e on e.id = b.event_id
      where b.id = $1
        and ($2 in ('super_admin','admin')
             or ($3::uuid is not null and e.organization_id = $3)
             or e.client_id = $4 or e.planner_id = $4)
      limit 1`,
    [bidId, actor.user.role ?? "", actor.org?.id ?? null, actor.user.id],
  );
  if (!row) throw new ForbiddenError("only the event owner can manage share links for this bid");
  return { event_id: row.event_id };
}

/** Create a share link for a bid (owner only). */
export async function createShareLink(
  actor: Actor,
  input: { bid_id: string; label?: string | null; audience?: string | null },
): Promise<BidShareLinkRow> {
  const { event_id } = await assertOwnsBid(actor, input.bid_id);
  const audience: ShareAudience = isAudience(input.audience) ? input.audience : "any";
  const row = await q1<BidShareLinkRow>(
    `insert into bid_share_links
       (bid_id, event_id, token, label, audience, created_by_org, created_by)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      input.bid_id,
      event_id,
      newToken(),
      input.label ?? null,
      audience,
      actor.org?.id ?? null,
      actor.user.id,
    ],
  );
  return row as BidShareLinkRow;
}

/**
 * Ensure a bid has at least one active share link, returning the existing one if
 * present. Used to auto-mint a default link when a bid is posted (best-effort).
 */
export async function ensureDefaultShareLink(
  actor: Actor,
  bidId: string,
): Promise<BidShareLinkRow> {
  const existing = await q1<BidShareLinkRow>(
    `select * from bid_share_links where bid_id = $1 and is_active = true
      order by created_at asc limit 1`,
    [bidId],
  );
  if (existing) return existing;
  return createShareLink(actor, { bid_id: bidId, audience: "any" });
}

/** List a bid's share links with funnel stats (owner only). */
export async function listShareLinks(actor: Actor, bidId: string): Promise<BidShareLinkRow[]> {
  await assertOwnsBid(actor, bidId);
  return q<BidShareLinkRow>(
    `select * from bid_share_links where bid_id = $1 order by created_at desc`,
    [bidId],
  );
}

/** Deactivate a share link (owner only). */
export async function deactivateShareLink(actor: Actor, id: string): Promise<void> {
  const link = await q1<{ bid_id: string }>(`select bid_id from bid_share_links where id = $1`, [id]);
  if (!link) throw new NotFoundError("share link not found");
  await assertOwnsBid(actor, link.bid_id);
  await q(`update bid_share_links set is_active = false where id = $1`, [id]);
}

/** The funnel log for a link (owner only). */
export async function listShareFunnel(
  actor: Actor,
  linkId: string,
): Promise<{ kind: string; actor_email: string | null; org_id: string | null; created_at: string }[]> {
  const link = await q1<{ bid_id: string }>(`select bid_id from bid_share_links where id = $1`, [linkId]);
  if (!link) throw new NotFoundError("share link not found");
  await assertOwnsBid(actor, link.bid_id);
  return q(
    `select kind, actor_email, org_id, created_at
       from bid_share_events where share_link_id = $1
      order by created_at desc limit 500`,
    [linkId],
  );
}

// ---- Public (no-auth) surface ----------------------------------------------

export interface PublicBidView {
  token: string;
  audience: ShareAudience;
  label: string | null;
  bid: {
    id: string;
    category: string | null;
    scope: string | null;
    budget_min: string | null;
    budget_max: string | null;
    deadline: string | null;
    status: string | null;
  };
  event: {
    id: string | null;
    name: string | null;
    date_time: string | null;
    organizer: string | null;
  };
  charity: { cause: string | null; fundraising_event_id: string | null } | null;
}

const PUBLIC_VISIBLE_BID_STATUSES = new Set([
  "posted",
  "invited",
  "reviewing",
  "questions",
  "quote_submitted",
  "clarification",
  "shortlisted",
]);

/**
 * Resolve the public payload for a share token, or null when the link is
 * inactive/unknown or the bid is not in a shareable state. Records a view.
 * Only whitelisted fields are exposed; no invited-vendor lists, no internals.
 */
export async function getPublicBidByToken(token: string): Promise<PublicBidView | null> {
  const link = await q1<BidShareLinkRow>(
    `select * from bid_share_links where token = $1 and is_active = true`,
    [token],
  );
  if (!link) return null;

  const bid = await q1<{
    id: string;
    event_id: string | null;
    category: string | null;
    scope: string | null;
    budget_min: string | null;
    budget_max: string | null;
    deadline: string | null;
    status: string | null;
  }>(
    `select id, event_id, category, scope, budget_min, budget_max, deadline, status
       from bids where id = $1`,
    [link.bid_id],
  );
  if (!bid || !bid.status || !PUBLIC_VISIBLE_BID_STATUSES.has(bid.status)) return null;

  const event = bid.event_id
    ? await q1<{ id: string; name: string | null; date_time: string | null; organizer: string | null }>(
        `select e.id, e.name, e.date_time, o.name as organizer
           from events e
           left join organizations o on o.id = e.organization_id
          where e.id = $1`,
        [bid.event_id],
      )
    : null;

  const charity = bid.event_id
    ? await q1<{ cause: string | null; fundraising_event_id: string }>(
        `select cause, id as fundraising_event_id
           from fundraising_events where event_id = $1 limit 1`,
        [bid.event_id],
      )
    : null;

  // Record the view (best-effort counter + log).
  await q(`update bid_share_links set view_count = view_count + 1 where id = $1`, [link.id]).catch(
    () => undefined,
  );
  await q(
    `insert into bid_share_events (share_link_id, kind) values ($1, 'view')`,
    [link.id],
  ).catch(() => undefined);

  return {
    token: link.token,
    audience: link.audience,
    label: link.label,
    bid: {
      id: bid.id,
      category: bid.category,
      scope: bid.scope,
      budget_min: bid.budget_min,
      budget_max: bid.budget_max,
      deadline: bid.deadline,
      status: bid.status,
    },
    event: {
      id: event?.id ?? null,
      name: event?.name ?? null,
      date_time: event?.date_time ?? null,
      organizer: event?.organizer ?? null,
    },
    charity: charity ? { cause: charity.cause, fundraising_event_id: charity.fundraising_event_id } : null,
  };
}

const FUNNEL_KINDS = new Set<ShareFunnelKind>([
  "view",
  "register_start",
  "registered",
  "submitted",
]);

/**
 * Public funnel tracking: the SPA fires register_start before redirecting to
 * signup, registered after onboarding, and submitted after a quote/interest is
 * sent. Increments the matching counter and appends to the log. Unknown tokens
 * or kinds are ignored (never throws to the public caller).
 */
export async function trackShareFunnel(
  token: string,
  kind: string,
  ctx?: { email?: string | null; org_id?: string | null; meta?: unknown },
): Promise<void> {
  if (!FUNNEL_KINDS.has(kind as ShareFunnelKind)) return;
  const link = await q1<{ id: string }>(
    `select id from bid_share_links where token = $1 and is_active = true`,
    [token],
  );
  if (!link) return;

  if (kind === "registered") {
    await q(`update bid_share_links set register_count = register_count + 1 where id = $1`, [link.id]);
  } else if (kind === "submitted") {
    await q(`update bid_share_links set submit_count = submit_count + 1 where id = $1`, [link.id]);
  }
  await q(
    `insert into bid_share_events (share_link_id, kind, actor_email, org_id, meta)
     values ($1,$2,$3,$4,$5)`,
    [
      link.id,
      kind,
      ctx?.email ?? null,
      ctx?.org_id ?? null,
      ctx?.meta != null ? JSON.stringify(ctx.meta) : null,
    ],
  );
}

// ---- Express interest leads -------------------------------------------------

export interface BidShareLeadRow {
  id: string;
  share_link_id: string | null;
  bid_id: string | null;
  event_id: string | null;
  party: ShareAudience;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  amount: string | null;
  created_at: string;
}

export interface LeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  amount?: number | null;
  party?: string | null;
}

/**
 * Public "express interest" capture. A sponsor or vendor raises a hand on the
 * shared bid page without an account yet. Resolves the active link by token
 * (mirrors trackShareFunnel), records a lead, bumps submit_count, and logs a
 * 'submitted' funnel event. Returns null when the token is inactive/unknown so
 * the caller can answer 404.
 */
export async function createLead(
  token: string,
  input: LeadInput,
): Promise<{ ok: true } | null> {
  const link = await q1<{ id: string; bid_id: string; event_id: string | null }>(
    `select id, bid_id, event_id from bid_share_links where token = $1 and is_active = true`,
    [token],
  );
  if (!link) return null;

  const party: ShareAudience = isAudience(input.party) ? input.party : "any";
  await q(
    `insert into bid_share_leads
       (share_link_id, bid_id, event_id, party, name, email, phone, message, amount)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      link.id,
      link.bid_id,
      link.event_id,
      party,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.message ?? null,
      input.amount ?? null,
    ],
  );

  await q(`update bid_share_links set submit_count = submit_count + 1 where id = $1`, [link.id]);
  await q(
    `insert into bid_share_events (share_link_id, kind, actor_email, meta)
     values ($1,'submitted',$2,$3)`,
    [
      link.id,
      input.email ?? null,
      JSON.stringify({
        party,
        name: input.name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        message: input.message ?? null,
        amount: input.amount ?? null,
      }),
    ],
  );

  return { ok: true };
}

/** List the express-interest leads for a bid (owner only, IDOR-gated). */
export async function listLeads(actor: Actor, bidId: string): Promise<BidShareLeadRow[]> {
  await assertOwnsBid(actor, bidId);
  return q<BidShareLeadRow>(
    `select * from bid_share_leads where bid_id = $1 order by created_at desc limit 500`,
    [bidId],
  );
}
