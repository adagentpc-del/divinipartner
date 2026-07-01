-- ============================================================================
-- Divini Partners by Divini Group - PHASE 4 schema additions
-- ----------------------------------------------------------------------------
-- Rental Inventory management, Vendor Pricing Memory, Auto-Quote engine inputs,
-- and the Package / Bundle builder. (Blueprint sections 12, 17, 18.)
--
-- This file is ADDITIVE. It does not modify db/schema.sql. Apply it AFTER the
-- base schema:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase4.sql
--
-- The base `inventory_items` table (db/schema.sql) only carries a subset of the
-- blueprint 12.2 field set. Rather than ALTER another agent's table in a way that
-- could collide, Phase 4 adds the remaining columns with `add column if not
-- exists` (safe + idempotent) and introduces new tables for availability by
-- date, pricing memory, and packages.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- inventory_items: extend with the full blueprint 12.2 field set.
-- (Base columns already present: name, category, description, photos,
--  dimensions, weight, quantity, price, fees, availability, warehouse_location,
--  service_radius, lead_time, contract_pricing_eligible.)
-- ----------------------------------------------------------------------------
alter table inventory_items add column if not exists price_unit text;          -- per_day | per_event | per_unit | per_hour
alter table inventory_items add column if not exists delivery_fee numeric;
alter table inventory_items add column if not exists install_fee numeric;
alter table inventory_items add column if not exists labor_required boolean default false;
alter table inventory_items add column if not exists labor_hours numeric;       -- estimated labor hours per unit
alter table inventory_items add column if not exists damage_deposit numeric;
alter table inventory_items add column if not exists replacement_value numeric;
alter table inventory_items add column if not exists venue_restrictions text[];
alter table inventory_items add column if not exists add_ons jsonb;             -- [{ name, price }]
alter table inventory_items add column if not exists preferred_venue_pricing jsonb; -- { venue_id|venue_name: discount_pct }
alter table inventory_items add column if not exists status text;              -- active | archived | unavailable
alter table inventory_items add column if not exists updated_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- inventory_availability: availability tracking by date for an inventory item.
-- quantity_available is the on-hand count for that date window; reserved and
-- pending track committed and tentative holds; buffer is a safety reserve.
-- ----------------------------------------------------------------------------
create table if not exists inventory_availability (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  start_date date not null,
  end_date date,
  quantity_available int default 0,
  quantity_reserved int default 0,
  quantity_pending int default 0,
  buffer int default 0,
  note text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- vendor_pricing_memory: the per-vendor private "pricing brain" (blueprint 18).
-- One row per organization (the vendor account). Everything the auto-quote
-- engine needs to compose a draft, kept private to the owning org.
-- ----------------------------------------------------------------------------
create table if not exists vendor_pricing_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade unique,
  standard_rates jsonb,        -- { service_key: { rate, unit } }
  product_prices jsonb,        -- { product_key: price }
  rental_rates jsonb,          -- { item_key: { rate, unit } }
  labor_rates jsonb,           -- { role: hourly_rate }, plus { default }
  minimums jsonb,              -- { order_minimum, labor_minimum_hours }
  travel_fees jsonb,           -- { base, per_mile, free_radius_miles }
  discount_rules jsonb,        -- [{ name, type, threshold, pct }]
  package_templates jsonb,     -- [{ name, items:[...], price }]
  rush_multipliers jsonb,      -- { standard: 1, rush: 1.25, same_day: 1.5 }
  seasonal_pricing jsonb,      -- [{ name, start_md, end_md, multiplier }]
  contract_pricing jsonb,      -- { partner_org_id|venue: discount_pct }
  past_quotes jsonb,           -- [{ quote_id, event_type, total, outcome, at }]
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- packages: named bundles of inventory + services with bundle pricing.
-- items is a jsonb array of { kind:'inventory'|'service', ref_id, name,
-- quantity, unit_price }. bundle_price is the all-in offered price; if null
-- the sum of line items is used.
-- ----------------------------------------------------------------------------
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  name text not null,
  description text,
  category text,
  items jsonb,
  bundle_price numeric,
  delivery_fee numeric,
  install_fee numeric,
  labor_hours numeric,
  serves int,                  -- recommended guest count this package serves
  add_ons jsonb,
  status text,                 -- draft | active | archived
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_inv_avail_item on inventory_availability(inventory_item_id);
create index if not exists idx_inv_avail_org on inventory_availability(organization_id);
create index if not exists idx_inv_avail_dates on inventory_availability(start_date, end_date);
create index if not exists idx_pricing_memory_org on vendor_pricing_memory(organization_id);
create index if not exists idx_packages_org on packages(organization_id);
create index if not exists idx_packages_vendor on packages(vendor_id);
create index if not exists idx_packages_status on packages(status);
create index if not exists idx_inventory_status on inventory_items(status);
