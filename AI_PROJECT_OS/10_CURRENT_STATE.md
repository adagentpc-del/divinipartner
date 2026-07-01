# 10 Current State

Last updated: 2026-06-24

## Build status

- Server TypeScript: tsc clean (0 errors).
- SPA TypeScript: tsc clean (0 errors).
- Tests: passing (node:test money-math and password-hash suites).
- Vite build: clean.

(All verified 2026-06-24 per the Pricing V2 QA report and flip runbook.)

## Live status

- divinipartners.com is live in production, currently serving the LEGACY pricing model.
- Pricing V2 is fully built behind the `PRICING_V2` / `VITE_PRICING_V2` flags and is NOT yet flipped on.

## Recently completed

- Pricing V2 rebuild (waves W1-W6): on-top 5% fee, venue share 20% of fee, $10 seats, $49 Featured Vendor, removal of tiers and bid windows, rewritten public pricing/landing copy, new dashboards, data migration. Money math QA cleared for flip.
- Security hardening: fail-closed production secrets, CORS deny-by-default in prod, per-IP auth rate limiting, hardcoded admin email removed from the SPA bundle.
- Legal: Terms plus five policies as reachable pages (Terms, Privacy, Payment Policy, Marketplace Conduct, Non-Circumvention).
- Object storage: pluggable local/S3 provider with optional AES-256-GCM encryption at rest and HMAC-signed download URLs.
- Tests + CI: node:test suite for pure money/auth modules and a GitHub Actions CI workflow (tsc + tests).

## Current blockers (to go live on V2)

1. Set production environment on the server (`SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, `ALLOWED_ORIGINS`/`PUBLIC_APP_URL`, email provider). The app fails closed in production without the security secrets.
2. Flip `PRICING_V2=true` and `VITE_PRICING_V2=true` (paired with a deploy + the one-time data migration).
3. Set a live Stripe key (`STRIPE_SECRET_KEY`) when ready to move real money. Until then payouts and venue share are queue-only (records correct, no funds move).

## Priorities (in order)

1. Set prod env and confirm fail-closed secrets are satisfied.
2. Run the V2 flip procedure (schema apply, data migration, flag flip, deploy, smoke test). See `23_DEPLOYMENT.md`.
3. Configure email (Resend) and verify register -> verify -> login.
4. Defer Stripe live key until the team is ready to take real money.
5. iOS native build (Mac-only) and App Store submission.

## Recommended next task

Set the production `.env.local` on the server with the fail-closed secrets and `ALLOWED_ORIGINS`, then run the Pricing V2 flip exactly per `Divini-Partners-PricingV2-Flip-Runbook.md` (mirrored in `23_DEPLOYMENT.md`), taking a DB snapshot before the one-time data migration. Leave `STRIPE_SECRET_KEY` unset.

## Estimated completion

- Web app: ~90% (built and verified; remaining work is prod env + flip + email verification, not feature work).
- iOS app: ~35% (Capacitor config, manifest, runbook prepared; native build, signing, and App Store submission are Mac-only and not done).

These are point-in-time estimates. Update them when the flip lands or iOS progresses.
