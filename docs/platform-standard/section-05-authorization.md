# Section 05 — Authorization, RBAC/ABAC, RLS, Tenancy, Admin & Impersonation

Status: **COMPLETE**. Live adversarial testing performed against a running
server with two independently registered test organizations, plus a full
code audit of every route that accepts a client-supplied id that could name
another tenant's object.

## Architecture summary

- **No Postgres Row-Level Security exists anywhere in the schema**
  (`grep -ni "row level security\|row-level security\|enable row\|create policy"
  db/apply-all.sql` — zero matches). All authorization is application-layer:
  every route resolves `actor = await db.getActor(auth.userId, auth.email)`
  from the verified session (never from client input), then every DB read/
  write is scoped by `actor.org.id` / `actor.user.id`. `getActor()`
  (`server/src/db.ts:164-171`) always derives the org via a server-side join
  on `users.organization_id` — the client cannot select which org it acts as
  except through the explicit, membership-checked `/orgs/switch` endpoint.
- **No admin impersonation / "view as" feature exists in this codebase.**
  Searched `server/src` for `impersonat|viewAs|actAs` (and the looser
  `act.as` pattern) — no real matches; the loose pattern's hits were false
  positives (unrelated `.act(...)` / `.as` substrings). This subsection of
  the pack is **N/A** for this product.
