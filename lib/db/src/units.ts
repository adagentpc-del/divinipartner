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
type DimMap = Array<[string, string]>;

const SIZE_DIMS: DimMap = [
  ["sizeWidth", "sizeWidthMm"],
  ["sizeHeight", "sizeHeightMm"],
  ["sizeDepth", "sizeDepthMm"],
  ["sizeDiameter", "sizeDiameterMm"],
];

const ENTERED_DIMS: DimMap = [
  ["enteredWidth", "enteredWidthMm"],
  ["enteredHeight", "enteredHeightMm"],
];

// Packed shipping dimensions — uses `packedSizeUnit`.
const PACKED_DIMS: DimMap = [
  ["packedWidth", "packedWidthMm"],
  ["packedHeight", "packedHeightMm"],
  ["packedDepth", "packedDepthMm"],
];

const ARTWORK_DIMS: DimMap = [
  ["artworkWidth", "artworkWidthMm"],
  ["artworkHeight", "artworkHeightMm"],
  ["bleed", "bleedMm"],
  ["safeArea", "safeAreaMm"],
  ["visibleWidth", "visibleWidthMm"],
  ["visibleHeight", "visibleHeightMm"],
];

function applyMmGroup(
  input: Record<string, any>,
  out: Record<string, any>,
  unitKey: string,
  existingUnit: string | null | undefined,
  dimKeys: DimMap,
  fallbackUnit?: string | null,
) {
  const unitInPayload = unitKey in input;
  const unitRaw = unitInPayload ? input[unitKey] : (existingUnit ?? fallbackUnit);
  const u = normalizeUnit(unitRaw ?? null);

  // Case 1: unit explicitly cleared/invalid in payload -> null all mm columns
  if (unitInPayload && !u) {
    for (const [, mmKey] of dimKeys) out[mmKey] = null;
    return;
  }
  // Case 2: no usable unit anywhere -> for any dim field present, null its mm
  if (!u) {
    for (const [dimKey, mmKey] of dimKeys) {
      if (dimKey in input) out[mmKey] = null;
    }
    return;
  }
  // Case 3: we have a unit -> recompute mm for every dim field present in payload
  const toMm = (v: any) =>
    v == null || isNaN(Number(v)) ? null : Number(v) * TO_MM[u];
  for (const [dimKey, mmKey] of dimKeys) {
    if (dimKey in input) out[mmKey] = toMm(input[dimKey]);
  }
}

/**
 * Compute normalized base-unit (mm) columns for both finished-size and artwork
 * spec fields on any payload. Use at insert/update time so downstream queries
 * can sort/filter/compare across mixed unit entries.
 *
 * - Finished size fields (sizeWidth/Height/Depth/Diameter) use `sizeUnit`.
 * - Artwork-spec fields (artworkWidth/Height, bleed, safeArea, visibleWidth/
 *   Height) use `artworkUnit`, falling back to `sizeUnit` when absent.
 *
 * Pass the persisted unit(s) via `existing` for PATCH calls that update only
 * a numeric field without re-sending the unit.
 */
export function withMmColumns<T extends Record<string, any>>(
  input: T,
  existing?:
    | {
        sizeUnit?: string | null;
        artworkUnit?: string | null;
        enteredSizeUnit?: string | null;
        packedSizeUnit?: string | null;
      }
    | string
    | null,
): T & Record<string, any> {
  const existingSize = typeof existing === "string" || existing == null
    ? existing as (string | null | undefined)
    : existing.sizeUnit;
  const existingArtwork = typeof existing === "object" && existing != null ? existing.artworkUnit : null;

  const out: any = { ...input };
  applyMmGroup(input as any, out, "sizeUnit", existingSize, SIZE_DIMS);
  // Artwork unit falls back to whatever size unit is in scope (payload or existing).
  const sizeFallback = ("sizeUnit" in (input as any)) ? (input as any).sizeUnit : (existingSize ?? null);
  applyMmGroup(input as any, out, "artworkUnit", existingArtwork, ARTWORK_DIMS, sizeFallback);
  // Order-line measurement snapshot (entered_*) keys off enteredSizeUnit.
  const existingEntered = typeof existing === "object" && existing != null ? (existing as any).enteredSizeUnit : null;
  applyMmGroup(input as any, out, "enteredSizeUnit", existingEntered, ENTERED_DIMS);
  // Packed shipping dimensions key off packedSizeUnit.
  const existingPacked = typeof existing === "object" && existing != null ? (existing as any).packedSizeUnit : null;
  applyMmGroup(input as any, out, "packedSizeUnit", existingPacked, PACKED_DIMS);
  return out;
}

