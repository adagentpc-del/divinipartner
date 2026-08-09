-- ---------------------------------------------------------------------------
-- Run of Show finalization (Final Event Schedule / Event Execution Packet
-- completion phase, Part 15, 2026-08-09). Extends the existing
-- itinerary_items / buildItinerary() system (Phase 6) rather than
-- duplicating it: a draft/approved status lives directly on the event,
-- alongside the other Shared Authoritative Event Record fields.
-- ---------------------------------------------------------------------------

alter table events add column if not exists itinerary_status text not null default 'draft'
  check (itinerary_status in ('draft', 'approved'));
alter table events add column if not exists itinerary_approved_at timestamptz;
alter table events add column if not exists itinerary_approved_by uuid references users(id) on delete set null;
