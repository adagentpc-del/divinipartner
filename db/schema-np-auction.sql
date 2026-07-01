-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT AUCTION MANAGEMENT schema (Phase 2)
-- ----------------------------------------------------------------------------
-- The Auction Management module of nonprofit fundraising. A nonprofit org
-- (organizations.type = 'nonprofit') runs a silent / live auction tied to a
-- fundraising event: donated items are catalogued, bids are recorded, a winner
-- is awarded, and the winning bidder is sent through checkout (NEVER auto-charged).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-np-p1.sql, or any other phase file. New tables only, every create
-- guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema-np-p1.sql (which creates fundraising_events) against the same
-- database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-auction.sql
--
-- Linking + authorization:
--   * organization_id is the authorization boundary (the owning nonprofit org),
--     exactly like fundraising_events / venue_twin. Every read/write is scoped
--     to the actor's org in server/src/db/auction.ts.
--   * fundraising_event_id optionally links an auction item to a fundraising_event
--     row (db/schema-np-p1.sql). It is nullable: a nonprofit can intake donated
--     items before the fundraising event record exists. There is no FK so this
--     file is independent of apply order edge cases; the repo validates the link
--     against the actor's org at write time.
--
-- Conventions match schema-np-p1.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); numeric for money; jsonb for nested fields; text + CHECK for
-- enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- auction_items - a single donated lot in a nonprofit's fundraising auction.
-- donor_name credits the donor; estimated_value anchors the opening / fair-market
-- figure; image_urls is a jsonb array of photo URLs; restrictions / expiration /
-- pickup_info carry the redemption fine print. When the auction closes, the
-- winning_* columns + winning_bid capture the result and status moves to
-- 'awarded'. payment_status tracks the checkout lifecycle for the won item
-- (unpaid -> pending once checkout is initiated -> paid once recorded).
-- ---------------------------------------------------------------------------
create table if not exists auction_items (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid,
  organization_id uuid references organizations(id) on delete cascade,
  donor_name text,
  item_name text,
  description text,
  estimated_value numeric default 0,
  image_urls jsonb default '[]'::jsonb,
  restrictions text,
  expiration_date timestamptz,
  pickup_info text,
  winning_bidder_name text,
  winning_bidder_org_id uuid,
  winning_bid numeric,
  payment_status text default 'unpaid' check (payment_status in ('unpaid','pending','paid')),
  status text default 'open' check (status in ('open','closed','awarded','cancelled')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- auction_bids - an individual bid recorded against an auction item. The current
-- high bid is computed as max(amount) over an item's bids (see the repo); no
-- materialized "winning" flag lives here, the award step copies the chosen bid
-- onto the item. bidder_org_id is optional (a bidder may be an unregistered
-- guest identified only by bidder_name).
-- ---------------------------------------------------------------------------
create table if not exists auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_item_id uuid references auction_items(id) on delete cascade,
  bidder_name text,
  bidder_org_id uuid,
  amount numeric,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_auction_items_org on auction_items(organization_id);
create index if not exists idx_auction_items_fevent on auction_items(fundraising_event_id);
create index if not exists idx_auction_bids_item on auction_bids(auction_item_id);
