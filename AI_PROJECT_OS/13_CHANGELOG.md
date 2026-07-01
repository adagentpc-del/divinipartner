# 13 Changelog

Reverse-chronological log of major implementations. Each entry: what / why / files / risks / next. Dates reflect the repo docs reviewed (work concentrated mid-to-late June 2026).

---

## 2026-06-24 - Pricing V2 rebuild (flag-gated)

- What: Replaced the legacy subscription-tier + carved-out-fee model with a flat 5% fee added ON TOP of the vendor price, all roles free, venue revenue share = 20% of the platform fee, $10 seats, $49/mo Featured Vendor, and removal of bid-access windows. New public positioning as "Event Commerce Infrastructure." Built across waves W1 (money model) through W6 (migrate + flip), all behind `PRICING_V2` / `VITE_PRICING_V2`.
- Why: Reduce onboarding friction (free for everyone), keep vendors whole, make the platform cost transparent to the client, and give venues a direct stake in on-platform GMV.
- Files: `server/src/lib/pricingMath.ts` (pure on-top math), `server/src/lib/monetization.ts`, `server/src/lib/fees.ts`, `server/src/lib/platformFees.ts`, `server/src/lib/leakage.ts`, `server/src/lib/recommend.ts`, `server/src/routes/featured.ts`, `server/src/routes/payments.ts`, `server/src/lib/features.tsx`, `db/schema-pricing-v2-featured.sql`, `db/schema-pricing-v2-migrate.sql`, `db/schema-venue-revshare.sql`, `src/pages/public/Pricing.tsx`, `src/pages/Landing.tsx`.
- Risks: Flip changes live money math. Mitigated by flag gating, a money-math QA sweep (54k+ booking sizes, zero rounding leaks), an idempotent schema, a one-time data migration, and a documented rollback.
- Next: Set prod env, take a DB snapshot, run the migration, flip the flags, verify end-to-end. See `12_TASK_QUEUE.md` T1-T5.

## 2026-06-24 - Security hardening

- What: Fail-closed production secrets (process throws on startup if `SESSION_SECRET` / `DOWNLOAD_URL_SECRET` are unset/empty/dev-default); CORS deny-by-default in production when the allowlist is empty; per-IP auth rate limiting (20 req/min on `/api/auth` -> 429 + Retry-After); removal of the hardcoded admin email from the shipped SPA bundle (admin status now comes from the server `/me`).
- Why: Close forgery, cross-origin, credential-stuffing, and privilege-leak vectors before taking the app to production money.
- Files: `server/src/config.ts`, `server/src/lib/session.ts`, `server/src/app.ts` (CORS), `server/src/lib/rateLimit.ts`, `server/src/lib/securityHeaders.ts`.
- Risks: Misconfigured prod env now blocks startup by design. Operators must set the secrets and origins.
- Next: T1, T6 in the task queue.

## 2026-06-24 - Legal layer (Terms + 5 policies)

- What: Added Terms of Service plus policy pages (Privacy, Payment Policy, Marketplace Conduct, Non-Circumvention) as reachable routes.
- Why: Required for go-live and App Store; supports the not-a-party / third-party-payment posture.
- Files: `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`, `src/pages/PaymentPolicy.tsx`, `src/pages/MarketplaceConduct.tsx`, `src/pages/NonCircumvention.tsx`.
- Risks: Content needs counsel review (governing law Florida, liability cap, arbitration/class waiver).
- Next: T8 (counsel review).

## 2026-06-24 - Object storage + encryption at rest

- What: Pluggable storage provider (local disk or any S3-compatible service via self-signed SigV4, no AWS SDK) with optional AES-256-GCM envelope encryption and HMAC-signed short-lived download URLs.
- Why: Securely hold sensitive vendor documents; allow cloud storage without coupling to a vendor SDK.
- Files: `server/src/storage.ts`, `server/src/lib/objectStorage.ts`, `server/src/lib/storageCrypto.ts`, `server/src/lib/s3sigv4.ts`, `OBJECT-STORAGE.md`.
- Risks: Losing `STORAGE_ENCRYPTION_KEY` makes encrypted objects unrecoverable; key must be backed up separately.
- Next: Optionally move to S3 + versioning before scaling.

## 2026-06-24 - Tests + CI

- What: node:test suites for the pure money math (`tests/pricingMath.test.ts`) and password hashing (`tests/passwordHash.test.ts`), plus a GitHub Actions workflow that typechecks server + SPA and runs the tests on push and PR.
- Why: Guard the money math and auth invariants; gate regressions.
- Files: `tests/pricingMath.test.ts`, `tests/passwordHash.test.ts`, `.github/workflows/ci.yml`, `package.json` (test script).
- Risks: Coverage is intentionally narrow (pure modules). No integration/DB tests yet.
- Next: Expand toward integration tests over time (see `16_TECH_DEBT.md`).

## Earlier (mid-June 2026) - Platform build-out

- What: Native auth cutover (replaced Authentik OIDC), AI COO V2, intelligence moat, venue intelligence, friction-elimination, gap-closure waves, vendor teams + nonprofit phase 1, profile decks/programs, Stripe Connect payout rail. Many of these are reflected in the route and lib inventory.
- Why: Build the marketplace OS and its intelligence and money layers.
- Files: see `20_CODEBASE_MAP.md` and the repo addendum docs (INTELLIGENCE-MOAT-ADDENDUM.md, VENUE-INTELLIGENCE-ADDENDUM.md, AI-COO-V2-ROADMAP.md, FRICTION-ELIMINATION-ADDENDUM.md, CHANGES.md, VERIFICATION.md).
- Risks/Next: superseded by the Pricing V2 work above for go-live.

> TODO(owner): Backfill precise dates for the earlier build-out entries from CHANGES.md if needed.
