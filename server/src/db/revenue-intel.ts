/**
 * Divini AI COO V2 - Revenue Intelligence data-access.
 *
 * Gathers monthly historical aggregates for an organization from the existing
 * tables and feeds them to the pure engines (lib/revenueIntel.ts trends +
 * lib/forecasting.ts forecast). All reads are ORG-SCOPED: every aggregate is
 * filtered by the acting organization's id so one org can never read another
 * org's revenue (IDOR-safe). Admins are NOT special-cased here; this is the
 * acting org's own executive view.
 *
 * Tables aggregated (confirmed against db/schema.sql + phase / vi files):
 *   - events                    (organization_id, type, status, created_at)
 *       -> events created, bookings (won states), open pipeline value, category mix
 *   - quotes (via vendors)      (vendor_id -> vendors.organization_id, status, created_at)
 *       -> quotes submitted, quotes accepted (win rate), distinct vendor demand
 *   - invoices                  (organization_id, total, created_at)         [pipeline fallback]
 *   - payments (via invoices)   (invoice_id -> invoices.organization_id, amount, created_at)
 *       -> recognized revenue
 *   - sponsorship_opportunities (organization_id, status, created_at)
 *       -> sponsor demand
 *   - venues + events           (venue_id)                                   -> occupancy proxy
 *
 * The SQL builds a per-month series for the trailing N months (default 12) so
 * the pure engines see a dense, gap-filled series (months with no activity are
 * zero-filled) which keeps the moving-average / seasonality math stable.
 */
import { q } from "../pool.js";
import { type Actor } from "../db.js";
import {
  computeTrends,
  type RevenueSeriesPoint,
  type TrendsResult,
} from "../lib/revenueIntel.js";
import {
  forecast,
  type ForecastHistoryPoint,
  type ForecastResult,
} from "../lib/forecasting.js";

/** Booking / won event statuses (revenue-recognizable pipeline outcomes). */
const WON_STATUSES = [
  "vendor_selected",
  "deposit_due",
  "in_production",
  "install_scheduled",
  "itinerary_confirmed",
  "event_day",
  "completed",
  "closed",
];

/** Open (not-yet-won, not-dead) statuses counted toward pipeline value. */
const OPEN_STATUSES = [
  "inquiry",
  "venue_reviewing",
  "venue_hold",
  "vendor_bidding",
  "quotes_received",
];

const DEFAULT_MONTHS = 12;

type MonthAgg = {
  period: string;
  revenue: number;
  quotesSubmitted: number;
  quotesAccepted: number;
  eventsCreated: number;
  bookings: number;
  vendorDemand: number;
  sponsorDemand: number;
  occBooked: number;
  occTotal: number;
  pipelineValue: number;
  categoryCounts: Record<string, number>;
};

function emptyMonth(period: string): MonthAgg {
  return {
    period,
    revenue: 0,
    quotesSubmitted: 0,
    quotesAccepted: 0,
    eventsCreated: 0,
    bookings: 0,
    vendorDemand: 0,
    sponsorDemand: 0,
    occBooked: 0,
    occTotal: 0,
    pipelineValue: 0,
    categoryCounts: {},
  };
}

/** Build the dense, zero-filled month key list for the trailing window. */
function monthKeys(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // Start at (months - 1) months ago, walk to current month inclusive.
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.push(`${yy}-${mm}`);
  }
  return out;
}

/**
 * Run all org-scoped monthly aggregations and merge them into a dense series.
 * Each query is independently org-filtered; results are keyed by month.
 */
