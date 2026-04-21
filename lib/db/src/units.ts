// Shared measurement system utilities for the Partner Commerce Portal.
// Used by both the API server and the React portal.
//
// Cascade order for resolving the "effective" measurement preference:
//   event.unitPreference
//     -> venue.unitPreference
//     -> partner.unitPreference
//     -> commercialAccount.unitPreference
//     -> "imperial"

export type UnitSystem = "imperial" | "metric";
export type LengthUnit = "in" | "ft" | "mm" | "cm" | "m";

export const UNIT_LABELS: Record<LengthUnit, string> = {
  in: "inches",
  ft: "feet",
  mm: "millimeters",
  cm: "centimeters",
  m: "meters",
};

export const UNIT_SHORT: Record<LengthUnit, string> = {
  in: "in",
  ft: "ft",
  mm: "mm",
  cm: "cm",
  m: "m",
};

export const IMPERIAL_UNITS: LengthUnit[] = ["in", "ft"];
export const METRIC_UNITS: LengthUnit[] = ["mm", "cm", "m"];
export const ALL_UNITS: LengthUnit[] = ["in", "ft", "mm", "cm", "m"];

// Convert any length unit to millimeters (canonical base).
const TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export function unitSystemOf(u: LengthUnit | string | null | undefined): UnitSystem {
  if (!u) return "imperial";
  return METRIC_UNITS.includes(u as LengthUnit) ? "metric" : "imperial";
}

/** Normalize legacy unit strings ("inches", "feet", "centimeters") to canonical short form. */
export function normalizeUnit(u: string | null | undefined): LengthUnit | null {
  if (!u) return null;
  const k = u.toLowerCase().trim();
  if (k === "in" || k === "inch" || k === "inches" || k === '"') return "in";
  if (k === "ft" || k === "foot" || k === "feet" || k === "'") return "ft";
  if (k === "mm" || k === "millimeter" || k === "millimeters") return "mm";
  if (k === "cm" || k === "centimeter" || k === "centimeters") return "cm";
  if (k === "m" || k === "meter" || k === "meters") return "m";
  return null;
}

/** Convert a numeric value between length units. Returns NaN for invalid input. */
export function convert(value: number | null | undefined, from: LengthUnit | string, to: LengthUnit | string): number {
  if (value == null || isNaN(Number(value))) return NaN;
  const f = normalizeUnit(from as string);
  const t = normalizeUnit(to as string);
  if (!f || !t) return NaN;
  if (f === t) return Number(value);
  const mm = Number(value) * TO_MM[f];
  return mm / TO_MM[t];
}

/** Pick a "natural" display unit for the target system, given the magnitude in mm. */
export function pickDisplayUnit(mm: number, system: UnitSystem): LengthUnit {
  if (system === "metric") {
    if (mm >= 1000) return "m";       // >= 1 m → meters
    if (mm >= 10) return "cm";        // 1 cm – 99.9 cm → cm
    return "mm";                       // tighter than 1 cm → mm
  }
  // imperial
  if (mm >= 304.8) return "ft";        // >= 1 ft → feet
  return "in";                          // smaller → inches
}

