-- Intelligence Moat addendum - F5 Relationship Intelligence Graph.
--
-- A single directed edge table linking any two entities (organizations, venues,
-- vendors, sponsors, planners, agencies, brands, clients, contacts). Edges are
-- derived deterministically from existing data (events + event_vendors,
-- preferred_vendors, sponsorship_opportunities, quotes/invoices) by
-- server/src/db/relationship.ts (rebuildEdges) and surfaced as an interactive
-- graph + insight strings.
--
-- Additive only. No existing tables are modified. The lead wires this file into
-- db/apply-all.sql.

create table if not exists relationship_edges (
  id uuid primary key default gen_random_uuid(),
  -- Owning org so the graph is org-scoped (IDOR-safe). Derived rows always set
  -- this to the org that the recompute ran for.
  organization_id uuid references organizations(id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,
  edge_type text not null check (edge_type in (
    'worked_together','referred_by','preferred','sponsor_history','past_projects',
    'partnership','revenue','introduction','collaboration')),
  weight int not null default 1,
  revenue numeric not null default 0,
  last_at timestamptz,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (from_type, from_id, to_type, to_id, edge_type)
);

create index if not exists idx_relationship_edges_from on relationship_edges (from_type, from_id);
create index if not exists idx_relationship_edges_to on relationship_edges (to_type, to_id);
create index if not exists idx_relationship_edges_org on relationship_edges (organization_id);
