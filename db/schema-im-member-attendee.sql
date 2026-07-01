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
