-- ============================================================================
-- Account Agreements v2 - pricing stack, contracting entity, assigned vendor,
-- and execution (auto-sign). Additive ALTERs only; safe to run repeatedly.
--
-- Pricing stack (computed, not stored): Client Total =
--   partner_price + (partner_price * commission_rate%)  [commission_rate = Divini Margin %]
--   + kickback (percent of partner_price, or flat dollars)
-- ============================================================================

alter table account_agreements add column if not exists contracting_entity text default 'Divini Partners';
alter table account_agreements add column if not exists partner_price_cents bigint;
alter table account_agreements add column if not exists kickback_type text;        -- percent | flat
alter table account_agreements add column if not exists kickback_value numeric(12,3);
alter table account_agreements add column if not exists assigned_vendor_profile_id uuid;
alter table account_agreements add column if not exists assigned_vendor_name text;
alter table account_agreements add column if not exists assigned_vendor_status text default 'unassigned'; -- unassigned | assigned | removed
alter table account_agreements add column if not exists assigned_vendor_removed_reason text;
alter table account_agreements add column if not exists signed_status text default 'unsigned'; -- unsigned | signed
alter table account_agreements add column if not exists signed_at timestamptz;
alter table account_agreements add column if not exists signed_by text;
