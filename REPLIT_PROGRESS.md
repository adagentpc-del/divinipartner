# A3 Portal Progress

## Premium Portal Theming — full order-flow pass (customer-facing OrderingPortal)

- Goal: make the live customer portal (e.g. Social Commerce Festival, dark festival template) look like a premium per-partner microsite, fully theme-controlled end-to-end, not just the hero.
- New shared helpers in `components/branding/portalSurfaces.ts` (`cardSurface`, `mutedPanel`, `accentPanel`, `titleColor`, `hairline`, `softHairline`, `shellGlowLayers`), plus `BrandedPlaceholderImage.tsx` and `PartnerTrustSection.tsx` — all driven by `ResolvedBranding`.
- `OrderingPortal.tsx` themed end-to-end: order-flow eyebrow/headline, premium stepper, package cards + `PackageGallery` (image fallback + active thumbnail border tied to `branding.accent`), sticky Order Summary, review cards, background glows, `PartnerTrustSection`.
- Steps 2–4 themed: `AddonRenderer` now accepts `branding` (cards/rows/category tiles/labels), step-2 custom-size + "not listed" panels, step-3 artwork dropzone/divider/file-list + `ArtworkGuidancePanel` (now takes `branding`), step-4 contact labels.
- `SurveyAssetsSection` themed (cards/placeholder/labels/buttons); `SurveyBranding` widened to `ResolvedBranding`. `ProductImage` gained an optional `style` prop for themed fallback surfaces.
- Reduced motion: CTA scale transforms in `PartnerPortalHeader` and `PortalCTA` guarded with `motion-safe:`.
- Intentionally NOT themed: pre-data loading/error fallbacks (no branding yet), semantic amber/blue status banners on confirmation screen, white-on-image lightbox arrows.
- Constraints honored: no new DB, no AI calls, no base64, order flow unchanged. Architect review: PASS.

## Premium Event Selector (PartnerEventSelector)

- New reusable component `artifacts/a3-portal/src/components/branding/PartnerEventSelector.tsx`.
- Replaces the plain event button grid in OrderingPortal step 0.
- Sorts events chronologically by `eventStartDate` ascending.
- Responsive grid: `repeat(auto-fit, minmax(260px, 1fr))` — naturally wraps to multiple rows on desktop, vertical full-width on mobile.
- Themed using partner branding colors (no Tailwind grays/blues): card surface adapts to light/dark, accent badges, accent border + ring on selected, accent icons for location/calendar/truck.
- Status pill derived from raw status + `shippingDeadline`:
  - `closed` if status is closed/archived/disabled/unavailable/cancelled OR ship-by date is in the past — card disabled.
  - `closing_soon` if ship-by within 14 days — accent-colored urgency line.
  - `open` otherwise.
- Accessibility: `role="radiogroup"` + `role="radio"` + `aria-checked` + `aria-disabled`, focus-visible ring, motion-safe hover lift.
- Empty state: themed message + optional `Contact A3 Visual` CTA when `emptyContactHref` is provided. Selector always renders so empty state can show.
- Outer step-0 wrapper switched from shadcn white `<Card>` to a themed `div` so dark partner themes (e.g. Social Commerce Festival festival template) render the cards on a true dark surface, matching admin preview parity.
- No new DB tables, no AI calls, no hardcoded events — uses existing `data.events`, `data.cities`, `data.venues`.

## Add-on Products Logic Fix + Universal A3 Image Placeholder

