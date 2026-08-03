# 16 Tech Debt

Known debt and cleanup, roughly ordered by value.

## react-router major-version upgrade

- RESOLVED (2026-08-03): upgraded `react-router-dom` from `^6.26.0` (6.30.4) to `^7.18.2`, clearing the two originally-flagged moderate CVEs (open-redirect bypass, arbitrary constructor injection via SSR hydration). This app uses only the classic declarative API (`<BrowserRouter>`/`<Routes>`/`<Route>`, `src/App.tsx`), which v7 kept fully backward-compatible with v6 — the upgrade required zero code changes. Verified with a full live re-crawl of all 271 nav destinations across all 9 roles (271/271 clean) plus the login/logout/register/create-flow interaction tests, all passing.
- One further advisory remains open against 7.18.2 ("RSC Mode CSRF Bypass Allows Action Execution Before 400 Response," GHSA-qwww-vcr4-c8h2) with no non-vulnerable `react-router-dom` release published yet (7.18.2 is the current tip of the line; `npm audit fix --force` would downgrade to 7.11.0, which reintroduces the original, actually-applicable CVEs). Checked applicability: this advisory is specific to React Router's "RSC Mode" (React Server Components / server actions under `createBrowserRouter`), a feature this app does not use at all — no SSR, no server actions, plain client-rendered SPA. Left as-is rather than downgrading into a worse, equally-inapplicable-but-broader vulnerability range; re-run `npm audit` on future `npm install`s and take the next `react-router-dom` patch release when one ships.

## App Store account deletion (new, 2026-08-03)

- Apple Guideline 5.1.1(v) requires reachable in-app account deletion. It does not exist: `src/lib/db.ts`'s `deleteMyAccount()` stub has no UI caller and `POST /account/delete` has no server route. Needs a real design decision (hard delete vs. anonymize, cascade scope across ~130 tables touching an account) before building — a hard blocker for App Store submission, independent of the native build itself. See `15_KNOWN_ISSUES.md`.

## Bundle size / code-splitting (new, 2026-08-03)

- Production build emits one 1.9 MB (419 KB gzipped) JS chunk with no route-level splitting — every role's dashboards, all twelve Divini tools, and the full admin surface ship to every visitor, including someone only reading the public marketing pages. Not urgent at current traffic; `React.lazy()` splitting starting with the admin surface and the Divini tools (the least-visited routes for a typical marketplace visitor) would meaningfully cut first-load time on mobile.

## Dual pricing paths

- The legacy (V1 tier/carve-out) and V2 (on-top) money paths coexist behind the `PRICING_V2` flag. Once V2 is stable in production, remove the legacy branches, the tier constants, and the `VENUE_SHARE_MAX_FEE_FRACTION` cap logic to cut complexity. (`server/src/db.ts`, `server/src/lib/monetization.ts`, `server/src/lib/fees.ts`.)

## Test coverage is narrow

- 53 tests pass (up from the original money-math + password-hashing pair — event-scope, schedule-windows, ICS, and availability suites have been added since), but coverage is still limited to pure modules. No integration tests against the DB or the API surface, no SPA tests. The largest risk surfaces (payment routes, ledgers, auth flows) are covered indirectly, via the manual QA checklist in `50_TESTING.md` and this session's live Playwright nav-crawl harness rather than CI-enforced tests. Add integration tests incrementally, starting with payment + venue-share ledger writes.

## Documentation drift

- RESOLVED (2026-08-03): `10_CURRENT_STATE.md`, `15_KNOWN_ISSUES.md`, and this file refreshed to reflect the 12 Divini tools, the security hardening pass, the full-app QA pass, and the launch-readiness audit + fix pass — all of which happened after the prior 2026-06-24 update and were previously undocumented here.
- Remaining: stale port/table-count in `db/SCHEMA-NOTES.md` (describes 27-table local schema; deployed schema is the consolidated `db/apply-all.sql`, ~133 tables). Reconcile with the live code and the consolidated schema.
- `server/src/config.ts` still exports unused `OIDC_ISSUER`/`OIDC_JWKS_URL`/`OIDC_CLIENT_ID` constants and `package.json` still lists the unused `oidc-client-ts` dependency (dead code, not referenced anywhere else) — safe cleanup, low priority.

## Repo artifacts

- RESOLVED: no `dist_*` or `vite.config.ts.timestamp-*` clutter present in the current tree; `.gitignore` already covers both patterns (`dist*/`, `vite.config.ts.timestamp-*`).

## Raw SQL surface

- Data access is hand-written SQL spread across `server/src/db.ts`, `server/src/db/*`, and route modules. It is fast and explicit but easy to drift. Centralize money math through `pricingMath.ts` (already done) and keep ledger writes in a small number of well-tested functions.
- RESOLVED (2026-08-03): a genuine instance of this drift was found and fixed — ~48 files granted admin-override access via `actor.user.role === "admin"`, checking a database column nothing ever actually wrote that value into (real admin status lives in `ADMIN_ALLOWED_EMAILS` only). Fixed centrally in `server/src/db.ts`'s `getActor()` rather than touching all 48 call sites individually.

## Storage hardening

- Default is local-disk plaintext. Before scale: move to S3, enable encryption at rest, enable bucket versioning, and set up backups + separate key backup. (`OBJECT-STORAGE.md`.)

## Observability

- No structured logging or error monitoring (Sentry-style). Add before or shortly after taking real money. Still true as of the 2026-08-03 audit — the highest-value item on this list that hasn't moved.

> TODO(owner): Prioritize and assign owners to the above as capacity allows.
