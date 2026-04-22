import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, AlertTriangle, CheckCircle2, AlertCircle, Layers, ExternalLink } from "lucide-react";

export type FamilyAvailability = {
  familyId: number;
  familySlug: string;
  familyName: string;
  hardwareProductId: number | null;
  hardwareProductName: string | null;
  totalOwned: number;
  reserved: number;
  inUse: number;
  available: number;
  requiresHardware: boolean;
  mode: "component" | "full_unit_required" | "no_hardware_assigned";
  lowStockThreshold: number;
  statusLevel: "healthy" | "low" | "exhausted" | "unconfigured";
};

const LEVEL_STYLES: Record<FamilyAvailability["statusLevel"], { ring: string; bar: string; tint: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  healthy:      { ring: "border-emerald-200", bar: "[&>div]:bg-emerald-500", tint: "bg-emerald-50",  label: "Healthy",       icon: CheckCircle2 },
  low:          { ring: "border-amber-300",   bar: "[&>div]:bg-amber-500",   tint: "bg-amber-50",    label: "Low remaining", icon: AlertTriangle },
  exhausted:    { ring: "border-rose-300",    bar: "[&>div]:bg-rose-500",    tint: "bg-rose-50",     label: "Exhausted",     icon: AlertCircle },
  unconfigured: { ring: "border-slate-200",   bar: "[&>div]:bg-slate-300",   tint: "bg-slate-50",    label: "Not configured", icon: Layers },
};

const MODE_COPY: Record<FamilyAvailability["mode"], { label: string; description: string }> = {
  component:           { label: "Existing hardware available", description: "Component-only ordering — partner-owned units cover demand." },
  full_unit_required:  { label: "Full unit required",          description: "Stock is exhausted. New orders must include the hardware product." },
  no_hardware_assigned:{ label: "Manual review",               description: "No hardware product is assigned — assign one to enable auto-reservation." },
};

export function FamilyStatusCard({
  family,
  partnerId,
  compact = false,
}: {
  family: FamilyAvailability;
  partnerId?: number;
  compact?: boolean;
}) {
  const style = LEVEL_STYLES[family.statusLevel];
  const mode = MODE_COPY[family.mode];
  const Icon = style.icon;
  const usedPct = family.totalOwned > 0 ? Math.min(100, Math.round(((family.totalOwned - family.available) / family.totalOwned) * 100)) : 0;

  return (
    <Card className={`p-4 border ${style.ring}`} data-testid={`family-status-${family.familySlug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm truncate">{family.familyName}</h4>
            <Badge variant="outline" className="font-mono text-[10px]">{family.familySlug}</Badge>
            <Badge className={`gap-1 text-[10px] ${style.tint} text-foreground border ${style.ring}`}>
              <Icon className="h-3 w-3" /> {style.label}
            </Badge>
          </div>
          {family.hardwareProductName && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Package className="h-3 w-3" /> {family.hardwareProductName}
            </div>
          )}
        </div>
        {!compact && (
          <Link href="/admin/product-families">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid={`btn-view-family-${family.familySlug}`}>
              Family <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border p-2">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Total</div>
          <div className="text-lg font-semibold leading-none mt-1" data-testid={`family-total-${family.familySlug}`}>{family.totalOwned}</div>
        </div>
        <div className="rounded border p-2">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Claimed</div>
          <div className="text-lg font-semibold leading-none mt-1 text-amber-700" data-testid={`family-claimed-${family.familySlug}`}>{family.reserved + family.inUse}</div>
        </div>
        <div className={`rounded border p-2 ${style.tint}`}>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Remaining</div>
          <div className="text-lg font-semibold leading-none mt-1" data-testid={`family-remaining-${family.familySlug}`}>{family.available}</div>
        </div>
      </div>

      {family.totalOwned > 0 && (
        <div className="mt-2">
          <Progress value={usedPct} className={`h-1.5 ${style.bar}`} />
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
            <span>{usedPct}% claimed</span>
            <span>Low at ≤ {family.lowStockThreshold}</span>
          </div>
        </div>
      )}

      <div className={`mt-3 rounded border ${style.ring} ${style.tint} p-2`}>
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> Mode: {mode.label}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{mode.description}</div>
        {family.statusLevel === "exhausted" && (
          <div className="text-[11px] mt-1 text-rose-700 font-medium">
            Existing hardware no longer available — orders auto-include the {family.hardwareProductName || "hardware"} product.
          </div>
        )}
      </div>

      {!compact && partnerId != null && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link href={`/admin/partners/${partnerId}/committed-inventory`}>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" data-testid={`btn-view-claims-${family.familySlug}`}>View claims</Button>
          </Link>
          <Link href={`/admin/inventory`}>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" data-testid={`btn-edit-inventory-${family.familySlug}`}>Edit total owned</Button>
          </Link>
        </div>
      )}
    </Card>
  );
}

export function FamilyStatusGrid({ families, partnerId, emptyHint }: { families: FamilyAvailability[]; partnerId?: number; emptyHint?: string }) {
  if (!families.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {emptyHint || "No connected product families yet."}
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {families.map(f => <FamilyStatusCard key={f.familyId} family={f} partnerId={partnerId} />)}
    </div>
  );
}
