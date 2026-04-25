# A3 Partner Commerce Portal

## Overview

The A3 Partner Commerce Portal is a comprehensive multi-supplier commerce platform for A3 Visual, designed to support diverse partner types like branding partners and ordering partners. It handles full ordering workflows, advanced quote ingestion, self-service onboarding, and inventory management. Key features include an order fulfillment engine, ERP integration, reconciliation, selective billing, unified asset workflows, advanced automation, executive analytics, and profitability intelligence. The platform also supports internationalization with flexible measurement units.

## User Preferences

I prefer iterative development, so please break down large tasks into smaller, manageable steps. Before making any major changes or implementing new features, please ask for my approval. Ensure clear and concise communication, avoiding overly technical jargon where simpler language suffices. I value detailed explanations for complex decisions or architectural changes.

## System Architecture

The A3 Partner Commerce Portal is built as a `pnpm workspace monorepo` using TypeScript, separating `api-server` and `a3-portal` packages.

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

- **Monorepo Structure**: Facilitates code reuse and modular development.
- **Database Design**: PostgreSQL with Drizzle ORM for robust data management of partners, orders, inventory, and assets.
- **API-First Approach**: RESTful APIs under `/api` with OpenAPI specification and Orval codegen for strong API contracts.
- **Quote Ingestion & Catalog Intelligence**: Converts raw supplier data into structured catalog entries.
- **Modular Frontend**: React with Vite and Tailwind CSS, featuring a dark navy and warm gold aesthetic, Inter typography, rounded card layouts, and partner-specific theming.
- **Inventory Management**: Real-time reusable inventory system with asset tracking, reservation, and shortage detection, including rentable assets.
- **Order Fulfillment Engine**: Automates supplier routing and item-level assignments.
- **Reconciliation & Billing**: Supports various payment models, commission tracking, and formal invoicing with multi-currency support.
- **Asset Management Workflow**: Structured asset table with versioning and approval workflows.
- **Workflow Automation & Orchestration**: Rule-based automation for triggers, conditions, and actions.
- **Analytics & Profitability Intelligence**: Provides KPIs, profitability breakdowns, and performance tracking.
- **Sales Enablement & Commercialization**: Supports monetization, feature gating, and sales workflows.
- **Internationalization & Logistics**: Flexible measurement/units model for imperial and metric conversions.
- **Security**: Includes file upload validation, SSRF mitigation, error handling, CSV sanitization, and production security hardening with detailed readiness reports, rate limiting, and secure secret management.
- **Bulk Import**: Unified wizard for importing various data types (suppliers, products, venues) with AI-driven PDF extraction for cost reduction.
- **Product Families & Reusable Hardware**: Connects hardware base items with components, providing live availability based on inventory.
- **Admin Navigation**: Restructured for improved UX, adapting to screen sizes.
- **Canonical Public Domain**: Uses `PUBLIC_APP_URL` for all customer-facing links with automatic redirection.
- **Operational Email Delivery & Routing**: Multi-recipient email routing based on roles with per-partner configuration and delivery visibility.
- **Order Exceptions & Artwork Workflow**: Implements an order-level exception state machine and artwork-needed flag for improved visibility.
- **Role-based Partner Contacts**: Manages partner contacts with specific roles for accurate communication routing.
- **Partner-specific Add-ons**: Allows partners to curate product add-ons with per-event overrides, ensuring flexible product offerings.
- **Configurable Add-on Display**: Partners pick a default presentation for their ordering portal (flat list, card grid, or category tiles), with optional category headings. Each event can override the format and restrict which categories appear. Tiles open into the products inside each category — useful for partners with large catalogs spanning many product types. Each partner add-on can carry a category override so the same product can sit in different category buckets per partner.
- **Operational Alerts & Retention Markers**: Derives alerts dynamically for operational issues (e.g., failed emails, inactive partners) and supports non-destructive archiving of partners and assets.
- **Email Readiness & Test Sends**: Provides an admin interface to monitor email configuration health, test email delivery paths, and ensure branded email consistency. Includes a **Domain Authentication panel** that performs real public-DNS lookups for SPF (TXT at the sender domain), DKIM (CNAME at `resend._domainkey.<domain>`), and DMARC (TXT at `_dmarc.<domain>`), reports a sender ↔ canonical-domain alignment hint (computed from `getPublicUrlInfo().host` with any explicit port stripped, compared via eTLD+1 against the sender domain), and frames any unresolved or transient-error states as "manual verification required" rather than claiming a record is verified — final verification status is owned by the Resend dashboard. The page also exposes three test-send modes per partner (customer-confirmation rendered from the partner's latest order, internal-routing test that calls `sendOpsForward(ctx, [overrideTo], { suppressCcBcc: true })` so test mail goes only to the entered address and never fans out to configured cc/bcc/legacy `partner.ccEmail`, and a generic branded test that loads the partner's `partnerThemesTable` row and renders with `resolveBrandColors(theme)` so the branded shell reflects real partner colors instead of defaults — this mode does not require an existing order), and a **Retry** action on every recoverable `email.failed` event in the recent-failures list. Retry is also available inline on the per-order **Email delivery panel** (`OrderEmailDeliveryPanel`) for order-context send types (`order_confirmation`, `order_ops_forward`, `order_finance_notification`, `order_partner_contact_notification`, `order_vendor_notification`); since email bodies are not stored, retry rebuilds the email context from current order data so resends reflect the latest branding and recipients rather than replaying the original payload. The seed (`scripts/src/seed.ts`) now provisions Move Miami as a fully-configured demo partner (branded `emailFromName` / `emailSenderLabel` / `replyToEmail` / `internalForwardEmail` / `ccEmail` / `billingContactEmail`, two `ops` recipients for redundancy plus `cc` and `finance` rows in `partner_email_recipients`, and one historical `email.sent` plus one `email.failed` `usage_events` row marked with `meta.seedMarker` for idempotency) so a fresh environment shows the readiness page, the recent-failures list, and the Retry action exercised end-to-end without needing to send a real email first.
- **Bare-slug Partner Share URLs**: Allows partners to be accessed directly via `partnershipportal.co/<slug>`, improving URL usability while maintaining backward compatibility.
- **Robust Partner Preview**: The admin "Preview Partnership Page" button always builds the canonical public URL via `publicLinkFrom(publicCfg, ...)` (so it never inherits a stale admin host like `www`), uses the *saved* partner slug rather than unsaved form input, and is disabled with an explanatory tooltip when no slug exists yet.
- **Public Portal Error Isolation**: Public partner routes (`/partner/:slug` and bare `/:slug`) are wrapped in a `PartnerPortalErrorBoundary` so a render crash from incomplete partner config (missing sections, broken theme, bad asset URLs) shows a clean recoverable message with technical details instead of a blank white page.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Clerk**: Authentication and user management (admin-only).
-   **Resend**: Email delivery service.
-   **OpenAI**: AI integration for request summaries and PDF parsing.
-   **Replit Object Storage**: Cloud storage for file uploads.