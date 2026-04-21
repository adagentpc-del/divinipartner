import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Lock } from "lucide-react";

export default function CommercialPlans() {
  const { data: plans } = useQuery<any[]>({ queryKey: ["commercial-plans"], queryFn: () => apiFetch("/api/commercial/plans") });
  const { data: keys } = useQuery<any>({ queryKey: ["feature-keys"], queryFn: () => apiFetch("/api/commercial/feature-keys") });

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link href="/admin/commercial"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <p className="text-muted-foreground mt-1">Pricing tiers and feature gating presets.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map(p => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{p.name}</CardTitle>
                  <CardDescription className="capitalize">{p.tier} · {p.pricingModel.replace(/_/g, " ")}</CardDescription>
                </div>
                <Badge variant="outline">{p.priceAmount ? `$${p.priceAmount}` : "custom"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Limits</h4>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {keys?.limits.map((l: string) => (
                    <div key={l} className="flex justify-between"><span className="capitalize text-muted-foreground">{l}</span><span className="tabular-nums">{p.includedLimitsJson?.[l] ?? "∞"}</span></div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Features</h4>
                <div className="space-y-1">
                  {keys?.features.map((f: string) => {
                    const on = !!p.featureFlagsJson?.[f];
                    return (
                      <div key={f} className={`flex items-center gap-2 text-xs ${on ? "" : "text-muted-foreground"}`}>
                        {on ? <Check className="h-3 w-3 text-emerald-600" /> : <Lock className="h-3 w-3" />}
                        <span className="capitalize">{f.replace(/_/g, " ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans?.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No plans yet — seed defaults from the dashboard.</CardContent></Card>}
      </div>
    </div>
  );
}
