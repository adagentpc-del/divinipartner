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

*This document is updated as each slice ships, with a "shipped" section per tool matching the required implementation report format (section 20): business problem solved, users served, workflow, deterministic logic, data model, integrations, permissions, analytics captured, subscription entitlements, tests completed, business value delivered, deferred enhancements.*
