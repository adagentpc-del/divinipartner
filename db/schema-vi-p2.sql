-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 2)
-- ----------------------------------------------------------------------------
-- Vendor Quote Requirement Builder + Vendor Pricing Logic (Phase 2 of the Venue
-- Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 5-6). Phase 3 (quoteAutomation + draftQuote) consumes
-- vendor_quote_requirements.schema and vendor_pricing_rules.rules.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, or any earlier phase file. New tables only,
-- every create guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql (and the earlier phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p2.sql
--
-- Linking: both tables hang off an existing `vendors` row (vendor_id). The
-- authorization boundary is the vendor's owning organization (vendors.organization_id),
-- resolved in server/src/db/vendor-requirements.ts exactly like the venue-twin repo
-- resolves a venue's owning org.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/ordered structures.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- vendor_quote_requirements (addendum data model 5) - the custom intake form a
-- vendor needs filled in before they can quote a service category. The `schema`
-- jsonb is an ORDERED list of field definitions (see the precise shape below);
-- Phase 3 renders/prefills against it. A row can also be saved as a reusable
-- template (is_template = true, template_name set) so a vendor can clone a known
-- requirement set into a new service category.
--
-- schema jsonb shape (ordered array; field order = display order):
--   [
--     {
--       "key":         "string (stable identifier, unique within the schema)",
--       "label":       "string (human label)",
--       "type":        "text" | "number" | "dropdown" | "checkbox" | "date" | "formula",
--       "required":    boolean,
--       "options":     ["string", ...]   // dropdown only; [] otherwise
--       "conditional": { "field": "otherKey", "op": "eq|ne|gt|lt|gte|lte|in|truthy", "value": <any> } | null,
--       "formula":     "string expression referencing other keys" | null  // type=formula only
--     },
--     ...
--   ]
-- ---------------------------------------------------------------------------
create table if not exists vendor_quote_requirements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  service_category text,
  schema jsonb,
  is_template boolean default false,
  template_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- vendor_pricing_rules (addendum data model 6) - an ORDERED list of conditional
-- pricing steps plus a base, evaluated by Phase 3's pricingEngine (no eval; a
-- structured rule interpreter). base_unit names what the base price is per
-- (e.g. "per_event", "per_sqft", "per_day").
--
-- rules jsonb shape:
--   {
--     "base":  number,                 // starting price (in base_unit)
--     "steps": [                        // ordered; applied top to bottom
--       {
--         "if":   { "field": "fieldKey", "op": "eq|ne|gt|lt|gte|lte|in|truthy", "value": <any> },
--         "then": { "action": "set" | "add", "amount": number } |
--                 { "action": "set" | "add", "perUnitField": "fieldKey", "amount": number }
--       },
--       ...
--     ]
--   }
-- "amount" with no perUnitField is a flat set/add. With perUnitField the amount
-- is multiplied by the numeric value of that field before being set/added.
-- ---------------------------------------------------------------------------
create table if not exists vendor_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  service_category text,
  rules jsonb,
  base_unit text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_vendor_quote_reqs_vendor on vendor_quote_requirements(vendor_id);
create index if not exists idx_vendor_quote_reqs_category on vendor_quote_requirements(service_category);
create index if not exists idx_vendor_quote_reqs_template on vendor_quote_requirements(is_template);
create index if not exists idx_vendor_pricing_rules_vendor on vendor_pricing_rules(vendor_id);
create index if not exists idx_vendor_pricing_rules_category on vendor_pricing_rules(service_category);
