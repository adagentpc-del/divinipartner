# Divini Partners — Phase 1 Deploy Runbook

Fresh marketplace app. Reuses your live stack: Authentik (auth), local Postgres
(:5433), Caddy (HTTPS), and the divinipartners.com domain. Runs on **port 3011**
as its own pm2 process `divini-partners`, alongside the old A3 app (port 3010)
until you approve cutover.

Rule that keeps deploys sane: **`rsync` runs in the Mac Terminal, everything else
runs in the DigitalOcean web console (server).**

---

## STAGE A — Preview the public site (no auth needed)

The public marketing site needs no login, so you can see it immediately.

### A1. Mac Terminal — push the app up
```
rsync -avz --exclude node_modules --exclude .git --exclude 'dist*' ~/Claude/Projects/OpenAD/sites/divini-partners/ root@167.172.135.196:/root/sites/divini-partners/
```

### A2. Server web console — create DB + load full schema (all phases)
`db/apply-all.sql` concatenates the base schema + every phase + the claim engine in the correct order (validated on PG16).
```
docker exec aibos_postgres psql -U aibos -c "CREATE DATABASE divini_partners;" 2>&1 | tail -1
docker exec -i aibos_postgres psql -U aibos -d divini_partners < /root/sites/divini-partners/db/apply-all.sql 2>&1 | tail -3
docker exec aibos_postgres psql -U aibos -d divini_partners -c "select count(*) from information_schema.tables where table_schema='public';"
```

### A3. Server web console — write env (single line; preview values, OIDC added in Stage B)
```
cd /root/sites/divini-partners && PGPW=$(grep -oP '(?<=postgres://aibos:)[^@]+' /root/sites/divinipartner/.env.local | head -1) && mkdir -p /root/partners-files && printf 'DATABASE_URL=postgres://aibos:%s@localhost:5433/divini_partners\nPORT=3011\nPUBLIC_APP_URL=http://167.172.135.196:3011\nBASE_PATH=/\nADMIN_ALLOWED_EMAILS=adagentpc@gmail.com\nFILE_STORAGE_DIR=/root/partners-files\nDOWNLOAD_URL_SECRET=%s\nOIDC_ISSUER=\nOIDC_JWKS_URL=\nOIDC_CLIENT_ID=\nVITE_OIDC_ISSUER=\nVITE_OIDC_CLIENT_ID=\n' "$PGPW" "$(openssl rand -hex 32)" > .env.local && echo "env written pgpw=${#PGPW}"
```

### A4. Server web console — install, build, start, open firewall
```
cd /root/sites/divini-partners && export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=3072 && corepack enable && pnpm install --no-frozen-lockfile && set -a && . ./.env.local && set +a && pnpm rebuild esbuild && BASE_PATH=/ npx vite build && (cd server && npm i --no-save && npx tsc -p tsconfig.json --noEmitOnError false) && rm -rf server/dist/public && cp -r dist server/dist/public && pm2 start bash --name divini-partners --cwd /root/sites/divini-partners -- -c 'set -a; . ./.env.local; set +a; NODE_ENV=production node --enable-source-maps server/dist/index.js' && pm2 save && ufw allow 3011 >/dev/null 2>&1; sleep 6; curl -s -o /dev/null -w "partners :3011 HTTP %{http_code}\n" http://localhost:3011/api/healthz
```
Want `partners :3011 HTTP 200`. Then open **http://167.172.135.196:3011** to preview
the full public site (hero, all sections, For Venues/Vendors/Planners/Clients,
Marketplace, How It Works, Pricing). Login/register will not work yet (Stage B).

After the first start, every future deploy is just:
```
# Mac
rsync -avz --exclude node_modules --exclude .git --exclude 'dist*' ~/Claude/Projects/OpenAD/sites/divini-partners/ root@167.172.135.196:/root/sites/divini-partners/
# Server
bash /root/sites/divini-partners/deploy.sh
```

---

## STAGE B — Turn on login + registration (Authentik + HTTPS)

