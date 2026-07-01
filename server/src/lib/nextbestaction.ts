/**
 * Phase 7 - AI next-best-action (blueprint 25). Deterministic per-role prompt
 * generation from an org's current state. Pure logic: the db layer gathers the
 * state snapshot and passes it in; this module ranks the prompts.
 *
 * Each action has a stable `key` (so dismissals persist), a `title`, a `cta`
 * label, a `link` (SPA route the dashboards navigate to), a numeric `weight`
 * used for ranking, and a `reason` explaining why it surfaced. The output is a
 * ranked list (highest weight first).
 */

export type NbaRole = "venue" | "vendor" | "supplier" | "installer" | "planner" | "client";

/** A snapshot of the things that drive prompts. All optional; absent = unknown. */
export type OrgStateSnapshot = {
  role: NbaRole;
  // profile / onboarding
  profilePublished?: boolean;
  documentsReady?: number; // count of present, unexpired docs
  servicesListed?: boolean;
  // marketplace activity
  openBids?: number; // bids matched / open to a vendor
  pendingQuotes?: number; // quotes awaiting a decision
  awardedJobs?: number; // jobs to fulfill
  // events
  activeEvents?: number;
  eventsNeedingVendors?: number;
  completedAwaitingReview?: number; // completed events with no review yet
  // money
  overdueInvoices?: number;
  unpaidDeposits?: number;
  // intelligence
  repeatPromptCount?: number; // repeat-relationship prompts available
  underfundedCategories?: number; // budget-intelligence flags
  trustScore?: number | null; // 0..100
};

export type NextBestAction = {
  key: string;
  title: string;
  cta: string;
  link: string;
  weight: number;
  reason: string;
};

