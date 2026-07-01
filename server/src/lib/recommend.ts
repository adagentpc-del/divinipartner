/**
 * Phase 7 - Recommendation engine + scope builder + budget + risk intelligence
 * (blueprint 26). Pure, deterministic functions. The db / route layer supplies
 * candidate vendors and event data; this module scores and structures them.
 *
 *   - scoreVendorMatch / rankVendorMatches: match vendors to an event's criteria
 *   - buildEventScope: turn a plain-English description into a structured scope
 *     (needed categories + checklist + budget skeleton)
 *   - buildBudget / compareQuotes: budget intelligence (blueprint 26.3)
 *   - detectRisks: risk signals (blueprint 26.4)
 */
import { PRICING_V2 } from "../config.js";

// ---------------------------------------------------------------------------
// Vendor matching (blueprint 26.1 / 26.2)
// ---------------------------------------------------------------------------
export type EventCriteria = {
  category?: string | null;
  subcategories?: string[];
  region?: string | null;
  city?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  date_time?: string | null;
  required_services?: string[];
};

export type VendorCandidate = {
  id: string;
  organization_id: string;
  name?: string | null;
  category?: string | null;
  subcategories?: string[] | null;
  region?: string | null;
  city?: string | null;
  service_radius?: number | null;
  review_score?: number | null; // 0..5
  trust_score?: number | null; // 0..100
  preferred_status?: boolean | null;
  premier_status?: boolean | null;
  featured?: boolean | null; // Pricing V2 Featured Vendor advertising upgrade
  starred?: boolean; // starred by the requesting org
  price_band?: number | null; // typical job total, optional
};

export type VendorMatch = {
  vendor: VendorCandidate;
  score: number; // 0..100
  reasons: string[];
};

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const num = (n: number | null | undefined): number => (typeof n === "number" && !Number.isNaN(n) ? n : 0);
const norm = (s?: string | null): string => (s ?? "").trim().toLowerCase();

/**
 * Deterministic match score (0..100) for a vendor against event criteria.
 * Category match dominates; region, trust/reviews, and preferred/starred status
 * provide boosts. Same inputs always give the same score.
 */
export function scoreVendorMatch(criteria: EventCriteria, v: VendorCandidate): VendorMatch {
  const reasons: string[] = [];
  let score = 0;

  // Category (max 40)
  if (criteria.category && norm(v.category) === norm(criteria.category)) {
    score += 40;
    reasons.push(`Category match: ${v.category}`);
  } else if (
    criteria.category &&
    (v.subcategories ?? []).some((sc) => norm(sc) === norm(criteria.category))
  ) {
    score += 28;
    reasons.push(`Subcategory match: ${criteria.category}`);
  }

  // Subcategory overlap (max 12)
  if (criteria.subcategories?.length && v.subcategories?.length) {
    const want = new Set(criteria.subcategories.map(norm));
    const have = (v.subcategories ?? []).map(norm);
    const overlap = have.filter((x) => want.has(x)).length;
    if (overlap > 0) {
      const pts = Math.min(12, overlap * 6);
      score += pts;
      reasons.push(`${overlap} matching specialt${overlap === 1 ? "y" : "ies"}`);
    }
  }

  // Region / city (max 18)
  if (criteria.region && norm(v.region) === norm(criteria.region)) {
    score += 12;
    reasons.push(`Serves ${v.region}`);
  }
  if (criteria.city && norm(v.city) === norm(criteria.city)) {
    score += 6;
    reasons.push(`Based in ${v.city}`);
  }

  // Trust score (max 15) or fall back to review_score (max 10)
  if (v.trust_score != null) {
    const pts = clamp((Number(v.trust_score) / 100) * 15, 0, 15);
    score += pts;
    if (Number(v.trust_score) >= 78) reasons.push(`High trust score (${Math.round(Number(v.trust_score))})`);
  } else if (v.review_score != null) {
    const pts = clamp((Number(v.review_score) / 5) * 10, 0, 10);
    score += pts;
    if (Number(v.review_score) >= 4.5) reasons.push(`Top-rated (${Number(v.review_score).toFixed(1)})`);
  }

  // Preferred relationships (max 15)
  if (v.starred) {
    score += 10;
    reasons.push("On your preferred list");
  }
  if (v.premier_status) {
    score += 3;
    reasons.push("Premier partner");
  } else if (v.preferred_status) {
    score += 2;
    reasons.push("Preferred partner");
  }

  // Pricing V2 preferred-matching: the Featured Vendor advertising upgrade adds
  // a deterministic ranking boost so featured vendors surface higher. Flag-gated,
  // so legacy ranking is byte-for-byte unchanged when PRICING_V2 is off. The
  // overall score is clamped to 100, so this never overflows the scale.
  if (PRICING_V2 && v.featured) {
    score += 8;
    reasons.push("Featured vendor");
  }

  return { vendor: v, score: Math.round(clamp(score, 0, 100)), reasons };
}

