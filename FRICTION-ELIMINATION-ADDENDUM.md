# Divini Partners — Friction Elimination Engine (Competitive Gap Upgrades)

Additive to the existing platform + the Venue Intelligence addendum. Goal:
THE FASTEST PATH FROM IDEA TO APPROVED EVENT. Every feature removes friction;
the platform becomes the permanent system of record so no one re-enters info.

## Mapping of the 18 upgrades to status
ALREADY BUILT (Venue Intelligence addendum) — verify reuse, do not rebuild:
- U6 Venue Knowledge Engine = Venue Digital Twin (venue_twin/assets/branding/restrictions).
- U7 Vendor Knowledge Engine = vendor_quote_requirements + templates + vendor_pricing_rules.
- U8 Quote Acceleration Engine = quoteAutomation + draftQuote + pricingEngine (quote_drafts).
- U10 Venue Compliance/Readiness = computeQuoteReadinessScore (venue_twin.readiness_score).
- U17 Recommendation Engine = lib/recommend.ts (recommendForEvent).
- U13 Unified Event Workspace = existing EventWorkspace; U12 Change Management = existing /change-orders.
- U18 System of Record = the cumulative architecture (all the above tables).

THIS ROUND (new builds / extensions), additive, schema files db/schema-fe-*.sql:
- U1 Client Event Intelligence Assistant: intake (type, guests, budget, venue type, experience,
  indoor/outdoor, date) -> recommended+required vendors, sponsorships, budget breakdown, timeline,
  required approvals, required documents. Deterministic (reuse recommend.ts); AI seam flagged/cached.
- U2 Event Readiness Score: 0-100 across venue selected, vendors selected, insurance uploaded,
  guest list complete, contracts signed, payments made, timeline built; show missing items.
- U3 Venue Comparison Engine: side-by-side (capacity, parking, AV/tables/furniture included,
  security, vendor restrictions, F&B minimums, insurance, setup/teardown windows) + ESTIMATED TOTAL COST
  (not just rental). Comparison attrs live in venue_twin jsonb (additive, no ALTER of existing tables).
- U4 Lead Quality Engine: qualified inquiry intake (event type, budget range, guest count, date range,
  decision maker, company, timeline) -> lead_quality_score + intent (high/medium/low); rank inquiries.
- U5 Verified Lead Program: verified badges (budget, decision maker, event, company, venue) shown across UI.
- U9 Vendor Compliance Score: insurance/COI/W9/licenses/reviews/on-time/completion/venue ratings ->
  compliance score; feeds marketplace ranking. (Extends Phase-4 vendor_readiness via NEW files, no edit.)
- U11 Transparent Preferred Vendor: always show WHY (e.g. "83 projects, 4.9 rating, 98% on-time").
- U14 Installation Management: vendor arrival, setup windows, progress, completion photos, removal
  schedule, venue approval; shared venue/vendor/planner timeline.
- U15 Guest Experience Hub: registration, RSVP, ticketing, guest lists, QR check-in, schedule,
  venue maps, parking info, push/last-minute updates. (Extends Phase-6 guests + event-day check-in.)
- U16 Sponsorship Intelligence: impressions, audience demographics, historical performance, revenue,
  asset availability; auto-recommend + brand<->venue matching. (Extends Phase-5 sponsorship_opportunities.)

PLUS (the offered follow-ups):
- Marketplace ranking wire-in: when a venue context is present, order vendor search by
  vendorReadiness/compliance + preferred tier (venue-scoped); keep public default otherwise.
- Deploy runbook for the whole release (rsync + apply-all + restart + smoke checklist).

## Build rules
Additive only; do not break existing. Zero em dashes. Server imports .js. Reuse patterns
(pool q/q1, db.ts Actor/getActor/IDOR, routes/events.ts h() wrapper, src/lib/api.ts apiGet/apiSend).
Deterministic-first; any AI optional, feature-flagged, cached, rate-limited (Alyssa cost rules).
Shared integration files (db/apply-all.sql, server/src/routes.ts, src/App.tsx, src/components/Shell.tsx)
are wired by the integration lead, not the feature agents (except marketplace.ts, owned by the ranking agent).
Verify green: server tsc 0, SPA tsc 0, vite build. Deploy via Mac rsync + deploy.sh + apply-all.sql; NOT console patch.
