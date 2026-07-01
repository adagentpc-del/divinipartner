-- ============================================================================
-- CLAIM YOUR PROFILE - automation engine additions
-- ============================================================================
-- The core claim-engine tables already live in db/schema.sql:
--   discovered_businesses, unclaimed_profiles, claim_outreach,
--   claim_verifications, claim_markets
--
-- This file adds the small set of columns + tables the automation addendum
-- requires that were not yet present. Everything is additive and idempotent
-- (create ... if not exists / add column if not exists), so it is safe to run
-- after db/schema.sql on the same database.
--
-- ZERO em dashes anywhere in this project (hard rule).
-- ============================================================================

-- ---------- discovered_businesses: enrichment + scoring detail --------------
alter table discovered_businesses
  add column if not exists confidence_band text;            -- high | review | low | reject
alter table discovered_businesses
  add column if not exists confidence_inputs jsonb;         -- per-signal breakdown
alter table discovered_businesses
  add column if not exists duplicate_of uuid references discovered_businesses(id) on delete set null;
alter table discovered_businesses
  add column if not exists duplicate_reason text;
alter table discovered_businesses
  add column if not exists market_id uuid references claim_markets(id) on delete set null;
alter table discovered_businesses
  add column if not exists do_not_contact boolean default false;
alter table discovered_businesses
  add column if not exists notes text;

-- ---------- unclaimed_profiles: claim linkage -------------------------------
alter table unclaimed_profiles
  add column if not exists claimed_organization_id uuid references organizations(id) on delete set null;
alter table unclaimed_profiles
  add column if not exists claimed_at timestamptz;
alter table unclaimed_profiles
  add column if not exists archived boolean default false;

-- ---------- claim_outreach: cadence + compliance detail ---------------------
alter table claim_outreach
  add column if not exists cadence text;                    -- weekly | monthly | stopped
alter table claim_outreach
  add column if not exists stop_reason text;
alter table claim_outreach
  add column if not exists email_body text;

-- ---------- claim_verifications: code + expiry ------------------------------
alter table claim_verifications
  add column if not exists verification_code text;
alter table claim_verifications
  add column if not exists code_expires_at timestamptz;
alter table claim_verifications
  add column if not exists agreement_version text;
alter table claim_verifications
  add column if not exists full_name text;
alter table claim_verifications
  add column if not exists claimant_role text;

-- ---------- claim_suppression ----------------------------------------------
-- Suppression list. Any email or domain here stops all future outreach. Built
-- from unsubscribe requests, removal requests, do-not-contact flags, and hard
-- bounces. Checked before every send.
create table if not exists claim_suppression (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text check (reason in (
    'unsubscribe','removal_request','do_not_contact','bounce','manual')),
  profile_id uuid references unclaimed_profiles(id) on delete set null,
  source_ip text,
  created_at timestamptz default now()
);

create unique index if not exists idx_suppression_email on claim_suppression(lower(email)) where email is not null;
create index if not exists idx_suppression_domain on claim_suppression(lower(domain)) where domain is not null;
create index if not exists idx_disc_dupe on discovered_businesses(duplicate_of);
create index if not exists idx_disc_market on discovered_businesses(market_id);
create index if not exists idx_unclaimed_slug on unclaimed_profiles(profile_slug);
create index if not exists idx_unclaimed_org on unclaimed_profiles(claimed_organization_id);
