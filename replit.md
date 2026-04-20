# A3 Partner Commerce Portal

## Overview

Full-stack web app for A3 Visual (premium event production company), expanded into a multi-supplier commerce portal. Supports two partner types:
- **Branding partners** (e.g. Move Miami, Hilton): venue branding map portals + multi-step intake forms.
- **Ordering partners** (e.g. Social Commerce Festival): full ordering flow with cities/venues/events, tiered packages, add-ons, artwork upload, and order tracking.

Includes admin dashboards for partners, suppliers, cities/venues, events, packages (with items), inventory, orders (with internal packets), users & roles, and a vendor fulfillment view. Suppliers are auto-assigned to orders via the partner's `defaultSupplierId`.

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
- `partners` — Partner companies; now includes `partnerType` ("ordering" | "branding"), `defaultSupplierId`, `pricingMode`, `billingInfoJson`
- `partner_assets` — Uploaded assets tied to a partner
- `suppliers` — Production/fulfillment vendors (A3 Visual, B2 Print Co, WS Fulfillment) with categories, capabilities, territory, contact
- `cities` — Cities scoped per partner (used by ordering partners)
- `venues` — Venues with shipping/install/contact details, scoped per partner+city
- `events` — Time-bound events at a venue, with install/teardown/shipping deadlines and available packages
- `packages` + `package_items` — Tiered service packages with included products
- `inventory` — Per-city/product hardware on-hand, reserved, damaged, low-threshold
- `orders` + `order_items` — Submitted orders with internal status, payment status, fulfillment mode, assigned supplier, vendor notes
- `quote_assets` — Polymorphic image/spec attachments for products/packages/zones/suppliers
- `user_roles` — Role assignments (super_admin, internal_admin, partner_manager, client_user, vendor_user) scoped to partner or supplier
- `saved_addresses`, `saved_contacts` — Reusable shipping/contact entries per partner
- `partner_themes` — Theme customization per partner (colors, fonts, tone preset, button style, approval status)
- `partner_sections` — Portal section config per partner (type, title, sort order, enabled/disabled)
- `product_catalog` — Global product catalog (22 products across categories like Displays & Backdrops, Signage, etc.)
- `partner_product_overrides` — Per-partner product customization
- `partner_branding_locations` — Venue branding map locations per partner (extracted from site survey decks)
- `deck_extractions` — PDF deck extraction jobs per partner (status, source file, page count)
- `deck_extraction_items` — Extracted location candidates from decks (name, category, dimensions, confidence, review status)
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
- `POST /partners/:id/duplicate` — Duplicate partner with theme + sections
- `GET/POST /partners/:id/assets`, `DELETE /partners/:id/assets/:assetId`
- `GET/PUT /partners/:id/theme` — Partner theme CRUD
- `GET/POST /partners/:id/sections`, `PATCH/DELETE /partners/:id/sections/:sectionId`, `PUT /partners/:id/sections/bulk` — Section management
- `GET/POST /partners/:id/branding-locations`, `PATCH/DELETE /partners/:id/branding-locations/:locationId`, `POST .../bulk`, `POST .../bulk-update` — Venue branding locations
- `GET/POST /partners/:partnerId/deck-extractions` — Deck extraction jobs (upload PDF, trigger extraction)
- `GET /deck-extractions/:id` — Single extraction with items
- `PATCH/DELETE /deck-extraction-items/:id`, `POST .../duplicate`, `POST .../approve` — Extraction item CRUD + bulk approve → creates branding locations
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
- `/admin/requests` — Unified requests list with tabs (All/Intake/Portal/Product/Branding), search, partner/status filters
- `/admin/requests/:id` — Request detail with AI summary, notes, PDF (intake requests)
- `/admin/portal-requests/:type/:id` — Portal/product/branding request detail with status management, admin notes
- `/admin/partners/:id/deck-extractions/:extractionId` — Deck extraction review (edit/approve/reject/hide items, bulk approve → creates branding locations)
- `/admin/assets` — Assets library
- `/admin/pricing` — Pricing rules CRUD
- `/partner/:slug` — Public portal (auto-routes by partner portalMode):
  - **intake mode**: Original 5-step intake form (Details → Context → Services → Uploads → Review)
  - **full mode**: Multi-section portal with hero, sizzle reel, quick-action buttons, product catalog grid with per-product order dialogs, venue branding map with artwork submission, event materials/immersive/fabrication/open request section cards, partner deck/capabilities links, themed footer
  - `RequestFormDialog` — Unified dialog for all request types with contact info, event details, size/quantity selectors, artwork status, design help toggle (brief + style notes + text copy + file uploads), multi-file upload to presigned URLs

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

