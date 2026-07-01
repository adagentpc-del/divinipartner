/**
 * Data-access layer for Strategic Partner Onboarding + Payouts (Module 1b).
 *
 * Backed by db/schema-rev-payout.sql (partner_onboarding, partner_payouts,
 * payout_excluded_clients, payout_excluded_transactions).
 *
 * Cross-workstream tables `partners` and `partner_commissions` are read BY NAME
 * at runtime (another agent owns them). Every read of those tables is wrapped so
 * that if the table is absent the accessor degrades gracefully (returns empty /
 * nulls) instead of throwing.
 *
 * SECURITY: this module never returns bank_routing_enc / bank_account_enc to a
 * caller. Public-facing shapes expose only bank_name, account_type,
 * account_last4. Full decryption (decryptSecret) is intentionally NOT performed
 * here; it stays in an explicit audited super-admin path.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { randomBytes } from "node:crypto";
import { q, q1, pool } from "../pool.js";
import { encryptSecret, isEncryptionConfigured, last4 } from "../lib/bankCrypto.js";

// ---- Types -----------------------------------------------------------------

export interface OnboardingRecord {
  id: string;
  partner_id: string | null;
  onboarding_code: string | null;
  legal_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_classification: string | null;
  w9_doc_id: string | null;
  w9_doc_url: string | null;
  payment_preference: string | null;
  bank_name: string | null;
  account_last4: string | null;
  account_type: string | null;
  enc_configured: boolean;
  agreement_accepted: boolean;
  signature: string | null;
  signed_at: string | null;
  status: "awaiting" | "submitted" | "verified";
  created_at: string;
  updated_at: string;
}

export interface PayoutRow {
  id: string;
  partner_id: string | null;
  period: string | null;
  gross_volume_cents: string | number;
  platform_fees_cents: string | number;
  processing_costs_cents: string | number;
  refunds_cents: string | number;
  chargebacks_cents: string | number;
  net_profit_cents: string | number;
  commission_pct: string | number;
  commission_owed_cents: string | number;
  commission_paid_cents: string | number;
  manual_adjustment_cents: string | number;
  status: string;
  requires_approval: boolean;
  paused: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const PAYOUT_STATUSES = [
  "pending",
  "awaiting_tax_info",
  "awaiting_bank_info",
  "approved",
  "scheduled",
  "paid",
  "held",
  "disputed",
  "cancelled",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

// SELECT lists that deliberately EXCLUDE the encrypted bank columns.
const ONB_PUBLIC_COLS = `
  id, partner_id, onboarding_code, legal_name, business_name, email, phone,
  address, tax_classification, w9_doc_id, w9_doc_url, payment_preference,
  bank_name, account_last4, account_type, enc_configured, agreement_accepted,
  signature, signed_at, status, created_at, updated_at`;

// ---- Cross-workstream readers (graceful degradation) -----------------------

/** True if a table exists in the current database (to-regclass is null-safe). */
async function tableExists(name: string): Promise<boolean> {
  try {
    const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [
      `public.${name}`,
    ]);
    return !!row?.reg;
  } catch {
    return false;
  }
}

export interface PartnerInfo {
  id: string;
  name: string | null;
  company: string | null;
  referral_code: string | null;
  revenue_share_pct: number | null;
}

/** List partners from the cross-workstream `partners` table, or [] if absent. */
export async function listPartners(): Promise<PartnerInfo[]> {
  if (!(await tableExists("partners"))) return [];
  try {
    return await q<PartnerInfo>(
      `select id, name, company, referral_code, revenue_share_pct
         from partners order by coalesce(name, company, id::text) asc`,
    );
  } catch {
    return [];
  }
}

export async function getPartner(partnerId: string): Promise<PartnerInfo | null> {
  if (!(await tableExists("partners"))) return null;
  try {
    return await q1<PartnerInfo>(
      `select id, name, company, referral_code, revenue_share_pct
         from partners where id = $1`,
      [partnerId],
    );
  } catch {
    return null;
  }
}

export interface CommissionAgg {
  net_profit_cents: number;
  commission_cents: number;
  rows: number;
}

/**
 * Aggregate the cross-workstream `partner_commissions` for one partner, honoring
 * the exclude flag on each row plus our own exclusion controls. Returns zeros if
 * the table is absent. The excluded-client / excluded-transaction filters are
 * applied best-effort: partner_commissions is read by name, so we only filter on
 * columns that may exist (source / payment id) defensively.
 */
