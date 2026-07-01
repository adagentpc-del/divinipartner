-- ============================================================================
-- Divini Partners by Divini Group - PHASE 6 schema additions
-- ----------------------------------------------------------------------------
-- Guest Lists, Floorplans, Seating Charts, auto-built Itinerary, and
-- Timeline / Tasks (blueprint sections 10.3, 14, 15, 33).
--
-- These statements are ADDITIVE. The base `guests` and `tasks` tables already
-- exist in db/schema.sql; Phase 6 extends them with extra columns and adds the
-- new floorplans / seating_charts / itinerary_items tables. Every column add is
-- guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase6.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- GUESTS (blueprint 14) - extra columns the existing `guests` table lacks
-- ---------------------------------------------------------------------------
-- schema.sql ships: name, email, phone, rsvp_status, plus_one, meal_preference,
-- table_assignment, vip, notes, accessibility_needs. Phase 6 adds:
alter table guests add column if not exists party_size int default 1;
alter table guests add column if not exists plus_one_name text;
alter table guests add column if not exists guest_group text;          -- bride|groom|family|colleagues|vip ...
alter table guests add column if not exists invited_by text;
alter table guests add column if not exists seating_table_id uuid;     -- soft ref into seating_charts layout
alter table guests add column if not exists checked_in boolean default false;
alter table guests add column if not exists checked_in_at timestamptz;
alter table guests add column if not exists created_by uuid references users(id) on delete set null;
alter table guests add column if not exists updated_at timestamptz default now();

create index if not exists idx_guests_rsvp on guests(rsvp_status);
create index if not exists idx_guests_vip on guests(vip);

-- ---------------------------------------------------------------------------
-- FLOORPLANS (blueprint 14.4 / 15) - uploaded floorplan references per event
-- ---------------------------------------------------------------------------
create table if not exists floorplans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  venue_id uuid references venues(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  description text,
  file_url text,                          -- uploaded image / pdf reference
  thumbnail_url text,
  width numeric,                          -- canvas units for the seating builder
  height numeric,
  scale text,                             -- e.g. "1px = 1ft"
  is_primary boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_floorplans_event on floorplans(event_id);
create index if not exists idx_floorplans_venue on floorplans(venue_id);

-- ---------------------------------------------------------------------------
-- SEATING CHARTS (blueprint 14.3) - tables/objects + zones placed on a plan
-- ---------------------------------------------------------------------------
-- The whole arrangement is stored as jsonb so the interactive builder owns the
-- layout shape. `layout` holds tables (id, label, x, y, shape, seats, vip),
-- zones (catering/dance/stage/check-in/photo/vendor), and guest assignments
-- (guest_id -> table_id). One chart may be active per event.
create table if not exists seating_charts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  floorplan_id uuid references floorplans(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  status text default 'draft',            -- draft|in_progress|final
  layout jsonb default '{}'::jsonb,        -- { tables:[], zones:[], assignments:{} }
  is_active boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_seating_event on seating_charts(event_id);
create index if not exists idx_seating_floorplan on seating_charts(floorplan_id);

-- ---------------------------------------------------------------------------
-- ITINERARY ITEMS (blueprint 15) - persisted, role-scoped schedule items
-- ---------------------------------------------------------------------------
-- buildItinerary(eventId) assembles a derived itinerary from the event record,
-- quotes, deliveries, load-in/out, payment deadlines and program. Persisted
-- (confirmed / pinned) items live here so they survive a rebuild.
create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  title text,
  description text,
  category text,                          -- load_in|setup|program|service|breakdown|load_out|delivery|payment|milestone
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int,
  location text,
  owner_role text,                        -- client|venue|vendor|installer|planner|all
  owner_label text,
  responsible_org_id uuid references organizations(id) on delete set null,
  source text default 'manual',           -- manual|auto:event|auto:quote|auto:delivery|auto:payment|auto:program
  source_ref uuid,                        -- the originating quote / delivery row, if any
  status text default 'planned',          -- planned|confirmed|in_progress|done|delayed|cancelled
  pinned boolean default false,
  sort_order int default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_itinerary_event on itinerary_items(event_id);
create index if not exists idx_itinerary_role on itinerary_items(owner_role);
create index if not exists idx_itinerary_start on itinerary_items(start_time);

-- ---------------------------------------------------------------------------
-- TASKS (blueprint 33) - extra columns the existing `tasks` table lacks
-- ---------------------------------------------------------------------------
-- schema.sql ships: name, category, assigned_to, due_date, priority, status,
-- related_document_id, notes. Phase 6 adds timeline + workflow fields:
alter table tasks add column if not exists description text;
alter table tasks add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table tasks add column if not exists assigned_role text;          -- client|venue|vendor|installer|planner
alter table tasks add column if not exists start_date timestamptz;
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists depends_on uuid references tasks(id) on delete set null;
alter table tasks add column if not exists milestone boolean default false;
alter table tasks add column if not exists template_key text;           -- which workflow template seeded the task
alter table tasks add column if not exists sort_order int default 0;
alter table tasks add column if not exists created_by uuid references users(id) on delete set null;
alter table tasks add column if not exists updated_at timestamptz default now();

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_category on tasks(category);
create index if not exists idx_tasks_due on tasks(due_date);
