# Deploy — see the real runbooks

This file used to describe a Vercel + Supabase topology that **no longer
exists**. Do not deploy that way — the app is a full-stack Express + Postgres
platform and a frontend-only deploy would ship a site with no API.

Production runs on the DigitalOcean droplet as pm2 process `divini-partners`
(port 3011), served at https://divinipartners.com via Caddy, deployed by
rsync from the Mac + `deploy.sh` on the server.

Use these, in order of relevance:

- **RELEASE-RUNBOOK.md** — how to ship a normal release to production.
- **DIVINI-PARTNERS-DEPLOY.md** — the full Stage A/B first-deploy runbook
  (env, DB, Authentik OIDC, Caddy, DNS).
- **DEPLOY-GAP-CLOSURE.md** — the latest additive schema/deploy notes.
- **READY-TO-SHIP-CHECKLIST.md** — pre-flight checklist.

Required fail-closed env vars (login/boot throw without them):
`SESSION_SECRET`, `DOWNLOAD_URL_SECRET`, and if Stripe is on,
`STRIPE_WEBHOOK_SECRET` alongside `STRIPE_SECRET_KEY`. Set them in the
droplet's `.env.local` (never committed, never rsynced).
