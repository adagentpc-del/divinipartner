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
