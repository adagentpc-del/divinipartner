-- ============================================================================
-- Divini Partners - STRIPE CONNECT SPLIT-PAYOUT RAIL schema (idempotent).
-- ----------------------------------------------------------------------------
-- The disbursement rail. A recipient (referral partner, organization, or any
-- user) connects a bank account via a STRIPE-HOSTED onboarding link; we store
-- ONLY the Stripe Connect account id (acct_...), boolean capability flags, and
-- the bank last4 Stripe returns. We NEVER store a raw bank account or routing
-- number; those numbers live with Stripe, the licensed money transmitter.
--
-- When a platform_revenue row (db/schema-rev-accrual.sql) is marked COLLECTED,
-- the agreed split for each party is computed (server/src/lib/split-engine.ts)
-- from the existing partner_commissions / partner revenue-share, and a
-- payout_instructions row is queued per recipient. A super-admin RELEASES a
-- split with ONE CLICK; only then does the server INSTRUCT Stripe to transfer
-- the funds to the recipient. NOTHING here moves money on its own; the live
-- transfer is gated on a configured STRIPE_SECRET_KEY AND payouts_enabled.
--
-- This file is COMPLEMENTARY to db/schema-rev-payout.sql (agent-165). That file
-- owns partner_payouts / partner_onboarding (a per-period commission ledger with
-- encrypted-at-rest banking and a manual mark-paid that records, never moves,
-- money). This file owns the Stripe Connect transfer rail with its own
-- connect_accounts + payout_instructions tables. The two do NOT collide: no
-- table name here exists there, and we add nothing to their tables.
--
-- ADDITIVE and IDEMPOTENT (create table if not exists ...). Apply once, AFTER
-- db/schema.sql, db/schema-rev-partner.sql, and db/schema-rev-accrual.sql:
--
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-connect-payouts.sql
--   (or run db/apply-all.sql, which embeds this file)
--
-- Re-running it is safe. Zero em dashes below this line by convention.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- connect accounts (Stripe Connect onboarding state) ----------
-- One row per payout recipient owner. owner_kind tells you whether the bank
-- belongs to a referral partner, an organization (venue/vendor/etc), or an
-- individual user. stripe_account_id is the ONLY Stripe identifier we keep
-- (acct_...). charges_enabled / payouts_enabled / details_submitted mirror the
-- Stripe account capability flags; payouts_enabled is the gate that must be true
-- before any release attempts a transfer. bank_last4 is the masked tail Stripe
-- returns, for display only. We store NO raw bank account or routing numbers.
create table if not exists connect_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_kind text check (owner_kind in ('partner','organization','user')),
  owner_partner_id uuid,
  owner_organization_id uuid,
  owner_user_id uuid,
  stripe_account_id text,
  status text default 'not_started'
    check (status in ('not_started','onboarding','restricted','enabled','disabled')),
  charges_enabled boolean default false,
  payouts_enabled boolean default false,
  details_submitted boolean default false,
  bank_last4 text,
  country text,
  default_currency text default 'usd',
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_kind, owner_partner_id, owner_organization_id, owner_user_id)
);
create index if not exists idx_connect_accounts_partner on connect_accounts (owner_partner_id);
create index if not exists idx_connect_accounts_org on connect_accounts (owner_organization_id);
create index if not exists idx_connect_accounts_user on connect_accounts (owner_user_id);

-- ---------- payout instructions (the disbursement queue) ----------
-- One row per recipient split for a revenue event. basis_cents is the amount the
-- split was computed on (typically the platform fee), split_percentage is the
-- agreed share, amount_cents is what the recipient is owed. status flows
-- pending -> ready (when the recipient has a payouts-enabled connect account) ->
-- releasing -> paid, or blocked / failed / held / canceled. stripe_transfer_id
-- is the id of the Stripe transfer once a release succeeds. Nothing here moves
-- money; the transfer is instructed only from the 1-click release route.
create table if not exists payout_instructions (
  id uuid primary key default gen_random_uuid(),
  source_revenue_id uuid,
  source_payment_id uuid,
  recipient_kind text check (recipient_kind in ('partner','organization','user')),
  recipient_partner_id uuid,
  recipient_organization_id uuid,
  recipient_user_id uuid,
  connect_account_id uuid references connect_accounts(id) on delete set null,
  basis_cents bigint,
  split_percentage numeric,
  amount_cents bigint,
  currency text default 'usd',
  status text default 'pending'
    check (status in ('pending','ready','releasing','paid','failed','blocked','held','canceled')),
  stripe_transfer_id text,
  failure_reason text,
  released_by text,
  released_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_payout_instructions_status on payout_instructions (status);
create index if not exists idx_payout_instructions_revenue on payout_instructions (source_revenue_id);
create index if not exists idx_payout_instructions_partner on payout_instructions (recipient_partner_id);

-- ---------- connect payout audit (append-only action log) ----------
-- Every connect/onboard/queue/release/block/fail/hold/cancel action appends a
-- row here so the disbursement trail is fully auditable. Named distinctly so it
-- never collides with the commission-ledger audit surface.
create table if not exists connect_payout_audit (
  id uuid primary key default gen_random_uuid(),
  instruction_id uuid,
  actor_email text,
  action text,
  detail jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_connect_payout_audit_instruction on connect_payout_audit (instruction_id);
