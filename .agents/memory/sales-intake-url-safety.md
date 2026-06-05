---
name: Sales intake file-URL safety
description: Why public-intake file links must be scheme-validated before admin rendering
---

# Public-intake file URLs are attacker-controlled

The sales intake submit endpoint is **public** and stores arbitrary uploaded-file
descriptors (`{name, url}`) into an opportunity, which the admin UI later renders as
clickable `<a href>` anchors. A raw `url` therefore crosses a trust boundary
(anonymous public POST → privileged admin click).

**Rule:** any file/link URL that originates from a public payload and is later
rendered as an anchor must be scheme-validated at persist time AND defensively at
render time. Allow only `https://` and same-origin relative paths (`/...`, e.g.
object-storage paths); reject `javascript:`, `data:`, etc.

**Why:** without this, a `javascript:` URL persists and executes on admin click
(stored XSS / script-URL injection). Caught in Phase 3 architect review.

**How to apply:** mirror the existing `isSafeFileUrl` guard used in both
`artifacts/api-server/src/routes/sales.ts` (collectFiles + the file Zod schema) and
`artifacts/a3-portal/src/pages/admin/SalesOpportunities.tsx`. Reuse the same
allow-list shape for any future surface that renders user-supplied links.
