# A3 Portal Progress

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
