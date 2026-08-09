-- Event Settlement (live-ops phase, Part 28-31, 2026-08-09).
--
-- The one durable record of "this event's finances were reconciled and
-- signed off" -- a terminal, point-in-time attestation, not a re-runnable
-- computation (computeEventReconciliation in db/reconciliation.ts IS the
-- re-runnable, always-fresh computation; this table is the snapshot taken
-- the moment someone actually settled the books, since invoices/payments
-- can keep changing after that point and the settlement record should not
-- silently drift with them). One settlement per event -- re-settling is
-- not supported in this phase; a correction after the fact is a manual
-- admin matter, matching the append-only-ledger philosophy the rest of
-- this codebase's money-adjacent tables already follow.
create table if not exists event_settlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade unique,
  settled_by uuid references users(id),
  invoiced_total numeric not null default 0,
  paid_total numeric not null default 0,
  outstanding_total numeric not null default 0,
  platform_fees_total numeric not null default 0,
  processing_fees_total numeric not null default 0,
  net_payable_total numeric not null default 0,
  state text not null,
  overrode_blocking boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_settlements_event on event_settlements(event_id);
