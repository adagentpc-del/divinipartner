-- Event Inventory Model + Locations + Transfers (live-ops phase, Part
-- 17-20, 2026-08-09).
--
-- Deliberately a NEW, event-scoped set of tables, distinct from the
-- pre-existing org-scoped `inventory_items` (a supplier's sellable/rentable
-- warehouse catalog, server/src/db/inventory.ts) -- that is a different
-- domain (pre-event catalog) from this one (day-of physical inventory at
-- one specific event). Named event_inventory_* to keep the two apart.
--
-- event_locations: a hierarchical zone tree (Venue -> Ballroom -> Main Bar
-- -> VIP Lounge -> ...) that extends the existing floorplans system
-- (floorplan_id, nullable) rather than replacing it -- a location may
-- optionally be drawn on an uploaded floorplan.
--
-- event_inventory_items: the item TYPE (e.g. "Champagne"), never a
-- per-location row -- current quantity at any location is DERIVED from
-- event_inventory_movements, never stored redundantly.
--
-- event_inventory_movements: an append-only ledger. from_location_id null
-- means "arrived from outside the event" (initial delivery/count-in);
-- to_location_id null means "left the event" (returned/disposed/lost).
-- A transfer is one row with both set. Current quantity at a location =
-- sum(quantity where to_location = X) - sum(quantity where from_location =
-- X). This is what makes "prevent negative inventory" and "prevent
-- impossible concurrent transfers" enforceable with a single transactional
-- check against a derived aggregate, guarded by a row lock on the item
-- (server/src/db/eventInventory.ts's recordMovement).
create table if not exists event_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  parent_id uuid references event_locations(id) on delete set null,
  floorplan_id uuid references floorplans(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_locations_event on event_locations(event_id);
create index if not exists idx_event_locations_parent on event_locations(parent_id);

create table if not exists event_inventory_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  category text not null,
  unit text not null default 'unit',
  expected_quantity numeric,
  source_vendor_org_id uuid references organizations(id),
  status text not null default 'expected',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_event_inventory_items_event on event_inventory_items(event_id);

create table if not exists event_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  item_id uuid not null references event_inventory_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  from_location_id uuid references event_locations(id),
  to_location_id uuid references event_locations(id),
  kind text not null default 'transfer',
  moved_by uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_inventory_movements_event on event_inventory_movements(event_id, created_at desc);
create index if not exists idx_event_inventory_movements_item on event_inventory_movements(item_id);
