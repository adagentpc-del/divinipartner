-- ============================================================================
-- Divini Scope Builder (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md section 9,
-- build-order slice 2). A generic, reusable structured-requirements engine
-- (spec constraint 10: one shared engine, not duplicated per profile) --
-- field TYPE and definition live in scope_template_fields, not as hardcoded
-- columns per role, so Venue/Rental/Workforce/Vendor/Planner/Sponsor/Client
-- templates are all just data.
--
-- Additive only. Zero em dashes.
-- ============================================================================

-- ---------- scope_templates ----------
-- organization_id null = a platform default template (seeded per role);
-- an org may clone/customize into its own row (Plus+ per spec section 18:
-- Free gets "basic Scope Builder", Plus gets "custom scope templates").
create table if not exists scope_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  role text not null,
  category text,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_scope_templates_org on scope_templates(organization_id);
create index if not exists idx_scope_templates_role on scope_templates(role) where organization_id is null;

-- ---------- scope_template_fields ----------
create table if not exists scope_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references scope_templates(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (template_id, key)
);
create index if not exists idx_scope_fields_template on scope_template_fields(template_id, sort_order);

-- ---------- scope_instances ----------
-- A filled-out scope for one real job/opportunity. Optionally linked to a
-- Divini Pipeline opportunity (the natural handoff: Pipeline -> Scope Builder
-- -> [future] Proposal Studio).
create table if not exists scope_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references scope_templates(id) on delete restrict,
  opportunity_id uuid references crm_opportunities(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);
create index if not exists idx_scope_instances_org on scope_instances(organization_id, status);
create index if not exists idx_scope_instances_opp on scope_instances(opportunity_id) where opportunity_id is not null;

-- ---------- scope_responses ----------
-- One row per answered field. Only the column matching the field's type is
-- populated; the others stay null. value_json covers multiselect.
create table if not exists scope_responses (
  id uuid primary key default gen_random_uuid(),
  scope_instance_id uuid not null references scope_instances(id) on delete cascade,
  field_id uuid not null references scope_template_fields(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_bool boolean,
  value_date date,
  value_json jsonb,
  updated_at timestamptz default now(),
  unique (scope_instance_id, field_id)
);
create index if not exists idx_scope_responses_instance on scope_responses(scope_instance_id);

-- ---------- scope_versions ----------
-- Append-only snapshot on every save (spec constraint 9: preserve revision
-- history, never overwrite it).
create table if not exists scope_versions (
  id uuid primary key default gen_random_uuid(),
  scope_instance_id uuid not null references scope_instances(id) on delete cascade,
  version_number int not null,
  snapshot_json jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique (scope_instance_id, version_number)
);
create index if not exists idx_scope_versions_instance on scope_versions(scope_instance_id, version_number);