/** Rank candidates for an event (highest score first, ties broken by id). */
export function rankVendorMatches(
  criteria: EventCriteria,
  candidates: VendorCandidate[],
  limit = 20,
): VendorMatch[] {
  return candidates
    .map((v) => scoreVendorMatch(criteria, v))
    .sort((a, b) => b.score - a.score || a.vendor.id.localeCompare(b.vendor.id))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Event scope builder (blueprint 26 - plain-English to structured scope)
// ---------------------------------------------------------------------------
export type ScopeCategory = {
  category: string;
  label: string;
  confidence: number; // 0..1
  matched: string[]; // keywords that triggered it
};

export type ChecklistItem = { label: string; category: string; done: boolean };

export type BudgetLine = { category: string; label: string; pct: number; amount: number };

export type EventScope = {
  event_type: string | null;
  guest_count: number | null;
  budget: number | null;
  categories: ScopeCategory[];
  checklist: ChecklistItem[];
  budget_skeleton: BudgetLine[];
  notes: string;
};

/** Category dictionary: category key -> trigger keywords + default budget pct. */
const CATEGORY_DICT: { key: string; label: string; keywords: string[]; pct: number }[] = [
  { key: "venue", label: "Venue", keywords: ["venue", "space", "location", "ballroom", "hall", "estate", "rooftop"], pct: 0.3 },
  { key: "catering", label: "Catering", keywords: ["catering", "caterer", "food", "dinner", "lunch", "menu", "chef", "buffet"], pct: 0.22 },
  { key: "bar", label: "Bar and Beverage", keywords: ["bar", "bartender", "drinks", "cocktail", "wine", "beverage", "open bar"], pct: 0.08 },
  { key: "photography", label: "Photography", keywords: ["photo", "photographer", "photography", "headshot"], pct: 0.07 },
  { key: "videography", label: "Videography", keywords: ["video", "videographer", "film", "highlight reel"], pct: 0.05 },
  { key: "florals", label: "Florals and Decor", keywords: ["flower", "floral", "florist", "decor", "centerpiece", "arrangement"], pct: 0.08 },
  { key: "music", label: "Music and Entertainment", keywords: ["dj", "band", "music", "entertainment", "live music", "performer"], pct: 0.06 },
  { key: "av", label: "AV and Production", keywords: ["av", "audio", "visual", "lighting", "sound", "stage", "screen", "projector"], pct: 0.05 },
  { key: "rentals", label: "Rentals and Furniture", keywords: ["rental", "tent", "table", "chair", "lounge", "furniture", "linens"], pct: 0.04 },
  { key: "planning", label: "Planning and Coordination", keywords: ["planner", "coordinator", "coordination", "day-of", "month-of"], pct: 0.04 },
  { key: "transport", label: "Transportation", keywords: ["transport", "shuttle", "limo", "valet", "bus", "car service"], pct: 0.02 },
  { key: "cake", label: "Cake and Desserts", keywords: ["cake", "dessert", "pastry", "sweets", "bakery"], pct: 0.02 },
];

const EVENT_TYPE_HINTS: { type: string; keywords: string[] }[] = [
  { type: "wedding", keywords: ["wedding", "bride", "groom", "ceremony", "reception"] },
  { type: "corporate", keywords: ["corporate", "conference", "summit", "offsite", "company", "team building"] },
  { type: "gala", keywords: ["gala", "fundraiser", "benefit", "charity", "awards"] },
  { type: "birthday", keywords: ["birthday", "anniversary", "milestone"] },
  { type: "social", keywords: ["party", "celebration", "shower", "reunion", "social"] },
];

function guessGuestCount(text: string): number | null {
  // matches "150 guests", "for 200 people", "~80 attendees"
  const m = text.match(/(\d{2,5})\s*(?:guests?|people|attendees?|pax|heads?)/i);
  if (m) return Number(m[1]);
  return null;
}

function guessBudget(text: string): number | null {
  // matches "$25,000", "25k budget", "budget of 40000"
  const k = text.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*k\b/i);
  if (k) return Number(k[1].replace(/,/g, "")) * 1000;
  const dollars = text.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d{4,})/);
  if (dollars) return Number(dollars[1].replace(/,/g, ""));
  return null;
}

