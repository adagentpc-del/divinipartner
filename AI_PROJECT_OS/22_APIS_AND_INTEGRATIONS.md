# 22 APIs and Integrations

## Internal API

- All backend endpoints are mounted under `/api` by `server/src/routes.ts`, which wires ~115 sub-routers from `server/src/routes/*`.
- Pipeline (from `server/src/app.ts`): security headers -> CORS (deny-by-default in prod) -> body parsing (raw body kept for webhook HMAC) -> auth middleware -> `/api` rate limit -> tighter `/api/auth` rate limit -> router -> error handler.
- Guards: `requireUser` and `requireAdmin` derive from `getAuth(req)` (`server/src/auth.ts`). `isAdmin` = email in `ADMIN_ALLOWED_EMAILS`.

### Notable routers (by area)

- Auth: `auth-native.ts` (register, verify-email, login, forgot/reset, resend) under `/api/auth`.
- Money: `payments.ts`, `featured.ts`, `fees.ts`, `platform-revenue.ts`, `revenue-center.ts`, `payouts.ts`, `connect-payouts.ts`, `invoices.ts`, `quotes.ts`, `quote-approvals.ts`, `bids.ts`.
- Marketplace: `marketplace.ts`, `events.ts`, `packages.ts`, `profiles.ts`, `recommend.ts`, `leads.ts`.
- Intelligence: `coo.ts`, `command-center.ts`, `divini-score.ts`, `playbooks.ts`, `relationship.ts`, `partnership-match.ts`, `marketplace-intel.ts`, `pricing-intel.ts`, `revenue-intel.ts`, `event-war-room.ts`, `event-memory.ts`.
- Nonprofit: `fundraising-events.ts`, `sponsorships.ts`, `sponsor-portal.ts`, `donations.ts`, `auction.ts`, `volunteer.ts`, `ticket-packages.ts`.
- Compliance: `compliance.ts`, `compliance-privacy.ts`, `signatures.ts`, `contracts.ts`, `disputes.ts`, `audit-log.ts`.
- Ops: `sitemap.ts`, `test-email.ts`, `email-track.ts`, `support.ts`.

### Health and flags

- Health endpoint: `/api/healthz` (returns 200 `{ ok: true }`) - used by `deploy.sh` and smoke tests.
- Pricing flag exposure: `/api/payments/processors` reports `pricing_v2:true/false` so the SPA can auto-adopt the flag at runtime.

> TODO(owner): If a full endpoint catalog (method + path + auth + payload) is needed, generate it from `server/src/routes/*` and link it here.

## External integrations

### Stripe (payments + Connect payouts) - key-gated

- `server/src/lib/stripe-connect.ts`, `server/src/lib/payoutEngine.ts`, `server/src/routes/connect-payouts.ts`, `server/src/routes/payments.ts`.
- Intended posture: Stripe Connect so funds settle to the vendor; the platform takes only an application fee ("we do not hold funds").
- Gated by `STRIPE_SECRET_KEY`. Unset = payouts/venue share queue-only, records correct, no money moves.
- Webhooks verify HMAC against the raw request body captured in `app.ts`.
- TWO Connect account shapes coexist (added 2026-08-03), selected per-org by which onboarding path they completed (`payout_accounts.stripe_api_version`):
  - **v1 Express, destination charge** (original, `lib/processors.ts` + `lib/stripe-connect.ts`): the charge is created on the PLATFORM's own account; `transfer_data.destination` + `application_fee_amount` auto-split the net out to the vendor at charge time. The platform is technically the merchant of record for the charge.
  - **Accounts v2, direct charge** (`server/src/lib/stripeAccounts.ts`): a connected account is configured as BOTH a merchant (accepts payments run "as" that account via the `Stripe-Account` header, with `payment_intent_data.application_fee_amount` skimming the platform's cut -- no `transfer_data` needed, since nothing needs to be transferred out) AND a platform customer (can pay the org's own Divini Partners subscription fee straight from its Stripe balance via `POST /api/payments/connect/stripe/subscribe-from-balance`, no separate card needed -- an alternative to the existing card-based path in `lib/stripeBilling.ts`, which is unchanged and still fully supported). The connected account is unambiguously the merchant of record, better matching the "we do not hold funds" posture in `52_COMPLIANCE.md`.
  - New v2 routes: `POST /connect/stripe/merchant-account/onboard`, `GET /connect/stripe/merchant-account/refresh`, `POST /connect/stripe/subscribe-from-balance` (all under `/api/payments`, `requireUser`). `routes/payments.ts`'s `/checkout` route checks for an active v2 account first (preferred, newer path), falling back to the v1 destination-charge path unchanged for already-onboarded vendors -- fully backward compatible, no forced re-onboarding.
  - **Not live-verified**: built and typechecked without a real Stripe test-mode secret key available in the build environment (`STRIPE_SECRET_KEY` is intentionally unset per T7 in `12_TASK_QUEUE.md`), so no actual Stripe API call was exercised. Verify against Stripe TEST mode with a real key before relying on this anywhere that matters -- see `.env.local.example` for how to get test keys and forward webhooks locally with the Stripe CLI.

### PayPal - key-gated

- Referenced as a payment option in the monetization/processors layer. Gated by keys; not the primary rail. (Stripe Connect is the documented go-live rail.)
- > TODO(owner): Confirm whether PayPal is wired for this app specifically or inherited from the shared playbook. Stripe is the documented rail in the go-live runbook.

### Email (Resend, or Postal) - key-gated

- HTTP-based, no SMTP. `server/src/lib/email.ts`. Configured via `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` (and `POSTAL_API_URL` for postal). Unconfigured = sends logged and skipped. DNS needs SPF/DKIM/DMARC for the `EMAIL_FROM` domain.

### Object storage (S3-compatible) - optional

- `server/src/lib/objectStorage.ts` + `s3sigv4.ts`. Any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2, MinIO) via self-signed SigV4 (no AWS SDK). Optional AES-256-GCM encryption at rest. Falls back to local disk if unconfigured. See `OBJECT-STORAGE.md`.

### GeoIP

- `server/src/lib/geoip.ts` + `scripts/fetch-geoip.sh` for geolocation enrichment.

### LLM

- `server/src/lib/llm.ts` backs AI features (quote assist, COO briefing, etc.).
- > TODO(owner): Document which LLM provider/key the live deployment uses and how it is gated.

## Auth surface (summary)

- Native email/password. Session = jose HS256 JWT (cookie `divini_session` + bearer). Keyed by `SESSION_SECRET`. See `04_SYSTEM_ARCHITECTURE.md` and `51_SECURITY.md`.