### B1. DNS (GoDaddy) — add A record
`app.divinipartners.com  ->  167.172.135.196`  (so we do not disturb the live
divinipartners.com until cutover).

### B2. Authentik — create the OIDC app
In Authentik admin (auth.divinipartners.com): create an OAuth2/OpenID provider
+ application, slug **divini-partners**, client type **Public**, redirect URI
`https://app.divinipartners.com/auth/callback` (strict), signing key = the
self-signed cert. Copy the **Client ID**.

### B3. Server — fill OIDC into env (replace CLIENT_ID), then redeploy
```
cd /root/sites/divini-partners && CID=PASTE_CLIENT_ID && sed -i "s|^OIDC_ISSUER=.*|OIDC_ISSUER=https://auth.divinipartners.com/application/o/divini-partners/|; s|^OIDC_JWKS_URL=.*|OIDC_JWKS_URL=https://auth.divinipartners.com/application/o/divini-partners/jwks/|; s|^OIDC_CLIENT_ID=.*|OIDC_CLIENT_ID=$CID|; s|^VITE_OIDC_ISSUER=.*|VITE_OIDC_ISSUER=https://auth.divinipartners.com/application/o/divini-partners/|; s|^VITE_OIDC_CLIENT_ID=.*|VITE_OIDC_CLIENT_ID=$CID|; s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://app.divinipartners.com|" .env.local && bash deploy.sh
```

### B4. Caddy — add the preview host
```
printf '\napp.divinipartners.com {\n    reverse_proxy localhost:3011\n}\n' >> /root/Caddyfile && docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && sleep 18 && echo "https: $(curl -s -o /dev/null -w '%{http_code}' https://app.divinipartners.com/api/healthz)"
```
Open **https://app.divinipartners.com**, click Get started, register (pick a role,
tier, accept terms), land on your role dashboard. `adagentpc@gmail.com` lands on
the Super Admin dashboard.

---

## STAGE C — Cutover (only when you approve the new site)

Point the apex domain at the new app:
```
sed -i 's#reverse_proxy localhost:3010#reverse_proxy localhost:3011#' /root/Caddyfile   # if divinipartners.com block points at the old app
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```
Add `https://divinipartners.com/auth/callback` to the Authentik redirect URIs, set
`PUBLIC_APP_URL=https://divinipartners.com` + matching VITE_OIDC_REDIRECT_URI, and
redeploy. The old A3 app keeps running on 3010 (reachable internally) until you
retire it.

---

## Enabling payments (Stripe + PayPal)

Processors are feature-flagged: with no keys set, the app stays record-only (the
invoice page shows the "connects at go-live" button). Add keys to `.env.local` to
turn them on. Use **test/sandbox** keys first. Payments require login, so do this
during or after Stage B.

Append to `/root/sites/divini-partners/.env.local` (placeholders shown; paste real
test keys):
```
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET
PAYPAL_CLIENT_ID=YOUR_PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET=YOUR_PAYPAL_CLIENT_SECRET
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=YOUR_PAYPAL_WEBHOOK_ID
PAYMENT_CURRENCY=USD
```
Then restart: `pm2 restart divini-partners`.

Webhook endpoints (point the processor dashboards at these once HTTPS is live in
Stage B/C):
- Stripe: `https://app.divinipartners.com/api/payments/webhook/stripe` (events `checkout.session.completed` + `account.updated` so vendor payout status flips automatically after onboarding)
- PayPal: `https://app.divinipartners.com/api/payments/webhook/paypal` (event `PAYMENT.CAPTURE.COMPLETED`)

Automatic money splits are wired:
- **Stripe Connect** — vendors onboard at **/payouts/setup** ("Connect Stripe"). Once
  their Express account is payouts-enabled, an invoice paid by card auto-routes their
  net to them and keeps the Divini platform fee (destination charge + application fee).
  For Connect, the platform Stripe account must have Connect enabled in the dashboard.
