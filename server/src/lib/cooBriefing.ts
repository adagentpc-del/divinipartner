/**
 * Divini AI COO (V2) - Daily Executive Briefing assembler (pure shaping layer).
 *
 * Deterministic, side-effect-free. The db layer (server/src/db/coo.ts) loads the
 * role-relevant, org-scoped data, runs the EXISTING engines (opportunityEngine
 * generateOpportunities, revenueLeakage scanVenue/scanEvent, warroom runScan
 * rollup, partnershipMatch match) and passes their already-computed outputs in
 * here. This module does no DB work, no network, no AI calls: it shapes those
 * inputs into a single executive briefing object (greeting, today's priorities,
 * revenue opportunities, risks, approvals needed, follow-ups, contracts expiring,
 * sponsorship + partnership opportunities, recommended actions, and a
 * potential-revenue headline). Same inputs always produce the same briefing.
 *
 * It degrades gracefully: every input is optional, and when nothing is supplied
 * the briefing returns empty arrays and a zero potential-revenue figure so the
 * UI can show honest empty states rather than fabricated numbers.
 */

const numOr0 = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

const round = (n: number | null | undefined): number => Math.round(numOr0(n));

/** A single ranked priority for the day. */
export type BriefingPriority = {
  title: string;
  detail?: string;
  impact: number; // 0..100 relative weight used for ordering
  category: "revenue" | "risk" | "approval" | "follow_up" | "contract" | "partnership" | "sponsorship";
  ref?: Record<string, unknown>;
};

/** A revenue opportunity surfaced from the leakage / opportunity engines. */
export type BriefingRevenueOpportunity = {
  title: string;
  value: number; // estimated dollars
  source: string;
  ref?: Record<string, unknown>;
};

/** A risk rolled up from the event war-room scan across the org's events. */
export type BriefingRisk = {
  title: string;
  severity: "info" | "warning" | "critical";
  recommendation?: string;
  ref?: Record<string, unknown>;
};

/** An item awaiting the executive's decision (approval / signature / review). */
export type BriefingApproval = {
  title: string;
  count: number;
  ref?: Record<string, unknown>;
};

/** A relationship / outstanding follow-up the executive should chase. */
export type BriefingFollowUp = {
  title: string;
  detail?: string;
  ref?: Record<string, unknown>;
};

/** A contract / document approaching expiry. */
export type BriefingContractExpiring = {
  title: string;
  daysUntil: number | null;
  ref?: Record<string, unknown>;
};

/** A sponsorship opportunity (open inventory) the org can monetize. */
export type BriefingSponsorship = {
  title: string;
  value: number;
  ref?: Record<string, unknown>;
};

/** A partnership match suggested by the partnership engine. */
export type BriefingPartnership = {
  title: string;
  score: number; // 0..100
  reasons: string[];
  ref?: Record<string, unknown>;
};

/** A concrete recommended next action. */
export type BriefingAction = {
  title: string;
  actionType: string;
  impact: number;
  ref?: Record<string, unknown>;
};

/** The complete assembled briefing returned to the route / page. */
export type Briefing = {
  greeting: string;
  priorities: BriefingPriority[];
  revenueOpportunities: BriefingRevenueOpportunity[];
  risks: BriefingRisk[];
  approvalsNeeded: BriefingApproval[];
  followUps: BriefingFollowUp[];
  contractsExpiring: BriefingContractExpiring[];
  sponsorshipOpportunities: BriefingSponsorship[];
  partnershipOpportunities: BriefingPartnership[];
  recommendedActions: BriefingAction[];
  potentialRevenue: number;
};

/**
 * The already-loaded, engine-shaped inputs the assembler reasons over. Every
 * field is optional so partial data never throws. The db layer fills whatever it
 * can for the actor's role.
 */
