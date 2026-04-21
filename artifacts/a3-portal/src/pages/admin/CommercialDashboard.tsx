import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Crown, Pause, Sparkles, AlertTriangle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  trial: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  suspended: "bg-rose-100 text-rose-700",
  internal: "bg-slate-100 text-slate-700",
  beta: "bg-violet-100 text-violet-700",
};
const TYPE_COLOR: Record<string, string> = {
  internal: "bg-slate-100 text-slate-700",
  managed: "bg-blue-100 text-blue-700",
  white_label: "bg-violet-100 text-violet-700",
  reseller: "bg-fuchsia-100 text-fuchsia-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function CommercialDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["commercial-dashboard"], queryFn: () => apiFetch("/api/commercial/dashboard") });
  const seedPlans = useMutation({
    mutationFn: () => apiFetch("/api/commercial/plans/seed-defaults", { method: "POST" }),
    onSuccess: (r: any) => { toast({ title: "Plans seeded", description: `${r.created.length} plans created` }); qc.invalidateQueries({ queryKey: ["commercial-plans"] }); },
  });

  if (isLoading || !data) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commercial command center</h1>
          <p className="text-muted-foreground mt-1">Plan mix, account health, and white-label monetization.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => seedPlans.mutate()} disabled={seedPlans.isPending}>Seed default plans</Button>
          <Button asChild size="sm"><Link href="/admin/commercial/plans">Manage plans</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Building2} label="Accounts" value={data.totals.accounts} sub={`${data.totals.active} active`} color="primary" />
        <Kpi icon={Sparkles} label="Trial" value={data.totals.trialing} sub="prospect pipeline" color="blue" />
        <Kpi icon={Crown} label="White-label" value={data.totals.whiteLabel} sub="branded portals" color="violet" />
        <Kpi icon={Pause} label="Paused" value={data.totals.paused} sub="needs attention" color="amber" />
        <Kpi icon={AlertTriangle} label="Near limit" value={data.totals.nearLimit} sub="usage warnings" color="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DistCard title="Plan tier mix" mix={data.planMix} />
        <DistCard title="Status mix" mix={data.statusMix} />
        <DistCard title="Account type" mix={data.typeMix} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div><CardTitle>Commercial accounts</CardTitle><CardDescription>All accounts with plan, status, and partner rollup.</CardDescription></div>
            <Button asChild size="sm"><Link href="/admin/commercial/accounts/new"><Plus className="h-4 w-4 mr-1" /> New account</Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Account</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Plan</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">White-label</th>
                  <th className="px-2 py-2 text-right">Partners</th>
                  <th className="px-2 py-2 text-left">Manager</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.length === 0 ? (
                  <tr><td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">No commercial accounts yet — create one to start.</td></tr>
                ) : data.accounts.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2"><Link href={`/admin/commercial/accounts/${a.id}`} className="font-medium hover:underline">{a.name}</Link></td>
                    <td className="px-2 py-2"><Badge variant="outline" className={TYPE_COLOR[a.accountType]}>{a.accountType}</Badge></td>
                    <td className="px-2 py-2">{a.plan ? <span className="text-xs">{a.plan.name}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2"><Badge className={STATUS_COLOR[a.commercialStatus]}>{a.commercialStatus}</Badge></td>
                    <td className="px-2 py-2 text-xs">{a.whiteLabelLevel === "none" ? <span className="text-muted-foreground">—</span> : a.whiteLabelLevel}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{a.partnerCount}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{a.accountManager || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, color }: any) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary", blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600", emerald: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600", rose: "bg-rose-500/10 text-rose-600",
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${map[color]}`}><Icon className="h-4 w-4" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DistCard({ title, mix }: { title: string; mix: Record<string, number> }) {
  const entries = Object.entries(mix);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : entries.map(([k, v]) => (
          <div key={k} className="space-y-1">
            <div className="flex justify-between text-sm"><span className="capitalize text-muted-foreground">{k.replace(/_/g, " ")}</span><span className="font-medium tabular-nums">{v}</span></div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(v / total) * 100}%` }} /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
