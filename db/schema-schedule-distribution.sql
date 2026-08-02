-- ============================================================================
-- ===== Automated schedule-of-events distribution (1 week / 24 hours before
--       the event): the final schedule to the venue, vendors, and host, and
--       the shareable agenda link to RSVPs when the host opts in. =====
-- ============================================================================

-- Host opt-in: automatically email guests the /agenda/:eventId link before
-- the event. Off by default; the host turns it on from the guest list.
alter table events add column if not exists notify_guests_schedule boolean not null default false;

-- Idempotency ledger for the scheduler: one row per (event, milestone,
-- audience) ever sent, so a periodic job can re-scan freely without ever
-- double-sending.
create table if not exists event_schedule_sends (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  milestone text not null check (milestone in ('week_before','day_before')),
  audience text not null check (audience in ('ops','guests')),
  recipient_count int not null default 0,
  sent_at timestamptz default now(),
  unique (event_id, milestone, audience)
);
