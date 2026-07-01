# Divini Partners — Release Runbook

How to ship the accumulated release (event-copy fix + Venue Intelligence addendum
Phases 1-7 + Friction Elimination upgrades + marketplace ranking) to production.

Server: DigitalOcean droplet 167.172.135.196. App: pm2 `divini-partners` on port
3011, served at https://divinipartners.com via Caddy (already pointed at 3011).
DB: local Postgres, database `divini_partners`. Old app still runs on :3010 (pm2
`divinipartner`) as a fallback.

GOLDEN RULE (the recurring gotcha): `rsync` runs in the MAC terminal. `deploy.sh`
runs in the SERVER web console. Do not mix them up. SSH throttles on rapid repeats;
space out attempts.

---

## 0. Pre-deploy (on the Mac, in the repo)
- Confirm local build is green:
  - `cd sites/divini-partners/server && npx tsc -p tsconfig.json --noEmit`  (expect 0)
  - `cd sites/divini-partners && npx tsc --noEmit`  (expect 0)
- Remove throwaway verification dirs/backups the sandbox could not delete:
  - `rm -rf sites/divini-partners/dist_verify sites/divini-partners/dist_verify2 sites/divini-partners/dist_verify3 sites/divini-partners/dist_fe_verify`
  - `rm -f sites/divini-partners/db/apply-all.sql.pre-fe.bak`

## 1. Push code to the server (MAC terminal)
```
rsync -avz --exclude node_modules --exclude .git --exclude 'dist*' \
  ~/Claude/Projects/OpenAD/sites/divini-partners/ \
  root@167.172.135.196:/root/sites/divini-partners/
```

## 2. Apply the new database schema (SERVER web console)
apply-all.sql is idempotent (every statement is `create table if not exists` /
`create index if not exists`), so it is safe to re-run. It adds the ~30 new tables
from both addenda (venue_twin, branding_opportunities, venue_restrictions,
vendor_quote_requirements, vendor_pricing_rules, quote_drafts, vendor_readiness,
preferred_vendors, revenue_inventory, sponsorship_opportunities,
vendor_event_requirements, event_plans, venue_compare_attrs, event_inquiries,
verification_badges, vendor_compliance, installations, event_registrations,
event_info, sponsorship_metrics, and more).
```
cd /root/sites/divini-partners
set -a; . ./.env.local; set +a
psql "$DATABASE_URL" -f db/apply-all.sql
# expect a stream of CREATE TABLE / CREATE INDEX or NOTICE "already exists" lines, no ERROR
```

## 3. Build, stage, restart (SERVER web console)
```
cd /root/sites/divini-partners && bash deploy.sh
```
deploy.sh sources .env.local, builds the API (tsc) and SPA (vite), stages the SPA
into server/dist/public, `pm2 restart divini-partners`, and prints
`divini-partners live: HTTP <code>`. Want HTTP 200.

Caddy already routes divinipartners.com to :3011, so no Caddy change is needed. (If
Caddy ever needs reloading, edit /root/Caddyfile then `docker restart caddy` — note
a bare `sed -i` breaks the single-file bind mount, so restart the container.)

## 4. Post-deploy smoke checklist (browser + console)
Public / auth:
- https://divinipartners.com loads the event marketplace; title says "The Premium
  Event Partnership Marketplace"; canonical is divinipartners.com.
- /login shows Sign in / Create an account / Forgot password.
- Sign in via Authentik returns to the app.
- Admin console: every tab in the tab bar navigates (Overview ... Feature Flags).

New API health (server console; expect 200/JSON, 401 if unauthenticated is fine):
```
for p in venue-twin branding-opportunities venue-restrictions vendor-requirements \
  vendor-pricing quote-drafts vendor-readiness preferred-vendors revenue-inventory \
  sponsorships vendor-event-requirements recommend event-assistant event-readiness \
  venue-compare leads vendor-compliance installations guest-hub sponsorship-intel; do
  curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:3011/api/$p/meta 2>/dev/null || true
done
```
End-to-end (signed in, against real DB):
- Create/edit a Venue Twin; readiness score updates and lists missing items.
- Add a branding opportunity; it appears as a public "Brand event here" tile on the
  venue profile; the CTA starts an event.
- Build a vendor quote-requirement template + pricing rule; generate a draft quote
  from venue + opportunity + vendor and confirm it auto-fills measurements/restrictions
  and computes a price.
- Submit a qualified lead; confirm it gets a quality score + intent and ranks in the
  venue Lead Inbox.
- Email still sends: `node server/dist/test-emails.js adagentpc@gmail.com` (or POST
  /api/admin/test-email) -> all types SENT, check the inbox.

## 5. Rollback
- App: `pm2 restart divini-partners` after `git`/rsync of a known-good copy, or repoint
  Caddy back to the old app: edit /root/Caddyfile divinipartners.com -> localhost:3010
  then `docker restart caddy`.
- DB: the schema is additive (new tables only); nothing is dropped or altered, so a
  schema apply needs no rollback. Pre-change env/Caddy backups exist as
  .env.local.bak.* and /root/Caddyfile.bak.*.

## Known follow-ups (not blockers)
- Authentik password-recovery flow URL is a TODO in src/lib/auth.tsx (no slug guessed).
- events table has no branding_opportunity_id; the "Brand event here" CTA stores the
  opportunity in event_goals + required_services. Add a column later if desired.
- Some role-based nav only defines buyer/vendor keys; planner/client see the default.
