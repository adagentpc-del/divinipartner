/**
 * Intelligence Moat - Feature 4: Revenue Leakage Detection.
 *
 * Pure, deterministic scan functions. The db / route layer (server/src/db/
 * opportunity.ts, server/src/routes/revenue-leakage.ts) supplies the already
 * loaded venue/event inputs; this module computes potential vs captured vs
 * missed revenue and a ranked list of specific capture suggestions. Same inputs
 * always produce the same result. No DB work, no network, no AI calls.
 *
 * The model: every venue / event has a set of monetizable opportunity types
 * (extra sponsor inventory, VIP packages, brand activations, and a spread of
 * upsells - premium furniture, photo/video, floral, branded installs, transport,
 * parking sponsorships, digital signage). Each type carries a baseline dollar
 * value (scaled by audience / guest count where that drives reach). The scan
 * compares what each type COULD earn against what is already booked or sold and
 * reports the gap. Suggestions are emitted only for types with a real gap, ranked
 * by missed dollars descending.
 */

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const numOr0 = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;
const norm = (s?: string | null): string => (s ?? "").trim().toLowerCase();

/** A single monetizable opportunity type the scan reasons about. */
export type LeakKey =
  | "sponsor_inventory"
  | "vip_package"
  | "brand_activation"
  | "premium_furniture"
  | "photo_video"
  | "floral"
  | "branded_install"
  | "transport"
  | "parking_sponsorship"
  | "digital_signage";

export type LeakSuggestion = {
  key: LeakKey;
  label: string;
  potential: number; // monetizable ceiling for this type
  captured: number; // already booked / sold for this type
  missed: number; // potential - captured (>= 0)
  reason: string; // why this is worth capturing
};

export type RevenueScanResult = {
  potential: number;
  captured: number;
  missed: number;
  suggestions: LeakSuggestion[];
};

const LEAK_LABELS: Record<LeakKey, string> = {
  sponsor_inventory: "Extra sponsor inventory",
  vip_package: "VIP packages",
  brand_activation: "Brand activations",
  premium_furniture: "Premium furniture upgrade",
  photo_video: "Photo and video package",
  floral: "Floral and decor upsell",
  branded_install: "Branded installs",
  transport: "Transport package",
  parking_sponsorship: "Parking sponsorship",
  digital_signage: "Digital signage",
};

/**
 * Per-unit baseline value for each leak type. `perAudience` scales the value by
 * (audience / 1000) when an audience/impression estimate is known; otherwise the
 * `flat` value is used. Tuned so a mid-size venue/event surfaces realistic,
 * stable numbers. Deterministic constants only.
 */
const LEAK_MODEL: Record<LeakKey, { flat: number; perThousand: number }> = {
  sponsor_inventory: { flat: 6000, perThousand: 1500 },
  vip_package: { flat: 4000, perThousand: 900 },
  brand_activation: { flat: 5000, perThousand: 1200 },
  premium_furniture: { flat: 2500, perThousand: 200 },
  photo_video: { flat: 3500, perThousand: 100 },
  floral: { flat: 2000, perThousand: 150 },
  branded_install: { flat: 4500, perThousand: 400 },
  transport: { flat: 1800, perThousand: 120 },
  parking_sponsorship: { flat: 2200, perThousand: 250 },
  digital_signage: { flat: 3000, perThousand: 700 },
};

/** Round to whole dollars for stable, presentable output. */
function dollars(n: number): number {
  return Math.round(clamp(n, 0, Number.MAX_SAFE_INTEGER));
}

/** Potential value for one leak type given a reach figure (audience / guests). */
function potentialFor(key: LeakKey, reach: number): number {
  const m = LEAK_MODEL[key];
  const scaled = reach > 0 ? m.perThousand * (reach / 1000) : 0;
  return dollars(m.flat + scaled);
}

// ---------------------------------------------------------------------------
// Venue scan
// ---------------------------------------------------------------------------

/**
 * An existing revenue_inventory or sponsorship_opportunity asset the venue
 * already has, mapped to a leak type. `booked` true means it is already sold /
 * committed (counts as captured); false means it exists but is unsold (still a
 * gap the venue can close). `value` is its known/asking price when available.
 */
export type VenueAsset = {
  key?: LeakKey | null;
  category?: string | null; // raw category to infer key when key is absent
  value?: number | null;
  booked?: boolean | null;
};

export type VenueScanInput = {
  venueId?: string | null;
  audienceSize?: number | null; // typical reach across the venue's inventory
  impressionEstimate?: number | null;
  capacity?: number | null;
  assets?: VenueAsset[]; // existing revenue_inventory / sponsorship assets
};

/** Map a free-text category onto a leak type (best-effort, deterministic). */
function inferKey(category?: string | null): LeakKey | null {
  const c = norm(category);
  if (!c) return null;
  if (c.includes("sponsor") && c.includes("park")) return "parking_sponsorship";
  if (c.includes("parking")) return "parking_sponsorship";
  if (c.includes("sponsor")) return "sponsor_inventory";
  if (c.includes("vip")) return "vip_package";
  if (c.includes("activation") || c.includes("experiential")) return "brand_activation";
  if (c.includes("furniture") || c.includes("lounge")) return "premium_furniture";
  if (c.includes("photo") || c.includes("video")) return "photo_video";
  if (c.includes("floral") || c.includes("flower") || c.includes("decor")) return "floral";
  if (c.includes("install") || c.includes("fabrication") || c.includes("wall")) return "branded_install";
  if (c.includes("transport") || c.includes("shuttle") || c.includes("valet")) return "transport";
  if (c.includes("signage") || c.includes("digital") || c.includes("screen")) return "digital_signage";
  return null;
}