/**
 * Turn a plain-English event description into a structured scope: detected
 * categories (with confidence), a checklist, and a budget skeleton. Pure and
 * deterministic. Venue is always seeded since every event needs a space.
 */
export function buildEventScope(
  description: string,
  opts: { guest_count?: number | null; budget?: number | null; event_type?: string | null } = {},
): EventScope {
  const text = (description || "").toLowerCase();

  // Event type
  let eventType = opts.event_type ?? null;
  if (!eventType) {
    for (const h of EVENT_TYPE_HINTS) {
      if (h.keywords.some((k) => text.includes(k))) {
        eventType = h.type;
        break;
      }
    }
  }

  // Categories
  const detected: ScopeCategory[] = [];
  for (const c of CATEGORY_DICT) {
    const matched = c.keywords.filter((k) => text.includes(k));
    if (matched.length > 0) {
      detected.push({
        category: c.key,
        label: c.label,
        confidence: clamp(0.5 + matched.length * 0.2, 0, 1),
        matched,
      });
    }
  }
  // Always include venue + catering for full events if none detected those.
  const have = new Set(detected.map((d) => d.category));
  if (!have.has("venue")) {
    detected.unshift({ category: "venue", label: "Venue", confidence: 0.5, matched: [] });
  }
  if (eventType && eventType !== "corporate" && !have.has("catering")) {
    detected.push({ category: "catering", label: "Catering", confidence: 0.4, matched: [] });
  }

  // Checklist (one core item per detected category)
  const checklist: ChecklistItem[] = detected.map((d) => ({
    label: `Source and confirm ${d.label.toLowerCase()}`,
    category: d.category,
    done: false,
  }));

  // Budget skeleton: distribute the budget across detected categories using the
  // dictionary pcts, re-normalized to the categories actually present.
  const budget = opts.budget ?? guessBudget(description) ?? null;
  const dictByKey = new Map(CATEGORY_DICT.map((c) => [c.key, c]));
  const totalPct =
    detected.reduce((s, d) => s + (dictByKey.get(d.category)?.pct ?? 0.03), 0) || 1;
  const budget_skeleton: BudgetLine[] = detected.map((d) => {
    const rawPct = dictByKey.get(d.category)?.pct ?? 0.03;
    const pct = Math.round((rawPct / totalPct) * 1000) / 1000;
    return {
      category: d.category,
      label: d.label,
      pct,
      amount: budget != null ? Math.round(budget * pct) : 0,
    };
  });

  return {
    event_type: eventType,
    guest_count: opts.guest_count ?? guessGuestCount(description),
    budget,
    categories: detected,
    checklist,
    budget_skeleton,
    notes:
      "This scope is generated from your description. Adjust categories and budget before sourcing vendors.",
  };
}

// ---------------------------------------------------------------------------
// Budget intelligence (blueprint 26.3)
// ---------------------------------------------------------------------------
export type BudgetCategoryInput = { category: string; label?: string; allocated: number };
export type QuoteInput = { category: string; vendor_org_id?: string; vendor_name?: string; total: number };

