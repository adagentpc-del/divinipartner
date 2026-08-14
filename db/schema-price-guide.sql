-- ============================================================================
-- Divini Price Guide (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
-- slice 6). Calculates a profitable pricing range from a real entered cost
-- and a target margin -- pure arithmetic, never a generated number. More
-- useful once Divini Profit Map (slice 5) has real cost/margin history to
-- show as context alongside the calculation.
--
-- Additive only. Zero em dashes.
-- ============================================================================

create table if not exists price_guide_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text,
  typical_cost numeric not null check (typical_cost >= 0),
  target_margin_pct numeric not null check (target_margin_pct >= 0 and target_margin_pct < 1),
  floor_margin_pct numeric check (floor_margin_pct >= 0 and floor_margin_pct < 1),
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_price_guide_items_org on price_guide_items(organization_id);
