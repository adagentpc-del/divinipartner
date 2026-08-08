-- ============================================================================
-- Divini Partners by Divini Group - communication suppression list
-- ----------------------------------------------------------------------------
-- Found during the ALFY2 pack Section 10 (email/marketing compliance) audit:
-- server/src/lib/email.ts's sendEmail() -- the single shared transport used
-- by BOTH the Claim Engine's cold outreach (already gated by its own
-- claim_suppression table + decideSend()) AND every regular transactional
-- email this app sends (registration, notifications, password resets) --
-- had no suppression check of its own. A hard bounce or spam complaint on a
-- regular platform user's email address would never stop future sends to
-- that same address; nothing populated claim_suppression's 'bounce' reason
-- either (verified live: zero code in the tree ever inserted one).
--
-- communication_suppressions is the general-purpose, channel-agnostic list
-- (the pack's own suggested shape) that sendEmail() now checks before every
-- send, regardless of caller -- a safety net underneath claim_suppression's
-- more specific outreach-decision logic, not a replacement for it.
--
-- Idempotent: only `create table if not exists`. Safe to run repeatedly.
-- Zero em dashes.
-- ============================================================================

create table if not exists communication_suppressions (
  id uuid primary key default gen_random_uuid(),
  destination text not null,              -- normalized (lowercased, trimmed) email address
  channel text not null default 'email',  -- 'email' today; room for 'sms'/'push' later
  reason text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  source text,                            -- e.g. 'resend_webhook', 'admin'
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create unique index if not exists idx_comm_suppr_dest
  on communication_suppressions(lower(destination), channel);
