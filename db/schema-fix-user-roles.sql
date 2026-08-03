-- ---------------------------------------------------------------------------
-- Fix: users.role CHECK constraint was missing roles the app already
-- supports end to end (server/src/db.ts's ROLES array, App.tsx's dashboard
-- switch, src/pages/GetStarted.tsx's role picker: sponsor, nonprofit, donor,
-- volunteer, exhibitor, viewer). registerOrganization() writes payload.role
-- straight into users.role, so registering as any of these roles hit
-- "new row for relation users violates check constraint users_role_check"
-- and failed with a generic 500 -- a real, live registration-blocking bug
-- found during a full-app QA pass (2026-08-03).
--
-- Postgres has no ALTER CONSTRAINT for a CHECK's definition: drop + recreate
-- with the full, current role list.
-- ---------------------------------------------------------------------------
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in (
  'super_admin', 'admin', 'venue', 'vendor', 'supplier', 'installer',
  'planner', 'client', 'billing', 'sponsor', 'nonprofit', 'donor',
  'volunteer', 'exhibitor', 'viewer'
));
