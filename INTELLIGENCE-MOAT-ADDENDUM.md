# Divini Partners — Intelligence Moat Expansion

Additive to the existing platform + Venue Intelligence + Friction Elimination
addenda. Goal: compounding intelligence - every venue, vendor, sponsor, planner,
event, quote, approval, and completed project makes future events faster, smarter,
more profitable. The platform becomes a learning system.

## Status mapping of the 13 features
ALREADY BUILT (reuse / light extend, do not rebuild):
- F8 Claim Profile Engine = existing claim engine (ClaimEngineAdmin, /claim routes,
  unclaimed profiles, email/domain verification). Reuse; only add profile-type/status
  gaps if missing.

THIS ROUND (new builds / extensions). All additive; schema files db/schema-im-*.sql;
deterministic-first, any AI optional + feature-flagged + cached + rate-limited.
- F1 Event Memory Engine: event_memory snapshot per completed event (type, venue,
  guests, budget, vendors/sponsors used, revenue, timeline, approvals, change orders,
  contracts, install/teardown duration, issues, resolutions, reviews, photos, outcomes);
  surface insights ("this venue hosted 12 similar events", averages, best vendor combos).
- F10 Post-Event Intelligence: collect venue/vendor/planner/sponsor/client/attendee
  feedback; analyze success/failure/revenue drivers; feed recommendations + rankings + playbooks.
- F2 Event Playbook Engine: save a whole event (venue setup, vendor stack, sponsor package,
  guest experience, timeline, budget, approval workflow, tasks, docs, comms, guest flows)
  as a reusable playbook/template; clone-event instantly repopulates. Extends existing /templates.
- F3 AI Event War Room: per-event proactive health scan (missing vendors/insurance/contracts/
  approvals/payments, expired docs, permit deadlines, vendor gaps, timeline/capacity/budget
  risks, sponsor deliverables, guest issues) -> alerts + specific next actions.
- F4 Revenue Leakage Detection: scan venue inventory + event for missed monetization (extra
  sponsor inventory, VIP packages, brand activations, upsells, premium furniture, photo/video,
  floral, branded installs, transport, parking sponsorships, digital signage) -> potential vs
  captured vs missed revenue dashboard + suggestions.
- F5 Relationship Intelligence Graph: relationship_edges between entities (companies, venues,
  vendors, sponsors, planners, agencies, brands, clients, contacts) with type (worked_together,
  referred_by, preferred, sponsor_history, past_projects, partnerships, revenue, introductions,
  collaborations) + counts/revenue; built from existing data (events, event_vendors, quotes,
  preferred_vendors, sponsorships); interactive graph view; insights ("planner worked with venue 14x").
- F6 Partnership Matching Engine: proactively match venue<->vendor/sponsor, vendor<->client,
  planner<->venue, agency<->vendor, sponsor<->event/venue, brand<->audience by location/budget/
  audience/capacity/capabilities/historical success/industry/availability/revenue/relationship strength;
  opportunity feed.
- F7 Founding Member Performance Center: premium dashboard (revenue generated, referrals, leads,
  quotes, wins, commissions, savings, marketplace rank, activity score, response time, performance
  score) + founding-member benefit flags (priority placement/matching, enhanced analytics, lifetime
  pricing, badges, exclusive opportunities).
- F9 Approval Graph Engine: approval_contacts per type (venue/branding/sponsor/engineering/
  insurance/legal/finance) + approval routing/notify/escalate; visibility (submitted/pending/
  approved/rejected/requires_revision).
- F11 Attendee Intelligence: engagement metrics from event_registrations (invitations, RSVP rate,
  check-in/attendance/no-show, session attendance, booth visits, QR scans, sponsor interactions,
  lead gen, survey responses) + engagement/audience-quality scores. Extends Phase-6/FE guest hub.
- F12 Divini Score: proprietary dynamic score per entity type - Venue (completeness/responsiveness/
  revenue/reviews/repeat/compliance), Vendor (performance/reviews/compliance/on-time/quote accuracy/
  response), Planner (success rate/organization/satisfaction), Sponsor (activation/engagement/renewal),
  Client (payment/communication/completion/reliability). Aggregates existing readiness/compliance/
  reviews; cached in divini_scores; surfaced as a badge.
- F13 Opportunity Engine: daily actionable opportunity feed per role (venue/vendor/planner/sponsor/
  client) - unused inventory, open projects, preferred requests, matching audiences, cost savings,
  enhancements. Built on F5 graph + F6 matching + F4 leakage + recommend.

## Build rules
Additive; do not break existing. Zero em dashes. Server imports .js. Reuse patterns (pool q/q1,
db.ts Actor/getActor/IDOR, routes/events.ts h() wrapper, src/lib/api.ts apiGet/apiSend). Read
db/schema.sql + db/schema-vi-*.sql + db/schema-fe-*.sql for existing table/column names (events,
quotes, invoices, payments, reviews, event_vendors, vendor_readiness, vendor_compliance,
preferred_vendors, sponsorship_opportunities, sponsorship_metrics, event_registrations, guests,
branding_opportunities, venue_twin, change_orders, contract_pricing). Shared integration files
(db/apply-all.sql, server/src/routes.ts, src/App.tsx, src/components/Shell.tsx) wired by the lead.
Verify green: server tsc 0, SPA tsc 0, vite build. Deploy via Mac rsync + apply-all.sql + deploy.sh.
