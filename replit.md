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
- **Email Readiness & Test Sends**: Provides an admin interface to monitor email configuration health, test email delivery paths, and ensure branded email consistency.
- **Bare-slug Partner Share URLs**: Allows partners to be accessed directly via `partnershipportal.co/<slug>`, improving URL usability while maintaining backward compatibility.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Clerk**: Authentication and user management (admin-only).
-   **Resend**: Email delivery service.
-   **OpenAI**: AI integration for request summaries and PDF parsing.
-   **Replit Object Storage**: Cloud storage for file uploads.