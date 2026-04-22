// Mirror of lib/db/src/units.ts for client-side use.
// Keep these two files in sync.

export type UnitSystem = "imperial" | "metric";
export type LengthUnit = "in" | "ft" | "mm" | "cm" | "m";

export const UNIT_LABELS: Record<LengthUnit, string> = {
  in: "inches", ft: "feet", mm: "millimeters", cm: "centimeters", m: "meters",
};
export const UNIT_SHORT: Record<LengthUnit, string> = {
  in: "in", ft: "ft", mm: "mm", cm: "cm", m: "m",
};

export const IMPERIAL_UNITS: LengthUnit[] = ["in", "ft"];
export const METRIC_UNITS: LengthUnit[] = ["mm", "cm", "m"];
export const ALL_UNITS: LengthUnit[] = ["in", "ft", "mm", "cm", "m"];

const TO_MM: Record<LengthUnit, number> = {
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
};

export function unitSystemOf(u: LengthUnit | string | null | undefined): UnitSystem {
  if (!u) return "imperial";
  return METRIC_UNITS.includes(u as LengthUnit) ? "metric" : "imperial";
}

export function normalizeUnit(u: string | null | undefined): LengthUnit | null {
  if (!u) return null;
  const k = String(u).toLowerCase().trim();
  if (k === "in" || k === "inch" || k === "inches" || k === '"') return "in";
  if (k === "ft" || k === "foot" || k === "feet" || k === "'") return "ft";
  if (k === "mm" || k === "millimeter" || k === "millimeters") return "mm";
  if (k === "cm" || k === "centimeter" || k === "centimeters") return "cm";
  if (k === "m" || k === "meter" || k === "meters") return "m";
  return null;
}

export function convert(value: number | null | undefined, from: LengthUnit | string, to: LengthUnit | string): number {
  if (value == null || isNaN(Number(value))) return NaN;
  const f = normalizeUnit(from as string);
  const t = normalizeUnit(to as string);
  if (!f || !t) return NaN;
  if (f === t) return Number(value);
  return (Number(value) * TO_MM[f]) / TO_MM[t];
}

export function pickDisplayUnit(mm: number, system: UnitSystem): LengthUnit {
  if (system === "metric") {
    if (mm >= 1000) return "m";
    if (mm >= 10) return "cm";
    return "mm";
  }
  if (mm >= 304.8) return "ft";
  return "in";
}

function roundForUnit(value: number, unit: LengthUnit): number {
  const decimals = unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
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
  if (!preferredSystem || unitSystemOf(u) === preferredSystem) return base;
  const baseMmW = width != null ? Number(width) * TO_MM[u] : null;
  const baseMmH = height != null ? Number(height) * TO_MM[u] : null;
  const target = pickDisplayUnit(Math.max(baseMmW ?? 0, baseMmH ?? 0), preferredSystem);
  const cw = baseMmW != null ? roundForUnit(baseMmW / TO_MM[target], target) : null;
  const ch = baseMmH != null ? roundForUnit(baseMmH / TO_MM[target], target) : null;
  return `${base} (≈ ${cw ?? "?"} × ${ch ?? "?"} ${UNIT_SHORT[target]})`;
}

export function defaultEntryUnit(system: UnitSystem): LengthUnit {
  return system === "metric" ? "cm" : "in";
}

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

// ===========================================================================
// Measurement-aware pricing helpers (April 2026 extension).
// Mirror of helpers in @workspace/db; kept inline so the client doesn't have
// to import server packages. Keep API in sync with lib/db/src/units.ts.
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

const SQFT_PER_SQM = 10.7639;
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

function money(n: number): number { return Math.round(n * 100) / 100; }

export interface PriceComputeInput {
  pricingModel: PricingModel | string | null | undefined;
  unitRate: number | string | null | undefined;
  pricingUnit: PricingUnit | string | null | undefined;
  widthMm?: number | null;
  heightMm?: number | null;
  lengthMm?: number | null;
  quantity?: number | null;
  minBillableSize?: number | null;
  minCharge?: number | string | null;
}

export interface PriceComputeResult {
  pricingModel: PricingModel;
  pricingUnit: PricingUnit | null;
  rate: number | null;
  billableAreaSqm: number | null;
  billableLinearM: number | null;
  billableQuantity: number | null;
  unitPrice: number | null;
  total: number | null;
  basis: string;
  requiresQuote: boolean;
}

export function computePrice(input: PriceComputeInput): PriceComputeResult {
  const model = (input.pricingModel || "fixed") as PricingModel;
  const pUnit = (input.pricingUnit || null) as PricingUnit | null;
  const rate = input.unitRate == null || input.unitRate === "" ? null : Number(input.unitRate);
  const qty = input.quantity == null ? 1 : Math.max(1, Number(input.quantity));
  const minCharge = input.minCharge == null || input.minCharge === "" ? null : Number(input.minCharge);
  const minSize = input.minBillableSize == null ? null : Number(input.minBillableSize);

  const sqm = areaSqm(input.widthMm, input.heightMm);
  const sqft = sqm == null ? null : sqm * SQFT_PER_SQM;
  const linMmRaw = input.lengthMm ?? input.widthMm ?? null;
  const linM = linearM(linMmRaw);
  const linFt = linM == null ? null : linM * FT_PER_M;

  const out: PriceComputeResult = {
    pricingModel: model, pricingUnit: pUnit, rate,
    billableAreaSqm: sqm, billableLinearM: linM,
    billableQuantity: null, unitPrice: null, total: null, basis: "", requiresQuote: false,
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
    out.unitPrice = money(unit); out.total = money(unit * qty); out.billableQuantity = qty;
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
    out.billableQuantity = money(billable); out.unitPrice = money(unit); out.total = money(unit * qty);
    out.billableAreaSqm = money(pUnit === "per_sqm" ? billable : billable / SQFT_PER_SQM);
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
    out.billableQuantity = money(billable); out.unitPrice = money(unit); out.total = money(unit * qty);
    out.billableLinearM = money(pUnit === "per_linear_m" ? billable : billable / FT_PER_M);
    out.basis = `${money(billable)} ${pUnit === "per_linear_m" ? "m" : "ft"} × $${money(rate)} ${PRICING_UNIT_LABELS[pUnit]} = $${money(unit)}` +
      (minSize != null && native < minSize ? ` (min ${minSize})` : "") +
      (qty > 1 ? ` × ${qty}` : "");
    return out;
  }
  out.basis = `Unsupported pricing model: ${model}`;
  return out;
}