// ===========================================================================
// Weight units (April 2026 logistics extension).
// ===========================================================================

export type WeightUnit = "lb" | "oz" | "kg" | "g";

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  lb: "pounds",
  oz: "ounces",
  kg: "kilograms",
  g: "grams",
};

export const WEIGHT_UNIT_SHORT: Record<WeightUnit, string> = {
  lb: "lb",
  oz: "oz",
  kg: "kg",
  g: "g",
};

export const ALL_WEIGHT_UNITS: WeightUnit[] = ["lb", "oz", "kg", "g"];
export const IMPERIAL_WEIGHT_UNITS: WeightUnit[] = ["lb", "oz"];
export const METRIC_WEIGHT_UNITS: WeightUnit[] = ["kg", "g"];

const TO_G: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

export function weightSystemOf(u: WeightUnit | string | null | undefined): UnitSystem {
  if (!u) return "imperial";
  return METRIC_WEIGHT_UNITS.includes(u as WeightUnit) ? "metric" : "imperial";
}

export function normalizeWeightUnit(u: string | null | undefined): WeightUnit | null {
  if (!u) return null;
  const k = u.toLowerCase().trim();
  if (k === "lb" || k === "lbs" || k === "pound" || k === "pounds") return "lb";
  if (k === "oz" || k === "ounce" || k === "ounces") return "oz";
  if (k === "kg" || k === "kgs" || k === "kilogram" || k === "kilograms") return "kg";
  if (k === "g" || k === "gram" || k === "grams") return "g";
  return null;
}

export function convertWeight(value: number | null | undefined, from: WeightUnit | string, to: WeightUnit | string): number {
  if (value == null || isNaN(Number(value))) return NaN;
  const f = normalizeWeightUnit(from as string);
  const t = normalizeWeightUnit(to as string);
  if (!f || !t) return NaN;
  if (f === t) return Number(value);
  const g = Number(value) * TO_G[f];
  return g / TO_G[t];
}

export function defaultWeightUnit(system: UnitSystem): WeightUnit {
  return system === "metric" ? "kg" : "lb";
}

export function pickDisplayWeightUnit(grams: number, system: UnitSystem): WeightUnit {
  if (system === "metric") return grams >= 1000 ? "kg" : "g";
  return grams >= TO_G.lb ? "lb" : "oz";
}

export function formatWeight(
  value: number | null | undefined,
  unit: WeightUnit | string | null | undefined,
  opts?: { short?: boolean }
): string {
  if (value == null || isNaN(Number(value)) || !unit) return "";
  const u = normalizeWeightUnit(unit as string);
  if (!u) return `${value} ${unit}`;
  const decimals = u === "g" ? 0 : u === "oz" ? 1 : 2;
  const f = Math.pow(10, decimals);
  const v = Math.round(Number(value) * f) / f;
  const label = opts?.short === false ? WEIGHT_UNIT_LABELS[u] : WEIGHT_UNIT_SHORT[u];
  return `${v} ${label}`;
}

// Pairs of (weightField, normalizedGramsField) keyed by their unit field.
type WeightGroup = { unitKey: string; pairs: Array<[string, string]> };

const WEIGHT_GROUPS: WeightGroup[] = [
  { unitKey: "shippingWeightUnit", pairs: [["shippingWeight", "shippingWeightG"]] },
  { unitKey: "totalShipmentWeightUnit", pairs: [["totalShipmentWeight", "totalShipmentWeightG"]] },
];

