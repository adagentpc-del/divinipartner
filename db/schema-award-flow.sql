-- Divini Partners front-half completion: Award / Contract / Quote Versioning /
-- Bid Q&A (2026-08-10).
--
-- Closes the procurement -> live-ops integration gap found in the front-half
-- architecture audit: previously, "award" was a dead enum value never set
-- anywhere, quote acceptance had zero downstream effects, and a losing
-- bidder's event_vendors row (self-attached at quote SUBMISSION time,
-- db/quotes.ts::createQuote) stayed at status='added' forever -- which meant
-- a losing vendor retained live "vendor_owner" event access indefinitely
-- (db/eventMembers.ts::getEventRole's legacy fallback) and polluted the
-- closeout vendor-completion roster (db/closeout.ts::listVendorCompletions)
-- for an event they never won. db/awards.ts::awardQuote() now sets
-- event_vendors.status = 'declined' for every losing bidder on the same bid,
-- and both of those read sites now filter it out.
--
-- Zero em dashes.

-- ---------- quote_versions: append-only snapshot taken BEFORE every revise ----------
-- Quotes themselves stay mutable (reviseQuote() still updates the row in
-- place, since every existing reader expects the current quote state at
-- `quotes.id`) but the commercial terms that existed right before a revision
-- overwrote them are now preserved here, mirroring change_order_status_history's
-- append-only discipline (db/schema-change-desk.sql).
create table if not exists quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  line_items jsonb,
  subtotal numeric,
  platform_fee numeric,
  total numeric,
  status text,
  revised_by uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_versions_quote on quote_versions(quote_id, created_at);

-- ---------- bid_questions: pre-bid clarification / addenda ----------
-- visibility: 'private' (only the asking vendor + organizer see it) or
-- 'public' (an addendum -- every invited/responded vendor on the bid sees
-- it). An organizer answering a private question can promote it to public
-- when issuing an addendum; the row itself is never duplicated, just its
-- visibility flips.
create table if not exists bid_questions (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references bids(id) on delete cascade,
  asked_by_org_id uuid references organizations(id) on delete set null,
  question text not null,
  answer text,
  answered_by uuid references users(id),
  answered_at timestamptz,
  visibility text not null default 'private' check (visibility in ('private','public')),
  is_addendum boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_bid_questions_bid on bid_questions(bid_id, created_at);

-- ---------- event_vendor_contracts: the real award -> contract record ----------
-- Distinct from the pre-existing `contracts` table (server/src/routes/contracts.ts),
-- which is an unrelated B2B "Contract Pricing Partnerships" rate-agreement
-- feature with zero relationship to quotes or events. This table is the one
-- an awarded quote actually produces: it references the winning quote id
-- (and the quote_versions row current at award time, if any exist yet) and
-- the awarded amount, so it can never silently drift from what was actually
-- accepted.
create table if not exists event_vendor_contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  bid_id uuid references bids(id) on delete set null,
  quote_id uuid not null references quotes(id) on delete restrict,
  vendor_org_id uuid not null references organizations(id) on delete restrict,
  awarded_amount numeric not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  awarded_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (quote_id)
);
create index if not exists idx_event_vendor_contracts_event on event_vendor_contracts(event_id);
create index if not exists idx_event_vendor_contracts_vendor on event_vendor_contracts(vendor_org_id);

-- ---------- contract_payment_milestones: the commercial payment schedule ----------
-- Data model only (Phase 31 of the spec is explicit: no live money movement
-- beyond the existing Stripe/payments gates). due_pct rows must sum to 100
-- per contract; enforced in application code (db/awards.ts), not a DB
-- constraint, since partial/interim schedules are edited incrementally.
create table if not exists contract_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references event_vendor_contracts(id) on delete cascade,
  label text not null,
  due_pct numeric not null,
  due_amount numeric not null,
  due_date timestamptz,
  status text not null default 'pending' check (status in ('pending','invoiced','paid')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_contract_milestones_contract on contract_payment_milestones(contract_id);
