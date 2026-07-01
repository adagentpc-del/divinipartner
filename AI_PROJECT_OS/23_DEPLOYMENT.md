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

## Procure (sibling app)

- Divini Procure deploys with the same loop into `divini_procure_db` / `/root/sites/divini-procure`. Out of scope for this OS; do not deploy it from this repo. See its own `FIRST-DEPLOY-RUNBOOK.md`.

## CI

- `.github/workflows/ci.yml` typechecks server + SPA and runs the tests on push and PR (Node 22). Keep CI green before deploying.
