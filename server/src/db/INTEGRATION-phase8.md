# Phase 8 Integration - Super Admin Intelligence, Feedback, Support, Disputes, Reports, Audit, Marketplace Search + SEO, Availability, Compliance / E-Sign, and PRIVATE White-Label

Blueprint sections 30, 32, 36, 37, 38, 40, 41, 42, 44 and the White-Label
section (5). All Phase 8 work lives in NEW files only. This doc tells the
integrator (whoever owns `server/src/routes.ts`, `src/App.tsx`, and
`db/schema.sql`) exactly what to wire up. None of those edits are done here.

## 1. Database

Apply `db/schema-phase8.sql` AFTER `db/schema.sql`. It is additive and
idempotent (every column add is guarded with `if not exists`; every table uses
`create table if not exists`).

```
psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase8.sql
```

What it adds:

- `support_tickets` extras: `subject`, `resolution`, `updated_at`, `resolved_at`.
- `feedback_items` extras: `title`, `organization_id`, `votes`, `updated_at`.
- `audit_logs` extras: `summary`, `actor_email`.
- `documents` extras (COI / W-9 / e-sign): `name`, `coverage_amount`, `carrier`,
  `policy_number`, `signed_status`, `signed_at`, `signed_by`, `updated_at`.
- `disputes` (NEW): disputes / refunds / cancellations with kind, category,
  reason, amount, resolution, assignment, status lifecycle.
- `availability_records` (NEW): venue + vendor bookable / blocked windows.
- `esign_requests` (NEW): lightweight in-platform e-sign lifecycle (MVP).
- `whitelabel_records` (NEW): PRIVATE white-label pipeline + custom config
  (fee rate, seats, domain, branding). One row per org (unique).

## 2. Backend routers - mount in `server/src/routes.ts`

Add these imports and mounts (the file has commented placeholders already):

```ts
import admin from "./routes/admin.js";
import support from "./routes/support.js";
import feedback from "./routes/feedback.js";
import disputes from "./routes/disputes.js";
import compliance from "./routes/compliance.js";
import marketplace from "./routes/marketplace.js";
import reports from "./routes/reports.js";

router.use("/admin", admin);              // requireAdmin (all)
router.use("/support", support);          // requireUser
router.use("/feedback", feedback);        // requireUser
router.use("/disputes", disputes);        // requireUser
router.use("/compliance", compliance);    // requireUser
router.use("/marketplace", marketplace);  // PUBLIC (no auth)
router.use("/reports", reports);          // requireUser (admin-revenue is admin-only)
```

### Routes (method + full path + auth level)

Admin (`server/src/routes/admin.ts`) - ALL `requireAdmin`:
- `GET    /api/admin/metrics`                         intelligence metrics (44)
- `GET    /api/admin/accounts`                        list orgs (query: verification_status, tier)
- `POST   /api/admin/accounts/:id/verification`       approve / reject / suspend (audited)
- `POST   /api/admin/accounts/:id/subscription`       suspend / reactivate (audited)
- `GET    /api/admin/white-label/meta`                white-label statuses (PRIVATE)
- `GET    /api/admin/white-label`                     PRIVATE pipeline rollup
- `GET    /api/admin/white-label/:orgId`              PRIVATE single record
- `PATCH  /api/admin/white-label/:orgId`              PRIVATE update internal fields + custom config (audited)
- `POST   /api/admin/white-label/:orgId/status`       PRIVATE lifecycle status (audited; activates org tier)
- `GET    /api/admin/audit`                           audit reader (query: actorId, action, objectType, objectId, limit, offset)
- `GET    /api/admin/audit/actions`                   distinct action verbs

Support (`server/src/routes/support.ts`) - `requireUser`; admin actions gated in db:
- `GET    /api/support/meta`                          statuses / categories / urgencies
- `GET    /api/support`                               list (own for users, all for admins)
- `POST   /api/support`                               open a ticket
- `GET    /api/support/:id`                           single ticket (owner or admin)
- `POST   /api/support/:id/status`                    set status (audited)
- `POST   /api/support/:id/assign`                    assign to admin (admin only, audited)

