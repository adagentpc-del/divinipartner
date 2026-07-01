/**
 * Friction Elimination - U1 Client Event Intelligence Assistant.
 *
 * Pure, deterministic plan generator. Given a structured intake (event type,
 * guest count, budget, venue type, experience notes, indoor/outdoor, date) it
 * returns a full starter plan: recommended + required vendors, recommended
 * sponsorships, a budget breakdown, a high-level timeline, required approvals,
 * and required documents.
 *
 * Vendor and sponsor ranking REUSES the existing deterministic engine
 * `recommendForEvent` from lib/recommend.ts (single source of truth for that
 * scoring). This module layers the "required vs recommended" split, the budget
 * math, and the planning scaffolding on top. Same inputs always produce the
 * same output. No DB work, no network, no AI calls.
 *
 * AI RE-RANK SEAM (intentionally NOT called here): a future enhancement could
 * pass `intake` plus the deterministic plan to an LLM to re-order or annotate
 * the recommendations. Per the cost-control rules that must be feature-flagged,
 * manual-triggered, cached by a hash of the inputs, and rate-limited. The
 * `aiRerank` flag on the intake is the documented plug point; today it is
 * ignored and the function stays fully deterministic and free.
 */
import {
  recommendForEvent,
  type RecommendResult,
  type RecommendedCategory,
  type RecommendedSponsor,
} from "./recommend.js";

export type EventIntake = {
  eventType?: string | null;
  guestCount?: number | null;
  budget?: number | null;
  venueType?: string | null;
  experience?: string | null; // free-text desired experience / vibe
  indoorOutdoor?: "indoor" | "outdoor" | "both" | string | null;
  eventDate?: string | null; // ISO date string
  /** AI re-rank seam. Ignored today; see module header. */
  aiRerank?: boolean;
};

export type PlanVendor = {
  category: string;
  label: string;
  score: number; // 0..100 (from recommendForEvent)
  required: boolean;
  reasons: string[];
};

export type PlanSponsorship = {
  category: string;
  label: string;
  score: number;
  reasons: string[];
};

export type BudgetBreakdownLine = {
  category: string;
  label: string;
  pct: number; // 0..1 share of total budget
  amount: number; // dollars (0 when no budget provided)
};

export type TimelineMilestone = {
  key: string;
  label: string;
  offsetDays: number; // days before the event (positive = before)
  dueDate: string | null; // ISO date when eventDate is known, else null
  detail: string;
};

export type EventPlan = {
  input: {
    eventType: string | null;
    guestCount: number | null;
    budget: number | null;
    venueType: string | null;
    experience: string | null;
    indoorOutdoor: string | null;
    eventDate: string | null;
    budgetTier: RecommendResult["input"]["budgetTier"];
    guestBand: RecommendResult["input"]["guestBand"];
  };
  recommendedVendors: PlanVendor[];
  requiredVendors: PlanVendor[];
  recommendedSponsorships: PlanSponsorship[];
  budgetBreakdown: BudgetBreakdownLine[];
  timeline: TimelineMilestone[];
  requiredApprovals: string[];
  requiredDocuments: string[];
  ai_reranked: boolean; // always false today (deterministic only)
  notes: string;
};

const norm = (s?: string | null): string => (s ?? "").trim().toLowerCase();

// A vendor category is treated as REQUIRED (a hard need for the event to
// happen) once its deterministic recommend score is at or above this floor, or
// when it appears in the per-event-type required set below. Everything else is
// a recommendation.
const REQUIRED_SCORE_FLOOR = 70;

/** Vendor categories that are non-negotiable for a given event type. */
const REQUIRED_BY_EVENT_TYPE: Record<string, string[]> = {
  wedding: ["floral", "entertainment", "furniture"],
  corporate: ["av", "furniture"],
  conference: ["av", "print", "furniture"],
  trade_show: ["fabrication", "print"],
  gala: ["av", "floral"],
  concert: ["av", "entertainment"],
  launch: ["av"],
  social: ["entertainment"],
};