export type BudgetCategoryStatus = {
  category: string;
  label: string;
  allocated: number;
  quoted: number;
  variance: number; // allocated - quoted (negative = over)
  status: "ok" | "underfunded" | "no_quotes" | "over_allocated";
  note: string;
};

export type BudgetReport = {
  total_allocated: number;
  total_quoted: number;
  variance: number;
  underfunded: BudgetCategoryStatus[];
  categories: BudgetCategoryStatus[];
};

/**
 * Build a budget report by category: compares allocated budget against the
 * lowest available quote per category and flags underfunded categories.
 */
export function buildBudget(
  allocations: BudgetCategoryInput[],
  quotes: QuoteInput[],
): BudgetReport {
  const lowestByCat = new Map<string, number>();
  for (const qte of quotes) {
    const cur = lowestByCat.get(qte.category);
    if (cur == null || qte.total < cur) lowestByCat.set(qte.category, qte.total);
  }

  const categories: BudgetCategoryStatus[] = allocations.map((a) => {
    const quoted = lowestByCat.get(a.category);
    const allocated = Number(a.allocated) || 0;
    if (quoted == null) {
      return {
        category: a.category,
        label: a.label ?? a.category,
        allocated,
        quoted: 0,
        variance: allocated,
        status: "no_quotes",
        note: "No quotes received yet.",
      };
    }
    const variance = allocated - quoted;
    let status: BudgetCategoryStatus["status"] = "ok";
    let note = "Within budget.";
    if (variance < 0) {
      status = "underfunded";
      note = `Lowest quote exceeds budget by ${Math.abs(variance)}.`;
    } else if (variance / Math.max(allocated, 1) > 0.5) {
      status = "over_allocated";
      note = "Allocation is well above quoted cost; consider reallocating.";
    }
    return { category: a.category, label: a.label ?? a.category, allocated, quoted, variance, status, note };
  });

  const total_allocated = categories.reduce((s, c) => s + c.allocated, 0);
  const total_quoted = categories.reduce((s, c) => s + c.quoted, 0);
  return {
    total_allocated,
    total_quoted,
    variance: total_allocated - total_quoted,
    underfunded: categories.filter((c) => c.status === "underfunded"),
    categories,
  };
}

export type QuoteComparison = {
  category: string;
  count: number;
  lowest: QuoteInput | null;
  highest: QuoteInput | null;
  average: number;
  spread: number; // highest - lowest
};

/** Compare quotes within each category (count, low/high, average, spread). */
export function compareQuotes(quotes: QuoteInput[]): QuoteComparison[] {
  const byCat = new Map<string, QuoteInput[]>();
  for (const qte of quotes) {
    const list = byCat.get(qte.category) ?? [];
    list.push(qte);
    byCat.set(qte.category, list);
  }
  const out: QuoteComparison[] = [];
  for (const [category, list] of byCat) {
    const sorted = [...list].sort((a, b) => a.total - b.total);
    const lowest = sorted[0] ?? null;
    const highest = sorted[sorted.length - 1] ?? null;
    const average =
      sorted.length > 0 ? Math.round(sorted.reduce((s, x) => s + x.total, 0) / sorted.length) : 0;
    out.push({
      category,
      count: sorted.length,
      lowest,
      highest,
      average,
      spread: lowest && highest ? highest.total - lowest.total : 0,
    });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category));
}

// ---------------------------------------------------------------------------
// Risk detection (blueprint 26.4)
// ---------------------------------------------------------------------------
export type RiskInput = {
  date_time?: string | null;
  status?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  required_categories?: string[];
  filled_categories?: string[];
  total_quoted?: number | null;
  missing_documents?: number; // for confirmed vendors
  overdue_invoices?: number;
  unpaid_deposits?: number;
  now?: Date; // injectable for deterministic tests
};

export type RiskSignal = {
  key: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
};

