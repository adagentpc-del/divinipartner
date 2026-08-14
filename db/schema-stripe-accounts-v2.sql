-- ============================================================================
-- Divini Partners by Divini Group - Stripe Accounts v2 (direct-charge model)
-- ----------------------------------------------------------------------------
-- Adds a SECOND connected-account onboarding path alongside the existing v1
-- Express accounts (payout_accounts, populated via lib/processors.ts's
-- createConnectAccount / lib/stripe-connect.ts): Accounts v2
-- (server/src/lib/stripeAccounts.ts), where a connected account is
-- configured as BOTH a merchant (accepts DIRECT-charge payments from its own
-- customers, i.e. the connected account is the merchant of record, not the
-- platform) and a platform customer (can be billed the org's Divini Partners
-- subscription fee straight from its own Stripe balance, no separate card
-- needed).
--
-- stripe_api_version distinguishes which onboarding path a given org
-- completed, so routes/payments.ts's checkout can branch: v1 rows keep using
-- the existing DESTINATION charge (transfer_data.destination,
-- application_fee_amount, charge lands on the platform account); v2 rows use
-- a DIRECT charge (Stripe-Account header, application_fee_amount, charge
-- lands on the connected account itself). Existing rows default to 'v1' so
-- already-onboarded vendors are completely unaffected.
--
-- subscription_payment_source on organizations distinguishes the existing
-- card-based recurring subscription (lib/stripeBilling.ts, a classic Stripe
-- Customer + Checkout Session) from the new stripe_balance-funded one
-- (lib/stripeAccounts.ts's chargeAccountSubscription) -- both write the SAME
-- organizations.stripe_subscription_id / tier / platform_fee_rate columns
-- via the SAME db.ts's applySubscriptionUpdate(), so the webhook handling in
-- routes/payments.ts needed no changes: metadata.org_id already took
-- priority over customer-id lookup before this migration.
--
-- Idempotent: only `add column if not exists`. Safe to run repeatedly.
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-stripe-accounts-v2.sql
--
-- Zero em dashes.
-- ============================================================================

alter table payout_accounts add column if not exists stripe_api_version text not null default 'v1'
  check (stripe_api_version in ('v1','v2'));

alter table organizations add column if not exists subscription_payment_source text
  check (subscription_payment_source in ('card','stripe_balance'));
