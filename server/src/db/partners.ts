/**
 * Module 1 - Partner data access (partners, partner_referrals,
 * partner_commissions). Backed by db/schema-rev-partner.sql.
 *
 * Pure data layer: route-level guards (super-admin for partner CRUD) live in
 * routes/partners.ts and routes/partner-portal.ts. The profit-based commission
 * math lives in lib/partnerCommission.ts; recordCommission() below is the seam
 * that calls it and persists a ledger row.
 */
import { q, q1 } from "../pool.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";
import { computePartnerCommission, type CommissionInput } from "../lib/partnerCommission.js";

export type PartnerType =
  | "strategic"
  | "affiliate"
  | "association"
  | "venue_ambassador"
  | "vendor_ambassador"
  | "internal_sales";

export type CommissionType =
  | "flat"
  | "percentage"
  | "subscription_share"
  | "transaction_share"
  | "hybrid";

export type SubscriptionMode = "include" | "exclude" | "first_x_months" | "lifetime" | "custom";
export type DurationKind = "lifetime" | "limited";
export type Attribution = "first_touch" | "last_touch" | "conversion";

export const PARTNER_TYPES: PartnerType[] = [
  "strategic",
  "affiliate",
  "association",
  "venue_ambassador",
  "vendor_ambassador",
  "internal_sales",
];
export const COMMISSION_TYPES: CommissionType[] = [
  "flat",
  "percentage",
  "subscription_share",
  "transaction_share",
  "hybrid",
];
export const SUBSCRIPTION_MODES: SubscriptionMode[] = [
  "include",
  "exclude",
  "first_x_months",
  "lifetime",
  "custom",
];

export interface Partner {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  name: string | null;
  company: string | null;
  partner_type: string | null;
  referral_code: string | null;
  referral_link: string | null;
  revenue_share_pct: number | string | null;
  commission_type: string | null;
  flat_fee_cents: number | string | null;
  applies_subscriptions: boolean | null;
  applies_transaction_fees: boolean | null;
  applies_setup_fees: boolean | null;
  applies_enterprise: boolean | null;
  subscription_mode: string | null;
  subscription_months: number | null;
  subscription_share_pct: number | string | null;
  effective_date: string | null;
  expiration_date: string | null;
  duration_kind: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

export interface PartnerReferral {
  id: string;
  partner_id: string;
  referred_org_id: string;
  attribution: string;
  referred_at: string;
}

export interface PartnerCommission {
  id: string;
  partner_id: string;
  referred_org_id: string | null;
  source: string;
  gross_cents: number | string;
  platform_fee_cents: number | string;
  processing_cost_cents: number | string;
  net_profit_cents: number | string;
  share_pct: number | string;
  commission_cents: number | string;
  status: string;
  excluded: boolean;
  note: string | null;
  created_at: string;
}

/** The editable revenue-share fields a super-admin may set on create / edit. */
export interface PartnerSettings {
  name?: string | null;
  company?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  partner_type?: PartnerType | null;
  revenue_share_pct?: number | null;
  commission_type?: CommissionType | null;
  flat_fee_cents?: number | null;
  applies_subscriptions?: boolean | null;
  applies_transaction_fees?: boolean | null;
  applies_setup_fees?: boolean | null;
  applies_enterprise?: boolean | null;
  subscription_mode?: SubscriptionMode | null;
  subscription_months?: number | null;
  subscription_share_pct?: number | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  duration_kind?: DurationKind | null;
  status?: string | null;
  notes?: string | null;
}

// ---- referral codes --------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function randomCode(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Build the public referral link for a code, honouring PUBLIC_APP_URL/BASE_PATH. */
export function referralLinkForCode(code: string): string {
  const base = PUBLIC_APP_URL || "";
  const path = `${BASE_PATH}/?ref=${encodeURIComponent(code)}`;
  return base ? `${base}${path}` : path;
}

/** Generate a referral code not already used by another partner. */
async function uniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode(8);
    const existing = await q1<{ id: string }>(`select id from partners where referral_code = $1`, [code]);
    if (!existing) return code;
  }
  // Extremely unlikely fallback: widen the code.
  return randomCode(12);
}

// ---- partner CRUD ----------------------------------------------------------

export async function listPartners(filter: { status?: string; partner_type?: string } = {}): Promise<Partner[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.partner_type) {
    params.push(filter.partner_type);
    where.push(`partner_type = $${params.length}`);
  }
  return q<Partner>(
    `select * from partners ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit 500`,
    params,
  );
}

export async function getPartner(id: string): Promise<Partner | null> {
  return q1<Partner>(`select * from partners where id = $1`, [id]);
}

export async function getPartnerByCode(code: string): Promise<Partner | null> {
  return q1<Partner>(`select * from partners where referral_code = $1`, [code]);
}

/** Resolve the partner row for a signed-in user (by user_id, else by their org). */
export async function getPartnerForUser(userId: string, orgId: string | null): Promise<Partner | null> {
  const byUser = await q1<Partner>(`select * from partners where user_id = $1 order by created_at asc limit 1`, [userId]);
  if (byUser) return byUser;
  if (orgId) {
    return q1<Partner>(`select * from partners where organization_id = $1 order by created_at asc limit 1`, [orgId]);
  }
  return null;
}