### Quote statuses:
needs_review, quoting, quote_sent, awaiting_approval, approved, declined

### Priority levels:
normal, high, urgent

## Design System
- **Primary color**: Dark navy (`222 47% 11%`) — professional, premium
- **Dark mode accent**: Warm gold (`45 93% 58%`)
- **Typography**: Inter (Google Fonts), with font-feature-settings for refined glyphs
- **Border radius**: 0.625rem base
- **Status badges**: Color-coded (blue=New, amber=Reviewing, violet=Quote prep, emerald=Quote sent, green=Won, red=Lost)
- **Partner portal**: Partner branding primary, "Powered by A3" subtle badge; trust signals on step 1; animated step transitions
- **Admin**: Compact horizontal nav with backdrop blur header; rounded card-based layouts; icon + text for section headers

## Quote & Production Workflow
- All portal/product/branding request tables include: estimatedPrice, costNotes, quoteSummary, turnaroundNotes, quoteReady, quoteStatus
- Production handoff fields: productionOwner, installRequired, productionNotes, fulfillmentNotes, vendorNotes, productionDeadline, priority, recurringEvent
- Legacy requests table has: estimatedPrice, quoteStatus, quoteSummary, quoteReady, productionOwner, priority
- Admin detail page has collapsible "Quote & Pricing" and "Production & Handoff" panels
- Quote summary generator builds structured text block from request data, copy-to-clipboard
- All internal fields are never exposed to public portal

## Security & Hardening
- **File upload validation**: Client-side (50MB limit, extension whitelist) + server-side (`isValidStoragePath` rejects external URLs, path traversal)
- **SSRF mitigation**: Deck extraction rejects external http URLs; only object storage paths accepted
- **Error handling**: All admin mutations (status, notes, extraction items) show destructive toasts on failure
- **Submit errors**: RequestFormDialog surfaces upload failures and API errors inline
- **Server-side file URL validation**: `saveFiles()` in portalRequests.ts validates all file URLs before DB insert

## API Enrichment
- `GET /product-requests` — LEFT JOIN with product_catalog for `productName`
- `GET /branding-requests` — LEFT JOIN with partner_branding_locations for `locationName`
- `GET /product-requests/:id` — Includes full `product` object (name, category, imageUrl)
- `GET /branding-requests/:id` — Includes full `location` object (name, category, dimensions, preview image)

## Seed Data
2 sample partners (Move Miami, Hilton), 34 pricing rules across 6 categories, 22 products, 6 portal sections for Move Miami, 1 partner theme.

## Partner Commerce Portal (April 2026)
Expanded into a multi-supplier ordering & branding platform.

- **Partner types** (`partners.partnerType`): `branding` (zones/venues — Move Miami, Hilton) vs `ordering` (cities/events/packages — Social Commerce Festival).
- **Portal modes** (`partners.portalMode`): `intake`, `full`, `ordering` — each renders a different public `/partner/:slug` experience.
- **Admin nav is portal-type aware**: PartnerForm shows Branding Zones for branding partners; Cities & Venues / Events / Packages for ordering partners.
- **Dashboard** (`/api/dashboard/summary`): partner counts + type mix, total/pending/unassigned/today orders, partner-type breakdown, low-inventory alerts, upcoming events, recent orders & partners. Frontend uses direct `apiFetch` + react-query.
- **Ordering portal** (`/pages/public/OrderingPortal.tsx`): 6-step stepper (Event → Package → Add-ons → Artwork → Contact → Review) with sticky right-side summary sidebar (event/package/cart/total) on desktop. Public POST `/orders` uses strict Zod validation + transactional insert.
- **OrderDetail**: structured panels (Partner / Event / Shipping / Items / Artwork / Internal) with print-friendly stylesheet (`window.print()` hides nav/sidebars and renders an order packet header).
- **PartnerForm wizard**: sticky stepper bar (Basics → Portal → Documents → Contact → Settings) with anchor links and section step labels.
- **Duplicate actions**: Events, Packages, Partners all have `POST /api/{resource}/:id/duplicate` and "Duplicate" buttons in admin lists.
- **New schema columns**: `partners.partnerType`, `partners.defaultSupplierId` (both validated in partners route).