/** Budget allocation weights per vendor category (re-normalized to those present). */
const CATEGORY_BUDGET_WEIGHT: Record<string, number> = {
  av: 0.18,
  print: 0.06,
  fabrication: 0.14,
  furniture: 0.14,
  floral: 0.12,
  entertainment: 0.16,
  transportation: 0.08,
};

function isRequired(eventType: string | null, cat: RecommendedCategory): boolean {
  if (cat.score >= REQUIRED_SCORE_FLOOR) return true;
  if (eventType && (REQUIRED_BY_EVENT_TYPE[eventType] ?? []).includes(cat.category)) return true;
  return false;
}

function buildBudgetBreakdown(
  budget: number | null,
  vendors: RecommendedCategory[],
): BudgetBreakdownLine[] {
  // Venue is always a line even though it is not one of the vendor service
  // categories the recommend engine ranks: every event needs a space.
  const lines: { category: string; label: string; weight: number }[] = [
    { category: "venue", label: "Venue", weight: 0.3 },
  ];
  for (const v of vendors) {
    lines.push({
      category: v.category,
      label: v.label,
      weight: CATEGORY_BUDGET_WEIGHT[v.category] ?? 0.05,
    });
  }
  // Always reserve a contingency line so the plan is realistic.
  lines.push({ category: "contingency", label: "Contingency and fees", weight: 0.08 });

  const totalWeight = lines.reduce((s, l) => s + l.weight, 0) || 1;
  return lines.map((l) => {
    const pct = Math.round((l.weight / totalWeight) * 1000) / 1000;
    return {
      category: l.category,
      label: l.label,
      pct,
      amount: budget != null ? Math.round(budget * pct) : 0,
    };
  });
}

