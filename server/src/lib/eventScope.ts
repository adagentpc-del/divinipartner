/**
 * Event Scope Builder (blueprint 26.1): plain-English event description ->
 * structured scope (detected vendor categories, a checklist, and a budget
 * skeleton). PURE, dependency-free (no DB pool, no config, no node modules) so
 * it can be unit tested in isolation, same rationale as pricingMath.ts.
 *
 * Extracted from recommend.ts, which re-exports these names so existing
 * callers (routes/intelligence.ts) are unaffected.
 *
 * Zero em dashes.
 */

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

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
