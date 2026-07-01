/**
 * Friction Elimination - Lead Quality Engine (U4).
 *
 * FRICTION-ELIMINATION-ADDENDUM.md U4 positions a qualified inquiry (event type,
 * budget range, guest count, date range, decision maker, company, timeline) as
 * the unit a venue ranks its inbox by. This module is the single source of truth
 * for that ranking: it converts a qualified inquiry into a lead_quality_score
 * (0-100) and an intent band (high / medium / low).
 *
 * `computeLeadQuality` is PURE: it does no DB work, takes the inquiry fields,
 * and returns { score, intent }. The leads repo (server/src/db/leads.ts) calls
 * it at create time and persists both, so a venue's inbox sorts by stored score
 * without recomputing, and the function stays unit-testable in isolation.
 *
 * Scoring (five weighted signals, summing to 100):
 *   - completeness ............... 30  (each of the seven qualifying fields
 *                                       present contributes a proportional share)
 *   - budget size ................ 25  (parsed upper bound of budget_range)
 *   - named decision maker ....... 15  (a real personal name, not a placeholder)
 *   - company named .............. 10  (a real company, not a placeholder)
 *   - near-term date ............. 20  (sooner the event date, higher the score)
 *
 * Intent bands: >= 70 high, >= 40 medium, else low.
 */

/** The qualifying fields the engine reads. All optional/nullable at the type
 * level; the repo enforces presence of the seven required ones before storing. */
export interface LeadInquiry {
  event_type?: string | null;
  budget_range?: string | null;
  guest_count?: number | null;
  date_range?: unknown;
  decision_maker_name?: string | null;
  company?: string | null;
  timeline?: string | null;
  message?: string | null;
}

export type LeadIntent = "high" | "medium" | "low";

export interface LeadQuality {
  score: number;
  intent: LeadIntent;
}

/** True when a string carries real, non-placeholder content. */
function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

const PLACEHOLDERS = new Set<string>([
  "n/a",
  "na",
  "none",
  "tbd",
  "unknown",
  "test",
  "-",
  ".",
  "x",
  "xx",
  "xxx",
  "?",
]);

/** True when a string looks like a genuine value (not a placeholder filler). */
function isMeaningful(v: unknown): boolean {
  if (!hasText(v)) return false;
  const t = (v as string).trim().toLowerCase();
  if (PLACEHOLDERS.has(t)) return false;
  return t.length >= 2;
}

/** True when a name looks like a real personal name (has a word of length >= 2). */
function looksLikeName(v: unknown): boolean {
  if (!isMeaningful(v)) return false;
  const t = (v as string).trim();
  // At least two letters and not purely numeric.
  return /[a-zA-Z]{2,}/.test(t);
}

/**
 * Parse the upper bound of a budget range string into a number. Handles common
 * shapes: "$50,000", "25k-50k", "10000 to 25000", "$1.5M", "50k+". Returns the
 * largest number found (so a range maps to its top end). 0 when nothing parses.
 */
export function parseBudgetUpperBound(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (!hasText(raw)) return 0;
  const text = (raw as string).toLowerCase();
  // Match number tokens with optional k/m suffix.
  const re = /(\d[\d,]*\.?\d*)\s*([km])?/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[1].replace(/,/g, "");
    if (!digits || digits === ".") continue;
    let n = parseFloat(digits);
    if (!Number.isFinite(n)) continue;
    const suffix = m[2];
    if (suffix === "k") n *= 1_000;
    else if (suffix === "m") n *= 1_000_000;
    if (n > max) max = n;
  }
  return max;
}

/**
 * Score the budget signal 0-1. Anchored so a small social event budget scores
 * low and a large corporate budget saturates: $0 -> 0, ramping to full credit
 * at and above $100,000.
 */
function budgetSignal(budgetRange: unknown): number {
  const upper = parseBudgetUpperBound(budgetRange);
  if (upper <= 0) return 0;
  const FULL = 100_000;
  return Math.min(1, upper / FULL);
}

/**
 * Pull an event date out of date_range. Accepts an ISO string, a { start } /
 * { from } / { date } object, or an array whose first element is a date. Returns
 * a Date or null when nothing usable is present.
 */
function extractEventDate(dateRange: unknown): Date | null {
  const tryParse = (v: unknown): Date | null => {
    if (!hasText(v)) return null;
    const d = new Date(v as string);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  if (dateRange == null) return null;
  if (typeof dateRange === "string") return tryParse(dateRange);
  if (Array.isArray(dateRange)) return dateRange.length ? tryParse(dateRange[0]) : null;
  if (typeof dateRange === "object") {
    const o = dateRange as Record<string, unknown>;
    return tryParse(o.start) ?? tryParse(o.from) ?? tryParse(o.date) ?? tryParse(o.end);
  }
  return null;
}

/**
 * Score how near-term the event date is, 0-1. No date -> 0 (we cannot reward
 * urgency we cannot see). Past dates -> 0. Within 30 days -> 1, decaying to 0 at
 * one year out.
 */
function nearTermSignal(dateRange: unknown, now: Date = new Date()): number {
  const date = extractEventDate(dateRange);
  if (!date) return 0;
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return 0;
  if (days <= 30) return 1;
  const YEAR = 365;
  if (days >= YEAR) return 0;
  // Linear decay from 1 (at 30 days) to 0 (at one year).
  return Math.max(0, 1 - (days - 30) / (YEAR - 30));
}

/**
 * Completeness across the seven qualifying fields, 0-1. Each present field
 * contributes an equal share. guest_count counts when it is a positive number.
 */
function completenessSignal(inq: LeadInquiry): number {
  const checks: boolean[] = [
    isMeaningful(inq.event_type),
    isMeaningful(inq.budget_range),
    typeof inq.guest_count === "number" && (inq.guest_count ?? 0) > 0,
    extractEventDate(inq.date_range) != null,
    looksLikeName(inq.decision_maker_name),
    isMeaningful(inq.company),
    isMeaningful(inq.timeline),
  ];
  const present = checks.filter(Boolean).length;
  return present / checks.length;
}

/** The exported weights (sum to 100), in display order. */
export const LEAD_QUALITY_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "completeness", label: "Inquiry completeness", weight: 30 },
  { key: "budget", label: "Budget size", weight: 25 },
  { key: "near_term", label: "Near-term date", weight: 20 },
  { key: "decision_maker", label: "Named decision maker", weight: 15 },
  { key: "company", label: "Company named", weight: 10 },
];

function bandFor(score: number): LeadIntent {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Lead quality, pure. Sums the weighted signals, clamps to [0, 100], and bands
 * the result into an intent. The `now` parameter is injectable for tests.
 */
export function computeLeadQuality(inq: LeadInquiry, now: Date = new Date()): LeadQuality {
  const weights: Record<string, number> = {
    completeness: completenessSignal(inq),
    budget: budgetSignal(inq.budget_range),
    near_term: nearTermSignal(inq.date_range, now),
    decision_maker: looksLikeName(inq.decision_maker_name) ? 1 : 0,
    company: isMeaningful(inq.company) ? 1 : 0,
  };
  const total = LEAD_QUALITY_WEIGHTS.reduce(
    (sum, w) => sum + (weights[w.key] ?? 0) * w.weight,
    0,
  );
  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, intent: bandFor(score) };
}
