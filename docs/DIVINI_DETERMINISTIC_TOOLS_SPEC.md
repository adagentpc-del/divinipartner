# Divini Partners Deterministic Business Tools Specification

Source: provided by the user (2026-08-03), verbatim. This is the authoritative reference for every Phase 4+ tool built from this point forward. Do not build "AI features" as the product; build dependable, deterministic Divini-branded tools that work today without an LLM. Intelligence may later enhance these tools without changing the user-facing product or data model.

**Naming rule (binding):** never ship a user-facing label of the form "AI ___" (AI Proposal, AI Pricing, AI Follow-Up, AI CRM, AI Job Costing, etc.). Use the Divini-branded names below.

## Product naming summary

| Generic concept | Divini product name | Primary result |
|---|---|---|
| Guided assistance | **Divini Concierge** | Tells users exactly what to do next |
| CRM | **Divini Pipeline** | Organizes and converts opportunities |
| Scope definition | **Divini Scope Builder** | Creates complete procurement requirements |
| Proposals | **Divini Proposal Studio** | Produces clear, professional proposals |
| Pricing support | **Divini Price Guide** | Calculates profitable pricing ranges |
| Follow-up automation | **Divini Follow-Up Desk** | Prevents leads and payments from being forgotten |
| Job costing | **Divini Profit Map** | Shows real profit by event, client, package, or item |
| Quote analysis | **Divini Quote Compare** | Normalizes and compares quotes transparently |
| Change orders | **Divini Change Desk** | Controls scope, price, and schedule changes |
| Vendor performance | **Divini Vendor Scorecard** | Measures verified delivery quality |
| Event workspace | **Divini Event Command** | Coordinates booked events in one place |
| Business forecasting | **Divini Forecast** | Projects revenue, cash, staffing, and inventory |
| Performance reporting | **Divini Business Review** | Shows what is working and what needs attention |

**Note (resolved 2026-08-03, slice 5):** the original `vendorProfitability.ts` + `Profitability.tsx` (built before this spec arrived) has been relabeled and generalized into **Divini Profit Map** -- see the "Shipped" section below.

## Recommended build order (binding sequence)

1. **Divini Pipeline** (shared CRM foundation -- organizes opportunities, connects leads to quotes/proposals, provides data every later tool needs)
2. **Divini Scope Builder** (structured procurement requirements, improves lead quality, feeds quote/proposal creation)
3. **Divini Proposal Studio** (converts opportunities into transactions, connects to contracts/payments)
4. **Divini Follow-Up Desk** (uses CRM + proposal + payment status data to reduce abandonment)
5. **Divini Profit Map** (uses proposal/contract/payment/labor/cost data -- generalizes the existing vendor-only build)
6. **Divini Price Guide** (more accurate once Profit Map cost/outcome history exists)
7. **Divini Quote Compare**
8. **Divini Change Desk**
9. **Divini Event Command**
10. **Divini Vendor Scorecard** (needs enough completed transactions to be credible)
11. **Divini Forecast**
12. **Divini Business Review** (summarizes the whole system)

Divini Concierge is added progressively across every slice, not built as an isolated chatbot.

## Five layers every tool must have

1. **Structured inputs** -- forms, dropdowns, line items, templates, rules, dates, quantities, rates, categories, linked records.
2. **Deterministic business logic** -- arithmetic, rules, thresholds, templates, status transitions, formula-based scoring, conditional workflows.
3. **User-facing output** -- proposal, quote, price range, follow-up schedule, task list, profit estimate, comparison, score, warning, report.
4. **Action workflow** -- approve, edit, send, assign, save as template, convert, schedule, archive, duplicate, export, compare, track.
5. **Structured data capture** -- save the underlying records (inputs, results, acceptance, edits, downstream outcome), not just a final PDF.

## Ten binding constraints

1. Work immediately without an LLM.
2. Produce useful results through forms/rules/calculations/templates/workflows/structured data.
3. Use profile-specific terminology.
4. Save structured backend data for reporting and future improvement.
5. Allow optional intelligent enhancements later without a redesign.
6. Never fabricate business recommendations.
7. Never make binding financial/contractual/pricing/procurement/hiring decisions for the user.
8. Clearly show how every output was calculated ("how this was calculated" view).
9. Preserve user-entered data and revision history (never overwrite stage/version history).
10. Build reusable shared engines rather than duplicating features per profile.

## Plan entitlement recommendations (section 18, binding shape; exact numeric limits TBD per role)

- **Free:** basic Pipeline, basic Scope Builder, basic Proposal Studio, manual follow-up tasks, basic Event Command access, basic business summary. No workflow automation, advanced profitability, advanced forecasting, advanced comparison, custom scoring, white-label outputs, or extensive templates.
- **Plus:** full Pipeline, proposal templates, Follow-Up Desk, basic Profit Map, basic Price Guide, Quote Compare, custom scope templates, standard business reviews, limited workflow automation.
- **Pro:** advanced Pipeline, advanced Profit Map, advanced Price Guide, Forecast, custom workflows, custom scorecards, white-label outputs (note: white-label itself is out of scope per the user, 2026-08-03 -- see the subscription audit doc), advanced reports, advanced Event Command, full Business Review, API/exports where applicable.

