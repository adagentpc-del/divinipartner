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
| 09 Payments, Stripe, Webhooks, Subscriptions, Marketplace & Tax | READY (architecture) WITH ITEMS BLOCKED ON T7 — see below | 2026-08-08 |
| 10 Email, SMS, Push Notifications & Marketing Compliance | **READY** — no open P0/P1 items | 2026-08-08 |
| 11 UX, Accessibility, Onboarding, Forms, Navigation & Content Quality | READY (scoped) WITH P1 ITEMS — see below | 2026-08-08 |
| 12 Core Product Engines (Profiles, Orgs, Admin, Products/Services, Calendar, Video, Documents) | **READY** — no open P0/P1 items (one P2 operator action) | 2026-08-09 |
| 13 Analytics, Behavior Tracking & Personalization | **READY** — no open P0/P1/P2 items | 2026-08-09 |
| 14 Observability, Incident Response & Disaster Recovery | READY WITH P2 ITEMS — see below | 2026-08-09 |
| 15 QA, E2E, Load Testing, Pentest & Regression | **READY** — no open P0/P1/P2 items | 2026-08-09 |
| 16 Mobile: iOS, Android & App Store | READY (scoped) — native build/submission BLOCKED (needs Mac/Xcode, tracked as T9) | 2026-08-09 |
| 17–18 | Not yet started | — |

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

## Section 09 summary

- No Stripe or PayPal credentials of any kind (test or live) are
  configured in this environment, consistent with T7 (real money
  intentionally not live since Section 01). Every check requiring an
  actual processor round trip is explicitly marked BLOCKED with the exact
  operator action, not faked or assumed passing.
- Everything checkable by architecture, live fail-closed testing, and
  direct database verification was done live: PCI scope confirmed
  minimal (Checkout-only, zero server-side cardholder data), connected-
  account/payout destinations confirmed always server-resolved (no
  client-selected authority), webhook signature verification confirmed
  fail-closed via a real HTTP test against the running server (forged
  and missing signatures both correctly rejected), and the coupon/
  promotion-engine requirement confirmed satisfied (one canonical value
  mechanism, no parallel systems).
- **Found and fixed a real P1 gap**: no event-level webhook idempotency
  ledger existed — only payment-row-level idempotency, leaving several
  webhook event types (`account.updated`, `customer.subscription.*`, the
  v2 capability event) with zero duplicate-delivery protection and no
  dead-letter/failure visibility. Built the pack's own suggested
  `webhook_events` schema, wired it into both Stripe and PayPal handlers,
  and live-verified the dedup logic directly against the database.
- **Found a real P1 gap, documented not built**: no refund or dispute-
  response capability exists anywhere in the app. Confirmed this is not
  currently a policy contradiction (the Payment Policy already correctly
  scopes Divini's refund responsibility narrowly for a marketplace-
  facilitator model), but it is a real operational gap that should close
  before T7 unblocks real money, not after — tracked as T30.
- One P2 documented (out-of-order webhook delivery tolerance — narrow,
  self-healing risk).
- No P0 blockers among what could be tested. The T7 gate itself remains
  the overarching blocker for anything requiring live money, exactly as
  tracked since Section 01 — this section did not find a new reason to
  delay T7 further, only confirmed what still needs to exist (refund/
  dispute capability, real credential testing) before it unblocks.

## Section 10 summary

- Live DNS verification (two independent resolvers) of the real
  production sending domain confirmed full, correctly-aligned email
  authentication: DKIM, DMARC (enforcement mode, not monitor-only), and
  SPF (correctly published on the return-path subdomain — an initial
  apex-only check looked like a gap and was corrected after deeper
  verification, worth documenting the "looked wrong, verified right"
  path explicitly).
- Confirmed transactional-vs-marketing separation is real and structural
  (only the one true marketing channel — Claim Engine cold outreach —
  carries opt-in/opt-out machinery), and that channel already meets
  every CAN-SPAM item checked: sender ID, non-deceptive framing,
  functioning opt-out, physical address, plus a "remove my listing"
  option beyond the legal minimum.
- **Found and fixed a real P1 gap**: the shared `sendEmail()` transport
  used by every email this app sends had no bounce/complaint suppression
  check at all — only the narrower, Claim-Engine-specific suppression
  list existed, and nothing anywhere auto-populated a bounce reason
  despite the schema supporting one. Built a general
  `communication_suppressions` table, wired a per-recipient filter into
  `sendEmail()` itself, and added a Svix-signed Resend bounce/complaint
  webhook. Live-verified at every layer: fail-closed signature
  rejection, direct DB suppression matching, and — most importantly —
  the actual `sendEmail()` call path filtering a suppressed recipient
  out of a mixed-recipient send while still delivering to the clean one.
