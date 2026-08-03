# 10 Current State

Last updated: 2026-08-03

## Build status

- Server TypeScript: tsc clean (0 errors).
- SPA TypeScript: tsc clean (0 errors).
- Tests: passing, 53/53 (node:test — money-math, password-hash, event-scope, schedule-windows, ICS, availability, extract).
- Vite build: clean.

(All verified live 2026-08-03 against a running server + Postgres, per a full launch-readiness audit and its follow-up fix pass — see `15_KNOWN_ISSUES.md` and `16_TECH_DEBT.md` for what's still open.)

## Live status

- divinipartners.com is live in production, currently serving the LEGACY pricing model.
- Pricing V2 is fully built behind the `PRICING_V2` / `VITE_PRICING_V2` flags and is NOT yet flipped on.

## Recently completed

- **The 12 Divini deterministic business tools** (see `docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md` for the full build order and shipped reports): Pipeline, Scope Builder, Proposal Studio, Follow-Up Desk, Profit Map, Price Guide, Quote Compare, Change Desk, Vendor Scorecard, Event Command, Forecast, Business Review. Every one is zero-AI-dependency, entitlement-gated per the pricing catalog, and live-verified end to end. Most generalized/rebranded a solid pre-existing feature rather than being built from scratch.
- **Security hardening pass**: CSRF double-submit-cookie protection, an anti-bot crawler guard (allows real SEO indexers, blocks AI-training crawlers and scrapers, never touches `/api`), prompt-injection fencing on the one real LLM integration (local-first Ollama), fail-closed malware scanning once explicitly enabled, and a stored-XSS fix in the public discovery pages' JSON-LD blocks.
- **Full-app QA pass**: a Playwright crawl of every sidebar nav destination across all 8 org roles + admin (271 total), fixing 4 real bugs found along the way — a stale `users.role` CHECK constraint that silently broke registration for Sponsor/Nonprofit/Donor/Volunteer/Exhibitor/Viewer, a hardcoded-`undefined` plan-tier badge, a permanently-stuck "Scanning event..." dead end on `/event-war-room` with no id, and Search Bids (rebuilt against the real, already-working Bid Board query after discovering its original backend never existed).
- **Launch readiness audit + fix pass**: found and fixed a systemic authorization bug (`actor.user.role === "admin"` checks across ~48 files never fired, since nothing ever wrote that value into `users.role` — real admin status lives in `ADMIN_ALLOWED_EMAILS` only; fixed centrally in `getActor()`). Rebuilt the Admin Console's broken Overview tab against real `/admin/metrics` + `/admin/accounts` data (it also had a second, independent bug: `useFeatures().isAdmin` always read `undefined` since `FeaturesProvider` was never mounted). Patched the safely-fixable dependency vulnerabilities. Removed a fully dead feature-flags/buildings/packages subsystem (5 unreachable files, ~480 lines) that predated the current data model. See `16_TECH_DEBT.md` for what's deliberately deferred (react-router major-version upgrade, account deletion).
- Pricing V2 rebuild (waves W1-W6): on-top 5% fee, venue share 20% of fee, $10 seats, $49 Featured Vendor, removal of tiers and bid windows, rewritten public pricing/landing copy, new dashboards, data migration. Money math QA cleared for flip.
- Legal: Terms plus five policies as reachable pages (Terms, Privacy, Payment Policy, Marketplace Conduct, Non-Circumvention). Counsel review still outstanding — see `52_COMPLIANCE.md`.
- Object storage: pluggable local/S3 provider with optional AES-256-GCM encryption at rest and HMAC-signed download URLs.
- Tests + CI: node:test suite for pure modules and a GitHub Actions CI workflow (tsc + tests).

## Current blockers (to go live on V2)

1. Set production environment on the server (`SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, `ALLOWED_ORIGINS`/`PUBLIC_APP_URL`, email provider). The app fails closed in production without the security secrets.
2. Flip `PRICING_V2=true` and `VITE_PRICING_V2=true` (paired with a deploy + the one-time data migration).
3. Set a live Stripe key (`STRIPE_SECRET_KEY`) when ready to move real money. Until then payouts and venue share are queue-only (records correct, no funds move). Attorney review of Terms/Privacy/Payment Policy must clear first — see `52_COMPLIANCE.md`.
4. In-app account deletion (Apple Guideline 5.1.1(v)) is not actually reachable from any UI, and `POST /account/delete` does not exist server-side — the only trace is a disconnected stub in `src/lib/db.ts`. Needs a real design decision (hard delete vs. anonymize, cascade scope across ~130 tables) before building, not a quick patch.

## Priorities (in order)

1. Set prod env and confirm fail-closed secrets are satisfied.
2. Run the V2 flip procedure (schema apply, data migration, flag flip, deploy, smoke test). See `23_DEPLOYMENT.md`.
3. Configure email (Resend) and verify register -> verify -> login.
4. Design and build reachable in-app account deletion before App Store submission.
5. Defer Stripe live key until the team is ready to take real money and counsel has signed off.
6. iOS native build (Mac-only) and App Store submission.

## Recommended next task

Set the production `.env.local` on the server with the fail-closed secrets and `ALLOWED_ORIGINS`, then run the Pricing V2 flip exactly per `Divini-Partners-PricingV2-Flip-Runbook.md` (mirrored in `23_DEPLOYMENT.md`), taking a DB snapshot before the one-time data migration. Leave `STRIPE_SECRET_KEY` unset.

## Estimated completion

- Web app: ~92% (built, security-hardened, and live-verified; remaining work is prod env + flip + email verification + account deletion, not core feature work).
- iOS app: ~35% (Capacitor config, manifest, runbook prepared; native build, signing, and App Store submission are Mac-only and not done — account deletion above is a hard App Store review blocker, separate from the native build itself).

These are point-in-time estimates. Update them when the flip lands or iOS progresses.
