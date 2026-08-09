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
- Related files: `deploy.sh`, `server/src/config.ts` (`PRICING_V2`/`VITE_PRICING_V2` flags), `src/pages/public/Pricing.tsx`
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
- Related files: `server/src/lib/stripe-connect.ts`, `server/src/lib/payoutEngine.ts`, `server/src/routes/connect-payouts.ts`, `server/src/routes/payments.ts`, `server/src/lib/stripeAccounts.ts`
- Notes: Do not enable until counsel reviews Terms + policies and the Connect flow is confirmed.
- Update 2026-08-03: a second Connect account shape (Accounts v2, direct
  charge -- `server/src/lib/stripeAccounts.ts`) was added alongside the
  original v1 Express/destination-charge flow, specifically to make the
  connected (vendor) account unambiguously the merchant of record for the
  charge, matching the "we do not hold funds" language more directly than
  the v1 destination-charge path (where the charge technically belongs to
  the platform account first). Confirm with counsel WHICH shape (or both)
  the "not a party" Terms language should describe once this key is set --
  built and typechecked, but NOT live-verified against real Stripe test-mode
  API calls (no `STRIPE_SECRET_KEY` available in the build environment). See
  `22_APIS_AND_INTEGRATIONS.md` for the full detail and `.env.local.example`
  for how to obtain test-mode keys and verify the flow before this task is
  unblocked.

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
- Note (2026-08-03): in-app account deletion is now built and live-verified (Profile -> Account -> "Delete account"; see `15_KNOWN_ISSUES.md`) -- that acceptance criterion is met. The rest of this task (native build, TestFlight, submission) still requires a Mac.

## T10 - Repo cleanup (cosmetic)

- Priority: P3
- Status: TODO
- Owner: operator
- Dependencies: none
- Effort: S
- Acceptance: ~50 stale `dist_*` folders and stray `vite.config.ts.timestamp-*.mjs` files removed from the repo root; rsync faster.
- Related files: repo root
- Notes: Cosmetic only; does not affect runtime.

## T11 - Build MFA / 2FA (SOC 2 / ISO 27001, found 2026-08-03) - RESOLVED

- Status: DONE (2026-08-03). TOTP enrollment + verification flow, 10 single-use backup codes, and enforcement (not just availability) for `ADMIN_ALLOWED_EMAILS` accounts. Live-verified end to end including the real browser UI. See `53_SOC2_ISO27001_AUDIT.md`.
- Related files: `server/src/lib/totp.ts`, `server/src/db/mfa.ts`, `server/src/routes/mfa.ts`, `server/src/routes/auth-native.ts`, `server/src/auth.ts`, `server/src/lib/session.ts`, `src/lib/mfa.ts`, `src/pages/Login.tsx`, `src/pages/profile/ProfileEditor.tsx`, `db/schema-mfa.sql`

## T12 - Automated, scheduled, tested backups (SOC 2 / ISO 27001, found 2026-08-03)

- Priority: P1
- Status: MECHANISM DONE (2026-08-03) / SCHEDULING TODO
- Owner: operator (for the remaining step)
- Dependencies: none
- Effort: S (remaining step is installing one cron line + choosing S3 vs local; the mechanism itself is built)
- Acceptance: DONE -- `server/src/scripts/backup-db.ts` (pg_dump --clean --if-exists -> gzip -> the app's own object storage, encrypted at rest when `STORAGE_ENCRYPTION_KEY` is set, retention-pruned via a manifest) and `restore-db.ts` (with a real confirmation guard), live-verified end to end including a full restore into a scratch database with matching table/row counts and an idempotent second restore. REMAINING: install the cron job on the server (see `23_DEPLOYMENT.md`'s "Automated database backups" section) and decide retention days / S3 vs local-disk -- nothing runs this on a schedule until that cron line is added.
- Related files: `server/src/scripts/backup-db.ts`, `server/src/scripts/restore-db.ts`, `server/src/config.ts` (`BACKUP_RETENTION_DAYS`), `21_DATABASE.md`, `23_DEPLOYMENT.md`

## T13 - Age-affirmation step at registration (RESOLVED 2026-08-09, ALFY2 pack Section 17)

