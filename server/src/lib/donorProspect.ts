/**
 * Phase 3 Intelligence - Donor prospecting engine (pure layer).
 *
 * Deterministic RFM-style donor scoring. The route / db layer loads donor rows
 * and their donation aggregates (by NAME, cross-read, degrading gracefully when
 * the donor tables are absent) and passes them here; this module ranks each
 * donor 0..100 by Recency, Frequency, and Monetary value, surfaces
 * lapsed-but-high-value donors, explains WHY each is a prospect, and computes a
 * suggested ask. No DB, no AI, no randomness: same inputs -> same ranking.
 *
 * Mirrors the partnershipMatch.ts scoring style (bounded per-signal points,
 * clamp 0..100, reasons array, stable sort).
 *
 * Zero em dashes.
 */

/** A donor with pre-aggregated giving stats (supplied by the db layer). */
export interface DonorStats {
  id: string;
  name?: string | null;
  email?: string | null;
  /** Lifetime total given. */
  total_given?: number | null;
  /** Number of distinct gifts. */
  gift_count?: number | null;
  /** Largest single gift. */
  largest_gift?: number | null;
  /** ISO date of the most recent gift, or null if never. */
  last_gift_at?: string | null;
  /** ISO date of the first gift, or null. */
  first_gift_at?: string | null;
}

export interface DonorProspect {
  donor: DonorStats;
  score: number; // 0..100 prospect score
  /** Recency / Frequency / Monetary sub-scores (each 0..100) for display. */
  rfm: { recency: number; frequency: number; monetary: number };
  /** True when a once-generous donor has not given recently. */
  lapsed: boolean;
  /** A computed suggested next ask amount (dollars). */
  suggested_ask: number;
  reasons: string[];
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const num = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;
const money = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

/** Whole days between an ISO date and `now`; large fallback when missing. */
function daysSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 100000;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 100000;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** Recency sub-score 0..100: fresher giving scores higher. */
function recencyScore(days: number): number {
  if (days <= 30) return 100;
  if (days <= 90) return 85;
  if (days <= 180) return 70;
  if (days <= 365) return 50;
  if (days <= 730) return 30;
  if (days <= 1095) return 15;
  return 5;
}

/** Frequency sub-score 0..100: more distinct gifts score higher (log-ish steps). */
function frequencyScore(gifts: number): number {
  if (gifts >= 10) return 100;
  if (gifts >= 6) return 85;
  if (gifts >= 4) return 70;
  if (gifts >= 3) return 55;
  if (gifts >= 2) return 40;
  if (gifts >= 1) return 25;
  return 0;
}

/** Monetary sub-score 0..100: scaled against the cohort's top giver. */
function monetaryScore(total: number, cohortMax: number): number {
  if (total <= 0 || cohortMax <= 0) return 0;
  // Square-root scaling so mid-size donors are not crushed by one mega-donor.
  const ratio = Math.sqrt(total) / Math.sqrt(cohortMax);
  return clamp(Math.round(ratio * 100), 0, 100);
}

/**
 * Suggested next ask: anchored on the donor's largest prior gift (or average),
 * nudged up by a deterministic step. Returns a rounded, presentable number.
 */
function suggestedAsk(d: DonorStats): number {
  const total = num(d.total_given);
  const gifts = num(d.gift_count);
  const largest = num(d.largest_gift);
  const avg = gifts > 0 ? total / gifts : 0;
  const base = Math.max(largest, avg);
  if (base <= 0) return 0;
  // Ask ~25% above their best prior gift, rounded to a clean figure.
  const raised = base * 1.25;
  if (raised >= 10000) return Math.round(raised / 1000) * 1000;
  if (raised >= 1000) return Math.round(raised / 250) * 250;
  if (raised >= 100) return Math.round(raised / 50) * 50;
  return Math.max(25, Math.round(raised / 25) * 25);
}

export interface RankDonorsOptions {
  /** Reference "now" (ms). Defaults to Date.now(); injectable for determinism. */
  now?: number;
  /** Cap the returned list. Default 50. */
  limit?: number;
}

/**
 * Rank donors into prospects. Pure. The composite score weights Monetary 45,
 * Recency 30, Frequency 25 (major-gift prospecting leans on capacity first,
 * then engagement). A lapsed-but-high-value flag is raised when a donor with a
 * strong monetary history has not given in over a year, and such donors get a
 * small re-engagement bump so they surface for a renewal ask.
 */
export function rankDonors(donors: DonorStats[], opts: RankDonorsOptions = {}): DonorProspect[] {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 50;
  const cohortMax = donors.reduce((m, d) => Math.max(m, num(d.total_given)), 0);

  const prospects: DonorProspect[] = donors.map((d) => {
    const days = daysSince(d.last_gift_at, now);
    const total = num(d.total_given);
    const gifts = num(d.gift_count);

    const recency = recencyScore(days);
    const frequency = frequencyScore(gifts);
    const monetary = monetaryScore(total, cohortMax);

    let composite = monetary * 0.45 + recency * 0.3 + frequency * 0.25;

    // Lapsed-but-high-value: strong giver gone quiet (>365 days). Worth a
    // re-engagement ask, so nudge them up rather than letting recency bury them.
    const lapsed = monetary >= 55 && days > 365;
    if (lapsed) composite += 8;

    const reasons: string[] = [];
    if (total > 0) reasons.push(`Lifetime giving ${money(total)}`);
    if (gifts >= 3) reasons.push(`Loyal donor (${gifts} gifts)`);
    else if (gifts >= 1) reasons.push(`${gifts} prior gift${gifts === 1 ? "" : "s"}`);
    if (days <= 90) reasons.push("Gave recently");
    else if (lapsed) reasons.push("High-value but lapsed: ripe for a renewal ask");
    else if (days <= 365) reasons.push("Gave within the past year");
    if (num(d.largest_gift) > 0) reasons.push(`Best gift ${money(num(d.largest_gift))}`);

    return {
      donor: d,
      score: clamp(Math.round(composite), 0, 100),
      rfm: { recency, frequency, monetary },
      lapsed,
      suggested_ask: suggestedAsk(d),
      reasons,
    };
  });

  return prospects
    .sort(
      (a, b) =>
        b.score - a.score ||
        num(b.donor.total_given) - num(a.donor.total_given) ||
        (a.donor.id < b.donor.id ? -1 : a.donor.id > b.donor.id ? 1 : 0),
    )
    .slice(0, limit);
}
