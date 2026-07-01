-- Module 2 - Platform Referral Program + Platform Credits.
--
-- Per-user referral links/codes, signup incentives, referrer credits, and a
-- credit ledger restricted to subscription/membership redemptions. Credits are
-- NON-cash, non-transferable, non-withdrawable: there is no payout path, only a
-- redemption applied toward a Divini Partners subscription.
--
-- Additive only. No existing tables are modified. The lead wires this file into
-- db/apply-all.sql (append after the users table is created). gen_random_uuid()
-- comes from pgcrypto.
create extension if not exists pgcrypto;

-- ---------- referral_codes ----------
-- One stable code per user. The referral link is built from this code
-- (PUBLIC_APP_URL/r/:code, or a relative /r/:code when no app URL is set).
create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  code text unique not null,
  created_at timestamptz default now()
);
create index if not exists idx_referral_codes_user on referral_codes (user_id);

-- ---------- user_referrals ----------
-- One row per referral the referrer sends or that is attributed to their code.
-- referred_user_id is filled in once the referred party has an account; until
-- then referred_email holds the invited address. A referral converts once.
create table if not exists user_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid references users(id) on delete cascade,
  referred_user_id uuid references users(id) on delete set null,
  referred_email text,
  code text,
  status text not null default 'pending'
    check (status in ('pending','converted','expired')),
  created_at timestamptz default now(),
  converted_at timestamptz
);
create index if not exists idx_user_referrals_referrer on user_referrals (referrer_user_id);
create index if not exists idx_user_referrals_code on user_referrals (code);

-- ---------- platform_credits ----------
-- Append-only credit ledger. Balance is computed deterministically as
-- sum(earned) - sum(redeemed) - sum(expired). 'pending' rows are NOT spendable
-- (they represent committed-but-not-yet-active value, e.g. the referred user's
-- 50%-off-first-two-months signup incentive that the billing flow consumes).
-- Credits are non-cash: redemption is only ever toward a subscription/membership
-- and there is no row kind that moves money off-platform.
create table if not exists platform_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  amount_cents bigint not null,
  kind text not null
    check (kind in ('earned','redeemed','expired','pending')),
  reason text,
  source_referral_id uuid references user_referrals(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_platform_credits_user on platform_credits (user_id);
create index if not exists idx_platform_credits_referral on platform_credits (source_referral_id);
