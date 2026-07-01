-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema additions
-- ----------------------------------------------------------------------------
-- Feature 4 (Revenue Leakage Detection) + Feature 13 (Opportunity Engine - daily
-- feed) of the Intelligence Moat addendum (INTELLIGENCE-MOAT-ADDENDUM.md F4, F13).
--
-- These statements are ADDITIVE. They do not alter any existing table. New tables
-- only, every create guarded with `if not exists` so re-running is safe. Apply
-- AFTER db/schema.sql and the venue-intelligence + friction-elimination phases
-- against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-opportunity.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- opportunities (F13 Opportunity Engine) - one actionable opportunity in a
-- role-scoped daily feed. The engine (server/src/lib/opportunityEngine.ts)
-- generates these deterministically from the recommendation engine, revenue
-- leakage scans, and simple relationship/inventory matches.
--
-- Audience scoping: a row is shown to whichever audience it targets. We support
-- three (optional) levels so the same table backs both broad role feeds and
-- precise org/user feeds:
--   audience_role     text  - the role the opportunity is relevant to
--                             (venue | vendor | planner | sponsor | client)
--   audience_org_id   uuid  - when set, only this organization should see it
--   audience_user_id  uuid  - when set, only this user should see it
-- The repo (server/src/db/opportunity.ts) filters on these so a forged feed
-- query from another tenant returns nothing (IDOR-safe).
--
--   kind            text    - the opportunity category (unused_inventory |
--                             revenue_leak | open_project | preferred_request |
--                             audience_match | cost_saving | enhancement | match)
--   title           text    - short, human-readable headline
--   detail          jsonb   - structured payload (ids, amounts, reasons, links)
--   potential_value numeric - estimated dollar upside (0 when not monetary)
--   status          text    - open | dismissed | actioned
--   source          text    - which generator produced it (recommend | leakage |
--                             match | inventory | ...), for analytics + dedupe
-- ---------------------------------------------------------------------------
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  audience_role text,
  audience_org_id uuid references organizations(id) on delete cascade,
  audience_user_id uuid references users(id) on delete cascade,
  kind text,
  title text,
  detail jsonb,
  potential_value numeric,
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  source text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- revenue_scans (F4 Revenue Leakage Detection) - the result of one leakage scan
-- over a venue or an event. potential is the full monetizable ceiling, captured
-- is what is already booked/sold, missed is the gap. suggestions is the ranked
-- list of specific capture ideas (extra sponsor inventory, VIP packages, brand
-- activations, upsells) the scan surfaced. One row per scan run (history kept).
--
--   scope        text  - venue | event
--   scope_id     uuid  - the venue id or event id the scan was run against
--   potential    numeric - total monetizable ceiling
--   captured     numeric - already booked / sold
--   missed       numeric - potential - captured (the leakage)
--   suggestions  jsonb   - ranked capture suggestions [{key,label,value,...}]
-- ---------------------------------------------------------------------------
create table if not exists revenue_scans (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('venue','event')),
  scope_id uuid,
  potential numeric,
  captured numeric,
  missed numeric,
  suggestions jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (audience filters + common lookups)
-- ---------------------------------------------------------------------------
create index if not exists idx_opportunities_role on opportunities(audience_role);
create index if not exists idx_opportunities_org on opportunities(audience_org_id);
create index if not exists idx_opportunities_user on opportunities(audience_user_id);
create index if not exists idx_opportunities_status on opportunities(status);
create index if not exists idx_opportunities_kind on opportunities(kind);
create index if not exists idx_opportunities_created on opportunities(created_at);

create index if not exists idx_revenue_scans_scope on revenue_scans(scope, scope_id);
create index if not exists idx_revenue_scans_created on revenue_scans(created_at);
