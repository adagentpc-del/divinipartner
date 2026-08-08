-- ============================================================================
-- Divini Partners by Divini Group - webhook event ledger
-- ----------------------------------------------------------------------------
-- Found during the ALFY2 pack Section 09 (payments) audit: payment recording
-- was already idempotent at the payment-row level (payments.reference has a
-- partial unique index, see db/apply-all.sql's uq_payments_reference), but
-- there was no ledger of raw webhook events themselves. That means events
-- that never produce a payment row (account.updated, customer.subscription.*,
-- v2 capability_status_updated) had no idempotency protection at all against
-- a duplicate delivery, and there was no observability into attempt counts,
-- failures, or a dead-letter/recovery view across ALL webhook traffic --
-- only what happened to also touch the payments table.
--
-- provider + event_id is the natural idempotency key (Stripe and PayPal both
-- assign a stable, unique id to every event object). A duplicate delivery
-- hits the unique constraint and the insert is a no-op; the webhook handler
-- checks for that before doing any processing and short-circuits.
--
-- Idempotent: only `create table if not exists`. Safe to run repeatedly.
-- Zero em dashes.
-- ============================================================================

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                 -- 'stripe' | 'paypal'
  event_id text not null,                 -- the processor's own event id
  event_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processed','failed')),
  attempt_count int not null default 0,
  last_error text,
  unique (provider, event_id)
);

create index if not exists idx_webhook_events_status on webhook_events(status);
create index if not exists idx_webhook_events_provider on webhook_events(provider, received_at desc);
