-- ============================================================================
-- Divini Partners - Venue Intelligence Addendum, PHASE 6 schema additions
-- ----------------------------------------------------------------------------
-- Client event page customization + guest invites + guest-list to vendor
-- auto-sync. A vendor opts in (per event) to receive guest-list updates,
-- headcount, and deposit / payment gating via vendor_event_requirements.
--
-- These statements are ADDITIVE and self-contained. They reuse the existing
-- events, vendors, and guests tables (db/schema.sql + db/schema-phase6.sql).
-- Every statement is guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p6.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- VENDOR EVENT REQUIREMENTS (Venue Intelligence Addendum, guest-list sync)
-- ---------------------------------------------------------------------------
-- One row per (event, vendor): the vendor declares what they need from this
-- event. needs_guest_list / needs_headcount drive the guest-list auto-sync
-- notification; needs_deposit + the deposit_gate / payment_gate jsonb blobs
-- carry the vendor's gating configuration (the structured rules the vendor
-- requires satisfied before they commit / install).
create table if not exists vendor_event_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  needs_guest_list boolean default false,
  needs_headcount boolean default false,
  needs_deposit boolean default false,
  deposit_gate jsonb,                       -- { amount, percent, due_by, status, ... }
  payment_gate jsonb,                       -- { milestones:[...], terms, ... }
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (event_id, vendor_id)
);

create index if not exists idx_ver_event on vendor_event_requirements(event_id);
create index if not exists idx_ver_vendor on vendor_event_requirements(vendor_id);
create index if not exists idx_ver_guest_list on vendor_event_requirements(needs_guest_list);
create index if not exists idx_ver_headcount on vendor_event_requirements(needs_headcount);