/** Add days (can be negative) to an ISO date and return an ISO date string. */
function shiftDate(iso: string, deltaDays: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function buildTimeline(eventDate: string | null): TimelineMilestone[] {
  // Offsets are days BEFORE the event. Generic, deterministic planning spine.
  const spine: { key: string; label: string; offsetDays: number; detail: string }[] = [
    { key: "secure_venue", label: "Secure venue and date", offsetDays: 120, detail: "Confirm the venue, sign the venue agreement, place the hold." },
    { key: "book_core_vendors", label: "Book core vendors", offsetDays: 90, detail: "Award required vendors and collect signed quotes and deposits." },
    { key: "insurance_permits", label: "Insurance and permits", offsetDays: 60, detail: "Collect certificates of insurance and any required permits." },
    { key: "guest_list", label: "Finalize guest list and invites", offsetDays: 45, detail: "Lock the guest list, send invitations, open RSVP tracking." },
    { key: "confirm_details", label: "Confirm details and timeline", offsetDays: 21, detail: "Confirm counts, build the run-of-show, distribute the timeline." },
    { key: "final_payments", label: "Final payments and walkthrough", offsetDays: 7, detail: "Settle balances, complete the venue walkthrough, confirm load-in." },
    { key: "event_day", label: "Event day", offsetDays: 0, detail: "Execute the run-of-show; on-site coordination and check-in." },
  ];
  return spine.map((m) => ({
    key: m.key,
    label: m.label,
    offsetDays: m.offsetDays,
    dueDate: eventDate ? shiftDate(eventDate, -m.offsetDays) : null,
    detail: m.detail,
  }));
}

function buildRequiredApprovals(intake: EventIntake, eventType: string | null): string[] {
  const out = new Set<string>();
  out.add("Venue booking approval and signed venue agreement");
  out.add("Vendor selection sign-off by the event owner");
  const io = norm(intake.indoorOutdoor);
  if (io === "outdoor" || io === "both") {
    out.add("Outdoor event and tent permits (where applicable)");
    out.add("Weather contingency plan approval");
  }
  if (eventType === "concert" || eventType === "trade_show" || eventType === "gala") {
    out.add("Security plan approval");
  }
  if (eventType === "wedding" || eventType === "gala" || eventType === "social") {
    out.add("Alcohol service and bar permit approval");
  }
  const band = guestBandLocal(intake.guestCount);
  if (band === "large" || band === "massive") {
    out.add("Crowd management and fire-marshal capacity approval");
  }
  return Array.from(out);
}

function buildRequiredDocuments(intake: EventIntake, eventType: string | null): string[] {
  const out = new Set<string>();
  out.add("Signed venue agreement");
  out.add("Certificates of insurance (COI) for the event and each vendor");
  out.add("Signed vendor contracts and quotes");
  out.add("Deposit and payment receipts");
  const io = norm(intake.indoorOutdoor);
  if (io === "outdoor" || io === "both") out.add("Outdoor and tent permits");
  if (eventType === "wedding" || eventType === "gala" || eventType === "social") {
    out.add("Liquor liability documentation");
  }
  if (eventType === "concert" || eventType === "trade_show") {
    out.add("Production and rigging safety documentation");
  }
  out.add("Final guest list and run-of-show");
  return Array.from(out);
}

// Local copies of the band classifier so this module does not depend on the
// recommend engine's private helpers. Kept in sync intentionally.
function guestBandLocal(guests?: number | null): RecommendResult["input"]["guestBand"] {
  if (guests == null || !Number.isFinite(guests) || guests <= 0) return "unknown";
  if (guests < 50) return "intimate";
  if (guests < 150) return "small";
  if (guests < 400) return "medium";
  if (guests < 1500) return "large";
  return "massive";
}

/**
 * Deterministic event plan generator. Reuses recommendForEvent for the vendor
 * and sponsor ranking, then layers required/recommended split, budget
 * breakdown, timeline, approvals, and document checklist on top.
 */
export function generatePlan(intake: EventIntake): EventPlan {
  const eventType = norm(intake.eventType) || null;

  const rec: RecommendResult = recommendForEvent({
    venueType: intake.venueType ?? null,
    eventType: intake.eventType ?? null,
    budget: intake.budget ?? null,
    guestCount: intake.guestCount ?? null,
  });

  const allVendors: PlanVendor[] = rec.vendorCategories.map((c: RecommendedCategory) => ({
    category: c.category,
    label: c.label,
    score: c.score,
    required: isRequired(eventType, c),
    reasons: c.reasons,
  }));

  const requiredVendors = allVendors.filter((v) => v.required);
  const recommendedVendors = allVendors.filter((v) => !v.required);

  const recommendedSponsorships: PlanSponsorship[] = rec.sponsors
    .slice(0, 6)
    .map((s: RecommendedSponsor) => ({
      category: s.category,
      label: s.label,
      score: s.score,
      reasons: s.reasons,
    }));

  const budget =
    typeof intake.budget === "number" && Number.isFinite(intake.budget) ? intake.budget : null;
  const budgetBreakdown = buildBudgetBreakdown(budget, rec.vendorCategories);

  const eventDate =
    intake.eventDate && !Number.isNaN(new Date(intake.eventDate).getTime())
      ? intake.eventDate
      : null;
  const timeline = buildTimeline(eventDate);

  return {
    input: {
      eventType: rec.input.eventType,
      guestCount: rec.input.guestCount,
      budget: rec.input.budget,
      venueType: rec.input.venueType,
      experience: (intake.experience ?? "").trim() || null,
      indoorOutdoor: norm(intake.indoorOutdoor) || null,
      eventDate,
      budgetTier: rec.input.budgetTier,
      guestBand: rec.input.guestBand,
    },
    recommendedVendors,
    requiredVendors,
    recommendedSponsorships,
    budgetBreakdown,
    timeline,
    requiredApprovals: buildRequiredApprovals(intake, eventType),
    requiredDocuments: buildRequiredDocuments(intake, eventType),
    ai_reranked: false, // deterministic only; AI re-rank seam not invoked
    notes:
      "This plan is generated deterministically from your intake and is a starting point. Confirm vendor categories, budget, and the timeline before sourcing.",
  };
}
