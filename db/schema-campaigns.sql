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
