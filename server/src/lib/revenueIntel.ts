/**
 * Divini AI COO V2 - Revenue Intelligence Engine (pure, deterministic).
 *
 * Given a monthly historical series gathered from events / quotes / invoices /
 * payments (see server/src/db/revenue-intel.ts), computeTrends() derives a set
 * of executive trend insights:
 *   - revenue up / down %            (most recent month vs prior month)
 *   - quote volume change            (quotes submitted)
 *   - booking conversion trend       (events that converted to bookings)
 *   - win rate                       (quotes accepted / quotes submitted)
 *   - average deal size              (revenue per booking)
 *   - emerging categories            (event types whose share is growing)
 *
 * Each insight carries a human label, a direction (up / down / flat), and a
 * magnitude (the signed percentage or absolute delta) so the UI can render it
 * without further interpretation. No DB calls, no network, no AI. Same inputs
 * always produce the same output. The seam for an optional AI narrative summary
 * is marked below but intentionally NOT implemented (deterministic-first).
 */

/** One month of aggregated figures. Months are sorted oldest -> newest. */
export type RevenueSeriesPoint = {
  /** Month key, e.g. "2026-06". */
  period: string;
  /** Recognized revenue for the month (sum of payments received). */
  revenue: number;
  /** Quotes submitted in the month. */
  quotesSubmitted: number;
  /** Quotes accepted / converted in the month. */
  quotesAccepted: number;
  /** Events created in the month (pipeline opened). */
  eventsCreated: number;
  /** Events that reached a booked / won state in the month. */
  bookings: number;
  /** Event-type -> count for events created in the month. */
  categoryCounts?: Record<string, number>;
};

export type Direction = "up" | "down" | "flat";

export type TrendInsight = {
  key: string;
  label: string;
  direction: Direction;
  /** Signed magnitude. For "%"-unit insights this is a percent (e.g. -12.5). */
  magnitude: number;
  unit: "%" | "count" | "currency" | "ratio";
  /** Pre-formatted one-line detail for the UI. */
  detail: string;
};

export type TrendsResult = {
  /** True when there is at least one month of usable data. */
  hasData: boolean;
  /** Number of months in the series. */
  months: number;
  insights: TrendInsight[];
  /** Emerging event categories (growing share), most-emergent first. */
  emergingCategories: { category: string; recent: number; prior: number; deltaPct: number }[];
};

const FLAT_BAND = 0.5; // percentage points within which a change is "flat"

function dir(deltaPct: number): Direction {
  if (deltaPct > FLAT_BAND) return "up";
  if (deltaPct < -FLAT_BAND) return "down";
  return "flat";
}