- Status: DONE. `POST /register` (`server/src/routes/foundation.ts`) now requires `ageConfirmed === true` in the request body, returning 400 otherwise -- enforced server-side, not just a client-side checkbox, matching the "server is authority" pattern used throughout this audit. `src/pages/GetStarted.tsx` gained a matching UI checkbox ("I confirm that I am 18 years of age or older") styled and wired identically to the existing, already-live Terms/Privacy acceptance checkbox next to it; client-side validation blocks submission with an inline error if unchecked. Confirmed no other code path calls `POST /register` (every other reference is a `<Link to="/register">` navigation to this same page, including the invite-acceptance flow). Live-verified against a real, disposable Postgres instance: no `ageConfirmed` field -> 400, `ageConfirmed:false` -> 400, `ageConfirmed:true` -> 201 with the organization created.
- Related files: `server/src/routes/foundation.ts`, `src/pages/GetStarted.tsx`.
- See: `docs/platform-standard/section-17-conditional-regulatory-overlays.md`, risk R-01.
- See: `docs/platform-standard/applicability-register.md` (COPPA row), `docs/platform-standard/risk-register.md` R-01.

## T14 - Define retention policy for `audit_logs` (found 2026-08-08, ALFY2 pack Section 01)

- Priority: P1
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S
- Acceptance: `audit_logs` is a real, actively-written table (confirmed via `server/src/lib/audit.ts` and call sites across admin/MFA/payments/support/platform-revenue routes) with no defined retention or purge policy. Add it to the data-retention matrix (once built, see T8-adjacent privacy work) and, if warranted, an automated purge/archive job.
- Related files: `db/apply-all.sql` (`audit_logs` table), `server/src/lib/audit.ts`
- See: `docs/platform-standard/applicability-register.md`, `docs/platform-standard/risk-register.md` R-02.

