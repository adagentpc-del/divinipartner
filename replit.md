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

### Quote Ingestion & Catalog Intelligence
A workflow for turning supplier quotes, spec sheets, screenshots, ERP exports, and notes into structured catalog data. Built on top of the existing `quote_assets` table — no rewrite.

**Schema (`lib/db/src/schema/quoteAssets.ts`)**
- `quote_assets` extended: `sourceType` (quote / spec_sheet / screenshot / website_reference / erp_export / manual_note / prior_job_reference), `processingStatus` (new / needs_review / needs_clarification / mapped / approved / superseded / archived), structured `supplierId` (FK), `confidenceFlag`, all extracted enrichment fields (extractedDisplayName/InternalName/Category, customerFacingSummary, backendOpsSummary, finishingSummary, leadTimeText, printFileRequirements, install/opsNotes, reviewNotes, clarificationNeeded, missingDataFlagsJson).
- `quote_asset_mappings` — m2m linking a source to product / package / branding_zone / supplier.
- `product_spec_standards` — standardized spec records per product, with one `isCurrent` (preferred), supplier/zone/package scoping, full summaries, lead time, approval/active/effective/expiration, sourceQuoteAssetIds, missingDataFlagsJson.
- `product_catalog` extended: `customerFacingSummary`, `reviewStatus`, `missingDataFlagsJson`.

**API (`artifacts/api-server/src/routes/quoteAssets.ts`)**
- Enriched `/api/quote-assets` GET/POST/PATCH/DELETE with filters: sourceType, processingStatus, supplierId, mappingStatus, missingDataOnly, expiredOnly, search.
- `/api/quote-ingestion/stats` — dashboard counts.
- `/api/quote-assets/bulk-update` — batch processingStatus / supplier patch.
- `/api/quote-assets/:id/mappings` GET/POST + `/mappings/:mid` DELETE — chip-style m2m.
- `/api/quote-assets/:id/promote` — creates a new product (and optional preferred spec standard) from a source, auto-maps it.
- `/api/products/:id/spec-standards` CRUD + `/spec-standards/:sid/set-current` — catalog spec standardization.
- `/api/catalog-intelligence/overview` — products with missing data, expired sources, products without an approved standard, multi-supplier products.

**UI**
- `pages/admin/QuoteIngestion.tsx` at `/admin/quote-ingestion` (nav: "Ingestion") — stat cards, filter rail, source cards with checkbox bulk-select, file upload via `/api/storage/uploads/request-url`, side drawer with Enrich / Mappings / Review tabs, missing-data flag chips, Promote-to-product dialog.
- `pages/admin/ProductCatalog.tsx` — added `Spec Standards` tab (list with starred current preferred + inline editor), customer-facing summary field, internal Intelligence panel (review status pill + missing-data flag chips). Quote tab renamed "Sources".

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

## Order Fulfillment Engine, Catalog Intelligence & Quote Mapping (April 2026)
Connects fulfillment modes to inventory reservations, surfaces partner committed inventory, and adds catalog/quote intelligence.

### Schema additions
- `productCatalog`: capability flags `usePartnerInventoryEligible`, `reusableHardwareCompatible`, `inventoryTracked`, `requiresAttachmentSelection`, `requiresMaterialSelection`; ops fields `installNotes`, `internalOpsSummary`, `featureBadgesJson` (string[]).
- `orderItems`: fulfillment math columns `hardwareRequired`, `printDemandQuantity`, `hardwareDemandQuantity`, `reservedQuantity`, `shortageQuantity`, `inventorySourceCityId`, `inventorySourceInventoryId`, `inventoryReservationId`, `internalFulfillmentNotes`.
- `quoteAssets`: `dimensionsSummary`, `materialSummary`, `attachmentSummary`, `hardwareSummary`, `supplierName` (in addition to existing version/effective/expiration/approved-standard fields).
- `inventory` unique index relaxed to `(cityId, partnerId, productId, name)` to support per-partner ownership.

### Fulfillment engine (`/api/orders`)
- `computeFulfillmentMath(item, productCaps)` derives `printDemand` / `hardwareDemand` / `hardwareRequired` from `fulfillmentMode` × product capabilities. Modes: `full` (print + hardware), `graphic_only` (print only), `use_existing_partner_inventory` (print + reserve from owned hardware), `rental_plus_print`, `new_hardware_required`, legacy `client_owned_plus_print`.
- POST/PATCH `/orders` automatically: when an item has `fulfillmentMode = use_existing_partner_inventory`, an `eventId`, and `inventorySourceInventoryId`, it transactionally `SELECT … FOR UPDATE`s the inventory row, creates a reservation for `min(qty, available)`, persists `inventoryReservationId`, `reservedQuantity`, and any `shortageQuantity` on the item.
- PATCH rebalances reservations when mode/qty/source changes (releases the prior reservation before creating a new one).
- DELETE `/orders/:id` releases all reservations atomically before removing the order.
- New list filters on `GET /orders`: `fulfillmentMode`, `shortageOnly` (accepts `1` / `true`), `reservedOnly`, `sourceCityId`. List rows include `totalShortage`, `totalReserved`, `itemFulfillmentModes` aggregate.

### Catalog intelligence (admin Dashboard)
`/api/dashboard/summary` adds: `partnerInventoryOrders`, `printOnlyOrders`, `ordersWithShortages`, `totalShortageUnits`, `productsMissingQuote`. Admin Dashboard renders a "Catalog Intelligence" row of stat cards that deep-link into pre-filtered Orders list.

### Partner committed-inventory view
- API: `GET /partners/:id/inventory-summary` returns enriched assets (with derived `available`, `isLow`, `overcommitted`, `displayName`), per-city aggregates, all reservations, and an `upcomingByEvent` rollup with status counts and total committed units.
- UI: `/admin/partners/:id/committed-inventory` (linked from the PartnersList Boxes icon). Tabs: **By city** (per-city cards with available/reserved/in-use/low breakdown), **Upcoming commitments** (event timeline with status chips), **Shortages** (over-committed and low items), **All assets** (flat list).

### Product Catalog UI
- `/admin/products` rewritten with grouped-by-category cards showing capability badges (Hardware / Graphic only / Rental / Partner-owned / Reusable HW / Tracked / lead-time).
- Edit dialog has 4 tabs: **Customer-facing** (display name, dimensions, description, badges, gallery), **Capabilities** (all eight capability flags + active/orderable toggles), **Backend Ops** (attachment method, material, finishing, lead time, production/install/internal notes), **Quote / Spec** (inline `QuoteAssetsPanel` for uploading and managing supplier quotes/spec sheets — version, effective/expiration dates, approved-standard star, vendor visibility, dimensions/material/attachment/hardware summaries, file upload via presigned URL).

### Order Detail (per-item fulfillment view)
- Top-of-page shortage banner appears when any item has `shortageQuantity > 0`.
- Order-level totals row: Print demand, Hardware demand, Reserved-from-inventory, Shortage.
- Each item card shows: fulfillment-mode badge, print/hardware demand chips, reservation badge with reservation id, source-city badge, and inline approved quote/spec links pulled from the product (`ProductSpecRefs`).

### Filters & widgets
- `/admin/orders` has new filter row: fulfillment-mode select, source-city select, "Shortages only" toggle. Mode column now shows per-item modes plus reserved/shortage counters.

### Verified end-to-end
Order `qty=7` of an asset with 5 available → `reservedQuantity=5`, `shortageQuantity=2`, inventory `reserved` 0→5; order delete releases the reservation back to 0.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Multi-Supplier Routing & Fulfillment Workflow (April 2026)

The portal supports per-line-item supplier routing on top of the order-level supplier. Every order item carries its own supplier, status, dates, and exception state, with a full audit trail.

### Schema additions
- `partnerBrandingLocations.defaultSupplierId` — preferred supplier for items pulled from a branding zone.
- `orderItems` (new columns): `assignedSupplierId`, `supplierAssignmentSource` (`product|package|zone|order|manual|none`), `supplierStatus` (12-value enum), `supplierDueDate`, `supplierShipDate`, `supplierDeliveryDate`, `supplierInstallDate`, `supplierAcknowledgedAt`, `supplierReference`, `supplierNotes`, `exceptionFlag`, `exceptionReason`, `exceptionNotes`.
- `supplier_assignment_history` — every supplier change (from→to, source, note, user, timestamp).
- `supplier_status_events` — every status change (from→to, role, note, user, timestamp).

### Inheritance order (resolved server-side on item create/update)
`product.supplierId` → `partnerBrandingLocations.defaultSupplierId` (zone) → `orders.assignedSupplierId` (order-level) → `none`. Manual overrides set `supplierAssignmentSource = 'manual'` and are preserved on later edits.

