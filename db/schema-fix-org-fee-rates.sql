-- ---------------------------------------------------------------------------
-- Fix: registerOrganization() and addOrganization() (server/src/db.ts) both
-- stamped organizations.platform_fee_rate from the flat TIERS table
-- (TIERS[tier].feeRate) instead of the role-aware lib/planCatalog.ts lookup
-- (planTierFor(role, tier)?.platformFeeRate ?? 0) that applySubscriptionUpdate
-- already used correctly. For client/installer/sponsor -- every tier of
-- which has platformFeeRate: null (0) in the catalog, because those roles
-- pay (client) or are hired for labor (installer) or pay a flat subscription
-- for matching (sponsor) rather than having a marketplace-transaction cut
-- taken -- any org that landed on the free_partner/partner/premier tier
-- fallback got the generic 5%/2.5%/1% rate baked in at row-creation time
-- instead of 0%. Found live-tracing the same bug class already fixed for the
-- subscription-cancellation path in Section 05 (T25); this backfill covers
-- rows created before the code fix (ALFY2 pack Section 12, 2026-08-09).
--
-- Safe to run multiple times (idempotent: only rows still wrong are touched).
-- venue/vendor/supplier/planner are untouched -- their catalog rates already
-- match the flat TIERS values exactly, so this never changes their fee.
-- ---------------------------------------------------------------------------
update organizations
   set platform_fee_rate = 0, updated_at = now()
 where type in ('client', 'installer', 'sponsor')
   and platform_fee_rate is distinct from 0;
