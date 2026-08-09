# ALFY2 Pack — Section 17: Conditional Regulatory Overlays

**Instruction from Section 01** (`applicability-register.md` §D and the
Section-applicability table): "Apply the N/A determinations from the
matrix above; do not re-open HIPAA/COPPA/FERPA/FCRA/biometric/CJIS/
export-control/FDA/telehealth/employment-AI work unless new facts change
applicability." This section is therefore primarily a confirmation pass —
checking whether anything discovered across Sections 02–16 changes any of
Section 01's determinations — plus closing one small, already-tracked gap
that falls squarely within this section's own subject matter.

**Status**: PASS. Every "hard N/A" determination from Section 01 still
holds; nothing discovered in Sections 02–16 changes any of them. One
real, already-identified gap directly relevant to this section (no
age-affirmation step at registration, COPPA row, risk R-01, task T13) was
closed this pass — small, safe, and on-topic, unlike the CONDITIONAL/
UNKNOWN rows (money transmission, PCI, CCPA/CPRA, other state privacy,
marketplace-facilitator tax, 1099), which correctly remain gated on
counsel/owner review and are not something this session can resolve.

## Confirmation pass: do any new facts from Sections 02–16 change a "hard N/A" determination?

Checked each hard-N/A regime against everything discovered since Section
01, specifically looking for anything that could flip a determination:

| Regime | Section 01 determination | Checked against | Still holds? |
|---|---|---|---|
| HIPAA / HITECH, FTC Health Breach Rule, 42 CFR Part 2 | N/A — no health data | Sections 02–16 touched profiles, documents, compliance (COI/W-9/e-sign), AI extraction — no health/medical field or feature surfaced anywhere | **Yes** |
| COPPA / state minor privacy | N/A, but age-gate gap flagged | Gap closed this pass (see below) | **Yes, and the flagged gap is now closed** |
| FERPA / PPRA | N/A — no education relationship | No education-institution feature found in any later section | **Yes** |
| FCRA | N/A — no consumer reports/background checks | No such feature found | **Yes** |
| GLBA / FTC Safeguards | N/A — not a financial institution | Section 09's payments audit reconfirmed Divini is a marketplace facilitator using Stripe/PayPal as processors, not itself originating/servicing covered financial products | **Yes** |
| Securities / SEC / FINRA | N/A — no securities feature | Nothing in later sections touched investment/securities activity | **Yes** |
| Biometric privacy laws | N/A — no biometric collection | **Specifically re-checked** against Section 13's finding of canvas-based device fingerprinting (`src/lib/fingerprint.ts`): this is a *device/browser* fingerprint (canvas rendering + navigator/screen characteristics, hashed), not a *biometric* fingerprint under any biometric-privacy-law definition (BIPA and similar statutes define biometric identifiers as physical/biological characteristics — face geometry, fingerprint (the physical kind), voiceprint, retina/iris scans, hand geometry). No such data is collected anywhere. Worth stating explicitly given how easy the two "fingerprint" concepts are to conflate | **Yes** |
| CJIS | N/A — no law-enforcement integration | Nothing found | **Yes** |
| Export controls (EAR/ITAR) | N/A — no controlled tech/defense/sanctions feature | Nothing found | **Yes** |
| FDA device/CDS, Telehealth/licensure | N/A — no clinical feature | Nothing found | **Yes** |
| Employment AI laws | N/A — no employment/HR feature | Section 08's AI security audit confirmed the AI features are narrow, single-shot extraction/discovery assists with deterministic fallback — not employment/hiring decisioning | **Yes** |
| EU AI Act (algorithmic decision rules) | N/A today | Same basis reconfirmed by Section 08; Section 12's Divini Score (automated business-entity scoring) was specifically checked in Section 12 and found to be a transparent, deterministic B2B score, not a high-risk individual-decisioning category | **Yes** |

## Gap closed: age-affirmation step at registration (T13, RESOLVED)