export async function createPartner(settings: PartnerSettings): Promise<Partner> {
  const code = await uniqueReferralCode();
  const link = referralLinkForCode(code);
  const row = await q1<Partner>(
    `insert into partners (
       organization_id, user_id, name, company, partner_type,
       referral_code, referral_link,
       revenue_share_pct, commission_type, flat_fee_cents,
       applies_subscriptions, applies_transaction_fees, applies_setup_fees, applies_enterprise,
       subscription_mode, subscription_months, subscription_share_pct,
       effective_date, expiration_date, duration_kind, status, notes
     ) values (
       $1,$2,$3,$4,$5,
       $6,$7,
       coalesce($8,0), coalesce($9,'percentage'), coalesce($10,0),
       coalesce($11,true), coalesce($12,true), coalesce($13,false), coalesce($14,false),
       coalesce($15,'include'), $16, $17,
       $18, $19, coalesce($20,'lifetime'), coalesce($21,'active'), $22
     ) returning *`,
    [
      settings.organization_id ?? null,
      settings.user_id ?? null,
      settings.name ?? null,
      settings.company ?? null,
      settings.partner_type ?? null,
      code,
      link,
      settings.revenue_share_pct ?? null,
      settings.commission_type ?? null,
      settings.flat_fee_cents ?? null,
      settings.applies_subscriptions ?? null,
      settings.applies_transaction_fees ?? null,
      settings.applies_setup_fees ?? null,
      settings.applies_enterprise ?? null,
      settings.subscription_mode ?? null,
      settings.subscription_months ?? null,
      settings.subscription_share_pct ?? null,
      settings.effective_date ?? null,
      settings.expiration_date ?? null,
      settings.duration_kind ?? null,
      settings.status ?? null,
      settings.notes ?? null,
    ],
  );
  return row as Partner;
}

/** The settable revenue-share columns, mapped to the patch keys. */
const EDITABLE_COLUMNS: Array<keyof PartnerSettings> = [
  "name",
  "company",
  "organization_id",
  "user_id",
  "partner_type",
  "revenue_share_pct",
  "commission_type",
  "flat_fee_cents",
  "applies_subscriptions",
  "applies_transaction_fees",
  "applies_setup_fees",
  "applies_enterprise",
  "subscription_mode",
  "subscription_months",
  "subscription_share_pct",
  "effective_date",
  "expiration_date",
  "duration_kind",
  "status",
  "notes",
];

