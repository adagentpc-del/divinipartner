# A3 Partner Commerce Portal

## Overview

The A3 Partner Commerce Portal is a full-stack web application evolving into a comprehensive multi-supplier commerce platform for A3 Visual. It supports diverse partner types, including branding partners with venue branding maps and multi-step intake forms, and ordering partners with full ordering workflows for cities, venues, events, tiered packages, and order tracking. Key capabilities include advanced quote ingestion and catalog intelligence, self-service onboarding, reusable hardware and asset inventory management, an order fulfillment engine with multi-supplier routing, and a comprehensive ERP, export, and reconciliation layer. The platform also features selective billing, invoice workflows, unified asset and production workflows, advanced automation, executive analytics, profitability intelligence, and sales enablement. Internationalization with a flexible measurement/units model is also supported.

## User Preferences

I prefer iterative development, so please break down large tasks into smaller, manageable steps. Before making any major changes or implementing new features, please ask for my approval. Ensure clear and concise communication, avoiding overly technical jargon where simpler language suffices. I value detailed explanations for complex decisions or architectural changes.

## System Architecture

The A3 Partner Commerce Portal is built as a `pnpm workspace monorepo` using TypeScript.

**Technology Stack:**
- **Monorepo**: pnpm workspaces
- **Backend**: Node.js 24, Express 5, PostgreSQL with Drizzle ORM
- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Authentication**: Clerk (admin-only)
- **Email**: Resend
- **AI**: OpenAI (gpt-4o-mini for summaries)
- **Storage**: Replit Object Storage
- **Validation**: Zod, `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild

**Core Architectural Patterns & Design Decisions:**

1.  **Monorepo Structure**: Organizes the application into distinct `api-server` and `a3-portal` packages, with shared libraries for code reuse.
2.  **Database Design**: PostgreSQL with Drizzle ORM, featuring a comprehensive schema for partners, suppliers, orders, inventory, assets, workflows, and billing.
3.  **API-First Approach**: RESTful APIs under `/api` with OpenAPI specification and Orval codegen for consistency.
4.  **Quote Ingestion & Catalog Intelligence**: System for converting raw supplier data into structured catalog entries.
5.  **Modular Frontend**: React with Vite and Tailwind CSS, featuring a dark navy and warm gold aesthetic, Inter typography, rounded card layouts, and partner-specific theme customization.
6.  **Inventory Management**: Real-time reusable inventory system with asset tracking, reservation, and shortage detection, including rentable assets with date-based blackout capabilities.
7.  **Order Fulfillment Engine**: Automated supplier routing, item-level assignments, and integration with inventory reservations.
8.  **Reconciliation & Billing**: Supports various payment models, commission tracking, discrepancy management, and formal invoicing with multi-currency and VAT/tax handling.
9.  **Asset Management Workflow**: Structured asset table with versioning, approval workflows, and polymorphic ownership.
10. **Workflow Automation & Orchestration**: Rule-based automation for triggers, conditions, and actions.
11. **Analytics & Profitability Intelligence**: Aggregates operational data for KPIs, profitability breakdowns, and performance tracking.
12. **Sales Enablement & Commercialization**: Supports monetization, feature gating, sales workflows, and onboarding tracking.
13. **Internationalization & Logistics**: Flexible measurement/units model for imperial and metric conversions, with logistics details for products and orders.
14. **Security**: Includes file upload validation, SSRF mitigation, error handling, and CSV sanitization.
15. **Bulk Import**: Unified wizard for importing suppliers, products, product specs, venues, branding zones, zone measurements, and vendor packages (CSV/XLSX/PDF) with auto-mapping, validation, and error reporting. AI-driven PDF extraction for packages includes cost-reduction strategies like deduplication and chunking.
16. **Product Families & Reusable Hardware**: Connects hardware base items with components, providing live availability based on inventory, and automatically adjusting ordering modes (component vs. full unit required) based on hardware availability.
17. **Admin Navigation**: Restructured into primary tabs and grouped dropdowns for improved UX on large screens, collapsing to a grouped sheet drawer on smaller screens.
18. **Canonical Public Domain**: Uses `PUBLIC_APP_URL` as the canonical public origin for all customer-facing links, with automatic redirection from internal Replit hostnames.
19. **Operational Email Delivery & Routing**: Multi-recipient email routing based on roles (ops, finance, partner contact, vendor) with per-partner configuration and delivery visibility for each order.
20. **Order Exceptions & Artwork Workflow**: Implements an order-level exception state machine with structured categories and a dedicated artwork-needed flag and brief, improving visibility on dashboards and internal communications.
21. **Role-based Partner Contacts**: Manages partner contacts with specific roles (primary, billing, graphic designer, support) and primary designation per role, allowing for accurate routing of communications and tasks.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Clerk**: Authentication and user management (admin-only).
-   **Resend**: Email delivery service.
-   **OpenAI**: AI integration for tasks like request summaries and PDF parsing.
-   **Replit Object Storage**: Cloud storage for file uploads.
## Section 34 — Production security hardening (April 23, 2026)

### What we built
- **`lib/securityConfig.ts`**: single source of truth for every secret the app cares about. Each entry is tagged `required | recommended | optional | unused` with a plain-English purpose. Never reads or returns the value — only presence + length bucket.
- **Boot-time check**: `assertRequiredSecrets()` runs in `app.ts`. In production, missing required secrets throw and the process exits; in dev they only warn.
- **`middlewares/requireAdmin.ts`**: Clerk-backed gate. When `ADMIN_ALLOWED_EMAILS` is set, the user's primary Clerk email must match the comma-separated allowlist; otherwise any signed-in user is admitted (open-beta posture, surfaced as a warning in the readiness UI).
- **`middlewares/rateLimit.ts`** with `express-rate-limit`: `loginLimiter`, `orderSubmitLimiter` (20/10min/ip on `POST /public/partners/:slug/orders`), `uploadLimiter` (60/min/ip on `POST /storage/uploads/request-url`), `publicWriteLimiter` (30/min/ip on public portal POSTs and onboarding submit).
- **`middlewares/errorHandler.ts`**: final express handler. Logs full error via the structured logger (cookies + Authorization already redacted), but in production responds with sanitized text only — no stack traces, no `err.message` for 5xx.
- **`app.ts` hardening**: `helmet()` (HSTS, no-sniff, frame-deny, referrer-policy), `trust proxy: 1` for accurate `req.ip` behind Replit's edge, CORS narrowed to `getAllowedOrigins()` (`ALLOWED_ORIGINS` env + `PUBLIC_APP_URL` + dev domains).
- **Upload restrictions** in `routes/imports.ts`: multer `fileFilter` rejects non-spreadsheet mimetypes before bytes are read; `safeFilename()` strips `originalname` to `[a-zA-Z0-9._-]` and caps at 120 chars before any logging or downstream use; 10 MB cap, single file per request. Object storage signing route already enforces 25 MB + content-type allowlist.
- **`/api/security/readiness`**: admin-only endpoint returning the structured readiness report (secrets inventory, network policy, upload limits, rate limits, admin posture, error sanitization status).
- **Admin page `/admin/security`**: SPA view rendering the readiness report — secrets table with status badges, summary tiles for missing/weak counts, sections for network, uploads, rate limits, and error handling.

### Security model
- **Authentication**: Clerk (no server-side sessions; `SESSION_SECRET` is intentionally unused and reported as such).
- **Admin access**: Clerk auth + optional `ADMIN_ALLOWED_EMAILS` allowlist enforced via `requireAdmin()`. Open-beta posture (any signed-in user is admin) is surfaced as a banner warning in the readiness page.
- **Public surface (no auth)**: `/api/healthz`, `/api/public-config`, `/api/public/*` (partner portal reads + order submit), `/api/onboarding/submit`, `/api/invoices/public/:token`, `/api/storage/public-objects/*`, `/api/imports/template/*`. All write paths are rate-limited.
- **Errors**: production responses never include stack traces or 5xx detail. Logs always redact cookies and Authorization headers (`lib/logger.ts`).

### Required vs. unused secrets (canonical list lives in `lib/securityConfig.ts`)
- **Required**: `DATABASE_URL`, `PUBLIC_APP_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`.
- **Recommended**: `ADMIN_ALLOWED_EMAILS` (lock the admin surface), `ALLOWED_ORIGINS` (CORS allowlist), `EMAIL_REPLY_TO`, `INTERNAL_ORDER_EMAILS`.
- **Optional / not currently integrated**: `SESSION_SECRET`, `ENCRYPTION_KEY`, `EMAIL_FROM` (alias of `RESEND_FROM_EMAIL`), `CANONICAL_DOMAIN` (alias of `PUBLIC_APP_URL`).
- **Unused**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` — PayPal isn't integrated in this build.

### Conventions kept
- No new database tables. Readiness is computed live from `process.env`.
- No secret values are ever serialised — only `present | missing | weak | unused` plus a length bucket like `≥64 chars`.
- Existing route-level `getAuth(req)` checks are left in place; `requireAdmin()` is additive.

## Section 33 — Bare-slug partner share URLs on canonical domain (April 23, 2026)

### What we built
- **Routing** — `artifacts/a3-portal/src/App.tsx`: added a top-level `/:slug` wouter route that renders `PartnerPortal`. Placed last in the `Switch` so all admin/auth/public-utility routes (`/admin/*`, `/login`, `/onboard`, `/invoice/:token`, `/partner/:slug`) match first. The legacy `/partner/:slug` route is kept as a back-compat alias.
- **Reserved slugs** — `artifacts/api-server/src/routes/partners.ts`: tightened `slugSchema` to `^[a-z0-9][a-z0-9-]*$` (max 64 chars) and added a `RESERVED_SLUGS` blocklist (`admin`, `login`, `onboard`, `partner`, `invoice`, `api`, `__clerk`, `assets`, `public`, `static`, `favicon.ico`, `robots.txt`, plus a few sign-in variants) so a partner can't be created with a slug that would shadow a real route.
- **Canonical link UI** — `artifacts/a3-portal/src/pages/admin/PartnersList.tsx`: new `PartnerShareLink` helper fetches `/api/public-config` and renders the share link as `partnershipportal.co/<slug>` (or `/<slug>` until `PUBLIC_APP_URL` is configured), with an inline copy-to-clipboard button. `PartnerForm` slug helper text and "Preview" anchor switched to bare slugs. `SalesCommandCenter` preview link likewise.
- **Backend link emitters** — `artifacts/api-server/src/services/launchReadiness.ts`, `services/rolloutStabilization.ts`, and the `SHOWCASE_PRESETS` in `services/salesEnablement.ts` now emit `/<slug>` instead of `/partner/<slug>` so checklist links and demo presets stay on the canonical pattern.
- **Env / domain** — added `PUBLIC_APP_URL` secret (`https://www.partnershipportal.co`); `getPublicUrlInfo()` now reports `source: "PUBLIC_APP_URL"` and `isCustomDomain: true`, so all email links + share-URL UI inherit the canonical host automatically. Customer still needs to point `www.partnershipportal.co` DNS at the Replit deployment for production traffic.

### How it works
- Admin opens a partner → "Preview" or the share-link cell goes to `https://www.partnershipportal.co/<slug>` (full URL on copy, host-stripped display in the table).
- Public visitor hits `www.partnershipportal.co/<slug>` → wouter falls through admin/auth routes and matches `/:slug`, rendering `PartnerPortal`. Unknown slugs render the existing not-found behaviour from `PartnerPortal`.
- Legacy `/partner/<slug>` URLs in the wild still resolve.

## Section 32 — Operational alerts, retention markers & inactive partner visibility (April 23, 2026)

### What we built
- **Schema** — `lib/db/src/schema/partners.ts`: added `archivedAt` (timestamp) + `archivedReason` (text). Asset retention reuses existing `assets.status='archived'`. No data migration required (`pnpm --filter @workspace/db run push --force`).
- **Backend** — `artifacts/api-server/src/lib/alerts.ts` + `routes/alerts.ts`:
  - `computeAlerts({partnerId?, orderId?, limit?})` derives alerts on the fly from existing tables (no new alerts table). Types: `failed_email`, `missing_artwork`, `order_exception`, `inactive_partner`, `stale_partner_setup`, `unresolved_support_issue`, `missing_contact_config`, `asset_issue`, `manual_followup`. All broad aggregates (`orderAssetCounts`, `lastOrderRows`) are scoped by `partnerId` / `orderId` when provided so per-entity panels stay cheap.
  - `summarizeAlerts(alerts)` rolls up by severity for the header bell + dashboard widget.
  - `routeAlertToSms(ctx, alert)` is an intentional **no-op stub** that writes a `alert.sms_route_attempt` row to `usage_events` — leaves a clean audit trail when text-to-phone is wired up later.
  - Routes: `GET /api/admin/alerts`, `/admin/alerts/summary`, `/admin/alerts/partner/:id`, `/admin/alerts/order/:id`; `POST /admin/alerts/manual-followup` + `/resolve`; `POST /admin/support-issues` + `/:id/resolve`; `POST /admin/partners/:id/archive` + `/unarchive` (toggles `archivedAt`/`archivedReason` only — does **not** mutate `isActive`, so prior intentional active state is preserved); `POST /admin/assets/:id/archive` + `/unarchive`.
- **Frontend** — `artifacts/a3-portal/src/`:
  - `lib/alertTypes.ts` — shared severity → color/icon mapping.
  - `components/admin/AlertsBadge.tsx` — header bell with summary count, polls `/admin/alerts/summary`.
  - `components/admin/AlertList.tsx` + `EntityAlertsPanel.tsx` — reusable list (used by Alert Center + entity panels).
  - `components/admin/PartnerStatusBadges.tsx` — inline pills for archived / inactive / launch status.
  - `pages/admin/AlertCenter.tsx` — full-page list with manual-followup + support-issue dialogs.
  - Wired into `App.tsx` (route `/admin/alerts`), `AdminLayout` (nav link + header badge), `Dashboard` (top alerts widget), `PartnersList` (status badges per row), `PartnerForm` (alerts panel + status badges + archive/unarchive card), `OrderDetail` (order-scoped alerts panel).

### Conventions kept
- Admin routes use `requireAuth` only (no role check) — consistent with the rest of `routes/admin*.ts`. Architect flagged this on Section 31 too; same trade-off accepted.
- Archive is **non-destructive**: only `archivedAt`/`archivedReason` flip, so unarchive cleanly restores prior state.
- SMS routing is wired structurally but never sends — replace `routeAlertToSms` body when a provider is selected.

## Section 31 — Email readiness, branded sending visibility & test sends (April 22, 2026)

### What we built
- **Backend** — `artifacts/api-server/src/routes/emailReadiness.ts`:
  - `GET /api/admin/email-readiness` returns a single snapshot:
    - `system`: `{ resendKeyConfigured, resendError, defaultFromAddress, publicUrl: { value, source, isCustomDomain } }`
    - `summary`: counts of `ready` / `warning` / `incomplete` partners
    - `partners[]`: per-partner `fromName`, `replyToEmail`, `internalForwardEmail`, `routingEmail`, `recipientCount`, `missing[]`, `warnings[]`, status pill
    - `recentFailures[]`: last 25 `email.failed` rows from `usage_events` (carries partnerId + objectId so you can jump straight to the order)
  - `POST /api/admin/email-readiness/test/customer-confirmation` and `/test/internal-routing` reuse the **real** `sendOrderConfirmation` / `sendInternalOrderForward` paths against the partner's most recent order, but override the recipient (and for the internal test, the routing addresses) so a real customer is never contacted.
- **Frontend** — `artifacts/a3-portal/src/pages/admin/EmailReadiness.tsx`:
  - System card with green/amber/red rows for Resend key, canonical domain source, custom-domain status, and "from address on a verified domain" check.
  - Summary tiles (Ready / Warning / Incomplete).
  - Per-partner list with status pills, inline detail (from / reply-to / internal forward / recipient count), missing/warnings explanation, and "Test customer email" / "Test internal routing" actions opening a single dialog.
  - Recent failures list deep-linking to the offending order.
- **Banner** — `EmailReadinessBanner` mounted at the top of `AdminLayout`. Hidden when system + all partners are clean; otherwise non-blocking amber/red strip with a one-click link into the readiness page. Cached with a 5-minute `staleTime` so it doesn't re-poll on every nav.
- **Nav** — added `/admin/email-readiness` to the Platform group with a `Mail` icon.
- **Route** — registered in `App.tsx`.

### Branded email consistency reused (not reinvented)
Branded sending was already correct — Section 31 only surfaces it. The send path (`lib/email.ts → sendBrandedEmail`) already:
- uses the partner's `emailFromName` (or `companyName`) as the visible sender,
- uses Resend's verified `fromEmail` (or falls back to `noreply@resend.dev` with a visible warning in the readiness page),
- sets `reply_to` to `partner.replyToEmail` → `contactEmail` → order/role-specific fallback,
- pulls `partner_themes` colours and renders the `brandHeader`/`brandFooter` with logo and partner colours,
- emits `email.sent` / `email.failed` to `usage_events` with `partnerId` and `objectId=order.id` so failures show up in the readiness page immediately.

### Failure visibility
`emit("email.failed", { partnerId, objectType:"order", objectId, meta:{ type, to, subject, error } })` was already in place from Section 28; Section 31 just teaches the admin where to find it. Fresh failures appear at the top of the readiness page within one query refetch.

### Readiness rules — what counts as incomplete vs. warning
- **Incomplete (red):** `emailConfigStatus.missing` is non-empty, OR partner has no `internalForwardEmail`, no legacy `routingEmail`, AND zero rows in `partner_email_recipients` (nobody on the partner side will hear about new orders).
- **Warning (amber):** non-blocking issues from `emailConfigStatus.warnings` (e.g. email disabled, missing from-name, no reply-to).
- **Ready (green):** neither.

### Fallback behaviour when config is incomplete
- The banner is non-blocking — admins can still use the rest of the app.
- `sendBrandedEmail` itself short-circuits with `email_disabled_for_partner` if `emailEnabled === false` (existing behaviour) and falls back to the default Resend sender when the partner has no per-partner sender configured.
- Test sends do not require the partner to be "ready" — admins can use them to *verify* a fresh config without first having to trigger a real order.

### Why this design
- Built entirely on the **existing** email + tracking pipeline. No new schema, no new tables, no migration. Reuses `usage_events`, `emailConfigStatus`, the `sendOrderConfirmation` / `sendInternalOrderForward` paths, and `getPublicUrlInfo`.
- Readiness state is **derived**, not stored. Recomputed on each page load so it always reflects current config without a sync job.
- Test sends pivot off the partner's most recent order so the test message is realistic (proper template, real branding, real items) — the only thing that's faked is the recipient address. Returns 409 if the partner has zero orders, with a helpful message rather than a confusing 500.
