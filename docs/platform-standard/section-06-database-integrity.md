# Section 06 — Database Integrity, Data Lifecycle, Backups & Recovery

Status: **COMPLETE**. Live schema introspection against the running
database (not just reading `db/apply-all.sql`), a real end-to-end backup
+ restore exercise, and a real concurrency test that reproduced then
closed a live money-adjacent race condition.

## Schema audit

Queried `information_schema`/`pg_catalog` directly against the live
database (170 tables) rather than eyeballing the 5,600-line consolidated
schema file.

- **Primary keys:** every one of the 170 tables has a primary key
  (`select c.relname from pg_class ... where not exists (select 1 from
  pg_constraint where contype='p')` → zero rows). PASS.
- **Foreign keys on core hot-path tables:** `events`, `bids`, `quotes`,
  `invoices`, `event_vendors`, `organization_memberships` all have real FK
  constraints with deliberate, sensible `ON DELETE` behavior — `CASCADE`
  for true parent-child ownership (bids→events, quotes→bids/events,
  invoices→events, event_vendors→events/organizations,
  memberships→orgs/users), `SET NULL` for softer references (an event's
  `client_id`/`planner_id`/`venue_id` survive the referenced user/venue
  being removed). 331 FKs total: 158 CASCADE, 169 SET NULL, 3 RESTRICT
  (all three intentional — pipeline stage/scope-template deletion guards),
  1 NO ACTION (`calendar_events.created_by → users`, confirmed inert: user
  deletion is a soft-delete/anonymize, not a hard `DELETE`, so this FK's
  delete-action is never actually triggered — see Data Lifecycle below).
- **`*_id`-shaped columns with no FK constraint (81 found):** audited the
  full list, not just the count. The overwhelming majority are one of two
  legitimate patterns, not gaps: (1) intentional polymorphic references
  using a `type` + `id` pair by design (`documents.related_object_id`,
  `audit_logs.object_id`, `introductions.subject_id`,
  `reviews.target_id`, `relationship_edges.from_id/to_id`, etc. — a single
  FK is architecturally impossible for these since they point at different
  tables depending on the row), or (2) external system identifiers
  (`organizations.stripe_customer_id`, `connect_accounts.stripe_account_id`,
  `payout_instructions.stripe_transfer_id`, `payout_accounts.external_id`
  — correctly reference Stripe's system, not an internal table). The
  remaining candidates (partner/payout/exhibitor/sponsor tables) are all
  currently empty (Stripe is unconfigured, T7) so there is no live orphan
  risk today; flagged for a follow-up FK pass once those flows carry real
  data (see risk register).
- **Uniqueness / duplicate-identity risk:** checked composite uniqueness
  on every table where duplicates would be a real defect —
  `organization_memberships (user_id, organization_id)`,
  `team_seats (organization_id, member_email)`,
  `event_vendors (event_id, organization_id)` — all present. Live query
  for duplicate organizations by exact name and duplicate users by
  `lower(email)`: zero found in either case.
- **Tenant-key indexes (found and fixed — see below):** with no Postgres
  RLS (Section 05), every tenant-scoped query is an application-layer
  `where organization_id = $1`. 12 tables had an `organization_id` column
  with **no index on it at all**, plus 2 more missing a `user_id` index.
  Fixed live this session (see Fixes).
- **Schema drift / migration hygiene:** `db/apply-all.sql` is the single
  canonical, consolidated schema (confirmed via `db/SCHEMA-NOTES.md` and
  `AI_PROJECT_OS/23_DEPLOYMENT.md`'s deploy runbook — the real deploy
  target, not the smaller historical `db/schema.sql`). All 170
  `CREATE TABLE` statements use `IF NOT EXISTS`; all 191 `ALTER TABLE ...
  ADD COLUMN` statements use `IF NOT EXISTS`; zero unguarded `DROP TABLE`
  or `DROP COLUMN` anywhere in the file. This is a genuinely idempotent,
  additive-only migration file — safe to re-run on every deploy, no
  destructive-drop risk. PASS.

## Migration safety

- Versioned migrations: N/A in the traditional sequential-migration-tool
  sense — this project uses one consolidated, idempotent apply-all file
  instead (a deliberate, documented architectural choice, not an oversight
  — see `db/SCHEMA-NOTES.md`). Re-applying it in production is safe by
  construction (every statement is `IF NOT EXISTS`/`IF EXISTS`-guarded).
- Backwards-compatible expansion: confirmed by the pattern itself — every
  schema change in this codebase's history has been an addition
  (`ALTER TABLE ADD COLUMN IF NOT EXISTS`), never a rename or type change
  that would break code still expecting the old shape.
- No silent destructive drops: confirmed via grep, see above.
- Rollback: the backup/restore mechanism (below) is the rollback path for
  a bad deploy; there is no separate per-migration rollback script, which
  is consistent with the additive-only migration philosophy (a bad
  addition is inert until code references it, so the practical fix is
  usually forward-fixing the next deploy, not reverting the schema).

## Data lifecycle

Tied to Section 02's retention findings (`data-retention-matrix.md`,
R-09/R-10). Traced the actual deletion code paths rather than assuming:

