# 11 Active Sprint

Last updated: 2026-06-24

## Sprint goal

Take Pricing V2 live on divinipartners.com: set production environment, flip the pricing flags, run the one-time data migration, and verify the new money model end-to-end. Do this without enabling real money movement (Stripe key stays unset).

## In scope

- Production `.env.local` on the server (fail-closed secrets, origins, email).
- Apply `db/apply-all.sql` (idempotent), snapshot DB, run `db/schema-pricing-v2-migrate.sql` once.
- Set `PRICING_V2=true` and `VITE_PRICING_V2=true`; deploy; restart pm2 with `--update-env`.
- Smoke test: healthz 200, `pricing_v2:true` on processors endpoint, public copy and registration verified, a test booking writes correct `platform_revenue` and `venue_revenue_share` rows.

## Out of scope (this sprint)

- Live Stripe key / real money movement.
- iOS native build and App Store submission.
- New features beyond the V2 model.

## Definition of done

- divinipartners.com serving the V2 model (free roles, 5% on-top fee shown, venue share recorded, Featured Vendor purchasable).
- No "empty CORS allowlist" warning in production logs.
- Auth rate limit returns 429 on rapid repeated logins.
- `10_CURRENT_STATE.md`, `13_CHANGELOG.md`, `12_TASK_QUEUE.md` updated to reflect the flip.

## Notes

- Rollback is supported: set both flags false, redeploy; new schema is additive. Take a DB snapshot before the data migration so legacy tier/fee values can be restored if needed.
- Deploy golden rule: `rsync` on the Mac terminal; `deploy.sh` and `psql` on the server web console; never sync `.env.local`.

> TODO(owner): If the team tracks sprints by date/number, set the sprint label and dates here. None recorded in repo.
