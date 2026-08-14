-- ============================================================================
-- Divini Partners by Divini Group - missing organization_id tenant indexes
-- ----------------------------------------------------------------------------
-- Found during the ALFY2 pack Section 06 (database integrity) audit: with no
-- Postgres row-level security (see docs/platform-standard/section-05-
-- authorization.md), every multi-tenant read/write is an application-layer
-- `where organization_id = $1` query. These 12 tables had an
-- organization_id column with no index on it at all -- fine at today's row
-- counts, but each becomes a full table scan as data grows, and (for
-- payments/platform_credits) sits on a money-adjacent read path.
--
-- Idempotent: only `create index if not exists`. Safe to run repeatedly, no
-- data touched, no lock beyond the brief one CREATE INDEX (non-concurrent)
-- takes on these currently-small tables.
-- Zero em dashes.
-- ============================================================================

create index if not exists idx_crm_activities_org on crm_activities(organization_id);
create index if not exists idx_feedback_items_org on feedback_items(organization_id);
create index if not exists idx_floorplans_org on floorplans(organization_id);
create index if not exists idx_introductions_org on introductions(organization_id);
create index if not exists idx_itinerary_items_org on itinerary_items(organization_id);
create index if not exists idx_nba_dismissals_org on nba_dismissals(organization_id);
create index if not exists idx_partners_org on partners(organization_id);
create index if not exists idx_payments_org on payments(organization_id);
create index if not exists idx_platform_credits_org on platform_credits(organization_id);
create index if not exists idx_seating_charts_org on seating_charts(organization_id);
create index if not exists idx_tasks_org on tasks(organization_id);
create index if not exists idx_visitor_signals_org on visitor_signals(organization_id);

-- Same gap, user_id flavor: found alongside the organization_id scan above.
create index if not exists idx_partners_user on partners(user_id);
create index if not exists idx_visitor_signals_user on visitor_signals(user_id);