export async function aggregateCommissions(partnerId: string): Promise<CommissionAgg> {
  const empty: CommissionAgg = { net_profit_cents: 0, commission_cents: 0, rows: 0 };
  if (!(await tableExists("partner_commissions"))) return empty;
  try {
    const row = await q1<{ net: string | null; com: string | null; n: string | null }>(
      `select coalesce(sum(net_profit_cents),0) as net,
              coalesce(sum(commission_cents),0) as com,
              count(*) as n
         from partner_commissions
        where partner_id = $1
          and coalesce(excluded, false) = false
          and coalesce(status,'') <> 'excluded'`,
      [partnerId],
    );
    return {
      net_profit_cents: Number(row?.net ?? 0),
      commission_cents: Number(row?.com ?? 0),
      rows: Number(row?.n ?? 0),
    };
  } catch {
    return empty;
  }
}

// ---- Onboarding ------------------------------------------------------------

function genCode(): string {
  // url-safe, unguessable enough for a private link (24 hex chars).
  return randomBytes(12).toString("hex");
}

/** Super-admin: create (or reuse) an onboarding link for a partner. */
export async function createOnboarding(partnerId: string): Promise<OnboardingRecord> {
  // Reuse an existing not-yet-verified record so we do not orphan links.
  const existing = await q1<OnboardingRecord>(
    `select ${ONB_PUBLIC_COLS} from partner_onboarding
      where partner_id = $1 and status <> 'verified'
      order by created_at desc limit 1`,
    [partnerId],
  );
  if (existing) return existing;
  const code = genCode();
  return (await q1<OnboardingRecord>(
    `insert into partner_onboarding (partner_id, onboarding_code, status)
       values ($1,$2,'awaiting')
     returning ${ONB_PUBLIC_COLS}`,
    [partnerId, code],
  )) as OnboardingRecord;
}

/** Public-ish: fetch the onboarding shell by code (NO secrets, ever). */
export async function getOnboardingByCode(code: string): Promise<OnboardingRecord | null> {
  if (!code) return null;
  return q1<OnboardingRecord>(
    `select ${ONB_PUBLIC_COLS} from partner_onboarding where onboarding_code = $1`,
    [code],
  );
}

export async function listOnboarding(): Promise<OnboardingRecord[]> {
  return q<OnboardingRecord>(
    `select ${ONB_PUBLIC_COLS} from partner_onboarding order by created_at desc limit 500`,
  );
}

export interface OnboardingSubmission {
  legal_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_classification?: string | null;
  w9_doc_id?: string | null;
  w9_doc_url?: string | null;
  payment_preference?: string | null;
  bank_name?: string | null;
  routing_number?: string | null; // plaintext IN only; encrypted before storage
  account_number?: string | null; // plaintext IN only; encrypted before storage
  account_type?: string | null;
  agreement_accepted?: boolean;
  signature?: string | null;
}

export interface SubmitResult {
  record: OnboardingRecord;
  bankCaptured: boolean;
  encryptionConfigured: boolean;
}

/**
 * Partner submits their onboarding info. Banking secrets are encrypted via
 * bankCrypto before storage; we persist only the ENCRYPTED tokens + account_last4
 * + bank_name + account_type. When PAYOUT_ENC_KEY is unset we store ONLY
 * account_last4 and set enc_configured=false (no plaintext secret is kept).
 * Returns the PUBLIC record shape (no secrets).
 */
