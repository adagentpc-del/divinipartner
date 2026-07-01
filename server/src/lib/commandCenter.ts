/**
 * Divini AI COO V2 - Divini Command Center (deterministic Q&A router, pure layer).
 *
 * A fixed set of canned executive questions, each routed DETERMINISTICALLY to the
 * already-built engines (Revenue Leakage, Opportunity Engine, Partnership Matching,
 * Relationship Graph, Event War Room). This module owns NO DB access, no network,
 * no randomness, and no AI: the db layer (server/src/db/command-center.ts) gathers
 * the per-question inputs (org / role scoped, IDOR-safe) and hands them in; this
 * module shapes them into a structured executive answer.
 *
 * Same inputs always produce the same answer.
 *
 * Answer shape (stable across all questions):
 *   { questionKey, question, headline, items[], actions[] }
 * where each item is a labeled, optionally valued row, and each action is a short
 * recommended next step (optional deep link href the SPA can route to).
 *
 * AI FREE-TEXT SEAM (intentionally NOT called): a future enhancement could accept
 * an arbitrary free-text executive question and use an LLM to classify it onto one
 * of the QUESTION keys below (or compose a multi-engine answer). Per the Alyssa
 * cost rules it must be feature-flagged, manual-triggered, cached, and rate-limited;
 * the deterministic router here is always the default path. See the commented seam
 * at the bottom of `answer`.
 */

import type { PartnershipMatch } from "./partnershipMatch.js";

// ---------------------------------------------------------------------------
// Supported question catalog (key + label). Exported for the route's GET
// /questions and for the SPA to render the clickable list.
// ---------------------------------------------------------------------------

export type QuestionKey =
  | "focus_today"
  | "losing_money"
  | "partnerships"
  | "sponsorships"
  | "onboard_vendors"
  | "risks_this_week"
  | "events_attention";

export type SupportedQuestion = { key: QuestionKey; label: string };

/** The fixed catalog of executive questions the Command Center can answer. */
export const SUPPORTED_QUESTIONS: SupportedQuestion[] = [
  { key: "focus_today", label: "What should I focus on today?" },
  { key: "losing_money", label: "Where am I losing money?" },
  { key: "partnerships", label: "What partnerships should I pursue?" },
  { key: "sponsorships", label: "What sponsorships should I sell?" },
  { key: "onboard_vendors", label: "What vendors should I onboard?" },
  { key: "risks_this_week", label: "What risks exist this week?" },
  { key: "events_attention", label: "What events need attention?" },
];

