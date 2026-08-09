# ALFY2 Pack — Section 12: Core Product Engines

**Scope**: Profiles, Organizations (incl. multi-org/switcher), Admin (platform
admin + admin-manage listings/agreements), Products/Services (Packages,
Inventory), Calendar (availability + .ics feed), Video (venue "twin"
interactive tours — there is no video-conferencing feature; see Section 01's
applicability note), and Documents (compliance/COI/W-9/e-sign).

**Status**: PASS, with one real, live-traced P1 defect found and fixed
(organization platform-fee-rate mis-stamped at creation for three roles), plus
a matching data backfill for any already-created rows. No P0s. No open items
after this section's fixes.

**Method note (scope honesty)**: this is a route-by-route and db-layer audit
of the code paths that back these features — every route file listed above
was read in full, authorization/tenant-scoping was traced into the
corresponding `server/src/db*.ts` functions, and the one defect found was
live-verified numerically (see Evidence below) against the actual
`lib/planCatalog.ts` catalog data, not just read and assumed correct. It is
not an exhaustive line-by-line audit of every db-layer helper behind all ~12
route files (well over 1,400 lines of route code alone, backed by
correspondingly more db-layer code) — a genuinely complete audit of that
surface is a multi-day undertaking on its own. The areas actually inspected
are listed under Findings below; anything not explicitly called out there was
not part of this pass.

## Findings

### F1 — Organization `platform_fee_rate` stamped from the flat tier table instead of the role-aware catalog (FIXED, P1)

**What was wrong.** `server/src/db.ts` has three places that write
`organizations.platform_fee_rate` at row-creation/update time:

1. `applySubscriptionUpdate()` (Stripe webhook, subscription lifecycle) —
   already used the correct role-aware lookup: `planTierFor(orgType,
   tier)?.platformFeeRate ?? 0`, falling back to the flat `TIERS[tier].feeRate`
   only when the org's role has no catalog entry. This was fixed under
   Section 05 (T25) in an earlier pass of this audit.
2. `registerOrganization()` (first-time signup, called from `POST
   /register`) — used the flat `TIERS[tier].feeRate` directly. **Not fixed
   by T25.**
3. `addOrganization()` (adding a second/third org to an existing user, called
   from `POST /api/orgs`) — same flat lookup. **Not fixed by T25.**

`lib/planCatalog.ts`'s `PLAN_CATALOG` gives every tier of the `client`,
`installer`, and `sponsor` roles `platformFeeRate: null` (meaning 0%) — those
roles either pay the platform directly (client), get paid via job/payroll
tracking rather than a marketplace transaction cut (installer), or pay a flat
subscription for sponsorship matching rather than a percentage cut
(sponsor). The flat `TIERS` table, by contrast, has no concept of role: it
gives every org on the `free_partner`/`partner`/`premier` tier a generic
5%/2.5%/1% fee regardless of role, because it was written for the
transaction-cut roles (venue/vendor/supplier/planner) and never updated when
the null-fee roles were added to the catalog.

