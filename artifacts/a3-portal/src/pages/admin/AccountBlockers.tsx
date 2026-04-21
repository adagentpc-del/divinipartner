import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertOctagon, AlertTriangle, ChevronRight, Info, ArrowLeft, Printer } from "lucide-react";
import { BlockerBadge } from "@/components/admin/BlockerBadge";

type BlockersResp = {
  account: any;
  partners: any[];
  blockers: Array<{ key: string; label: string; severity: string; why: string; link?: string }>;
  warnings: Array<{ key: string; label: string; severity: string; why: string; link?: string }>;
  readinessScore: number;
  goLiveReady: boolean;
};

export default function AccountBlockers() {
  const [, params] = useRoute<{ accountId: string }>("/admin/rollout/account/:accountId");
  const accountId = params?.accountId;
  const { data, isLoading, isError, error, refetch } = useQuery<BlockersResp>({
    queryKey: ["account-blockers", accountId],
    queryFn: () => apiFetch(`/api/rollout/account/${accountId}/blockers`),
    enabled: !!accountId,
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !data) return (
    <div className="p-8 text-sm">
      <p className="text-red-500 mb-2">Could not load blocker intelligence for this account.</p>
      <p className="text-muted-foreground mb-3">{(error as Error)?.message ?? "Unknown error"}</p>
      <button onClick={() => refetch()} className="text-xs underline">Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/admin/rollout">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Stabilization</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print activation brief
        </Button>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.account.name}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex gap-3">
            <span>{data.account.accountType}</span>
            <span>·</span>
            <span>activation: {data.account.activationStatus}</span>
            <span>·</span>
            <span>{data.partners.length} partner{data.partners.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <BlockerBadge score={data.readinessScore} goLiveReady={data.goLiveReady} blockerCount={data.blockers.length} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Readiness score</span><span>{data.readinessScore}%</span>
          </div>
          <Progress value={data.readinessScore} />
          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div><span className="text-muted-foreground">Blockers:</span> <strong>{data.blockers.length}</strong></div>
            <div><span className="text-muted-foreground">Warnings:</span> <strong>{data.warnings.length}</strong></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-600">
            <AlertOctagon className="h-4 w-4" /> Blockers ({data.blockers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {data.blockers.length === 0 && <p className="p-6 text-sm text-muted-foreground">No blockers — this account can go live.</p>}
          {data.blockers.map(b => (
            <BlockerRow key={b.key} item={b} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" /> Warnings ({data.warnings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {data.warnings.length === 0 && <p className="p-6 text-sm text-muted-foreground">No warnings.</p>}
          {data.warnings.map(b => (
            <BlockerRow key={b.key} item={b} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activation brief</CardTitle>
          <p className="text-xs text-muted-foreground">Printable summary for handoff or rollout review.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <BriefField label="Account type" value={data.account.accountType} />
            <BriefField label="White-label level" value={data.account.whiteLabelLevel ?? "—"} />
            <BriefField label="Activation status" value={data.account.activationStatus} />
            <BriefField label="Plan" value={data.account.planId ? `Plan #${data.account.planId}` : "Not set"} />
            <BriefField label="Account manager" value={data.account.accountManager ?? "Unassigned"} />
            <BriefField label="Billing entity" value={data.account.billingEntityName ?? "Not set"} />
            <BriefField label="Billing contact" value={data.account.billingContactEmail ?? "Not set"} />
            <BriefField label="Linked partners" value={`${data.partners.length}`} />
            <BriefField label="Readiness score" value={`${data.readinessScore}%`} />
          </div>
          <div className="mt-4 pt-4 border-t text-sm">
            <strong>Go-live recommendation: </strong>
            {data.goLiveReady ? (
              <span className="text-emerald-600">Ready to launch — no blockers detected.</span>
            ) : (
              <span className="text-red-600">
                Hold launch — resolve {data.blockers.length} blocker{data.blockers.length === 1 ? "" : "s"} first.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {data.partners.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Linked partners</CardTitle></CardHeader>
          <CardContent className="p-0 divide-y">
            {data.partners.map(p => (
              <div key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <Link href={`/admin/partners/${p.id}/edit`}><span className="font-medium hover:underline cursor-pointer">{p.name}</span></Link>
                  <div className="text-xs text-muted-foreground mt-1">{p.partnerType} · status: {p.launchStatus ?? "—"}</div>
                </div>
                <Badge variant="outline">{p.slug}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium capitalize mt-0.5 truncate">{value}</div>
    </div>
  );
}

function BlockerRow({ item }: { item: { key: string; label: string; severity: string; why: string; link?: string } }) {
  const isCrit = item.severity === "critical" || item.severity === "high";
  const isMed = item.severity === "medium";
  const Icon = isCrit ? AlertOctagon : isMed ? AlertTriangle : Info;
  const tone = isCrit ? "text-red-500" : isMed ? "text-amber-500" : "text-muted-foreground";
  return (
    <div className="p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0 flex gap-3">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
        <div>
          <div className="font-medium text-sm">{item.label}</div>
          <p className="text-sm text-muted-foreground mt-1">{item.why}</p>
        </div>
      </div>
      {item.link && (
        <Link href={item.link}>
          <Button variant="ghost" size="sm">Fix <ChevronRight className="h-4 w-4 ml-1" /></Button>
        </Link>
      )}
    </div>
  );
}
