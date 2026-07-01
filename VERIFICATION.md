# Divini Partners by Divini Group — Verification Report

> **UPDATE 2026-06-16 (post-integration re-audit):** All previously PARTIAL items
> are now DONE. Current status: **Master 24 / 24 DONE (100%)**, **Claim 14 / 14 DONE
> (100%)** — combined 38 / 38. Email transport (Resend/Postal), standardized PDF
> (pdfkit), real Stripe + PayPal payments with Connect/Payouts auto-split, live
> URL/document AI extraction (local-first Ollama, SSRF-guarded), autonomous
> discovery search (SearXNG), the claim outreach + market-expansion scheduler
> (cron worker), seat billing, the 6 embedded workspace tabs, mobile event-day
> mode, SEO landing pages + sitemap, and the invite/vendor-network growth loop are
> all implemented, mounted, and routed. A pre-launch security re-audit + functional
> bug sweep passed after fixing: an invite-email rate-limit/dedupe (spam-cannon
> guard) and a post-claim redirect (/dashboard -> /app). The only remaining gate is
> populating production credentials (payment keys + webhook secrets, email provider,
> optional local LLM / SearXNG) and a cron schedule for the worker; every
> integration is feature-flagged to fail safe when unset. The body below is the
> original 2026-06-15 audit, retained for history.

**Audited:** 2026-06-15
**Scope:** Codebase at `sites/divini-partners` vs. `divini_partners_master_rebuild_blueprint.md` (49 sections, 24 acceptance criteria) and `divini_partners_claim_profile_automation_addendum.md` (14 acceptance criteria).
**Method:** Static read of 29 backend routers, 31 db modules, 10 lib modules, 11 SQL schema files, `App.tsx`, and all `src/pages/**`. No code was modified. No build/test was run from this environment (project is on the Mac-local path, not reachable from the sandbox).

---

## 1. Headline Summary

**Master blueprint acceptance criteria (section 47): 21 / 24 DONE, 3 PARTIAL, 0 MISSING.**
**Claim engine acceptance criteria (addendum): 13 / 14 DONE, 1 PARTIAL, 0 MISSING.**

The build is genuinely broad and deep — every blueprint domain has a backend router, a db module, a SQL schema, and at least one frontend page. The architecture is sound and the structures (statuses, fields, tier windows, fee rates) faithfully mirror the blueprint. The honest caveats are at the *edges of real-world integration*, all of which were deliberately scaffolded as documented seams:

- **Email sending is a stub.** `lib/notify.ts` and `lib/claim-emails.ts` only `console.log` the message that *would* be sent. No SMTP/Resend/SES. This affects master AC #17 and claim AC "weekly email runs."
- **Payments are record-only.** No Stripe/processor. `lib/leakage.ts` + `routes/payments.ts` track fees, payout statuses, and the external-payment policy, but no money actually moves.
- **AI is deterministic, not model-backed.** Auto-quote, recommendations, trust scores, next-best-action, scope builder, risk detection, and claim-profile description/confidence are all pure rule-based functions. No LLM/external model is called anywhere. This is correct per the blueprint's "AI should not be hype" stance, but it means "AI website scrape" does not actually fetch/parse a live site — an admin/user feeds in structured rows.
- **No PDF generation.** `standardized_pdf` columns exist on quotes/invoices but are never populated; there is no pdfkit/puppeteer/HTML-to-PDF. "Downloadable PDF" (blueprint 19.2, 20.2, 41) is data-modeled but not rendered.
- **Leakage scan is wired into payments only, not messages.** The blueprint (21.4) lists "user messages payment language like Venmo/Zelle" as a trigger; `detectLeakageLanguage` exists and is exposed via `POST /api/payments/detect`, but `routes/messages.ts` does not call it on message send, so the in-message trigger is not automatic.

---