Feedback (`server/src/routes/feedback.ts`) - `requireUser`:
- `GET    /api/feedback/meta`                         types + statuses
- `GET    /api/feedback`                              list (own for users, all for admins; query: type, status)
- `POST   /api/feedback`                              submit feedback / feature request
- `POST   /api/feedback/:id/vote`                     +1 a request
- `POST   /api/feedback/:id/status`                   set status + admin notes (admin only, audited)
- `GET    /api/feedback/patterns`                     deterministic AI pattern note (count by type)

Disputes (`server/src/routes/disputes.ts`) - `requireUser`; resolution gated in db:
- `GET    /api/disputes/meta`                         statuses / kinds / categories
- `GET    /api/disputes`                              list (party for users, all for admins; query: status, kind)
- `POST   /api/disputes`                              open dispute / refund / cancellation (audited)
- `GET    /api/disputes/:id`                          single (party or admin)
- `POST   /api/disputes/:id/status`                   advance status / resolve (audited)

Compliance (`server/src/routes/compliance.ts`) - `requireUser`; approval gated in db:
- `GET    /api/compliance/meta`                       required-docs map + avail statuses
- `GET    /api/compliance/checklist`                  per-role required-doc checklist + COI expiry
- `GET    /api/compliance/expiring`                   docs expiring within ?days (default 30)
- `GET    /api/compliance/documents`                  list (query: document_type)
- `POST   /api/compliance/documents`                  record a document (COI fields optional)
- `POST   /api/compliance/documents/:id/approval`     approve / reject (admin only, audited)
- `GET    /api/compliance/esign`                      list e-sign requests
- `POST   /api/compliance/esign`                      create request (status sent)
- `POST   /api/compliance/esign/:id/sign`             mark signed (mirrors onto the document)
- `GET    /api/compliance/availability`               list windows (query: from, to, resource_type)
- `POST   /api/compliance/availability`               create a window
- `DELETE /api/compliance/availability/:id`           remove a window

Marketplace (`server/src/routes/marketplace.ts`) - PUBLIC (no auth):
- `GET    /api/marketplace/meta`                      sorts + facets (kinds / categories / regions)
- `GET    /api/marketplace/search`                    search published profiles (filters 38.1/38.2, sort 38.3)
- `GET    /api/marketplace/profile/:slug`             SEO profile, public approved fields only (40)

Reports (`server/src/routes/reports.ts`) - `requireUser`; admin-revenue admin-only:
- `GET    /api/reports/meta`                          report type list
- `GET    /api/reports/event-summary`                 event summary report
- `GET    /api/reports/bid-comparison`                bid comparison (query: event_id required)
- `GET    /api/reports/payment-report`                payment report
- `GET    /api/reports/vendor-performance`            vendor performance
- `GET    /api/reports/admin-revenue`                 platform revenue (admin only)

All admin-facing endpoints use `requireAdmin`; user-facing ones use
`requireUser` and resolve the org via `db.getActor`. Admin-only sub-actions on
shared routes (status transitions on feedback/disputes, document approval,
ticket assignment) are re-checked in the db layer. Consequential actions write
to `audit_logs` via `server/src/lib/audit.ts` (`logAction`).

## 3. Frontend pages - register routes in `src/App.tsx`

Each component is a default export and uses only `react` + `react-router-dom` +
the named `src/lib/*` modules. Intended route paths (place inside the
authenticated route group, except marketplace search which can be either):

| Component | File | Route path | Access |
| --- | --- | --- | --- |
| AdminIntelligence | `src/pages/admin/AdminIntelligence.tsx` | `/admin/intelligence` | admin only |
| AdminAccounts | `src/pages/admin/AdminAccounts.tsx` | `/admin/accounts` | admin only |
| WhiteLabelAdmin | `src/pages/admin/WhiteLabelAdmin.tsx` | `/admin/white-label` | admin only - PRIVATE, never in public nav |
| AuditLog | `src/pages/admin/AuditLog.tsx` | `/admin/audit` | admin only |
| SupportCenter | `src/pages/support/SupportCenter.tsx` | `/support` | all roles |
| Disputes | `src/pages/disputes/Disputes.tsx` | `/disputes` | all roles |
| Compliance | `src/pages/compliance/Compliance.tsx` | `/compliance` | all roles |
| MarketplaceSearch | `src/pages/marketplace/MarketplaceSearch.tsx` | `/marketplace/search` | authed (data-backed; replaces the static sample for signed-in users) |
| Reports | `src/pages/reports/Reports.tsx` | `/reports` | all roles (admin sees platform revenue) |

