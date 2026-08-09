# Disaster Recovery Runbook (Total Host Loss)

**Status:** DRAFT -- written from existing, separately-documented pieces
(deployment steps, database backup/restore) that were never combined into a
single "the host is gone, now what" procedure before. **Not yet exercised
end to end** (that would require actually destroying a host, which this
environment cannot safely do) -- the pieces it's built from are each
individually verified (see the sources cited at each step), but the full
sequence run back-to-back has not been.
**Maps to:** SOC 2 CC7.5, A1.2; ISO/IEC 27001:2022 A.5.29-A.5.30.
**Scope:** what to do when the application host itself is lost or
destroyed (disk failure, provider outage, accidental deletion) -- distinct
from `backup-and-restore-runbook.md`, which covers restoring the database
onto a host that still exists. This is single-region, single-host recovery
(stand up a replacement host); it is not a multi-region active/passive
failover plan, which this product's current stage and hosting setup does
not warrant.

## Preconditions this plan assumes

- A recent database backup exists **off the host being replaced**. With
  `STORAGE_PROVIDER=local` (this deployment's default per
  `backup-and-restore-runbook.md`), backups live on the *same* disk as the
  database -- a host-level disaster takes out both together, and this
  entire runbook is moot without an off-host copy. **Confirming
  `STORAGE_PROVIDER=s3` (or another off-host destination) is actually
  configured in production is an existing open operator action** (see
  `docs/platform-standard/operator-actions.md`); this DR plan is only as
  real as that confirmation.
- Application source is in git (`adagentpc-del/divinipartner`), which
  survives independently of any single host.
- Secrets (`.env.local` / production environment variables) are backed up
  or recoverable somewhere other than the lost host -- e.g. a secrets
  manager or a securely stored copy. **This environment cannot confirm
  where production secrets are actually backed up**; flagged as an
  operator fact to verify, not assumed.

## Recovery steps

1. **Provision a replacement host.** Standard steps for whatever hosting
   provider is in use (a new droplet/instance, Node.js runtime, Postgres
   client tools).
2. **Deploy the application** following the existing, already-documented
   deploy steps in `AI_PROJECT_OS/23_DEPLOYMENT.md` ("The deploy loop"):
   clone the repo, install dependencies, build (SPA + server), configure
   environment variables (from the recovered secrets, precondition above).
3. **Provision a fresh database** and restore it from the most recent
   off-host backup using the already live-verified restore mechanism in
   `backup-and-restore-runbook.md` (`node dist/scripts/restore-db.js`).
   Point `DATABASE_URL` at the new database.
4. **Verify readiness before directing traffic**: hit `GET /api/healthz`
   and confirm `{"ok":true,"db":true}` -- this endpoint now performs a real
   database-connectivity check (fixed this session, see
   `docs/platform-standard/section-14-observability-incident-response-dr.md`),
   not just "the process started."
5. **Cut over**: point DNS / the load balancer at the new host. Monitor
   error logs (`server/src/lib/logger.ts`'s structured output, and the
   error-monitoring webhook if configured) closely for the first period
   after cutover.
6. **Post-recovery**: follow `incident-response-plan.md`'s post-incident
   review step -- document what happened, how long recovery actually took
   versus the RTO/RPO assumptions in `backup-and-restore-runbook.md`, and
   update both documents with the real numbers.

## Honest gaps

- **Never exercised end to end.** Each piece (deploy steps, backup/restore,
  the new health check) has been individually verified; the full sequence
  run back-to-back on a genuinely fresh host has not. Recommend a real
  tabletop or staging-environment dry run before relying on this under
  pressure.
- **RTO for this full sequence is unestimated.** `backup-and-restore-runbook.md`
  measures database restore alone (under 30 minutes); host provisioning,
  deploy, secret recovery, and DNS propagation add unmeasured time on top.
- **Off-host backup storage and off-host secrets storage are both
  unconfirmed from this environment** -- see Preconditions above. Without
  both, this runbook describes a plan that cannot actually execute.

## Related documents

- `AI_PROJECT_OS/23_DEPLOYMENT.md`
- `compliance/policies/backup-and-restore-runbook.md`
- `compliance/policies/incident-response-plan.md`
- `docs/platform-standard/operator-actions.md`
