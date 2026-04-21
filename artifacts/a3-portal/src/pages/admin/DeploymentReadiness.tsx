import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Readiness = {
  env: Array<{ name: string; set: boolean }>;
  integrations: Array<{ key: string; label: string; ok: boolean; why: string }>;
  counts: Record<string, number>;
  checklist: Array<{ ok: boolean; label: string }>;
  readyToDeploy: boolean;
};

function StatusIcon({ ok }: { ok: boolean | undefined }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  );
}

export default function DeploymentReadiness() {
  const { data, isLoading, isError, error, refetch } = useQuery<Readiness>({
    queryKey: ["deployment-readiness"],
    queryFn: () => apiFetch("/api/deployment/readiness"),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading deployment readiness…</div>;
  if (isError || !data) return (
    <div className="p-8 text-sm">
      <p className="text-red-500 mb-2">Could not load readiness check.</p>
      <p className="text-muted-foreground mb-3">{(error as Error)?.message ?? "Unknown error"}</p>
      <button onClick={() => refetch()} className="text-xs underline">Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Deployment Readiness</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pre-flight check for environment, integrations, and operational data. Use this before publishing a new build.
          </p>
        </div>
        <Badge
          variant={data.readyToDeploy ? "default" : "secondary"}
          className={data.readyToDeploy ? "bg-emerald-600 hover:bg-emerald-600" : "bg-amber-100 text-amber-900"}
        >
          {data.readyToDeploy ? "Ready" : "Action needed"}
        </Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pre-deploy checklist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <StatusIcon ok={item.ok} />
              <span className={item.ok ? "" : "text-muted-foreground"}>{item.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Integrations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.integrations.map(i => (
              <div key={i.key} className="flex items-start gap-3">
                <StatusIcon ok={i.ok} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{i.label}</div>
                  <div className="text-xs text-muted-foreground">{i.why}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Environment variables</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.env.map(e => (
              <div key={e.name} className="flex items-center gap-3 text-sm">
                <StatusIcon ok={e.set} />
                <span className="font-mono text-xs">{e.name}</span>
                {!e.set && <span className="text-xs text-muted-foreground ml-auto">not set</span>}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2 border-t mt-3">
              Values are never displayed — only presence is checked.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Data summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(data.counts).map(([k, v]) => (
              <div key={k}>
                <div className="text-2xl font-semibold">{v}</div>
                <div className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</div>
              </div>
            ))}
          </div>
          {data.counts.demoAccounts > 0 && data.counts.liveAccounts === 0 && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-amber-50 text-amber-900 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Only demo accounts are present. Deploying now will go live with sample data only.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
