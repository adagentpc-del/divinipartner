-- Public ticket purchase flow (live persona testing, 2026-08-17).
--
-- ticket_packages (db/schema-np-p1.sql) was CRUD-only: a nonprofit could
-- publish individual/VIP/table ticket packages for a fundraising event, but
-- there was no public path for anyone to actually buy one -- the only way
-- `sold` ever moved was a nonprofit manually typing a number into the admin
-- edit form. This mirrors sponsor_purchases (Workstream C), simplified: no
-- agreement-signing or fulfillment-task ladder, since a ticket purchase has
-- nothing to fulfill beyond the seats themselves. `sold` on ticket_packages
-- is recomputed from truth (count of this package's paid purchases *
-- quantity), the same self-healing pattern sponsor_purchases uses after the
-- Codex review on #45 (cancel-reversal + concurrent-double-count safety),
-- rather than an independently incremented counter.
--
-- APPLY: this is folded directly into db/apply-all.sql (the real deploy
-- target); kept here only for the per-feature migration history other
-- schema-*.sql files follow.
create table if not exists ticket_purchases (
  id uuid primary key default gen_random_uuid(),
  ticket_package_id uuid references ticket_packages(id) on delete cascade,
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  buyer_org_id uuid references organizations(id) on delete cascade,
  buyer_user_id uuid references users(id) on delete set null,
  quantity int not null default 1,
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled')),
  payment_id uuid,
  amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ticket_purchases_org on ticket_purchases(buyer_org_id);
create index if not exists idx_ticket_purchases_package on ticket_purchases(ticket_package_id);
