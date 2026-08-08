# Control Register

One row per control across all ALFY2 pack sections. Bootstrapped at Section
01; populated as each later section executes. Per pack Rule 2, this
register does not duplicate `AI_PROJECT_OS/12_TASK_QUEUE.md` (this project's
existing task/control tracker) — rows here cite it as evidence where a
control was already implemented and tracked there.

| Control ID | Section | Requirement | Priority | Applicability | Status | Evidence | Risk | Remediation | Validation | Owner/Action | Last Checked |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S01-01 | 01 | Architecture/infrastructure inventory exists and is current | P1 | Required | PASS | `docs/platform-standard/architecture-map.md` | Low | N/A | Manually verified against `package.json`, `db/apply-all.sql`, `.github/workflows/ci.yml`, `server/src` env-var grep, 2026-08-08 | N/A | 2026-08-08 |
| S01-02 | 01 | Regulatory applicability matrix populated with evidence, not assumption | P0 | Required | PASS | `docs/platform-standard/applicability-register.md` §D | Low | N/A | Cross-checked against `AI_PROJECT_OS/52_COMPLIANCE.md`, `AI_PROJECT_OS/12_TASK_QUEUE.md` T7/T8, schema grep for health/education/biometric/background-check fields (none found) | Owner/Counsel per row (see applicability-register.md) | 2026-08-08 |
| S01-03 | 01 | Age gate at registration (COPPA hygiene) | P2 | Conditional | FAIL | `db/apply-all.sql` grep: no `date_of_birth`/`dob`/`age_confirmed` field found | Low (product is not child-directed, but zero technical barrier exists if a minor signs up) | Add an age-affirmation field/checkbox at registration | Not yet implemented | Owner | 2026-08-08 |
| S01-04 | 01 | Legal-acceptance versioning machinery exists | P1 | Required | PASS | `terms_acceptance` + `consent_records` tables, `db/apply-all.sql` lines ~62, ~4183 | Low | N/A | Confirmed schema exists; end-to-end functional test deferred to Section 02 | N/A | 2026-08-08 |
| S01-05 | 01 | Audit-trail table exists and is actively written | P1 | Required | PASS | `audit_logs` table + `server/src/lib/audit.ts`, wired into admin, MFA, payments, support, platform-revenue routes (confirmed via grep, not just schema presence) | Low | Retention period for `audit_logs` not yet centrally defined | Confirmed active call sites via grep, 2026-08-08 | N/A (retention policy is a Section 02/06 follow-up) | 2026-08-08 |

## Notes

- This register will grow substantially starting with Section 02. Sections
  already substantively covered by prior work in this repository (MFA,
  session revocation, structured logging, automated backups, CSRF, bot
  guard, prompt-injection defense, Stripe Accounts v2) will largely convert
  existing `AI_PROJECT_OS/` documentation into rows here rather than
  re-auditing from scratch, per pack Rule 2.
