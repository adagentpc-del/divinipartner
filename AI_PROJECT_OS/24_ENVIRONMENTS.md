# 24 Environments

## Environments

- Local dev: Vite dev server (`npm run dev`) for the SPA; the Express server runs from `server/`. Local Postgres (the AI Builder OS PG; `db/SCHEMA-NOTES.md` references port 5433). Outside production, security secrets fall back to dev values and CORS is permissive so the app boots.
- Production: the droplet (Caddy + pm2 + Docker Postgres). `NODE_ENV=production` activates the fail-closed secret guards and CORS deny-by-default.

The same single Node process serves the SPA and the API in all environments.

## Required production environment (`.env.local` on the server)

```
NODE_ENV=production
PORT=<app port; the one Caddy proxies>     # e.g. 3011
DATABASE_URL=postgres://aibos:PASS@127.0.0.1:5432/divini_partners
SESSION_SECRET=<strong unique>             # app THROWS at startup if unset in prod
DOWNLOAD_URL_SECRET=<strong unique>        # or inherits SESSION_SECRET; same guard
ADMIN_ALLOWED_EMAILS=adagentpc@gmail.com
PUBLIC_APP_URL=https://divinipartners.com
ALLOWED_ORIGINS=https://divinipartners.com # empty in prod => cross-origin denied
EMAIL_PROVIDER=resend
EMAIL_API_KEY=re_...                        # required for register -> verify -> login
EMAIL_FROM=Divini Partners <partners@divinipartners.com>
FILE_STORAGE_DIR=/root/partners-files       # local storage root (default if no S3)
```

### Pricing V2 flags

```
PRICING_V2=true            # server flag
VITE_PRICING_V2=true       # SPA build-time flag (must be set at build time)
# optional overrides (defaults shown):
# PLATFORM_FEE_RATE_V2=0.05
# VENUE_SHARE_OF_FEE_V2=0.2
# FEATURED_VENDOR_PRICE_USD=49
# SEAT_PRICE_USD=10         # auto $10 when PRICING_V2=true
```

The SPA can also auto-adopt the flag at runtime from `/api/payments/processors`, but `VITE_PRICING_V2` should still be set at build time for the public copy.

### Optional cloud storage + encryption

```
# STORAGE_PROVIDER=s3
# S3_ENDPOINT=...   S3_REGION=...   S3_BUCKET=...
# S3_ACCESS_KEY_ID=...   S3_SECRET_ACCESS_KEY=...
# STORAGE_ENCRYPTION_KEY=<base64 of 32 random bytes>   # losing it loses the files
```

Generate the encryption key: `openssl rand -base64 32`.

### Money rail (deferred)

```
# STRIPE_SECRET_KEY=...   # leave UNSET until ready to move real money
```

## Legacy / historical env (still in `.env.local.example`, not used by live auth)

- Authentik OIDC vars (`OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_CLIENT_ID`, `VITE_OIDC_*`). The live `server/src/auth.ts` is native email/password and does not use these. Ignore for new work; clean up when convenient.
- V1 venue-share vars (`VENUE_REVENUE_SHARE_RATE`, `VENUE_SHARE_MAX_FEE_FRACTION`). Superseded by the V2 20%-of-fee model.

## Flag and secret behavior notes

- In production: missing/empty/dev-default `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` aborts startup.
- In production: empty `ALLOWED_ORIGINS` (and `PUBLIC_APP_URL`) denies all cross-origin requests and logs a warning.
- Email: with no `EMAIL_API_KEY`, sends are skipped (logged), which blocks verification-gated login on a live site.
