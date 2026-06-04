/**
 * Deterministic partner walkthrough script generator.
 *
 * Produces a branded, slide-based walkthrough purely from real portal data —
 * NO AI, NO network calls. The same input always yields the same output, so it
 * is cheap to regenerate on every portal load. The admin "Regenerate" action
 * persists a snapshot of this script (plus a timestamp) so the admin model
 * stays in parity with what visitors see.
 */

export interface WalkthroughSlide {
  id: string;
  /** Visual treatment hint for the renderer. */
  kind: "intro" | "step" | "highlight" | "list" | "cta";
  eyebrow: string;
  title: string;
  body: string;
  /** Optional supporting points rendered as a branded list. */
  bullets?: string[];
}

export interface WalkthroughScript {
  version: number;
  partnerName: string;
  generatedNote: string;
  slides: WalkthroughSlide[];
}

/** Minimal shapes pulled from the public portal/ordering payloads. */
export interface WalkthroughInput {
  companyName: string;
  introHeadline?: string | null;
  introText?: string | null;
  thankYouText?: string | null;
  portalMode?: string | null;
  partnerType?: string | null;
  pricingDisplayEnabled?: boolean | null;
  capabilitiesLink?: string | null;
  /** Distinct product categories available to this partner (ordering portals). */
  productCategories?: string[];
  productCount?: number;
  /** Package/tier names available (ordering portals). */
  packageNames?: string[];
  /** City names served (ordering portals). */
  cityNames?: string[];
  /** Branding zone/location names (branding portals). */
  brandingLocationNames?: string[];
}

const WALKTHROUGH_VERSION = 1;

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function uniqueClean(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Build the deterministic walkthrough. Slides are only included when the
 * underlying data exists, so a sparse portal still produces a clean, honest
 * walkthrough rather than empty filler.
 */
export function generatePortalWalkthroughScript(input: WalkthroughInput): WalkthroughScript {
  const name = input.companyName.trim() || "this partner";
  const isOrdering = input.portalMode === "ordering" || input.partnerType === "ordering";
  const slides: WalkthroughSlide[] = [];

  // 1) Intro — uses the partner's own headline/intro when present.
  slides.push({
    id: "intro",
    kind: "intro",
    eyebrow: "Welcome",
    title: input.introHeadline?.trim() || `Welcome to the ${name} portal`,
    body:
      input.introText?.trim() ||
      `A guided tour of how to request visual production with ${name}, powered by A3 Visual. This takes about a minute.`,
  });

  // 2) How it works — branches by portal type.
  if (isOrdering) {
    slides.push({
      id: "how-ordering",
      kind: "step",
      eyebrow: "How it works",
      title: "Order in a few simple steps",
      body: `Pick what you need, add it to your cart, and submit. The ${name} and A3 Visual teams take it from there.`,
      bullets: uniqueClean([
        input.cityNames?.length ? "Choose your city and event" : "Tell us about your event",
        "Select packages or individual products",
        "Add artwork, quantities, and install details",
        "Submit — we review, price, and confirm",
      ]),
    });
  } else {
    slides.push({
      id: "how-intake",
      kind: "step",
      eyebrow: "How it works",
      title: "Share your project in a guided form",
      body: `Walk through a short intake that captures everything A3 Visual needs to price and produce your project for ${name}.`,
      bullets: [
        "Contact and event details",
        "Industry and project context",
        "The services you need",
        "Upload artwork, maps, and references",
      ],
    });
  }

  // 3) Cities served (ordering only, when present).
  const cities = uniqueClean(input.cityNames ?? []);
  if (cities.length > 0) {
    slides.push({
      id: "cities",
      kind: "list",
      eyebrow: "Where we deliver",
      title: cities.length === 1 ? "Your service area" : `${cities.length} cities served`,
      body: `${name} supports visual production across these locations.`,
      bullets: cities.slice(0, 8),
    });
  }

  // 4) Packages (ordering only, when present).
  const packages = uniqueClean(input.packageNames ?? []);
  if (packages.length > 0) {
    slides.push({
      id: "packages",
      kind: "list",
      eyebrow: "Curated packages",
      title: packages.length === 1 ? "A ready-made package" : `${packages.length} curated packages`,
      body: "Start fast with a pre-built package, then customize quantities and add-ons.",
      bullets: packages.slice(0, 8),
    });
  }

  // 5) Product categories / catalog breadth.
  const categories = uniqueClean(input.productCategories ?? []).map(titleCase);
  if (categories.length > 0) {
    slides.push({
      id: "catalog",
      kind: "highlight",
      eyebrow: "What you can order",
      title:
        input.productCount && input.productCount > 0
          ? `${input.productCount} products across ${categories.length} categories`
          : `${categories.length} product categories`,
      body: "Browse a catalog tailored to your events — banners, signage, displays, and more.",
      bullets: categories.slice(0, 8),
    });
  }

  // 6) Branding locations (branding portals).
  const zones = uniqueClean(input.brandingLocationNames ?? []);
  if (zones.length > 0) {
    slides.push({
      id: "branding-zones",
      kind: "list",
      eyebrow: "Brand your space",
      title: zones.length === 1 ? "A branding location" : `${zones.length} branding locations`,
      body: `Request branding for specific spaces across ${name}.`,
      bullets: zones.slice(0, 8),
    });
  }

  // 7) Pricing transparency (only when the partner exposes pricing).
  if (input.pricingDisplayEnabled) {
    slides.push({
      id: "pricing",
      kind: "highlight",
      eyebrow: "Transparent pricing",
      title: "See starting prices as you go",
      body: "Indicative pricing is shown alongside services so you can plan your budget before you submit.",
    });
  }

  // 8) Closing CTA.
  slides.push({
    id: "cta",
    kind: "cta",
    eyebrow: "You're ready",
    title: isOrdering ? "Start your order" : "Start your request",
    body:
      input.thankYouText?.trim() ||
      `Close this walkthrough whenever you're ready and ${isOrdering ? "build your order" : "submit your project details"}. The ${name} and A3 Visual teams are standing by.`,
  });

  return {
    version: WALKTHROUGH_VERSION,
    partnerName: name,
    generatedNote: "Generated automatically from this portal's live configuration.",
    slides,
  };
}
