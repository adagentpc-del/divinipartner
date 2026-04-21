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
