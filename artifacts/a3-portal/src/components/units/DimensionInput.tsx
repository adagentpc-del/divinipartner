import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_UNITS,
  UNIT_LABELS,
  UNIT_SHORT,
  type LengthUnit,
  type UnitSystem,
  convert,
  pickDisplayUnit,
  unitSystemOf,
} from "@/lib/units";

export interface DimensionValue {
  width: number | null;
  height: number | null;
  depth?: number | null;
  unit: LengthUnit;
}

interface Props {
  value: DimensionValue;
  onChange: (next: DimensionValue) => void;
  preferredSystem?: UnitSystem;
  showDepth?: boolean;
  className?: string;
  label?: string;
  helperText?: string;
}

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function DimensionInput({
  value, onChange, preferredSystem, showDepth, className, label, helperText,
}: Props) {
  const unit: LengthUnit = (value?.unit || "in") as LengthUnit;

  const conversionHint = useMemo(() => {
    if (!preferredSystem) return null;
    if (unitSystemOf(unit) === preferredSystem) return null;
    const w = value.width ?? 0;
    const h = value.height ?? 0;
    if (!w && !h) return null;
    const baseMm = Math.max(w, h) * (unit === "in" ? 25.4 : unit === "ft" ? 304.8 : unit === "cm" ? 10 : unit === "m" ? 1000 : 1);
    const target = pickDisplayUnit(baseMm, preferredSystem);
    const cw = w ? convert(w, unit, target) : null;
    const ch = h ? convert(h, unit, target) : null;
    const fmt = (n: number | null) => (n == null ? "?" : Math.round(n * 100) / 100);
    return `≈ ${fmt(cw)} × ${fmt(ch)} ${UNIT_SHORT[target]} (${preferredSystem} preference)`;
  }, [value, unit, preferredSystem]);

  return (
    <div className={className}>
      {label && <Label className="block mb-1 text-sm font-medium">{label}</Label>}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="block text-xs text-muted-foreground mb-1">Width</Label>
          <Input
            type="number"
            step="any"
            placeholder={`e.g. ${unit === "m" ? "2" : unit === "cm" ? "200" : "48"}`}
            value={value.width ?? ""}
            onChange={(e) => onChange({ ...value, width: num(e.target.value) })}
          />
        </div>
        <div className="flex-1">
          <Label className="block text-xs text-muted-foreground mb-1">Height</Label>
          <Input
            type="number"
            step="any"
            placeholder={`e.g. ${unit === "m" ? "1" : unit === "cm" ? "100" : "24"}`}
            value={value.height ?? ""}
            onChange={(e) => onChange({ ...value, height: num(e.target.value) })}
          />
        </div>
        {showDepth && (
          <div className="flex-1">
            <Label className="block text-xs text-muted-foreground mb-1">Depth</Label>
            <Input
              type="number"
              step="any"
              value={value.depth ?? ""}
              onChange={(e) => onChange({ ...value, depth: num(e.target.value) })}
            />
          </div>
        )}
        <div className="w-32">
          <Label className="block text-xs text-muted-foreground mb-1">Unit</Label>
          <Select value={unit} onValueChange={(v) => onChange({ ...value, unit: v as LengthUnit })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{UNIT_LABELS[u]} ({u})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {(helperText || conversionHint) && (
        <p className="text-xs text-muted-foreground mt-1">
          {helperText}
          {helperText && conversionHint ? " · " : ""}
          {conversionHint}
        </p>
      )}
    </div>
  );
}

interface UnitPreferenceSelectProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  inheritLabel?: string;
  className?: string;
}

export function UnitPreferenceSelect({ value, onChange, inheritLabel = "Inherit", className }: UnitPreferenceSelectProps) {
  return (
    <Select
      value={value || "__inherit__"}
      onValueChange={(v) => onChange(v === "__inherit__" ? null : v)}
    >
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__inherit__">{inheritLabel}</SelectItem>
        <SelectItem value="imperial">Imperial (in / ft)</SelectItem>
        <SelectItem value="metric">Metric (cm / m)</SelectItem>
      </SelectContent>
    </Select>
  );
}
