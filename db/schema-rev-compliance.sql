-- ============================================================================
-- Divini Partners by Divini Group - REVENUE/COMPLIANCE schema additions
-- (Modules 6/7/8: Audit Viewer + Compliance scaffolding + Revenue Center)
-- ----------------------------------------------------------------------------
-- This file adds the PRIVACY / DATA-SUBJECT compliance tables (GDPR/CCPA-style):
-- privacy_requests, consent_records, data_retention_policies. These are NEW and
-- are distinct from the Phase 8 "compliance" feature (COI / W-9 / e-sign /
-- availability) which lives in db/schema-phase8.sql - that one tracks insurance
-- documents; this one tracks data-subject rights.
--
-- The Audit Viewer (Module 6) and Revenue Center (Module 8) are READ-ONLY over
-- tables that already exist (audit_logs, organizations, payments/invoices,
-- partner_commissions, user_referrals, platform_credits), so they add NO tables.
--
-- All statements are ADDITIVE and idempotent (guarded with `if not exists`).
--
-- APPLY (after db/schema.sql and the referral/partner schemas):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-compliance.sql
-- (or append the file reference to db/apply-all.sql)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRIVACY / DATA-SUBJECT REQUESTS (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- A workflow record for access / deletion / export / correction requests. A
-- deletion request is a WORKFLOW row (status), NOT an automatic hard-delete:
-- a super-admin reviews and processes it. Either organization_id or user_id (or
-- both) may be null when the requester is anonymous / not yet matched.
create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  requester_email text,
  kind text not null check (kind in ('access','deletion','export','correction')),
  status text not null default 'received'
    check (status in ('received','in_progress','completed','rejected')),
  detail text,
  resolution_note text,
  handled_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_privacy_requests_status on privacy_requests(status);
create index if not exists idx_privacy_requests_org on privacy_requests(organization_id);
create index if not exists idx_privacy_requests_user on privacy_requests(user_id);
create index if not exists idx_privacy_requests_created on privacy_requests(created_at);

-- ---------------------------------------------------------------------------
-- CONSENT RECORDS (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- Append-only consent ledger: each row captures a grant/withdraw event for a
-- named consent type (e.g. 'marketing_email', 'analytics', 'data_processing').
-- The current state for a (user, type) is the most recent row by created_at.
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  consent_type text not null,
  granted boolean not null,
  source text,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_consent_records_user on consent_records(user_id);
create index if not exists idx_consent_records_type on consent_records(consent_type);

-- ---------------------------------------------------------------------------
-- DATA RETENTION POLICIES (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- Declares, per object_type, how long data is retained. organization_id null =
-- a platform-wide default; a non-null org row overrides it for that org.
-- This is a POLICY DECLARATION surface; enforcement (a purge job) is a separate
-- operational concern and is intentionally not automated here.
create table if not exists data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  object_type text not null,
  retention_days int not null,
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_retention_org on data_retention_policies(organization_id);
create index if not exists idx_retention_object on data_retention_policies(object_type);