Sell outcomes (close more work, protect profit, respond faster, control costs, compare accurately, manage delivery, prove performance, forecast growth), never "AI tools."

## Acceptance criteria for every tool (section 19, checklist to apply before calling any slice done)

Defined user outcome; works without an LLM; validated inputs; deterministic + testable logic; explainable calculations; structured storage; revision history preserved; role-based access enforced; org isolation enforced; usage tracked; plan entitlements enforced server-side; mobile UI works; empty states complete; actionable errors; correct exports; analytics events implemented; normal + edge case tests; existing records never destroyed; connects to the right shared records; a final report explains the business value delivered.

## Full tool-by-tool detail

The complete section-by-section specification (Divini Concierge, Proposal Studio, Price Guide, Follow-Up Desk, Pipeline, Profit Map, Quote Compare, Scope Builder, Change Desk, Vendor Scorecard, Event Command, Forecast, Business Review, data governance, the optional future intelligence layer, and the required implementation report format) was provided in full by the user in chat on 2026-08-03 and is treated as binding. Referenced here rather than reproduced in full to avoid drift between two copies; consult that message (or ask the user to re-paste it) for exact field lists, formulas, and backend table shapes for any tool not yet summarized in this doc's own "shipped" sections below (added as each slice ships).

---

## Shipped: Divini Pipeline (slice 1, 2026-08-03)

**Business problem solved.** Leads and opportunities across every marketplace role were previously just a list of records with no shared stage tracking, no ordered next-action visibility, and no way to know at a glance which deals are actually close to closing. Divini Pipeline gives every role one board.