const num = (n: number | undefined, fallback = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

/** Shared (any-role) prompts driven by money + reviews + intelligence. */
function sharedActions(s: OrgStateSnapshot): NextBestAction[] {
  const out: NextBestAction[] = [];

  if (num(s.overdueInvoices) > 0) {
    out.push({
      key: "money.overdue",
      title: `Follow up on ${s.overdueInvoices} overdue invoice${num(s.overdueInvoices) === 1 ? "" : "s"}`,
      cta: "Review invoices",
      link: "/invoices",
      weight: 95,
      reason: "Overdue balances reduce cash flow and trust.",
    });
  }
  if (num(s.completedAwaitingReview) > 0) {
    out.push({
      key: "reviews.pending",
      title: `Leave ${s.completedAwaitingReview} post-event review${num(s.completedAwaitingReview) === 1 ? "" : "s"}`,
      cta: "Leave reviews",
      link: "/reviews",
      weight: 60,
      reason: "Fresh reviews strengthen trust scores for everyone you work with.",
    });
  }
  if (num(s.repeatPromptCount) > 0) {
    out.push({
      key: "starred.repeat",
      title: `Star ${s.repeatPromptCount} partner${num(s.repeatPromptCount) === 1 ? "" : "s"} you book repeatedly`,
      cta: "Review prompts",
      link: "/app",
      weight: 45,
      reason: "Preferred partners get prioritized in recommendations.",
    });
  }
  if (num(s.underfundedCategories) > 0) {
    out.push({
      key: "budget.underfunded",
      title: `Resolve ${s.underfundedCategories} underfunded budget categor${num(s.underfundedCategories) === 1 ? "y" : "ies"}`,
      cta: "Open budget",
      link: "/scope-builder",
      weight: 55,
      reason: "Underfunded categories risk last-minute scope and cost surprises.",
    });
  }
  if (s.trustScore != null && s.trustScore < 60 && num(s.documentsReady) < 2) {
    out.push({
      key: "trust.documents",
      title: "Upload core documents to raise your trust score",
      cta: "Upload documents",
      link: "/app",
      weight: 70,
      reason: "Document readiness is a direct input to your trust score.",
    });
  }
  return out;
}

/** Vendor / supplier / installer prompts (blueprint 25.2). */
function vendorActions(s: OrgStateSnapshot): NextBestAction[] {
  const out: NextBestAction[] = [];
  if (s.servicesListed === false) {
    out.push({
      key: "vendor.services",
      title: "List your services and pricing",
      cta: "Add services",
      link: "/app",
      weight: 90,
      reason: "We can only route matched bids once your services are listed.",
    });
  }
  if (num(s.documentsReady) < 2) {
    out.push({
      key: "vendor.docs",
      title: "Upload your COI and W-9",
      cta: "Upload documents",
      link: "/app",
      weight: 85,
      reason: "Both documents are required before you can be awarded work.",
    });
  }
  if (num(s.openBids) > 0) {
    out.push({
      key: "vendor.bids",
      title: `Respond to ${s.openBids} open bid${num(s.openBids) === 1 ? "" : "s"} matched to you`,
      cta: "Browse bids",
      link: "/app",
      weight: 80,
      reason: "Matched bids expire; quoting early wins more work.",
    });
  }
  if (num(s.awardedJobs) > 0) {
    out.push({
      key: "vendor.awarded",
      title: `Move ${s.awardedJobs} awarded job${num(s.awardedJobs) === 1 ? "" : "s"} into production`,
      cta: "Open awarded",
      link: "/app",
      weight: 75,
      reason: "Confirmed jobs need scheduling and documents.",
    });
  }
  return out;
}

/** Venue prompts. */
function venueActions(s: OrgStateSnapshot): NextBestAction[] {
  const out: NextBestAction[] = [];
  if (s.profilePublished === false) {
    out.push({
      key: "venue.profile",
      title: "Publish your venue profile",
      cta: "Edit profile",
      link: "/app",
      weight: 88,
      reason: "A published profile lets clients and planners find and book you.",
    });
  }
  if (num(s.activeEvents) > 0) {
    out.push({
      key: "venue.events",
      title: `Advance ${s.activeEvents} active event${num(s.activeEvents) === 1 ? "" : "s"}`,
      cta: "Open events",
      link: "/app",
      weight: 72,
      reason: "Keep holds, deposits, and itineraries moving.",
    });
  }
  out.push({
    key: "venue.preferred",
    title: "Curate your preferred vendor list",
    cta: "Manage starred",
    link: "/app",
    weight: 40,
    reason: "Preferred vendors speed up sourcing for your bookings.",
  });
  return out;
}

/** Client / planner prompts. */
function clientActions(s: OrgStateSnapshot): NextBestAction[] {
  const out: NextBestAction[] = [];
  if (num(s.activeEvents) === 0) {
    out.push({
      key: "client.create",
      title: "Start your first event with the scope builder",
      cta: "Build scope",
      link: "/scope-builder",
      weight: 86,
      reason: "Describe your event and we will recommend the categories you need.",
    });
  }
  if (num(s.eventsNeedingVendors) > 0) {
    out.push({
      key: "client.recommend",
      title: `Get vendor recommendations for ${s.eventsNeedingVendors} event${num(s.eventsNeedingVendors) === 1 ? "" : "s"}`,
      cta: "See recommendations",
      link: "/recommendations",
      weight: 78,
      reason: "Matched vendors fill open categories faster.",
    });
  }
  if (num(s.unpaidDeposits) > 0) {
    out.push({
      key: "client.deposits",
      title: `Pay ${s.unpaidDeposits} pending deposit${num(s.unpaidDeposits) === 1 ? "" : "s"} to confirm bookings`,
      cta: "Open invoices",
      link: "/invoices",
      weight: 82,
      reason: "Deposits lock in your vendors and dates.",
    });
  }
  out.push({
    key: "client.templates",
    title: "Reuse a past event with a template",
    cta: "Browse templates",
    link: "/templates",
    weight: 35,
    reason: "Templates and event history make planning the next one faster.",
  });
  return out;
}

/**
 * Build the ranked next-best-action list for an org from its state snapshot.
 * Deterministic and side-effect free.
 */
export function buildNextBestActions(snapshot: OrgStateSnapshot): NextBestAction[] {
  const role = snapshot.role;
  let roleActions: NextBestAction[] = [];
  switch (role) {
    case "vendor":
    case "supplier":
    case "installer":
      roleActions = vendorActions(snapshot);
      break;
    case "venue":
      roleActions = venueActions(snapshot);
      break;
    case "planner":
    case "client":
      roleActions = clientActions(snapshot);
      break;
    default:
      roleActions = clientActions(snapshot);
  }

  const all = [...roleActions, ...sharedActions(snapshot)];
  // Stable sort: weight desc, then key asc for determinism on ties.
  return all.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}