const VENUE_KEYS: LeakKey[] = [
  "sponsor_inventory",
  "vip_package",
  "brand_activation",
  "branded_install",
  "digital_signage",
  "parking_sponsorship",
  "premium_furniture",
];

/**
 * Scan a venue for revenue leakage. Compares the venue's monetizable ceiling
 * across its relevant leak types against what its existing assets already
 * capture, and surfaces the unrealized gaps as ranked suggestions.
 */
export function scanVenue(input: VenueScanInput): RevenueScanResult {
  const reach = numOr0(input.audienceSize) || numOr0(input.impressionEstimate) || numOr0(input.capacity);
  const assets = input.assets ?? [];

  // Tally captured (booked) dollars per leak type from existing assets.
  const capturedByKey = new Map<LeakKey, number>();
  for (const a of assets) {
    const key = a.key ?? inferKey(a.category);
    if (!key) continue;
    if (a.booked) {
      const v = numOr0(a.value);
      // Booked assets without an explicit price still count as "captured" at the
      // modeled potential so they do not show up as a phantom gap.
      const credit = v > 0 ? v : potentialFor(key, reach);
      capturedByKey.set(key, numOr0(capturedByKey.get(key)) + credit);
    }
  }

  const suggestions: LeakSuggestion[] = [];
  for (const key of VENUE_KEYS) {
    const potential = potentialFor(key, reach);
    const captured = dollars(Math.min(numOr0(capturedByKey.get(key)), potential));
    const missed = dollars(potential - captured);
    if (missed <= 0) continue;
    suggestions.push({
      key,
      label: LEAK_LABELS[key],
      potential,
      captured,
      missed,
      reason: reasonFor(key, reach, captured > 0),
    });
  }
  suggestions.sort((a, b) => b.missed - a.missed || a.key.localeCompare(b.key));

  const potential = suggestions.reduce((s, x) => s + x.potential, 0);
  const captured = suggestions.reduce((s, x) => s + x.captured, 0);
  const missed = suggestions.reduce((s, x) => s + x.missed, 0);
  return { potential, captured, missed, suggestions };
}

// ---------------------------------------------------------------------------
// Event scan
// ---------------------------------------------------------------------------

/**
 * An add-on / line item already on the event, mapped to a leak type. Used to
 * mark a leak type as captured so the scan does not re-suggest it.
 */
export type EventLineItem = {
  key?: LeakKey | null;
  category?: string | null;
  value?: number | null;
};

export type EventScanInput = {
  eventId?: string | null;
  guestCount?: number | null;
  budget?: number | null;
  bookedItems?: EventLineItem[]; // upsells already on the event
  hasSponsors?: boolean | null; // any sponsor inventory already sold for this event
};

const EVENT_KEYS: LeakKey[] = [
  "vip_package",
  "premium_furniture",
  "photo_video",
  "floral",
  "branded_install",
  "transport",
  "digital_signage",
  "sponsor_inventory",
];

/**
 * Scan an event for revenue leakage. Compares the per-guest monetizable ceiling
 * across upsell + sponsor leak types against the upsells already booked, and
 * surfaces the gaps as ranked suggestions.
 */
export function scanEvent(input: EventScanInput): RevenueScanResult {
  const reach = numOr0(input.guestCount);
  const items = input.bookedItems ?? [];

  const capturedByKey = new Map<LeakKey, number>();
  for (const it of items) {
    const key = it.key ?? inferKey(it.category);
    if (!key) continue;
    const v = numOr0(it.value);
    const credit = v > 0 ? v : potentialFor(key, reach);
    capturedByKey.set(key, numOr0(capturedByKey.get(key)) + credit);
  }
  if (input.hasSponsors) {
    capturedByKey.set(
      "sponsor_inventory",
      Math.max(numOr0(capturedByKey.get("sponsor_inventory")), potentialFor("sponsor_inventory", reach)),
    );
  }

  const suggestions: LeakSuggestion[] = [];
  for (const key of EVENT_KEYS) {
    const potential = potentialFor(key, reach);
    const captured = dollars(Math.min(numOr0(capturedByKey.get(key)), potential));
    const missed = dollars(potential - captured);
    if (missed <= 0) continue;
    suggestions.push({
      key,
      label: LEAK_LABELS[key],
      potential,
      captured,
      missed,
      reason: reasonFor(key, reach, captured > 0),
    });
  }
  suggestions.sort((a, b) => b.missed - a.missed || a.key.localeCompare(b.key));

  const potential = suggestions.reduce((s, x) => s + x.potential, 0);
  const captured = suggestions.reduce((s, x) => s + x.captured, 0);
  const missed = suggestions.reduce((s, x) => s + x.missed, 0);
  return { potential, captured, missed, suggestions };
}

/** A short, deterministic reason string for a suggestion. */
function reasonFor(key: LeakKey, reach: number, partial: boolean): string {
  const reachNote = reach > 0 ? ` across roughly ${reach.toLocaleString()} in reach` : "";
  const base: Record<LeakKey, string> = {
    sponsor_inventory: `Open sponsor inventory can still be packaged and sold${reachNote}.`,
    vip_package: `A VIP tier captures premium spend${reachNote}.`,
    brand_activation: `Brand activation space is monetizable${reachNote}.`,
    premium_furniture: "Premium furniture upgrades lift the average ticket.",
    photo_video: "A photo and video package is a high-margin add-on.",
    floral: "Floral and decor upsells are commonly under-quoted.",
    branded_install: `Branded installs and fabrication can carry sponsor dollars${reachNote}.`,
    transport: "A transport package adds convenience revenue.",
    parking_sponsorship: "Parking can be sold as a standalone sponsorship.",
    digital_signage: `Digital signage delivers measurable impressions${reachNote}.`,
  };
  const lead = partial ? "Partially captured. " : "Not yet captured. ";
  return lead + base[key];
}