/** Detect deterministic risk signals for an event (blueprint 26.4). */
export function detectRisks(input: RiskInput): { score: number; signals: RiskSignal[] } {
  const signals: RiskSignal[] = [];
  const now = input.now ?? new Date();

  // Days until event
  let days: number | null = null;
  if (input.date_time) {
    const dt = new Date(input.date_time).getTime();
    if (Number.isFinite(dt)) days = Math.ceil((dt - now.getTime()) / 86_400_000);
  }

  // Unfilled categories close to the date
  const required = input.required_categories ?? [];
  const filled = new Set((input.filled_categories ?? []).map(norm));
  const open = required.filter((c) => !filled.has(norm(c)));
  if (open.length > 0) {
    const close = days != null && days <= 30;
    signals.push({
      key: "open_categories",
      severity: close ? "high" : open.length > 2 ? "medium" : "low",
      title: `${open.length} categor${open.length === 1 ? "y" : "ies"} still unfilled`,
      detail: `${open.join(", ")} ${days != null ? `with ${days} day${days === 1 ? "" : "s"} to the event.` : "still need vendors."}`,
    });
  }

  // Tight timeline overall
  if (days != null && days <= 14 && (input.status ?? "") !== "completed") {
    signals.push({
      key: "tight_timeline",
      severity: days <= 7 ? "high" : "medium",
      title: "Tight timeline",
      detail: `Only ${days} day${days === 1 ? "" : "s"} until the event.`,
    });
  }

  // Budget overrun
  if (input.budget != null && input.total_quoted != null && input.total_quoted > input.budget) {
    const over = input.total_quoted - input.budget;
    signals.push({
      key: "over_budget",
      severity: over / Math.max(input.budget, 1) > 0.15 ? "high" : "medium",
      title: "Quotes exceed budget",
      detail: `Quoted total is over budget by ${over}.`,
    });
  }

  // Document gaps
  if (num(input.missing_documents) > 0) {
    signals.push({
      key: "missing_documents",
      severity: "medium",
      title: `${input.missing_documents} document gap${num(input.missing_documents) === 1 ? "" : "s"}`,
      detail: "Confirmed vendors are missing required documents.",
    });
  }

  // Money risks
  if (num(input.overdue_invoices) > 0) {
    signals.push({
      key: "overdue_invoices",
      severity: "high",
      title: `${input.overdue_invoices} overdue invoice${num(input.overdue_invoices) === 1 ? "" : "s"}`,
      detail: "Overdue balances can stall production.",
    });
  }
  if (num(input.unpaid_deposits) > 0 && days != null && days <= 30) {
    signals.push({
      key: "unpaid_deposits",
      severity: "medium",
      title: `${input.unpaid_deposits} unpaid deposit${num(input.unpaid_deposits) === 1 ? "" : "s"}`,
      detail: "Unpaid deposits leave bookings unconfirmed close to the date.",
    });
  }

  const weight = { low: 10, medium: 25, high: 45 } as const;
  const score = clamp(
    signals.reduce((s, x) => s + weight[x.severity], 0),
    0,
    100,
  );
  return { score, signals };
}

// ---------------------------------------------------------------------------
// Event Recommendation Engine (Venue Intelligence addendum - Phase 7)
//
// `recommendForEvent` is a PURE, DETERMINISTIC function: given the four planning
// inputs (venue type, event type, budget, guest count) it returns ranked vendor
// service categories and sponsor categories, with a short reason per item. Same
// inputs always produce the same output. No DB work, no network, no AI calls.
//
// Ranking is built from cheap heuristics only:
//   - base affinity per service category (does this kind of event usually need it),
//   - venue/event-type affinity bumps (e.g. outdoor venues raise transportation),
//   - budget-tier and guest-count-band bumps (bigger jobs raise production/AV),
// then normalized to a 0..100 score and sorted high to low.
//
// AI RE-RANK SEAM (intentionally NOT called here): a future enhancement could
// re-rank these deterministic results with an LLM. Per Alyssa's cost-control
// rules that must be feature-flagged, manual-triggered, cached by a hash of the
// inputs, and rate-limited. The `aiRerank` option below is the documented plug
// point. When false/undefined (the default) the function stays fully
// deterministic and free, which is what the /recommend route uses today.
// ---------------------------------------------------------------------------

