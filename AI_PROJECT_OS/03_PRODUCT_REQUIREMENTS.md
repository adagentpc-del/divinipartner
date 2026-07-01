# 03 Product Requirements

This is a working summary of what the product must do, with emphasis on the Pricing V2 money model that is the current center of gravity. Sources: Divini-Partners-Pricing-V2-Plan.md, Divini-Partners-PricingV2-Flip-Runbook.md, Divini-Partners-PricingV2-QA-Report.md, Divini-Partners-Monetization.md, and the live code.

## Roles

- Client / event booker: posts events, receives quotes, pays. Free.
- Venue: hosts events, free with 1 seat included, earns a share of every booking it hosts.
- Vendor: supplies services, free with 1 seat included, quotes and bids on work.
- Planner: coordinates events and partners.
- Installer, Sponsor, Nonprofit: additional roles supported by dedicated dashboards.
- Super-admin: platform operator (adagentpc@gmail.com is the sole super-admin per memory and `ADMIN_ALLOWED_EMAILS`).

## Pricing V2 model (locked decisions, flag-gated)

- All roles sign up free. No subscription tiers (the legacy Free Partner / Partner / Premier tiers are removed from fee logic).
- Transaction fee: flat 5%, added ON TOP of the vendor's price.
  - Vendor receives the full quoted subtotal (made whole).
  - Client pays subtotal + 5%.
  - Platform keeps the 5%.
- Venue revenue share: 20% of the platform fee (which equals 1% of gross at a 5% fee). Scales with every booking; never a flat amount. The legacy 50%-of-fee cap is dropped under V2.
- Featured Vendor: $49/mo advertising upgrade (top placement, badge, homepage feature, preferred matching). Stored as `featured_placements.price_cents = 4900`.
- Additional seats: $10/mo per extra seat for venues and vendors (1 seat included free). `SEAT_PRICE_USD` becomes $10 under V2 (was $5 in V1).
- No bid-access windows. All vendors can see and bid on all work (the tiered 0-48h / 48h-7d / 7d+ windows are removed).
- Sponsorships module is kept as-is.
- White-label: future, $499-$999/mo, not required for launch.

### On-top fee math (single source of truth)

Implemented in `server/src/lib/pricingMath.ts` (pure, dependency-free):

```
platformFee  = round(subtotal * 0.05)
clientTotal  = subtotal + platformFee
vendorPayout = subtotal              (vendor made whole)
venueShare   = round(platformFee * 0.20)
```

Worked examples (from the QA report, all verified):

| Vendor quote | Client pays | Platform fee | Vendor gets | Venue share | Platform net |
|---|---|---|---|---|---|
| $5,000 | $5,250 | $250 | $5,000 | $50 | $200 |
| $2,000 | $2,100 | $100 | $2,000 | $20 | $80 |
| $750 | $787.50 | $37.50 | $750 | $7.50 | $30 |
| $1,234.56 | $1,296.29 | $61.73 | $1,234.56 | $12.35 | $49.38 |
| $99.99 | $104.99 | $5.00 | $99.99 | $1.00 | $4.00 |

The inverse (`decomposeGrossOnTop`) recovers subtotal and fee from a gross client total: `subtotal = gross / (1 + rate)`. No processing fee is carved from the vendor under V2.

## Core functional requirements

- Marketplace discovery: venues, vendors, packages, categories; public profiles.
- Events: post events, event workspace, readiness, risk rollup, war room, memory/insights.
- Quotes and bids: draft quotes, AI quote assist, auto-quote, bids without tier windows, multi-stage quote approval.
- Money flow: quote -> approval -> checkout -> invoice -> payment, with the platform fee shown as a line item ("Platform fee (5%)") and the vendor's full quote shown.
- Ledgers: `platform_revenue` (fee per transaction) and `venue_revenue_share` (20% of fee).
- Payouts: Stripe Connect, admin 1-click; queue-only until a live Stripe key is set.
- Leakage / anti-circumvention: detect off-platform circumvention, compute fee owed.
- Intelligence: AI COO, Divini Score, playbooks, relationship graph, partnership matching, marketplace/pricing intel.
- Nonprofit / fundraising: events, tiered sponsorship packages, sponsor portal, tickets, donations.
- Vendor teams: internal teams, sub-roles, account ownership, intake routing.
- Legal: Terms plus five policies, reachable as pages (see `52_COMPLIANCE.md`).

## Acceptance criteria for the V2 flip (must all hold before/at flip)

- Server tsc clean, SPA tsc clean, Vite build clean. (Verified 2026-06-24.)
- Money math QA passes across a sweep of booking sizes (vendor never shorted; platform never pays out more than it earned). (Verified.)
- Schema applied via `db/apply-all.sql`; one-time data migration via `db/schema-pricing-v2-migrate.sql`.
- Public copy reads "Event Commerce Infrastructure"; no tier picker at registration.
- Quote/checkout/invoice show the 5% line and the vendor's full quote.
- A live test booking writes correct `platform_revenue` and `venue_revenue_share` rows.

See `12_TASK_QUEUE.md` for the remaining go-live items and `23_DEPLOYMENT.md` for the flip procedure.
