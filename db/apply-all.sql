-- ============================================================================
-- Divini Partners by Divini Group — PLAIN POSTGRES schema
-- ----------------------------------------------------------------------------
-- Event-partnership marketplace platform (venues · vendors · planners · clients).
-- Target: PostgreSQL 16 at localhost:5433, database `divini_partners`, user `aibos`.
--
-- CREATE THE DB + APPLY (run once on the local Postgres at localhost:5433):
--   createdb -h localhost -p 5433 -U aibos divini_partners
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema.sql
--   (or:  psql -h localhost -p 5433 -U aibos -d divini_partners -f db/schema.sql)
--
-- Conventions: uuid PKs via gen_random_uuid(); timestamptz default now();
-- text[] for arrays; jsonb for flexible/nested fields; numeric for money;
-- text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- CORE
-- ============================================================================

-- ---------- organizations ----------
-- Tenant/partner entity. Tiers drive platform fees, seats, white-label state.
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  tier text check (tier in ('client','free_partner','partner','premier','white_label')),
  subscription_status text,
  platform_fee_rate numeric,
  included_seats int default 1,
  additional_seats int default 0,
  billing_contact text,
  verification_status text,
  white_label_status text check (white_label_status in (
    'not_eligible','potential_fit','invited','proposal_sent',
    'contract_pending','active','paused','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- users ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  oidc_sub text unique,
  email text unique,
  name text,
  phone text,
  role text check (role in (
    'super_admin','admin','venue','vendor','supplier',
    'installer','planner','client','billing')),
  organization_id uuid references organizations(id) on delete set null,
  account_type text,
  status text,
  notification_preferences jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- terms_acceptance ----------
create table if not exists terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  agreement_version text,
  policy_version text,
  account_type text,
  organization_id uuid references organizations(id) on delete set null,
  accepted_at timestamptz default now(),
  ip_address text
);

-- ---------- venues ----------
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  region text,
  venue_type text,
  capacity int,
  rooms jsonb,
  amenities text[],
  availability_calendar jsonb,
  rate_rules jsonb,
  floorplans jsonb,
  rules jsonb,
  preferred_vendors jsonb,
  documents jsonb,
  review_score numeric,
  status text,
  created_at timestamptz default now()
);

-- ---------- vendors ----------
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  category text,
  subcategories text[],
  services jsonb,
  service_radius int,
  inventory_summary jsonb,
  pricing_profile jsonb,
  availability jsonb,
  documents jsonb,
  preferred_status boolean default false,
  premier_status boolean default false,
  review_score numeric,
  status text,
  created_at timestamptz default now()
);

-- ---------- profiles ----------
-- Co-branded public profile pages for venues/vendors/planners/suppliers.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  kind text check (kind in ('venue','vendor','planner','supplier','installer')),
  slug text unique,
  public_url text,
  template text,
  theme jsonb,
  hero jsonb,
  about text,
  sections jsonb,
  published_status text,
  claim_status text,
  created_at timestamptz default now()
);

-- ---------- events ----------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  client_id uuid references users(id) on delete set null,
  planner_id uuid references users(id) on delete set null,
  venue_id uuid references venues(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  date_time timestamptz,
  guest_count int,
  budget numeric,
  event_goals text,
  required_services text[],
  status text check (status in (
    'inquiry','venue_reviewing','venue_hold','vendor_bidding','quotes_received',
    'vendor_selected','deposit_due','in_production','install_scheduled',
    'itinerary_confirmed','event_day','completed','closed','archived')),
  itinerary jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- bids ----------
create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  category text,
  scope text,
  budget_min numeric,
  budget_max numeric,
  deadline timestamptz,
  invited_vendors jsonb,
  visibility text,
  tier_access text check (tier_access in ('premier','partner','free','private')),
  rush boolean default false,
  status text check (status in (
    'draft','posted','invited','reviewing','questions','quote_submitted',
    'clarification','shortlisted','awarded','declined','expired','closed')),
  created_at timestamptz default now()
);

-- ---------- quotes ----------
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references bids(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  event_id uuid references events(id) on delete cascade,
  line_items jsonb,
  subtotal numeric,
  fees jsonb,
  platform_fee numeric,
  total numeric,
  status text check (status in (
    'draft','generated','submitted','viewed','revision_requested',
    'revised','accepted','declined','expired','converted')),
  expiration_date timestamptz,
  standardized_pdf text,
  created_at timestamptz default now()
);

-- ---------- invoices ----------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  client_id uuid references users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  line_items jsonb,
  subtotal numeric,
  platform_fee numeric,
  taxes numeric,
  total numeric,
  deposit_paid numeric,
  balance_due numeric,
  due_date timestamptz,
  status text check (status in (
    'draft','uploaded','standardized','sent','viewed','deposit_paid',
    'partially_paid','paid','overdue','disputed','refunded','closed')),
  standardized_pdf text,
  created_at timestamptz default now()
);

-- ---------- payments ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  amount numeric,
  method text,
  status text,
  platform_fee numeric,
  payout_status text check (payout_status in (
    'not_ready','awaiting_payment','payment_received','fee_deducted',
    'payout_pending','payout_sent','payout_failed','refunded','disputed')),
  external_payment_flag boolean default false,
  external_reason text,
  created_at timestamptz default now()
);

-- ---------- inventory_items ----------
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  category text,
  description text,
  photos jsonb,
  dimensions text,
  weight text,
  quantity int,
  price numeric,
  fees jsonb,
  availability jsonb,
  warehouse_location text,
  service_radius int,
  lead_time text,
  contract_pricing_eligible boolean default false,
  created_at timestamptz default now()
);

-- ---------- messages ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  thread_type text,
  sender_id uuid references users(id) on delete set null,
  recipients jsonb,
  body text,
  attachments jsonb,
  visibility text,
  read_status boolean default false,
  created_at timestamptz default now()
);

-- ---------- documents ----------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  related_object_type text,
  related_object_id uuid,
  document_type text,
  file_url text,
  visibility text,
  version int default 1,
  approval_status text,
  expiration_date timestamptz,
  created_at timestamptz default now()
);

-- ---------- reviews ----------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  reviewer_id uuid references users(id) on delete set null,
  reviewee_id uuid references users(id) on delete set null,
  rating numeric,
  criteria jsonb,
  body text,
  status text,
  created_at timestamptz default now()
);

-- ---------- change_orders ----------
create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  requested_by uuid references users(id) on delete set null,
  description text,
  line_items jsonb,
  amount numeric,
  status text,
  created_at timestamptz default now()
);

-- ---------- support_tickets ----------
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  category text,
  urgency text,
  description text,
  attachments jsonb,
  status text,
  assigned_admin uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------- feedback_items ----------
create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  type text,
  priority text,
  description text,
  related_object_type text,
  related_object_id uuid,
  status text,
  admin_notes text,
  created_at timestamptz default now()
);

-- ---------- audit_logs ----------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text,
  object_type text,
  object_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz default now()
);

-- ---------- contract_pricing ----------
create table if not exists contract_pricing (
  id uuid primary key default gen_random_uuid(),
  partner_a_org uuid references organizations(id) on delete cascade,
  partner_b_org uuid references organizations(id) on delete cascade,
  partner_type text,
  pricing_type text,
  discount_pct numeric,
  fixed_rate numeric,
  start_date date,
  end_date date,
  auto_renewal boolean,
  applicable_categories text[],
  status text,
  created_at timestamptz default now()
);

-- ---------- guests ----------
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text,
  email text,
  phone text,
  rsvp_status text,
  plus_one boolean,
  meal_preference text,
  table_assignment text,
  vip boolean default false,
  notes text,
  accessibility_needs text,
  created_at timestamptz default now()
);

