-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema (Feature 12)
-- ----------------------------------------------------------------------------
-- Divini Score (F12 in INTELLIGENCE-MOAT-ADDENDUM.md). A proprietary, dynamic
-- per-entity trust / performance score. One cached row per entity holds the
-- latest 0-100 score plus a jsonb breakdown of the factors that produced it.
--
-- The score is NOT a new source of truth: it AGGREGATES signals already stored
-- elsewhere (vendor_readiness, vendor_compliance, venue_twin, reviews, events,
-- payments, invoices, sponsorship_metrics, ...). The score function lives in
-- server/src/lib/diviniScore.ts (pure); the gather + upsert logic lives in
-- server/src/db/divini-score.ts. This table is just the cache, recomputed on
-- write (and on demand via the recompute route).
--
-- entity_type is one of: venue | vendor | planner | sponsor | client.
--   - venue   -> a venues row (entity_id = venues.id)
--   - vendor  -> a vendors row (entity_id = vendors.id)
--   - planner -> a users row with role planner (entity_id = users.id)
--   - sponsor -> an organizations row that sponsors (entity_id = organizations.id)
--   - client  -> a users row with role client (entity_id = users.id)
-- entity_id is stored untyped (uuid) because it points at different tables by
-- entity_type; the repo validates existence + authorization per type.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql (and the VI / FE phase schemas) against the same DB:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-divini-score.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible component breakdown; int for the score.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- divini_scores (F12) - the cached Divini Score for one entity:
--   entity_type   text   - venue | vendor | planner | sponsor | client
--   entity_id     uuid   - id in the table implied by entity_type (see above)
--   score         int    - the 0-100 Divini Score
--   components    jsonb  - per-factor breakdown { key, label, weight, earned }[]
--                          plus any raw signals the score read, for transparency
--   updated_at    timestamptz - last recompute time
-- One row per (entity_type, entity_id) so the score is an upsert.
-- ---------------------------------------------------------------------------
create table if not exists divini_scores (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'venue', 'vendor', 'planner', 'sponsor', 'client')),
  entity_id uuid not null,
  score int not null default 0,
  components jsonb,
  updated_at timestamptz default now(),
  unique (entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (composite lookup + score sort for leaderboards/overview)
-- ---------------------------------------------------------------------------
create index if not exists idx_divini_scores_entity
  on divini_scores(entity_type, entity_id);
create index if not exists idx_divini_scores_type_score
  on divini_scores(entity_type, score desc);