**Concrete impact.** `src/pages/GetStarted.tsx`'s `tierEnumForLevel(role,
level)` (the client's registration-tier chooser) sends `tier: 'client'` only
for `role === 'client'`; every other role at the free/level-0 tier — including
`installer` and `sponsor` — sends `tier: 'free_partner'`. So an installer or
sponsor registering on the free tier, or a client/installer/sponsor adding a
second org via the org switcher, got `platform_fee_rate = 0.05` (5%) baked
into their `organizations` row at creation, instead of the `0` their role's
own plan catalog specifies. (A `client` registering directly through
`GetStarted.tsx` was unaffected in practice, because that flow already sends
the literal `tier: 'client'` value, which happens to have `TIERS.client.feeRate
=== 0` — the bug was reachable specifically through `installer`/`sponsor` at
any tier, and through `addOrganization` for `client` too since that path
defaults to `free_partner` when no tier is passed.)

This is the exact same class of bug already found and fixed in Section 05
(T25) for the cancellation path — found again here, live, in two more
call sites the earlier fix didn't reach, because it was scoped to
`applySubscriptionUpdate` only at the time.

**Fix applied** (`server/src/db.ts`):
- `registerOrganization()`: now computes `const roleTier =
  planTierFor(payload.role, tier); const feeRate = roleTier ?
  roleTier.platformFeeRate ?? 0 : TIERS[tier].feeRate;` — identical pattern to
  the already-correct `applySubscriptionUpdate`.
- `addOrganization()`: same fix, using `payload.role`.

**Backfill for any rows already created wrong** (`db/schema-fix-org-fee-rates.sql`,
also appended to `db/apply-all.sql`): an idempotent `update organizations set
platform_fee_rate = 0 where type in ('client','installer','sponsor') and
platform_fee_rate is distinct from 0`. This only touches the three affected
roles — venue/vendor/supplier/planner are never touched, because their
catalog rate already matches the flat table exactly at every tier (see
Evidence). **This backfill has not been run against any live database from
this session** (no database was reachable in this execution environment — see
Evidence) and needs to be applied by the operator via `db/apply-all.sql` (or
running `db/schema-fix-org-fee-rates.sql` standalone) against staging/
production before or shortly after this fix ships. Tracked as an operator
action below.

**Evidence.** Numeric live-trace of the actual fix logic against the real
`lib/planCatalog.ts` catalog (compiled `dist/`, not re-derived by hand),
across every role × every tier level:

```
client     client       feeRate=0        (unchanged, TIERS.client already 0)
client     free_partner feeRate=0        (was 0.05 via addOrganization's default-tier path -- FIXED)
client     partner      feeRate=0        (was 0.025 -- FIXED)
client     premier      feeRate=0        (was 0.01 -- FIXED)
installer  client       feeRate=0        (unchanged path)
installer  free_partner feeRate=0        (was 0.05 -- FIXED, this is GetStarted's actual free-tier submission)
installer  partner      feeRate=0        (was 0.025 -- FIXED)
installer  premier      feeRate=0        (was 0.01 -- FIXED)
sponsor    free_partner feeRate=0        (was 0.05 -- FIXED, GetStarted's actual free-tier submission)
sponsor    partner      feeRate=0        (was 0.025 -- FIXED)
sponsor    premier      feeRate=0        (was 0.01 -- FIXED)
venue      free_partner feeRate=0.05     (unchanged -- catalog matches flat table exactly)
venue      partner      feeRate=0.025    (unchanged)
venue      premier      feeRate=0.01     (unchanged)
vendor / supplier / planner              (all unchanged, same as venue -- catalog matches flat table)
```

This confirms both halves of the fix: the three affected roles now correctly
resolve to 0, and every other role's fee is byte-for-byte unchanged (zero
regression risk for the majority of org types, which is the expected
behavior since venue/vendor/supplier/planner's catalog entries were always
consistent with the flat table).

`npm run lint` (0 errors), `npm --prefix server run build` (clean), `npm
test` (72/72) all re-run clean after this fix — see Regression below.

### Areas inspected and found sound (no fix needed)

- **`orgs.ts` / multi-org switcher** (`GET /mine`, `POST /`, `POST /switch`):
  `switchActiveOrganization` verifies `organization_memberships` before
  allowing a switch — a user can never switch into an org they don't belong
  to. Traced.
- **`profiles.ts`** (418 lines, full file read): every authed route resolves
  the org via `getActor`/`requireOrg` and scopes all reads/writes to
  `ctx.actor.org.id`; the AI-extraction routes correctly log to the Section
  08 `ai_run_audit` trail; file uploads go through the same
  validate-magic-bytes-scan-then-store pipeline used elsewhere in the app;
  the only unauthenticated route (`GET /public/:slug`) explicitly returns
  nothing for unpublished profiles.
- **`POST /profile/transfer-owner`**: deliberately checked whether the
  "any org member can transfer ownership" authorization model is a
  privilege-escalation risk given the multi-org membership system built
  earlier in this platform's history — it is not. `organization_memberships`
  is a one-human-many-orgs ledger (a single person who runs more than one
  business), not a many-humans-one-org team model; `team_seats` (the actual
  team-collaboration feature) is billing/seat-count only and never creates a
  second login-capable user pointed at an existing org's
  `organization_id`. So "the caller's active org matches" is equivalent to
  "the caller is the org's one attached owner," which is the documented,
  correct design for this single-owner membership model.
- **`admin.ts`**: router-level `requireAdmin` gates every route; every
  mutating route calls `logAction` with before/after state.
- **`admin-manage.ts`** (leading ~400 lines read): router-level
  `requireAdmin`; parameterized SQL throughout (`$1`/`$2` placeholders, no
  string-interpolated queries); agreement math (`clientTotalCents`) is a pure
  read-time computation, nothing stored pre-computed to drift. One minor,
  non-blocking note: the `creatorEmail` notification at line ~143 interpolates
  `businessName`/`contactEmail` (admin-submitted, not attacker-reachable by an
  untrusted party) directly into an HTML email body with no escaping — low
  severity (admin-only input, email-body-only, not rendered in-app) and not
  fixed in this pass; noted for a future pass if admin-submitted business
  names ever become attacker-influenced (e.g. if listing creation is ever
  exposed beyond admins).
- **`packages.ts`** (full file, 103 lines): every route resolves org via
  `getActor`, `POST /` correctly checks `checkLimit` (Section-06/plan-catalog
  entitlements) before creating.
- **`calendar.ts` + `db/calendar.ts`**: `updateCalendarEvent`/
  `deleteCalendarEvent` scope every mutation with `where id = $1 and
  organization_id = $2`; `publicAvailability` (the one public, unauthenticated
  route) returns only merged busy windows — start/end/status, never
  title/description/kind, matching its doc comment; the `.ics` feed token is
  `crypto.randomBytes(24)` (192 bits), not a predictable value;
  `requestHold` validates that a supplied `event_id` is visible to the
  caller before attaching a hold to it.
- **`compliance.ts` + `db/compliance.ts`** (the actual "documents" feature —
  COI/W-9/e-sign; `event/tabs/DocumentsTab.tsx` in the SPA is a bid-package/
  scope-builder tool, not a file manager, despite its name — see the content
  note below): `listDocuments` scopes to `organization_id or owner_id` unless
  the caller is an admin; `setDocApproval` requires admin; `deleteAvailability`
  checks the record's `organization_id` against the caller's; `createDocument`
  stamps `owner_id`/`organization_id` from the actor, never from a
  client-supplied field, so a caller cannot create a document under a
  different org.
- **`venue-twin.ts`** (the "video" subsection — an interactive/photo virtual
  venue-tour builder, not video-conferencing; Section 01 already correctly
  scoped true video-conferencing as N/A since no such integration exists):
  router-level `requireUser`, standard actor-scoped route shape matching the
  rest of the app.

### Minor content-quality note (not fixed, not a defect)

`DocumentsTab.tsx`'s empty state says "Uploaded files such as contracts and
certificates of insurance are managed in the shared document library" — there
is no page literally named "document library"; the real feature is the
Compliance page (`/compliance`, `compliance.ts`/`db/compliance.ts`, confirmed
to exist and work above). The sentence isn't a broken link (there is no link,
just prose) and is directionally accurate, so this is a Section-11-style
content-polish note, not a functional gap. Left as-is; flag for a future
copy pass if it causes real user confusion.

## Operator Actions

- **Run the fee-rate backfill** (`db/schema-fix-org-fee-rates.sql`, also in
  `db/apply-all.sql`) against staging and production once this change
  deploys. Idempotent — safe to run any number of times, and it is a no-op if
  no `client`/`installer`/`sponsor` org currently has a nonzero
  `platform_fee_rate`. No database was reachable from this execution
  environment to check whether any live rows are currently affected, so this
  should be treated as "run it, it's a safe no-op either way" rather than
  something requiring investigation first.

## Regression

- `npm run lint`: 0 errors (44 pre-existing warnings, unchanged)
- `npm run build` (SPA): clean
- `npm --prefix server run build`: clean
- `npm test`: 72/72 passing
- Fix logic live-verified numerically against the compiled `lib/planCatalog.ts`
  (see Evidence above) — a real database was not reachable in this execution
  environment, so this was verified at the pure-function level (the exact
  computation both fixed call sites now perform) rather than via an
  end-to-end registration request against a running Postgres instance.
