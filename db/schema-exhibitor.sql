-- ============================================================================
-- Divini Partners - Exhibitor packages, booths, and orders (the vendor side of
-- the public event landing). Additive, guarded. Orders compute the platform fee;
-- actual charge is wired to the pay rail later. Zero em dashes.
-- ============================================================================

-- Tiered exhibitor/vendor packages for any event (mirrors ticket tiers).
create table if not exists event_exhibitor_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  name text not null,
  price_cents integer not null default 0,
  quantity integer,                 -- null = unlimited
  sold integer not null default 0,
  includes_booth boolean not null default false,
  benefits text,
  is_active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_exhibitor_pkgs_event on event_exhibitor_packages(event_id);

-- Booth inventory for an event. status: available | held | booked.
create table if not exists event_booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  label text not null,
  price_cents integer not null default 0,
  status text not null default 'available' check (status in ('available','held','booked')),
  zone_ref text,                    -- optional link to a layout zone id
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_event_booths_event on event_booths(event_id);

-- A vendor's exhibitor order for an event.
create table if not exists exhibitor_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  org_id uuid,                      -- set once the vendor has an account
  contact_name text,
  email text,
  company text,
  package_id uuid,
  booth_id uuid,
  amount_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed','cancelled')),
  payment_ref text,
  created_at timestamptz default now()
);
create index if not exists idx_exhibitor_orders_event on exhibitor_orders(event_id);
