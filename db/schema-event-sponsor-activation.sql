-- Event Sponsor Activation (live-ops phase, Part 23-24, 2026-08-09).
--
-- Distinct from the pre-existing nonprofit fundraising sponsor system
-- (db/schema-np-sponsor.sql's sponsor_purchases/sponsor_fulfillment_tasks,
-- which are scoped to fundraising_events, a different domain from this
-- system's `events` table entirely). This is the day-of, live-ops
-- activation checklist for a sponsor already attached to THIS event (via
-- event_members with role 'sponsor', lib/eventRoles.ts): booth setup,
-- banner placement, signage install, and similar physical deliverables
-- tracked live as they happen, the sponsor equivalent of Part 21-22's
-- inventory count-in/count-out and Part 15-16's incidents.
--
-- sponsor_org_id is the anchor (matches event_inventory_items's
-- source_vendor_org_id pattern) rather than requiring an accepted
-- event_members invitation first, so an owner/planner can pre-build the
-- activation checklist before the sponsor's rep has even joined.
create table if not exists event_sponsor_activations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sponsor_org_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  location_id uuid references event_locations(id) on delete set null,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','complete','issue')),
  notes text,
  completed_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_event_sponsor_activations_event on event_sponsor_activations(event_id, created_at asc);
create index if not exists idx_event_sponsor_activations_org on event_sponsor_activations(sponsor_org_id);
