-- ============================================================================
-- Divini Follow-Up Desk (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
-- slice 4). Prevents leads and proposals from being forgotten. Deterministic
-- rule-based tasks derived from real Pipeline (crm_opportunities) and
-- Proposal Studio (proposals) data, plus manual tasks a user adds directly.
-- No LLM, no generated urgency -- every task traces to a real stale field or
-- a real deadline.
--
-- Additive only. Zero em dashes.
-- ============================================================================

create table if not exists follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references crm_opportunities(id) on delete cascade,
  proposal_id uuid references proposals(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'system')),
  rule_key text check (rule_key in (
    'opportunity_next_action_overdue', 'opportunity_stale',
    'proposal_unresponded', 'proposal_expiring'
  )),
  title text not null,
  note text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'snoozed', 'dismissed')),
  snoozed_until timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);
create index if not exists idx_followup_org on follow_up_tasks(organization_id, status);
create index if not exists idx_followup_due on follow_up_tasks(organization_id, due_at) where status in ('open', 'snoozed');

-- One open system task per rule per opportunity/proposal at a time (a
-- resolved/dismissed row does not block a fresh one if the condition
-- reappears later).
create unique index if not exists uq_followup_system_opp
  on follow_up_tasks(organization_id, opportunity_id, rule_key)
  where source = 'system' and opportunity_id is not null and status = 'open';
create unique index if not exists uq_followup_system_proposal
  on follow_up_tasks(organization_id, proposal_id, rule_key)
  where source = 'system' and proposal_id is not null and status = 'open';
