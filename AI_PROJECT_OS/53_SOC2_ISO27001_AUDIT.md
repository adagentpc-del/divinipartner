# 53 SOC 2 / ISO 27001 Technical Controls Audit

Date: 2026-08-03. Scope: a code-level audit of the CONTROLS this app actually
implements today, mapped against the SOC 2 Trust Services Criteria (Security /
"Common Criteria," CC1-CC9) and ISO/IEC 27001:2022 Annex A. This is not a
certification and does not substitute for one -- see the "What this is not"
section below.

Method: read the actual middleware, route, and db-layer code (not just prior
docs, which had drifted before the 2026-08-03 pass) and verified each claim
against the running app where practical. Findings that were real, small, and
code-fixable were fixed in this same pass (listed under "Fixed in this
pass"); findings that need a dedicated feature build or an operator/infra
decision are listed as open gaps with a recommended owner.

## What this is not

SOC 2 and ISO 27001 are not something a codebase alone can achieve. Both
require, beyond technical controls: a named Information Security Management
System owner, documented and board/exec-approved policies, employee security
training and background checks, vendor/subprocessor risk assessments, an
incident response plan that has actually been tested, and -- critically -- an
independent third-party audit (SOC 2) or accredited certification body
(ISO 27001). Nothing below claims certification. It documents what the
CODE does, honestly, so that whoever runs the organizational half of this
work (see `52_COMPLIANCE.md` and the policy drafts from the next task) knows
which technical controls already back their policy claims and which do not
yet exist.

## Control inventory (what exists today)

### Access control (SOC 2 CC6.1-CC6.3; ISO 27001 A.5.15-A.5.18, A.8.2-A.8.5)

- Authentication: native email/password, scrypt-hashed (`passwordHash.ts`),
  minimum 8 characters enforced server-side (`routes/auth-native.ts`).
  Sessions are HS256 JWTs (`session.ts`), httpOnly cookie + bearer fallback,
  30-day expiry. Email verification is required before first login.
- Authorization: role-based (venue/vendor/planner/client/... on
  `organizations`) plus a real admin allowlist (`ADMIN_ALLOWED_EMAILS`,
  computed server-side in `auth.ts`, never trusted from the client). Fixed
  2026-08-03: ~48 call sites across `server/src/db/*.ts` were checking
  `actor.user.role === "admin"`, a DB column nothing ever wrote that value
  into -- `getActor()` in `db.ts` now centrally overrides `role` to
  `"super_admin"` in memory for allowlisted emails, so those checks are
  correct without touching all 48 files.
- Least privilege: organization-scoped queries throughout (a user only sees
  their own org's quotes/invoices/events unless they are the platform admin);
  `organization_memberships` supports one user belonging to multiple orgs
  without granting cross-org visibility by default.
- Account lifecycle: registration requires email verification;
  `deleteAccount()` (see below) provides self-service account deletion.
  Password reset requires possession of the emailed link (`reset_token`,
  1-hour expiry) and, as of this pass, now emails the account owner and
  writes an audit entry on every successful reset (`account.password_reset`)
  so an unauthorized reset is visible, not just forensically recoverable.

### Session management (SOC 2 CC6.1; ISO 27001 A.8.5)

- JWT sessions, `SESSION_SECRET`-signed, httpOnly + SameSite=Lax cookie.
  30-day fixed expiry, no idle timeout, no server-side revocation list --
  a stolen token remains valid until it naturally expires, EXCEPT after
  account deletion, where `ensureUser()` now explicitly rejects any request
  from a deleted account's still-valid token (`AccountDeletedError`, 401;
  fixed 2026-08-03 alongside account deletion). Password reset and logout do
  not currently invalidate other outstanding sessions/tokens for the same
  user -- see "Open gaps" below.

### Encryption (SOC 2 CC6.1, CC6.7; ISO 27001 A.8.24)

- In transit: TLS is terminated at the edge (Caddy), not in this app's code;
  HSTS is sent unconditionally (`securityHeaders.ts`). The Postgres
  connection honors `sslmode=require` in `DATABASE_URL` if the operator sets
  it (`pool.ts`) -- **operator action required** in production against a
  managed/remote DB.
- At rest: optional AES-256-GCM envelope encryption for stored objects
  (`storageCrypto.ts`), gated on `STORAGE_ENCRYPTION_KEY` -- off by default.
  Database-at-rest encryption is a hosting/volume-level concern, not app
  code (document the hosting provider's disk encryption, most managed
  Postgres offerings enable it by default).

### Audit logging (SOC 2 CC7.2, CC7.3; ISO 27001 A.8.15)

- `lib/audit.ts`'s `logAction()` writes actor id/email, action verb, object
  type/id, previous/next state (jsonb), IP, and timestamp to `audit_logs`.
  45 call sites across the codebase cover admin actions, disputes, e-sign,
  compliance/privacy requests, agreements, white-label status, feedback,
  ticket status, and now (2026-08-03) password resets and account deletion.
  Writes are best-effort (never block the action they accompany) and never
  throw, by design.
- Gap: there is no automated review process or alerting on audit_logs
  content (e.g. a spike in failed logins, an admin action outside business
  hours) -- it is a queryable record, not a monitored one. See "Open gaps."

### Data subject rights / privacy (SOC 2 Privacy criteria if in scope;
  ISO 27001 A.5.34; GDPR/CCPA-adjacent)

