# 51 Security

Source: `server/src/config.ts`, `server/src/app.ts`, `server/src/lib/{session,rateLimit,securityHeaders,storageCrypto,objectStorage,uploadGuard,safe-fetch}.ts`, and Divini-Security-and-iOS-Hardening-Summary.md. Most controls are gated on `NODE_ENV=production`.

## Fail-closed production secrets

- In production, the process THROWS at startup if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is unset, empty, or the known dev fallback. A forgeable session or download URL is treated as worse than a refused boot.
- Outside production these fall back to dev values so the app still boots and typechecks.
- `DOWNLOAD_URL_SECRET` can inherit `SESSION_SECRET` if not set separately.

## CORS deny-by-default

- In production, if the allowlist (`ALLOWED_ORIGINS` + `PUBLIC_APP_URL`) is empty, cross-origin requests are DENIED (restricted to same-origin) and a warning is logged. Permissive CORS only happens outside production.
- Requests with no Origin (same-origin / curl) are allowed.

## Authentication

- Native email/password. Passwords hashed with scrypt (`passwordHash.ts`). Sessions are jose HS256 JWTs keyed by `SESSION_SECRET`, delivered as an httpOnly cookie (`divini_session`) and a bearer token. No OIDC/JWKS surface remains.
- Admin authority is `ADMIN_ALLOWED_EMAILS` on the server. The hardcoded admin email was removed from the shipped SPA bundle; admin status comes from the server `/me`.

## Rate limiting

- `/api` has a general throttle; `/api/auth` has a tighter per-IP limiter (~20 req/min) returning 429 + Retry-After to blunt credential stuffing and account enumeration. Registered before the auth handlers.
- Caveat: single-process in-memory; front with an edge/WAF limiter for multiple replicas. (`server/src/lib/rateLimit.ts`.)

## Security headers

- `server/src/lib/securityHeaders.ts` sets response security headers early (before routes/body parsing). HSTS is on because the app is served behind Caddy over HTTPS.

## Encryption at rest

- Optional AES-256-GCM envelope encryption for stored objects (both local and S3) when `STORAGE_ENCRYPTION_KEY` (base64 of 32 bytes) is set. Layout: iv(12) | authTag(16) | ciphertext. Losing the key makes encrypted objects unrecoverable; back it up separately. (`storageCrypto.ts`.)

## Other hardening

- Webhook integrity: the raw request body is captured in `app.ts` so payment webhooks can verify HMAC against the exact signed bytes.
- Upload guarding: `uploadGuard.ts` and signed, short-lived (HMAC) download URLs (`signDownloadUrl`/`verifyDownloadUrl`).
- Outbound request safety: `safe-fetch.ts` (guards SSRF-style outbound calls).
- `trust proxy` is set so client IPs come from `x-forwarded-for` behind Caddy.

## Operator actions required before production

- Set `SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`.
- Optionally enable storage encryption (`STORAGE_ENCRYPTION_KEY`) and S3.
- Keep `STRIPE_SECRET_KEY` unset until ready (no money moves; see `52_COMPLIANCE.md`).

> TODO(owner): Add error monitoring / structured logging (Sentry-style) before or shortly after taking real money.
