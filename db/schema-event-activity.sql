-- Live Activity Timeline (live-ops phase, Part 11-12, 2026-08-09).
--
-- One authoritative, append-only feed of everything that happens on a live
-- event. Every part of this phase that produces a real, notable event
-- (check-in, task completion, status transition, and later: change
-- requests, incidents, inventory movement, sponsor activation, closeout)
-- writes ONE row here rather than each maintaining its own separate
-- "recent activity" list. visibility_scope is an explicit allow-list of
-- PacketAudience buckets (lib/packetProjection.ts); when null, the
-- category's own default scope (server/src/lib/activityVisibility.ts)
-- applies. category is a structured type, not just free text, so a
-- consumer can filter/group without parsing message strings.
create table if not exists event_activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  actor_id uuid references users(id),
  actor_org_id uuid references organizations(id),
  category text not null,
  related_entity_type text,
  related_entity_id uuid,
  message text not null,
  payload jsonb,
  severity text not null default 'info',
  visibility_scope text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_event_activity_event on event_activity(event_id, created_at desc);
create index if not exists idx_event_activity_org on event_activity(event_id, actor_org_id);
