# ALFY2 Pack — Section 14: Observability, Incident Response & Disaster Recovery

**Status**: PASS, with two real, live-verified gaps found and fixed (a
health-check endpoint that couldn't detect the app's single most likely
outage mode, and stale detection-capability claims in the incident response
plan), plus a new runbook closing a "total host loss" documentation gap. No
P0s.

**Method note**: Section 06 already covered database backup/restore in
depth (live-verified end to end, `compliance/policies/backup-and-restore-runbook.md`,
risks R-21/R-22) — that work is referenced here, not re-audited, per the
pack's rule against re-covering already-audited ground. This section covers
what Section 06 didn't: runtime observability (logging, health checks,
alerting) and incident response / disaster recovery planning.

## Finding 1: `/api/healthz` was a liveness check only, not a readiness check (FIXED, P1)

**What was wrong.** `GET /api/healthz` (`server/src/routes/foundation.ts`)
returned an unconditional `{ok: true}` — it only proved the Node process was
running, never that the database (this app's single real dependency) was
actually reachable. This app's own connection-pool comment
(`server/src/pool.ts`) notes it's "a single-process app" with no fallback
data path; a database outage is the single most likely real failure mode.
A deploy script or uptime/load-balancer check treating a bare 200 here as
"the app is healthy" — which is exactly how T4's own deploy-verification
acceptance criteria already used this endpoint — would report a fully
broken app as healthy for as long as the database stayed down.

**Fix applied**: `GET /api/healthz` now runs `select 1` against the pool
with a 1.5-second cap (`Promise.race` against a timeout, so a hung database
can't hang the health check itself), returning `200 {ok:true, db:true}` on
success and `503 {ok:false, db:false}` on any failure or timeout.

**Live verification** (real Postgres 16 instance, started and stopped in
this sandbox for the test, disposable scratch database, cleaned up
afterward):
1. Server started against a live database, `GET /api/healthz` → `200
   {"ok":true,"service":"divini-partners","db":true,...}`.
2. Database connections terminated and the Postgres cluster stopped,
   `GET /api/healthz` (same running server process, unchanged) → `503
   {"ok":false,"service":"divini-partners","db":false,...}`, returned
   promptly (well under the 1.5s cap, no hang).
3. Test server process killed, scratch database dropped, Postgres cluster
   returned to its original stopped state — no state left behind from this
   verification.

## Finding 2: the Incident Response Plan's Detection section was stale (FIXED, P2)

**What was wrong.** `compliance/policies/incident-response-plan.md` (still
correctly marked DRAFT/not-yet-effective) stated in its Detection section:
"There is no error-monitoring or SIEM-style alerting integrated... This is
the single biggest reason this plan cannot yet promise a specific
detection-to-response time," and instructed the reader to "build the
structured logging / monitoring already tracked in
`AI_PROJECT_OS/16_TECH_DEBT.md`." Both claims were true when written but are
false today: structured JSON logging and an optional real-time
error-monitoring webhook (`server/src/lib/logger.ts`) shipped 2026-08-03,
confirmed wired into the central Express error handler and both process
crash handlers. A document a real incident responder would rely on under
pressure was actively underselling the platform's current detection
capability.

**Fix applied**: rewrote the Detection section to accurately state what
exists (structured logging, wired into the error handler and crash
handlers; optional real-time webhook alerting, gated on an operator setting
`ERROR_MONITORING_WEBHOOK_URL`, already tracked as an open operator action;
the new readiness-checking `/healthz` from Finding 1) alongside what
genuinely remains open (429 rate-limit hits still aren't logged or alerted
on; nothing scans `audit_logs` for anomalies) — verified both open items
are still accurate by reading `rateLimit.ts` and grepping for any
scheduled/cron anomaly-detection job (none found).

## Finding 3: no consolidated "total host loss" DR runbook existed (NEW, addresses a documentation gap)

**What was wrong.** `backup-and-restore-runbook.md` (Section 06) covers
restoring the *database* onto a host that still exists. `AI_PROJECT_OS/23_DEPLOYMENT.md`
covers deploying the *application*. Nothing tied the two together into "the
entire host is gone, here is the sequence to stand up a replacement" — a
real, distinct scenario from a database-only restore.

**Fix applied**: added `compliance/policies/disaster-recovery-runbook.md`,
combining the existing deploy steps and the existing (live-verified)
restore mechanism into one sequence, explicitly marked DRAFT and
not-yet-exercised end to end (each piece is individually verified; the full
sequence back-to-back on a genuinely fresh host has not been run, and
cannot safely be from this environment). Honestly states its two hard
preconditions — off-host backup storage and off-host secrets recovery —
are both unconfirmed from this environment, carrying forward the existing
open operator action for `STORAGE_PROVIDER=s3` confirmation rather than
duplicating it as a new item.

## Areas inspected and found sound (no fix needed)

- Structured logging (`lib/logger.ts`) is genuinely wired into the central
  Express error handler (`routes.ts`'s `errorHandler`) and both Node
  process crash handlers (`index.ts`), not just present as an unused
  module — confirmed by grep, not assumed from the doc comment.
- The error-monitoring webhook is correctly best-effort/non-blocking (a
  failed webhook POST is swallowed, never breaks the request that
  triggered the original error) — read in full.
- Database backup/restore (Section 06): re-confirmed still accurately
  documented and live-verified; not re-tested this pass, per the pack's
  rule against re-auditing already-covered ground.

## Regression

- `npm run lint`: 0 errors (44 pre-existing warnings, unchanged)
- `npm run build` (SPA): clean
- `npm --prefix server run build`: clean
- `npm test`: 72/72 passing
- `/api/healthz` fix live-verified against a real, disposable Postgres
  instance in both the healthy and unhealthy state (see Finding 1) — not
  just read and assumed correct.
