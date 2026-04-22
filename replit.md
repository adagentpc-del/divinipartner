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