- Stronger than expected going in: `routes/compliance-privacy.ts` +
  `db/compliancePrivacy.ts` implement a real access/deletion/export/
  correction request workflow, consent recording, and admin-settable
  retention policies -- all audit-logged and reachable from the product UI
  (`src/pages/ComplianceCenter.tsx`). Every request fires an admin
  notification (`notify.privacyRequestReceived`).
- Account-level self-service deletion (2026-08-03, task tracked separately)
  complements this: a user can delete their OWN account immediately
  (password-reconfirmed, anonymize + deactivate) without waiting on an
  admin-processed request, while the formal request workflow above remains
  available for anything requiring documented processing (e.g. a
  data-export request).

### Input/output safety (SOC 2 CC6.6, CC6.8; ISO 27001 A.8.28)

- CSRF: double-submit cookie (`csrf.ts`), enforced on every cookie-carrying
  mutating request.
- Injection defense: parameterized SQL throughout (`pool.ts`'s `q`/`q1`
  helpers take `$1, $2, ...` params, never string-concatenated values).
- Upload safety: extension + MIME + magic-byte allowlist, size cap
  (`uploadGuard.ts`); ClamAV scanning wired but off by default
  (`AV_SCAN_ENABLED`), fails CLOSED once enabled.
- Prompt-injection defense on the one real LLM integration
  (`promptSafety.ts`, fences untrusted text at all three call sites).
- Stored-XSS: JSON-LD injection points escape `<` (`src/lib/jsonLd.ts`).
- Security headers: CSP, X-Frame-Options, HSTS, Permissions-Policy, etc.
  (`securityHeaders.ts`).

### Availability / resilience (SOC 2 CC7.1, A1.1-A1.2; ISO 27001 A.8.6, A.8.13)

- Rate limiting: general `/api` throttle + a tighter `/api/auth` limiter
  (~20 req/min/IP) against credential stuffing (`rateLimit.ts`).
  Single-process/in-memory -- approximate behind multiple replicas.
- Fail-closed startup: production refuses to boot without real
  `SESSION_SECRET`/`DOWNLOAD_URL_SECRET` (`config.ts`), rather than running
  with forgeable secrets.
- Backups: no automated backup job exists in this repo. The only backup
  procedure documented anywhere (`23_DEPLOYMENT.md`, `21_DATABASE.md`) is a
  manual, one-off `pg_dump` taken immediately before a schema migration --
  not a scheduled, retained, tested backup policy. **Real open gap**, see
  below; this is a hosting/ops decision, not something fixable by editing
  application code.
- Monitoring/observability: no structured logging or error-monitoring
  service (Sentry-style) integrated. Flagged in `16_TECH_DEBT.md` prior to
  this audit and still open -- the single highest-value item on that list.