-- ---------- tasks ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text,
  category text,
  assigned_to uuid references users(id) on delete set null,
  due_date timestamptz,
  priority text,
  status text,
  related_document_id uuid references documents(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================================
-- CLAIM ENGINE (automation addendum)
-- ============================================================================

-- ---------- discovered_businesses ----------
create table if not exists discovered_businesses (
  id uuid primary key default gen_random_uuid(),
  business_name text,
  category text,
  subcategories text[],
  website_url text,
  source_urls jsonb,
  public_email text,
  public_phone text,
  address text,
  city text,
  state text,
  region text,
  country text,
  social_links jsonb,
  confidence_score numeric,
  discovery_status text check (discovery_status in (
    'discovered','unclaimed','claim_email_sent','claim_pending','claimed',
    'verified','rejected','do_not_contact','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_enriched_at timestamptz
);

-- ---------- unclaimed_profiles ----------
create table if not exists unclaimed_profiles (
  id uuid primary key default gen_random_uuid(),
  discovered_business_id uuid references discovered_businesses(id) on delete cascade,
  profile_slug text unique,
  public_profile_url text,
  claim_status text,
  ai_generated_description text,
  ai_generated_tags text[],
  brand_colors jsonb,
  logo_url text,
  image_urls jsonb,
  source_attribution text,
  owner_verified boolean default false,
  published_status text,
  noindex_status boolean default true,
  removal_requested boolean default false,
  created_at timestamptz default now()
);

-- ---------- claim_outreach ----------
create table if not exists claim_outreach (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references unclaimed_profiles(id) on delete cascade,
  email text,
  sequence_step int,
  email_subject text,
  sent_at timestamptz,
  delivery_status text,
  bounced boolean default false,
  unsubscribed boolean default false,
  removal_requested boolean default false,
  next_send_date timestamptz,
  created_at timestamptz default now()
);

-- ---------- claim_verifications ----------
create table if not exists claim_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references unclaimed_profiles(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  verification_method text,
  verification_status text,
  verified_email text,
  verified_domain text,
  admin_approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz default now()
);

-- ---------- claim_markets ----------
-- Geographic expansion scheduler.
create table if not exists claim_markets (
  id uuid primary key default gen_random_uuid(),
  market_name text,
  state text,
  region text,
  status text,
  target_categories text[],
  max_profiles int,
  profiles_discovered int default 0,
  outreach_cadence text,
  priority int,
  created_at timestamptz default now()
);

-- ============================================================================
-- INDEXES (foreign keys + common filters)
-- ============================================================================

create index if not exists idx_users_org on users(organization_id);
create index if not exists idx_users_role on users(role);
create index if not exists idx_terms_user on terms_acceptance(user_id);
create index if not exists idx_terms_org on terms_acceptance(organization_id);
create index if not exists idx_venues_org on venues(organization_id);
create index if not exists idx_venues_city on venues(city);
create index if not exists idx_vendors_org on vendors(organization_id);
create index if not exists idx_vendors_category on vendors(category);
create index if not exists idx_profiles_org on profiles(organization_id);
create index if not exists idx_profiles_kind on profiles(kind);
create index if not exists idx_events_client on events(client_id);
create index if not exists idx_events_planner on events(planner_id);
create index if not exists idx_events_venue on events(venue_id);
create index if not exists idx_events_org on events(organization_id);
create index if not exists idx_events_status on events(status);
create index if not exists idx_bids_event on bids(event_id);
create index if not exists idx_bids_status on bids(status);
create index if not exists idx_quotes_bid on quotes(bid_id);
create index if not exists idx_quotes_vendor on quotes(vendor_id);
create index if not exists idx_quotes_event on quotes(event_id);
create index if not exists idx_invoices_event on invoices(event_id);
create index if not exists idx_invoices_vendor on invoices(vendor_id);
create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_invoices_org on invoices(organization_id);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_payments_invoice on payments(invoice_id);
create index if not exists idx_payments_payout on payments(payout_status);
create index if not exists idx_inventory_vendor on inventory_items(vendor_id);
create index if not exists idx_inventory_org on inventory_items(organization_id);
create index if not exists idx_messages_event on messages(event_id);
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_documents_owner on documents(owner_id);
create index if not exists idx_documents_org on documents(organization_id);
create index if not exists idx_documents_related on documents(related_object_type, related_object_id);
create index if not exists idx_reviews_event on reviews(event_id);
create index if not exists idx_reviews_reviewer on reviews(reviewer_id);
create index if not exists idx_reviews_reviewee on reviews(reviewee_id);
create index if not exists idx_change_orders_event on change_orders(event_id);
create index if not exists idx_change_orders_quote on change_orders(quote_id);
create index if not exists idx_change_orders_invoice on change_orders(invoice_id);
create index if not exists idx_support_user on support_tickets(user_id);
create index if not exists idx_support_event on support_tickets(event_id);
create index if not exists idx_support_org on support_tickets(organization_id);
create index if not exists idx_feedback_user on feedback_items(user_id);
create index if not exists idx_audit_actor on audit_logs(actor_id);
create index if not exists idx_audit_object on audit_logs(object_type, object_id);
create index if not exists idx_contract_pricing_a on contract_pricing(partner_a_org);
create index if not exists idx_contract_pricing_b on contract_pricing(partner_b_org);
create index if not exists idx_guests_event on guests(event_id);
create index if not exists idx_tasks_event on tasks(event_id);
create index if not exists idx_tasks_assigned on tasks(assigned_to);
create index if not exists idx_disc_status on discovered_businesses(discovery_status);
create index if not exists idx_disc_category on discovered_businesses(category);
create index if not exists idx_disc_region on discovered_businesses(region);
create index if not exists idx_unclaimed_business on unclaimed_profiles(discovered_business_id);
create index if not exists idx_outreach_profile on claim_outreach(profile_id);
create index if not exists idx_outreach_next on claim_outreach(next_send_date);
create index if not exists idx_verif_profile on claim_verifications(profile_id);
create index if not exists idx_verif_user on claim_verifications(user_id);
create index if not exists idx_markets_status on claim_markets(status);
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 2 schema addendum
-- ----------------------------------------------------------------------------
-- AI-assisted onboarding + co-branded partner profiles (blueprint sections 8 + 9).
--
-- This file is ADDITIVE. It does not alter any table in db/schema.sql. Apply it
-- after schema.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase2.sql
--
-- Phase 2 reuses existing tables where possible:
--   organizations  -> the partner account (tier, verification_status)
--   profiles       -> the published co-branded profile (slug, theme, hero, ...)
--   venues/vendors -> structured business records
--   documents      -> uploaded intake docs (COI, W-9, portfolios, ...)
--
-- The tables below cover the things Phase 1 had no home for: a saveable,
-- sectioned onboarding draft; explicit theme controls; AI suggestions that must
-- be reviewed before they become real fields; and a clean slug registry.
-- Conventions match schema.sql: uuid PKs, timestamptz default now(), jsonb for
-- nested data, text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- onboarding_drafts ----------
-- One row per organization. The wizard saves here continuously ("save and come
-- back later"). `sections` is a jsonb map of { sectionKey: { ...fields } }, so
-- the wizard can add steps without a migration. `completion_status` is the
-- single source of truth for the profile lifecycle.
create table if not exists onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role text,
  sections jsonb not null default '{}'::jsonb,
  current_step text,
  steps_completed text[] default '{}',
  strength int default 0,                 -- 0..100 profile-strength meter
  completion_status text not null default 'Draft' check (completion_status in (
    'Draft','Basic Complete','Pending Review','Published','Verified',
    'Preferred Eligible','Preferred','Premier','Suspended','Archived')),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- profile_themes ----------
-- The partner brand controls for the co-branded profile body. The Divini shell
-- (header/footer/trust badges) is unaffected by these; only the profile body is.
create table if not exists profile_themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  logo_url text,
  cover_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  button_style text check (button_style in ('rounded','pill','square')),
  template text,                          -- one of the 10 templates (blueprint 9.5)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- ai_profile_suggestions ----------
-- Every AI-suggested field is recorded here and starts life as
-- 'ai_suggested_pending_verification'. Nothing here is ever shown publicly until
-- the partner accepts it (status -> 'accepted') and the field is promoted into
-- the onboarding draft / profile. The partner can also reject or edit.
create table if not exists ai_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text,                            -- 'website' | 'document' | 'manual'
  source_ref text,                        -- the URL or document id the suggestion came from
  section text,                           -- which onboarding section it targets
  field text,                             -- the field key
  suggested_value jsonb,                  -- { value, ... }
  status text not null default 'ai_suggested_pending_verification' check (status in (
    'ai_suggested_pending_verification','accepted','edited','rejected')),
  resolved_value jsonb,                   -- what the partner accepted/edited it to
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- website_intakes ----------
-- A record of each website / Instagram / portfolio / booking / Google link the
-- partner submitted during onboarding, plus the structured (not invented) fields
-- we derived from it.
create table if not exists website_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  link_type text,                         -- website | instagram | portfolio | booking | google | other
  status text default 'received',
  created_at timestamptz default now()
);

-- ---------- profile_slugs ----------
-- Clean slug registry so a partner can reserve a public slug independently of
-- whether the `profiles` row has been published yet. The published profile is
-- still written to the existing `profiles` table.
create table if not exists profile_slugs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null unique,
  kind text check (kind in ('venue','vendor','planner','supplier','installer')),
  created_at timestamptz default now(),
  unique (organization_id)
);

-- ---------- indexes ----------
create index if not exists idx_onboarding_org on onboarding_drafts(organization_id);
create index if not exists idx_onboarding_status on onboarding_drafts(completion_status);
create index if not exists idx_themes_org on profile_themes(organization_id);
create index if not exists idx_ai_sugg_org on ai_profile_suggestions(organization_id);
create index if not exists idx_ai_sugg_status on ai_profile_suggestions(status);
create index if not exists idx_website_intakes_org on website_intakes(organization_id);
create index if not exists idx_profile_slugs_slug on profile_slugs(slug);
create index if not exists idx_profile_slugs_org on profile_slugs(organization_id);
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
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 4 schema additions
-- ----------------------------------------------------------------------------
-- Rental Inventory management, Vendor Pricing Memory, Auto-Quote engine inputs,
-- and the Package / Bundle builder. (Blueprint sections 12, 17, 18.)
--
-- This file is ADDITIVE. It does not modify db/schema.sql. Apply it AFTER the
-- base schema:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase4.sql
--
-- The base `inventory_items` table (db/schema.sql) only carries a subset of the
-- blueprint 12.2 field set. Rather than ALTER another agent's table in a way that
-- could collide, Phase 4 adds the remaining columns with `add column if not
-- exists` (safe + idempotent) and introduces new tables for availability by
-- date, pricing memory, and packages.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- inventory_items: extend with the full blueprint 12.2 field set.
-- (Base columns already present: name, category, description, photos,
--  dimensions, weight, quantity, price, fees, availability, warehouse_location,
--  service_radius, lead_time, contract_pricing_eligible.)
-- ----------------------------------------------------------------------------
alter table inventory_items add column if not exists price_unit text;          -- per_day | per_event | per_unit | per_hour
alter table inventory_items add column if not exists delivery_fee numeric;
alter table inventory_items add column if not exists install_fee numeric;
alter table inventory_items add column if not exists labor_required boolean default false;
alter table inventory_items add column if not exists labor_hours numeric;       -- estimated labor hours per unit
alter table inventory_items add column if not exists damage_deposit numeric;
alter table inventory_items add column if not exists replacement_value numeric;
alter table inventory_items add column if not exists venue_restrictions text[];
alter table inventory_items add column if not exists add_ons jsonb;             -- [{ name, price }]
alter table inventory_items add column if not exists preferred_venue_pricing jsonb; -- { venue_id|venue_name: discount_pct }
alter table inventory_items add column if not exists status text;              -- active | archived | unavailable
alter table inventory_items add column if not exists updated_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- inventory_availability: availability tracking by date for an inventory item.
-- quantity_available is the on-hand count for that date window; reserved and
-- pending track committed and tentative holds; buffer is a safety reserve.
-- ----------------------------------------------------------------------------
create table if not exists inventory_availability (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  start_date date not null,
  end_date date,
  quantity_available int default 0,
  quantity_reserved int default 0,
  quantity_pending int default 0,
  buffer int default 0,
  note text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- vendor_pricing_memory: the per-vendor private "pricing brain" (blueprint 18).
-- One row per organization (the vendor account). Everything the auto-quote
-- engine needs to compose a draft, kept private to the owning org.
-- ----------------------------------------------------------------------------
create table if not exists vendor_pricing_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade unique,
  standard_rates jsonb,        -- { service_key: { rate, unit } }
  product_prices jsonb,        -- { product_key: price }
  rental_rates jsonb,          -- { item_key: { rate, unit } }
  labor_rates jsonb,           -- { role: hourly_rate }, plus { default }
  minimums jsonb,              -- { order_minimum, labor_minimum_hours }
  travel_fees jsonb,           -- { base, per_mile, free_radius_miles }
  discount_rules jsonb,        -- [{ name, type, threshold, pct }]
  package_templates jsonb,     -- [{ name, items:[...], price }]
  rush_multipliers jsonb,      -- { standard: 1, rush: 1.25, same_day: 1.5 }
  seasonal_pricing jsonb,      -- [{ name, start_md, end_md, multiplier }]
  contract_pricing jsonb,      -- { partner_org_id|venue: discount_pct }
  past_quotes jsonb,           -- [{ quote_id, event_type, total, outcome, at }]
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- packages: named bundles of inventory + services with bundle pricing.
-- items is a jsonb array of { kind:'inventory'|'service', ref_id, name,
-- quantity, unit_price }. bundle_price is the all-in offered price; if null
-- the sum of line items is used.
-- ----------------------------------------------------------------------------
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  name text not null,
  description text,
  category text,
  items jsonb,
  bundle_price numeric,
  delivery_fee numeric,
  install_fee numeric,
  labor_hours numeric,
  serves int,                  -- recommended guest count this package serves
  add_ons jsonb,
  status text,                 -- draft | active | archived
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_inv_avail_item on inventory_availability(inventory_item_id);
create index if not exists idx_inv_avail_org on inventory_availability(organization_id);
create index if not exists idx_inv_avail_dates on inventory_availability(start_date, end_date);
create index if not exists idx_pricing_memory_org on vendor_pricing_memory(organization_id);
create index if not exists idx_packages_org on packages(organization_id);
create index if not exists idx_packages_vendor on packages(vendor_id);
create index if not exists idx_packages_status on packages(status);
create index if not exists idx_inventory_status on inventory_items(status);
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 5 schema additions
-- ----------------------------------------------------------------------------
-- Standardized Invoices, Payments + Platform Fees, Payment-Leakage Policy,
-- Contract Pricing Partnerships, and Change Orders (blueprint sections 20-23).
--
-- These statements are ADDITIVE. They extend tables already created in
-- db/schema.sql (invoices, payments, change_orders, contract_pricing) with the
-- extra columns Phase 5 needs, and create new supporting tables. Every column
-- add is guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase5.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- INVOICES (blueprint 20) - standardized invoice payload + co-branding state
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists invoice_number text;
alter table invoices add column if not exists venue_id uuid references venues(id) on delete set null;
alter table invoices add column if not exists quote_id uuid references quotes(id) on delete set null;
alter table invoices add column if not exists processing_fee numeric default 0;
alter table invoices add column if not exists platform_fee_rate numeric;
alter table invoices add column if not exists deposit_due numeric;
alter table invoices add column if not exists deposit_status text;        -- none|requested|paid
alter table invoices add column if not exists terms text;
alter table invoices add column if not exists notes text;
alter table invoices add column if not exists payment_link text;
alter table invoices add column if not exists brand jsonb;                -- co-branding: divini + active user org
alter table invoices add column if not exists currency text default 'USD';
alter table invoices add column if not exists sent_at timestamptz;
alter table invoices add column if not exists viewed_at timestamptz;
alter table invoices add column if not exists paid_at timestamptz;
alter table invoices add column if not exists created_by uuid references users(id) on delete set null;
alter table invoices add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_invoices_number on invoices(invoice_number);

-- ---------------------------------------------------------------------------
-- PAYMENTS (blueprint 21) - payment flows, payout routing, fee breakdown
-- ---------------------------------------------------------------------------
alter table payments add column if not exists event_id uuid references events(id) on delete set null;
alter table payments add column if not exists organization_id uuid references organizations(id) on delete set null;
-- flow: client_to_vendor | client_to_venue | client_to_divini_payout
alter table payments add column if not exists flow text;
-- kind: deposit | balance | milestone | full
alter table payments add column if not exists kind text;
alter table payments add column if not exists processing_fee numeric default 0;
alter table payments add column if not exists net_payout numeric;        -- amount minus platform + processing fee
alter table payments add column if not exists payee_org_id uuid references organizations(id) on delete set null;
alter table payments add column if not exists payee_label text;
alter table payments add column if not exists fee_breakdown jsonb;        -- configurable fees applied (blueprint 21.3)
alter table payments add column if not exists external_proof text;        -- proof attachment ref for external payments
alter table payments add column if not exists external_acknowledged_by uuid references users(id) on delete set null;
alter table payments add column if not exists fee_owed numeric;           -- platform fee still owed on external payments
alter table payments add column if not exists reference text;
alter table payments add column if not exists recorded_by uuid references users(id) on delete set null;
alter table payments add column if not exists updated_at timestamptz default now();
-- C5: enforce one payment row per processor reference so a race cannot double
-- record (and double pay out). Partial so multiple NULL references are allowed.
create unique index if not exists uq_payments_reference on payments(reference) where reference is not null;

-- ---------- platform_fee_config ----------
-- Configurable fees list (blueprint 21.3). Admin-managed; applied at payment time.
create table if not exists platform_fee_config (
  id uuid primary key default gen_random_uuid(),
  key text unique,                       -- platform_fee | processing_fee | rush_fee | ...
  label text,
  fee_type text check (fee_type in ('percent','flat')),
  value numeric,                         -- percent (0.025) or flat amount
  applies_to text,                       -- invoice | payment | payout
  active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- PAYMENT-LEAKAGE POLICY (blueprint 21.4) - external payment audit trail
-- ---------------------------------------------------------------------------
-- One row per "mark as external" decision. Requires reason + proof, notifies
-- admin, and records the platform fee that is still owed. The booleans flag the
-- account for review. Detection itself happens in server/src/lib/leakage.ts.
create table if not exists leakage_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  source text,                           -- message | invoice | manual | external_flow
  detected_terms text[],                 -- matched leakage phrases
  flagged_text text,                     -- snippet that triggered detection
  decision text check (decision in ('detected','warned','marked_external','blocked','cleared')),
  reason text,
  proof text,
  fee_owed numeric,
  admin_notified boolean default false,
  account_flagged boolean default false,
  resolved boolean default false,
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_leakage_event on leakage_events(event_id);
create index if not exists idx_leakage_org on leakage_events(organization_id);
create index if not exists idx_leakage_invoice on leakage_events(invoice_id);
create index if not exists idx_leakage_decision on leakage_events(decision);

-- ---------------------------------------------------------------------------
-- CONTRACT PRICING PARTNERSHIPS (blueprint 22) - extra terms
-- ---------------------------------------------------------------------------
alter table contract_pricing add column if not exists name text;
alter table contract_pricing add column if not exists volume_tier text;        -- e.g. tier1/tier2/tier3
alter table contract_pricing add column if not exists volume_threshold numeric;
alter table contract_pricing add column if not exists applicable_venues uuid[];
alter table contract_pricing add column if not exists terms text;
alter table contract_pricing add column if not exists approval_status text;     -- pending|approved|declined|expired
alter table contract_pricing add column if not exists approved_by uuid references users(id) on delete set null;
alter table contract_pricing add column if not exists created_by uuid references users(id) on delete set null;
alter table contract_pricing add column if not exists updated_at timestamptz default now();

create index if not exists idx_contract_pricing_status on contract_pricing(approval_status);

-- ---------------------------------------------------------------------------
-- CHANGE ORDERS (blueprint 23) - lifecycle + scope-creep flag
-- ---------------------------------------------------------------------------
alter table change_orders add column if not exists change_order_number text;
alter table change_orders add column if not exists title text;
alter table change_orders add column if not exists reason text;
alter table change_orders add column if not exists scope_creep_flag boolean default false;
alter table change_orders add column if not exists subtotal numeric;
alter table change_orders add column if not exists platform_fee numeric;
alter table change_orders add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table change_orders add column if not exists responded_at timestamptz;
alter table change_orders add column if not exists updated_at timestamptz default now();

-- change_orders.status was free text in schema.sql; Phase 5 uses the values:
-- draft | sent | accepted | declined | revision_requested | added_to_invoice | paid | closed
create index if not exists idx_change_orders_status on change_orders(status);

-- ---------------------------------------------------------------------------
-- SEED - default configurable fees (idempotent)
-- ---------------------------------------------------------------------------
insert into platform_fee_config (key, label, fee_type, value, applies_to, active, notes)
values
  ('platform_fee','Platform Fee','percent',0.025,'invoice',true,'Rate overridden per org tier at compute time'),
  ('processing_fee','Payment Processing Fee','percent',0.029,'payment',true,'Card processing pass-through'),
  ('processing_fee_flat','Processing Fee (flat)','flat',0.30,'payment',true,'Per-transaction flat'),
  ('rush_fee','Rush Handling Fee','flat',75,'invoice',false,'Optional, for expedited turnarounds')
on conflict (key) do nothing;
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 6 schema additions
-- ----------------------------------------------------------------------------
-- Guest Lists, Floorplans, Seating Charts, auto-built Itinerary, and
-- Timeline / Tasks (blueprint sections 10.3, 14, 15, 33).
--
-- These statements are ADDITIVE. The base `guests` and `tasks` tables already
-- exist in db/schema.sql; Phase 6 extends them with extra columns and adds the
-- new floorplans / seating_charts / itinerary_items tables. Every column add is
-- guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase6.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- GUESTS (blueprint 14) - extra columns the existing `guests` table lacks
-- ---------------------------------------------------------------------------
-- schema.sql ships: name, email, phone, rsvp_status, plus_one, meal_preference,
-- table_assignment, vip, notes, accessibility_needs. Phase 6 adds:
alter table guests add column if not exists party_size int default 1;
alter table guests add column if not exists plus_one_name text;
alter table guests add column if not exists guest_group text;          -- bride|groom|family|colleagues|vip ...
alter table guests add column if not exists invited_by text;
alter table guests add column if not exists seating_table_id uuid;     -- soft ref into seating_charts layout
alter table guests add column if not exists checked_in boolean default false;
alter table guests add column if not exists checked_in_at timestamptz;
alter table guests add column if not exists created_by uuid references users(id) on delete set null;
alter table guests add column if not exists updated_at timestamptz default now();

create index if not exists idx_guests_rsvp on guests(rsvp_status);
create index if not exists idx_guests_vip on guests(vip);
create index if not exists idx_guests_checked_in on guests(event_id, checked_in);

-- ---------------------------------------------------------------------------
-- FLOORPLANS (blueprint 14.4 / 15) - uploaded floorplan references per event
-- ---------------------------------------------------------------------------
create table if not exists floorplans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  venue_id uuid references venues(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  description text,
  file_url text,                          -- uploaded image / pdf reference
  thumbnail_url text,
  width numeric,                          -- canvas units for the seating builder
  height numeric,
  scale text,                             -- e.g. "1px = 1ft"
  is_primary boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_floorplans_event on floorplans(event_id);
create index if not exists idx_floorplans_venue on floorplans(venue_id);

-- ---------------------------------------------------------------------------
-- SEATING CHARTS (blueprint 14.3) - tables/objects + zones placed on a plan
-- ---------------------------------------------------------------------------
-- The whole arrangement is stored as jsonb so the interactive builder owns the
-- layout shape. `layout` holds tables (id, label, x, y, shape, seats, vip),
-- zones (catering/dance/stage/check-in/photo/vendor), and guest assignments
-- (guest_id -> table_id). One chart may be active per event.
create table if not exists seating_charts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  floorplan_id uuid references floorplans(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  status text default 'draft',            -- draft|in_progress|final
  layout jsonb default '{}'::jsonb,        -- { tables:[], zones:[], assignments:{} }
  is_active boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_seating_event on seating_charts(event_id);
create index if not exists idx_seating_floorplan on seating_charts(floorplan_id);

-- ---------------------------------------------------------------------------
-- ITINERARY ITEMS (blueprint 15) - persisted, role-scoped schedule items
-- ---------------------------------------------------------------------------
-- buildItinerary(eventId) assembles a derived itinerary from the event record,
-- quotes, deliveries, load-in/out, payment deadlines and program. Persisted
-- (confirmed / pinned) items live here so they survive a rebuild.
create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  title text,
  description text,
  category text,                          -- load_in|setup|program|service|breakdown|load_out|delivery|payment|milestone
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int,
  location text,
  owner_role text,                        -- client|venue|vendor|installer|planner|all
  owner_label text,
  responsible_org_id uuid references organizations(id) on delete set null,
  source text default 'manual',           -- manual|auto:event|auto:quote|auto:delivery|auto:payment|auto:program
  source_ref uuid,                        -- the originating quote / delivery row, if any
  status text default 'planned',          -- planned|confirmed|in_progress|done|delayed|cancelled
  pinned boolean default false,
  sort_order int default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_itinerary_event on itinerary_items(event_id);
create index if not exists idx_itinerary_role on itinerary_items(owner_role);
create index if not exists idx_itinerary_start on itinerary_items(start_time);

-- ---------------------------------------------------------------------------
-- TASKS (blueprint 33) - extra columns the existing `tasks` table lacks
-- ---------------------------------------------------------------------------
-- schema.sql ships: name, category, assigned_to, due_date, priority, status,
-- related_document_id, notes. Phase 6 adds timeline + workflow fields:
alter table tasks add column if not exists description text;
alter table tasks add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table tasks add column if not exists assigned_role text;          -- client|venue|vendor|installer|planner
alter table tasks add column if not exists start_date timestamptz;
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists depends_on uuid references tasks(id) on delete set null;
alter table tasks add column if not exists milestone boolean default false;
alter table tasks add column if not exists template_key text;           -- which workflow template seeded the task
alter table tasks add column if not exists sort_order int default 0;
alter table tasks add column if not exists created_by uuid references users(id) on delete set null;
alter table tasks add column if not exists updated_at timestamptz default now();

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_category on tasks(category);
create index if not exists idx_tasks_due on tasks(due_date);
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 7 schema additions
-- ----------------------------------------------------------------------------
-- Reviews + Trust Scores, Starred / Preferred Vendors, AI Next-Best-Action,
-- Recommendation Engine, Risk + Budget Intelligence, and reusable Event
-- Templates + event history memory (blueprint sections 25, 26, 27, 28).
--
-- These statements are ADDITIVE. They extend the `reviews` table already created
-- in db/schema.sql and add new supporting tables. Every column add is guarded
-- with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql and earlier phase files):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase7.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- REVIEWS (blueprint 27) - post-event reviews across relationships
-- ---------------------------------------------------------------------------
-- The base reviews table (db/schema.sql) holds: event_id, reviewer_id,
-- reviewee_id, rating, criteria jsonb, body, status. Phase 7 adds the
-- relationship direction, the target object (vendor/venue/org), org scoping for
-- listing, the review request lifecycle, and a public/visibility flag.
alter table reviews add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table reviews add column if not exists reviewer_org_id uuid references organizations(id) on delete set null;
alter table reviews add column if not exists reviewee_org_id uuid references organizations(id) on delete set null;
-- relationship: client_to_vendor | planner_to_vendor | venue_to_vendor |
--   vendor_to_client | client_to_venue | venue_to_client | client_to_planner |
--   vendor_to_venue | planner_to_venue
alter table reviews add column if not exists relationship text;
-- target_type: vendor | venue | client | planner | org
alter table reviews add column if not exists target_type text;
alter table reviews add column if not exists target_id uuid;
alter table reviews add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table reviews add column if not exists venue_id uuid references venues(id) on delete set null;
-- status values used by Phase 7: requested | draft | submitted | published | hidden
alter table reviews add column if not exists is_public boolean default true;
alter table reviews add column if not exists requested_at timestamptz;
alter table reviews add column if not exists submitted_at timestamptz;
alter table reviews add column if not exists updated_at timestamptz default now();

create index if not exists idx_reviews_org on reviews(organization_id);
create index if not exists idx_reviews_target on reviews(target_type, target_id);
create index if not exists idx_reviews_relationship on reviews(relationship);
create index if not exists idx_reviews_status on reviews(status);

-- ---------------------------------------------------------------------------
-- STARRED / PREFERRED VENDORS (blueprint 27.4)
-- ---------------------------------------------------------------------------
-- An org marks another org (typically a vendor) as starred / preferred. Used by
-- the recommendation engine to boost matches and by repeat-relationship prompts.
create table if not exists starred_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,   -- the org doing the starring
  vendor_org_id uuid references organizations(id) on delete cascade,     -- the starred org
  vendor_id uuid references vendors(id) on delete set null,
  label text,                          -- optional list / category label
  note text,
  starred_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists idx_starred_unique on starred_vendors(organization_id, vendor_org_id);
create index if not exists idx_starred_org on starred_vendors(organization_id);
create index if not exists idx_starred_vendor_org on starred_vendors(vendor_org_id);

-- ---------------------------------------------------------------------------
-- EVENT TEMPLATES (blueprint 28) - reusable event blueprints
-- ---------------------------------------------------------------------------
-- A saved, reusable scope: needed categories, a checklist, a budget skeleton,
-- and default guest count / event type. Org-owned. `is_global` lets Divini ship
-- starter templates visible to everyone.
create table if not exists event_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  event_type text,
  description text,
  default_guest_count int,
  categories text[],                   -- vendor categories the event needs
  checklist jsonb,                     -- [{ label, category, done }]
  budget_skeleton jsonb,               -- [{ category, amount, pct }]
  default_budget numeric,
  source_event_id uuid references events(id) on delete set null,  -- when cloned from history
  is_global boolean default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_event_templates_org on event_templates(organization_id);
create index if not exists idx_event_templates_type on event_templates(event_type);
create index if not exists idx_event_templates_global on event_templates(is_global);

-- ---------------------------------------------------------------------------
-- EVENT HISTORY MEMORY (blueprint 28) - completed-event summaries
-- ---------------------------------------------------------------------------
-- A compact, durable summary written when an event completes (or on demand).
-- Powers "duplicate this event", repeat-relationship detection, and the
-- recommendation engine. One row per (event) snapshot.
create table if not exists event_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  name text,
  event_type text,
  venue_id uuid references venues(id) on delete set null,
  venue_org_id uuid references organizations(id) on delete set null,
  guest_count int,
  total_spend numeric,
  budget numeric,
  categories text[],                   -- categories that were fulfilled
  vendor_org_ids uuid[],               -- orgs that worked the event
  summary jsonb,                       -- structured recap (scope, line totals, notes)
  outcome text,                        -- completed | closed | cancelled
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_event_history_org on event_history(organization_id);
create index if not exists idx_event_history_event on event_history(event_id);
create index if not exists idx_event_history_type on event_history(event_type);

-- ---------------------------------------------------------------------------
-- NEXT-BEST-ACTION DISMISSALS (blueprint 25) - optional per-user state
-- ---------------------------------------------------------------------------
-- Next-best-action prompts are computed deterministically from org state; this
-- table only records which ones a user has dismissed so they stop reappearing.
create table if not exists nba_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  action_key text,                     -- stable key from nextbestaction.ts
  dismissed_at timestamptz default now()
);

create unique index if not exists idx_nba_dismissal_unique on nba_dismissals(user_id, action_key);
create index if not exists idx_nba_dismissal_user on nba_dismissals(user_id);
-- ============================================================================
-- Divini Partners by Divini Group - PHASE 8 schema additions
-- ----------------------------------------------------------------------------
-- Super Admin Intelligence, Feedback Center, Support / Help Desk, Disputes /
-- Refunds / Cancellations, Reporting / Exports, Audit Trail surfacing,
-- Marketplace Search + SEO pages, Availability management, E-Sign / Compliance
-- (COI / W-9 tracking) and the PRIVATE Super-Admin-only White-Label controls.
-- Blueprint sections 30, 32, 36, 37, 38, 40, 41, 42, 44 and White-Label (5).
--
-- These statements are ADDITIVE and idempotent. The base tables
-- support_tickets, feedback_items, audit_logs, documents, organizations and
-- venues / vendors already ship in db/schema.sql; Phase 8 extends them with the
-- extra columns the feature set needs and adds the NEW disputes, availability,
-- esign_requests and whitelabel_records tables. Every column add is guarded
-- with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase8.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SUPPORT TICKETS (blueprint 37) - extra columns the base table lacks
-- ---------------------------------------------------------------------------
-- schema.sql ships: user_id, event_id, organization_id, category, urgency,
-- description, attachments, status, assigned_admin, created_at. Phase 8 adds:
alter table support_tickets add column if not exists subject text;
alter table support_tickets add column if not exists resolution text;
alter table support_tickets add column if not exists updated_at timestamptz default now();
alter table support_tickets add column if not exists resolved_at timestamptz;

create index if not exists idx_support_status on support_tickets(status);
create index if not exists idx_support_assigned on support_tickets(assigned_admin);

-- ---------------------------------------------------------------------------
-- FEEDBACK + FEATURE REQUESTS (blueprint 36) - extra columns
-- ---------------------------------------------------------------------------
-- schema.sql ships: user_id, type, priority, description, related_object_type,
-- related_object_id, status, admin_notes, created_at. Phase 8 adds:
alter table feedback_items add column if not exists title text;
alter table feedback_items add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table feedback_items add column if not exists votes int default 0;
alter table feedback_items add column if not exists updated_at timestamptz default now();

create index if not exists idx_feedback_type on feedback_items(type);
create index if not exists idx_feedback_status on feedback_items(status);

-- ---------------------------------------------------------------------------
-- AUDIT LOGS (blueprint 42) - extra column for readable summaries
-- ---------------------------------------------------------------------------
-- schema.sql ships: actor_id, action, object_type, object_id, previous_value,
-- new_value, ip_address, created_at. Phase 8 adds:
alter table audit_logs add column if not exists summary text;
alter table audit_logs add column if not exists actor_email text;

create index if not exists idx_audit_action on audit_logs(action);
create index if not exists idx_audit_created on audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- DOCUMENTS / COMPLIANCE (blueprint 30) - COI / W-9 / e-sign extras
-- ---------------------------------------------------------------------------
-- schema.sql ships: owner_id, organization_id, related_object_type,
-- related_object_id, document_type, file_url, visibility, version,
-- approval_status, expiration_date, created_at. Phase 8 adds compliance fields:
alter table documents add column if not exists name text;
alter table documents add column if not exists coverage_amount numeric;       -- COI coverage
alter table documents add column if not exists carrier text;                  -- COI insurance carrier
alter table documents add column if not exists policy_number text;            -- COI policy number
alter table documents add column if not exists signed_status text;            -- unsigned | sent | signed
alter table documents add column if not exists signed_at timestamptz;
alter table documents add column if not exists signed_by uuid references users(id) on delete set null;
alter table documents add column if not exists updated_at timestamptz default now();

create index if not exists idx_documents_type on documents(document_type);
create index if not exists idx_documents_expiry on documents(expiration_date);

-- ---------------------------------------------------------------------------
-- DISPUTES / REFUNDS / CANCELLATIONS (blueprint 32) - NEW
-- ---------------------------------------------------------------------------
create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  opened_by uuid references users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  against_org_id uuid references organizations(id) on delete set null,
  kind text check (kind in ('dispute','refund','cancellation')),
  category text,                          -- quality | non_delivery | overcharge | scheduling | other
  reason text,
  amount numeric,                         -- amount in question / requested refund
  resolution text,
  resolution_amount numeric,
  assigned_admin uuid references users(id) on delete set null,
  status text check (status in (
    'open','under_review','awaiting_response','escalated',
    'resolved','refunded','denied','cancelled','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_disputes_event on disputes(event_id);
create index if not exists idx_disputes_org on disputes(organization_id);
create index if not exists idx_disputes_status on disputes(status);
create index if not exists idx_disputes_kind on disputes(kind);
create index if not exists idx_disputes_assigned on disputes(assigned_admin);

-- ---------------------------------------------------------------------------
-- AVAILABILITY (blueprint 29) - venue + vendor bookable / blocked windows. NEW
-- ---------------------------------------------------------------------------
create table if not exists availability_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  resource_type text check (resource_type in ('venue','vendor')),
  venue_id uuid references venues(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text check (status in ('available','blocked','tentative','booked')),
  event_id uuid references events(id) on delete set null,
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_avail_org on availability_records(organization_id);
create index if not exists idx_avail_venue on availability_records(venue_id);
create index if not exists idx_avail_vendor on availability_records(vendor_id);
create index if not exists idx_avail_window on availability_records(start_at, end_at);
create index if not exists idx_avail_status on availability_records(status);

-- ---------------------------------------------------------------------------
-- E-SIGN REQUESTS (blueprint 30) - lightweight e-sign lifecycle (MVP). NEW
-- ---------------------------------------------------------------------------
create table if not exists esign_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  requested_by uuid references users(id) on delete set null,
  signer_email text,
  signer_user_id uuid references users(id) on delete set null,
  title text,
  status text check (status in ('draft','sent','viewed','signed','declined','expired')),
  signed_file_url text,
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_esign_document on esign_requests(document_id);
create index if not exists idx_esign_org on esign_requests(organization_id);
create index if not exists idx_esign_status on esign_requests(status);

-- ---------------------------------------------------------------------------
-- WHITE-LABEL RECORDS (blueprint 5) - PRIVATE super-admin controls. NEW
-- ---------------------------------------------------------------------------
-- organizations.white_label_status already drives the lifecycle enum; this table
-- holds the internal sales pipeline notes + the custom configuration that, once
-- Active, overrides the org defaults (fees, seats, branding, domain).
create table if not exists whitelabel_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade unique,
  status text check (status in (
    'not_eligible','potential_fit','invited','proposal_sent',
    'contract_pending','active','paused','cancelled')) default 'not_eligible',
  -- internal sales / qualification fields
  fit_score numeric,                      -- 0..100 internal qualification score
  internal_notes text,
  owner_admin uuid references users(id) on delete set null,
  contract_value numeric,
  -- custom configuration applied when Active
  custom_fee_rate numeric,
  custom_seats int,
  custom_domain text,
  branding jsonb,                         -- logo, palette, typography overrides
  domain_verified boolean default false,
  branding_enabled boolean default false,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_whitelabel_org on whitelabel_records(organization_id);
create index if not exists idx_whitelabel_status on whitelabel_records(status);
-- ============================================================================
-- CLAIM YOUR PROFILE - automation engine additions
-- ============================================================================
-- The core claim-engine tables already live in db/schema.sql:
--   discovered_businesses, unclaimed_profiles, claim_outreach,
--   claim_verifications, claim_markets
--
-- This file adds the small set of columns + tables the automation addendum
-- requires that were not yet present. Everything is additive and idempotent
-- (create ... if not exists / add column if not exists), so it is safe to run
-- after db/schema.sql on the same database.
--
-- ZERO em dashes anywhere in this project (hard rule).
-- ============================================================================

-- ---------- discovered_businesses: enrichment + scoring detail --------------
alter table discovered_businesses
  add column if not exists confidence_band text;            -- high | review | low | reject
alter table discovered_businesses
  add column if not exists confidence_inputs jsonb;         -- per-signal breakdown
alter table discovered_businesses
  add column if not exists duplicate_of uuid references discovered_businesses(id) on delete set null;
alter table discovered_businesses
  add column if not exists duplicate_reason text;
alter table discovered_businesses
  add column if not exists market_id uuid references claim_markets(id) on delete set null;
alter table discovered_businesses
  add column if not exists do_not_contact boolean default false;
alter table discovered_businesses
  add column if not exists notes text;

-- ---------- unclaimed_profiles: claim linkage -------------------------------
alter table unclaimed_profiles
  add column if not exists claimed_organization_id uuid references organizations(id) on delete set null;
alter table unclaimed_profiles
  add column if not exists claimed_at timestamptz;
alter table unclaimed_profiles
  add column if not exists archived boolean default false;

-- ---------- claim_outreach: cadence + compliance detail ---------------------
alter table claim_outreach
  add column if not exists cadence text;                    -- weekly | monthly | stopped
alter table claim_outreach
  add column if not exists stop_reason text;
alter table claim_outreach
  add column if not exists email_body text;

-- ---------- claim_verifications: code + expiry ------------------------------
alter table claim_verifications
  add column if not exists verification_code text;
alter table claim_verifications
  add column if not exists code_expires_at timestamptz;
alter table claim_verifications
  add column if not exists agreement_version text;
alter table claim_verifications
  add column if not exists full_name text;
alter table claim_verifications
  add column if not exists claimant_role text;

-- ---------- claim_suppression ----------------------------------------------
-- Suppression list. Any email or domain here stops all future outreach. Built
-- from unsubscribe requests, removal requests, do-not-contact flags, and hard
-- bounces. Checked before every send.
create table if not exists claim_suppression (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text check (reason in (
    'unsubscribe','removal_request','do_not_contact','bounce','manual')),
  profile_id uuid references unclaimed_profiles(id) on delete set null,
  source_ip text,
  created_at timestamptz default now()
);

create unique index if not exists idx_suppression_email on claim_suppression(lower(email)) where email is not null;
create index if not exists idx_suppression_domain on claim_suppression(lower(domain)) where domain is not null;
create index if not exists idx_disc_dupe on discovered_businesses(duplicate_of);
create index if not exists idx_disc_market on discovered_businesses(market_id);
create index if not exists idx_unclaimed_slug on unclaimed_profiles(profile_slug);
create index if not exists idx_unclaimed_org on unclaimed_profiles(claimed_organization_id);
-- ---------------------------------------------------------------------------
-- Payout accounts: where each org receives its share for automatic money
-- splits. Stripe = a connected Express account (external_id = acct_...);
-- PayPal = the org's payout email. Populated via the Connect onboarding flow.
-- ---------------------------------------------------------------------------
create table if not exists payout_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  processor text not null check (processor in ('stripe','paypal')),
  external_id text,
  email text,
  status text not null default 'pending',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, processor)
);
create index if not exists idx_payout_accounts_org on payout_accounts(organization_id);
-- ---------------------------------------------------------------------------
-- Team seats: extra seats an org buys beyond its included seat. Each row is a
-- team member (by email). Active seats are billable at SEAT_PRICE_USD per seat
-- per month. Managed on the /account/seats page; charged via /api/seats/checkout.
-- ---------------------------------------------------------------------------
create table if not exists team_seats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  member_email text not null,
  member_name text,
  status text not null default 'active' check (status in ('active','invited','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_email)
);
create index if not exists idx_team_seats_org on team_seats(organization_id);
-- ---------------------------------------------------------------------------
-- Platform invites: a venue or partner invites a vendor or client to create a
-- free Divini Partners profile. Each invite is attributed to the inviter (the
-- referral) and carries a unique token. Accepting an invite leads to free
-- registration; on register the new org id is recorded in accepted_org_id.
-- Surfaced from /network (vendor-network + invite panel) and /join/:token.
-- ---------------------------------------------------------------------------
create table if not exists platform_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_org_id uuid references organizations(id) on delete cascade,
  inviter_user_id uuid,
  invitee_email text not null,
  invitee_name text,
  role text check (role in ('vendor','client','venue','planner')) default 'vendor',
  token text not null unique,
  status text check (status in ('sent','opened','accepted','revoked')) default 'sent',
  accepted_org_id uuid,
  message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_platform_invites_token on platform_invites(token);
create index if not exists idx_platform_invites_inviter on platform_invites(inviter_org_id);
-- ---------------------------------------------------------------------------
-- Visitor signals: device fingerprint + IP + usage signals for security,
-- fraud prevention, dedupe, and attribution. Recorded from the public web
-- (POST /api/signals); a visitor may be anonymous, so user_id/organization_id
-- are best-effort and only set when the request carries a valid auth token.
-- Surfaced read-only in the super-admin console (GET /api/signals). See the
-- Privacy Policy for the disclosure of this collection.
-- ---------------------------------------------------------------------------
create table if not exists visitor_signals (
  id uuid primary key default gen_random_uuid(),
  fingerprint text,
  ip text,
  user_agent text,
  accept_language text,
  path text,
  referrer text,
  utm jsonb,
  user_id uuid,
  organization_id uuid,
  client_hints jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_visitor_signals_fingerprint on visitor_signals(fingerprint);
create index if not exists idx_visitor_signals_created on visitor_signals(created_at);
-- ---------------------------------------------------------------------------
-- Native e-sign: a recorded signature on an agreement/contract/change order.
-- Self-hosted (no DocuSign). Captures signer identity, the signed content hash,
-- the signature image, the stored signed PDF path, IP, and timestamp.
-- ---------------------------------------------------------------------------
create table if not exists document_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  signer_user_id uuid references users(id) on delete set null,
  signer_name text,
  signer_email text,
  signer_role text,
  document_type text,
  document_title text,
  related_object_type text,
  related_object_id uuid,
  document_hash text,
  signature_image text,
  signed_pdf_path text,
  ip_address text,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_doc_sig_org on document_signatures(organization_id);
create index if not exists idx_doc_sig_obj on document_signatures(related_object_type, related_object_id);

-- ---------------------------------------------------------------------------
-- Self-hosted email open/click analytics (claim outreach only). Open = a 1x1
-- pixel hit; click = a tracked redirect. No third-party tracker.
-- ---------------------------------------------------------------------------
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  message_ref text,
  recipient text,
  kind text check (kind in ('open','click')),
  url text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_events_ref on email_events(message_ref);
create index if not exists idx_email_events_kind on email_events(kind);

-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions
-- ----------------------------------------------------------------------------
-- Venue Intelligence Database (Phase 1 foundation of the Venue Intelligence +
-- Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md "Data model" 1-4).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql (and after the
-- earlier phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-venue-intelligence.sql
--
-- Linking: a venue twin extends an existing `venues` row and is scoped to the
-- owning `organizations` row, exactly like events.organization_id. venue_id is
-- the venue link; organization_id is the authorization boundary.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money; text +
-- CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- venue_twin (addendum data model 1) - one row per venue.
-- The durable, reusable intelligence record for a venue. readiness_score is the
-- Quote Readiness Score (0-100), recomputed and stored on every write by
-- server/src/lib/venueTwin.ts computeQuoteReadinessScore.
-- ---------------------------------------------------------------------------
create table if not exists venue_twin (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  type text,
  address text,
  website text,
  capacity int,
  indoor_capacity int,
  outdoor_capacity int,
  parking_capacity int,
  loading_dock jsonb,
  freight_elevator jsonb,
  power jsonb,
  internet jsonb,
  security_requirements jsonb,
  insurance_requirements jsonb,
  union_requirements jsonb,
  install_windows jsonb,
  removal_windows jsonb,
  contacts jsonb,
  emergency_contacts jsonb,
  readiness_score int default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (venue_id)
);

-- ---------------------------------------------------------------------------
-- venue_assets (addendum data model 2) - uploaded files for a venue.
-- kind covers photos, floorplans, compliance docs, branding guidelines, etc.
-- meta jsonb carries optional structured detail (e.g. measurements derived from
-- a floorplan) the Quote Readiness Score can read.
-- ---------------------------------------------------------------------------
create table if not exists venue_assets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  kind text check (kind in (
    'photo','video','pdf','floorplan','cad','sitemap','install_guide',
    'rulebook','insurance','branding_guideline')),
  url text,
  label text,
  meta jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- branding_opportunities (addendum data model 3) - a brandable surface/space at
-- a venue (wall, screen, elevator, pool, rooftop, ...). Measurements, install
-- rules, compliance flags, approval mode, and audience/impression estimates.
-- ---------------------------------------------------------------------------
create table if not exists branding_opportunities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  description text,
  photos jsonb,
  videos jsonb,
  width numeric,
  height numeric,
  depth numeric,
  sqft numeric,
  weight_limit numeric,
  material_type text,
  surface_type text,
  mounting_options jsonb,
  power_available boolean default false,
  internet_available boolean default false,
  rigging_available boolean default false,
  permit_required boolean default false,
  engineering_required boolean default false,
  fire_marshal_required boolean default false,
  insurance_required boolean default false,
  allowed_install_types jsonb,
  prohibited_install_types jsonb,
  time_restrictions jsonb,
  noise_restrictions jsonb,
  removal_requirements jsonb,
  approval_mode text check (approval_mode in ('auto','venue_approval','manual_review')),
  pricing jsonb,
  availability jsonb,
  audience_size int,
  impression_estimate int,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- venue_restrictions (addendum data model 4) - structured allowed/prohibited
-- rules. branding_opportunity_id null means the rule is venue-wide. Structured,
-- never free-text only: rule_type + category + value are the consumable parts,
-- notes is supplementary. Quote automation reads these via
-- server/src/lib/restrictions.ts.
-- ---------------------------------------------------------------------------
create table if not exists venue_restrictions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  branding_opportunity_id uuid references branding_opportunities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  rule_type text check (rule_type in ('allowed','prohibited')),
  category text,                          -- material | method | anchor | ...
  value text,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_venue_twin_venue on venue_twin(venue_id);
create index if not exists idx_venue_twin_org on venue_twin(organization_id);
create index if not exists idx_venue_assets_venue on venue_assets(venue_id);
create index if not exists idx_venue_assets_org on venue_assets(organization_id);
create index if not exists idx_venue_assets_kind on venue_assets(kind);
create index if not exists idx_branding_opps_venue on branding_opportunities(venue_id);
create index if not exists idx_branding_opps_org on branding_opportunities(organization_id);
create index if not exists idx_branding_opps_category on branding_opportunities(category);
create index if not exists idx_venue_restrictions_venue on venue_restrictions(venue_id);
create index if not exists idx_venue_restrictions_opp on venue_restrictions(branding_opportunity_id);
create index if not exists idx_venue_restrictions_org on venue_restrictions(organization_id);
create index if not exists idx_venue_restrictions_type on venue_restrictions(rule_type);


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

-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 4)
-- ----------------------------------------------------------------------------
-- Vendor Readiness Score + Preferred Vendor System (Phase 4 of the Venue
-- Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 8-9). The readiness score feeds marketplace ranking via
-- server/src/lib/vendorReadiness.ts (marketplaceRankingScore); preferred_vendors
-- lets a venue curate the vendors it trusts and preload pricing for them.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, db/schema-vi-p2.sql, or any earlier phase
-- file. New tables only, every create guarded with `if not exists` so re-running
-- is safe. Apply AFTER db/schema.sql (and the earlier phase files) against the
-- same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p4.sql
--
-- Linking:
--   - vendor_readiness hangs off an existing `vendors` row (vendor_id). The
--     authorization boundary is the vendor's owning organization
--     (vendors.organization_id), resolved in server/src/db/vendor-readiness.ts.
--   - preferred_vendors links a `venues` row (venue_id) to a `vendors` row
--     (vendor_id). The authorization boundary is the venue's owning organization
--     (venues.organization_id): only a venue's own org may curate its preferred
--     list, IDOR-checked in the repo before any write.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible structures; numeric for scoring signals.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- vendor_readiness (addendum data model 8) - one row per vendor holding the
-- raw scoring signals plus the computed Vendor Readiness Score (0-100). The
-- score is recomputed and stored by server/src/db/vendor-readiness.ts on every
-- write (computeVendorReadiness in server/src/lib/vendorReadiness.ts is the pure
-- single source of truth for the weighting). Signals:
--   response_speed       0-1  (1 = responds fastest; normalized upstream)
--   quote_speed          0-1  (1 = quotes fastest; normalized upstream)
--   approval_rate        0-1  (share of submitted quotes that get approved)
--   win_rate             0-1  (share of delivered quotes that win the job)
--   profile_completeness 0-1  (how complete the vendor's profile is)
--   reviews_score        0-5  (average review rating)
--   completion_history   0-1  (share of awarded jobs completed cleanly)
--   insurance_uploaded / w9_uploaded  boolean compliance flags
-- ---------------------------------------------------------------------------
create table if not exists vendor_readiness (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid unique references vendors(id) on delete cascade,
  response_speed numeric,
  quote_speed numeric,
  approval_rate numeric,
  win_rate numeric,
  profile_completeness numeric,
  insurance_uploaded boolean default false,
  w9_uploaded boolean default false,
  reviews_score numeric,
  completion_history numeric,
  score int,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- preferred_vendors (addendum data model 9) - a venue-curated list of vendors
-- it trusts, with a tier and optional preloaded pricing. One row per
-- (venue, vendor) pair (unique). Marketplace ranking (marketplaceRankingScore)
-- boosts vendors a venue has marked preferred/exclusive/recommended/approved.
--   tier              preferred | approved | exclusive | recommended
--   preloaded_pricing jsonb - pricing this venue has pre-agreed with the vendor
-- ---------------------------------------------------------------------------
create table if not exists preferred_vendors (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  tier text check (tier in ('preferred', 'approved', 'exclusive', 'recommended')),
  preloaded_pricing jsonb,
  created_at timestamptz default now(),
  unique (venue_id, vendor_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_vendor_readiness_vendor on vendor_readiness(vendor_id);
create index if not exists idx_vendor_readiness_score on vendor_readiness(score);
create index if not exists idx_preferred_vendors_venue on preferred_vendors(venue_id);
create index if not exists idx_preferred_vendors_vendor on preferred_vendors(vendor_id);
create index if not exists idx_preferred_vendors_tier on preferred_vendors(tier);

-- ============================================================================
-- Divini Partners by Divini Group - VENUE INTELLIGENCE schema additions (Phase 5)
-- ----------------------------------------------------------------------------
-- Venue Revenue Inventory + Sponsorship Inventory Marketplace (Phase 5 of the
-- Venue Intelligence + Quote Automation addendum, VENUE-INTELLIGENCE-ADDENDUM.md
-- "Data model" 10-11).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-venue-intelligence.sql, or any earlier phase file. New tables only,
-- every create guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql and db/schema-venue-intelligence.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p5.sql
--
-- Linking: both tables extend an existing `venues` row and are scoped to the
-- owning `organizations` row, exactly like venue_twin and branding_opportunities.
-- venue_id is the venue link; organization_id is the authorization boundary.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- revenue_inventory (addendum data model 10) - a monetizable surface or space
-- at a venue (screen, wall, elevator, pool, rooftop, keycard, VIP, registration,
-- parking, ...). Pricing, availability, photos, audience/impression estimates,
-- and structured restrictions live here. This is the venue's own inventory of
-- monetizable assets, distinct from branding_opportunities (which feed quote
-- automation) and from sponsorship_opportunities (which package these for
-- sponsors in the marketplace).
-- ---------------------------------------------------------------------------
create table if not exists revenue_inventory (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,                          -- screen | wall | elevator | pool | rooftop | keycard | vip | registration | parking | ...
  pricing jsonb,
  availability jsonb,
  photos jsonb,
  audience_size int,
  impression_estimate int,
  restrictions jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- sponsorship_opportunities (addendum data model 11) - a packaged sponsorship
-- the venue offers to sponsors. Audience/impression reach, pricing, deliverables,
-- availability, photos, and a performance_history of past runs. status drives
-- the marketplace: only `open` rows surface in the public-ish browse list.
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_opportunities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  audience_size int,
  impression_estimate int,
  pricing jsonb,
  deliverables jsonb,
  availability jsonb,
  photos jsonb,
  performance_history jsonb,
  status text default 'open' check (status in ('open','paused','closed','draft')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_revenue_inventory_venue on revenue_inventory(venue_id);
create index if not exists idx_revenue_inventory_org on revenue_inventory(organization_id);
create index if not exists idx_revenue_inventory_category on revenue_inventory(category);
create index if not exists idx_sponsorship_opps_venue on sponsorship_opportunities(venue_id);
create index if not exists idx_sponsorship_opps_org on sponsorship_opportunities(organization_id);
create index if not exists idx_sponsorship_opps_category on sponsorship_opportunities(category);
create index if not exists idx_sponsorship_opps_status on sponsorship_opportunities(status);

-- ============================================================================
-- Divini Partners - Venue Intelligence Addendum, PHASE 6 schema additions
-- ----------------------------------------------------------------------------
-- Client event page customization + guest invites + guest-list to vendor
-- auto-sync. A vendor opts in (per event) to receive guest-list updates,
-- headcount, and deposit / payment gating via vendor_event_requirements.
--
-- These statements are ADDITIVE and self-contained. They reuse the existing
-- events, vendors, and guests tables (db/schema.sql + db/schema-phase6.sql).
-- Every statement is guarded with `if not exists` so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vi-p6.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- VENDOR EVENT REQUIREMENTS (Venue Intelligence Addendum, guest-list sync)
-- ---------------------------------------------------------------------------
-- One row per (event, vendor): the vendor declares what they need from this
-- event. needs_guest_list / needs_headcount drive the guest-list auto-sync
-- notification; needs_deposit + the deposit_gate / payment_gate jsonb blobs
-- carry the vendor's gating configuration (the structured rules the vendor
-- requires satisfied before they commit / install).
create table if not exists vendor_event_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  needs_guest_list boolean default false,
  needs_headcount boolean default false,
  needs_deposit boolean default false,
  deposit_gate jsonb,                       -- { amount, percent, due_by, status, ... }
  payment_gate jsonb,                       -- { milestones:[...], terms, ... }
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (event_id, vendor_id)
);

create index if not exists idx_ver_event on vendor_event_requirements(event_id);
create index if not exists idx_ver_vendor on vendor_event_requirements(vendor_id);
create index if not exists idx_ver_guest_list on vendor_event_requirements(needs_guest_list);
create index if not exists idx_ver_headcount on vendor_event_requirements(needs_headcount);


-- ============================================================================
-- Friction Elimination - U1 Client Event Intelligence Assistant
--
-- Persists the generated event plans produced by the deterministic
-- generatePlan() engine (server/src/lib/eventAssistant.ts). One row per
-- generation; a plan may optionally be attached to an event so the workspace
-- becomes the system of record (no re-entering the intake).
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create table if not exists event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  intake jsonb,
  plan jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_event_plans_event on event_plans(event_id);

-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- UPGRADE 3: Venue Comparison Engine (FRICTION-ELIMINATION-ADDENDUM.md U3).
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE. They do not alter any existing table (in
-- particular they do NOT touch venues or venue_twin). New table only, guarded
-- with `if not exists` so re-running is safe. Apply AFTER db/schema.sql and the
-- Venue Intelligence schema (db/schema-venue-intelligence.sql) against the same
-- database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-venue-compare.sql
--
-- Why a new table (not venue_twin columns): the comparison engine needs a small,
-- focused set of cost/inclusion attributes that map cleanly to side-by-side
-- columns and to the Estimated Total Cost heuristic. Keeping them in their own
-- table keeps venue_twin untouched (per the build rules) and lets the venue
-- maintain compare attrs independently of its full digital twin.
--
-- Linking + authorization mirror venue_twin: one row per venue (venue_id unique),
-- and access is scoped through venues.organization_id by the repo
-- (server/src/db/venue-compare.ts), exactly like server/src/db/venue-twin.ts.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money; boolean
-- for simple inclusion flags.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- venue_compare_attrs - one row per venue. The cost/inclusion attributes the
-- Venue Comparison Engine reads to build a side-by-side row and to estimate a
-- total cost (rental + F&B minimum + rough vendor/AV allowances). Everything is
-- nullable: a venue can fill these in incrementally and the engine degrades
-- gracefully when a value is missing.
-- ---------------------------------------------------------------------------
create table if not exists venue_compare_attrs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  rental_cost numeric,              -- base facility/rental fee
  av_included boolean,              -- audio/visual package included in rental
  tables_included boolean,          -- tables included in rental
  furniture_included boolean,       -- chairs/lounge/furniture included in rental
  fnb_minimum numeric,              -- food and beverage minimum spend
  security_required boolean,        -- venue requires (paid) security
  insurance_required boolean,       -- venue requires event insurance / COI
  setup_window jsonb,               -- { hours, day_before, notes, ... }
  teardown_window jsonb,            -- { hours, same_day, notes, ... }
  extras jsonb,                     -- arbitrary extra line items / notes
  updated_at timestamptz default now(),
  unique (venue_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign key + lookup)
-- ---------------------------------------------------------------------------
create index if not exists idx_venue_compare_attrs_venue on venue_compare_attrs(venue_id);

-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- ----------------------------------------------------------------------------
-- Lead Quality Engine (U4) + Verified Lead Program (U5) from
-- FRICTION-ELIMINATION-ADDENDUM.md.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase / venue-intelligence file. New tables only, every create
-- guarded with `if not exists` so re-running is safe. Apply AFTER db/schema.sql
-- (and after the earlier phase / venue-intelligence files) against the same db:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-leads.sql
--
-- Linking: an event inquiry targets an existing `venues` row (and optionally a
-- vendor org) and records the requesting user. A verification badge attaches to
-- any subject (budget / decision_maker / event / company / venue) by id or ref.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- event_inquiries (U4 Lead Quality Engine) - a qualified inbound inquiry.
-- The required fields (event_type, budget_range, guest_count, date_range,
-- decision_maker_name, company, timeline) are enforced at the API layer; the
-- Lead Quality Engine (server/src/lib/leadQuality.ts) derives lead_quality_score
-- (0-100) and intent (high/medium/low) at create time and stores both so venues
-- can rank their inbox without recomputing.
-- ---------------------------------------------------------------------------
create table if not exists event_inquiries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  vendor_id uuid references organizations(id) on delete set null,
  requester_user_id uuid references users(id) on delete set null,
  event_type text,
  budget_range text,
  guest_count int,
  date_range jsonb,
  decision_maker_name text,
  company text,
  timeline text,
  message text,
  lead_quality_score int default 0,
  intent text check (intent in ('high','medium','low')),
  created_at timestamptz default now()
);

create index if not exists idx_event_inquiries_venue on event_inquiries (venue_id);
create index if not exists idx_event_inquiries_vendor on event_inquiries (vendor_id);
create index if not exists idx_event_inquiries_intent on event_inquiries (intent);

-- ---------------------------------------------------------------------------
-- verification_badges (U5 Verified Lead Program) - a verification marker that
-- can attach to any subject type. subject_id is the canonical id when the
-- subject is a row in this database; subject_ref is a free-form reference for
-- subjects without a stable id (e.g. a named decision maker or budget claim).
-- evidence holds the supporting jsonb (documents, notes, source links).
-- ---------------------------------------------------------------------------
create table if not exists verification_badges (
  id uuid primary key default gen_random_uuid(),
  subject_type text check (subject_type in ('budget','decision_maker','event','company','venue')),
  subject_id uuid,
  subject_ref text,
  verified boolean default false,
  verified_by uuid references users(id) on delete set null,
  verified_at timestamptz,
  evidence jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_verification_badges_subject on verification_badges (subject_type, subject_id);

-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema additions
-- ----------------------------------------------------------------------------
-- U9 Vendor Compliance Score + U11 Transparent Preferred Vendor (the "always
-- show WHY" reasons). FRICTION-ELIMINATION-ADDENDUM.md upgrades 9 and 11.
--
-- This EXTENDS the Phase-4 vendor_readiness area (db/schema-vi-p4.sql) without
-- altering it: vendor_compliance is a NEW table holding the richer compliance
-- signals (insurance / COI / W9 status, licenses, reviews, on-time rate,
-- completion history, per-venue ratings) plus a computed Vendor Compliance
-- Score (0-100). The score is recomputed and stored by
-- server/src/db/vendor-compliance.ts on every write (computeVendorCompliance in
-- server/src/lib/vendorCompliance.ts is the pure single source of truth for the
-- weighting). buildPreferredWhy (same lib) turns these stats into the human
-- reasons surfaced on preferred-vendor lists ("83 completed projects",
-- "4.9 average rating", "98% on-time").
--
-- These statements are ADDITIVE. They do not alter any earlier table. New table
-- only, every create guarded with `if not exists` so re-running is safe. Apply
-- AFTER db/schema.sql and db/schema-vi-p4.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-compliance.sql
--
-- Linking + authorization:
--   - vendor_compliance hangs off an existing `vendors` row (vendor_id, unique).
--     The authorization boundary is the vendor's owning organization
--     (vendors.organization_id), resolved in server/src/db/vendor-compliance.ts
--     with the same IDOR assert pattern as the venue twin / vendor readiness.
--
-- Conventions match schema.sql / schema-vi-p4.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); jsonb for flexible structures;
-- numeric/int for scoring signals.
--
-- Signals:
--   insurance_status   text  - 'verified' | 'pending' | 'expired' | 'missing'
--   coi_status         text  - 'verified' | 'pending' | 'expired' | 'missing'
--   w9_status          text  - 'verified' | 'pending' | 'missing'
--   licenses           jsonb - [{ type, number, status, expires_at }, ...]
--   reviews_score      numeric 0-5  (average review rating)
--   on_time_rate       numeric 0-1  (share of jobs delivered on time)
--   completion_history int    count of completed projects (also a quality input)
--   venue_ratings      jsonb - [{ venue_id, rating }, ...] per-venue ratings
--   score              int   0-100 computed Vendor Compliance Score
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists vendor_compliance (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid unique references vendors(id) on delete cascade,
  insurance_status text,
  coi_status text,
  w9_status text,
  licenses jsonb,
  reviews_score numeric,
  on_time_rate numeric,
  completion_history int,
  venue_ratings jsonb,
  score int,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign key + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_vendor_compliance_vendor on vendor_compliance(vendor_id);
create index if not exists idx_vendor_compliance_score on vendor_compliance(score);

-- ============================================================================
-- Friction Elimination - U14 Installation Management + U15 Guest Experience Hub
--
-- Adds a new installation layer (vendor arrival, setup windows, progress,
-- completion photos, removal schedule, venue approval) and a new attendee layer
-- (registration / RSVP / ticketing / QR check-in plus per-event attendee-facing
-- info: schedule, venue map, parking, last-minute updates).
--
-- These are NEW tables. They do NOT touch the existing `guests` table or the
-- event-day check-in flow; they sit alongside them. Backed by
-- server/src/db/installations.ts and server/src/db/guest-hub.ts.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

-- U14 Installation Management ------------------------------------------------
create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  vendor_id uuid,
  arrival_time timestamptz,
  setup_window jsonb,
  status text default 'scheduled',
  progress int default 0,
  completion_photos jsonb,
  removal_schedule jsonb,
  venue_approved boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_installations_event on installations(event_id);
create index if not exists idx_installations_vendor on installations(vendor_id);

-- U15 Guest Experience Hub - attendee registration / RSVP / ticketing --------
create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  attendee_name text,
  email text,
  rsvp_status text default 'pending',
  ticket_type text,
  qr_code text,
  checked_in boolean default false,
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_event_registrations_event on event_registrations(event_id);
create index if not exists idx_event_registrations_email on event_registrations(event_id, email);
create unique index if not exists uq_event_registrations_qr on event_registrations(qr_code);

-- U15 Guest Experience Hub - attendee-facing event info ----------------------
create table if not exists event_info (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  schedule jsonb,
  venue_map_url text,
  parking_info text,
  updates jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_event_info_event on event_info(event_id);

-- ============================================================================
-- Divini Partners by Divini Group - FRICTION ELIMINATION schema (Upgrade 16)
-- ----------------------------------------------------------------------------
-- Sponsorship Intelligence (U16 in FRICTION-ELIMINATION-ADDENDUM.md). This
-- EXTENDS the Phase 5 Sponsorship Inventory Marketplace (db/schema-vi-p5.sql)
-- without altering it: it adds a single metrics table that hangs off an existing
-- sponsorship_opportunities row and carries the intelligence signals U16 calls
-- for (impressions, audience demographics, historical performance, revenue, and
-- asset availability). recommendSponsorships + matchBrandsToVenues read these
-- metrics alongside sponsorship_opportunities to rank packages for an event.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-vi-p5.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-fe-sponsorship-intel.sql
--
-- Linking + authorization: sponsorship_metrics belongs to a
-- sponsorship_opportunities row (sponsorship_opportunity_id). The authorization
-- boundary is that opportunity's owning venue / organization, resolved in
-- server/src/db/sponsorship-intel.ts (mirrors the revenue-inventory repo's IDOR
-- gate). One row per opportunity (unique) so metrics are an upsert.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sponsorship_metrics (U16) - the intelligence signals for one packaged
-- sponsorship opportunity:
--   impressions            int     - measured / projected total impressions
--   demographics           jsonb   - audience demographic breakdown
--   historical_performance jsonb   - prior runs: sell-through, renewal, results
--   revenue                numeric - revenue this package has produced / is worth
--   asset_availability     jsonb   - which assets are open vs reserved
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_metrics (
  id uuid primary key default gen_random_uuid(),
  sponsorship_opportunity_id uuid unique references sponsorship_opportunities(id) on delete cascade,
  impressions int,
  demographics jsonb,
  historical_performance jsonb,
  revenue numeric,
  asset_availability jsonb,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX (foreign key lookup)
-- ---------------------------------------------------------------------------
create index if not exists idx_sponsorship_metrics_opp on sponsorship_metrics(sponsorship_opportunity_id);


-- ---------- Friction Elimination: events.branding_opportunity_id ----------
alter table events add column if not exists branding_opportunity_id uuid;
create index if not exists idx_events_branding_opportunity on events(branding_opportunity_id);


-- ############################################################################
-- INTELLIGENCE MOAT addendum schemas (appended after schema-fe block)
-- ############################################################################

-- ====== db/schema-im-event-memory.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema
-- ----------------------------------------------------------------------------
-- F1 Event Memory Engine + F10 Post-Event Intelligence
-- (INTELLIGENCE-MOAT-ADDENDUM.md). Every completed event leaves behind a
-- structured memory snapshot, and every stakeholder leaves behind feedback,
-- so future events become faster, smarter, and more profitable.
--
--   event_memory   - one immutable-ish snapshot per event (unique event_id),
--                    assembled from the existing operational tables (events,
--                    event_vendors, quotes, invoices, payments, reviews,
--                    change_orders, installations, sponsorship_opportunities).
--                    The repo recordEventMemory() upserts this row.
--   event_feedback - post-event feedback rows, one per (event, role, author);
--                    role is venue/vendor/planner/sponsor/client/attendee and
--                    drivers is a jsonb bag of success/failure/revenue signals.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-event-memory.sql
--
-- Linking + authorization: both tables hang off an events row (event_id). The
-- authorization boundary is the event's access set, resolved in
-- server/src/db/event-memory.ts (reuses the events repo getEvent() IDOR gate).
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; numeric for money.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- event_memory (F1) - the durable snapshot of a completed event:
--   event_type        text    - copied from events.type at snapshot time
--   venue_id          uuid    - copied from events.venue_id
--   guest_count       int     - copied from events.guest_count
--   budget            numeric - copied from events.budget
--   vendors_used      jsonb   - array of the vendor stack (event_vendors)
--   sponsors_used     jsonb   - array of sponsorship opportunities at the venue
--   revenue           numeric - rolled up from invoices/payments
--   timeline          jsonb   - status + key dates
--   approvals         jsonb   - approval signals (from change_orders etc.)
--   change_orders     jsonb   - the change-order history
--   contracts         jsonb   - contract pricing / agreements touched
--   install_minutes   int     - install duration derived from installations
--   teardown_minutes  int     - teardown duration derived from installations
--   issues            jsonb   - issues observed (from feedback + change orders)
--   resolutions       jsonb   - how issues were resolved
--   reviews           jsonb   - the reviews left on the event
--   photos            jsonb   - completion photos (from installations)
--   outcome           text    - a short outcome summary (success / mixed / ...)
-- ---------------------------------------------------------------------------
create table if not exists event_memory (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references events(id) on delete cascade,
  event_type text,
  venue_id uuid,
  guest_count int,
  budget numeric,
  vendors_used jsonb,
  sponsors_used jsonb,
  revenue numeric,
  timeline jsonb,
  approvals jsonb,
  change_orders jsonb,
  contracts jsonb,
  install_minutes int,
  teardown_minutes int,
  issues jsonb,
  resolutions jsonb,
  reviews jsonb,
  photos jsonb,
  outcome text,
  created_at timestamptz default now()
);

create index if not exists idx_event_memory_event on event_memory(event_id);
create index if not exists idx_event_memory_type_venue on event_memory(event_type, venue_id);

-- ---------------------------------------------------------------------------
-- event_feedback (F10) - post-event feedback from any stakeholder:
--   role        text  - venue / vendor / planner / sponsor / client / attendee
--   rating      int   - 1..5 overall rating
--   comments    text  - free-text comments
--   drivers     jsonb - structured success/failure/revenue driver signals
-- ---------------------------------------------------------------------------
create table if not exists event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  role text,
  rating int,
  comments text,
  drivers jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_event_feedback_event on event_feedback(event_id);

-- ====== db/schema-im-playbooks.sql ======
-- ============================================================================
-- Intelligence Moat - F2 Event Playbook Engine
--
-- A playbook captures a whole event (venue setup, vendor stack, sponsor
-- package, guest experience, timeline, budget structure, approval workflow,
-- tasks, documents, communications, guest flows) as a reusable, org-owned
-- blueprint. clone-event rehydrates a playbook into a brand new event plus its
-- child rows (timeline / tasks / vendors).
--
-- This COMPLEMENTS the existing event_templates (Phase 7, /templates). Playbooks
-- store a richer jsonb payload than templates and drive the clone-event flow.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- Backed by server/src/db/playbooks.ts + server/src/routes/playbooks.ts.
-- ============================================================================

create table if not exists event_playbooks (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid references organizations(id) on delete set null,
  name text not null,
  template_type text,
  payload jsonb not null default '{}'::jsonb,
  created_from_event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_playbooks_org on event_playbooks(owner_org_id);
create index if not exists idx_event_playbooks_type on event_playbooks(template_type);
create index if not exists idx_event_playbooks_source on event_playbooks(created_from_event_id);
create index if not exists idx_event_playbooks_created on event_playbooks(created_at desc);

-- ====== db/schema-im-warroom.sql ======
-- ============================================================================
-- Intelligence Moat - F3 AI Event War Room
--
-- The war room runs a proactive, per-event health scan. Alerts are computed
-- LIVE every scan from the event's current signals (vendors, insurance,
-- contracts, approvals, payments, documents, permits, timeline, capacity,
-- budget, sponsor deliverables, guest experience). They are NOT stored.
--
-- This table persists only the operator's disposition of an alert code:
-- whether it has been snoozed or resolved (with an optional note). Each scan
-- merges the live alert set with any persisted state for that (event, code).
-- An alert with no row here is treated as 'open'.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create table if not exists event_alert_states (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  alert_code text not null,
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved')),
  note text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz default now(),
  unique (event_id, alert_code)
);

create index if not exists idx_event_alert_states_event on event_alert_states(event_id);

-- ====== db/schema-im-opportunity.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema additions
-- ----------------------------------------------------------------------------
-- Feature 4 (Revenue Leakage Detection) + Feature 13 (Opportunity Engine - daily
-- feed) of the Intelligence Moat addendum (INTELLIGENCE-MOAT-ADDENDUM.md F4, F13).
--
-- These statements are ADDITIVE. They do not alter any existing table. New tables
-- only, every create guarded with `if not exists` so re-running is safe. Apply
-- AFTER db/schema.sql and the venue-intelligence + friction-elimination phases
-- against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-opportunity.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- opportunities (F13 Opportunity Engine) - one actionable opportunity in a
-- role-scoped daily feed. The engine (server/src/lib/opportunityEngine.ts)
-- generates these deterministically from the recommendation engine, revenue
-- leakage scans, and simple relationship/inventory matches.
--
-- Audience scoping: a row is shown to whichever audience it targets. We support
-- three (optional) levels so the same table backs both broad role feeds and
-- precise org/user feeds:
--   audience_role     text  - the role the opportunity is relevant to
--                             (venue | vendor | planner | sponsor | client)
--   audience_org_id   uuid  - when set, only this organization should see it
--   audience_user_id  uuid  - when set, only this user should see it
-- The repo (server/src/db/opportunity.ts) filters on these so a forged feed
-- query from another tenant returns nothing (IDOR-safe).
--
--   kind            text    - the opportunity category (unused_inventory |
--                             revenue_leak | open_project | preferred_request |
--                             audience_match | cost_saving | enhancement | match)
--   title           text    - short, human-readable headline
--   detail          jsonb   - structured payload (ids, amounts, reasons, links)
--   potential_value numeric - estimated dollar upside (0 when not monetary)
--   status          text    - open | dismissed | actioned
--   source          text    - which generator produced it (recommend | leakage |
--                             match | inventory | ...), for analytics + dedupe
-- ---------------------------------------------------------------------------
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  audience_role text,
  audience_org_id uuid references organizations(id) on delete cascade,
  audience_user_id uuid references users(id) on delete cascade,
  kind text,
  title text,
  detail jsonb,
  potential_value numeric,
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  source text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- revenue_scans (F4 Revenue Leakage Detection) - the result of one leakage scan
-- over a venue or an event. potential is the full monetizable ceiling, captured
-- is what is already booked/sold, missed is the gap. suggestions is the ranked
-- list of specific capture ideas (extra sponsor inventory, VIP packages, brand
-- activations, upsells) the scan surfaced. One row per scan run (history kept).
--
--   scope        text  - venue | event
--   scope_id     uuid  - the venue id or event id the scan was run against
--   potential    numeric - total monetizable ceiling
--   captured     numeric - already booked / sold
--   missed       numeric - potential - captured (the leakage)
--   suggestions  jsonb   - ranked capture suggestions [{key,label,value,...}]
-- ---------------------------------------------------------------------------
create table if not exists revenue_scans (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('venue','event')),
  scope_id uuid,
  potential numeric,
  captured numeric,
  missed numeric,
  suggestions jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (audience filters + common lookups)
-- ---------------------------------------------------------------------------
create index if not exists idx_opportunities_role on opportunities(audience_role);
create index if not exists idx_opportunities_org on opportunities(audience_org_id);
create index if not exists idx_opportunities_user on opportunities(audience_user_id);
create index if not exists idx_opportunities_status on opportunities(status);
create index if not exists idx_opportunities_kind on opportunities(kind);
create index if not exists idx_opportunities_created on opportunities(created_at);

create index if not exists idx_revenue_scans_scope on revenue_scans(scope, scope_id);
create index if not exists idx_revenue_scans_created on revenue_scans(created_at);

-- ====== db/schema-im-relationship.sql ======
-- Intelligence Moat addendum - F5 Relationship Intelligence Graph.
--
-- A single directed edge table linking any two entities (organizations, venues,
-- vendors, sponsors, planners, agencies, brands, clients, contacts). Edges are
-- derived deterministically from existing data (events + event_vendors,
-- preferred_vendors, sponsorship_opportunities, quotes/invoices) by
-- server/src/db/relationship.ts (rebuildEdges) and surfaced as an interactive
-- graph + insight strings.
--
-- Additive only. No existing tables are modified. The lead wires this file into
-- db/apply-all.sql.

create table if not exists relationship_edges (
  id uuid primary key default gen_random_uuid(),
  -- Owning org so the graph is org-scoped (IDOR-safe). Derived rows always set
  -- this to the org that the recompute ran for.
  organization_id uuid references organizations(id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,
  edge_type text not null check (edge_type in (
    'worked_together','referred_by','preferred','sponsor_history','past_projects',
    'partnership','revenue','introduction','collaboration')),
  weight int not null default 1,
  revenue numeric not null default 0,
  last_at timestamptz,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (from_type, from_id, to_type, to_id, edge_type)
);

create index if not exists idx_relationship_edges_from on relationship_edges (from_type, from_id);
create index if not exists idx_relationship_edges_to on relationship_edges (to_type, to_id);
create index if not exists idx_relationship_edges_org on relationship_edges (organization_id);

-- ====== db/schema-im-divini-score.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema (Feature 12)
-- ----------------------------------------------------------------------------
-- Divini Score (F12 in INTELLIGENCE-MOAT-ADDENDUM.md). A proprietary, dynamic
-- per-entity trust / performance score. One cached row per entity holds the
-- latest 0-100 score plus a jsonb breakdown of the factors that produced it.
--
-- The score is NOT a new source of truth: it AGGREGATES signals already stored
-- elsewhere (vendor_readiness, vendor_compliance, venue_twin, reviews, events,
-- payments, invoices, sponsorship_metrics, ...). The score function lives in
-- server/src/lib/diviniScore.ts (pure); the gather + upsert logic lives in
-- server/src/db/divini-score.ts. This table is just the cache, recomputed on
-- write (and on demand via the recompute route).
--
-- entity_type is one of: venue | vendor | planner | sponsor | client.
--   - venue   -> a venues row (entity_id = venues.id)
--   - vendor  -> a vendors row (entity_id = vendors.id)
--   - planner -> a users row with role planner (entity_id = users.id)
--   - sponsor -> an organizations row that sponsors (entity_id = organizations.id)
--   - client  -> a users row with role client (entity_id = users.id)
-- entity_id is stored untyped (uuid) because it points at different tables by
-- entity_type; the repo validates existence + authorization per type.
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql (and the VI / FE phase schemas) against the same DB:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-divini-score.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible component breakdown; int for the score.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- divini_scores (F12) - the cached Divini Score for one entity:
--   entity_type   text   - venue | vendor | planner | sponsor | client
--   entity_id     uuid   - id in the table implied by entity_type (see above)
--   score         int    - the 0-100 Divini Score
--   components    jsonb  - per-factor breakdown { key, label, weight, earned }[]
--                          plus any raw signals the score read, for transparency
--   updated_at    timestamptz - last recompute time
-- One row per (entity_type, entity_id) so the score is an upsert.
-- ---------------------------------------------------------------------------
create table if not exists divini_scores (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'venue', 'vendor', 'planner', 'sponsor', 'client')),
  entity_id uuid not null,
  score int not null default 0,
  components jsonb,
  updated_at timestamptz default now(),
  unique (entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (composite lookup + score sort for leaderboards/overview)
-- ---------------------------------------------------------------------------
create index if not exists idx_divini_scores_entity
  on divini_scores(entity_type, entity_id);
create index if not exists idx_divini_scores_type_score
  on divini_scores(entity_type, score desc);

-- ====== db/schema-im-approvals.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema additions
-- ----------------------------------------------------------------------------
-- Feature 9: Approval Graph Engine (INTELLIGENCE-MOAT-ADDENDUM.md F9).
--
-- Two tables turn ad hoc sign-offs into a routed, escalatable approval graph:
--   - approval_contacts:  the people who own a given approval TYPE for an org
--                         and/or a venue (venue / branding / sponsor /
--                         engineering / insurance / legal / finance). A contact
--                         may be scoped to an org, a venue, or both.
--   - approval_requests:  one approval ask per event + type, routed to a chosen
--                         contact, with a visibility status (submitted ->
--                         pending -> approved / rejected / requires_revision)
--                         and an escalation flag for stalled requests.
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql (and the
-- earlier phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-approvals.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); text + CHECK for enums. organization_id / venue_id are the
-- authorization boundaries, exactly like events.organization_id and venue_twin.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- approval_contacts - the owner of an approval TYPE for an org and/or a venue.
-- org_id and venue_id are both nullable so a contact can be org-wide,
-- venue-specific, or both. approval_type is the routing key.
-- ---------------------------------------------------------------------------
create table if not exists approval_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  venue_id uuid references venues(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'venue','branding','sponsor','engineering','insurance','legal','finance')),
  name text not null,
  email text,
  role text,
  created_at timestamptz default now()
);

create index if not exists approval_contacts_org_idx on approval_contacts(org_id);
create index if not exists approval_contacts_venue_idx on approval_contacts(venue_id);
create index if not exists approval_contacts_type_idx on approval_contacts(approval_type);

-- ---------------------------------------------------------------------------
-- approval_requests - one approval ask per event + type, routed to a contact.
-- status is the visibility column the board renders. escalated is set when a
-- stalled request is escalated (see lib/approvalGraph buildEscalationCheck).
-- ---------------------------------------------------------------------------
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'venue','branding','sponsor','engineering','insurance','legal','finance')),
  contact_id uuid references approval_contacts(id) on delete set null,
  subject text,
  status text not null default 'submitted' check (status in (
    'submitted','pending','approved','rejected','requires_revision')),
  submitted_at timestamptz default now(),
  decided_at timestamptz,
  notes text,
  escalated boolean default false
);

create index if not exists approval_requests_event_idx on approval_requests(event_id);
create index if not exists approval_requests_type_idx on approval_requests(approval_type);
create index if not exists approval_requests_contact_idx on approval_requests(contact_id);
create index if not exists approval_requests_status_idx on approval_requests(status);

-- ====== db/schema-im-member-attendee.sql ======
-- ============================================================================
-- Intelligence Moat - F7 Founding Member Performance Center
--                    + F11 Attendee Intelligence
--
-- Two additive layers:
--
--   founding_members      : one row per organization that holds founding-member
--                           status, with a jsonb bag of benefit flags. The
--                           performance metrics themselves are NOT stored here;
--                           they are aggregated live from the existing tables
--                           (events, quotes, invoices, payments, reviews,
--                           platform_invites, event_inquiries) by
--                           server/src/db/member-attendee.ts and scored by the
--                           pure module server/src/lib/foundingMember.ts.
--
--   attendee_engagement   : per-registration engagement counters for an event
--                           (booth visits, QR scans, sponsor interactions,
--                           sessions attended, leads, survey response). It sits
--                           ALONGSIDE the existing event_registrations table
--                           (db/schema-fe-install-guest.sql) and references it;
--                           the RSVP / check-in / no-show analytics are derived
--                           from event_registrations, and the richer engagement
--                           signals are layered on from this table.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

-- F7 Founding Member Performance Center --------------------------------------
create table if not exists founding_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  is_founding boolean not null default true,
  benefits jsonb,
  joined_at timestamptz default now()
);

create index if not exists idx_founding_members_org on founding_members(org_id);

-- F11 Attendee Intelligence - per-registration engagement counters -----------
create table if not exists attendee_engagement (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  registration_id uuid references event_registrations(id) on delete cascade,
  booth_visits int default 0,
  qr_scans int default 0,
  sponsor_interactions int default 0,
  sessions_attended int default 0,
  leads int default 0,
  survey_response jsonb,
  updated_at timestamptz default now(),
  unique (event_id, registration_id)
);

create index if not exists idx_attendee_engagement_event on attendee_engagement(event_id);
create index if not exists idx_attendee_engagement_registration on attendee_engagement(registration_id);


-- ====== db/schema-coo-tasks.sql ======
-- =============================================================================
-- Divini AI COO (V2) - Automated Executive Tasks
--
-- Additive schema for the AI COO layer. coo_tasks holds generated, ranked-by-
-- impact executive tasks produced by the cooTasks engine from the per-user COO
-- briefing (today's priorities, revenue opportunities, risks, approvals,
-- follow-ups, expiring contracts, sponsorship + partnership opportunities). The
-- briefing + dashboard themselves are computed live from the existing engines;
-- only the generated tasks (with their open|done|dismissed disposition) persist
-- here so an executive can work the list across sessions.
--
-- Audience-scoped exactly like the opportunities table: a row may target an org
-- (audience_org_id) and/or a single user (audience_user_id). The db layer filters
-- the feed to the acting org/user so a forged request cannot read another
-- tenant's tasks (IDOR-safe). create-if-not-exists so re-applying is safe.
-- =============================================================================

create table if not exists coo_tasks (
  id uuid primary key default gen_random_uuid(),
  audience_org_id uuid references organizations(id) on delete cascade,
  audience_user_id uuid references users(id) on delete cascade,
  title text not null,
  action_type text,
  detail jsonb,
  impact_score int default 0,
  status text check (status in ('open', 'done', 'dismissed')) default 'open',
  due_at timestamptz,
  source text,
  created_at timestamptz default now()
);

-- Feed lookups are by audience (org / user) filtered to open, ranked by impact.
create index if not exists idx_coo_tasks_org on coo_tasks(audience_org_id);
create index if not exists idx_coo_tasks_user on coo_tasks(audience_user_id);
create index if not exists idx_coo_tasks_status on coo_tasks(status);
create index if not exists idx_coo_tasks_impact on coo_tasks(impact_score desc);


-- ====== db/schema-coo-revenue.sql ======
-- ============================================================================
-- Divini Partners - Divini AI COO V2: Revenue Intelligence + Forecasting.
-- ADDITIVE ONLY. Apply AFTER db/schema.sql (and the phase + im + fe files).
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-revenue.sql
--
-- This file adds ONE optional cache table. The Revenue Intelligence Engine and
-- the Forecasting Engine compute live over the existing events / quotes /
-- invoices / payments tables on every request; this table only exists so a
-- materialized monthly rollup can be cached if the live aggregation ever needs
-- to be amortized. Nothing in V2 requires reading from it. All guarded with
-- IF NOT EXISTS so re-runs are safe.
-- ============================================================================

-- ---------- revenue_snapshots (NEW, optional cache) ----------
-- A point-in-time snapshot of the computed metrics for an org + period. period
-- is a free text key (e.g. a month '2026-06', or 'trends'/'forecast' for the
-- whole engine output). metrics holds the engine output verbatim as jsonb.
create table if not exists revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  period text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Lookup by org + period (most-recent-first reads).
create index if not exists idx_revenue_snapshots_org_period
  on revenue_snapshots(org_id, period, created_at desc);


-- ====== db/schema-coo-health.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - DIVINI AI COO V2 schema
-- ----------------------------------------------------------------------------
-- Business Health Score (AI-COO-V2-ROADMAP.md, section 3). An ORG-LEVEL
-- executive health score 0-100 for the whole organization, DISTINCT from the
-- per-entity Divini Score (db/schema-im-divini-score.sql + lib/diviniScore.ts).
-- The Divini Score rates one venue/vendor/planner/sponsor/client; this score
-- answers "how healthy is the business this org runs" across revenue, activity,
-- pipeline, contracts, referrals, bookings, retention, response speed, and
-- compliance.
--
-- Like the Divini Score this is NOT a new source of truth: it AGGREGATES
-- signals already stored elsewhere (events, quotes, invoices, payments,
-- platform_invites, contract_pricing, vendor_readiness, vendor_compliance,
-- reviews). The pure score function lives in server/src/lib/businessHealth.ts;
-- the gather + upsert logic lives in server/src/db/business-health.ts. This
-- table is just the cache, recomputed on write (and on demand via /recompute).
--
-- These statements are ADDITIVE. They do not alter any earlier-phase table. New
-- table only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql (and the VI / FE / IM phase schemas) against the
-- same DB:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-health.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible component + recommendation payloads;
-- int for the score.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- business_health_scores - the cached org-level executive health score:
--   org_id          uuid  - the organization the score is for (unique = upsert)
--   score           int   - the 0-100 Business Health Score
--   components       jsonb - per-dimension breakdown
--                            { key, label, weight, earned, value, detail }[]
--   recommendations jsonb - prioritized recommendation list
--                            { key, priority, title, detail }[]
--   updated_at       timestamptz - last recompute time
-- One row per org so the score is an upsert (org_id unique).
-- ---------------------------------------------------------------------------
create table if not exists business_health_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  score int not null default 0,
  components jsonb,
  recommendations jsonb,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX (org lookup; the unique constraint already indexes org_id, this adds
-- an explicit named index to match the conventions of the other phases).
-- ---------------------------------------------------------------------------
create index if not exists idx_business_health_scores_org
  on business_health_scores(org_id);


-- ====== db/schema-coo-market.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - AI COO V2 schema additions (Pricing +
-- Marketplace Intelligence)
-- ----------------------------------------------------------------------------
-- Part of the Divini AI COO V2 Executive Intelligence Layer
-- (AI-COO-V2-ROADMAP.md item 4: Pricing Intelligence + Marketplace
-- Intelligence). This layer is deterministic-first: Pricing + Marketplace
-- Intelligence are computed LIVE from the existing marketplace tables (quotes,
-- quote_drafts, bids, events, vendors, venues, sponsorship_opportunities,
-- event_vendors, reviews) on every request. This file adds only an OPTIONAL
-- cache table so an assembled report can be snapshotted; nothing depends on it
-- existing with rows.
--
-- These statements are ADDITIVE. They do not alter any existing table. New
-- table only, guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql (and the other phase files) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-coo-market.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for the flexible report payload; text for the scope +
-- period descriptors.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- market_reports - optional cache of an assembled Pricing/Marketplace report.
--   scope   : a free-text descriptor of what the report covers, e.g.
--             'pricing:org:<id>', 'marketplace:ecosystem'. NOT a tenant key the
--             engines read back for authorization - org-scoping is enforced in
--             the query layer (server/src/db/market-intel.ts), this column is a
--             label only.
--   period  : the period the report describes, e.g. '2026-06' or 'rolling-90d'.
--   data    : the full report payload (the same shape the route returns).
-- The engines compute live; writing to this table is optional and a miss simply
-- means "recompute". No foreign keys: a report is a self-contained snapshot.
-- ---------------------------------------------------------------------------
create table if not exists market_reports (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  period text,
  data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_market_reports_scope on market_reports(scope, created_at desc);

-- ====== db/schema-im-feedback-vendor.sql ======
-- ============================================================================
-- Per-vendor feedback granularity (F10 follow-on). Additive: one nullable
-- column + one index on event_feedback so a feedback row can target ONE vendor.
-- NULL keeps the legacy event-level behavior (counts for all vendors on the
-- event). Idempotent; no existing column is dropped or altered. Membership of
-- target_vendor_id in the event is validated in the app layer against
-- event_vendors (server/src/db/event-memory.ts), which is also the IDOR gate.
-- ============================================================================

create extension if not exists pgcrypto;

alter table event_feedback add column if not exists target_vendor_id uuid;

create index if not exists idx_event_feedback_target_vendor on event_feedback(target_vendor_id);

-- ====== db/schema-vt-p1.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - VENDOR TEAMS schema additions (Phase 1, WS-A)
-- ----------------------------------------------------------------------------
-- Workstream A of the Phase 1 platform upgrade: Vendor internal Teams + Account
-- Ownership + Intake Routing + multi-stage Quote Approval. These tables give a
-- vendor org an internal team (members with a vendor sub-role from
-- server/src/lib/vendorPermissions.ts), let it assign members as owners of
-- venues/clients/events, and track an internal Sales -> PM -> Vendor approval
-- chain that wraps AROUND the existing quote_drafts lifecycle (it does NOT alter
-- quote_drafts; readiness is gated, the existing vendor_approved/client_delivered
-- flow proceeds unchanged).
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql or
-- any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql and the
-- earlier phase files (it references organizations, users, and quote_drafts):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-vt-p1.sql
--
-- Linking + authorization boundary:
--   - vendor_team_members hangs off an organization (organization_id). The
--     team member is a person inside that vendor org. The vendor_role string is
--     validated against VENDOR_TEAM_ROLES in the repo before any write; the DB
--     keeps it free text to stay decoupled from the code-side matrix.
--   - vendor_account_assignments links a member to a subject (venue|client|event)
--     by id. Authorization boundary is the member's organization_id; only that
--     org may assign/list its own members.
--   - quote_approvals hangs off a quote_drafts row (quote_draft_id) and carries
--     its own organization_id (the acting vendor org) for scoping. The existing
--     quote_drafts table and enum are untouched.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); text + CHECK for small enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- vendor_team_members - a person inside a vendor org with a vendor sub-role.
-- user_id is optional (a member may be added by email before they have a user
-- row). status: active | invited | removed (soft-delete keeps the audit trail).
-- vendor_role is validated against VENDOR_TEAM_ROLES in the repo.
-- ---------------------------------------------------------------------------
create table if not exists vendor_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  email text,
  name text,
  vendor_role text,
  status text default 'active',
  created_at timestamptz default now()
);

create index if not exists idx_vendor_team_members_org on vendor_team_members(organization_id);
create index if not exists idx_vendor_team_members_user on vendor_team_members(user_id);

-- ---------------------------------------------------------------------------
-- vendor_account_assignments - a team member owns/collaborates/backs up an
-- account (a venue, client org, or event). role: owner | collaborator | backup.
-- Unique on (member, subject_type, subject_id) so a member holds one role per
-- subject. assigned_by is the member/user who created the assignment.
-- ---------------------------------------------------------------------------
create table if not exists vendor_account_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  member_id uuid references vendor_team_members(id) on delete cascade,
  subject_type text check (subject_type in ('venue', 'client', 'event')),
  subject_id uuid,
  role text default 'owner' check (role in ('owner', 'collaborator', 'backup')),
  assigned_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique (member_id, subject_type, subject_id)
);

create index if not exists idx_vendor_assignments_org on vendor_account_assignments(organization_id);
create index if not exists idx_vendor_assignments_subject
  on vendor_account_assignments(organization_id, subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- quote_approvals - the internal Sales -> PM -> Vendor approval chain for a
-- quote_drafts row. One row per stage. stage: sales | pm | vendor.
-- status: pending | approved | rejected. When all three stages are approved the
-- chain is complete and the existing quote_drafts vendor_approved flow may
-- proceed (this layer gates readiness; it never edits quote_drafts).
-- ---------------------------------------------------------------------------
create table if not exists quote_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_draft_id uuid references quote_drafts(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  stage text check (stage in ('sales', 'pm', 'vendor')),
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approver_member_id uuid references vendor_team_members(id) on delete set null,
  note text,
  decided_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_quote_approvals_draft on quote_approvals(quote_draft_id);
create index if not exists idx_quote_approvals_org on quote_approvals(organization_id);

-- ====== db/schema-np-p1.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT / CHARITY CORE schema (Phase 1)
-- ----------------------------------------------------------------------------
-- Workstream B of the Phase 1 platform upgrade: the Nonprofit / Charity core.
-- Fundraising Event Builder, tiered Sponsorship Packages, and Ticket / Table
-- packages for nonprofit organizations (organizations.type = 'nonprofit').
--
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql
-- or any earlier phase file. New tables only, every create guarded with
-- `if not exists` so re-running is safe. Apply AFTER db/schema.sql against the
-- same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-p1.sql
--
-- Linking + authorization:
--   * organization_id is the authorization boundary (the owning nonprofit org),
--     exactly like venue_twin / branding_opportunities.
--   * fundraising_events.event_id optionally links a fundraising event to an
--     existing `events` row (db/schema.sql), so guest counts and the broader
--     event lifecycle can be reused without duplicating data. It is nullable: a
--     nonprofit can plan a fundraiser before a platform event exists.
--   * sponsorship_packages / ticket_packages hang off a fundraising_event and
--     are scoped to the same org.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); numeric for money; jsonb for flexible/nested fields; text +
-- CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- fundraising_events - a nonprofit's fundraising event (gala, luncheon, golf
-- outing, auction, ...). Overlays an existing `events` row when one exists
-- (event_id), otherwise stands alone. goal_amount drives the dashboard rollup;
-- budget feeds the net (revenue - budget) figure.
-- ---------------------------------------------------------------------------
create table if not exists fundraising_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  cause text,
  kind text check (kind in (
    'gala','fundraiser','luncheon','golf','auction','conference',
    'community','awareness','donor_dinner')),
  goal_amount numeric default 0,
  budget numeric default 0,
  event_date timestamptz,
  guest_target int,
  status text default 'draft',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- sponsorship_packages - a tiered sponsorship offering for a fundraising event.
-- A NEW tiered layer distinct from sponsorship_opportunities (the venue-side
-- marketplace inventory). benefits jsonb captures logo placement, tickets,
-- booth, speaking, social mentions, signage, program inclusion, etc.
-- fulfillment_checklist jsonb is a template list of fulfillment steps the
-- nonprofit owes the sponsor. sold tracks how many of `quantity` are committed.
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_packages (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  tier text check (tier in ('presenting','gold','silver','bronze','in_kind','vendor')),
  name text,
  price numeric default 0,
  benefits jsonb default '{}'::jsonb,
  tickets_included int default 0,
  quantity int default 1,
  sold int default 0,
  fulfillment_checklist jsonb default '[]'::jsonb,
  status text default 'open',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- ticket_packages - ticket / table offerings for a fundraising event
-- (individual seat, VIP seat, full table, sponsor table). seats is the number
-- of attendees a single package admits; quantity is how many of this package
-- are available; sold tracks how many are committed.
-- ---------------------------------------------------------------------------
create table if not exists ticket_packages (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  type text check (type in ('individual','vip','table','sponsor_table')),
  price numeric default 0,
  seats int default 1,
  quantity int default 0,
  sold int default 0,
  status text default 'open',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_fundraising_events_org on fundraising_events(organization_id);
create index if not exists idx_fundraising_events_event on fundraising_events(event_id);
create index if not exists idx_sponsorship_packages_fevent on sponsorship_packages(fundraising_event_id);
create index if not exists idx_sponsorship_packages_org on sponsorship_packages(organization_id);
create index if not exists idx_ticket_packages_fevent on ticket_packages(fundraising_event_id);
create index if not exists idx_ticket_packages_org on ticket_packages(organization_id);

-- ====== db/schema-np-sponsor.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - SPONSOR PORTAL schema additions (Workstream C)
-- ----------------------------------------------------------------------------
-- The sponsor-facing side of the nonprofit fundraising model: a sponsor browses
-- the sponsorship_packages offered for a fundraising event (those tables are
-- created by Workstream B and aggregated into apply-all.sql), expresses interest,
-- advances through agreement + payment, uploads brand assets, allots guests, and
-- the nonprofit tracks fulfillment to delivery.
--
-- These statements are ADDITIVE. They do not alter any existing table. New tables
-- only, every create guarded with `if not exists` so re-running is safe. Apply
-- AFTER db/schema.sql (organizations, users, documents, payments) and the
-- Workstream B sponsorship schema against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-sponsor.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); jsonb for flexible/nested fields; text + CHECK for enums.
--
-- Cross-workstream note: sponsorship_package_id and fundraising_event_id point at
-- tables owned by Workstream B. We intentionally do NOT add FK constraints to
-- those tables here so this file applies independently of B's apply order; the
-- integration lead's apply-all.sql guarantees both exist at runtime.
--
-- Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sponsor_purchases - one sponsor's engagement with one sponsorship package.
-- The lifecycle moves: interested -> agreed -> paid -> fulfilled (or cancelled).
--
--   sponsorship_package_id uuid  - the Workstream B package being sponsored
--   fundraising_event_id   uuid  - the B event for context (nullable; resolved
--                                  from the package when available)
--   sponsor_org_id         uuid  - the sponsor's own organization (IDOR anchor)
--   status                 text  - interested | agreed | paid | fulfilled | cancelled
--   agreement_doc_id       uuid  - documents.id of the signed sponsorship agreement
--   logo_url               text  - sponsor logo asset (storage/url convention)
--   ad_file_url            text  - sponsor ad / artwork asset
--   guest_allotment        int   - seats the package includes for the sponsor
--   payment_id             uuid  - payments.id once a checkout is initiated/recorded
--   amount                 numeric - the agreed sponsorship amount
-- ---------------------------------------------------------------------------
create table if not exists sponsor_purchases (
  id uuid primary key default gen_random_uuid(),
  sponsorship_package_id uuid,
  fundraising_event_id uuid,
  sponsor_org_id uuid references organizations(id) on delete cascade,
  status text not null default 'interested'
    check (status in ('interested','agreed','paid','fulfilled','cancelled')),
  agreement_doc_id uuid references documents(id) on delete set null,
  logo_url text,
  ad_file_url text,
  guest_allotment int default 0,
  payment_id uuid,
  amount numeric default 0,
  created_at timestamptz default now()
);

create index if not exists idx_sponsor_purchases_org on sponsor_purchases(sponsor_org_id);
create index if not exists idx_sponsor_purchases_package on sponsor_purchases(sponsorship_package_id);

-- ---------------------------------------------------------------------------
-- sponsor_fulfillment_tasks - the deliverables the nonprofit must complete for a
-- sponsor_purchase (logo placement, program ad, signage, booth, social mentions).
-- Seeded from the package's fulfillment_checklist jsonb when a purchase is
-- created/paid (see server/src/lib/sponsorFulfillment.ts), then worked by the
-- nonprofit through the status ladder.
--
--   sponsor_purchase_id uuid  - parent purchase (IDOR anchor)
--   label               text  - the deliverable (e.g. "Logo on step-and-repeat")
--   status              text  - not_started | in_progress | waiting_on_sponsor
--                               | completed | issue
--   due_date            timestamptz - when the deliverable is due (nullable)
--   completed_at        timestamptz - set when the task moves to completed
-- ---------------------------------------------------------------------------
create table if not exists sponsor_fulfillment_tasks (
  id uuid primary key default gen_random_uuid(),
  sponsor_purchase_id uuid references sponsor_purchases(id) on delete cascade,
  label text,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','waiting_on_sponsor','completed','issue')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_sponsor_fulfillment_purchase on sponsor_fulfillment_tasks(sponsor_purchase_id);

-- ====== db/schema-np-auction.sql ======
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

-- ====== db/schema-np-volunteer.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT VOLUNTEER MANAGEMENT (Phase 2)
-- ----------------------------------------------------------------------------
-- Volunteer roster + per-volunteer task lists for a nonprofit org's fundraising
-- events. A volunteer optionally links to a fundraising_events row (the event
-- they are helping run) and is always scoped to the owning nonprofit org via
-- organization_id (the authorization boundary).
--
-- These statements are ADDITIVE. They do not alter any existing table. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-np-p1.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-volunteer.sql
--
-- Conventions match schema.sql / schema-np-p1.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); text + CHECK for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- volunteers - a person who registered to help run a fundraising event. The
-- link to fundraising_events is optional (a nonprofit can build a general
-- volunteer roster before an event exists); organization_id is the owning
-- nonprofit org and the authorization boundary. status walks the lifecycle:
-- registered -> assigned (role + shift set) -> checked_in (on event day), with
-- no_show / cancelled as terminal states.
-- ---------------------------------------------------------------------------
create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  emergency_contact text,
  role text,
  shift text,
  status text default 'registered' check (status in (
    'registered','assigned','checked_in','no_show','cancelled')),
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- volunteer_tasks - a simple per-volunteer checklist (setup, greeting, teardown,
-- ...). status is open -> done. Scoped through the parent volunteer (whose
-- organization_id is the authorization boundary).
-- ---------------------------------------------------------------------------
create table if not exists volunteer_tasks (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid references volunteers(id) on delete cascade,
  label text,
  status text default 'open' check (status in ('open','done')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_volunteers_org on volunteers(organization_id);
create index if not exists idx_volunteers_fevent on volunteers(fundraising_event_id);
create index if not exists idx_volunteer_tasks_volunteer on volunteer_tasks(volunteer_id);

-- ====== db/schema-np-donor.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - NONPROFIT DONOR + DONATIONS + FOLLOW-UP
-- schema (Phase 2). Donor + donation tracking, post-event follow-up workflows,
-- and the automated recap report layer for nonprofit fundraising.
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE. They do not alter any table in db/schema.sql,
-- db/schema-np-p1.sql, db/schema-np-auction.sql, or any other phase file. New
-- tables only, every create guarded with `if not exists` so re-running is safe.
-- Apply AFTER db/schema.sql and db/schema-np-p1.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-np-donor.sql
--
-- Linking + authorization:
--   * organization_id is the authorization boundary (the owning nonprofit org),
--     exactly like fundraising_events / sponsorship_packages.
--   * donations optionally link to a fundraising_event (fundraising_event_id)
--     and to a donor (donor_id). Both nullable so a one-off gift with no donor
--     record and no event still records cleanly.
--   * followup_tasks optionally link to a fundraising_event - they are the
--     post-event follow-up checklist a nonprofit works after a fundraiser.
--
-- Conventions match schema.sql / schema-np-p1.sql: uuid PKs via
-- gen_random_uuid(); timestamptz default now(); numeric for money; text + CHECK
-- for enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- donors - a constituent / supporter record for a nonprofit org. total_given
-- and last_gift_at are denormalized rollups maintained when a donation is
-- recorded, so the donor list shows lifetime giving without re-aggregating.
-- ---------------------------------------------------------------------------
create table if not exists donors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  email text,
  phone text,
  total_given numeric default 0,
  last_gift_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- donations - a single gift recorded for a nonprofit org. Optionally tied to a
-- fundraising_event (for per-event totals) and a donor (for lifetime rollups).
-- amount is the gift value; method is free text (cash, check, card, in_kind,
-- pledge, ...). status moves recorded -> received once funds clear, or refunded.
-- ---------------------------------------------------------------------------
create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  donor_id uuid references donors(id) on delete set null,
  amount numeric default 0,
  method text,
  status text default 'recorded' check (status in ('recorded','received','refunded')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- followup_tasks - a post-event follow-up workflow item for a fundraising
-- event. Generated as a checklist (thank-you, donor receipts, sponsor recap,
-- monthly giving invite, next-event invite, volunteer thanks, board report,
-- fundraising summary) and advanced manually (no background job). target is a
-- free-text recipient/segment label; status tracks completion.
-- ---------------------------------------------------------------------------
create table if not exists followup_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  fundraising_event_id uuid references fundraising_events(id) on delete set null,
  kind text check (kind in (
    'thank_you','donor_receipt','sponsor_recap','monthly_giving_invite',
    'next_event_invite','volunteer_thanks','board_report','fundraising_summary')),
  target text,
  status text default 'pending' check (status in ('pending','sent','done','skipped')),
  due_date timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES (foreign keys + common filters)
-- ---------------------------------------------------------------------------
create index if not exists idx_donors_org on donors(organization_id);
create index if not exists idx_donations_org on donations(organization_id);
create index if not exists idx_donations_fevent on donations(fundraising_event_id);
create index if not exists idx_donations_donor on donations(donor_id);
create index if not exists idx_followup_tasks_org on followup_tasks(organization_id);
create index if not exists idx_followup_tasks_fevent on followup_tasks(fundraising_event_id);


-- ============================================================================
-- Divini Partners - Anti-Circumvention tracking (Module 4)
-- ----------------------------------------------------------------------------
-- Records each platform-formed relationship (an "introduction") so the platform
-- can detect off-platform circumvention: party A and party B met THROUGH Divini
-- Partners, and a non-circumvention window applies for `window_months` from the
-- introduction. Super admins can flag, investigate, and suspend on a row without
-- ever hard-deleting it (the trail is the evidence).
--
-- This file is ADDITIVE. It does not ALTER any existing table. Every statement
-- is guarded so re-running is safe.
--
-- APPLY (after db/schema.sql):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-anticirc.sql
--
-- Fee transparency (Module 3) is pure-compute (server/src/lib/platformFees.ts +
-- server/src/lib/fees.ts) and needs no tables of its own; it reads the existing
-- organizations.tier / platform_fee_rate columns.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- introductions - one row per platform-formed relationship between two orgs.
-- ---------------------------------------------------------------------------
-- organization_id   the org on whose behalf the introduction was recorded (the
--                   tenant that "owns" the relationship record), nullable.
-- source_partner_id the partner/referrer org that produced the introduction.
-- party_a_org_id /  the two organizations that were introduced to each other.
-- party_b_org_id
-- subject_type      what kind of entity the relationship is about.
-- window_months     non-circumvention window length from introduced_at (default 24).
-- status            active | flagged | cleared | suspended (never hard-deleted).
create table if not exists introductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  source_partner_id uuid references organizations(id) on delete set null,
  party_a_org_id uuid references organizations(id) on delete set null,
  party_b_org_id uuid references organizations(id) on delete set null,
  subject_type text check (subject_type in ('venue','vendor','sponsor','exhibitor','client')),
  subject_id uuid,
  introduced_at timestamptz default now(),
  window_months int default 24,
  status text check (status in ('active','flagged','cleared','suspended')) default 'active',
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_introductions_party_a on introductions(party_a_org_id);
create index if not exists idx_introductions_party_b on introductions(party_b_org_id);
create index if not exists idx_introductions_status on introductions(status);


-- ====== db/schema-rev-partner.sql ======
-- ============================================================================
-- Module 1 - Partner Revenue Share core.
--
-- Partner profiles, editable revenue-share settings, permanent referral
-- attribution, and a PROFIT-BASED commission ledger. The commission engine
-- (server/src/lib/partnerCommission.ts) shares a partner's profit on each
-- referred transaction, where profit = platform fee minus processing cost,
-- never the gross invoice amount.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create extension if not exists pgcrypto;

-- Partner profiles. Each partner has a unique referral code/link and a fully
-- editable revenue-share configuration (commission type, applies-to toggles,
-- subscription mode, effective window, and duration).
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  name text,
  company text,
  partner_type text check (partner_type in (
    'strategic', 'affiliate', 'association',
    'venue_ambassador', 'vendor_ambassador', 'internal_sales'
  )),
  referral_code text unique,
  referral_link text,
  revenue_share_pct numeric default 0,
  commission_type text check (commission_type in (
    'flat', 'percentage', 'subscription_share', 'transaction_share', 'hybrid'
  )) default 'percentage',
  flat_fee_cents bigint default 0,
  applies_subscriptions bool default true,
  applies_transaction_fees bool default true,
  applies_setup_fees bool default false,
  applies_enterprise bool default false,
  subscription_mode text check (subscription_mode in (
    'include', 'exclude', 'first_x_months', 'lifetime', 'custom'
  )) default 'include',
  subscription_months int,
  subscription_share_pct numeric,
  effective_date timestamptz,
  expiration_date timestamptz,
  duration_kind text check (duration_kind in ('lifetime', 'limited')) default 'lifetime',
  status text default 'active',
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_partners_referral_code on partners(referral_code);

-- Permanent referral attribution. A first_touch row is written once when a
-- partner first refers an org and is NEVER overwritten (the unique key plus an
-- on-conflict-do-nothing insert at the application layer guarantee it).
create table if not exists partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  referred_org_id uuid,
  attribution text check (attribution in ('first_touch', 'last_touch', 'conversion')) default 'first_touch',
  referred_at timestamptz default now(),
  unique (partner_id, referred_org_id, attribution)
);

create index if not exists idx_partner_referrals_partner on partner_referrals(partner_id);
create index if not exists idx_partner_referrals_org on partner_referrals(referred_org_id);

-- Profit-based commission ledger. gross_cents is the original invoice for
-- reference only; the commission is computed against net_profit_cents
-- (platform_fee_cents - processing_cost_cents).
create table if not exists partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  referred_org_id uuid,
  source text check (source in (
    'subscription', 'transaction', 'setup', 'enterprise', 'manual_adjustment'
  )),
  gross_cents bigint default 0,
  platform_fee_cents bigint default 0,
  processing_cost_cents bigint default 0,
  net_profit_cents bigint default 0,
  share_pct numeric default 0,
  commission_cents bigint default 0,
  status text default 'pending',
  excluded bool default false,
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_partner_commissions_partner on partner_commissions(partner_id);
create index if not exists idx_partner_commissions_org on partner_commissions(referred_org_id);


-- ====== db/schema-rev-payout.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - STRATEGIC PARTNER ONBOARDING + PAYOUT
-- (Module 1b). Secure partner tax + banking + W-9 collection, and a payout
-- ledger with statuses + admin controls + a super-admin payout dashboard.
-- ----------------------------------------------------------------------------
-- These statements are ADDITIVE and SECURITY-CRITICAL. They do NOT alter any
-- table in db/schema.sql or any earlier phase file. New tables only, every
-- create guarded with `if not exists` so re-running is safe. Apply AFTER
-- db/schema.sql:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-payout.sql
--
-- CROSS-WORKSTREAM (read by NAME at runtime, no FK, may be created by another
-- workstream): `partners` (id, name, company, referral_code, revenue_share_pct)
-- and `partner_commissions` (partner_id, source, net_profit_cents,
-- commission_cents, status, excluded). The payout engine aggregates
-- partner_commissions when present and degrades gracefully when absent. We do
-- NOT create those tables here (another agent owns them) and we deliberately
-- avoid hard foreign keys to them so apply order is unconstrained.
--
-- SECURITY NOTE on banking columns:
--   bank_routing_enc / bank_account_enc store ENCRYPTED tokens ONLY (AES-256-GCM
--   via server/src/lib/bankCrypto.ts). They are NEVER returned to any client.
--   account_last4 is the ONLY plaintext bank fragment and is the only thing a
--   response may expose alongside bank_name + account_type. If PAYOUT_ENC_KEY is
--   unset the app stores only account_last4 and sets enc_configured=false so the
--   onboarding endpoint can warn that full banking was not captured.
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- default now(); text + CHECK for small enums.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- partner_onboarding - one secure onboarding record per partner. A super-admin
-- mints an onboarding_code and shares the private link; the partner submits
-- their legal/tax/banking info against that code. status:
--   awaiting   link created, partner has not submitted yet
--   submitted  partner submitted their info (incl bank + signature)
--   verified   super-admin reviewed + verified the record
-- ---------------------------------------------------------------------------
create table if not exists partner_onboarding (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid,
  onboarding_code     text unique,
  legal_name          text,
  business_name       text,
  email               text,
  phone               text,
  address             text,
  tax_classification  text,           -- e.g. individual | llc | s_corp | c_corp | partnership | nonprofit
  w9_doc_id           uuid,           -- documents.id of the uploaded W-9 (or external doc url ref)
  w9_doc_url          text,           -- signed/relative url convention from storage.ts (optional mirror)
  payment_preference  text,           -- ach | check | paypal | wire
  bank_name           text,
  bank_routing_enc    text,           -- ENCRYPTED token only (never plaintext, never returned)
  bank_account_enc    text,           -- ENCRYPTED token only (never plaintext, never returned)
  account_last4       text,           -- ONLY plaintext bank fragment that may be exposed
  account_type        text,           -- checking | savings
  enc_configured      boolean default true,  -- false when PAYOUT_ENC_KEY was unset at submit time
  agreement_accepted  boolean default false,
  signature           text,           -- typed signature
  signed_at           timestamptz,
  status              text check (status in ('awaiting','submitted','verified')) default 'awaiting',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_partner_onboarding_code on partner_onboarding (onboarding_code);
create index if not exists idx_partner_onboarding_partner on partner_onboarding (partner_id);

-- ---------------------------------------------------------------------------
-- partner_payouts - the payout ledger. One row per partner per period. Amounts
-- are integer cents. net_profit_cents = platform_fees - processing_costs -
-- refunds - chargebacks (the profit basis). commission_owed_cents =
-- net_profit_cents * commission_pct + manual_adjustment_cents (minus excluded,
-- applied during compute). status is the 9-state lifecycle.
-- ---------------------------------------------------------------------------
create table if not exists partner_payouts (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid,
  period                  text,                       -- e.g. 2026-06 (free text)
  gross_volume_cents      bigint default 0,
  platform_fees_cents     bigint default 0,
  processing_costs_cents  bigint default 0,
  refunds_cents           bigint default 0,
  chargebacks_cents       bigint default 0,
  net_profit_cents        bigint default 0,
  commission_pct          numeric default 0,          -- 0..1 (e.g. 0.10 = 10%)
  commission_owed_cents   bigint default 0,
  commission_paid_cents   bigint default 0,
  manual_adjustment_cents bigint default 0,
  status                  text check (status in
                            ('pending','awaiting_tax_info','awaiting_bank_info',
                             'approved','scheduled','paid','held','disputed','cancelled'))
                            default 'pending',
  requires_approval       boolean default true,
  paused                  boolean default false,
  note                    text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_partner_payouts_partner on partner_payouts (partner_id);
create index if not exists idx_partner_payouts_period on partner_payouts (period);

-- ---------------------------------------------------------------------------
-- Exclusion controls. A super-admin can exclude a specific client org or a
-- specific payment from a partner's commission basis. The payout engine honors
-- both when aggregating partner_commissions.
-- ---------------------------------------------------------------------------
create table if not exists payout_excluded_clients (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid,
  excluded_org_id uuid,
  created_at      timestamptz default now()
);
create index if not exists idx_payout_excl_clients_partner on payout_excluded_clients (partner_id);
create unique index if not exists uq_payout_excl_clients
  on payout_excluded_clients (partner_id, excluded_org_id);

create table if not exists payout_excluded_transactions (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid,
  payment_id  uuid,
  created_at  timestamptz default now()
);
create index if not exists idx_payout_excl_tx_partner on payout_excluded_transactions (partner_id);
create unique index if not exists uq_payout_excl_tx
  on payout_excluded_transactions (partner_id, payment_id);


-- ====== db/schema-rev-referral.sql ======
-- Module 2 - Platform Referral Program + Platform Credits.
--
-- Per-user referral links/codes, signup incentives, referrer credits, and a
-- credit ledger restricted to subscription/membership redemptions. Credits are
-- NON-cash, non-transferable, non-withdrawable: there is no payout path, only a
-- redemption applied toward a Divini Partners subscription.
--
-- Additive only. No existing tables are modified. The lead wires this file into
-- db/apply-all.sql (append after the users table is created). gen_random_uuid()
-- comes from pgcrypto.
create extension if not exists pgcrypto;

-- ---------- referral_codes ----------
-- One stable code per user. The referral link is built from this code
-- (PUBLIC_APP_URL/r/:code, or a relative /r/:code when no app URL is set).
create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  code text unique not null,
  created_at timestamptz default now()
);
create index if not exists idx_referral_codes_user on referral_codes (user_id);

-- ---------- user_referrals ----------
-- One row per referral the referrer sends or that is attributed to their code.
-- referred_user_id is filled in once the referred party has an account; until
-- then referred_email holds the invited address. A referral converts once.
create table if not exists user_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid references users(id) on delete cascade,
  referred_user_id uuid references users(id) on delete set null,
  referred_email text,
  code text,
  status text not null default 'pending'
    check (status in ('pending','converted','expired')),
  created_at timestamptz default now(),
  converted_at timestamptz
);
create index if not exists idx_user_referrals_referrer on user_referrals (referrer_user_id);
create index if not exists idx_user_referrals_code on user_referrals (code);

-- ---------- platform_credits ----------
-- Append-only credit ledger. Balance is computed deterministically as
-- sum(earned) - sum(redeemed) - sum(expired). 'pending' rows are NOT spendable
-- (they represent committed-but-not-yet-active value, e.g. the referred user's
-- 50%-off-first-two-months signup incentive that the billing flow consumes).
-- Credits are non-cash: redemption is only ever toward a subscription/membership
-- and there is no row kind that moves money off-platform.
create table if not exists platform_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  amount_cents bigint not null,
  kind text not null
    check (kind in ('earned','redeemed','expired','pending')),
  reason text,
  source_referral_id uuid references user_referrals(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_platform_credits_user on platform_credits (user_id);
create index if not exists idx_platform_credits_referral on platform_credits (source_referral_id);


-- ====== db/schema-rev-compliance.sql ======
-- ============================================================================
-- Divini Partners by Divini Group - REVENUE/COMPLIANCE schema additions
-- (Modules 6/7/8: Audit Viewer + Compliance scaffolding + Revenue Center)
-- ----------------------------------------------------------------------------
-- This file adds the PRIVACY / DATA-SUBJECT compliance tables (GDPR/CCPA-style):
-- privacy_requests, consent_records, data_retention_policies. These are NEW and
-- are distinct from the Phase 8 "compliance" feature (COI / W-9 / e-sign /
-- availability) which lives in db/schema-phase8.sql - that one tracks insurance
-- documents; this one tracks data-subject rights.
--
-- The Audit Viewer (Module 6) and Revenue Center (Module 8) are READ-ONLY over
-- tables that already exist (audit_logs, organizations, payments/invoices,
-- partner_commissions, user_referrals, platform_credits), so they add NO tables.
--
-- All statements are ADDITIVE and idempotent (guarded with `if not exists`).
--
-- APPLY (after db/schema.sql and the referral/partner schemas):
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-rev-compliance.sql
-- (or append the file reference to db/apply-all.sql)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRIVACY / DATA-SUBJECT REQUESTS (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- A workflow record for access / deletion / export / correction requests. A
-- deletion request is a WORKFLOW row (status), NOT an automatic hard-delete:
-- a super-admin reviews and processes it. Either organization_id or user_id (or
-- both) may be null when the requester is anonymous / not yet matched.
create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  requester_email text,
  kind text not null check (kind in ('access','deletion','export','correction')),
  status text not null default 'received'
    check (status in ('received','in_progress','completed','rejected')),
  detail text,
  resolution_note text,
  handled_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_privacy_requests_status on privacy_requests(status);
create index if not exists idx_privacy_requests_org on privacy_requests(organization_id);
create index if not exists idx_privacy_requests_user on privacy_requests(user_id);
create index if not exists idx_privacy_requests_created on privacy_requests(created_at);

-- ---------------------------------------------------------------------------
-- CONSENT RECORDS (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- Append-only consent ledger: each row captures a grant/withdraw event for a
-- named consent type (e.g. 'marketing_email', 'analytics', 'data_processing').
-- The current state for a (user, type) is the most recent row by created_at.
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  consent_type text not null,
  granted boolean not null,
  source text,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_consent_records_user on consent_records(user_id);
create index if not exists idx_consent_records_type on consent_records(consent_type);

-- ---------------------------------------------------------------------------
-- DATA RETENTION POLICIES (Module 7) - NEW
-- ---------------------------------------------------------------------------
-- Declares, per object_type, how long data is retained. organization_id null =
-- a platform-wide default; a non-null org row overrides it for that org.
-- This is a POLICY DECLARATION surface; enforcement (a purge job) is a separate
-- operational concern and is intentionally not automated here.
create table if not exists data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  object_type text not null,
  retention_days int not null,
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_retention_org on data_retention_policies(organization_id);
create index if not exists idx_retention_object on data_retention_policies(object_type);

-- ===== Admin email campaigns (schema-campaigns.sql) =====
-- ============================================================================
-- Admin Email Campaigns - broadcast outreach to discovered businesses.
--
-- A campaign is a named, audience-scoped email (subject + html body) that an
-- admin drafts, sends a TEST of to themselves, and then explicitly approves to
-- send to the resolved audience. The approve-send step is the ONLY place mail
-- goes out to the audience; nothing here auto-sends.
--
-- Audience is resolved at preview/send time from discovered_businesses (public
-- emails only) minus the claim suppression list, so unsubscribe/removal/bounce
-- suppression is always honored. Recipients are snapshotted per send.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audience jsonb not null default '{}'::jsonb,
  subject text not null,
  body_html text not null default '',
  status text not null default 'draft',
  created_by_email text,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  test_sent_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_recipients_campaign on campaign_recipients(campaign_id);
create index if not exists idx_email_campaigns_status on email_campaigns(status);

-- ===== Account agreements (schema-account-agreements.sql) =====
-- ============================================================================
-- Account Agreements - custom per-account partnership / commission deals.
--
-- Lets a super-admin attach a bespoke agreement to a specific account (a
-- venue, vendor, or client) OR to a not-yet-claimed listing (unclaimed
-- profile, e.g. A3 before they claim). Example: "Partnership - 5% on signed
-- contracts". This RECORDS and ATTACHES the agreement (rate + terms + signed
-- doc link); it does not move money. Exactly one of organization_id /
-- unclaimed_profile_id is set per row.
--
-- Additive only. No ALTER of existing tables. Safe to run repeatedly.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists account_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  unclaimed_profile_id uuid references unclaimed_profiles(id) on delete cascade,
  subject_kind text,                 -- venue | vendor | client | other (display hint)
  agreement_type text not null,      -- partnership | referral | revenue_share | custom
  commission_rate numeric(6,3),      -- percent, e.g. 5.000
  applies_to text,                   -- signed_contracts | all_bookings | first_booking | custom
  terms text,
  doc_url text,                      -- link to the signed agreement (Box/Drive/DocuSign)
  status text not null default 'active',  -- active | inactive
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_agreements_subject_ck
    check (organization_id is not null or unclaimed_profile_id is not null)
);

create index if not exists idx_account_agreements_org on account_agreements(organization_id);
create index if not exists idx_account_agreements_profile on account_agreements(unclaimed_profile_id);
create index if not exists idx_account_agreements_status on account_agreements(status);

-- ===== Account agreements v2 (schema-agreements-v2.sql) =====
-- ============================================================================
-- Account Agreements v2 - pricing stack, contracting entity, assigned vendor,
-- and execution (auto-sign). Additive ALTERs only; safe to run repeatedly.
--
-- Pricing stack (computed, not stored): Client Total =
--   partner_price + (partner_price * commission_rate%)  [commission_rate = Divini Margin %]
--   + kickback (percent of partner_price, or flat dollars)
-- ============================================================================

alter table account_agreements add column if not exists contracting_entity text default 'Divini Partners';
alter table account_agreements add column if not exists partner_price_cents bigint;
alter table account_agreements add column if not exists kickback_type text;        -- percent | flat
alter table account_agreements add column if not exists kickback_value numeric(12,3);
alter table account_agreements add column if not exists assigned_vendor_profile_id uuid;
alter table account_agreements add column if not exists assigned_vendor_name text;
alter table account_agreements add column if not exists assigned_vendor_status text default 'unassigned'; -- unassigned | assigned | removed
alter table account_agreements add column if not exists assigned_vendor_removed_reason text;
alter table account_agreements add column if not exists signed_status text default 'unsigned'; -- unsigned | signed
alter table account_agreements add column if not exists signed_at timestamptz;
alter table account_agreements add column if not exists signed_by text;

-- ===== Native email/password auth (schema-native-auth.sql) =====
-- ============================================================================
-- Native email/password authentication (schema-native-auth.sql)
-- ----------------------------------------------------------------------------
-- Replaces Authentik OIDC with native auth on the EXISTING users table. Adds the
-- columns needed for scrypt password hashing, email verification, and password
-- reset. Idempotent, additive ALTERs only: never drops, safe to run repeatedly.
--
-- Apply AFTER db/schema.sql (which defines the users table) against the same db:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-native-auth.sql
--
-- Notes:
--   - password_hash stores the scrypt envelope `scrypt$<saltHex>$<hashHex>`.
--     NEVER store or log plaintext passwords.
--   - email_verified gates login; a user must verify before a session is issued.
--   - oidc_sub stays (legacy / nullable). New native users get a generated uuid
--     id and a null oidc_sub. Legacy Authentik rows are upserted by email so
--     their id + org memberships are preserved.
-- ============================================================================

alter table users add column if not exists password_hash text;
alter table users add column if not exists email_verified boolean default false;
alter table users add column if not exists verify_token text;
alter table users add column if not exists verify_expires timestamptz;
alter table users add column if not exists reset_token text;
alter table users add column if not exists reset_expires timestamptz;

-- Lookups by token (verification + reset) and case-insensitive email upsert.
create index if not exists idx_users_verify_token on users(verify_token);
create index if not exists idx_users_reset_token on users(reset_token);
create index if not exists idx_users_email_lower on users(lower(email));

-- ====== db/schema-lifecycle.sql ======
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

-- ====== db/schema-rev-accrual.sql ======
-- ============================================================================
-- Divini Partners - PLATFORM REVENUE ACCRUAL LEDGER (Money-loop close).
-- Closes the money-loop gap: every recorded on-platform payment accrues the
-- platform fee here (idempotent per source payment) and accrues any agreed
-- referral split into partner_commissions (status 'accrued') via the existing
-- recordCommission engine. RECORD ONLY: nothing here moves money. Additive +
-- idempotent. Apply AFTER payments (schema.sql) + partners (schema-rev-partner).
-- Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists platform_revenue (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'payment'
    check (source in ('payment','external_fee','manual')),
  source_payment_id uuid references payments(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  base_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  fee_basis text,
  fee_rate numeric,
  processing_cost_cents bigint not null default 0,
  referral_partner_id uuid,
  referral_commission_id uuid,
  referral_split_cents bigint not null default 0,
  status text not null default 'accrued'
    check (status in ('accrued','invoiced','collected','waived','void')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_platform_revenue_payment
  on platform_revenue (source_payment_id) where source_payment_id is not null;
create index if not exists idx_platform_revenue_org on platform_revenue (organization_id);
create index if not exists idx_platform_revenue_status on platform_revenue (status);
create index if not exists idx_platform_revenue_partner on platform_revenue (referral_partner_id);
create index if not exists idx_platform_revenue_created on platform_revenue (created_at desc);

-- ====== db/schema-profile-decks-programs.sql ======
-- ============================================================================
-- Divini Partners - PROFILE DECKS + PROGRAMS (every profile: venue, vendor,
-- sponsor, nonprofit).
--
-- (1) profile_decks: pitch decks / marketing collateral uploaded by a profile
--     owner. Files are stored on local disk via the existing storage helper
--     (server/src/storage.ts writeFile + signDownloadUrl), exactly like the
--     native e-signature PDFs. We keep the storage_key (relative disk key) plus
--     an optional file_url for externally hosted collateral, the original file
--     name + content type, a kind label, and a public|private visibility flag.
--     Owner is the organization (organization_id) plus the uploading user
--     (owner_id), mirroring the existing `documents` table party convention.
--
-- (2) profile_programs: custom programs / offerings a profile publishes on its
--     public profile (a named offering with summary, details, price/terms copy,
--     and a call to action). active + sort control whether and where it shows.
--
-- Both tables are organization-scoped. Public reads return only public decks +
-- active programs for a PUBLISHED profile (see server/src/db/profile-extras.ts).
--
-- Additive + idempotent. Apply AFTER db/schema.sql (organizations, users,
-- profiles, profile_slugs, documents) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-profile-decks-programs.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- defaults; on delete cascade to the owning organization. Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- profile_decks ----------
-- A pitch deck or piece of marketing collateral attached to a profile. The
-- bytes live on disk under storage_key (relative key passed to readPath /
-- signDownloadUrl); file_url holds an externally hosted link when there is no
-- uploaded file. visibility 'public' decks render on the public profile.
create table if not exists profile_decks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid references users(id) on delete set null,
  title text not null,
  kind text not null default 'deck'
    check (kind in ('deck','brochure','one_pager','case_study','media_kit','other')),
  storage_key text,
  file_url text,
  file_name text,
  content_type text,
  size_bytes bigint,
  visibility text not null default 'public'
    check (visibility in ('public','private')),
  sort int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_profile_decks_org on profile_decks (organization_id);
create index if not exists idx_profile_decks_visibility on profile_decks (organization_id, visibility);

-- ---------- profile_programs ----------
-- A custom program / offering a profile publishes (named offering with summary,
-- longer details, price/terms copy, and a call to action). active controls
-- whether it shows on the public profile; sort orders the list.
create table if not exists profile_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid references users(id) on delete set null,
  title text not null,
  summary text,
  details text,
  price_terms text,
  cta_label text,
  cta_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profile_programs_org on profile_programs (organization_id);
create index if not exists idx_profile_programs_active on profile_programs (organization_id, active);

-- ============================================================================
-- ====== db/schema-connect-payouts.sql ======
-- Stripe Connect SPLIT-PAYOUT RAIL (1-click admin release). Complementary to
-- schema-rev-payout.sql (the per-period commission ledger): distinct tables, no
-- collisions. Apply AFTER schema.sql, schema-rev-partner.sql, schema-rev-accrual.
-- Idempotent. Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists connect_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_kind text check (owner_kind in ('partner','organization','user')),
  owner_partner_id uuid,
  owner_organization_id uuid,
  owner_user_id uuid,
  stripe_account_id text,
  status text default 'not_started'
    check (status in ('not_started','onboarding','restricted','enabled','disabled')),
  charges_enabled boolean default false,
  payouts_enabled boolean default false,
  details_submitted boolean default false,
  bank_last4 text,
  country text,
  default_currency text default 'usd',
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_kind, owner_partner_id, owner_organization_id, owner_user_id)
);
create index if not exists idx_connect_accounts_partner on connect_accounts (owner_partner_id);
create index if not exists idx_connect_accounts_org on connect_accounts (owner_organization_id);
create index if not exists idx_connect_accounts_user on connect_accounts (owner_user_id);

create table if not exists payout_instructions (
  id uuid primary key default gen_random_uuid(),
  source_revenue_id uuid,
  source_payment_id uuid,
  recipient_kind text check (recipient_kind in ('partner','organization','user')),
  recipient_partner_id uuid,
  recipient_organization_id uuid,
  recipient_user_id uuid,
  connect_account_id uuid references connect_accounts(id) on delete set null,
  basis_cents bigint,
  split_percentage numeric,
  amount_cents bigint,
  currency text default 'usd',
  status text default 'pending'
    check (status in ('pending','ready','releasing','paid','failed','blocked','held','canceled')),
  stripe_transfer_id text,
  failure_reason text,
  released_by text,
  released_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_payout_instructions_status on payout_instructions (status);
create index if not exists idx_payout_instructions_revenue on payout_instructions (source_revenue_id);
create index if not exists idx_payout_instructions_partner on payout_instructions (recipient_partner_id);

create table if not exists connect_payout_audit (
  id uuid primary key default gen_random_uuid(),
  instruction_id uuid,
  actor_email text,
  action text,
  detail jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_connect_payout_audit_instruction on connect_payout_audit (instruction_id);

-- ===== Venue Revenue Share (1% carve-out of platform fee) =====
-- =====================================================================
-- Venue Revenue Share (20% of the platform fee, Pricing V2)
-- ---------------------------------------------------------------------
-- Every on-platform transaction tied to an event hosted at a venue accrues
-- a revenue share to that venue's organization. The share is:
--
--   share_cents = round( platform_fee_cents * 0.20 )   (20% of the fee)
--
-- A fixed 20% of the platform fee on each transaction. At a flat 5% fee that
-- equals 1% of gross. Scales at every booking size and never exceeds the fee.
-- Guarantees:
--   * the payer (client) and the payee (vendor) are never charged more;
--   * the platform's fee line on the transaction can never go negative
--     (the venue share is carved out of the platform fee, "net of fee");
--   * the venue share always scales with the transaction (no flat dollars).
--
-- Self-dealing is skipped: when the venue's own org is the paying party, no
-- share is accrued. Subscriptions and off-platform payments never accrue.
--
-- Written automatically by the monetization hook (lib/monetization.ts),
-- idempotent per source payment. Reconcilable after the fact like the
-- platform_revenue ledger. Zero em dashes.
-- =====================================================================

-- Audit columns on the platform_revenue ledger so the venue carve-out is
-- visible alongside the platform fee on the same row.
alter table platform_revenue add column if not exists venue_org_id uuid;
alter table platform_revenue add column if not exists venue_share_cents bigint not null default 0;
alter table platform_revenue add column if not exists venue_share_rate numeric;

-- Dedicated venue payout ledger (mirrors platform_revenue / partner_commissions).
create table if not exists venue_revenue_share (
  id uuid primary key default gen_random_uuid(),
  source_payment_id uuid not null references payments(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  venue_id uuid references venues(id) on delete set null,
  venue_org_id uuid references organizations(id) on delete set null,
  base_cents bigint not null default 0,          -- gross transaction in cents
  share_rate numeric not null default 0.01,      -- 1% by default
  share_cents bigint not null default 0,         -- min(1% of gross, platform fee)
  platform_fee_cents bigint not null default 0,  -- the fee the share was carved from
  status text not null default 'accrued'
    check (status in ('accrued','invoiced','collected','paid','waived','void')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_payment_id)                     -- one share row per payment (idempotent)
);

create index if not exists idx_venue_revshare_venue_org on venue_revenue_share(venue_org_id);
create index if not exists idx_venue_revshare_event on venue_revenue_share(event_id);
create index if not exists idx_venue_revshare_status on venue_revenue_share(status);

-- ===== Featured Vendor placements (Pricing V2) =====
-- Divini Partners - PRICING V2 Featured Vendor advertising schema (idempotent).
-- Pricing V2 (server PRICING_V2 flag) drops membership tiers and adds one
-- optional ADVERTISING upgrade: Featured Vendor at $49 / month. A featured
-- vendor gets top search placement, a featured badge on marketplace cards,
-- homepage placement, and a preferred-matching ranking boost. Advertising, NOT
-- membership: it never changes platform fees, bid access, or seats.
--
-- Record / track only (existing subscription-entitlement pattern); nothing here
-- moves real money. processor_ref carries the processor sub id once one is wired.
-- ADDITIVE and IDEMPOTENT. Apply AFTER db/schema.sql. Zero em dashes by convention.

create extension if not exists pgcrypto;

-- One current row per vendor org. status: active | cancelled | expired.
-- price_cents defaults to 4900 ($49). current_period_end is the paid-through
-- date; processor_ref is null until a processor is connected.
create table if not exists featured_placements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'expired')),
  price_cents integer not null default 4900,
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  processor_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists featured_placements_org_uniq
  on featured_placements (organization_id);

create index if not exists featured_placements_active_idx
  on featured_placements (status)
  where status = 'active';
