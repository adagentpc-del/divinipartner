-- ---------------------------------------------------------------------------
-- Final Event Schedule data-model completion (Final Event Schedule / Event
-- Execution Packet completion phase, 2026-08-09).
--
-- Audited first: events.venue_id/venue_space/venue_notes (Phase A item 4),
-- itinerary_items/buildItinerary (Run of Show), floorplans, event_members
-- (key contacts), event_final_counts/vendor_final_quantities all already
-- exist and are NOT duplicated here. Two genuine gaps remained:
--   - No timezone on events at all -- required for both the readiness
--     engine's "timezone exists" check and later timezone-aware
--     distribution scheduling. IANA zone name (e.g. "America/New_York"),
--     not a raw UTC offset, so DST transitions resolve correctly.
--   - No structured venue logistics / emergency-contact fields -- venue
--     access time, parking, loading dock, vendor/guest entrances, venue
--     restrictions, and an emergency contact were previously nowhere,
--     forcing them into the freeform venue_notes text field where a
--     readiness check or packet section could not reliably find them.
-- ---------------------------------------------------------------------------

alter table events add column if not exists timezone text;
alter table events add column if not exists venue_access_time timestamptz;
alter table events add column if not exists venue_parking_info text;
alter table events add column if not exists venue_loading_dock text;
alter table events add column if not exists venue_vendor_entrance text;
alter table events add column if not exists venue_guest_entrance text;
alter table events add column if not exists venue_restrictions text;
alter table events add column if not exists emergency_contact_name text;
alter table events add column if not exists emergency_contact_phone text;
