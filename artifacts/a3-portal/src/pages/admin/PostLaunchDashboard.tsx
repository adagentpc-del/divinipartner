import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PartnerHealthBadge } from "@/components/admin/PartnerHealthBadge";
import { Loader2, Rocket, Clock, AlertTriangle, MessageSquare, TrendingUp, Activity } from "lucide-react";

const HEALTH_ORDER = ["healthy", "active", "live_fragile", "onboarding", "at_risk", "not_started"];

export default function PostLaunchDashboard() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["post-launch"], queryFn: () => apiFetch("/api/post-launch/dashboard") });
  if (isLoading || !data) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Post-launch success</h1>
        <p className="text-muted-foreground mt-1">What needs attention next.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Rocket} label="Launched partners" value={data.partners.launched} sub={`${data.partners.total} total · ${data.partners.draft} draft`} color="emerald" />
        <Kpi icon={TrendingUp} label="With first order" value={data.partners.partnersWithFirstOrder} sub={`${data.partners.liveButInactive} live but inactive`} color="blue" />
        <Kpi icon={Clock} label="Avg time to launch" value={data.metrics.avgTimeToLaunchDays != null ? `${data.metrics.avgTimeToLaunchDays}d` : "—"} sub={data.metrics.avgTimeToFirstOrderDays != null ? `${data.metrics.avgTimeToFirstOrderDays}d to first order` : "no first orders yet"} color="violet" />
        <Kpi icon={MessageSquare} label="Open feedback" value={data.feedback.open} sub={`${data.feedback.byCategory.length} categories`} color="amber" href="/admin/feedback" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Partner health distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {HEALTH_ORDER.map(s => (
              <div key={s} className="flex items-center justify-between">
                <PartnerHealthBadge status={s} />
                <span className="text-sm font-medium tabular-nums">{data.healthDistribution[s] || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Activity (last 7 days)</CardTitle></CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.recentActivity.map((r: any) => (
                  <li key={r.eventType} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">{r.eventType}</span>
                    <span className="font-medium tabular-nums">{r.c}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Feedback by category</CardTitle></CardHeader>
          <CardContent>
            {data.feedback.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.feedback.byCategory.map((r: any) => (
                  <li key={r.category} className="flex justify-between"><span className="text-muted-foreground">{r.category}</span><span className="font-medium tabular-nums">{r.c}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partner health</CardTitle>
          <CardDescription>Click a partner to drill into their setup, orders, and workflow tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Partner</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Score</th>
                  <th className="px-2 py-2 text-right">Setup</th>
                  <th className="px-2 py-2 text-right">Open tasks</th>
                  <th className="px-2 py-2 text-right">Alerts</th>
                  <th className="px-2 py-2 text-right">First order</th>
                </tr>
              </thead>
              <tbody>
                {[...data.health].sort((a: any, b: any) => a.score - b.score).map((h: any) => (
                  <tr key={h.partnerId} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2"><Link href={`/admin/partners/${h.partnerId}/edit`} className="font-medium hover:underline">{h.companyName}</Link></td>
                    <td className="px-2 py-2"><PartnerHealthBadge status={h.status} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.score}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.metrics.readinessPct}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.metrics.openTasks}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.metrics.unresolvedAlerts}</td>
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">{h.metrics.timeToFirstOrderDays != null ? `${h.metrics.timeToFirstOrderDays}d` : h.metrics.firstOrderAt ? "✓" : "—"}</td>
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

function Kpi({ icon: Icon, label, value, sub, color, href }: any) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  const card = (
    <Card className="hover:shadow-md transition">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.primary}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
