/**
 * Phase 3 Intelligence - Sponsor <-> Event matching engine (pure layer).
 *
 * Deterministically matches sponsors to fundraising events / sponsorship
 * packages, and vice versa, by audience size, budget / price fit, category /
 * cause alignment, and prior history. This MIRRORS the deterministic scoring
 * style of server/src/lib/partnershipMatch.ts (bounded per-signal points,
 * clamp 0..100, stable sort, reasons array). It does NOT rebuild vendor /
 * partner matching: partnershipMatch.ts stays the source of truth for
 * venue <-> vendor <-> sponsor MARKETPLACE matching. This module is the
 * nonprofit-side fundraising counterpart (event packages <-> sponsors).
 *
 * Pure: no DB access, no AI, no randomness. The route / db layer loads the
 * source and candidate pool and supplies edge history; this module scores.
 *
 * Two directions (the route picks one):
 *   - direction "sponsors-for-event": rank SPONSORS that fit a given event /
 *     package (source = a sponsorship package or fundraising event).
 *   - direction "events-for-sponsor": rank EVENTS / PACKAGES that fit a given
 *     sponsor (source = a sponsor profile).
 *
 * Zero em dashes.
 */

export type SponsorMatchDirection = "sponsors-for-event" | "events-for-sponsor";

/**
 * Normalized attributes for either side. A "package" carries price + audience +
 * cause/category; a "sponsor" carries budget + target audience + cause interest.
 * Both are expressed in the same shape so scoring is symmetric.
 */
export interface SponsorMatchEntity {
  id: string;
  kind: "package" | "event" | "sponsor";
  name?: string | null;
  /** Cause / theme (e.g. "education", "health"). */
  cause?: string | null;
  /** Category / industry tag (e.g. "beverage", "finance"). */
  category?: string | null;
  /** Sponsor's industry, when known. */
  industry?: string | null;
  /** Expected reach for the event / package, or the sponsor's target reach. */
  audience_size?: number | null;
  /** Package price (the ask), or sponsor budget (the willingness to pay). */
  amount?: number | null;
  /** Geographic city for proximity, when known. */
  city?: string | null;
  region?: string | null;
  /** Prior count of sponsorships between this entity and the other side. */
  history_count?: number | null;
  /** Total prior spend on the relationship (sponsor lifetime / package revenue). */
  history_amount?: number | null;
  /** Soft flags carried through for display (tier, status, ...). */
  tier?: string | null;
  status?: string | null;
}

export interface SponsorMatchContext {
  direction: SponsorMatchDirection;
  source: SponsorMatchEntity;
  candidates: SponsorMatchEntity[];
  /** historyCount[candidateId] = prior sponsorships with the source. */
  historyCount?: Record<string, number>;
  /** historyAmount[candidateId] = prior dollars with the source. */
  historyAmount?: Record<string, number>;
}

export interface SponsorMatch {
  candidate: SponsorMatchEntity;
  score: number; // 0..100
  reasons: string[];
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const num = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;
const norm = (s?: string | null): string => (s ?? "").trim().toLowerCase();
const money = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Score one candidate against the source. Each signal contributes bounded
 * points; total clamps to 0..100. Same inputs -> same score (deterministic).
 *
 * For "sponsors-for-event" the source is the package/event (carrying the ask +
 * the event audience) and the candidate is a sponsor (carrying budget + target
 * reach + cause interest). For "events-for-sponsor" the roles swap; the scoring
 * is symmetric because both sides share the SponsorMatchEntity shape, so we read
 * the package side as whichever entity carries a package/event kind.
 */
export function scoreSponsorMatch(
  source: SponsorMatchEntity,
  cand: SponsorMatchEntity,
  historyCount = 0,
  historyAmount = 0,
): SponsorMatch {
  const reasons: string[] = [];
  let score = 0;

  // Identify which side is the package (the ask) and which is the sponsor (the
  // budget), so budget-vs-ask fit reads correctly regardless of direction.
  const pkg = source.kind === "sponsor" ? cand : source;
  const spon = source.kind === "sponsor" ? source : cand;
  const ask = num(pkg.amount); // package price
  const budget = num(spon.amount); // sponsor budget

  // Cause / theme alignment (the strongest fundraising signal).
  if (norm(source.cause) && norm(source.cause) === norm(cand.cause)) {
    score += 22;
    reasons.push(`Cause aligns (${cand.cause})`);
  }

  // Category / industry alignment.
  if (norm(source.category) && norm(source.category) === norm(cand.category)) {
    score += 12;
    reasons.push(`Category match (${cand.category})`);
  }
  if (norm(source.industry) && norm(source.industry) === norm(cand.industry)) {
    score += 8;
    reasons.push(`Industry match (${cand.industry})`);
  }

  // Budget / price fit: the sponsor budget covers (or nearly covers) the ask.
  if (ask > 0 && budget > 0) {
    if (budget >= ask) {
      score += 18;
      reasons.push(`Budget covers the ${money(ask)} package`);
    } else if (budget >= ask * 0.8) {
      score += 10;
      reasons.push("Budget is close to the package price");
    } else {
      score += 3;
      reasons.push("Package may be above this sponsor's budget");
    }
  }

  // Audience size alignment (closeness of expected reach to target reach).
  const aA = num(source.audience_size);
  const aB = num(cand.audience_size);
  if (aA > 0 && aB > 0) {
    const ratio = Math.min(aA, aB) / Math.max(aA, aB);
    const pts = Math.round(ratio * 14);
    score += pts;
    if (ratio >= 0.6) reasons.push(`Audience size aligns (~${aB.toLocaleString("en-US")})`);
  }

  // Location proximity (nice-to-have for local sponsors).
  if (norm(source.city) && norm(source.city) === norm(cand.city)) {
    score += 8;
    reasons.push(`Same city (${cand.city})`);
  } else if (norm(source.region) && norm(source.region) === norm(cand.region)) {
    score += 4;
    reasons.push(`Same region (${cand.region})`);
  }

  // Prior history (a returning sponsor / proven package is the best bet).
  const hCount = num(cand.history_count) + num(historyCount);
  if (hCount > 0) {
    const pts = Math.min(14, hCount * 5);
    score += pts;
    reasons.push(`${hCount} prior sponsorship${hCount === 1 ? "" : "s"} together`);
  }
  const hAmount = num(cand.history_amount) + num(historyAmount);
  if (hAmount > 0) {
    const pts = Math.min(8, Math.round(Math.log10(hAmount + 1) * 2));
    score += pts;
    if (hAmount >= 5000) reasons.push(`Proven giving (${money(hAmount)})`);
  }

  return { candidate: cand, score: clamp(Math.round(score), 0, 100), reasons };
}

/**
 * Rank all candidates for the source. Deterministic ordering: score desc, then
 * history_amount desc, then id ascending for a stable tiebreak.
 */
export function matchSponsors(ctx: SponsorMatchContext): SponsorMatch[] {
  const hc = ctx.historyCount ?? {};
  const ha = ctx.historyAmount ?? {};
  const scored = ctx.candidates
    .filter((c) => c.id !== ctx.source.id)
    .map((c) => scoreSponsorMatch(ctx.source, c, hc[c.id] ?? 0, ha[c.id] ?? 0));
  return scored.sort(
    (a, b) =>
      b.score - a.score ||
      num(b.candidate.history_amount) - num(a.candidate.history_amount) ||
      (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0),
  );
}

export const SPONSOR_MATCH_DIRECTIONS: SponsorMatchDirection[] = [
  "sponsors-for-event",
  "events-for-sponsor",
];
