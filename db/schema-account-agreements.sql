-- ============================================================================
-- Account Agreements - custom per-account partnership / commission deals.
--
-- Lets a super-admin attach a bespoke agreement to a specific account (a
-- venue, vendor, or client) OR to a not-yet-claimed listing (unclaimed
-- profile, e.g. A3 before they claim). Example: "Partnership - 5% on signed
-- contracts". This RECORDS and ATTACHES the agreement (rate + terms + signed
-- doc link); it does not move money. Exactly one of organization_id /
-- unclaimed_profile_id is set per row.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists account_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  unclaimed_profile_id uuid references unclaimed_profiles(id) on delete cascade,
  subject_kind text,                 -- venue | vendor | client | other (display hint)
  agreement_type text not null,      -- partnership | referral | revenue_share | custom
  commission_rate numeric(6,3),      -- percent, e.g. 5.000
  applies_to text,                   -- signed_contracts | all_bookings | first_booking | custom
  terms text,
  doc_url text,                      -- link to the signed agreement (Box/Drive/DocuSign)
  status text not null default 'active',  -- active | inactive
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_agreements_subject_ck
    check (organization_id is not null or unclaimed_profile_id is not null)
);

create index if not exists idx_account_agreements_org on account_agreements(organization_id);
create index if not exists idx_account_agreements_profile on account_agreements(unclaimed_profile_id);
create index if not exists idx_account_agreements_status on account_agreements(status);
