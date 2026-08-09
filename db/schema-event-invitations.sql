-- ---------------------------------------------------------------------------
-- Counterparty Event Invitations + Event Membership (Divini Partners 63-
-- section Event Operations spec, Phase A items 1-2, 2026-08-09).
--
-- Two new tables, additive only. event_vendors (db/schema-phase3.sql) is left
-- completely unchanged: it stays the org-level "is this org attached to this
-- event" fact, and its unique(event_id, organization_id) upsert semantics
-- (relied on by events.addEventVendor and quotes.createQuote's vendor self-
-- attach) are not touched.
--
--   event_invitations - the PENDING lifecycle. An event owner invites an
--     existing Divini org/user or an external, not-yet-registered email into
--     a specific event with an intended RBAC role. Accepting one creates (or
--     updates) an event_members row; it never fabricates an event_vendors
--     row on its own (that still requires the owner-only addEventVendor path,
--     or the vendor's own quote-submission self-attach).
--
--   event_members - the new per-HUMAN, per-ROLE membership record for an
--     event. event_vendors answers "is org X attached"; event_members
--     answers "does this specific person have access, and with what role" -
--     something no existing table can answer today (event_vendors is org-
--     granular only; vendor_team_members / vendor_account_assignments are
--     vendor-org-internal and never reach event authorization). Optionally
--     links back to the event_vendors row it corresponds to via
--     event_vendor_id, so the org-level fact and the per-human role stay
--     reconciled instead of duplicated.
-- ---------------------------------------------------------------------------

create table if not exists event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  inviter_user_id uuid references users(id) on delete set null,
  inviter_org_id uuid references organizations(id) on delete set null,
  recipient_email text not null,
  -- Resolved server-side only (existing-user / existing-org lookup by email or
  -- by an id the inviter is already authorized to see) -- never trusted from
  -- client-submitted user_id/org_id/vendor_id, matching the vendor_id fix in
  -- db/quotes.ts::createQuote.
  recipient_user_id uuid references users(id) on delete set null,
  recipient_org_id uuid references organizations(id) on delete set null,
  recipient_vendor_id uuid references vendors(id) on delete set null,
  intended_role text not null check (intended_role in (
    'planner', 'finance', 'venue', 'vendor_owner', 'vendor_staff',
    'sponsor', 'event_staff', 'guest_manager', 'read_only')),
  intended_scope jsonb,
  token text not null unique,
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'declined', 'expired', 'revoked')),
  message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists idx_event_invitations_event on event_invitations(event_id);
create index if not exists idx_event_invitations_token on event_invitations(token);
create index if not exists idx_event_invitations_email on event_invitations(lower(recipient_email));
-- At most one OPEN invitation per (event, recipient email): resending must
-- reuse/revoke-and-recreate rather than silently accumulate duplicates.
create unique index if not exists idx_event_invitations_open
  on event_invitations(event_id, lower(recipient_email))
  where status = 'pending';

create table if not exists event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  -- Nullable only transiently: a row is created the moment an invitation is
  -- accepted (which requires a real user_id by then, even a lightweight
  -- freshly-registered one) or the moment the event owner is seeded. No write
  -- path in this module ever leaves it null.
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  event_vendor_id uuid references event_vendors(id) on delete set null,
  role text not null check (role in (
    'event_owner', 'planner', 'finance', 'venue', 'vendor_owner', 'vendor_staff',
    'sponsor', 'event_staff', 'guest_manager', 'read_only')),
  status text not null default 'active' check (status in (
    'invited', 'active', 'declined', 'removed')),
  invited_by uuid references users(id) on delete set null,
  invitation_id uuid references event_invitations(id) on delete set null,
  permission_overrides jsonb,
  invited_at timestamptz,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_event_members_event on event_members(event_id);
create index if not exists idx_event_members_user on event_members(user_id);
create index if not exists idx_event_members_org on event_members(organization_id);
