-- ---------------------------------------------------------------------------
-- Execution Packet acknowledgment method + reminder tracking (Final Event
-- Schedule / Event Execution Packet completion phase, Parts 10-11,
-- 2026-08-09).
-- ---------------------------------------------------------------------------

alter table event_execution_packet_acknowledgments add column if not exists method text
  not null default 'app' check (method in ('app', 'email_link'));

alter table event_packet_distribution_settings add column if not exists reminder_offsets int[]
  not null default array[4320, 1440]; -- 72h, 24h before the event, by default

-- Idempotent reminder claim: one reminder per (packet, recipient, offset),
-- same insert-on-conflict claim pattern as event_packet_deliveries.
create table if not exists event_packet_reminders (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references event_execution_packets(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  offset_minutes int not null,
  sent_at timestamptz not null default now(),
  unique (packet_id, recipient_user_id, offset_minutes)
);
create index if not exists idx_event_packet_reminders_event on event_packet_reminders(event_id);
