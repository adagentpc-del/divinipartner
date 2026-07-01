/**
 * Phase 3 Intelligence - Composite Vendor Scorecard (pure layer).
 *
 * Deepens the existing Vendor Readiness Score (0..100, from
 * server/src/lib/vendorReadiness.ts) into a fuller PERFORMANCE scorecard. This
 * module is PURE: the route / db layer composes computeVendorReadiness for the
 * readiness component, pulls the operational counts (response time, quote
 * turnaround, win rate, on-time delivery, change orders, satisfaction, issues,
 * rework, revenue) from the live tables, and passes them here to assemble a
 * single composite scorecard. No DB, no AI, no randomness.
 *
 * The readiness score is NOT recomputed here (vendorReadiness.ts owns it); the
 * caller passes the already-computed 0..100 readiness in, and this module layers
 * the additional spec fields on top into one scorecard object with a blended
 * composite grade.
 *
 * Zero em dashes.
 */

/** The spec scorecard fields, all optional (missing = unknown, not zero-penalty). */
export interface VendorScorecardMetrics {
  /** Average first-response time to a new bid invite, in hours. */
  avg_response_hours?: number | null;
  /** Average time from request to sent quote, in hours. */
  avg_quote_turnaround_hours?: number | null;
  /** Win rate 0..1 (quotes accepted / quotes sent). */
  win_rate?: number | null;
  /** On-time delivery rate 0..1. */
  on_time_rate?: number | null;
  /** Count of change orders raised against this vendor's jobs. */
  change_orders?: number | null;
  /** Client satisfaction 0..5 (average review rating). */
  client_satisfaction?: number | null;
  /** Count of open / logged issues. */
  issue_count?: number | null;
  /** Count of rework tasks. */
  rework_count?: number | null;
  /** Total revenue generated (sum of invoice totals), dollars. */
  revenue_generated?: number | null;
  /** Number of jobs / events delivered (denominator for the rate context). */
  jobs_completed?: number | null;
}

/** One displayed metric in the scorecard. */
export interface ScorecardField {
  key: string;
  label: string;
  /** Raw value (may be null when unknown). */
  value: number | null;
  /** A presentable formatted value (e.g. "12h", "78%", "4.6 / 5", "$42,000"). */
  display: string;
  /** 0..100 health for this field, or null when unknown. */
  health: number | null;
  /** Qualitative tone for the UI. */
  tone: "great" | "good" | "ok" | "low" | "unknown";
}

