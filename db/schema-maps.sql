-- ============================================================================
-- Divini Partners - Maps + Schedule (WS-4). Additive, guarded. Zero em dashes.
-- Interactive floorplans already work event-scoped (no venue required); make a
-- non-registered place first-class, add booth/sponsor zones (in code), and let
-- an event schedule be marked public + grouped into tracks for sharing.
-- ============================================================================

-- A floorplan for a place that is not a registered venue: label it directly.
alter table floorplans add column if not exists place_name text;
alter table floorplans add column if not exists place_address text;
alter table floorplans add column if not exists source_kind text default 'upload';

-- Shareable schedule: mark itinerary items public and group them into tracks.
alter table itinerary_items add column if not exists is_public boolean default false;
alter table itinerary_items add column if not exists track text;