/** Round to a sensible precision for the unit (avoids "2.000000004 m" noise). */
function roundForUnit(value: number, unit: LengthUnit): number {
  const decimals = unit === "mm" ? 0
                 : unit === "cm" ? 1
                 : unit === "in" ? 2
                 : unit === "ft" ? 2
                 : 2; // m
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

export function formatDimension(
  value: number | null | undefined,
  unit: LengthUnit | string | null | undefined,
  opts?: { short?: boolean }
): string {
  if (value == null || isNaN(Number(value)) || !unit) return "";
  const u = normalizeUnit(unit as string);
  if (!u) return `${value} ${unit}`;
  const v = roundForUnit(Number(value), u);
  const label = opts?.short === false ? UNIT_LABELS[u] : UNIT_SHORT[u];
  return `${v} ${label}`;
}

/** Format a width × height in the source unit, with an optional converted display in the preferred system. */
export function formatWxH(
  width: number | null | undefined,
  height: number | null | undefined,
  sourceUnit: LengthUnit | string | null | undefined,
  preferredSystem?: UnitSystem
): string {
  if (width == null && height == null) return "";
  const u = normalizeUnit(sourceUnit as string);
  if (!u) return "";
  const w = width != null ? roundForUnit(Number(width), u) : null;
  const h = height != null ? roundForUnit(Number(height), u) : null;
  const base = `${w ?? "?"} × ${h ?? "?"} ${UNIT_SHORT[u]}`;
  if (!preferredSystem) return base;
  if (unitSystemOf(u) === preferredSystem) return base;
  // Add converted secondary
  const baseMmW = width != null ? Number(width) * TO_MM[u] : null;
  const baseMmH = height != null ? Number(height) * TO_MM[u] : null;
  const target = pickDisplayUnit(Math.max(baseMmW ?? 0, baseMmH ?? 0), preferredSystem);
  const cw = baseMmW != null ? roundForUnit(baseMmW / TO_MM[target], target) : null;
  const ch = baseMmH != null ? roundForUnit(baseMmH / TO_MM[target], target) : null;
  return `${base} (≈ ${cw ?? "?"} × ${ch ?? "?"} ${UNIT_SHORT[target]})`;
}

export interface PreferenceCascadeInput {
  event?: { unitPreference?: string | null } | null;
  venue?: { unitPreference?: string | null; country?: string | null } | null;
  partner?: { unitPreference?: string | null } | null;
  account?: { unitPreference?: string | null } | null;
}

export interface PreferenceResolution {
  system: UnitSystem;
  source: "event" | "venue" | "partner" | "account" | "venue_country" | "default";
  reason: string;
}

// Countries where imperial is the default. Everywhere else → metric.
// (US/Liberia/Myanmar are the canonical imperial holdouts; CA is included
//  because the Canadian construction/signage industry still commonly
//  measures in imperial, matching how partners size venue assets.)
const IMPERIAL_COUNTRIES = new Set([
  "US", "USA",
  "CA", "CAN",
  "LR", "LBR",
  "MM", "MMR",
]);

export function resolvePreference(input: PreferenceCascadeInput): PreferenceResolution {
  const ev = (input.event?.unitPreference || "").toLowerCase();
  if (ev === "imperial" || ev === "metric") {
    return { system: ev as UnitSystem, source: "event", reason: "Set on this event" };
  }
  const vu = (input.venue?.unitPreference || "").toLowerCase();
  if (vu === "imperial" || vu === "metric") {
    return { system: vu as UnitSystem, source: "venue", reason: "Set on this venue" };
  }
  const country = (input.venue?.country || "").toUpperCase();
  if (country && !IMPERIAL_COUNTRIES.has(country)) {
    return { system: "metric", source: "venue_country", reason: `Overseas venue (${country})` };
  }
  const pu = (input.partner?.unitPreference || "").toLowerCase();
  if (pu === "imperial" || pu === "metric") {
    return { system: pu as UnitSystem, source: "partner", reason: "Set on this partner" };
  }
  const au = (input.account?.unitPreference || "").toLowerCase();
  if (au === "imperial" || au === "metric") {
    return { system: au as UnitSystem, source: "account", reason: "Set on this account" };
  }
  return { system: "imperial", source: "default", reason: "No preference set — defaulting to imperial" };
}

/** Default unit when starting a fresh dimension entry under a given system. */
export function defaultEntryUnit(system: UnitSystem): LengthUnit {
  return system === "metric" ? "cm" : "in";
}

/**
 * Compute the normalized base-unit (mm) columns for any payload that carries
 * structured size_* fields. Use at insert/update time so downstream queries
 * can sort, filter, and compare across mixed unit entries.
 *
 * Returns a shallow merge of the input plus computed *_mm fields. Pass-through
 * if no `sizeUnit` is set (we have no way to convert).
 */
export function withMmColumns<T extends {
  sizeUnit?: string | null;
  sizeWidth?: number | null;
  sizeHeight?: number | null;
  sizeDepth?: number | null;
  sizeDiameter?: number | null;
}>(
  input: T,
  /** Optional persisted unit fallback: pass the row's existing sizeUnit when
   *  performing a PATCH that updates dimensions but omits the unit. */
  existingUnit?: string | null,
): T & {
  sizeWidthMm?: number | null;
  sizeHeightMm?: number | null;
  sizeDepthMm?: number | null;
  sizeDiameterMm?: number | null;
} {
  const out: any = { ...input };
  const dimKeys: Array<["sizeWidth"|"sizeHeight"|"sizeDepth"|"sizeDiameter", "sizeWidthMm"|"sizeHeightMm"|"sizeDepthMm"|"sizeDiameterMm"]> = [
    ["sizeWidth", "sizeWidthMm"],
    ["sizeHeight", "sizeHeightMm"],
    ["sizeDepth", "sizeDepthMm"],
    ["sizeDiameter", "sizeDiameterMm"],
  ];
  const unitInPayload = "sizeUnit" in input;
  const unitRaw = unitInPayload ? input.sizeUnit : existingUnit;
  const u = normalizeUnit(unitRaw ?? null);

  // Case 1: sizeUnit explicitly cleared/invalid in payload -> null all mm columns
  // (stale normalized data must not survive a unit reset).
  if (unitInPayload && !u) {
    for (const [, mmKey] of dimKeys) out[mmKey] = null;
    return out;
  }

  // Case 2: no usable unit anywhere -> for any dim field present, null its mm
  // companion to avoid stale values; leave untouched fields alone.
  if (!u) {
    for (const [dimKey, mmKey] of dimKeys) {
      if (dimKey in input) out[mmKey] = null;
    }
    return out;
  }

  // Case 3: we have a unit -> recompute mm for every dim field present in payload.
  const toMm = (v: number | null | undefined) =>
    v == null || isNaN(Number(v)) ? null : Number(v) * TO_MM[u];
  for (const [dimKey, mmKey] of dimKeys) {
    if (dimKey in input) out[mmKey] = toMm((input as any)[dimKey]);
  }
  return out;
}
