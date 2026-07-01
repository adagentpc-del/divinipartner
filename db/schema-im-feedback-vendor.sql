-- ============================================================================
-- Divini Partners by Divini Group - INTELLIGENCE MOAT schema (F10 follow-on)
-- ----------------------------------------------------------------------------
-- Per-vendor feedback granularity.
--
-- Today a post-event feedback row with role='vendor' is attributed to EVERY
-- vendor on the event (the divini-score vendor feedbackSignal joins through
-- event_vendors with no per-vendor selector). This adds an OPTIONAL pointer so a
-- single feedback row can target ONE specific vendor on the event:
--
--   target_vendor_id - the vendors.id this feedback is about. NULL keeps the
--                      legacy event-level behavior (counts for all vendors on the
--                      event), so existing rows are unchanged and not penalized.
--
-- ADDITIVE only: a single nullable column + one index. No existing column is
-- dropped or altered. Idempotent (`if not exists`), safe to re-run. Apply AFTER
-- db/schema-im-event-memory.sql against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-im-feedback-vendor.sql
--
-- No foreign key constraint is added (to avoid coupling deploy ordering and to
-- stay non-breaking on existing data); membership is validated in the app layer
-- (server/src/db/event-memory.ts) against event_vendors for the event_id, which
-- also enforces the IDOR/abuse boundary.
-- ============================================================================

create extension if not exists pgcrypto;

alter table event_feedback add column if not exists target_vendor_id uuid;

create index if not exists idx_event_feedback_target_vendor on event_feedback(target_vendor_id);
