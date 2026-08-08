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
