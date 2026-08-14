-- ---------------------------------------------------------------------------
-- Unit-aware vendor final quantity discrepancy semantics (Final Event
-- Schedule / Execution Packet completion phase, 2026-08-09).
--
-- Fixes a deferred gap in vendor_final_quantities (db/schema-vendor-final-
-- quantity.sql, Phase A item 7): the original discrepancy column compared
-- EVERY vendor's quantity directly against the event's guest final count,
-- which is only valid for headcount-proportional scopes. See
-- server/src/lib/quantityComparison.ts for the comparison model.
--
-- Additive only. Existing rows keep their original discrepancy value with
-- comparison_type left null (they predate this model and are not
-- retroactively re-labeled -- this app has no production data yet, so
-- there is nothing to migrate for real, and a null comparison_type simply
-- reads as "not modeled" rather than a false claim about how it was
-- computed).
-- ---------------------------------------------------------------------------

alter table vendor_final_quantities add column if not exists comparison_type text
  check (comparison_type in (
    'event_final_count', 'awarded_quantity', 'contract_quantity',
    'scope_requirement', 'custom_expected_quantity', 'none'));
alter table vendor_final_quantities add column if not exists comparison_reference jsonb;
alter table vendor_final_quantities add column if not exists comparison_ratio numeric not null default 1;
alter table vendor_final_quantities add column if not exists expected_quantity numeric;
alter table vendor_final_quantities add column if not exists discrepancy_status text
  check (discrepancy_status in ('not_applicable', 'unresolved', 'match', 'over', 'under'));
