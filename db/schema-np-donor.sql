-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT DONOR + DONATIONS + FOLLOW-UP
-- schema (Phase 2). Donor + donation tracking, post-event follow-up workflows,
-- and the automated recap report layer for nonprofit fundraising.
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-np-p1.sql, db/schema-np-auction.sql, or any other phase file. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-np-p1.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-donor.sql
--
-- Linking + authorization:
--   * organization_id is the authorization boundary (the owning nonprofit org),
--     exactly like fundraising_events / sponsorship_packages.
--   * donations optionally link to a fundraising_event (fundraising_event_id)
--     and to a donor (donor_id). Both nullable so a one-off gift with no donor
--     record and no event still records cleanly.
--   * followup_tasks optionally link to a fundraising_event - they are the
--     post-event follow-up checklist a nonprofit works after a fundraiser.
--
-- Conventions match schema.sql / schema-np-p1.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); numeric for money; text + CHECK
-- for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- donors - a constituent / supporter record for a nonprofit org. total_given
-- and last_gift_at are denormalized rollups maintained when a donation is
-- recorded, so the donor list shows lifetime giving without re-aggregating.
-- ---------------------------------------------------------------------------
create table if not exists donors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  email text,
  phone text,
  total_given numeric default 0,
  last_gift_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- donations - a single gift recorded for a nonprofit org. Optionally tied to a
-- fundraising_event (for per-event totals) and a donor (for lifetime rollups).
-- amount is the gift value; method is free text (cash, check, card, in_kind,
-- pledge, ...). status moves recorded -> received once funds clear, or refunded.
-- ---------------------------------------------------------------------------
create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  donor_id uuid references donors(id) on delete set null,
  amount numeric default 0,
  method text,
  status text default 'recorded' check (status in ('recorded','received','refunded')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- followup_tasks - a post-event follow-up workflow item for a fundraising
-- event. Generated as a checklist (thank-you, donor receipts, sponsor recap,
-- monthly giving invite, next-event invite, volunteer thanks, board report,
-- fundraising summary) and advanced manually (no background job). target is a
-- free-text recipient/segment label; status tracks completion.
-- ---------------------------------------------------------------------------
create table if not exists followup_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  kind text check (kind in (
    'thank_you','donor_receipt','sponsor_recap','monthly_giving_invite',
    'next_event_invite','volunteer_thanks','board_report','fundraising_summary')),
  target text,
  status text default 'pending' check (status in ('pending','sent','done','skipped')),
  due_date timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_donors_org on donors(organization_id);
create index if not exists idx_donations_org on donations(organization_id);
create index if not exists idx_donations_fevent on donations(fundraising_event_id);
create index if not exists idx_donations_donor on donations(donor_id);
create index if not exists idx_followup_tasks_org on followup_tasks(organization_id);
create index if not exists idx_followup_tasks_fevent on followup_tasks(fundraising_event_id);
