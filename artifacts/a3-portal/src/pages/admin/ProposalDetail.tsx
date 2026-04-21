import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, FileText, Save, Trash2, Printer, Loader2, Star } from "lucide-react";
import { PlanComparisonTable } from "@/components/sales/PlanComparisonTable";
import { useDemoMode } from "@/contexts/DemoModeContext";

export default function ProposalDetail() {
  const [, params] = useRoute("/admin/sales/proposals/:id");
  const [, setLocation] = useLocation();
  const isNew = params?.id === "new";
  const id = isNew ? null : Number(params?.id);
  const qc = useQueryClient();
  const { demoMode } = useDemoMode();

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await apiFetch(apiUrl("/api/commercial/plans"))).json(),
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await apiFetch(apiUrl("/api/commercial/accounts"))).json(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["proposal", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch(apiUrl(`/api/sales/proposals/${id}`));
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
  });

  const [form, setForm] = useState<any>({
    title: "",
    prospectName: "",
    accountId: null,
    status: "draft",
    recommendedPlanId: null,
    comparedPlanIds: [],
    packagingNotes: "",
    internalNotes: "",
    prospectFacingNotes: "",
  });

  useEffect(() => {
    if (data?.proposal) {
      setForm({
        title: data.proposal.title ?? "",
        prospectName: data.proposal.prospectName ?? "",
        accountId: data.proposal.accountId ?? null,
        status: data.proposal.status,
        recommendedPlanId: data.proposal.recommendedPlanId ?? null,
        comparedPlanIds: data.proposal.comparedPlanIds ?? [],
        packagingNotes: data.proposal.packagingNotes ?? "",
        internalNotes: data.proposal.internalNotes ?? "",
        prospectFacingNotes: data.proposal.prospectFacingNotes ?? "",
      });
    }
  }, [data?.proposal?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const url = isNew ? apiUrl("/api/sales/proposals") : apiUrl(`/api/sales/proposals/${id}`);
      const res = await apiFetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      if (isNew) setLocation(`/admin/sales/proposals/${row.id}`);
      else qc.invalidateQueries({ queryKey: ["proposal", id] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(apiUrl(`/api/sales/proposals/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      setLocation("/admin/sales");
    },
  });

  const togglePlan = (planId: number) => {
    setForm((f: any) => {
      const has = f.comparedPlanIds.includes(planId);
      return { ...f, comparedPlanIds: has ? f.comparedPlanIds.filter((x: number) => x !== planId) : [...f.comparedPlanIds, planId] };
    });
  };

  if (!isNew && isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/sales")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" /> Proposal
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{form.title || "New proposal"}</h1>
          {form.prospectName && <p className="text-muted-foreground mt-1">For {form.prospectName}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print</Button>
          {!isNew && <Button variant="outline" className="text-red-600" onClick={() => remove.mutate()}><Trash2 className="h-4 w-4 mr-2" /> Delete</Button>}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 print:hidden">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <h2 className="font-semibold">Proposal details</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Hilton white-label proposal" />
            </div>
            <div>
              <Label>Prospect / brand name</Label>
              <Input value={form.prospectName ?? ""} onChange={e => setForm({ ...form, prospectName: e.target.value })} placeholder="Hilton Worldwide" />
            </div>
            <div>
              <Label>Linked commercial account</Label>
              <Select value={form.accountId ? String(form.accountId) : "none"} onValueChange={v => setForm({ ...form, accountId: v === "none" ? null : Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {(accounts ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft", "in_review", "sent", "accepted", "declined"].map(s =>
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Packaging notes (prospect-facing)</Label>
            <Textarea value={form.packagingNotes ?? ""} onChange={e => setForm({ ...form, packagingNotes: e.target.value })} rows={3} placeholder="What's included beyond the plan tier — onboarding sprint, dedicated CSM, etc." />
          </div>
          <div>
            <Label>Prospect-facing notes</Label>
            <Textarea value={form.prospectFacingNotes ?? ""} onChange={e => setForm({ ...form, prospectFacingNotes: e.target.value })} rows={3} placeholder="Notes that may appear on a proposal export." />
          </div>
          {!demoMode && (
            <div>
              <Label className="flex items-center gap-2">Internal notes <Badge variant="outline" className="text-amber-700 border-amber-300">Internal only</Badge></Label>
              <Textarea value={form.internalNotes ?? ""} onChange={e => setForm({ ...form, internalNotes: e.target.value })} rows={3} placeholder="Margin assumptions, deal context, internal-only follow-ups." />
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Plans to compare</h2>
          <p className="text-xs text-muted-foreground">Pick the plans this proposal compares. Mark one as recommended.</p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {(plans ?? []).map((p: any) => {
              const checked = form.comparedPlanIds.includes(p.id);
              const isRec = form.recommendedPlanId === p.id;
              return (
                <div key={p.id} className={`flex items-center gap-2 p-2 rounded border ${isRec ? "border-primary bg-primary/5" : "border-transparent"}`}>
                  <Checkbox checked={checked} onCheckedChange={() => togglePlan(p.id)} id={`plan-${p.id}`} />
                  <label htmlFor={`plan-${p.id}`} className="flex-1 text-sm cursor-pointer">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{p.tier.replace(/_/g, " ")}</div>
                  </label>
                  {checked && (
                    <Button
                      type="button" size="sm" variant={isRec ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setForm({ ...form, recommendedPlanId: isRec ? null : p.id })}
                    >
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Comparison matrix (also print view) */}
      {!isNew && data?.matrix && (
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Plan comparison</h2>
          <PlanComparisonTable matrix={data.matrix} recommendedPlanId={form.recommendedPlanId} />
          {form.packagingNotes && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-sm mb-2">Included beyond plan</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{form.packagingNotes}</p>
            </div>
          )}
          {form.prospectFacingNotes && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="font-semibold text-sm mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{form.prospectFacingNotes}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
