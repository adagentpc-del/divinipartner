# 05 Business Context

Sources: Divini-Partners-Monetization.md, Divini-Partners-Pricing-V2-Plan.md, Divini-Platform-Audit.html, and the live code.

## Who pays and how the platform earns

The platform monetizes the money that flows through it plus a small set of optional add-ons.

### Pricing V2 (current target model, flag-gated, not yet flipped)

- Transaction fee: flat 5% added on top of the vendor's price. Vendor made whole; client pays subtotal + 5%; platform keeps the 5%. This is the primary revenue engine.
- Venue revenue share: 20% of the platform fee (1% of gross) paid to the venue that hosts the booking. Comes out of the platform's cut, scales with booking size, never flat. No self-dealing (a venue never earns on its own payments). Excludes subscriptions and off-platform payments.
- Featured Vendor: $49/mo advertising upgrade.
- Additional seats: $10/mo for extra seats (venues and vendors; 1 included free).
- Sponsorships: presenting / gold / silver / bronze / in-kind / vendor packages.
- Event tickets: individual / VIP / table / sponsor-table.
- Donations (nonprofit module).
- Leakage recovery: fee owed when a transaction is taken off-platform (anti-circumvention).
- White-label: future ($499-$999/mo), not required for launch.

Canonical profit identity (V2):
`platform_net = platform_fee - venue_share - processing_cost - referral_split`
With no live Stripe key, processing cost is effectively $0 and the vendor is made whole, so on a 5% fee the venue gets 1% of gross and the platform keeps ~4% of gross.

### Legacy model (V1, what is live today)

Two stacking engines: subscription tiers plus per-transaction fees, where a higher subscription tier bought a lower transaction fee.

| Tier | Monthly | Txn fee | Bid access |
|---|---|---|---|
| Client / Event Booker | $0 | 0% | n/a |
| Free Partner | $0 | 5% | 7d+ after posting |
| Partner | $45/mo | 2.5% | 48h-7d window |
| Premier | $99/mo | 1% | 0-48h (first look) |

V1 seat add-on was $5/seat/mo. V1 venue share was 1% of gross capped at 50% of the platform fee. V2 removes tiers and bid windows, makes everyone free, switches the fee to on-top 5%, raises seats to $10, and changes the venue share basis to 20% of the fee with no cap.

## Why this model

- On-top fee keeps vendors whole and makes the platform cost transparent to the client, which reduces resistance versus carving the fee out of the vendor's earnings.
- Free signup for all roles removes onboarding friction (the audit and conversion-loop work pushed toward eliminating friction).
- The venue revenue share gives venues a direct financial reason to route transactions on-platform, which feeds GMV and the data moat.

## Revenue and cost lines (reference)

- Revenue: transaction fees, seat add-ons, Featured Vendor, sponsorships, tickets, donations, (future) white-label, leakage recovery.
- Costs/payouts: payment processing cost, referral partner commissions (to `partner_commissions`), venue revenue share, payouts to vendors (Stripe Connect).

## Audit context

- Divini-Platform-Audit.html, Divini-Conversion-Loop-Audit.html, and Divini-Deployment-Audit.html are interactive audit/checklist deliverables covering the platform, the conversion/money loop, and deployment readiness. Treat them as the authoritative external review snapshots.

> TODO(owner): If there are concrete go-to-market or revenue targets, customer counts, or unit-economics goals beyond the pricing model, capture them here. The reviewed docs define the model but not numeric business targets.
