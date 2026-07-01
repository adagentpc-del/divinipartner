-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema
-- ----------------------------------------------------------------------------
-- F1 Event Memory Engine + F10 Post-Event Intelligence
-- (INTELLIGENCE-MOAT-ADDENDUM.md). Every completed event leaves behind a
-- structured memory snapshot, and every stakeholder leaves behind feedback,
-- so future events become faster, smarter, and more profitable.
--
--   event_memory   - one immutable-ish snapshot per event (unique event_id),
--                    assembled from the existing operational tables (events,
--                    event_vendors, quotes, invoices, payments, reviews,
--                    change_orders, installations, sponsorship_opportunities).
--                    The repo recordEventMemory() upserts this row.
--   event_feedback - post-event feedback rows, one per (event, role, author);
--                    role is venue/vendor/planner/sponsor/client/attendee and
--                    drivers is a jsonb bag of success/failure/revenue signals.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-event-memory.sql
--
-- Linking + authorization: both tables hang off an events row (event_id). The
-- authorization boundary is the event's access set, resolved in
-- server/src/db/event-memory.ts (reuses the events repo getEvent() IDOR gate).
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- event_memory (F1) - the durable snapshot of a completed event:
--   event_type        text    - copied from events.type at snapshot time
--   venue_id          uuid    - copied from events.venue_id
--   guest_count       int     - copied from events.guest_count
--   budget            numeric - copied from events.budget
--   vendors_used      jsonb   - array of the vendor stack (event_vendors)
--   sponsors_used     jsonb   - array of sponsorship opportunities at the venue
--   revenue           numeric - rolled up from invoices/payments
--   timeline          jsonb   - status + key dates
--   approvals         jsonb   - approval signals (from change_orders etc.)
--   change_orders     jsonb   - the change-order history
--   contracts         jsonb   - contract pricing / agreements touched
--   install_minutes   int     - install duration derived from installations
--   teardown_minutes  int     - teardown duration derived from installations
--   issues            jsonb   - issues observed (from feedback + change orders)
--   resolutions       jsonb   - how issues were resolved
--   reviews           jsonb   - the reviews left on the event
--   photos            jsonb   - completion photos (from installations)
--   outcome           text    - a short outcome summary (success / mixed / ...)
-- ---------------------------------------------------------------------------
create table if not exists event_memory (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references events(id) on delete cascade,
  event_type text,
  venue_id uuid,
  guest_count int,
  budget numeric,
  vendors_used jsonb,
  sponsors_used jsonb,
  revenue numeric,
  timeline jsonb,
  approvals jsonb,
  change_orders jsonb,
  contracts jsonb,
  install_minutes int,
  teardown_minutes int,
  issues jsonb,
  resolutions jsonb,
  reviews jsonb,
  photos jsonb,
  outcome text,
  created_at timestamptz default now()
);

create index if not exists idx_event_memory_event on event_memory(event_id);
create index if not exists idx_event_memory_type_venue on event_memory(event_type, venue_id);

-- ---------------------------------------------------------------------------
-- event_feedback (F10) - post-event feedback from any stakeholder:
--   role        text  - venue / vendor / planner / sponsor / client / attendee
--   rating      int   - 1..5 overall rating
--   comments    text  - free-text comments
--   drivers     jsonb - structured success/failure/revenue driver signals
-- ---------------------------------------------------------------------------
create table if not exists event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  role text,
  rating int,
  comments text,
  drivers jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_event_feedback_event on event_feedback(event_id);
