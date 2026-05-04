# A3 Partner Commerce Portal

## Overview

The A3 Partner Commerce Portal is a multi-supplier commerce platform for A3 Visual, supporting diverse partners like branding and ordering partners. It streamlines ordering, quote ingestion, self-service onboarding, and inventory management. The platform features an order fulfillment engine, ERP integration, reconciliation, selective billing, unified asset workflows, advanced automation, executive analytics, and profitability intelligence. It also supports internationalization with flexible measurement units.

## User Preferences

I prefer iterative development, so please break down large tasks into smaller, manageable steps. Before making any major changes or implementing new features, please ask for my approval. Ensure clear and concise communication, avoiding overly technical jargon where simpler language suffices. I value detailed explanations for complex decisions or architectural changes.

## System Architecture

The A3 Partner Commerce Portal is a `pnpm workspace monorepo` built with TypeScript, separating `api-server` and `a3-portal` packages.

**Technology Stack:**
- **Monorepo**: pnpm workspaces
- **Backend**: Node.js 24, Express 5, PostgreSQL with Drizzle ORM
- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Authentication**: Clerk (admin-only)
- **Email**: Resend
- **AI**: OpenAI
- **Storage**: Replit Object Storage
- **Validation**: Zod, `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)

**Core Architectural Patterns & Design Decisions:**

- **Monorepo Structure**: Facilitates modular development and code reuse.
- **Database Design**: PostgreSQL with Drizzle ORM for managing partners, orders, inventory, and assets.
- **API-First Approach**: RESTful APIs with OpenAPI specification and Orval codegen.
- **Quote Ingestion & Catalog Intelligence**: Converts raw supplier data into structured catalog entries.
- **Modular Frontend**: React with Vite and Tailwind CSS, featuring a dark navy and warm gold aesthetic, Inter typography, and partner-specific theming with 3 selectable design templates (Luxe Dark, Neon Creative, Clean Premium).
- **Premium Portal Theming**: Template-aware branding system with `resolveBranding()` utility, premium components (PortalNavbar, PortalHero, PortalCard, PortalCTA, PortalFooter) in `components/branding/`, and admin theme editor with template picker, hero controls, logo placement, card/button styles, and live preview. Template defaults in `templateDefaults.ts`.
- **Inventory Management**: Real-time reusable inventory system with asset tracking, reservation, and shortage detection.
- **Order Fulfillment Engine**: Automates supplier routing and item-level assignments.
- **Reconciliation & Billing**: Supports various payment models, commission tracking, and multi-currency invoicing.
- **Asset Management Workflow**: Structured asset table with versioning and approval workflows.
- **Workflow Automation & Orchestration**: Rule-based automation for triggers, conditions, and actions.
- **Analytics & Profitability Intelligence**: Provides KPIs, profitability breakdowns, and performance tracking.
- **Sales Enablement & Commercialization**: Supports monetization, feature gating, and sales workflows.
- **Internationalization & Logistics**: Flexible measurement/units model for imperial and metric conversions.
- **Security**: Global Clerk auth boundary in route index gates all admin API routes; public paths (`/public/*`, `/customer/*`, `/healthz`, `/storage/public-objects/*`, `/onboarding/*`, `/public-config`) are explicitly allowlisted. Launch management routes (`/launch/*`) require auth. Private object storage (`/storage/objects/*`) requires Clerk session. Public endpoints use safe projections that strip internal fields (routingEmail, ccEmail, netsuiteCustomerNumber, themeNotes, aiSuggestedJson, backendProductionNotes, internalOpsSummary, etc.). File upload validation restricts to image/*, application/pdf, application/zip. Also includes SSRF mitigation, CSV sanitization, rate limiting, and secure secret management.
- **Cost & AI Architecture**: AI is used for specific narrow tasks (request summaries, pitch-deck normalization, package PDF extraction, billing PDF signal extraction) via `gpt-4o-mini`, with structured JSON outputs, capped `max_tokens`, and content-hash caching to minimize spend. All AI calls are admin-triggered only (no automatic AI on intake submission). Deterministic logic is intentionally excluded from AI processing.
- **Bulk Import**: Unified wizard for importing data types with AI-driven PDF extraction for efficiency.
- **Product Families & Reusable Hardware**: Connects hardware base items with components, providing live availability based on inventory.
- **Admin Navigation**: Improved UX for various screen sizes.
- **Canonical Public Domain**: Uses `PUBLIC_APP_URL` for customer-facing links with automatic redirection.
- **Operational Email Delivery & Routing**: Multi-recipient email routing based on roles with per-partner configuration.
- **Order Exceptions & Artwork Workflow**: Implements an order-level exception state machine and artwork-needed flag.
- **Role-based Partner Contacts**: Manages partner contacts with specific roles for accurate communication routing.
- **Partner-specific Add-ons**: Allows partners to curate product add-ons with per-event overrides and configurable display.
- **Operational Alerts & Retention Markers**: Dynamically derives alerts for operational issues and supports non-destructive archiving.
- **Document Center**: Secure document management and customer delivery system with admin CRUD, request workflows, and audit trails.
- **A3-side Internal Intake Email & Panel**: Provides a polished A3 intake briefing for new orders, classifying items, rolling up inventory, and synthesizing follow-up questions and next steps, with a unified view in emails and the admin panel.
- **Email Readiness & Test Sends**: Admin interface to monitor email configuration health, perform test sends (customer confirmation, internal routing, branded generic), and retry failed emails. Includes a Domain Authentication panel for SPF, DKIM, and DMARC checks.
- **Bare-slug Partner Share URLs**: Allows direct access to partners via `partnershipportal.co/<slug>`.
- **Robust Partner Preview**: Admin "Preview Partnership Page" button builds canonical public URLs and handles cases where no slug exists.
- **Public Portal Error Isolation**: Public partner routes are wrapped in an `ErrorBoundary` for graceful error handling.
- **Live Readiness Probe**: An admin-only endpoint (`/api/admin/live-readiness`) probes live system workflows (DB, public URL, email, object storage, AI, partner/order/asset activity) to report real-time operational status, complementing other readiness checks.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Clerk**: Authentication and user management.
-   **Resend**: Email delivery service.
-   **OpenAI**: AI integration.
-   **Replit Object Storage**: Cloud storage for file uploads.