# 21 Database

## Engine and access

- PostgreSQL 16 in production, running in a Docker container on the droplet (`divini_partners_db`, user `aibos`, db `divini_partners`).
- Access from the app is a Postgres pool (`server/src/pool.ts`) with hand-written SQL in `server/src/db.ts`, `server/src/db/*`, and route modules. No heavy ORM in the hot path.
- Conventions (from `db/SCHEMA-NOTES.md`): UUID ids via `gen_random_uuid()`; `timestamptz default now()`; `text[]` arrays; `jsonb` for nested data; `numeric` for money; enums as `text` + `CHECK`.

## Migration approach

- The deploy source of truth is `db/apply-all.sql`: a consolidated, idempotent (`create table if not exists ...`) schema assembled from the per-domain schema files. It is applied on every deploy and is safe to re-run.
- On a fresh database, apply it twice to resolve cross-file foreign-key ordering (parents-first is approximated; the second pass fills any forward references).
- One-time data migrations are separate files run once, notably `db/schema-pricing-v2-migrate.sql` (moves all orgs to free + flat `platform_fee_rate=0.05`).
- Apply on the server (web console), never from the Mac:
  ```
  docker exec -i divini_partners_db psql -U aibos -d divini_partners < db/apply-all.sql
  ```
- Take a snapshot before any one-time migration:
  ```
  docker exec divini_partners_db pg_dump -U aibos divini_partners > ~/divini_partners_preV2.sql
  ```

Note: `db/SCHEMA-NOTES.md` documents an earlier local-validation setup (Postgres on port 5433, `db/schema.sql`, original 27-table core). For deployment use `apply-all.sql` against the Docker container. Trust `apply-all.sql`.

## Scale

- ~133 `create table` statements in `apply-all.sql`. (Point-in-time; refresh when the schema changes.)

## Major table domains

- Identity / orgs: `users`, `organizations`.
- Marketplace core: `events`, `bids`, `quotes`, `invoices`, `packages`, `profiles`, `marketplace*`.
- Money and ledgers (key):
  - `platform_revenue` - per-transaction platform fee ledger. Under V2, `fee_cents` = 5% of subtotal, plus venue-share columns.
  - `venue_revenue_share` - venue's 20%-of-fee share per booking.
  - `featured_placements` - Featured Vendor subscriptions (`price_cents = 4900`, status, period, stripe_ref).
  - `partner_commissions`, `partner_payouts` - referral commissions and payouts.
  - `leakage_events` - off-platform circumvention / fee-owed tracking.
- Payouts / Connect: payout-accounts, payouts (`server/src/db/payouts.ts`, `payout-accounts.ts`).
- Intelligence: Divini Score, playbooks, relationship, opportunity, war room, event memory, member/attendee, business health, market intel.
- Venue intelligence: venue-twin, venue-compare, venue metrics/restrictions.
- Nonprofit / fundraising: `fundraising_events`, `auction_bids`, sponsorship, donor, volunteer, sponsor-purchases, tickets.
- Vendor teams: vendor-team, account assignments, intake routing, vendor compliance/requirements/readiness/scorecard.
- Compliance / legal: compliance, compliance-privacy, signatures, contracts, change orders, disputes.
- Engagement: messages, reviews, feedback, email-events, campaigns, invites, claim engine (discovered_businesses, unclaimed_profiles, claim_outreach/verifications/markets).

## Ledger invariants (must hold under V2)

- `platform_revenue.fee` per transaction = round(subtotal * 0.05).
- vendor net = full subtotal (vendor made whole).
- `venue_revenue_share` row = round(fee * 0.20), never exceeds the fee.
- These are enforced by `server/src/lib/pricingMath.ts` and verified by `tests/pricingMath.test.ts`.

> TODO(owner): If a full table-by-table data dictionary is needed, generate it from `db/apply-all.sql` and link it here.
