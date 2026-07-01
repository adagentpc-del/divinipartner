# Divini Partners — Venue Intelligence + Quote Automation + Revenue Infrastructure

Master build spec. Extends the existing app (do NOT replace existing functionality).
Goal: cut quote turnaround from days to under 10 minutes by storing venue
intelligence once and reusing it forever, with humans kept in approval loops.

Positioning: a Venue Intelligence, Vendor Procurement, Sponsorship, and Revenue
Infrastructure Platform. Moat = the Venue Intelligence Database + Quote
Acceleration Engine. Every venue profile, vendor profile, quote, sponsorship
opportunity, and completed project strengthens the platform.

This addendum also subsumes three earlier requests:
- Login page with Sign in / Create account / Reset password (Authentik flows).
- Venue "Brand event here" tiles that auto-populate vendors to bid on a space.
- Client event pages + guest invites + guest-list changes that auto-sync to the
  vendors who opted in (and gate on deposits/payments per vendor config).

---

## Data model (new tables — db/schema-venue-intelligence.sql, namespaced, additive)

1. venue_twin — one row per venue (extends organizations/venues): name, type,
   address, website, capacity, indoor_capacity, outdoor_capacity, parking_capacity,
   loading_dock (jsonb), freight_elevator (jsonb), power (jsonb), internet (jsonb),
   security_requirements (jsonb), insurance_requirements (jsonb), union_requirements (jsonb),
   install_windows (jsonb), removal_windows (jsonb), contacts (jsonb), emergency_contacts (jsonb),
   readiness_score int.
2. venue_assets — venue_id, kind (photo|video|pdf|floorplan|cad|sitemap|install_guide|
   rulebook|insurance|branding_guideline), url, label, meta jsonb.
3. branding_opportunities — venue_id, name, category, description, photos jsonb,
   videos jsonb, width, height, depth, sqft, weight_limit, material_type, surface_type,
   mounting_options jsonb, power_available, internet_available, rigging_available,
   permit_required, engineering_required, fire_marshal_required, insurance_required,
   allowed_install_types jsonb, prohibited_install_types jsonb, time_restrictions jsonb,
   noise_restrictions jsonb, removal_requirements jsonb,
   approval_mode (auto|venue_approval|manual_review), pricing jsonb, availability jsonb,
   audience_size int, impression_estimate int.
4. venue_restrictions — venue_id, branding_opportunity_id (nullable = venue-wide),
   rule_type (allowed|prohibited), category (material|method|anchor|...), value, notes.
   Structured, never free-text only.
5. vendor_quote_requirements — vendor_id, service_category, schema jsonb (ordered fields:
   text|number|dropdown|checkbox|date|formula, with options, required, conditional_logic),
   is_template bool, template_name.
6. vendor_pricing_rules — vendor_id, service_category, rules jsonb (ordered conditional
   formula steps: if <field> <op> <val> then price/add), base_unit, notes.
7. quote_drafts — event_id, venue_id, branding_opportunity_id, vendor_id, requirement_id,
   prefilled jsonb (measurements/restrictions/access/power/permit pulled from twin),
   scope_of_work text, install_notes, removal_notes, compliance_notes, timeline jsonb,
   computed_price numeric, status (draft|vendor_review|vendor_approved|client_delivered|
   declined), created_by.
8. vendor_readiness — vendor_id, response_speed, quote_speed, approval_rate, win_rate,
   profile_completeness, insurance_uploaded, w9_uploaded, reviews_score, completion_history,
   score int.
9. preferred_vendors — venue_id, vendor_id, tier (preferred|approved|exclusive|recommended),
   preloaded_pricing jsonb.
10. revenue_inventory — venue_id, name, category (screen|wall|elevator|pool|rooftop|keycard|
    vip|registration|parking|...), pricing jsonb, availability jsonb, photos jsonb,
    audience_size, impression_estimate, restrictions jsonb.
