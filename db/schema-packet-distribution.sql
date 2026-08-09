-- ---------------------------------------------------------------------------
-- Execution Packet distribution settings + idempotent delivery tracking
-- (Final Event Schedule / Event Execution Packet completion phase, Parts
-- 7-9, 2026-08-09).
--
-- A DIFFERENT job from the existing event_schedule_sends /
-- lib/scheduleDistribution.ts (itinerary-summary emails at two fixed
-- milestones, week_before/day_before). That system stays exactly as-is and
-- keeps running independently. This is Execution Packet distribution:
-- configurable offset presets, timezone-aware send time, role-scoped
-- recipients, and delivery tracking per packet VERSION -- a materially
-- different deliverable, not a duplicate. Both jobs run on the SAME
-- scheduler loop (lib/scheduler.ts, WORKER_INTERVAL_MINUTES) -- no second
-- scheduler is introduced.
-- ---------------------------------------------------------------------------

create table if not exists event_packet_distribution_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id) on delete cascade,
  enabled boolean not null default false,
  offset_preset text not null default '7d' check (offset_preset in (
    '14d', '10d', '7d', '5d', '72h', '48h', '24h', 'custom')),
  offset_minutes int not null default (7 * 24 * 60),
  send_time text not null default '09:00',
  -- Event roles (lib/eventRoles.ts) to distribute to. Sponsor is excluded by
  -- default (opt-in), matching the spec's example UI default checkbox state.
  recipient_roles text[] not null default array['event_owner','planner','venue','vendor_owner','vendor_staff','event_staff'],
  last_run_at timestamptz,
  -- Set only when a packet was actually generated and sent for the CURRENT
  -- distribution cycle. Distinct from last_run_at (which also updates on a
  -- merely-blocked evaluation): once set, the job skips re-generating and
  -- re-sending on every later tick while the event is still "due" -- a
  -- scheduled distribution is a one-time send per cycle, not a repeating
  -- one. Cleared when the event's date_time changes (a new cycle) or by an
  -- explicit resend action.
  distributed_at timestamptz,
  -- Pre-send readiness gate (Part 9): once a distribution run is blocked by
  -- unresolved readiness issues, it stays blocked until the owner either
  -- fixes them or explicitly records an override.
  blocked_at timestamptz,
  blocked_reason jsonb,
  override_at timestamptz,
  override_by uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_packet_deliveries (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references event_execution_packets(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  recipient_role text,
  delivery_channel text not null default 'email',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  failed_at timestamptz,
  retry_count int not null default 0,
  -- A short category, never a raw provider response/secret (e.g.
  -- "invalid_recipient", "provider_error", "suppressed").
  error_classification text,
  created_at timestamptz not null default now(),
  -- The idempotency key: one delivery attempt row per (packet version,
  -- recipient). A scheduler retry or a concurrent run claims via
  -- insert-on-conflict-do-nothing, same pattern as event_schedule_sends
  -- (lib/scheduleDistribution.ts) -- only the claim winner actually sends.
  unique (packet_id, recipient_user_id)
);
create index if not exists idx_event_packet_deliveries_event on event_packet_deliveries(event_id);
create index if not exists idx_event_packet_deliveries_packet on event_packet_deliveries(packet_id, status);