### Status model
`unassigned → assigned → acknowledged → in_production → (awaiting_assets | awaiting_approval) → shipped → delivered → installed → completed`. `issue_flagged` is an orthogonal exception state. Vendors are restricted to a forward-only transition table; admins can set any status.

### API routes (under `/api`)
- `POST /orders/:orderId/items/:itemId/assign-supplier` `{ supplierId, source?, note? }`
- `POST /orders/:orderId/bulk-assign-supplier` `{ itemIds[], supplierId, source? }`
- `POST /orders/:orderId/items/:itemId/status` `{ status, role, note? }` — vendor transitions enforced; auto-fills date columns and sets `exceptionFlag` on `issue_flagged`.
- `POST /orders/:orderId/items/:itemId/exception` `{ flag, reason?, notes? }`
- `POST /orders/:orderId/items/:itemId/dates` `{ supplierDueDate?, supplierShipDate?, supplierDeliveryDate?, supplierInstallDate?, supplierReference?, supplierNotes? }`
- `GET /orders/:orderId/items/:itemId/history` — `{ assignments[], statuses[] }` with supplier names.
- `GET /orders/:orderId/items/:itemId/supplier-recommendations` — ranked by inheritance source then active suppliers.
- `GET /fulfillment/command-center` — line-item-grain results joined with order/partner/event/supplier; filters: `supplierId, status, partnerId, portalType, eventId, cityId, fulfillmentMode, shortageOnly, issueOnly, unassignedOnly, dueWithinDays, hasQuoteSpec`; stats: `unassigned, awaitingAcknowledge, dueSoon (≤7d), awaitingAssets, issues, shippedNotDelivered, installUpcoming, completedToday, missingQuoteSpec, withShortage`.
- `GET /vendor/orders?supplierId` — orders containing items for that supplier; each order is filtered to only the supplier's items (no margins, no internal notes; vendor notes only).
- `GET /vendor/items?supplierId&bucket=all|due_soon|awaiting_assets|in_production|issues|recent` — vendor dashboard with bucket counts.
- `GET /vendor/orders/:orderId/packet?supplierId` — clean printable packet (order header, ship-to, items, products, vendor-visible quote assets only).

### UI surfaces
- `/admin/fulfillment` — Fulfillment Command Center: clickable stat cards (toggle filters), filter rail, line-item table with inline status pill, due-date editor, exception toggle, bulk supplier assignment.
- `/admin/orders/:id` — OrderDetail items now have `ItemSupplierControls` per row: supplier picker (override-confirm prompt when overriding inherited), source badge, status pill, due-date popover, supplier reference inline editor, exception flag/clear; checkboxes enable bulk supplier assignment toolbar.
- `/admin/vendor` — Vendor Workspace: supplier perspective switcher + bucket tabs (All / Due in 7d / Awaiting Assets / In Production / Issues), vendor-only status transitions, click any item to open Packet View (printable, includes vendor-visible quote assets and ship-to).
- Sidebar nav adds "Fulfillment" link next to Orders.

## ERP, Export & Reconciliation Layer (April 2026)

Adds a finance/ops bridge on top of orders so daily ops can be exported into the supplier-facing or NetSuite-facing world, and so commission verification and discrepancy handling have a real workspace. **Extends** existing tables — does not rebuild any prior feature.

### Schema (`lib/db/src/schema/orders.ts`, `lib/db/src/schema/reconciliation.ts`)
- `orders` extended with: `paymentModel` (partner_billed | client_direct | a3_billed | prepaid), `billingEntity`, `supplierEstimatedCost`, `supplierFinalCost`, `expectedCommission`, `paidCommission`, `commissionPaidDate`, `commissionPaidThrough`, `commissionStatus` (not_started | expected | partially_paid | paid | disputed | verified), `supplierPayableStatus` (not_started | invoiced | paid | overdue), `payoutStatus`, `reconciliationStatus` (not_started | in_review | waiting_payment | waiting_supplier_final | waiting_commission | discrepancy_found | reconciled), `reconciliationNotes`, `financeNotes`.
- `order_items` extended with `estimatedSupplierCost`, `finalSupplierCost`.
- New `discrepancies` table — orderId, type (supplier_cost_variance | commission_variance | billing_mismatch | missing_payment | missing_supplier_final | wrong_billing_model | missing_quote_ref | shortage_unresolved | manual_review), severity, status (open | in_review | resolved | wont_fix), reason, notes, expected/actual/varianceAmount, assignedToUserId, resolutionNotes, autoFlagged.
- New `commission_payouts` table — orderId, amount, paidDate, paidThrough, reference, notes; recording a payout auto-recomputes the order's `paidCommission` total and bumps `commissionStatus` (paid / partially_paid / disputed).

