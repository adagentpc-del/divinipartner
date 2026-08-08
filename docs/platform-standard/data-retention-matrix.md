# Data Retention Matrix

Section 02 (Baseline Legal, Privacy, Consent & User Rights) of the ALFY2
pack. Produced 2026-08-08.

## What already exists vs. what this file adds

The platform already has the **mechanism** to declare and query retention
policies: `data_retention_policies` (`db/apply-all.sql`), `db/compliancePrivacy.ts`,
`routes/compliance-privacy.ts`, and the "Data retention policies" panel in
`ComplianceCenter.tsx` (super-admin only, correctly). Live-verified
2026-08-08: a non-admin gets 403 on `POST /compliance-privacy/retention`; an
admin can set one. **Zero rows exist in that table today** — the tooling
works, but no actual policy has ever been declared. Per the pack's Rule 15
("no fake completion"), that is recorded honestly here rather than treated
as done because the code exists.

This file is the **proposed content** for those declarations — reasoned
defaults per data category, each flagged for owner/counsel confirmation
before being entered as the source of truth in the tool above. This
document does not itself change database state; entering the rows via
`ComplianceCenter.tsx` (or a seed script an operator runs deliberately) is
a separate, deliberate step, consistent with pack Rule 4 (no destructive or
consequential production actions without explicit operator action) — and
retention periods are a business/legal decision, not one this pass should
invent unilaterally as settled fact.

## Proposed retention periods

| Data category | Object type (for `data_retention_policies.object_type`) | Proposed retention | Trigger | Deletion/anonymization action | Legal hold override | Basis / rationale | Confirm before adopting |
|---|---|---|---|---|---|---|---|
| Auth credentials (password hash) | `users.password_hash` | Until account deletion | Account deletion | Overwritten/cleared on deletion (`51_SECURITY.md`, existing account-deletion flow) | N/A | Already implemented behavior, not a new policy | No — matches existing code |
| Contact info (name, email, phone) | `users` (PII fields) | Until account deletion, then anonymized | Account deletion | Anonymized in place (existing `POST /account/delete`, task T58/#58) | N/A | Already implemented | No — matches existing code |
| Org business records (quotes, invoices, events, bids) | `quotes`, `invoices`, `events`, `bids` | Retained indefinitely at present; recommend 7 years post-relationship-end as a starting point | Org deletion or explicit business decision | Not automated today | Financial/audit retention need | 7 years is a common US financial-recordkeeping convention (not a specific cited statute — **counsel to confirm the actual applicable period for this business/jurisdiction**) | **Yes — owner/counsel** |
| Financial/payment references (processor IDs, amounts — never raw card data) | `payments` | Recommend 7 years | Same as above | Not automated today | Tax/audit requirement | Same as above | **Yes — owner/counsel, ties into the 1099/tax questions in `applicability-register.md`** |
| Uploaded compliance documents (COI/W-9-style) | Document storage (local/S3) | Recommend: life of the vendor relationship + 3 years, or per the applicable retention convention for the document type | Vendor/org deletion, document replacement | Manual deletion via existing document-management routes | Active compliance/dispute | Matches typical vendor-document retention practice; **counsel to confirm** | **Yes — owner/counsel** |
| `audit_logs` (security/change audit trail) | `audit_logs` | Recommend 1–2 years for routine entries; longer if tied to an open investigation | Time-based | Not automated today (T14, `12_TASK_QUEUE.md`) | Active investigation | Common security-log retention range; balances forensic value against unbounded accumulation | **Yes — owner, informed by any future SOC 2/ISO 27001 engagement's specific requirement** |
| `terms_acceptance` / `consent_records` (legal-acceptance and consent ledger) | `terms_acceptance`, `consent_records` | Retain for the life of the account plus a reasonable post-deletion window (recommend 3 years) | Account deletion | Not automated today | Evidence of consent may be needed to defend a legal claim after deletion | Standard practice: consent records are the proof you'd need to rely on later, so they should outlive the account itself for a bounded window | **Yes — owner/counsel** |
| `privacy_requests` (the data-subject request workflow itself) | `privacy_requests` | Recommend 3 years post-completion | Request completion | Not automated today | Evidence that requests were honored, if ever challenged | Same reasoning as above | **Yes — owner/counsel** |
| AI prompts/outputs | Not persisted to a dedicated table (per `architecture-map.md` §C) | N/A today | N/A | N/A | N/A | Nothing to retain-manage yet — flag if a persistent AI run-audit trail is added later (Section 08) | No, revisit only if this changes |
| Analytics/behavior data | No analytics system exists (per `architecture-map.md` §A) | N/A | N/A | N/A | N/A | Nothing to retain-manage | No, revisit only if this changes |
| Device/usage signals (`fingerprint.ts` → `POST /api/signals`) | `visitor_signals` (`server/src/db/signals.ts`) — fingerprint, IP, user-agent, accept-language, path, referrer, utm, best-effort user_id/org_id, client hints | Currently unbounded — no purge job exists (confirmed by reading `routes/signals.ts` + `db/signals.ts`, 2026-08-08) | Recommend: 12–13 months (enough for year-over-year usage comparison, short enough to bound exposure) | Not automated today | None identified (fraud/security use case, not a legal record) | Privacy.tsx discloses collection and "coarse, largely aggregate" use but does not state a retention period, and the code confirms nothing purges it — this is a real gap, not a documentation nit | **Yes — owner to confirm the period; then this needs an actual purge job, not just a declared policy row, since nothing enforces `data_retention_policies` automatically anywhere in the codebase** |

## Validation performed

1. Confirmed the retention-declaration API correctly rejects a non-admin
   (`403 forbidden`, live-tested against a real registered non-admin
   account, 2026-08-08).
2. Confirmed the table is real (`select count(*) from data_retention_policies`
   → 0 rows) — not populated, so no false "this is handled" claim is made.
3. Did **not** yet trace `/api/signals`' server-side storage/retention —
   flagged above as an open item rather than guessed at.

## Immediate next step

The `/api/signals` retention gap above is small enough to close in this
same section rather than deferring it further — see the findings/control
updates below.
