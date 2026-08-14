-- ---------------------------------------------------------------------------
-- Event Change -> Packet Invalidation, human-readable reason (Live Event
-- Operations phase, Part 2, 2026-08-09).
--
-- Extends db/schema-packet-invalidation.sql's update_required status with
-- WHY: a short, human-readable summary of what changed, so the planner
-- sees "Run of Show changed: Dinner Service moved from 7:15 PM to 7:30 PM"
-- instead of just a bare status flag.
-- ---------------------------------------------------------------------------

alter table event_execution_packets add column if not exists update_required_reason text;
