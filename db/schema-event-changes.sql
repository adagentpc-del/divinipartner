-- ---------------------------------------------------------------------------
-- Event Change Architecture / Propagation (Divini Partners 63-section Event
-- Operations spec, Phase A item 5, 2026-08-09).
--
-- Deliberately a NEW table, not an extension of audit_logs (db/schema.sql).
-- audit_logs is a system-wide immutable compliance log used for unrelated
-- actions across the whole app (auth events, admin actions, etc.); the
-- fields this feature needs (reason, affected_scopes, acknowledgment
-- requirement, financial_impact) are specific to event operations and would
-- just be null on every other audit_logs row. event_changes stays a focused
-- table for one domain; nothing here replaces or duplicates audit_logs,
-- which every write path in this app keeps writing to independently.
--
-- event_change_acknowledgments is a child table because a single change can
-- affect several event_members at once, each of whom needs their own
-- acknowledgment record and timestamp -- a single boolean on event_changes
-- could not represent "3 of 5 affected vendors have acknowledged."
-- ---------------------------------------------------------------------------

create table if not exists event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null check (category in (
    'schedule', 'venue', 'attendance', 'budget', 'planning', 'vendor', 'status', 'other')),
  field text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid references users(id) on delete set null,
  reason text,
  -- Event roles (see lib/eventRoles.ts) this change is relevant to, or null
  -- meaning "every active member of the event". Propagation (notifications +
  -- acknowledgment rows) only ever reaches event_members matching this set,
  -- never anyone outside the event's roster.
  affected_scopes text[],
  requires_acknowledgment boolean not null default false,
  financial_impact numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_changes_event on event_changes(event_id, created_at desc);

create table if not exists event_change_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references event_changes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (change_id, user_id)
);
create index if not exists idx_event_change_acks_change on event_change_acknowledgments(change_id);
create index if not exists idx_event_change_acks_user on event_change_acknowledgments(user_id, acknowledged_at);
