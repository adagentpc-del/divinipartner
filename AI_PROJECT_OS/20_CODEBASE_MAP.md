# 20 Codebase Map

Repo root: `sites/divini-partners` (within the OpenAD workspace).

## Entry points

- SPA: `src/main.tsx` -> `src/App.tsx` (React Router; all routes wired here).
- Server: `server/src/index.ts` -> `server/src/app.ts` (Express app) -> `node server/dist/index.js` in production.
- Build: `package.json` `build:all` = build SPA (`tsc && vite build`) + build server + copy `dist/` into `server/dist/public`. Deploy uses `deploy.sh`.

## Top-level layout

```
sites/divini-partners/
  src/                  SPA (React)
  server/               Express backend
  db/                   SQL schema files + apply-all.sql (consolidated)
  tests/                node:test suites
  scripts/              helper scripts (e.g. fetch-geoip.sh)
  mobile/               iOS privacy manifest + icon docs
  public/               static assets served by the SPA
  capacitor.config.ts   Capacitor (iOS/Android) config
  deploy.sh             one-command server redeploy
  .github/workflows/    ci.yml
  *.md / *.html         planning, runbook, and audit docs
  dist*/                stale build artifacts (cleanup candidates)
```

## Frontend (`src/`)

- `src/App.tsx` - route table for public, auth, dashboards, onboarding, profiles, events/bids/quotes, intelligence, admin.
- `src/pages/` - ~116 page components, grouped into subfolders:
  - `public/` (Landing, Pricing, ForVenues/Vendors/Planners/Sponsors/Clients, HowItWorks, Marketplace, DiscoverHub, CategoryLanding, DemoPage)
  - `dashboards/` (SuperAdmin, Venue, Vendor, Client, Planner, Installer, Nonprofit, Sponsor)
  - `onboarding/`, `profile/`, `events/`, `event/`, `bids/`, `quotes/`, `quote*`, `invoices/`, `contracts/`, `changeorders/`, `disputes/`, `compliance/`, `intelligence/`, `inventory/`, `marketplace/`, `network/`, `packages/`, `payments/`, `pricing-memory/`, `reports/`, `reviews/`, `sign/`, `support/`, `templates/`, `account/`, `admin/`, `claim/`, `join/`
  - Legal pages at top level: `Terms.tsx`, `Privacy.tsx`, `PaymentPolicy.tsx`, `MarketplaceConduct.tsx`, `NonCircumvention.tsx`
- `src/components/` (incl. `marketing/`) - shared UI.
- `src/lib/` - SPA libs (auth context, API client, helpers).
- `src/theme.css`, `src/index.css` - styling and design tokens (see `31_DESIGN_SYSTEM.md`).

## Backend (`server/src/`)

- `app.ts` - Express app assembly and middleware pipeline.
- `index.ts` - server bootstrap / listen.
- `routes.ts` - mounts ~115 sub-routers under `/api`.
- `routes/` - ~116 route modules (one concern each). Examples: `auth-native.ts`, `payments.ts`, `featured.ts`, `quotes.ts`, `bids.ts`, `events.ts`, `platform-revenue.ts`, `connect-payouts.ts`, `coo.ts`, `divini-score.ts`, `marketplace.ts`, `sponsorships.ts`, `compliance.ts`, `sitemap.ts`.
- `db/` - per-domain SQL access modules (e.g. `payments.ts`, `invoices.ts`, `quotes.ts`, `bids.ts`, `events.ts`, `featured.ts`, `payouts.ts`, `partners.ts`, plus phase INTEGRATION notes).
- `lib/` - business logic and engines. Key files:
  - Money: `pricingMath.ts` (pure on-top math), `monetization.ts`, `fees.ts`, `platformFees.ts`, `leakage.ts`, `revenueLeakage.ts`, `payoutEngine.ts`, `partnerCommission.ts`, `split-engine.ts`, `stripe-connect.ts`.
  - Auth/security: `passwordHash.ts`, `session.ts`, `rateLimit.ts`, `securityHeaders.ts`, `safe-fetch.ts`, `uploadGuard.ts`, `trust.ts`.
  - Storage: `objectStorage.ts`, `storageCrypto.ts`, `s3sigv4.ts`.
  - Intelligence: `diviniScore.ts`, `playbooks.ts`, `relationshipGraph.ts`, `partnershipMatch.ts`, `commandCenter.ts`, `cooBriefing.ts`, `cooTasks.ts`, `forecasting.ts`, `businessHealth.ts`, `marketplaceIntel.ts`, `pricingIntel.ts`, `revenueIntel.ts`, `eventWarRoom.ts`, `eventMemory.ts`, `recommend.ts`, `nextbestaction.ts`.
  - Other: `email.ts`, `notify.ts`, `pdf.ts`, `scheduler.ts`, `extract.ts`, `geo.ts`/`geoip.ts`, `llm.ts`, `features.tsx` (flag definitions incl. `PRICING_V2`).
- `config.ts` - central env/config and the fail-closed production secret guard.
- `auth.ts` - native session auth middleware.
- `pool.ts`, `db.ts` - Postgres pool and shared queries.
- `worker.ts` - background worker.
- `scripts/send-test-email.ts` - email verification helper.

## Database (`db/`)

- `apply-all.sql` - consolidated, idempotent schema applied on deploy (~133 `create table`).
- Many per-domain schema files (phase2-8, native-auth, pricing-v2, venue-revshare, intelligence/IM, venue-intelligence/VI, friction-elimination/FE, nonprofit/NP, claim, campaigns, connect-payouts, etc.).
- `schema-pricing-v2-migrate.sql` - one-time V2 data migration.
- `SCHEMA-NOTES.md` - early local-validation notes (port 5433, original 27-table core); see `21_DATABASE.md`.

## Tests + CI

- `tests/pricingMath.test.ts`, `tests/passwordHash.test.ts`.
- `.github/workflows/ci.yml` - typecheck server + SPA + run tests.
