/**
 * Vendor Pro - job costing / margin tracking (see lib/planCatalog.ts's
 * "Margin tracking" + "Job costing" Vendor Pro bullets).
 *
 * A vendor records their true cost for a won job (an accepted/converted
 * quote) in `quote_costs`, a table deliberately separate from `quotes` so
 * the client-facing quote-read paths (`select * from quotes`, read by both
 * sides of a booking) can never leak the vendor's private cost data -- only
 * this module reads/writes quote_costs, and every entry point here is
 * IDOR-checked (the caller's org must own the quote's vendor) and Pro-gated.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { isTopTier, featureLockedPayload } from "../lib/entitlements.js";

export class FeatureLockedError extends Error {
  status = 403;
  payload: ReturnType<typeof featureLockedPayload>;
  constructor(actor: Actor) {
    super("Margin tracking is a Pro feature");
    this.name = "FeatureLockedError";
    this.payload = featureLockedPayload(actor.org ?? { tier: null, type: null }, "Margin tracking");
  }
}

function requirePro(actor: Actor): void {
  if (!actor.org || !isTopTier(actor.org)) throw new FeatureLockedError(actor);
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

export type QuoteCostRow = {
  quote_id: string;
  organization_id: string;
  cost_amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Record (or update) the true cost of a won job. Pro-only. */
export async function setQuoteCost(
  actor: Actor,
  quoteId: string,
  costAmount: number,
  notes?: string | null,
): Promise<QuoteCostRow> {
  requirePro(actor);
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

/** The recorded cost for one quote, or null if none has been entered yet. Pro-only. */
export async function getQuoteCost(actor: Actor, quoteId: string): Promise<QuoteCostRow | null> {
  requirePro(actor);
  await assertVendorOwnsQuote(actor, quoteId);
  return q1<QuoteCostRow>(`select * from quote_costs where quote_id = $1`, [quoteId]);
}

export type ProfitabilityJob = {
  quote_id: string;
  event_id: string | null;
  status: string | null;
  revenue: number;
  cost: number | null;
  margin: number | null;
  margin_pct: number | null;
  created_at: string;
};

export type ProfitabilityReport = {
  jobs: ProfitabilityJob[];
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number | null;
  costRecordedCount: number;
  jobCount: number;
};

/**
 * Revenue/cost/margin across the vendor org's won jobs (accepted/converted
 * quotes). Jobs with no recorded cost contribute revenue but are excluded
 * from cost/margin totals (an unentered cost is "unknown," not zero) and are
 * counted in the returned coverage (costRecordedCount / jobCount). Pro-only.
 */
export async function getProfitabilityReport(actor: Actor, months = 12): Promise<ProfitabilityReport> {
  requirePro(actor);
  const orgId = actor.org!.id;
  const win = Math.min(36, Math.max(1, Math.round(months)));

  const rows = await q<{
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

  const jobs: ProfitabilityJob[] = rows.map((r) => {
    const revenue = Number(r.subtotal) || 0;
    const cost = r.cost_amount != null ? Number(r.cost_amount) : null;
    const margin = cost != null ? revenue - cost : null;
    const marginPct = cost != null && revenue > 0 ? margin! / revenue : null;
    return {
      quote_id: r.quote_id,
      event_id: r.event_id,
      status: r.status,
      revenue,
      cost,
      margin,
      margin_pct: marginPct,
      created_at: r.created_at,
    };
  });

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