async function gatherMonthly(orgId: string, months: number): Promise<MonthAgg[]> {
  const keys = monthKeys(months);
  const byMonth = new Map<string, MonthAgg>();
  for (const k of keys) byMonth.set(k, emptyMonth(k));
  const interval = `${months} months`;

  // 1. Recognized revenue: payments on invoices issued by this org.
  const revRows = await q<{ period: string; revenue: string }>(
    `select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as period,
            coalesce(sum(p.amount), 0) as revenue
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.organization_id = $1
        and p.created_at >= date_trunc('month', now()) - $2::interval
        and coalesce(p.status, '') not in ('refunded', 'failed')
      group by 1`,
    [orgId, interval],
  );
  for (const r of revRows) {
    const m = byMonth.get(r.period);
    if (m) m.revenue = Number(r.revenue) || 0;
  }

  // 2. Events: created count, bookings (won), pipeline value, category mix.
  const evRows = await q<{
    period: string;
    created: string;
    bookings: string;
    pipeline: string;
    type: string | null;
    type_count: string;
  }>(
    `select to_char(date_trunc('month', e.created_at), 'YYYY-MM') as period,
            count(*) as created,
            count(*) filter (where e.status = any($3)) as bookings,
            coalesce(sum(e.budget) filter (where e.status = any($4)), 0) as pipeline,
            coalesce(e.type, 'uncategorized') as type,
            count(*) as type_count
       from events e
      where e.organization_id = $1
        and e.created_at >= date_trunc('month', now()) - $2::interval
      group by 1, e.type`,
    [orgId, interval, WON_STATUSES, OPEN_STATUSES],
  );
  // The group-by-type expands rows; fold them back per month.
  for (const r of evRows) {
    const m = byMonth.get(r.period);
    if (!m) continue;
    const cat = r.type || "uncategorized";
    m.categoryCounts[cat] = (m.categoryCounts[cat] ?? 0) + (Number(r.type_count) || 0);
  }
  // Month-level totals (created / bookings / pipeline) without the type fan-out.
  const evTotals = await q<{
    period: string;
    created: string;
    bookings: string;
    pipeline: string;
  }>(
    `select to_char(date_trunc('month', e.created_at), 'YYYY-MM') as period,
            count(*) as created,
            count(*) filter (where e.status = any($3)) as bookings,
            coalesce(sum(e.budget) filter (where e.status = any($4)), 0) as pipeline
       from events e
      where e.organization_id = $1
        and e.created_at >= date_trunc('month', now()) - $2::interval
      group by 1`,
    [orgId, interval, WON_STATUSES, OPEN_STATUSES],
  );
  for (const r of evTotals) {
    const m = byMonth.get(r.period);
    if (!m) continue;
    m.eventsCreated = Number(r.created) || 0;
    m.bookings = Number(r.bookings) || 0;
    m.pipelineValue = Number(r.pipeline) || 0;
  }

  // 3. Quotes (scoped via the quoting vendor's org): submitted, accepted,
  //    distinct vendor demand.
  const acceptedStatuses = ["accepted", "converted"];
  const submittedStatuses = ["submitted", "viewed", "revision_requested", "revised", "accepted", "declined", "expired", "converted"];
  const quoteRows = await q<{
    period: string;
    submitted: string;
    accepted: string;
    vendor_demand: string;
  }>(
    `select to_char(date_trunc('month', qt.created_at), 'YYYY-MM') as period,
            count(*) filter (where qt.status = any($4)) as submitted,
            count(*) filter (where qt.status = any($3)) as accepted,
            count(distinct qt.vendor_id) as vendor_demand
       from quotes qt
       join vendors v on v.id = qt.vendor_id
      where v.organization_id = $1
        and qt.created_at >= date_trunc('month', now()) - $2::interval
      group by 1`,
    [orgId, interval, acceptedStatuses, submittedStatuses],
  );
  for (const r of quoteRows) {
    const m = byMonth.get(r.period);
    if (!m) continue;
    m.quotesSubmitted = Number(r.submitted) || 0;
    m.quotesAccepted = Number(r.accepted) || 0;
    m.vendorDemand = Number(r.vendor_demand) || 0;
  }

  // 4. Sponsorship demand: opportunities owned by this org, by creation month.
  const sponsorRows = await q<{ period: string; demand: string }>(
    `select to_char(date_trunc('month', so.created_at), 'YYYY-MM') as period,
            count(*) as demand
       from sponsorship_opportunities so
      where so.organization_id = $1
        and so.created_at >= date_trunc('month', now()) - $2::interval
      group by 1`,
    [orgId, interval],
  );
  for (const r of sponsorRows) {
    const m = byMonth.get(r.period);
    if (m) m.sponsorDemand = Number(r.demand) || 0;
  }

  // 5. Venue occupancy proxy: of this org's venues, the share with at least one
  //    event in the month (booked) vs total venues. Computed per month from the
  //    events table joined to the org's venues.
  const occRows = await q<{ period: string; booked: string }>(
    `select to_char(date_trunc('month', e.created_at), 'YYYY-MM') as period,
            count(distinct e.venue_id) as booked
       from events e
       join venues vn on vn.id = e.venue_id
      where vn.organization_id = $1
        and e.created_at >= date_trunc('month', now()) - $2::interval
      group by 1`,
    [orgId, interval],
  );
  const venueCountRow = await q<{ total: string }>(
    `select count(*) as total from venues where organization_id = $1`,
    [orgId],
  );
  const totalVenues = Number(venueCountRow[0]?.total) || 0;
  for (const r of occRows) {
    const m = byMonth.get(r.period);
    if (!m) continue;
    m.occBooked = Number(r.booked) || 0;
    m.occTotal = totalVenues;
  }

  return keys.map((k) => byMonth.get(k) as MonthAgg);
}

