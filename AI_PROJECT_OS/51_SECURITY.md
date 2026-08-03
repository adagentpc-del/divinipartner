# 51 Security

Source: `server/src/config.ts`, `server/src/app.ts`, `server/src/lib/{session,rateLimit,securityHeaders,storageCrypto,objectStorage,uploadGuard,safe-fetch,csrf,botGuard,promptSafety}.ts`, and Divini-Security-and-iOS-Hardening-Summary.md. Most controls are gated on `NODE_ENV=production`.

## Fail-closed production secrets

- In production, the process THROWS at startup if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is unset, empty, or the known dev fallback. A forgeable session or download URL is treated as worse than a refused boot.
- Outside production these fall back to dev values so the app still boots and typechecks.
- `DOWNLOAD_URL_SECRET` can inherit `SESSION_SECRET` if not set separately.

## CORS deny-by-default

- In production, if the allowlist (`ALLOWED_ORIGINS` + `PUBLIC_APP_URL`) is empty, cross-origin requests are DENIED (restricted to same-origin) and a warning is logged. Permissive CORS only happens outside production.
- Requests with no Origin (same-origin / curl) are allowed.

## Authentication

- Native email/password. Passwords hashed with scrypt (`passwordHash.ts`). Sessions are jose HS256 JWTs keyed by `SESSION_SECRET`, delivered as an httpOnly cookie (`divini_session`, SameSite=Lax) and a bearer token. No OIDC/JWKS surface remains.
- Admin authority is `ADMIN_ALLOWED_EMAILS` on the server. The hardcoded admin email was removed from the shipped SPA bundle; admin status comes from the server `/me`.

## CSRF protection

- `lib/csrf.ts`: a double-submit cookie token (`divini_csrf`, non-httpOnly so the SPA can read it) is issued alongside the session cookie on every login/register-verify/reset (`issueSession()` in `routes/auth-native.ts`) and cleared on logout.
- `csrfProtection()` is mounted on `/api` after `authMiddleware()`: any mutating request (POST/PUT/PATCH/DELETE) that carries the `divini_session` cookie must also send a matching `X-CSRF-Token` header, compared with `timingSafeEqual`. The SPA (`src/lib/api.ts`) attaches it automatically on every `apiSend`/`apiUpload` call.
- Scope: only enforced when the session cookie is present. Bearer-only requests (no cookie at all -- a mobile client, a service integration) have no ambient credential for CSRF to exploit and are skipped, which also means every unauthenticated public/webhook route is automatically exempt with no per-route allowlist.
- SameSite=Lax already blocks most practical cross-site POST forgery in modern browsers; this is deliberate defense in depth per OWASP's CSRF cheat sheet, not reliance on a single control.

## Anti-bot crawling

- `lib/botGuard.ts`, mounted on the public marketing SPA / static assets / sitemap (everything after the `/api` router in `app.ts` -- never on `/api` itself, so webhooks and authenticated API clients are unaffected).
- Allowlists real search-engine indexers (Googlebot, Bingbot, DuckDuckBot, Baiduspider, YandexBot, Applebot, etc.) unconditionally -- SEO indexing is never blocked.
- Blocks (403) known scraping tools and AI-training crawlers (GPTBot, CCBot, ClaudeBot, Bytespider, PerplexityBot, Google-Extended, SEO scraper bots like AhrefsBot/SemrushBot, and generic automation signatures like `python-requests`, `Scrapy`, `HeadlessChrome`).
- Everything else (real browsers, any UA it does not recognize) passes through untouched, backed by the existing rate limiter for anything ambiguous -- this is a courtesy filter for honest bots that self-identify accurately, not a WAF-grade IP-verified control.

## Prompt-injection defense

