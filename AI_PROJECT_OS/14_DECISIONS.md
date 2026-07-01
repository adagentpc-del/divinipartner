# 14 Decisions

Architectural and business decision log. Do not relitigate these without recording a superseding decision. Format: date / decision / reasoning / alternatives / long-term implication.

---

## D1 - Flag-gated rollout for Pricing V2

- Date: 2026-06-24
- Decision: Ship the entire new pricing model behind `PRICING_V2` (server) and `VITE_PRICING_V2` (SPA build-time), with runtime auto-adopt from `/api/payments/processors`. Flip is paired with a deploy.
- Reasoning: Lets the new money model be fully built, typechecked, QA'd, and merged while the live site keeps running the legacy model. Flip and rollback are a single env change plus redeploy.
- Alternatives considered: Hard cutover branch (riskier, no instant rollback); long-lived feature branch (merge pain, drift).
- Long-term: Once V2 is stable and the legacy path is removed, the flag and the dual-path logic should be retired to reduce complexity.

## D2 - On-top fee model (fee added to the client, vendor made whole)

- Date: 2026-06-24
- Decision: The 5% platform fee is added ON TOP of the vendor subtotal. Vendor receives the full quote; the client pays subtotal + fee.
- Reasoning: Transparency to the client and zero erosion of vendor earnings reduce resistance and disputes. The math is provably safe (vendor never shorted; platform never pays out more than it earns).
- Alternatives considered: Carving the fee out of the vendor payout (legacy V1 tiered model); percentage off the top of gross.
- Long-term: Pure, dependency-free math in `server/src/lib/pricingMath.ts` is the single source of truth and is unit-tested; reuse it everywhere money is computed.

## D3 - Venue revenue share = 20% of the platform fee

- Date: 2026-06-24
- Decision: The hosting venue earns 20% of the platform fee (1% of gross at a 5% fee), out of the platform's cut, scaling with booking size, with no cap. Replaces the legacy "1% of gross capped at 50% of fee."
- Reasoning: Simpler to explain, scales cleanly, can never exceed the fee, and gives venues a direct incentive to route GMV on-platform. No self-dealing (venue never earns on its own payments).
- Alternatives considered: Flat $100/$100/$50 by tier (breaks on small deals); 1% of gross with a 50% cap (V1).
- Long-term: Venue share recorded per transaction in the `venue_revenue_share` ledger; paid out only when a live Stripe key is set.

## D4 - Native email/password auth (replaced Authentik OIDC)

- Date: mid-June 2026
- Decision: Replace Authentik OIDC with native auth: scrypt password hashing, jose HS256 session JWT delivered as an httpOnly cookie and a bearer token. No JWKS/issuer/audience checks remain.
- Reasoning: Removes an external dependency and the HTTPS/PKCE constraints of the OIDC flow; simpler self-hosted operation; admin authority centralized in `ADMIN_ALLOWED_EMAILS`.
- Alternatives considered: Keeping Authentik OIDC (PKCE requires secure context, added an external moving part).
- Long-term: `SESSION_SECRET` is a fail-closed production secret. Some legacy docs/comments still mention Authentik; the code is the source of truth.

## D5 - Local-first storage, S3 optional

- Date: 2026-06-24
- Decision: Default to local-disk storage for launch; allow any S3-compatible provider via self-signed SigV4 (no AWS SDK), with optional AES-256-GCM encryption at rest and HMAC-signed download URLs.
- Reasoning: Ship without cloud-storage setup; keep the option open for sensitive vendor documents; avoid SDK lock-in and weight.
- Alternatives considered: Cloud storage mandatory from day one; bundling the AWS SDK.
- Long-term: Move to S3 + bucket versioning + encryption before scaling. Back up the encryption key separately; losing it loses the data.

## D6 - Fail-closed production secrets

- Date: 2026-06-24
- Decision: In production, the process throws at startup if `SESSION_SECRET` or `DOWNLOAD_URL_SECRET` is unset, empty, or the known dev fallback. An empty CORS allowlist in production denies cross-origin requests.
- Reasoning: A forgeable session or download URL, or a wide-open CORS policy, is worse than a refused boot. Make misconfiguration loud and safe.
- Alternatives considered: Warn-and-continue (silent insecurity).
- Long-term: Operators must provision secrets and origins before deploy; documented in `23_DEPLOYMENT.md` and `24_ENVIRONMENTS.md`.

## D7 - Defer the live Stripe key

- Date: 2026-06-24
- Decision: Go live on V2 with `STRIPE_SECRET_KEY` unset. Payouts and venue share are recorded but queue-only; no real funds move until the key is set.
- Reasoning: Validate the model and records in production without financial risk; gate real money behind legal sign-off and a confirmed Stripe Connect "we do not hold funds" posture.
- Alternatives considered: Going live with money movement immediately.
- Long-term: Enable only after counsel reviews Terms/policies and the Connect flow is confirmed (see `52_COMPLIANCE.md`).

> TODO(owner): Record future decisions here as they are made (each new architectural choice gets an entry).