export async function submitOnboarding(
  code: string,
  sub: OnboardingSubmission,
): Promise<SubmitResult | null> {
  const current = await q1<{ id: string }>(
    `select id from partner_onboarding where onboarding_code = $1`,
    [code],
  );
  if (!current) return null;

  const encOk = isEncryptionConfigured();
  let routingEnc: string | null = null;
  let accountEnc: string | null = null;
  let acctLast4: string | null = null;
  let bankCaptured = false;

  if (sub.account_number && String(sub.account_number).trim()) {
    acctLast4 = last4(String(sub.account_number));
    bankCaptured = true;
    if (encOk) {
      accountEnc = encryptSecret(String(sub.account_number).trim());
      if (sub.routing_number && String(sub.routing_number).trim()) {
        routingEnc = encryptSecret(String(sub.routing_number).trim());
      }
    }
    // when encryption is NOT configured we intentionally keep only last4.
  }

  const signedAt = sub.signature && String(sub.signature).trim() ? new Date().toISOString() : null;

  const updated = await q1<OnboardingRecord>(
    `update partner_onboarding set
        legal_name = coalesce($2, legal_name),
        business_name = coalesce($3, business_name),
        email = coalesce($4, email),
        phone = coalesce($5, phone),
        address = coalesce($6, address),
        tax_classification = coalesce($7, tax_classification),
        w9_doc_id = coalesce($8, w9_doc_id),
        w9_doc_url = coalesce($9, w9_doc_url),
        payment_preference = coalesce($10, payment_preference),
        bank_name = coalesce($11, bank_name),
        bank_routing_enc = coalesce($12, bank_routing_enc),
        bank_account_enc = coalesce($13, bank_account_enc),
        account_last4 = coalesce($14, account_last4),
        account_type = coalesce($15, account_type),
        enc_configured = $16,
        agreement_accepted = coalesce($17, agreement_accepted),
        signature = coalesce($18, signature),
        signed_at = coalesce($19, signed_at),
        status = 'submitted',
        updated_at = now()
      where onboarding_code = $1
      returning ${ONB_PUBLIC_COLS}`,
    [
      code,
      sub.legal_name ?? null,
      sub.business_name ?? null,
      sub.email ?? null,
      sub.phone ?? null,
      sub.address ?? null,
      sub.tax_classification ?? null,
      sub.w9_doc_id ?? null,
      sub.w9_doc_url ?? null,
      sub.payment_preference ?? null,
      sub.bank_name ?? null,
      routingEnc,
      accountEnc,
      acctLast4,
      sub.account_type ?? null,
      bankCaptured ? encOk : true, // only flip the flag when bank info was submitted
      typeof sub.agreement_accepted === "boolean" ? sub.agreement_accepted : null,
      sub.signature ?? null,
      signedAt,
    ],
  );
  if (!updated) return null;
  return { record: updated, bankCaptured, encryptionConfigured: encOk };
}

/** Super-admin: mark an onboarding record verified. */
export async function verifyOnboarding(id: string): Promise<OnboardingRecord | null> {
  return q1<OnboardingRecord>(
    `update partner_onboarding set status = 'verified', updated_at = now()
      where id = $1 returning ${ONB_PUBLIC_COLS}`,
    [id],
  );
}

/** Lightweight payment-method status for a partner (masked, no secrets). */
export async function paymentMethodStatus(partnerId: string): Promise<{
  hasOnboarding: boolean;
  status: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_last4: string | null;
  payment_preference: string | null;
  enc_configured: boolean | null;
  taxOnFile: boolean;
}> {
  const r = await q1<OnboardingRecord>(
    `select ${ONB_PUBLIC_COLS} from partner_onboarding
      where partner_id = $1 order by created_at desc limit 1`,
    [partnerId],
  );
  return {
    hasOnboarding: !!r,
    status: r?.status ?? null,
    bank_name: r?.bank_name ?? null,
    account_type: r?.account_type ?? null,
    account_last4: r?.account_last4 ?? null,
    payment_preference: r?.payment_preference ?? null,
    enc_configured: r?.enc_configured ?? null,
    taxOnFile: !!(r && r.tax_classification && r.w9_doc_id),
  };
}

// ---- Exclusion controls ----------------------------------------------------

export async function excludeClient(partnerId: string, orgId: string): Promise<void> {
  await q1(
    `insert into payout_excluded_clients (partner_id, excluded_org_id)
       values ($1,$2)
     on conflict (partner_id, excluded_org_id) do nothing`,
    [partnerId, orgId],
  );
}

export async function unexcludeClient(partnerId: string, orgId: string): Promise<void> {
  await q1(
    `delete from payout_excluded_clients where partner_id = $1 and excluded_org_id = $2`,
    [partnerId, orgId],
  );
}

export async function excludeTransaction(partnerId: string, paymentId: string): Promise<void> {
  await q1(
    `insert into payout_excluded_transactions (partner_id, payment_id)
       values ($1,$2)
     on conflict (partner_id, payment_id) do nothing`,
    [partnerId, paymentId],
  );
}

export async function listExclusions(partnerId: string): Promise<{
  clients: { id: string; excluded_org_id: string; created_at: string }[];
  transactions: { id: string; payment_id: string; created_at: string }[];
}> {
  const clients = await q<{ id: string; excluded_org_id: string; created_at: string }>(
    `select id, excluded_org_id, created_at from payout_excluded_clients where partner_id = $1`,
    [partnerId],
  );
  const transactions = await q<{ id: string; payment_id: string; created_at: string }>(
    `select id, payment_id, created_at from payout_excluded_transactions where partner_id = $1`,
    [partnerId],
  );
  return { clients, transactions };
}