### Backend exports (`artifacts/api-server/src/routes/exports.ts`)
- `GET /api/exports/orders.csv?...filters` — order-level export with retail, costs, commission columns, variance, billing entity (NetSuite/spreadsheet preset).
- `GET /api/exports/order-items.csv?...filters` — line-item export with supplier, fulfillment mode, demand, reservations, shortages, supplier cost, ops notes, and quote/spec references.
- `GET /api/exports/finance.csv?...filters` — finance/recon preset: gross margin, commission variance, statuses, open discrepancies.
- `GET /api/exports/suppliers.csv` — supplier rollup (assignment count, due-soon, issues, supplier cost totals).
- `GET /api/exports/events.csv` — event rollup (reserved/shortage/orders/booked).
- `GET /api/exports/orders/:id/packet.html?supplierId=` — printable Operational Packet (full order) or Supplier Packet (scoped to one supplier's items + ship-to). Includes Quote/Spec references attached to each product.
- `GET /api/exports/suppliers/:id/packet.html` — printable supplier packet across all their assignments.
- All CSVs filter via the same querystring shape used by the Orders dashboard, so filter→export workflows share the same model.

### Backend reconciliation (`artifacts/api-server/src/routes/reconciliation.ts`)
- `GET /api/reconciliation/summary` — totals, awaiting count, variance totals, breakdowns by billing model and recon status.
- `GET /api/reconciliation/orders?...filters` — decorated list (partner/event/supplier names, gross margin, commission variance, supplier cost variance, open discrepancy count, embedded discrepancies). Filters: partnerId, supplierId, paymentModel, paymentStatus, supplierPayableStatus, reconciliationStatus, commissionStatus, plus toggle filters `discrepancyOnly`, `missingSupplierFinal`, `missingCommissionVerification`, `missingPaymentConfirmation`.
- `PATCH /api/reconciliation/orders/:id` — update billing/cost/commission/recon fields and notes (zod-validated).
- `POST /api/reconciliation/orders/:id/auto-flag` — heuristic flagger: emits `commission_variance` (paid ≠ expected), `supplier_cost_variance` (>5% from estimate), `missing_payment` (completed but unpaid), `missing_supplier_final` (delivered/completed without final cost). Skips if same auto-flag already open.
- `GET/POST/PATCH/DELETE /api/discrepancies` — CRUD with order# / partner decoration. Status update auto-stamps `resolvedAt`.
- `GET /api/orders/:id/commission-payouts`, `POST /api/orders/:id/commission-payouts`, `DELETE /api/orders/:id/commission-payouts/:payoutId` — payout history with auto-recompute of order paidCommission/status.
- `POST /api/reconciliation/bulk-update` — apply patch to many orders.

### UI surfaces
- `/admin/reconciliation` — Reconciliation Workspace (`pages/admin/Reconciliation.tsx`):
  - 5 summary cards (retail booked, supplier final cost, commission paid, awaiting recon, open discrepancies) tinted by health.
  - Tabs: **Orders** (filterable table with retail/cost-with-arrow/margin/commission columns, recon + issue badges), **Discrepancies** (severity, inline status select, delete), **Commission** (verification table with auto-flag-all button).
  - Side drawer per order: sub-totals, full Billing & Costs + Reconciliation form, embedded discrepancy list, commission payout history with inline add form, "Open in OrderDetail" + "Packet" shortcuts.
  - "Export finance CSV" honors active filters.
- `/admin/orders/:id` — OrderDetail now shows:
  - **Ops Packet** + (when supplier assigned) **Supplier Packet** buttons next to Print, opening printable HTML in new tabs.
  - **Finance & Reconciliation** card in the right column (margin/variance/issues mini-stats, full editable finance form, embedded discrepancy mini-list, commission payout history, link to the Reconciliation workspace).
- `/admin/orders` — header now has an **Export ▾** menu (Orders CSV / Line items CSV / Finance CSV with current filters; plus suppliers and events rollups).
- Sidebar nav adds "Reconciliation" with Calculator icon between Fulfillment and Suppliers.

### Visibility / role gating
All finance fields and the Reconciliation workspace live exclusively under `/admin/*` which is gated by `AdminRoute` (Clerk). Partner managers, vendors, and clients use distinct surfaces (vendor portal, public partner portal) and never see commission, supplier cost, or reconciliation status.

**Known gap (consistent with rest of API):** API routes themselves are not yet role-gated server-side; the codebase relies on frontend `AdminRoute` for access control across all admin endpoints (orders, suppliers, finance, exports). To harden, add a `requireAdmin` express middleware that reads the Clerk session and a user→role lookup, then mount it on `/exports*`, `/reconciliation*`, `/discrepancies*`, `/orders/:id/commission-payouts*`, and other sensitive routes. This requires the frontend `apiFetch` to forward the Clerk session token (currently it does not).

### Hardening applied in this layer
- CSV cells starting with `=`, `+`, `-`, `@`, tab, or carriage-return are prefixed with `'` to defuse Excel/Sheets formula injection from user-controlled fields (names, notes, emails).
- `supplierId` and `assignedSupplierId` are both accepted by export filters so the dashboard's filter shape works end-to-end for supplier-scoped CSVs.
- Commission payout DELETE recomputes `paidCommission` **and** `commissionStatus` (paid / partially_paid / disputed / expected / not_started), matching the POST recompute path.
- Auto-flag emits `commission_variance` whenever `expectedCommission > 0` and paid differs from expected (including paid=0 case).

## Selective Billing Execution & Invoice Workflow (April 2026)

A formal billing layer that decides — per order — *who* invoices the client and how, then tracks the resulting invoice through its full lifecycle. Sits on top of (does not replace) Reconciliation, which still tracks supplier costs/commissions/payouts.

### Five billing execution models
- `a3_collected` — A3 invoices and collects from end client.
- `alyssa_entity_collected` — A separate Alyssa entity invoices/collects.
- `manual_invoice` — Off-system (PDF/email) invoice; mark sent/paid manually.
- `split_payout` — Placeholder for future split payouts to multiple parties.
- `external_payment_pending` — Client pays via external system (Stripe/QBO link); waiting on confirmation.

### Inheritance precedence (resolver)
order override (orders.billingExecModel where source='order') → event override (events.billingExecModelOverride) → partner default (partners.defaultBillingExecModel) → fallback `a3_collected`. Resolver lives in `artifacts/api-server/src/routes/billingResolver.ts` and is called by `/api/billing/orders/:id/resolve` and the auto-resolution on invoice creation.

### Schema additions
- `partners`: defaultBillingExecModel, billingEntityName, paymentTerms, depositRequired, depositPct, allowPartialPayment, allowOrderOverride, defaultBillingNotes, billingContactName/Email/Phone, internalBillingOwnerUserId, billingActive.
- `events`: billingExecModelOverride.
- `orders`: billingExecModel, billingExecModelSource (`partner|event|order`), invoiceRequired, internalBillingOwnerUserId, billingReferenceNumber, externalInvoiceRef, paymentLinkPlaceholder, billingNotes, billingContactJson.
- `invoices`: invoiceNumber, publicToken (random 32-hex for `/invoice/:token`), orderId, partnerId, eventId, billingExecModel, billingEntity, status, issueDate/dueDate, subtotal/tax/totalAmount/amountPaid/balanceDue, depositAmount/depositPaid, lineItemsJson, billingContactJson, paymentInstructions, externalInvoiceRef, paymentLinkPlaceholder, internalReference, notes, createdByUserId, sentAt/paidAt/cancelledAt.
- `invoice_payments`: invoiceId, amount, paidDate, method, reference, isDeposit, notes, recordedByUserId.

### Invoice statuses
`draft → ready → sent → partially_paid|paid|overdue|cancelled`. Recording a payment auto-recomputes amountPaid/balanceDue, transitions status, and mirrors `orders.paymentStatus`. `POST /api/invoices/scan-overdue` flips `sent` past dueDate to `overdue`.

### API routes
- `/api/billing/summary` — totals, overdue count, ordersNeedingInvoice, missingBillingContact, byStatus, byBilling.
- `/api/billing/orders` — filterable list with resolved billing model + linked invoice meta. Filters: billingExecModel, invoiceStatus, paymentStatus, partnerId, needsInvoice, overdueOnly, missingBillingContact.
- `/api/billing/orders/:id/resolve` — return resolved model + source.
- `/api/billing/orders/:id/override` — set/clear order-level override.
- `/api/billing/bulk` — bulk create_invoices / mark_ready / mark_sent / mark_overdue.
- `/api/invoices` (GET list w/ filters, POST not exposed — use `from-order`), `/api/invoices/:id` (GET, PATCH), `/api/invoices/from-order/:orderId` (POST), `/api/invoices/:id/regenerate` (POST — pull current order line items into draft), `/api/invoices/:id/payments` (POST/DELETE), `/api/invoices/public/:token` (public client view), `/api/invoices/scan-overdue` (POST cron-like).

### Frontend
- `/admin/billing` — Billing Command Center (5 summary cards, filters, Orders/Invoices tabs, bulk actions, scan-overdue).
- `/admin/invoices/:id` — line items + payments + status workflow + edit panel + "Open client view" link.
- `/invoice/:token` — public, print-friendly client-facing invoice (no auth).
- OrderDetail right column has a Billing card showing resolved model + source pill, model override dropdown, invoice link or Create-invoice button.
- PartnerForm has a Billing Settings card (default model, terms, billing entity, deposit %, billing contact, allow-override flags).

### Notes
- `order_items` has no `lineTotal` column — invoice line item amounts are computed as `quantity * unitPrice` at create/regenerate time and stored in `invoices.lineItemsJson`.
- Numeric fields come back from Drizzle as strings; resolver and totals coerce via `parseFloat`.
- Authz follows the same convention as the rest of the admin API (frontend gates via Clerk `AdminRoute`; backend trusts admin-net traffic). Public invoice endpoint is intentionally unauthenticated and looks up only by random 32-hex token.

## Asset & Production Workflow (April 2026)

A unified asset model layered on top of the existing portal. Replaces ad-hoc `artworkFileUrl` / `artworkFilesJson` with structured, versioned, approval-gated assets.

### Schema (`lib/db/src/schema/assets.ts`)
- **`assets`** — title, fileUrl, fileName, mimeType, fileSize, category (`client_artwork`, `approved_artwork`, `proof`, `print_ready`, `reference`, `install_reference`, `shipping_document`, `photo`, `spec`, `internal_only`), visibility (`internal_only` | `partner_visible` | `client_visible` | `vendor_visible`), polymorphic `ownerType`/`ownerId` plus dedicated FKs to partner / event / order / product / package / brandingZone / supplier. Versioning: `version`, `isCurrent`, `parentAssetId`. Lifecycle: `status` (`uploaded` | `under_review` | `revision_requested` | `approved` | `superseded` | `vendor_released` | `archived`), `approvalStatus`, `approvedByUserId`, `approvedAt`, `releasedToVendorAt`, `productionReady`. Plus `uploadedByUserId`, `notes`, `tagsJson`.
- **`asset_links`** — many-to-many between an asset and `order_items` with `role` (primary_artwork, proof, reference, install_diagram, shipping_doc) and `isRequiredFor` flag. Same asset can map to multiple line items.
- **`asset_events`** — full audit trail. Auto-emitted on every transition (uploaded, linked, unlinked, new_version, approved, revision_requested, released_to_vendor, status_change, visibility_change, archived).
- **`order_items`** extended with `artworkRequired`, `proofRequired`, `productionReady`, `productionBlockedReason`.

### Backend
- **`/api/assets`** (`routes/assets.ts`):
  - `GET /assets` — list with filters: partnerId, eventId, orderId, productId, brandingZoneId, supplierId, category, status, visibility, currentOnly, approvedOnly, orderItemId.
  - `GET /assets/:id` — includes `links`, `events`, full `versions[]` history (root + children).
  - `POST /assets` — create after upload; optionally `linkOrderItemIds[]`.
  - `PATCH /assets/:id` — title, category, visibility, status, approvalStatus, productionReady, notes, tags, isCurrent. Logs status & visibility changes.
  - `POST /assets/:id/approve` — sets approved + approvedAt + (default) `vendor_released` + `vendor_visible`. Pass `releaseToVendor:false` to approve without releasing.
  - `POST /assets/:id/request-revision` — flips to `revision_requested`, logs note.
  - `POST /assets/:id/new-version` — supersedes the family, creates v(n+1), copies links forward.
  - `POST /assets/:id/links` / `DELETE /assets/:id/links/:linkId` — manage line-item mapping.
  - `DELETE /assets/:id` — archive.
  - `GET /asset-events` — recent feed.
- **`/api/production`** (`routes/production.ts`):
  - `GET /orders/:id/readiness` — per-line-item readiness with `expectations` (needsArtwork/needsProof — derived from `fulfillmentMode`, product capabilities, presence of brandingZone), `assets[]`, `flags[]` (`artwork_missing`, `artwork_awaiting_approval`, `proof_missing`, `proof_awaiting_approval`, `exception`, `blocked`), `productionReady`, plus rolled-up `summary` (total/ready/blocked/missingArtwork/missingProof/awaitingApproval).
  - `PATCH /order-items/:id/production-block` — set/clear `productionBlockedReason`.
  - `GET /production/dashboard` — counters (awaitingReview, awaitingApproval, revisionRequested, approved, vendorReleased, superseded), latest uploads, byEvent / bySupplier counts, orderIssues list.
  - `GET /orders/:orderId/supplier-packet/:supplierId` — vendor-safe production handoff: only items assigned to that supplier, only assets that are `isCurrent` + `vendor_visible` (or `client_visible`) + approved-or-released. Includes due/ship/install dates, internal fulfillment notes, blocked reason, per-item flags, plus order-level approved vendor-visible assets.

### Frontend
- **`/admin/production`** (`Production.tsx`) — review dashboard: 6 counter cards, "Orders with asset issues" list, "Latest uploads", assets-by-event, assets-by-supplier.
- **`/admin/assets`** (`Assets.tsx`) — global asset library with search, status & category filters, inline uploader.
- **`/admin/orders/:orderId/packet/:supplierId`** (`SupplierPacket.tsx`) — printable production packet (calls supplier-packet endpoint). Print stylesheet hides chrome; per-item ready/blocked badges; clearly groups vendor-released assets.
- **`OrderDetail`** Production Assets card — embeds `OrderAssetsPanel` (readiness summary + supplier packet links + order-level assets section + per-line-item mapping). Legacy `artworkFilesJson` shown beneath as "Legacy attachments".
- **`AssetUploader`** — drag/drop or click; calls existing `/api/storage/uploads/request-url` flow (presigned PUT to GCS, then POST `/api/assets`); category + visibility selects; `compact` mode for inline use.
- **`AssetCard`** — image thumbnail / file icon, status + approval + visibility + category badges, action menu: View, Approve & release, Approve only, Request revision (with notes), Upload new version (in-place), Release to vendor, Archive.
- **`OrderAssetsPanel`** — readiness card with summary badges, links to per-supplier packets, order-level assets grid, line-item cards with: needs-artwork/needs-proof expectations, current assets list with role / version / approval / vendor-released chips, link existing or upload new (auto-mapped), block/unblock controls.
- Nav: new "Production" item in `AdminLayout` between Fulfillment and Billing.

### Vendor-leak gating (defense in depth)
- `PATCH /assets/:id` rejects `status: "vendor_released"` or `visibility: "vendor_visible"` unless the asset is (or is being set in the same call to) `approvalStatus: "approved"`.
- Supplier packet endpoint requires `isCurrent && visibility === "vendor_visible" && approvalStatus === "approved"` — no status-only shortcut.
- `new-version` always demotes `vendor_visible` → `internal_only` on the new draft so it must be re-approved before reaching vendors.

### Versioning (transactional)
- `POST /assets/:id/new-version` runs in a DB transaction. It computes `nextVersion = max(version)+1` across the entire family (root + children), supersedes every member, copies links from the current head (not the asset called against), and inserts the new draft as `isCurrent`. Calling from an older version still produces a correctly numbered new head.

### Link integrity
- `POST /assets/:id/links` de-dupes on `(assetId, orderItemId, role)`.
- `DELETE /assets/:id/links/:linkId` requires the link to belong to that asset (returns 404 otherwise).

### Visibility / role model
- Internal admins see everything in the admin UI.
- `vendor_visible` + approved-or-released + isCurrent — what vendors see in supplier packet.
- `client_visible` — surfaced to client / partner views (existing partner portal).
- `internal_only` — never leaves the admin UI.
- Vendor packet endpoint hard-filters by visibility AND approval, so unapproved or internal assets never leak even if linked.

### Readiness heuristics
A line item is `productionReady` iff:
- if expected to need artwork → an `isCurrent`+`approved` primary_artwork link exists, AND
- if expected to need proof → an `isCurrent`+`approved` proof link exists, AND
- no `productionBlockedReason` set.
Expectations come from `fulfillmentMode` (`graphic_only` / `rental_plus_print` / `full` → needs artwork), product `capabilitiesJson` (`printable`, `proofRequired`), or presence of `brandingZoneId`.

### Versioning
- New version supersedes all prior in family (sets `isCurrent=false`, `status=superseded` for active prior states).
- Links carry forward to the new version.
- Version history surfaced via `GET /assets/:id` `versions[]`.

### Activity / audit
Every transition writes to `asset_events`. Surfaced in `GET /assets/:id.events` and `GET /asset-events`. Existing `supplier_status_events` is preserved unchanged.

### What's not in this pass (next phase)
- Outbound communications wiring (revision-requested → email, vendor-release → email). Hook points exist in `asset_events`.
- Client-facing asset upload page and missing-file reminder flows.
- Required-asset rules per product/zone (currently inferred from fulfillmentMode + capabilities).
- Seed data updated to demonstrate the new asset workflow.

## Workflow Automation & Orchestration (April 2026)

Layered on top of reconciliation, billing, fulfillment, supplier routing, and the asset/artwork workflow. Operational nerve center for the portal.

### Schema (`lib/db/src/schema/workflow.ts`)
- `workflow_rules` — name, triggerType, objectType, conditionsJson, actionsJson, priority, escalationLevel, isActive, isSystem.
- `workflow_tasks` — title, category, status (open/in_progress/snoozed/completed/cancelled), priority, deadlineHealth (on_track/due_soon/at_risk/overdue/blocked), escalationLevel, ownerUserId, dueDate, links to partner/event/order/orderItem/supplier/invoice/asset, autoCreated, sourceRuleId, dedupeKey.
- `workflow_alerts` — title, severity (info/warning/critical), message, links, isRead, isResolved, autoCreated, sourceRuleId, dedupeKey.
- `workflow_audit` — eventType (rule_fired, task_created, alert_created, task_completed, override_applied, etc.), summary, detailsJson, isAutomated, sourceRuleId, objectType/objectId, overrideNote.

### Engine (`artifacts/api-server/src/services/workflowEngine.ts`)
- `fire(triggerType, ctx)` loads active rules, evaluates conditions (`all`/`any` with eq/neq/gt/gte/lt/lte/in/exists/missing comparators), runs actions, audits everything.
- Action handlers: `create_task`, `create_alert`, `draft_communication`, `set_priority`, `flag_blocked`, `log_audit`.
- `{var}` interpolation in titles/messages from ctx.
- Dedupe by `rule:{ruleId}:{linkedObjectType}:{linkedObjectId}` — open/unresolved matches are skipped so re-firing is idempotent.
- 10 default rules seeded automatically when `workflow_rules` is empty (missing artwork follow-up, supplier unassigned, asset awaiting approval, revision follow-up, production blocked escalation, invoice sent confirmation, overdue invoice chase, event readiness check, deadline approaching vendor reminder, recon discrepancy follow-up).

### Deadline ticker (`services/deadlineMonitor.ts`)
- Boots at +5s, sweeps every 60s (configurable via `WORKFLOW_TICK_MS`).
- Sweeps invoices (overdue / due-soon by `dueDate`), orders (`supplierDueDate`), events (eventStartDate||installDate within 21d), and stale pending assets (>24h old).
- Fires `deadline.approaching` / `deadline.overdue` / `event.approaching` / `invoice.overdue` / `asset.awaiting_approval`.

### Hooks wired
- assets: `asset.uploaded`, `asset.approved`, `asset.revision_requested`.
- production block/unblock: `production.blocked` / `production.unblocked` with override-note audit.
- invoices: `invoice.sent` (on status patch), `invoice.overdue` (per-row in scan-overdue).
- orders submitted/approved + supplier assignment hooks: TODO (ticker compensates by sweeping `supplierDueDate`).

### Override flow
PATCH `/api/order-items/:id/production-block` accepts `overrideNote`. When clearing a blocked reason with a note, an `override_applied` audit entry is written carrying the note, visible in the activity log and rendered in the dashboard with an italic "Override:" caption.

### Backend routes (`/api/workflow/*`)
- `rules` — GET, POST, PATCH, DELETE, `:id/toggle`, `:id/duplicate`.
- `tasks` — GET (with filters: status, ownerUserId, partnerId, eventId, orderId, supplierId, invoiceId, assetId, autoCreated, deadlineHealth, escalationLevel, priority, status=open_any), POST, PATCH, `:id/complete`, `:id/snooze` (deadlineHealth recomputed on the fly).
- `alerts` — GET, `:id/read`, `:id/resolve`.
- `audit` — GET (filter by linked object).
- `queue` — consolidated counters + tasks + alerts for dashboard.
- `override` — manual override with required note.
- `fire` / `tick` — debug endpoints to manually fire triggers / run a sweep.

### Frontend
- `/admin/workflow` — orchestration dashboard with 7 counter cards (open, overdue, due_soon, urgent, escalated, alerts, critical) and tabs: All / Overdue / Due soon / Escalated / Alerts / Activity / Rules. Each task row shows priority badge, deadline-health badge, auto badge, escalation, category, due date, linked object, snooze (+1d), Done.
- `/admin/workflow/rules` — full CRUD grouped by trigger, JSON editors for conditions/actions, system-rule protection (no delete), enable/disable, duplicate.
- `TaskPanel` component embedded into OrderDetail and InvoiceDetail; lists open tasks for the record with quick complete / snooze / inline add.
- "Workflow" nav link added to AdminLayout.

### Role permissions
- All workflow routes are admin-protected via existing AdminRoute / requireAdmin chain. No partner-portal exposure.

### Next phase
- Wire `order.submitted` / `order.approved` / `supplier.assigned` hooks in orders/suppliers routes.
- Status guardrails service consumed by asset approval and invoice send.
- Per-portal-type rule scoping via `portalTypes` array.
- Owner assignment + email digest delivery.

## Executive Analytics & Profitability Intelligence (April 2026)

In-app analytics layer answering revenue, profitability, supplier performance, forecast, and operational risk questions for Super Admin / Internal Admin. Aggregates current operational tables (orders, orderItems, invoices, invoicePayments, partners, events, suppliers, packages, productCatalog, partnerBrandingLocations, cities, venues) — no separate warehouse.

### Service (`artifacts/api-server/src/services/analytics.ts`)
- `loadWorkspace(filters)` — single batched fetch, builds `Map`s for joins, applies order-level filters (date range, partner, portalType, cityId, supplierId, billingExecModel). Excludes `cancelled` orders.
- `orderMetrics(o, ws)` — per-order snapshot: retail, est/final cost, est/actual margin, expected/paid commission, commission variance, invoiced/collected/outstanding, blocked-item / shortage-item counts.
- `kpis(filters)` — totals + counts for Overview KPIs (retail, invoiced, collected, est/actual margin, commission variance, blocked, shortages, discrepancies, overdue invoices, upcoming and at-risk events) + status/billing-model breakdowns.
- `profitability(dimension, filters)` — buckets revenue + margin + commission by `partner | event | city | portalType | billingModel | supplier | package | zone | productCategory`. Package/zone/productCategory roll up at line-item level; others at order level.
- `supplierPerformance(filters)` — order-level revenue + cost + variance plus item-level blocked/shortage/missing-artwork/overdue/due-soon counts; computes `issueRate = (blocked+shortage+overdue)/items`.
- `packageAnalytics`, `zoneAnalytics`, `productAnalytics` — package/zone/product detail tables with retail, margin, qty, print-only vs full-unit demand mix, shortage/missing-artwork exposure.
- `forecast(filters)` — horizon buckets (next 30/60/90 days) by event start; pipeline stages derived from current state: `confirmed | awaiting_approval | awaiting_assets | awaiting_billing | at_risk | delayed`.
- `risk(filters)` — exposure across blocked orders, blocked items, shortages, missing artwork, unassigned items, overdue invoices, unreconciled, commission discrepancies, events approaching with readiness issues; computes `revenueAtRisk` (sum of retail tied to any order with a risk flag).
- `trends(filters, granularity)` — month/week/day buckets of retail, est/actual cost, est/actual margin, expected/paid commission.
- `toCsv(rows)` — generic CSV serializer used by export.

### Routes (`artifacts/api-server/src/routes/analytics.ts`, mounted at `/api`)
- `GET /api/analytics/kpis`
- `GET /api/analytics/profitability?dimension=...`
- `GET /api/analytics/suppliers`
- `GET /api/analytics/packages` · `/zones` · `/products`
- `GET /api/analytics/forecast`
- `GET /api/analytics/risk`
- `GET /api/analytics/trends?granularity=day|week|month`
- `GET /api/analytics/export?view=profitability|suppliers|packages|zones|products|trends&dimension=...`
- All endpoints accept the same filter set: `from`, `to`, `partnerId`, `portalType`, `cityId`, `supplierId`, `billingExecModel`.

### Frontend (`artifacts/a3-portal/src/pages/admin/Analytics.tsx`, route `/admin/analytics`)
- Single page with sticky filter bar and 6 tabs:
  - **Overview** — 16 KPI cards plus 4 charts (retail vs cost area, margin line, commission bars, status/billing pies).
  - **Profitability** — switchable across 9 dimensions; sortable table with margin %, commission variance, open A/R, average order value; CSV export.
  - **Suppliers** — top-5 by revenue + highest issue-rate bar charts; full performance table with cost variance and issue %; CSV export.
  - **Packages / zones / products** — three sortable tables with per-section CSV exports; product table shows print-only vs full-unit mix + shortage exposure.
  - **Forecast** — 30/60/90-day horizon cards (retail, est. cost, est. margin, expected commission, event count); pipeline stage table.
  - **Risk** — revenue-at-risk hero card, 9 risk count tiles, and 6 drill-list cards with deep-links into orders/invoices.
- All risk-list rows link into `/admin/orders/:id` or `/admin/invoices/:id` via wouter.
- Nav: "Analytics" item added to AdminLayout (BarChart3 icon), positioned between Workflow and Billing.

### Metric definitions (consistent across cards & tables)
- estimated gross margin = retail − supplier estimated cost
- actual gross margin = retail − (supplier final cost OR supplier estimated cost if final not yet recorded)
- commission variance = expected commission − paid commission
- revenue at risk = retail of any order with at least one blocked / shortage / missing-artwork item
- forecast retail = total retail of orders whose linked event start date falls inside the horizon
- open receivables = sum of `invoices.balanceDue` for non-cancelled invoices

### Role visibility
- Routes are mounted under the same router as workflow/reconciliation; the page is only registered behind `AdminRoute`, so only Super Admin / Internal Admin can reach it. Vendor and client roles never see the nav item or page. Per-partner partner-manager analytics are out of scope for this pass — server filters already accept `partnerId`, so partner-scoped surfaces can plug in later.

### Next phase
- Save filter views per user.
- Add city × billing-model heatmap and partner trend sparklines on the Overview tab.
- Wire forecast horizon cards to drill into the underlying order list.
- Per-partner-manager dashboard scoped to their partnerId (route-level role gate already supports it via filters).

## Launch Polish & Onboarding (April 2026)
### What was added
- **Schema**: `partners.launchStatus` (draft/preview/internal_only/live/paused), `launchedAt`, `launchOverrideNote`, `demoFlag`, `setupTemplate`. New `onboarding_progress` table tracking per-user step completion.
- **Backend (`launchReadiness.ts`)**: per-partner readiness checklist across Branding / Contacts / Locations / Catalog / Billing / Fulfillment / Rollout (blocker vs warning), platform-level readiness summary, and `setLaunchStatus()` that flips `partners.isActive` on live/paused transitions.
- **Routes (`/api/launch/*`, `/api/onboarding/*`)**:
  - `GET /api/launch/platform` — global readiness card data
  - `GET /api/launch/partner/:id` — per-partner checklist with completionPct, blocker/warning counts, readyToLaunch flag
  - `POST /api/launch/partner/:id/activate` — change launch state. Returns 409 + requiresOverride when blockers present and no `overrideNote` was supplied; the override note is persisted on `launchOverrideNote` and audited.
  - `GET/POST /api/onboarding/progress`, `POST /api/onboarding/dismiss` for first-use checklists.
- **Frontend**:
  - `/admin/launch` — multi-step Launch Wizard with sidebar nav and live platform-readiness card.
  - `RolloutChecklist` component embedded at the top of the partner edit page, showing status badge, progress bar, grouped checklist with deep-links, and an override-note dialog when launching despite blockers.
  - `LaunchBanner` on the Dashboard nudges admins toward the wizard until the first partner is live and platform readiness hits 100%.
  - Reusable `EmptyStateCard` for first-use empty states.
- **Nav**: "Launch" item (Rocket icon) in AdminLayout between Analytics and Billing.

### Launch state semantics
- **draft** — internal only, not addressable
- **preview** — private preview link sharable
- **internal_only** — staff sees portal, public does not
- **live** — fully launched (also flips `partners.isActive=true`)
- **paused** — temporarily disabled (flips `isActive=false`)

### Override flow
Launching a partner with outstanding blockers requires an `overrideNote` string. The note is stored on `partners.launchOverrideNote` and surfaced in the rollout checklist UI.

## Post-Launch Optimization Layer

Built on top of the launch system to track adoption, friction, feedback, and partner health after go-live.

**Schema (`lib/db/src/schema/usage.ts`)**
- `usage_events` — eventType, partnerId?, userId?, role?, objectType?, objectId?, meta jsonb, occurredAt. Indexed by partner+type+time.
- `feedback_items` — submitterUserId/Role, partnerId?, screenPath, category (ux/bug/performance/missing_feature/data/onboarding/billing/other), severity, message, status (new/triaged/in_progress/resolved/wontfix), tags[], assignedTo, internalNotes, resolvedAt.

**Services**
- `usageTracking.ts` — `emit(eventType, ctx)` (fire-and-forget), `emitFirst(eventType, ctx)` (idempotent per partner+type), `firstEventAt`, `summary`, `timeline`.
- `partnerHealth.ts` — `computePartnerHealth(partnerId)` returns `{status, score 0-100, signals[], metrics}`. Score blends launchReadiness, open workflow_tasks, unresolved alerts, recent activity, and staleness. Statuses: not_started / onboarding / live_fragile / active / healthy / at_risk.

**Usage hooks wired** — partners.ts (partner.created), orders.ts (order.submitted, first_order_submitted, order.status.*, first_order_completed), assets.ts (asset.approved, first_asset_approved), invoices.ts (invoice.sent, first_invoice_sent).

**Routes (`routes/postLaunch.ts`)**
- `/api/usage/{summary,timeline,emit}`
- `/api/feedback` GET/POST/PATCH/DELETE
- `/api/partner-health` (list) and `/api/partner-health/:id`
- `/api/post-launch/dashboard` — consolidated KPIs, health distribution, recent activity, feedback summary

**Frontend**
- `/admin/post-launch` — `PostLaunchDashboard`: KPI cards, health distribution, activity, feedback by category, sortable partner-health table.
- `/admin/feedback` — `FeedbackInbox`: filters, status updates, internal notes editor.
- `FeedbackButton` — floating widget mounted globally in `AdminLayout`; submits to `/api/feedback` with current screen path.
- `PartnerHealthBadge` — shared status pill.

## Commercialization Layer

A clean monetization architecture sitting on top of operational partner data. Lets one platform support: internal-managed portals, partner-branded portals, full white-label, enterprise multi-location accounts, and reseller hierarchies.

**Schema (`lib/db/src/schema/commercialization.ts`)**
- `commercial_accounts` — name, slug, accountType (internal/managed/white_label/reseller/enterprise), parentAccountId (self-FK for hierarchy), planId, brandingPackageId, whiteLabelLevel (none/partial/full), brandingJson, commercialStatus (trial/active/paused/suspended/internal/beta), startDate/renewalDate/contractTerm, seatAllowance, portalInstanceAllowance, billing entity/contact, accountManager, internalRevenueOwner, monetizationNotes.
- `commercial_plans` — code, name, tier (internal/starter/pro/enterprise/white_label_premium), pricingModel (flat_monthly/flat_annual/per_portal/per_seat/per_event/custom), priceAmount, includedLimitsJson, featureFlagsJson.
- `branding_packages` — level (basic/partial/full), allowsCustom{Logo,Colors,Domain,Emails,InvoiceBranding}, hidesPoweredBy, defaultBrandingJson.
- `account_subscriptions` — accountId, planId, status, startDate, renewalDate, billingContact, contractNotes, invoiceStatus, lastInvoicedAt, nextReminderAt. (Separate from operational event invoices.)
- `account_usage_limits` — accountId, limitKey (partners/users/events/suppliers/portals/automation_rules/exports), allowance, currentUsage, hardLimit, warningThresholdPct, lastComputedAt. Cached and recomputed on demand.
- `partners.commercialAccountId` — additive nullable link; partners can stand alone or roll up under a commercial account without breaking existing data.

**Service (`services/commercialization.ts`)**
- `FEATURE_KEYS` and `LIMIT_KEYS` are the single source of truth for feature gating and usage caps.
- `DEFAULT_PLAN_PRESETS` ships starter/pro/enterprise/white-label/internal presets; `/api/commercial/plans/seed-defaults` materializes them once.
- `getEffectivePlan(accountId)` resolves the plan, walking up to the parent account when the child has none.
- `getEntitlements(accountId)` returns a flat boolean map; internal accounts always get every feature.
- `recomputeUsage(accountId)` upserts current vs allowance counts for the limit keys.
- `listAccountsWithRollup` and `getDashboardSummary` power the command-center view (plan mix, status mix, type mix, near-limit count) without N+1 per-account compute.

**Routes (`routes/commercialization.ts`)**
- `/api/commercial/plans` GET/POST/PATCH + `/seed-defaults`
- `/api/commercial/branding-packages` GET/POST/PATCH
- `/api/commercial/accounts` GET/POST/PATCH/DELETE, `/:id` (full detail with plan/branding/entitlements/usage/children/subscriptions/partners), `/:id/recompute-usage`, `/:id/link-partners`
- `/api/commercial/entitlements/account/:id` and `/entitlements/partner/:id` (resolves via `partners.commercialAccountId`)
- `/api/commercial/dashboard` — KPI rollup
- `/api/commercial/feature-keys` — exposes the canonical feature/limit key lists for client gating UI

**Frontend (admin only)**
- `/admin/commercial` — `CommercialDashboard`: KPI cards (accounts, trial, white-label, paused, near-limit), plan/status/type distribution bars, accounts table with badges.
- `/admin/commercial/accounts/:id` — `CommercialAccountDetail`: editable commercial settings (separate from partner ops settings), plan card, usage bars with warning thresholds, feature entitlements grid (check/lock per feature), child accounts, linked partners. Accepts `id="new"` for creation flow.
- `/admin/commercial/plans` — `CommercialPlans`: plan tier cards with limits and feature gating preview.
- Nav: "Commercial" entry (Crown icon) in `AdminLayout`.

**Role-safety** — All `/api/commercial/*` routes are admin-only (registered in the admin router; no partner/vendor exposure). Internal revenue ownership and monetization notes never leak to partner/vendor surfaces.

**Demo scenarios seeded** — A3 Internal, Hilton White-Label (full), Move Miami Enterprise (multi-loc), BetaCo Trial, Acme Paused. Realistic plan/status/branding mix for sales conversations.

### Recommended next phase
**Plan-aware enforcement & soft-limit UX.** The architecture is in place but feature gating is currently informational only. Next pass should: (a) wire `checkFeature()` into a small set of high-value gates (analytics, automation, white-label settings page) so locked features render `FeatureGate` empty states instead of fully-rendered modules, (b) add soft-limit warnings on creation flows (events/partners/users) that read against `account_usage_limits`, (c) introduce a lightweight Stripe-ready billing connector for the subscription table so trial→active conversion and renewal reminders can fire automatically.

## Sales Enablement & Demo Layer

A presentation/activation layer on top of the commercialization architecture. Designed for closing deals, walking prospects through polished demos, and converting sold accounts into live ones.

**Schema additions (`lib/db/src/schema/commercialization.ts`)**
- `commercial_plans` extended: `setupFee`, `addonPricingJson`, `prospectFacingDescription`, `internalMarginNotes` (internal-only).
- `commercial_accounts` extended: `activationStatus` (lead → proposal_prepared → in_review → approved → activating → active, plus paused/suspended), `demoReady` boolean, `salesNotes`, `lastDemoAt`.
- New `proposals` table: title, prospect name, linked accountId, status (draft/in_review/sent/accepted/declined), recommendedPlanId, comparedPlanIds[], packagingNotes, internalNotes (hidden in demo mode), prospectFacingNotes, createdBy, sentAt, decidedAt.
- New `activation_checklist_items`: per-account ordered checklist (10-item default template), status (pending/in_progress/done/skipped), assignedTo, notes, completedAt.

**Service (`services/salesEnablement.ts`)**
- `DEFAULT_CHECKLIST_TEMPLATE` — 10-step activation checklist (contract signed, branding assets, primary domain, admin user, plan applied, supplier routing, billing setup, sample data, demo walkthrough, go-live).
- `seedActivationChecklist(accountId)` — idempotent: only inserts missing items.
- `getActivationProgress(accountId)` — returns items + counts + percentage.
- `advanceActivationStatus(accountId, target)` — validated transitions (forward only, plus operational pause/resume/suspend); auto-syncs `commercialStatus` for paused/suspended/active.
- `buildPlanComparisonMatrix(planIds)` — returns plans + features × plans grid + limits × plans grid using `FEATURE_KEYS` and `LIMIT_KEYS`.
- `getSalesPipelineSummary` — totals (accounts, proposals, demo-ready, WL prospects, enterprise prospects, active), distribution by activation status, distribution by proposal status, ordered activation queue, recent proposals, demo-ready accounts.
- `SHOWCASE_PRESETS` — curated preview routes with audience tags (Investor demo, White-label sales call, Enterprise buyer demo, Operational demo, Internal stakeholder).

**Routes (`routes/salesEnablement.ts`)**
- `/api/sales/dashboard` — pipeline summary
- `/api/sales/showcase` — curated preview catalog
- `/api/sales/proposals` GET/POST, `/:id` GET/PATCH/DELETE (GET returns proposal + comparison matrix + recommended plan + linked account)
- `/api/sales/comparison-matrix` POST `{planIds}` — ad-hoc comparison without saving
- `/api/sales/accounts/:id/activation` GET (account + progress + template)
- `/api/sales/accounts/:id/activation/seed` POST — seeds default checklist
- `/api/sales/accounts/:id/activation/advance` POST `{status}` — validated transition
- `/api/sales/activation-items/:itemId` PATCH — update status/assignedTo/notes
- `/api/sales/constants` — exposes activation/proposal status enums

**Frontend**
- `DemoModeContext` + `DemoModeProvider` — persisted in `localStorage:a3:demoMode`. `useDemoMode()` hook + `useDemoSafe()` helper for conditional fields.
- `DemoModeBanner` — orange gradient banner pinned above header when active. Includes Exit button.
- `DemoModeToggle` — small switch in admin header (always visible to internal admins).
- `/admin/sales` — Sales Command Center with KPI cards (accounts/active/proposals/demo-ready/WL prospects/enterprise prospects) and tabs: Activation pipeline, Proposals, Demo-ready, Showcase.
- `/admin/sales/proposals/:id` — Proposal detail (title, prospect, linked account, status, packaging notes, prospect-facing notes, internal notes hidden in demo mode), plan picker with recommended-marker, full comparison matrix, print-friendly layout.
- `/admin/sales/proposals/new` — supports new-proposal flow; redirects to `/:id` on save.
- `/admin/sales/activation/:accountId` — activation workflow: status display + advance picker (validated server-side), checklist UI with click-to-advance state machine (pending → in_progress → done → pending), progress bar.
- `/admin/sales/showcase` — curated preview routes catalog with audience tags + tip about toggling demo mode before opening.
- `PlanComparisonTable` reusable component — features × plans matrix with check/X cells, limit allowances, recommended badge highlighting, internal-margin notes hidden in demo mode.
- `ActivationChecklist` reusable component — checklist with status icons, click-to-advance, progress bar, seed-defaults flow.
- `CommercialAccountDetail` extended with `activationStatus` select, `demoReady` toggle, `salesNotes` textarea.
- Nav: "Sales" entry (Briefcase icon) added to AdminLayout.

**Demo mode behavior**
- Hides internal margin notes on plans, internal notes on proposals.
- Banner clearly indicates demo mode is active.
- Toggle persisted across sessions (localStorage); never affects server data — purely client view.
- Internal-only fields (monetization notes, internal revenue owner) remain in account settings since those screens are admin-only, but proposals exposed to prospects in print/preview hide internal notes when demo mode is on.

**Activation transitions** are forward-only by default (lead → proposal_prepared → ... → active), with two operational exceptions:
- Pause/resume/suspend can flow between paused, suspended, and active in any direction.
- Resume from paused/suspended → activating or active is allowed.
- Backward transitions (e.g., `active → lead`) return 400.

**Demo data seeded**
- Hilton White-Label and Move Miami Enterprise marked demo-ready and active.
- BetaCo Trial advanced to in_review, then approved (demonstrating transition validation).
- NewVenue Pilot account in `activating` state with 6/10 checklist items done (60% progress).
- Two proposals: "Hilton Multi-Brand Expansion" (in_review, comparing Pro/Enterprise/WL Premium with WL Premium recommended) and "BetaCo Trial → Annual" (draft).

### Recommended next phase
1. Wire `useDemoMode()` into a few high-noise admin screens (workflow logs, deck extractions, analytics drill-downs) so demo mode visibly cleans them up — the architecture is in place but most operational screens haven't been gated yet.
2. Add a print stylesheet + a "Send to prospect" action on proposals that generates a clean PDF/print view (the print button currently uses browser print; styling hides the edit panes via `print:hidden` but a dedicated print layout would polish this).
3. Optional: a "Reset demo data" admin action to make scenario switching during back-to-back demos friction-free.

## Phase: Stabilization, Objections, Blocker Intelligence, FAQ (April 2026)

This layer extends — not replaces — the existing commercial/sales surfaces. Three new tables, one new router, one new top-level domain (`/admin/rollout`), one new help domain (`/admin/help`), and two new pages under `/admin/sales`.

### Schema (`lib/db/src/schema/stabilization.ts`)
- **`objections`** — category (12 enum: pricing, implementation, speed, security, integration, support, competition, scope, contract, branding, technical, other), status (open / in_review / resolved / won / lost), accountId, proposalId, summary, recommendedResponse (auto-suggested from `RECOMMENDED_RESPONSES` map keyed by category), tags, internalNotes, followUpNeeded.
- **`demo_followups`** — accountId, status (open / in_progress / completed / lost), outcome (strong_interest / warm / cold / closed_won / closed_lost), interestAreas[], objectionSummary, recommendedPlan, whiteLabelInterest (none / partial / full), activationReadiness (ready / needs_branding / needs_contract / blocked), priorityFeatures[], nextStep.
- **`faq_entries`** — audience (internal / partner / client), category (10 enum: sales, billing, onboarding, branding, ordering, shipping, artwork, support, rollout, other), question, answer, sortOrder, isActive.

### Services
- `services/objections.ts` — list/filter/CRUD plus `summarizeObjections()` (totals, by category, by status, follow-up count). Constants exported: `OBJECTION_CATEGORIES`, `OBJECTION_STATUSES`, `RECOMMENDED_RESPONSES`.
- `services/rolloutStabilization.ts` — `computeAccountBlockers(accountId)` runs a per-account scan and emits typed blocker objects (kind: missing_partner / missing_branding / no_packages / inactive_partner / no_white_label_settings / paused / suspended / stalled / activation_incomplete) with severity (low / medium / high / critical). It joins commercial accounts to partners via `partnersTable.commercialAccountId` first, then a slug-heuristic fallback. `getStabilizationDashboard()` aggregates totals (accounts, active, inActivation, stalled, paused, flagged, openFollowups), inActivation queue, stalled list, flaggedAccounts (severity-sorted), and recent followups.
- `services/faq.ts` — `listFaq({audience?, category?, includeInactive?})`, plus `FAQ_AUDIENCES` and `FAQ_CATEGORIES` constants.

### Routes (`routes/stabilization.ts`, mounted under `/api`)
- `GET/POST /api/objections`, `GET/PATCH/DELETE /api/objections/:id`, `GET /api/objections/summary`, `GET /api/objections/constants`
- `GET/POST /api/demo-followups`, `GET/PATCH/DELETE /api/demo-followups/:id`
- `GET/POST /api/faq`, `PATCH/DELETE /api/faq/:id`, `GET /api/faq/constants`
- `GET /api/rollout/stabilization` — dashboard summary
- `GET /api/rollout/account/:id/blockers` — per-account drilldown (account, blockers, partner, packageCount, openFollowups, openObjections)

### Frontend
- `/admin/rollout` (RolloutStabilization) — KPI cards + tabs: Flagged / In activation / Stalled / Follow-ups. Each row links to drilldown.
- `/admin/rollout/account/:accountId` (AccountBlockers) — full blocker list grouped by severity, partner status, package counts, related objections + followups.
- `/admin/sales/objections` (ObjectionsBoard) — status-filter tabs, sheet-based create/edit. Selecting a category auto-fills `recommendedResponse`.
- `/admin/sales/followups` (DemoFollowups) — sheet editor with status/outcome/white-label/readiness selects + interest-areas + priority-features chips.
- `/admin/help` (HelpFaq) — audience tabs (internal / partner / client), category filter, full CRUD.
- `BuyerHelpDrawer` — reusable Sheet that surfaces FAQ filtered by audience. When demo mode is active, defaults audience to `client` so prospects only see safe content.
- `BlockerBadge` — color-coded readiness chip (critical / high / medium / low / none).

### Audience layering for FAQ
- `internal` entries are admin-only — never surfaced through `BuyerHelpDrawer` when demo mode is on.
- `partner` is the default audience for partner-portal contexts.
- `client` is the safest tier — used in demo mode and for buyer-facing surfaces.

### Blocker computation contract
A blocker is any condition that prevents an account from reliably operating in production. Severities cascade: `critical` (no partner / suspended) > `high` (no packages / no branding for white-label / paused active account) > `medium` (stalled in activation, partner inactive) > `low` (incomplete checklist items in activation).

### Seed
- 5 objections across all 5 statuses and 5 categories.
- 3 demo follow-ups (in_progress strong_interest / open warm / completed closed_won).
- 12 FAQ entries (4 per audience).
- Existing demo accounts unchanged; stabilization dashboard reflects them automatically (Hilton/MoveMiami active, BetaCo activating, Acme paused, NewVenue activating).

### Nav
- Added "Rollout" (ShieldCheck) and "Help" (HelpCircle) entries to AdminLayout sidebar.

---

## Measurement / Units Model (April 2026)

International support for both imperial and metric across the portal — extended, not rebuilt.

### Storage
- `unit_preference` (text, nullable, `imperial`|`metric`) on: `partners`, `commercial_accounts`, `venues`, `events`.
- `country` (text, nullable, ISO-2) on `venues` (e.g. `GB`, `FR`, `DE`).
- Structured dimension columns on `partner_branding_locations`, `packages`, `product_catalog`:
  - **Original entry:** `size_width`, `size_height`, `size_depth`, `size_diameter` (doubles) + `size_unit` (one of `in`, `ft`, `mm`, `cm`, `m`; legacy strings like `inches` / `feet` / `meters` are normalized via `normalizeUnit`).
  - **Canonical base:** `size_width_mm`, `size_height_mm`, `size_depth_mm`, `size_diameter_mm` — populated automatically at insert/update by the `withMmColumns()` helper in `lib/db/src/units.ts`. Use these for cross-unit sorting/comparison/filtering.
- The original entered value+unit is always preserved alongside the normalized mm value, so admin views can show either.

### Cascade resolution (most → least specific)
1. `event.unitPreference`
2. `venue.unitPreference`
3. Venue country → if not US/CA/LR/MM, default `metric` (overseas rule)
4. `partner.unitPreference`
5. `commercial_account.unitPreference`
6. Hard default: `imperial`

Implemented in `lib/db/src/units.ts → resolvePreference()` and exposed at `GET /api/units/resolve?eventId|venueId|partnerId|accountId` which returns `{ system, source, reason, context }`.

### Conversion
- All conversions go through millimeters as the canonical base inside `convert(value, from, to)`.
- `formatDimension(value, unit)` and `formatWxH(w, h, unit, prefSystem?)` render values, optionally re-expressed in the resolved system.
- `pickDisplayUnit(unit, system)` picks a friendly display unit (e.g. `m` for large metric, `ft` for large imperial).

### UI
- `components/units/DimensionInput.tsx` — width/height + optional depth + optional diameter numeric inputs + unit selector. Placeholders are unit-aware (`e.g. 200 cm` vs `e.g. 78.74 in`) and a live "≈ … (preferred)" hint appears when entered values are in a different system from the resolved preference. Used in: Branding Locations, Product Catalog, and Packages editors.
- `UnitPreferenceSelect` — small "Inherit / Imperial / Metric" select used on Venue, Event, Partner, and Commercial Account editors.
- Mirror client lib at `artifacts/a3-portal/src/lib/units.ts`.

### Where the preferred unit is shown downstream
- **Client portal (`FullPortal.tsx`)** — venue branding sizes are rendered with `formatWxH(..., preferredSystem)` after a one-shot `GET /api/units/resolve?partnerId=...` call, so a UK partner sees the same zone in metric while a US partner sees it in imperial.
- **Supplier packet (`/api/orders/:orderId/supplier-packet/:supplierId`)** — the route runs the cascade (event → venue → venue.country → partner → default), attaches a `measurementContext` block to the response, and pre-formats each line item's `dimensionDisplay` in the supplier's relevant unit, so an overseas event prints metric on the production handoff sheet.

### Seed
- London city (`country=GB`), `ExCeL London` venue (`country=GB`, `unit_preference=metric`), `London Activation 2026` event (`unit_preference=metric`), and a `London Stage Backdrop (2 m × 1 m)` branding location were inserted directly under partner `move-miami` for demo/QA of the metric path.
- A metric product `Metric Pop-Up Banner 200cm` (200 × 100 cm, normalized to 2000 × 1000 mm) was added to `product_catalog`.
- A sample custom request (`Globex EU` / `London Activation 2026`) with one `request_items` row sized `2 m × 1 m (metric)` demonstrates the overseas custom-fabrication path.
- All seeded via direct SQL — not part of `scripts/src/seed.ts`; persists in the live DB.

---

## Final Overview (Handoff)

### Architecture summary
- **Monorepo (pnpm workspaces).** Three artifacts: `api-server` (Express + drizzle, port 8080), `a3-portal` (React + Vite + wouter, served via proxy), `mockup-sandbox` (design previews). Shared packages under `lib/` (`db`, `ui`, etc.).
- **Database.** Single Postgres (Neon). Schema in `lib/db/src/schema/*`. Use `pnpm --filter @workspace/db run push-force` to sync. Never write manual migrations.
- **Auth.** Clerk on the frontend; the API trusts Clerk session via middleware and resolves the internal `user` record by Clerk ID. Roles: `super_admin`, `admin`, `account_manager`, `partner_admin`, `partner_user`, `supplier`, `client`.
- **Object storage.** Replit App Storage via `DEFAULT_OBJECT_STORAGE_BUCKET_ID` / `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS`. Used for artwork uploads and asset library.
- **Email.** Resend (integration installed). Requires `RESEND_API_KEY` in production.
- **Background work.** `services/deadlineMonitor.ts` ticks every 60s and emits `deadline.approaching` / `deadline.overdue` events for orders and events. Filtering is done in JS to avoid a previously seen drizzle/bundle interaction with `supplierDueDate`.

### Modules (admin)
- **Accounts / Partners / Venues / Suppliers** — CRM core; partner-account-manager assignments, white-label level (`none` / `partial` / `full`), demo-vs-live flag.
- **Catalog** — packages, categories, cities, partner overrides.
- **Orders** — partner and client orders, fulfillment states, supplier assignment, artwork files, notes.
- **Billing & Reconciliation** — execution model resolved per-order from partner default + override; commission tracking, payouts, reconciliation status.
- **Assets** — quote assets and asset library; object-storage backed.
- **Sales** — objections board, demo follow-ups.
- **Rollout / Stabilization** — flagged / activating / stalled accounts, blocker drilldown, **printable activation brief** on `AccountBlockers`.
- **Help / FAQ** — audience-tiered (`internal` / `partner` / `client`); `BuyerHelpDrawer` uses `client` tier in demo mode.
- **Operator Runbook** (`/admin/help/runbook`) — module purpose, configure-first order, "what to check when X breaks" triage, configuration map.
- **Deployment Readiness** (`/admin/deployment`) — env-var presence, integration health, data summary, pre-deploy checklist, `readyToDeploy` boolean.

### Role model (summary)
- **super_admin / admin** — full portal access.
- **account_manager** — accounts they own, related partners/orders/billing.
- **partner_admin / partner_user** — their partner's catalog, orders, branding; no cross-partner data.
- **supplier** — only orders assigned to them; can update fulfillment state and supplier costs.
- **client** — buyer flows only (event, package selection, artwork upload, order status).

### Billing & commercialization
- Each partner has a default **billing execution model** (`a3_collects` / `partner_collects` / `passthrough`).
- Each order resolves an effective model + source (`partner_default` vs `order_override`).
- Commission is recorded as `expectedCommission` and accrues to `paidCommission` with status (`unpaid` / `partially_paid` / `paid`).
- Supplier payable status is tracked separately from commission/payout/reconciliation.
- Reconciliation page surfaces mismatches and lets finance reconcile manually.

### Deployment expectations
- Use **Deployment Readiness** page or `GET /api/deployment/readiness` to confirm `readyToDeploy: true` before publishing.
- Required for green: `DATABASE_URL`, `SESSION_SECRET`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, `RESEND_API_KEY`, plus Clerk publishable/secret keys configured on the frontend.
- The readiness endpoint also reports demo-vs-live account counts and surfaces a warning when only demo data is present.
- Deploy via the Replit deploy flow; the API server binds `PORT` and the portal is served behind the workspace proxy.

### Operator quick-reference
- New partner can't create orders → check `Rollout → Account` blockers and the **Activation Brief**; usually missing branding (white-label), packages, or a paused state.
- Order stuck "awaiting supplier" → Orders detail → assign supplier → `supplierDueDate` will be picked up by the deadline monitor on the next tick.
- Buyer asks a question → use the in-app help drawer (already filtered to `client` tier when in demo mode); add new entries via `/admin/help`.
- New objection from sales → `/admin/sales/objections`; selecting a category auto-fills a recommended response.
- Pre-launch checklist → `/admin/deployment`.
- "How do I do X?" → `/admin/help/runbook`.

### Known limitations
- Live email delivery requires `RESEND_API_KEY`; without it, the deployment readiness page will refuse to flip to ready.
- Deadline monitor uses a JS filter pass over `orders` (small table today); if order volume grows substantially, restore a SQL-side filter once the prior bundling issue is re-investigated.
- Demo accounts are identified by slug heuristic (`acme` / `betaco` / `newvenue`); a dedicated `is_demo` flag would be cleaner but is not required for handoff.
- No automated test suite is wired into CI; verification is manual + e2e via the testing skill.
- Reconciliation is read/markup only — no double-entry ledger.
