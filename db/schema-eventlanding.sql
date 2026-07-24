-- ============================================================================
-- Divini Partners - Universal Event Landing (every event). Additive, guarded.
-- A public landing page for ANY event: coordinator chooses free or ticketed
-- (with tiers), plus a "Become a vendor" path. Ticketing reuses the platform
-- fee. Zero em dashes.
-- ============================================================================

-- Per-event landing config.
create table if not exists event_landing_settings (
  event_id uuid primary key,
  attend_mode text not null default 'free'
    check (attend_mode in ('off','free','ticketed')),
  vendor_cta_enabled boolean not null default true,
  headline text,
  description text,
  updated_at timestamptz default now()
);

-- General (non-fundraising) ticket tiers for any event.
create table if not exists event_ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  name text not null,
  price_cents integer not null default 0,
  quantity integer,                 -- null = unlimited
  sold integer not null default 0,
  is_active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_event_ticket_tiers_event on event_ticket_tiers(event_id);

-- Attendee ticketing fields on the existing registrations table.
alter table event_registrations add column if not exists tier_id uuid;
alter table event_registrations add column if not exists quantity integer default 1;
alter table event_registrations add column if not exists amount_cents integer default 0;
alter table event_registrations add column if not exists platform_fee_cents integer default 0;
alter table event_registrations add column if not exists order_status text default 'confirmed';
alter table event_registrations add column if not exists payment_ref text;