function toRevenueSeries(agg: MonthAgg[]): RevenueSeriesPoint[] {
  return agg.map((m) => ({
    period: m.period,
    revenue: m.revenue,
    quotesSubmitted: m.quotesSubmitted,
    quotesAccepted: m.quotesAccepted,
    eventsCreated: m.eventsCreated,
    bookings: m.bookings,
    categoryCounts: m.categoryCounts,
  }));
}

function toForecastHistory(agg: MonthAgg[]): ForecastHistoryPoint[] {
  return agg.map((m) => ({
    period: m.period,
    revenue: m.revenue,
    bookings: m.bookings,
    vendorDemand: m.vendorDemand,
    sponsorDemand: m.sponsorDemand,
    venueOccupancy: m.occTotal > 0 ? Math.min(1, m.occBooked / m.occTotal) : 0,
    pipelineValue: m.pipelineValue,
  }));
}

/** True when the series carries any non-zero signal (else graceful empty UI). */
function hasSignal(agg: MonthAgg[]): boolean {
  return agg.some(
    (m) =>
      m.revenue > 0 ||
      m.eventsCreated > 0 ||
      m.quotesSubmitted > 0 ||
      m.bookings > 0 ||
      m.sponsorDemand > 0,
  );
}

export type TrendsPayload = TrendsResult & { orgId: string; window: number };
export type ForecastPayload = ForecastResult & { orgId: string; window: number };

/** Compute trend insights for the acting org (org-scoped, IDOR-safe). */
export async function getTrendsForActor(
  actor: Actor,
  months = DEFAULT_MONTHS,
): Promise<TrendsPayload> {
  const orgId = actor.org?.id ?? null;
  if (!orgId) {
    const empty = computeTrends([]);
    return { ...empty, orgId: "", window: months };
  }
  const agg = await gatherMonthly(orgId, months);
  if (!hasSignal(agg)) {
    const empty = computeTrends([]);
    return { ...empty, orgId, window: months };
  }
  const result = computeTrends(toRevenueSeries(agg));
  return { ...result, orgId, window: months };
}

/** Compute the deterministic forecast for the acting org (org-scoped). */
export async function getForecastForActor(
  actor: Actor,
  months = DEFAULT_MONTHS,
): Promise<ForecastPayload> {
  const orgId = actor.org?.id ?? null;
  if (!orgId) {
    const empty = forecast([]);
    return { ...empty, orgId: "", window: months };
  }
  const agg = await gatherMonthly(orgId, months);
  if (!hasSignal(agg)) {
    const empty = forecast([]);
    return { ...empty, orgId, window: months };
  }
  const result = forecast(toForecastHistory(agg));
  return { ...result, orgId, window: months };
}

export const __test = { monthKeys, hasSignal, WON_STATUSES, OPEN_STATUSES };
