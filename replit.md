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
13. **Internationalization & Logistics**: A `measurement/units` model supports both imperial and metric units, with cascade resolution and automatic conversions, ensuring unit consistency across the portal and in supplier packets. Length units (`in`, `ft`, `mm`, `cm`, `m`) are normalized to `*_mm` columns, weight units (`lb`, `oz`, `kg`, `g`) are normalized to `*_g` columns. The cascade resolves the preferred system from event → venue (explicit unit, then country) → partner → account → default (imperial; the `IMPERIAL_COUNTRIES` whitelist is `US/CA/LR/MM`, all other countries default to metric). Products carry packing/shipping defaults (packed W×H×D + unit, shipping weight + unit, carton count, packing mode `rolled`/`flat`/`boxed`/`crated`, crate/pallet/oversize flags, freight class, install kit notes); on order creation, line items inherit those defaults and admins can override per shipment. Orders capture order-level logistics (ship-by/deliver-by dates, package count, total shipment weight, shipping & receiving contacts JSON, customs / international shipping / general logistics notes, oversize/crate/pallet flags, and `measurementSystem`). Supplier packets render a read-only Logistics block whose primary weight unit follows `order.measurementSystem` so overseas shipments display kg/g first by default.
14. **Security & Hardening**: Includes file upload validation, SSRF mitigation, robust error handling, and CSV cell sanitization to prevent formula injection. Role-based access control is primarily enforced on the frontend, with plans for server-side role gating.
15. **Deployment Readiness**: A `/api/deployment/readiness` endpoint and corresponding UI component provide a checklist for ensuring the system is ready for production.

17. **Multi-recipient Email Routing (April 2026)**: `partner_email_recipients` (partnerId, role, email, label, isActive, notes, sortOrder) lets each partner declare any number of routed recipients per role: `ops`, `finance`, `partner_contact`, `vendor`, `cc`, `bcc`. CRUD lives at `/partners/:id/email-recipients[/:rid]` (GET public, write requires Clerk auth). At order submit `lib/email.ts:sendOrderEmails` fans out in parallel: `sendOrderConfirmation` (customer), `sendOpsForward` (operational template, plus configured cc/bcc), `sendFinanceNotification` (billing-focused template), `sendPartnerContactNotification` (polished partner-facing template), `sendVendorNotification` (operational template to vendors). Each role independently resolves recipients with legacy fallback (ops→`internalForwardEmail`/`routingEmail`, ops cc→`ccEmail`, finance→`billingContactEmail`, partner_contact→`contactEmail`) so existing partners need no migration. `POST /public/partners/:slug/orders` returns `email: { confirmation, ops, finance, partnerContact, vendor, forward, warnings[] }`; "no_*_recipient" errors are silently skipped — only real failures become warnings. Each send emits `email.sent` / `email.failed` to `usage_events` with the audience type. UI: `RecipientsManager` card on the partner edit page (under Communications) with per-row active toggle, inline edit, delete, and a per-role test send via `POST /partners/:id/test-role-email { role, to? }`.

