-- Divini Partners - PRICING V2 Featured Vendor advertising schema (idempotent).
-- Pricing V2 (server PRICING_V2 flag) drops membership tiers and adds one
-- optional ADVERTISING upgrade: Featured Vendor at $49 / month. A featured
-- vendor gets top search placement, a featured badge on marketplace cards,
-- homepage placement, and a preferred-matching ranking boost. Advertising, NOT
-- membership: it never changes platform fees, bid access, or seats.
--
-- Record / track only (existing subscription-entitlement pattern); nothing here
-- moves real money. processor_ref carries the processor sub id once one is wired.
-- ADDITIVE and IDEMPOTENT. Apply AFTER db/schema.sql. Zero em dashes by convention.

create extension if not exists pgcrypto;

-- One current row per vendor org. status: active | cancelled | expired.
-- price_cents defaults to 4900 ($49). current_period_end is the paid-through
-- date; processor_ref is null until a processor is connected.
create table if not exists featured_placements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'expired')),
  price_cents integer not null default 4900,
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  processor_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists featured_placements_org_uniq
  on featured_placements (organization_id);

create index if not exists featured_placements_active_idx
  on featured_placements (status)
  where status = 'active';
