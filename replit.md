# A3 Partner Commerce Portal

## Overview

A full-stack web application designed for A3 Visual, evolving into a comprehensive multi-supplier commerce portal. It serves various partner types, including branding partners who utilize venue branding map portals and multi-step intake forms, and ordering partners who engage in a full ordering workflow encompassing cities, venues, events, tiered packages, add-ons, artwork uploads, and order tracking. The portal features extensive admin dashboards for managing partners, suppliers, locations, events, packages, inventory, orders, users, roles, and provides a vendor fulfillment view. A key capability is its advanced quote ingestion and catalog intelligence system, which streamlines the conversion of diverse supplier data into structured catalog information. The system also includes robust features for self-service onboarding, reusable hardware and asset inventory management, an order fulfillment engine with multi-supplier routing, and a comprehensive ERP, export, and reconciliation layer. Recent enhancements focus on selective billing execution, invoice workflows, a unified asset and production workflow, and advanced workflow automation and orchestration. The platform is further enriched with executive analytics, profitability intelligence, sales enablement, demo layers, and stabilization features including objection handling and a comprehensive FAQ system. The portal also supports internationalization with a flexible measurement/units model.

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

1.  **Monorepo Structure**: Organizes the application into distinct packages: `artifacts/api-server` (Express API, port 8080) and `artifacts/a3-portal` (React frontend). Shared libraries like `lib/db`, `lib/api-spec`, `lib/api-zod`, and `lib/api-client-react` promote code reuse and maintainability.
2.  **Database Design**: Utilizes PostgreSQL with Drizzle ORM. The schema is comprehensive, covering `partners` (with `partnerType` and `defaultSupplierId`), `suppliers`, `cities`, `venues`, `events`, `packages`, `inventory`, `orders`, `quote_assets`, `user_roles`, and more. New tables like `partner_onboarding_submissions`, `inventory_reservations`, `discrepancies`, `commission_payouts`, `invoices`, `assets`, `asset_links`, `asset_events`, `workflow_rules`, `workflow_tasks`, `workflow_alerts`, `workflow_audit`, `commercial_accounts`, `commercial_plans`, `branding_packages`, `account_subscriptions`, `account_usage_limits`, `proposals`, `activation_checklist_items`, `objections`, `demo_followups`, and `faq_entries` support an expanded feature set.
3.  **API-First Approach**: The backend exposes RESTful APIs (all under `/api`) for various functionalities, including partner management, product catalog, public portal requests, asset management, inventory, orders, billing, and workflow automation. OpenAPI specification (`lib/api-spec`) and Orval for codegen ensure consistency.
4.  **Quote Ingestion & Catalog Intelligence**: Extends `quote_assets` and `product_catalog` tables with detailed sourcing, processing status, and enrichment fields. Dedicated API routes and UI components facilitate turning raw supplier data into structured catalog entries.
5.  **Modular Frontend**: React with Vite and Tailwind CSS. Key UI/UX decisions include a dark navy primary color, warm gold accents, Inter typography, rounded card-based layouts, color-coded status badges, and partner-specific theme customization. Admin dashboards feature compact navigation, while public portals adapt based on `portalMode` (`intake`, `full`, `ordering`).
6.  **Inventory Management**: Implements a lightweight, real-time reusable inventory system with `inventory` and `inventory_reservations` tables, supporting asset tracking, reservation, and shortage detection.
7.  **Order Fulfillment Engine**: Automates supplier routing based on inheritance logic, manages item-level supplier assignments, statuses, and exceptions. Integrates with inventory reservations to track hardware and print demands.
8.  **Reconciliation & Billing**: Introduces `paymentModel`, `supplierEstimatedCost`, `expectedCommission`, and `reconciliationStatus` to `orders`, along with `discrepancies` and `commission_payouts` tables. A formal billing layer with `invoices` and `invoice_payments` tables handles various billing execution models.
9.  **Asset Management Workflow**: Structured `assets` table with versioning, approval workflows, and polymorphic ownership. `asset_links` connect assets to order items, and `asset_events` provide a full audit trail. Production readiness is computed per line item.
10. **Workflow Automation & Orchestration**: `workflow_rules`, `workflow_tasks`, and `workflow_alerts` tables enable rule-based automation. A workflow engine processes triggers, evaluates conditions, and executes actions, with a deadline monitor for time-sensitive events.
11. **Analytics & Profitability Intelligence**: A dedicated analytics service aggregates operational data to provide KPIs, profitability breakdowns, supplier performance, forecasts, and risk assessments.
12. **Sales Enablement & Commercialization**: `commercial_accounts`, `commercial_plans`, `branding_packages`, and `proposals` tables support monetization, feature gating, and sales workflows. `activation_checklist_items` track onboarding progress.
13. **Internationalization**: A `measurement/units` model supports both imperial and metric units, with cascade resolution and automatic conversions, ensuring unit consistency across the portal and in supplier packets.
14. **Security & Hardening**: Includes file upload validation, SSRF mitigation, robust error handling, and CSV cell sanitization to prevent formula injection. Role-based access control is primarily enforced on the frontend, with plans for server-side role gating.
15. **Deployment Readiness**: A `/api/deployment/readiness` endpoint and corresponding UI component provide a checklist for ensuring the system is ready for production.

## External Dependencies

-   **PostgreSQL**: Primary database for all application data.
-   **Clerk**: Authentication and user management system, used for admin authentication.
-   **Resend**: Email delivery service, integrated for sending various notifications.
-   **OpenAI**: AI integration via Replit AI Integrations, specifically using `gpt-4o-mini` for tasks like request summaries.
-   **Replit Object Storage**: Cloud storage solution used for handling file uploads (e.g., artwork, documents).