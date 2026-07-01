-- ============================================================================
-- Friction Elimination - U1 Client Event Intelligence Assistant
--
-- Persists the generated event plans produced by the deterministic
-- generatePlan() engine (server/src/lib/eventAssistant.ts). One row per
-- generation; a plan may optionally be attached to an event so the workspace
-- becomes the system of record (no re-entering the intake).
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create table if not exists event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  intake jsonb,
  plan jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_event_plans_event on event_plans(event_id);
