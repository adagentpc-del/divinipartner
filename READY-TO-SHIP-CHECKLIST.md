# Divini Partners by Divini Group — Verified Ready-to-Ship Checklist

**Verified:** 2026-06-16
**Against:** `divini_partners_master_rebuild_blueprint.md` (49 sections, 24 acceptance criteria, section 47) and `divini_partners_claim_profile_automation_addendum.md` (14 acceptance criteria). These two uploaded documents are the source of truth.
**Method:** Static read of the full codebase, direct spot-checks of ship-critical specifics against the blueprint wording, a 3-way independent agent audit (security, functional bugs, blueprint compliance), and build verification (server `tsc`, SPA `tsc`, vite, and a runtime boot smoke).

**Build health:** server `tsc` 0 errors, SPA `tsc` 0 errors, `vite build` 0 errors, server boots and serves (`/api/healthz` 200; public + auth-gated routes behave correctly).

---

## Master Blueprint — Acceptance Criteria (section 47): 24 / 24 PASS

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Public site explains the event-partnership OS | PASS | `src/pages/Landing.tsx` + `pages/public/{ForVenues,ForVendors,ForPlanners,ForClients,Marketplace,HowItWorks,Pricing}.tsx`; nav matches 3.1 |
| 2 | Register by role + accept required terms/policies | PASS | `routes/foundation.ts` register; `terms_acceptance` table has agreement_version, policy_version, account_type, organization_id, ip_address (matches 31.3) |
| 3 | Clients create free event profiles | PASS | `TIERS.client {monthly:0, feeRate:0}`; `routes/events.ts`; `ClientDashboard.tsx` |
| 4 | Free / Partner / Premier tiers | PASS | `db.ts TIERS`: free_partner 5%, partner $45/2.5%, premier $99/1% (exactly matches 4.1) |
| 5 | Seat pricing implemented | PASS | `SEAT_PRICE_USD=5`; `db/seats.ts` + `routes/seats.ts` + `account/SeatSettings.tsx` (add/remove/charge) |
| 6 | Drop website URL + upload docs for AI profile | PASS | `lib/extract.ts` (live fetch, SSRF-guarded) + `lib/llm.ts` (local-first) + `routes/profiles.ts` `/extract`; deterministic fallback |
| 7 | Co-branded (Divini shell + user branding) | PASS | `components/Shell.tsx`, `profile/PublicProfile.tsx`, brand theme fields |
| 8 | Venue uploads (floorplans, rates, availability, rules, preferred vendors) | PASS | `db/profiles.ts`, `db/seating.ts`, `db/starred.ts`, event tabs |
| 9 | Vendor uploads (services, inventory, pricing, docs, availability) | PASS | `db/inventory.ts`, `db/pricing-memory.ts`, `routes/compliance.ts` |
| 10 | Clients/planners create events, guest lists, floorplans | PASS | `routes/events.ts`, `db/guests.ts`, event tabs |
| 11 | Bids with tier-based access | PASS | `db/bids.ts`: 0-48h Premier, 48h-7d Partner+Premier, 7d+ all (matches 4.5) |
| 12 | Vendors generate/edit/submit quotes | PASS | `lib/autoquote.ts`, `routes/quotes.ts`, `quotes/AutoQuoteDraft.tsx` |
| 13 | Quotes + invoices standardized in Divini format (downloadable PDF) | PASS | `lib/pdf.ts` (pdfkit, branded) -> `GET /quotes/:id/pdf`, `GET /invoices/:id/pdf`; InvoiceDetail Download PDF |
| 14 | Payments + platform fees tracked (real) | PASS | `lib/processors.ts` Stripe + PayPal (REST); `routes/payments.ts` checkout/capture/webhooks; fee from TIERS |
| 15 | External payment attempt triggers policy + admin review | PASS | `lib/leakage.ts` exact "Payment Protection Notice" copy (21.4); `POST /payments/external` requires reason+proof, audits, notifies admin; `LeakageModal.tsx` |
| 16 | Internal messaging across events/bids/quotes/invoices/docs/tasks | PASS | `routes/messages.ts` + `db/messages.ts` thread-type visibility; message text auto-scanned for leakage on send |
| 17 | Email notifications to contact emails for key activity | PASS | `lib/email.ts` (Resend/Postal HTTP); `lib/notify.ts deliver()` sends; feature-flagged (logs when unconfigured) |
| 18 | Itineraries auto-build as details confirm | PASS | `db/itinerary.ts buildItinerary()`; `event/tabs/ItineraryTab.tsx` |
| 19 | Reviews trigger after completion | PASS | `db/reviews.ts requestReview`; `routes/reviews.ts`; `reviews/Reviews.tsx` |
| 20 | Repeat relationships trigger starring prompts | PASS | `db/starred.ts` repeat detection; surfaced via `lib/nextbestaction.ts` |
| 21 | Change orders for scope changes | PASS | `routes/changeorders.ts` + `db/changeorders.ts`; AI scope-creep in `lib/recommend.ts` |
| 22 | Support + feedback tools | PASS | `routes/support.ts`, `routes/feedback.ts`, `FeedbackWidget.tsx`, `SupportCenter.tsx` |
| 23 | Admin manages disputes/approvals/profiles/payments/quality | PASS | `routes/admin.ts`, `routes/disputes.ts`, admin pages |
| 24 | White-label hidden from public, Super Admin only | PASS | `white_label_status` enum (5.2), `db/whitelabel.ts`, admin-only routes; no public nav/page |

---

