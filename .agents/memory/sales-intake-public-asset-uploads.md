---
name: Public-facing asset uploads (anonymous downloadable)
description: When an uploaded file must be downloadable by anonymous/public users, it must live in the PUBLIC object bucket, not the private one.
---

Any file that anonymous (no-Clerk-session) visitors must download has to go to the
PUBLIC object bucket, not the default private one.

**Why:** The default upload flow returns a private `/objects/...` path whose serve route
requires a Clerk session, so public visitors get 401 and the download silently breaks.
Client-facing sales templates hit exactly this.

**How to apply:**
- Upload via the public flow (returns a `/api/storage/public-objects/...` URL); the public
  upload endpoint is admin-guarded and has a content-type allowlist — extend it when a new
  public file type is needed.
- Enforce server-side that a record flagged public actually carries a public URL. A scheme/XSS
  guard (allowing any same-origin `/` path or any `https://`) is NOT sufficient: it admits
  same-origin absolute URLs pointing back at the PRIVATE object route. The public guard must
  also reject `/api/storage/objects/` and `/storage/objects/` paths (relative and absolute).
- On PATCH, validate the MERGED values, so toggling the public flag on without re-sending the
  URL still re-checks.
