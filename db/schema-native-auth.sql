-- ============================================================================
-- Native email/password authentication (schema-native-auth.sql)
-- ----------------------------------------------------------------------------
-- Replaces Authentik OIDC with native auth on the EXISTING users table. Adds the
-- columns needed for scrypt password hashing, email verification, and password
-- reset. Idempotent, additive ALTERs only: never drops, safe to run repeatedly.
--
-- Apply AFTER db/schema.sql (which defines the users table) against the same db:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-native-auth.sql
--
-- Notes:
--   - password_hash stores the scrypt envelope `scrypt$<saltHex>$<hashHex>`.
--     NEVER store or log plaintext passwords.
--   - email_verified gates login; a user must verify before a session is issued.
--   - oidc_sub stays (legacy / nullable). New native users get a generated uuid
--     id and a null oidc_sub. Legacy Authentik rows are upserted by email so
--     their id + org memberships are preserved.
-- ============================================================================

alter table users add column if not exists password_hash text;
alter table users add column if not exists email_verified boolean default false;
alter table users add column if not exists verify_token text;
alter table users add column if not exists verify_expires timestamptz;
alter table users add column if not exists reset_token text;
alter table users add column if not exists reset_expires timestamptz;

-- Lookups by token (verification + reset) and case-insensitive email upsert.
create index if not exists idx_users_verify_token on users(verify_token);
create index if not exists idx_users_reset_token on users(reset_token);
create index if not exists idx_users_email_lower on users(lower(email));