/** Vendor service categories the engine ranks (addendum scope A). */
export const RECOMMEND_SERVICE_CATEGORIES = [
  "av",
  "print",
  "fabrication",
  "furniture",
  "floral",
  "entertainment",
  "transportation",
] as const;
export type RecommendServiceCategory = (typeof RECOMMEND_SERVICE_CATEGORIES)[number];

/** Sponsor categories the engine surfaces alongside vendors. */
export const RECOMMEND_SPONSOR_CATEGORIES = [
  "beverage",
  "technology",
  "automotive",
  "financial",
  "hospitality",
  "fashion",
  "wellness",
  "local_business",
] as const;
export type RecommendSponsorCategory = (typeof RECOMMEND_SPONSOR_CATEGORIES)[number];

export type RecommendInput = {
  venueType?: string | null; // ballroom | hotel | outdoor | rooftop | warehouse | conference | gallery | stadium ...
  eventType?: string | null; // wedding | corporate | gala | conference | concert | launch | trade_show | social ...
  budget?: number | null; // total event budget in dollars
  guestCount?: number | null; // expected attendance
  /**
   * AI re-rank seam. NOT used by the deterministic engine and ignored today; it
   * exists so a feature-flagged, cached, rate-limited AI re-rank can be wired in
   * later WITHOUT changing this signature or the route contract.
   */
  aiRerank?: boolean;
};

export type RecommendedCategory = {
  category: RecommendServiceCategory;
  label: string;
  score: number; // 0..100
  reasons: string[];
};

export type RecommendedSponsor = {
  category: RecommendSponsorCategory;
  label: string;
  score: number; // 0..100
  reasons: string[];
};

export type RecommendResult = {
  input: {
    venueType: string | null;
    eventType: string | null;
    budget: number | null;
    guestCount: number | null;
    budgetTier: "unknown" | "modest" | "mid" | "premium" | "flagship";
    guestBand: "unknown" | "intimate" | "small" | "medium" | "large" | "massive";
  };
  vendorCategories: RecommendedCategory[];
  sponsors: RecommendedSponsor[];
  ai_reranked: boolean; // always false today (deterministic only)
  notes: string;
};

const SERVICE_LABELS: Record<RecommendServiceCategory, string> = {
  av: "AV and Production",
  print: "Print and Signage",
  fabrication: "Fabrication and Build",
  furniture: "Furniture and Rentals",
  floral: "Floral and Decor",
  entertainment: "Entertainment",
  transportation: "Transportation",
};

const SPONSOR_LABELS: Record<RecommendSponsorCategory, string> = {
  beverage: "Beverage",
  technology: "Technology",
  automotive: "Automotive",
  financial: "Financial Services",
  hospitality: "Hospitality and Travel",
  fashion: "Fashion and Beauty",
  wellness: "Health and Wellness",
  local_business: "Local Business",
};

/** Base affinity (0..1) for each service category before any bumps. */
const SERVICE_BASE: Record<RecommendServiceCategory, number> = {
  av: 0.5,
  print: 0.45,
  fabrication: 0.3,
  furniture: 0.5,
  floral: 0.4,
  entertainment: 0.45,
  transportation: 0.3,
};

/** Event-type affinity bumps (added to base, can be negative). */
const EVENT_AFFINITY: Record<string, Partial<Record<RecommendServiceCategory, number>>> = {
  wedding: { floral: 0.4, entertainment: 0.3, furniture: 0.2, transportation: 0.15, print: 0.1 },
  corporate: { av: 0.4, print: 0.25, furniture: 0.2, fabrication: 0.15, transportation: 0.1 },
  conference: { av: 0.45, print: 0.3, fabrication: 0.25, furniture: 0.2, transportation: 0.1 },
  trade_show: { fabrication: 0.45, print: 0.35, av: 0.25, furniture: 0.2 },
  gala: { floral: 0.35, entertainment: 0.35, av: 0.25, furniture: 0.2, transportation: 0.15 },
  concert: { av: 0.5, entertainment: 0.45, fabrication: 0.25, transportation: 0.15 },
  launch: { av: 0.35, fabrication: 0.35, print: 0.3, entertainment: 0.2 },
  social: { entertainment: 0.3, floral: 0.2, furniture: 0.2 },
};

