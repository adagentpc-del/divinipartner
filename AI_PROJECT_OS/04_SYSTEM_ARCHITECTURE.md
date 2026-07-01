# 04 System Architecture

## High-level shape

One Node process serves everything.

```
Browser / iOS webview
      |
      v
  Caddy (HTTPS, reverse proxy on the droplet)
      |
      v
  pm2 -> node server/dist/index.js  (Express)
      |---- serves built SPA from server/dist/public  (Vite dist copied in)
      |---- serves /api/*  (Express router)
      |
      v
  PostgreSQL 16  (Docker container on the droplet: divini_partners_db)
```

The build copies Vite's `dist/` into `server/dist/public`, and the single Express process serves both the SPA and the API. (Source: `server/src/app.ts`, `deploy.sh`, `package.json` build:all.)

## Frontend

- Vite + React 18 SPA, TypeScript. Entry: `src/main.tsx` -> `src/App.tsx`.
- Routing with React Router (`BrowserRouter`), role-based dashboards (`src/pages/dashboards/*`), public marketing pages (`src/pages/public/*`), legal pages, onboarding, profiles, events/bids/quotes flows.
- Auth context in `src/lib/auth`.
- Build-time flags inlined by Vite via `VITE_*` env vars (e.g. `VITE_PRICING_V2`).

## Backend (Express)

- Entry: `server/src/index.ts` -> builds the app from `server/src/app.ts`.
- `app.ts` pipeline order: security headers -> CORS (deny-by-default in prod) -> JSON/urlencoded body parsing (raw body captured for webhook HMAC) -> auth middleware -> `/api` rate limit -> tighter `/api/auth` rate limit -> main router -> error handler -> static SPA.
- Router: `server/src/routes.ts` mounts ~115 sub-routers from `server/src/routes/*`.
- Data access: a Postgres pool (`server/src/pool.ts`, `server/src/db.ts`) with hand-written SQL. Business logic lives in `server/src/lib/*` (e.g. `pricingMath.ts`, `monetization.ts`, `fees.ts`, `leakage.ts`, `payoutEngine.ts`, intelligence engines).

## Auth (native, replaced Authentik)

- Email/password. Passwords hashed with scrypt (`server/src/lib/passwordHash.ts`).
- Session is a signed HS256 JWT (jose) created/verified in `server/src/lib/session.ts`, keyed by `SESSION_SECRET`.
- The session is delivered as an httpOnly cookie (`divini_session`) and also returned in JSON so the SPA can send it as `Authorization: Bearer <token>`.
- `server/src/auth.ts` middleware reads cookie (preferred) or bearer, verifies, and exposes `getAuth(req)` -> `{ userId, email, isAdmin }`. `isAdmin` = email is in `ADMIN_ALLOWED_EMAILS`.
- Authentik / OIDC verification is fully retired: no JWKS, issuer, or audience checks remain in `auth.ts`. (Note: `.env.local.example` and `package.json` description still mention Authentik historically; the live `auth.ts` is native. Trust the code.)

## Storage

- Pluggable object storage (`server/src/storage.ts` -> `server/src/lib/objectStorage.ts`).
- `STORAGE_PROVIDER=local` (default): disk under `FILE_STORAGE_DIR`.
- `STORAGE_PROVIDER=s3`: any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2, MinIO) via self-signed AWS SigV4 over built-in fetch (no AWS SDK), path-style addressing. Falls back to local if any S3 var is missing.
- Optional encryption at rest: `STORAGE_ENCRYPTION_KEY` (base64 of 32 bytes) -> AES-256-GCM envelope encryption for both providers (`server/src/lib/storageCrypto.ts`). Layout: iv(12) | authTag(16) | ciphertext.
- Downloads are served via HMAC-signed short-lived URLs (`signDownloadUrl` / `verifyDownloadUrl`, secret `DOWNLOAD_URL_SECRET`).

## Email

- HTTP-based (no SMTP). Provider `resend` (or `postal`). Flag-gated: with no key configured, sends are logged and skipped. (`server/src/lib/email.ts`, EMAIL-SETUP.md.)

## Background work

- A worker module (`server/src/worker.ts`, `server/src/routes/worker.ts`) and a scheduler (`server/src/lib/scheduler.ts`) handle deferred/periodic jobs. See `42_AUTOMATIONS.md`.

## Mobile (iOS / Android)

- Capacitor managed-webview shell pointing at the hosted web app (`capacitor.config.ts`, `server.url = https://app.divinipartners.com`, cleartext false, ATS strict). Native build is Mac-only. See `52_COMPLIANCE.md` and IOS-APP-STORE-RUNBOOK.md.

## Feature flags

- `PRICING_V2` (server) and `VITE_PRICING_V2` (SPA build-time) gate the new pricing model. The SPA can also auto-adopt the flag at runtime from `/api/payments/processors`. See `24_ENVIRONMENTS.md`.