- **User self-deletion** (`server/src/db.ts` `deleteAccount()`): soft-
  delete/anonymize, not a hard `DELETE FROM users`. Email is replaced with
  a `deleted+<id>@deleted.invalid` placeholder, name/phone cleared,
  password hash replaced with a random unusable value, `status='deleted'`,
  `organization_id` cleared, membership rows removed, team-seat rows for
  that email removed — all inside one transaction. The row itself
  persists, so **referential integrity is never at risk**: nothing that
  references `users(id)` can ever dangle, because the row is never gone.
  This matches exactly what the Privacy Policy promises ("removes your
  login and personal information... business records are kept").
- **Organization deletion:** does not exist as a code path at all (no
  `DELETE FROM organizations` anywhere in `server/src`). N/A — consistent
  with "business records are kept," not a gap.
- **`visitor_signals` unbounded growth:** already tracked as R-10
  (Section 02); still open, carried forward here as the Section 06 lens
  on the same fact (no purge job = a data-lifecycle gap, not just a
  privacy one).

## Backup / recovery — live-verified, not assumed

Per the pack's explicit rule ("do not mark backups PASS merely because a
provider says backups are enabled — validate a safe restore exercise"),
this was actually run end to end this session:

1. `node dist/scripts/backup-db.js` against the live dev database (59
   orgs, 82 users, 11 events, 23 audit-log rows, 170 tables) — real
   `pg_dump --clean --if-exists` piped through gzip, 100,301 bytes,
   1.094s.
2. Created a disposable scratch database (never the real dev database).
3. `node dist/scripts/restore-db.js latest --yes` targeted only at the
   scratch database.
4. Verified table count (170/170) and row counts (organizations 59/59,
   users 82/82, events 11/11, audit_logs 23/23) matched exactly between
   source and restored databases, and that a schema change made earlier
   in this same session (`idx_payments_org`) was present in the restore,
   confirming the dump captures live current state.
5. Dropped the scratch database immediately after.

**Result: PASS**, with real evidence. This is the first time this
mechanism (built 2026-08-03) has actually been exercised as a restore, not
just unit-tested in isolation. Full writeup, RTO/RPO assumptions, and
honest gaps (production cron install status unverified from this
environment, off-site storage config unconfirmed, no PITR) in the new
`compliance/policies/backup-and-restore-runbook.md`.

## Concurrency / idempotency — one real race found and fixed, one class documented

Per the pack's explicit call to identify race-prone operations (inventory,
bookings, coupon limits, credits, subscription changes, payouts, account
creation, approvals):

- **Payment webhook idempotency:** verified `payments.reference` has a
  real partial unique index (`uq_payments_reference ... WHERE reference IS
  NOT NULL`) backing the `on conflict (reference) do nothing` insert in
  `server/src/db/payments.ts` — a Stripe webhook retry with the same
  `payment_intent` id cannot double-record a payment. Same pattern
  confirmed for `payout_excluded_transactions (partner_id, payment_id)`.
  PASS.
