import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Crown, FileText, Rocket, Sparkles, Eye, Building2, ChevronRight,
  Briefcase, PlayCircle, ArrowRight,
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  lead: "bg-slate-100 text-slate-700",
  proposal_prepared: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  approved: "bg-emerald-100 text-emerald-700",
  activating: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
};

const PROPOSAL_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  in_review: "bg-purple-100 text-purple-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

function fmtStatus(s: string) { return s.replace(/_/g, " "); }

export default function SalesCommandCenter() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-dashboard"],
    queryFn: async () => {
      const res = await apiFetch(apiUrl("/api/sales/dashboard"));
      if (!res.ok) throw new Error("dashboard failed");
      return res.json();
    },
  });

  const { data: showcase } = useQuery({
    queryKey: ["sales-showcase"],
    queryFn: async () => {
      const res = await apiFetch(apiUrl("/api/sales/showcase"));
      if (!res.ok) throw new Error("showcase failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">No data.</div>;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-4 w-4" /> Sales & demo enablement
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Sales Command Center</h1>
          <p className="text-muted-foreground mt-1">Pipeline, proposals, activation, and demo-ready accounts.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/sales/proposals/new">
            <Button><FileText className="h-4 w-4 mr-2" /> New proposal</Button>
          </Link>
          <Link href="/admin/sales/showcase">
            <Button variant="outline"><PlayCircle className="h-4 w-4 mr-2" /> Showcase</Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Accounts" value={t.accounts} icon={Crown} />
        <Kpi label="Active" value={t.activeAccounts} icon={Rocket} accent="text-green-600" />
        <Kpi label="Proposals" value={t.proposals} icon={FileText} />
        <Kpi label="Demo-ready" value={t.demoReady} icon={Sparkles} accent="text-amber-600" />
        <Kpi label="WL prospects" value={t.whiteLabelProspects} icon={Eye} accent="text-purple-600" />
        <Kpi label="Enterprise pros." value={t.enterpriseProspects} icon={Building2} accent="text-blue-600" />
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Activation pipeline</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="demos">Demo-ready</TabsTrigger>
          <TabsTrigger value="showcase">Showcase</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Accounts in pipeline</h3>
              <span className="text-xs text-muted-foreground">{data.activationQueue.length} accounts</span>
            </div>
            {data.activationQueue.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">All accounts active. Pipeline is empty.</div>
            ) : (
              <div className="divide-y">
                {data.activationQueue.map((a: any) => (
                  <Link key={a.id} href={`/admin/sales/activation/${a.id}`}>
                    <div className="p-4 hover:bg-muted/50 transition-colors flex items-center gap-4 cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground capitalize mt-0.5">
                          {a.accountType.replace(/_/g, " ")} · {a.whiteLabelLevel !== "none" ? `${a.whiteLabelLevel} white-label` : "standard"}
                        </div>
                      </div>
                      <Badge className={STATUS_BADGE[a.activationStatus] ?? "bg-slate-100"}>{fmtStatus(a.activationStatus)}</Badge>
                      {a.demoReady && <Badge variant="outline" className="text-amber-600 border-amber-300">Demo-ready</Badge>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="proposals">
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Recent proposals</h3>
              <Link href="/admin/sales/proposals/new"><Button size="sm" variant="outline">New</Button></Link>
            </div>
            {data.recentProposals.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No proposals yet. Create one to start packaging deals.</div>
            ) : (
              <div className="divide-y">
                {data.recentProposals.map((p: any) => (
                  <Link key={p.id} href={`/admin/sales/proposals/${p.id}`}>
                    <div className="p-4 hover:bg-muted/50 cursor-pointer flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {p.prospectName ?? "Internal"} · {(p.comparedPlanIds ?? []).length} plans compared
                        </div>
                      </div>
                      <Badge className={PROPOSAL_BADGE[p.status] ?? "bg-slate-100"}>{fmtStatus(p.status)}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="demos">
          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">Demo-ready accounts</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Polished, ready to walk through with a prospect.</p>
            </div>
            {data.demoReadyAccounts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                Mark accounts as <span className="font-medium">Demo-ready</span> from their detail page to surface them here.
              </div>
            ) : (
              <div className="divide-y">
                {data.demoReadyAccounts.map((a: any) => (
                  <div key={a.id} className="p-4 flex items-center gap-4">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">{a.accountType.replace(/_/g, " ")}</div>
                    </div>
                    <Link href={`/partner/${a.slug}`}><Button size="sm" variant="outline">Preview <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
                    <Link href={`/admin/commercial/accounts/${a.id}`}><Button size="sm" variant="ghost">Settings</Button></Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="showcase">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showcase?.presets ?? []).map((s: any) => (
              <Card key={s.key} className="p-5 flex flex-col gap-3">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.audience}</div>
                  <h3 className="font-semibold text-lg mt-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                </div>
                <div className="mt-auto pt-2">
                  <Link href={s.targetPath}>
                    <Button variant="outline" size="sm" className="w-full">
                      Open preview <ArrowRight className="h-3 w-3 ml-2" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </Card>
  );
}
