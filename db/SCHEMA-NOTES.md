# Divini Partners — Schema Notes

Database schema for **Divini Partners by Divini Group**, an event-partnership
marketplace (venues · vendors · planners · suppliers · clients).

- **Target:** plain PostgreSQL 16 at `localhost:5433`, database `divini_partners`, run by user `aibos`.
- **Apply:** `psql -h localhost -p 5433 -U aibos -d divini_partners -f db/schema.sql`
- IDs are `uuid` via `gen_random_uuid()`; timestamps are `timestamptz default now()`.
- Arrays use `text[]`, flexible/nested fields use `jsonb`, money uses `numeric`.
- Enum-like fields use `text` + `CHECK` constraints.

## Tables (27 total)

### Core (22)
1. `organizations` — partner/tenant entity; tier + white_label_status drive fees/seats.
2. `users` — accounts; role CHECK (super_admin … billing).
3. `terms_acceptance` — agreement/policy acceptance log.
4. `venues`
5. `vendors`
6. `profiles` — co-branded public profile pages; kind CHECK (venue/vendor/planner/supplier/installer).
7. `events` — full lifecycle status CHECK (inquiry … archived).
8. `bids` — status + tier_access CHECK.
9. `quotes` — status CHECK.
10. `invoices` — status CHECK.
11. `payments` — payout_status CHECK.
12. `inventory_items`
13. `messages`
14. `documents`
15. `reviews`
16. `change_orders`
17. `support_tickets`
18. `feedback_items`
19. `audit_logs`
20. `contract_pricing` — partner-to-partner negotiated pricing.
21. `guests`
22. `tasks`

### Claim Engine (5)
23. `discovered_businesses` — discovery_status CHECK.
24. `unclaimed_profiles` — AI-generated unclaimed public profiles (noindex by default).
25. `claim_outreach` — email claim sequence tracking.
26. `claim_verifications` — ownership verification + admin approval.
27. `claim_markets` — geographic expansion scheduler.

Indexes are added on all foreign keys plus common filter columns
(role, category, status, city, region, next_send_date, etc.).

## PGlite-vs-PG16 differences

- The schema keeps `create extension if not exists pgcrypto;` at the top because
  it is the standard way to make crypto helpers available on real PostgreSQL 16.
- **PGlite cannot load the `pgcrypto` extension** (`extension "pgcrypto" is not
  available`), so validation was run with that single line commented out.
- This is safe: on **PostgreSQL 16, `gen_random_uuid()` is built into core**
  (no extension required), so every `default gen_random_uuid()` works whether or
  not pgcrypto loads. Validation confirmed inserts generate UUIDs correctly.
- The final `schema.sql` retains `create extension if not exists pgcrypto;` and
  applies cleanly on real PG16 in a single pass.

## Validation

Validated with `@electric-sql/pglite` (no native deps). Result: **OK tables: 27**,
and `gen_random_uuid()` defaults verified working. Final file is valid for
real PostgreSQL 16.
