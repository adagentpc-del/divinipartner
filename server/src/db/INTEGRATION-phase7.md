# Phase 7 Integration - Reviews, Trust, Intelligence, Templates

Reviews + Trust Scores, Starred / Preferred Vendors, AI Next-Best-Action,
Recommendation Engine, Risk + Budget Intelligence, and reusable Event Templates
+ event history memory (blueprint sections 25, 26, 27, 28).

All Phase 7 code lives in NEW files. The two wiring edits below are the only
changes a maintainer makes to existing files (server route index + SPA router);
they were intentionally left for the integration owner so this phase touches no
other agent's files.

---

## 1. Database

Apply AFTER `db/schema.sql` and earlier phase files:

```
psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase7.sql
```

### schema-phase7.sql additions

Extends `reviews` (additive columns):
- `organization_id`, `reviewer_org_id`, `reviewee_org_id` (uuid)
- `relationship` (text), `target_type` (text), `target_id` (uuid)
- `vendor_id`, `venue_id` (uuid)
- `is_public` (boolean), `requested_at`, `submitted_at`, `updated_at` (timestamptz)
- indexes: `idx_reviews_org`, `idx_reviews_target`, `idx_reviews_relationship`, `idx_reviews_status`

New tables:
- `starred_vendors` - org stars another org (unique per organization_id + vendor_org_id)
- `event_templates` - reusable event blueprints (categories, checklist jsonb, budget_skeleton jsonb, is_global)
- `event_history` - completed-event summaries (categories[], vendor_org_ids[], summary jsonb, outcome)
- `nba_dismissals` - optional per-user dismissed next-best-action keys

---

## 2. Backend - new files

Data-access (`server/src/db/`):
- `reviews.ts` - review relationships + criteria sets + CRUD + request lifecycle + `computeTrustForOrg`
- `starred.ts` - starred vendors CRUD + `detectRepeatRelationships(orgId, threshold?)`
- `templates.ts` - templates CRUD + event history list/record + `templateFromHistory` (duplicate event)

Pure libraries (`server/src/lib/`):
- `trust.ts` - `computeTrustScore(targetType, inputs)`, `averageRating` (deterministic, no DB)
- `nextbestaction.ts` - `buildNextBestActions(snapshot)` (deterministic ranking)
- `recommend.ts` - `scoreVendorMatch` / `rankVendorMatches`, `buildEventScope`, `buildBudget`, `compareQuotes`, `detectRisks`

Routers (`server/src/routes/`):
- `reviews.ts` -> mount at `/reviews`
- `intelligence.ts` -> mount at `/intelligence`
- `templates.ts` -> mount at `/templates`
- `starred.ts` -> mount at `/starred`

### Routes (method + full path)

Reviews (`/api/reviews`):
- `GET    /api/reviews/meta` - relationships + criteria sets
- `GET    /api/reviews` - reviews the acting org wrote
- `GET    /api/reviews/received` - reviews about the acting org
- `GET    /api/reviews/requests` - pending review requests for the acting user
- `GET    /api/reviews/for/:targetType/:targetId` - published reviews for a target
- `POST   /api/reviews` - submit a review
- `POST   /api/reviews/request` - open a review request
- `POST   /api/reviews/:id/submit` - fill in a requested review

Intelligence (`/api/intelligence`):
- `GET    /api/intelligence/next-best-action` - ranked per-role action prompts
- `POST   /api/intelligence/scope-builder` - description -> structured scope
- `POST   /api/intelligence/recommendations` - rank vendor candidates for criteria
- `POST   /api/intelligence/budget` - budget report + quote comparison
- `POST   /api/intelligence/risk` - risk signals for an event
- `GET    /api/intelligence/trust` - the acting org's trust score
- `GET    /api/intelligence/trust/:targetType/:orgId` - a specific org's trust score

