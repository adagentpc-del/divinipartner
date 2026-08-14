-- ============================================================================
-- Divini Profit Map (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
-- slice 5). Generalizes the pre-spec, Vendor-only margin-tracking build
-- (quote_costs, still used for marketplace quotes) to every role that runs
-- Divini Proposal Studio: a true cost can now also be recorded against an
-- accepted proposal, not only a marketplace quote.
--
-- Deliberately a separate table from `proposals`, mirroring quote_costs, so
-- a client-facing proposal read path can never leak the org's private cost
-- data.
--
-- Additive only. Zero em dashes.
-- ============================================================================

create table if not exists proposal_costs (
  proposal_id uuid primary key references proposals(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  cost_amount numeric not null check (cost_amount >= 0),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_proposal_costs_org on proposal_costs(organization_id);
