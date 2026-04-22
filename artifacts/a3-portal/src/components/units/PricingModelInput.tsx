import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type PricingModel,
  type PricingUnit,
  PRICING_UNIT_LABELS,
  computePrice,
} from "@/lib/units";

export type PricingModelValue = {
  pricingModel: PricingModel | null;
  unitRate: number | string | null;
  pricingUnit: PricingUnit | null;
  minBillableSize: number | null;
  minCharge: number | string | null;
  allowsCustomSize: boolean;
};

const MODEL_OPTIONS: { value: PricingModel; label: string; help: string }[] = [
  { value: "fixed", label: "Fixed price", help: "One unit_rate per item." },
  { value: "quantity", label: "Per quantity", help: "Same as fixed but multiplied by qty." },
  { value: "area", label: "Per area", help: "unit_rate × billable area (sq m or sq ft)." },
  { value: "linear", label: "Per linear length", help: "unit_rate × billable length (m or ft)." },
  { value: "custom_quote", label: "Custom quote", help: "Sales follow up — no auto price." },
];

const UNIT_OPTIONS_BY_MODEL: Record<PricingModel, PricingUnit[]> = {
  fixed: ["per_unit"],
  quantity: ["per_unit"],
  area: ["per_sqm", "per_sqft"],
  linear: ["per_linear_m", "per_linear_ft"],
  custom_quote: [],
};

export function PricingModelInput({
  value,
  onChange,
  // Optional product-native dims for the live preview.
  sampleWidthMm,
  sampleHeightMm,
}: {
  value: PricingModelValue;
  onChange: (v: PricingModelValue) => void;
  sampleWidthMm?: number | null;
  sampleHeightMm?: number | null;
}) {
  const model = (value.pricingModel || "fixed") as PricingModel;
  const allowedUnits = UNIT_OPTIONS_BY_MODEL[model];

  function patch(p: Partial<PricingModelValue>) { onChange({ ...value, ...p }); }

  const preview = computePrice({
    pricingModel: model,
    unitRate: value.unitRate,
    pricingUnit: value.pricingUnit,
    widthMm: sampleWidthMm ?? null,
    heightMm: sampleHeightMm ?? null,
    quantity: 1,
    minBillableSize: value.minBillableSize,
    minCharge: value.minCharge,
  });

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Pricing model</Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Model</Label>
          <Select value={model} onValueChange={(v) => {
            const next = v as PricingModel;
            const units = UNIT_OPTIONS_BY_MODEL[next];
            patch({
              pricingModel: next,
              pricingUnit: units.includes(value.pricingUnit as PricingUnit) ? value.pricingUnit : (units[0] ?? null),
            });
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">{MODEL_OPTIONS.find(o => o.value === model)?.help}</p>
        </div>
        <div>
          <Label className="text-xs">Unit rate</Label>
          <Input
            type="number" step="0.01"
            value={value.unitRate ?? ""}
            onChange={e => patch({ unitRate: e.target.value === "" ? null : Number(e.target.value) })}
            disabled={model === "custom_quote"}
            placeholder={model === "custom_quote" ? "Quoted manually" : "0.00"}
          />
        </div>
        {allowedUnits.length > 0 && (
          <div>
            <Label className="text-xs">Pricing unit</Label>
            <Select
              value={value.pricingUnit ?? allowedUnits[0]}
              onValueChange={v => patch({ pricingUnit: v as PricingUnit })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedUnits.map(u => <SelectItem key={u} value={u}>{PRICING_UNIT_LABELS[u]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {(model === "area" || model === "linear") && (
          <div>
            <Label className="text-xs">Min billable size</Label>
            <Input
              type="number" step="0.01"
              value={value.minBillableSize ?? ""}
              onChange={e => patch({ minBillableSize: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder={value.pricingUnit?.includes("ft") ? "ft / sqft" : "m / sqm"}
            />
          </div>
        )}
        <div>
          <Label className="text-xs">Min charge</Label>
          <Input
            type="number" step="0.01"
            value={value.minCharge ?? ""}
            onChange={e => patch({ minCharge: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Allow custom size at order time</Label>
        <Switch checked={value.allowsCustomSize} onCheckedChange={v => patch({ allowsCustomSize: v })} />
      </div>
      {preview.basis && (
        <p className="text-[11px] font-mono bg-background border rounded p-2">
          {preview.requiresQuote ? "Quote required" : `Preview: ${preview.basis}`}
          {preview.total != null && <span className="ml-1 font-semibold">→ ${preview.total}</span>}
        </p>
      )}
    </div>
  );
}
