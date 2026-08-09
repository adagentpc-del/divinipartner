# Evidence Register

Evidence references for PASS/PARTIAL controls in `control-register.md`.
Bootstrapped at Section 01.

| Control ID | Evidence Type | Reference | Captured |
|---|---|---|---|
| S01-01 | File | `docs/platform-standard/architecture-map.md` | 2026-08-08 |
| S01-01 | Command output | `grep` of `package.json`, `server/package.json`, `.github/workflows/ci.yml`, `server/src` env-var references | 2026-08-08 |
| S01-02 | File | `docs/platform-standard/applicability-register.md` | 2026-08-08 |
| S01-02 | File | `AI_PROJECT_OS/52_COMPLIANCE.md`, `AI_PROJECT_OS/12_TASK_QUEUE.md` (T7, T8) | 2026-08-08 |
| S01-04 | Schema | `db/apply-all.sql` — `terms_acceptance` (line ~62), `consent_records` (line ~4183) | 2026-08-08 |
| S01-05 | Schema + code | `db/apply-all.sql` — `audit_logs` (line ~341); `server/src/lib/audit.ts` and call sites in `db.ts`, `routes/{admin,admin-manage,mfa,payments,support,platform-revenue}.ts`, `db/introductions.ts`, `routes/foundation.ts` | 2026-08-08 |

