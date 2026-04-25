import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowRight, ShieldAlert, ListChecks,
} from "lucide-react";

type Status = "pass" | "warn" | "fail";

interface Check {
  id: string;
  label: string;
  status: Status;
  detail: string;
  actionUrl?: string;
  actionLabel?: string;
}

interface Blocker {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  workaround: string;
}

interface Readiness {
  overall: Status;
  summary: { pass: number; warn: number; fail: number };
  checks: Check[];
  blockers: Blocker[];
  manualVerification: string[];
  generatedAt: string;
}

function StatusIcon({ s }: { s: Status }) {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
  return <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />;
}

function OverallBadge({ s }: { s: Status }) {
  if (s === "pass") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Live-ready</Badge>;
  if (s === "warn") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Action recommended</Badge>;
  return <Badge variant="destructive">Action required</Badge>;
}

function SeverityBadge({ s }: { s: Blocker["severity"] }) {
  if (s === "high") return <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">High</Badge>;
  if (s === "medium") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 text-[10px] uppercase tracking-wider">Medium</Badge>;
  return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Low</Badge>;
}

export default function LiveReadiness() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Readiness>({
    queryKey: ["live-readiness"],
    queryFn: () => apiFetch("/api/admin/live-readiness"),
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Probing live system…</div>;
  if (isError || !data) return (
    <div className="p-8 text-sm">
      <p className="text-red-600 mb-2">Could not load live readiness probe.</p>
      <p className="text-muted-foreground mb-3">{(error as Error)?.message ?? "Unknown error"}</p>
      <Button onClick={() => refetch()} variant="outline" size="sm">Retry</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Live Readiness</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Probes the live system for the workflows that matter operationally — partner save,
            preview link, order submission, email send, file upload. Uses recent activity in
            <code className="mx-1 text-xs bg-muted px-1 py-0.5 rounded">usage_events</code>
            as the truth of "is this actually working in production?" — no test sends, no AI
            calls, no egress charges.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Generated {new Date(data.generatedAt).toLocaleString()} ·
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="ml-1 underline hover:text-foreground inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Re-run
            </button>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OverallBadge s={data.overall} />
          <div className="text-xs text-muted-foreground">
            {data.summary.pass} pass · {data.summary.warn} warn · {data.summary.fail} fail
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Live probes
          </CardTitle>
          <CardDescription>
            Each probe answers a single yes/no operational question. Failures need
            attention before broader rollout; warnings are worth investigating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border">
              <StatusIcon s={c.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{c.label}</div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase tracking-wider ${
                      c.status === "pass" ? "border-emerald-300 text-emerald-700"
                      : c.status === "warn" ? "border-amber-300 text-amber-800"
                      : "border-red-300 text-red-700"
                    }`}
                  >
                    {c.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{c.detail}</div>
                {c.actionUrl && (
                  <div className="mt-2">
                    <Link href={c.actionUrl}>
                      <Button variant="outline" size="sm" className="text-xs h-7">
                        {c.actionLabel || "Open"} <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.blockers.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700" /> Known blockers
            </CardTitle>
            <CardDescription>
              Items that aren't full outages but should be reviewed before broader rollout.
              Each entry includes the workaround the team has decided on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.blockers.map((b) => (
              <div key={b.id} className="p-3 rounded-lg border bg-amber-50/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium">{b.title}</div>
                  <SeverityBadge s={b.severity} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{b.detail}</div>
                <div className="text-xs mt-2 p-2 rounded bg-background border">
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Workaround / fix path:</span>{" "}
                  <span>{b.workaround}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual verification before broader rollout</CardTitle>
          <CardDescription>
            Workflow-level smoke tests no automated probe can substitute for. Walk through
            these end-to-end with a real partner before the next public push.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {data.manualVerification.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs mt-1 font-mono">{i + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