Example wiring:

```tsx
import AdminIntelligence from './pages/admin/AdminIntelligence';
import AdminAccounts from './pages/admin/AdminAccounts';
import WhiteLabelAdmin from './pages/admin/WhiteLabelAdmin';
import AuditLog from './pages/admin/AuditLog';
import SupportCenter from './pages/support/SupportCenter';
import Disputes from './pages/disputes/Disputes';
import Compliance from './pages/compliance/Compliance';
import MarketplaceSearch from './pages/marketplace/MarketplaceSearch';
import Reports from './pages/reports/Reports';

<Route path="/admin/intelligence" element={<AdminIntelligence />} />
<Route path="/admin/accounts" element={<AdminAccounts />} />
<Route path="/admin/white-label" element={<WhiteLabelAdmin />} />
<Route path="/admin/audit" element={<AuditLog />} />
<Route path="/support" element={<SupportCenter />} />
<Route path="/disputes" element={<Disputes />} />
<Route path="/compliance" element={<Compliance />} />
<Route path="/marketplace/search" element={<MarketplaceSearch />} />
<Route path="/reports" element={<Reports />} />
```

Each admin page also self-guards on `useAuth().isAdmin` and renders a restricted
notice for non-admins, so even a leaked route never exposes admin data. The
white-label page additionally must NOT appear in any public navigation; only
link it from the Super Admin dashboard / admin nav.

## 4. FeedbackWidget - embed in every dashboard

`src/components/FeedbackWidget.tsx` is a default export rendering a floating
"Feedback" launcher + modal that posts to `POST /api/feedback`. Drop it once
into each role dashboard (Client, Venue, Vendor, Planner, Installer, SuperAdmin)
near the root of the rendered tree:

```tsx
import FeedbackWidget from '../../components/FeedbackWidget';
// ...inside the dashboard return, e.g. just before </DashboardShell>:
<FeedbackWidget context="vendor_dashboard" />
```

`AdminIntelligence` is the metrics surface for the Super Admin dashboard - link
its `/admin/intelligence` route from the existing "Intelligence" nav item in
`SuperAdminDashboard.tsx`, and embed `<FeedbackWidget />` there too.

## 5. Marketplace SEO profile page (optional public route)

`GET /api/marketplace/profile/:slug` returns public, clearly-labeled fields for
an SEO profile page. The MarketplaceSearch cards link to `/p/:slug`; if you want
that page, add a small public component that reads the endpoint. Not built here
to avoid overlap with the existing public Marketplace page; the data endpoint is
ready.

## 6. White-label remains admin-only

`whitelabel_records` and every `/api/admin/white-label*` route are behind
`requireAdmin`. The `WhiteLabelAdmin` page self-guards on `isAdmin`. Do NOT add
it to the public navigation or any partner-facing menu. Activating a record
flips `organizations.white_label_status = active` and promotes the org tier to
`white_label`, all inside one transaction and recorded in the audit log.

## 7. Files added in Phase 8

Backend:
- `server/src/lib/audit.ts`
- `server/src/db/admin.ts`
- `server/src/db/support.ts`
- `server/src/db/feedback.ts`
- `server/src/db/disputes.ts`
- `server/src/db/compliance.ts`
- `server/src/db/whitelabel.ts`
- `server/src/db/marketplace.ts`
- `server/src/db/reports.ts`
- `server/src/routes/admin.ts`
- `server/src/routes/support.ts`
- `server/src/routes/feedback.ts`
- `server/src/routes/disputes.ts`
- `server/src/routes/compliance.ts`
- `server/src/routes/marketplace.ts`
- `server/src/routes/reports.ts`
- `db/schema-phase8.sql`

Frontend:
- `src/components/FeedbackWidget.tsx`
- `src/pages/admin/AdminIntelligence.tsx`
- `src/pages/admin/AdminAccounts.tsx`
- `src/pages/admin/WhiteLabelAdmin.tsx`
- `src/pages/admin/AuditLog.tsx`
- `src/pages/support/SupportCenter.tsx`
- `src/pages/disputes/Disputes.tsx`
- `src/pages/compliance/Compliance.tsx`
- `src/pages/marketplace/MarketplaceSearch.tsx`
- `src/pages/reports/Reports.tsx`

Docs:
- `server/src/db/INTEGRATION-phase8.md` (this file)