| S02-01 | Code + schema | `src/pages/{Terms,Privacy,PaymentPolicy,MarketplaceConduct,NonCircumvention,Cookies}.tsx`; `src/App.tsx` routes; `terms_acceptance` table | 2026-08-08 |
| S02-02, S02-03 | Command output | Live `curl` tests against a real registered non-admin account: `POST /api/compliance-privacy/requests` → 201, `GET /api/compliance-privacy/requests` → own request only, `POST /api/compliance-privacy/retention` → 403 forbidden | 2026-08-08 |
| S02-03 | Browser screenshot | Playwright, real browser: `/account/privacy` renders the submit-request section and correctly hides the admin-only retention section for a non-admin; `/profile`'s Account tab shows the new "Your data and privacy" link and navigates correctly | 2026-08-08 |
| S02-04 | Database query | `select count(*) from data_retention_policies` → 0 rows (confirms mechanism exists but nothing is declared) | 2026-08-08 |
| S02-05 | Code | `src/components/CookieBanner.tsx`; `src/lib/fingerprint.ts` line ~155 (`if (!consentGranted()) return;`) | 2026-08-08 |
| S02-06 | Code | `server/src/routes/signals.ts`, `server/src/db/signals.ts` — read in full, no purge/retention logic found | 2026-08-08 |
| S02-07 | Command output | `grep -n -i "dmca\|copyright.*infring\|takedown\|artificial intelligence\|accessib"` across `Terms.tsx`, `Privacy.tsx`, `MarketplaceConduct.tsx` → no matches | 2026-08-08 |
| S03-01 | Command output | `git grep` + `git log --all -p` regex scan for Stripe-live-key/AWS-key/PEM patterns across current tree and full history → zero matches; `git log --all --diff-filter=A --name-only` for `.env*` files → zero non-example matches | 2026-08-08 |
| S03-02, S03-03, S03-05 | Command output | `npm ci --dry-run` (root + server) succeeded; full local run of the new CI sequence (typecheck → test → build server → build SPA → `npm audit --omit=dev --prefix server`) — all passed | 2026-08-08 |
| S03-02, S03-03, S03-04 | File | `.github/workflows/ci.yml` (diff), `.github/dependabot.yml` (new) | 2026-08-08 |
| S03-06 | Command output | `npm audit --omit=dev` (root, 11 findings) vs `npm audit --omit=dev --prefix server` (0 findings); `npm ls xcode` and `npm ls tar` tracing both vulnerable chains to `@capacitor/assets`/`@capacitor/cli` | 2026-08-08 |
| S03-06 | File | `deploy.sh` read in full — confirms no `npm install` step runs on the production server | 2026-08-08 |
| S03-07 | Command output | `npx license-checker --summary` full scan | 2026-08-08 |
| S03-08 | Command output | `find` for `CODEOWNERS`/`LICENSE`; `git tag` (empty) | 2026-08-08 |
| S03-09 | File | `server/src/scripts/restore-db.ts` `confirm()` function, read directly | 2026-08-08 |
| S03-10 | Command output | `npm run lint` — 0 errors, exit code 0, confirmed against the full `src/`+`server/src/` tree | 2026-08-08 |
| S03-10 | File | `eslint.config.js`; fixes in `QuoteDraftReview.tsx`, `VendorNetwork.tsx`, `EventDayMode.tsx`, `ProfileEditor.tsx`, `profile-decks-programs.ts`, `signatures.ts` | 2026-08-08 |
| S03-08 | Command output | `npm run build:all` verified working end to end after converting `build:server`/`build:all` from pnpm to npm | 2026-08-08 |
| S03-11 | File | `compliance/policies/secrets-rotation-runbook.md` | 2026-08-08 |
| S04-01 to S04-10 | Command output + browser screenshot | Full live validation-matrix run against a running server with a real registered test account: register/verify/login/wrong-password/unverified-account/MFA-enroll/MFA-login-challenge/backup-codes/password-reset (expired + replayed)/session-revocation/sign-out-other-sessions/rate-limiting/forged-role — see `docs/platform-standard/section-04-authentication.md` for the full table with exact requests and results | 2026-08-08 |
| S04-05 | Script | Purpose-built Python RFC 6238 TOTP generator matching `server/src/lib/totp.ts`'s exact parameters, used to compute real MFA codes without an authenticator app | 2026-08-08 |
| S04-07 | Code | `server/src/routes/auth-native.ts` `POST /sign-out-other-sessions`; `src/pages/profile/ProfileEditor.tsx` "Sessions" section | 2026-08-08 |
| S05-01 | Command output | `grep -ni "row level security\|create policy" db/apply-all.sql` — zero matches | 2026-08-08 |
| S05-02, S05-03 | Command output | Full live adversarial run: two orgs registered via real `POST /api/register` HTTP flow (CSRF + session cookies), Org A created an event/bid/quote/invoice, Org B attempted read/write/status-change/vendor-attach/org-switch against every one — see `docs/platform-standard/section-05-authorization.md` for the exact requests and responses | 2026-08-08 |
| S05-04 | Code | `server/src/routes/signatures.ts` `GET /:id/pdf` (`isParty` check); `server/src/routes/profile-decks-programs.ts` `GET /decks/:id/download` (org-scoped `extras.getDeck()`) — both read in full | 2026-08-08 |
| S05-05 | Command output | `grep -rln "impersonat\|viewAs\|actAs" server/src` — no real matches (loose-pattern false positives ruled out by direct inspection) | 2026-08-08 |
| S05-06 | Command output | `grep -rn "organization_id.*req\.body\|req\.body.*organization_id"` across `server/src/routes/*.ts`; both hits read and traced to their ownership-check call sites | 2026-08-08 |
| S05-07 | Code | `server/src/db.ts` `applySubscriptionUpdate()`; `server/src/lib/entitlements.ts` `isTopTier()`/`checkLimit()`; `server/src/routes/payments.ts` `customer.subscription.*` webhook handlers — full trace | 2026-08-08 |
| S05-08 | File | `src/pages/Privacy.tsx` line ~87 (diff) | 2026-08-08 |
| S05 (all) | File | `docs/platform-standard/authorization-matrix.md` (new), `docs/platform-standard/section-05-authorization.md` (new) | 2026-08-08 |
| S06-01, S06-02, S06-04 | Command output | Live `pg_class`/`pg_constraint`/`pg_indexes` queries against the running database (170 tables); full grep of `db/apply-all.sql` for `CREATE TABLE`/`ALTER TABLE ADD COLUMN`/`DROP` guard coverage | 2026-08-08 |
| S06-03 | Command output | `information_schema.columns` + `pg_indexes` query identifying 12 tables missing an `organization_id` index and 2 missing `user_id`; `db/schema-org-tenant-indexes.sql` applied live via `psql -f`; re-query confirmed zero remaining gaps | 2026-08-08 |
| S06-05 | Code | `server/src/db.ts` `deleteAccount()`, read in full | 2026-08-08 |
| S06-06 | Command output | Real `node dist/scripts/backup-db.js` run (100,301 bytes, 1.094s) against the live dev database; disposable scratch database created; real `node dist/scripts/restore-db.js latest --yes` restore into it; table-count (170/170) and row-count (orgs 59/59, users 82/82, events 11/11, audit_logs 23/23) verification; scratch database dropped after | 2026-08-08 |
| S06-07 | Command output | `pg_indexes` query showing `uq_payments_reference` (partial unique index on `payments.reference`) and `uq_payout_excl_tx`; code read of the `on conflict` inserts they back | 2026-08-08 |
| S06-08 | Command output | Live reproduction + fix verification: seeded a real test user with a $10.00 credit ledger balance, fired 10 concurrent `POST /credits/redeem` requests for $10.00 each against the running server; after the `pg_advisory_xact_lock` fix, exactly 1 succeeded and 9 correctly got "insufficient credit balance," final ledger balance exactly $0.00 (verified by direct query, never negative) | 2026-08-08 |
| S06 (all) | File | `docs/platform-standard/section-06-database-integrity.md`, `compliance/policies/backup-and-restore-runbook.md`, `db/schema-org-tenant-indexes.sql` (all new) | 2026-08-08 |
| S07-01, S07-03 | Command output | `curl -D - -o /dev/null http://localhost:8099/api/healthz` against the running server, before and after the `x-powered-by` fix | 2026-08-08 |
| S07-04 | Command output | `grep -rn "query(\`.*\${" server/src` — zero matches; `db/marketplace.ts`'s dynamic `ORDER BY` read in full, confirmed allowlist-gated | 2026-08-08 |
| S07-05 | Code | `server/src/lib/safe-fetch.ts` (read in full); `server/src/lib/discovery-search.ts`'s `fetchPageText()` call site | 2026-08-08 |
| S07-06 | Code | `server/src/routes/email-track.ts`'s `safeRedirectTarget()`; SPA-wide grep for `searchParams.get('redirect'\|'return'\|'next'\|'url'\|'target')` — zero matches | 2026-08-08 |
| S07-07 | Code | `server/src/db/pipeline.ts`'s `createOpportunity()`, read in full — `organization_id`/`owner_user_id` hardcoded from the server-resolved actor, never from the spread `input` | 2026-08-08 |
| S07-08, S07-09 | Command output | Live multipart uploads against `POST /api/profile-extras/decks` on a real test account: magic-byte-mismatch text-as-PDF (400), path-traversal filename (201, but stored at a sanitized org-scoped key), MZ-header-as-PDF (400); `find /data/procure-files -iname "*passwd*"` confirmed the file landed only at the safe path | 2026-08-08 |
| S07 (all) | File | `docs/platform-standard/section-07-app-perimeter-input-upload-bot.md` (new) | 2026-08-08 |
| S08-01, S08-02, S08-03 | Code | `server/src/lib/promptSafety.ts` (read in full); `server/src/lib/extract.ts` lines ~148-229; `db/apply-all.sql`'s `ai_profile_suggestions` table definition | 2026-08-08 |
| S08-04, S08-06 | Command output | Live `POST /api/profile/extract` against a real registered account with Ollama unreachable: `{"available":false,...}`, no crash; `select * from audit_logs where action='ai.extract_profile'` showing the new trail row with `provider`/`model`/`outcome` populated and no extracted text stored | 2026-08-08 |
| S08-05 | Command output | `grep -rn "SESSION_SECRET\|API_KEY\|password_hash\|reset_token\|verify_token\|totp_secret" server/src/lib/{extract,discovery,discovery-search}.ts` — zero matches | 2026-08-08 |
| S08 (all) | File | `docs/platform-standard/section-08-ai-security-governance.md` (new) | 2026-08-08 |
| S09-01 | Command output | `grep -rniE "card_number|cvc|cvv|pan\b" server/src` — zero real matches; `stripeBilling.ts`/`stripeAccounts.ts` read in full confirming Checkout-Session-only collection | 2026-08-08 |
| S09-02 | Command output | Grepped `payments.ts`/`connect-payouts.ts` for a client-supplied Stripe account/destination id — zero matches; traced `getPayoutAccount`/`activeDirectChargeAccount` call sites, all keyed by `actor.org.id` | 2026-08-08 |
| S09-03, S09-04 | Command output | Live HTTP tests against the running server: forged Stripe signature → 400, missing signature header → 400, neither recorded in `webhook_events`; direct DB test of the dedup insert (`on conflict (provider, event_id) do nothing returning id`) — first insert returns a row, identical second insert returns zero rows | 2026-08-08 |
| S09-06 | Command output | Full-tree grep for a refund API call and `charge.dispute.*` handler — zero matches; `PaymentPolicy.tsx` read in full, confirmed consistent with the code (marketplace-facilitator stance, not a contradiction) | 2026-08-08 |
| S09-07 | Code | `routes/founding-member.ts` + `db/member-attendee.ts`, read in full — no pricing/fee-rate write found | 2026-08-08 |
| S09 (all) | File | `docs/platform-standard/section-09-payments-stripe-webhooks.md`, `db/schema-webhook-events.sql`, `server/src/db/webhookEvents.ts` (all new) | 2026-08-08 |
| S10-01 | Command output | Live DNS lookups (Node's `dns.resolveTxt`/`resolveMx`/`resolveCname`, cross-checked against Cloudflare DNS-over-HTTPS) for `divinipartners.com`, `_dmarc.divinipartners.com`, `resend._domainkey.divinipartners.com`, `send.divinipartners.com` | 2026-08-08 |
| S10-02, S10-03 | Code | `lib/claim-emails.ts`'s `decideSend()` and `complianceFooter()`, read in full | 2026-08-08 |
| S10-04 | Command output | Live HTTP test: forged Resend/Svix webhook signature with `RESEND_WEBHOOK_SECRET` unset → 400; direct DB test of the suppression insert + case-insensitive lookup; direct invocation of `sendEmail()` with a seeded suppression row, both single-recipient (`all recipients suppressed`) and mixed-recipient (per-address filtering confirmed via the logged outgoing recipient list) | 2026-08-08 |
| S10 (all) | File | `docs/platform-standard/section-10-email-sms-push-marketing.md`, `db/schema-communication-suppressions.sql`, `server/src/db/communicationSuppressions.ts` (all new) | 2026-08-08 |
| S11-01, S11-02, S11-03 | Command output | Live axe-core 4.10 scans (Playwright + a real Chromium browser against the actual built/served production bundle) across 9 pages, run twice (before and after the fixes), full JSON violation output captured both times | 2026-08-08 |
| S11-04 | Screenshot | `pricing_hero.png` — full-page Playwright screenshot of the Pricing hero, confirming the flagged white text is genuinely high-contrast against its real (z-index-layered) dark background | 2026-08-08 |
| S11-05, S11-06 | Command output | Full-tree grep for a skip-link/`<main>` landmark (zero matches) and for `outline:\s*none` (30 matches, all the same border-color-replacement pattern) | 2026-08-08 |
| S11-07 | Command output | `grep -rn "<img" src --include=*.tsx \| grep -v "alt="` — zero matches | 2026-08-08 |
| S11-08 | Code | `src/pages/onboarding/Onboarding.tsx`, read in full | 2026-08-08 |
| S11 (all) | File | `docs/platform-standard/section-11-ux-accessibility.md` (new) | 2026-08-08 |
| S12-01 | Command output | Node one-liner importing the compiled `lib/planCatalog.js`, computing the exact `roleTier ? roleTier.platformFeeRate ?? 0 : TIERS[tier].feeRate` expression both fixed call sites now run, across every role x tier combination -- confirms client/installer/sponsor now resolve to 0 at every tier and venue/vendor/supplier/planner are byte-for-byte unchanged | 2026-08-09 |
| S12-01 | Code | `server/src/db.ts` (`registerOrganization`, `addOrganization`), `db/schema-fix-org-fee-rates.sql` (new), `db/apply-all.sql` (appended) | 2026-08-09 |
| S12-02 to S12-08 | Code | Full reads of `orgs.ts`, `profiles.ts`, `admin.ts`, `admin-manage.ts` (leading ~400 lines), `packages.ts`, `calendar.ts` + `db/calendar.ts`, `compliance.ts` + relevant `db/compliance.ts` functions, `venue-twin.ts`; cross-checked against `db/schema-org-membership.sql` and `team_seats` schema for the transfer-owner authorization model | 2026-08-09 |
| S12 (all) | File | `docs/platform-standard/section-12-core-product-engines.md` (new) | 2026-08-09 |
| S13-01 | Command output | Full-tree grep for third-party analytics/tracking script signatures — zero matches | 2026-08-09 |
| S13-02 | Code | `src/lib/fingerprint.ts` (`reportSignal`), `src/components/CookieBanner.tsx`, call-site grep confirming only `Landing.tsx`/`GetStarted.tsx` invoke `reportSignal` | 2026-08-09 |
| S13-03 | Command output | Playwright script against the built SPA in a real browser: banner-on-first-load, accept-all hides it + sets storage, client-nav to `/cookies` shows the new button, click reopens the banner, reject-non-essential updates storage — all steps passed | 2026-08-09 |
| S13-03 | Code | `src/components/CookieBanner.tsx`, `src/pages/Cookies.tsx` | 2026-08-09 |
| S13 (all) | File | `docs/platform-standard/section-13-analytics-personalization.md` (new) | 2026-08-09 |
| S14-01 | Command output | Live test against a real, disposable Postgres 16 instance: `/api/healthz` returned `200 {db:true}` with the database up, then `503 {db:false}` promptly after the database was stopped -- same running server process, both states observed directly | 2026-08-09 |
| S14-01 | Code | `server/src/routes/foundation.ts` (`GET /healthz`) | 2026-08-09 |
| S14-02 | Command output | Grep confirming `logger.error` call sites in `routes.ts`'s central error handler and `index.ts`'s process crash handlers | 2026-08-09 |
| S14-03 | File | `compliance/policies/incident-response-plan.md` (Detection section rewritten) | 2026-08-09 |
| S14-04 | File | `compliance/policies/disaster-recovery-runbook.md` (new) | 2026-08-09 |
| S14 (all) | File | `docs/platform-standard/section-14-observability-incident-response-dr.md` (new) | 2026-08-09 |
| S15-01 | Command output | Live `curl` probes against a real running server + disposable Postgres instance: malformed-UUID payload on 2 independent public routes (500 before, 400 after the fix), a benign malformed ID (400), and a well-formed-but-nonexistent UUID (still 404, unaffected) | 2026-08-09 |
| S15-01 | Code | `server/src/routes.ts` (`errorHandler`, Postgres `22P02` branch) | 2026-08-09 |
| S15-02 to S15-05 | Command output | Live adversarial test session: auth-bypass probes, 25-request rate-limit trigger, real two-org IDOR test (register/verify/login both accounts, create a package as Org A, attempt read/update/delete as Org B), and CSRF probe (missing/correct/wrong token against a real session+CSRF cookie pair) -- all against a real running server and a disposable Postgres 16 instance started and torn down for this session only | 2026-08-09 |
| S15 (all) | File | `docs/platform-standard/section-15-qa-e2e-load-pentest-regression.md` (new) | 2026-08-09 |
| S16-01 | Command output | Cross-reference of `mobile/PrivacyInfo.xcprivacy` against `server/src/db.ts` registration fields; Python `xml.dom.minidom` well-formedness check on the fixed file (caught and required correcting a real XML-comment syntax defect from the first edit attempt) | 2026-08-09 |
| S16-01 | Code | `mobile/PrivacyInfo.xcprivacy` | 2026-08-09 |
| S16-02, S16-03 | Code | `capacitor.config.ts` (read in full), grep of Pricing/account pages for steering language | 2026-08-09 |
| S16-04 | Command output | Full-tree grep for `isNativePlatform`/`Capacitor.` usage in `src/` — zero matches | 2026-08-09 |
| S16 (all) | File | `docs/platform-standard/section-16-mobile-ios-android-app-store.md` (new) | 2026-08-09 |
| S17-01, S17-03 | Cross-reference | Explicit re-check of every Section 01 regulatory determination against Sections 02-16's findings, documented row-by-row in the Section 17 report | 2026-08-09 |
| S17-02 | Command output | Live test against a real, disposable Postgres instance: `POST /register` without `ageConfirmed` (400), with `ageConfirmed:false` (400), with `ageConfirmed:true` (201, org created) | 2026-08-09 |
| S17-02 | Code | `server/src/routes/foundation.ts` (`POST /register`), `src/pages/GetStarted.tsx` (age checkbox) | 2026-08-09 |
| S17 (all) | File | `docs/platform-standard/section-17-conditional-regulatory-overlays.md` (new) | 2026-08-09 |
| S18-01 | Cross-reference | Full read of `12_TASK_QUEUE.md` (all T1-T39), `risk-register.md` (48 rows), and `operator-actions.md` at close of Section 17 | 2026-08-09 |
| S18-02 | Command output | Final `npm run lint` / `npm run build` / `npm --prefix server run build` / `npm test` re-run at close of Section 17 -- 0 errors, clean builds, 72/72 passing | 2026-08-09 |
| S18-03 | File | `docs/platform-standard/operator-actions.md` (stale age-affirmation row removed) | 2026-08-09 |
| S18 (all) | File | `docs/platform-standard/section-18-final-launch-readiness.md` (new) | 2026-08-09 |

## Notes

Prior work already done in this repository (outside this pack's own
framing) carries substantial evidence value for upcoming sections:

- `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` — code-level controls audit
  mapped to SOC 2 TSC / ISO 27001 Annex A, dated 2026-08-03, with gaps
  closed the same day (MFA, account deletion, automated backups, session
  revocation, structured logging). Directly relevant evidence for Sections
  04, 05, 06, 14, and 18.
- `AI_PROJECT_OS/51_SECURITY.md` — CSRF, CORS, rate limiting, security
  headers, encryption at rest, upload guarding, prompt-injection defense,
  bot guarding. Directly relevant evidence for Sections 03, 04, 07, 08.
- `compliance/policies/` (repo root) — draft Information Security Policy,
  Access Control Policy, Data Retention & Deletion Policy, Incident Response
  Plan, Subprocessor list. Directly relevant evidence for Sections 02, 06,
  14, 18 (all explicitly marked DRAFT/unsigned).
