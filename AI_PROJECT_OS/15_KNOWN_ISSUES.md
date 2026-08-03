# 15 Known Issues

Open issues, rough edges, and gotchas. Verify against the code before acting; some entries are operational rather than bugs.

## Operational / gating

- Production fails closed: if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is missing in production, the process throws at startup by design. Not a bug, but it will look like a crash if env is not set. (`server/src/config.ts`, `server/src/lib/session.ts`.)
- Email gating: with no `EMAIL_API_KEY`, sends are logged and skipped. On a live site this silently blocks register -> verify -> login because the verification email never goes out. (`server/src/lib/email.ts`.)
- Stripe deferred: with `STRIPE_SECRET_KEY` unset, payouts and venue share are queue-only. Records are correct but no money moves. Expected until go-live.
- Malware scanning deferred: with `AV_SCAN_ENABLED` unset (default), uploads still pass extension/MIME/magic-byte checks but skip the ClamAV virus scan. A non-fatal production startup warning fires so this stays a visible decision, not a silent gap. (`server/src/lib/uploadGuard.ts`, `server/src/lib/startup-check.ts`.)

## App Store compliance gap (real, not yet built)

- In-app account deletion (Apple Guideline 5.1.1(v)) is required and NOT reachable from any UI. `src/lib/db.ts` has a `deleteMyAccount()` stub calling `POST /account/delete`, but no page calls it and no such server route exists. This is a hard blocker for App Store submission specifically — needs a real design pass (hard delete vs. anonymize, cascade scope across ~130 tables), not a quick patch. Found during the 2026-08-03 launch readiness audit; deliberately left unbuilt rather than rushed.

## Documentation drift

- Schema port mismatch in docs: `db/SCHEMA-NOTES.md` describes local Postgres on port 5433 with `db/schema.sql` and "27 tables" (the original phase-1 core). The deployed schema is the consolidated `db/apply-all.sql` (~133 tables) applied into the Docker container `divini_partners_db`. Use `apply-all.sql` for deploy; `SCHEMA-NOTES.md` reflects the early local-validation snapshot.

## Repo hygiene

- Stale build artifacts: ~50 `dist_*` directories and many `vite.config.ts.timestamp-*.mjs` files litter the repo root. Cosmetic, but they slow rsync and clutter the tree. (Task T10.)

## Multi-replica caveat

- Rate limiting is single-process (in-memory per-IP). Behind multiple replicas it is approximate; front with an edge/WAF limiter if scaling out. (`server/src/lib/rateLimit.ts`.)

## Dependency vulnerabilities (2026-08-03 npm audit)

- `react-router`/`react-router-dom` (6.0.0–7.17.0) has two moderate CVEs (open-redirect bypass, arbitrary constructor injection during SSR hydration) that require a major-version bump to fix — `npm audit fix` without `--force` correctly declined. This is a runtime dependency in a ~170-route SPA; the upgrade deserves its own dedicated, tested pass, not a rushed bundle-in. Everything else safely patchable (`postcss`, `brace-expansion`, `nanoid`, server-side `body-parser`) was fixed in place with a verified zero-behavior-change diff.
- `sharp` (transitive, via image tooling) has a high-severity libvips CVE with no fix currently available upstream — monitor for an upstream patch.

> TODO(owner): Add any specific reproducible bugs found during the V2 flip smoke test here, with steps and the offending file.
