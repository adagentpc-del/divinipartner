---
name: Public partner portal theming
description: How the customer-facing OrderingPortal stays fully theme-controlled, and the public-projection field constraint.
---

# Public partner portal theming

The customer order flow (`OrderingPortal.tsx`) must be theme-controlled end-to-end, not just the hero. Every surface/text/CTA in the active flow (steps 1–6, cart, add-ons, survey assets, package gallery) derives from `ResolvedBranding` via the shared helpers in `components/branding/portalSurfaces.ts` (`cardSurface`, `mutedPanel`, `accentPanel`, `titleColor`, `hairline`) plus direct branding tokens (`button`, `buttonText`, `accent`, `muted`, `radius`).

**Rule:** do NOT use generic shadcn/Tailwind neutral tokens (`bg-card`, `bg-muted`, `text-muted-foreground`, `border-primary`, `ring-primary`, `bg-blue-*`, `bg-amber-*`, `bg-white`) inside the active customer flow. The architect review treats their presence as a FAIL.

**Why:** the portal is sold as a premium per-partner branded microsite; a single partner's theme must control the whole page, so neutral defaults break the illusion and ignore the partner's palette.

**Intentional exceptions (allowed to stay non-themed):**
- Pre-data loading spinner and "couldn't load this portal" error card — rendered before branding resolves.
- Semantic status banners on the confirmation screen (email-retry amber warning, info banner) — meaning > theme.
- Lightbox arrows use white-on-image overlays for universal legibility.

**Reduced motion:** guard hover/active scale transforms with `motion-safe:` (e.g. `motion-safe:hover:scale-[1.03]`). Premium animation classes are already disabled under `prefers-reduced-motion` in `index.css`.

**Public projection constraint:** the public ordering payload strips internal fields. Notably `routingEmail` is NOT available client-side — use `contactEmail || replyToEmail` for support/contact links.
