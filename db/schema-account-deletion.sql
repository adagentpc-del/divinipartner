-- ============================================================================
-- Divini Partners by Divini Group - account deletion (Apple Guideline 5.1.1(v))
-- ----------------------------------------------------------------------------
-- Adds a timestamp for when a user's account was deleted. Deletion itself is
-- anonymize + deactivate, not a hard delete (see server/src/db.ts's
-- deleteAccount): the users row is kept (so audit_logs, quotes, invoices, and
-- other org members' records that reference it stay intact), but its PII is
-- overwritten, its password is replaced with an unguessable, never-shared
-- hash, and `status` is set to 'deleted'. `deleted_at` records when.
--
-- The `status` column already exists on `users` (db/schema.sql) and has no
-- check constraint, so no migration is needed for it.
--
-- Idempotent: only `add column if not exists`. Safe to run repeatedly.
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-account-deletion.sql
--
-- Zero em dashes.
-- ============================================================================

alter table users add column if not exists deleted_at timestamptz;

create index if not exists idx_users_deleted_at on users(deleted_at) where deleted_at is not null;
