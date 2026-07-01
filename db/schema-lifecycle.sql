-- ============================================================================
-- Divini Partners by Divini Group - LIFECYCLE self-maintenance schema additions
-- ----------------------------------------------------------------------------
-- Closes two lifecycle gaps:
--   (1) Deals (quotes, sponsor_purchases) did not stamp a close timestamp when
--       their terminal event fired (quote accepted, sponsor purchase paid). We
--       add closed_at so the won/closed moment is recorded and auto-close is
--       idempotent (a non-null closed_at means already closed; re-firing the
--       terminal event will not re-stamp or reopen).
--   (2) The relationship graph (relationship_edges) was only ever rebuilt
--       wholesale via rebuildEdges(actor). It is now incrementally refreshed on
--       deal close by server/src/db/lifecycle.ts using the EXISTING
--       relationship_edges table + its unique constraint. No new graph table is
--       needed here.
--
-- These statements are ADDITIVE and idempotent: only `add column if not exists`
-- and `create index if not exists`. They do not alter existing data, never drop,
-- and are safe to run repeatedly. Apply AFTER db/schema.sql (quotes table) and
-- db/schema-np-sponsor.sql (sponsor_purchases table) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-lifecycle.sql
--
-- Conventions match schema.sql: timestamptz close stamps; idempotent guards.
-- Zero em dashes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- quotes: closed_at - stamped when a quote reaches a won/closed terminal state
-- (accepted / converted). NULL while the quote is still in flight. The "won"
-- stage is the existing 'accepted' status (the quote table's CHECK already
-- allows it); we do not widen the enum, we only record WHEN it closed.
-- ---------------------------------------------------------------------------
alter table quotes add column if not exists closed_at timestamptz;

-- ---------------------------------------------------------------------------
-- sponsor_purchases: closed_at - stamped when the purchase reaches a closed
-- terminal state (paid / fulfilled). NULL while interested / agreed / cancelled.
-- ---------------------------------------------------------------------------
alter table sponsor_purchases add column if not exists closed_at timestamptz;

-- ---------------------------------------------------------------------------
-- INDEXES (closed-deal lookups + analytics over the close timestamp)
-- ---------------------------------------------------------------------------
create index if not exists idx_quotes_closed_at on quotes(closed_at);
create index if not exists idx_sponsor_purchases_closed_at on sponsor_purchases(closed_at);