16. **Partner Branding & Email**: Each partner has a `partner_themes` row (primary/secondary/accent/background/button/text colors, fonts, border radius, tone preset) plus partner-level email config (`emailFromName`, `replyToEmail`, `internalForwardEmail`, `ccEmail`, `emailSenderLabel`, `emailEnabled`). Public surfaces (`OrderingPortal`, `FullPortal`, `PartnerPortal`) read theme via `BrandedShell` + `usePartnerBranding` (CSS variables + `resolveBranding` helper) and render the partner logo through `PartnerLogo` (initials fallback). Order submissions via `POST /public/partners/:slug/orders` trigger two emails through `lib/email.ts`: a brand-aware **customer confirmation** (uses partner colors/logo, reply-to falls back to `contactEmail`) and an **internal forward** to the ops team (cc'd if configured, falls back to legacy `routingEmail`). Email failures never block order submission — the response includes `email: { confirmation, forward, warnings[] }` and successes/failures are logged to `usage_events` as `email.sent`/`email.failed`. Admins manage everything from the Communications card on the partner edit page (with live branding preview + test-send buttons hitting `/partners/:id/test-confirmation-email` and `/test-internal-forward`).

## External Dependencies

-   **PostgreSQL**: Primary database for all application data.
-   **Clerk**: Authentication and user management system, used for admin authentication.
-   **Resend**: Email delivery service, integrated for sending various notifications.
-   **OpenAI**: AI integration via Replit AI Integrations, specifically using `gpt-4o-mini` for tasks like request summaries.
-   **Replit Object Storage**: Cloud storage solution used for handling file uploads (e.g., artwork, documents).
## Section 18 — Branded PDF order summaries & email attachments (April 22, 2026)

Generated server-side via `pdfkit` for three audiences with progressive disclosure:
- **customer** — branded, concise; hides pricing, supplier, and internal notes; finishes with a friendly "what happens next" call-out using the partner's accent color.
- **internal** — full operational detail (contact, event/venue, logistics, items+notes, uploaded asset filenames). Pricing visible.
- **finance** — internal layout with billing-focused header and a Billing block (terms, deposit, billing contact, billing entity, default billing notes).

Files:
- `artifacts/api-server/src/lib/pdf.ts` — `generateOrderSummaryPdf(ctx, audience)` returning `{filename, buffer, audience}`. Header band uses partner primary color; logo fetched lazily from `partner.logoUrl` (PNG/JPEG only) with typographic fallback. Footer paginates `Page X of Y`.
- `artifacts/api-server/src/lib/email.ts` — `sendBrandedEmail` accepts `attachments?: {filename, content: Buffer}[]` and base64-encodes at the Resend boundary. Helper `maybeAttach(ctx, audience, enabled)` generates the PDF and never throws — failures are logged and the email still sends without the attachment. Wired into `sendOrderConfirmation`, `sendOpsForward`, `sendFinanceNotification`, `sendPartnerContactNotification` (partner contacts get the **customer** PDF).
- `artifacts/api-server/src/routes/orders.ts` — `GET /api/orders/:id/summary-pdf?audience=customer|internal|finance&download=0|1` (auth-gated, streams `application/pdf`).

Partner schema (`lib/db/src/schema/partners.ts`):
- `attachPdfCustomer` (default false), `attachPdfOps` (default true), `attachPdfFinance` (default false), `attachPdfPartnerContact` (default false). All optional in `PartnerBody`/`UpdatePartnerBodySchema`.

Admin UI:
- `PartnerForm.tsx → CommunicationsCard` — new "Attach branded PDF order summary" group with the four toggles and per-role helper text.
- `OrderDetail.tsx` — header card with "Preview customer / internal / finance" + "Download" buttons (open the new endpoint in a new tab).

Telemetry: `pdf.generated` and `pdf.failed` usage events; `email.sent` meta now carries `attached: boolean` and `attachments: string[]`.

Demo: Move Miami (partner id 1) has all four toggles ON.

## Section 19 — International currency, VAT/tax modes & overseas billing (April 22, 2026)

Adds first-class multi-currency + tax handling to the order → invoice → email/PDF → finance flow. Designed for partners outside the US (e.g. London Pop-ups in EUR with 20% inclusive VAT) without breaking the existing USD/sales-tax-exclusive defaults used by Move Miami and the rest of the catalog.

Schema (`lib/db/src/schema/`):
- `partners` — `defaultCurrency`, `defaultTaxMode` (`none|sales_tax|vat|gst|custom`), `defaultTaxLabel`, `defaultTaxRate` (numeric 5,3), `taxInclusive`, `billingCountry` (ISO-2), `invoiceDisplayNotes` (free text shown on invoice/email for overseas billing instructions, VAT reg #s, etc).
- `events` — same currency/tax fields, all nullable so an event can override its partner.
- `orders` — `currency` (default `USD`), `currencySource` (`partner|event|order`), `taxMode`, `taxModeSource`, `taxLabel`, `taxRate`, `taxInclusive`, plus snapshotted `subtotal` and `taxAmount` so historical totals stay stable.
- `invoices` — `currency`, `taxMode`, `taxLabel`, `taxRate`, `taxInclusive` carried forward from the source order at creation time.
- `discrepancies`, `commission_payouts` — `currency` for accurate finance reporting.

Inheritance & math (`artifacts/api-server/src/lib/billing.ts`):
- `SUPPORTED_CURRENCIES = ['USD','EUR','GBP','AED','CAD','AUD']`, `TAX_MODES`, `defaultTaxLabel(mode, country)`.
- `resolveOrderBilling(partner, event?, override?)` walks **order override → event → partner default → USD/none** and returns `{ currency, currencySource, taxMode, taxModeSource, taxLabel, taxRate, taxInclusive }`.
- `computeOrderTotals(items, taxRate, taxInclusive)` returns `{ subtotal, taxAmount, total }`. Inclusive: gross = Σ qty×price, subtotal = total/(1+rate). Exclusive: subtotal = gross, taxAmount = gross×rate.
- `formatMoney(value, currency)` uses `Intl.NumberFormat` with a graceful fallback. Browser mirror at `artifacts/a3-portal/src/lib/currency.ts`.

Order/invoice routes:
- `POST /orders` and `PATCH /orders/:id` (`artifacts/api-server/src/routes/orders.ts`) re-resolve billing whenever partner/event or any override field changes, and re-snapshot `subtotal`/`taxAmount`/`totalEstimate`.
- `GET /orders` exposes the new fields so list/breakdown views render correctly.
- `POST /invoices/from-order/:orderId` and `/regenerate` (`artifacts/api-server/src/routes/invoices.ts`) copy `currency` + tax fields from the order (with `computeOrderTotals` fallback for legacy rows). PATCH accepts currency/tax edits.

Email + PDF:
- `artifacts/api-server/src/lib/email.ts` — `formatCurrency(value, currency)`, `renderItemsTable(items, currency)`, `renderTotalsBlock({subtotal, taxAmount, total, taxLabel, taxRate, taxInclusive, currency})`. Finance/customer/internal templates pass through the order currency.
- `artifacts/api-server/src/lib/pdf.ts` — `fmtCurrency(value, currency)`, "Currency: XXX" subtitle in the header, and the totals block prints `Subtotal / <Label> (<rate>%[, incl.]) / TOTAL <amount> XXX`.

Admin UI (`artifacts/a3-portal/src/pages/admin/`):
- `PartnerForm.tsx` — new "Currency & Tax Defaults" card (currency, tax mode, tax label, tax rate, inclusive flag, billing country, invoice display notes); zod schema, defaults, and reset all carry these fields so PATCH persists them.
- `GET /invoices/public/:token` and `src/pages/Invoice.tsx` (customer-facing public invoice) carry currency / taxLabel / taxRate / taxInclusive and format amounts with the correct symbol.
- `OrderDetail.tsx` — `<CurrencyTaxBreakdown>` panel inside Internal Management showing subtotal/tax/total in the resolved currency, source badges (e.g. `currency: event`, `tax: order`), and an "Override currency / tax" disclosure that PATCHes the order so the server re-resolves and recomputes.
- `InvoiceDetail.tsx` — totals block uses `formatMoney`, shows tax label + rate + ", incl." when applicable, and stamps the currency code on the Total row.
- `Billing.tsx`, `Reconciliation.tsx` — money cells show the currency code next to the amount so mixed-currency lists are unambiguous.

## Section 20 — PDF / quote / spec AI cost reduction (April 2026)

See `PDF_AI_COST_AUDIT.md` for the full audit, before/after numbers, and rationale.

Key changes (all in deck extraction — the only document-text → AI flow):
- `deck_extractions` gained `file_hash` (sha256), `file_size`, `extracted_text` (cached pdf-parse output), `relevant_chunks` (jsonb of pages sent to AI), `chunk_count`, `parse_source` (`ai|rules|reused_dedup`), `deduped_from_id`, `ai_tokens_input/output`, `ai_model`. Status enum widened: `uploaded|text_extracted|chunked|awaiting_ai|parsed|duplicate_reused|parse_failed|archived`.
- `lib/deckExtraction.ts` is staged: hash → dedup lookup → pdf-parse once → boilerplate strip → keyword/dimension chunk selection → AI on chunks only → store. Duplicate uploads of the same file (same `partnerId + fileHash`) copy items from the prior parsed row and never call AI.
- Hard caps in `PDF_LIMITS`: 25 MB file, 60k cached text chars, 8k AI input chars, 8 chunks, 1500 max output tokens. Tight ~80-word system prompt; `max_tokens` on the request; `extractedTextSnippet` server-trimmed to 200 chars.
- New routes: `GET /partners/:id/deck-extractions/check-duplicate?hash=…` (pre-flight) and `POST /deck-extractions/:id/rerun` (explicit, confirm-gated).
- Usage events emitted: `deck.parse.ai`, `deck.parse.rules`, `deck.parse.reused`, `deck.parse.failed` (each with meta including tokens, chunk count, fingerprint).
- `DeckExtractionReview.tsx` shows status, `♻ Reused (dedup #N)` badge when cached, `AI · N chunks · M tok` when AI ran, `Rules-only` when deterministic fallback ran, and a confirm-gated `Re-run parse` button.
- Quote-ingestion (`quote_assets`) is intentionally untouched — it is currently manual (no AI) and adding AI would be a new feature, not a cost reduction.

Demo data (`scripts/src/seed-currency-demo.ts`, `pnpm --filter @workspace/scripts run seed:currency`):
- Move Miami (partner #1): USD + `sales_tax` + `FL Sales Tax` 7% exclusive, billingCountry US.
- London Pop-ups (new partner): EUR + `vat` + `VAT` 20% inclusive, billingCountry GB, with overseas invoice display notes.
- One demo order on each so the breakdown UI / email / PDF path is exercised end-to-end.

## Section 21 — Quote/spec billing-signals parsing (April 22, 2026)

Extends `quote_assets` ingestion to detect currency / VAT / tax / international
billing cues from uploaded PDF quotes & spec sheets. Cost-conscious by design:
deterministic regex pass first, AI fallback only when regex finds no currency
or the tax signal is ambiguous, on a single ≤4k-char chunk with ≤200 output
tokens. Re-uploads of the same file (matched by `file_hash`) skip parsing
entirely. Parsed values are SUGGESTIONS — they never auto-overwrite partner /
event / order / invoice billing defaults.

Schema (`lib/db/src/schema/quoteAssets.ts`): 19 new `parsed_*` columns —
`parsed_currency` + `_confidence`, `parsed_tax_label/_rate/_amount/_inclusive`,
`parsed_subtotal/total_amount`, `parsed_quote_reference`, `parsed_supplier_name`,
`parsed_payment_terms`, `parsed_deposit_amount`, `parsed_billing_country`,
`parsed_incoterm`, `parsed_billing_notes`, `parsed_billing_flags_json`,
`parsed_missing_fields_json`, `parsed_ai_tokens_input/_output`, `parsed_at`,
`parsed_source` (`rules|ai|none|failed`), `parsed_review_status`
(`pending|approved|dismissed|edited`); plus `file_hash` (sha256) and
`extracted_text`.

Parser (`artifacts/api-server/src/lib/billingSignals.ts`):
- Currency: weighted scoring across USD/EUR/GBP/AED/CAD/AUD with negative
  lookaheads to avoid `$` collisions; emits `currency_high_confidence` or
  `currency_ambiguous` + `manual_review_needed`.
- Tax: VAT / Sales Tax / GST inclusive vs. exclusive, rate (decimal — `0.20`
  not `20`), amount; emits `tax_inclusive_detected` or `tax_not_found`.
- Totals: subtotal / total / deposit money regex with currency-aware parsing.
- Quote ref, supplier name, payment terms, country (name → ISO-2 map),
  incoterm (DAP/CIP/DDP/EXW/FOB), overseas cues (metric units, non-US country).
- AI fallback: short JSON-only prompt, temperature 0,
  `AI_MAX_INPUT_CHARS=4000`, `AI_MAX_OUTPUT_TOKENS=200`.
- Reuses `stripBoilerplate` + `selectRelevantChunks` exported from
  `deckExtraction.ts`.

Routes (`artifacts/api-server/src/routes/quoteAssets.ts`):
- `POST /quote-assets` — fires `triggerBillingSignalsParse` in the background
  for any PDF upload (does not block the response).
- `POST /quote-assets/:id/billing-signals/approve` — marks
  `parsed_review_status='approved'`.
- `POST /quote-assets/:id/billing-signals/dismiss` — marks `dismissed`.
- `POST /quote-assets/:id/billing-signals/rerun` — re-fetches the file and
  re-parses (forced; bypasses the `file_hash` cache).
- Cheap reuse: if the freshly hashed file matches the row's existing
  `file_hash` AND a non-failed `parsed_source` is present, the parse is
  skipped (no AI call).

UI (`artifacts/a3-portal/src/pages/admin/QuoteIngestion.tsx`):
- New **Billing** tab in the enrichment drawer with a `BillingSignalsPanel`
  showing currency + confidence, tax label/rate/amount/inclusive, subtotal,
  total, quote ref, payment terms, deposit, billing country, incoterm,
  parsed flags (sky for informational, amber for ambiguous /
  manual-review), and missing fields.
- `Approved` / `Pending review` / `Dismissed` review badge + parsed-source
  badge (`Rules-only · 0 tokens` vs `AI fallback · N tokens`).
- Approve / Dismiss / Re-run actions; explicit notice that values are
  suggestions and are not auto-applied to billing defaults.

Demo seed (`scripts/src/seed-billing-signals-demo.ts`,
`pnpm --filter @workspace/scripts run seed:billing-signals`):
- 5 idempotent demo `quote_assets` rows: EUR/VAT inclusive, USD/sales-tax
  exclusive, AED/VAT international (with metric units + DAP incoterm),
  ambiguous `$`/`£` (AI-fallback path with `manual_review_needed`), and a
  pre-approved EUR row to exercise the post-review state.

See `PDF_AI_COST_AUDIT.md` §6 for the cost shape and the rationale that this
is a NEW capability, not a regression of the §2 cost reductions.

## Section 22 — Partner portal section builder UX (April 22, 2026)

Refines the existing partner-portal section builder so the operator can clearly
see what is on a partner's portal and add new sections from a NAMED picker.
Backend (`partner_sections` table, `/api/partners/:id/sections*` routes) is
unchanged; this is a builder-UX overhaul on top of the existing CRUD.

How sections are stored:
- Table `partner_sections` (`lib/db/src/schema/partnerSections.ts`):
  `partnerId`, `sectionType` (string), `title`, `subtitle`, `description`,
  `featuredImageUrl`, `featuredVideoUrl`, `isEnabled` (visible vs hidden),
  `sortOrder` (display order, 0-based).
- Bulk save: `PUT /api/partners/:id/sections/bulk` replaces the partner's
  section list in one transaction (re-numbers `sortOrder` from the request
  array order). Single-section CRUD endpoints exist but the builder uses bulk.

Section catalog (`artifacts/a3-portal/src/pages/admin/PartnerSections.tsx`):
- Universal types (any partner): `hero`, `packages`, `catalog`, `contact_support`,
  `faq`, `custom_content` (multi-instance), `partner_deck`, `capabilities`.
- Ordering-partner types (`partnerType='ordering'`): `cities`, `venues`,
  `event_selection`, `inventory`, `standard_products`, `event_materials`.
- Branding-partner types (`partnerType='branding'`): `venue_branding`,
  `branding_zones`, `immersive`, `fabrication`, `open_request`.
- Each type has `{ label, description, audience, multiInstance, icon, defaultTitle }`.
  `audience` filters the picker; `multiInstance` (only `custom_content`)
  controls whether the type can appear more than once on a portal.

How the picker works:
- Single shadcn `Select` dropdown above the section list. Each option shows
  the section icon, label, and a one-line description so the operator knows
  what is being added before confirming. Single-instance types already on
  the portal are rendered with `disabled` + a "(already added)" hint;
  `custom_content` shows "(repeatable)".
- Selecting an option immediately appends a new section row (with a sensible
  `defaultTitle`) — no separate "confirm" step. The picker resets after add.
- Picker options are filtered by the partner's `partnerType`. Partners with
  no type set see the full catalog so the operator can configure freely.

Existing-section visibility & controls:
- Each section card shows: icon, named label, position badge (`#1`, `#2`…),
  status badge (`Visible` green / `Hidden` muted-outline), `Not configured`
  amber badge when `title` is empty, plus the type description as a hint.
- Header summary line shows total count, visible vs hidden split, and the
  active audience filter.
- Per-card controls: ChevronUp / ChevronDown reorder, Show/Hide switch
  (toggles `isEnabled`), Trash to remove. Reorder buttons are disabled at
  the list ends. Drag-and-drop was deferred — explicit buttons keep the
  builder predictable on touch and keyboard.
- Inline editing of `title` / `subtitle` / `description` / featured image
  & video URLs stays in card body. A sticky bottom bar holds Save All / Back.

Demo data (`scripts/src/seed.ts`):
- Move Miami now seeds 10 sections including `hero`, `packages`, `catalog`,
  and a hidden `cities` row so the visible/hidden split and the named picker
  states are observable on a fresh seed.

Out of scope for this pass:
- Live preview iframe (not added — would need new routing on the public
  partner portal page).
- Drag-and-drop reorder (kept as ChevronUp/Down for now).

## Section 23 — Canonical Public Domain (PUBLIC_APP_URL)

The portal now treats a single env var, `PUBLIC_APP_URL`, as the canonical
public origin for every customer-facing link. The Replit deployment hostnames
remain reachable as internal/fallback addresses only.

- **Helper (server):** `artifacts/api-server/src/lib/publicUrl.ts`
  - `getPublicUrlInfo()` resolves the active URL: `PUBLIC_APP_URL` → first
    `REPLIT_DOMAINS` host → `localhost`. Detects custom-domain status (any
    host not ending in `.replit.app`/`.replit.dev`).
  - `publicLink(path)` returns absolute URLs for emails / shareable links.
  - `warnIfFallback()` logs once when emails are sent without `PUBLIC_APP_URL`.
- **Helper (client):** `artifacts/a3-portal/src/lib/publicUrl.ts`
  - `fetchPublicConfig()` (cached) + `publicLinkFrom(cfg, path)`.
- **Endpoint:** `GET /api/public-config` returns
  `{ publicAppUrl, publicHost, source, isCustomDomain, fallbackHosts,
  publicAppUrlConfigured }`. Used by the Settings page and any UI that
  generates shareable links.
- **Canonical-host redirect:** `canonicalHostMiddleware` (mounted before
  routers) issues a `308` from `*.replit.app`/`*.replit.dev` to the
  canonical `PUBLIC_APP_URL` for GET/HEAD HTML requests when a custom domain
  is configured. `/api` and `/__clerk` paths are excluded so server-to-server
  calls and Clerk callbacks keep working on either host.
- **Email change:** admin notification emails (`resend.ts` `sendNewRequestEmail`)
  now build the request URL via `publicLink(...)` instead of
  `REPLIT_DOMAINS[0]`. No other email currently embeds an app URL.
- **Frontend usage:** `OnboardingSubmissions.tsx` shareable onboarding link
  uses the resolved canonical URL when configured, otherwise falls back to
  `window.location.origin`.
- **Settings page:** new admin route `/admin/settings` (Settings nav entry)
  shows the active public URL, source badge, custom-domain vs. fallback
  state, the list of internal Replit hostnames, and an inline warning when
  `PUBLIC_APP_URL` has not been set.

Operator action to enable the custom domain:
1. Set `PUBLIC_APP_URL` (e.g. `https://portal.a3visual.com`) in the
   environment secrets pane.
2. Restart the API server workflow.
3. Visit `/admin/settings` to confirm the source badge reads
   `PUBLIC_APP_URL` and the green "Custom domain" pill appears.

## Section 25 — Bulk Import (CSV / XLSX)

Admin staff can bulk-import three resources via a unified wizard:

- **Suppliers** — `SuppliersList` "Import Suppliers" button.
- **Products** — `ProductCatalog` "Import Products" button.
- **Product specs** — `ProductCatalog` "Import Specs" button (matches existing products by SKU first, then name; can update length/weight dimensions across unit systems via `withMmColumns` / `withWeightColumns`).

Frontend wizard: `artifacts/a3-portal/src/components/imports/ImportDialog.tsx` — 4 steps (Upload → Map columns → Preview → Results) with downloadable CSV template, auto-mapping based on header aliases, required-field validation, mode selector (create / update / upsert), per-row error report download.

Backend (`artifacts/api-server/src/routes/imports.ts`):
- `GET /api/imports/fields/:resource` — list of importable fields and types.
- `GET /api/imports/template/:resource` — CSV template download with two sample rows (US imperial + EU metric).
- `POST /api/imports/parse` (multipart, multer memory storage, 10 MB cap) — accepts CSV/TSV/XLSX, returns headers, sample rows, and suggested column→field mapping.
- `POST /api/imports/commit` — applies up to 5,000 mapped rows; returns counts + per-row errors.

Field schemas + coercion: `artifacts/api-server/src/lib/importSchemas.ts` (typed coercion for string/email/url/number/integer/boolean/csvList/unit). Length unit allowlist: `in, ft, mm, cm, m`; weight units handled by existing `withWeightColumns`. Booleans accept yes/no/true/false/1/0/active/inactive.

Suppliers schema extended with `companyName`, `website`, `addressLine`, `city`, `state`, `postalCode`, `country`, `defaultLeadTimeDays`, `notes` (`lib/db/src/schema/suppliers.ts`); SupplierBody zod updated; `pnpm --filter @workspace/db run push-force` applied.

Dedupe: suppliers by `name` OR `contactEmail`; products by `sku` OR `name`; specs by `sku` then `name` (specs in `update` mode skip non-matching rows). New supplier/product rows auto-generate slug from name.

### Section 25 extension — Venue branding bulk import (April 22, 2026)

Three additional resources were added to the same wizard:

- **Venues** — `CitiesAndVenues` (per-partner page) "Import Venues" button. Resolves `City` by name (partner-scoped) and validates `Unit Preference` ∈ `imperial|metric`. Dedupe by `(partnerId, name)`. Country accepts ISO codes.
- **Branding zones** — `BrandingLocations` (per-partner page) "Import Zones" button. Maps to `partnerBrandingLocationsTable`. Required to create: `name`, `category`. Optional `Zone Code` is the preferred dedupe key (falls back to `name`). Pricing fields (`pricingModel`, `unitRate`, `pricingUnit`, `minBillableSize`, `minCharge`, `allowsCustomSize`) and dimension fields (size + artwork in any unit, with bleed/safe-zone/visible) are normalized via `withMmColumns`. `Recommended Supplier` resolved by name. `Review Status` ∈ `approved|needs_review|rejected`.
- **Zone measurements** — `BrandingLocations` "Import Measurements" button. Update-only: matches existing zones by `(partnerId, internalCode)` then `(partnerId, name)`. Used to refresh dimensions across a venue rollout without recreating zones; non-matching rows are flagged for review.

Frontend `ImportDialog` now accepts `context: { partnerId?, venueId? }` plus `contextLabel` for display. Backend `CommitBody` accepts the same context object — when `partnerId` is provided by the calling page, the `Partner (by name)` column becomes optional and the import is automatically scoped to that partner. Branding-zone and zone-measurement imports require a partner (either via context or the column); rows that cannot be resolved are returned in the per-row error report rather than silently dropped.

Commit handlers for all three new resources are wrapped in `db.transaction` so a failed batch leaves no partial writes. CSV templates include US imperial + EU metric sample rows that mirror the live admin UI conventions.

### Section 25 extension #2 — Vendor packages bulk import (April 22, 2026)

A fourth import resource was added so admins can bring in client-supplied vendor package spreadsheets directly into a partner profile.

- **Vendor Packages** — `PackagesList` (per-partner page) "Import Vendor Packages" button. Maps to `packagesTable` + `packageItemsTable` together. Partner is auto-applied from the page context; if the spreadsheet also has a `Partner / Client` column, the value must resolve to the same partner or the row is rejected with a per-row error.

Row-grouping (`commitPackages`):
- Rows are grouped by Package Name (case-insensitive, trimmed). Carry-forward: when a row has only item-level fields and no name, it inherits the most recent group — this matches real-world spreadsheets where the package name appears once and items fill the rows below.
- The first row in a group sets the package metadata (tier, price, currency, dimensions, image, description, category, city/venue/notes, vendor, active flag).
- Every row in the group with item-level fields (`Item Name`, `Item SKU`, `Quantity`, item dims, material, finishing) becomes one entry in `packageItemsTable`.

Existing-package matching:
- Prefer `(partnerId, Package Code)` (code is stored in the package description prefix `Code: <value>` since `packagesTable` has no dedicated code column).
- Fall back to `(partnerId, Package Name)` (case-insensitive).
- Mode `create` skips matched rows, `update` skips unmatched rows, `upsert` does both.

Item / product handling:
- For each item row: try existing product by SKU (case-insensitive), then by Name. If neither matches, create a placeholder product (`isActive=false`, `reviewStatus="needs_review"`) so the spreadsheet's data is never silently dropped — admins can review and finalize them later.
- Items are appended to the package on update (existing items are preserved); operators who want to fully replace items can delete the package first.
- City / venue / package code / notes / category are appended to the package description (since `packagesTable` doesn't model them as separate columns); this keeps imports lossless without a schema migration.

Result payload extends the standard counts with `itemsCreated` and `productsCreated` so the wizard's results screen shows the full effect of the import.

CSV template (`/api/imports/template/packages`) ships with a real grouped example: one Bronze booth package spread across three item rows (carry-forward), plus a metric Premium package — both in the format the system actually accepts.

The whole commit runs inside `db.transaction`; any failure rolls back the package + its items + any newly created placeholder products together.

### Section 25 extension #3 — Vendor package PDF intake (April 22, 2026)

A third bulk-package channel sits next to the spreadsheet importer for the most common real-world artifact a partner sends: a vendor catalog PDF. Admins drop the PDF on the **"Convert Package PDF"** button on `PackagesList`, the system AI-extracts grouped package rows into a staging table, and the admin reviews/edits before the rows commit through the same `commitPackages` path used by CSV/XLSX — so all three intake channels share one validated write path.

Schema (`package_extractions`, `package_extraction_claims`):
- Self-contained, parallel to `deck_extractions` to keep the well-tested zones flow untouched. `package_extractions` holds `parsedRows` (JSONB array of rows matching `PACKAGE_FIELDS` keys + internal `_confidence`/`_sourcePage`/`_groupKey`/`_warnings`) plus document-level `parseWarnings` (e.g. partner-name mismatch). `package_extraction_claims` (PK `(partner_id, file_hash)`) gives concurrent uploads of the same PDF an atomic dedup lock — separate from `deck_extraction_claims` so a packages-parse and a zones-parse of the same PDF can run in parallel.

Status state machine (mirrors deck extraction): `processing → uploaded → text_extracted → chunked → awaiting_ai → parsed | needs_review | duplicate_reused | parse_failed → imported | archived`. `needs_review` is set automatically when any row's confidence < 0.4, when `parseWarnings` is non-empty, or when the AI returned zero rows — surfacing a yellow review banner in the UI instead of a green ready state.

Cost-reduction (mirrors deck extraction, same `PDF_LIMITS`-shaped caps): file-hash sha256 → reuse-from-prior path (any same partner+hash row in `parsed/needs_review/imported` is copied into the new extraction with `parseSource="reused_dedup"` for free) → atomic claim with 30s heartbeat refresh and 5min stale-takeover → `pdf-parse` once → boilerplate strip → keyword/price/dimension chunk picker (max 10 chunks, 8 KB AI input) → single `gpt-4o-mini` JSON-mode call (output capped at 2500 tokens). Tokens persisted on the extraction row for cost auditing; usage events emitted under `package_pdf.parse.{ai,rules,reused,failed}`.

AI prompt is package-focused: produces a flat row stream where each row is either a package header (`packageName` + tier/price/etc.) or a sub-item (`itemName`/quantity/material/etc.) with a stable `_groupKey` per package — the same grouped-rows shape `commitPackages` already understands. The model is instructed to flag a partner-name mismatch as a top-level warning when the PDF references a different client.

Frontend (`PackagePdfImportDialog`): four stages — **Upload** (with sha256 pre-flight to offer reuse before any AI cost), **Processing** (status-step polling every 1.5s), **Review** (rows grouped per package, expandable items, inline edit, low-confidence highlight, partner-mismatch banner, add/delete row, manual "Add package" escape hatch), **Results** (created/updated/skipped/failed counts plus per-row errors, mirroring the CSV importer's results UI). Edited rows are sent on commit; the staging row stores them for audit.

Routes (`routes/packageExtraction.ts`):
- `POST /api/partners/:partnerId/package-extractions` — create + kick off background processing
- `GET /api/partners/:partnerId/package-extractions[/check-duplicate?hash=…]` — list / preflight dedup
- `GET /api/package-extractions/:id` — full row incl. `parsedRows`
- `PATCH /api/package-extractions/:id` — edit staged rows/warnings/status (rejected with 409 while a parse is mid-flight)
- `POST /api/package-extractions/:id/commit` — strip internal `_*` keys, call `commitPackages` with `{ partnerId }` context, set status=`imported` (or back to `needs_review` if every row failed) and snapshot the result
- `POST /api/package-extractions/:id/rerun` — atomic terminal→processing flip then re-process with `forceRerun`
- `DELETE /api/package-extractions/:id`

`commitPackages` was promoted from a private function to an export of `routes/imports.ts`, so the PDF commit endpoint shares the exact same validation, contiguous-block grouping, savepoint-per-group rollback, and placeholder-product behavior as the CSV/XLSX commit — no parallel write path to maintain.

## Section 26 — Connected product families & reusable hardware auto-switch (April 22, 2026)
A "product family" connects a hardware base item (e.g. an Easy Up tent frame) with its dependent components (canopy, backdrop, side walls). Per-partner availability is derived live from the existing `inventory` table — no new state machine — and the public ordering portal automatically shifts between two modes:
- **component**: partner has enough hardware on hand → component is reserved against an existing inventory row
- **full_unit_required**: hardware exhausted → server returns HTTP 409 `HARDWARE_REQUIRED` and the portal auto-adds the hardware product to the cart

Schema (`lib/db/src/schema/productFamilies.ts`):
- `product_families` (slug UNIQUE, hardwareProductId, requiresHardwareDefault, isActive)
- `product_family_members` (familyId, productId, role enum `hardware|component|accessory`, requiresHardwareUnits, sortOrder; UNIQUE on familyId+productId)

Backend:
- `lib/familyAvailability.ts`: `getPartnerFamilyAvailability(partnerId, familyId?)` sums `hardwareOnHand - reserved - inUse - damaged - retired` across every inventory row the partner has for the family's hardware product (across all cities). `pickInventoryRowForFamily()` prefers the row with the most spare units, optionally biased to an event city.
- `routes/productFamilies.ts`: full CRUD + member management, `GET /api/partners/:partnerId/family-availability`, `GET /api/products/:productId/family-context?partnerId=…`, idempotent dev seed `POST /api/dev/seed-easy-up-family { partnerId }`. All Clerk-auth gated.
- `routes/orders.ts` POST handler: pre-validation walks order items, looks up family context, auto-fills `inventorySourceInventoryId` so the existing atomic `reserveForItem` path (FOR UPDATE) does the actual reservation. If demand exceeds availability AND the hardware product isn't also being purchased in the same order, returns `409 { code: "HARDWARE_REQUIRED", familyId, familyName, hardwareProductId, available, needed }`. Brings-your-own-frame orders short-circuit the check.
- `routes/publicPortal.ts`: public read-only `GET /public/partners/:slug/products/:productId/family-context` so the unauth ordering portal can render hints.

Admin UI:
- `pages/admin/ProductFamilies.tsx` lists every family + members and now opens with a **Live status** card: an admin picks any partner from a dropdown and sees one `<FamilyStatusCard>` per active family. Each card shows total / claimed / remaining, a percentage-claimed progress bar (color-coded healthy / amber / rose), the current ordering mode pill ("Existing hardware available" / "Low remaining" / "Full unit required" / "Manual review"), the low-stock threshold in effect, and quick-action links into the partner's committed-inventory and the inventory dashboard. The family-edit dialog gained a **Low-stock threshold** input — null means "auto" (`max(2, ceil(15% of total))`).
- `pages/admin/PartnerForm.tsx` adds a **Reusable Asset Inventory** card (only shown if the partner is wired up to ≥1 family) below Communications/Recipients. It calls `/api/partners/:id/family-availability` and renders the same `<FamilyStatusCard>` grid so the partner profile page is the single source of truth for their hardware status.
- Threshold logic and the four-level status (`healthy` / `low` / `exhausted` / `unconfigured`) are computed server-side in `getPartnerFamilyAvailability()` so admin and ordering UI agree.

Public ordering portal (`OrderingPortal.tsx`):
- Cart items show a green "Uses your existing X hardware (N of M available)" hint when in component mode, amber "hardware exhausted — a new unit will be added at submit" when not.
- `apiFetch` was extended to surface `{ status, body }` on errors so the submit `onError` can detect 409 `HARDWARE_REQUIRED` and auto-insert the hardware product into the cart with the needed quantity, prompting the partner to re-submit.

Reuses (no parallel state machines):
- `inventory` (hardwareOnHand/reserved/inUse/damaged/retired), `inventory_reservations`, `order_items.inventorySourceInventoryId/inventoryReservationId/reservedQuantity/shortageQuantity/fulfillmentMode`, `productCatalog.reusableHardwareCompatible/inventoryTracked`. Section 26 only adds the **family relationship layer** + the auto-switch policy on top.

## Admin navigation IA (April 22, 2026)
`AdminLayout.tsx` was previously a single flat row of ~30 nav items that overflowed past the viewport on standard desktops. Restructured into a primary-tabs + grouped-dropdown pattern:

- **Inline primary tabs** (visible on `xl+` / ≥1280px screens): Dashboard, Partners, Orders, Fulfillment, Production, Analytics. These are the highest-frequency destinations.
- **Grouped dropdowns** (Radix `DropdownMenu`): four labeled categories follow the primary tabs:
  - **Catalog** — Products, Product Families, Inventory, Pricing, Suppliers, Assets, Quote Ingestion
  - **Operations** — Workflow, Onboarding, Requests, Vendor View, Feedback
  - **Commerce** — Commercial, Sales, Billing, Reconciliation
  - **Platform** — Launch, Post-Launch, Rollout, Deployment, Users, Settings, Help, Runbook
- The desktop nav row uses `flex-1 min-w-0 overflow-hidden` so it can never push the page wider than the viewport. Each dropdown trigger highlights when any descendant route is active (`groupActive`), and the active item inside the menu is tinted.
- The `<lg` breakpoint switches to the existing left-side `Sheet` drawer, but the drawer is now itself grouped using the same `NAV_GROUPS` definition and gets `overflow-y-auto` so all items remain reachable on mobile.
- Single source of truth: `PRIMARY_NAV` and `NAV_GROUPS` arrays at the top of `AdminLayout.tsx`. Adding a new admin page only requires appending to one array; the dropdown, mobile drawer, and active-state logic update automatically.

## Section 27 — Rentable assets + date-based blackouts (April 22, 2026)
Builds on Section 26's connected-family system. Where Section 26 was about reusable hardware that gates print components, Section 27 covers the broader rentable inventory: chairs, tables, frames, banner stands, etc. — partner-owned items with rental pricing and event-eligibility rules — and adds **date-windowed availability** so the same units can't be promised twice.

Schema additions (single push):
- `inventory` columns: `rentable boolean`, `rental_price numeric(10,2)`, `price_basis text` (`per_event`|`per_day`), `eligibility_mode text` (`all`|`allowlist`), `eligible_event_ids integer[]`, `eligible_city_ids integer[]`, `archived_at timestamp`.
- `inventory_reservations` columns: `start_date date`, `end_date date`, `hold_reason text` (`event`|`manual`).
- New `inventory_blackouts` table: `inventory_id`, `start_date`, `end_date`, `quantity`, `reason` (`manual`|`maintenance`|`damage`|`internal`|`venue`|`pending_event`), `reason_note`, `event_id`, `created_by`. Indexed on `(inventoryId, startDate, endDate)`.

Backend:
- `lib/rentalAvailability.ts`: `getInventoryAvailabilityForRange(inventoryId, start?, end?)` returns `{ totalQuantity, inUse, damaged, retired, reservedInWindow, blackedOutInWindow, available, status, conflicts[] }`. Status is one of `available` / `partial` / `fully_booked` / `blacked_out`. Overlap test is the standard `start <= end_window AND end >= start_window`. Reservations with NULL dates fall back to the legacy `inventory.reserved` rolling counter so older code paths still subtract correctly.
- `getEventDateWindow(eventId)` resolves an event's active window (prefers `installDate → teardownDate`, else `eventDate`), used to stamp new reservations.
- `isEligibleForEvent(row, eventId, eventCityId)` — partner-set allowlist gate.
- `routes/rentableAssets.ts`: `GET /api/partners/:id/rentable-assets?start=&end=` (per-row availability for the chosen window), `PATCH /api/inventory/:id/rental` (rentable/price/eligibility/archive), full `GET/POST/PATCH/DELETE /api/inventory/:id/blackouts`, `GET /api/inventory/:id/bookings` (combined reservations + blackouts joined with event metadata), `GET /api/inventory/:id/availability?start=&end=&eventId=&eventCityId=` (single-row check used by ordering UIs).
- `routes/orders.ts` `reserveForItem` is now date-aware: it locks the inventory row, looks up the event's install/teardown window, sums overlapping date-bound reservations and blackouts, and only counts the legacy NULL-date `inventory.reserved` counter on top. New reservations are always stamped with `startDate`/`endDate`/`holdReason='event'`. This means two events on the same dates compete for the same units, but two events in different weeks see independent capacity — the silent double-booking risk is gone.

Admin UI:
- New `<RentableAssetsCard>` rendered in `PartnerForm.tsx` directly under `<ReusableAssetsCard>`. Provides:
  - A date-window picker (defaults to today) so admins can ask "what's free for these dates?"
  - A table of rentable rows showing total / available-in-window / rental price / eligibility, with an inline status badge (`Available` / `Partially booked` / `Fully booked` / `Blacked out`).
  - **Edit dialog** per row: toggle rentable, set price + basis (`per_event`/`per_day`), pick eligibility mode (all / allowlist of event IDs), archive.
  - **Bookings & blackouts dialog**: add/delete manual blackouts with reason + note, see all active reservations from real orders alongside manual holds.
  - A collapsed "other inventory rows" section so any existing non-rentable inventory can be flipped to rentable in one click.

Demo seed (idempotent, extends `POST /api/dev/seed-easy-up-family`):
- 120 folding chairs ($5/event), 20 cocktail tables ($25), 15 banquet tables ($40), 8 step-and-repeat frames ($150), 40 retractable banner stands ($30), all marked rentable with `eligibilityMode='all'`.
- Manual blackout: 8 banquet tables flagged `maintenance` for next week (`+7 → +10 days`).
- Auto-reservation: 60 of the 120 chairs reserved for the partner's next upcoming event (using its install/teardown window) — the rentable card immediately shows `60 available` plus `Reserved 60` and a `Partially booked` badge.

Connected-family interaction:
- The Section 26 frame-availability check still runs **before** date-aware reservation, so the existing `409 HARDWARE_REQUIRED` swap continues to work. Once frame reservations are date-windowed, the same family can be in `component` mode for one event window and `full_unit_required` for an overlapping one — exactly the behavior asked for.

Known limitations (explicit):
- Eligibility allowlist is stored as plain `integer[]` of event IDs — there's no "event type" column on `events` yet, so type-level rules would need that to be added first.
- Bulk CSV upload of rentable assets isn't wired in this pass; the model and routes are shaped so an importer can target them next.

## Section 28 — Operational email delivery & routing (April 22, 2026)
Tightens the order intake → email pipeline that's been built up across earlier sections so it's actually operational for the current "collect orders, email me + Sean" model. No schema changes — the tables already exist. This section is about wiring the **multi-recipient routing**, the **per-order delivery visibility**, and a **demo seed** so the workflow is provable end-to-end.

### Operating model
- The portal's job today is: **collect the order cleanly + email it to the right people.**
- Every submitted order triggers a parallel fan-out via `sendOrderEmails(orderId)` in `artifacts/api-server/src/lib/email.ts`:
  - **Customer confirmation** — branded with the partner theme + logo, sent to `order.contactEmail`. Subject uses the partner's `emailSenderLabel` or `companyName`.
  - **Internal / ops forward** — full operational detail (customer, event, venue, items, quantities, units, notes, artwork file links). Sent to all `partner_email_recipients` rows with `role='ops'` + `isActive=true`. Falls back to legacy `partner.internalForwardEmail`/`partner.routingEmail` when no rows are configured.
  - **Finance notification** — billing-focused header for `role='finance'` recipients (or legacy `partner.billingContactEmail`).
  - **Partner contact notification** — clean partner-facing summary for `role='partner_contact'` recipients (or legacy `partner.contactEmail`).
  - **Vendor notification** — operational view for `role='vendor'` recipients (no legacy fallback — must be explicitly configured).
- `cc` and `bcc` recipients are folded into the ops send only.

### Where routing is configured
- Per partner, in **Admin → Partners → [partner] → Communications & Email**:
  - Top of card: legacy single-field settings (`From Name`, `Reply-To`, `Internal Forwarding Email`, `CC Email`, `Send order emails` toggle).
  - Below that: **`RecipientsManager`** — full multi-recipient routing UI backed by `partner_email_recipients`. Add any number of routing recipients per role, mark them active/inactive, and remove without affecting orders that already shipped.
  - Then: **PDF attachment toggles** — choose which audiences (customer / ops / finance / partner-contact) get the branded one-page order summary PDF attached.
  - Bottom: **Branding preview** + **two test-send actions** (test confirmation, test internal forward).

### Failure handling
- `sendOrderEmails` runs all five sends in `Promise.all` wrapped in `safe()` — any failure (Resend error, missing recipient, disabled partner) returns `{ ok: false, error }` instead of throwing. **Order submission never fails because of email.**
- Each role independently resolves its recipient list. A role with no configured recipients (and no legacy fallback) returns `{ ok: false, error: 'no_<role>_recipient' }` and is silently skipped.
- Every send (success or failure) emits a `usage_events` row (`event_type='email.sent'` or `'email.failed'`) with `objectType='order'`, `objectId=orderId`, and a `meta` object containing `{ type, to, subject, providerId | error, attached, attachments }`.

### Admin visibility (per-order)
- **Order Detail → Email delivery** (`OrderEmailDeliveryPanel.tsx`) reads `GET /api/orders/:id/email-events` and renders:
  - **Per-audience status pills** (latest result per type — customer / ops / finance / partner contact / vendor).
  - **Detailed timeline** with timestamps, recipient lists, subjects, attachments, and Resend error strings.
  - PDF render counter (sent/failed) at the bottom.
- The endpoint is the existing `usage_events` table filtered to email + pdf events for that order — no new schema.

### Demo seed
- `POST /api/dev/seed-easy-up-family` (Section 26 one-shot, Clerk-gated) now also seeds:
  - 3 routing recipients (ops: `owner@a3-demo.test`, ops: `sean@a3-demo.test` labeled "Sean — program manager", cc: `ops-archive@a3-demo.test`).
  - Sample email events on the partner's most recent order: one successful customer confirmation, one successful ops forward to both routing recipients (with PDF attachment), and one bounced partner-contact email — so the new delivery panel has visible activity immediately.
- Idempotent: existing recipients/events are skipped on re-runs.

### Files touched
- `artifacts/api-server/src/routes/orders.ts` — adds `GET /orders/:id/email-events`.
- `artifacts/api-server/src/routes/productFamilies.ts` — extends seed with recipients + sample events.
- `artifacts/a3-portal/src/components/admin/OrderEmailDeliveryPanel.tsx` — new.
- `artifacts/a3-portal/src/pages/admin/OrderDetail.tsx` — mounts the panel under Client Notes.

### Known limitations
- Email events are read from `usage_events`, which is best-effort logging and not transactionally tied to the Resend call itself. A double-failure (Resend ok, log insert fails) is possible but vanishingly rare; the order itself is unaffected either way.
- The `RecipientsManager` UI only edits `partner_email_recipients`; partners using the legacy single-field settings will continue to work but won't see those addresses in the routing UI until they're migrated.

## Section 29 — Order exceptions & artwork-needed workflow (April 22, 2026)
Adds a real exception-handling workflow on top of the existing order pipeline. Item-level `exception_flag/reason/notes` already existed (and stays untouched); this section adds an **order-level** state machine + an **artwork-needed** flow so admins can triage messy real-world situations without having to dig into individual line items.

### The exception model
Per order, one row in `orders`:
- `exception_state` — one of:
  - `none` (default, hidden everywhere)
  - `warning` (something to watch but not blocking)
  - `exception` (active blocker; production should not proceed)
  - `waiting_client` (we've reached out, waiting on the client to respond)
  - `waiting_internal` (parked for internal review)
  - `resolved` (was flagged, now sorted — kept around so the audit trail survives)
- `exception_type` — structured category from a fixed list:
  `missing_artwork · artwork_creation_needed · wrong_file_or_spec_format · missing_dimensions · missing_contact_info · unclear_order_notes · custom_review_needed · rush_request · incomplete_package_selection · asset_mismatch · manual_follow_up_required`
- `exception_message` — free-text "what's wrong / what we need" string (max 2000 chars).
- `exception_updated_at` / `exception_updated_by` — audit columns set automatically on every state change.

### Artwork-needed workflow (separate, can stack with any exception)
- `artwork_needed_flag` — boolean. When true, the customer needs us to **design** something (vs. just supply existing files).
- `artwork_brief` — free text describing what to design.
- `artwork_contact_name` / `artwork_contact_email` — who to route the design request to. Defaults to the **partner's design contact** if one is configured (`partners.design_contact_name` / `design_contact_email`, new in this section), otherwise blank.
- Toggling artwork-needed ON when the order has `exception_state='none'` automatically bumps it to `warning · artwork_creation_needed` so the dashboard surfaces it without an extra step.
- The new partner-level design contact lives on the partners table and acts as the default for every order belonging to that partner.

### Missing/incomplete asset handling
- The new exception types `missing_artwork` and `wrong_file_or_spec_format` map directly to common asset failures.
- The order detail page already shows the asset list; the new exception panel sits right beside it so admin sees both at the same time.
- The internal forward email now renders an **exception banner block** at the top whenever `exception_state != 'none'` (or artwork-needed is on), with the state, category label, the admin's free-text message, and (for artwork) the design contact + brief. Outlook/Gmail-safe inline styles, colored left border keyed off the state.

### Visibility
- **Orders dashboard list** — each row shows the regular status badge + (when set) an exception badge stacked underneath using the same color key as the panel (warning=amber, exception=red, waiting_client=blue, waiting_internal=violet, resolved=emerald), plus a `🎨 Artwork needed` badge when applicable. The list endpoint exposes `exceptionState`, `exceptionType`, `artworkNeededFlag`.
- **Order detail page** — new `OrderExceptionPanel` card mounted under Client Notes. Shows the current state pill in the header, lets admin pick state + category + edit the message, and exposes one-click action buttons (Save / Waiting on client / Waiting internal / Mark resolved / Clear). The artwork-needed sub-card carries its own brief + design contact fields, with a one-click "use partner default" link if the partner has a design contact configured.
- **Internal forward email** — banner described above, top of the message before customer/event details.

### Internal actions (admin)
- `POST /api/orders/:id/exception { state, type?, message? }` — single endpoint covers flag/transition/clear. Clearing (`state='none'`) wipes type/message so the audit row is clean. Auth-gated; sets `exception_updated_at/by`.
- `POST /api/orders/:id/artwork-needed { flag, brief?, contactName?, contactEmail? }` — toggles the artwork flag and (when enabling) optionally bumps `exception_state` from `none → warning · artwork_creation_needed` so it shows up immediately.

### Communications drafts
The exception panel includes three "send a follow-up" buttons that open the admin's mail client with a pre-filled draft using the order's existing contact info — no new email pipeline:
- **Request missing assets** → to the customer.
- **Request artwork creation** → to the design contact (artwork-specific or partner-default), with the saved brief inlined into the body.
- **Ask for clarification** → to the customer.
These are intentionally `mailto:` drafts rather than auto-sends because the wording always benefits from a human pass before it goes out.

### Demo seed
The existing `/api/dev/seed-easy-up-family` one-shot now also patches up to four of the partner's most recent orders into representative states (idempotent — only touches orders currently `none/no-artwork`):
- one **missing artwork** exception (`exception` state)
- one **artwork creation needed** request with a sample brief + design contact (`warning` state, artwork flag ON)
- one **missing dimensions** order in `waiting_client`
- one already-**resolved** "wrong file format" exception
And it ensures the partner has a default design contact (`Riley — partner design / design@a3-demo.test`) set if one wasn't already.

### Files touched
- `lib/db/src/schema/orders.ts` — adds the eight exception/artwork columns.
- `lib/db/src/schema/partners.ts` — adds `design_contact_name` / `design_contact_email`.
- `artifacts/api-server/src/routes/orders.ts` — new `/orders/:id/exception` + `/orders/:id/artwork-needed` routes; lists endpoint surfaces the new fields.
- `artifacts/api-server/src/lib/email.ts` — new `renderExceptionBanner` injected at the top of the internal forward template, with state/type label maps.
- `artifacts/api-server/src/routes/productFamilies.ts` — seed extension.
- `artifacts/a3-portal/src/components/admin/OrderExceptionPanel.tsx` — new.
- `artifacts/a3-portal/src/pages/admin/OrderDetail.tsx` — mounts the panel, extends `OrderFull` type.
- `artifacts/a3-portal/src/pages/admin/OrdersDashboard.tsx` — exception + artwork badges in the status column.

### Known limitations
- Exception state is a single value per order; there's no "multiple concurrent issues" stack. The free-text message is the escape hatch when more than one thing is wrong.
- The follow-up communications are `mailto:` drafts only — they don't touch Resend or log to `usage_events`. If we want them centrally tracked later, we can wire them to `sendBrandedEmail` the same way the customer/ops flows are.
- The new `exception_state` is independent from the existing **item-level** `exception_flag`; they can drift. Item-level issues continue to drive supplier/vendor flows; the order-level state is the admin-and-customer-facing summary. A future pass could automatically roll up item issues into a default `warning` on the order, but for now it's intentional that the human decides.
