import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, CheckCircle2, AlertTriangle, XCircle, Loader2, Send, ExternalLink, Globe, Server, Shield, RefreshCw, HelpCircle } from "lucide-react";
import { Link } from "wouter";

type Readiness = {
  system: {
    resendKeyConfigured: boolean;
    resendError: string | null;
    defaultFromAddress: string | null;
    publicUrl: { url: string; host: string; source: string; isCustomDomain: boolean };
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

type DnsCheck = {
  label: string;
  recordType: "TXT" | "CNAME";
  hostname: string;
  status: "present" | "missing" | "unknown";
  values: string[];
  matchedExpectation: boolean | null;
  expectationHint: string;
  note: string;
  error: string | null;
};
type DnsReadiness = {
  senderDomain: string | null;
  canonicalHost: string | null;
  alignment: boolean | null;
  checks: DnsCheck[];
  note: string | null;
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

  const dnsQuery = useQuery<DnsReadiness>({
    queryKey: ["/api/admin/email-readiness/dns"],
    queryFn: () => apiFetch("/api/admin/email-readiness/dns"),
  });

  const [testTarget, setTestTarget] = useState<{ partnerId: number; partnerName: string; kind: "customer" | "internal" | "generic" | "pm_intake" } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<{ id: number; ok: boolean; text: string } | null>(null);

  const sendTest = useMutation({
    mutationFn: (args: { partnerId: number; toEmail: string; kind: "customer" | "internal" | "generic" | "pm_intake"; subject?: string; message?: string }) => {
      if (args.kind === "generic") {
        return apiFetch("/api/admin/email-readiness/test/generic", {
          method: "POST",
          body: JSON.stringify({ partnerId: args.partnerId, toEmail: args.toEmail, subject: args.subject || undefined, message: args.message || undefined }),
        });
      }
      const path = args.kind === "customer"
        ? "/api/admin/email-readiness/test/customer-confirmation"
        : args.kind === "pm_intake"
          ? "/api/admin/email-readiness/test/pm-intake"
          : "/api/admin/email-readiness/test/internal-routing";
      return apiFetch(path, { method: "POST", body: JSON.stringify({ partnerId: args.partnerId, toEmail: args.toEmail }) });
    },
    onSuccess: (r: any, vars) => setTestResult({
      ok: !!r.ok,
      message: r.ok
        ? `Sent to ${r.sentTo} (id ${r.providerId || "—"}${r.basedOnOrderId ? `, based on order #${r.basedOnOrderId}` : ""})`
        : `Send failed: ${r.error || "unknown error"}`,
    }),
    onError: (e: any) => setTestResult({ ok: false, message: e?.message || "Network error — see console." }),
    onSettled: () => refetch(),
  });

  const retryFailed = useMutation({
    mutationFn: (eventId: number) => apiFetch(`/api/admin/email-readiness/retry/${eventId}`, { method: "POST" }),
    onMutate: (eventId) => { setRetryingId(eventId); setRetryFeedback(null); },
    onSuccess: (r: any, eventId) => setRetryFeedback({
      id: eventId,
      ok: !!r.ok,
      text: r.ok
        ? `Retried successfully (provider id ${r.providerId || "—"})`
        : `Retry failed: ${r.error || "unknown error"}`,
    }),
    onError: (e: any, eventId) => setRetryFeedback({
      id: eventId,
      ok: false,
      text: e?.message || "Retry request failed.",
    }),
    onSettled: () => { setRetryingId(null); refetch(); },
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
                  <span className="font-mono">{sys.publicUrl.url}</span>{" "}
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

      {/* DOMAIN AUTHENTICATION */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Domain authentication</CardTitle>
          <CardDescription className="text-xs">
            Public-DNS lookups for SPF, DKIM, and DMARC on your sender domain. These checks reflect what we can resolve from this server — final verification status is reported by the Resend dashboard, not here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dnsQuery.isLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Resolving DNS…</div>
          ) : !dnsQuery.data ? (
            <div className="text-xs text-amber-700">Could not load DNS readiness. Manual verification required.</div>
          ) : (
            <DomainAuthCard dns={dnsQuery.data} />
          )}
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
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "customer" }); setTestEmail(""); setTestSubject(""); setTestMessage(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Test customer email
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "internal" }); setTestEmail(""); setTestSubject(""); setTestMessage(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Test internal routing
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "pm_intake" }); setTestEmail(""); setTestSubject(""); setTestMessage(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Send PM Intake Test
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setTestTarget({ partnerId: p.partnerId, partnerName: p.name, kind: "generic" }); setTestEmail(""); setTestSubject(""); setTestMessage(""); setTestResult(null); }}>
                        <Send className="h-3 w-3 mr-1" /> Generic branded test
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
              {data.recentFailures.map(f => {
                const canRetry = f.objectType === "order" && !!f.objectId && typeof f.meta?.type === "string"
                  && ["order_confirmation", "order_ops_forward", "order_finance_notification", "order_partner_contact_notification", "order_vendor_notification"].includes(f.meta.type);
                const fb = retryFeedback?.id === f.id ? retryFeedback : null;
                return (
                  <div key={f.id} className="text-xs border rounded p-2 bg-red-50/40 border-red-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{f.meta?.type || "email"}</span>
                      <span className="text-muted-foreground">→ {Array.isArray(f.meta?.to) ? f.meta.to.join(", ") : f.meta?.to || "?"}</span>
                      {f.objectType === "order" && f.objectId && (
                        <Link href={`/admin/orders/${f.objectId}`}><span className="text-blue-600 hover:underline">order #{f.objectId}</span></Link>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
                      {canRetry ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2"
                          disabled={retryingId === f.id}
                          onClick={() => retryFailed.mutate(f.id)}
                          title="Rebuild this email from current order data and resend it"
                        >
                          {retryingId === f.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                          Retry
                        </Button>
                      ) : (
                        <span
                          className="text-[10px] text-muted-foreground inline-flex items-center gap-1"
                          title="Automatic retry is only available for failures tied to a specific order"
                        >
                          <HelpCircle className="h-3 w-3" /> manual resend
                        </span>
                      )}
                    </div>
                    {f.meta?.error && <div className="text-red-700 mt-0.5 font-mono text-[11px] break-all">{f.meta.error}</div>}
                    {fb && (
                      <div className={`mt-1 text-[11px] ${fb.ok ? "text-emerald-700" : "text-red-700"}`}>{fb.text}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TEST DIALOG */}
      <Dialog open={!!testTarget} onOpenChange={(o) => { if (!o) { setTestTarget(null); setTestResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {testTarget?.kind === "customer" ? "Send test customer confirmation"
                : testTarget?.kind === "internal" ? "Send test internal routing email"
                : "Send generic branded test"}
            </DialogTitle>
            <DialogDescription>
              {testTarget?.kind === "generic"
                ? <>Sends a small branded email for <strong>{testTarget?.partnerName}</strong> using the partner's sender label and brand colors. No order required — useful for verifying deliverability for newly onboarded partners.</>
                : <>Sends a real branded email for <strong>{testTarget?.partnerName}</strong> using the partner's most recent order as the template payload. The recipient is overridden to the address you enter — no real customer is contacted.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Send to</Label>
            <Input type="email" placeholder="you@yourdomain.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
            {testTarget?.kind === "generic" && (
              <>
                <Label className="text-xs mt-2">Subject (optional)</Label>
                <Input placeholder="Defaults to a branded test subject" value={testSubject} onChange={e => setTestSubject(e.target.value)} />
                <Label className="text-xs mt-2">Message (optional)</Label>
                <Textarea
                  placeholder="Defaults to a short test message confirming the branded sender works."
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  rows={3}
                />
              </>
            )}
            {testResult && (
              <div className={`text-xs p-2 rounded border ${testResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {testResult.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTestTarget(null); setTestResult(null); }}>Close</Button>
            <Button disabled={!testEmail.includes("@") || sendTest.isPending}
              onClick={() => testTarget && sendTest.mutate({
                partnerId: testTarget.partnerId,
                toEmail: testEmail,
                kind: testTarget.kind,
                subject: testSubject,
                message: testMessage,
              })}>
              {sendTest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />} Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DomainAuthCard({ dns }: { dns: DnsReadiness }) {
  const dnsStatusMeta: Record<DnsCheck["status"], { label: string; cls: string; icon: any }> = {
    present: { label: "Resolves",                cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
    missing: { label: "Not found",               cls: "bg-amber-100 text-amber-800 border-amber-200",       icon: AlertTriangle },
    unknown: { label: "Manual verification",     cls: "bg-slate-100 text-slate-700 border-slate-200",       icon: HelpCircle },
  };
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="border rounded p-2">
          <div className="text-muted-foreground">Sender domain</div>
          <div className="font-mono mt-0.5">{dns.senderDomain || <em>not configured</em>}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-muted-foreground">Public app domain</div>
          <div className="font-mono mt-0.5">{dns.canonicalHost || <em>unknown</em>}</div>
        </div>
        <div className={`border rounded p-2 ${dns.alignment === false ? "border-amber-300 bg-amber-50/40" : ""}`}>
          <div className="text-muted-foreground">Sender ↔ site alignment</div>
          <div className="mt-0.5">
            {dns.alignment === null ? <span className="text-muted-foreground">—</span>
              : dns.alignment ? <span className="text-emerald-700">aligned (same root)</span>
              : <span className="text-amber-700">different root domains</span>}
          </div>
        </div>
      </div>

      {dns.note && (
        <div className="text-xs p-2 rounded border border-amber-200 bg-amber-50 text-amber-800">{dns.note}</div>
      )}

      {dns.checks.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No DNS checks performed — configure a verified sender domain to enable SPF/DKIM/DMARC visibility.
        </div>
      ) : (
        <div className="space-y-2">
          {dns.checks.map(c => {
            const meta = dnsStatusMeta[c.status];
            const Icon = meta.icon;
            return (
              <div key={c.label} className="border rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c.label}</span>
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto font-mono">{c.recordType} · {c.hostname}</span>
                </div>
                {c.values.length > 0 && (
                  <div className="text-[11px] mt-1 font-mono break-all bg-muted/40 rounded px-2 py-1">
                    {c.values.map((v, i) => <div key={i}>{v}</div>)}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">{c.note}</div>
                {c.matchedExpectation === false && (
                  <div className="text-[11px] text-amber-700 mt-1">Hint: {c.expectationHint}</div>
                )}
                {c.status === "missing" && (
                  <div className="text-[11px] text-muted-foreground mt-1">Hint: {c.expectationHint}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        These DNS results are read-only signals from public DNS. The Resend dashboard is the source of truth for "verified domain" status — always confirm there before launching customer-facing email.
      </p>
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
