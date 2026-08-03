-- ============================================================================
-- Divini Proposal Studio (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
-- slice 3). Converts a Divini Pipeline opportunity (optionally informed by a
-- Divini Scope Builder instance) into a clear, professional, client-facing
-- proposal: line items, deterministic totals, a public share link, and
-- accept/decline tracking. No LLM, no generated pricing -- every number is
-- entered by the user or arithmetic on numbers the user entered.
--
-- Additive only. Zero em dashes.
-- ============================================================================

-- ---------- proposals ----------
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references crm_opportunities(id) on delete set null,
  scope_instance_id uuid references scope_instances(id) on delete set null,
  title text not null,
  client_name text,
  client_email text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  currency text not null default 'USD',
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  valid_until date,
  notes text,
  decline_reason text,
  share_token text unique,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_proposals_org on proposals(organization_id, status);
create index if not exists idx_proposals_opp on proposals(opportunity_id) where opportunity_id is not null;

-- ---------- proposal_line_items ----------
create table if not exists proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1 check (quantity >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  sort_order int not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_proposal_items_proposal on proposal_line_items(proposal_id, sort_order);

-- ---------- proposal_versions ----------
-- Append-only snapshot on every save and on every status transition (spec
-- constraint 9: preserve revision history, never overwrite it).
create table if not exists proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  version_number int not null,
  snapshot_json jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique (proposal_id, version_number)
);
create index if not exists idx_proposal_versions_proposal on proposal_versions(proposal_id, version_number);
