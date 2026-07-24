-- ============================================================================
-- Divini Partners - Relationship Hub schema (WS-1: auto historical records)
-- ----------------------------------------------------------------------------
-- Additive only. Every statement guarded so re-running is safe. Apply AFTER
-- db/schema.sql, db/schema-phase7.sql (event_history), and the nonprofit
-- fundraising schema. Appended verbatim into db/apply-all.sql.
--
-- WS-1 goal: every completed event (regular or charity) becomes a durable
-- historical record that captures the vendors AND the sponsors who participated.
-- Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- --- event_history: capture sponsor participation, not just vendors ----------
-- event_history already stores vendor_org_ids uuid[]; add the sponsor side so a
-- charity gala's record shows which sponsor orgs backed it and for how much.
alter table event_history add column if not exists sponsor_org_ids uuid[] default '{}';
alter table event_history add column if not exists sponsor_total numeric default 0;

-- --- fundraising_events: an enforced completion timestamp --------------------
-- fundraising_events.status is free text; add a terminal marker so the recap
-- can be persisted exactly once when the nonprofit closes the event out.
alter table fundraising_events add column if not exists completed_at timestamptz;

-- --- fundraising_recaps: persist the board-ready recap on completion ---------
-- The recap was recomputed live on every request. Persist a snapshot when the
-- event completes so the number the board saw is durable. One row per event.
-- No FK on fundraising_event_id (matches the cross-workstream pattern used by
-- sponsor_purchases: the nonprofit tables may apply in a different order).
create table if not exists fundraising_recaps (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid unique,
  organization_id uuid references organizations(id) on delete cascade,
  event_id uuid,                       -- linked core events row, when present
  goal_amount numeric default 0,
  raised_total numeric default 0,
  net_raised numeric default 0,
  sponsorship_revenue numeric default 0,
  donations_total numeric default 0,
  donors_count int default 0,
  guest_count int default 0,
  sponsors_used jsonb default '[]',    -- [{sponsor_org_id,name,tier,amount,status}]
  vendors_used jsonb default '[]',     -- [{organization_id,vendor_id,role,status,name}]
  board_report_text text,
  sponsor_recap_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_fundraising_recaps_org on fundraising_recaps(organization_id);

-- --- WS-2 preferred_partners: save preferred vendors AND sponsors (org-scoped) --
-- A general saved-counterparty store next to the venue-only preferred_vendors and
-- the vendor-only starred_vendors. owner_org_id saves partner_org_id of any kind.
create table if not exists preferred_partners (
  id uuid primary key default gen_random_uuid(),
  owner_org_id   uuid references organizations(id) on delete cascade,
  partner_org_id uuid references organizations(id) on delete cascade,
  partner_kind text not null
    check (partner_kind in ('vendor','sponsor','nonprofit','venue','planner','supplier','installer','client')),
  tier text check (tier in ('preferred','approved','exclusive','recommended','vip')),
  label text,
  note text,
  last_event_id uuid,
  last_worked_at timestamptz,
  times_worked int default 0,
  saved_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_org_id, partner_org_id, partner_kind)
);
create index if not exists idx_pref_partners_owner on preferred_partners(owner_org_id);
create index if not exists idx_pref_partners_kind on preferred_partners(owner_org_id, partner_kind);

-- --- WS-3 relationship campaigns: annual rebooking outreach to saved partners --
-- An org drafts one message to a saved-partner segment or a past event's roster,
-- sends a test, then approves the send. Recipients resolve to real partner orgs
-- (accounts), deduped and suppression-filtered. Reuses the email transport.
create table if not exists relationship_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid references organizations(id) on delete cascade,
  name text not null,
  audience jsonb not null default '{}',
  subject text,
  body_html text,
  cta_kind text check (cta_kind in ('clone_playbook','open_rfp','sponsorship_packages','create_event','custom')),
  cta_ref uuid,
  cta_url text,
  status text not null default 'draft'
    check (status in ('draft','test_sent','approved','sending','sent','cancelled')),
  recipient_count int default 0,
  sent_count int default 0,
  test_sent_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_relcampaigns_owner on relationship_campaigns(owner_org_id);

create table if not exists relationship_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references relationship_campaigns(id) on delete cascade,
  partner_org_id uuid,
  email text not null,
  name text,
  status text not null default 'pending'
    check (status in ('pending','sent','failed','suppressed')),
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_relcamp_recipients_campaign on relationship_campaign_recipients(campaign_id);
