-- ============================================================================
-- Divini Partners - Organization memberships (multi-org support).
--
-- A user may belong to more than one organization (e.g. one person running
-- both a venue and a planning company, or a sponsor agency managing several
-- brand accounts). `users.organization_id` remains the user's ACTIVE org for
-- the current session -- every existing query that joins through it keeps
-- working unmodified. This table is the membership ledger: which orgs a user
-- can switch into, plus their role within each one.
--
-- Additive only. Backfilled from the existing single-org rows so today's
-- users show up as a member of their current org with no behavior change.
-- Zero em dashes.
-- ============================================================================

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text,
  is_default boolean not null default false,
  created_at timestamptz default now(),
  unique (user_id, organization_id)
);
create index if not exists idx_org_memberships_user on organization_memberships(user_id);
create index if not exists idx_org_memberships_org on organization_memberships(organization_id);

-- Backfill: every user currently pointing at an org becomes a member of it.
insert into organization_memberships (user_id, organization_id, role, is_default)
select id, organization_id, role, true
from users
where organization_id is not null
on conflict (user_id, organization_id) do nothing;