## Fixed in this pass (2026-08-03)

1. **Stale "MFA provided by Authentik" claims removed.** `securityHeaders.ts`
   and `rateLimit.ts` both carried a comment claiming MFA/2FA was "provided
   by the Authentik IdP" -- true when this app delegated auth to Authentik,
   false since native email/password auth fully replaced it. Left uncorrected,
   this would have caused a real audit to fail on a false claim rather than a
   documented gap. Both comments now state plainly that no MFA exists.
2. **Password reset now notifies + audits.** `POST /api/auth/reset` did not
   tell the account owner their password changed and did not write an
   `audit_logs` entry. Added `notify.securityEvent()` (best-effort email) and
   `logAction("account.password_reset", ...)` on every successful reset.
3. **Account deletion notifies + audits** (built as part of the same
   2026-08-03 pass as this audit, tracked as its own task): `logAction`
   records every deletion, and the account owner's ORIGINAL email (captured
   before anonymization) gets a confirmation.

## Update 2026-08-03: MFA built

The MFA gap below (originally #1) is RESOLVED. TOTP-based two-factor
authentication is built: self-service enrollment with a QR code and 10
single-use backup codes (`server/src/routes/mfa.ts`, `server/src/lib/
totp.ts` -- a dependency-free RFC 6238 implementation verified against the
official RFC test vector), a login-time challenge step using a distinctly
-typed 5-minute JWT that cannot be replayed as a real session
(`signMfaChallenge`/`verifyMfaChallenge` in `lib/session.ts`, with an
explicit `verifySession` check that rejects any token carrying a `typ`
claim -- closing a real vulnerability caught during this same build, where
a leaked challenge token would otherwise have passed as a full session),
and enforcement (not just availability) for `ADMIN_ALLOWED_EMAILS`
accounts via `requireAdmin` in `server/src/auth.ts`: an unenrolled admin
can still log in, but every actual admin action is refused with
`mfa_required_for_admin` until they enroll. Live-verified end to end
including the real browser UI. Session-management gap #2 below (no general
revocation) is UNCHANGED by this work -- MFA and session revocation are
different controls.

## Update 2026-08-03 (later same day): automated backup mechanism built