export type BriefingInputs = {
  /** Display name for the greeting line. */
  name?: string | null;
  /** Override the time-of-day greeting (the db layer may pass a fixed clock). */
  hour?: number | null;

  /**
   * Opportunity rows from generateOpportunities (opportunityEngine). The
   * assembler reads title / potential_value / kind / source / detail.
   */
  opportunities?: Array<{
    kind?: string | null;
    title?: string | null;
    potential_value?: number | null;
    source?: string | null;
    detail?: Record<string, unknown> | null;
  }>;

  /**
   * War-room rollup risks across the org's events (from warroom runScan). Each
   * carries the originating event for the ref.
   */
  risks?: Array<{
    eventId?: string | null;
    eventName?: string | null;
    code?: string | null;
    severity?: "info" | "warning" | "critical" | null;
    message?: string | null;
    recommendation?: string | null;
  }>;

  /** Approval / signature / review queues awaiting the executive. */
  approvals?: Array<{ label: string; count: number; ref?: Record<string, unknown> }>;

  /** Outstanding follow-ups (overdue invoices, stale quotes, unanswered bids). */
  followUps?: Array<{ title: string; detail?: string; ref?: Record<string, unknown> }>;

  /** Contracts / documents approaching expiry. */
  contractsExpiring?: Array<{ title: string; daysUntil?: number | null; ref?: Record<string, unknown> }>;

  /** Open sponsorship inventory across the org's venues. */
  sponsorships?: Array<{ title: string; value?: number | null; ref?: Record<string, unknown> }>;

  /** Partnership matches from the partnership engine (score 0..100 + reasons). */
  partnerships?: Array<{ title: string; score?: number | null; reasons?: string[] | null; ref?: Record<string, unknown> }>;
};

