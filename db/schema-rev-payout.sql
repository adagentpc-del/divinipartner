-- ============================================================================
-- Divini Partners by Divini Group - STRATEGIC PARTNER ONBOARDING + PAYOUT
-- (Module 1b). Secure partner tax + banking + W-9 collection, and a payout
-- ledger with statuses + admin controls + a super-admin payout dashboard.
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE and SECURITY-CRITICAL. They do NOT alter any
-- table in db/schema.sql or any earlier phase file. New tables only, every
-- create guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-payout.sql
--
-- CROSS-WORKSTREAM (read by NAME at runtime, no FK, may be created by another
-- workstream): `partners` (id, name, company, referral_code, revenue_share_pct)
-- and `partner_commissions` (partner_id, source, net_profit_cents,
-- commission_cents, status, excluded). The payout engine aggregates
-- partner_commissions when present and degrades gracefully when absent. We do
-- NOT create those tables here (another agent owns them) and we deliberately
-- avoid hard foreign keys to them so apply order is unconstrained.
--
-- SECURITY NOTE on banking columns:
--   bank_routing_enc / bank_account_enc store ENCRYPTED tokens ONLY (AES-256-GCM
--   via server/src/lib/bankCrypto.ts). They are NEVER returned to any client.
--   account_last4 is the ONLY plaintext bank fragment and is the only thing a
--   response may expose alongside bank_name + account_type. If PAYOUT_ENC_KEY is
--   unset the app stores only account_last4 and sets enc_configured=false so the
--   onboarding endpoint can warn that full banking was not captured.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); text + CHECK for small enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- partner_onboarding - one secure onboarding record per partner. A super-admin
-- mints an onboarding_code and shares the private link; the partner submits
-- their legal/tax/banking info against that code. status:
--   awaiting   link created, partner has not submitted yet
--   submitted  partner submitted their info (incl bank + signature)
--   verified   super-admin reviewed + verified the record
-- ---------------------------------------------------------------------------
create table if not exists partner_onboarding (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid,
  onboarding_code     text unique,
  legal_name          text,
  business_name       text,
  email               text,
  phone               text,
  address             text,
  tax_classification  text,           -- e.g. individual | llc | s_corp | c_corp | partnership | nonprofit
  w9_doc_id           uuid,           -- documents.id of the uploaded W-9 (or external doc url ref)
  w9_doc_url          text,           -- signed/relative url convention from storage.ts (optional mirror)
  payment_preference  text,           -- ach | check | paypal | wire
  bank_name           text,
  bank_routing_enc    text,           -- ENCRYPTED token only (never plaintext, never returned)
  bank_account_enc    text,           -- ENCRYPTED token only (never plaintext, never returned)
  account_last4       text,           -- ONLY plaintext bank fragment that may be exposed
  account_type        text,           -- checking | savings
  enc_configured      boolean default true,  -- false when PAYOUT_ENC_KEY was unset at submit time
  agreement_accepted  boolean default false,
  signature           text,           -- typed signature
  signed_at           timestamptz,
  status              text check (status in ('awaiting','submitted','verified')) default 'awaiting',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_partner_onboarding_code on partner_onboarding (onboarding_code);
create index if not exists idx_partner_onboarding_partner on partner_onboarding (partner_id);

-- ---------------------------------------------------------------------------
-- partner_payouts - the payout ledger. One row per partner per period. Amounts
-- are integer cents. net_profit_cents = platform_fees - processing_costs -
-- refunds - chargebacks (the profit basis). commission_owed_cents =
-- net_profit_cents * commission_pct + manual_adjustment_cents (minus excluded,
-- applied during compute). status is the 9-state lifecycle.
-- ---------------------------------------------------------------------------
create table if not exists partner_payouts (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid,
  period                  text,                       -- e.g. 2026-06 (free text)
  gross_volume_cents      bigint default 0,
  platform_fees_cents     bigint default 0,
  processing_costs_cents  bigint default 0,
  refunds_cents           bigint default 0,
  chargebacks_cents       bigint default 0,
  net_profit_cents        bigint default 0,
  commission_pct          numeric default 0,          -- 0..1 (e.g. 0.10 = 10%)
  commission_owed_cents   bigint default 0,
  commission_paid_cents   bigint default 0,
  manual_adjustment_cents bigint default 0,
  status                  text check (status in
                            ('pending','awaiting_tax_info','awaiting_bank_info',
                             'approved','scheduled','paid','held','disputed','cancelled'))
                            default 'pending',
  requires_approval       boolean default true,
  paused                  boolean default false,
  note                    text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_partner_payouts_partner on partner_payouts (partner_id);
create index if not exists idx_partner_payouts_period on partner_payouts (period);

-- ---------------------------------------------------------------------------
-- Exclusion controls. A super-admin can exclude a specific client org or a
-- specific payment from a partner's commission basis. The payout engine honors
-- both when aggregating partner_commissions.
-- ---------------------------------------------------------------------------
create table if not exists payout_excluded_clients (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid,
  excluded_org_id uuid,
  created_at      timestamptz default now()
);
create index if not exists idx_payout_excl_clients_partner on payout_excluded_clients (partner_id);
create unique index if not exists uq_payout_excl_clients
  on payout_excluded_clients (partner_id, excluded_org_id);

create table if not exists payout_excluded_transactions (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid,
  payment_id  uuid,
  created_at  timestamptz default now()
);
create index if not exists idx_payout_excl_tx_partner on payout_excluded_transactions (partner_id);
create unique index if not exists uq_payout_excl_tx
  on payout_excluded_transactions (partner_id, payment_id);