- **PayPal Payouts** — vendors save a payout email at /payouts/setup. After a PayPal
  payment captures, their net is sent automatically via PayPal Payouts (your platform
  PayPal app needs the Payouts capability enabled).
- Until a vendor connects a payout method, the payment is held by Divini and tracked
  via `payout_status` for manual release (the prior behavior, unchanged).

The new `payout_accounts` table is included in `db/apply-all.sql` (loads on deploy).
Capture is idempotent (deduped on processor reference) and webhooks are a backstop, so
a vendor is never paid out twice.

---

## Enabling email (receipts, notifications, claim outreach)

Email is feature-flagged. With nothing set, every email call logs and sends
nothing (the prior stub behavior, so the app runs fine). Set a provider to turn
on real sending. Supports **Resend** and **Postal** over HTTP (no SMTP needed).

Append to `/root/sites/divini-partners/.env.local`:
```
EMAIL_PROVIDER=resend
EMAIL_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM=Divini Partners <partners@divinipartners.com>
# For Postal instead of Resend:
# EMAIL_PROVIDER=postal
# EMAIL_API_KEY=YOUR_POSTAL_SERVER_API_KEY
# POSTAL_API_URL=https://postal.yourdomain.com
```
Then `pm2 restart divini-partners`. Once on, notifications (bids, quotes,
messages, status), payment receipts, and the claim outreach sequence all send for
real. Verify the sending domain (SPF/DKIM) in your provider so mail is not spammed.

## PDF invoices and quotes

Branded, downloadable PDFs are generated server-side with pdfkit (pure JS, no
headless browser, so no extra infra). The dep installs automatically during the
A4 build. Endpoints:
- `GET /api/invoices/:id/pdf` (Download PDF button on the invoice page)
- `GET /api/quotes/:id/pdf`

No env or config needed.

---

## Seed Miami-Dade placeholder profiles (107 verified venues)

After the DB is loaded (Stage A), create the unclaimed placeholder profiles:
```
node /root/sites/divini-partners/server/dist/seed-miami.js
```
Reads `data/seed/miami-venues.json` (107 verified Miami-Dade hotels, ballrooms,
estates, waterfront, rooftops, lofts, galleries, farms) and creates an unclaimed
public profile for each: name, official website, logo, category, neighborhood, a
Claim button, and the compliant "generated from public info" banner. Idempotent
(duplicate detection skips re-runs). The full reviewable list is
`data/Miami-Dade-Venues-100.xlsx`. Once email is on (Resend/Postal) and the worker
runs, the ~50 venues with a published public email enter the claim outreach
sequence; add emails for the rest over time via the admin claim console.

## Automation worker (claim outreach + market expansion)

The claim cadence and market-expansion logic now actually fire. Two ways to run:

1. **System cron (recommended), once a day:**
   ```
   0 9 * * *  cd /root/sites/divini-partners && node server/dist/worker.js >> /var/log/divini-worker.log 2>&1
   ```
   `server/dist/worker.js` runs one pass (send all due claim emails on cadence, advance the next market when ready) and exits.
2. **In-process loop:** set `WORKER_INTERVAL_MINUTES=1440` in `.env.local` and `pm2 restart`. The server runs the scheduler on that interval.

Manual trigger (super admin): `POST /api/worker/run`. The worker respects all the
existing stop conditions (suppression, claimed/removed/archived, 6-send cap).

## Local-model AI (local-models-first)

AI features (onboarding profile extraction, claim discovery enrichment, autonomous
discovery search) use a LOCAL model by default and fall back to deterministic logic
when it is unavailable. Point at a local Ollama server:
```
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
LLM_MODEL=llama3.1
# Optional OpenAI-compatible endpoint instead:
# LLM_PROVIDER=openai-compat
# LLM_BASE_URL=https://your-endpoint/v1
# LLM_API_KEY=YOUR_KEY
# LLM_MODEL=...
```
Autonomous claim discovery search (local-first) uses a self-hosted SearXNG when set:
```
SEARCH_PROVIDER=searxng
SEARXNG_URL=https://searx.yourdomain.com
```
With nothing set, discovery still works from admin-supplied rows, and onboarding URL
extraction falls back to the deterministic intake. New endpoints: `POST /api/profile/extract`
(onboarding URL to suggested profile) and `POST /api/claim/admin/discover/search`.