/** Venue-type affinity bumps (added to base, can be negative). */
const VENUE_AFFINITY: Record<string, Partial<Record<RecommendServiceCategory, number>>> = {
  outdoor: { furniture: 0.3, fabrication: 0.25, transportation: 0.25, floral: 0.15 },
  rooftop: { furniture: 0.25, transportation: 0.2, floral: 0.1 },
  warehouse: { fabrication: 0.35, furniture: 0.25, av: 0.2 },
  ballroom: { floral: 0.2, furniture: 0.15, av: 0.15 },
  hotel: { furniture: 0.15, transportation: 0.15, print: 0.1 },
  conference: { av: 0.25, print: 0.2, fabrication: 0.15 },
  gallery: { print: 0.2, floral: 0.15, furniture: 0.1 },
  stadium: { fabrication: 0.3, av: 0.3, transportation: 0.25, print: 0.2 },
};

/** Sponsor affinity per event type (base 0). */
const SPONSOR_EVENT_AFFINITY: Record<string, Partial<Record<RecommendSponsorCategory, number>>> = {
  wedding: { beverage: 0.4, hospitality: 0.35, fashion: 0.3, wellness: 0.2, local_business: 0.2 },
  corporate: { technology: 0.45, financial: 0.4, automotive: 0.25, hospitality: 0.2 },
  conference: { technology: 0.5, financial: 0.35, automotive: 0.2, hospitality: 0.2 },
  trade_show: { technology: 0.45, automotive: 0.3, financial: 0.25, local_business: 0.2 },
  gala: { financial: 0.4, automotive: 0.35, beverage: 0.3, fashion: 0.3, hospitality: 0.2 },
  concert: { beverage: 0.5, technology: 0.3, fashion: 0.25, automotive: 0.2 },
  launch: { technology: 0.45, fashion: 0.35, beverage: 0.3, automotive: 0.25 },
  social: { beverage: 0.35, local_business: 0.3, wellness: 0.2, fashion: 0.2 },
};

function budgetTier(budget: number | null): RecommendResult["input"]["budgetTier"] {
  if (budget == null || !Number.isFinite(budget) || budget <= 0) return "unknown";
  if (budget < 15_000) return "modest";
  if (budget < 75_000) return "mid";
  if (budget < 250_000) return "premium";
  return "flagship";
}

function guestBand(guests: number | null): RecommendResult["input"]["guestBand"] {
  if (guests == null || !Number.isFinite(guests) || guests <= 0) return "unknown";
  if (guests < 50) return "intimate";
  if (guests < 150) return "small";
  if (guests < 400) return "medium";
  if (guests < 1500) return "large";
  return "massive";
}

/**
 * Deterministic Event Recommendation Engine. Returns ranked vendor service
 * categories and sponsor categories for the given planning inputs. No AI calls.
 */
