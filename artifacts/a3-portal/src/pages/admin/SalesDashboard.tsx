import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, LayoutDashboard, TrendingUp, Trophy, XCircle, Layers, DollarSign,
  CalendarClock, Wrench, Download, Users,
} from "lucide-react";

type Dashboard = {
  role: string;
  totals: {
    total: number; won: number; lost: number; open: number; unassigned: number;
    revenueWon: number; openPipelineValue: number;
  };
  byRep:
    | { repId: number; repName: string; total: number; won: number; lost: number; open: number; revenue: number }[]
    | null;
  lostReasons: Record<string, number>;
  upcomingInstalls: { id: number; companyName: string; installDate: string | null; stage: string }[];
  quoteDeadlines: { id: number; companyName: string; quoteNeededBy: string | null; stage: string }[];
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const fmtDate = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <div className="text-2xl font-bold mt-1.5">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function SalesDashboard() {
  const { data, isLoading, isError, refetch } = useQuery<Dashboard>({
    queryKey: ["/api/sales/dashboard"],
    queryFn: () => apiFetch("/api/sales/dashboard"),
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError || !data) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load dashboard. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  const isSuperAdmin = data.role === "super_admin";
  const t = data.totals;
  const winRate = t.won + t.lost > 0 ? Math.round((t.won / (t.won + t.lost)) * 100) : 0;
  const lostEntries = Object.entries(data.lostReasons).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutDashboard className="h-6 w-6" />{isSuperAdmin ? "Sales Dashboard" : "My Dashboard"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{isSuperAdmin ? "Pipeline health across the whole team." : "Your pipeline at a glance."}</p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <a href={apiUrl("/api/sales/opportunities/export.csv")}><Download className="h-4 w-4" />Export CSV</a>
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat icon={Layers} label="Total Opportunities" value={String(t.total)} sub={`${t.unassigned} unassigned`} />
        <Stat icon={TrendingUp} label="Open Pipeline" value={String(t.open)} sub={money(t.openPipelineValue)} />
        <Stat icon={Trophy} label="Won Deals" value={String(t.won)} sub={`${winRate}% win rate`} />
        <Stat icon={XCircle} label="Lost Deals" value={String(t.lost)} />
        <Stat icon={DollarSign} label="Won Revenue" value={money(t.revenueWon)} />
      </div>

      {isSuperAdmin && data.byRep && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />By Rep</CardTitle></CardHeader>
          <CardContent>
            {data.byRep.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No assigned opportunities yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">Rep</th>
                      <th className="py-2 px-4 font-medium text-right">Total</th>
                      <th className="py-2 px-4 font-medium text-right">Open</th>
                      <th className="py-2 px-4 font-medium text-right">Won</th>
                      <th className="py-2 px-4 font-medium text-right">Lost</th>
                      <th className="py-2 pl-4 font-medium text-right">Won Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRep.map((r) => (
                      <tr key={r.repId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{r.repName}</td>
                        <td className="py-2 px-4 text-right">{r.total}</td>
                        <td className="py-2 px-4 text-right">{r.open}</td>
                        <td className="py-2 px-4 text-right text-emerald-600">{r.won}</td>
                        <td className="py-2 px-4 text-right text-muted-foreground">{r.lost}</td>
                        <td className="py-2 pl-4 text-right font-medium">{money(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />{isSuperAdmin ? "Quote Deadlines" : "My Quote Deadlines"}</CardTitle></CardHeader>
          <CardContent>
            {data.quoteDeadlines.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No upcoming quote deadlines.</div>
            ) : (
              <ul className="space-y-2">
                {data.quoteDeadlines.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{o.companyName}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{label(o.stage)}</Badge>
                      <span className="text-muted-foreground text-xs">{fmtDate(o.quoteNeededBy)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />{isSuperAdmin ? "Upcoming Installs" : "My Install Dates"}</CardTitle></CardHeader>
          <CardContent>
            {data.upcomingInstalls.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No upcoming installs.</div>
            ) : (
              <ul className="space-y-2">
                {data.upcomingInstalls.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{o.companyName}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{label(o.stage)}</Badge>
                      <span className="text-muted-foreground text-xs">{fmtDate(o.installDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {lostEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><XCircle className="h-4 w-4" />Lost Reasons</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lostEntries.map(([reason, count]) => (
                <Badge key={reason} variant="outline" className="text-xs">{label(reason)}: {count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