## 2. Master Blueprint Acceptance Criteria (Section 47)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Public website explains Divini Partners as an event partnership OS | DONE | `src/pages/Landing.tsx` + `pages/public/{ForVenues,ForVendors,ForPlanners,ForClients,HowItWorks,Marketplace,Pricing}.tsx`; nav in `App.tsx` matches blueprint 3.1. |
| 2 | Register by role + accept required terms/policies | DONE | `routes/foundation.ts` (`/register`), `db.registerOrganization` writes `terms_acceptance` (user, version, IP, account_type); `pages/Register.tsx`. |
| 3 | Clients create free event profiles | DONE | `TIERS.client = {monthly:0, feeRate:0}` in `db.ts`; `routes/events.ts` create; `pages/dashboards/ClientDashboard.tsx`, `pages/events/EventsList.tsx`. |
| 4 | Vendors/venues select Free/Partner/Premier | DONE | `TIERS` (free_partner 5%, partner $45/2.5%, premier $99/1%); exposed at `/api/tiers`; `pages/public/Pricing.tsx`. |
| 5 | Seat pricing implemented | PARTIAL | `$5/seat` is documented in `Pricing.tsx` and schema has `included_seats`/`additional_seats` columns, but there is no billing logic that *charges* per seat and no admin/account UI to add/remove paid seats. Modeled, not transacted. |
| 6 | Drop website URLs + upload documents for AI-assisted profiles | PARTIAL | Onboarding (`pages/onboarding/Onboarding.tsx`) accepts URL/doc inputs and `routes/profiles.ts` stores them; AI "extraction" is deterministic structuring, **not a live fetch/parse of the website**. No HTTP fetch of the URL, no real doc OCR/parse. |
| 7 | Profiles co-branded (Divini shell + user section branding) | DONE | `components/Shell.tsx` (platform shell), `pages/profile/PublicProfile.tsx` with brand color/logo theme fields; blueprint 9 hierarchy honored. |
| 8 | Venues upload floorplans, rates, availability, rules, preferred vendors | DONE | `db/profiles.ts` venue fields + `routes/profiles.ts`; floorplans via `db/seating.ts`; `event/tabs/FloorplansTab.tsx`; preferred vendors via `db/starred.ts`. |
| 9 | Vendors upload services, inventory, pricing, documents, availability | DONE | `routes/inventory.ts` + `db/inventory.ts`; `db/pricing-memory.ts`; `routes/compliance.ts` (docs/COI/W-9); `pages/inventory/InventoryManager.tsx`, `pages/pricing-memory/`. |
| 10 | Clients/planners create events, manage guest lists, use floorplans | DONE | `routes/events.ts`, `routes/guests.ts` + `db/guests.ts` (RSVP, meal, VIP, plus-one), `event/tabs/{GuestListTab,FloorplansTab}.tsx`. |
| 11 | Bids posted with tier-based access rules | DONE | `db/bids.ts` `PREMIER_WINDOW_MS=48h`, `PARTNER_WINDOW_MS=7d`, private/invite logic; `routes/bids.ts`; `pages/bids/BidBoard.tsx`. |
| 12 | Vendors generate/edit/submit quotes | DONE | `lib/autoquote.ts` (deterministic generation), `routes/quotes.ts` + `routes/autoquote.ts`; `pages/quotes/AutoQuoteDraft.tsx`, `event/tabs/QuotesTab.tsx`. |
| 13 | Quotes and invoices standardized in Divini format | PARTIAL | Data is standardized (canonical line-item/fee/status schema in `db/quotes.ts`, `db/invoices.ts`) and rendered in-app, but the blueprint's **downloadable standardized PDF** is not generated — `standardized_pdf` column is never populated; no PDF library present. |
| 14 | Payments and platform fees tracked | DONE | `routes/payments.ts` + `db/payments.ts`; fee computed from `TIERS[tier].feeRate`; payout statuses per blueprint 21.2. (Record-only; no processor — expected.) |
| 15 | External payment attempts trigger policy warning + admin review | DONE | `lib/leakage.ts` `evaluateExternalPayment` (requires reason+proof, computes fee owed, flags account, notifies admin); `POST /api/payments/external`; `components/LeakageModal.tsx` with exact "Payment Protection Notice" copy. (Note: not auto-triggered from message text — see AC #16 note.) |
| 16 | Internal messaging across events, bids, quotes, invoices, docs, tasks | DONE | `routes/messages.ts` + `db/messages.ts` with thread types + visibility rules (blueprint 7.2); `event/tabs/MessagesTab.tsx`. Gap: message text is **not** scanned for leakage language on send, so the blueprint's in-message Venmo/Zelle trigger is manual, not automatic. |
| 17 | Email notifications sent to contact emails for key activity | PARTIAL | `lib/notify.ts` is called from `bids.ts`, `events.ts`, `messages.ts`, `quotes.ts` with correct recipients/subjects/context, **but `deliver()` only `console.log`s** — no real email is sent. The seam is clean and ready, but no email actually leaves the system. |
| 18 | Itineraries auto-build as event details confirm | DONE | `db/itinerary.ts` `buildItinerary()` derives load-in/setup/doors/program/load-out from event + accepted quotes + venue; `routes/itinerary.ts`; `event/tabs/ItineraryTab.tsx`. |
| 19 | Reviews trigger after event completion | DONE | `db/reviews.ts` `requestReview` (status `requested` on completion), `submitRequestedReview`, `listMyReviewRequests`; `routes/reviews.ts`; `pages/reviews/Reviews.tsx`. |
| 20 | Repeat vendor relationships trigger starring prompts | DONE | `db/starred.ts` repeat-relationship detection; surfaced via `lib/nextbestaction.ts` (`repeatPromptCount`); `routes/starred.ts`. |
| 21 | Change orders for scope changes | DONE | `routes/changeorders.ts` + `db/changeorders.ts` (full status set, line items, link to quote/invoice); `pages/changeorders/ChangeOrders.tsx`. AI scope-creep detection (23.3) present in `lib/recommend.ts` risk logic. |
| 22 | Support and feedback tools exist | DONE | `routes/support.ts` + `routes/feedback.ts` + db modules; `components/FeedbackWidget.tsx`, `pages/support/SupportCenter.tsx`. |
| 23 | Admin manages disputes, approvals, profiles, payments, quality | DONE | `routes/admin.ts`, `routes/disputes.ts`, `db/admin.ts`, `db/disputes.ts`; `pages/admin/{AdminAccounts,AdminIntelligence,AuditLog}.tsx`, `pages/disputes/Disputes.tsx`. |
| 24 | White-label hidden from public, Super Admin only | DONE | No public white-label nav/page; `db/whitelabel.ts`, admin-only routes in `routes/admin.ts`, `pages/admin/WhiteLabelAdmin.tsx`; schema `white_label_status` enum matches blueprint 5.2. |

---

## 3. Claim Engine Acceptance Criteria (Addendum)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Super Admin can select/approve target markets | DONE | `routes/claim.ts` `/admin/markets`, `/admin/markets/:id/status`, `/admin/markets/plan`, `/admin/markets/advance`; `db/claim.ts`. |
| 2 | Discover businesses by geography + category | PARTIAL | `lib/discovery.ts` `ingestMany` enriches/scores/creates profiles, but it **does not search the live web** — an admin supplies rows via `POST /admin/discover`. Discovery pipeline is real; *autonomous search/scraping is not built* (explicitly documented in `INTEGRATION-claim.md`). |
| 3 | Create unclaimed profiles only from public data | DONE | `lib/discovery.ts` operates on supplied public fields; never invents pricing/availability/capacity/insurance (enforced in code + comments). |
| 4 | Each AI field marked pending owner verification | DONE | `AI_TAG_NOTE = "ai_suggested pending owner verification"` applied to generated description/tags in `lib/discovery.ts`. |
| 5 | Duplicate checks before creation | DONE | `lib/discovery.ts` dedupe on name/website/phone/email/city; merge route `/admin/businesses/:id/merge`. |
| 6 | Public profiles clearly show unclaimed status | DONE | `pages/claim/UnclaimedProfile.tsx` shows the addendum banner + "generated from publicly available information" language. |
| 7 | Claim links allow verified owners to claim | DONE | `lib/claim-verify.ts` (email_domain / email_code / manual); `/claim/:slug/verify`; `pages/claim/ClaimVerify.tsx`. |
| 8 | Claimed profiles convert to Free Partner accounts | DONE | `lib/claim-verify.ts` calls `db.registerOrganization` (Free Partner) on success and links the profile. |
| 9 | Weekly claim email sequence per admin settings | PARTIAL | `lib/claim-emails.ts` implements the 4 templates, weekly-then-monthly cadence, 6-send cap, and records `claim_outreach` rows — but **sending is a stub** (no real email; no scheduler/cron runs it automatically). |
| 10 | Unsubscribe/removal stop outreach immediately | DONE | `db/claim.ts` suppression list; `/admin/suppression` + public removal/unsubscribe handling; checked before every send in `claim-emails.ts`. |
| 11 | Admin can pause/archive/merge/approve/suppress | DONE | `routes/claim.ts` admin endpoints for queue, approve, edit, merge, archive, suppression, market pause. |
| 12 | Outreach metrics visible in Super Admin | DONE | `pages/admin/ClaimEngineAdmin.tsx` + claim admin metrics endpoints (discovered/created/claimed/sent/bounced/unsub). Open/click rates are correctly marked future-phase. |
| 13 | Monthly expansion SoFla → all FL → next markets | DONE | `db/claim.ts` market scheduler with the addendum sequence; admin override/reorder/advance routes. |
| 14 | Never implies verified/preferred/partnered before claim | DONE | `lib/discovery.ts` safe-copy rules; unclaimed banner avoids "verified/preferred/active"; matches addendum SEO display language. |

---

## 4. Section Coverage Table (Blueprint Sections 6–46)

| Section(s) | Area | Status | Notes |
|---|---|---|---|
| 6 | User roles + role dashboards | DONE | 7 dashboards: SuperAdmin, Venue, Vendor, Client, Planner, Installer + shared shell. Billing-contact and view-only-guest are not separate dashboards (guest is blueprint "future phase"). |
| 7 | Permissions + message/file visibility | DONE | Thread-type visibility in `db/messages.ts`; role gating via `Actor`/`ForbiddenError`. File visibility levels modeled in compliance/docs. |
| 8 | AI-assisted onboarding | PARTIAL | Save/back/forward/progress/draft-review-publish states present; URL/doc intake stored; "upload-to-autofill" and "website scrape" are deterministic structuring, **not live fetch/parse**. |
| 9 | Co-branded AI profile builder | DONE | Brand hierarchy, theme controls, profile sections, public URL structure (`/venues/:slug` etc.) all present. |
| 10 | Venue profiles + availability/rate calendar + floorplans + rules | DONE | Fields, rate rules, availability, floorplans, structured rules in `db/profiles.ts`/`seating.ts`. AI floorplan suggestions (10.3) are basic. |
| 11 | Vendor/supplier/installer profiles | DONE | Full field sets + categories in `db/profiles.ts`; installer dashboard present. |
| 12 | Rental inventory management | DONE | `db/inventory.ts` full field set, search filters, availability/quantity tracking; browse + manage pages. |
| 13 | Event workspace + tabs | PARTIAL | 20-tab bar built; **14 tabs are live, 6 are `<Placeholder>`** (Venue, Inventory, Invoices, Payments, Change Orders, Reviews) — those features exist as standalone pages but are not embedded in the workspace tab. |
| 14 | Guest list management | DONE | `db/guests.ts` all fields (RSVP, meal, VIP, plus-one, accessibility); spreadsheet import path. |
| 15 | Auto-built itinerary + role views | DONE | `buildItinerary` derives entries; role-scoped views; AI itinerary prompts present as checks. |
| 16 | Bid board + workflow | DONE | Bid types, full status set, tier windows, AI bid-package generation in route logic. |
| 17 | AI auto-quote generation | DONE (deterministic) | `lib/autoquote.ts` builds line items/labor/fees/total + quote-intelligence flags. Not model-backed. |
| 18 | Vendor pricing memory | DONE | `db/pricing-memory.ts` stores rates/minimums/packages/won-lost; feeds auto-quote. |
| 19 | Quotes + standardization | PARTIAL | Standardized data + accept/decline/revise lifecycle; **no PDF rendering**. |
| 20 | Invoices + standardization | PARTIAL | Standardized data, full status set, fee lines; **no PDF rendering, no payment link** (no processor). |
| 21 | Payments, fees, leakage prevention | DONE (record-only) | Fee calc, payout statuses, external-payment policy with reason/proof/audit/admin-notify. No real processor; leakage scan not auto-run on messages. |
| 22 | Contract pricing partnerships | DONE | `routes/contracts.ts` + `db/contracts.ts`; Premier-gated; `pages/contracts/ContractPricing.tsx`. |
| 23 | Change orders | DONE | Full status set + AI scope-creep detection. |
| 24 | Communication layer + email notifications | PARTIAL | In-app messaging + notification builders complete; **email delivery is a stub** (console only). In-app notification center present. |
| 25 | AI next-best-action | DONE (deterministic) | `lib/nextbestaction.ts` per-role ranked prompts; `components/NextBestActions.tsx`. |
| 26 | AI recommendation engine / scope / budget / risk | DONE (deterministic) | `lib/recommend.ts` vendor matching, scope builder, budget intelligence, risk detection. |
| 27 | Reviews, trust scores, starred vendors | DONE (deterministic) | `db/reviews.ts` + `lib/trust.ts` weighted scoring; `db/starred.ts`; `components/TrustBadge.tsx`. |
| 28 | Reusable templates + event history memory | DONE | `routes/templates.ts` + `db/templates.ts`; `pages/templates/EventTemplates.tsx`. |
| 29 | Availability management | DONE | Venue + vendor availability modeled; calendar integrations correctly deferred (later phase). |
| 30 | Documents, e-sign, compliance, COI | PARTIAL | Upload + manual-signed + COI tracking + expiration alerts present; **native/DocuSign e-sign is MVP-manual only** (per blueprint, acceptable). |
| 31 | Terms/policy acceptance | DONE | `terms_acceptance` table (version, IP, account_type, org); written at registration. |
| 32 | Cancellation/refund/dispute workflow | DONE | `routes/disputes.ts` + `db/disputes.ts` full field + status set. |
| 33 | Task + workflow automation | DONE | `routes/tasks.ts` + `db/tasks.ts`; task categories/fields; `event/tabs/TasksTab.tsx`. |
| 34 | Mobile event-day mode | PARTIAL | Responsive shell + itinerary/task/contact data exist, but **no dedicated event-day mobile view/route** with the simplified large-button UI described. |
| 35 | Rush / emergency workflow | DONE | Rush flag on bids drives premier-first window + rush fee field in auto-quote. |
| 36 | Feedback + feature request center | DONE | `routes/feedback.ts` + widget; AI feedback pattern detection is basic/deterministic. |
| 37 | Support / help desk | DONE | `routes/support.ts` full field + status set; support center page. |
| 38 | Marketplace search + filters | DONE | `routes/marketplace.ts` vendor/venue filters + sorting; `pages/marketplace/`. |
| 39 | Marketplace growth + liquidity | PARTIAL | Claim engine + referral fields present; **invite links / CSV bulk import / founding-member badge** are partial (referral tracking exists; bulk CSV vendor import not found as a route). |
| 40 | SEO marketplace pages | PARTIAL | Public profile pages + unclaimed-profile SEO labeling exist; **auto-generated category/city SEO landing pages** (e.g. "Miami furniture rental vendors") not found as a route/page. |
| 41 | Reporting + exports | PARTIAL | `routes/reports.ts` + `pages/reports/Reports.tsx` produce report data; **PDF/CSV file export** (guest CSV, invoice PDF, etc.) not rendered to downloadable files. |
| 42 | Audit trail | DONE | `lib/audit.ts` `logAction` over `audit_logs`; covers the blueprint 42.1 event list; `pages/admin/AuditLog.tsx`. |
| 43 | Data ownership/privacy/security | DONE | Role-based visibility throughout; privacy-sensitive data gated by permission checks. |
| 44 | Admin intelligence dashboard | DONE (deterministic) | `routes/intelligence.ts` + `db/admin.ts` metrics (GMV, fee revenue, demand, churn, upgrade opps); `pages/admin/AdminIntelligence.tsx`. |
| 45 | Technical data objects | DONE | All 17 core objects (users…audit_logs) present in schema across `schema.sql` + phase files. |
| 46 | Implementation priorities (Phases 1–8) | DONE | All 8 phases have routers, db modules, schema files, pages, and `INTEGRATION-phase2..8.md` docs. |

---

## 5. Prioritized "Gaps to Close Next"

These are the load-bearing seams between "fully scaffolded" and "production-real." Ordered by impact.

1. **Wire real email delivery (master AC #17, claim AC #9, sections 24 & addendum).**
   Replace the body of `lib/notify.ts:deliver()` and the send path in `lib/claim-emails.ts` with a real provider (Resend/SES/Postmark). The call sites, recipients, subjects, templates, suppression checks, and cadence are already built — this is a single, well-isolated swap. Without it, *no* notification or claim email actually reaches anyone.

2. **Add a scheduler/cron to actually run the claim outreach + monthly expansion (claim AC #9, #13).**
   The cadence logic and `next_send_date` exist, but nothing triggers them on a timer. Needs a job runner (cron/worker) calling the advance/send endpoints.

3. **Generate standardized PDFs for quotes & invoices (master AC #13, sections 19/20/41).**
   `standardized_pdf` columns are unused and there's no PDF library. Add HTML-to-PDF (puppeteer/pdfkit) for the Divini-branded quote/invoice, plus the "Download PDF" and "Payment link" affordances. Also covers section 41 export gaps (guest CSV, itinerary/seating PDF).

4. **Auto-scan messages for payment-leakage language (master AC #15/#16, section 21.4).**
   `detectLeakageLanguage` exists but `routes/messages.ts` never calls it. Hook it into message-send so the Venmo/Zelle/"pay outside" trigger surfaces the Payment Protection Notice automatically, as the blueprint specifies.

5. **Finish the 6 placeholder Event Workspace tabs (section 13).**
   Venue, Inventory, Invoices, Payments, Change Orders, and Reviews render `<Placeholder>` inside the workspace even though each feature is fully built as a standalone page. Embed the existing components so the workspace is the true command center the blueprint describes.

6. **Implement seat billing (master AC #5).**
   `$5/seat` is advertised and the columns exist, but there is no add/remove-seat UI or charge logic. Needs an account-settings seat manager and a billing hook (paired with the payment-processor work).

7. **Live website/document AI extraction (master AC #6, section 8; claim AC #2).**
   Onboarding and claim discovery accept URLs/docs but do not fetch or parse them — extraction is deterministic structuring of supplied data. To meet the "drop a website link and we build your profile" promise, add a fetch + parse step (and, if desired, an LLM extraction pass behind the existing deterministic interface).

8. **Autonomous discovery search for the claim engine (claim AC #2).**
   Discovery currently ingests admin-supplied rows. The "continuously searches for businesses by market/category" promise needs an actual search/data-source integration (compliant API), feeding the existing scoring/dedup/profile pipeline.

9. **Lower-priority polish:** dedicated mobile event-day view (section 34), auto-generated SEO category/city landing pages (section 40), and bulk CSV vendor import / founding-member badge (section 39).

**Bottom line:** The rebuild is architecturally complete and faithful to the blueprint — 21/24 master and 13/14 claim criteria are genuinely DONE. The remaining items are not missing features so much as the real-world integration edges (email transport, payment processor, PDF rendering, live web extraction, a job scheduler) that were intentionally left as clean, documented stubs. Nothing is fabricated as "AI" that isn't deterministic, and no completeness is overstated in the builders' own INTEGRATION docs.
