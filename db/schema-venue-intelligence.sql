-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions
-- ----------------------------------------------------------------------------
-- Venue Intelligence Database (Phase 1 foundation of the Venue Intelligence +
-- Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md "Data model" 1-4).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql (and after the
-- earlier phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-venue-intelligence.sql
--
-- Linking: a venue twin extends an existing `venues` row and is scoped to the
-- owning `organizations` row, exactly like events.organization_id. venue_id is
-- the venue link; organization_id is the authorization boundary.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money; text +
-- CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- venue_twin (addendum data model 1) - one row per venue.
-- The durable, reusable intelligence record for a venue. readiness_score is the
-- Quote Readiness Score (0-100), recomputed and stored on every write by
-- server/src/lib/venueTwin.ts computeQuoteReadinessScore.
-- ---------------------------------------------------------------------------
create table if not exists venue_twin (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  type text,
  address text,
  website text,
  capacity int,
  indoor_capacity int,
  outdoor_capacity int,
  parking_capacity int,
  loading_dock jsonb,
  freight_elevator jsonb,
  power jsonb,
  internet jsonb,
  security_requirements jsonb,
  insurance_requirements jsonb,
  union_requirements jsonb,
  install_windows jsonb,
  removal_windows jsonb,
  contacts jsonb,
  emergency_contacts jsonb,
  readiness_score int default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (venue_id)
);

-- ---------------------------------------------------------------------------
-- venue_assets (addendum data model 2) - uploaded files for a venue.
-- kind covers photos, floorplans, compliance docs, branding guidelines, etc.
-- meta jsonb carries optional structured detail (e.g. measurements derived from
-- a floorplan) the Quote Readiness Score can read.
-- ---------------------------------------------------------------------------
create table if not exists venue_assets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  kind text check (kind in (
    'photo','video','pdf','floorplan','cad','sitemap','install_guide',
    'rulebook','insurance','branding_guideline')),
  url text,
  label text,
  meta jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- branding_opportunities (addendum data model 3) - a brandable surface/space at
-- a venue (wall, screen, elevator, pool, rooftop, ...). Measurements, install
-- rules, compliance flags, approval mode, and audience/impression estimates.
-- ---------------------------------------------------------------------------
create table if not exists branding_opportunities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  description text,
  photos jsonb,
  videos jsonb,
  width numeric,
  height numeric,
  depth numeric,
  sqft numeric,
  weight_limit numeric,
  material_type text,
  surface_type text,
  mounting_options jsonb,
  power_available boolean default false,
  internet_available boolean default false,
  rigging_available boolean default false,
  permit_required boolean default false,
  engineering_required boolean default false,
  fire_marshal_required boolean default false,
  insurance_required boolean default false,
  allowed_install_types jsonb,
  prohibited_install_types jsonb,
  time_restrictions jsonb,
  noise_restrictions jsonb,
  removal_requirements jsonb,
  approval_mode text check (approval_mode in ('auto','venue_approval','manual_review')),
  pricing jsonb,
  availability jsonb,
  audience_size int,
  impression_estimate int,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- venue_restrictions (addendum data model 4) - structured allowed/prohibited
-- rules. branding_opportunity_id null means the rule is venue-wide. Structured,
-- never free-text only: rule_type + category + value are the consumable parts,
-- notes is supplementary. Quote automation reads these via
-- server/src/lib/restrictions.ts.
-- ---------------------------------------------------------------------------
create table if not exists venue_restrictions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  branding_opportunity_id uuid references branding_opportunities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  rule_type text check (rule_type in ('allowed','prohibited')),
  category text,                          -- material | method | anchor | ...
  value text,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_venue_twin_venue on venue_twin(venue_id);
create index if not exists idx_venue_twin_org on venue_twin(organization_id);
create index if not exists idx_venue_assets_venue on venue_assets(venue_id);
create index if not exists idx_venue_assets_org on venue_assets(organization_id);
create index if not exists idx_venue_assets_kind on venue_assets(kind);
create index if not exists idx_branding_opps_venue on branding_opportunities(venue_id);
create index if not exists idx_branding_opps_org on branding_opportunities(organization_id);
create index if not exists idx_branding_opps_category on branding_opportunities(category);
create index if not exists idx_venue_restrictions_venue on venue_restrictions(venue_id);
create index if not exists idx_venue_restrictions_opp on venue_restrictions(branding_opportunity_id);
create index if not exists idx_venue_restrictions_org on venue_restrictions(organization_id);
create index if not exists idx_venue_restrictions_type on venue_restrictions(rule_type);
