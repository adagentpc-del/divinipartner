/**
 * Divini AI COO V2 - Forecasting Engine (pure, deterministic).
 *
 * forecast(history) projects the next period using only deterministic methods:
 *   - trailing moving average (level)
 *   - simple linear trend (ordinary least-squares slope over the series index)
 *   - month-of-year seasonality (mean ratio of each calendar month vs the
 *     series average), applied multiplicatively to the trend+level estimate
 *
 * It produces forecasts for: revenue, bookings, vendorDemand, sponsorDemand,
 * venueOccupancy, plus a seasonality profile and a pipelineHealth read. No
 * external / AI calls. Same inputs always produce the same output. The seam for
 * an optional AI scenario narrative is marked below but NOT implemented.
 */

/** One month of history (oldest -> newest). All counts/levels non-negative. */
export type ForecastHistoryPoint = {
  /** Month key, e.g. "2026-06". */
  period: string;
  revenue: number;
  bookings: number;
  /** Distinct vendors engaged / quoting in the month (demand proxy). */
  vendorDemand: number;
  /** Sponsorship opportunities active / claimed in the month (demand proxy). */
  sponsorDemand: number;
  /** Venue occupancy ratio for the month, 0..1 (booked vs available proxy). */
  venueOccupancy: number;
  /** Open pipeline value at month end (events not yet won, est. value). */
  pipelineValue?: number;
};

export type ForecastPoint = {
  /** Projected month key. */
  period: string;
  value: number;
  /** Low / high band from the trend dispersion (deterministic +-). */
  low: number;
  high: number;
  method: "moving_average+trend+seasonality";
};

export type SeasonalityMonth = { month: number; label: string; index: number };

export type PipelineHealth = {
  /** 0..100 deterministic read of pipeline momentum + coverage. */
  score: number;
  level: "strong" | "steady" | "soft" | "thin";
  detail: string;
};

export type ForecastResult = {
  hasData: boolean;
  months: number;
  /** The month being forecast (period after the last history point). */
  horizon: string;
  revenue: ForecastPoint;
  bookings: ForecastPoint;
  vendorDemand: ForecastPoint;
  sponsorDemand: ForecastPoint;
  venueOccupancy: ForecastPoint;
  seasonality: SeasonalityMonth[];
  pipelineHealth: PipelineHealth;
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MA_WINDOW = 3; // trailing moving-average window

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : round2(n);
}

/** Parse "YYYY-MM" -> { year, month0 } (month0 is 0-based). */
function parsePeriod(period: string): { year: number; month0: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return { year: 0, month0: 0 };
  return { year: Number(m[1]), month0: Number(m[2]) - 1 };
}

/** The period immediately after the given "YYYY-MM". */
function nextPeriod(period: string): string {
  const { year, month0 } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month0 + 1, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/** Trailing moving average over the last `window` values. */
function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** OLS slope of values against their index (per-step trend). */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den === 0 ? 0 : num / den;
}

/** Standard deviation of values (population), for a deterministic band. */
function stdev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return Math.sqrt(v);
}

/**
 * Month-of-year seasonal indices. For each calendar month present in history we
 * compute the mean of (value / overall mean). Months never seen default to 1.0
 * (neutral). Returns a 12-entry profile.
 */
function seasonalIndices(periods: string[], values: number[]): number[] {
  const overallMean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const idx = new Array(12).fill(0).map(() => ({ sum: 0, count: 0 }));
  if (overallMean > 0) {
    for (let i = 0; i < periods.length; i++) {
      const { month0 } = parsePeriod(periods[i]);
      idx[month0].sum += values[i] / overallMean;
      idx[month0].count += 1;
    }
  }
  return idx.map((m) => (m.count > 0 ? m.sum / m.count : 1));
}

/** Forecast one series: level (MA) + half a step of trend, scaled by season. */
function projectSeries(
  periods: string[],
  values: number[],
  horizon: string,
): ForecastPoint {
  const level = movingAverage(values, MA_WINDOW);
  const slope = linearSlope(values);
  const indices = seasonalIndices(periods, values);
  const { month0 } = parsePeriod(horizon);
  const seasonal = indices[month0] || 1;

  // base = level carried forward by one trend step, then seasonally adjusted.
  const base = (level + slope) * seasonal;
  const sd = stdev(values);
  const value = clampNonNeg(base);
  return {
    period: horizon,
    value,
    low: clampNonNeg(base - sd),
    high: clampNonNeg(base + sd),
    method: "moving_average+trend+seasonality",
  };
}