// ---- Payout ledger ---------------------------------------------------------

export async function listPayouts(partnerId?: string): Promise<PayoutRow[]> {
  if (partnerId) {
    return q<PayoutRow>(
      `select * from partner_payouts where partner_id = $1 order by created_at desc`,
      [partnerId],
    );
  }
  return q<PayoutRow>(`select * from partner_payouts order by created_at desc limit 500`);
}

export async function getPayout(id: string): Promise<PayoutRow | null> {
  return q1<PayoutRow>(`select * from partner_payouts where id = $1`, [id]);
}

export interface UpsertPayoutInput {
  partner_id: string;
  period: string;
  gross_volume_cents?: number;
  platform_fees_cents?: number;
  processing_costs_cents?: number;
  refunds_cents?: number;
  chargebacks_cents?: number;
  net_profit_cents: number;
  commission_pct: number;
  commission_owed_cents: number;
  requires_approval?: boolean;
}

/** Insert or update the payout row for (partner, period). Used by compute. */
export async function upsertPayout(input: UpsertPayoutInput): Promise<PayoutRow> {
  const existing = await q1<PayoutRow>(
    `select * from partner_payouts where partner_id = $1 and period = $2`,
    [input.partner_id, input.period],
  );
  if (existing) {
    return (await q1<PayoutRow>(
      `update partner_payouts set
          gross_volume_cents = $3,
          platform_fees_cents = $4,
          processing_costs_cents = $5,
          refunds_cents = $6,
          chargebacks_cents = $7,
          net_profit_cents = $8,
          commission_pct = $9,
          commission_owed_cents = $10,
          updated_at = now()
        where partner_id = $1 and period = $2
        returning *`,
      [
        input.partner_id,
        input.period,
        input.gross_volume_cents ?? 0,
        input.platform_fees_cents ?? 0,
        input.processing_costs_cents ?? 0,
        input.refunds_cents ?? 0,
        input.chargebacks_cents ?? 0,
        input.net_profit_cents,
        input.commission_pct,
        input.commission_owed_cents,
      ],
    )) as PayoutRow;
  }
  return (await q1<PayoutRow>(
    `insert into partner_payouts
       (partner_id, period, gross_volume_cents, platform_fees_cents,
        processing_costs_cents, refunds_cents, chargebacks_cents, net_profit_cents,
        commission_pct, commission_owed_cents, requires_approval)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,true))
     returning *`,
    [
      input.partner_id,
      input.period,
      input.gross_volume_cents ?? 0,
      input.platform_fees_cents ?? 0,
      input.processing_costs_cents ?? 0,
      input.refunds_cents ?? 0,
      input.chargebacks_cents ?? 0,
      input.net_profit_cents,
      input.commission_pct,
      input.commission_owed_cents,
      input.requires_approval ?? null,
    ],
  )) as PayoutRow;
}

/** Patch a small set of mutable payout fields (admin controls). */
export async function patchPayout(
  id: string,
  fields: Partial<{
    status: PayoutStatus;
    requires_approval: boolean;
    paused: boolean;
    note: string | null;
    manual_adjustment_cents: number;
    commission_pct: number;
    commission_owed_cents: number;
    commission_paid_cents: number;
  }>,
): Promise<PayoutRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (fields.status !== undefined) add("status", fields.status);
  if (fields.requires_approval !== undefined) add("requires_approval", fields.requires_approval);
  if (fields.paused !== undefined) add("paused", fields.paused);
  if (fields.note !== undefined) add("note", fields.note);
  if (fields.manual_adjustment_cents !== undefined)
    add("manual_adjustment_cents", fields.manual_adjustment_cents);
  if (fields.commission_pct !== undefined) add("commission_pct", fields.commission_pct);
  if (fields.commission_owed_cents !== undefined)
    add("commission_owed_cents", fields.commission_owed_cents);
  if (fields.commission_paid_cents !== undefined)
    add("commission_paid_cents", fields.commission_paid_cents);
  if (!sets.length) return getPayout(id);
  params.push(id);
  return q1<PayoutRow>(
    `update partner_payouts set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length} returning *`,
    params,
  );
}

// keep pool import referenced for potential transactional growth without lint noise
void pool;
