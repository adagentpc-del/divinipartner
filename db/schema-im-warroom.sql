-- ============================================================================
-- Intelligence Moat - F3 AI Event War Room
--
-- The war room runs a proactive, per-event health scan. Alerts are computed
-- LIVE every scan from the event's current signals (vendors, insurance,
-- contracts, approvals, payments, documents, permits, timeline, capacity,
-- budget, sponsor deliverables, guest experience). They are NOT stored.
--
-- This table persists only the operator's disposition of an alert code:
-- whether it has been snoozed or resolved (with an optional note). Each scan
-- merges the live alert set with any persisted state for that (event, code).
-- An alert with no row here is treated as 'open'.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create table if not exists event_alert_states (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  alert_code text not null,
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved')),
  note text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz default now(),
  unique (event_id, alert_code)
);

create index if not exists idx_event_alert_states_event on event_alert_states(event_id);
