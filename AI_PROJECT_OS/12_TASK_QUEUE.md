# 12 Task Queue

Prioritized backlog, seeded from the Go-Live runbook remaining items and the V2 flip runbook. Status values: TODO, IN-PROGRESS, BLOCKED, DONE.

---

## T1 - Set production environment (fail-closed secrets)

- Priority: P0
- Status: TODO
- Owner: adagentpc@gmail.com (operator)
- Dependencies: none
- Effort: S
- Acceptance: server `.env.local` has `NODE_ENV=production`, `SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, `ADMIN_ALLOWED_EMAILS`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`; app boots (does not throw on startup); no empty-CORS warning in logs.
- Related files: `server/src/config.ts`, `server/src/lib/session.ts`, `.env.local.example`
- Notes: In production the app THROWS at startup if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is unset/empty/dev-default.

## T2 - Configure email (Resend) and verify

- Priority: P0
- Status: TODO
- Owner: operator
- Dependencies: T1
- Effort: S
- Acceptance: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM` set; domain SPF/DKIM/DMARC in DNS; `node dist/scripts/send-test-email.js you@example.com` exits 0; register -> verify email -> login works on the live site.
- Related files: `server/src/lib/email.ts`, `EMAIL-SETUP.md`
- Notes: Without a key, email is logged and skipped; users cannot verify and therefore cannot log in.

## T3 - Apply schema and run V2 data migration

- Priority: P0
- Status: TODO
- Owner: operator
- Dependencies: T1
- Effort: S
- Acceptance: `db/apply-all.sql` applied (idempotent) creating `featured_placements`, `venue_revenue_share`, and venue columns on `platform_revenue`; DB snapshot taken; `db/schema-pricing-v2-migrate.sql` run once (all orgs free, `platform_fee_rate=0.05`).
- Related files: `db/apply-all.sql`, `db/schema-pricing-v2-migrate.sql`, `db/schema-pricing-v2-featured.sql`, `db/schema-venue-revshare.sql`
- Notes: Snapshot BEFORE the migration: `docker exec divini_partners_db pg_dump -U aibos divini_partners > ~/divini_partners_preV2.sql`.

## T4 - Flip Pricing V2 and deploy

- Priority: P0
- Status: TODO
- Owner: operator
- Dependencies: T1, T3
- Effort: S
- Acceptance: `PRICING_V2=true` and `VITE_PRICING_V2=true` in `.env.local`; `bash deploy.sh`; `pm2 restart divini-partners --update-env`; `/api/healthz` 200; `/api/payments/processors` shows `pricing_v2:true`; public Pricing page shows free roles + $49 Featured; no tier picker at signup.
- Related files: `deploy.sh`, `server/src/lib/features.tsx`, `src/pages/public/Pricing.tsx`
- Notes: `VITE_PRICING_V2` must be present at BUILD time.

## T5 - Verify V2 money flow end-to-end on live

- Priority: P0
- Status: TODO
- Owner: operator
- Dependencies: T4
- Effort: M
- Acceptance: a test quote -> invoice -> checkout shows "Platform fee (5%)" and the vendor's full quote; a test payment writes `platform_revenue` (fee = 5% of subtotal, vendor net = full subtotal) and a `venue_revenue_share` row = 20% of fee; Featured buy/cancel toggles badge and ranking boost; dashboards show GMV/fees/venue-share tiles.
- Related files: `server/src/lib/pricingMath.ts`, `server/src/lib/monetization.ts`, `server/src/routes/payments.ts`, `server/src/routes/featured.ts`
- Notes: Stripe key still unset, so this validates records, not real money movement.

## T6 - Post-deploy verification (security)

- Priority: P1
- Status: TODO
- Owner: operator
- Dependencies: T4
- Effort: S
- Acceptance: rapid repeated logins on `/api/auth` return 429; file upload + signed download works (and decrypts if encryption on); CI green; no empty-CORS warning.
- Related files: `server/src/lib/rateLimit.ts`, `server/src/lib/objectStorage.ts`, `.github/workflows/ci.yml`

## T7 - Live Stripe key (real money) - DEFERRED

- Priority: P2
- Status: BLOCKED (intentionally deferred)
- Owner: operator
- Dependencies: T5, legal sign-off
- Effort: M
- Acceptance: `STRIPE_SECRET_KEY` set; payouts and venue share leave queue-only and settle via Stripe Connect; not-a-party "we do not hold funds" posture matches the Connect setup.
- Related files: `server/src/lib/stripe-connect.ts`, `server/src/lib/payoutEngine.ts`, `server/src/routes/connect-payouts.ts`, `server/src/routes/payments.ts`
- Notes: Do not enable until counsel reviews Terms + policies and the Connect flow is confirmed.

## T8 - Legal / counsel review

- Priority: P1
- Status: TODO
- Owner: operator + counsel
- Dependencies: none
- Effort: M
- Acceptance: counsel reviews Terms + 5 policies (governing law Florida, liability cap, arbitration/class waiver, consumer-protection nuance); "we do not hold funds" language matches Stripe Connect.
- Related files: `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`, `src/pages/PaymentPolicy.tsx`, `src/pages/MarketplaceConduct.tsx`, `src/pages/NonCircumvention.tsx`

## T9 - iOS native build and App Store submission (Mac-only)

- Priority: P2
- Status: TODO
- Owner: operator (on a Mac)
- Dependencies: hosted app host live over HTTPS (app.divinipartners.com)
- Effort: L
- Acceptance: `npm run build`, `npx cap add ios`, `npx cap sync`; icons/splash generated; `PrivacyInfo.xcprivacy` added; in-app account deletion reachable; signed, uploaded to TestFlight, submitted.
- Related files: `capacitor.config.ts`, `mobile/PrivacyInfo.xcprivacy`, `IOS-APP-STORE-RUNBOOK.md`

## T10 - Repo cleanup (cosmetic)

- Priority: P3
- Status: TODO
- Owner: operator
- Dependencies: none
- Effort: S
- Acceptance: ~50 stale `dist_*` folders and stray `vite.config.ts.timestamp-*.mjs` files removed from the repo root; rsync faster.
- Related files: repo root
- Notes: Cosmetic only; does not affect runtime.

> TODO(owner): Add any product feature tasks beyond go-live as they are defined.
