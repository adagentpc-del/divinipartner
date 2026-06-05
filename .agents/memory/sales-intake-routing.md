---
name: Sales intake module routing & frontend
description: Non-obvious constraints for the public Sales Intake forms and admin pages
---

# Public intake route ordering

Public intake routes in `a3-portal/src/App.tsx` MUST be registered BEFORE the
`/partner/:slug` and bare `/:slug` catch-all routes, or wouter will treat
`/intake/...` as a partner slug and render the partner portal / NotFound.

Within the intake group, `/intake/pole-banner/:source?` must come BEFORE
`/intake/:source`, otherwise "pole-banner" is consumed as a link source.

**Why:** wouter matches top-to-bottom; the bare `/:slug` catch-all exists for
bare-slug partner share URLs and will swallow anything.

# No rep field on public forms

The client never sees / picks a rep. The rep is captured silently from the URL
link source (`/intake/drew` → linkSource "drew"). `normalizeSource` validates
against INTAKE_LINK_SOURCES (alyssa/drew/retta/general); link source maps to a
rep by matching the rep's lowercased firstName.

**Why:** product requirement — routing is internal, invisible to the client.

# Routing precedence (server, routeSubmission)

1. fuzzy account match → that account's active owner
2. else link source → active rep whose firstName matches
3. else → Super Admin queue (assignedRepId null)

Every public submit also auto-creates a `sales_opportunities` row at stage
`new_intake`, pulling any uploaded files out of the jsonb payload via collectFiles.

# Frontend conventions

- Public forms: plain `fetch` + `apiUrl()`, uploads via shared
  `uploadIntakeFile` in `components/intake/intakeControls.tsx` (Field, Recap,
  PillGroup, ChipMulti, UploadBucket, normalizeSource live there — import, do not
  duplicate).
- Admin pages: `apiFetch` from `@/lib/api` (handles Clerk auth + base path) +
  react-query; super-admin-only UI gated on `/api/sales/me` role.
