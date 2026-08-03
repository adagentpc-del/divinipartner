-- ============================================================================
-- Divini Pipeline (shared CRM engine, see docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md
-- section 6 "Divini Pipeline", build-order slice 1). Deterministic, no LLM
-- dependency. One shared engine for all 7 roles, not duplicated per profile.
--
-- Additive only. Zero em dashes.
-- ============================================================================

-- ---------- crm_pipeline_stages ----------
-- Org-scoped, ordered. Seeded from a default 15-stage template on first use
-- (see db/pipeline.ts's ensureDefaultStages); orgs may add/rename/reorder
-- beyond the defaults (Divini Pipeline is available on every plan per the
-- spec's Free tier -- "basic Pipeline").
create table if not exists crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null default 0,
  is_closed_won boolean not null default false,
  is_closed_lost boolean not null default false,
  created_at timestamptz default now(),
  unique (organization_id, key)
);
create index if not exists idx_crm_stages_org on crm_pipeline_stages(organization_id, sort_order);

-- ---------- crm_opportunities ----------
create table if not exists crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  stage_id uuid not null references crm_pipeline_stages(id) on delete restrict,
  event_id uuid references events(id) on delete set null,
  name text not null,
  category text,
  source text,
  client_name text,
  client_email text,
  client_phone text,
  decision_maker_name text,
  estimated_value_cents bigint,
  event_date date,
  expected_close_at date,
  next_action_note text,
  next_action_at timestamptz,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  loss_reason text,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_crm_opps_org on crm_opportunities(organization_id, status);
create index if not exists idx_crm_opps_stage on crm_opportunities(stage_id);
create index if not exists idx_crm_opps_event on crm_opportunities(event_id) where event_id is not null;

-- ---------- crm_opportunity_stage_history ----------
-- Append-only. Never overwritten (spec constraint 9: preserve revision
-- history). The current stage still lives on crm_opportunities.stage_id for
-- fast reads; this table is the audit trail of every movement.
create table if not exists crm_opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references crm_opportunities(id) on delete cascade,
  from_stage_id uuid references crm_pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references crm_pipeline_stages(id) on delete restrict,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz default now()
);
create index if not exists idx_crm_stage_history_opp on crm_opportunity_stage_history(opportunity_id, changed_at);

-- ---------- crm_activities ----------
-- Notes/calls/emails/tasks/system events logged against an opportunity.
create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references crm_opportunities(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  activity_type text not null default 'note' check (activity_type in ('note', 'call', 'email', 'task', 'stage_change', 'system')),
  body text,
  created_at timestamptz default now()
);
create index if not exists idx_crm_activities_opp on crm_activities(opportunity_id, created_at);
