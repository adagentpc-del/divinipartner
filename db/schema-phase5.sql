-- ============================================================================
-- Divini Partners by Divini Group - PHASE 5 schema additions
-- ----------------------------------------------------------------------------
-- Standardized Invoices, Payments + Platform Fees, Payment-Leakage Policy,
-- Contract Pricing Partnerships, and Change Orders (blueprint sections 20-23).
--
-- These statements are ADDITIVE. They extend tables already created in
-- db/schema.sql (invoices, payments, change_orders, contract_pricing) with the
-- extra columns Phase 5 needs, and create new supporting tables. Every column
-- add is guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase5.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- INVOICES (blueprint 20) - standardized invoice payload + co-branding state
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists invoice_number text;
alter table invoices add column if not exists venue_id uuid references venues(id) on delete set null;
alter table invoices add column if not exists quote_id uuid references quotes(id) on delete set null;
alter table invoices add column if not exists processing_fee numeric default 0;
alter table invoices add column if not exists platform_fee_rate numeric;
alter table invoices add column if not exists deposit_due numeric;
alter table invoices add column if not exists deposit_status text;        -- none|requested|paid
alter table invoices add column if not exists terms text;
alter table invoices add column if not exists notes text;
alter table invoices add column if not exists payment_link text;
alter table invoices add column if not exists brand jsonb;                -- co-branding: divini + active user org
alter table invoices add column if not exists currency text default 'USD';
alter table invoices add column if not exists sent_at timestamptz;
alter table invoices add column if not exists viewed_at timestamptz;
alter table invoices add column if not exists paid_at timestamptz;
alter table invoices add column if not exists created_by uuid references users(id) on delete set null;
alter table invoices add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_invoices_number on invoices(invoice_number);

-- ---------------------------------------------------------------------------
-- PAYMENTS (blueprint 21) - payment flows, payout routing, fee breakdown
-- ---------------------------------------------------------------------------
alter table payments add column if not exists event_id uuid references events(id) on delete set null;
alter table payments add column if not exists organization_id uuid references organizations(id) on delete set null;
-- flow: client_to_vendor | client_to_venue | client_to_divini_payout
alter table payments add column if not exists flow text;
-- kind: deposit | balance | milestone | full
alter table payments add column if not exists kind text;
alter table payments add column if not exists processing_fee numeric default 0;
alter table payments add column if not exists net_payout numeric;        -- amount minus platform + processing fee
alter table payments add column if not exists payee_org_id uuid references organizations(id) on delete set null;
alter table payments add column if not exists payee_label text;
alter table payments add column if not exists fee_breakdown jsonb;        -- configurable fees applied (blueprint 21.3)
alter table payments add column if not exists external_proof text;        -- proof attachment ref for external payments
alter table payments add column if not exists external_acknowledged_by uuid references users(id) on delete set null;
alter table payments add column if not exists fee_owed numeric;           -- platform fee still owed on external payments
alter table payments add column if not exists reference text;
alter table payments add column if not exists recorded_by uuid references users(id) on delete set null;
alter table payments add column if not exists updated_at timestamptz default now();
-- C5: enforce one payment row per processor reference so a race cannot double
-- record (and double pay out). Partial so multiple NULL references are allowed.
create unique index if not exists uq_payments_reference on payments(reference) where reference is not null;

-- ---------- platform_fee_config ----------
-- Configurable fees list (blueprint 21.3). Admin-managed; applied at payment time.
create table if not exists platform_fee_config (
  id uuid primary key default gen_random_uuid(),
  key text unique,                       -- platform_fee | processing_fee | rush_fee | ...
  label text,
  fee_type text check (fee_type in ('percent','flat')),
  value numeric,                         -- percent (0.025) or flat amount
  applies_to text,                       -- invoice | payment | payout
  active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- PAYMENT-LEAKAGE POLICY (blueprint 21.4) - external payment audit trail
-- ---------------------------------------------------------------------------
-- One row per "mark as external" decision. Requires reason + proof, notifies
-- admin, and records the platform fee that is still owed. The booleans flag the
-- account for review. Detection itself happens in server/src/lib/leakage.ts.
create table if not exists leakage_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  source text,                           -- message | invoice | manual | external_flow
  detected_terms text[],                 -- matched leakage phrases
  flagged_text text,                     -- snippet that triggered detection
  decision text check (decision in ('detected','warned','marked_external','blocked','cleared')),
  reason text,
  proof text,
  fee_owed numeric,
  admin_notified boolean default false,
  account_flagged boolean default false,
  resolved boolean default false,
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_leakage_event on leakage_events(event_id);
create index if not exists idx_leakage_org on leakage_events(organization_id);
create index if not exists idx_leakage_invoice on leakage_events(invoice_id);
create index if not exists idx_leakage_decision on leakage_events(decision);

-- ---------------------------------------------------------------------------
-- CONTRACT PRICING PARTNERSHIPS (blueprint 22) - extra terms
-- ---------------------------------------------------------------------------
alter table contract_pricing add column if not exists name text;
alter table contract_pricing add column if not exists volume_tier text;        -- e.g. tier1/tier2/tier3
alter table contract_pricing add column if not exists volume_threshold numeric;
alter table contract_pricing add column if not exists applicable_venues uuid[];
alter table contract_pricing add column if not exists terms text;
alter table contract_pricing add column if not exists approval_status text;     -- pending|approved|declined|expired
alter table contract_pricing add column if not exists approved_by uuid references users(id) on delete set null;
alter table contract_pricing add column if not exists created_by uuid references users(id) on delete set null;
alter table contract_pricing add column if not exists updated_at timestamptz default now();

create index if not exists idx_contract_pricing_status on contract_pricing(approval_status);

-- ---------------------------------------------------------------------------
-- CHANGE ORDERS (blueprint 23) - lifecycle + scope-creep flag
-- ---------------------------------------------------------------------------
alter table change_orders add column if not exists change_order_number text;
alter table change_orders add column if not exists title text;
alter table change_orders add column if not exists reason text;
alter table change_orders add column if not exists scope_creep_flag boolean default false;
alter table change_orders add column if not exists subtotal numeric;
alter table change_orders add column if not exists platform_fee numeric;
alter table change_orders add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table change_orders add column if not exists responded_at timestamptz;
alter table change_orders add column if not exists updated_at timestamptz default now();

-- change_orders.status was free text in schema.sql; Phase 5 uses the values:
-- draft | sent | accepted | declined | revision_requested | added_to_invoice | paid | closed
create index if not exists idx_change_orders_status on change_orders(status);

-- ---------------------------------------------------------------------------
-- SEED - default configurable fees (idempotent)
-- ---------------------------------------------------------------------------
insert into platform_fee_config (key, label, fee_type, value, applies_to, active, notes)
values
  ('platform_fee','Platform Fee','percent',0.025,'invoice',true,'Rate overridden per org tier at compute time'),
  ('processing_fee','Payment Processing Fee','percent',0.029,'payment',true,'Card processing pass-through'),
  ('processing_fee_flat','Processing Fee (flat)','flat',0.30,'payment',true,'Per-transaction flat'),
  ('rush_fee','Rush Handling Fee','flat',75,'invoice',false,'Optional, for expedited turnarounds')
on conflict (key) do nothing;
