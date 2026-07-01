-- ============================================================================
-- Module 1 - Partner Revenue Share core.
--
-- Partner profiles, editable revenue-share settings, permanent referral
-- attribution, and a PROFIT-BASED commission ledger. The commission engine
-- (server/src/lib/partnerCommission.ts) shares a partner's profit on each
-- referred transaction, where profit = platform fee minus processing cost,
-- never the gross invoice amount.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create extension if not exists pgcrypto;

-- Partner profiles. Each partner has a unique referral code/link and a fully
-- editable revenue-share configuration (commission type, applies-to toggles,
-- subscription mode, effective window, and duration).
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  name text,
  company text,
  partner_type text check (partner_type in (
    'strategic', 'affiliate', 'association',
    'venue_ambassador', 'vendor_ambassador', 'internal_sales'
  )),
  referral_code text unique,
  referral_link text,
  revenue_share_pct numeric default 0,
  commission_type text check (commission_type in (
    'flat', 'percentage', 'subscription_share', 'transaction_share', 'hybrid'
  )) default 'percentage',
  flat_fee_cents bigint default 0,
  applies_subscriptions bool default true,
  applies_transaction_fees bool default true,
  applies_setup_fees bool default false,
  applies_enterprise bool default false,
  subscription_mode text check (subscription_mode in (
    'include', 'exclude', 'first_x_months', 'lifetime', 'custom'
  )) default 'include',
  subscription_months int,
  subscription_share_pct numeric,
  effective_date timestamptz,
  expiration_date timestamptz,
  duration_kind text check (duration_kind in ('lifetime', 'limited')) default 'lifetime',
  status text default 'active',
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_partners_referral_code on partners(referral_code);

-- Permanent referral attribution. A first_touch row is written once when a
-- partner first refers an org and is NEVER overwritten (the unique key plus an
-- on-conflict-do-nothing insert at the application layer guarantee it).
create table if not exists partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  referred_org_id uuid,
  attribution text check (attribution in ('first_touch', 'last_touch', 'conversion')) default 'first_touch',
  referred_at timestamptz default now(),
  unique (partner_id, referred_org_id, attribution)
);

create index if not exists idx_partner_referrals_partner on partner_referrals(partner_id);
create index if not exists idx_partner_referrals_org on partner_referrals(referred_org_id);

-- Profit-based commission ledger. gross_cents is the original invoice for
-- reference only; the commission is computed against net_profit_cents
-- (platform_fee_cents - processing_cost_cents).
create table if not exists partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  referred_org_id uuid,
  source text check (source in (
    'subscription', 'transaction', 'setup', 'enterprise', 'manual_adjustment'
  )),
  gross_cents bigint default 0,
  platform_fee_cents bigint default 0,
  processing_cost_cents bigint default 0,
  net_profit_cents bigint default 0,
  share_pct numeric default 0,
  commission_cents bigint default 0,
  status text default 'pending',
  excluded bool default false,
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_partner_commissions_partner on partner_commissions(partner_id);
create index if not exists idx_partner_commissions_org on partner_commissions(referred_org_id);
