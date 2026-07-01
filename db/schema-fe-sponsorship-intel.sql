-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema (Upgrade 16)
-- ----------------------------------------------------------------------------
-- Sponsorship Intelligence (U16 in FRICTION-ELIMINATION-ADDENDUM.md). This
-- EXTENDS the Phase 5 Sponsorship Inventory Marketplace (db/schema-vi-p5.sql)
-- without altering it: it adds a single metrics table that hangs off an existing
-- sponsorship_opportunities row and carries the intelligence signals U16 calls
-- for (impressions, audience demographics, historical performance, revenue, and
-- asset availability). recommendSponsorships + matchBrandsToVenues read these
-- metrics alongside sponsorship_opportunities to rank packages for an event.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-vi-p5.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-sponsorship-intel.sql
--
-- Linking + authorization: sponsorship_metrics belongs to a
-- sponsorship_opportunities row (sponsorship_opportunity_id). The authorization
-- boundary is that opportunity's owning venue / organization, resolved in
-- server/src/db/sponsorship-intel.ts (mirrors the revenue-inventory repo's IDOR
-- gate). One row per opportunity (unique) so metrics are an upsert.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sponsorship_metrics (U16) - the intelligence signals for one packaged
-- sponsorship opportunity:
--   impressions            int     - measured / projected total impressions
--   demographics           jsonb   - audience demographic breakdown
--   historical_performance jsonb   - prior runs: sell-through, renewal, results
--   revenue                numeric - revenue this package has produced / is worth
--   asset_availability     jsonb   - which assets are open vs reserved
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_metrics (
  id uuid primary key default gen_random_uuid(),
  sponsorship_opportunity_id uuid unique references sponsorship_opportunities(id) on delete cascade,
  impressions int,
  demographics jsonb,
  historical_performance jsonb,
  revenue numeric,
  asset_availability jsonb,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX (foreign key lookup)
-- ---------------------------------------------------------------------------
create index if not exists idx_sponsorship_metrics_opp on sponsorship_metrics(sponsorship_opportunity_id);
