-- ============================================================================
-- Divini Partners - Phase 3 schema additions (Event Workspace, Bids, Quotes,
-- Messaging). ADDITIVE ONLY. Apply AFTER db/schema.sql:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase3.sql
--
-- These are the columns/tables Phase 3 code references that are not in the base
-- schema.sql. All guarded with IF NOT EXISTS so re-runs are safe.
-- ============================================================================

-- ---------- event_vendors (NEW) ----------
-- Associates a vendor/venue organization with an event (workspace participants).
create table if not exists event_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  role text,                 -- e.g. 'florist','caterer','venue'
  status text default 'added',
  created_at timestamptz default now(),
  unique (event_id, organization_id)
);
create index if not exists idx_event_vendors_event on event_vendors(event_id);
create index if not exists idx_event_vendors_org on event_vendors(organization_id);

-- ---------- bids: extra columns used by the bid board ----------
-- bid_type: public/private/preferred/premier/rush/venue/planner (blueprint 17).
alter table bids add column if not exists bid_type text;
-- posted_at: timestamp the bid became visible; tier-access windows count from here.
alter table bids add column if not exists posted_at timestamptz;

-- ---------- messages: thread reference + index ----------
-- thread_ref: optional id of the bid/quote/invoice the thread is about.
alter table messages add column if not exists thread_ref text;
create index if not exists idx_messages_thread on messages(event_id, thread_type, thread_ref);
