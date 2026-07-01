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
  reference text,
  created_at timestamptz default now()
);
-- C5: enforce one payment row per processor reference so a race cannot double
-- record (and double pay out). Partial so multiple NULL references are allowed.
create unique index if not exists uq_payments_reference on payments(reference) where reference is not null;

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

-- ---------------------------------------------------------------------------
-- Guest check-in (event-day headcount)
-- ---------------------------------------------------------------------------
-- The base `guests` table above does not ship check-in tracking. These guarded
-- alters add it so the event-day view can record live arrivals and a headcount.
-- Mirrored in db/apply-all.sql and db/schema-phase6.sql.
alter table guests add column if not exists checked_in boolean default false;
alter table guests add column if not exists checked_in_at timestamptz;
create index if not exists idx_guests_checked_in on guests(event_id, checked_in);
