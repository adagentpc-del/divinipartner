-- ============================================================================
-- Divini Partners by Divini Group - PHASE 7 schema additions
-- ----------------------------------------------------------------------------
-- Reviews + Trust Scores, Starred / Preferred Vendors, AI Next-Best-Action,
-- Recommendation Engine, Risk + Budget Intelligence, and reusable Event
-- Templates + event history memory (blueprint sections 25, 26, 27, 28).
--
-- These statements are ADDITIVE. They extend the `reviews` table already created
-- in db/schema.sql and add new supporting tables. Every column add is guarded
-- with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql and earlier phase files):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase7.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- REVIEWS (blueprint 27) - post-event reviews across relationships
-- ---------------------------------------------------------------------------
-- The base reviews table (db/schema.sql) holds: event_id, reviewer_id,
-- reviewee_id, rating, criteria jsonb, body, status. Phase 7 adds the
-- relationship direction, the target object (vendor/venue/org), org scoping for
-- listing, the review request lifecycle, and a public/visibility flag.
alter table reviews add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table reviews add column if not exists reviewer_org_id uuid references organizations(id) on delete set null;
alter table reviews add column if not exists reviewee_org_id uuid references organizations(id) on delete set null;
-- relationship: client_to_vendor | planner_to_vendor | venue_to_vendor |
--   vendor_to_client | client_to_venue | venue_to_client | client_to_planner |
--   vendor_to_venue | planner_to_venue
alter table reviews add column if not exists relationship text;
-- target_type: vendor | venue | client | planner | org
alter table reviews add column if not exists target_type text;
alter table reviews add column if not exists target_id uuid;
alter table reviews add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table reviews add column if not exists venue_id uuid references venues(id) on delete set null;
-- status values used by Phase 7: requested | draft | submitted | published | hidden
alter table reviews add column if not exists is_public boolean default true;
alter table reviews add column if not exists requested_at timestamptz;
alter table reviews add column if not exists submitted_at timestamptz;
alter table reviews add column if not exists updated_at timestamptz default now();

create index if not exists idx_reviews_org on reviews(organization_id);
create index if not exists idx_reviews_target on reviews(target_type, target_id);
create index if not exists idx_reviews_relationship on reviews(relationship);
create index if not exists idx_reviews_status on reviews(status);

-- ---------------------------------------------------------------------------
-- STARRED / PREFERRED VENDORS (blueprint 27.4)
-- ---------------------------------------------------------------------------
-- An org marks another org (typically a vendor) as starred / preferred. Used by
-- the recommendation engine to boost matches and by repeat-relationship prompts.
create table if not exists starred_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,   -- the org doing the starring
  vendor_org_id uuid references organizations(id) on delete cascade,     -- the starred org
  vendor_id uuid references vendors(id) on delete set null,
  label text,                          -- optional list / category label
  note text,
  starred_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists idx_starred_unique on starred_vendors(organization_id, vendor_org_id);
create index if not exists idx_starred_org on starred_vendors(organization_id);
create index if not exists idx_starred_vendor_org on starred_vendors(vendor_org_id);

-- ---------------------------------------------------------------------------
-- EVENT TEMPLATES (blueprint 28) - reusable event blueprints
-- ---------------------------------------------------------------------------
-- A saved, reusable scope: needed categories, a checklist, a budget skeleton,
-- and default guest count / event type. Org-owned. `is_global` lets Divini ship
-- starter templates visible to everyone.
create table if not exists event_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  event_type text,
  description text,
  default_guest_count int,
  categories text[],                   -- vendor categories the event needs
  checklist jsonb,                     -- [{ label, category, done }]
  budget_skeleton jsonb,               -- [{ category, amount, pct }]
  default_budget numeric,
  source_event_id uuid references events(id) on delete set null,  -- when cloned from history
  is_global boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_event_templates_org on event_templates(organization_id);
create index if not exists idx_event_templates_type on event_templates(event_type);
create index if not exists idx_event_templates_global on event_templates(is_global);

-- ---------------------------------------------------------------------------
-- EVENT HISTORY MEMORY (blueprint 28) - completed-event summaries
-- ---------------------------------------------------------------------------
-- A compact, durable summary written when an event completes (or on demand).
-- Powers "duplicate this event", repeat-relationship detection, and the
-- recommendation engine. One row per (event) snapshot.
create table if not exists event_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  event_type text,
  venue_id uuid references venues(id) on delete set null,
  venue_org_id uuid references organizations(id) on delete set null,
  guest_count int,
  total_spend numeric,
  budget numeric,
  categories text[],                   -- categories that were fulfilled
  vendor_org_ids uuid[],               -- orgs that worked the event
  summary jsonb,                       -- structured recap (scope, line totals, notes)
  outcome text,                        -- completed | closed | cancelled
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_event_history_org on event_history(organization_id);
create index if not exists idx_event_history_event on event_history(event_id);
create index if not exists idx_event_history_type on event_history(event_type);

-- ---------------------------------------------------------------------------
-- NEXT-BEST-ACTION DISMISSALS (blueprint 25) - optional per-user state
-- ---------------------------------------------------------------------------
-- Next-best-action prompts are computed deterministically from org state; this
-- table only records which ones a user has dismissed so they stop reappearing.
create table if not exists nba_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  action_key text,                     -- stable key from nextbestaction.ts
  dismissed_at timestamptz default now()
);

create unique index if not exists idx_nba_dismissal_unique on nba_dismissals(user_id, action_key);
create index if not exists idx_nba_dismissal_user on nba_dismissals(user_id);