Templates + history (`/api/templates`):
- `GET    /api/templates` - templates visible to the org (own + global)
- `GET    /api/templates/history` - event history memory
- `POST   /api/templates/history` - record a completed-event summary
- `POST   /api/templates/history/:id/duplicate` - duplicate a past event into a template
- `GET    /api/templates/:id` - single template
- `POST   /api/templates` - create a template
- `PATCH  /api/templates/:id` - update a template
- `DELETE /api/templates/:id` - delete a template

Starred / preferred (`/api/starred`):
- `GET    /api/starred` - orgs this org has starred
- `GET    /api/starred/repeat-prompts` - repeat-relationship prompts
- `POST   /api/starred` - star a partner org
- `DELETE /api/starred/:vendorOrgId` - unstar a partner org

### Wire into server/src/routes.ts

Add imports and mounts (in the marked sections; do not otherwise edit the file):

```ts
import reviews from "./routes/reviews.js";
import intelligence from "./routes/intelligence.js";
import templates from "./routes/templates.js";
import starred from "./routes/starred.js";

router.use("/reviews", reviews);
router.use("/intelligence", intelligence);
router.use("/templates", templates);
router.use("/starred", starred);
```

---

## 3. Frontend - new files

Pages:
- `src/pages/reviews/Reviews.tsx` -> route `/reviews`
- `src/pages/intelligence/EventScopeBuilder.tsx` -> route `/scope-builder`
- `src/pages/intelligence/Recommendations.tsx` -> route `/recommendations`
- `src/pages/templates/EventTemplates.tsx` -> route `/templates`

Reusable widgets (no required props; embed anywhere):
- `src/components/NextBestActions.tsx` - default export; fetches
  `/api/intelligence/next-best-action` and renders ranked action cards. Embed at
  the top of EVERY role dashboard (VenueDashboard, VendorDashboard,
  ClientDashboard, PlannerDashboard, InstallerDashboard, SuperAdminDashboard) in
  place of the current static `PromptStrip` / `dpdash-nba` block.
- `src/components/TrustBadge.tsx` - default export; props `{ score, label?, size? }`.
  Embed on vendor/venue/client cards, public profiles, the Recommendations page
  (already wired), and dashboard headers to show the org's own trust score.

### Wire into src/App.tsx

Import the pages and add routes (do not otherwise edit App.tsx):

```tsx
import Reviews from './pages/reviews/Reviews';
import EventScopeBuilder from './pages/intelligence/EventScopeBuilder';
import Recommendations from './pages/intelligence/Recommendations';
import EventTemplates from './pages/templates/EventTemplates';

// inside <Routes> (app, signed-in):
<Route path="/reviews" element={<Reviews />} />
<Route path="/scope-builder" element={<EventScopeBuilder />} />
<Route path="/recommendations" element={<Recommendations />} />
<Route path="/templates" element={<EventTemplates />} />
```

Note: the next-best-action `link` values returned by the API point at these SPA
routes (`/reviews`, `/templates`, `/scope-builder`, `/recommendations`) plus
`/app` and `/invoices`, so adding the routes above makes the action cards
navigable.

### Embedding the widgets in dashboards

The dashboards live in `src/pages/dashboards/` (owned by another agent / not
edited here). To adopt the live widgets, replace the static `PromptStrip` /
`<section className="dpdash-nba">` block with `<NextBestActions />` and add a
`<TrustBadge score={trust} label="Trust" />` near the dashboard header. Both are
default exports with no required wiring beyond an authenticated session and the
React Router context already provided by App.tsx.

---

## 4. Design + correctness notes

- Brand: emerald `#123c2e` / gold `#C9A35B` / ivory `#F7F4EE`, Cormorant + Inter.
  Every component ships self-contained `<style>` blocks.
- ZERO em dashes anywhere in Phase 7 source (hard rule).
- All scoring (trust, matching, scope, budget, risk, next-best-action) is
  deterministic and pure: same inputs always produce the same output. The lib
  modules touch no database; the db/route layer gathers inputs and calls them.
- Trust inputs that have no signal yet (response speed, on-time, repeat) are left
  unknown and re-normalized away rather than scored as zero, so sparse profiles
  are not unfairly penalized; a sample-size confidence factor pulls thin profiles
  toward a neutral baseline.