/** Percent change from a -> b, guarding divide-by-zero. */
function pctChange(prev: number, curr: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return round1(((curr - prev) / Math.abs(prev)) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number): string {
  const s = n > 0 ? "+" : "";
  return `${s}${round1(n)}%`;
}

/**
 * Compute trend insights from a monthly series (oldest -> newest). Robust to a
 * short series: with a single month it still reports levels (direction "flat"),
 * with zero months it returns hasData=false for a graceful empty state.
 */
export function computeTrends(series: RevenueSeriesPoint[]): TrendsResult {
  const months = series.length;
  if (months === 0) {
    return { hasData: false, months: 0, insights: [], emergingCategories: [] };
  }

  const last = series[months - 1];
  const prev = months >= 2 ? series[months - 2] : null;

  const insights: TrendInsight[] = [];

  // 1. Revenue up / down %
  {
    const p = prev?.revenue ?? 0;
    const c = last.revenue;
    const delta = prev ? pctChange(p, c) : 0;
    insights.push({
      key: "revenue",
      label: "Revenue",
      direction: prev ? dir(delta) : "flat",
      magnitude: delta,
      unit: "%",
      detail: prev
        ? `${fmtMoney(c)} this month vs ${fmtMoney(p)} prior (${fmtPct(delta)})`
        : `${fmtMoney(c)} this month`,
    });
  }

  // 2. Quote volume change
  {
    const p = prev?.quotesSubmitted ?? 0;
    const c = last.quotesSubmitted;
    const delta = prev ? pctChange(p, c) : 0;
    insights.push({
      key: "quote_volume",
      label: "Quote volume",
      direction: prev ? dir(delta) : "flat",
      magnitude: delta,
      unit: "%",
      detail: prev
        ? `${c} quotes this month vs ${p} prior (${fmtPct(delta)})`
        : `${c} quotes this month`,
    });
  }

  // 3. Booking conversion trend (bookings / events created), monthly direction
  {
    const cConv = last.eventsCreated > 0 ? last.bookings / last.eventsCreated : 0;
    const pConv = prev && prev.eventsCreated > 0 ? prev.bookings / prev.eventsCreated : 0;
    const delta = prev ? round1((cConv - pConv) * 100) : 0; // in percentage points
    insights.push({
      key: "booking_conversion",
      label: "Booking conversion",
      direction: prev ? dir(delta) : "flat",
      magnitude: delta,
      unit: "%",
      detail: prev
        ? `${round1(cConv * 100)}% of events booked this month vs ${round1(pConv * 100)}% prior`
        : `${round1(cConv * 100)}% of events booked this month`,
    });
  }

  // 4. Win rate (quotes accepted / quotes submitted) - trailing across series
  {
    const subTot = series.reduce((a, s) => a + s.quotesSubmitted, 0);
    const accTot = series.reduce((a, s) => a + s.quotesAccepted, 0);
    const winRate = subTot > 0 ? round1((accTot / subTot) * 100) : 0;
    // direction = this month's win rate vs prior month's
    const cWin = last.quotesSubmitted > 0 ? last.quotesAccepted / last.quotesSubmitted : 0;
    const pWin = prev && prev.quotesSubmitted > 0 ? prev.quotesAccepted / prev.quotesSubmitted : 0;
    const delta = prev ? round1((cWin - pWin) * 100) : 0;
    insights.push({
      key: "win_rate",
      label: "Win rate",
      direction: prev ? dir(delta) : "flat",
      magnitude: winRate,
      unit: "%",
      detail: `${winRate}% of quotes accepted overall (${accTot}/${subTot})`,
    });
  }

  // 5. Average deal size (revenue / bookings), this month vs prior
  {
    const cAvg = last.bookings > 0 ? last.revenue / last.bookings : 0;
    const pAvg = prev && prev.bookings > 0 ? prev.revenue / prev.bookings : 0;
    const delta = prev && pAvg > 0 ? pctChange(pAvg, cAvg) : 0;
    insights.push({
      key: "avg_deal_size",
      label: "Average deal size",
      direction: prev && pAvg > 0 ? dir(delta) : "flat",
      magnitude: round2(cAvg),
      unit: "currency",
      detail:
        cAvg > 0
          ? `${fmtMoney(cAvg)} per booking this month${pAvg > 0 ? ` (${fmtPct(delta)} vs prior)` : ""}`
          : "No booked revenue this month",
    });
  }

  // 6. Emerging categories: compare the latest month's category share vs the
  //    mean share across earlier months. Categories whose count is growing rank
  //    highest.
  const emergingCategories = computeEmergingCategories(series);
  if (emergingCategories.length) {
    const top = emergingCategories[0];
    insights.push({
      key: "emerging_category",
      label: "Emerging category",
      direction: "up",
      magnitude: top.deltaPct,
      unit: "%",
      detail: `${top.category} is growing (${top.prior} -> ${top.recent}, ${fmtPct(top.deltaPct)})`,
    });
  }

  return { hasData: true, months, insights, emergingCategories };
}

function computeEmergingCategories(
  series: RevenueSeriesPoint[],
): { category: string; recent: number; prior: number; deltaPct: number }[] {
  if (series.length < 2) return [];
  const last = series[series.length - 1];
  const earlier = series.slice(0, -1);

  const recent = last.categoryCounts ?? {};
  // Mean per-month count for each category across the earlier window.
  const priorMean: Record<string, number> = {};
  for (const s of earlier) {
    for (const [cat, n] of Object.entries(s.categoryCounts ?? {})) {
      priorMean[cat] = (priorMean[cat] ?? 0) + n;
    }
  }
  for (const cat of Object.keys(priorMean)) {
    priorMean[cat] = priorMean[cat] / earlier.length;
  }

  const cats = new Set<string>([...Object.keys(recent), ...Object.keys(priorMean)]);
  const out: { category: string; recent: number; prior: number; deltaPct: number }[] = [];
  for (const cat of cats) {
    const r = recent[cat] ?? 0;
    const p = round2(priorMean[cat] ?? 0);
    if (r <= 0) continue; // only surface categories with current activity
    const deltaPct = pctChange(p, r);
    if (deltaPct > FLAT_BAND) out.push({ category: cat, recent: r, prior: p, deltaPct });
  }
  out.sort((a, b) => b.deltaPct - a.deltaPct);
  return out.slice(0, 5);
}

// AI SEAM (optional, feature-flagged, NOT implemented here): a narrative
// summary of these deterministic insights could be generated by an LLM and
// cached. The default path is and must remain the deterministic output above.

export const __test = { pctChange, dir, computeEmergingCategories, FLAT_BAND };
