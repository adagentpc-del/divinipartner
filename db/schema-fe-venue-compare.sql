-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- UPGRADE 3: Venue Comparison Engine (FRICTION-ELIMINATION-ADDENDUM.md U3).
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE. They do not alter any existing table (in
-- particular they do NOT touch venues or venue_twin). New table only, guarded
-- with `if not exists` so re-running is safe. Apply AFTER db/schema.sql and the
-- Venue Intelligence schema (db/schema-venue-intelligence.sql) against the same
-- database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-venue-compare.sql
--
-- Why a new table (not venue_twin columns): the comparison engine needs a small,
-- focused set of cost/inclusion attributes that map cleanly to side-by-side
-- columns and to the Estimated Total Cost heuristic. Keeping them in their own
-- table keeps venue_twin untouched (per the build rules) and lets the venue
-- maintain compare attrs independently of its full digital twin.
--
-- Linking + authorization mirror venue_twin: one row per venue (venue_id unique),
-- and access is scoped through venues.organization_id by the repo
-- (server/src/db/venue-compare.ts), exactly like server/src/db/venue-twin.ts.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money; boolean
-- for simple inclusion flags.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- venue_compare_attrs - one row per venue. The cost/inclusion attributes the
-- Venue Comparison Engine reads to build a side-by-side row and to estimate a
-- total cost (rental + F&B minimum + rough vendor/AV allowances). Everything is
-- nullable: a venue can fill these in incrementally and the engine degrades
-- gracefully when a value is missing.
-- ---------------------------------------------------------------------------
create table if not exists venue_compare_attrs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  rental_cost numeric,              -- base facility/rental fee
  av_included boolean,              -- audio/visual package included in rental
  tables_included boolean,          -- tables included in rental
  furniture_included boolean,       -- chairs/lounge/furniture included in rental
  fnb_minimum numeric,              -- food and beverage minimum spend
  security_required boolean,        -- venue requires (paid) security
  insurance_required boolean,       -- venue requires event insurance / COI
  setup_window jsonb,               -- { hours, day_before, notes, ... }
  teardown_window jsonb,            -- { hours, same_day, notes, ... }
  extras jsonb,                     -- arbitrary extra line items / notes
  updated_at timestamptz default now(),
  unique (venue_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign key + lookup)
-- ---------------------------------------------------------------------------
create index if not exists idx_venue_compare_attrs_venue on venue_compare_attrs(venue_id);
