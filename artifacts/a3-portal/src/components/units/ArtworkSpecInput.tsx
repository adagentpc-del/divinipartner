import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_UNITS,
  UNIT_LABELS,
  UNIT_SHORT,
  type LengthUnit,
  type UnitSystem,
  formatPrimarySecondary,
  formatWxHDual,
} from "@/lib/units";

export interface ArtworkSpecValue {
  artworkWidth: number | null;
  artworkHeight: number | null;
  bleed: number | null;
  safeArea: number | null;
  visibleWidth: number | null;
  visibleHeight: number | null;
  artworkUnit: LengthUnit;
}

interface Props {
  value: ArtworkSpecValue;
  onChange: (next: ArtworkSpecValue) => void;
  preferredSystem?: UnitSystem;
  className?: string;
  label?: string;
}

const PLACEHOLDERS: Record<LengthUnit, { wh: string; small: string }> = {
  m:  { wh: "2",     small: "0.005" },
  cm: { wh: "200",   small: "0.5"   },
  mm: { wh: "2000",  small: "5"     },
  in: { wh: "78.74", small: "0.125" },
  ft: { wh: "6.5",   small: "0.02"  },
};

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function ArtworkSpecInput({ value, onChange, preferredSystem, className, label }: Props) {
  const unit: LengthUnit = (value?.artworkUnit || "in") as LengthUnit;
  const ph = PLACEHOLDERS[unit];

  const artworkPreview = formatWxHDual(value.artworkWidth, value.artworkHeight, unit, preferredSystem);
  const visiblePreview = formatWxHDual(value.visibleWidth, value.visibleHeight, unit, preferredSystem);
  const bleedPreview = formatPrimarySecondary(value.bleed, unit, preferredSystem);
  const safePreview = formatPrimarySecondary(value.safeArea, unit, preferredSystem);

  return (
    <div className={className}>
      {label && <Label className="block mb-1 text-sm font-medium">{label}</Label>}

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Artwork width</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.wh} ${unit}`}
            value={value.artworkWidth ?? ""}
            onChange={(e) => onChange({ ...value, artworkWidth: num(e.target.value) })} />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Artwork height</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.wh} ${unit}`}
            value={value.artworkHeight ?? ""}
            onChange={(e) => onChange({ ...value, artworkHeight: num(e.target.value) })} />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Bleed</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.small} ${unit}`}
            value={value.bleed ?? ""}
            onChange={(e) => onChange({ ...value, bleed: num(e.target.value) })} />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Safe area</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.small} ${unit}`}
            value={value.safeArea ?? ""}
            onChange={(e) => onChange({ ...value, safeArea: num(e.target.value) })} />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Visible width</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.wh} ${unit}`}
            value={value.visibleWidth ?? ""}
            onChange={(e) => onChange({ ...value, visibleWidth: num(e.target.value) })} />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Visible height</Label>
          <Input type="number" step="any" placeholder={`e.g. ${ph.wh} ${unit}`}
            value={value.visibleHeight ?? ""}
            onChange={(e) => onChange({ ...value, visibleHeight: num(e.target.value) })} />
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-40">
          <Label className="block text-xs text-muted-foreground mb-1">Artwork unit</Label>
          <Select value={unit} onValueChange={(v) => onChange({ ...value, artworkUnit: v as LengthUnit })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{UNIT_LABELS[u]} ({u})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 flex-1 min-w-[200px]">
          {artworkPreview.primary && (
            <div>Artwork: <span className="font-medium text-foreground">{artworkPreview.primary}</span>
              {artworkPreview.secondary && <span className="ml-1">(≈ {artworkPreview.secondary})</span>}</div>
          )}
          {visiblePreview.primary && (
            <div>Visible: <span className="font-medium text-foreground">{visiblePreview.primary}</span>
              {visiblePreview.secondary && <span className="ml-1">(≈ {visiblePreview.secondary})</span>}</div>
          )}
          {bleedPreview.primary && (
            <div>Bleed: <span className="font-medium text-foreground">{bleedPreview.primary}</span>
              {bleedPreview.secondary && <span className="ml-1">(≈ {bleedPreview.secondary})</span>}</div>
          )}
          {safePreview.primary && (
            <div>Safe: <span className="font-medium text-foreground">{safePreview.primary}</span>
              {safePreview.secondary && <span className="ml-1">(≈ {safePreview.secondary})</span>}</div>
          )}
        </div>
      </div>
    </div>
  );
}
