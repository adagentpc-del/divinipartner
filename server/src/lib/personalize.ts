/**
 * Landing-page personalization (dependency-free, deterministic).
 *
 * pickVariant({ geo, query }) chooses a hero copy variant from a coarse region
 * (resolved by lib/geo.ts) plus an optional audience hint from the query string
 * (?a=venue|vendor|planner|client, or utm_audience). It returns the headline,
 * subhead, primary and secondary CTA labels, and a layout emphasis the frontend
 * can lean into.
 *
 * The DEFAULT variant is exactly the copy that ships statically in
 * src/pages/Landing.tsx, so when geo is unknown (or the call fails entirely and
 * the frontend never swaps) the page reads identically. Every other variant is
 * a tasteful, premium, conversion-focused override.
 *
 * ZERO em dashes in this file (hard rule).
 */
import type { GeoRegion, GeoResult } from "./geo.js";

export type Audience = "venue" | "vendor" | "planner" | "client" | null;
export type Emphasis = "default" | "local" | "venue" | "vendor" | "planner" | "client" | "global";

export interface Variant {
  variant: string; // stable id, e.g. "sofla", "us:vendor", "default"
  region: GeoRegion;
  locale: string;
  vpn: boolean | null;
  headline: string;
  subhead: string;
  ctaLabel: string; // primary CTA
  secondaryCtaLabel: string; // secondary CTA
  emphasis: Emphasis;
}

/** The shipped static copy. Used whenever we have no better signal. */
const DEFAULT_HEADLINE =
  "One portal for venues, vendors, planners, and clients to manage every event detail.";
const DEFAULT_SUBHEAD =
  "Divini Partners brings discovery, quotes, bookings, payments, and day of coordination into a single elevated workspace. Plan the event you pictured, run it with confidence, and keep everyone moving as one.";
const DEFAULT_CTA = "Plan an Event";
const DEFAULT_SECONDARY = "Request Demo";

function defaultVariant(geo: GeoResult): Variant {
  return {
    variant: "default",
    region: geo.region,
    locale: geo.locale,
    vpn: geo.vpn,
    headline: DEFAULT_HEADLINE,
    subhead: DEFAULT_SUBHEAD,
    ctaLabel: DEFAULT_CTA,
    secondaryCtaLabel: DEFAULT_SECONDARY,
    emphasis: "default",
  };
}

/** Normalize an audience hint from the query string. */
function readAudience(query: Record<string, unknown> | undefined): Audience {
  if (!query) return null;
  const raw = (query.a ?? query.audience ?? query.utm_audience) as unknown;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "venue" || s === "venues" || s === "hotel" || s === "hotels") return "venue";
  if (s === "vendor" || s === "vendors" || s === "supplier" || s === "suppliers") return "vendor";
  if (s === "planner" || s === "planners") return "planner";
  if (s === "client" || s === "clients" || s === "couple" || s === "couples") return "client";
  return null;
}

/** Audience-nuanced overrides. region label is woven in for local flavor. */
function audienceVariant(audience: Exclude<Audience, null>, placePrefix: string, base: Variant): Variant {
  switch (audience) {
    case "venue":
      return {
        ...base,
        emphasis: "venue",
        headline: `${placePrefix}Fill your calendar and run a flawless room.`,
        subhead:
          "Turn your venue into a destination. Bring inbound requests, your preferred vendors, quotes, payments, and every day of detail into one elevated workspace built for premium events.",
        ctaLabel: "Join as a Venue",
        secondaryCtaLabel: "Request Demo",
      };
    case "vendor":
      return {
        ...base,
        emphasis: "vendor",
        headline: `${placePrefix}Win the right bookings and quote in minutes.`,
        subhead:
          "Reach real events matched to your craft, build quotes from a reusable catalog, and get paid cleanly on every job. One workspace for bids, contracts, payments, and reviews.",
        ctaLabel: "Join as a Vendor",
        secondaryCtaLabel: "Request Demo",
      };
    case "planner":
      return {
        ...base,
        emphasis: "planner",
        headline: `${placePrefix}Run every event from one command center.`,
        subhead:
          "Source, compare, book, and coordinate across all of your events. Keep clients, venues, and vendors aligned with shared timelines and messaging, without the tool sprawl.",
        ctaLabel: "Plan an Event",
        secondaryCtaLabel: "Explore for Planners",
      };
    case "client":
      return {
        ...base,
        emphasis: "client",
        headline: `${placePrefix}Plan the event you pictured, with nothing left to chance.`,
        subhead:
          "One portal to discover venues and vendors, see clear quotes, pay deposits and balances securely, and watch every detail come together. Plan for free.",
        ctaLabel: "Plan an Event",
        secondaryCtaLabel: "Browse the Marketplace",
      };
  }
}

/**
 * Pick a hero variant. Region sets the base headline and emphasis; an audience
 * hint, when present, sharpens the message further. Falls back to the exact
 * shipped copy for unknown regions with no audience hint.
 */
export function pickVariant(input: {
  geo: GeoResult;
  query?: Record<string, unknown>;
}): Variant {
  const { geo, query } = input;
  const audience = readAudience(query);

  // Region base.
  let base: Variant;
  switch (geo.region) {
    case "sofla":
      base = {
        ...defaultVariant(geo),
        variant: "sofla",
        emphasis: "local",
        headline: "Miami's event partners, in one place.",
        subhead:
          "From Brickell ballrooms to Fort Lauderdale estates, Divini Partners connects South Florida venues, vendors, planners, and clients in one elevated workspace. Discover, quote, book, pay, and run the day as one.",
        ctaLabel: "Plan an Event in Miami",
        secondaryCtaLabel: "Join as a Local Partner",
      };
      break;
    case "florida":
      base = {
        ...defaultVariant(geo),
        variant: "florida",
        emphasis: "local",
        headline: "Florida's event partners, in one place.",
        subhead:
          "Divini Partners connects Florida venues, vendors, planners, and clients in one elevated workspace. Discover, quote, book, pay, and run the day together, from first inquiry to final review.",
        ctaLabel: "Plan an Event in Florida",
        secondaryCtaLabel: "Join as a Local Partner",
      };
      break;
    case "us":
      base = {
        ...defaultVariant(geo),
        variant: "us",
        emphasis: "default",
        headline: "The premium marketplace for venues, vendors, planners, and clients.",
        subhead:
          "Divini Partners brings discovery, quotes, bookings, payments, and day of coordination into one elevated workspace. Plan the event you pictured and keep every party moving as one.",
        ctaLabel: "Plan an Event",
        secondaryCtaLabel: "Request Demo",
      };
      break;
    case "intl":
      base = {
        ...defaultVariant(geo),
        variant: "intl",
        emphasis: "global",
        headline: "Plan premium events with partners you can trust, wherever you are.",
        subhead:
          "Divini Partners brings discovery, quotes, bookings, payments, and day of coordination into one elevated workspace for venues, vendors, planners, and clients. Plan the event you pictured, run it with confidence.",
        ctaLabel: "Plan an Event",
        secondaryCtaLabel: "Request Demo",
      };
      break;
    default:
      base = defaultVariant(geo);
      break;
  }

  if (!audience) return base;

  // Build a local prefix only for the local regions so audience headlines keep
  // their geo flavor without becoming clumsy elsewhere.
  let placePrefix = "";
  if (geo.region === "sofla") placePrefix = "Miami: ";
  else if (geo.region === "florida") placePrefix = "Florida: ";

  const sharpened = audienceVariant(audience, placePrefix, base);
  return { ...sharpened, variant: `${base.variant}:${audience}` };
}
