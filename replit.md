# A3 Partner Portal

## Overview

Full-stack web app for A3 Visual (premium event production company). Features a public partner-branded multi-step intake form for clients, and an admin dashboard for managing partners, reviewing requests, preparing quotes with AI summaries and PDF export.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Auth**: Clerk (admin-only, dev key provisioned)
- **Email**: Resend (via Replit Connectors)
- **AI**: OpenAI via Replit AI Integrations (gpt-4o-mini for request summaries)
- **Storage**: Replit Object Storage (file uploads)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API server)

## Architecture

### Artifacts
- `artifacts/api-server` — Express API server (port 8080)
- `artifacts/a3-portal` — React + Vite frontend (previewPath `/`)

### Shared Libraries
- `lib/db` — Drizzle schema + db connection
- `lib/api-spec` — OpenAPI YAML spec
- `lib/api-zod` — Generated Zod validation schemas
- `lib/api-client-react` — Generated React Query hooks + custom-fetch

### Database Tables
- `partners` — Partner companies with branding config, slugs, pricing toggles
- `partner_assets` — Uploaded assets tied to a partner
- `requests` — Client project requests with AI/internal summaries
- `request_items` — Line items per request (category + item)
- `request_uploads` — File uploads per request
- `pricing_rules` — Service catalog with starting prices + fee rules
- `admin_notes` — Internal notes on requests

### API Routes (all under `/api`)
- `GET/POST /partners`, `GET/PATCH/DELETE /partners/:id`
- `GET/POST /partners/:id/assets`, `DELETE /partners/:id/assets/:assetId`
- `GET /public/partners/:slug` — Public partner page data
- `POST /public/partners/:slug/requests` — Submit intake form
- `GET /public/pricing` — Public pricing reference
- `GET/PATCH /requests/:id`, `GET /requests`
- `POST /requests/:id/notes`, `GET /requests/:id/notes`
- `POST /requests/:id/regenerate-ai` — Re-run AI summary
- `POST /requests/:id/regenerate-pdf` — Generate PDF summary
- `GET/POST /pricing-rules`, `PATCH/DELETE /pricing-rules/:id`
- `GET /dashboard/summary`, `GET /dashboard/recent-requests`
- `GET /assets/library`
- `POST /storage/uploads/request-url` — Presigned upload URL
- `GET /storage/public-objects/*`, `GET /storage/objects/*`

### Frontend Pages
- `/login` — Clerk sign-in
- `/admin` — Dashboard with stats
- `/admin/partners` — Partner list + CRUD
- `/admin/requests` — Requests list with filters
- `/admin/requests/:id` — Request detail with AI summary, notes, PDF
- `/admin/assets` — Assets library
- `/admin/pricing` — Pricing rules CRUD
- `/partner/:slug` — Public multi-step intake form (5 steps)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed pricing rules and sample partners
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-set)
- `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` — Clerk auth
- `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI proxy
- `ADMIN_EMAIL` — Email for notifications (default: admin@a3visual.com)
- `SESSION_SECRET` — Express session secret
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` / `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` — Object storage

## Request Statuses
New, Reviewing, Waiting for files, Waiting for dimensions, Quote prep, Quote sent, Follow up, Closed won, Closed lost

## Design System
- **Primary color**: Dark navy (`222 47% 11%`) — professional, premium
- **Dark mode accent**: Warm gold (`45 93% 58%`)
- **Typography**: Inter (Google Fonts), with font-feature-settings for refined glyphs
- **Border radius**: 0.625rem base
- **Status badges**: Color-coded (blue=New, amber=Reviewing, violet=Quote prep, emerald=Quote sent, green=Won, red=Lost)
- **Partner portal**: Partner branding primary, "Powered by A3" subtle badge; trust signals on step 1; animated step transitions
- **Admin**: Compact horizontal nav with backdrop blur header; rounded card-based layouts; icon + text for section headers

## Seed Data
2 sample partners (Move Miami, Hilton) and 34 pricing rules across 6 categories.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
