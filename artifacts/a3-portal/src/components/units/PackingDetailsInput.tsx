import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DimensionInput, type DimensionValue } from "./DimensionInput";
import { WeightInput, type WeightValue } from "./WeightInput";
import { type LengthUnit, type WeightUnit, type UnitSystem, defaultEntryUnit, defaultWeightUnit } from "@/lib/units";

export type PackingMode = "rolled" | "flat" | "boxed" | "crated";
export const PACKING_MODE_LABELS: Record<PackingMode, string> = {
  rolled: "Rolled in tube", flat: "Flat-packed", boxed: "Boxed", crated: "Crated",
};

export interface PackingDetailsValue {
  packedWidth: number | null;
  packedHeight: number | null;
  packedDepth: number | null;
  packedSizeUnit: LengthUnit | null;
  shippingWeight: number | null;
  shippingWeightUnit: WeightUnit | null;
  cartonCount: number | null;
  packingMode: PackingMode | null;
  crateRequired: boolean;
  palletRequired: boolean;
  oversizeFlag: boolean;
  freightClass: string | null;
  installKitNotes: string | null;
}

interface Props {
  value: PackingDetailsValue;
  onChange: (next: PackingDetailsValue) => void;
  preferredSystem?: UnitSystem;
  className?: string;
  title?: string;
}

export function emptyPackingDetails(system: UnitSystem = "imperial"): PackingDetailsValue {
  return {
    packedWidth: null, packedHeight: null, packedDepth: null, packedSizeUnit: defaultEntryUnit(system),
    shippingWeight: null, shippingWeightUnit: defaultWeightUnit(system),
    cartonCount: null, packingMode: null,
    crateRequired: false, palletRequired: false, oversizeFlag: false,
    freightClass: null, installKitNotes: null,
  };
}

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function PackingDetailsInput({ value, onChange, preferredSystem, className, title }: Props) {
  const dimVal: DimensionValue = {
    width: value.packedWidth, height: value.packedHeight, depth: value.packedDepth ?? null,
    unit: (value.packedSizeUnit ?? defaultEntryUnit(preferredSystem ?? "imperial")) as LengthUnit,
  };
  const wtVal: WeightValue = {
    value: value.shippingWeight,
    unit: (value.shippingWeightUnit ?? defaultWeightUnit(preferredSystem ?? "imperial")) as WeightUnit,
  };

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {title ? <h4 className="text-sm font-semibold">{title}</h4> : null}

      <div>
        <DimensionInput
          label="Packed dimensions (W × H × D)"
          value={dimVal} showDepth
          preferredSystem={preferredSystem}
          onChange={(d) => onChange({ ...value, packedWidth: d.width, packedHeight: d.height, packedDepth: d.depth ?? null, packedSizeUnit: d.unit })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WeightInput
          label="Shipping weight (per carton)"
          value={wtVal}
          preferredSystem={preferredSystem}
          onChange={(w) => onChange({ ...value, shippingWeight: w.value, shippingWeightUnit: w.unit })}
        />
        <div>
          <Label className="text-xs text-muted-foreground">Carton count</Label>
          <Input className="mt-1 w-32" type="number" min={0} step={1} value={value.cartonCount ?? ""}
                 onChange={(e) => onChange({ ...value, cartonCount: num(e.target.value) })} placeholder="1" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Packing mode</Label>
          <Select value={value.packingMode ?? "_none"} onValueChange={(v) => onChange({ ...value, packingMode: v === "_none" ? null : (v as PackingMode) })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Not specified —</SelectItem>
              {(Object.keys(PACKING_MODE_LABELS) as PackingMode[]).map(m => (
                <SelectItem key={m} value={m}>{PACKING_MODE_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Freight class (optional)</Label>
          <Input className="mt-1" value={value.freightClass ?? ""} onChange={(e) => onChange({ ...value, freightClass: e.target.value || null })} placeholder="e.g. 175" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.crateRequired} onCheckedChange={(c) => onChange({ ...value, crateRequired: !!c })} />
          Crate required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.palletRequired} onCheckedChange={(c) => onChange({ ...value, palletRequired: !!c })} />
          Pallet required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.oversizeFlag} onCheckedChange={(c) => onChange({ ...value, oversizeFlag: !!c })} />
          Oversize / non-standard
        </label>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Install kit notes</Label>
        <Textarea className="mt-1" rows={2} value={value.installKitNotes ?? ""} onChange={(e) => onChange({ ...value, installKitNotes: e.target.value || null })}
                  placeholder="e.g. Includes 2× ground stakes, install instructions sheet" />
      </div>
    </div>
  );
}
