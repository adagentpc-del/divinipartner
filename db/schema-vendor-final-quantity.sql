-- ---------------------------------------------------------------------------
-- Vendor Final Count / Final Quantity Workflow (Divini Partners 63-section
-- Event Operations spec, Phase A item 7, 2026-08-09).
--
-- The counterpart to event_final_counts (db/schema-final-count.sql, Phase A
-- item 6): that table holds ONE authoritative count per event, set by the
-- owner/planner. This table holds each attached VENDOR's own execution
-- quantity for their own scope (e.g. the caterer's meal count, the AV
-- vendor's stage-setup count) -- distinct per (event, vendor, scope), and
-- versioned the same append-only way so a revision never overwrites what was
-- already submitted.
-- ---------------------------------------------------------------------------

create table if not exists vendor_final_quantities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  scope text not null,
  version int not null,
  quantity numeric not null,
  unit text not null default 'guests',
  notes text,
  -- quantity - the authoritative event_final_counts.count on record at
  -- submit-time, or null when no authoritative final count exists yet.
  discrepancy numeric,
  submitted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, vendor_id, scope, version)
);
create index if not exists idx_vendor_final_quantities_event
  on vendor_final_quantities(event_id, vendor_id, scope, version desc);
