-- =============================================================================
-- Divini AI COO (V2) - Automated Executive Tasks
--
-- Additive schema for the AI COO layer. coo_tasks holds generated, ranked-by-
-- impact executive tasks produced by the cooTasks engine from the per-user COO
-- briefing (today's priorities, revenue opportunities, risks, approvals,
-- follow-ups, expiring contracts, sponsorship + partnership opportunities). The
-- briefing + dashboard themselves are computed live from the existing engines;
-- only the generated tasks (with their open|done|dismissed disposition) persist
-- here so an executive can work the list across sessions.
--
-- Audience-scoped exactly like the opportunities table: a row may target an org
-- (audience_org_id) and/or a single user (audience_user_id). The db layer filters
-- the feed to the acting org/user so a forged request cannot read another
-- tenant's tasks (IDOR-safe). create-if-not-exists so re-applying is safe.
-- =============================================================================

create table if not exists coo_tasks (
  id uuid primary key default gen_random_uuid(),
  audience_org_id uuid references organizations(id) on delete cascade,
  audience_user_id uuid references users(id) on delete cascade,
  title text not null,
  action_type text,
  detail jsonb,
  impact_score int default 0,
  status text check (status in ('open', 'done', 'dismissed')) default 'open',
  due_at timestamptz,
  source text,
  created_at timestamptz default now()
);

-- Feed lookups are by audience (org / user) filtered to open, ranked by impact.
create index if not exists idx_coo_tasks_org on coo_tasks(audience_org_id);
create index if not exists idx_coo_tasks_user on coo_tasks(audience_user_id);
create index if not exists idx_coo_tasks_status on coo_tasks(status);
create index if not exists idx_coo_tasks_impact on coo_tasks(impact_score desc);
