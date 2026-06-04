---
name: Object storage public vs private serving
description: How to make admin-uploaded media playable by anonymous portal visitors in api-server
---

# Object storage: public vs private serving

The api-server has two distinct object-storage serving paths, and choosing the wrong one silently breaks anonymous (public-portal) playback.

- `POST /storage/uploads/request-url` → presigned PUT into the **PRIVATE** dir. Served by `GET /storage/objects/*`, which **requires a Clerk session**. The returned `objectPath` has **no file extension**. Use only for admin-only / authenticated assets.
- `POST /storage/public-uploads/request-url` → presigned PUT into the **PUBLIC** bucket (first `PUBLIC_OBJECT_SEARCH_PATHS` entry). Served by `GET /storage/public-objects/*` with NO auth. Returns `/api/storage/public-objects/<uuid>.<ext>` (real extension preserved). Use for any media shown on public portals (demo video, walkthrough video/posters).

**Why it matters:** anything a customer/anonymous visitor must see or play (logos, videos, posters) MUST go through the public bucket. A private `/objects/...` URL returns 401 for them, and `VideoEmbed` detects direct video files by extension — the extensionless private path also fails detection.

**Security gotcha:** the global auth boundary in `routes/index.ts` uses `PUBLIC_PATH_RE = /^\/(public|customer|healthz|storage|onboarding|public-config)(\/|$)/`, which makes **every** `/storage/*` path public — including upload-URL minting endpoints. Any write endpoint under `/storage/*` MUST add its own inline `getAuth(req)` check or anonymous users can mint presigned PUT URLs and write to the bucket.

**How to apply:** for public media uploads, add `getPublicObjectUploadURL(ext)` on `ObjectStorageService` (presigned PUT to public dir) and an inline-Clerk-guarded endpoint; client stores the returned `publicUrl`, not `objectPath`.