/** Occupancy is a 0..1 ratio: project then clamp into [0,1]. */
function projectOccupancy(
  periods: string[],
  values: number[],
  horizon: string,
): ForecastPoint {
  const p = projectSeries(periods, values, horizon);
  const clamp01 = (n: number) => round2(Math.max(0, Math.min(1, n)));
  return { ...p, value: clamp01(p.value), low: clamp01(p.low), high: clamp01(p.high) };
}

function computePipelineHealth(history: ForecastHistoryPoint[]): PipelineHealth {
  if (history.length === 0) {
    return { score: 0, level: "thin", detail: "No pipeline data yet." };
  }
  const last = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;

  const pipeline = last.pipelineValue ?? 0;
  const revenue = last.revenue;
  // Coverage: open pipeline vs recent monthly revenue (capped contribution).
  const coverage = revenue > 0 ? Math.min(pipeline / revenue, 3) / 3 : pipeline > 0 ? 1 : 0;
  // Momentum: bookings direction month over month.
  let momentum = 0.5;
  if (prev) {
    if (last.bookings > prev.bookings) momentum = 1;
    else if (last.bookings < prev.bookings) momentum = 0.25;
  }
  // Activity: any quoting/vendor demand keeps the pipeline alive.
  const activity = last.vendorDemand > 0 ? 1 : last.bookings > 0 ? 0.5 : 0;

  const score = Math.round((coverage * 0.45 + momentum * 0.35 + activity * 0.2) * 100);
  const level: PipelineHealth["level"] =
    score >= 70 ? "strong" : score >= 50 ? "steady" : score >= 30 ? "soft" : "thin";
  const detail =
    pipeline > 0
      ? `Open pipeline ~$${Math.round(pipeline).toLocaleString()} against $${Math.round(revenue).toLocaleString()} recent monthly revenue.`
      : "No open pipeline value detected; rely on new inquiries.";
  return { score, level, detail };
}

/**
 * Produce the full deterministic forecast for the period after the last month
 * of history. Returns hasData=false for an empty history (graceful UI).
 */
export function forecast(history: ForecastHistoryPoint[]): ForecastResult {
  const months = history.length;
  const empty: ForecastPoint = {
    period: "",
    value: 0,
    low: 0,
    high: 0,
    method: "moving_average+trend+seasonality",
  };
  if (months === 0) {
    return {
      hasData: false,
      months: 0,
      horizon: "",
      revenue: empty,
      bookings: empty,
      vendorDemand: empty,
      sponsorDemand: empty,
      venueOccupancy: empty,
      seasonality: [],
      pipelineHealth: { score: 0, level: "thin", detail: "No data yet." },
    };
  }

  const periods = history.map((h) => h.period);
  const horizon = nextPeriod(periods[periods.length - 1]);

  const revenue = projectSeries(periods, history.map((h) => h.revenue), horizon);
  const bookings = projectSeries(periods, history.map((h) => h.bookings), horizon);
  const vendorDemand = projectSeries(periods, history.map((h) => h.vendorDemand), horizon);
  const sponsorDemand = projectSeries(periods, history.map((h) => h.sponsorDemand), horizon);
  const venueOccupancy = projectOccupancy(periods, history.map((h) => h.venueOccupancy), horizon);

  // Seasonality profile from revenue (the headline series).
  const revIndices = seasonalIndices(periods, history.map((h) => h.revenue));
  const seasonality: SeasonalityMonth[] = revIndices.map((index, i) => ({
    month: i + 1,
    label: MONTH_LABELS[i],
    index: round2(index),
  }));

  return {
    hasData: true,
    months,
    horizon,
    revenue,
    bookings,
    vendorDemand,
    sponsorDemand,
    venueOccupancy,
    seasonality,
    pipelineHealth: computePipelineHealth(history),
  };
}

// AI SEAM (optional, feature-flagged, NOT implemented here): a natural-language
// scenario narrative (bull / base / bear) over these deterministic numbers
// could be produced by an LLM and cached. The default path is and remains the
// deterministic projection above.

export const __test = {
  movingAverage,
  linearSlope,
  seasonalIndices,
  nextPeriod,
  parsePeriod,
  computePipelineHealth,
};
