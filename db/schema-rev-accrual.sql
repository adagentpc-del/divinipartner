-- ============================================================================
-- Divini Partners - PLATFORM REVENUE ACCRUAL LEDGER (Money-loop close).
-- ----------------------------------------------------------------------------
-- Closes the money-loop gap: when a payment/booking is RECORDED on platform, the
-- platform's commission (its own fee) and any agreed referral split must be
-- ACCRUED automatically so revenue cannot silently leak. This file adds ONE new
-- ledger table, platform_revenue, that records the platform fee earned on each
-- source payment exactly once. Partner referral commissions continue to be
-- accrued into the existing partner_commissions ledger (db/schema-rev-partner.sql)
-- by the same hook, so we do NOT duplicate a commission table here.
--
-- This is a RECORD-ONLY ledger. Nothing here moves money or charges anyone; it
-- accrues what is owed to the platform and tracks its lifecycle through
-- accrued -> invoiced -> collected, with waived / void as explicit terminal
-- states a super-admin may set. The fee can never be silently skipped: every
-- on-platform payment insert writes exactly one accrued row (see
-- server/src/lib/monetization.ts), and the only way to remove the obligation is
-- an explicit status = waived or void set by an admin.
--
-- ADDITIVE and idempotent. No ALTER of any existing table. Every statement is
-- guarded so re-running is safe. Apply AFTER db/schema.sql (payments) and
-- db/schema-rev-partner.sql (partners / partner_commissions):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-accrual.sql
-- (or run the consolidated db/apply-all.sql, which embeds this file).
--
-- Cross-workstream references are by NAME only (no hard FKs to partners /
-- partner_commissions) so apply order is unconstrained and the hook degrades
-- gracefully when a partner table is absent. payment_id references payments(id)
-- with on delete cascade because a platform fee accrual has no meaning without
-- its source payment.
--
-- Amounts are integer cents (the fee engines in server/src/lib operate in
-- cents). Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- platform_revenue - the platform's own accrued-fee ledger. One row per source
-- payment (uq_platform_revenue_payment makes recording idempotent: a second
-- attempt for the same payment is a no-op via on conflict do nothing).
-- ---------------------------------------------------------------------------
--   source            what produced the fee (payment | external_fee | manual)
--   source_payment_id the payments.id this fee was accrued from (unique)
--   organization_id   the org the fee is attributed to (the paid party's org)
--   base_cents        the transaction amount the fee was computed on, in cents
--   fee_cents         the platform fee accrued, in cents
--   fee_basis         human-readable basis e.g. 'free 5.0% capped at $2,500'
--   fee_rate          the fractional rate applied (0.025 == 2.5%), reference
--   processing_cost_cents the processing cost estimate, in cents (reference)
--   referral_partner_id   the partner credited a split (by name, nullable)
--   referral_commission_id the partner_commissions.id of the accrued split
--   referral_split_cents   the partner's accrued split in cents (reference)
--   status            accrued | invoiced | collected | waived | void
--                       accrued   default on record (the obligation exists)
--                       invoiced  rolled into a statement to the org
--                       collected the fee has been collected by the platform
--                       waived    super-admin explicitly forgave the fee
--                       void      reversed (e.g. the payment was refunded)
create table if not exists platform_revenue (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'payment'
    check (source in ('payment','external_fee','manual')),
  source_payment_id uuid references payments(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  base_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  fee_basis text,
  fee_rate numeric,
  processing_cost_cents bigint not null default 0,
  referral_partner_id uuid,
  referral_commission_id uuid,
  referral_split_cents bigint not null default 0,
  status text not null default 'accrued'
    check (status in ('accrued','invoiced','collected','waived','void')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotency: at most one revenue row per source payment. The monetization
-- hook inserts with `on conflict (source_payment_id) do nothing`, so a webhook
-- backstop or a retried capture can never accrue the fee twice. Partial so the
-- rare manual rows with a null payment id are unconstrained.
create unique index if not exists uq_platform_revenue_payment
  on platform_revenue (source_payment_id) where source_payment_id is not null;

create index if not exists idx_platform_revenue_org on platform_revenue (organization_id);
create index if not exists idx_platform_revenue_status on platform_revenue (status);
create index if not exists idx_platform_revenue_partner on platform_revenue (referral_partner_id);
create index if not exists idx_platform_revenue_created on platform_revenue (created_at desc);
