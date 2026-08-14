/**
 * Procurement + vendor pipeline views (front-half completion pass,
 * 2026-08-10). Nothing previously gave an organizer a single view of where
 * each scope stands (draft -> published -> bidding -> negotiating ->
 * awarded -> contracted), nor a vendor a single view of their own
 * opportunities across every event. Both are pure aggregations over the
 * real bids/quotes/quote_messages/event_vendor_contracts tables built
 * earlier this pass -- no new state, no fabricated status.
 *
 * Zero em dashes.
 */
import { q } from "../pool.js";
import { type Actor, ForbiddenError } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";

export type PipelineStage =
  | "draft"
  | "published"
  | "bidding"
  | "negotiating"
  | "awarded"
  | "contracted"
  | "closed";

export type ProcurementPipelineRow = {
  bid_id: string;
  category: string | null;
  scope: string | null;
  bid_status: string | null;
  budget_min: string | null;
  budget_max: string | null;
  quotes_count: number;
  stage: PipelineStage;
  awarded_vendor_name: string | null;
  next_action: string;
};

function deriveStage(
  bidStatus: string | null,
  quotesCount: number,
  hasOpenCounteroffer: boolean,
  hasRevisionRequested: boolean,
  hasContract: boolean,
): PipelineStage {
  if (hasContract) return "contracted";
  if (bidStatus === "awarded") return "awarded";
  if (bidStatus === "declined" || bidStatus === "expired" || bidStatus === "closed") return "closed";
  if (bidStatus === "draft") return "draft";
  if (hasOpenCounteroffer || hasRevisionRequested) return "negotiating";
  if (quotesCount > 0) return "bidding";
  return "published";
}

function nextActionFor(stage: PipelineStage, quotesCount: number): string {
  switch (stage) {
    case "draft":
      return "Publish this bid package";
    case "published":
      return quotesCount === 0 ? "Invite vendors or wait for quotes" : "Review incoming quotes";
    case "bidding":
      return "Compare quotes";
    case "negotiating":
      return "Respond to the open counteroffer or revision request";
    case "awarded":
      return "Award will create a contract automatically";
    case "contracted":
      return "Vendor is connected to the event";
    case "closed":
      return "No action needed";
  }
}

/**
 * The event owner's procurement pipeline: one row per bid on the event,
 * with a derived stage and quote count. Owner/planner only, same
 * authorization as listEventBids.
 */
export async function getEventProcurementPipeline(actor: Actor, eventId: string): Promise<ProcurementPipelineRow[]> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can view the procurement pipeline");
  }
  const bids = await q<{
    id: string;
    category: string | null;
    scope: string | null;
    status: string | null;
    budget_min: string | null;
    budget_max: string | null;
  }>(`select id, category, scope, status, budget_min, budget_max from bids where event_id = $1 order by created_at desc`, [
    eventId,
  ]);
  if (bids.length === 0) return [];
  const bidIds = bids.map((b) => b.id);

  const quoteCounts = await q<{ bid_id: string; c: string }>(
    `select bid_id, count(*)::int as c from quotes where bid_id = any($1::uuid[]) group by bid_id`,
    [bidIds],
  );
  const countByBid = new Map(quoteCounts.map((r) => [r.bid_id, Number(r.c)]));

  const openCounters = await q<{ bid_id: string }>(
    `select distinct q.bid_id
       from quote_messages m
       join quotes q on q.id = m.quote_id
      where q.bid_id = any($1::uuid[]) and m.counter_status = 'open'`,
    [bidIds],
  );
  const counterBids = new Set(openCounters.map((r) => r.bid_id));

  const revisionRequested = await q<{ bid_id: string }>(
    `select bid_id from quotes where bid_id = any($1::uuid[]) and status = 'revision_requested'`,
    [bidIds],
  );
  const revisionBids = new Set(revisionRequested.map((r) => r.bid_id));

  const contracts = await q<{ bid_id: string; vendor_org_id: string | null; vendor_name: string | null }>(
    `select c.bid_id, c.vendor_org_id, o.name as vendor_name
       from event_vendor_contracts c
       left join organizations o on o.id = c.vendor_org_id
      where c.bid_id = any($1::uuid[]) and c.status = 'active'`,
    [bidIds],
  );
  const contractByBid = new Map(contracts.map((r) => [r.bid_id, r.vendor_name]));

  return bids.map((b) => {
    const quotesCount = countByBid.get(b.id) ?? 0;
    const hasContract = contractByBid.has(b.id);
    const stage = deriveStage(b.status, quotesCount, counterBids.has(b.id), revisionBids.has(b.id), hasContract);
    return {
      bid_id: b.id,
      category: b.category,
      scope: b.scope,
      bid_status: b.status,
      budget_min: b.budget_min,
      budget_max: b.budget_max,
      quotes_count: quotesCount,
      stage,
      awarded_vendor_name: contractByBid.get(b.id) ?? null,
      next_action: nextActionFor(stage, quotesCount),
    };
  });
}

export type VendorPipelineOpportunity = {
  bid_id: string;
  event_id: string;
  event_name: string | null;
  category: string | null;
  scope: string | null;
  status: "invited" | "quoted" | "negotiating" | "awarded" | "lost" | "closed";
  quote_id: string | null;
  quote_total: string | null;
};

/**
 * A vendor org's pipeline across every event: every quote they have ever
 * submitted (real state, not a fabricated status), plus every bid they are
 * currently invited to but have not yet quoted on.
 */
export async function getVendorPipeline(actor: Actor): Promise<VendorPipelineOpportunity[]> {
  const orgId = actor.org?.id;
  if (!orgId) return [];
  const vendorIds = await q<{ id: string }>(`select id from vendors where organization_id = $1`, [orgId]);
  const vendorIdList = vendorIds.map((v) => v.id);

  const quoted: VendorPipelineOpportunity[] = vendorIdList.length
    ? await q<VendorPipelineOpportunity>(
        `select q.bid_id, q.event_id, e.name as event_name, b.category, b.scope,
                case
                  when q.status = 'accepted' then 'awarded'
                  when q.status = 'declined' then 'lost'
                  when q.status in ('revision_requested') then 'negotiating'
                  else 'quoted'
                end as status,
                q.id as quote_id, q.total as quote_total
           from quotes q
           left join events e on e.id = q.event_id
           left join bids b on b.id = q.bid_id
          where q.vendor_id = any($1::uuid[])
          order by q.created_at desc`,
        [vendorIdList],
      )
    : [];
  const quotedBidIds = new Set(quoted.map((r) => r.bid_id).filter(Boolean));

  // Invited-but-not-yet-quoted: private bids listing this org in invited_vendors.
  const invited = await q<{ id: string; event_id: string; event_name: string | null; category: string | null; scope: string | null }>(
    `select b.id, b.event_id, e.name as event_name, b.category, b.scope
       from bids b
       left join events e on e.id = b.event_id
      where b.status in ('posted','invited') and b.invited_vendors @> to_jsonb($1::text)`,
    [orgId],
  );
  const invitedRows: VendorPipelineOpportunity[] = invited
    .filter((r) => !quotedBidIds.has(r.id))
    .map((r) => ({
      bid_id: r.id,
      event_id: r.event_id,
      event_name: r.event_name,
      category: r.category,
      scope: r.scope,
      status: "invited" as const,
      quote_id: null,
      quote_total: null,
    }));

  return [...invitedRows, ...quoted];
}
