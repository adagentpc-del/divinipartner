-- ============================================================================
-- Divini Partners by Divini Group - MFA / 2FA (TOTP)
-- ----------------------------------------------------------------------------
-- Closes the "no MFA anywhere in the app" gap found in the 2026-08-03
-- SOC 2 / ISO 27001 audit (AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md, T11 in
-- 12_TASK_QUEUE.md). This app used to inherit MFA from the Authentik IdP;
-- Authentik is fully retired, so nothing replaced it until this migration.
--
-- totp_secret is written on enrollment START (a pending secret, not yet
-- trusted) and only becomes "real" once totp_enabled flips true after the
-- user proves possession of it with a correct code -- see
-- server/src/routes/mfa.ts. Backup codes are stored hashed (scrypt via the
-- same passwordHash.ts used for account passwords), never in plaintext,
-- exactly like a password.
--
-- Idempotent: only `add column if not exists` / `create table if not
-- exists`. Safe to run repeatedly.
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-mfa.sql
--
-- Zero em dashes.
-- ============================================================================

alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled boolean not null default false;
alter table users add column if not exists totp_enabled_at timestamptz;

create table if not exists mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_mfa_backup_codes_user on mfa_backup_codes(user_id);
