-- ---------------------------------------------------------------------------
-- Shared Authoritative Event Record (Divini Partners 63-section Event
-- Operations spec, Phase A item 4, 2026-08-09).
--
-- Additive columns only on the existing `events` table (db/schema.sql).
-- date_time keeps its existing meaning (the event's start) for backward
-- compatibility with every existing reader; end_at is new and, together with
-- date_time, is what makes a multi-day event representable (no separate
-- boolean flag needed -- multi-day is just end_at's date differing from
-- date_time's date).
--
-- guest_count is left completely untouched (still read by checkLimit,
-- buildBidPackage, the ics builder, quote line items, etc.) -- it remains
-- the legacy single number. attendance_* is the new structured breakdown
-- requested by the spec, additive alongside it. attendance_final is
-- deliberately NOT added here: Phase A item 6 (Final Count Workflow) owns
-- that value and must version it rather than let it be silently overwritten
-- by a plain column update, so it gets its own table with history.
-- ---------------------------------------------------------------------------

-- Timing (load-in/setup/rehearsal/vendor-call/doors/strike + multi-day).
alter table events add column if not exists load_in_at timestamptz;
alter table events add column if not exists setup_at timestamptz;
alter table events add column if not exists rehearsal_at timestamptz;
alter table events add column if not exists vendor_call_at timestamptz;
alter table events add column if not exists doors_at timestamptz;
alter table events add column if not exists end_at timestamptz;
alter table events add column if not exists strike_at timestamptz;

-- Venue details specific to this event's booking (the venues table itself
-- stays the venue's general profile, not per-event booking detail).
alter table events add column if not exists venue_space text;
alter table events add column if not exists venue_notes text;

-- Attendance breakdown, additive alongside the legacy guest_count.
alter table events add column if not exists attendance_estimated int;
alter table events add column if not exists attendance_invited int;
alter table events add column if not exists attendance_rsvp_yes int;
alter table events add column if not exists attendance_confirmed int;
alter table events add column if not exists attendance_guaranteed int;
alter table events add column if not exists attendance_vip int;
alter table events add column if not exists attendance_staff int;
alter table events add column if not exists attendance_vendor_staff int;
