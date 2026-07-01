-- ============================================================================
-- Divini Partners - Anti-Circumvention tracking (Module 4)
-- ----------------------------------------------------------------------------
-- Records each platform-formed relationship (an "introduction") so the platform
-- can detect off-platform circumvention: party A and party B met THROUGH Divini
-- Partners, and a non-circumvention window applies for `window_months` from the
-- introduction. Super admins can flag, investigate, and suspend on a row without
-- ever hard-deleting it (the trail is the evidence).
--
-- This file is ADDITIVE. It does not ALTER any existing table. Every statement
-- is guarded so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-anticirc.sql
--
-- Fee transparency (Module 3) is pure-compute (server/src/lib/platformFees.ts +
-- server/src/lib/fees.ts) and needs no tables of its own; it reads the existing
-- organizations.tier / platform_fee_rate columns.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- introductions - one row per platform-formed relationship between two orgs.
-- ---------------------------------------------------------------------------
-- organization_id   the org on whose behalf the introduction was recorded (the
--                   tenant that "owns" the relationship record), nullable.
-- source_partner_id the partner/referrer org that produced the introduction.
-- party_a_org_id /  the two organizations that were introduced to each other.
-- party_b_org_id
-- subject_type      what kind of entity the relationship is about.
-- window_months     non-circumvention window length from introduced_at (default 24).
-- status            active | flagged | cleared | suspended (never hard-deleted).
create table if not exists introductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  source_partner_id uuid references organizations(id) on delete set null,
  party_a_org_id uuid references organizations(id) on delete set null,
  party_b_org_id uuid references organizations(id) on delete set null,
  subject_type text check (subject_type in ('venue','vendor','sponsor','exhibitor','client')),
  subject_id uuid,
  introduced_at timestamptz default now(),
  window_months int default 24,
  status text check (status in ('active','flagged','cleared','suspended')) default 'active',
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_introductions_party_a on introductions(party_a_org_id);
create index if not exists idx_introductions_party_b on introductions(party_b_org_id);
create index if not exists idx_introductions_status on introductions(status);
