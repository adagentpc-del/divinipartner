-- =====================================================================
-- Pricing V2 data migration (run ONCE at flip, after PRICING_V2=true).
-- Idempotent. Moves every account to the free transaction-marketplace model:
--   * stop subscription billing (everyone free)
--   * set a single flat 5% platform fee rate on every org
--   * clients stay clients; all other orgs become the free partner account
-- Fee LOGIC is governed by the PRICING_V2 flag at runtime; this migration just
-- aligns stored data so legacy reads and dashboards are consistent. Safe to
-- re-run. Zero em dashes.
-- =====================================================================

-- Flat platform fee on every organization.
update organizations set platform_fee_rate = 0.05 where coalesce(platform_fee_rate, 0) <> 0.05;

-- Everyone off paid tiers: non-client orgs become the free partner account.
update organizations set tier = 'free_partner'
 where tier in ('partner', 'premier');

-- Stop active subscription billing (no monthly tiers under V2). Keep the column
-- for history; mark non-client subscriptions as inactive/free.
update organizations
   set subscription_status = 'free'
 where coalesce(subscription_status, '') not in ('free', '')
   and tier <> 'client';

-- Note: included_seats already defaults to 1 at registration; extra seats are
-- billed at $10/mo via SEAT_PRICE_USD (set by the PRICING_V2 flag).