- SMS and push notifications: confirmed neither exists anywhere in the
  codebase (not even a stub) — correctly N/A, nothing to test.
- One P2 documented (RFC 8058 `List-Unsubscribe` header, a deliverability
  best-practice gap, not a current CAN-SPAM violation).
- No P0 blockers. Section 10 closes with zero open P0/P1 items.

## Section 11 summary

- Scope note: tested 9 representative pages (public marketing pages,
  Marketplace search/filter, auth pages, a sample of legal pages, and a
  sample authenticated dashboard view) with real, tool-driven WCAG 2.2 AA
  scanning — not an exhaustive page-by-page audit of the ~100+ page
  component tree. Documented explicitly as scoped, not claimed as
  complete coverage.
- **Live-tested with a real browser**, not just code reading: axe-core
  4.10.0 injected via Playwright into an actual rendered Chromium session
  against the built SPA, re-run after every fix to confirm each violation
  actually cleared (not just that the source line changed).
- Found and fixed a real, systemic color-contrast gap: the muted-text
  token (`#7d776c` on white, ~3.9:1) and a green ROI-stat accent
  (`#2f8f5b`) both failed the WCAG AA 4.5:1 minimum for normal text.
  Because this codebase repeats these exact hex values as locally-scoped
  CSS custom properties per component rather than importing one shared
  stylesheet, the fix required a verified bulk replacement across 128
  files (`#7d776c` → `#6b6459`, contrast-checked to pass 4.5:1) plus a
  targeted swap for the ROI accent and 8 legal-page "effective date"
  strings, rather than one central token edit.
- Found and fixed a real WCAG 1.4.1 (Use of Color) gap: in-body-text
  links on Login, Register, and 6 legal pages were distinguished only by
  color, with no underline or other non-color cue. Added
  `text-decoration: underline` at each site.
- Found and fixed a real, critical WCAG 4.1.2 (Name, Role, Value) gap on
  the public Marketplace search/filter panel: 6 form controls (search,
  location, capacity, budget, event type, availability) had no
  programmatically associated accessible name — visually adjacent labels
  only, no `htmlFor`/`id` pairing — meaning a screen-reader user could not
  tell what any filter field was for. Fixed with proper `id`/`htmlFor`
  pairs and live-reverified as cleared.
- One axe-core finding investigated and confirmed as a **tool false
  positive, not a real defect**: hero sections on Pricing/Marketplace/
  HowItWorks/ForVendors were flagged for insufficient contrast because
  axe-core cannot resolve a background painted by a `z-index`-layered
  sibling element rather than a direct ancestor. Verified with an actual
  Playwright screenshot showing genuinely high-contrast white text on a
  dark emerald gradient in the real rendered page — documented with
  evidence rather than either silently dismissed or incorrectly "fixed."
- Two items found and deliberately **not** fixed this pass, tracked as
  open tasks: focus-indicator strength needs a design pass across ~30
  separate component style blocks to verify visual correctness, not a
  safe mechanical value swap (T32, P1); a skip-to-main-content link
  cannot be added as one global fix because the app has no shared layout
  shell across its 100+ independently-built page components (T33, P2).
- SMS notifications: user confirmed at this session's Section 11 start
  that SMS is intentionally out of scope for this build (v2), consistent
  with the Section 10 finding that no SMS code exists yet beyond a future
  pricing-catalog placeholder. Not a gap — deliberate deferral, already
  reflected in R-tracking under Section 10.
- No P0 blockers. Section 11 closes with two open items: one P1 (T32
  focus-indicator strength) and one P2 (T33 skip-link), both requiring a
  design/engineering pass beyond what's safely mechanical to bulk-fix.

## Section 12 summary

