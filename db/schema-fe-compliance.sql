-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- ----------------------------------------------------------------------------
-- U9 Vendor Compliance Score + U11 Transparent Preferred Vendor (the "always
-- show WHY" reasons). FRICTION-ELIMINATION-ADDENDUM.md upgrades 9 and 11.
--
-- This EXTENDS the Phase-4 vendor_readiness area (db/schema-vi-p4.sql) without
-- altering it: vendor_compliance is a NEW table holding the richer compliance
-- signals (insurance / COI / W9 status, licenses, reviews, on-time rate,
-- completion history, per-venue ratings) plus a computed Vendor Compliance
-- Score (0-100). The score is recomputed and stored by
-- server/src/db/vendor-compliance.ts on every write (computeVendorCompliance in
-- server/src/lib/vendorCompliance.ts is the pure single source of truth for the
-- weighting). buildPreferredWhy (same lib) turns these stats into the human
-- reasons surfaced on preferred-vendor lists ("83 completed projects",
-- "4.9 average rating", "98% on-time").
--
-- These statements are ADDITIVE. They do not alter any earlier table. New table
-- only, every create guarded with `if not exists` so re-running is safe. Apply
-- AFTER db/schema.sql and db/schema-vi-p4.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-compliance.sql
--
-- Linking + authorization:
--   - vendor_compliance hangs off an existing `vendors` row (vendor_id, unique).
--     The authorization boundary is the vendor's owning organization
--     (vendors.organization_id), resolved in server/src/db/vendor-compliance.ts
--     with the same IDOR assert pattern as the venue twin / vendor readiness.
--
-- Conventions match schema.sql / schema-vi-p4.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); jsonb for flexible structures;
-- numeric/int for scoring signals.
--
-- Signals:
--   insurance_status   text  - 'verified' | 'pending' | 'expired' | 'missing'
--   coi_status         text  - 'verified' | 'pending' | 'expired' | 'missing'
--   w9_status          text  - 'verified' | 'pending' | 'missing'
--   licenses           jsonb - [{ type, number, status, expires_at }, ...]
--   reviews_score      numeric 0-5  (average review rating)
--   on_time_rate       numeric 0-1  (share of jobs delivered on time)
--   completion_history int    count of completed projects (also a quality input)
--   venue_ratings      jsonb - [{ venue_id, rating }, ...] per-venue ratings
--   score              int   0-100 computed Vendor Compliance Score
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists vendor_compliance (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid unique references vendors(id) on delete cascade,
  insurance_status text,
  coi_status text,
  w9_status text,
  licenses jsonb,
  reviews_score numeric,
  on_time_rate numeric,
  completion_history int,
  venue_ratings jsonb,
  score int,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign key + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_vendor_compliance_vendor on vendor_compliance(vendor_id);
create index if not exists idx_vendor_compliance_score on vendor_compliance(score);
