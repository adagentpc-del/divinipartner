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