## T15 - Purge job + retention decision for `visitor_signals` (found 2026-08-08, ALFY2 pack Section 02)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S
- Acceptance: `visitor_signals` (`server/src/db/signals.ts`, written from the public `POST /api/signals`, fed by `src/lib/fingerprint.ts`'s consent-gated device signature + IP + usage-signal collection) grows unbounded today -- confirmed by reading both the route and db module, no purge job exists anywhere. `Privacy.tsx` discloses the collection accurately but does not state a retention period. Decide a retention window (proposed: 12-13 months, see `docs/platform-standard/data-retention-matrix.md`) and build the purge job.
- Related files: `server/src/routes/signals.ts`, `server/src/db/signals.ts`, `src/lib/fingerprint.ts`, `src/pages/Privacy.tsx`
- See: `docs/platform-standard/data-retention-matrix.md`.

## Privacy self-service tool wired up (RESOLVED 2026-08-08, ALFY2 pack Section 02)

- The Module 7 privacy-request / consent / retention-policy backend and UI
  (`server/src/db/compliancePrivacy.ts`, `routes/compliance-privacy.ts`,
  `src/pages/ComplianceCenter.tsx`) already existed and worked correctly
  (live-verified: a non-admin can submit/list their own requests and manage
  consent; is correctly 403'd from admin-only retention-policy writes) but
  was reachable only at the admin-sounding `/admin/compliance` URL with zero
  nav link for ordinary users, and the Privacy Policy told users to email
  support instead of mentioning it.
- Fixed: added a second route `/account/privacy` (same component, which
  already self-scopes its UI by `isAdmin`), linked it from
  `ProfileEditor.tsx`'s Account tab (new "Your data and privacy" section,
  next to the existing "Delete account" section), and updated `Privacy.tsx`
  to reference the self-service path alongside the email fallback.
  Live-verified in a real browser: the link renders, navigates correctly,
  and the page shows only the sections appropriate to a non-admin user.
- Related files: `src/App.tsx`, `src/pages/profile/ProfileEditor.tsx`,
  `src/pages/Privacy.tsx`, `src/pages/ComplianceCenter.tsx`.

## T16 - DMCA / copyright takedown notice (found 2026-08-08, ALFY2 pack Section 02)

- Priority: P1
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: T8 (counsel review, same batch)
- Effort: S (a standard notice-and-takedown page; a real DMCA safe-harbor designation also requires registering a DMCA agent with the US Copyright Office, which is an operator action, not a code task)
- Acceptance: the platform hosts user-generated content (vendor profile images, descriptions, uploaded documents) but has no DMCA/copyright-infringement notice-and-takedown process anywhere in Terms, Privacy, or a standalone page (confirmed via full-text search, 2026-08-08). Add one, explicitly marked DRAFT pending counsel review, following the same pattern as `compliance/policies/`.
- Related files: new page alongside `src/pages/{Terms,Privacy,MarketplaceConduct}.tsx`; `src/App.tsx` routing.

## T17 - AI-use disclosure statement (found 2026-08-08, ALFY2 pack Section 02)

- Priority: P1
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S
- Acceptance: the platform has real, user-facing AI features (Divini Concierge/Builder, document extraction, business discovery -- see `docs/platform-standard/architecture-map.md` §A) but no dedicated AI-use disclosure anywhere in the legal pages (confirmed via full-text search, 2026-08-08). Add a short, clear disclosure of what AI does, what data it sees, and its limitations, explicitly marked DRAFT pending counsel review.
- Related files: new page or a new section within `src/pages/Privacy.tsx`; `src/App.tsx` routing if standalone.

## T18 - Accessibility Statement (found 2026-08-08, ALFY2 pack Section 02)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: Section 11 (the substantive accessibility audit) should inform the statement's content, so sequence after that
- Effort: S
- Acceptance: `docs/platform-standard/applicability-register.md` marks ADA/accessibility as APPLIES (public-facing commercial service, WCAG 2.2 AA baseline), but no Accessibility Statement page exists (confirmed via full-text search, 2026-08-08). Add one once Section 11's audit gives it real content to describe, rather than a content-free placeholder now.
- Related files: new page; `src/App.tsx` routing.

## CI hardened (RESOLVED 2026-08-08, ALFY2 pack Section 03)

- `.github/workflows/ci.yml` previously used `npm install` (does not enforce
  the lockfile), never ran the actual build (only typechecked), and had no
  dependency-vulnerability gate. Fixed: switched to `npm ci` (locked
  installs, both root and server), added real build steps for both, and
  added `npm audit --omit=dev` as a blocking gate for the server package
  (genuinely clean today, 0 vulnerabilities) -- see
  `docs/platform-standard/section-03-repo-supply-chain.md` for why the
  root/SPA side is intentionally not gated yet (all findings trace to
  Capacitor mobile-build-only devDependencies never installed on the
  production server).
- Added `.github/dependabot.yml` (weekly, root npm + server npm + GitHub
  Actions) -- none existed before.
- Related files: `.github/workflows/ci.yml`, `.github/dependabot.yml`.

## T19 - Resolve remaining npm audit findings in Capacitor mobile-build tooling (found 2026-08-08, ALFY2 pack Section 03)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned (needs Mac/Xcode access to verify)
- Dependencies: none
- Effort: S, but requires a real mobile-build smoke test to verify safety
- Acceptance: 11 `npm audit` findings (3 moderate, 7 high, 1 critical) in the root package, all traced to `@capacitor/assets`/`@capacitor/cli`/`xcode` (devDependencies for mobile icon/splash generation and Xcode project manipulation -- never installed on the production Linux server, confirmed `deploy.sh` never runs `npm install`). A safe `npm audit fix` already applied what it could; the rest need `npm audit fix --force`, which would bump these packages and must be verified against a real iOS/Android build before merging, since this environment has no Xcode/Android Studio to test with.
- Related files: `package.json`, `package-lock.json`.
- See: `docs/platform-standard/section-03-repo-supply-chain.md`.

## T20 - Install and configure a linter, wire into CI (RESOLVED 2026-08-08, ALFY2 pack Section 03)

- Status: DONE. Installed ESLint 10 (flat config, `eslint.config.js`) with `typescript-eslint` recommended (non-type-checked variant, for a fast first run), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. First run found 292 problems; investigated rather than blanket-suppressed:
  - Tuned out `react-hooks/set-state-in-effect` (a React-19-era rule flagging ~170 legitimate, safe `useEffect(() => { load(); }, [])` fetch-on-mount instances used idiomatically throughout this React-18 codebase) and `no-useless-assignment` (sampled 5 of 15 findings across both `src/` and `server/src/` -- every one is a safe `let x = <default>;` followed by branch reassignment, not a bug) -- both disabled with an inline comment explaining why, not silently ignored.
  - Found and fixed one **real bug**: `src/pages/QuoteDraftReview.tsx` called hooks conditionally after an early `if (!draftId) return <QuoteDraftList />;` -- a genuine React Rules-of-Hooks violation that could cause state corruption if `draftId` ever transitioned from falsy to truthy without a full remount. Moved the early return below all hook calls.
  - Found and fixed a real anti-pattern: `src/pages/network/VendorNetwork.tsx` used `Math.random()` as a React list-key fallback (a new key every render defeats reconciliation) -- replaced with the array index.
  - Fixed two impure-during-render findings (`Date.now()` as a raw `useState` initializer in `EventDayMode.tsx` -> lazy initializer form), two harmless regex over-escapes (`no-useless-escape` in `profile-decks-programs.ts`/`signatures.ts`), and one confirmed false positive (`ProfileEditor.tsx` -- flagged a hoisted function declaration as "used before declared"; documented inline rather than silently disabling the rule).
  - Remaining 44 warnings (mostly `react-hooks/exhaustive-deps`) are non-blocking by design -- real findings for a future pass, not launch blockers.
  - Added `npm run lint` (root, covers both `src/` and `server/src/`) and wired it into `.github/workflows/ci.yml` as a real, currently-passing gate.
- Related files: `eslint.config.js`, `package.json`, `.github/workflows/ci.yml`, plus the fixes above.

## T21 - Repository governance hygiene (PARTIALLY RESOLVED 2026-08-08, ALFY2 pack Section 03)

- Status: DONE except branch-protection confirmation (needs a GitHub admin) and actually publishing the `v0.1.0` tag (created locally, push rejected -- see below).
  - Added `CODEOWNERS` (repo root) -- default owner is the GitHub remote's owner; flagged money/legal-adjacent paths as candidates for more specific ownership later.
  - Created annotated tag `v0.1.0` locally at this point in history, establishing the pattern for future deploys to tag from -- but **could not push it**: `git push origin v0.1.0` returned a 403 (this session's push access covers branch refs but not tag refs). The tag exists on this branch locally only. Operator: run `git push origin v0.1.0` from an environment with full push access to actually publish it, or re-tag from wherever this branch lands after merge.
  - Resolved the redundant `pnpm-lock.yaml`: removed it and converted `build:server`/`build:all` in `package.json` from `pnpm` to `npm`, matching what CI and the documented deploy loop actually use. Verified `npm run build:all` still works end to end.
- Remaining: **operator to confirm in GitHub repo settings** whether the default branch requires PR review + passing CI before merge, and set it if not already configured.
- Related files: `CODEOWNERS`, `package.json`, removed `pnpm-lock.yaml`.

## T22 - Written secrets-rotation runbook (RESOLVED 2026-08-08, ALFY2 pack Section 03)

- Status: DONE. `compliance/policies/secrets-rotation-runbook.md` -- full secrets inventory (from `docs/platform-standard/architecture-map.md`) with per-secret rotation impact/procedure, when-to-rotate triggers, and the general rotation procedure (including the real gotcha that `PAYOUT_ENC_KEY`/`STORAGE_ENCRYPTION_KEY` need a re-encryption migration, not a drop-in swap). Same DRAFT status as every other `compliance/policies/` document -- needs a named owner and a real rehearsed rotation before it's a relied-upon control.
- Related files: `compliance/policies/secrets-rotation-runbook.md`, `compliance/policies/README.md`.


## T23 - Standalone "sign out all other sessions" action (RESOLVED 2026-08-08, ALFY2 pack Section 04)

- Status: DONE. `POST /api/auth/sign-out-other-sessions` (`requireUser`) calls the existing, already-verified `db.invalidateSessions()`, then re-issues a fresh session for the calling device immediately after (same ordering the password-reset flow already uses), so the device that asked for this stays signed in while every other one is cut off.
- Live-verified with two independent "device" logins for the same account: both worked, device A called the new endpoint, device A still worked immediately after (freshly re-issued token), device B was immediately dead (`401`). Frontend button added to Profile → Account (new "Sessions" section, next to the existing MFA/delete-account controls) and confirmed rendering correctly in a real browser.
- Related files: `server/src/routes/auth-native.ts` (`POST /sign-out-other-sessions`), `src/pages/profile/ProfileEditor.tsx` (new "Sessions" section).

## T24 - Wire up or remove the unused presigned-download-URL mechanism (RESOLVED 2026-08-08, ALFY2 pack Section 05)

- Status: DONE. Removed the dead code rather than wiring up a new route (no product requirement asked for a bearer-token signed-URL download path, and every real download route already uses the org/party-scoped session-authenticated pattern). Removed `signDownloadUrl`/`verifyDownloadUrl` from `server/src/lib/objectStorage.ts`, their re-exports from `server/src/storage.ts`, the now-fully-unused `DOWNLOAD_URL_SECRET` config var and its fail-closed production startup check in `server/src/config.ts`, and the matching warning in `server/src/lib/startup-check.ts`. Updated the misleading doc comments in both files plus `.env.local.example` and `DEPLOY.md` (both told operators to set a secret that no longer does anything). Verified zero remaining references via `grep -rn "DOWNLOAD_URL_SECRET" server/src`, and confirmed the server still boots and serves `/api/healthz` cleanly after the change.
- Related files: `server/src/lib/objectStorage.ts`, `server/src/storage.ts`, `server/src/config.ts`, `server/src/lib/startup-check.ts`, `.env.local.example`, `DEPLOY.md`.
- See: `docs/platform-standard/section-05-authorization.md`, risk R-19.

## T25 - Fix stale platform_fee_rate on subscription cancellation for null-fee-rate roles (RESOLVED 2026-08-08, ALFY2 pack Section 05)

- Status: DONE. `server/src/db.ts`'s `applySubscriptionUpdate()` cancellation branch now calls the same `planTierFor(orgType, "free_partner")` lookup the "active" branch already used, instead of hardcoding `TIERS.free_partner.feeRate`. A cancelled `client`-role org (whose plan catalog entry has `platformFeeRate: null` at every tier) now correctly lands on fee rate 0 instead of the flat partner-role rate.
- Related files: `server/src/db.ts` (`applySubscriptionUpdate`).
- See: `docs/platform-standard/section-05-authorization.md`, risk R-20.

## T26 - Race-proof the entitlement usage-limit checks (found 2026-08-08, ALFY2 pack Section 06)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none (reference implementation already shipped in `credits.ts`)
- Effort: M (5 route files, each needs its own careful transaction wrap + a concurrency test like the one used to verify the credits fix)
- Acceptance: `server/src/routes/{seats,events,inventory,packages,warehouses}.ts` all call `lib/entitlements.ts`'s `checkLimit()` with the shape "count current usage -> check against the plan limit -> insert the new row" as three separate steps with no lock between them. Two concurrent requests at the limit can both pass the check and both insert, letting an org exceed its plan's seat/event/inventory/package/warehouse cap by a small margin under concurrent-request abuse. Not exploitable for money (these are usage caps, not payments) and not cross-tenant, but a real correctness gap. Fix each the same way `server/src/lib/credits.ts`'s `redeemCredit()` was fixed this session: wrap the count-check-insert in one transaction guarded by `pg_advisory_xact_lock(hashtext(org.id))` (scoped per-org here, not per-user, since the limit is org-wide), recomputing the count inside that same transaction. Verify each with the same style of live concurrent-request test used to verify the credits fix (fire N simultaneous requests at the limit, confirm exactly the allowed number succeed and the final count never exceeds the plan limit).
- Related files: `server/src/routes/seats.ts`, `events.ts`, `inventory.ts`, `packages.ts`, `warehouses.ts`; reference fix in `server/src/lib/credits.ts`.
- See: `docs/platform-standard/section-06-database-integrity.md`, risk R-24.

## T27 - Add real FK constraints to partner/payout/exhibitor/sponsor tables before they carry live data (found 2026-08-08, ALFY2 pack Section 06)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: T7 (real Stripe money must be unblocked before these tables have real rows to protect)
- Effort: S once T7 lands
- Acceptance: audited all 81 `*_id`-shaped columns with no FK constraint (`docs/platform-standard/section-06-database-integrity.md` has the full list). Most are intentional (polymorphic type+id references, external Stripe ids) and need no change. A real subset -- `partners`, `partner_commissions`, `partner_referrals`, `partner_payouts`, `payout_instructions`, `connect_accounts`, `exhibitor_orders`, `sponsor_purchases`, and related tables -- are genuine internal references with no FK backing them, currently safe only because every one of those tables is empty (Stripe unconfigured). Add real FK constraints (with considered ON DELETE behavior, following the CASCADE/SET NULL pattern already used elsewhere) before real writes start landing in them.
- Related files: `db/apply-all.sql` (new `alter table ... add constraint ... foreign key ...` block), the tables listed in `docs/platform-standard/section-06-database-integrity.md`.
- See: `docs/platform-standard/section-06-database-integrity.md`, risk R-25.

## T28 - Strip metadata from uploaded images/PDFs (found 2026-08-08, ALFY2 pack Section 07)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S-M (needs a library choice: e.g. `sharp` already covers image EXIF stripping if/when it's added as a dependency; PDF metadata needs a separate small library or a `pdf-lib` pass)
- Acceptance: uploaded images and PDFs (`server/src/routes/profile-decks-programs.ts` and any other route using `validateFileMeta`/`putObjectBytes`) are stored with embedded metadata (EXIF GPS/camera data on photos, PDF author/producer fields) stripped before write. Low severity today given this product's current file mix is mostly business documents (W-9s, COIs) and company logos rather than personal photography, but a real privacy-hygiene gap the moment any user-photo upload feature ships.
- Related files: `server/src/lib/uploadGuard.ts`, `server/src/routes/profile-decks-programs.ts` (and any future upload route).
- See: `docs/platform-standard/section-07-app-perimeter-input-upload-bot.md`, risk R-28.

## T29 - Build an evaluation harness for AI extraction accuracy (found 2026-08-08, ALFY2 pack Section 08)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: M (needs a real golden test set of source pages/documents with known-correct expected extractions)
- Acceptance: no automated evaluation harness or golden test set exists for the website/document profile-extraction feature (`server/src/lib/extract.ts`). At current extraction volume this is a defensible gap (the feature is human-reviewed before anything reaches a live profile, and the LLM is never a hard dependency), but as volume grows it becomes worth measuring: build a small set of representative source pages/documents with known-correct expected field values, and a script that runs extraction against them and reports field-level precision/recall, so a future prompt or model change can be checked against a baseline instead of only spot-checked.
- Related files: `server/src/lib/extract.ts`, new test fixtures/harness (location TBD, likely `server/tests` or a dedicated `eval/` directory).
- See: `docs/platform-standard/section-08-ai-security-governance.md`, risk R-30.

## T30 - Build refund-issuance and dispute-response capability before T7 unblocks (found 2026-08-08, ALFY2 pack Section 09)

- Priority: P1 (conditional on T7 -- must exist before real money goes live, not urgent while it stays off)
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: T7 (real Stripe keys)
- Effort: M
- Acceptance: full-tree grep found zero code paths that call a Stripe/PayPal refund API or handle a `charge.dispute.*` webhook -- the only "refund" references in the codebase are bookkeeping fields in `lib/payoutEngine.ts`'s net-profit calculation. `PaymentPolicy.tsx` already correctly scopes Divini's refund responsibility narrowly (marketplace-facilitator stance: refunds happen between transacting parties or via the processor, and the platform's own facilitation fee is "non-refundable except where required by law") -- so this is not currently a policy contradiction, but it is a real operational gap: if a legally-required refund situation arises for the platform's own fee (double-billing, an unauthorized-transaction dispute), there is no in-app mechanism to act, only a manual Stripe Dashboard action with no documented internal process. Before T7 unblocks real money: (1) build an admin-triggered refund action calling Stripe's refund API, audit-logged; (2) add a `charge.dispute.created`/`charge.dispute.updated` webhook handler that at minimum records the dispute and alerts an operator.
- Related files: `server/src/routes/payments.ts`, `server/src/lib/processors.ts`.
- See: `docs/platform-standard/section-09-payments-stripe-webhooks.md`, risk R-33.

## T31 - Add RFC 8058 List-Unsubscribe header to marketing outreach email (found 2026-08-08, ALFY2 pack Section 10)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S (confirm Resend's transactional-send API supports custom headers, then add `List-Unsubscribe`/`List-Unsubscribe-Post`)
- Acceptance: Claim Engine outreach email (`lib/claim-emails.ts`) already includes a body-embedded unsubscribe link and physical address, satisfying CAN-SPAM's legal minimum -- but does not set the `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058 one-click unsubscribe), which Gmail/Yahoo's 2024+ bulk-sender guidelines increasingly expect even at low volume. Add the header, pointed at the same `unsubscribeUrl()` already used in the body, once Resend's send API's header-support is confirmed.
- Related files: `server/src/lib/claim-emails.ts`, `server/src/lib/email.ts`.
- See: `docs/platform-standard/section-10-email-sms-push-marketing.md`, risk R-35.

## T32 - Strengthen focus indicators across component style blocks (found 2026-08-08, ALFY2 pack Section 11)

- Priority: P1
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: M (design pass required, not a mechanical value swap)
- Acceptance: several interactive elements' `:focus`/`:focus-visible` styling is too subtle to reliably meet WCAG 2.2 AA visible-focus expectations, but focus styling is declared independently in roughly 30 separate component style blocks rather than one shared stylesheet, so a safe fix requires visually verifying each one (not a blind bulk find/replace the way the color-contrast fix in this same section was). Audit each component's focus style, standardize on a visible, sufficiently high-contrast focus ring, and live-verify with keyboard-only navigation across representative pages.
- Related files: component-level `<style>` blocks and CSS modules across `src/pages/` and `src/components/` (see the Section 11 report for the specific set inspected).
- See: `docs/platform-standard/section-11-ux-accessibility.md`, risk R-40.

## T33 - Add a skip-to-main-content link (found 2026-08-08, ALFY2 pack Section 11)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: M (needs a shared layout shell first, or a per-page addition otherwise)
- Acceptance: no "Skip to main content" link exists anywhere in the app (WCAG 2.4.1 Bypass Blocks). Not fixable as one global edit today because the app has no shared layout shell across its 100+ independently-built page components -- either introduce a shared shell that every page routes through (larger refactor) or add the skip link and a matching `id="main"` target to each page individually. Live-verify with keyboard-only navigation that the link appears on first Tab press and correctly moves focus to page content.
- Related files: `src/App.tsx` (routing), individual page components under `src/pages/`.
- See: `docs/platform-standard/section-11-ux-accessibility.md`, risk R-39.

## T34 - Fix organization platform_fee_rate at registration and multi-org-add for null-fee-rate roles (RESOLVED 2026-08-09, ALFY2 pack Section 12)

- Status: DONE (code fix). `server/src/db.ts`'s `registerOrganization()` and `addOrganization()` both now call the same `planTierFor(role, tier)?.platformFeeRate ?? 0` lookup that T25 (Section 05) already fixed for the subscription-cancellation path -- previously both used the flat, role-blind `TIERS[tier].feeRate` directly, so a `client`/`installer`/`sponsor` org (every one of which has a 0% platform-fee catalog entry at every tier) could be created with the generic 5%/2.5%/1% rate baked in, reachable specifically through `installer`/`sponsor` registering at any tier and through `addOrganization`'s default tier for any of the three roles. Live-verified numerically against the real compiled `lib/planCatalog.ts` across every role x tier combination: the three affected roles now resolve to 0, and venue/vendor/supplier/planner (whose catalog rates already matched the flat table) are byte-for-byte unchanged.
- Status: OPEN (operator action). An idempotent backfill (`db/schema-fix-org-fee-rates.sql`, also appended to `db/apply-all.sql`) was written to correct any org row already created with the wrong rate, but has not been run against any live database -- no database was reachable from this session's execution environment. Safe to run any number of times; a no-op if no affected row exists.
- Related files: `server/src/db.ts` (`registerOrganization`, `addOrganization`), `db/schema-fix-org-fee-rates.sql`, `db/apply-all.sql`.
- See: `docs/platform-standard/section-12-core-product-engines.md`, risk R-41, `docs/platform-standard/operator-actions.md`.

## T35 - Add a way to withdraw/change cookie consent after the initial choice (RESOLVED 2026-08-09, ALFY2 pack Section 13)

- Status: DONE. `src/components/CookieBanner.tsx`'s consent banner only ever showed once, on first visit, with no way to bring it back once a choice was stored -- despite `src/pages/Cookies.tsx` telling visitors "use the cookie banner" to change their choice at any time. Added `openCookiePreferences()` (dispatches a custom event the already-mounted banner listens for and re-shows itself on) and a "Manage cookie preferences" button on the Cookie Policy page that calls it; updated the page copy to accurately describe the mechanism. Live-verified end to end with Playwright against the built SPA in a real browser: banner shows on first load, "Accept all" hides it and sets `localStorage`, client-side nav to `/cookies` shows the new button, clicking it reopens the banner, choosing "Reject non-essential" updates the stored value -- every step passed.
- Related files: `src/components/CookieBanner.tsx`, `src/pages/Cookies.tsx`.
- See: `docs/platform-standard/section-13-analytics-personalization.md`, risk R-42.

## T36 - Log and alert on repeated 429 rate-limit hits (found 2026-08-09, ALFY2 pack Section 14)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S
- Acceptance: `server/src/lib/rateLimit.ts` throttles credential-stuffing/abuse attempts with a 429 response but does not log or alert when a client repeatedly triggers it -- a real detection blind spot called out honestly in `incident-response-plan.md`'s Detection section. Add a `logger.warn`/`logger.error` call (with enough context -- IP, route, limiter label -- to investigate) when a client repeatedly hits a limit within a short window, so this becomes visible in the existing structured-logging/error-monitoring pipeline (`lib/logger.ts`) rather than silent.
- Related files: `server/src/lib/rateLimit.ts`, `server/src/lib/logger.ts`.
- See: `docs/platform-standard/section-14-observability-incident-response-dr.md`, `compliance/policies/incident-response-plan.md`.

## T37 - Automated `audit_logs` anomaly scanning (found 2026-08-09, ALFY2 pack Section 14)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: M
- Acceptance: `audit_logs` (`server/src/lib/audit.ts`) records 45+ sensitive-action call sites with actor/action/before-after state/IP, but nothing actively monitors it -- detection depends entirely on someone thinking to query it by hand. Build a scheduled job (the existing `server/src/lib/scheduler.ts`/`worker.ts` cron pattern) that flags obvious anomalies (e.g. an unusual spike in admin actions from one actor, repeated failed-then-succeeded sensitive actions, activity from a newly-added admin email) and routes a flag through the existing `logger.error`/webhook pipeline so it surfaces the same way any other error does.
- Related files: `server/src/lib/audit.ts`, `server/src/lib/scheduler.ts`, `server/src/worker.ts`, `server/src/lib/logger.ts`.
- See: `docs/platform-standard/section-14-observability-incident-response-dr.md`, `compliance/policies/incident-response-plan.md`.

## T38 - Return 400 (not 500) for malformed :id path params (RESOLVED 2026-08-09, ALFY2 pack Section 15)

- Status: DONE. Live adversarial testing against a real running server + database found that malformed `:id`-shaped path params (SQL-injection-style payloads and simple typos alike) produced a raw 500 with a generic body -- reproduced on two independent public routes (`GET /api/calendar/:orgId/availability`, `GET /api/public/tour/:tourId`). Confirmed this was never an injection risk: the query is parameterized, so the payload never became SQL syntax -- Postgres rejected it at the type-cast layer (error code `22P02`), and that rejection fell through to the generic 500 branch instead of a clean 4xx. Fixed with one central check in `server/src/routes.ts`'s `errorHandler` recognizing `22P02` and returning `400 {"error":"invalid id"}` -- covers every route with this shape app-wide, not just the two confirmed. Live re-verified: both original routes now 400, a benign malformed ID also 400, and a real not-found UUID still correctly 404s (fix is precise, not over-broad).
- Related files: `server/src/routes.ts` (`errorHandler`).
- See: `docs/platform-standard/section-15-qa-e2e-load-pentest-regression.md`, risk R-46.

## T39 - Classify paid flows for Apple IAP and build native-shell gating if needed (found 2026-08-09, ALFY2 pack Section 16)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned (needs a business/legal classification decision first)
- Dependencies: none
- Effort: S for the decision + documentation; S for the code if gating turns out to be needed
- Acceptance: `IOS-APP-STORE-RUNBOOK.md` and `AI_PROJECT_OS/52_COMPLIANCE.md` both correctly flag that Apple may require In-App Purchase for some paid flows (Featured Vendor $49/mo, listing/placement fees, subscriptions) depending on whether they classify as digital-goods-consumed-in-app versus exempt B2B real-world services, and both propose "gate paid flows behind the web app" as a fallback if the classification is borderline. A full-tree search found zero code anywhere that detects the app is running inside the native Capacitor shell (`Capacitor.isNativePlatform()` or equivalent) -- the proposed mitigation has no supporting implementation. First step: make the actual classification call per flow (documented rationale for App Review notes, per the runbook). Only if that call concludes gating is needed: build a small `Capacitor.isNativePlatform()`-based helper and conditionally hide/redirect the specific flows that need it.
- Related files: `IOS-APP-STORE-RUNBOOK.md`, `AI_PROJECT_OS/52_COMPLIANCE.md`, `capacitor.config.ts`.
- See: `docs/platform-standard/section-16-mobile-ios-android-app-store.md`, risk R-48.

## ALFY2 / Claude Master Platform Execution Pack (started 2026-08-08)

A separately-uploaded 18-section audit framework is being run against this
repository, tracked under `docs/platform-standard/` (its own required
artifact location, per the pack's rules) rather than duplicated here.
Section 01 (Discovery, Architecture & Applicability Gate), Section 02
(Baseline Legal, Privacy, Consent & User Rights), Section 03 (Repository,
Environments, Secrets, CI/CD & Supply Chain), Section 04
(Authentication, OAuth, Sessions, MFA & Account Recovery), Section 05
(Authorization, RBAC/ABAC, RLS, Tenancy, Admin & Impersonation), Section 06
(Database Integrity, Data Lifecycle, Backups & Recovery), Section 07
(App/API Perimeter, Input Validation, File Upload, Bot & Malware Security),
Section 08 (AI Security, Governance, Prompt-Injection Defense & Model
Quality), Section 09 (Payments, Stripe, Webhooks, Subscriptions,
Marketplace & Tax), Section 10 (Email, SMS, Push Notifications &
Marketing Compliance), Section 11 (UX, Accessibility, Onboarding,
Forms, Navigation & Content Quality), Section 12 (Core Product
Engines: Profiles, Organizations, Admin, Products/Services, Calendar,
Video & Documents), Section 13 (Analytics, Behavior Tracking &
Personalization), Section 14 (Observability, Incident Response &
Disaster Recovery), Section 15 (QA, E2E, Load Testing, Pentest &
Regression), Section 16 (Mobile: iOS, Android & App Store), Section 17
(Conditional Regulatory Overlays), and Section 18 (Final Launch
Readiness, Certification & Sign-off) are **all complete — the full
18-section pack has finished executing**. See
`docs/platform-standard/release-readiness.md` for the final cumulative
status and `docs/platform-standard/section-18-final-launch-readiness.md`
for the closing synthesis. New findings that represent real, actionable
work (like T13-T39 above) still get a task here as they're found in
future passes, so
this queue stays the single place to look for "what's left to do" --
`docs/platform-standard/` is where the pack's own required audit/evidence/
risk trail lives, not a second task list.

> TODO(owner): Add any product feature tasks beyond go-live as they are defined.
