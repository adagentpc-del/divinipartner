-- ============================================================================
-- Divini Partners - real Warehouse entities (Supplier Free/Plus capped at 1,
-- Pro unlocks "Multi warehouse" -- see server/src/lib/planCatalog.ts). Before
-- this, inventory_items.warehouse_location was free text with no entity and
-- no limit enforcement at all.
--
-- Additive only. inventory_items.warehouse_id is nullable and additive;
-- warehouse_location (free text) is untouched for backward compatibility.
-- Zero em dashes.
-- ============================================================================

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_warehouses_org on warehouses(organization_id);

alter table inventory_items add column if not exists warehouse_id uuid references warehouses(id) on delete set null;
create index if not exists idx_inventory_items_warehouse on inventory_items(warehouse_id) where warehouse_id is not null;
