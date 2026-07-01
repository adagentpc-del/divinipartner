# Divini Partners - Phase 2 integration (onboarding + co-branded profiles)

This file tells the integrator how to wire the Phase 2 work in. All new code is
self-contained in the files listed; nothing in Phase 1 was edited. The
integrator makes the small mounting edits below (in files this agent was told
NOT to touch).

## 1. Database - apply the schema addendum

`db/schema-phase2.sql` is additive (it does not alter any existing table). Apply
it after `db/schema.sql` against the same database:

```
psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase2.sql
```

New tables added in `db/schema-phase2.sql`:

| Table | Purpose |
| --- | --- |
| `onboarding_drafts` | One row per org. Saveable, sectioned wizard state (`sections` jsonb), `current_step`, `steps_completed`, `strength` (0..100), and `completion_status` (the lifecycle enum). Unique on `organization_id`. |
| `profile_themes` | Brand controls for the profile body: logo, cover, primary/secondary/accent color, button_style, template. Unique on `organization_id`. |
| `ai_profile_suggestions` | Every AI-suggested field. Starts `ai_suggested_pending_verification`; partner accept/edit/reject. |
| `website_intakes` | Record of each website/Instagram/portfolio/booking/Google link submitted. |
| `profile_slugs` | Clean per-org slug registry (reserved before publish). Unique on `slug` and on `organization_id`. |

Reused existing tables (NOT modified): `organizations`, `profiles` (the published
co-branded profile row), `documents` (intake docs).

`completion_status` enum values: `Draft`, `Basic Complete`, `Pending Review`,
`Published`, `Verified`, `Preferred Eligible`, `Preferred`, `Premier`,
`Suspended`, `Archived`.

## 2. Backend - mount the router

Edit `server/src/routes.ts` (integration-time edit, allowed):

```ts
import profiles from "./routes/profiles.js";
// ...
router.use("/profile", profiles);
```

That mounts everything under `/api/profile`. Full route table:

| Method | Full path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/profile` | user + org | My profile + onboarding state (draft, theme, slug, suggestions, org). |
| PUT | `/api/profile/onboarding` | user + org | Save draft sections (shallow-merged by section key) + current step + steps completed. |
| POST | `/api/profile/onboarding/website` | user + org | Accept a website/link; creates deterministic AI-suggested DRAFT placeholders marked pending verification. Body: `{ url, linkType? }`. |
| POST | `/api/profile/onboarding/documents` | user + org | Record an uploaded document reference (writes a `documents` row). Body: `{ fileUrl, documentType?, section? }`. |
| POST | `/api/profile/onboarding/suggestions/:id` | user + org | Accept / edit / reject an AI suggestion. Body: `{ action: 'accepted'\|'edited'\|'rejected', value? }`. Accept/edit promotes the value into the draft section. |
| PUT | `/api/profile/theme` | user + org | Save theme controls. Body: `{ logo_url?, cover_url?, primary_color?, secondary_color?, accent_color?, button_style?, template? }`. |
| POST | `/api/profile/publish` | user + org | Submit for review or publish. Body: `{ mode: 'submit'\|'publish' }`. Free/free_partner are forced to `submit` (Pending Review); partner/premier/admin may `publish` (writes the `profiles` row + Published). Returns `{ draft, slug, applied }`. |
| GET | `/api/profile/public/:slug` | public | Public co-branded profile JSON. Returns only published profiles, only public fields. 404 if not live. |

Notes:
- AI suggestions are deterministic (no external model call). They never invent
  pricing, capacity, insurance, or certifications. Each suggested field is stored
  and returned as `{ value, status: 'ai_suggested_pending_verification' }`.
- Org scoping uses the existing `db.getActor(sub, email)`; routes 409 if the user
  has no organization yet (must register first).

## 3. Frontend - add routes

Edit `src/App.tsx` (integration-time edit, allowed). Imports:

```ts
import Onboarding from './pages/onboarding/Onboarding';
import ProfileEditor from './pages/profile/ProfileEditor';
import PublicProfile from './pages/profile/PublicProfile';
```

Routes (place the authed ones near `/app`, the public profile ones near the
public marketing routes):

| Component | Suggested route path | Notes |
| --- | --- | --- |
| `Onboarding` | `/onboarding` | AI-assisted wizard. Gate behind `session` (and ideally `company`). |
| `ProfileEditor` | `/profile` | Edit sections + theme. Gate behind `session`. |
| `PublicProfile` | `/venues/:slug`, `/vendors/:slug`, `/planners/:slug`, `/suppliers/:slug` (and optionally `/installers/:slug`, `/preview/:slug`) | Public, no auth gate. The component reads `:slug` via `useParams`, so the same element serves every kind. |

Example additions to the `<Routes>` block in `App.tsx`:

```tsx
{/* authed */}
<Route path="/onboarding" element={!session ? <Navigate to="/login" replace /> : <Onboarding />} />
<Route path="/profile" element={!session ? <Navigate to="/login" replace /> : <ProfileEditor />} />

{/* public co-branded profiles (one element, all kinds) */}
<Route path="/venues/:slug" element={<PublicProfile />} />
<Route path="/vendors/:slug" element={<PublicProfile />} />
<Route path="/planners/:slug" element={<PublicProfile />} />
<Route path="/suppliers/:slug" element={<PublicProfile />} />
<Route path="/installers/:slug" element={<PublicProfile />} />
<Route path="/preview/:slug" element={<PublicProfile />} />
```

(`ProfileEditor` links to `/preview/:slug` for its "Preview public profile"
button, so include the `/preview/:slug` route.)

Optional dashboard links: point each role dashboard's "Profile" / onboarding
prompts to `/onboarding` and `/profile`.

## 4. Files created by Phase 2

Backend:
- `db/schema-phase2.sql`
- `server/src/db/profiles.ts`
- `server/src/routes/profiles.ts`
- `server/src/db/INTEGRATION-phase2.md` (this file)

Frontend:
- `src/pages/onboarding/Onboarding.tsx`
- `src/pages/profile/ProfileEditor.tsx`
- `src/pages/profile/PublicProfile.tsx`

No Phase 1 file was modified.
