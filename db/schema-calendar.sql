-- ============================================================================
-- ===== Org availability calendar (bookings, holds, installs, deliveries,
--       meetings) + a private, per-org .ics subscribe feed for Apple/Google
--       Calendar. One-way (webcal subscribe), not two-way OAuth sync. =====
-- ============================================================================

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  kind text not null default 'other'
    check (kind in ('booking','hold','block','install','delivery','meeting','other')),
  status text not null default 'confirmed'
    check (status in ('confirmed','tentative','cancelled')),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint calendar_events_time_check check (ends_at >= starts_at)
);
create index if not exists idx_calendar_events_org_time on calendar_events (organization_id, starts_at, ends_at);
create index if not exists idx_calendar_events_event on calendar_events (event_id) where event_id is not null;

-- Per-org secret token for the private .ics subscribe feed (webcal://). Anyone
-- with the token can read that org's calendar as .ics; rotate to revoke.
create table if not exists calendar_feed_tokens (
  organization_id uuid primary key references organizations(id) on delete cascade,
  token text not null unique,
  created_at timestamptz default now(),
  rotated_at timestamptz default now()
);