function applyWeightGroup(
  input: Record<string, any>,
  out: Record<string, any>,
  unitKey: string,
  existingUnit: string | null | undefined,
  pairs: Array<[string, string]>,
) {
  const unitInPayload = unitKey in input;
  const u = normalizeWeightUnit((unitInPayload ? input[unitKey] : existingUnit) ?? null);
  if (unitInPayload && !u) {
    for (const [, gKey] of pairs) out[gKey] = null;
    return;
  }
  if (!u) {
    for (const [valueKey, gKey] of pairs) {
      if (valueKey in input) out[gKey] = null;
    }
    return;
  }
  const toG = (v: any) => v == null || isNaN(Number(v)) ? null : Number(v) * TO_G[u];
  for (const [valueKey, gKey] of pairs) {
    if (valueKey in input) out[gKey] = toG(input[valueKey]);
  }
}

/**
 * Compute normalized grams columns for any payload carrying weight fields.
 * Mirror of withMmColumns. Pass the persisted unit via `existing` for PATCH
 * calls that update only a numeric weight field without re-sending the unit.
 */
export function withWeightColumns<T extends Record<string, any>>(
  input: T,
  existing?:
    | {
        shippingWeightUnit?: string | null;
        totalShipmentWeightUnit?: string | null;
        [k: string]: unknown;
      }
    | null,
): T & Record<string, any> {
  const out: any = { ...input };
  for (const group of WEIGHT_GROUPS) {
    const existingUnit = existing && typeof existing === "object" ? (existing[group.unitKey] as string | null | undefined) : null;
    applyWeightGroup(input as any, out, group.unitKey, existingUnit, group.pairs);
  }
  return out;
}

// ===========================================================================
// Measurement-aware pricing helpers (April 2026 extension).
// ===========================================================================

export type PricingModel = "fixed" | "area" | "linear" | "quantity" | "custom_quote";
export type PricingUnit = "per_unit" | "per_sqft" | "per_sqm" | "per_linear_ft" | "per_linear_m";

export const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  per_unit: "per unit",
  per_sqft: "per sq ft",
  per_sqm: "per sq m",
  per_linear_ft: "per linear ft",
  per_linear_m: "per linear m",
};

const SQM_PER_SQFT = 0.092903;
const SQFT_PER_SQM = 10.7639;
const M_PER_FT = 0.3048;
const FT_PER_M = 3.28084;

export function areaSqm(widthMm: number | null | undefined, heightMm: number | null | undefined): number | null {
  if (widthMm == null || heightMm == null) return null;
  const w = Number(widthMm); const h = Number(heightMm);
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
  return (w / 1000) * (h / 1000);
}
export function areaSqft(widthMm: number | null | undefined, heightMm: number | null | undefined): number | null {
  const sqm = areaSqm(widthMm, heightMm);
  return sqm == null ? null : sqm * SQFT_PER_SQM;
}
export function linearM(valueMm: number | null | undefined): number | null {
  if (valueMm == null) return null;
  const v = Number(valueMm);
  if (!isFinite(v) || v <= 0) return null;
  return v / 1000;
}
export function linearFt(valueMm: number | null | undefined): number | null {
  const m = linearM(valueMm);
  return m == null ? null : m * FT_PER_M;
}

export function isPricingUnitArea(u: PricingUnit | string | null | undefined): boolean {
  return u === "per_sqft" || u === "per_sqm";
}
export function isPricingUnitLinear(u: PricingUnit | string | null | undefined): boolean {
  return u === "per_linear_ft" || u === "per_linear_m";
}

/** Round currency to 2 decimals. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PriceComputeInput {
  pricingModel: PricingModel | string | null | undefined;
  unitRate: number | string | null | undefined;
  pricingUnit: PricingUnit | string | null | undefined;
  widthMm?: number | null;
  heightMm?: number | null;
  /** For pure-linear products that store a single dimension. */
  lengthMm?: number | null;
  quantity?: number | null;
  minBillableSize?: number | null;     // expressed in pricingUnit's own unit (sqm, sqft, m, or ft)
  minCharge?: number | string | null;
}