## Claim Profile Engine — Acceptance Criteria (addendum): 14 / 14 PASS

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Super Admin selects/approves target markets | PASS | `routes/claim.ts /admin/markets*`; `db/claim.ts` |
| 2 | Discover businesses by geography + category | PASS | `lib/discovery-search.ts` (SearXNG + local LLM, SSRF-guarded) + `POST /admin/discover/search` -> dedupe/score ingest |
| 3 | Unclaimed profiles only from public data | PASS | `lib/discovery.ts` safe-copy rules; no fabricated pricing/availability/insurance |
| 4 | Each AI field marked pending owner verification | PASS | `AI_TAG_NOTE = "ai_suggested pending owner verification"` |
| 5 | Duplicate checks before creation | PASS | `lib/discovery.ts` dedupe on name/website/phone/email/city + merge route |
| 6 | Public profiles clearly show unclaimed status | PASS | `claim/UnclaimedProfile.tsx` banner + "generated from publicly available information" |
| 7 | Claim links allow verified owners to claim | PASS | `lib/claim-verify.ts` (email domain / code / manual); `ClaimVerify.tsx` |
| 8 | Claimed profiles convert to Free Partner | PASS | `lib/claim-verify.ts` -> `registerOrganization` Free Partner |
| 9 | Weekly claim email sequence per admin settings | PASS | `lib/claim-emails.ts` 4 templates + weekly->monthly + 6 cap; `lib/scheduler.ts` + `worker.ts` fire it |
| 10 | Unsubscribe/removal stops outreach immediately | PASS | `db/claim.ts` suppression; checked in `decideSend` before every send |
| 11 | Admin pause/archive/merge/approve/suppress | PASS | `routes/claim.ts` admin endpoints |
| 12 | Outreach metrics in Super Admin | PASS | `admin/ClaimEngineAdmin.tsx` + claim metrics endpoints |
| 13 | Monthly expansion SoFla -> all FL -> next markets | PASS | `discovery.MARKET_ROLLOUT` + `scheduler.runMarketExpansion` |
| 14 | Never implies verified/preferred/partnered before claim | PASS | `lib/discovery.ts` safe-copy; unclaimed banner avoids verified/preferred language; confidence thresholds 90/70/50 |

---

## Previously "later/future phase" — now BUILT (local-first, 2026-06-16)

- **Native e-signature** (self-hosted, no DocuSign): `db/signatures.ts` + `routes/signatures.ts` + `lib/pdf.ts renderSignedAgreementPdf` + `components/SignaturePad.tsx` + `pages/sign/SignDocument.tsx` (`/sign/:type`). Signs vendor/contract/change-order/terms agreements, stores signed PDF + content hash + IP + audit. Mounted `/api/signatures`.
- **Guest check-in + live headcount**: `checked_in` on guests, `PATCH /api/guests/:id/checkin`, headcount API, check-in section in `EventDayMode.tsx`.
- **Offline event-day (PWA)**: `public/manifest.webmanifest` + `public/sw.js` (caches the event-day shell + read-only event APIs), registered in `main.tsx` (prod-only, dev-safe).
- **ICS calendar export**: `GET /api/events/:id/ics` (event + itinerary milestones), download button in the workspace. (Two-way Google/Outlook sync remains the one external-API option, still deferred.)
- **Email open/click analytics** (self-hosted): `email_events` table + `routes/email-track.ts` (`/api/e/o/:ref` pixel, `/api/e/c/:ref` redirect with open-redirect guard) + tracking woven into claim outreach only; open/click rate shown in the Claim Engine admin.
- **Payment-leakage modal**: now wired in `MessagesTab.tsx` to fire the Payment Protection Notice on send when leakage language is detected (client mirror + server signal). The external-payment policy + admin review (AC15) was already in.

## Calendar (resolved) + intentionally out of scope

- **Calendar: DONE via "Add to calendar"** (`components/AddToCalendar.tsx`) - Google Calendar + Outlook deep links built from the event data plus the Apple/.ics download, opening the user's calendar prefilled to save. No API or two-way sync needed (sync was the wrong tool for this; the add-to-calendar button is the desired behavior).
- **CAD floorplan rendering: out of scope for Partner** (a Procure-platform item only). Image + PDF floorplans are supported here.
- Email open/click on transactional mail: intentionally untracked for deliverability/compliance; only cold claim outreach is tracked.

## Operational go-live gates (config, not code)

Every integration is feature-flagged to fail safe when unset. To transact for real:
1. **Deploy** — Stage A (preview), Stage B login (Authentik OIDC + HTTPS, see `STAGE-B-CHECKLIST.md`), Stage C cutover. (`DIVINI-PARTNERS-DEPLOY.md`)
2. **Payments** — set Stripe + PayPal keys AND their webhook secrets (server refuses to boot in prod without them when a processor is on); enable Connect + Payouts.
3. **Email** — set `EMAIL_PROVIDER` + key (Resend or self-hosted Postal).
4. **GeoIP** (layout personalization) — `bash scripts/fetch-geoip.sh` (free, local, no key).
5. **Local model / search** (optional) — `OLLAMA_URL`, `SEARXNG_URL`.
6. **Automation** — cron `node server/dist/worker.js` (or `WORKER_INTERVAL_MINUTES`).
7. **Seed** — `node server/dist/seed-miami.js` loads the 210 verified placeholder profiles.

## Verdict

**Code-complete and verified ready to ship against both source documents: 38 / 38 acceptance criteria PASS.** No code gaps remain that block launch. The only remaining work is operational (deploy + credentials + cron + seed). Compliance note: the visitor fingerprint/IP/geo features are used for layout improvement only (purpose-limited in the Privacy page) and, with the claim-outreach cold email, warrant a final attorney review of the policies before go-live.