**Users served.** Venue, Vendor, Supplier (shares Vendor's dashboard), Planner, Sponsor -- the roles the spec's section 6 lists as Pipeline's primary applications. Client and Installer deliberately do not get a Pipeline nav entry (they are not listed as primary users in the spec; a client books, an installer works shifts -- neither runs a sales pipeline).

**Workflow completed.** Create an opportunity -> board shows it in the first (default "New") stage -> move it through stages via a per-card dropdown (works without drag-and-drop, so it is fully usable on mobile) -> closing into a `is_closed_won`/`is_closed_lost` stage automatically sets `status`/`closed_at` -> every move is logged to an append-only history table plus a human-readable activity feed entry -> notes can be added freely -> a deterministic readiness score is computed live from the record's own fields.

**Deterministic logic.** 15-stage default template (New -> Reviewing -> Qualified -> Information needed -> Quote requested -> Quote in progress -> Proposal sent -> Negotiation -> Contract sent -> Deposit pending -> Booked -> In delivery -> Completed/Lost/Canceled), seeded per org on first use, idempotent. Readiness score: 100 points across 6 explainable, field-backed factors (budget confirmed 20, event date confirmed 20, decision maker identified 15, next action scheduled 15, contact info on file 15, activity in the last 7 days 15) -- every point traces to a specific stored field, never a generated summary, matching spec constraint 6/8 (no fabricated recommendations, every output explainable).

**Data model.** `crm_pipeline_stages`, `crm_opportunities`, `crm_opportunity_stage_history` (append-only, never overwritten -- spec constraint 9), `crm_activities`. See `db/schema-pipeline.sql`.

**Integrations.** `crm_opportunities.event_id` optionally links to the existing `events` table (not yet surfaced in the UI -- a natural follow-on once Scope Builder/Proposal Studio exist to populate it from a real event).

**Permissions.** Every read/write is org-scoped through the existing `Actor` pattern (`db.getActor`); IDOR-verified live (a second org gets 404 on another org's opportunity, not a 403 that would leak existence).

**Analytics captured.** Every opportunity create, stage move (with full history), and activity is a real stored row -- exactly the structured-data-capture the spec's Layer 5 and section 15 call for, ready for future reporting (Business Review) without redesign.

**Subscription entitlements.** Free tier per spec section 18 ("basic Pipeline" for everyone) -- shipped with NO numeric gating yet (unlimited opportunities/stages, on every plan). Custom workflows, custom scoring, and "advanced Pipeline" (Pro, per section 18) are explicitly deferred, not faked.

**Tests completed.** Live end-to-end against a running server + Postgres: stage seeding + idempotency, opportunity create (defaults to first stage, logs a system activity), readiness score at 15/100 (only "recent activity" met) then 100/100 after filling every field, stage move recording history + activity + correctly flipping status/closed_at on a closed-won stage, loss reason recorded on a closed-lost stage, append-only history row count verified directly in Postgres, cross-org IDOR blocked (404). Browser-verified at iPhone width: board renders, opportunity create form works, the stage-move dropdown actually moves a card between columns, the detail view shows the real readiness breakdown and activity log with a working add-note form.

**Business value delivered.** Users get a single source of truth for what is in motion and what to do next, with a trustworthy (never fabricated) signal for which opportunities are actually ready to close. Divini gets the first slice of the structured opportunity/activity data every later tool (Proposal Studio, Follow-Up Desk, Profit Map generalization, Forecast, Business Review) depends on, per the spec's own stated build-order rationale.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-assisted opportunity summarization, next-action drafting, or document field extraction inside Divini Pipeline. The deterministic engine above remains fully functional and complete without any of it.

---

## Shipped: Divini Scope Builder (slice 2, 2026-08-03)

**Business problem solved.** Procurement requirements were being gathered ad hoc (a phone call, a scattered email thread) with no structured record, so quotes and proposals were built on incomplete or inconsistent information. Divini Scope Builder captures a complete, structured requirements set once, from a real form, and keeps every revision.

**Users served.** Venue, Vendor, Supplier, Planner, Sponsor -- the same primary-user set as Divini Pipeline (spec section 6), consistent with Scope Builder's own worked examples in section 9 (Venue space requirements, Supplier rental scope, Planner event scope, Sponsor sponsorship requirements, Vendor service scope). Installer (workforce/install scope) and Client (event requirements) default templates were also seeded as reasoned, spec-consistent data -- they are not yet wired into any dashboard's navigation, matching Pipeline's own precedent of scoping nav access to roles that actually run procurement (an installer fulfills a workforce scope, they do not author one; a client was excluded from Pipeline for the same "not a seller" reasoning). Both stay reachable via the API and can be surfaced later without a schema change.

**Workflow completed.** A platform-default template is seeded automatically per role on first use (idempotent, no duplication) -> user starts a new scope from that template -> fills a dynamic form rendered entirely from the template's stored field list (text, long text, number, date, yes/no, select, multi-select) -> partial saves are allowed at any time, each one appending a new version snapshot rather than overwriting the last -> publish is blocked with a specific, actionable error until every field marked required has an answer -> a scope can optionally be linked to a Divini Pipeline opportunity, the natural handoff point once Proposal Studio exists to consume it. Plus-tier orgs can additionally build a fully custom template (their own field list) rather than using the platform default.

**Deterministic logic.** Zero LLM involvement anywhere in the flow. Field rendering, value typing (text/number/date/boolean/select/multiselect each map to a distinct, correctly-typed storage column), and publish validation are all straight rule execution against real stored template/response data -- never a generated or inferred value (spec constraint 6/8).

**Data model.** `scope_templates` (organization_id null = platform default, seeded per role as data, not code branches -- spec constraint 10), `scope_template_fields` (field TYPE lives here as a `field_type` enum + `options` jsonb, so every profile's template is the same engine with different rows, not a duplicated feature), `scope_instances` (optionally linked to `crm_opportunities.id`), `scope_responses` (one row per answered field, typed columns), `scope_versions` (append-only; a new row is added on every save AND on publish, never an update to a prior version -- spec constraint 9). See `db/schema-scope-builder.sql`.

**Integrations.** `scope_instances.opportunity_id` links a scope directly to a Divini Pipeline opportunity when created from one, verified org-scoped (linking to another org's opportunity 404s rather than leaking existence).

**Permissions.** Every template, instance, response, and version read/write is org-scoped through the existing `Actor` pattern. A platform-default template (organization_id null) is readable by any org of the matching role; a custom template is only visible to the org that created it -- verified live: a second org gets 404 on the first org's custom template, instance, and on an attempt to link a new scope to the first org's opportunity.

**Analytics captured.** Every save and publish is a real stored version row with a timestamp and the acting user -- the complete revision history the spec's Layer 5 and section 15 call for, ready for future reporting without a redesign.

**Subscription entitlements.** Free tier per spec section 18 ("basic Scope Builder" for everyone) gets the platform-default template per role, unlimited instances, full save/version/publish workflow -- no numeric gating. Custom template creation (the org's own field list) is Plus+ (`isPlusTier`, a new centralized helper alongside the existing `isTopTier`, added to `lib/entitlements.ts`), verified live: blocked with a structured `feature_locked` (403, upgrade target "Plus") response on a free-tier org, and succeeds once the org's tier is Plus.

**Tests completed.** Live end-to-end against a running server + Postgres: platform-default template seeded exactly once and verified idempotent both via a repeated API call and a direct database count; template field list and types verified; instance create; publish blocked with a specific missing-fields message before required fields are filled; two successive partial saves each append a version (verified via both the API's version list and a direct `scope_versions` count) and never lose a prior answer; publish succeeds once required fields are filled and itself appends a final frozen version; Plus-gate verified blocked on a free-tier org and unblocked after upgrading the org's tier; a scope instance linked to a real Pipeline opportunity; cross-org IDOR blocked (404) on the instance, the custom template, and on linking to another org's opportunity. Browser-verified at iPhone width: the scope list, the "new scope" form, the dynamic fill-in form (all seven field types render and save correctly, including a multi-select), the version history list, and the Plus-unlocked custom template builder.

**Business value delivered.** Every role captures complete requirements once, in a structured and reusable form, instead of losing them in a phone call or an email thread -- and every edit is preserved, not overwritten, so nothing entered by a user is ever silently lost. This is the second slice of the structured data (now requirements, on top of Pipeline's opportunities) that Proposal Studio, Quote Compare, and Profit Map are built to consume next, per the spec's own build-order rationale.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-assisted field pre-fill from a natural-language description, or auto-suggested template fields. The deterministic engine above remains fully functional and complete without any of it. Note: a pre-existing, pre-spec "Event Scope Builder" page already lives at `/scope-builder` (`src/pages/intelligence/EventScopeBuilder.tsx`) -- a natural-language, auto-detect flow that is exactly the kind of "AI ___" product the spec's naming rule and core directive say not to ship. It was left untouched (out of scope for this slice; not this build's feature to silently change or remove) and Divini Scope Builder was mounted at `/divini-scope-builder` instead to avoid a route collision. Reconciling or retiring that older page is a decision for the user, flagged here rather than acted on unilaterally.

---

## Shipped: Divini Proposal Studio (slice 3, 2026-08-03)

**Business problem solved.** Once an opportunity is qualified (Pipeline) and its requirements are captured (Scope Builder), the next failure point was turning that into something a client could actually review and say yes to -- a clear, itemized, professional proposal, not a phone quote or a scanned PDF. Divini Proposal Studio builds that proposal from real line items with deterministic totals, sends it as a public link the client opens with no account, and records exactly what they decided.

**Users served.** Same primary-user set as Pipeline and Scope Builder: Venue, Vendor, Supplier (shares Vendor's dashboard), Planner, Sponsor. Every role that runs a sales process needs to send a proposal; none of the excluded roles (Client, Installer) send one.

**Workflow completed.** Start a proposal, optionally linked to a real Divini Pipeline opportunity -> add line items (description, quantity, unit price) -> the subtotal, discount, tax, and total are computed live, purely from those numbers -> save at any point, each save appending a version snapshot -> send requires a client email and at least one line item, and mints (or reuses) a public share token -> the client opens the link with no account, sees the exact same itemized breakdown, and accepts or declines, optionally with a reason -> the first open flips the proposal from "sent" to "viewed"; a decision is permanent (no double-response) -> if the proposal is linked to a Pipeline opportunity, "sent" and "accepted"/"declined" are both logged there automatically as real activity rows, so the CRM timeline reflects the proposal without any manual re-entry.

**Deterministic logic.** Zero LLM anywhere in the flow, including the client-facing copy -- the client sees the exact line items and dollar amounts the sender entered, nothing generated or summarized. Totals are pure arithmetic: `subtotal = sum(quantity x unit_price)`, `total = subtotal - discount + tax`, floored at zero. Status transitions (draft -> sent -> viewed -> accepted/declined) are explicit rule-based state changes, never inferred.

**Data model.** `proposals` (optionally linked to `crm_opportunities.id` and `scope_instances.id`, plus a unique `share_token`), `proposal_line_items`, `proposal_versions` (append-only; a new row is written on every save, on send, and on the client's response, so nothing is ever overwritten -- spec constraint 9). See `db/schema-proposal-studio.sql`.

**Integrations.** `proposals.opportunity_id` and `proposals.scope_instance_id` link a proposal to the Pipeline opportunity and Scope Builder instance it came from (both org-scope-verified on create, 404 rather than leaking existence otherwise). Sending or resolving a linked proposal writes a real `crm_activities` row via a new `logSystemEvent()` export on `db/pipeline.ts` (a system-authored activity with no acting user, for exactly this kind of cross-tool and public-surface integration).

**Permissions.** Every authenticated read/write is org-scoped through the existing `Actor` pattern; the public surface (`/api/public/proposals/:token`) exposes only a token-addressed, whitelisted payload with no auth and no org-internal fields, matching the existing public-bid-link convention (`db/bidShares.ts`) already in the codebase. Verified live: a second org gets 404 on the first org's proposal and on an attempt to create a proposal linked to the first org's opportunity; an unknown share token and an already-resolved proposal both 404 on `/respond`, so neither leaks which case occurred.

**Analytics captured.** Every save, send, view, and response is a real stored version row plus (when linked) a real Pipeline activity row -- structured data ready for Business Review and Forecast later, not just a final PDF (spec Layer 5).

**Subscription entitlements.** Free tier per spec section 18 ("basic Proposal Studio" for everyone) shipped with no numeric gating -- unlimited proposals, full save/send/respond workflow, on every plan. "Proposal templates" (Plus, per section 18) is explicitly deferred, not faked.

**Tests completed.** Live end-to-end against a running server + Postgres: proposal create with real line items and a verified subtotal; a second save (discount + tax + edited line items) appends a version and recomputes totals correctly, verified both via the API and a direct `proposal_versions` count; send blocked with a specific error when no client email is set; send succeeds, mints a share token, and appends a version; the linked opportunity gets a real "Proposal ... sent" activity; the public endpoint returns the identical totals and flips sent -> viewed on first open; accept records the response, appends a final version, and logs a real "... accepted" activity on the opportunity; a second response attempt 404s (no double-accept/decline); an unknown token 404s; cross-org IDOR blocked (404) on the proposal itself and on linking a new proposal to another org's opportunity. Browser-verified at iPhone width end to end: the proposal list, an empty new proposal, a filled proposal with computed totals, the sent state with a working client link, the public client view (identical totals, no account), and the public accept confirmation.

**Business value delivered.** A proposal goes out as a clear, itemized, professional document instead of a phone quote, and the sender knows -- with a real timestamp, not a guess -- whether and when the client opened it and what they decided, all folded automatically into the Pipeline timeline for that opportunity. This is the third slice of structured transaction data (after Pipeline's opportunities and Scope Builder's requirements) that Follow-Up Desk, Profit Map, and Quote Compare are built to consume next.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-assisted proposal copy drafting, or auto-suggested line items from a linked Scope Builder instance's answers. The deterministic engine above remains fully functional and complete without any of it. Proposal PDF export/download was also not built in this slice (the public link is the deliverable for now); a downloadable/printable version is a natural, additive follow-on, not a redesign.

---

## Shipped: Divini Follow-Up Desk (slice 4, 2026-08-03)

**Business problem solved.** A qualified lead or a sent proposal is easy to lose track of once the next task isn't in front of you -- an overdue next action sits quietly in Pipeline, a sent proposal sits unopened, and nobody notices until the deal is cold. Divini Follow-Up Desk surfaces exactly what needs a reply today, generated from real Pipeline and Proposal Studio data plus whatever the user adds by hand.

**Users served.** Same primary-user set as Pipeline, Scope Builder, and Proposal Studio: Venue, Vendor, Supplier, Planner, Sponsor -- every role that owns opportunities and sends proposals needs this list.

**Workflow completed.** Open the desk -> four fixed rules reconcile live against the org's real data (no cron, no background job): an open opportunity with an overdue next action, an open opportunity with no activity in 10+ days, a sent/viewed proposal unanswered for 5+ days, a sent/viewed proposal expiring within 3 days -> each match creates (or refreshes) exactly one open system task; the moment the underlying condition stops matching (the next action gets rescheduled, a proposal gets a response, the opportunity closes), that task is automatically dismissed on the next reconciliation, not left stale -> a user can also add a fully manual task at any time (title, note, due date) and mark any task done, snooze it for N days (auto-reopens once the snooze passes), or dismiss it -> manual tasks can be deleted; system tasks can only be resolved (their existence is a live read of real data, not something to delete out from under it).

**Deterministic logic.** Zero LLM, zero fabricated urgency. Every system task traces to one exact SQL condition against a real column (`next_action_at`, `crm_activities.created_at`, `proposals.sent_at`, `proposals.valid_until`), stated in this report and visible in `db/followUpDesk.ts`'s four fixed rule blocks. Reconciliation is idempotent by construction: a partial unique index (`organization_id, opportunity_id/proposal_id, rule_key` where `status = 'open'`) means re-running the scan on every list call upserts the same row instead of creating duplicates, and once resolved a fresh occurrence can be re-created without ever colliding with the resolved row.

**Data model.** `follow_up_tasks` -- one table for both manual and system-sourced tasks, distinguished by `source` and (for system rows) `rule_key`, optionally linked to `crm_opportunities.id` or `proposals.id`. Two partial unique indexes enforce "one open system task per rule per record." See `db/schema-follow-up-desk.sql`.

**Integrations.** Reads directly from `crm_opportunities`, `crm_activities`, and `proposals` -- no duplicated or cached copies of their state, so a task's presence is always a live fact, never a stale snapshot. This is the shared-engine follow-through the spec's build order describes: Follow-Up Desk uses CRM and proposal data it did not have to define itself (spec constraint 10).

**Permissions.** Every read/write is org-scoped through the existing `Actor` pattern; linking a manual task to an opportunity or proposal is verified against the org before the task is created. Verified live: a second org gets 404 attempting to resolve or delete the first org's task.

**Analytics captured.** Every task carries `created_at`, `resolved_at`, and `status`, and system tasks are additionally keyed by `rule_key` -- a real, queryable record of what kept getting flagged and how it got resolved (done vs. auto-dismissed vs. manually dismissed), ready for Business Review later.

**Subscription entitlements.** Free tier per spec section 18 ("manual follow-up tasks" for everyone) -- shipped with the full rule-based system task generation included for every plan too, no numeric gating; "limited workflow automation" (Plus, per section 18) is a natural home for configurable rule thresholds later, explicitly deferred rather than guessed at now.

**Tests completed.** Live end-to-end against a running server + Postgres: manual task create/list; system task generated the moment an opportunity's `next_action_at` is set in the past; re-listing does not duplicate the task (same row ID both times, verified against the partial unique index); fixing the condition auto-dismisses the task, verified via a direct database status check; manual task done/snooze/delete, including a past-dated snooze auto-reopening on the next list; both proposal rules (unresponded, expiring) firing simultaneously off one proposal and both auto-dismissing the moment the client responds through the real public accept endpoint; cross-org IDOR blocked (404) on resolving and on deleting another org's task. Browser-verified at iPhone width: a real system task (with its rule tag and "was due" date) and a manual task both rendering with working Done/Snooze/Dismiss actions.

**Business value delivered.** Nothing that should get a reply falls through silently -- the list is always exactly right-now-true because it is a live read of real data, not a cached reminder that can drift out of sync with reality. This is the fourth slice of structured activity data (after Pipeline, Scope Builder, and Proposal Studio) that Profit Map and Business Review are built to consume next, per the spec's build-order rationale.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-suggested follow-up message drafts, or a "best time to follow up" prediction. The deterministic engine above remains fully functional and complete without any of it. Configurable per-org rule thresholds (currently fixed at 10/5/3 days) and payment-related rules (invoices/payments overdue) were also not built in this slice -- both are additive follow-ons once the entitlement shape for Plus-level automation is decided, not a redesign of what shipped here.

---

## Shipped: Divini Profit Map (slice 5, 2026-08-03)

**Business problem solved.** Revenue without knowing the real cost behind it is not profit -- it is just a number. The earlier, pre-spec build already solved this for one revenue stream (marketplace quotes, Vendor only). This slice generalizes it to a second, larger revenue stream -- accepted Divini Proposal Studio proposals -- and to every role that runs Proposal Studio, in one merged report, exactly per this spec's own build-order note.

**Users served.** Venue, Vendor, Supplier (shares Vendor's dashboard), Planner, Sponsor -- the same role set as Pipeline, Scope Builder, Proposal Studio, and Follow-Up Desk. Vendor/Supplier additionally see their pre-existing marketplace-quote revenue in the same report; every role sees their accepted-proposal revenue.

**Workflow completed.** Open the map -> every won job (an accepted/converted marketplace quote, or an accepted Proposal Studio proposal) from the last 12 months (adjustable) appears with its real revenue -> record the true cost once, inline, per job -> margin and margin % compute and display immediately, both per job and as an org-wide total -> jobs with no recorded cost still count toward revenue but are excluded from cost/margin totals and called out in a coverage note ("cost recorded for X of Y jobs"), so an unentered cost is never silently treated as zero profit.

**Deterministic logic.** Zero LLM. `margin = revenue - cost`, `margin_pct = margin / revenue`, both undefined (not zero, not guessed) until a real cost is entered. A proposal's revenue is computed the same deterministic way Proposal Studio itself computes it (`sum(quantity x unit_price) - discount + tax`), read fresh from `proposal_line_items` at report time rather than cached, so it can never drift from what the client actually saw and accepted.

**Data model.** Unchanged `quote_costs` (marketplace quotes, from the original build) plus a new `proposal_costs` table (accepted proposals), both deliberately separate from `quotes`/`proposals` so a client-facing read path can never leak the org's private cost data. See `db/schema-profit-map.sql`. The db module (`server/src/db/profitMap.ts`, renamed from `vendorProfitability.ts`) and route (`server/src/routes/profit-map.ts`, mounted at `/api/profit-map`, renamed from `/api/vendor-profitability`) merge both sources into one report rather than exposing two separate features -- spec constraint 10, one shared engine.

**Integrations.** Reads `proposals` + `proposal_line_items` directly (no duplicated totals) for the proposal-sourced half of the report, and `quotes` + `vendors` for the marketplace-quote half, unchanged from the original build.

**Permissions.** Every read/write is org-scoped: the quote-cost path via ownership of the quote's `vendors` row (unchanged), the new proposal-cost path via direct `proposals.organization_id` match. Verified live: a second org gets 403/404 attempting to record a cost against the first org's quote or proposal.

**Analytics captured.** Every cost entry is a real stored row with a timestamp; the report itself surfaces real coverage (jobs costed vs. total), not a fabricated confidence number.

**Subscription entitlements.** Corrected in this slice to match spec section 18 exactly: the original pre-spec build gated the entire feature behind Pro (`isTopTier`); the spec actually places "basic Profit Map" at **Plus** and only "advanced Profit Map" at Pro. A new `isPlusTier()` helper was added alongside the existing `isTopTier()` in `lib/entitlements.ts`, and this feature now unlocks at Plus for both revenue sources. `lib/planCatalog.ts`'s Vendor and Planner catalogs were updated to list "Divini Profit Map" at Plus and "Advanced Divini Profit Map" at Pro (the advanced tier itself -- grouping/breakdown by client or category -- is not yet built; see deferred enhancements). Verified live: blocked with a structured `feature_locked` (403, upgrade target "Plus") on a free-tier org, unlocked once the org is Plus.

**Tests completed.** Live end-to-end against a running server + Postgres: free-tier org blocked (403, upgrade target "partner"/Plus, not "premier"/Pro as the old gate required); unlocked at Plus; a seeded marketplace-quote job and a real accepted Proposal Studio proposal both appear in one merged report with correct revenue (quote's `subtotal`, proposal's computed total from real line items) and the proposal job's real `client_name`; cost recorded independently on each source via its own endpoint; org-wide totals (revenue, cost, margin) correctly sum across both sources; cross-org IDOR blocked (403/404) on recording a cost against either source. Browser-verified at iPhone width: both a costed marketplace-quote job and an uncosted proposal job (with its client name and a working inline cost form) rendering side by side in one list, with correct aggregate stat tiles.

**Business value delivered.** Every role that runs Proposal Studio -- not only Vendor -- can now see whether the work they are winning is actually profitable, from a single, trustworthy, real-cost-based number, with the entitlement tier corrected to what the spec actually promises (Plus, not Pro). This is the fifth slice of structured transaction data (after Pipeline, Scope Builder, Proposal Studio, Follow-Up Desk) that Price Guide and Business Review are built to consume next.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-suggested pricing adjustments based on margin history. The deterministic engine above remains fully functional and complete without any of it. Also explicitly deferred, and not faked as already built: the "advanced Profit Map" breakdown by event, client, package, or item that section 18 reserves for Pro (the data needed -- `client_name`, `opportunity_id` -- is already captured on every proposal-sourced job; this is a grouping/filtering view on top of data that already exists, not a redesign) and a Pro-exclusive multi-month trend chart.

---

## Shipped: Divini Price Guide (slice 6, 2026-08-03)

**Business problem solved.** Pricing is too often a gut-feel number, disconnected from what a job actually costs and what margin the org needs to stay healthy. Divini Price Guide turns a real cost and a chosen target margin into an exact price, and shows the org's own real historical margin (from Divini Profit Map) as honest context -- never a "smart" suggestion pretending to know better than the org's own numbers.

**Users served.** Venue, Vendor, Supplier (shares Vendor's dashboard), Planner, Sponsor -- the same role set as every prior slice.

**Workflow completed.** Add a pricing item (name, optional category, a real typical cost, a target margin, an optional floor margin) -> the target price and floor price compute immediately, shown with the exact formula used -> a banner at the top of the page shows the org's own real average achieved margin across every costed job in Divini Profit Map, so there is a real number to weigh against the chosen target, not a guess -> editing the cost or either margin recomputes both prices live -> items can be deleted.

**Deterministic logic.** One formula, applied everywhere: `price = cost / (1 - margin)`. No LLM, no generated number, no fabricated "optimal price." The historical context is a real aggregate already computed by Divini Profit Map (`getProfitMapReport`'s `marginPct`), reused directly rather than recomputed or approximated -- and deliberately kept as an org-wide average, not a per-item fuzzy match against past job descriptions, because a text-similarity guess masquerading as a fact would violate spec constraint 6 (never fabricate a business recommendation).

**Data model.** `price_guide_items` -- one row per pricing item, storing only the real inputs (cost, target margin, floor margin); the prices themselves are never stored, only computed at read time, so they can never drift out of sync with an edited cost or margin. See `db/schema-price-guide.sql`.

**Integrations.** Calls `getProfitMapReport()` directly from `db/profitMap.ts` for the historical-context banner -- reusing the exact same computation Profit Map's own page shows, not a second implementation of the same math (spec constraint 10).

**Permissions.** Every read/write is org-scoped through the existing `Actor` pattern. Verified live: a second (Plus-tier) org gets 404 attempting to edit or delete the first org's pricing item.

**Analytics captured.** Every pricing item is a real stored row with its inputs and timestamps; the calculator itself needs no separate event log since it recomputes from Profit Map's already-captured job history.

**Subscription entitlements.** Plus+ per spec section 18 ("Plus: ... basic Price Guide"), using the same `isPlusTier()` gate introduced in the Profit Map slice -- verified live: blocked with a structured `feature_locked` (403, upgrade target "Plus") on a free-tier org, unlocked at Plus.

**Tests completed.** Live end-to-end against a running server + Postgres: free-tier org blocked, unlocked at Plus; invalid margin (>= 1) rejected with a clean 400 and a specific message; a created item's target and floor prices verified against the exact formula by direct calculation; updating the cost recomputes the target price correctly; the context endpoint starts at zero jobs, then reflects a real accepted-and-costed Proposal Studio job's exact margin once one exists (not an approximation); item delete; cross-org IDOR blocked (404) on edit and delete. Browser-verified at iPhone width: the real historical-context banner, a pricing item showing cost, target price, floor price, and the formula, all rendering together.

**Business value delivered.** A price a user sets is now traceable to a real cost and a chosen margin, with the org's own track record shown alongside it as an honest reference point -- never a black-box number. This is the sixth slice of structured business data (after Pipeline, Scope Builder, Proposal Studio, Follow-Up Desk, and Profit Map) that Business Review is built to summarize later.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-suggested target margins based on category-level trends. The deterministic engine above remains fully functional and complete without any of it. A true per-category historical match (rather than an org-wide average) was explicitly not built in this slice -- it would require either exact category tagging discipline across Proposal Studio and Price Guide (not yet enforced) or a fuzzy match that risks fabricating a false correlation; both are real design decisions for the user to make, not defaults to guess at silently.

---

## Shipped: Divini Quote Compare (slice 7, 2026-08-03)

**Business problem solved.** Comparing quotes by eyeballing separate PDFs or emails hides the real trade-offs -- a lower total is not always the better deal once scaled to the same guest count, and a "no cost" comparison tool was already promised on the Client pricing page but never actually built. Divini Quote Compare normalizes quotes into one transparent table and enforces the real limit that was already being sold.

**Users served.** Client and Planner -- the buyer side of the marketplace, the two roles that own an event and receive competing quotes on it. This is the buyer-facing counterpart to the seller tools (Pipeline, Scope Builder, Proposal Studio, Follow-Up Desk, Profit Map, Price Guide all serve the seller side); Quote Compare was already built pre-spec as a generic `db/compare.ts` engine (also handling venues and vendors, which stay outside this spec) and needed generalizing into the actual Divini Quote Compare tool, not a rewrite.

**Workflow completed.** Select 2 or more quotes on an owned event's Quotes tab -> open the comparison in a new tab -> see every quote normalized into one row-level table (subtotal, platform fee, total, cost per guest, line-item count, status, expiration) -> deterministic pros and cons per quote, computed from the same numbers (the lowest total earns "Lowest total cost," the best per-guest value earns "Best value per guest," an already-accepted quote earns "Already accepted"). Selecting more quotes than the plan allows is blocked with a specific, actionable upgrade prompt rather than silently truncating the selection.

**Deterministic logic.** Zero LLM. Every pro/con is derived by comparing real numeric fields across the selected set (best value on a metric earns a pro, worst earns a con; ties earn neither) -- never a generated opinion. The new normalization -- cost per guest -- is `total / event.guest_count`, left undefined (not guessed at zero) when the event has no recorded guest count, matching the same "never fabricate" discipline used throughout every other slice.

**Data model.** No new tables. Reads directly from `quotes`, `vendors`, `organizations`, and (new this slice) `events.guest_count` for the normalization row -- no duplicated or cached comparison state.

**Integrations.** None beyond the existing `quotes`/`events` tables; this slice deliberately did not attempt to also compare Divini Proposal Studio proposals, because proposals are a one-to-one seller-to-client artifact with no natural "multiple competing options for one decision" shape the way marketplace quotes on one event already have -- forcing that fit would be exactly the kind of fabricated cross-tool linkage the spec's constraints warn against, so it was not built.

**Permissions.** Unchanged from the pre-existing implementation: quote comparison is gated on real event ownership (`organization_id`, `client_id`, or `planner_id` match), not mere read access, so an attached vendor cannot compare a competitor's quotes on someone else's event. Verified live: a second client org gets 403 attempting to compare quotes on an event they do not own.

**Analytics captured.** Unchanged -- the comparison is computed live from real stored quote/event data on every request; there is nothing to separately log since no new record is created by comparing.

**Subscription entitlements.** This is the one correction in this slice worth calling out explicitly: `lib/planCatalog.ts` already declared a real `quotes.compare` limit (Client Free: 3, Client Plus: 10) and the SPA's entitlements library already had a label for it ("quotes you can compare") -- but the limit was never actually enforced anywhere in the compare route, a dead entitlement exactly like the Supplier `warehouses` gap found and fixed earlier this build. This slice wires it up for real via the existing `plan_limit_reached` shape (`limitExceededPayload`), not a new gate, so it reuses the SPA's existing `<UpgradePrompt>` without any new frontend plumbing. The technical selection ceiling was raised from a flat 5 to 10 (Client Plus's real declared limit); Planner has no declared cap and remains unlimited, unchanged.

**Tests completed.** Live end-to-end against a running server + Postgres: a Client Free-tier org compares 2 quotes successfully with correct cost-per-guest normalization and correctly assigned pros/cons; comparing 4 quotes on the same org is blocked with a precise 402 `plan_limit_reached` response (`capability: "quotes.compare"`, `limit: 3`, `used: 4`, upgrade target "Plus"); upgrading the org's tier to Plus unlocks comparing all 4; cross-org access blocked (403) on an event the caller does not own, unchanged pre-existing behavior reverified after the change. Browser-verified at iPhone width: the renamed "Divini Quote Compare" page, the real cost-per-guest row, and correct pros/cons including "Best value per guest" and "Already accepted."

**Business value delivered.** A buyer can now trust that "lowest price" and "best value" are shown as the two different things they actually are, transparently, with the exact plan limit the pricing page already promised finally being real instead of a UI-only cap that any signed-in user could exceed. This closes a genuine pricing-integrity gap (a paid-tier feature that was actually free for everyone) the same way the Supplier warehouse gap was closed earlier in this build.

**Deferred enhancements (optional intelligence layer, per spec section 16 -- not started, no LLM dependency added).** Model-suggested "which quote is the best overall fit" scoring. The deterministic engine above remains fully functional and complete without any of it. Comparing Proposal Studio proposals (rather than only marketplace quotes) remains explicitly out of scope for the reason given above -- a real design decision for the user to make about whether/how a buyer could ever see multiple sellers' proposals side by side, not a default to guess at.

---

*This document is updated as each slice ships, with a "shipped" section per tool matching the required implementation report format (section 20): business problem solved, users served, workflow, deterministic logic, data model, integrations, permissions, analytics captured, subscription entitlements, tests completed, business value delivered, deferred enhancements.*
