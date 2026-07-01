# 42 Automations

Background jobs, scheduled work, and CI automation.

## Background worker

- `server/src/worker.ts` and `server/src/routes/worker.ts` provide deferred/background processing.
- `server/src/lib/scheduler.ts` schedules periodic work.

Likely responsibilities (based on the engine inventory): weekly payout batches, accrual/ledger maintenance, notification/email sends, score refresh, and other periodic intelligence updates. Examples of refreshable engines: `server/src/routes/score-refresh.ts` / `server/src/lib/score-refresh.ts` (Divini Score refresh), `server/src/lib/postEvent.ts` (post-event recap), follow-ups (`server/src/routes/followups.ts`).

> TODO(owner): Document the exact scheduled jobs, their cadence, how the worker is started in production (separate pm2 process vs in-process), and whether any cron is configured on the droplet. Confirm from `server/src/worker.ts` and the pm2 config.

## Email automation

- Transactional and outreach emails go through `server/src/lib/email.ts` (Resend/Postal, HTTP). Triggered by app events (verification, claim outreach, notifications via `notify.ts`/`recipients.ts`). Gated by `EMAIL_API_KEY`.

## Storage backups (operational automation)

- Local storage: cron `tar` of `FILE_STORAGE_DIR` recommended, e.g. `0 2 * * * tar czf /backups/files-$(date +\%F).tgz -C /data partners-files`, copied off-box, encryption key backed up separately.
- S3: bucket versioning + lifecycle expiry + optional cross-region replication.
- (Source: OBJECT-STORAGE.md. These are recommended, set up by the operator.)

## CI automation

- `.github/workflows/ci.yml` runs on every push and PR: Node 22, install deps (root + server), typecheck server (`tsc -p server/tsconfig.json --noEmit`), typecheck SPA (`tsc -p tsconfig.json --noEmit`), run `npm test`.

## Deploy automation

- `deploy.sh` (server-side): build server, build SPA, stage SPA into `server/dist/public`, `pm2 restart divini-partners`, healthz check. See `23_DEPLOYMENT.md`.

> TODO(owner): If GeoIP data refresh (`scripts/fetch-geoip.sh`) is scheduled, document its cadence.
