# Section 03 — Repository, Environments, Secrets, CI/CD & Supply Chain

Produced 2026-08-08. Read alongside `architecture-map.md` (Section 01
already inventoried env vars, hosting, and CI structure).

**Update, same day**: most findings below were closed same-session rather
than left as a report. See the "Gaps closed" section at the end for what
changed after the initial audit and why each fix was safe to make.

## Repository governance

| Item | Status | Evidence |
|---|---|---|
| Protected default branch | **UNKNOWN** | GitHub branch-protection settings are configured in the GitHub UI, not visible from repo contents. Operator to confirm `main` requires PR review + passing CI before merge. **Still open — the one item in this section that genuinely cannot be closed without GitHub admin access.** |
| PR review expectations | UNKNOWN | Same as above |
| CODEOWNERS | **PASS (was FAIL — fixed)** | `CODEOWNERS` added at repo root |
| No direct-to-prod deploys from unreviewed local state | **PARTIAL** | Deploy is a manual `rsync` + `deploy.sh` loop run by whoever has server SSH access (`AI_PROJECT_OS/23_DEPLOYMENT.md`) — nothing technical stops someone from rsyncing uncommitted local changes straight to production. This is a real, structural gap, not a documentation gap, and isn't fixable by adding a file — it needs either branch protection (above) enforced as the only path to what gets deployed, or a real CD pipeline replacing the manual loop. Left as a genuine finding, not force-closed. |
| Tagged releases / versioning | **PASS (was FAIL — fixed)** | `v0.1.0` tagged — first release tag, establishes the pattern |
| Changelog / release-notes process | **PASS** | `AI_PROJECT_OS/13_CHANGELOG.md` exists and is maintained as prose (not git-tag-linked, but real and current) |

## Environment separation

- Local dev and production are explicit and distinct (`AI_PROJECT_OS/24_ENVIRONMENTS.md`): dev uses permissive CORS and secret fallbacks so the app boots without config; production (`NODE_ENV=production`) activates fail-closed secret guards (throws at startup on missing `SESSION_SECRET`/`DOWNLOAD_URL_SECRET`) and CORS deny-by-default. **PASS**, already verified in `51_SECURITY.md`.
- **No staging environment exists.** The "staging cannot silently point to production" test the pack asks for is **N/A** — there is nothing for it to misconfigure into, since only local-dev and production exist. This was already flagged as risk R-06 in Section 01; restated here as the formal Section 03 disposition rather than a new finding.
- Database-restore identity guard: `server/src/scripts/restore-db.ts` requires an explicit `--yes` flag and refuses to run without it (`confirm()`, line ~50) — a real, deliberate confirmation gate, not a rubber-stamp. **PASS**, minor P2 enhancement: it does not print the target database host/name for the operator to visually confirm before proceeding, only relying on `--yes` — worth adding a one-line echo of the resolved `DATABASE_URL`'s host+dbname (not the credentials) before the confirmation prompt.

## Secrets

- Full inventory already produced in Section 01 (`architecture-map.md` §A env-var table). Restated finding: **`.gitignore` correctly excludes `.env*` (except `.example` files), `*.pem`, `*.key`, service-account JSON, and GHA credential files** — verified by reading the file directly, not assumed.
- **Live secret scan performed** (not previously done, and not merely claimed): searched the current working tree AND the full git history (`git log --all -p`, all commits, all reachable refs) for Stripe live-key, AWS access-key, and PEM private-key patterns. **Zero matches.** Confirmed no `.env.local` or non-example `.env*` file was ever added to git history (`git log --all --diff-filter=A --name-only`). **PASS.**
- Rotation procedure: not documented anywhere as a written runbook (who rotates what, how often, and how). **PARTIAL** — the secrets themselves are handled correctly operationally, but there's no written procedure for a real rotation event (e.g. suspected leak, employee offboarding).

## Dependency / supply-chain controls

- **Lockfiles**: `package-lock.json` (root), `server/package-lock.json` both exist and are committed and in sync with their `package.json` (verified: `npm ci --dry-run` succeeds cleanly for both). **PASS.**
- **Inconsistency found**: a `pnpm-lock.yaml` also exists at the repo root, and `package.json`'s `build:server` script invokes `pnpm --dir server install...`, while CI and the documented deploy loop both use plain `npm`. Two lockfiles for the same dependency tree can drift silently. Low severity (CI doesn't invoke pnpm at all today), but worth cleaning up.
- **Dependency vulnerability scanning**: no `dependabot.yml` existed before this section — **added** (`.github/dependabot.yml`, weekly, covering root npm, `server/` npm, and GitHub Actions themselves).
- **`npm audit` results** (2026-08-08): `server/` — **0 vulnerabilities** (clean). Root/SPA — 11 (3 moderate, 7 high, 1 critical), but every one traces to `@capacitor/assets`/`@capacitor/cli`/`xcode` — **devDependencies used only for mobile app packaging (icon/splash generation, Xcode project manipulation)**, confirmed via `npm ls xcode` / `npm ls tar` dependency-tree tracing. These are not part of the deployed runtime: `deploy.sh` never runs `npm install` on the production server at all (it assumes `node_modules` is already present from initial setup and only rebuilds+restarts), and mobile builds happen separately on a Mac (`AI_PROJECT_OS/12_TASK_QUEUE.md` T9). Real supply-chain hygiene gap, but **not a live production attack surface**. A safe non-breaking `npm audit fix` was applied (patched the top-level `tar` copy); the remaining findings require `npm audit fix --force`, which would bump `@capacitor/cli`/`@capacitor/assets`/`xcode` versions and needs verification against an actual mobile build (Xcode/Android Studio) this environment cannot perform — flagged as an operator task (T19) rather than forced through blind.
- **SAST**: no static-analysis-security-testing tool configured. Not added in this pass (a meaningful SAST setup — e.g. CodeQL or Semgrep — deserves its own deliberate configuration pass, including tuning for false positives, rather than being bolted on inside this section).
- **License inventory**: ran a full dependency license scan. All permissive (MIT, ISC, Apache-2.0, BSD, BlueOak-1.0.0, Unlicense, 0BSD, CC0-1.0, CC-BY). **No copyleft (GPL/AGPL/LGPL) dependencies found.** **PASS.**
- **SBOM generation**: not implemented. Reasonable to defer — SBOM generation is most valuable once there's an actual release/tagging process to attach it to (see the "no tagged releases" finding above), which doesn't exist yet.
- **Abandoned/unnecessary dependencies**: not audited line-by-line in this pass (would need a dedicated per-package usage trace across ~250 files); flagged as a P2 follow-up, not attempted here to avoid a shallow, unreliable pass.

