-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT VOLUNTEER MANAGEMENT (Phase 2)
-- ----------------------------------------------------------------------------
-- Volunteer roster + per-volunteer task lists for a nonprofit org's fundraising
-- events. A volunteer optionally links to a fundraising_events row (the event
-- they are helping run) and is always scoped to the owning nonprofit org via
-- organization_id (the authorization boundary).
--
-- These statements are ADDITIVE. They do not alter any existing table. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-np-p1.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-volunteer.sql
--
-- Conventions match schema.sql / schema-np-p1.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- volunteers - a person who registered to help run a fundraising event. The
-- link to fundraising_events is optional (a nonprofit can build a general
-- volunteer roster before an event exists); organization_id is the owning
-- nonprofit org and the authorization boundary. status walks the lifecycle:
-- registered -> assigned (role + shift set) -> checked_in (on event day), with
-- no_show / cancelled as terminal states.
-- ---------------------------------------------------------------------------
create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  emergency_contact text,
  role text,
  shift text,
  status text default 'registered' check (status in (
    'registered','assigned','checked_in','no_show','cancelled')),
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- volunteer_tasks - a simple per-volunteer checklist (setup, greeting, teardown,
-- ...). status is open -> done. Scoped through the parent volunteer (whose
-- organization_id is the authorization boundary).
-- ---------------------------------------------------------------------------
create table if not exists volunteer_tasks (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid references volunteers(id) on delete cascade,
  label text,
  status text default 'open' check (status in ('open','done')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_volunteers_org on volunteers(organization_id);
create index if not exists idx_volunteers_fevent on volunteers(fundraising_event_id);
create index if not exists idx_volunteer_tasks_volunteer on volunteer_tasks(volunteer_id);
