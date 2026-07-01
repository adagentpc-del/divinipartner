-- ============================================================================
-- Friction Elimination - U14 Installation Management + U15 Guest Experience Hub
--
-- Adds a new installation layer (vendor arrival, setup windows, progress,
-- completion photos, removal schedule, venue approval) and a new attendee layer
-- (registration / RSVP / ticketing / QR check-in plus per-event attendee-facing
-- info: schedule, venue map, parking, last-minute updates).
--
-- These are NEW tables. They do NOT touch the existing `guests` table or the
-- event-day check-in flow; they sit alongside them. Backed by
-- server/src/db/installations.ts and server/src/db/guest-hub.ts.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

-- U14 Installation Management ------------------------------------------------
create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  vendor_id uuid,
  arrival_time timestamptz,
  setup_window jsonb,
  status text default 'scheduled',
  progress int default 0,
  completion_photos jsonb,
  removal_schedule jsonb,
  venue_approved boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_installations_event on installations(event_id);
create index if not exists idx_installations_vendor on installations(vendor_id);

-- U15 Guest Experience Hub - attendee registration / RSVP / ticketing --------
create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  attendee_name text,
  email text,
  rsvp_status text default 'pending',
  ticket_type text,
  qr_code text,
  checked_in boolean default false,
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_event_registrations_event on event_registrations(event_id);
create index if not exists idx_event_registrations_email on event_registrations(event_id, email);
create unique index if not exists uq_event_registrations_qr on event_registrations(qr_code);

-- U15 Guest Experience Hub - attendee-facing event info ----------------------
create table if not exists event_info (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  schedule jsonb,
  venue_map_url text,
  parking_info text,
  updates jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_event_info_event on event_info(event_id);