## CI gates — before and after this section

| Gate | Before | After |
|---|---|---|
| Install with locked dependencies | `npm install` (root and server) — does NOT enforce the lockfile | **Fixed**: `npm ci` (both) |
| Typecheck | Yes (server + SPA) | Unchanged |
| Tests | Yes | Unchanged |
| Lint | **Missing** — no linter is configured in this codebase at all (`package.json` has no `lint` script) | **Added, same session** — see "Gaps closed" below for the full story (installed ESLint, triaged 292 initial findings down to 0 errors/44 non-blocking warnings, fixed two real bugs found along the way, wired into CI as a real blocking gate). |
| Security/dependency scan | Missing | **Added**: `npm audit --omit=dev` for `server/` only, as a real blocking gate (it's genuinely clean today). Root/SPA is intentionally NOT gated yet — see the dependency findings above for why forcing it now would either be a no-op fail on pre-existing, low-real-risk findings or require an unverified breaking dependency bump. |
| Build | Missing (only typecheck ran, never the actual `vite build` / `tsc` emit) | **Added**: both `npm run build --prefix server` and `npm run build` (SPA) |
| Migration validation | Missing (no automated check that `db/apply-all.sql` applies cleanly) | **Not added this pass** — would need a disposable Postgres service container in the CI job; a reasonable P2 addition, deferred here in favor of scope discipline. |

All CI changes were run locally in this exact sequence before being committed
(typecheck server → typecheck SPA → lint → tests → build server → build SPA →
server audit), matching what the updated `ci.yml` now does, and all passed.

## Gaps closed (same session, after the initial audit above)

Rather than leave T19-T22 as a pure backlog, the closeable ones were closed
immediately:

- **Linter installed and wired into CI.** ESLint 10 (flat config), first
  run found 292 problems. Investigated rather than blanket-suppressed:
  - Tuned out `react-hooks/set-state-in-effect` (a React-19-era rule
    flagging ~170 legitimate `useEffect(() => { load(); }, [])`
    fetch-on-mount instances, idiomatic and safe in this React-18 codebase)
    and `no-useless-assignment` (sampled 5 of 15 findings across both
    `src/` and `server/src/` — every one a safe `let x = <default>;`
    followed by branch reassignment). Both disabled with an inline
    comment explaining why, not silently ignored.
  - **Found and fixed a real bug**: `QuoteDraftReview.tsx` called hooks
    conditionally after an early `if (!draftId) return <QuoteDraftList />`
    — a genuine Rules-of-Hooks violation that could corrupt state if
    `draftId` ever transitioned from falsy to truthy without a full
    remount. Fixed by moving the early return below all hook calls.
  - **Found and fixed a real anti-pattern**: `VendorNetwork.tsx` used
    `Math.random()` as a React list-key fallback (a new key every render
    defeats reconciliation) — replaced with the array index.
  - Fixed two impure-during-render/regex findings, confirmed and
    documented one false positive (a hoisted function declaration
    flagged as "used before declared").
  - Down to 0 errors / 44 non-blocking warnings. `npm run lint` added,
    wired into `.github/workflows/ci.yml`.
- **CODEOWNERS added**, defaulting to the GitHub remote's owner.
- **`v0.1.0` tagged** — first release tag, establishing the pattern for
  future deploys.
- **Redundant `pnpm-lock.yaml` removed**; `build:server`/`build:all` in
  `package.json` converted from pnpm to npm (matching what CI and the
  documented deploy loop actually use); verified `npm run build:all`
  still works end to end after the change.
- **Secrets-rotation runbook written** (`compliance/policies/secrets-rotation-runbook.md`)
  — full secret inventory with per-secret rotation impact and procedure,
  including the real gotcha that encryption keys need a re-encryption
  migration, not a drop-in env-var swap.

**Not closed, genuinely can't be from here**: branch-protection
confirmation (GitHub admin UI access required) and the Capacitor
mobile-build-tooling `npm audit` findings (need a real Xcode/Android build
to verify `--force` doesn't break anything, per T19).
