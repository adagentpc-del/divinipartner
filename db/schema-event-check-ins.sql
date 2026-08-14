-- Event check-in/check-out (live-ops phase, Part 7-8, 2026-08-09).
--
-- One durable record per arrival/departure cycle. role and organization_id
-- are resolved server-side from the target user's real event_members row at
-- check-in time (never client-supplied), so this table can never be used to
-- spoof a role or vendor affiliation. The partial unique index prevents two
-- simultaneous "open" (not yet checked out) check-ins for the same
-- event/user -- a real concurrency bug this phase's adversarial pass
-- (Part 42) explicitly calls out; a second check-in attempt while one is
-- already open is treated as idempotent, not a duplicate row.
create table if not exists event_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id),
  organization_id uuid references organizations(id),
  role text not null,
  assigned_location text,
  source_device text,
  notes text,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references users(id),
  checked_out_at timestamptz,
  checked_out_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_check_ins_event on event_check_ins(event_id);
create index if not exists idx_check_ins_event_user on event_check_ins(event_id, user_id);

create unique index if not exists idx_check_ins_one_open
  on event_check_ins(event_id, user_id)
  where checked_out_at is null;
