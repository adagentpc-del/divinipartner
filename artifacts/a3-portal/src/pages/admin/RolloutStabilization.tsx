import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, AlertOctagon, AlertTriangle, Clock, PauseCircle, Users, ChevronRight } from "lucide-react";
import { BuyerHelpDrawer } from "@/components/admin/BuyerHelpDrawer";

type Dashboard = {
  totals: { accounts: number; active: number; inActivation: number; stalled: number; paused: number; flagged: number; openFollowups: number };
  inActivation: any[];
  stalled: any[];
  flaggedAccounts: Array<{ id: number; name: string; activationStatus: string; reasons: string[] }>;
  recentFollowups: any[];
};

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-slate-100 text-slate-700",
  proposal_prepared: "bg-blue-100 text-blue-700",
  in_review: "bg-indigo-100 text-indigo-700",
  approved: "bg-violet-100 text-violet-700",
  activating: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-orange-100 text-orange-700",
  suspended: "bg-red-100 text-red-700",
};

export default function RolloutStabilization() {
  const { data, isLoading, isError, error, refetch } = useQuery<Dashboard>({
    queryKey: ["rollout-stabilization"],
    queryFn: () => apiFetch("/api/rollout/stabilization"),
  });
  const [tab, setTab] = useState("flagged");

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading rollout status…</div>;
  if (isError || !data) return (
    <div className="p-8 text-sm">
      <p className="text-red-500 mb-2">Could not load rollout dashboard.</p>
      <p className="text-muted-foreground mb-3">{(error as Error)?.message ?? "Unknown error"}</p>
      <button onClick={() => refetch()} className="text-xs underline">Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rollout Stabilization</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What's blocking go-live, who's stalled, and where to focus rollout attention.
          </p>
        </div>
        <BuyerHelpDrawer audience="internal" triggerLabel="Rollout help" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {[
          { label: "Accounts", value: data.totals.accounts, icon: Users, tone: "default" },
          { label: "Active", value: data.totals.active, icon: Activity, tone: "good" },
          { label: "Activating", value: data.totals.inActivation, icon: Clock, tone: "warn" },
          { label: "Stalled", value: data.totals.stalled, icon: AlertTriangle, tone: "warn" },
          { label: "Paused/Suspended", value: data.totals.paused, icon: PauseCircle, tone: "warn" },
          { label: "Flagged", value: data.totals.flagged, icon: AlertOctagon, tone: "bad" },
          { label: "Open follow-ups", value: data.totals.openFollowups, icon: Clock, tone: "default" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <k.icon className={`h-4 w-4 ${k.tone === "bad" ? "text-red-500" : k.tone === "warn" ? "text-amber-500" : k.tone === "good" ? "text-emerald-500" : "text-muted-foreground"}`} />
              </div>
              <div className="text-2xl font-semibold mt-1">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="flagged">Flagged ({data.flaggedAccounts.length})</TabsTrigger>
          <TabsTrigger value="activating">Activating ({data.inActivation.length})</TabsTrigger>
          <TabsTrigger value="stalled">Stalled ({data.stalled.length})</TabsTrigger>
          <TabsTrigger value="followups">Recent follow-ups</TabsTrigger>
        </TabsList>

        <TabsContent value="flagged">
          <Card>
            <CardHeader><CardTitle className="text-base">Accounts with rollout flags</CardTitle></CardHeader>
            <CardContent>
              {data.flaggedAccounts.length === 0 && <p className="text-sm text-muted-foreground">No accounts flagged. Nice.</p>}
              <div className="divide-y">
                {data.flaggedAccounts.map(a => (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/rollout/account/${a.id}`}>
                          <span className="font-medium hover:underline cursor-pointer">{a.name}</span>
                        </Link>
                        <Badge className={STATUS_COLORS[a.activationStatus] || ""}>{a.activationStatus}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{a.reasons.join(" · ")}</p>
                    </div>
                    <Link href={`/admin/rollout/account/${a.id}`}>
                      <Button variant="ghost" size="sm">Open <ChevronRight className="h-4 w-4 ml-1" /></Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activating">
          <AccountList rows={data.inActivation} />
        </TabsContent>
        <TabsContent value="stalled">
          <AccountList rows={data.stalled} />
        </TabsContent>

        <TabsContent value="followups">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent demo follow-ups</CardTitle></CardHeader>
            <CardContent>
              {data.recentFollowups.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups logged yet.</p>}
              <div className="divide-y">
                {data.recentFollowups.map((f: any) => (
                  <div key={f.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/sales/followups`}>
                        <span className="font-medium hover:underline cursor-pointer">{f.prospectName ?? "Prospect"}</span>
                      </Link>
                      <Badge variant="outline" className="capitalize">{f.status?.replace(/_/g, " ")}</Badge>
                      {f.outcome && <span className="text-xs text-muted-foreground">· {f.outcome}</span>}
                    </div>
                    {f.nextStep && <p className="text-sm mt-1">{f.nextStep}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountList({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No accounts in this state.</CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {rows.map(a => (
          <div key={a.id} className="p-4 flex items-center justify-between">
            <div>
              <Link href={`/admin/rollout/account/${a.id}`}>
                <span className="font-medium hover:underline cursor-pointer">{a.name}</span>
              </Link>
              <div className="text-xs text-muted-foreground mt-1">
                {a.accountType} · plan {a.planId ?? "—"} · {a.demoReady ? "demo-ready" : "not demo-ready"}
              </div>
            </div>
            <Badge className={STATUS_COLORS[a.activationStatus] || ""}>{a.activationStatus}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
