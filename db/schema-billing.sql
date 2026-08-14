-- ============================================================================
-- Divini Partners - Real recurring subscription billing (Phase 1 of the
-- role-based subscription/entitlement system).
--
-- Adds Stripe Customer + Subscription tracking to organizations so tier
-- upgrades are backed by an actual recurring charge instead of a
-- self-declared, unpaid `tier` value. Additive only.
-- Zero em dashes.
-- ============================================================================

alter table organizations add column if not exists stripe_customer_id text;
alter table organizations add column if not exists stripe_subscription_id text;

create unique index if not exists idx_organizations_stripe_customer
  on organizations(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_organizations_stripe_subscription
  on organizations(stripe_subscription_id) where stripe_subscription_id is not null;
