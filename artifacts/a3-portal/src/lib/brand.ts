/**
 * Divini Partner — single source of truth for brand identity.
 *
 * Palette extracted from the Divini Group logos. Prefer the Tailwind tokens
 * (e.g. `bg-divini-green`, `text-divini-ink`, `font-display`) defined in
 * index.css for new work; these raw values exist for inline styles, canvas,
 * email, og-images, and gradual migration of legacy inline-hex pages.
 */
export const brand = {
  green: "#1E5340",
  greenDeep: "#163D2F",
  champagne: "#CDBE9C",
  champagneSoft: "#E4D9C2",
  cream: "#FBFAF6",
  sand: "#E4E2DD",
  ink: "#14140F",
  muted: "#6B7770",
} as const;

/** Display serif — pair with Inter for body. Loaded in index.html. */
export const serif = { fontFamily: '"Cormorant Garamond", Georgia, serif' } as const;

/** Divini Group logo assets in /public/brand. */
export const logos = {
  greenOnWhite: "/brand/divini-group-green-on-white.png",
  whiteOnGreen: "/brand/divini-group-white-on-green.png",
  blackOnCream: "/brand/divini-group-black-on-cream.png",
  whiteOnBlack: "/brand/divini-group-white-on-black.png",
  /** High-res transparent lockups (DG monogram + DIVINI GROUP wordmark). */
  lockupGreen: "/brand/divini-lockup-green.png",          // on light / cream
  lockupChampagne: "/brand/divini-lockup-champagne.png",  // on green / dark (reads cream-gold)
  /** Tight transparent monogram (DG only) for compact marks. */
  monogramGreen: "/brand/divini-monogram-green.png",
} as const;

export type BrandColor = keyof typeof brand;