/** Update a partner's editable settings. Returns the updated row (or null). */
export async function updatePartner(id: string, patch: PartnerSettings): Promise<Partner | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of EDITABLE_COLUMNS) {
    if (key in patch && patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return getPartner(id);
  params.push(id);
  return q1<Partner>(
    `update partners set ${sets.join(", ")} where id = $${params.length} returning *`,
    params,
  );
}

// ---- referral attribution (permanent first_touch) --------------------------

/**
 * Record an attribution for a referred org. first_touch is PERMANENT: an
 * existing first_touch row is never overwritten (on conflict do nothing). Other
 * attributions (last_touch, conversion) are upserted by their unique key.
 */
export async function recordReferral(
  partnerId: string,
  referredOrgId: string,
  attribution: Attribution = "first_touch",
): Promise<PartnerReferral | null> {
  return q1<PartnerReferral>(
    `insert into partner_referrals (partner_id, referred_org_id, attribution)
       values ($1,$2,$3)
     on conflict (partner_id, referred_org_id, attribution) do nothing
     returning *`,
    [partnerId, referredOrgId, attribution],
  );
}

/** All referrals for a partner (newest first). */
export async function listReferrals(partnerId: string): Promise<PartnerReferral[]> {
  return q<PartnerReferral>(
    `select * from partner_referrals where partner_id = $1 order by referred_at desc limit 500`,
    [partnerId],
  );
}

/** Referred orgs with their name + tier (for the admin + portal views). */
export interface ReferredOrgRow {
  referred_org_id: string;
  attribution: string;
  referred_at: string;
  org_name: string | null;
  org_type: string | null;
}
export async function listReferredOrgs(partnerId: string): Promise<ReferredOrgRow[]> {
  return q<ReferredOrgRow>(
    `select pr.referred_org_id, pr.attribution, pr.referred_at,
            o.name as org_name, o.type as org_type
       from partner_referrals pr
       left join organizations o on o.id = pr.referred_org_id
      where pr.partner_id = $1
      order by pr.referred_at desc
      limit 500`,
    [partnerId],
  );
}

// ---- commissions -----------------------------------------------------------

export async function listCommissions(partnerId: string): Promise<PartnerCommission[]> {
  return q<PartnerCommission>(
    `select * from partner_commissions where partner_id = $1 order by created_at desc limit 500`,
    [partnerId],
  );
}

export interface CommissionTotals {
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  earned_cents: number; // pending + approved + paid (excluded rows omitted)
  count: number;
}

/** Roll up a partner's commission ledger by status (excluded rows omitted). */
export async function commissionTotals(partnerId: string): Promise<CommissionTotals> {
  const row = await q1<{
    pending_cents: string | null;
    approved_cents: string | null;
    paid_cents: string | null;
    earned_cents: string | null;
    count: string | null;
  }>(
    `select
        coalesce(sum(commission_cents) filter (where status = 'pending'), 0)  as pending_cents,
        coalesce(sum(commission_cents) filter (where status = 'approved'), 0) as approved_cents,
        coalesce(sum(commission_cents) filter (where status = 'paid'), 0)     as paid_cents,
        coalesce(sum(commission_cents), 0)                                    as earned_cents,
        count(*)                                                              as count
       from partner_commissions
      where partner_id = $1 and excluded = false`,
    [partnerId],
  );
  return {
    pending_cents: Number(row?.pending_cents ?? 0),
    approved_cents: Number(row?.approved_cents ?? 0),
    paid_cents: Number(row?.paid_cents ?? 0),
    earned_cents: Number(row?.earned_cents ?? 0),
    count: Number(row?.count ?? 0),
  };
}

/**
 * RECORD a commission for a referred org's transaction. Computes the
 * profit-based commission via lib/partnerCommission.ts and persists a ledger
 * row. Called when a referred org pays / subscribes (from a route guarded to
 * admin/system). Returns the inserted row plus the computed breakdown.
 *
 * If excludeOnZero is true (default), a zero-commission outcome (toggles or
 * subscription mode disqualify the source) is still written but flagged
 * excluded so the ledger stays auditable without inflating earned totals.
 */
export interface RecordCommissionArgs extends CommissionInput {
  partnerId: string;
  referredOrgId?: string | null;
  note?: string | null;
  status?: string;
}
export interface RecordedCommission {
  row: PartnerCommission;
  netProfitCents: number;
  sharePct: number;
  commissionCents: number;
}

export async function recordCommission(args: RecordCommissionArgs): Promise<RecordedCommission> {
  const partner = await getPartner(args.partnerId);
  if (!partner) throw new Error("partner not found");

  const result = computePartnerCommission(partner, {
    source: args.source,
    grossCents: args.grossCents,
    platformFeeCents: args.platformFeeCents,
    processingCostCents: args.processingCostCents,
    subscriptionCycle: args.subscriptionCycle,
  });

  const excluded = result.commissionCents <= 0;
  const status = excluded ? "excluded" : args.status ?? "pending";

  const row = await q1<PartnerCommission>(
    `insert into partner_commissions (
       partner_id, referred_org_id, source,
       gross_cents, platform_fee_cents, processing_cost_cents,
       net_profit_cents, share_pct, commission_cents, status, excluded, note
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
     ) returning *`,
    [
      args.partnerId,
      args.referredOrgId ?? null,
      args.source,
      Math.round(args.grossCents) || 0,
      Math.round(args.platformFeeCents) || 0,
      Math.round(args.processingCostCents) || 0,
      result.netProfitCents,
      result.sharePct,
      result.commissionCents,
      status,
      excluded,
      args.note ?? null,
    ],
  );

  return {
    row: row as PartnerCommission,
    netProfitCents: result.netProfitCents,
    sharePct: result.sharePct,
    commissionCents: result.commissionCents,
  };
}

// ---- optional cross-workstream payout tables (read by NAME, degrade) -------

/** True when a table exists in the public schema. */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ exists: boolean }>(`select to_regclass($1) is not null as exists`, [`public.${name}`]);
  return !!row?.exists;
}

/**
 * Best-effort payment-method / onboarding status for a partner. Another
 * workstream owns partner_onboarding / partner_payouts; we read them by name if
 * they exist and degrade to a neutral status otherwise. Never throws.
 */
export interface PayoutStatusView {
  onboarding_status: string | null;
  payout_method: string | null;
  has_payout_method: boolean;
  available: boolean; // false when the owning tables are not present yet
}
export async function partnerPayoutStatus(partner: Partner): Promise<PayoutStatusView> {
  const neutral: PayoutStatusView = {
    onboarding_status: null,
    payout_method: null,
    has_payout_method: false,
    available: false,
  };
  try {
    const hasOnboarding = await tableExists("partner_onboarding");
    const hasPayouts = await tableExists("partner_payouts");
    if (!hasOnboarding && !hasPayouts) return neutral;

    let onboarding_status: string | null = null;
    let payout_method: string | null = null;

    if (hasOnboarding) {
      const o = await q1<{ status: string | null; payment_preference: string | null; account_last4: string | null }>(
        `select status, payment_preference, account_last4 from partner_onboarding where partner_id = $1 order by created_at desc limit 1`,
        [partner.id],
      ).catch(() => null);
      onboarding_status = o?.status ?? null;
      // The payout method lives on the onboarding row (payment_preference), with
      // account_last4 the only plaintext bank fragment ever surfaced.
      payout_method = o?.payment_preference
        ? o.account_last4
          ? `${o.payment_preference} ****${o.account_last4}`
          : o.payment_preference
        : null;
    }
    return {
      onboarding_status,
      payout_method,
      has_payout_method: !!payout_method,
      available: true,
    };
  } catch {
    return neutral;
  }
}
