-- Event Closeout: vendor completion attestation (live-ops phase, Part
-- 25-27, 2026-08-09).
--
-- Distinct from event_check_ins (Part 7-8, a per-PERSON arrival/departure
-- timestamp). This is a per-VENDOR-ORG attestation: "our participation at
-- this event is done -- packed out, no outstanding issues" (or "issue" if
-- something is wrong, e.g. equipment left behind, a damage claim). One row
-- per (event, vendor org); a vendor org with no row yet reads as the
-- implicit default 'pending' via a LEFT JOIN against event_vendors in
-- db/closeout.ts, never a fabricated pre-seeded row.
create table if not exists event_vendor_completions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  vendor_org_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','complete','issue')),
  notes text,
  marked_by uuid references users(id),
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, vendor_org_id)
);
create index if not exists idx_event_vendor_completions_event on event_vendor_completions(event_id);
