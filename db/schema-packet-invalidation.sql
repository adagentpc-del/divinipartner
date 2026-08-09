-- ---------------------------------------------------------------------------
-- Event Change -> Packet Invalidation (Final Event Schedule / Event
-- Execution Packet completion phase, Part 18, 2026-08-09).
--
-- Adds 'update_required' as an explicit packet status: whenever
-- source-of-truth event data changes after a packet has been issued, the
-- current issued/final packet is flipped to 'update_required' instead of
-- silently continuing to look current. Do not silently leave an issued
-- packet appearing current when the underlying data has changed.
-- ---------------------------------------------------------------------------

alter table event_execution_packets drop constraint if exists event_execution_packets_status_check;
alter table event_execution_packets add constraint event_execution_packets_status_check
  check (status in ('draft', 'issued', 'superseded', 'final', 'update_required'));
