# Divini Partners — backend (Express + Postgres + native auth)

This is the API + static-SPA server for Divini Partners. It mirrors the
divinipartner `api-server` patterns (session verification via `jose`,
`ADMIN_ALLOWED_EMAILS` admin gate, one Node process serving the built SPA + the
`/api` router) but is a lean, self-contained service that talks to a plain
Postgres database with the `pg` driver and stores files on local disk (or S3,
via `STORAGE_PROVIDER`). Auth is native email/password (scrypt password
hashing + an HS256 session JWT signed with `SESSION_SECRET`); Authentik/OIDC
has been fully retired.

## Layout

- `src/config.ts` — env contract (DATABASE_URL, SESSION_SECRET, FILE_STORAGE_DIR, …).
- `src/pool.ts` — `pg` connection pool + `q`/`q1` helpers.
- `src/auth.ts` — session verification (`getAuth(req)` reads the cookie or
  bearer token, verifies via `lib/session.ts`), `requireUser`/`requireAdmin` guards.
- `src/routes/auth-native.ts` — register/login/verify-email/forgot/reset password.
- `src/db.ts` — data access **and authorization** (reimplements the Supabase RLS
  intent: company-membership scoping + the admin-email gate).
- `src/storage.ts` — local-disk uploads + HMAC short-lived signed download URLs
  (replaces Supabase Storage `upload`/`createSignedUrl`).
- `src/routes.ts` — one endpoint per old `db.ts` call; `/api/healthz`.
- `src/app.ts` / `src/index.ts` — Express app (CORS, auth mw, API, static SPA,
  SPA history fallback) + listen.

## Build & run

From the repo root (`sites/divini-partners`):

```bash
pnpm install                 # SPA deps
pnpm run build               # build the Vite SPA -> dist/
pnpm run build:server        # install + tsc the backend -> server/dist/
rm -rf server/dist/public && cp -r dist server/dist/public
pnpm run start               # node server/dist/index.js  (serves SPA + API)
```

Or use the single `render.yaml` blueprint at the repo root (build + start).

> Note: the backend depends on `express`, `pg`, `jose`, `cors`, `multer`. These
> must be fetched from the npm registry on first install (a networked machine).
