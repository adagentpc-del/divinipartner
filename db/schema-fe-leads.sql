-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- ----------------------------------------------------------------------------
-- Lead Quality Engine (U4) + Verified Lead Program (U5) from
-- FRICTION-ELIMINATION-ADDENDUM.md.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase / venue-intelligence file. New tables only, every create
-- guarded with `if not exists` so re-running is safe. Apply AFTER db/schema.sql
-- (and after the earlier phase / venue-intelligence files) against the same db:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-leads.sql
--
-- Linking: an event inquiry targets an existing `venues` row (and optionally a
-- vendor org) and records the requesting user. A verification badge attaches to
-- any subject (budget / decision_maker / event / company / venue) by id or ref.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- event_inquiries (U4 Lead Quality Engine) - a qualified inbound inquiry.
-- The required fields (event_type, budget_range, guest_count, date_range,
-- decision_maker_name, company, timeline) are enforced at the API layer; the
-- Lead Quality Engine (server/src/lib/leadQuality.ts) derives lead_quality_score
-- (0-100) and intent (high/medium/low) at create time and stores both so venues
-- can rank their inbox without recomputing.
-- ---------------------------------------------------------------------------
create table if not exists event_inquiries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  vendor_id uuid references organizations(id) on delete set null,
  requester_user_id uuid references users(id) on delete set null,
  event_type text,
  budget_range text,
  guest_count int,
  date_range jsonb,
  decision_maker_name text,
  company text,
  timeline text,
  message text,
  lead_quality_score int default 0,
  intent text check (intent in ('high','medium','low')),
  created_at timestamptz default now()
);

create index if not exists idx_event_inquiries_venue on event_inquiries (venue_id);
create index if not exists idx_event_inquiries_vendor on event_inquiries (vendor_id);
create index if not exists idx_event_inquiries_intent on event_inquiries (intent);

-- ---------------------------------------------------------------------------
-- verification_badges (U5 Verified Lead Program) - a verification marker that
-- can attach to any subject type. subject_id is the canonical id when the
-- subject is a row in this database; subject_ref is a free-form reference for
-- subjects without a stable id (e.g. a named decision maker or budget claim).
-- evidence holds the supporting jsonb (documents, notes, source links).
-- ---------------------------------------------------------------------------
create table if not exists verification_badges (
  id uuid primary key default gen_random_uuid(),
  subject_type text check (subject_type in ('budget','decision_maker','event','company','venue')),
  subject_id uuid,
  subject_ref text,
  verified boolean default false,
  verified_by uuid references users(id) on delete set null,
  verified_at timestamptz,
  evidence jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_verification_badges_subject on verification_badges (subject_type, subject_id);
