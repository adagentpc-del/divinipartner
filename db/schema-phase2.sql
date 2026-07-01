-- ============================================================================
-- Divini Partners by Divini Group - PHASE 2 schema addendum
-- ----------------------------------------------------------------------------
-- AI-assisted onboarding + co-branded partner profiles (blueprint sections 8 + 9).
--
-- This file is ADDITIVE. It does not alter any table in db/schema.sql. Apply it
-- after schema.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase2.sql
--
-- Phase 2 reuses existing tables where possible:
--   organizations  -> the partner account (tier, verification_status)
--   profiles       -> the published co-branded profile (slug, theme, hero, ...)
--   venues/vendors -> structured business records
--   documents      -> uploaded intake docs (COI, W-9, portfolios, ...)
--
-- The tables below cover the things Phase 1 had no home for: a saveable,
-- sectioned onboarding draft; explicit theme controls; AI suggestions that must
-- be reviewed before they become real fields; and a clean slug registry.
-- Conventions match schema.sql: uuid PKs, timestamptz default now(), jsonb for
-- nested data, text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- onboarding_drafts ----------
-- One row per organization. The wizard saves here continuously ("save and come
-- back later"). `sections` is a jsonb map of { sectionKey: { ...fields } }, so
-- the wizard can add steps without a migration. `completion_status` is the
-- single source of truth for the profile lifecycle.
create table if not exists onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role text,
  sections jsonb not null default '{}'::jsonb,
  current_step text,
  steps_completed text[] default '{}',
  strength int default 0,                 -- 0..100 profile-strength meter
  completion_status text not null default 'Draft' check (completion_status in (
    'Draft','Basic Complete','Pending Review','Published','Verified',
    'Preferred Eligible','Preferred','Premier','Suspended','Archived')),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- profile_themes ----------
-- The partner brand controls for the co-branded profile body. The Divini shell
-- (header/footer/trust badges) is unaffected by these; only the profile body is.
create table if not exists profile_themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  logo_url text,
  cover_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  button_style text check (button_style in ('rounded','pill','square')),
  template text,                          -- one of the 10 templates (blueprint 9.5)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- ai_profile_suggestions ----------
-- Every AI-suggested field is recorded here and starts life as
-- 'ai_suggested_pending_verification'. Nothing here is ever shown publicly until
-- the partner accepts it (status -> 'accepted') and the field is promoted into
-- the onboarding draft / profile. The partner can also reject or edit.
create table if not exists ai_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text,                            -- 'website' | 'document' | 'manual'
  source_ref text,                        -- the URL or document id the suggestion came from
  section text,                           -- which onboarding section it targets
  field text,                             -- the field key
  suggested_value jsonb,                  -- { value, ... }
  status text not null default 'ai_suggested_pending_verification' check (status in (
    'ai_suggested_pending_verification','accepted','edited','rejected')),
  resolved_value jsonb,                   -- what the partner accepted/edited it to
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- website_intakes ----------
-- A record of each website / Instagram / portfolio / booking / Google link the
-- partner submitted during onboarding, plus the structured (not invented) fields
-- we derived from it.
create table if not exists website_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  link_type text,                         -- website | instagram | portfolio | booking | google | other
  status text default 'received',
  created_at timestamptz default now()
);

-- ---------- profile_slugs ----------
-- Clean slug registry so a partner can reserve a public slug independently of
-- whether the `profiles` row has been published yet. The published profile is
-- still written to the existing `profiles` table.
create table if not exists profile_slugs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null unique,
  kind text check (kind in ('venue','vendor','planner','supplier','installer')),
  created_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- indexes ----------
create index if not exists idx_onboarding_org on onboarding_drafts(organization_id);
create index if not exists idx_onboarding_status on onboarding_drafts(completion_status);
create index if not exists idx_themes_org on profile_themes(organization_id);
create index if not exists idx_ai_sugg_org on ai_profile_suggestions(organization_id);
create index if not exists idx_ai_sugg_status on ai_profile_suggestions(status);
create index if not exists idx_website_intakes_org on website_intakes(organization_id);
create index if not exists idx_profile_slugs_slug on profile_slugs(slug);
create index if not exists idx_profile_slugs_org on profile_slugs(organization_id);