## Self-Service Onboarding (April 2026)
Public, shareable onboarding form for prospective clients to submit their info; admin reviews and one-click converts into a partner.

- **Public URL**: `/onboard` (no auth) — 6-step wizard: Company → Portal Type → Brand & Visuals → Contact → Billing → Review.
- **Logo & brand asset uploads** go through the existing presigned-URL storage flow (`/api/storage/uploads/request-url`).
- **Schema**: `partner_onboarding_submissions` (in `lib/db/src/schema/partnerOnboardingSubmissions.ts`) captures company, partner type, portal mode, tours flag, branding assets/copy, primary + billing contacts, payment terms, goals, and review lifecycle (`status`: new/reviewing/approved/rejected/converted, `internalNotes`, `convertedPartnerId`).
- **API** (`/api/onboarding/*`): public `POST /submit` (strict Zod), admin `GET /submissions`, `GET /submissions/:id`, `PATCH /submissions/:id` (status + notes), `POST /submissions/:id/convert` (creates a partner with `isActive=false`, auto-deduplicated slug, billing info populated, and links the submission via `convertedPartnerId`).
- **Admin UI**: `/admin/onboarding` shows the shareable link with a "Copy" button, status counters, and a list of submissions. Clicking opens a polished review dialog with sectioned details (Company / Brand / Contact / Billing / Goals), logo previews, internal notes, and "Convert to Partner" action that opens the new partner editor.

## Reusable Hardware & Asset Inventory (April 2026)
Lightweight but real reusable-event inventory system for partner-owned hardware (tables, easy-up frames, banner bases, step-and-repeat hardware, display hardware, etc.).

- **Schema** (`lib/db/src/schema/inventory.ts`):
  - `inventory` table now carries asset metadata: `name`, `category`, `assetType` (`hardware` | `reusable_asset`), `storageLocation`, optional `partnerId` (owner) and optional `productId` (catalog link).
  - Quantity columns: `totalQuantity`, `reserved`, `inUse`, `damaged`, `retired`, `onOrder`, plus `reorderThreshold`. Legacy `hardwareOnHand` / `lowInventoryThreshold` are kept for back-compat and auto-mirrored on writes.
  - Computed (server-side): `available = max(0, total − reserved − inUse − damaged − retired)`, plus `isLow` and `overcommitted` flags.
  - New `inventory_reservations` table links `inventoryId` ↔ `eventId` with `quantity`, `status` (`active` | `released` | `fulfilled`), and notes.
- **API** (`/api/inventory/*`):
  - CRUD on assets with the extended fields.
  - `GET /inventory/shortages` returns rows that are low or overcommitted (powers replenishment views).
  - `GET /inventory/reservations?eventId=…&inventoryId=…` lists reservations with joined event/inventory/city/product names.
  - `POST /inventory/reservations` creates a reservation **transactionally** and increments `inventoryTable.reserved`.
  - `PATCH /inventory/reservations/:id` adjusts status/quantity and re-balances `reserved` vs `inUse` deltas atomically (releasing or fulfilling moves the right counters).
  - `DELETE /inventory/reservations/:id` reverses the live count it was holding.
- **Admin UI** (`/admin/inventory`):
  - Six summary stat cards (Total Assets, Reserved, In Use, On Order, Low Stock, Overcommitted) with tone-coded warnings.
  - Tabs: **Overview** (asset cards), **By City** (grouped with per-city totals), **Shortages** (recommended replenishment), **Reservations** (active + in-use lists with one-click release / mark-in-use / return).
  - Search + city + partner filters.
  - Asset cards show colored Available block, breakdown chips for damaged/retired/on-order, and inline alerts when low or overcommitted.
  - Add/edit dialog includes live "available" preview and an immediate over-commit warning before saving.
- **Event reservation flow**: each event card on `/admin/partners/:id/events` exposes a Boxes icon that opens `EventInventoryDialog` (`src/components/admin/EventInventoryDialog.tsx`) — pick city → pick asset (shows available/total) → set qty → see "✓ Enough available" or "⚠ Shortfall: order N more" before confirming. Lists all reservations for the event with status badges and quick actions.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
