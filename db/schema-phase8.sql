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
