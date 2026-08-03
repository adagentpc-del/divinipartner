# 23 Deployment

## Hosting

- DigitalOcean droplet. Caddy reverse proxy terminates HTTPS and proxies to the app. pm2 runs the Node process (`divini-partners`). PostgreSQL 16 runs in a Docker container (`divini_partners_db`).
- Live domain: divinipartners.com.

## Golden rule

`rsync` runs in the MAC terminal. `deploy.sh` and `psql` run in the SERVER web console. NEVER sync `.env.local`. Mixing these up is the recurring "it didn't update" bug. If SSH throttles after rapid repeats, space out attempts (fail2ban).

## The deploy loop

1. MAC - push code (exclude `node_modules`, `.git`, `dist*`, `.env.local`):
   ```
   rsync -avz --delete \
     --exclude node_modules --exclude .git --exclude 'dist*' --exclude .env.local \
     ~/Claude/Projects/OpenAD/sites/divini-partners/ \
     root@SERVER:/root/sites/divini-partners/
   ```
2. SERVER - apply schema (idempotent):
   ```
   docker exec -i divini_partners_db psql -U aibos -d divini_partners < /root/sites/divini-partners/db/apply-all.sql
   ```
3. SERVER - build + restart (this is what `deploy.sh` does):
   ```
   cd /root/sites/divini-partners && bash deploy.sh
   ```
   `deploy.sh` sources `.env.local`, builds the server (`npx tsc`), builds the SPA (`vite build`), copies `dist/` into `server/dist/public`, runs `pm2 restart divini-partners`, then curls `/api/healthz` and prints the HTTP code.
4. SERVER - if env changed, restart with env reload:
   ```
   pm2 restart divini-partners --update-env
   ```

## Pricing V2 flip (the current go-live action)

Run exactly per `Divini-Partners-PricingV2-Flip-Runbook.md`:

1. MAC: rsync code (above).
2. SERVER: snapshot the DB:
   `docker exec divini_partners_db pg_dump -U aibos divini_partners > ~/divini_partners_preV2.sql`
3. SERVER: apply schema (idempotent): `apply-all.sql` (creates `featured_placements`, `venue_revenue_share`, venue columns on `platform_revenue`).
4. SERVER: run the one-time data migration once:
   `docker exec -i divini_partners_db psql -U aibos -d divini_partners < db/schema-pricing-v2-migrate.sql`
5. SERVER: set flags in `.env.local`:
   ```
   PRICING_V2=true
   VITE_PRICING_V2=true
   # optional overrides (defaults shown):
   # PLATFORM_FEE_RATE_V2=0.05
   # VENUE_SHARE_OF_FEE_V2=0.2
   # FEATURED_VENDOR_PRICE_USD=49
   # SEAT_PRICE_USD=10
   # STRIPE_SECRET_KEY=...   (leave UNSET until ready for real money)
   ```
   `VITE_PRICING_V2` must be present at BUILD time (it is inlined into the SPA bundle).
6. SERVER: `bash deploy.sh` then `pm2 restart divini-partners --update-env`.
7. Smoke test: `curl localhost:PORT/api/healthz` -> 200; `/api/payments/processors` shows `pricing_v2:true`; a gated route (e.g. `/api/venue-metrics/summary`) returns 401; `https://divinipartners.com/` -> 200. Hard-refresh the browser and verify the new pricing copy, no tier picker, and the 5% line in quote/checkout/invoice.

## Rollback

- Set `PRICING_V2=false` and `VITE_PRICING_V2=false`, `bash deploy.sh`, `pm2 restart divini-partners --update-env`. The new schema is additive and the legacy logic is intact. To restore legacy tier/fee values, restore from the pre-migration snapshot taken in step 2.

## Automated database backups

The mechanism (`server/src/scripts/backup-db.ts` / `restore-db.ts`) is
built and live-verified (2026-08-03, closing the "no automated backups" gap
from `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`, task T12), but nothing runs
it on a schedule until the cron job below is installed on the server --
this is the one remaining operator action.

Prerequisite: the SERVER host (where pm2 runs the Node process) needs the
`postgresql-client` package installed (`apt-get install postgresql-client`)
so the `pg_dump`/`psql` binaries are on PATH for the Node script to shell
out to -- the DB itself running inside the `divini_partners_db` Docker
container does not make these binaries reachable from the host process.

1. SERVER - confirm `pg_dump`/`psql` are reachable and `DATABASE_URL` in
   `.env.local` points at the DB (over the container's exposed port, same
   value used everywhere else in this app):
   ```
   which pg_dump psql
   ```
2. SERVER - decide retention and (strongly recommended before real user
   data accumulates) off-site storage: set `BACKUP_RETENTION_DAYS` and, for
   real off-site backups rather than local-disk-only, `STORAGE_PROVIDER=s3`
   + the `S3_*` vars + `STORAGE_ENCRYPTION_KEY` in `.env.local` (the same
   vars already used for uploaded-document storage -- backups reuse that
   same object storage under a `backups/db/` prefix, so if S3 + encryption
   are already configured for uploads, backups get both automatically).
3. SERVER - build once (`bash deploy.sh` already does this), then install
   the cron job (daily at 3am server time is a reasonable default; adjust
   for your traffic pattern and the retention window):
   ```
   crontab -e
   # add:
   0 3 * * * cd /root/sites/divini-partners/server && /usr/bin/node --enable-source-maps dist/scripts/backup-db.js >> /var/log/divini-backup.log 2>&1
   ```
   Cron does not source `.env.local` automatically -- either `cd` into the
   server directory and rely on the app's own env-loading if it has one, or
   prefix the command with `env $(cat /root/sites/divini-partners/server/.env.local | xargs)` (mind values containing spaces), or (cleaner) run via a
   small wrapper shell script that sources `.env.local` before exec'ing
   node. Verify the exact working env once with `crontab -l` and a manual
   dry run before trusting the schedule.
4. SERVER - verify it actually ran: check `/var/log/divini-backup.log` the
   next morning for `[backup-db] done.` and a non-trivial byte count, not
   just that cron fired.
5. **Test the restore, at least once, before you need it for real.** Into a
   throwaway database, never the live one:
   ```
   createdb divini_restore_test
   DATABASE_URL="postgres://aibos:PASS@127.0.0.1:PORT/divini_restore_test" \
     node dist/scripts/restore-db.js latest --yes
   ```
   An untested backup is not a verified control -- see
   `compliance/policies/incident-response-plan.md`.

## Procure (sibling app)

- Divini Procure deploys with the same loop into `divini_procure_db` / `/root/sites/divini-procure`. Out of scope for this OS; do not deploy it from this repo. See its own `FIRST-DEPLOY-RUNBOOK.md`.

## CI

- `.github/workflows/ci.yml` typechecks server + SPA and runs the tests on push and PR (Node 22). Keep CI green before deploying.
