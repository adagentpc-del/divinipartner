-- ============================================================================
-- Divini Partners - Divini AI COO V2: Revenue Intelligence + Forecasting.
-- ADDITIVE ONLY. Apply AFTER db/schema.sql (and the phase + im + fe files).
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-revenue.sql
--
-- This file adds ONE optional cache table. The Revenue Intelligence Engine and
-- the Forecasting Engine compute live over the existing events / quotes /
-- invoices / payments tables on every request; this table only exists so a
-- materialized monthly rollup can be cached if the live aggregation ever needs
-- to be amortized. Nothing in V2 requires reading from it. All guarded with
-- IF NOT EXISTS so re-runs are safe.
-- ============================================================================

-- ---------- revenue_snapshots (NEW, optional cache) ----------
-- A point-in-time snapshot of the computed metrics for an org + period. period
-- is a free text key (e.g. a month '2026-06', or 'trends'/'forecast' for the
-- whole engine output). metrics holds the engine output verbatim as jsonb.
create table if not exists revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  period text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Lookup by org + period (most-recent-first reads).
create index if not exists idx_revenue_snapshots_org_period
  on revenue_snapshots(org_id, period, created_at desc);