## Team seats

`team_seats` table is in `db/apply-all.sql` (loads on deploy). Partners manage seats
at **/account/seats** (add/remove members, see the running monthly cost at
`SEAT_PRICE_USD`, default $5). "Pay for seats" uses the same Stripe/PayPal checkout
when a processor is configured. Set a different price with `SEAT_PRICE_USD` if needed.

## Production secrets (now enforced)

The server fails to boot in production (`NODE_ENV=production`) if a processor is on
without its webhook secret. So when you set Stripe keys you MUST also set
`STRIPE_WEBHOOK_SECRET`, and with PayPal keys you MUST set `PAYPAL_WEBHOOK_ID`.
`DOWNLOAD_URL_SECRET` must be a real value (A3 sets one). This is a safety gate, not
a bug: an unverified webhook can move money, so the app refuses to run insecure.

The `uq_payments_reference` unique index (prevents double-charge/double-payout under
race) ships in `db/apply-all.sql`, so a fresh Stage A load includes it. If you ever
apply to an already-populated DB, add it manually:
`create unique index if not exists uq_payments_reference on payments(reference) where reference is not null;`

Local GeoIP (self-hosted, for landing personalization only): run
`bash scripts/fetch-geoip.sh` on a machine with internet (downloads the free DB-IP
IP-to-Country Lite .mmdb into `server/data/geo/`, monthly, no API key). The app
auto-detects it via `server/src/lib/geoip.ts` and reads it in-process, no network
call per request. `TIER=city bash scripts/fetch-geoip.sh` gets region+city. With no
DB present, personalization falls back to Accept-Language (region "unknown"). The
visitor data is used only to improve site layout/experience (see the Privacy page);
DB-IP attribution "IP Geolocation by DB-IP" applies. This geoip lib is reusable
across all builds (copy the file + the `maxmind` dep + a .mmdb).

Local model + search are local-first: point `OLLAMA_URL` at a local Ollama and
`SEARXNG_URL` at a self-hosted SearXNG. With neither set, AI features degrade to
deterministic behavior (no crash). Server-side URL fetches (onboarding extraction,
discovery) are SSRF-guarded (private/loopback/metadata IPs blocked, redirects
re-validated).

## Native app (iOS + Android)

See `MOBILE-APP.md`. Capacitor wrapper is configured (`capacitor.config.ts`,
appId `com.divinigroup.divinipartners`) as a managed webview over the hosted
`https://app.divinipartners.com`, so login works exactly as on web. Build on a Mac:
`npm install && npm run build && npx cap add ios && npx cap sync && npx cap open ios`.
The app depends on Stage B (live HTTPS) being up.

---

## What Phase 1 delivers
- Rebranded Divini Partners app on its own stack, one-command deploys.
- Full public marketing site (all blueprint homepage sections + role pages + pricing).
- Role-based registration (venue, vendor, supplier, installer, planner, client) with
  terms acceptance logged, tier selection (Free / Partner $45 / Premier $99) + seat model.
- Six role dashboards (Super Admin, Venue, Vendor, Client, Planner, Installer), wired to /me.
- Full foundation database (27 tables incl. events, bids, quotes, invoices, payments,
  inventory, reviews, disputes, audit, plus the claim-engine tables) ready for later phases.

## Next phases (layered after Phase 1)
2 AI onboarding + co-branded profiles · 3 Event workspace + bid board + quotes ·
4 Inventory + auto-quote engine · 5 Invoices + payments + leakage policy ·
6 Guest lists + floorplans + seating + itinerary · 7 Reviews + trust + AI next-best-action ·
8 Admin intelligence + Claim Profile automation engine + white-label.