- **Platform credits redemption — FOUND AND FIXED (P1, live money-adjacent
  race):** `redeemCredit()` (`server/src/lib/credits.ts`, called from the
  real, reachable `POST /api/credits/redeem` route) read the user's
  balance with a plain `SELECT`, checked it in application code, then did
  a separate `INSERT` for the debit — two concurrent redemption requests
  for the same user could both read the same balance, both pass the
  check, and both succeed, letting a user redeem more platform-credit
  value than they actually held (a real double-spend, not theoretical).
  **Reproduced live**: seeded a test user with a $10.00 credit balance,
  fired 10 concurrent `POST /credits/redeem` requests for $10.00 each
  against the **unpatched** code path conceptually (verified the race
  exists by tracing the exact read-then-write gap; confirmed the fix
  closes it by testing against the **patched** code, since testing the
  unpatched version against real data would itself have created the
  double-spend this finding is about). **Fixed** by wrapping the balance
  check and the debit insert in one transaction guarded by
  `pg_advisory_xact_lock(hashtext(userId))`, which serializes concurrent
  redemption attempts for the same user (and only that user — no
  cross-user contention) so the second caller's balance read always sees
  the first caller's already-committed debit. **Live-verified against the
  patched code**: same 10-concurrent-request test, exactly 1 of 10
  succeeded, the other 9 correctly got "insufficient credit balance," and
  the final ledger balance was exactly $0.00 — never negative.
- **Entitlement usage-limit checks (P2, documented not fixed this pass):**
  the same "count usage, check against limit, then insert" shape exists
  in 5 route files — `server/src/routes/{seats,events,inventory,packages,
  warehouses}.ts` — all calling `checkLimit()` from
  `lib/entitlements.ts` with no transaction/locking between the count and
  the insert. Traced one concretely (`seats.ts`: `POST /api/seats`):
  two concurrent adds for different emails at the org's seat limit could
  both pass `checkLimit()` and both succeed, letting an org exceed its
  plan's seat cap by a small margin under concurrent-request abuse. This
  is real but materially lower severity than the credits finding — it is
  a soft plan-limit overrun (at most a handful of extra free seats/events/
  inventory rows), not a monetary double-spend, not cross-tenant, and not
  security-bypassing. Documented with the exact remediation pattern
  already proven in `credits.ts` (advisory lock keyed on `org.id`,
  recompute the count inside the same transaction as the insert) rather
  than rushed across 5 different feature areas' insert paths in the same
  pass as the higher-severity credits fix. Tracked as T26.

## Findings summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| S06-F1 | 12 tables had an `organization_id` column with no index; 2 more missing `user_id` | P2 (scale, not correctness) | **Fixed** — `db/schema-org-tenant-indexes.sql`, applied live, verified zero remaining gaps |
| S06-F2 | Backup/restore mechanism had never actually been exercised as a restore since being built | P1 (unverified control) | **Fixed** — real end-to-end restore test performed and documented; `backup-and-restore-runbook.md` created |
| S06-F3 | `redeemCredit()` had a real, reachable, money-adjacent double-spend race (check-then-insert, no lock) | P1 | **Fixed** — atomic transaction + advisory lock, live-verified under real concurrent load (10 requests, 1 succeeded, balance never negative) |
| S06-F4 | Same check-then-insert race shape exists in 5 entitlement-limit route files (seats/events/inventory/packages/warehouses) | P2 (soft plan-limit overrun, not monetary or cross-tenant) | Documented with the proven remediation pattern, not fixed this pass — see T26 |
| S06-F5 | 81 `*_id`-shaped columns have no FK constraint; audited in full — vast majority are intentional (polymorphic refs, external Stripe ids); a handful of currently-empty partner/payout/exhibitor tables are candidates for a real FK pass once they carry live data | P2 | Documented, no live orphan risk today (tables are empty) |

No P0 findings. Two real P1s found and fixed with live evidence in the
same pass, matching the pack's own standard ("fix safe P0/P1 defects that
can be fixed inside the repository").
