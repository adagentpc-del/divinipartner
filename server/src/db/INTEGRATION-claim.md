# Divini Partners - Claim Your Profile automation engine integration

This file tells the integrator how to wire the Claim Engine in. All new code is
self-contained in the files listed below; no protected file was edited
(App.tsx, server/src/routes.ts, server/src/db.ts, server/src/pool.ts,
db/schema.sql, and other agents' files were left untouched). The integrator makes
the small mounting edits described here.

ZERO em dashes anywhere in this project (hard rule).

## 1. Database - apply the schema addendum

The core claim tables already exist in `db/schema.sql`:
`discovered_businesses`, `unclaimed_profiles`, `claim_outreach`,
`claim_verifications`, `claim_markets`.

`db/schema-claim.sql` is purely additive (only `add column if not exists` and
`create table/index if not exists`). Apply it after `db/schema.sql`:

```
psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-claim.sql
```

Additions in `db/schema-claim.sql`:

| Object | Purpose |
| --- | --- |
| `discovered_businesses.+confidence_band, confidence_inputs, duplicate_of, duplicate_reason, market_id, do_not_contact, notes` | Scoring detail, duplicate linkage, market tagging, do-not-contact flag. |
| `unclaimed_profiles.+claimed_organization_id, claimed_at, archived` | Links a claimed profile to its new org; archive flag. |
| `claim_outreach.+cadence, stop_reason, email_body` | Cadence (weekly/monthly/stopped), stop reason, rendered body. |
| `claim_verifications.+verification_code, code_expires_at, agreement_version, full_name, claimant_role` | Code verification + claimant detail. |
| `claim_suppression` (new table) | Suppression list. Any matching email/domain stops all outreach. Reasons: unsubscribe, removal_request, do_not_contact, bounce, manual. |

## 2. Backend - mount the router

Edit `server/src/routes.ts` (integration-time edit, allowed):

```ts
import claim from "./routes/claim.js";
// ...
router.use("/claim", claim);
```

That mounts everything under `/api/claim`.

### Public routes (no auth)

| Method | Full path | Description |
| --- | --- | --- |
| GET | `/api/claim/profile/:slug` | Public unclaimed profile JSON. Includes the `banner` object (`unclaimed: true`, `label`, `attribution`, and `verified/preferred/partnered: false`). 404 if claimed, removed, archived, or missing. |
| POST | `/api/claim/removal-request` | Take a listing down. Body: `{ slug, email?, reason? }`. Marks removal, stops outreach, suppresses the email, archives the business. |
| POST | `/api/claim/unsubscribe` | Stop outreach for an email. Body: `{ email, slug? }`. Adds an unsubscribe suppression. |
| POST | `/api/claim/verify` | Start a claim. Body: `{ slug, fullName, role, businessEmail, agreementAccepted }`. Returns `{ verificationId, method, autoVerified, codeIssued, maskedEmail }`. |
| POST | `/api/claim/verify/confirm` | Confirm a claim and convert to Free Partner. Body: `{ slug, code? }`. Requires a signed-in user to create the org (otherwise 401). |

### Admin routes (requireAdmin)

| Method | Full path | Description |
| --- | --- | --- |
| GET | `/api/claim/admin/metrics` | Dashboard metrics (discovered, created, pending, claimed, verified, conversionRate, emailsSent, bounces, unsubscribes, removals, duplicates, reviewQueue, topCategories, topCities). |
| GET | `/api/claim/admin/queue` | Discovery review queue (status `discovered`). |
| GET | `/api/claim/admin/businesses?status=&category=&region=` | List discovered businesses. |
| POST | `/api/claim/admin/discover` | Ingest admin-provided rows. Body: `{ rows: BusinessInput[], marketId? }`. Scores, de-dupes, and creates profiles above threshold. Returns `{ outcomes, summary }`. |
| POST | `/api/claim/admin/businesses/:id/status` | Status transition. Body: `{ status, notes? }`. |
| PATCH | `/api/claim/admin/businesses/:id` | Edit business fields. |
| POST | `/api/claim/admin/businesses/:id/do-not-contact` | Mark do-not-contact + suppress its email. |
| POST | `/api/claim/admin/businesses/:id/merge` | Mark as duplicate. Body: `{ duplicateOf, reason? }`. |
| PATCH | `/api/claim/admin/profiles/:id` | Edit a profile. Body: `{ description?, tags?, logoUrl?, noindex? }`. |
| POST | `/api/claim/admin/profiles/:id/approve` | Approve an unclaimed profile. |
| POST | `/api/claim/admin/profiles/:id/archive` | Archive a profile + stop outreach. |
| POST | `/api/claim/admin/profiles/:id/send-email` | Send the next claim email (STUB; records `claim_outreach`, returns preview). Honors suppression, claimed/removed/archived, and the 6-send cap. |
| POST | `/api/claim/admin/profiles/:id/pause` | Pause outreach. |
| POST | `/api/claim/admin/profiles/:id/manual-approve` | Admin approve a manual claim. Body: `{ ownerSub, ownerEmail? }`. |
| GET | `/api/claim/admin/markets` | List markets. |
| POST | `/api/claim/admin/markets` | Create/upsert a market. |
| POST | `/api/claim/admin/markets/:id/status` | Set market status. Body: `{ status }`. |
| GET | `/api/claim/admin/markets/plan` | Pure geographic expansion plan (South Florida -> all Florida -> next markets). |
| POST | `/api/claim/admin/markets/advance` | Open the next planned market per the rollout. |
| GET | `/api/claim/admin/suppression` | List suppression entries. |
| POST | `/api/claim/admin/suppression` | Add a suppression. Body: `{ email?, domain?, reason? }`. |
| DELETE | `/api/claim/admin/suppression/:id` | Remove a suppression. |

### Safety + behavior notes

- No live scraping in this build. The discovery pipeline is deterministic and
  source-safe: an admin supplies rows from publicly available information and the
  pipeline scores, de-dupes, generates a safe description + tags
  (`ai_suggested pending owner verification`), and creates profiles only at or
  above the confidence threshold (70). It NEVER invents pricing, availability,
  capacity, insurance, or certifications.
- Confidence bands follow the addendum: 90+ high, 70-89 / 50-69 review, <50
  reject. Only score >= 70 auto-creates a public profile.
- Outreach cadence: weekly for steps 1-4, monthly thereafter, hard stop after 6
  sends unless reactivated. Every email carries the compliance footer
  (unsubscribe link, removal link, sender identity). Sending is a STUB.
- Suppression is authoritative and checked before any send.
- Conversion uses the existing `db.registerOrganization` to create a Free Partner
  org and `linkClaimedOrganization` to attach the profile.

## 3. Frontend - add routes

Edit `src/App.tsx` (integration-time edit, allowed). Imports:

```ts
import UnclaimedProfile from './pages/claim/UnclaimedProfile';
import ClaimVerify from './pages/claim/ClaimVerify';
import ClaimEngineAdmin from './pages/admin/ClaimEngineAdmin';
```

Routes:

| Component | Route path | Auth | Notes |
| --- | --- | --- | --- |
| `UnclaimedProfile` | `/claim/:slug` | public | Public unclaimed profile page with the required banner and the CTAs Claim This Profile / Request Removal / Report Incorrect Information. |
| `ClaimVerify` | `/claim/:slug/verify` | public (sign-in prompted to finish) | Claim verification: full name, role, business email, code, agreement checkbox. |
| `ClaimEngineAdmin` | `/admin/claim-engine` | admin | Super Admin console. Self-gates on `isAdmin` from the auth context. |

Example additions to the `<Routes>` block in `App.tsx`:

```tsx
{/* public claim pages (one element each, slug via useParams) */}
<Route path="/claim/:slug" element={<UnclaimedProfile />} />
<Route path="/claim/:slug/verify" element={<ClaimVerify />} />

{/* admin console (component self-gates on isAdmin) */}
<Route path="/admin/claim-engine" element={<ClaimEngineAdmin />} />
```

The Super Admin dashboard already has a "Claim Engine" nav item; point its
"Configure engine" button at `/admin/claim-engine`.

## 4. SEO rules

- Unclaimed profiles are created with `noindex_status = true`. The public profile
  endpoint returns `noindex: true` so the page renderer can emit a
  `<meta name="robots" content="noindex">` tag until the profile is claimed.
- The public page clearly states it is unclaimed and generated from publicly
  available information, and never implies verified, preferred, or partnered
  status. The `banner` payload exposes `verified/preferred/partnered: false`.
- On claim, `linkClaimedOrganization` sets `noindex_status = false`.

## 5. Files created by the Claim Engine

Backend:
- `db/schema-claim.sql`
- `server/src/db/claim.ts`
- `server/src/lib/discovery.ts`
- `server/src/lib/claim-emails.ts`
- `server/src/lib/claim-verify.ts`
- `server/src/routes/claim.ts`
- `server/src/db/INTEGRATION-claim.md` (this file)

Frontend:
- `src/pages/claim/UnclaimedProfile.tsx`
- `src/pages/claim/ClaimVerify.tsx`
- `src/pages/admin/ClaimEngineAdmin.tsx`

No protected file was modified.
