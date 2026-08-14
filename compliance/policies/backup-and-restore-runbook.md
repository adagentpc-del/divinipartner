# Backup and Restore Runbook

Status: DRAFT (same as every other document in this folder — needs a named
owner and a rehearsed production restore before it's a relied-upon control).
Written for the ALFY2 pack Section 06 (Database Integrity, Data Lifecycle,
Backups & Recovery) audit, 2026-08-08.

## Mechanism

- `server/src/scripts/backup-db.ts` — `pg_dump --clean --if-exists
  --no-owner --no-privileges` piped through gzip, uploaded via the same
  pluggable object-storage layer used for user document uploads
  (`server/src/lib/objectStorage.ts`): local disk by default, S3-compatible
  when `STORAGE_PROVIDER=s3` is set, envelope-encrypted at rest under
  `STORAGE_ENCRYPTION_KEY` either way. A small JSON manifest
  (`backups/db/manifest.json`) tracks what backups exist and when they were
  made, since neither storage provider exposes a native list operation.
  Refuses to trust (and upload) a suspiciously small dump (< 1KB compressed)
  as a defense against a silent `pg_dump` failure being mistaken for a
  successful backup.
- `server/src/scripts/restore-db.ts` — downloads a backup (by exact key or
  `latest`, resolved from the manifest), decompresses, and replays it with
  `psql --set ON_ERROR_STOP=1`. Because the dump was taken with
  `--clean --if-exists`, replaying it **drops and recreates every object it
  contains** in whatever database `DATABASE_URL` points at — this script is
  destructive by design and requires an interactive `restore` confirmation
  unless `--yes` is passed.
- Retention: `BACKUP_RETENTION_DAYS` (default 14) — `backup-db.ts` prunes
  its own older backups after each successful run.
- Scheduling: intended to run via cron/systemd timer on the deploy host.
  Exact crontab line documented in `AI_PROJECT_OS/23_DEPLOYMENT.md`:
  `0 3 * * * cd /root/sites/divini-partners/server && /usr/bin/node --enable-source-maps dist/scripts/backup-db.js >> /var/log/divini-backup.log 2>&1`

## RTO / RPO assumptions

These are **assumptions for this stage of the product**, not contractual
SLAs — revisit once there is a paying-customer SLA to actually meet.

- **RPO (Recovery Point Objective): up to 24 hours.** The backup runs once
  daily (03:00 per the documented cron line). In the worst case (a failure
  moments before the next scheduled run), up to a day of writes since the
  last good backup would be lost on a full restore. If this is ever too
  coarse for the business (e.g. once real money is flowing under T7),
  increase backup frequency before that happens — the mechanism supports
  any cron interval with no code change.
- **RTO (Recovery Time Objective): under 30 minutes for a same-host
  restore**, based on this session's live-verified round trip: a
  ~130-table, real-data database (59 orgs / 82 users / 11 events / 23 audit
  log rows at the time of the test) backed up in ~1 second and restored in
  well under a minute, end to end including download and `psql` replay.
  Actual production RTO also depends on how quickly an operator notices the
  need, provisions a target database, and points `DATABASE_URL` at it —
  those steps are not automated and are not included in the measured
  restore time above.

## Live restore verification (2026-08-08)

Per the pack's explicit rule ("do not mark backups PASS merely because a
provider says backups are enabled — validate a safe restore exercise"),
this was actually exercised end to end against the real backup mechanism,
not just read as code:

1. Ran `node dist/scripts/backup-db.js` against the live dev database.
   Result: `backups/db/divini_partners_2026-08-08T19-42-27-426Z.sql.gz`,
   100,301 bytes, completed in 1.094s.
2. Created a disposable scratch database (`divini_restore_test`) — never
   the real dev database, so this test could not destroy anything.
3. Ran `node dist/scripts/restore-db.js latest --yes` with `DATABASE_URL`
   pointed at the scratch database only. Completed with no errors.
4. Verified the restore was a real, complete, byte-for-byte-equivalent
   round trip, not just "the command exited 0":
   - Table count: 170 in both source and restored databases.
   - Row counts matched exactly: `organizations` 59/59, `users` 82/82,
     `events` 11/11, `audit_logs` 23/23.
   - A schema change made earlier in this same session (the new
     `idx_payments_org` tenant index from the Section 06 schema audit)
     was present in the restored database too, confirming the dump
     captures current schema state, not a stale snapshot.
5. Dropped the scratch database immediately after verification. No
   production or shared data was touched at any point in this test.

**Result: PASS**, with real evidence, not an assumption. This is the first
time this mechanism has been exercised as an actual restore since it was
built (2026-08-03, per `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`) — before
today it was a tested-in-isolation script, not a proven round trip.

## What this test does NOT cover (be honest about the gap)

- **The production cron job's actual installation status is unverified
  from this environment.** `AI_PROJECT_OS/23_DEPLOYMENT.md` documents the
  exact crontab line to install, but confirming it is actually running on
  the production droplet requires SSH access to that host, which this
  environment does not have. This is the same outstanding item already
  tracked as risk R-07 (`docs/platform-standard/risk-register.md`) —
  carried forward here, not newly discovered.
- **Off-site / geographically-separate backup storage is not confirmed.**
  With `STORAGE_PROVIDER=local` (the default), backups live on the same
  disk as the database they protect — a host-level disaster (disk failure,
  droplet loss) would take out both together. `STORAGE_PROVIDER=s3` moves
  backups off-host, but whether that is actually configured in production
  is an operator fact this environment cannot see (see
  `docs/platform-standard/operator-actions.md`).
- **Point-in-time recovery (PITR) is not implemented.** The mechanism is
  full daily snapshots only — recovery is always to the moment of the most
  recent backup, not to an arbitrary point in between (e.g. "5 minutes
  before the bad migration ran"). Acceptable at this stage given the RPO
  above; revisit if/when transaction volume makes a day of potential data
  loss unacceptable.
- **This test used a small, low-volume database** (170 tables, low row
  counts across the board). Restore time and reliability at meaningfully
  larger data volumes has not been measured and may differ.

## Operator actions required

See `docs/platform-standard/operator-actions.md` for the authoritative
list. Relevant to backups specifically:

1. Confirm (or install) the backup cron job on the production host per the
   crontab line in `AI_PROJECT_OS/23_DEPLOYMENT.md`, then check
   `/var/log/divini-backup.log` the next morning for a real `[backup-db]
   done.` line with a non-trivial byte count.
2. Confirm whether `STORAGE_PROVIDER=s3` (off-host backup storage) and
   `STORAGE_ENCRYPTION_KEY` (encryption at rest) are actually set in
   production `.env.local` — this document cannot see live production
   environment variable values from this environment.
3. Periodically re-run the restore exercise above (or an equivalent) as a
   rehearsal, not just once — a restore procedure that is only ever tested
   once is a weaker control than one exercised on a schedule.
