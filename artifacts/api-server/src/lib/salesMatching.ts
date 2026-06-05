/**
 * Company-name matching for sales intake routing.
 *
 * Intake forms are filled in by clients who type a company name however they
 * like ("Home Depot", "The Home Depot", "home depot inc"). We normalize names
 * to a comparable key and use a small fuzzy match so a new submission can be
 * tied back to an existing account (and therefore its owning rep).
 */

const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "lp",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "group",
  "holdings",
  "enterprises",
  "the",
]);

/**
 * Lowercase, strip punctuation, drop common legal suffixes / leading "the",
 * and collapse whitespace. The result is the candidate key stored on
 * sales_accounts.normalized_name and recomputed for each submission.
 */
export function normalizeCompanyName(raw: string): string {
  const cleaned = (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter((t) => t && !COMPANY_SUFFIXES.has(t));
  return (tokens.length > 0 ? tokens : cleaned.split(" ")).join(" ");
}

/** Compact, space-free form for containment checks ("homedepot"). */
function collapse(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

export interface MatchCandidate {
  id: number;
  normalizedName: string;
}

/**
 * Pick the best matching candidate for a submitted company name, or null.
 *
 * Strategy (cheap → fuzzy):
 *  1. exact normalized equality
 *  2. one collapsed key contains the other (handles "the home depot" vs "home
 *     depot", "depot" guard avoids trivially-short containment)
 *  3. Levenshtein within a length-scaled threshold (catches typos)
 */
export function findBestAccountMatch(
  submittedName: string,
  candidates: MatchCandidate[],
): MatchCandidate | null {
  const target = normalizeCompanyName(submittedName);
  if (!target) return null;
  const targetCollapsed = collapse(target);
  if (targetCollapsed.length < 3) return null;

  let exact: MatchCandidate | null = null;
  let contained: MatchCandidate | null = null;
  let bestFuzzy: { cand: MatchCandidate; dist: number } | null = null;

  for (const cand of candidates) {
    const candNorm = cand.normalizedName || "";
    if (!candNorm) continue;
    if (candNorm === target) {
      exact = cand;
      break;
    }
    const candCollapsed = collapse(candNorm);
    if (candCollapsed.length < 3) continue;

    if (!contained) {
      const [shorter, longer] =
        targetCollapsed.length <= candCollapsed.length
          ? [targetCollapsed, candCollapsed]
          : [candCollapsed, targetCollapsed];
      if (shorter.length >= 4 && longer.includes(shorter)) {
        contained = cand;
      }
    }

    const dist = levenshtein(targetCollapsed, candCollapsed);
    const maxLen = Math.max(targetCollapsed.length, candCollapsed.length);
    const threshold = maxLen <= 6 ? 1 : maxLen <= 12 ? 2 : 3;
    if (dist <= threshold && (!bestFuzzy || dist < bestFuzzy.dist)) {
      bestFuzzy = { cand, dist };
    }
  }

  return exact || contained || bestFuzzy?.cand || null;
}
