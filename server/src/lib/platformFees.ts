/**
 * Platform fee + cap engine. The single source of truth for what Divini Partners
 * charges on a transaction, and the cap that keeps a large booking from paying an
 * unbounded fee. Deterministic and pure (no DB, no eval) so it can be used in
 * routes, workers, the autoquote engine, PDFs, and tests alike.
 *
 * Membership plans map from an organization's `tier`:
 *   client / free_partner -> free      (5.0%, capped at $2,500)
 *   partner               -> partner   (2.5%, capped at $2,500, $45/mo)
 *   premier               -> premier   (1.0%, capped at $5,000, $99/mo)
 *   white_label           -> enterprise(custom rate from org.platform_fee_rate, no cap unless set)
 *
 * All amounts are in integer cents. feeRate is a fraction (0.025 == 2.5%).
 */

export type PlanKey = "free" | "partner" | "premier" | "enterprise";

export interface Plan {
  key: PlanKey;
  label: string;
  /** Fraction of the transaction taken as the platform fee (0.025 == 2.5%). */
  feeRate: number;
  /** Maximum platform fee in cents, or null for no fixed cap. */
  capCents: number | null;
  /** Recurring membership price in cents per month (0 for free). */
  monthlyCents: number;
}

/** Default enterprise fee rate when an org has no explicit platform_fee_rate. */
const ENTERPRISE_DEFAULT_FEE_RATE = 0.01;

export const PLANS: Record<PlanKey, Plan> = {
  free: { key: "free", label: "Free", feeRate: 0.05, capCents: 250000, monthlyCents: 0 },
  partner: { key: "partner", label: "Partner", feeRate: 0.025, capCents: 250000, monthlyCents: 4500 },
  premier: { key: "premier", label: "Premier", feeRate: 0.01, capCents: 500000, monthlyCents: 9900 },
  // enterprise rate/cap/monthly are resolved per org (see computePlatformFee); the
  // record values below are the defaults used when no org override is present.
  enterprise: { key: "enterprise", label: "Enterprise", feeRate: ENTERPRISE_DEFAULT_FEE_RATE, capCents: null, monthlyCents: 0 },
};

/** Map an organization's billing tier to a membership plan key. */
export function planForOrg(org: { tier?: string | null; platform_fee_rate?: number | null }): PlanKey {
  switch (org.tier) {
    case "partner":
      return "partner";
    case "premier":
      return "premier";
    case "white_label":
      return "enterprise";
    case "client":
    case "free_partner":
    default:
      return "free";
  }
}

export interface PlatformFeeResult {
  plan: PlanKey;
  /** Effective fee fraction applied to this transaction. */
  feeRate: number;
  /** Effective cap in cents, or null for no cap. */
  capCents: number | null;
  /** Uncapped fee: round(amountCents * feeRate). */
  rawFeeCents: number;
  /** Final platform fee after the cap is applied. */
  platformFeeCents: number;
  /** True when the cap reduced the fee below the raw amount. */
  capApplied: boolean;
}

/**
 * Compute the platform fee for a transaction amount (in cents) given the paying
 * organization. Enterprise orgs use their stored platform_fee_rate (or the
 * enterprise default) and have no cap unless one is supplied via the plan.
 */
export function computePlatformFee(
  amountCents: number,
  org: { tier?: string | null; platform_fee_rate?: number | null },
): PlatformFeeResult {
  const plan = planForOrg(org);
  const base = PLANS[plan];

  const amount = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;

  let feeRate = base.feeRate;
  let capCents = base.capCents;

  if (plan === "enterprise") {
    const stored = org.platform_fee_rate;
    feeRate = typeof stored === "number" && Number.isFinite(stored) && stored >= 0 ? stored : ENTERPRISE_DEFAULT_FEE_RATE;
    // No cap for enterprise unless the plan record sets one.
    capCents = base.capCents;
  }

  const rawFeeCents = Math.round(amount * feeRate);
  const platformFeeCents = capCents != null ? Math.min(rawFeeCents, capCents) : rawFeeCents;
  const capApplied = platformFeeCents < rawFeeCents;

  return { plan, feeRate, capCents, rawFeeCents, platformFeeCents, capApplied };
}
