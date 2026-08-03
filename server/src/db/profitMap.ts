/**
 * Divini Profit Map (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 5). Generalizes the earlier, Vendor-only "margin tracking" build:
 * revenue now comes from BOTH the marketplace quote flow (Vendor/Supplier,
 * unchanged from the original build) and Divini Proposal Studio (every
 * role that runs Pipeline/Scope Builder/Proposal Studio -- Venue, Vendor,
 * Supplier, Planner, Sponsor). One merged report, one shared engine (spec
 * constraint 10), not a separate feature per source.
 *
 * A true cost is recorded per job in a cost table kept deliberately separate
 * from `quotes`/`proposals` (`quote_costs`, `proposal_costs`) so a
 * client-facing read path can never leak the org's private cost data.
 *
 * Plan entitlement per spec section 18: "Plus: ... basic Profit Map." Basic
 * access (the report + cost entry) is Plus+, not Pro-only as the original
 * pre-spec build had it -- corrected here to match the spec.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { isPlusTier, featureLockedPayload } from "../lib/entitlements.js";

export class FeatureLockedError extends Error {
  status = 403;
  payload: ReturnType<typeof featureLockedPayload>;
  constructor(actor: Actor) {
    super("Divini Profit Map is a Plus feature");
    this.name = "FeatureLockedError";
    this.payload = featureLockedPayload(actor.org ?? { tier: null, type: null }, "Divini Profit Map", "partner");
  }
}

function requirePlus(actor: Actor): void {
  if (!actor.org || !isPlusTier(actor.org)) throw new FeatureLockedError(actor);
}

type QuoteStub = { id: string; vendor_id: string | null; subtotal: string | null; status: string | null };

/** IDOR gate: the acting org must own the quote's vendor record. */
async function assertVendorOwnsQuote(actor: Actor, quoteId: string): Promise<QuoteStub> {
  const quote = await q1<QuoteStub>(
    `select id, vendor_id, subtotal, status from quotes where id = $1`,
    [quoteId],
  );
  if (!quote) throw new NotFoundError("quote not found");
  if (!actor.org || !quote.vendor_id) throw new ForbiddenError("not your quote");
  const owns = await q1<{ id: string }>(
    `select id from vendors where id = $1 and organization_id = $2`,
    [quote.vendor_id, actor.org.id],
  );
  if (!owns) throw new ForbiddenError("not your quote");
  return quote;
}

/** IDOR gate: the acting org must own the proposal. */
async function assertOwnsProposal(actor: Actor, proposalId: string): Promise<{ id: string; organization_id: string; status: string }> {
  const proposal = await q1<{ id: string; organization_id: string; status: string }>(
    `select id, organization_id, status from proposals where id = $1`,
    [proposalId],
  );
  if (!proposal) throw new NotFoundError("proposal not found");
  if (!actor.org || proposal.organization_id !== actor.org.id) throw new ForbiddenError("not your proposal");
  return proposal;
}

