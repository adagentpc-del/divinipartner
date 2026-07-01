-- ============================================================================
-- Divini Partners by Divini Group - AI COO V2 schema additions (Pricing +
-- Marketplace Intelligence)
-- ----------------------------------------------------------------------------
-- Part of the Divini AI COO V2 Executive Intelligence Layer
-- (AI-COO-V2-ROADMAP.md item 4: Pricing Intelligence + Marketplace
-- Intelligence). This layer is deterministic-first: Pricing + Marketplace
-- Intelligence are computed LIVE from the existing marketplace tables (quotes,
-- quote_drafts, bids, events, vendors, venues, sponsorship_opportunities,
-- event_vendors, reviews) on every request. This file adds only an OPTIONAL
-- cache table so an assembled report can be snapshotted; nothing depends on it
-- existing with rows.
--
-- These statements are ADDITIVE. They do not alter any existing table. New
-- table only, guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql (and the other phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-market.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible report payload; text for the scope +
-- period descriptors.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- market_reports - optional cache of an assembled Pricing/Marketplace report.
--   scope   : a free-text descriptor of what the report covers, e.g.
--             'pricing:org:<id>', 'marketplace:ecosystem'. NOT a tenant key the
--             engines read back for authorization - org-scoping is enforced in
--             the query layer (server/src/db/market-intel.ts), this column is a
--             label only.
--   period  : the period the report describes, e.g. '2026-06' or 'rolling-90d'.
--   data    : the full report payload (the same shape the route returns).
-- The engines compute live; writing to this table is optional and a miss simply
-- means "recompute". No foreign keys: a report is a self-contained snapshot.
-- ---------------------------------------------------------------------------
create table if not exists market_reports (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  period text,
  data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_market_reports_scope on market_reports(scope, created_at desc);
