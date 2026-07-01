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
