-- Friction Elimination: link an event to the branding opportunity it was started
-- from (the "Brand event here" CTA). Additive, idempotent. branding_opportunities
-- is created earlier in apply-all (schema-venue-intelligence.sql); we keep this a
-- plain uuid column (soft reference) so apply order can never break the migration.
alter table events add column if not exists branding_opportunity_id uuid;
create index if not exists idx_events_branding_opportunity on events(branding_opportunity_id);
