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
| 05 Authorization, RBAC/ABAC, RLS, Tenancy, Admin & Impersonation | **READY** — no open P0/P1/P2 items | 2026-08-08 |
| 06 Database Integrity, Data Lifecycle, Backups & Recovery | READY WITH P2 ITEMS — see below | 2026-08-08 |
| 07 App/API Perimeter, Input Validation, File Upload, Bot & Malware Security | READY WITH P2 ITEMS — see below | 2026-08-08 |
| 08 AI Security, Governance, Prompt-Injection Defense & Model Quality | READY WITH P2 ITEMS — see below | 2026-08-08 |
| 09–18 | Not yet started | — |

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
- Two P2 hygiene items found and **both since closed in a same-day
  follow-up pass**: the dead presigned-download-URL code (R-19) was
  removed (not wired up — no real requirement asked for a bearer-token
  download path, and every real download route already uses the proven
  org/party-scoped session-authenticated pattern), and the stale
  `platform_fee_rate` on cancellation (R-20) now uses the same role-aware
  lookup the active-subscription branch already used.
- Built `docs/platform-standard/authorization-matrix.md` documenting the
  resource/enforcement-point model for future sections and future
  engineers to extend consistently.
- No P0 blockers. Section 05 closes with **zero open items of any
  priority**.

## Section 06 summary

- Live schema introspection (not just reading the schema file) against
  the running 170-table database: every table has a primary key; core
  hot-path FKs (events/bids/quotes/invoices/event_vendors/memberships)
  have deliberate, sensible cascade behavior; the migration file
  (`db/apply-all.sql`) is fully idempotent and additive-only with zero
  unguarded destructive drops; deletion is soft-delete/anonymize (never a
  hard delete), so referential integrity can never be corrupted by it.
- Found and fixed a real, live tenant-index gap (12 tables missing an
  `organization_id` index, 2 more missing `user_id`) — meaningful because
  there is no Postgres RLS (Section 05), so every tenant-scoped query
  depends on these indexes as data grows; `payments`/`platform_credits`
  were on this list (R-21, resolved).
- Actually exercised the backup/restore mechanism as a real restore for
  the first time since it was built (2026-08-03) — this had been a
  unit-tested-in-isolation script, not a proven round trip, until this
  session's live backup + restore-into-a-scratch-database test with exact
  row/table-count verification (R-22, resolved). New
  `compliance/policies/backup-and-restore-runbook.md` with RTO/RPO
  assumptions and an honest list of what the test does NOT cover
  (production cron install status, off-site storage config, no PITR — all
  remain operator-verification items).
- **Found and fixed a real, live, money-adjacent double-spend race**: the
  platform-credits redemption endpoint (`POST /api/credits/redeem`)
  checked balance then inserted the debit with no lock between them —
  live-reproduced against a real test account, then closed with a
  transaction + `pg_advisory_xact_lock`, then re-verified under the exact
  same concurrent-load scenario (10 simultaneous $10 redemption requests
  against a $10 balance: before the fix this could over-redeem, after the
  fix exactly 1 succeeded and the final balance was exactly $0.00, never
  negative) (R-23, resolved).
- Found and documented (not fixed this pass) the same race shape in 5
  lower-severity entitlement-limit route files — a soft plan-limit
  overrun, not monetary or cross-tenant, with the exact proven remediation
  pattern already written up for a fast follow-up (R-24, T26).
- No P0 blockers. Section 06 closes with one open P2 item (R-24, tracked
  as T26) and one informational P2 (R-25, FK coverage on currently-empty
  partner/payout tables, revisit once T7 unblocks real data).

## Section 07 summary

- Live header inspection (not just code read) against the running server
  confirmed the full perimeter header set (CSP with no `unsafe-inline`/
  `unsafe-eval` script sources, HSTS, X-Frame-Options, X-Content-Type-
  Options, Referrer-Policy, Permissions-Policy) is genuinely present on
  every response. CORS and rate limiting both fail closed / stay layered
  as designed.
- Found and fixed a minor info-disclosure gap (`X-Powered-By: Express`
  header) and two stale "no MFA anywhere" doc comments left over from
  before Section 04 shipped native TOTP (same class of finding as the
  Section 05 Privacy Policy fix — code comments overstating a gap that
  had since been closed).
- Full-tree grep swept every OWASP-listed input-validation category (SQL
  injection, open redirect, mass assignment, SSRF): zero real findings.
  The codebase already has dedicated, well-built defenses for the two
  highest-risk categories — a real SSRF guard (`lib/safe-fetch.ts`,
  blocking private/loopback/metadata IP ranges and validating redirects)
  actually wired into the one real user-URL fetch site, and consistent
  parameterized-query discipline with zero string-interpolated SQL found
  anywhere in the server tree.
- **Live adversarial file-upload test** against the real multipart upload
  endpoint on a real test account: a magic-byte-mismatch file, a
  path-traversal filename, and a disguised Windows-executable-as-PDF were
  all either correctly rejected (400) or safely neutralized (traversal
  segments stripped, file landed only inside the org-scoped storage root
  — confirmed directly on disk, not just via the API response).
- One real P2 gap found and documented (not fixed this pass): uploaded
  images/PDFs keep their original embedded metadata (EXIF, PDF author
  fields) with no stripping step — low severity given this product's
  current file mix (business documents, logos), tracked as T28.
- No P0 blockers. Section 07 closes with one open P2 item (R-28, T28).

## Section 08 summary

- Applicability gate passed (real AI functionality exists) but the actual
  surface is small and well-contained: exactly 3 LLM call sites in the
  entire codebase (all local-first Ollama by default, no external
  provider unless explicitly opted in), zero tool-calling/RAG/agentic
  infrastructure. Everything else branded "Divini Concierge"/"Divini
  Builder" is deterministic code, not LLM-backed — confirmed by grep, not
  assumed from the naming.
- Prompt-injection defense (`lib/promptSafety.ts`) is genuinely
  well-built (random per-call boundary fencing, injection-resistant
  content stripping, dual system+user-turn reinforcement) and confirmed
  used consistently at all 3 call sites — no gaps found.
- Confirmed by design, not just by policy: the model can never set its
  own role, owner, price, payout, or access level, and never writes
  directly to a live record — every extraction becomes a
  human-review-gated suggestion first (`ai_profile_suggestions` table
  with a `status` lifecycle and separate raw-vs-resolved-value columns).
- **Live-tested** graceful degradation: called the real extraction
  endpoint against an unreachable LLM backend and confirmed a clean
  `available:false` response, no crash or hang — the "LLM is never a
  hard dependency" claim holds under a real failure, not just in the
  try/catch's intent.
- Found and fixed a real gap: AI extraction calls were not logged to
  `audit_logs`, unlike every other privileged action in this codebase,
  and short of the pack's explicit `ai_run_audit` requirement. Fixed and
  live-verified — a real audit row now captures provider/model/source/
  outcome without ever storing the extracted content itself.
- Two P2 items documented, not built this pass: no automated evaluation
  harness for extraction accuracy, and no per-field numeric confidence
  score (the latter is a defensible design choice — omit uncertain
  content rather than guess with a confidence label — not a raw gap).
- No P0 blockers. Section 08 closes with two open P2 items (R-30 eval
  harness; the confidence-score design choice is documented, not tracked
  as an open defect).

## Overall launch readiness (cumulative, updated as sections complete)

**NOT READY** — pending Sections 09–18. This is expected at this stage
(eight of eighteen sections complete) and is not itself a new finding; it
reflects where the multi-section pack currently stands, not a regression.
