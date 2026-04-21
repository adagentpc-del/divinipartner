import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Star } from "lucide-react";
import { useDemoMode } from "@/contexts/DemoModeContext";

type Plan = {
  id: number;
  name: string;
  tier: string;
  pricingModel: string;
  priceAmount?: string | null;
  setupFee?: string | null;
  currency: string;
  prospectFacingDescription?: string | null;
  internalMarginNotes?: string | null;
};

type Matrix = {
  plans: Plan[];
  features: Array<{ key: string; cells: Array<{ planId: number; enabled: boolean }> }>;
  limits: Array<{ key: string; cells: Array<{ planId: number; allowance: number | null }> }>;
};

function fmtKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function fmtPrice(p: Plan) {
  if (p.priceAmount === null || p.priceAmount === undefined || p.priceAmount === "") return "Custom";
  const n = Number(p.priceAmount);
  if (isNaN(n)) return "Custom";
  return `${p.currency} ${n.toLocaleString()}`;
}

export function PlanComparisonTable({ matrix, recommendedPlanId }: { matrix: Matrix; recommendedPlanId?: number | null }) {
  const { demoMode } = useDemoMode();
  if (!matrix.plans.length) return <div className="text-sm text-muted-foreground p-6 text-center">Select plans to compare.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-3 font-medium text-muted-foreground text-sm w-1/4">Plan</th>
            {matrix.plans.map(p => {
              const isRec = recommendedPlanId === p.id;
              return (
                <th key={p.id} className={`p-3 text-left align-top min-w-[200px] ${isRec ? "bg-primary/5 rounded-t-lg" : ""}`}>
                  <div className="flex flex-col gap-1">
                    {isRec && (
                      <Badge variant="default" className="self-start gap-1">
                        <Star className="h-3 w-3" /> Recommended
                      </Badge>
                    )}
                    <div className="font-semibold text-base">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{p.tier.replace(/_/g, " ")} · {p.pricingModel.replace(/_/g, " ")}</div>
                    <div className="text-lg font-bold mt-1">{fmtPrice(p)}</div>
                    {p.setupFee && Number(p.setupFee) > 0 && (
                      <div className="text-xs text-muted-foreground">+ {p.currency} {Number(p.setupFee).toLocaleString()} setup</div>
                    )}
                    {p.prospectFacingDescription && <div className="text-xs text-muted-foreground mt-2 leading-snug">{p.prospectFacingDescription}</div>}
                    {!demoMode && p.internalMarginNotes && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 mt-2 leading-snug">
                        <span className="font-semibold">Internal:</span> {p.internalMarginNotes}
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={matrix.plans.length + 1} className="pt-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Limits</td></tr>
          {matrix.limits.map(row => (
            <tr key={row.key} className="border-t">
              <td className="p-3 text-sm font-medium">{fmtKey(row.key)}</td>
              {row.cells.map(c => (
                <td key={c.planId} className={`p-3 text-sm ${recommendedPlanId === c.planId ? "bg-primary/5" : ""}`}>
                  {c.allowance === null || c.allowance === undefined ? <span className="text-muted-foreground">—</span> : c.allowance.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
          <tr><td colSpan={matrix.plans.length + 1} className="pt-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Features</td></tr>
          {matrix.features.map(row => (
            <tr key={row.key} className="border-t">
              <td className="p-3 text-sm font-medium">{fmtKey(row.key)}</td>
              {row.cells.map(c => (
                <td key={c.planId} className={`p-3 ${recommendedPlanId === c.planId ? "bg-primary/5" : ""}`}>
                  {c.enabled ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground/50" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
