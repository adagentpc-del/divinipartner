import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Lock, Globe, Upload, Activity, Bug, RefreshCw, Loader2,
} from "lucide-react";

type SecretReport = {
  key: string;
  requirement: "required" | "recommended" | "optional" | "unused";
  status: "ok" | "missing" | "weak" | "unused";
  present: boolean;
  purpose: string;
  notes?: string;
  lengthHint?: string;
};

type Readiness = {
  generatedAt: string;
  environment: string;
  secrets: SecretReport[];
  summary: {
    missingRequired: string[];
    missingRecommended: string[];
    weakSecrets: string[];
    okCount: number;
    totalTracked: number;
  };
  network: { corsAllowedOrigins: string[]; canonicalRedirectActive: boolean; helmetEnabled: boolean };
  auth: { adminAllowlistEnforced: boolean; adminAllowlistCount: number; posture: string };
  uploads: {
    maxUploadBytes: number;
    allowedContentTypePrefixes: string[];
    importerMaxBytes: number;
    importerAllowedExtensions: string[];
    defaultObjectAcl: string;
    filenameSanitization: string;
  };
  rateLimits: Record<string, string>;
  errors: { productionSanitization: boolean; detail: string };
};

const STATUS_BADGE: Record<SecretReport["status"], { label: string; cls: string }> = {
  ok:      { label: "OK",      cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  missing: { label: "Missing", cls: "bg-red-100 text-red-800 border-red-200" },
  weak:    { label: "Weak",    cls: "bg-amber-100 text-amber-800 border-amber-200" },
  unused:  { label: "Unused",  cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

const REQ_BADGE: Record<SecretReport["requirement"], string> = {
  required:    "bg-red-50 text-red-700 border-red-200",
  recommended: "bg-amber-50 text-amber-700 border-amber-200",
  optional:    "bg-slate-50 text-slate-700 border-slate-200",
  unused:      "bg-slate-50 text-slate-500 border-slate-200",
};

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export default function SecurityReadinessPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Readiness>({
    queryKey: ["/api/security/readiness"],
    queryFn: () => apiFetch("/api/security/readiness"),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading security readiness…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-8">
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" /> Failed to load security readiness
            </CardTitle>
            <CardDescription>{(error as Error)?.message || "Unknown error"}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const overallOk =
    data.summary.missingRequired.length === 0 &&
    data.summary.weakSecrets.length === 0 &&
    data.auth.adminAllowlistEnforced;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {overallOk
              ? <ShieldCheck className="w-6 h-6 text-emerald-600" />
              : <ShieldAlert className="w-6 h-6 text-amber-600" />}
            Security Readiness
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live snapshot of secrets, network policy, upload limits, rate limits, and error handling for{" "}
            <span className="font-mono">{data.environment}</span>. Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat label="Required missing" value={data.summary.missingRequired.length} bad={data.summary.missingRequired.length > 0} />
        <SummaryStat label="Recommended missing" value={data.summary.missingRecommended.length} warn={data.summary.missingRecommended.length > 0} />
        <SummaryStat label="Weak secrets" value={data.summary.weakSecrets.length} warn={data.summary.weakSecrets.length > 0} />
        <SummaryStat label="Configured OK" value={`${data.summary.okCount}/${data.summary.totalTracked}`} />
      </div>

      {/* Admin auth posture */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Admin route protection</CardTitle>
          <CardDescription>How the API decides who counts as an admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {data.auth.adminAllowlistEnforced
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              : <AlertTriangle className="w-4 h-4 text-amber-600" />}
            <span>{data.auth.posture}</span>
          </div>
          {data.auth.adminAllowlistEnforced && (
            <div className="text-muted-foreground">{data.auth.adminAllowlistCount} email(s) on the allowlist.</div>
          )}
        </CardContent>
      </Card>

      {/* Secrets */}
      <Card>
        <CardHeader>
          <CardTitle>Secrets inventory</CardTitle>
          <CardDescription>Values are never read or returned — only presence and length bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y">
            {data.secrets.map((s) => {
              const sb = STATUS_BADGE[s.status];
              return (
                <div key={s.key} className="p-3 flex items-start gap-3">
                  <div className="flex flex-col gap-1 min-w-[260px]">
                    <code className="text-xs font-semibold">{s.key}</code>
                    <div className="flex gap-1">
                      <Badge variant="outline" className={REQ_BADGE[s.requirement]}>{s.requirement}</Badge>
                      <Badge variant="outline" className={sb.cls}>{sb.label}</Badge>
                      {s.lengthHint && <Badge variant="outline" className="bg-slate-50 text-slate-600">{s.lengthHint}</Badge>}
                    </div>
                  </div>
                  <div className="flex-1 text-sm">
                    <div>{s.purpose}</div>
                    {s.notes && <div className="text-muted-foreground italic mt-1">{s.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Network */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> Network & headers</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <KV k="CORS allowed origins">
            {data.network.corsAllowedOrigins.length === 0
              ? <span className="text-amber-700">None configured — API accepts any origin (bootstrap mode).</span>
              : <ul className="list-disc ml-5">{data.network.corsAllowedOrigins.map((o) => <li key={o}><code className="text-xs">{o}</code></li>)}</ul>}
          </KV>
          <KV k="Canonical-host redirect">{data.network.canonicalRedirectActive ? "Active" : "Disabled (non-prod)"}</KV>
          <KV k="Security headers (helmet)">{data.network.helmetEnabled ? "Enabled" : "Disabled"}</KV>
        </CardContent>
      </Card>

      {/* Uploads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Upload restrictions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <KV k="Object storage signed-URL max">{formatBytes(data.uploads.maxUploadBytes)}</KV>
          <KV k="Object storage allowed types">{data.uploads.allowedContentTypePrefixes.join(", ")}</KV>
          <KV k="Importer max">{formatBytes(data.uploads.importerMaxBytes)}</KV>
          <KV k="Importer allowed extensions">{data.uploads.importerAllowedExtensions.join(", ")}</KV>
          <KV k="Default ACL">{data.uploads.defaultObjectAcl}</KV>
          <KV k="Filename sanitization">{data.uploads.filenameSanitization}</KV>
        </CardContent>
      </Card>

      {/* Rate limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" /> Rate limits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1">
            {Object.entries(data.rateLimits).map(([k, v]) => (
              <li key={k}><span className="font-mono text-xs mr-2">{k}</span> <span className="text-muted-foreground">{v}</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bug className="w-5 h-5" /> Error handling</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <KV k="Production sanitization">{data.errors.productionSanitization ? "Enabled" : "Disabled (dev mode)"}</KV>
          <p className="text-muted-foreground">{data.errors.detail}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, bad, warn }: { label: string; value: number | string; bad?: boolean; warn?: boolean }) {
  const tone = bad ? "border-red-200 bg-red-50 text-red-700"
    : warn ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`border rounded-md p-3 ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-2">
      <div className="text-muted-foreground">{k}</div>
      <div>{children}</div>
    </div>
  );
}
