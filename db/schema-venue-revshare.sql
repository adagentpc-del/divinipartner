-- =====================================================================
-- Venue Revenue Share (20% of the platform fee, Pricing V2)
-- ---------------------------------------------------------------------
-- Every on-platform transaction tied to an event hosted at a venue accrues
-- a revenue share to that venue's organization. The share is:
--
--   share_cents = round( platform_fee_cents * 0.20 )   (20% of the fee)
--
-- A fixed 20% of the platform fee on each transaction. At a flat 5% fee that
-- equals 1% of gross. Scales at every booking size and never exceeds the fee.
-- Guarantees:
--   * the payer (client) and the payee (vendor) are never charged more;
--   * the platform's fee line on the transaction can never go negative
--     (the venue share is carved out of the platform fee, "net of fee");
--   * the venue share always scales with the transaction (no flat dollars).
--
-- Self-dealing is skipped: when the venue's own org is the paying party, no
-- share is accrued. Subscriptions and off-platform payments never accrue.
--
-- Written automatically by the monetization hook (lib/monetization.ts),
-- idempotent per source payment. Reconcilable after the fact like the
-- platform_revenue ledger. Zero em dashes.
-- =====================================================================

-- Audit columns on the platform_revenue ledger so the venue carve-out is
-- visible alongside the platform fee on the same row.
alter table platform_revenue add column if not exists venue_org_id uuid;
alter table platform_revenue add column if not exists venue_share_cents bigint not null default 0;
alter table platform_revenue add column if not exists venue_share_rate numeric;

-- Dedicated venue payout ledger (mirrors platform_revenue / partner_commissions).
create table if not exists venue_revenue_share (
  id uuid primary key default gen_random_uuid(),
  source_payment_id uuid not null references payments(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  venue_id uuid references venues(id) on delete set null,
  venue_org_id uuid references organizations(id) on delete set null,
  base_cents bigint not null default 0,          -- gross transaction in cents
  share_rate numeric not null default 0.01,      -- 1% by default
  share_cents bigint not null default 0,         -- min(1% of gross, platform fee)
  platform_fee_cents bigint not null default 0,  -- the fee the share was carved from
  status text not null default 'accrued'
    check (status in ('accrued','invoiced','collected','paid','waived','void')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_payment_id)                     -- one share row per payment (idempotent)
);

create index if not exists idx_venue_revshare_venue_org on venue_revenue_share(venue_org_id);
create index if not exists idx_venue_revshare_event on venue_revenue_share(event_id);
create index if not exists idx_venue_revshare_status on venue_revenue_share(status);
