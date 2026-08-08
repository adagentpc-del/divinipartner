# Release Readiness

Cumulative launch status across all ALFY2 pack sections. Bootstrapped at
Section 01; updated at the end of each later section per the pack's report
format.

## Section status

| Section | Status | Last Updated |
|---|---|---|
| 00 Read First / Master Execution Rules | Read, rules in effect for all later sections | 2026-08-08 |
| 01 Discovery, Architecture & Applicability Gate | READY WITH P1 ITEMS — see below | 2026-08-08 |
| 02 Baseline Legal, Privacy, Consent & User Rights | READY WITH P1 ITEMS — see below | 2026-08-08 |
| 03 Repository, Environments, Secrets, CI/CD & Supply Chain | READY WITH P1 ITEMS — see below | 2026-08-08 |
| 04 Authentication, OAuth, Sessions, MFA & Account Recovery | **READY** — no open P0/P1/P2 items | 2026-08-08 |
| 05 Authorization, RBAC/ABAC, RLS, Tenancy, Admin & Impersonation | READY WITH P2 ITEMS — see below | 2026-08-08 |
| 06–18 | Not yet started | — |

## Section 01 summary

- No P0 legal/use-case blockers were found beyond the ones this project
  already tracks (T7 real-money gate, T8 counsel review) — see
  `applicability-register.md` §F.
- P1 items carried forward: `audit_logs` retention undefined (R-02), no
  staging environment (R-06), backup cron + error-webhook operator actions
  outstanding (R-07, already known before this pack).
- P2 item carried forward: no age-affirmation step at registration (R-01).
- This platform is **not** subject to HIPAA, COPPA (as currently built and
  positioned), FERPA, GLBA, securities law, FCRA, biometric privacy law,
  CJIS, export controls, FDA/telehealth, or employment-AI law, based on the
  actual product surface inspected (`architecture-map.md` §B, §C). These
  determinations should be revisited only if the product's actual use cases
  change, per pack Rule 11.
- Real money is intentionally not live (`STRIPE_SECRET_KEY` unset). Nothing
  in this pack should be read as pressure to unblock T7 before counsel
  clears it.

## Section 02 summary

- The privacy self-service infrastructure (data-subject requests, consent
  management, retention-policy declaration) was already far more built than
  a first look suggested — real tables, a real backend, a real frontend.
  The actual gap was discoverability, not missing functionality: fixed by
  adding a `/account/privacy` route, a link from Profile → Account, and a
  Privacy Policy update — live-verified in a real browser as a non-admin
  user (R-08, resolved).
- P1 items carried forward: data-retention policy content proposed but not
  yet adopted or enforced (R-09); `visitor_signals` grows unbounded with no
  purge job (R-10); three legal-document gaps — DMCA/copyright takedown, AI
  disclosure, Accessibility Statement — none exist today (R-11).
- No P0 blockers found in Section 02 beyond what T7/T8 already track.

## Section 03 summary

- Real secret scan performed (current tree + full git history) — clean, no
  secrets ever committed.
- CI hardened: locked installs (`npm ci`), real build steps added (was
  typecheck-only), a genuinely-passing dependency-vulnerability gate added
  for the server package, and Dependabot configured for the first time.
- 11 `npm audit` findings remain in root/SPA, all traced to Capacitor
  mobile-build-only tooling never installed on the production server — real
  but low real-world severity; resolving them safely needs a Mac/Xcode
  verification step this environment can't perform (T19).
- Repository-governance gaps found and mostly closed same-session: added
  `CODEOWNERS`, created a local `v0.1.0` tag (push rejected -- not yet published), removed the redundant
  `pnpm-lock.yaml` (converted `build:server`/`build:all` to npm, verified
  working end to end), wrote a secrets-rotation runbook, and installed +
  configured ESLint (fixed one real Rules-of-Hooks bug and one unstable
  React-key anti-pattern found along the way, tuned out two rules after
  sampling their findings and confirming they were noise not signal for
  this codebase). Only genuinely un-closeable item: branch-protection
  status, a GitHub-UI setting this environment cannot check or set
  (operator action, T21 remainder).
- No P0 blockers found in Section 03.

## Section 04 summary

- OAuth/social login: N/A — genuinely doesn't exist (confirmed by reading
  `server/src/auth.ts` in full), so OAuth-state-mismatch and
  account-linking-collision from the pack's validation matrix are N/A too.
- All 12 applicable validation-matrix items tested live against a running
  server with a real registered test account — not assumed from reading
  code. Every one passed, including adversarial cases (forged admin flag,
  replayed tokens, expired tokens, MFA challenge-token replay, rate
  limiting).
- One real completeness gap found and closed same-session: no standalone
  "sign out other sessions" action existed independent of a password
  change. Added `POST /auth/sign-out-other-sessions` (reusing the
  already-proven revocation mechanism) plus a frontend button, live-verified
  with two independent device logins.
- No P0 blockers. Section 04 closes with zero open items.

## Section 05 summary

- No Postgres Row-Level Security exists anywhere in the schema; confirmed
  by grep, not assumed. All authorization is application-layer via the
  `getActor()` primitive. Documented as a standing architectural risk
  (R-18), not a live gap — live adversarial testing found zero cross-tenant
  leaks in every resource class tested.
- Live adversarial test suite run against a running server with two
  independently-registered real organizations: cross-tenant read/write on
  events, bids, quotes, invoices; forged event-vendor attach; forged
  org-switch (membership spoof). 13 attack attempts, 13 correct rejections
  (403/404), zero cross-tenant or privilege-escalation failures.
- Admin impersonation / "view as" does not exist in this codebase (N/A,
  confirmed by code search).
- One real finding fixed same-session: Privacy Policy overstated "database
  row-level security" as a protection mechanism; reworded to accurately
  describe the actual application-layer scoping (R-17, resolved).
- Two P2 hygiene items found and documented, not fixed this pass (neither
  is exploitable): dead presigned-download-URL code with no route ever
  calling it (R-19), and a stale-but-unused `platform_fee_rate` value set
  on subscription cancellation for role catalogs with a null fee rate
  (R-20).
- Built `docs/platform-standard/authorization-matrix.md` documenting the
  resource/enforcement-point model for future sections and future
  engineers to extend consistently.
- No P0 blockers. Section 05 closes with zero open P0/P1 items (two P2
  hygiene items tracked, not blocking).

## Overall launch readiness (cumulative, updated as sections complete)

**NOT READY** — pending Sections 06–18. This is expected at this stage
(five of eighteen sections complete) and is not itself a new finding; it
reflects where the multi-section pack currently stands, not a regression.
