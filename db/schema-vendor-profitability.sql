-- ============================================================================
-- Divini Partners - Vendor job costing / margin tracking (Vendor Pro feature,
-- see server/src/lib/planCatalog.ts's "Margin tracking" + "Job costing"
-- bullets, Vendor Pro only).
--
-- A vendor records their true cost for a won job (an accepted/converted
-- quote), kept in a SEPARATE table from `quotes` -- never joined into the
-- general quote-listing queries the client side reads, so the vendor's
-- private cost data can never leak through an existing `select *` on
-- quotes. Only server/src/db/vendorProfitability.ts reads/writes this table.
--
-- Additive only. Zero em dashes.
-- ============================================================================

create table if not exists quote_costs (
  quote_id uuid primary key references quotes(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  cost_amount numeric not null check (cost_amount >= 0),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_quote_costs_org on quote_costs(organization_id);