/** Time-of-day greeting from an hour (0..23). Deterministic. */
function greetingFor(name: string | null, hour: number | null): string {
  const who = name && name.trim() ? `, ${name.trim()}` : "";
  const h = typeof hour === "number" && hour >= 0 && hour <= 23 ? hour : 9;
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}${who}. Here is your executive briefing.`;
}

/**
 * Assemble the daily executive briefing from already-loaded engine outputs.
 * Pure: same inputs -> same briefing. Empty inputs -> empty, honest briefing.
 */
export function assembleBriefing(inputs: BriefingInputs = {}): Briefing {
  const greeting = greetingFor(inputs.name ?? null, inputs.hour ?? null);

  // ---- revenue opportunities (leakage + opportunity engine, value > 0) ------
  const revenueOpportunities: BriefingRevenueOpportunity[] = (inputs.opportunities ?? [])
    .filter((o) => numOr0(o.potential_value) > 0)
    .map((o) => ({
      title: o.title ?? "Revenue opportunity",
      value: round(o.potential_value),
      source: o.source ?? "opportunity",
      ref: o.detail ?? undefined,
    }))
    .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title));

  const potentialRevenue = revenueOpportunities.reduce((s, x) => s + x.value, 0);

  // ---- risks (war-room rollup) ---------------------------------------------
  const sevRank = { critical: 0, warning: 1, info: 2 } as const;
  const risks: BriefingRisk[] = (inputs.risks ?? [])
    .map((r) => ({
      title: r.eventName ? `${r.eventName}: ${r.message ?? r.code ?? "Risk"}` : r.message ?? r.code ?? "Risk",
      severity: r.severity ?? "info",
      recommendation: r.recommendation ?? undefined,
      ref: { event_id: r.eventId ?? null, code: r.code ?? null },
    }))
    .sort(
      (a, b) =>
        sevRank[a.severity] - sevRank[b.severity] || a.title.localeCompare(b.title),
    );

  // ---- approvals needed -----------------------------------------------------
  const approvalsNeeded: BriefingApproval[] = (inputs.approvals ?? [])
    .filter((a) => numOr0(a.count) > 0)
    .map((a) => ({ title: a.label, count: round(a.count), ref: a.ref }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

  // ---- follow-ups -----------------------------------------------------------
  const followUps: BriefingFollowUp[] = (inputs.followUps ?? []).map((f) => ({
    title: f.title,
    detail: f.detail,
    ref: f.ref,
  }));

  // ---- contracts expiring (soonest first) -----------------------------------
  const contractsExpiring: BriefingContractExpiring[] = (inputs.contractsExpiring ?? [])
    .map((c) => ({
      title: c.title,
      daysUntil: typeof c.daysUntil === "number" ? c.daysUntil : null,
      ref: c.ref,
    }))
    .sort((a, b) => {
      const da = a.daysUntil ?? Number.MAX_SAFE_INTEGER;
      const db = b.daysUntil ?? Number.MAX_SAFE_INTEGER;
      return da - db || a.title.localeCompare(b.title);
    });

  // ---- sponsorship opportunities (highest value first) ----------------------
  const sponsorshipOpportunities: BriefingSponsorship[] = (inputs.sponsorships ?? [])
    .map((s) => ({ title: s.title, value: round(s.value), ref: s.ref }))
    .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title));

  // ---- partnership opportunities (highest score first) ----------------------
  const partnershipOpportunities: BriefingPartnership[] = (inputs.partnerships ?? [])
    .map((p) => ({
      title: p.title,
      score: round(p.score),
      reasons: Array.isArray(p.reasons) ? p.reasons : [],
      ref: p.ref,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  // ---- today's priorities (cross-section, impact-ranked) --------------------
  const priorities: BriefingPriority[] = [];
  for (const r of risks) {
    priorities.push({
      title: r.title,
      detail: r.recommendation,
      impact: r.severity === "critical" ? 95 : r.severity === "warning" ? 70 : 40,
      category: "risk",
      ref: r.ref,
    });
  }
  for (const o of revenueOpportunities) {
    // Revenue impact scaled into a 30..90 band by dollar magnitude.
    const impact = Math.min(90, 30 + Math.round(Math.log10(o.value + 1) * 12));
    priorities.push({ title: o.title, impact, category: "revenue", ref: o.ref });
  }
  for (const a of approvalsNeeded) {
    priorities.push({
      title: `${a.title} (${a.count})`,
      impact: 60 + Math.min(20, a.count),
      category: "approval",
      ref: a.ref,
    });
  }
  for (const c of contractsExpiring) {
    const d = c.daysUntil ?? 999;
    priorities.push({
      title: c.title,
      detail: d >= 0 ? `Expires in ${d} day${d === 1 ? "" : "s"}` : `Expired ${Math.abs(d)} day${d === -1 ? "" : "s"} ago`,
      impact: d <= 0 ? 88 : d <= 7 ? 78 : d <= 30 ? 55 : 35,
      category: "contract",
      ref: c.ref,
    });
  }
  for (const p of partnershipOpportunities.slice(0, 5)) {
    priorities.push({
      title: `Pursue: ${p.title}`,
      detail: p.reasons[0],
      impact: Math.min(75, 25 + Math.round(p.score / 2)),
      category: "partnership",
      ref: p.ref,
    });
  }
  for (const s of sponsorshipOpportunities.slice(0, 5)) {
    priorities.push({
      title: `Sell: ${s.title}`,
      impact: Math.min(80, 30 + Math.round(Math.log10(s.value + 1) * 12)),
      category: "sponsorship",
      ref: s.ref,
    });
  }
  for (const f of followUps) {
    priorities.push({ title: f.title, detail: f.detail, impact: 50, category: "follow_up", ref: f.ref });
  }
  priorities.sort((a, b) => b.impact - a.impact || a.title.localeCompare(b.title));

  // ---- recommended actions (top priorities mapped to a concrete action) -----
  const ACTION_BY_CATEGORY: Record<BriefingPriority["category"], string> = {
    revenue: "capture_revenue",
    risk: "resolve_risk",
    approval: "review_approval",
    follow_up: "follow_up",
    contract: "renew_contract",
    partnership: "pursue_partnership",
    sponsorship: "sell_sponsorship",
  };
  const recommendedActions: BriefingAction[] = priorities.slice(0, 8).map((p) => ({
    title: p.title,
    actionType: ACTION_BY_CATEGORY[p.category],
    impact: p.impact,
    ref: p.ref,
  }));

  return {
    greeting,
    priorities,
    revenueOpportunities,
    risks,
    approvalsNeeded,
    followUps,
    contractsExpiring,
    sponsorshipOpportunities,
    partnershipOpportunities,
    recommendedActions,
    potentialRevenue,
  };
}