export interface PriceComputeResult {
  pricingModel: PricingModel;
  pricingUnit: PricingUnit | null;
  rate: number | null;
  /** Billable area in sqm (always sqm internally; UI converts for display). */
  billableAreaSqm: number | null;
  /** Billable linear length in metres. */
  billableLinearM: number | null;
  /** Billable count for the pricing unit (sqm, sqft, m, ft, or units), already min-clamped. */
  billableQuantity: number | null;
  /** Computed unit price in dollars (rate * billable + min-charge clamp). null if quote required or insufficient data. */
  unitPrice: number | null;
  /** Total = unitPrice * quantity. */
  total: number | null;
  /** Human-readable basis string for ops/supplier display. */
  basis: string;
  /** True when pricing requires a manual quote and no number was computed. */
  requiresQuote: boolean;
}

/**
 * Compute a measurement-aware price for an order/request line.
 * Always returns a `basis` string suitable for supplier packets / ops UIs.
 */
export function computePrice(input: PriceComputeInput): PriceComputeResult {
  const model = (input.pricingModel || "fixed") as PricingModel;
  const pUnit = (input.pricingUnit || null) as PricingUnit | null;
  const rate = input.unitRate == null || input.unitRate === "" ? null : Number(input.unitRate);
  const qty = input.quantity == null ? 1 : Math.max(1, Number(input.quantity));
  const minCharge = input.minCharge == null || input.minCharge === "" ? null : Number(input.minCharge);
  const minSize = input.minBillableSize == null ? null : Number(input.minBillableSize);

  const sqm = areaSqm(input.widthMm, input.heightMm);
  const sqft = sqm == null ? null : sqm * SQFT_PER_SQM;
  // Prefer explicit lengthMm; otherwise fall back to widthMm for linear products.
  const linMmRaw = input.lengthMm ?? input.widthMm ?? null;
  const linM = linearM(linMmRaw);
  const linFt = linM == null ? null : linM * FT_PER_M;

  const out: PriceComputeResult = {
    pricingModel: model,
    pricingUnit: pUnit,
    rate,
    billableAreaSqm: sqm,
    billableLinearM: linM,
    billableQuantity: null,
    unitPrice: null,
    total: null,
    basis: "",
    requiresQuote: false,
  };

  if (model === "custom_quote") {
    out.requiresQuote = true;
    out.basis = "Custom quote required";
    if (sqm != null) out.basis += ` · area ${money(sqm)} sqm`;
    if (linM != null && sqm == null) out.basis += ` · ${money(linM)} m run`;
    return out;
  }

  if (model === "fixed" || model === "quantity" || pUnit === "per_unit") {
    if (rate == null) { out.basis = "No rate set"; return out; }
    let unit = rate;
    if (minCharge != null && unit < minCharge) unit = minCharge;
    out.unitPrice = money(unit);
    out.total = money(unit * qty);
    out.billableQuantity = qty;
    out.basis = `Fixed @ $${money(rate)}/unit × ${qty}`;
    return out;
  }

  if (model === "area") {
    if (rate == null || pUnit == null || !isPricingUnitArea(pUnit)) { out.basis = "Area pricing missing rate or unit"; return out; }
    const native = pUnit === "per_sqm" ? sqm : sqft;
    if (native == null) { out.basis = `Area pricing — needs width × height (${PRICING_UNIT_LABELS[pUnit]})`; return out; }
    let billable = native;
    if (minSize != null && billable < minSize) billable = minSize;
    let unit = rate * billable;
    if (minCharge != null && unit < minCharge) unit = minCharge;
    out.billableQuantity = money(billable);
    // Reflect clamped billable in the persisted geometric figure so DB display matches charge.
    out.billableAreaSqm = money(pUnit === "per_sqm" ? billable : billable / SQFT_PER_SQM);
    out.unitPrice = money(unit);
    out.total = money(unit * qty);
    out.basis = `${money(billable)} ${pUnit === "per_sqm" ? "sqm" : "sqft"} × $${money(rate)} ${PRICING_UNIT_LABELS[pUnit]} = $${money(unit)}` +
      (minSize != null && native < minSize ? ` (min ${minSize})` : "") +
      (qty > 1 ? ` × ${qty}` : "");
    return out;
  }

  if (model === "linear") {
    if (rate == null || pUnit == null || !isPricingUnitLinear(pUnit)) { out.basis = "Linear pricing missing rate or unit"; return out; }
    const native = pUnit === "per_linear_m" ? linM : linFt;
    if (native == null) { out.basis = `Linear pricing — needs length (${PRICING_UNIT_LABELS[pUnit]})`; return out; }
    let billable = native;
    if (minSize != null && billable < minSize) billable = minSize;
    let unit = rate * billable;
    if (minCharge != null && unit < minCharge) unit = minCharge;
    out.billableQuantity = money(billable);
    out.billableLinearM = money(pUnit === "per_linear_m" ? billable : billable / FT_PER_M);
    out.unitPrice = money(unit);
    out.total = money(unit * qty);
    out.basis = `${money(billable)} ${pUnit === "per_linear_m" ? "m" : "ft"} × $${money(rate)} ${PRICING_UNIT_LABELS[pUnit]} = $${money(unit)}` +
      (minSize != null && native < minSize ? ` (min ${minSize})` : "") +
      (qty > 1 ? ` × ${qty}` : "");
    return out;
  }

  out.basis = `Unsupported pricing model: ${model}`;
  return out;
}

