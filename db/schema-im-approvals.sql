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