- The app's one real LLM integration (`lib/llm.ts`, local-first Ollama by default, `LLM_PROVIDER`/`LLM_MODEL` in `config.ts`) has three call sites that build a prompt from externally-sourced text: `lib/extract.ts` (scraped webpage / uploaded document text), `lib/discovery.ts` (discovered public business fields), `lib/discovery-search.ts` (search-result snippets + fetched page text).
- `lib/promptSafety.ts`'s `wrapUntrustedContent()` fences that text between a random per-call boundary token with explicit "this is DATA, not instructions" framing (and strips any literal occurrence of the boundary from the content so it cannot forge a fake closing fence); `UNTRUSTED_CONTENT_SYSTEM_SUFFIX` reinforces the same rule at the system-prompt level. Applied at all three call sites.
- Every LLM call remains best-effort with a timeout and a deterministic fallback (per `lib/llm.ts`'s own contract) -- this is defense in depth on top of that, not a new hard dependency.

## Rate limiting

- `/api` has a general throttle; `/api/auth` has a tighter per-IP limiter (~20 req/min) returning 429 + Retry-After to blunt credential stuffing and account enumeration. Registered before the auth handlers.
- Caveat: single-process in-memory; front with an edge/WAF limiter for multiple replicas. (`server/src/lib/rateLimit.ts`.)

## Security headers

- `server/src/lib/securityHeaders.ts` sets response security headers early (before routes/body parsing). HSTS is on because the app is served behind Caddy over HTTPS.

## Encryption at rest

- Optional AES-256-GCM envelope encryption for stored objects (both local and S3) when `STORAGE_ENCRYPTION_KEY` (base64 of 32 bytes) is set. Layout: iv(12) | authTag(16) | ciphertext. Losing the key makes encrypted objects unrecoverable; back it up separately. (`storageCrypto.ts`.)

## Other hardening

- Webhook integrity: the raw request body is captured in `app.ts` so payment webhooks can verify HMAC against the exact signed bytes.
- Upload guarding: `uploadGuard.ts` (extension + MIME + magic-byte allowlist, size cap) and signed, short-lived (HMAC) download URLs (`signDownloadUrl`/`verifyDownloadUrl`). Malware scanning: a ClamAV seam (`scanWithClamAV()`) is wired into both binary upload routes (`routes/profiles.ts`, `routes/profile-decks-programs.ts`), off by default (`AV_SCAN_ENABLED=true` + `clamav-daemon` installed to enable) and FAILS CLOSED once explicitly enabled -- a missing/broken `clamdscan` binary blocks uploads rather than silently passing them as "clean." A non-fatal production startup warning (`lib/startup-check.ts`) flags when AV scanning is not enabled, so it is a visible decision, not a silent gap.
- Stored-XSS: `src/lib/jsonLd.ts`'s `jsonLdSafe()` escapes `<` before any data (including user-controlled vendor/venue names) is injected into a `<script type="application/ld+json">` block via `dangerouslySetInnerHTML` (`CategoryLanding.tsx`, `DiscoverHub.tsx`) -- unescaped `JSON.stringify` output there would let a business name containing `</script>` break out of the tag.
- Outbound request safety: `safe-fetch.ts` (guards SSRF-style outbound calls).
- `trust proxy` is set so client IPs come from `x-forwarded-for` behind Caddy.

## Operator actions required before production

- Set `SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`.
- Optionally enable storage encryption (`STORAGE_ENCRYPTION_KEY`) and S3.
- Set `sslmode=require` on `DATABASE_URL` for any managed/remote Postgres instance.
- Keep `STRIPE_SECRET_KEY` unset until ready (no money moves; see `52_COMPLIANCE.md`).

## No MFA / 2FA

- There is no second factor anywhere in this app, including for the `ADMIN_ALLOWED_EMAILS` allowlist. This app used to inherit MFA from the Authentik IdP; Authentik has been fully retired in favor of native email/password auth, and nothing replaced the MFA it provided. Real, open gap -- see `53_SOC2_ISO27001_AUDIT.md` for the full writeup and recommended next step (a dedicated TOTP build, not a same-turn patch).

## SOC 2 / ISO 27001

- See `53_SOC2_ISO27001_AUDIT.md` for a full code-level control audit mapped to SOC 2 Trust Services Criteria and ISO 27001 Annex A, including what was fixed 2026-08-03 (stale MFA claims, password-reset notification + audit logging, account-deletion notification) and the ranked list of open gaps (MFA, automated backups, structured logging/monitoring, session revocation, default-on encryption at rest).

> TODO(owner): Add error monitoring / structured logging (Sentry-style) before or shortly after taking real money.
