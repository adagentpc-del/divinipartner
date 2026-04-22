import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, CheckCircle2, AlertTriangle, XCircle, Loader2, Send, ExternalLink, Globe, Server } from "lucide-react";
import { Link } from "wouter";

type Readiness = {
  system: {
    resendKeyConfigured: boolean;
    resendError: string | null;
    defaultFromAddress: string | null;
    publicUrl: { value: string; source: string; isCustomDomain: boolean };
  };
  summary: { ready: number; warning: number; incomplete: number };
  partners: Array<{
    partnerId: number; slug: string; name: string;
    emailEnabled: boolean;
    fromName: string | null;
    replyToEmail: string | null;
    internalForwardEmail: string | null;
    routingEmail: string | null;
    ccEmail: string | null;
    recipientCount: number;
    missing: string[];
    warnings: string[];
    status: "ready" | "warning" | "incomplete";
    ready: boolean;
  }>;
  recentFailures: Array<{
    id: number; partnerId: number | null; objectType: string | null; objectId: number | null;
    meta: any; createdAt: string;
  }>;
};

const STATUS_META: Record<Readiness["partners"][number]["status"], { label: string; cls: string; icon: any }> = {
  ready:      { label: "Ready",      cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  warning:    { label: "Warning",    cls: "bg-amber-100 text-amber-800 border-amber-200",       icon: AlertTriangle },
  incomplete: { label: "Incomplete", cls: "bg-red-100 text-red-800 border-red-200",             icon: XCircle },
};

export default function EmailReadinessPage() {
  const { data, isLoading, refetch } = useQuery<Readiness>({
    queryKey: ["/api/admin/email-readiness"],
    queryFn: () => apiFetch("/api/admin/email-readiness"),
  });

  const [testTarget, setTestTarget] = useState<{ partnerId: number; partnerName: string; kind: "customer" | "internal" } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sendTest = useMutation({
    mutationFn: (args: { partnerId: number; toEmail: string; kind: "customer" | "internal" }) => {
      const path = args.kind === "customer"
        ? "/api/admin/email-readiness/test/customer-confirmation"
        : "/api/admin/email-readiness/test/internal-routing";
      return apiFetch(path, { method: "POST", body: JSON.stringify({ partnerId: args.partnerId, toEmail: args.toEmail }) });
    },
    onSuccess: (r: any) => setTestResult({ ok: !!r.ok, message: r.ok ? `Sent to ${r.sentTo} (id ${r.providerId || "—"}, based on order #${r.basedOnOrderId})` : `Send failed: ${r.error || "unknown error"}` }),
    onError: (e: any) => setTestResult({ ok: false, message: e?.message || "Network error — see console." }),
    onSettled: () => refetch(),
  });

  if (isLoading || !data) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading email readiness…</div>;
  }

  const sys = data.system;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" /> Email Readiness</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify that branded customer emails will deliver from your custom domain, internal routing addresses are wired up, and recent sends haven't failed.
        </p>
      </div>

      {/* SYSTEM CONFIG */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4" /> System configuration</CardTitle>
          <CardDescription className="text-xs">Project-wide settings that apply to every outbound email.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <ReadinessRow ok={sys.resendKeyConfigured} label="Email provider (Resend) configured"
              detail={sys.resendKeyConfigured ? `Default sender: ${sys.defaultFromAddress || "noreply@resend.dev"}` : (sys.resendError || "RESEND_API_KEY not detected")} />
            <ReadinessRow ok={sys.publicUrl.source === "PUBLIC_APP_URL"} warn={sys.publicUrl.source !== "PUBLIC_APP_URL"}
              label="Canonical public domain"
              detail={
                <>
                  <span className="font-mono">{sys.publicUrl.value}</span>{" "}
                  <span className="text-xs text-muted-foreground">(source: {sys.publicUrl.source}{sys.publicUrl.isCustomDomain ? ", custom" : ""})</span>
                </>
              } />
            <ReadinessRow ok={sys.publicUrl.isCustomDomain} warn={!sys.publicUrl.isCustomDomain}
              label="Custom domain in use for branded links"
              detail={sys.publicUrl.isCustomDomain ? "Customer-facing links will use your custom domain." : "Using a fallback host — links in emails won't match a verified domain."} />
            <ReadinessRow ok={!!sys.defaultFromAddress && !sys.defaultFromAddress.endsWith("@resend.dev")}
              warn={!sys.defaultFromAddress || sys.defaultFromAddress.endsWith("@resend.dev")}
              label="Default From address on a verified domain"
              detail={sys.defaultFromAddress ? sys.defaultFromAddress : "No default sender resolved."} />
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Ready"      value={data.summary.ready}      tone="ok" />
        <SummaryTile label="Warning"    value={data.summary.warning}    tone="warn" />
        <SummaryTile label="Incomplete" value={data.summary.incomplete} tone="bad" />
      </div>

      {/* PER-PARTNER */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Per-partner configuration</CardTitle>
          <CardDescription className="text-xs">Each partner needs a from-name, reply-to, an internal forward address, and at least one routing recipient.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.partners.map(p => {
              const meta = STATUS_META[p.status];
              const Icon = meta.icon;
              return (
                <div key={p.partnerId} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/admin/partners/${p.partnerId}/edit`}>
                          <span className="font-medium text-sm hover:underline cursor-pointer">{p.name}</span>
                        </Link>
                        <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                        {!p.emailEnabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">email disabled</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
                        <span><span className="text-muted-foreground/70">From:</span> {p.fromName || <em>—</em>}</span>
                        <span><span className="text-muted-foreground/70">Reply-to:</span> {p.replyToEmail || <em>—</em>}</span>
                        <span><span className="text-muted-foreground/70">Internal:</span> {p.internalForwardEmail || p.routingEmail || <em>—</em>}</span>
                        <span><span className="text-muted-foreground/70">Recipients:</span> {p.recipientCount}</span>
                      </div>
                      {p.missing.length > 0 && (
                        <div className="text-xs text-red-700 mt-1">Missing: {p.missing.join("; ")}</div>
                      )}
                      {p.warnings.length > 0 && (
                        <div className="text-xs text-amber-700 mt-1">Warnings: {p.warnings.join("; ")}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "customer" }); setTestEmail(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Test customer email
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "internal" }); setTestEmail(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Test internal routing
                      </Button>
                      <Link href={`/admin/partners/${p.partnerId}/edit`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"><ExternalLink className="h-3 w-3 mr-1" /> Configure</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* RECENT FAILURES */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Recent send failures</CardTitle>
          <CardDescription className="text-xs">Most recent 25 entries from the email delivery log. If this list grows unexpectedly, it usually means a domain or recipient issue.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentFailures.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No failed sends recorded — clean.</div>
          ) : (
            <div className="space-y-1.5">
              {data.recentFailures.map(f => (
                <div key={f.id} className="text-xs border rounded p-2 bg-red-50/40 border-red-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{f.meta?.type || "email"}</span>
                    <span className="text-muted-foreground">→ {Array.isArray(f.meta?.to) ? f.meta.to.join(", ") : f.meta?.to || "?"}</span>
                    {f.objectType === "order" && f.objectId && (
                      <Link href={`/admin/orders/${f.objectId}`}><span className="text-blue-600 hover:underline">order #{f.objectId}</span></Link>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  {f.meta?.error && <div className="text-red-700 mt-0.5 font-mono text-[11px] break-all">{f.meta.error}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TEST DIALOG */}
      <Dialog open={!!testTarget} onOpenChange={(o) => { if (!o) { setTestTarget(null); setTestResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{testTarget?.kind === "customer" ? "Send test customer confirmation" : "Send test internal routing email"}</DialogTitle>
            <DialogDescription>
              Sends a real branded email for <strong>{testTarget?.partnerName}</strong> using the partner's most recent order as the template payload. The recipient is overridden to the address you enter — no real customer is contacted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Send to</Label>
            <Input type="email" placeholder="you@yourdomain.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
            {testResult && (
              <div className={`text-xs p-2 rounded border ${testResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {testResult.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTestTarget(null); setTestResult(null); }}>Close</Button>
            <Button disabled={!testEmail.includes("@") || sendTest.isPending}
              onClick={() => testTarget && sendTest.mutate({ partnerId: testTarget.partnerId, toEmail: testEmail, kind: testTarget.kind })}>
              {sendTest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />} Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReadinessRow({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-start gap-2 p-2 border rounded">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-red-200 bg-red-50 text-red-800";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs uppercase tracking-wide font-semibold opacity-70">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-xs mt-1 opacity-70">{label === "Ready" ? "partners fully configured" : label === "Warning" ? "partners with non-blocking issues" : "partners missing critical config"}</div>
    </div>
  );
}
