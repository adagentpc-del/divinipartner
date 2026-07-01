-- ============================================================================
-- Intelligence Moat - F2 Event Playbook Engine
--
-- A playbook captures a whole event (venue setup, vendor stack, sponsor
-- package, guest experience, timeline, budget structure, approval workflow,
-- tasks, documents, communications, guest flows) as a reusable, org-owned
-- blueprint. clone-event rehydrates a playbook into a brand new event plus its
-- child rows (timeline / tasks / vendors).
--
-- This COMPLEMENTS the existing event_templates (Phase 7, /templates). Playbooks
-- store a richer jsonb payload than templates and drive the clone-event flow.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- Backed by server/src/db/playbooks.ts + server/src/routes/playbooks.ts.
-- ============================================================================

create table if not exists event_playbooks (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid references organizations(id) on delete set null,
  name text not null,
  template_type text,
  payload jsonb not null default '{}'::jsonb,
  created_from_event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_playbooks_org on event_playbooks(owner_org_id);
create index if not exists idx_event_playbooks_type on event_playbooks(template_type);
create index if not exists idx_event_playbooks_source on event_playbooks(created_from_event_id);
create index if not exists idx_event_playbooks_created on event_playbooks(created_at desc);