**What was tracked**: Section 01 flagged that, while the product is not
child-directed and has no known minor userbase, there was zero technical
barrier to a minor signing up — a real hygiene gap (P2, risk R-01, task
T13) that grows "knowingly collects" COPPA exposure the longer it goes
unaddressed. This was still open after 16 sections of otherwise-unrelated
audit work; closing it falls squarely within Section 17's own subject
matter, is small, safe, and mechanical, so it was closed now rather than
left open through Section 18.

**Fix applied**:
- `server/src/routes/foundation.ts` (`POST /register`): now requires
  `ageConfirmed === true` in the request body, returning `400 {"error":"age
  confirmation required"}` otherwise. Enforced server-side, not just as a
  client-side checkbox — the server is the actual authority, matching the
  pattern established throughout this audit.
- `src/pages/GetStarted.tsx`: added a second affirmation checkbox
  ("I confirm that I am 18 years of age or older"), styled identically to
  the existing, already-live Terms/Privacy-acceptance checkbox it sits next
  to. Client-side validation blocks submission with an inline error if
  unchecked, mirroring the existing pattern for the Terms checkbox exactly.
  `ageConfirmed: true` is sent in the `POST /register` body once checked.
- Confirmed no other code path calls `POST /register`: grepped every file
  referencing `/register` and found all others are React Router `<Link
  to="/register">` navigations to this same page, not separate API calls
  (including the invite-acceptance flow, `JoinInvite.tsx`, which navigates
  here rather than registering directly) — so this is the only place that
  needed updating.

**Live verification** (real Postgres instance + real running server, same
method as Sections 15/16, torn down afterward): registered and
email-verified a real test account, then called `POST /register` three
ways:
1. No `ageConfirmed` field → `400 {"error":"age confirmation required"}`.
2. `ageConfirmed: false` → same `400`.
3. `ageConfirmed: true` → `201`, organization created successfully.

The client-side checkbox wiring was verified by reading the exact state
management (`useState`, the submit-blocking check, the request body) rather
than a full authenticated-browser walkthrough — the page requires an
active login session to render (it's the post-login org-setup step, not
the public registration form), and setting up that full session in a
throwaway browser test added more incidental complexity than value given
the server-side check (the actual authoritative gate) was already
live-verified directly, and the checkbox itself is styled and wired
identically to the adjacent, already-proven-working Terms checkbox.

## CONDITIONAL / UNKNOWN rows: correctly still open, not resolved here

The following rows from Section 01's matrix require counsel or owner
judgment this session cannot supply, and remain correctly tracked rather
than resolved or re-litigated:

- **Money transmission / BSA-AML** and **PCI DSS SAQ level** — gated on
  T7/T8, unchanged by anything in Sections 02–16.
- **CCPA/CPRA and other state privacy law thresholds** — still depends on
  real user-volume/revenue facts only the owner has. Section 13's finding
  (zero third-party analytics/ad SDKs, so no "sale/share via pixel"
  trigger) is *confirming* evidence for the existing determination, not a
  new fact requiring re-triage.
- **GDPR/UK GDPR** — still "likely N/A, revisit if EU expansion happens";
  nothing in later sections suggested any EU-specific feature, marketing,
  or localization was added.
- **Marketplace-facilitator sales tax** and **1099 reporting duties** —
  Section 09's payments audit reconfirmed the underlying fund-flow facts
  (v1 destination-charge vs. v2 direct-charge Connect models) these
  determinations depend on, but the tax-law conclusion itself remains a
  counsel/accountant call, correctly not resolved in code.

## Regression

- `npm run lint`: 0 errors (44 pre-existing warnings, unchanged)
- `npm run build` (SPA): clean
- `npm --prefix server run build`: clean
- `npm test`: 72/72 passing
- Age-affirmation server-side enforcement live-verified against a real
  database and real HTTP requests (see above), not just unit-tested in
  isolation.
