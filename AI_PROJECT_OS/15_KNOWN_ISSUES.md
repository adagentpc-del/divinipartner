# 15 Known Issues

Open issues, rough edges, and gotchas. Verify against the code before acting; some entries are operational rather than bugs.

## Operational / gating

- Production fails closed: if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is missing in production, the process throws at startup by design. Not a bug, but it will look like a crash if env is not set. (`server/src/config.ts`, `server/src/lib/session.ts`.)
- Email gating: with no `EMAIL_API_KEY`, sends are logged and skipped. On a live site this silently blocks register -> verify -> login because the verification email never goes out. (`server/src/lib/email.ts`.)
- Stripe deferred: with `STRIPE_SECRET_KEY` unset, payouts and venue share are queue-only. Records are correct but no money moves. Expected until go-live.

## Documentation drift

- Stale Authentik references: `.env.local.example` and the `package.json` description still mention Authentik OIDC and "local-disk storage" framing. The live `server/src/auth.ts` is native email/password. Trust the code; clean up these references when convenient.
- Schema port mismatch in docs: `db/SCHEMA-NOTES.md` describes local Postgres on port 5433 with `db/schema.sql` and "27 tables" (the original phase-1 core). The deployed schema is the consolidated `db/apply-all.sql` (~133 tables) applied into the Docker container `divini_partners_db`. Use `apply-all.sql` for deploy; `SCHEMA-NOTES.md` reflects the early local-validation snapshot.

## Repo hygiene

- Stale build artifacts: ~50 `dist_*` directories and many `vite.config.ts.timestamp-*.mjs` files litter the repo root. Cosmetic, but they slow rsync and clutter the tree. (Task T10.)

## Multi-replica caveat

- Rate limiting is single-process (in-memory per-IP). Behind multiple replicas it is approximate; front with an edge/WAF limiter if scaling out. (`server/src/lib/rateLimit.ts`.)

> TODO(owner): Add any specific reproducible bugs found during the V2 flip smoke test here, with steps and the offending file.