- Root cause of "too many products" on the live add-ons step: `addonProducts` useMemo in `OrderingPortal.tsx` fell back to `products.filter(...)` (the ENTIRE catalog) whenever a partner had no curated add-on library (`partnerHasAddonLibrary === false`). Social Commerce Festival (partner 4) has 0 rows in `partner_addons`, so it leaked ~30 global products.
- Fix: that fallback now returns `[]`. The live add-ons step shows ONLY the admin-curated `partner_addons` for the partner (resolved per-event via `events.addon_override_json` inherit/override). When empty, the existing premium empty-state panel shows ("No add-on products are available for this portal." + custom-request textarea) instead of any products.
- No new DB table created. Reused existing `partner_addons` (partner library: product_id, sort_order, is_featured, is_active, category_override) + `events.addon_override_json`. Admin search/select UI already existed at `PartnerAddons.tsx` (routed `/admin/partners/:id/addons`, linked from `PartnerForm`).
- Image placeholders: `ProductImage` extended to also fall back to the A3 lockup on image LOAD ERROR (`onError`), not just missing `src`; exports `A3_FALLBACK_SRC`. Rolled out to: live add-on cards/rows/tiles (already), cart thumbnail, admin add-on search + selected rows (`PartnerAddons.tsx`), admin product catalog rows (`ProductCatalog.tsx`). Package-gallery `<img>` tags got a one-shot loop-safe `onError` fallback to the A3 lockup.
- IMPORTANT: the bundled brand lockups `public/brand/a3-lockup-on-{light,dark}.jpeg` were committed as 0-byte files, so EVERY A3 fallback (header, footer, FullPortal, ProductImage) was silently broken. Regenerated both as real on-brand wordmarks (gold "A3" + navy/white "VISUAL") via ImageMagick. Asset now serves `200 image/jpeg`.
- Constraints honored: no Replit DB, no AI calls, order flow unchanged, typecheck passes.

## Front-Page Demo Video + Per-Partner Branded Walkthrough

- Two features: (1) a settings-driven premium demo video section on the public home page, and (2) a per-partner auto-generated, branded INTERACTIVE walkthrough rendered as a full-screen modal (no new public route → no wouter ordering risk), with an admin custom-video override.
- Storage: new single-key `site_settings` table (Postgres/Drizzle, jsonb-style columns) for the global demo video config; 6 nullable walkthrough columns on `partners` (enabled, videoUrl, posterUrl, status, script jsonb, generatedAt). No Replit KV, no Supabase, no base64.
- Walkthrough script is generated DETERMINISTICALLY from live portal data via `generatePortalWalkthroughScript` (artifacts/a3-portal/src/lib/walkthrough.ts) — NO AI. Generated fresh on load; the admin panel persists a snapshot on save/regenerate so the admin model matches what visitors see.
- Video priority: a `video_ready` custom `walkthroughVideoUrl` plays the video; otherwise the interactive slide experience renders. Reuses `VideoEmbed` inside the new `PortalVideoPlayer` (poster + play overlay + A3 fallback). Branding via `resolveBranding()`.
- API: public `GET /public/site-settings` (safe projection), admin `GET/PUT /site-settings`, `PATCH /partners/:id/walkthrough`. Walkthrough display fields added to all 3 public partner projections; `walkthroughScript` is NEVER exposed publicly.
- Public-facing media upload pipeline (architect fix): the old `/storage/uploads/request-url` writes to the PRIVATE dir (Clerk-gated GET, no extension) so uploaded demo/walkthrough videos could not play for anonymous visitors and video MIME was rejected (415). Added `POST /storage/public-uploads/request-url` + `ObjectStorageService.getPublicObjectUploadURL(ext)` that mints a presigned PUT into the PUBLIC bucket and returns a `/api/storage/public-objects/<uuid>.<ext>` URL — anonymous-playable, real extension so `VideoEmbed` file detection works. Allows `image/*` + `video/*`, 200MB cap, quicktime→mov.
- SECURITY: the global auth boundary regex treats ALL `/storage/*` paths as public, so the new write endpoint is guarded by an inline Clerk `getAuth` check (verified: returns 401 unauthenticated). Both admin upload helpers now call the public endpoint and store the returned `publicUrl`. Walkthrough panel now sends `regenerate: true` so the contract is explicit.
- Constraints honored: order flow + portal builder untouched, Postgres only, no AI, Replit Object Storage only, no base64. typecheck (libs + api-server + a3-portal) all pass; api-server restarted; endpoints verified via curl.