The backup gap below (originally #1) is MOSTLY resolved -- the mechanism
is built and live-verified, but a real cron job on the production server is
still an operator step, not something this repo can install by itself:
`server/src/scripts/backup-db.ts` (pg_dump `--clean --if-exists` -> gzip ->
the app's own pluggable object storage -- local disk by default, S3-
compatible when configured -- encrypted at rest when
`STORAGE_ENCRYPTION_KEY` is set, retention-pruned via a manifest since
neither storage provider exposes a list operation) and `restore-db.ts`
(interactive confirmation guard, or `--yes` for scripted/tested use). A
real race condition was caught and fixed while building this: when pg_dump
fails immediately (e.g. the database is unreachable), its stdout closes
with zero bytes, which makes the gzip stream emit its own `'end'` event
BEFORE pg_dump's `'close'` event carries the real exit code -- resolving on
gzip's `'end'` alone would have silently "succeeded" with an empty,
useless backup on every such failure. Fixed to wait for both signals and
treat the exit code as authoritative, plus a minimum-compressed-size sanity
check as defense in depth. Live-verified end to end: a real ~95KB backup of
this app's 170-table schema, retention pruning of an artificially-aged
manifest entry, and a full restore into a scratch database with matching
table count (170/170) and row counts, verified idempotent on a second
restore into the same target. See `23_DEPLOYMENT.md`'s "Automated database
backups" section for the remaining cron-install step.

## Open gaps (not fixed here -- need a dedicated build or an operator decision)

Ranked by how commonly an auditor would flag them first.

1. **Automated backups are built but not yet SCHEDULED anywhere.** MEDIUM
   (downgraded from HIGH now that the mechanism exists -- see the update
   above). Installing the cron line and choosing retention/S3 is a single
   operator action (`23_DEPLOYMENT.md`), not a code change.
2. **No structured logging / error monitoring.** MEDIUM-HIGH. Carried over
   from `16_TECH_DEBT.md`, unchanged by this audit. Needed for CC7.2
   ("the entity monitors ... for anomalies") to be more than an audit-log
   table nobody watches.
3. **Session revocation.** MEDIUM. A password reset or account deletion does
   not invalidate OTHER already-issued session tokens for the same user
   (except the deleted-account case, fixed earlier this pass). A 30-day JWT
   stolen before a legitimate password reset stays valid until it expires.
   Fixing this generally would need a session-version or denylist mechanism
   (e.g. a `users.session_epoch` column bumped on password change, checked
   in `verifySession`) -- a real, scoped, code-fixable improvement, but a
   separate change from this audit given the JWT-verification code path is
   security-critical and deserves its own careful, tested pass rather than
   a same-turn edit.
4. **Encryption at rest is opt-in, not default.** MEDIUM. `storageCrypto.ts`
   only encrypts objects when `STORAGE_ENCRYPTION_KEY` is set. Recommend the
   go-live runbook (`T1`/`T3` in `12_TASK_QUEUE.md`) require setting it
   before any real vendor documents are uploaded in production.
5. **DB TLS is operator-configured, not enforced.** LOW-MEDIUM.
   `sslmode=require` works if set in `DATABASE_URL` but nothing in the app
   requires it. Document as a required production `DATABASE_URL` parameter
   for a managed/remote Postgres instance (a local same-host DB, as used in
   dev, does not need it).

## Framework cross-reference (quick index)

| Area | SOC 2 (Security / CC) | ISO/IEC 27001:2022 Annex A | Status |
|---|---|---|---|
| Access control / RBAC | CC6.1-CC6.3 | A.5.15-A.5.18, A.8.2-A.8.5 | Implemented |
| MFA | CC6.1, CC6.6 | A.8.5 | Implemented (self-service TOTP; enforced for admin accounts) |
| Session management | CC6.1 | A.8.5 | Partial (no general revocation) |
| Encryption in transit | CC6.1, CC6.7 | A.8.24 | Implemented (edge TLS + HSTS) |
| Encryption at rest | CC6.1, CC6.7 | A.8.24 | Opt-in, not default |
| Audit logging | CC7.2, CC7.3 | A.8.15 | Implemented, unmonitored |
| Change management (this repo's own dev process) | CC8.1 | A.8.32 | Out of scope for code audit |
| Vulnerability management | CC7.1 | A.8.8 | Partial (`npm audit` pass done 2026-08-03; no recurring schedule) |
| Backup / recovery | A1.2 | A.8.13 | Mechanism built + verified (backup + restore); scheduling is the one remaining operator step |
| Monitoring / logging review | CC7.2 | A.8.16 | **Gap** (no alerting/SIEM) |
| Data subject rights | Privacy (if in scope) | A.5.34 | Implemented, stronger than expected |
| Incident response | CC7.4, CC7.5 | A.5.24-A.5.28 | Policy-only, not yet drafted (next task) |
| Vendor/subprocessor management | CC9.2 | A.5.19-A.5.23 | Policy-only, not yet drafted (next task) |

## Recommended next steps (ranked)

1. ~~Draft the policy documents~~ DONE 2026-08-03: `compliance/policies/`
   (Information Security Policy, Access Control Policy, Data Retention &
   Deletion Policy, Incident Response Plan, Subprocessor list), all DRAFT
   pending real ownership and sign-off.
2. ~~Decide and implement an automated backup policy~~ MECHANISM DONE
   2026-08-03: see the update above. Remaining: install the cron line
   (`23_DEPLOYMENT.md`) and choose retention/S3 (operator decision).
3. ~~Scope and build MFA~~ DONE 2026-08-03: see the update above.
4. Add structured logging / error monitoring (already tracked in
   `16_TECH_DEBT.md`).
5. Build general session revocation (gap #3 above) as its own scoped,
   carefully-tested pass.
6. When ready to pursue actual certification: engage counsel/a SOC 2 auditor
   or ISO 27001 certification body -- this document is preparation for that
   engagement, not a substitute for it.
