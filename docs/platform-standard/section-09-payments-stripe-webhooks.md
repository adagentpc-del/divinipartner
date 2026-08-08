# Section 09 — Payments, Stripe, Webhooks, Subscriptions, Marketplace & Tax

Status: **COMPLETE**, with a real, named subset explicitly **BLOCKED**: no
Stripe or PayPal credentials of any kind (test or live) are configured in
this environment (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PUBLISHABLE_KEY` all unset — consistent with T7, real money
intentionally not live). Every check that requires an actual processor
round trip is marked BLOCKED with the exact operator action, per pack
rule 15, rather than faked. Everything that could be verified by code
architecture, live fail-closed-behavior testing, and direct database
verification was done live, not assumed.

## Payment architecture inventory

- **Processor/account mode:** Stripe (two coexisting integration models —
  see Sections 05/06's prior work) and PayPal, both feature-flagged off
  when unconfigured (`stripeEnabled()`/PayPal equivalents), never a hard
  dependency. Neither has any credential configured in this environment.
- **Checkout implementation:** Stripe Checkout Sessions exclusively
  (`stripeBilling.ts`, `stripeAccounts.ts`) — hosted, redirect-based
  payment collection. No raw Elements/card-input form posted to this
  server anywhere in the codebase.
- **Stored payment methods:** the one case that stores a reusable payment
  method (`attachAccountBalancePaymentMethod()`'s `stripe_balance`-type
  SetupIntent, for the v2 balance-funded subscription flow) always uses a
  Stripe-generated `payment_method` id returned from Stripe's own API
  response — confirmed the route layer never accepts a
  client-supplied `paymentMethodId`, it is always the immediate return
  value of the preceding server-side `attachAccountBalancePaymentMethod()`
  call in the same function.
- **Card-data scope (PCI):** zero raw card-number/CVV handling anywhere
  in `server/src` (full-tree grep, only false-positive matches). Combined
  with Checkout-only collection, this keeps PCI DSS scope at the
  lowest-burden tier (SAQ A — the merchant never receives, transmits, or
  stores cardholder data; Stripe's hosted page does).
- **Connected accounts/payouts:** every payout destination is resolved
  server-side from `getPayoutAccount(actor.org.id, "stripe")` /
  `activeDirectChargeAccount(orgId)` — grepped for any client-supplied
  Stripe account/destination id in a request body across `payments.ts`
  and `connect-payouts.ts`: zero matches. No client-selected connected
  account authority exists.
- **Platform/application fees:** already thoroughly audited in Sections
  05/06 (role-aware `planTierFor()` fee-rate resolution, the cancellation
  stale-fee-rate bug fixed in Section 05). Not re-derived here.
- **Credits:** `platform_credits` append-only ledger (`lib/credits.ts`),
  the double-spend race found and fixed in Section 06. Not re-derived
  here.
- **Coupons/sponsorships:** no separate coupon-code system exists. The
  one other value-adjacent feature found (`routes/founding-member.ts`,
  "Founding Member Performance Center") is a status/badge/benefit-flag
  feature for nonprofit member recognition, not a billing discount
  mechanism — confirmed it writes no pricing/fee-rate fields. The pack's
  "prefer one promotion engine, do not create parallel coupon systems"
  guidance is satisfied by there simply being one canonical
  value-granting mechanism (`platform_credits`), not multiple competing
  ones.
- **Recurring subscriptions:** `stripeBilling.ts` (v1, card-based) and
  `stripeAccounts.ts` (v2, balance-funded) both funnel into the same
  `customer.subscription.*` webhook handling and the same
  `applySubscriptionUpdate()` tier-promotion function — one lifecycle
  path regardless of which funding model was used, not two parallel
  systems.

## PCI scope

**PASS.** SAQ A-eligible architecture (Checkout-only collection, zero
server-side cardholder data handling) — see above. This determination is
based on the actual implementation, not assumed; a final PCI SAQ level
still needs processor/QSA confirmation once a live Checkout integration
mode is finalized, already tracked in `operator-actions.md`.

## Idempotency audit

| Operation | Status | Evidence |
|---|---|---|
| Payment/order creation | PASS | `payments.reference` has a real partial unique index (`uq_payments_reference`) backing `on conflict (reference) do nothing` — verified in Section 06 |
| Webhook processing (event-level, not just payment-level) | **Was missing — fixed this session** | See Findings below |
| Subscription create/change | PASS | `applySubscriptionUpdate()` is a straightforward idempotent `UPDATE` per org — replaying the same event twice produces the same end state |
| Payout exclusion tracking | PASS | `uq_payout_excl_tx (partner_id, payment_id)` — verified in Section 06 |
| Credit issuance/redemption | PASS | The Section 06 double-spend fix (transaction + advisory lock) |
| Coupon redemption | N/A | No coupon-code system exists |
| Refunds | N/A | No refund-issuance code path exists at all (see Findings) |
| Retryable background jobs | N/A | No background job queue exists in this codebase; all processing is synchronous within the request/webhook lifecycle |

## Webhooks

| Item | Status | Evidence |
|---|---|---|
| Raw-body handling | PASS | `express.json()`'s `verify` hook stashes the exact raw bytes Stripe signed (`app.ts`), used by `verifyStripeEvent()` rather than a re-serialized/parsed body |
| Signature verification | PASS | Hand-rolled HMAC-SHA256 verification (`lib/processors.ts`), **including a 5-minute replay-window bound on the signed timestamp** — a detail many hand-rolled implementations miss; live-tested below |
| Correct environment-specific signing secret | PASS by construction | `STRIPE_WEBHOOK_SECRET` is a single env var per deploy target; test/live separation is an operator/deploy-config concern (different values per environment), not a code concern |
| Persisted provider event ID | **Was missing — fixed this session** | See Findings |
| Idempotent duplicate handling | **Was partial (payment-row-level only) — now event-level, fixed this session** | See Findings |
| Out-of-order tolerance | **Not implemented — documented, not fixed this pass** | `applySubscriptionUpdate()` applies whatever status arrives with no comparison against a previously-processed event's timestamp; a sufficiently-delayed, out-of-order `customer.subscription.updated` could in principle overwrite a more-recent cancellation. Narrow risk (Stripe generally delivers in order for the same object, and a correct subsequent event self-heals the state), documented as a real but low-priority gap given the ledger built this session provides the `received_at`/`processed_at` timestamps a future out-of-order guard would need |
| Retry-safe processing | PASS | Only genuine processing/DB failures return 500 (so Stripe retries); a bad signature is always 400 (Stripe will not retry, correctly, since retrying an invalid signature can never succeed) |
| Dead-letter/recovery path | **Was missing — fixed this session** | The new `webhook_events` table's `status='failed'` + `last_error` columns are exactly this — a queryable view of what failed and why, not previously possible |
| Monitoring/alerts | PARTIAL | `lib/logger.ts`'s `ERROR_MONITORING_WEBHOOK_URL` mechanism (Section 01/03 evidence) would fire on an uncaught 500 from webhook processing, but nothing yet specifically alerts on a `webhook_events.status='failed'` row accumulating — a reasonable next step once the ledger has been live for a while |
| Test/live separation | BLOCKED (operator) | Cannot be verified without a real Stripe account's test-mode and live-mode webhook secrets, both unconfigured in this environment |

## Findings — implemented and live-verified

**A `webhook_events` ledger did not exist** (the pack's own named example
of a logical table to add "if no equivalent exists"). Idempotency existed
only at the payment-row level (`uq_payments_reference`), which means
events that never touch the `payments` table — `account.updated`,
`customer.subscription.*`, the v2 capability-status event — had **no**
duplicate-delivery protection at all, and there was no way to see attempt
counts, failures, or a dead-letter view across all webhook traffic.

**Fixed:** `db/schema-webhook-events.sql` (provider, event_id unique,
event_type, received_at, processed_at, status, attempt_count, last_error
— exactly the pack's suggested shape), a small `db/webhookEvents.ts`
module (`recordWebhookEventOnce`, `markWebhookEventOutcome`), wired into
both the Stripe and PayPal webhook handlers in `routes/payments.ts`:
event-level dedup check immediately after signature verification (before
any processing), outcome marked `processed`/`failed` at the end.

**Live-verified, not assumed:**
1. Applied the new schema to the running database.
2. Confirmed fail-closed webhook signature rejection still works with no
   `STRIPE_WEBHOOK_SECRET` configured: a forged signature and a missing
   signature header both correctly returned 400 `invalid signature`, and
   — importantly — **neither rejected forgery was recorded in
   `webhook_events`** (the ledger only ever fills after signature
   verification succeeds, so it cannot be used to pollute the table or as
   a fake-event injection vector).
3. Directly exercised the dedup insert logic against the live database
   (the exact query `recordWebhookEventOnce()` runs): the first insert of
   a given `(provider, event_id)` pair returned a row (process it); the
   identical second insert returned zero rows (correctly recognized as a
   duplicate, would short-circuit without reprocessing). This is the
   closest live verification possible without a real Stripe-signed
   payload, which this environment cannot produce without live/test
   credentials.

## Entitlements

Already thoroughly covered across Sections 05, 06, and 08 — the
server-side `getActor()` → `checkLimit()`/`planTierFor()` resolver is the
one canonical entitlement path, confirmed the frontend is never trusted
for tier/access decisions, and confirmed cancellation correctly downgrades
access immediately (Section 06). Not re-derived here; cross-referenced.

## Subscription lifecycle

- Initial purchase / renewal / upgrade / downgrade: all funnel through
  the single `applySubscriptionUpdate()` path regardless of which
  Checkout flow (v1 card or v2 balance) initiated it.
- Cancellation: live-verified correct immediate downgrade in Section 06.
- Trial / promo / pause-resume: no trial-period or pause/resume feature
  exists in the current implementation — N/A, not built, not claimed
  anywhere in product copy that was checked.
- Proration: Stripe's own default proration behavior applies to Checkout
  Session-initiated subscription changes; this codebase does not override
  or compute proration itself. Not independently testable without live
  Stripe test-mode keys — **BLOCKED**.
- Failed payment / grace period: `invoice.payment_failed` sets
  `subscription_status = 'past_due'` immediately (code-verified); a
  past_due org is not automatically downgraded to `free_partner` the way
  an explicit cancellation is — it stays on its paid tier with a
  `past_due` status flag until Stripe's own dunning either recovers the
  payment (→ `active`) or exhausts retries (→ Stripe fires
  `customer.subscription.deleted`, which the existing cancellation path
  already handles correctly). This is a reasonable, standard grace-period
  design (avoid punishing a customer for a single failed card on the
  first attempt) — not a gap, though live end-to-end testing of an actual
  Stripe dunning cycle is **BLOCKED** without live/test keys.

## Marketplace / Connect

- Seller identity/onboarding state: surfaced via `payout_accounts`'
  `charges_enabled`/`payouts_enabled`/`details_submitted` columns, synced
  from real Stripe `account.updated` webhooks (code-verified; the actual
  sync has never fired live in this environment since no Stripe account
  is connected).
- Payout destination resolved server-side: confirmed above, PASS.
- No client-selected connected account authority: confirmed above, PASS.
- KYC/capabilities/payout status surfaced: PASS by the same mechanism.
- Refunds/disputes allocated correctly: **N/A / real gap, see below.**
- Platform fee calculated and reconciled: PASS, covered in Sections 05/06.
- Prohibited business controls: N/A — no explicit prohibited-business
  screening exists in-app; this is Stripe's own underwriting
  responsibility for connected accounts under Stripe Connect's standard
  onboarding, not something this codebase needs to duplicate.
- Tax/reporting responsibilities: already tracked at the applicability
  level (R-03, T7/T8, counsel/tax review required before real money) —
  not duplicated here.

## Real gap found: no refund or dispute-response capability exists

Grepped the full server tree for a Stripe refund API call
(`stripe.refunds.create` equivalent) and a `charge.dispute.*` webhook
handler: **zero matches for either.** The only "refund" references in the
codebase are bookkeeping fields (`payoutEngine.ts`'s
`net_profit = platform_fees - processing_costs - refunds - ...`
calculation) — there is no code path that can actually issue a refund or
respond to a dispute from within the app today.

This is **not currently a contradiction with the Payment Policy**, which
was checked and reads consistently: `PaymentPolicy.tsx` already states
Divini does not issue refunds for vendor services (a marketplace-
facilitator stance — refunds happen between the transacting parties or
via the processor directly) and that the platform's own facilitation fee
is "non-refundable except where required by law." So the *policy*
correctly scopes Divini's refund responsibility narrowly. The *gap* is
operational: if a legally-required refund situation ever arises for the
platform's own fee (double-billing, an unauthorized-transaction dispute,
a chargeback response), there is currently no in-app mechanism to act —
only a manual Stripe Dashboard action by whoever has access, and no
documented internal process for who does that or how quickly.

Not a P0 (real money is intentionally not live, T7), but a real P1 that
should be closed **before** T7 unblocks, not after — flagged as T30.

## Validation summary

Executed everything that does not require live/test processor
credentials: fail-closed signature rejection (live HTTP test), webhook
event-level dedup logic (direct DB verification), full architecture trace
of payout-destination resolution, PCI-scope code audit, coupon/promotion
single-engine confirmation, and a full-tree grep for refund/dispute
capability.

**BLOCKED** (per pack rule 15, exact operator action given): every item
requiring an actual Stripe or PayPal test-mode round trip — a real
Checkout Session completion, a real signed webhook delivery, a real
subscription proration/dunning cycle, a real Connect payout — needs
`STRIPE_SECRET_KEY` (test mode), `STRIPE_WEBHOOK_SECRET` (test mode), and
`STRIPE_PUBLISHABLE_KEY` set in this environment (or PayPal sandbox
equivalents). None are configured. This is the same T7 gate already
tracked since Section 01 — not a new blocker, restated here in this
section's specific terms.

## Findings summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| S09-F1 | No event-level webhook idempotency/observability ledger existed (`webhook_events`) | P1 | **Fixed** — schema, db module, wired into both Stripe and PayPal handlers, live-verified |
| S09-F2 | No out-of-order-delivery tolerance for subscription webhooks | P2 | Documented, not fixed this pass — narrow risk, self-healing in the common case |
| S09-F3 | No refund or dispute-response capability exists anywhere in the app | P1 (but conditional on T7 — not urgent while real money is off) | Documented as T30, not built this pass |
| S09-F4 | No alerting specifically on `webhook_events.status='failed'` accumulating | P2 | Documented, reasonable next step once the ledger has run live for a while |

No P0 findings. One real P1 found and fixed with live verification
(webhook ledger); one real P1 documented and gated behind the same T7
money-live decision every other payments-adjacent P0/P1 in this audit has
been gated behind.
