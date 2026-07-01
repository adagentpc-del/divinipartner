-- ============================================================================
-- Divini Partners by Divini Group - DIVINI AI COO V2 schema
-- ----------------------------------------------------------------------------
-- Business Health Score (AI-COO-V2-ROADMAP.md, section 3). An ORG-LEVEL
-- executive health score 0-100 for the whole organization, DISTINCT from the
-- per-entity Divini Score (db/schema-im-divini-score.sql + lib/diviniScore.ts).
-- The Divini Score rates one venue/vendor/planner/sponsor/client; this score
-- answers "how healthy is the business this org runs" across revenue, activity,
-- pipeline, contracts, referrals, bookings, retention, response speed, and
-- compliance.
--
-- Like the Divini Score this is NOT a new source of truth: it AGGREGATES
-- signals already stored elsewhere (events, quotes, invoices, payments,
-- platform_invites, contract_pricing, vendor_readiness, vendor_compliance,
-- reviews). The pure score function lives in server/src/lib/businessHealth.ts;
-- the gather + upsert logic lives in server/src/db/business-health.ts. This
-- table is just the cache, recomputed on write (and on demand via /recompute).
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql (and the VI / FE / IM phase schemas) against the
-- same DB:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-health.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible component + recommendation payloads;
-- int for the score.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- business_health_scores - the cached org-level executive health score:
--   org_id          uuid  - the organization the score is for (unique = upsert)
--   score           int   - the 0-100 Business Health Score
--   components       jsonb - per-dimension breakdown
--                            { key, label, weight, earned, value, detail }[]
--   recommendations jsonb - prioritized recommendation list
--                            { key, priority, title, detail }[]
--   updated_at       timestamptz - last recompute time
-- One row per org so the score is an upsert (org_id unique).
-- ---------------------------------------------------------------------------
create table if not exists business_health_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  score int not null default 0,
  components jsonb,
  recommendations jsonb,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX (org lookup; the unique constraint already indexes org_id, this adds
-- an explicit named index to match the conventions of the other phases).
-- ---------------------------------------------------------------------------
create index if not exists idx_business_health_scores_org
  on business_health_scores(org_id);
