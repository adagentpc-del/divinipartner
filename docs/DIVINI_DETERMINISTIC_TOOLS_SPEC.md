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

**Note:** `server/src/db/vendorProfitability.ts` + `src/pages/Profitability.tsx` (built earlier this session, before this spec arrived) is a first-pass, single-role (Vendor) implementation of what this spec calls **Divini Profit Map**. It should be relabeled to that branding and is the seed to generalize once Pipeline/Scope Builder/Proposal Studio exist to feed it real transaction data, per the recommended build order below.

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

*This document is updated as each slice ships, with a "shipped" section per tool matching the required implementation report format (section 20): business problem solved, users served, workflow, deterministic logic, data model, integrations, permissions, analytics captured, subscription entitlements, tests completed, business value delivered, deferred enhancements.*
