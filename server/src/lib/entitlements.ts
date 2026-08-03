/**
 * Divini Partners - centralized entitlement service (spec rule 5: build ONE
 * service, never scatter `if (plan === "pro")` checks across routes).
 *
 * Fee rate/cap and usage limits are both resolved from ONE place: when the
 * org's role (organizations.type) has an entry in lib/planCatalog.ts, that
 * role-specific plan (real dollar figure, real fee rate, real feature
 * limits) is authoritative; otherwise this falls back to the flat
 * lib/platformFees.ts rate/cap with every limit unlimited. Nothing calls
 * checkLimit to actually block a create yet -- that wiring is Phase 3.
 *
 * Every route that creates a metered resource must call checkLimit()
 * server-side before the insert. The SPA's GET /entitlements reads the same
 * numbers to render upgrade prompts -- never to enforce anything itself.
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
 * Would using one more unit of `key` still be within the org's plan limit?
 * Always allowed while every limit is null (Phase 1); real enforcement lands
 * in Phase 3 once entitlements.limits carries real per-role numbers.
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
