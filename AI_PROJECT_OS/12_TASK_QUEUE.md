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

## T13 - Age-affirmation step at registration (found 2026-08-08, ALFY2 pack Section 01)

- Priority: P2
- Status: NOT STARTED
- Owner: unassigned
- Dependencies: none
- Effort: S
- Acceptance: registration collects an explicit age/13+ (or applicable minimum) affirmation. The product is not child-directed and has no known minor userbase, so this is hygiene rather than a live COPPA violation -- but there is currently zero technical barrier to a minor signing up, which grows "knowingly collects" exposure over time the longer it goes unaddressed.
- Related files: `server/src/routes/auth-native.ts` (registration), `src/pages/GetStarted.tsx`
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

## ALFY2 / Claude Master Platform Execution Pack (started 2026-08-08)

A separately-uploaded 18-section audit framework is being run against this
repository, tracked under `docs/platform-standard/` (its own required
artifact location, per the pack's rules) rather than duplicated here.
Section 01 (Discovery, Architecture & Applicability Gate), Section 02
(Baseline Legal, Privacy, Consent & User Rights), Section 03 (Repository,
Environments, Secrets, CI/CD & Supply Chain), and Section 04
(Authentication, OAuth, Sessions, MFA & Account Recovery) are complete; see
`docs/platform-standard/release-readiness.md` for cumulative status across
all 18 sections as they execute. New findings that represent real,
actionable work (like T13-T22 above) get a task here as they're found,
so this queue stays the single place to look for "what's left to do" --
`docs/platform-standard/` is where the pack's own required
audit/evidence/risk trail lives, not a second task list.

> TODO(owner): Add any product feature tasks beyond go-live as they are defined.
