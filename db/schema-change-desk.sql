-- ============================================================================
-- Divini Change Desk (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
-- slice 8). Generalizes the pre-existing Change Orders feature (blueprint
-- section 23, db/changeorders.ts) into the spec's Divini Change Desk:
-- controls scope, price, AND schedule changes -- the original build only
-- tracked scope/price (line items -> a dollar amount); this adds the
-- missing schedule half, plus an append-only status history so every
-- transition is preserved, never overwritten (spec constraint 9).
--
-- Additive only (alter table, matching the existing db/schema-phase5.sql
-- convention for this same table). Zero em dashes.
-- ============================================================================

alter table change_orders add column if not exists requested_new_date date;
alter table change_orders add column if not exists schedule_change_note text;

create table if not exists change_order_status_history (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references change_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz default now()
);
create index if not exists idx_co_status_history_co on change_order_status_history(change_order_id, changed_at);