- Scope: Profiles, Organizations (incl. multi-org switcher), Admin (platform
  admin + listings/agreements management), Products/Services (Packages),
  Calendar (availability + `.ics` feed), Video (the interactive venue-tour
  builder — true video-conferencing was already confirmed N/A in Section
  01), and Documents (the Compliance page's COI/W-9/e-sign system, the
  platform's actual document-management feature).
- Found and fixed a real, live-traced P1 billing-data-integrity defect:
  `registerOrganization()` and `addOrganization()` (`server/src/db.ts`) both
  stamped a new organization's `platform_fee_rate` from the flat, role-blind
  `TIERS` table instead of the role-aware `lib/planCatalog.ts` lookup that
  Section 05 (T25) had already fixed for the subscription-cancellation path
  only. Client/installer/sponsor orgs — every one of which has a 0%
  platform-fee catalog entry at every tier — could be created with the
  generic 5%/2.5%/1% rate baked in instead. Fixed both call sites to use the
  same `planTierFor(role, tier)?.platformFeeRate ?? 0` pattern already
  proven correct elsewhere; live-verified numerically against the real
  compiled plan catalog across every role x tier combination, confirming
  the three affected roles now resolve to 0 and every other role (venue/
  vendor/supplier/planner) is byte-for-byte unchanged. An idempotent backfill
  script (`db/schema-fix-org-fee-rates.sql`) was added for any org rows
  already created with the wrong rate; running it against staging/production
  is tracked as an operator action (no database was reachable from this
  execution environment to check or apply it directly).
- Every other route file inspected (`orgs.ts`, `profiles.ts` in full,
  `admin.ts`, `admin-manage.ts`, `packages.ts` in full, `calendar.ts` +
  its db layer, `compliance.ts` + its db layer, `venue-twin.ts`) was found
  correctly organization-scoped, admin-gated where required, and free of
  SQL-injection patterns (parameterized queries throughout). The
  profile-ownership-transfer authorization model ("any member of the active
  org can transfer it") was specifically checked against the multi-org
  membership system built earlier in this platform and confirmed correct:
  `organization_memberships` is a one-human-many-orgs ledger, not a
  many-humans-one-org team model, so it is not a privilege-escalation risk.
- One minor, non-blocking content note (not fixed): `DocumentsTab.tsx`'s
  empty-state copy references a "shared document library" that isn't a
  literally-named page — the real feature is the Compliance page, confirmed
  to exist and work. Not a broken link, just imprecise prose; left for a
  future copy pass.
- Method note: this section is a full read-through of every route file
  listed above (well over 1,400 lines of route code) with authorization
  traced into the corresponding db-layer functions, and the one defect
  found was live-verified numerically — not an exhaustive line-by-line audit
  of all db-layer code behind these dozen-plus route files, which is a
  larger undertaking on its own; see the section-12 report's Method note for
  the precise boundary of what was and wasn't covered.
- No P0/P1 blockers remain open. One P2 operator action (run the backfill
  script).

## Section 13 summary

- Applicability confirmed narrow as Section 01 predicted: a full-tree grep
  for common third-party analytics/tracking scripts (GA/GTM, Segment,
  Mixpanel, Amplitude, Hotjar, FullStory, Meta Pixel, Clarity, PostHog)
  found zero matches — everything in this codebase is first-party.
- Confirmed (did not need to fix) that first-party visitor-signal collection
  (device fingerprint, IP, UTM attribution) is correctly consent-gated at
  every call site, and that the deterministic recommendation/scoring
  features (`recommend.ts`, `divini-score.ts`) do not raise automated-
  decision or consumer-profiling concerns — they're stateless/B2B-scoped
  respectively.
- Found and fixed a real gap between disclosed and actual behavior: the
  Cookie Policy told visitors they could "use the cookie banner" to change
  their consent choice at any time, but the banner only ever appeared once,
  on first visit, with no way to reopen it. Added a reopen mechanism and a
  "Manage cookie preferences" control on the Cookie Policy page; live-
  verified end to end in a real browser (initial banner, accept-all,
  reopen via the new button, change to reject, storage updates correctly
  at each step).
- No P0/P1/P2 items remain open for this section.

## Section 14 summary

- Scope: runtime observability (logging, health checks, alerting) and
  incident response / disaster recovery planning. Database backup/restore
  itself was already covered in depth in Section 06 and is referenced, not
  re-audited, per the pack's rule against re-covering already-audited
  ground.
- Found and fixed a real P1 gap: `GET /api/healthz` was a liveness check
  only (proved the process was running) with no readiness check (proved
  the database — the app's single real dependency — was reachable). Added
  a capped `select 1` check; live-verified against a real, disposable
  Postgres instance in both the healthy (200/db:true) and unhealthy
  (503/db:false, returned promptly) states.
- Found and fixed a stale-documentation gap: the Incident Response Plan's
  Detection section still claimed no error-monitoring/alerting existed,
  which was true when written but false since structured logging + an
  optional real-time webhook shipped 2026-08-03. Rewrote it to state
  current capability accurately, while keeping the two genuinely-still-open
  detection gaps (429s not logged/alerted, no `audit_logs` anomaly
  scanning) clearly flagged as open, verified still true by reading
  `rateLimit.ts` and confirming no scheduled anomaly-detection job exists.
- Closed a documentation gap: no single runbook combined the existing,
  separately-documented deploy steps and database-restore steps into a
  "total host loss" recovery sequence. Added
  `compliance/policies/disaster-recovery-runbook.md`, honestly marked
  DRAFT and not-yet-exercised end to end.
- No P0/P1 blockers remain open. Three P2 items carried forward, all
  pre-existing and now explicitly tracked rather than newly discovered:
  429 rate-limit hits still aren't logged/alerted (T36), no automated
  `audit_logs` anomaly scanning exists (T37), and the new DR runbook
  needs a real dry-run exercise plus confirmation of its off-host
  storage/secrets preconditions (operator action).

## Section 15 summary

- Method: stood up a real, disposable Postgres 16 instance and the actual
  built server in this sandbox — not code reading, not unit tests in
  isolation — ran live adversarial probes, then fully tore the environment
  down. An independent third-party penetration test remains a separately-
  tracked operator action (risk R-04), not something this section performs
  or substitutes for.
- Confirmed (already honestly documented, re-verified accurate rather than
  newly discovered) that no E2E framework and no load-testing tooling are
  project dependencies — appropriate at this stage given no live traffic
  yet, tracked in `AI_PROJECT_OS/50_TESTING.md`'s own "Gaps" section.
- Found and fixed a real, systemic robustness gap, live-triggered on two
  independent routes: malformed `:id`-shaped path params (both
  SQL-injection-style payloads and simple typos) returned a raw 500 instead
  of a clean 400. Confirmed this was never an injection risk (parameterized
  queries mean the payload never became SQL; Postgres rejected it at the
  type-cast layer) — fixed with one central Express-error-handler check
  covering every route with this shape, live re-verified across both
  original routes, a benign malformed ID, and a real not-found case
  (confirmed unaffected).
- Live-verified, with no fix needed, that several previously-built controls
  actually work under adversarial pressure rather than just reading
  correct in source: auth-bypass resistance (401 on missing/malformed
  tokens), rate limiting (429 triggers at exactly the configured
  threshold), cross-tenant IDOR protection (two real, independently
  registered accounts; Org B blocked 404 on read/update/delete of Org A's
  data, confirmed unmodified afterward), and CSRF double-submit-cookie
  enforcement (missing/correct/wrong token all behaved exactly as
  designed against a real session).
- No P0/P1/P2 items remain open for this section.

## Section 16 summary

- Scope: the Capacitor iOS/Android shell configuration, the Apple privacy
  manifest, and App Store submission readiness. Native build, signing, and
  submission remain genuinely BLOCKED from this environment (no Xcode/
  Android Studio/Mac; `ios/`/`android/` project directories are correctly
  gitignored and have never been generated in this sandbox) -- this
  matches task T9's pre-existing, accurately-scoped status, not a new
  finding.
- Found and fixed a real defect: the Apple privacy manifest
  (`mobile/PrivacyInfo.xcprivacy`) did not declare Phone Number as a
  collected data type despite `users.phone` being a real, populated
  column -- found by cross-referencing the manifest against the actual
  registration code, not by re-reading the manifest in isolation. Fixed
  and verified well-formed XML (the strongest check available without
  macOS tooling); the fix process itself caught and corrected a genuine
  XML syntax defect from the first edit attempt, disclosed rather than
  silently retried away.
- Found and documented (not code-fixed) a real implementation gap: the
  compliance docs' own proposed mitigation for a borderline Apple IAP
  classification -- "gate paid flows behind the web app" -- has zero
  supporting code; nothing anywhere detects the app is running inside the
  native shell. Not fixed directly because which flows (if any) need
  gating is a business/legal classification call, not an engineering one;
  tracked so the eventual decision has a fast path to implementation
  instead of starting from zero.
- Confirmed sound: ATS stays strict, no deceptive external-purchase
  language exists, account deletion is reachable from the native shell
  with no navigation pattern that could break in a webview.
- No P0/P1 blockers remain open in this session's control. One P2 item
  (T19, npm audit in mobile-build tooling) and the new IAP-classification
  gap both correctly require Mac/Xcode or a business decision this
  environment cannot make.

## Overall launch readiness (cumulative, updated as sections complete)

**NOT READY** — pending Sections 17–18, plus the standing T7 gate (real
money) which several sections now have concrete pre-requisites tracked
against (refund/dispute capability, live credential testing). This is
expected at this stage (sixteen of eighteen sections complete) and is not
itself a new finding; it reflects where the multi-section pack currently
stands, not a regression.
