-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT / CHARITY CORE schema (Phase 1)
-- ----------------------------------------------------------------------------
-- Workstream B of the Phase 1 platform upgrade: the Nonprofit / Charity core.
-- Fundraising Event Builder, tiered Sponsorship Packages, and Ticket / Table
-- packages for nonprofit organizations (organizations.type = 'nonprofit').
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql
-- or any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql against the
-- same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-p1.sql
--
-- Linking + authorization:
--   * organization_id is the authorization boundary (the owning nonprofit org),
--     exactly like venue_twin / branding_opportunities.
--   * fundraising_events.event_id optionally links a fundraising event to an
--     existing `events` row (db/schema.sql), so guest counts and the broader
--     event lifecycle can be reused without duplicating data. It is nullable: a
--     nonprofit can plan a fundraiser before a platform event exists.
--   * sponsorship_packages / ticket_packages hang off a fundraising_event and
--     are scoped to the same org.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); numeric for money; jsonb for flexible/nested fields; text +
-- CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- fundraising_events - a nonprofit's fundraising event (gala, luncheon, golf
-- outing, auction, ...). Overlays an existing `events` row when one exists
-- (event_id), otherwise stands alone. goal_amount drives the dashboard rollup;
-- budget feeds the net (revenue - budget) figure.
-- ---------------------------------------------------------------------------
create table if not exists fundraising_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  cause text,
  kind text check (kind in (
    'gala','fundraiser','luncheon','golf','auction','conference',
    'community','awareness','donor_dinner')),
  goal_amount numeric default 0,
  budget numeric default 0,
  event_date timestamptz,
  guest_target int,
  status text default 'draft',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- sponsorship_packages - a tiered sponsorship offering for a fundraising event.
-- A NEW tiered layer distinct from sponsorship_opportunities (the venue-side
-- marketplace inventory). benefits jsonb captures logo placement, tickets,
-- booth, speaking, social mentions, signage, program inclusion, etc.
-- fulfillment_checklist jsonb is a template list of fulfillment steps the
-- nonprofit owes the sponsor. sold tracks how many of `quantity` are committed.
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_packages (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  tier text check (tier in ('presenting','gold','silver','bronze','in_kind','vendor')),
  name text,
  price numeric default 0,
  benefits jsonb default '{}'::jsonb,
  tickets_included int default 0,
  quantity int default 1,
  sold int default 0,
  fulfillment_checklist jsonb default '[]'::jsonb,
  status text default 'open',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- ticket_packages - ticket / table offerings for a fundraising event
-- (individual seat, VIP seat, full table, sponsor table). seats is the number
-- of attendees a single package admits; quantity is how many of this package
-- are available; sold tracks how many are committed.
-- ---------------------------------------------------------------------------
create table if not exists ticket_packages (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  type text check (type in ('individual','vip','table','sponsor_table')),
  price numeric default 0,
  seats int default 1,
  quantity int default 0,
  sold int default 0,
  status text default 'open',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_fundraising_events_org on fundraising_events(organization_id);
create index if not exists idx_fundraising_events_event on fundraising_events(event_id);
create index if not exists idx_sponsorship_packages_fevent on sponsorship_packages(fundraising_event_id);
create index if not exists idx_sponsorship_packages_org on sponsorship_packages(organization_id);
create index if not exists idx_ticket_packages_fevent on ticket_packages(fundraising_event_id);
create index if not exists idx_ticket_packages_org on ticket_packages(organization_id);
