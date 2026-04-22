import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_WEIGHT_UNITS,
  WEIGHT_UNIT_LABELS,
  WEIGHT_UNIT_SHORT,
  type WeightUnit,
  type UnitSystem,
  convertWeight,
  pickDisplayWeightUnit,
  weightSystemOf,
  defaultWeightUnit,
  formatWeight,
} from "@/lib/units";

export interface WeightValue {
  value: number | null;
  unit: WeightUnit;
}

interface Props {
  value: WeightValue;
  onChange: (next: WeightValue) => void;
  preferredSystem?: UnitSystem;
  className?: string;
  label?: string;
  helperText?: string;
  placeholder?: string;
}

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function WeightInput({ value, onChange, preferredSystem, className, label, helperText, placeholder }: Props) {
  const unit: WeightUnit = (value?.unit || defaultWeightUnit(preferredSystem ?? "imperial")) as WeightUnit;

  const conversionHint = useMemo(() => {
    if (!preferredSystem) return null;
    if (weightSystemOf(unit) === preferredSystem) return null;
    if (value.value == null) return null;
    const grams = Number(value.value) * (unit === "lb" ? 453.592 : unit === "oz" ? 28.3495 : unit === "kg" ? 1000 : 1);
    const target = pickDisplayWeightUnit(grams, preferredSystem);
    const cv = convertWeight(value.value, unit, target);
    return `≈ ${formatWeight(cv, target)}`;
  }, [unit, value.value, preferredSystem]);

  return (
    <div className={className}>
      {label ? <Label className="text-xs text-muted-foreground">{label}</Label> : null}
      <div className="flex gap-2 mt-1">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder={placeholder ?? (unit === "g" ? "500" : unit === "oz" ? "16" : "1")}
          value={value.value ?? ""}
          onChange={(e) => onChange({ ...value, value: num(e.target.value) })}
          className="w-32"
        />
        <Select value={unit} onValueChange={(v) => onChange({ ...value, unit: v as WeightUnit })}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALL_WEIGHT_UNITS.map(u => (
              <SelectItem key={u} value={u}>{WEIGHT_UNIT_LABELS[u]} ({WEIGHT_UNIT_SHORT[u]})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(conversionHint || helperText) ? (
        <p className="text-[11px] text-muted-foreground mt-1">{conversionHint ?? helperText}</p>
      ) : null}
    </div>
  );
}
