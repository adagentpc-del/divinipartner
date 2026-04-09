# A3 Partner Portal

## Overview

Full-stack web app for A3 Visual (premium event production company). Features a public partner-branded multi-step intake form for clients, a multi-section product catalog portal, venue branding map system, and an admin dashboard for managing partners, themes, sections, products, branding locations, reviewing requests, preparing quotes with AI summaries and PDF export.

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
- **Validation**: Zod, `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec) — note: partners route now uses inline zod schemas for expanded fields
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
- `partners` — Partner companies with branding config, slugs, pricing toggles, portalMode, deck URLs, routing email, thank you text, capabilities link
- `partner_assets` — Uploaded assets tied to a partner
- `partner_themes` — Theme customization per partner (colors, fonts, tone preset, button style, approval status)
- `partner_sections` — Portal section config per partner (type, title, sort order, enabled/disabled)
- `product_catalog` — Global product catalog (22 products across categories like Displays & Backdrops, Signage, etc.)
- `partner_product_overrides` — Per-partner product customization
- `partner_branding_locations` — Venue branding map locations per partner (extracted from site survey decks)
- `portal_requests` — Multi-section portal requests (open creative requests)
- `product_requests` — Product order requests from the catalog
- `branding_location_requests` — Branding location artwork submission requests
- `request_files` — Files attached to any request type
- `requests` — Client project requests (legacy intake form) with AI/internal summaries
- `request_items` — Line items per request (category + item)
- `request_uploads` — File uploads per request
- `pricing_rules` — Service catalog with starting prices + fee rules
- `admin_notes` — Internal notes on requests

### API Routes (all under `/api`)
- `GET/POST /partners`, `GET/PATCH/DELETE /partners/:id` — full partner CRUD with expanded fields
- `GET/POST /partners/:id/assets`, `DELETE /partners/:id/assets/:assetId`
- `GET/PUT /partners/:id/theme` — Partner theme CRUD
- `GET/POST /partners/:id/sections`, `PATCH/DELETE /partners/:id/sections/:sectionId`, `PUT /partners/:id/sections/bulk` — Section management
- `GET/POST /partners/:id/branding-locations`, `PATCH/DELETE /partners/:id/branding-locations/:locationId`, `POST .../bulk`, `POST .../bulk-update` — Venue branding locations
- `GET/POST /products`, `PATCH/DELETE /products/:id` — Product catalog CRUD
- `GET /public/partners/:slug` — Public partner page data
- `GET /public/partners/:slug/portal` — Full portal data (partner + theme + sections + products + branding locations)
- `POST /public/partners/:slug/requests` — Submit intake form
- `POST /public/partners/:slug/portal-requests` — Submit portal request
- `POST /public/partners/:slug/product-requests` — Submit product order
- `POST /public/partners/:slug/branding-requests` — Submit branding location artwork
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
- `/admin/partners/:id/edit` — Partner form with all expanded fields (portal mode, deck URLs, routing email, etc.)
- `/admin/partners/:id/theme` — Theme editor (colors, fonts, tone preset, button style, approval)
- `/admin/partners/:id/sections` — Section manager (add/remove/reorder portal sections)
- `/admin/partners/:id/branding-locations` — Venue branding map manager (add/edit/approve locations)
- `/admin/products` — Product catalog CRUD (search, categorized view)
- `/admin/requests` — Requests list with filters
- `/admin/requests/:id` — Request detail with AI summary, notes, PDF
- `/admin/assets` — Assets library
- `/admin/pricing` — Pricing rules CRUD
- `/partner/:slug` — Public multi-step intake form (5 steps: Details → Context → Services → Uploads → Review)
  - Step 1: Contact info + event details + install/removal datetime + post-event disposition (Keep/Remove/Discard)
  - Step 3: Service selection with conditional panels (fabrication details, immersive details, design fee note) + "Starting at" pricing from partner.pricingRules
  - Step 4: 5 categorized upload sections (Floor Maps, Measurements, Decks, Artwork, Inspiration) with "Recommended" badge when fabrication selected
  - Step 5: Review with artwork warning when printing selected without design assistance

## Portal Modes
- `intake` — Original 5-step intake form
- `full` — Multi-section portal with product catalog, venue branding map, and open creative requests

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
### Legacy intake requests:
New, Reviewing, Waiting for files, Waiting for dimensions, Quote prep, Quote sent, Follow up, Closed won, Closed lost

### Portal requests (new):
new, reviewing, quoted, awaiting artwork, in production, completed, archived

## Design System
- **Primary color**: Dark navy (`222 47% 11%`) — professional, premium
- **Dark mode accent**: Warm gold (`45 93% 58%`)
- **Typography**: Inter (Google Fonts), with font-feature-settings for refined glyphs
- **Border radius**: 0.625rem base
- **Status badges**: Color-coded (blue=New, amber=Reviewing, violet=Quote prep, emerald=Quote sent, green=Won, red=Lost)
- **Partner portal**: Partner branding primary, "Powered by A3" subtle badge; trust signals on step 1; animated step transitions
- **Admin**: Compact horizontal nav with backdrop blur header; rounded card-based layouts; icon + text for section headers

## Seed Data
2 sample partners (Move Miami, Hilton), 34 pricing rules across 6 categories, 22 products, 6 portal sections for Move Miami, 1 partner theme.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
