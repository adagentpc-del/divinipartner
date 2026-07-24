-- ============================================================================
-- Partner auto-send: contact email + per-account-type commission targeting.
--
-- Two additive columns on partners so a super-admin can (a) reach a referral
-- partner by email to auto-send the contract + bank-wire onboarding link, and
-- (b) scope the commission to specific referred account types.
--
-- applies_account_types: null or empty array means "all account types". When
-- populated it is the set of organizations.type values (client, vendor, venue,
-- sponsor, nonprofit, planner, supplier, installer, exhibitor) the partner earns
-- commission on. Enforced best-effort in recordCommission.
--
-- Additive only. Safe to run repeatedly.
-- ============================================================================

alter table partners add column if not exists contact_email text;
alter table partners add column if not exists applies_account_types text[];
