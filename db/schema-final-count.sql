-- ---------------------------------------------------------------------------
-- Final Count Workflow, P0 (Divini Partners 63-section Event Operations
-- spec, Phase A item 6, 2026-08-09).
--
-- event_final_counts is append-only and versioned: "Set Final Count" always
-- inserts a new row (unique on event_id+version, version is 1, 2, 3, ...)
-- rather than updating a column in place, so a revision can never silently
-- overwrite what vendors were already told and every prior value + its
-- delta stays inspectable. final_count_due_at lives on `events` itself
-- (additive, alongside the Phase A item 4 authoritative-record columns)
-- since it is a property of the requirement ("when is this due"), not of
-- any one submitted version.
-- ---------------------------------------------------------------------------

alter table events add column if not exists final_count_due_at timestamptz;

create table if not exists event_final_counts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  version int not null,
  count int not null,
  -- Signed difference from the previous version's count, or null for version 1.
  delta int,
  -- count - the authoritative attendance figure on record at set-time
  -- (attendance_confirmed, falling back to attendance_estimated), or null
  -- when neither exists yet to compare against.
  discrepancy int,
  notes text,
  set_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, version)
);
create index if not exists idx_event_final_counts_event on event_final_counts(event_id, version desc);
