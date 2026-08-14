/**
 * Divini Partners - centralized entitlement service (spec rule 5: build ONE
 * service, never scatter `if (plan === "pro")` checks across routes).
 *
 * Fee rate/cap and usage limits are both resolved from ONE place: when the
 * org's role (organizations.type) has an entry in lib/planCatalog.ts, that
 * role-specific plan (real dollar figure, real fee rate, real feature
 * limits) is authoritative; otherwise this falls back to the flat
 * lib/platformFees.ts rate/cap with every limit unlimited.
 *
 * Every route that creates a metered resource calls checkLimit()
 * server-side before the insert and, when blocked, responds with
 * limitExceededPayload() so the SPA's upgrade prompt is always the same
 * shape. The SPA's GET /entitlements reads the same numbers to render
 * proactive "X of Y used" indicators -- never to enforce anything itself.
 */
import { TIERS, type DbOrg, type Tier, type Role } from "../db.js";
import { computePlatformFee, planForOrg, type PlanKey } from "./platformFees.js";
import { planTierFor, type PlanLimits } from "./planCatalog.js";

export type CapabilityKey =
  | "events.active"
  | "quotes.per_event"
  | "quotes.compare"
  | "locations"
  | "spaces"
  | "inventory_items"
  | "warehouses"
  | "team_seats"
  | "workers"
  | "leads.monthly"
  | "leads.active"
  | "proposals.monthly"
  | "packages"
  | "automation_runs.monthly"
  | "storage_bytes"
  | "integrations"
  | "reports.advanced";

export interface PlanEntitlements {
  planKey: PlanKey;
  planLabel: string;
  feeRate: number;
  feeCapCents: number | null;
  monthlyCents: number;
  /** null = unlimited, a key simply absent = not applicable to this role. */
  limits: Partial<Record<CapabilityKey, number | null>>;
}

const NO_LIMITS: PlanLimits = {};

/** Resolve an organization's full entitlement set from its role + billing tier. */
export function getEntitlements(org: Pick<DbOrg, "tier" | "platform_fee_rate" | "type">): PlanEntitlements {
  const tier = (org.tier as Tier) in TIERS ? (org.tier as Tier) : "free_partner";
  const roleTier = planTierFor(org.type as Role, tier);

  if (roleTier) {
    // Role has a real catalog entry: it is authoritative for price, fee, and
    // limits. The cap still comes from lib/platformFees.ts (never duplicated)
    // when the role's tier actually carries a marketplace fee.
    const feeRate = roleTier.platformFeeRate ?? 0;
    const feeCapCents = roleTier.platformFeeRate != null ? roleTier.feeCapCents ?? 250000 : null;
    return {
      planKey: planForOrg({ tier: org.tier, platform_fee_rate: null }),
      planLabel: roleTier.label,
      feeRate,
      feeCapCents,
      monthlyCents: Math.round((roleTier.monthlyUsd ?? 0) * 100),
      limits: roleTier.limits ?? NO_LIMITS,
    };
  }

  // Fallback for roles with no catalog entry yet (e.g. "billing"): the flat
  // TIERS table, unlimited usage.
  const rateOrg = { tier: org.tier, platform_fee_rate: org.platform_fee_rate != null ? Number(org.platform_fee_rate) : null };
  const plan = planForOrg(rateOrg);
  const fee = computePlatformFee(0, rateOrg); // rate/cap only; amount is irrelevant here
  const monthlyCents = Math.round(TIERS[tier].monthly * 100);
  return {
    planKey: plan,
    planLabel: planLabelFor(plan),
    feeRate: fee.feeRate,
    feeCapCents: fee.capCents,
    monthlyCents,
    limits: NO_LIMITS,
  };
}

function planLabelFor(plan: PlanKey): string {
  switch (plan) {
    case "partner":
      return "Plus";
    case "premier":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return "Free";
  }
}

export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
}

/**
 * True when the org is on its role's TOP tier (Pro/premier). The single,
 * centralized gate for the Pro-exclusive feature bullets that are never
 * included at any lower tier for any role that has them at all --
 * Forecasting, Advanced reporting/analytics/CRM, Lead scoring, White label,
 * API, Automation (see lib/planCatalog.ts). Replaces per-route ad hoc
 * `tier === "premier"` checks (spec rule 5: one service, never scattered).
 */
export function isTopTier(org: Pick<DbOrg, "tier">): boolean {
  return org.tier === "premier";
}

/**
 * True when the org is on its role's Plus tier or above (partner/premier).
 * The gate for Plus-included features that Free does not get but are not
 * Pro-exclusive -- e.g. Divini Scope Builder's custom templates (spec
 * section 18: "Plus: ... custom scope templates").
 */
export function isPlusTier(org: Pick<DbOrg, "tier">): boolean {
  return org.tier === "partner" || org.tier === "premier";
}

/**
 * Would using one more unit of `key` still be within the org's plan limit?
 * `null` limit means unlimited (either the plan has no cap on this key, or
 * the role has no catalog entry yet).
 */
export function checkLimit(
  org: Pick<DbOrg, "tier" | "platform_fee_rate" | "type">,
  key: CapabilityKey,
  currentUsage: number,
): LimitCheck {
  const { limits } = getEntitlements(org);
  const limit = limits[key] ?? null;
  if (limit == null) return { allowed: true, limit: null, used: currentUsage };
  return { allowed: currentUsage < limit, limit, used: currentUsage };
}

const NEXT_TIER: Record<Tier, Tier | null> = {
  client: "partner",
  free_partner: "partner",
  partner: "premier",
  premier: null,
};

/**
 * The response body every checkLimit-gated route sends when a create is
 * blocked, so the SPA's upgrade prompt (one shared component) always gets
 * the same shape regardless of which capability tripped. Not a 4xx the
 * client should retry -- it is a real "upgrade to continue" signal.
 */
/**
 * The response body every isTopTier-gated route sends when a Pro-exclusive
 * feature is used below Pro. Same "upgrade to X" shape as
 * limitExceededPayload, distinct error code (this is not a usage cap, it is
 * a feature the plan does not include at all).
 */
export function featureLockedPayload(
  org: Pick<DbOrg, "tier" | "type">,
  feature: string,
  minTier: Extract<Tier, "partner" | "premier"> = "premier",
) {
  const roleTier = planTierFor(org.type as Role, minTier);
  return {
    error: "feature_locked" as const,
    feature,
    upgrade: roleTier ? { tier: minTier, label: roleTier.label, monthlyUsd: roleTier.monthlyUsd } : null,
  };
}

export function limitExceededPayload(
  org: Pick<DbOrg, "tier" | "platform_fee_rate" | "type">,
  key: CapabilityKey,
  check: LimitCheck,
) {
  const tier = (org.tier as Tier) in TIERS ? (org.tier as Tier) : "free_partner";
  const nextTier = NEXT_TIER[tier];
  const nextRoleTier = nextTier ? planTierFor(org.type as Role, nextTier) : undefined;
  return {
    error: "plan_limit_reached",
    capability: key,
    limit: check.limit,
    used: check.used,
    upgrade: nextRoleTier
      ? { tier: nextTier, label: nextRoleTier.label, monthlyUsd: nextRoleTier.monthlyUsd }
      : null,
  };
}
