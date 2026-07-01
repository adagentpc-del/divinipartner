# Divini Partners — Divini AI COO (V2 Executive Intelligence Layer)

Additive layer that sits ON TOP of the engines already built (Venue Intelligence,
Quote Automation, Relationship Intelligence, Event Memory, Sponsorship, Opportunity,
Divini Score). Purpose: answer "What should I do next?" for every user, acting as a
combined CRO + COO + Chief Partnership Officer + Chief Risk Officer.

DATA CAVEAT (per the spec): this layer is most valuable once real data accumulates
(active venues/vendors, events, quotes, contracts, sponsorships, revenue history).
We build it now as deterministic, data-driven scaffolding that produces real output
the moment data exists and degrades gracefully (empty states, no fabrication) before
then. AI is optional, feature-flagged, cached, rate-limited (Alyssa cost rules) - the
default paths are deterministic aggregations over existing tables/engines.

## Reuse map (do NOT rebuild; import/aggregate these existing engines)
- Revenue Leakage Detector -> existing lib/revenueLeakage.ts (F4).
- Opportunity Engine -> existing lib/opportunityEngine.ts (F13).
- Relationship Intelligence -> existing lib/relationshipGraph.ts + partnershipMatch.ts (F5/F6).
- Event Risk -> existing lib/eventWarRoom.ts (F3) per-event scan; V2 rolls it up across all events.
- Partner Recommendation -> existing partnershipMatch.ts (F6).
- Per-entity trust -> existing lib/diviniScore.ts (F12). Business Health (below) is a NEW org-level exec score, distinct from per-entity Divini Score.
- Event memory / playbooks / readiness / vendor readiness+compliance -> existing libs, read for inputs.

## NEW V2 work (additive; schema db/schema-coo-*.sql; deterministic-first)
1. AI COO Dashboard + Daily Executive Briefing + Automated Executive Tasks:
   coo_tasks table (generated, ranked-by-impact, status); cooBriefing assembles a per-user
   role-aware briefing (today's priorities, revenue opportunities, risks, approvals/follow-ups
   needed, contracts expiring, sponsorship/partnership opportunities, recommended actions, a
   potential-revenue figure) by calling the existing engines; cooTasks generates + ranks tasks.
2. Revenue Intelligence Engine + Forecasting Engine: trend insights (revenue up/down %, quote
   volume, booking conversion, win rates, avg deal size, emerging categories) + deterministic
   forecasts (revenue/bookings/vendor+sponsor demand/venue occupancy/seasonality/pipeline) from
   historical events/quotes/invoices/payments. Compute live; optional snapshot cache.
3. Business Health Score + Event Risk rollup: org-level executive health 0-100 (revenue, activity,
   pipeline, contracts, referrals, bookings, retention, response speed, compliance) with
   recommendations; portfolio event-risk rollup reusing eventWarRoom across the org's events.
4. Pricing Intelligence + Marketplace Intelligence: quote performance/win rates/market rates ->
   price-adjustment + packaging recommendations; ecosystem analytics (popular vendors/venues,
   growing categories, trending event types, sponsor/inventory demand, regional trends) -> reports.
5. Divini Command Center (Q&A) + Partner Recommendation V2: answer canned executive questions
   ("what should I focus on today", "where am I losing money", "what partnerships should I pursue",
   "what sponsorships should I sell", "what vendors should I onboard", "what risks this week",
   "what events need attention") by routing DETERMINISTICALLY to the existing engines + the V2
   engines above; a single executive view. AI free-text is an optional flagged seam, NOT the default.

## Build rules
Additive; do not break existing. Zero em dashes. Server imports .js. Reuse patterns (pool q/q1,
db.ts Actor/getActor/IDOR, routes/events.ts h() wrapper, src/lib/api.ts apiGet/apiSend). READ the
existing engines listed above for their exact exported signatures before importing them; read
db/schema*.sql for table/columns. Shared integration files (db/apply-all.sql, server/src/routes.ts,
src/App.tsx, src/components/Shell.tsx) wired by the lead. Verify green: server tsc 0, SPA tsc 0,
vite build. Deploy via Mac rsync + apply-all.sql + deploy.sh.
