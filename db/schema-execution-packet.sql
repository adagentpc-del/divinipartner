-- ---------------------------------------------------------------------------
-- Final Event Schedule / Event Execution Packet FOUNDATION (Divini Partners
-- 63-section Event Operations spec, Phase A item 8, 2026-08-09).
--
-- This is deliberately assembly, not a new source of truth. Every piece of
-- data an Execution Packet needs already exists elsewhere in this schema:
--   - Run of Show / schedule items -> itinerary_items + buildItinerary()
--     (db/schema-phase6.sql, server/src/db/itinerary.ts) -- already a full
--     auto-derived + persisted schedule system with role-scoped views.
--   - Venue info / location -> events.venue_id -> venues (address/city/
--     region/capacity) plus events.venue_space/venue_notes (Phase A item 4).
--   - Setup / floor-plan files -> floorplans (db/apply-all.sql).
--   - Vendor assignments -> event_vendors + event_members (Phase A item 2).
--   - Final counts -> event_final_counts + vendor_final_quantities (Phase A
--     items 6-7).
--   - Key contacts -> event_members joined to users (name/email/phone),
--     nothing new needed.
--
-- event_execution_packets holds the one genuinely new thing: a VERSIONED
-- SNAPSHOT of all of the above assembled together at generation time, so a
-- vendor who was sent "packet v2" can always see exactly what v2 said even
-- after the live data has since moved on. Append-only, same convention as
-- event_final_counts and vendor_final_quantities. The fuller packet spec
-- (role-scoped distribution, timezone-aware send presets, pre-send
-- readiness validation, "WHAT CHANGED" diffs, reminder cadence) is
-- explicitly deferred to follow once this foundation is live-verified, per
-- the spec's own phasing -- nothing here fabricates that machinery.
-- ---------------------------------------------------------------------------

create table if not exists event_execution_packets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  version int not null,
  status text not null default 'generated' check (status in ('generated', 'superseded')),
  snapshot jsonb not null,
  generated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, version)
);
create index if not exists idx_event_execution_packets_event
  on event_execution_packets(event_id, version desc);

create table if not exists event_execution_packet_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references event_execution_packets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (packet_id, user_id)
);
create index if not exists idx_event_execution_packet_acks_packet
  on event_execution_packet_acknowledgments(packet_id);
