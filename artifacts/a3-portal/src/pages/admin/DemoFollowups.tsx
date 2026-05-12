import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Calendar, Target, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import type { DemoFollowup } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";
type Followup = SerializedRow<DemoFollowup>;

const STATUS = [
  { v: "demo_completed", l: "Demo completed" },
  { v: "proposal_requested", l: "Proposal requested" },
  { v: "technical_review", l: "Technical review" },
  { v: "activation_pending", l: "Activation pending" },
  { v: "stalled", l: "Stalled" },
  { v: "closed_won", l: "Closed (won)" },
  { v: "closed_lost", l: "Closed (lost)" },
];
const OUTCOMES = ["strong_interest", "warm", "needs_more_info", "technical_review", "stalled", "declined"];

const STATUS_COLORS: Record<string, string> = {
  demo_completed: "bg-blue-100 text-blue-700",
  proposal_requested: "bg-violet-100 text-violet-700",
  technical_review: "bg-indigo-100 text-indigo-700",
  activation_pending: "bg-amber-100 text-amber-700",
  stalled: "bg-orange-100 text-orange-700",
  closed_won: "bg-emerald-100 text-emerald-700",
  closed_lost: "bg-slate-100 text-slate-700",
};

export default function DemoFollowups() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Followup> | null>(null);

  const listQ = useQuery<Followup[]>({ queryKey: ["followups"], queryFn: () => apiFetch("/api/demo-followups") });

  const saveMut = useMutation({
    mutationFn: async (body: Partial<Followup>) => {
      if (body.id) return apiFetch(`/api/demo-followups/${body.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch(`/api/demo-followups`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      toast({ title: "Follow-up saved" });
      setOpen(false);
    },
  });

  const open_ = (f?: Partial<Followup>) => {
    setEditing(f ?? { status: "demo_completed", whiteLabelInterest: "none", activationReadiness: "unknown", interestAreas: [], priorityFeatures: [] });
    setOpen(true);
  };
  const setF = (k: keyof Followup, v: any) => setEditing(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demo Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-1">Capture demo outcomes, interest areas, and next steps. Stays product-focused, not a CRM.</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button onClick={() => open_()}><Plus className="h-4 w-4 mr-1" /> Log follow-up</Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>{editing?.id ? "Edit follow-up" : "New demo follow-up"}</SheetTitle></SheetHeader>
            {editing && (
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Prospect / account name</label>
                    <Input value={editing.prospectName ?? ""} onChange={e => setF("prospectName", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Account ID (optional)</label>
                    <Input type="number" value={editing.accountId ?? ""} onChange={e => setF("accountId", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Demo date</label>
                    <Input type="date" value={editing.demoAt ? editing.demoAt.slice(0, 10) : ""} onChange={e => setF("demoAt", e.target.value || null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Select value={editing.status} onValueChange={v => setF("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Outcome</label>
                    <Select value={editing.outcome ?? ""} onValueChange={v => setF("outcome", v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{OUTCOMES.map(o => <SelectItem key={o} value={o}>{o.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">White-label interest</label>
                    <Select value={editing.whiteLabelInterest ?? "none"} onValueChange={v => setF("whiteLabelInterest", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["none", "partial", "full", "undecided"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Activation readiness</label>
                  <Select value={editing.activationReadiness ?? "unknown"} onValueChange={v => setF("activationReadiness", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["unknown", "low", "medium", "high"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Interest areas (comma-separated)</label>
                  <Input value={(editing.interestAreas ?? []).join(", ")} onChange={e => setF("interestAreas", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Priority features requested (comma-separated)</label>
                  <Input value={(editing.priorityFeatures ?? []).join(", ")} onChange={e => setF("priorityFeatures", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Objections summary</label>
                  <Textarea rows={2} value={editing.objectionsSummary ?? ""} onChange={e => setF("objectionsSummary", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Next step</label>
                  <Textarea rows={2} value={editing.nextStep ?? ""} onChange={e => setF("nextStep", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Internal notes</label>
                  <Textarea rows={2} value={editing.internalNotes ?? ""} onChange={e => setF("internalNotes", e.target.value)} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => saveMut.mutate(editing)} disabled={saveMut.isPending}>
                    {editing.id ? "Save" : "Create"}
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {(listQ.data ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">No follow-ups yet. Log your first demo.</p>}
          {listQ.data?.map(f => (
            <div key={f.id} className="p-4 hover:bg-muted/40 cursor-pointer" onClick={() => open_(f)}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{f.prospectName ?? `Account #${f.accountId ?? "?"}`}</span>
                <Badge className={STATUS_COLORS[f.status] || ""}>{f.status.replace(/_/g, " ")}</Badge>
                {f.outcome && <Badge variant="outline" className="capitalize">{f.outcome.replace(/_/g, " ")}</Badge>}
                {f.whiteLabelInterest && f.whiteLabelInterest !== "none" && (
                  <Badge variant="outline">WL: {f.whiteLabelInterest}</Badge>
                )}
                {f.activationReadiness && f.activationReadiness !== "unknown" && (
                  <Badge variant="outline">Readiness: {f.activationReadiness}</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                {f.demoAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(f.demoAt).toLocaleDateString()}</span>}
                {(f.priorityFeatures ?? []).length > 0 && <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {f.priorityFeatures!.join(", ")}</span>}
              </div>
              {f.nextStep && (
                <div className="text-sm mt-2 flex gap-2">
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                  <span>{f.nextStep}</span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
