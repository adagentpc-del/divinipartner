/**
 * Divini Partners - centralized entitlement service (spec rule 5: build ONE
 * service, never scatter `if (plan === "pro")` checks across routes).
 *
 * Phase 1 scope: fee rate/cap only, delegated to lib/platformFees.ts so there
 * is exactly one implementation of "what does this org's plan charge" in the
 * whole codebase. Usage limits (events/quotes/locations/seats/...) are typed
 * out below (CapabilityKey) but every limit resolves to `null` (unlimited)
 * until Phase 2 assigns real per-role numbers -- see
 * docs/DIVINI_ROLE_SUBSCRIPTION_AUDIT.md section 8. Nothing calls checkLimit
 * to actually block a create yet; that wiring is Phase 3.
 *
 * Every route that creates a metered resource must call checkLimit()
 * server-side before the insert. The SPA's GET /entitlements reads the same
 * numbers to render upgrade prompts -- never to enforce anything itself.
 */
import { TIERS, type DbOrg, type Tier } from "../db.js";
import { computePlatformFee, planForOrg, type PlanKey } from "./platformFees.js";

export type CapabilityKey =
  | "events.active"
  | "quotes.monthly"
  | "locations"
  | "inventory_items"
  | "team_seats"
  | "automation_runs.monthly"
  | "storage_bytes"
  | "integrations"
  | "reports.advanced"
  | "leads.monthly";

export interface PlanEntitlements {
  planKey: PlanKey;
  planLabel: string;
  feeRate: number;
  feeCapCents: number | null;
  monthlyCents: number;
  /** null = unlimited. Phase 1: every key is unlimited until Phase 2 assigns
   *  real per-role numbers. */
  limits: Partial<Record<CapabilityKey, number | null>>;
}

const PHASE1_LIMITS: Partial<Record<CapabilityKey, number | null>> = {
  "events.active": null,
  "quotes.monthly": null,
  locations: null,
  inventory_items: null,
  team_seats: null,
  "automation_runs.monthly": null,
  storage_bytes: null,
  integrations: null,
  "reports.advanced": null,
  "leads.monthly": null,
};

/** Resolve an organization's full entitlement set from its billing tier. */
export function getEntitlements(org: Pick<DbOrg, "tier" | "platform_fee_rate">): PlanEntitlements {
  const rateOrg = { tier: org.tier, platform_fee_rate: org.platform_fee_rate != null ? Number(org.platform_fee_rate) : null };
  const plan = planForOrg(rateOrg);
  const fee = computePlatformFee(0, rateOrg); // rate/cap only; amount is irrelevant here
  const tier = (org.tier as Tier) in TIERS ? (org.tier as Tier) : "free_partner";
  const monthlyCents = Math.round(TIERS[tier].monthly * 100);
  return {
    planKey: plan,
    planLabel: planLabelFor(plan),
    feeRate: fee.feeRate,
    feeCapCents: fee.capCents,
    monthlyCents,
    limits: PHASE1_LIMITS,
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
  org: Pick<DbOrg, "tier" | "platform_fee_rate">,
  key: CapabilityKey,
  currentUsage: number,
): LimitCheck {
  const { limits } = getEntitlements(org);
  const limit = limits[key] ?? null;
  if (limit == null) return { allowed: true, limit: null, used: currentUsage };
  return { allowed: currentUsage < limit, limit, used: currentUsage };
}
