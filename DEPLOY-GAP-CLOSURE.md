# Divini Partners — Gap-Closure Deploy Runbook (Jun 18)

New since last deploy: platform_revenue accrual + auto-commission/leakage, Divini-Score
matching, opportunity auto-close + relationship rebuild, Stripe Connect payout rail,
profile decks + programs. All additive. NOT an auth cutover.

New schema (all folded into db/apply-all.sql, idempotent):
schema-rev-accrual.sql, schema-lifecycle.sql, schema-connect-payouts.sql,
schema-profile-decks-programs.sql

## 1. MAC terminal — push code (NEVER sync .env.local)
rsync -avz --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist*' --exclude '.env.local' \
  ~/Claude/Projects/OpenAD/sites/divini-partners/ \
  root@SERVER:/root/sites/divini-partners/

## 2. SERVER web console — apply schema (idempotent, safe to re-run)
docker exec -i divini_partners_db psql -U aibos -d divini_partners < /root/sites/divini-partners/db/apply-all.sql

## 3. SERVER web console — build + restart
cd /root/sites/divini-partners && bash deploy.sh
pm2 restart divini-partners --update-env

## 4. SERVER — smoke
curl -s localhost:PORT/api/healthz
curl -s -o /dev/null -w "%{http_code}\n" localhost:PORT/api/platform-revenue/summary   # expect 401 (gated)
curl -s -o /dev/null -w "%{http_code}\n" https://divinipartners.com/                    # expect 200

## Notes
- STRIPE_SECRET_KEY stays UNSET for now -> payout release stays queue-only (no money moves). Set it server-side in .env.local when ready.
- Hard-refresh the browser to see new nav tabs (Decks & Programs, Payout Bank, My Payouts, Connect Payouts).
- If SSH throttles after rapid repeats, space out / restart fail2ban.