/** Render a single value in its native unit + (when system differs) a
 *  converted secondary in the preferred system. Returns structured pieces so
 *  the UI can style the secondary differently. */
export function formatPrimarySecondary(
  value: number | null | undefined,
  unit: LengthUnit | string | null | undefined,
  preferredSystem?: UnitSystem,
): { primary: string; secondary: string | null; converted: boolean } {
  if (value == null || isNaN(Number(value)) || !unit) return { primary: "", secondary: null, converted: false };
  const u = normalizeUnit(unit as string);
  if (!u) return { primary: `${value} ${unit}`, secondary: null, converted: false };
  const v = roundForUnit(Number(value), u);
  const primary = `${v} ${UNIT_SHORT[u]}`;
  if (!preferredSystem || unitSystemOf(u) === preferredSystem) {
    return { primary, secondary: null, converted: false };
  }
  const mm = Number(value) * TO_MM[u];
  const target = pickDisplayUnit(mm, preferredSystem);
  const cv = roundForUnit(mm / TO_MM[target], target);
  return { primary, secondary: `${cv} ${UNIT_SHORT[target]}`, converted: true };
}

/** Same idea as formatWxH but returns `{ primary, secondary }` for richer UI. */
export function formatWxHDual(
  width: number | null | undefined,
  height: number | null | undefined,
  sourceUnit: LengthUnit | string | null | undefined,
  preferredSystem?: UnitSystem,
): { primary: string; secondary: string | null; converted: boolean } {
  if (width == null && height == null) return { primary: "", secondary: null, converted: false };
  const u = normalizeUnit(sourceUnit as string);
  if (!u) return { primary: "", secondary: null, converted: false };
  const w = width != null ? roundForUnit(Number(width), u) : null;
  const h = height != null ? roundForUnit(Number(height), u) : null;
  const primary = `${w ?? "?"} × ${h ?? "?"} ${UNIT_SHORT[u]}`;
  if (!preferredSystem || unitSystemOf(u) === preferredSystem) {
    return { primary, secondary: null, converted: false };
  }
  const baseMmW = width != null ? Number(width) * TO_MM[u] : null;
  const baseMmH = height != null ? Number(height) * TO_MM[u] : null;
  const target = pickDisplayUnit(Math.max(baseMmW ?? 0, baseMmH ?? 0), preferredSystem);
  const cw = baseMmW != null ? roundForUnit(baseMmW / TO_MM[target], target) : null;
  const ch = baseMmH != null ? roundForUnit(baseMmH / TO_MM[target], target) : null;
  return { primary, secondary: `${cw ?? "?"} × ${ch ?? "?"} ${UNIT_SHORT[target]}`, converted: true };
}