- Found and fixed one **inaccurate privacy claim**: `src/pages/Privacy.tsx`
  said data was protected by "database row-level security," which
  overstated the mechanism — no Postgres RLS is in use. Reworded to
  accurately describe the real control ("access controls that scope every
  request to your account and organization").

## Live adversarial test matrix

Two independent client-role organizations (Org A, Org B) were registered
end-to-end through the real HTTP registration flow (`POST /api/register`,
CSRF-protected, session-cookie auth) — not seeded directly in the DB. Org A
created real resources; Org B's authenticated session then attempted to
read/write them.

| # | Test | Endpoint | Result |
|---|---|---|---|
| 1 | Cross-tenant event read | `GET /api/events/:id` (Org B → Org A's event) | **403** `no access to event` |
| 2 | Cross-tenant event write | `PATCH /api/events/:id` (Org B renaming Org A's event) | **403**, event unchanged (confirmed via Org A re-fetch) |
| 3 | Cross-tenant status transition | `POST /api/events/:id/status` (valid status) | **403** `no access to event` |
| 4 | Cross-tenant vendor-attach (forged ownership) | `POST /api/events/:id/vendors` (Org B attaching itself to Org A's event) | **403** `no access to event` |
| 5 | Cross-tenant bid invite | `POST /api/bids/:id/invite` (Org B inviting orgs to Org A's bid) | **403** `only the event owner can invite vendors` |
| 6 | Cross-tenant bid status change | `POST /api/bids/:id/status` (Org B awarding Org A's bid) | **403** `only the event owner can change bid status` |
| 7 | Cross-tenant quote read | `GET /api/quotes/:id` (Org B → Org A's quote) | **403** `no access to event` |
| 8 | Cross-tenant quote PDF | `GET /api/quotes/:id/pdf` | **403** |
| 9 | Cross-tenant quote write | `PATCH /api/quotes/:id` (Org B rewriting line items) | **403** `no access to event` |
| 10 | Cross-tenant invoice read | `GET /api/invoices/:id` (Org B → Org A's invoice) | **404** `not found` (org-scoped lookup, not a leaked 403) |
| 11 | Cross-tenant invoice listing | `GET /api/invoices` as Org B | Returns `{"invoices":[]}` — Org A's invoice never appears |
| 12 | Forged org-switch (membership spoof) | `POST /api/orgs/switch` with Org A's `organizationId` while authenticated as Org B | **403** `not a member of that organization` |
| 13 | Forged admin flag (retest of S04-11 in this section's frame) | `getAuth()`'s `isAdmin` | Computed server-side from `ADMIN_ALLOWED_EMAILS` against the verified session email — never a client-supplied claim; admin routes additionally require TOTP enrollment (`requireAdmin`, `server/src/auth.ts:140-169`) |

All 13 checks passed. No cross-tenant read, cross-tenant write, or
privilege-escalation path was found.

## Code audit: client-supplied ownership ids

Searched every route file for a client-supplied `organization_id` /
`user_id` / `owner_id` / `role` used to select or authorize a write. Found
exactly two legitimate uses, both already covered by the live tests above:

- `POST /api/bids/:id/invite` (`organization_ids[]`) — inviting vendor orgs
  to a bid you already own. `bids.inviteVendors()` checks
  `actorOwnsBidEvent()` before using the invited ids; the ids passed in only
  ever grant the **named orgs** visibility into the bid, never the caller.
- `POST /api/events/:id/vendors` (`organization_id`) — attaching a vendor
  org to an event you already own. `events.addEventVendor()` checks
  `actorOwns()` first, same pattern.

No route reads `req.body.role`, `req.body.isAdmin`, or any other
privilege-bearing field from client input outside the one-time
`POST /api/register` flow (which only ever creates a **new** org for the
calling user — it cannot modify an existing org's role or grant admin).

## Document / signed-URL access (IDOR)

- `server/src/routes/signatures.ts` `GET /:id/pdf` — object id in the URL,
  but access is gated by `isParty = (actor.org.id === row.organization_id)
  || row.signer_user_id === actor.user.id` before the file is streamed.
  Non-parties get 403, not the file.
- `server/src/routes/profile-decks-programs.ts` `GET /decks/:id/download`
  — scoped by `extras.getDeck(ctx.actor.org.id, req.params.id)`; a deck
  belonging to a different org resolves to 404, never 403-with-info-leak or
  a stream.
- **Minor finding (P2, code hygiene, not exploitable):**
  `server/src/lib/objectStorage.ts` exports `signDownloadUrl` /
  `verifyDownloadUrl` (HMAC-signed, TTL-bound, timing-safe-compared
  presigned download links) but no route in `server/src/routes.ts` actually
  mounts a `/api/documents/download` endpoint that calls
  `verifyDownloadUrl` — the only reference outside the two lib files is a
  stale comment in `server/src/db/profile-extras.ts`. This is dead code,
  not a live vulnerability (nothing serves files through it), but it should
  be removed or wired up so a future developer doesn't assume a working
  signed-URL download path exists. Tracked as a task-queue item, not
  fixed in this pass (out of scope: removing exported library functions
  without confirming there are truly zero other call sites deserves its own
  change, not a drive-by deletion mid-audit).

## Cancelled-subscription-retains-premium-access

Traced the full lifecycle in `server/src/db.ts`'s `applySubscriptionUpdate()`
(the only place a paid tier is ever promoted or downgraded, called
exclusively from the Stripe `customer.subscription.*` webhook handlers in
`server/src/routes/payments.ts`):

- `status === "canceled" | "unpaid" | "incomplete_expired"` →
  `tier = 'free_partner'` is set **immediately**, in the same transaction,
  with no grace-period residue.
- `lib/entitlements.ts`'s `isTopTier()` / `isPlusTier()` / `checkLimit()`
  read `org.tier` fresh on every request (never cached), so Pro/Plus-gated
  features stop being reachable on the very next request after
  cancellation.
- **Result: PASS** — no cancelled org retains premium access.

One **billing-correctness observation** (not an authorization finding, out
of Section 05's scope, noted for the future payments-focused section): the
cancellation branch hardcodes `platform_fee_rate = TIERS.free_partner.feeRate`
(0.05) instead of going through the same role-aware `planTierFor()` lookup
the "active" branch uses. For a `client`-role org (whose plan catalog entry
has `platformFeeRate: null` at every level), this leaves a stale/incorrect
value in the informational `organizations.platform_fee_rate` column after
cancellation. Traced whether this value is actually used to compute a real
charge: it is not — `createInvoice()` computes the fee fresh from the live
tier at invoice time (`feeRateForTier()` under the legacy path, or a flat
`PLATFORM_FEE_RATE_V2` under Pricing V2), never from the cached column. So
this is stale-data hygiene, not a live overcharge/undercharge bug. Flagged
for whoever next touches billing.

## Findings summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| S05-F1 | Privacy Policy overstated "row-level security" (none exists) | P1 (accuracy) | **Fixed** same session — `src/pages/Privacy.tsx` reworded |
| S05-F2 | Dead code: unused presigned-download-URL mechanism in `objectStorage.ts` | P2 (hygiene) | Documented, tracked as a task, not removed this pass |
| S05-F3 | Cancellation sets a stale `platform_fee_rate` column for role catalogs with `platformFeeRate: null` (client role) | P2 (billing hygiene, not exploitable — value unused at charge time) | Documented, tracked as a task |

No P0 findings. No cross-tenant or privilege-escalation failure was found
in this section.
