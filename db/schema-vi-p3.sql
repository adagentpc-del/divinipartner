-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 3)
-- ----------------------------------------------------------------------------
-- Automated Quote Readiness + Draft Quote + Fastest Path To Quote (Phase 3 of the
-- Venue Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 7 + "Engines" quoteAutomation/draftQuote/pricingEngine).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, db/schema-vi-p2.sql, or any earlier phase
-- file. New tables only, every create guarded with `if not exists` so re-running
-- is safe. Apply AFTER db/schema.sql, db/schema-venue-intelligence.sql, and
-- db/schema-vi-p2.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p3.sql
--
-- Linking: a quote draft is anchored to an event (events.id) and the venue
-- intelligence it was prefilled from (venue_twin via venue_id, a
-- branding_opportunities row, an optional vendor + that vendor's
-- vendor_quote_requirements row). prefilled jsonb captures the auto-populated
-- venue intelligence snapshot (measurements / restrictions / access / power /
-- permit) so the draft is reproducible without re-reading the twin. timeline
-- jsonb is the assembled install/removal schedule. computed_price is the result
-- of pricingEngine over the vendor's pricing rules.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money; text +
-- CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- quote_drafts (addendum data model 7) - a draft quote auto-assembled from the
-- venue twin + a branding opportunity + a vendor's requirements/pricing. The
-- vendor reviews and edits the prefilled scope/notes/price, approves it, and it
-- is then delivered to the client. status walks the lifecycle:
--   draft -> vendor_review -> vendor_approved -> client_delivered (or declined).
-- ---------------------------------------------------------------------------
create table if not exists quote_drafts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  venue_id uuid references venues(id) on delete set null,
  branding_opportunity_id uuid references branding_opportunities(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  requirement_id uuid references vendor_quote_requirements(id) on delete set null,
  prefilled jsonb,
  scope_of_work text,
  install_notes text,
  removal_notes text,
  compliance_notes text,
  timeline jsonb,
  computed_price numeric,
  status text not null default 'draft'
    check (status in ('draft','vendor_review','vendor_approved','client_delivered','declined')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_quote_drafts_event on quote_drafts(event_id);
create index if not exists idx_quote_drafts_venue on quote_drafts(venue_id);
create index if not exists idx_quote_drafts_opp on quote_drafts(branding_opportunity_id);
create index if not exists idx_quote_drafts_vendor on quote_drafts(vendor_id);
create index if not exists idx_quote_drafts_requirement on quote_drafts(requirement_id);
create index if not exists idx_quote_drafts_status on quote_drafts(status);
create index if not exists idx_quote_drafts_created_by on quote_drafts(created_by);