export function recommendForEvent(input: RecommendInput): RecommendResult {
  const venueType = norm(input.venueType) || null;
  const eventType = norm(input.eventType) || null;
  const budget = typeof input.budget === "number" && Number.isFinite(input.budget) ? input.budget : null;
  const guestCount =
    typeof input.guestCount === "number" && Number.isFinite(input.guestCount) ? input.guestCount : null;

  const tier = budgetTier(budget);
  const band = guestBand(guestCount);

  const evMap = eventType ? EVENT_AFFINITY[eventType] ?? {} : {};
  const vnMap = venueType ? VENUE_AFFINITY[venueType] ?? {} : {};

  // Budget-tier bump per category (premium/flagship events lean into production,
  // fabrication, floral, entertainment; modest budgets stay lean).
  const tierBump: Record<RecommendResult["input"]["budgetTier"], Partial<Record<RecommendServiceCategory, number>>> = {
    unknown: {},
    modest: { fabrication: -0.1, av: -0.05 },
    mid: { av: 0.05, furniture: 0.05 },
    premium: { av: 0.15, fabrication: 0.15, floral: 0.1, entertainment: 0.1 },
    flagship: { av: 0.25, fabrication: 0.25, floral: 0.15, entertainment: 0.2, transportation: 0.1 },
  };
  // Guest-count band bump: bigger crowds raise AV, transportation, furniture.
  const bandBump: Record<RecommendResult["input"]["guestBand"], Partial<Record<RecommendServiceCategory, number>>> = {
    unknown: {},
    intimate: { transportation: -0.1, fabrication: -0.05 },
    small: {},
    medium: { furniture: 0.1, av: 0.1, transportation: 0.05 },
    large: { furniture: 0.2, av: 0.2, transportation: 0.15, print: 0.1 },
    massive: { furniture: 0.25, av: 0.25, transportation: 0.25, fabrication: 0.15, print: 0.15 },
  };

  const vendorCategories: RecommendedCategory[] = RECOMMEND_SERVICE_CATEGORIES.map((cat) => {
    const reasons: string[] = [];
    let raw = SERVICE_BASE[cat];

    const ev = evMap[cat];
    if (ev) {
      raw += ev;
      if (ev > 0 && eventType) reasons.push(`Common for ${eventType.replace(/_/g, " ")} events`);
    }
    const vn = vnMap[cat];
    if (vn) {
      raw += vn;
      if (vn > 0 && venueType) reasons.push(`Fits a ${venueType.replace(/_/g, " ")} venue`);
    }
    const tb = tierBump[tier][cat];
    if (tb) {
      raw += tb;
      if (tb > 0) reasons.push(`${tier} budget supports it`);
    }
    const bb = bandBump[band][cat];
    if (bb) {
      raw += bb;
      if (bb > 0) reasons.push(`Scales with a ${band} guest count`);
    }
    if (reasons.length === 0) reasons.push("Standard option for most events");

    const score = Math.round(clamp(raw, 0, 1) * 100);
    return { category: cat, label: SERVICE_LABELS[cat], score, reasons };
  }).sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const sponsorMap = eventType ? SPONSOR_EVENT_AFFINITY[eventType] ?? {} : {};
  const sponsors: RecommendedSponsor[] = RECOMMEND_SPONSOR_CATEGORIES.map((cat) => {
    const reasons: string[] = [];
    // Sponsors start lower than vendors; affinity + audience size drive them.
    let raw = 0.2;
    const aff = sponsorMap[cat];
    if (aff) {
      raw += aff;
      if (aff > 0 && eventType) reasons.push(`Active sponsor of ${eventType.replace(/_/g, " ")} events`);
    }
    // Larger audiences justify bigger sponsor categories (technology, automotive,
    // financial, beverage); local_business indexes up for intimate/small events.
    if (band === "large" || band === "massive") {
      if (cat === "technology" || cat === "automotive" || cat === "financial" || cat === "beverage") {
        raw += 0.2;
        reasons.push("Large audience attracts national sponsors");
      }
      if (cat === "local_business") raw -= 0.1;
    } else if (band === "intimate" || band === "small") {
      if (cat === "local_business") {
        raw += 0.2;
        reasons.push("Local sponsors fit an intimate audience");
      }
    }
    // Premium/flagship budgets signal a higher-profile audience for premium brands.
    if ((tier === "premium" || tier === "flagship") && (cat === "automotive" || cat === "financial" || cat === "fashion")) {
      raw += 0.1;
      reasons.push("Upscale audience for premium brands");
    }
    if (reasons.length === 0) reasons.push("Possible fit depending on audience");

    const score = Math.round(clamp(raw, 0, 1) * 100);
    return { category: cat, label: SPONSOR_LABELS[cat], score, reasons };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  return {
    input: {
      venueType,
      eventType,
      budget,
      guestCount,
      budgetTier: tier,
      guestBand: band,
    },
    vendorCategories,
    sponsors,
    ai_reranked: false, // deterministic only; AI re-rank seam not invoked
    notes:
      "Recommendations are generated deterministically from venue type, event type, budget, and guest count. Use them as a starting point and adjust before sourcing.",
  };
}
