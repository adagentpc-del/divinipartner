-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 5)
-- ----------------------------------------------------------------------------
-- Venue Revenue Inventory + Sponsorship Inventory Marketplace (Phase 5 of the
-- Venue Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 10-11).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, or any earlier phase file. New tables only,
-- every create guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql and db/schema-venue-intelligence.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p5.sql
--
-- Linking: both tables extend an existing `venues` row and are scoped to the
-- owning `organizations` row, exactly like venue_twin and branding_opportunities.
-- venue_id is the venue link; organization_id is the authorization boundary.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- revenue_inventory (addendum data model 10) - a monetizable surface or space
-- at a venue (screen, wall, elevator, pool, rooftop, keycard, VIP, registration,
-- parking, ...). Pricing, availability, photos, audience/impression estimates,
-- and structured restrictions live here. This is the venue's own inventory of
-- monetizable assets, distinct from branding_opportunities (which feed quote
-- automation) and from sponsorship_opportunities (which package these for
-- sponsors in the marketplace).
-- ---------------------------------------------------------------------------
create table if not exists revenue_inventory (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,                          -- screen | wall | elevator | pool | rooftop | keycard | vip | registration | parking | ...
  pricing jsonb,
  availability jsonb,
  photos jsonb,
  audience_size int,
  impression_estimate int,
  restrictions jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- sponsorship_opportunities (addendum data model 11) - a packaged sponsorship
-- the venue offers to sponsors. Audience/impression reach, pricing, deliverables,
-- availability, photos, and a performance_history of past runs. status drives
-- the marketplace: only `open` rows surface in the public-ish browse list.
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_opportunities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  audience_size int,
  impression_estimate int,
  pricing jsonb,
  deliverables jsonb,
  availability jsonb,
  photos jsonb,
  performance_history jsonb,
  status text default 'open' check (status in ('open','paused','closed','draft')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_revenue_inventory_venue on revenue_inventory(venue_id);
create index if not exists idx_revenue_inventory_org on revenue_inventory(organization_id);
create index if not exists idx_revenue_inventory_category on revenue_inventory(category);
create index if not exists idx_sponsorship_opps_venue on sponsorship_opportunities(venue_id);
create index if not exists idx_sponsorship_opps_org on sponsorship_opportunities(organization_id);
create index if not exists idx_sponsorship_opps_category on sponsorship_opportunities(category);
create index if not exists idx_sponsorship_opps_status on sponsorship_opportunities(status);
