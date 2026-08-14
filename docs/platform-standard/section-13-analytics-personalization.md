# ALFY2 Pack — Section 13: Analytics, Behavior Tracking & Personalization

**Applicability (from Section 01)**: REQUIRED but narrow — "no analytics
provider exists today, so this section is mostly 'should we build this, and
if so how' rather than 'audit what exists.'" Confirmed true this pass: a
full-tree grep for the common third-party analytics/tracking scripts
(Google Analytics/`gtag`, Google Tag Manager, Segment, Mixpanel, Amplitude,
Hotjar, FullStory, Meta/Facebook Pixel, Microsoft Clarity, PostHog) returned
zero matches. Everything that exists is first-party.

**Status**: PASS, with one real, live-verified gap found and fixed (cookie
consent could not be withdrawn/changed after the initial choice, despite the
Cookie Policy telling visitors they could). No P0s.

## What exists (discovery)

- **`visitor_signals`** (`server/src/routes/signals.ts`, `server/src/db/signals.ts`,
  `src/lib/fingerprint.ts`): first-party device fingerprinting (canvas
  signature + navigator/screen characteristics, SHA-256 hashed client-side)
  plus IP, user-agent, referrer, UTM params, and best-effort user/org
  attachment when signed in. Already covered by Section 02 (T15 tracks the
  still-open retention/purge-job gap; not re-litigated here per the pack's
  rule against re-auditing already-covered ground).
- **`personalize.ts`/`lib/geo.ts`**: coarse, request-scoped IP geolocation
  for landing-page hero-copy variants. Not persisted anywhere, no cookie or
  device identifier involved — resolves per-request from (in priority order)
  a trusted upstream edge header, a local self-hosted GeoIP database, then
  an optional operator-configured external endpoint (`GEOIP_API_URL`, unset
  by default in this environment), degrading to a locale-only default with
  no signal. This is standard request-scoped geo-routing, not behavioral
  tracking, and correctly does not require the cookie-consent gate that
  persistent identifiers do.
- **`recommend.ts`/`lib/recommend.ts`**: a deterministic, stateless
  recommendation engine that maps explicit form inputs (venue type, event
  type, budget, guest count) to ranked service/sponsor categories. No DB
  read, no stored behavioral profile, no AI call — confirmed by reading
  `lib/recommend.ts`.
- **The "intelligence" suite** (`marketplace-intel.ts`, `divini-score.ts`,
  `sponsorship-intel.ts`, `pricing-intel.ts`, `donor-prospect.ts`, etc.):
  authenticated, org-scoped B2B analytics tools that help one organization
  (a venue, vendor, planner) analyze marketplace/pricing/sponsorship data —
  not consumer-facing profiling or automated decisions about individuals.
  Spot-checked `divini-score.ts` specifically (a proprietary per-entity
  "readiness" score) since automated scoring is the closest thing in this
  codebase to an automated-decision concern: it is a deterministic,
  formula-based score of a *business entity* (vendor/venue), not an
  individual consumer, is transparently visible to the org it belongs to
  (`GET /:entityType/:entityId` returns the score's components, not just a
  number), and is IDOR-safe (org-resolved and actor-validated before any
  read). No GDPR Art. 22-style "automated decision with legal or similarly
  significant effect on a natural person" concern applies here.

## Finding: cookie consent could not be withdrawn (FIXED, P2)

**What was wrong.** `src/components/CookieBanner.tsx` shows a real,
correctly-gated consent banner on first visit ("Accept all" / "Reject
non-essential"), and `src/lib/fingerprint.ts`'s `reportSignal()` already
correctly gates every signal-collection call behind `consentGranted()` (this
gate itself was evidently already fixed in an earlier pass — its own code
comment notes it "previously fired unconditionally, contradicting the
policy"). But the banner's `useEffect` only ever calls `setShow(true)` once,
on mount, when no choice is stored yet; once *any* choice is stored it never
reappears, and nothing else in the app could bring it back. Meanwhile,
`src/pages/Cookies.tsx`'s "Your choices" section told visitors: "Use the
cookie banner to accept or reject non-essential technologies" — with no
qualifier that this only works on a visitor's very first visit. A visitor
who accidentally clicked the wrong button, or who simply changed their mind
later, had no working way to change it through the product, only by
manually finding and clearing their browser's local storage for the site
(something the policy doesn't mention either).

This is a real, user-facing gap between what the Cookie Policy promises and
what the product actually does — the kind of "consent withdrawal must be as
easy as giving consent" expectation that shows up repeatedly in DPA guidance
and enforcement practice around cookie banners.

**Fix applied**:
- `src/components/CookieBanner.tsx`: added an `openCookiePreferences()`
  export that dispatches a small custom DOM event, and the banner's
  `useEffect` now also listens for that event and re-shows itself. The
  banner component was already mounted app-wide in `App.tsx`; this reopens
  the same instance rather than requiring a second one.
- `src/pages/Cookies.tsx`: added a "Manage cookie preferences" button that
  calls `openCookiePreferences()`, and updated the "Your choices" copy to
  correctly describe that the choice can be changed at any time via this
  control (previously implied, incorrectly, that the banner itself remained
  available for this).

**Live verification** (Playwright against the built SPA, real browser):
1. First page load: consent banner visible (no stored choice yet). ✅
2. Click "Accept all": banner hides, `localStorage['divini_consent_v1']`
   becomes `{"v":"all",...}`. ✅
3. Client-side navigate to `/cookies`: "Manage cookie preferences" button
   renders. ✅
4. Click it: banner reopens. ✅
5. Click "Reject non-essential": banner hides again,
   `localStorage['divini_consent_v1']` updates to `{"v":"essential",...}`.
   ✅

Every step passed on the first run against the actual built artifact, not
just read and assumed correct.

## Regression

- `npm run lint`: 0 errors (44 pre-existing warnings, unchanged)
- `npm run build` (SPA): clean
- `npm --prefix server run build`: clean (no server-side change this
  section; re-run for completeness)
- `npm test`: 72/72 passing
