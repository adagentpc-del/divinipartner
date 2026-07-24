-- ============================================================================
-- Divini Partners - Tour Series (touring events). Additive, guarded.
-- A tour is a series of stops; each stop IS a full event, so every stop inherits
-- all event capabilities (landing, floorplans, schedule, tickets, bids, booths).
-- Zero em dashes.
-- ============================================================================

create table if not exists tour_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_tour_series_org on tour_series(organization_id);

-- A stop is a full event tied to a tour.
alter table events add column if not exists tour_id uuid;
alter table events add column if not exists tour_stop_order integer default 0;
alter table events add column if not exists stop_city text;
create index if not exists idx_events_tour on events(tour_id);
