-- Inventory Count-In / Count-Out reconciliation (live-ops phase, Part
-- 21-22, 2026-08-09).
--
-- Extends the Part 17-20 inventory system: a count-in/count-out ALWAYS
-- also writes a real event_inventory_movements row (via
-- db/eventInventory.ts's recordMovement, the single quantity ledger --
-- never a second, disconnected count) via movement_id. This table exists
-- purely for the RECONCILIATION side: a row is only created when there is
-- something to track (a count-in shortfall, or a count-out damaged/missing
-- quantity) -- a clean, fully-accounted count-out needs no resolution
-- workflow and creates no row here, matching "do not create noisy alerts
-- without useful thresholds."
--
-- status covers both kinds' real lifecycles in one column rather than two
-- near-duplicate tables: count_in issues use open -> acknowledged ->
-- resolved; count_out issues use damaged/missing -> disputed -> resolved
-- (or straight to resolved). Never auto-assigns financial liability --
-- resolution_note is a free-text record of what was decided, not a charge.
create table if not exists event_inventory_counts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  item_id uuid not null references event_inventory_items(id) on delete cascade,
  movement_id uuid references event_inventory_movements(id),
  kind text not null,
  expected_quantity numeric,
  counted_quantity numeric not null,
  status text not null default 'open',
  notes text,
  resolution_note text,
  counted_by uuid references users(id),
  resolved_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_event_inventory_counts_event on event_inventory_counts(event_id, created_at desc);
create index if not exists idx_event_inventory_counts_item on event_inventory_counts(item_id);