11. sponsorship_opportunities — venue_id, name, category, audience_size, impression_estimate,
    pricing jsonb, deliverables jsonb, availability jsonb, photos jsonb, performance_history jsonb.

Guest-list sync (subsumed request) reuses existing guests table + a new
vendor_event_requirements row: vendor_id, event_id, needs_guest_list bool,
needs_deposit bool, deposit_gate jsonb, payment_gate jsonb. On guest-list change,
notify vendors where needs_guest_list = true (via existing recipients.ts + notify.ts).

---

## Engines (server/src/lib)

- venueTwin.ts — CRUD + completeness scoring (Quote Readiness Score 0–100).
- restrictions.ts — structured allowed/prohibited lookups consumable by quote automation.
- quoteAutomation.ts — given (venue, branding_opportunity, vendor service) → prefill
  measurements/restrictions/install/removal/power/permit/access from the twin.
- draftQuote.ts — assemble scope/notes/timeline + run vendor pricing rules → computed price.
- pricingEngine.ts — evaluate vendor_pricing_rules safely (no eval; structured rule interpreter).
- vendorReadiness.ts — compute vendor score from signals; feed marketplace ranking.
- recommend.ts — Event Recommendation Engine (venue type + event type + budget + guest count
  → vendor/sponsor recommendations). Deterministic-first, AI optional + cached + feature-flagged.

Cost-control rules (per Alyssa standards): deterministic logic before AI; AI features
manual-triggered, feature-flagged, cached by content hash, rate-limited.

---

## API (server/src/routes) — all additive, mounted in routes.ts

/venue-twin, /branding-opportunities, /venue-restrictions, /vendor-requirements,
/vendor-pricing, /quote-drafts, /readiness, /preferred-vendors, /revenue-inventory,
/sponsorships, /recommend. Reuse existing auth + IDOR party-authorization patterns.

---

## Surfaces (src/pages) — extend existing, do not replace

- Venue Twin editor (venue role) + Quote Readiness Score widget with "missing info" nudges.
- Branding Opportunity manager (CRUD, measurements, restrictions, approval mode).
- Public "Brand event here" tiles on venue/category pages → starts an event scoped to that
  opportunity → auto-populates eligible vendors (by service + preferred tier) to bid.
- Vendor Quote Requirement Builder (custom fields, conditional logic, formulas, templates).
- Vendor Pricing Rules builder.
- Draft Quote review screen (vendor edits/approves → client delivery).
- Revenue Inventory + Sponsorship marketplace pages.
- Event page customization + guest invites + guest-list manager (auto-syncs to opted-in vendors).
- Login page: Sign in / Create account / Reset password wired to Authentik flows.

---

## Fastest Path To Quote (primary differentiator)
Client idea → venue selected → opportunity selected → requirements auto-populated →
draft quote generated → vendor approval → client delivery. Target under 10 minutes.

---

## Phased build plan
- Phase 1 (foundation): schema + venueTwin/restrictions engines + venue-twin/branding/
  restrictions APIs + Venue Twin editor + Readiness Score. (this enables everything else)
- Phase 2: vendor_quote_requirements + pricing rules + builders.
- Phase 3: quoteAutomation + draftQuote engines + Draft Quote review + "Fastest Path To Quote".
- Phase 4: vendorReadiness + preferred vendors + marketplace ranking integration.
- Phase 5: revenue_inventory + sponsorship marketplace.
- Phase 6: event page customization + guest-list→vendor sync + vendor_event_requirements.
- Phase 7: recommendation engine; Login page register/reset.
Each phase: build in repo → tsc/vite green → deploy via Mac rsync + deploy.sh → verify live.

## Deployment note
This is a large multi-file change. Deploy via the Mac rsync flow
(rsync ... root@167.172.135.196:/root/sites/divini-partners/ then bash deploy.sh on server),
NOT the console base64 patch method used for small fixes.
