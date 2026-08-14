-- Incident Management (live-ops phase, Part 15-16, 2026-08-09).
--
-- One durable record per incident. restricted (explicit, defaults true for
-- medical/security/guest categories at the application layer) hard-caps
-- visibility to owner/planner + the assigned responder + the reporter,
-- regardless of category defaults -- see server/src/lib/incidentVisibility.ts.
create table if not exists event_incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null,
  severity text not null default 'medium',
  location text,
  description text not null,
  submitted_by uuid references users(id),
  assigned_to uuid references users(id),
  status text not null default 'open',
  resolution text,
  restricted boolean not null default false,
  attachments jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_event_incidents_event on event_incidents(event_id, created_at desc);
create index if not exists idx_event_incidents_status on event_incidents(event_id, status);