export interface VendorScorecard {
  vendor_id: string;
  /** The existing 0..100 Vendor Readiness Score (passed in, not recomputed). */
  readiness_score: number;
  /** The blended composite grade 0..100 (readiness + performance fields). */
  composite_score: number;
  composite_tone: "great" | "good" | "ok" | "low";
  fields: ScorecardField[];
  /** Echo of the raw metrics for any downstream consumer. */
  metrics: VendorScorecardMetrics;
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const numOrNull = (n: number | null | undefined): number | null => (isNum(n) ? n : null);

function toneFor(health: number | null): ScorecardField["tone"] {
  if (health == null) return "unknown";
  if (health >= 80) return "great";
  if (health >= 60) return "good";
  if (health >= 40) return "ok";
  return "low";
}

/** Map a response/turnaround time (hours, lower is better) to 0..100 health. */
function timeHealth(hours: number | null): number | null {
  if (hours == null) return null;
  if (hours <= 2) return 100;
  if (hours <= 6) return 90;
  if (hours <= 12) return 80;
  if (hours <= 24) return 65;
  if (hours <= 48) return 45;
  if (hours <= 96) return 25;
  return 10;
}

/** Map a 0..1 rate to 0..100 health. */
function rateHealth(rate: number | null): number | null {
  if (rate == null) return null;
  return clamp(Math.round(clamp(rate, 0, 1) * 100), 0, 100);
}

/** Map a 0..5 satisfaction to 0..100 health. */
function satHealth(sat: number | null): number | null {
  if (sat == null) return null;
  return clamp(Math.round((clamp(sat, 0, 5) / 5) * 100), 0, 100);
}

/**
 * Map a count where MORE is WORSE (change orders / issues / rework) to health,
 * scaled by the number of jobs so a busy vendor is not unfairly penalized.
 */
function negativeCountHealth(count: number | null, jobs: number | null): number | null {
  if (count == null) return null;
  const denom = jobs && jobs > 0 ? jobs : 1;
  const perJob = count / denom;
  if (perJob <= 0) return 100;
  if (perJob <= 0.1) return 90;
  if (perJob <= 0.25) return 75;
  if (perJob <= 0.5) return 55;
  if (perJob <= 1) return 35;
  return 15;
}

/** Map revenue generated to health (log-scaled, presence-positive). */
function revenueHealth(rev: number | null): number | null {
  if (rev == null) return null;
  if (rev <= 0) return 20;
  // ~ $100k+ maxes out; $1k ~ 30; log scaling.
  const h = Math.round(Math.log10(rev + 1) * 20);
  return clamp(h, 0, 100);
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
function fmtPct(r: number): string {
  return `${Math.round(clamp(r, 0, 1) * 100)}%`;
}
function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Assemble the composite scorecard. Pure. `readinessScore` is the already
 * computed 0..100 from vendorReadiness.ts (the caller composes it); the metrics
 * are the operational counts the db layer pulled from live tables (degrading any
 * absent table to null, which renders as "unknown" rather than a fake zero).
 *
 * The composite grade is a blend: readiness carries 50% (it already folds in
 * responsiveness, compliance, completeness, reviews), and the additional
 * performance signals carry the remaining 50%, averaged over whichever of them
 * are KNOWN (so unknown fields neither help nor hurt). When no extra fields are
 * known the composite equals the readiness score.
 */
export function buildVendorScorecard(
  vendorId: string,
  readinessScore: number,
  metrics: VendorScorecardMetrics,
): VendorScorecard {
  const readiness = clamp(Math.round(isNum(readinessScore) ? readinessScore : 0), 0, 100);

  const responseH = timeHealth(numOrNull(metrics.avg_response_hours));
  const quoteH = timeHealth(numOrNull(metrics.avg_quote_turnaround_hours));
  const winH = rateHealth(numOrNull(metrics.win_rate));
  const onTimeH = rateHealth(numOrNull(metrics.on_time_rate));
  const jobs = numOrNull(metrics.jobs_completed);
  const changeH = negativeCountHealth(numOrNull(metrics.change_orders), jobs);
  const satH = satHealth(numOrNull(metrics.client_satisfaction));
  const issueH = negativeCountHealth(numOrNull(metrics.issue_count), jobs);
  const reworkH = negativeCountHealth(numOrNull(metrics.rework_count), jobs);
  const revH = revenueHealth(numOrNull(metrics.revenue_generated));

  const fields: ScorecardField[] = [
    {
      key: "avg_response_hours",
      label: "Response time",
      value: numOrNull(metrics.avg_response_hours),
      display: isNum(metrics.avg_response_hours) ? fmtHours(metrics.avg_response_hours) : "Not enough data",
      health: responseH,
      tone: toneFor(responseH),
    },
    {
      key: "avg_quote_turnaround_hours",
      label: "Quote turnaround",
      value: numOrNull(metrics.avg_quote_turnaround_hours),
      display: isNum(metrics.avg_quote_turnaround_hours) ? fmtHours(metrics.avg_quote_turnaround_hours) : "Not enough data",
      health: quoteH,
      tone: toneFor(quoteH),
    },
    {
      key: "win_rate",
      label: "Win rate",
      value: numOrNull(metrics.win_rate),
      display: isNum(metrics.win_rate) ? fmtPct(metrics.win_rate) : "Not enough data",
      health: winH,
      tone: toneFor(winH),
    },
    {
      key: "on_time_rate",
      label: "On-time delivery",
      value: numOrNull(metrics.on_time_rate),
      display: isNum(metrics.on_time_rate) ? fmtPct(metrics.on_time_rate) : "Not enough data",
      health: onTimeH,
      tone: toneFor(onTimeH),
    },
    {
      key: "change_orders",
      label: "Change orders",
      value: numOrNull(metrics.change_orders),
      display: isNum(metrics.change_orders) ? String(Math.round(metrics.change_orders)) : "0",
      health: changeH,
      tone: toneFor(changeH),
    },
    {
      key: "client_satisfaction",
      label: "Client satisfaction",
      value: numOrNull(metrics.client_satisfaction),
      display: isNum(metrics.client_satisfaction) ? `${metrics.client_satisfaction.toFixed(1)} / 5` : "No reviews yet",
      health: satH,
      tone: toneFor(satH),
    },
    {
      key: "issue_count",
      label: "Issues",
      value: numOrNull(metrics.issue_count),
      display: isNum(metrics.issue_count) ? String(Math.round(metrics.issue_count)) : "0",
      health: issueH,
      tone: toneFor(issueH),
    },
    {
      key: "rework_count",
      label: "Rework",
      value: numOrNull(metrics.rework_count),
      display: isNum(metrics.rework_count) ? String(Math.round(metrics.rework_count)) : "0",
      health: reworkH,
      tone: toneFor(reworkH),
    },
    {
      key: "revenue_generated",
      label: "Revenue generated",
      value: numOrNull(metrics.revenue_generated),
      display: isNum(metrics.revenue_generated) ? fmtMoney(metrics.revenue_generated) : "$0",
      health: revH,
      tone: toneFor(revH),
    },
  ];

  // Performance component: average of the KNOWN field healths.
  const known = fields.map((f) => f.health).filter((h): h is number => h != null);
  const perf = known.length ? known.reduce((s, h) => s + h, 0) / known.length : null;

  const composite =
    perf == null
      ? readiness
      : clamp(Math.round(readiness * 0.5 + perf * 0.5), 0, 100);

  const compositeTone: VendorScorecard["composite_tone"] =
    composite >= 80 ? "great" : composite >= 60 ? "good" : composite >= 40 ? "ok" : "low";

  return {
    vendor_id: vendorId,
    readiness_score: readiness,
    composite_score: composite,
    composite_tone: compositeTone,
    fields,
    metrics,
  };
}