const QUESTION_KEYS = new Set<string>(SUPPORTED_QUESTIONS.map((q) => q.key));
export function isQuestionKey(v: unknown): v is QuestionKey {
  return typeof v === "string" && QUESTION_KEYS.has(v);
}
export function labelFor(key: QuestionKey): string {
  return SUPPORTED_QUESTIONS.find((q) => q.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Structured answer types.
// ---------------------------------------------------------------------------

/** A single labeled finding inside an answer. */
export type AnswerItem = {
  title: string;
  detail?: string | null;
  /** A dollar figure when the item carries one (revenue at stake, deal size). */
  value?: number | null;
  /** A 0..100 score when the item carries one (match strength, severity proxy). */
  score?: number | null;
  /** Optional SPA deep link the UI can route to (e.g. "/events/<id>"). */
  href?: string | null;
};

/** A recommended next step. */
export type AnswerAction = {
  label: string;
  href?: string | null;
};

/** The full structured answer returned for one question. */
export type CommandAnswer = {
  questionKey: QuestionKey;
  question: string;
  headline: string;
  items: AnswerItem[];
  actions: AnswerAction[];
};

// ---------------------------------------------------------------------------
// Inputs the db layer assembles per question. All fields optional: the router
// emits only what the supplied data supports and degrades to a graceful empty
// state otherwise (no fabrication).
// ---------------------------------------------------------------------------

/** A generated opportunity row (mirrors opportunityEngine output, decoupled). */
export type CtxOpportunity = {
  kind: string;
  title: string;
  potential_value: number;
  source: string;
};

/** A revenue-leakage roll-up for one scope (venue or event). */
export type CtxLeak = {
  scope: "venue" | "event";
  name: string | null;
  missed: number;
  topSuggestion?: { label: string; missed: number } | null;
};

/** A partnership-match candidate (already scored by partnershipMatch.match). */
export type CtxPartnerMatch = {
  match: PartnershipMatch;
  /** What kind of partner this is (vendor / sponsor / venue / client). */
  targetKind: string;
};

/** An open sponsorship opportunity to sell. */
export type CtxSponsorship = {
  id: string;
  name: string | null;
  category: string | null;
  audienceSize: number | null;
  venueName: string | null;
};

/** A vendor-onboarding candidate (a gap or a match). */
export type CtxOnboard = {
  title: string;
  detail?: string | null;
  score?: number | null;
};

/** One event's war-room roll-up (counts come from db/warroom.runScan). */
export type CtxEventRisk = {
  eventId: string;
  name: string | null;
  critical: number;
  warning: number;
  open: number;
  /** The single most severe open alert title, when one exists. */
  topAlert?: string | null;
};

export type CommandContext = {
  /** The actor's primary role label, for headline phrasing only. */
  role?: string | null;
  opportunities?: CtxOpportunity[];
  leaks?: CtxLeak[];
  partnerMatches?: CtxPartnerMatch[];
  sponsorships?: CtxSponsorship[];
  onboard?: CtxOnboard[];
  eventRisks?: CtxEventRisk[];
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const round = (n: number): number => Math.round(Number(n) || 0);
function currency(n: number): string {
  return `$${round(n).toLocaleString("en-US")}`;
}
function sum(ns: number[]): number {
  return ns.reduce((s, n) => s + (Number(n) || 0), 0);
}
function emptyAnswer(key: QuestionKey, headline: string): CommandAnswer {
  return { questionKey: key, question: labelFor(key), headline, items: [], actions: [] };
}

// ---------------------------------------------------------------------------
// The deterministic router.
// ---------------------------------------------------------------------------

/**
 * Route a canned executive question to a structured answer using the supplied
 * (already-gathered) engine outputs. Pure and side-effect free.
 */
export function answer(question: QuestionKey, ctx: CommandContext): CommandAnswer {
  switch (question) {
    case "focus_today":
      return focusToday(ctx);
    case "losing_money":
      return losingMoney(ctx);
    case "partnerships":
      return partnerships(ctx);
    case "sponsorships":
      return sponsorships(ctx);
    case "onboard_vendors":
      return onboardVendors(ctx);
    case "risks_this_week":
      return risksThisWeek(ctx);
    case "events_attention":
      return eventsAttention(ctx);
    default:
      // Exhaustive by construction; defensive default keeps the type total.
      return emptyAnswer(question, "Nothing to report yet.");
  }

  // -------------------------------------------------------------------------
  // AI FREE-TEXT SEAM (intentionally NOT invoked). A future flagged, cached,
  // rate-limited pass could accept a free-text question, classify it onto a
  // QuestionKey (or compose across several), and fall back to this router:
  //
  //   if (freeText && featureFlagEnabled() && underRateLimit()) {
  //     const key = await aiClassifyQuestion(freeText); // -> QuestionKey
  //     return answer(key, ctx);
  //   }
  //
  // It must never run on the default path; the switch above is the only path.
  // -------------------------------------------------------------------------
}

// ---- focus_today: top opportunities ranked by potential value -------------

function focusToday(ctx: CommandContext): CommandAnswer {
  const opps = [...(ctx.opportunities ?? [])].sort(
    (a, b) => b.potential_value - a.potential_value || a.title.localeCompare(b.title),
  );
  if (opps.length === 0) {
    return emptyAnswer(
      "focus_today",
      "No priorities surfaced yet. Add venues, events, or activity and they will appear here.",
    );
  }
  const top = opps.slice(0, 7);
  const totalValue = sum(top.map((o) => o.potential_value));
  const valued = top.filter((o) => o.potential_value > 0).length;
  const headline =
    totalValue > 0
      ? `${top.length} priorities today, with ${currency(totalValue)} of potential value in reach.`
      : `${top.length} priorities to act on today.`;
  return {
    questionKey: "focus_today",
    question: labelFor("focus_today"),
    headline,
    items: top.map((o) => ({
      title: o.title,
      detail: o.source ? `Source: ${o.source}` : null,
      value: o.potential_value > 0 ? o.potential_value : null,
    })),
    actions: [
      { label: "Open the full opportunity feed", href: "/opportunities" },
      ...(valued > 0
        ? [{ label: "Review revenue leakage detail", href: "/revenue-leakage" }]
        : []),
    ],
  };
}

// ---- losing_money: revenue leakage roll-up --------------------------------

function losingMoney(ctx: CommandContext): CommandAnswer {
  const leaks = [...(ctx.leaks ?? [])].filter((l) => l.missed > 0).sort((a, b) => b.missed - a.missed);
  if (leaks.length === 0) {
    return emptyAnswer(
      "losing_money",
      "No revenue leakage detected. Scans run against your venues and events as they accumulate data.",
    );
  }
  const totalMissed = sum(leaks.map((l) => l.missed));
  return {
    questionKey: "losing_money",
    question: labelFor("losing_money"),
    headline: `${currency(totalMissed)} in unrealized revenue across ${leaks.length} ${
      leaks.length === 1 ? "scan" : "scans"
    }.`,
    items: leaks.slice(0, 10).map((l) => ({
      title: `${l.name ?? (l.scope === "venue" ? "Venue" : "Event")}: ${currency(l.missed)} unrealized`,
      detail: l.topSuggestion
        ? `Top gap: ${l.topSuggestion.label} (${currency(l.topSuggestion.missed)})`
        : null,
      value: l.missed,
    })),
    actions: [
      { label: "Open the Revenue Leakage Detector", href: "/revenue-leakage" },
      { label: "Generate capture opportunities", href: "/opportunities" },
    ],
  };
}

// ---- partnerships: partnership-match candidates ---------------------------

function partnerships(ctx: CommandContext): CommandAnswer {
  const matches = [...(ctx.partnerMatches ?? [])].sort(
    (a, b) => b.match.score - a.match.score || a.match.candidate.id.localeCompare(b.match.candidate.id),
  );
  if (matches.length === 0) {
    return emptyAnswer(
      "partnerships",
      "No partnership matches yet. As venues, vendors, and sponsors join, ranked matches appear here.",
    );
  }
  const strong = matches.filter((m) => m.match.score >= 60).length;
  return {
    questionKey: "partnerships",
    question: labelFor("partnerships"),
    headline:
      strong > 0
        ? `${strong} strong partner ${strong === 1 ? "match" : "matches"} to pursue (of ${matches.length} ranked).`
        : `${matches.length} partner ${matches.length === 1 ? "candidate" : "candidates"} ranked.`,
    items: matches.slice(0, 8).map((m) => ({
      title: `${m.match.candidate.name ?? "Partner"} (${m.targetKind})`,
      detail: m.match.reasons.slice(0, 3).join(" - ") || null,
      score: m.match.score,
    })),
    actions: [{ label: "Open Partnership Matching", href: "/partnership-match" }],
  };
}

// ---- sponsorships: open sponsorship inventory to sell ---------------------

function sponsorships(ctx: CommandContext): CommandAnswer {
  const opps = [...(ctx.sponsorships ?? [])].sort(
    (a, b) => (b.audienceSize ?? 0) - (a.audienceSize ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""),
  );
  if (opps.length === 0) {
    return emptyAnswer(
      "sponsorships",
      "No open sponsorship inventory. Publish sponsorship opportunities on your venues to sell them here.",
    );
  }
  const reach = sum(opps.map((o) => o.audienceSize ?? 0));
  return {
    questionKey: "sponsorships",
    question: labelFor("sponsorships"),
    headline:
      reach > 0
        ? `${opps.length} open sponsorship ${opps.length === 1 ? "package" : "packages"} reaching roughly ${reach.toLocaleString("en-US")}.`
        : `${opps.length} open sponsorship ${opps.length === 1 ? "package" : "packages"} to sell.`,
    items: opps.slice(0, 10).map((o) => ({
      title: o.name ?? "Sponsorship package",
      detail: [o.category, o.venueName].filter(Boolean).join(" - ") || null,
      value: null,
      score: null,
      href: null,
    })),
    actions: [
      { label: "Open Sponsorship Intelligence", href: "/sponsorship" },
      { label: "Find matching sponsors", href: "/partnership-match" },
    ],
  };
}

// ---- onboard_vendors: gaps + match suggestions ----------------------------

function onboardVendors(ctx: CommandContext): CommandAnswer {
  const rows = [...(ctx.onboard ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (rows.length === 0) {
    return emptyAnswer(
      "onboard_vendors",
      "No vendor gaps detected. As events define required services, onboarding suggestions appear here.",
    );
  }
  return {
    questionKey: "onboard_vendors",
    question: labelFor("onboard_vendors"),
    headline: `${rows.length} vendor onboarding ${rows.length === 1 ? "suggestion" : "suggestions"}.`,
    items: rows.slice(0, 10).map((r) => ({
      title: r.title,
      detail: r.detail ?? null,
      score: r.score ?? null,
    })),
    actions: [
      { label: "Find vendors to onboard", href: "/partnership-match" },
      { label: "Review open projects", href: "/opportunities" },
    ],
  };
}

// ---- risks_this_week: event war-room roll-up across the org ---------------

function risksThisWeek(ctx: CommandContext): CommandAnswer {
  const risks = [...(ctx.eventRisks ?? [])]
    .filter((r) => r.open > 0)
    .sort(
      (a, b) =>
        b.critical - a.critical || b.warning - a.warning || b.open - a.open || (a.name ?? "").localeCompare(b.name ?? ""),
    );
  if (risks.length === 0) {
    return emptyAnswer(
      "risks_this_week",
      "No open risks across your events. The war room rolls up here as alerts appear.",
    );
  }
  const totalCritical = sum(risks.map((r) => r.critical));
  const totalOpen = sum(risks.map((r) => r.open));
  return {
    questionKey: "risks_this_week",
    question: labelFor("risks_this_week"),
    headline:
      totalCritical > 0
        ? `${totalCritical} critical ${totalCritical === 1 ? "alert" : "alerts"} across ${risks.length} ${
            risks.length === 1 ? "event" : "events"
          } (${totalOpen} open total).`
        : `${totalOpen} open ${totalOpen === 1 ? "alert" : "alerts"} across ${risks.length} ${
            risks.length === 1 ? "event" : "events"
          }.`,
    items: risks.slice(0, 10).map((r) => ({
      title: `${r.name ?? "Event"}: ${r.critical} critical, ${r.warning} warning`,
      detail: r.topAlert ?? null,
      score: null,
      href: `/events/${r.eventId}`,
    })),
    actions: [{ label: "Open the cross-event war room", href: "/events" }],
  };
}

// ---- events_attention: events with open critical alerts -------------------

function eventsAttention(ctx: CommandContext): CommandAnswer {
  const flagged = [...(ctx.eventRisks ?? [])]
    .filter((r) => r.critical > 0 || r.open > 0)
    .sort((a, b) => b.critical - a.critical || b.open - a.open || (a.name ?? "").localeCompare(b.name ?? ""));
  if (flagged.length === 0) {
    return emptyAnswer(
      "events_attention",
      "No events need attention right now. Events with open critical alerts surface here.",
    );
  }
  const critical = flagged.filter((r) => r.critical > 0);
  return {
    questionKey: "events_attention",
    question: labelFor("events_attention"),
    headline:
      critical.length > 0
        ? `${critical.length} ${critical.length === 1 ? "event needs" : "events need"} attention now (open critical alerts).`
        : `${flagged.length} ${flagged.length === 1 ? "event has" : "events have"} open alerts to review.`,
    items: flagged.slice(0, 10).map((r) => ({
      title: r.name ?? "Event",
      detail:
        r.critical > 0
          ? `${r.critical} critical, ${r.warning} warning, ${r.open} open`
          : `${r.open} open ${r.open === 1 ? "alert" : "alerts"}`,
      href: `/events/${r.eventId}`,
    })),
    actions: [{ label: "Open events", href: "/events" }],
  };
}
