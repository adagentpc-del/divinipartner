-- ---------------------------------------------------------------------------
-- Packet versioning completion (Final Event Schedule / Event Execution
-- Packet completion phase, Part 5, 2026-08-09).
--
-- Phase A item 8 already made event_execution_packets append-only
-- (unique(event_id, version), a previous version marked 'superseded'
-- rather than overwritten). This completes the status vocabulary
-- (draft/issued/superseded/final, matching the spec's terms -- 'generated'
-- is renamed to 'issued') and adds superseded_by so a superseded version
-- can point forward to whichever version replaced it.
-- ---------------------------------------------------------------------------

alter table event_execution_packets drop constraint if exists event_execution_packets_status_check;
alter table event_execution_packets add constraint event_execution_packets_status_check
  check (status in ('draft', 'issued', 'superseded', 'final'));
update event_execution_packets set status = 'issued' where status = 'generated';
alter table event_execution_packets alter column status set default 'issued';

alter table event_execution_packets add column if not exists superseded_by uuid
  references event_execution_packets(id) on delete set null;
