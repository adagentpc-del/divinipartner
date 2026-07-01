# 16 Tech Debt

Known debt and cleanup, roughly ordered by value.

## Dual pricing paths

- The legacy (V1 tier/carve-out) and V2 (on-top) money paths coexist behind the `PRICING_V2` flag. Once V2 is stable in production, remove the legacy branches, the tier constants, and the `VENUE_SHARE_MAX_FEE_FRACTION` cap logic to cut complexity. (`server/src/db.ts`, `server/src/lib/monetization.ts`, `server/src/lib/fees.ts`.)

## Test coverage is narrow

- Only pure modules are tested (money math, password hashing). No integration tests against the DB or the API surface, no SPA tests. The largest risk surfaces (payment routes, ledgers, auth flows) are covered indirectly. Add integration tests incrementally, starting with payment + venue-share ledger writes.

## Documentation drift

- Stale Authentik/OIDC references in `.env.local.example` and `package.json`. Stale port/table-count in `db/SCHEMA-NOTES.md`. Reconcile with the live code and the consolidated schema.

## Repo artifacts

- ~50 `dist_*` directories and dozens of `vite.config.ts.timestamp-*.mjs` files in the repo root. Remove them; add patterns to `.gitignore` if not already ignored.

## Raw SQL surface

- Data access is hand-written SQL spread across `server/src/db.ts`, `server/src/db/*`, and route modules. It is fast and explicit but easy to drift. Centralize money math through `pricingMath.ts` (already done) and keep ledger writes in a small number of well-tested functions.

## Storage hardening

- Default is local-disk plaintext. Before scale: move to S3, enable encryption at rest, enable bucket versioning, and set up backups + separate key backup. (`OBJECT-STORAGE.md`.)

## Observability

- No structured logging or error monitoring (Sentry-style). Add before or shortly after taking real money.

> TODO(owner): Prioritize and assign owners to the above as capacity allows.
