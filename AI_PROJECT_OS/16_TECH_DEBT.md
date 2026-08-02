# 16 Tech Debt

Known debt and cleanup, roughly ordered by value.

## Dual pricing paths

- The legacy (V1 tier/carve-out) and V2 (on-top) money paths coexist behind the `PRICING_V2` flag. Once V2 is stable in production, remove the legacy branches, the tier constants, and the `VENUE_SHARE_MAX_FEE_FRACTION` cap logic to cut complexity. (`server/src/db.ts`, `server/src/lib/monetization.ts`, `server/src/lib/fees.ts`.)

## Test coverage is narrow

- Only pure modules are tested (money math, password hashing). No integration tests against the DB or the API surface, no SPA tests. The largest risk surfaces (payment routes, ledgers, auth flows) are covered indirectly. Add integration tests incrementally, starting with payment + venue-share ledger writes.

## Documentation drift

- RESOLVED: Authentik/OIDC references cleaned up across `.env.local.example`, `package.json`, `server/README.md`, `DIVINI-PARTNERS-DEPLOY.md`, `STAGE-B-CHECKLIST.md` (now a pointer, superseded), `DEPLOY.md`, `GODADDY-DNS.md`, `MOBILE-APP.md`, `RELEASE-RUNBOOK.md`, `EMAIL-TESTING.md`, `VENUE-INTELLIGENCE-ADDENDUM.md`, `READY-TO-SHIP-CHECKLIST.md`. Note `server/src/config.ts` still exports unused `OIDC_ISSUER`/`OIDC_JWKS_URL`/`OIDC_CLIENT_ID` constants (dead code, not referenced anywhere else) — safe cleanup, low priority.
- Remaining: stale port/table-count in `db/SCHEMA-NOTES.md` (describes 27-table local schema; deployed schema is the consolidated `db/apply-all.sql`, ~133 tables). Reconcile with the live code and the consolidated schema.

## Repo artifacts

- RESOLVED: no `dist_*` or `vite.config.ts.timestamp-*` clutter present in the current tree; `.gitignore` already covers both patterns (`dist*/`, `vite.config.ts.timestamp-*`).

## Raw SQL surface

- Data access is hand-written SQL spread across `server/src/db.ts`, `server/src/db/*`, and route modules. It is fast and explicit but easy to drift. Centralize money math through `pricingMath.ts` (already done) and keep ledger writes in a small number of well-tested functions.

## Storage hardening

- Default is local-disk plaintext. Before scale: move to S3, enable encryption at rest, enable bucket versioning, and set up backups + separate key backup. (`OBJECT-STORAGE.md`.)

## Observability

- No structured logging or error monitoring (Sentry-style). Add before or shortly after taking real money.

> TODO(owner): Prioritize and assign owners to the above as capacity allows.
