# Applicability Register

Section 01 (Discovery, Architecture & Applicability Gate) of the ALFY2/Claude
Master Platform Execution Pack. Produced 2026-08-08. Read alongside
`architecture-map.md`.

**Scope of this document**: this is a *factual triage*, not a legal opinion.
Per the pack's own Rule 12, uncertain legal scope is recorded as a factual
trigger + likely applicability + `COUNSEL/OWNER REVIEW REQUIRED`, never
invented certainty. This matches how `AI_PROJECT_OS/52_COMPLIANCE.md`
already treats this exact question (Task T8: "Counsel must review the Terms
+ 5 policies... Confirm the not-a-party / third-party-payment framing is
consistent with the Stripe Connect flow"). Nothing here overrides or
supersedes that existing task — it is restated here in the pack's format.

## D. Regulatory / policy applicability decision matrix

| Regime / Standard | Trigger Questions | Applies? | Evidence / Basis | Required Action | Owner/Counsel Review? |
|---|---|---|---|---|---|
| HIPAA / HITECH | Covered entity/BA, or creates/receives/maintains/transmits PHI? | **N/A** | No healthcare-provider/patient relationship exists anywhere in the product (`architecture-map.md` §B); no health/medical data field exists in the schema | None | No |
| FTC Health Breach Notification Rule | Non-HIPAA health app maintaining identifiable health info? | **N/A** | Same basis as HIPAA row — no health data collected | None | No |
| 42 CFR Part 2 | Federally protected SUD patient records? | **N/A** | No healthcare feature exists | None | No |
| COPPA | Directed to children under 13, or knowingly collects their PII? | **N/A**, with one gap flagged | Product is a B2B/B2B2C event-services marketplace (venues/vendors/planners/clients), not directed to children. However, **no age gate exists at registration** (`architecture-map.md` §B) — this is a real gap even though the product isn't child-directed: if a minor signs up anyway with no gate, "knowingly collects" exposure grows over time. Recommend a P2 age-affirmation step at registration | P2: add a simple age-affirmation checkbox/field at registration | Owner decision (low legal urgency given non-child-directed positioning, but cheap to fix) |
| State minor/teen privacy laws | Minors/teens as users in covered jurisdictions? | **N/A**, same basis as COPPA row | No minor-directed feature or known minor userbase | None | No |
| FERPA / PPRA | Acting for a covered school with education records? | **N/A** | No education-institution relationship or student-records feature | None | No |
| FCRA | Consumer reports/background checks used for employment/housing/credit/insurance? | **N/A** | No background-check, tenant-screening, or consumer-report feature exists | None | No |
| GLBA / FTC Safeguards Rule | Covered financial institution handling customer info? | **N/A** | Divini is a marketplace platform using Stripe/PayPal as processors, not itself a financial institution originating/servicing loans, deposits, or similar covered activity | None | No, but revisit if the business model ever adds lending/financing features |
| SEC / FINRA / securities laws | Solicits/recommends/effects securities transactions or receives transaction-based compensation for investments? | **N/A** | No securities/investment feature exists | None | No |
| Money transmission / BSA/AML | Receives/holds/transmits/custodies customer funds beyond a processor's marketplace model? | **CONDITIONAL — COUNSEL/OWNER REVIEW REQUIRED** | The platform's *intended* posture is "we do not hold funds" (`52_COMPLIANCE.md`), and the v2 Accounts direct-charge model reinforces that (the connected/vendor account is merchant of record, funds never route through the platform's own account). The v1 destination-charge model, still supported for backward compatibility, DOES route the charge through the platform's own Stripe account before auto-splitting out — this is a standard Stripe Connect marketplace pattern generally treated as exempt from money-transmitter licensing, but that determination depends on exact fund flow, hold time, and state-by-state interpretation, which is a legal question, not a code question | Flag for counsel alongside existing T7/T8 (`12_TASK_QUEUE.md`); confirm the v1-vs-v2 coexistence doesn't create mixed exposure | **Yes — counsel, before real money moves (T7 already blocks this)** |
| PCI DSS | Stores/processes/transmits cardholder data? Which SAQ applies? | **CONDITIONAL, likely SAQ A or A-EP once live** | Card data is never touched by Divini's own servers — Stripe/PayPal hosted Checkout / tokenized elements are used exclusively (`architecture-map.md` §C, financial-data row: "Divini never receives raw card data"). This strongly suggests SAQ A (or SAQ A-EP if any Stripe.js is embedded rather than a full redirect — needs confirmation once the actual Checkout integration mode is finalized for the live flow) | Confirm exact Checkout integration mode (hosted redirect vs. embedded) before completing the SAQ; complete the appropriate SAQ + AOC before processing real transactions | Recommend counsel/PCI-QSA confirmation for the SAQ level, but the current architecture is well short of full PCI scope by design |
| CCPA/CPRA | Do current CA statutory thresholds/activities apply? | **UNKNOWN — COUNSEL/OWNER REVIEW REQUIRED** | Depends on revenue, number of CA consumers' data, and whether data is "sold/shared" as CCPA defines it — none of which is knowable from code alone. The product does collect contact/profile/financial data from US-based business users, some of whom are plausibly California-based. No analytics/ad SDK exists today that would trigger the "sale/share" trigger via third-party pixels (`architecture-map.md` §A) | Owner to confirm CA user volume/revenue against current CCPA/CPRA thresholds; if applicable, verify the Privacy Policy's CCPA section and the privacy-request mechanics in Section 02 | **Yes — owner first (thresholds), counsel if applicable** |
| Other U.S. state privacy laws | Which states' thresholds/rights apply? | **UNKNOWN — COUNSEL/OWNER REVIEW REQUIRED** | Same reasoning as CCPA row; a growing number of states (VA, CO, CT, UT, and others) have their own thresholds | Same as CCPA row, extended to other states once user base grows | Yes — counsel |
| GDPR / UK GDPR | EU/EEA/UK individuals targeted or processed? | **Likely N/A today, revisit if the business expands** | Product/marketing is US-focused (Florida governing law per `52_COMPLIANCE.md`); no EU-specific marketing, currency, or language localization found | Confirm no material EU/UK user base before ruling this fully N/A; revisit if international expansion is planned | Owner to confirm current user geography |
| Biometric privacy laws | Face/fingerprint/voiceprint or similar collected? | **N/A** | No biometric collection feature exists anywhere in the product | None | No |
| CAN-SPAM | US commercial email sent? | **APPLIES** | Transactional + lifecycle emails are sent via Resend (`architecture-map.md` §A) | Verify sender identification, physical address disclosure, and functioning opt-out exist — full audit deferred to Section 10 | No (standard compliance, verifiable in-repo) |
| TCPA / state telemarketing laws | Marketing calls/texts sent? | **N/A today** | No SMS/calling integration exists in code (`architecture-map.md` §A) — `sms_package` is a pricing-tier *label* only, not a wired feature. Revisit immediately if/when SMS is actually built | If SMS is built later, this becomes CONDITIONAL-APPLICABLE and must be re-triaged before shipping | No, until SMS ships |
| ADA / accessibility | Covered public-facing business/service? | **APPLIES** | Public-facing commercial marketplace serving US consumers/businesses; WCAG 2.2 AA is the pack's own recommended engineering baseline | Full accessibility audit deferred to Section 11 | No (engineering standard, not a case-by-case legal call) |
| Apple App Store | iOS app distributed? | **APPLIES** | Capacitor iOS shell exists and is configured for distribution (`architecture-map.md` §A; `52_COMPLIANCE.md` iOS section already tracks Guideline 5.1.1(v) account deletion, IAP classification, privacy manifest) | Full audit deferred to Section 16; much of this is already tracked in `52_COMPLIANCE.md` | No (platform policy, not law, but real launch blocker if unmet) |
| Google Play | Android app distributed? | **APPLIES** | `@capacitor/android` present and configured (`architecture-map.md` §A) | Full audit deferred to Section 16 | No |
| FDA device/CDS rules | Diagnoses/treats/mitigates disease or regulated CDS? | **N/A** | No health/clinical feature exists | None | No |
| Telehealth / professional licensure | Regulated clinicians providing cross-jurisdiction services? | **N/A** | No clinical/licensed-profession service exists | None | No |
| CJIS / criminal justice data | Receives CJI from covered law-enforcement systems? | **N/A** | No such integration exists | None | No |
| Export controls (EAR/ITAR) | Controlled technical data, defense articles, or sanctioned-party issues? | **N/A** | No defense, export-controlled tech, or sanctions-adjacent feature exists | None | No |
| E-SIGN / UETA | Legally binding e-signatures/records used? | **PARTIAL / CONDITIONAL** | Real acceptance-versioning machinery already exists: `terms_acceptance` (user_id, agreement_version, policy_version, account_type, org_id, accepted_at, ip_address) and `consent_records` (user_id, consent_type, granted, source, ip_address, created_at) — `db/apply-all.sql`. No separate contract/e-signature product feature (e.g. signed vendor agreements) was found | Confirm in Section 02 whether the *acceptance* mechanics meet E-SIGN/UETA consent-and-retention requirements (evidence exists to check against, not a from-scratch build) | Light counsel touch if a formal e-signature feature is ever added |
| Marketplace facilitator / sales tax | Facilitates taxable transactions in states imposing collection duties? | **UNKNOWN — COUNSEL/OWNER REVIEW REQUIRED** | Divini takes a platform fee on marketplace transactions between vendors/venues and clients; whether Divini itself has marketplace-facilitator sales-tax collection/remittance duties (as opposed to the underlying vendor/venue) depends on the exact nature of the service sold (many states treat event/venue services differently from tangible goods) and transaction volume by state | Tax counsel review before scaling; no sales-tax collection/remittance code exists today | **Yes — counsel** |
| Information returns / 1099 | Does marketplace/payment activity create IRS reporting duties? | **CONDITIONAL, likely yes once live** | Stripe Connect typically handles 1099-K generation for connected accounts directly as the payment settlement entity; Divini's own 1099 obligations (e.g. for direct vendor payments outside Connect) depend on final architecture. No tax-ID/W-9 collection flow exists in code today (`architecture-map.md` §C) | Confirm Stripe Connect's 1099-K handling covers the actual fund flow (differs between v1 destination and v2 direct charge); build W-9/TIN collection if any direct 1099 duty falls on Divini itself | **Yes — accountant/counsel, before T7 unblocks** |
| Automatic renewal laws | Recurring paid subscriptions offered? | **APPLIES** | Role-based recurring subscription tiers exist (`AI_PROJECT_OS/22_APIS_AND_INTEGRATIONS.md`, `lib/stripeBilling.ts`), even though live billing is currently unconfigured (T7) | Verify renewal-disclosure and easy-cancellation mechanics meet current state auto-renewal law requirements before Stripe goes live; full audit deferred to Section 09 | No (verifiable in-repo, standard UX requirement), but confirm before T7 unblocks |
| EU AI Act / algorithmic decision rules | AI offered in covered jurisdictions or used for high-impact decisions? | **N/A today** | AI features (`architecture-map.md` §A) are single-shot text-extraction/discovery assists with deterministic fallback, not high-risk categories (employment, credit, housing, law enforcement, etc.) under the Act, and the product is not EU-targeted | Revisit if EU users are onboarded or if AI features expand into higher-impact decisioning | No, revisit if facts change |
| Employment AI laws | Automated decision-making for hiring/employment? | **N/A** | No employment/HR feature exists | None | No |
| SOC 2 | Customer/enterprise assurance requirement | **MARKET-DRIVEN, not yet certified** | Technical-controls audit already done and gaps closed (`AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`); formal Type I/II certification requires an ISMS owner, policy adoption, and an independent auditor engagement — none of which exists yet | Owner decision on timing/budget for formal engagement | Owner (business decision, not legal requirement) |
| ISO/IEC 27001 | Certification/customer/market requirement | **MARKET-DRIVEN, not yet certified** | Same basis as SOC 2 row | Same as SOC 2 row | Owner |
| HITRUST | Contract/customer assurance option | **N/A** | Not customer-required today; HITRUST is a healthcare-sector assurance framework and this platform has no health-data footprint | None | No |

## E. Certification / attestation classification

| Certification / Attestation | Legally Required? | Contractually Required? | Market-Driven? | Current Status | Gap | Recommended Timing |
|---|---|---|---|---|---|---|
| SOC 2 Type I/II | No | Not currently (no enterprise customer contract requires it yet) | Yes, if pursuing larger enterprise venue/vendor customers | Technical controls audited and gaps closed; no formal engagement started | Named ISMS owner, policy sign-off, independent auditor | After real revenue traction / first enterprise prospect that asks for it |
| ISO/IEC 27001 | No | No | Possible, for international enterprise customers | Same as SOC 2 | Same as SOC 2, plus accredited certification body | Same trigger as SOC 2 |
| PCI validation/SAQ/AOC | Yes, once processing real card transactions | Yes, per processor agreement | N/A | Not yet completed (Stripe/PayPal keys unconfigured, T7) | Confirm SAQ level (likely A/A-EP) and complete AOC | Before T7 unblocks (real money) |
| Penetration testing | No (unless a future enterprise contract requires it) | Possible, for enterprise deals | Common expectation before scaling | Not yet performed; this pack's Section 15 covers adversarial testing at the application level, which is not a substitute for an independent pen test | Independent third-party pen test | Recommended before T7 (real money) or first enterprise deal, whichever is sooner |
| HITRUST | No | No | No (no health-data footprint) | N/A | N/A | N/A |
| Apple Developer Program / App Store review | Yes, to distribute on iOS | N/A | N/A | Account-deletion, IAP classification, and privacy-manifest work already tracked (`52_COMPLIANCE.md`) | Full Section 16 audit | Before App Store submission |
| Google Play Developer account / review | Yes, to distribute on Android | N/A | N/A | Same posture as Apple, less detailed tracking so far | Full Section 16 audit | Before Play Store submission |

*Note per pack Rule: HIPAA is correctly excluded from this table — it is a legal-compliance obligation, not a certification HHS issues, and it does not apply here regardless.*

## F. Output gates

### P0 legal/use-case blockers identified

None of the "hard N/A" regimes (HIPAA, COPPA/minors, FERPA, FCRA, GLBA,
securities, biometric, CJIS, export controls, FDA/telehealth, employment AI)
create a blocker — the product genuinely does not touch those use cases
today. The real blockers are the ones already tracked in
`AI_PROJECT_OS/12_TASK_QUEUE.md`:

- **T7** (live Stripe key / real money) — correctly still gated on counsel
  review of the money-transmission, PCI, marketplace-facilitator tax, and
  1099 questions raised above, not just "flip the key."
- **T8** (counsel review of Terms + 5 policies) — same gate, now with the
  v1-vs-v2 Connect coexistence question added explicitly (see the money
  transmission row above and `52_COMPLIANCE.md`).

### Section applicability for the rest of this pack

| Section | Status |
|---|---|
| 02 Baseline Legal/Privacy/Consent | REQUIRED |
| 03 Repo/Env/Secrets/CI/CD | REQUIRED |
| 04 Authentication/OAuth/Sessions/MFA | REQUIRED (note: no OAuth/social login exists today — that subsection will be N/A within Section 04) |
| 05 Authorization/RBAC/RLS/Tenancy/Admin | REQUIRED |
| 06 Database Integrity/Backups | REQUIRED |
| 07 App/API Perimeter/Uploads/Bots | REQUIRED |
| 08 AI Security/Governance | REQUIRED (AI functionality exists — extraction/discovery features; scope is narrower than a full RAG/agent product, see architecture-map.md §A) |
| 09 Payments/Stripe/Webhooks/Marketplace/Tax | REQUIRED |
| 10 Email/SMS/Push/Marketing | REQUIRED for email; SMS/push subsections N/A today (not implemented) per the TCPA row above |
| 11 UX/Accessibility/Onboarding | REQUIRED |
| 12 Profiles/Orgs/Admin/Products/Calendar/Video/Documents | REQUIRED, with Video subsection largely N/A (no video-conferencing integration exists) and Calendar subsection narrow (one-way `.ics` export only) |
| 13 Analytics/Behavior/Personalization | REQUIRED but narrow — no analytics provider exists today, so this section is mostly "should we build this, and if so how" rather than "audit what exists" |
| 14 Observability/Incident Response/DR | REQUIRED |
| 15 QA/E2E/Load/Pentest/Regression | REQUIRED |
| 16 Mobile/iOS/Android/App Store | REQUIRED |
| 17 Conditional Regulatory Overlays | Apply the N/A determinations from the matrix above; do not re-open HIPAA/COPPA/FERPA/FCRA/biometric/CJIS/export-control/FDA/telehealth/employment-AI work unless new facts change applicability, per the pack's own instruction |
| 18 Final Launch Readiness/Certification/Sign-off | REQUIRED (cumulative) |

### Recommended next section

**Section 02 (Baseline Legal, Privacy, Consent & User Rights)** — the
platform already has legal documents, a Task T8 tracking counsel review, and
some acceptance/versioning machinery; Section 02's job is to verify that
machinery actually exists and works end-to-end (not just that the documents
exist), which is a natural, scoped next step distinct from Section 01's
discovery work.
