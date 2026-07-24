-- ============================================================================
-- Divini Partners - Shareable Bid Links (offline to platform on-ramp)
-- ----------------------------------------------------------------------------
-- Additive only, all guarded. A bid (on a regular OR charity event) can mint one
-- or more unique public share links. An organizer hands the link to a vendor or
-- sponsor they met in person; the recipient opens a public bid page, registers,
-- creates their page, and submits. Every step is tracked. Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- One shareable link for a bid. A bid may have several (e.g. one for sponsors,
-- one for vendors). token is the public slug carried in the URL.
create table if not exists bid_share_links (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references bids(id) on delete cascade,
  event_id uuid,                       -- denormalized for the public read
  token text unique not null,
  label text,                          -- "Sponsors from the gala mixer"
  audience text not null default 'any'
    check (audience in ('vendor','sponsor','any')),
  created_by_org uuid references organizations(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  is_active boolean not null default true,
  view_count int not null default 0,
  register_count int not null default 0,
  submit_count int not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_bid_share_links_bid on bid_share_links(bid_id);
create index if not exists idx_bid_share_links_event on bid_share_links(event_id);

-- The funnel log: view -> register_start -> registered -> submitted. This is the
-- "tracks everything" record so an organizer can see exactly who a link brought in.
create table if not exists bid_share_events (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid references bid_share_links(id) on delete cascade,
  kind text not null
    check (kind in ('view','register_start','registered','submitted')),
  actor_email text,
  org_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_bid_share_events_link on bid_share_events(share_link_id);

-- Public "express interest" leads. A sponsor or vendor can raise a hand on the
-- shared bid page without creating an account yet. The organizer follows up.
create table if not exists bid_share_leads (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid references bid_share_links(id) on delete cascade,
  bid_id uuid,
  event_id uuid,
  party text not null default 'any' check (party in ('vendor','sponsor','any')),
  name text,
  email text,
  phone text,
  message text,
  amount numeric,
  created_at timestamptz default now()
);
create index if not exists idx_bid_share_leads_bid on bid_share_leads(bid_id);