export type QuoteCostRow = {
  quote_id: string;
  organization_id: string;
  cost_amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Record (or update) the true cost of a won marketplace-quote job. Plus+. */
export async function setQuoteCost(
  actor: Actor,
  quoteId: string,
  costAmount: number,
  notes?: string | null,
): Promise<QuoteCostRow> {
  requirePlus(actor);
  await assertVendorOwnsQuote(actor, quoteId);
  if (!Number.isFinite(costAmount) || costAmount < 0) {
    throw new Error("cost_amount must be a non-negative number");
  }
  return (await q1<QuoteCostRow>(
    `insert into quote_costs (quote_id, organization_id, cost_amount, notes)
       values ($1, $2, $3, $4)
     on conflict (quote_id) do update set
       cost_amount = excluded.cost_amount,
       notes = excluded.notes,
       updated_at = now()
     returning *`,
    [quoteId, actor.org!.id, costAmount, notes ?? null],
  )) as QuoteCostRow;
}

/** The recorded cost for one quote, or null if none has been entered yet. Plus+. */
export async function getQuoteCost(actor: Actor, quoteId: string): Promise<QuoteCostRow | null> {
  requirePlus(actor);
  await assertVendorOwnsQuote(actor, quoteId);
  return q1<QuoteCostRow>(`select * from quote_costs where quote_id = $1`, [quoteId]);
}

export type ProposalCostRow = {
  proposal_id: string;
  organization_id: string;
  cost_amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Record (or update) the true cost of an accepted Proposal Studio job. Plus+. */
export async function setProposalCost(
  actor: Actor,
  proposalId: string,
  costAmount: number,
  notes?: string | null,
): Promise<ProposalCostRow> {
  requirePlus(actor);
  await assertOwnsProposal(actor, proposalId);
  if (!Number.isFinite(costAmount) || costAmount < 0) {
    throw new Error("cost_amount must be a non-negative number");
  }
  return (await q1<ProposalCostRow>(
    `insert into proposal_costs (proposal_id, organization_id, cost_amount, notes)
       values ($1, $2, $3, $4)
     on conflict (proposal_id) do update set
       cost_amount = excluded.cost_amount,
       notes = excluded.notes,
       updated_at = now()
     returning *`,
    [proposalId, actor.org!.id, costAmount, notes ?? null],
  )) as ProposalCostRow;
}

/** The recorded cost for one proposal, or null if none has been entered yet. Plus+. */
export async function getProposalCost(actor: Actor, proposalId: string): Promise<ProposalCostRow | null> {
  requirePlus(actor);
  await assertOwnsProposal(actor, proposalId);
  return q1<ProposalCostRow>(`select * from proposal_costs where proposal_id = $1`, [proposalId]);
}

export type ProfitMapJob = {
  job_id: string;
  source: "quote" | "proposal";
  label: string;
  client_name: string | null;
  event_id: string | null;
  status: string | null;
  revenue: number;
  cost: number | null;
  margin: number | null;
  margin_pct: number | null;
  created_at: string;
};

export type ProfitMapReport = {
  jobs: ProfitMapJob[];
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number | null;
  costRecordedCount: number;
  jobCount: number;
};

function withMargin(revenue: number, costAmount: string | null): { cost: number | null; margin: number | null; margin_pct: number | null } {
  const cost = costAmount != null ? Number(costAmount) : null;
  const margin = cost != null ? revenue - cost : null;
  const margin_pct = cost != null && revenue > 0 ? margin! / revenue : null;
  return { cost, margin, margin_pct };
}

/**
 * Revenue/cost/margin across the org's won jobs, merged from two real
 * sources: marketplace quotes (accepted/converted, Vendor/Supplier only --
 * naturally empty for other roles, no role check needed since the join
 * requires an owned `vendors` row) and Divini Proposal Studio proposals
 * (accepted, every role). Jobs with no recorded cost contribute revenue but
 * are excluded from cost/margin totals (an unentered cost is "unknown," not
 * zero) and are counted in the returned coverage. Plus+.
 */
export async function getProfitMapReport(actor: Actor, months = 12): Promise<ProfitMapReport> {
  requirePlus(actor);
  const orgId = actor.org!.id;
  const win = Math.min(36, Math.max(1, Math.round(months)));

  const quoteRows = await q<{
    quote_id: string;
    event_id: string | null;
    status: string | null;
    subtotal: string | null;
    created_at: string;
    cost_amount: string | null;
  }>(
    `select q.id as quote_id, q.event_id, q.status, q.subtotal, q.created_at, qc.cost_amount
       from quotes q
       join vendors v on v.id = q.vendor_id
       left join quote_costs qc on qc.quote_id = q.id
      where v.organization_id = $1
        and q.status in ('accepted','converted')
        and q.created_at >= now() - ($2 || ' months')::interval
      order by q.created_at desc
      limit 500`,
    [orgId, win],
  );

  const proposalRows = await q<{
    proposal_id: string;
    title: string;
    client_name: string | null;
    opportunity_id: string | null;
    status: string;
    discount_cents: string;
    tax_cents: string;
    responded_at: string;
    cost_amount: string | null;
    subtotal_cents: string;
  }>(
    `select p.id as proposal_id, p.title, p.client_name, p.opportunity_id, p.status,
            p.discount_cents, p.tax_cents, p.responded_at, pc.cost_amount,
            coalesce(sum(li.quantity * li.unit_price_cents), 0) as subtotal_cents
       from proposals p
       left join proposal_costs pc on pc.proposal_id = p.id
       left join proposal_line_items li on li.proposal_id = p.id
      where p.organization_id = $1
        and p.status = 'accepted'
        and p.responded_at >= now() - ($2 || ' months')::interval
      group by p.id, pc.cost_amount
      order by p.responded_at desc
      limit 500`,
    [orgId, win],
  );

  const quoteJobs: ProfitMapJob[] = quoteRows.map((r) => {
    const revenue = Number(r.subtotal) || 0;
    const { cost, margin, margin_pct } = withMargin(revenue, r.cost_amount);
    return {
      job_id: r.quote_id,
      source: "quote",
      label: "Marketplace quote",
      client_name: null,
      event_id: r.event_id,
      status: r.status,
      revenue,
      cost,
      margin,
      margin_pct,
      created_at: r.created_at,
    };
  });

  const proposalJobs: ProfitMapJob[] = proposalRows.map((r) => {
    const subtotal = Number(r.subtotal_cents) || 0;
    const total = Math.max(0, subtotal - Number(r.discount_cents) + Number(r.tax_cents));
    const revenue = total / 100;
    const { cost, margin, margin_pct } = withMargin(revenue, r.cost_amount);
    return {
      job_id: r.proposal_id,
      source: "proposal",
      label: r.title,
      client_name: r.client_name,
      event_id: r.opportunity_id,
      status: r.status,
      revenue,
      cost,
      margin,
      margin_pct,
      created_at: r.responded_at,
    };
  });

  const jobs = [...quoteJobs, ...proposalJobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalRevenue = jobs.reduce((sum, j) => sum + j.revenue, 0);
  const costed = jobs.filter((j) => j.cost != null);
  const totalCost = costed.reduce((sum, j) => sum + (j.cost ?? 0), 0);
  const costedRevenue = costed.reduce((sum, j) => sum + j.revenue, 0);
  const totalMargin = costedRevenue - totalCost;

  return {
    jobs,
    totalRevenue,
    totalCost,
    totalMargin,
    marginPct: costedRevenue > 0 ? totalMargin / costedRevenue : null,
    costRecordedCount: costed.length,
    jobCount: jobs.length,
  };
}
