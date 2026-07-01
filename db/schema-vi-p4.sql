-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 4)
-- ----------------------------------------------------------------------------
-- Vendor Readiness Score + Preferred Vendor System (Phase 4 of the Venue
-- Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 8-9). The readiness score feeds marketplace ranking via
-- server/src/lib/vendorReadiness.ts (marketplaceRankingScore); preferred_vendors
-- lets a venue curate the vendors it trusts and preload pricing for them.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, db/schema-vi-p2.sql, or any earlier phase
-- file. New tables only, every create guarded with `if not exists` so re-running
-- is safe. Apply AFTER db/schema.sql (and the earlier phase files) against the
-- same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p4.sql
--
-- Linking:
--   - vendor_readiness hangs off an existing `vendors` row (vendor_id). The
--     authorization boundary is the vendor's owning organization
--     (vendors.organization_id), resolved in server/src/db/vendor-readiness.ts.
--   - preferred_vendors links a `venues` row (venue_id) to a `vendors` row
--     (vendor_id). The authorization boundary is the venue's owning organization
--     (venues.organization_id): only a venue's own org may curate its preferred
--     list, IDOR-checked in the repo before any write.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible structures; numeric for scoring signals.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- vendor_readiness (addendum data model 8) - one row per vendor holding the
-- raw scoring signals plus the computed Vendor Readiness Score (0-100). The
-- score is recomputed and stored by server/src/db/vendor-readiness.ts on every
-- write (computeVendorReadiness in server/src/lib/vendorReadiness.ts is the pure
-- single source of truth for the weighting). Signals:
--   response_speed       0-1  (1 = responds fastest; normalized upstream)
--   quote_speed          0-1  (1 = quotes fastest; normalized upstream)
--   approval_rate        0-1  (share of submitted quotes that get approved)
--   win_rate             0-1  (share of delivered quotes that win the job)
--   profile_completeness 0-1  (how complete the vendor's profile is)
--   reviews_score        0-5  (average review rating)
--   completion_history   0-1  (share of awarded jobs completed cleanly)
--   insurance_uploaded / w9_uploaded  boolean compliance flags
-- ---------------------------------------------------------------------------
create table if not exists vendor_readiness (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid unique references vendors(id) on delete cascade,
  response_speed numeric,
  quote_speed numeric,
  approval_rate numeric,
  win_rate numeric,
  profile_completeness numeric,
  insurance_uploaded boolean default false,
  w9_uploaded boolean default false,
  reviews_score numeric,
  completion_history numeric,
  score int,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- preferred_vendors (addendum data model 9) - a venue-curated list of vendors
-- it trusts, with a tier and optional preloaded pricing. One row per
-- (venue, vendor) pair (unique). Marketplace ranking (marketplaceRankingScore)
-- boosts vendors a venue has marked preferred/exclusive/recommended/approved.
--   tier              preferred | approved | exclusive | recommended
--   preloaded_pricing jsonb - pricing this venue has pre-agreed with the vendor
-- ---------------------------------------------------------------------------
create table if not exists preferred_vendors (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  tier text check (tier in ('preferred', 'approved', 'exclusive', 'recommended')),
  preloaded_pricing jsonb,
  created_at timestamptz default now(),
  unique (venue_id, vendor_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_vendor_readiness_vendor on vendor_readiness(vendor_id);
create index if not exists idx_vendor_readiness_score on vendor_readiness(score);
create index if not exists idx_preferred_vendors_venue on preferred_vendors(venue_id);
create index if not exists idx_preferred_vendors_vendor on preferred_vendors(vendor_id);
create index if not exists idx_preferred_vendors_tier on preferred_vendors(tier);
