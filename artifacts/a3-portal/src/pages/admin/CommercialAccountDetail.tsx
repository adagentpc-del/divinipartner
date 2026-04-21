import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, RefreshCw, Lock, Check, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CommercialAccountDetail() {
  const [, params] = useRoute("/admin/commercial/accounts/:id");
  const id = params?.id;
  const isNew = id === "new";
  const qc = useQueryClient();
  const { toast } = useToast();

  const detailQ = useQuery<any>({
    queryKey: ["commercial-account", id], enabled: !isNew,
    queryFn: () => apiFetch(`/api/commercial/accounts/${id}`),
  });
  const plansQ = useQuery<any[]>({ queryKey: ["commercial-plans"], queryFn: () => apiFetch("/api/commercial/plans") });
  const brandingQ = useQuery<any[]>({ queryKey: ["branding-packages"], queryFn: () => apiFetch("/api/commercial/branding-packages") });
  const accountsQ = useQuery<any[]>({ queryKey: ["commercial-accounts"], queryFn: () => apiFetch("/api/commercial/accounts") });

  const [form, setForm] = useState<any>({});
  const data = isNew ? null : detailQ.data;
  const account = isNew ? form : { ...data?.account, ...form };

  const save = useMutation({
    mutationFn: () => isNew
      ? apiFetch("/api/commercial/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      : apiFetch(`/api/commercial/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }),
    onSuccess: (r: any) => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["commercial-account", id] });
      qc.invalidateQueries({ queryKey: ["commercial-dashboard"] });
      if (isNew && r?.id) window.location.href = `/admin/commercial/accounts/${r.id}`;
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const recompute = useMutation({
    mutationFn: () => apiFetch(`/api/commercial/accounts/${id}/recompute-usage`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Usage recomputed" }); qc.invalidateQueries({ queryKey: ["commercial-account", id] }); },
  });

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  if (!isNew && detailQ.isLoading) return <div className="py-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!isNew && !data) return <div className="py-24 text-center text-muted-foreground">Account not found.</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link href="/admin/commercial"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <div className="flex gap-2">
          {!isNew && <Button variant="outline" size="sm" onClick={() => recompute.mutate()} disabled={recompute.isPending}><RefreshCw className="h-4 w-4 mr-1" /> Recompute usage</Button>}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || Object.keys(form).length === 0}>{save.isPending ? "Saving…" : isNew ? "Create account" : "Save changes"}</Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          {isNew ? "New commercial account" : account.name}
        </h1>
        {!isNew && <p className="text-muted-foreground mt-1 text-sm">Slug: <code>{account.slug}</code></p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Commercial settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Account name"><Input value={account.name || ""} onChange={e => set("name", e.target.value)} /></Field>
            <Field label="Slug"><Input value={account.slug || ""} onChange={e => set("slug", e.target.value)} /></Field>
            <Field label="Account type">
              <Select value={account.accountType || "managed"} onValueChange={v => set("accountType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["internal", "managed", "white_label", "reseller", "enterprise"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Commercial status">
              <Select value={account.commercialStatus || "trial"} onValueChange={v => set("commercialStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["trial", "active", "paused", "suspended", "internal", "beta"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plan">
              <Select value={String(account.planId ?? "")} onValueChange={v => set("planId", v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— None —</SelectItem>
                  {plansQ.data?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.tier})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Parent account">
              <Select value={String(account.parentAccountId ?? "")} onValueChange={v => set("parentAccountId", v && v !== "0" ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— None —</SelectItem>
                  {accountsQ.data?.filter(a => a.id !== Number(id)).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="White-label level">
              <Select value={account.whiteLabelLevel || "none"} onValueChange={v => set("whiteLabelLevel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["none", "partial", "full"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Branding package">
              <Select value={String(account.brandingPackageId ?? "")} onValueChange={v => set("brandingPackageId", v && v !== "0" ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— None —</SelectItem>
                  {brandingQ.data?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name} ({b.level})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account manager"><Input value={account.accountManager || ""} onChange={e => set("accountManager", e.target.value)} /></Field>
            <Field label="Internal revenue owner"><Input value={account.internalRevenueOwner || ""} onChange={e => set("internalRevenueOwner", e.target.value)} /></Field>
            <Field label="Billing entity"><Input value={account.billingEntityName || ""} onChange={e => set("billingEntityName", e.target.value)} /></Field>
            <Field label="Billing email"><Input value={account.billingContactEmail || ""} onChange={e => set("billingContactEmail", e.target.value)} /></Field>
            <Field label="Seat allowance"><Input type="number" value={account.seatAllowance ?? ""} onChange={e => set("seatAllowance", e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Portal allowance"><Input type="number" value={account.portalInstanceAllowance ?? ""} onChange={e => set("portalInstanceAllowance", e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Contract term">
              <Select value={account.contractTerm || ""} onValueChange={v => set("contractTerm", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{["monthly", "annual", "multi_year", "custom"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Renewal date"><Input type="date" value={account.renewalDate ? String(account.renewalDate).slice(0, 10) : ""} onChange={e => set("renewalDate", e.target.value || null)} /></Field>
            <Field label="Activation status">
              <Select value={account.activationStatus || "lead"} onValueChange={v => set("activationStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["lead", "proposal_prepared", "in_review", "approved", "activating", "active", "paused", "suspended"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Measurement system">
              <Select value={account.unitPreference || "inherit"} onValueChange={v => set("unitPreference", v === "inherit" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit (default Imperial)</SelectItem>
                  <SelectItem value="imperial">Imperial (in / ft)</SelectItem>
                  <SelectItem value="metric">Metric (cm / m)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Demo-ready">
              <div className="flex items-center gap-2 h-10">
                <input type="checkbox" checked={!!account.demoReady} onChange={e => set("demoReady", e.target.checked)} className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Surface this account in the showcase tab</span>
              </div>
            </Field>
            <div className="sm:col-span-2"><Field label="Sales notes"><Textarea rows={2} value={account.salesNotes || ""} onChange={e => set("salesNotes", e.target.value)} placeholder="Deal context, key contacts, follow-ups." /></Field></div>
            <div className="sm:col-span-2"><Field label="Monetization notes (internal only)"><Textarea rows={3} value={account.monetizationNotes || ""} onChange={e => set("monetizationNotes", e.target.value)} /></Field></div>
          </CardContent>
        </Card>

        {!isNew && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Plan</CardTitle></CardHeader>
              <CardContent>
                {data.plan ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">{data.plan.name}</span>
                      <Badge variant="outline">{data.plan.tier}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{data.plan.pricingModel} · {data.plan.priceAmount ? `$${data.plan.priceAmount}` : "custom pricing"}</p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No plan assigned.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Usage</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.usage.length === 0 ? <p className="text-sm text-muted-foreground">No usage data.</p> : data.usage.map((u: any) => {
                  const pct = u.allowance ? Math.min(100, Math.round((u.currentUsage / u.allowance) * 100)) : 0;
                  const warn = u.allowance && pct >= u.warningThresholdPct;
                  return (
                    <div key={u.id}>
                      <div className="flex justify-between text-sm"><span className="capitalize text-muted-foreground">{u.limitKey}</span><span className={`font-medium tabular-nums ${warn ? "text-rose-600" : ""}`}>{u.currentUsage}{u.allowance ? ` / ${u.allowance}` : " · unlimited"}</span></div>
                      {u.allowance && <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden"><div className={`h-full ${warn ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {!isNew && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Feature entitlements</CardTitle><CardDescription>Resolved from plan + account type. Internal accounts get everything.</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(data.entitlements).map(([k, v]: any) => (
                  <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${v ? "bg-emerald-50 border-emerald-200" : "bg-muted/50 border-muted text-muted-foreground"}`}>
                    {v ? <Check className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4" />}
                    <span className="capitalize">{k.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.children.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Child accounts</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {data.children.map((c: any) => <li key={c.id}><Link href={`/admin/commercial/accounts/${c.id}`} className="hover:underline">{c.name}</Link> <Badge variant="outline" className="ml-2">{c.accountType}</Badge></li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Linked partners ({data.partners.length})</CardTitle></CardHeader>
            <CardContent>
              {data.partners.length === 0 ? <p className="text-sm text-muted-foreground">No partners linked yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {data.partners.map((p: any) => <li key={p.id}><Link href={`/admin/partners/${p.id}/edit`} className="hover:underline">{p.companyName}</Link></li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
