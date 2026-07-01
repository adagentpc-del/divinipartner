# 30 UI/UX Guidelines

Derived from the SPA structure and `src/theme.css`. Where conventions are not codified, treat these as observed defaults and confirm against the code.

## Layout model

- App shell: fixed left sidebar (deep emerald) + top bar + content area. Defined in `src/theme.css` (`.app`, `.sidebar`, `.topbar`, `.content`, max content width ~1180px).
- Role-based dashboards: each role (Venue, Vendor, Client, Planner, Installer, Nonprofit, Sponsor, SuperAdmin) has its own dashboard under `src/pages/dashboards/`. Navigation is per-role via the dashboard shell (NavItems with `to:` targets).
- Public marketing pages live under `src/pages/public/` with shared site chrome (header/footer, marketing components in `src/components/marketing/`).

## Native shell awareness

- The app is wrapped by Capacitor for iOS/Android. `body` applies `env(safe-area-inset-*)` padding so chrome never sits under the notch or home indicator. Keep new full-bleed layouts safe-area aware.

## Money presentation (Pricing V2)

- Always show the platform fee as an explicit line item labeled "Platform fee (5%)" in quotes, checkout, and invoices.
- Always show the vendor's full quote and make clear the vendor receives it in full.
- Show the client total = subtotal + fee.
- No subscription-tier picker at registration (all roles are free under V2).
- Featured Vendor upsell: "Get Featured - $49/mo" with a badge on featured vendors and a ranking boost.

## Copy and positioning

- Public positioning: "Event Commerce Infrastructure." Avoid "AI marketplace" / "subscription" framing in public copy under V2.
- See `32_BRAND_GUIDELINES.md` for voice. House style: no em dashes.

## Accessibility and states

> TODO(owner): Document explicit accessibility standards (contrast targets, focus states, ARIA conventions), loading/empty/error state patterns, and form-validation conventions if/when they are formalized. Currently these are per-component, not centrally specified.

## Interaction conventions

- Admin-only UI is gated by server-derived admin status (`/me`), not client-side email checks.
- Gated data endpoints return 401 when unauthenticated; the SPA should route to login on 401.
