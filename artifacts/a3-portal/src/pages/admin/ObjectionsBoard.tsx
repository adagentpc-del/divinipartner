import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Lightbulb, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDemoMode } from "@/contexts/DemoModeContext";

type Objection = {
  id: number; accountId?: number | null; proposalId?: number | null; category: string; summary: string;
  detail?: string | null; status: string; recommendedResponse?: string | null; internalNotes?: string | null;
  tagsJson?: string[]; raisedBy?: string | null; raisedAt: string; resolvedAt?: string | null;
};
type Constants = { categories: { key: string; label: string }[]; statuses: string[]; recommendedResponses: Record<string, string> };

const STATUS_COLORS: Record<string, string> = {
  raised: "bg-red-100 text-red-700",
  follow_up: "bg-amber-100 text-amber-700",
  answered: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  wont_address: "bg-slate-100 text-slate-700",
};

export default function ObjectionsBoard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { demoMode } = useDemoMode();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<Objection> | null>(null);
  const [open, setOpen] = useState(false);

  const constantsQ = useQuery<Constants>({ queryKey: ["objections-constants"], queryFn: () => apiFetch("/api/objections/constants") });
  const summaryQ = useQuery<{ total: number; open: number; resolved: number; byCategory: Record<string, number>; byStatus: Record<string, number> }>({
    queryKey: ["objections-summary"], queryFn: () => apiFetch("/api/objections/summary"),
  });
  const listQ = useQuery<Objection[]>({
    queryKey: ["objections", filterStatus],
    queryFn: () => apiFetch(`/api/objections${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`),
  });

  const saveMut = useMutation({
    mutationFn: async (body: Partial<Objection>) => {
      if (body.id) return apiFetch(`/api/objections/${body.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch(`/api/objections`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objections"] });
      qc.invalidateQueries({ queryKey: ["objections-summary"] });
      toast({ title: "Objection saved" });
      setOpen(false);
    },
  });

  const open_ = (o?: Partial<Objection>) => { setEditing(o ?? { category: "pricing", status: "raised", summary: "" }); setOpen(true); };
  const setEditingField = (k: keyof Objection, v: any) => setEditing(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Objection Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track buyer objections raised in demos and proposals; capture recommended responses.
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button onClick={() => open_()}><Plus className="h-4 w-4 mr-1" /> Log objection</Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>{editing?.id ? "Edit objection" : "New objection"}</SheetTitle></SheetHeader>
            {editing && (
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Category</label>
                    <Select value={editing.category} onValueChange={v => {
                      setEditingField("category", v);
                      if (constantsQ.data?.recommendedResponses[v] && !editing.recommendedResponse) {
                        setEditingField("recommendedResponse", constantsQ.data.recommendedResponses[v]);
                      }
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {constantsQ.data?.categories.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Select value={editing.status} onValueChange={v => setEditingField("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {constantsQ.data?.statuses.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Summary</label>
                  <Input value={editing.summary ?? ""} onChange={e => setEditingField("summary", e.target.value)} placeholder="Short objection statement" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Detail</label>
                  <Textarea rows={3} value={editing.detail ?? ""} onChange={e => setEditingField("detail", e.target.value)} placeholder="What did the prospect actually say?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Account ID (optional)</label>
                    <Input type="number" value={editing.accountId ?? ""} onChange={e => setEditingField("accountId", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Proposal ID (optional)</label>
                    <Input type="number" value={editing.proposalId ?? ""} onChange={e => setEditingField("proposalId", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" /> Recommended response
                  </label>
                  <Textarea rows={4} value={editing.recommendedResponse ?? ""} onChange={e => setEditingField("recommendedResponse", e.target.value)} />
                </div>
                {!demoMode && (
                  <div>
                    <label className="text-xs text-muted-foreground">Internal notes (hidden in demo mode)</label>
                    <Textarea rows={3} value={editing.internalNotes ?? ""} onChange={e => setEditingField("internalNotes", e.target.value)} />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => saveMut.mutate(editing)} disabled={saveMut.isPending || !editing.summary}>
                    {editing.id ? "Save" : "Create"}
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={summaryQ.data?.total ?? 0} />
        <Stat label="Open" value={summaryQ.data?.open ?? 0} tone="warn" />
        <Stat label="Resolved" value={summaryQ.data?.resolved ?? 0} tone="good" />
        <Stat label="Categories" value={Object.keys(summaryQ.data?.byCategory ?? {}).length} />
      </div>

      <Tabs value={filterStatus} onValueChange={setFilterStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="raised">Raised</TabsTrigger>
          <TabsTrigger value="follow_up">Follow-up</TabsTrigger>
          <TabsTrigger value="answered">Answered</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0 divide-y">
          {(listQ.data ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">No objections logged yet.</p>}
          {listQ.data?.map(o => {
            const catLabel = constantsQ.data?.categories.find(c => c.key === o.category)?.label ?? o.category;
            return (
              <div key={o.id} className="p-4 hover:bg-muted/40 cursor-pointer" onClick={() => open_(o)}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="capitalize">{catLabel}</Badge>
                  <Badge className={STATUS_COLORS[o.status] || ""}>{o.status.replace("_", " ")}</Badge>
                  {o.accountId && <span className="text-xs text-muted-foreground">acct #{o.accountId}</span>}
                  {o.proposalId && <span className="text-xs text-muted-foreground">prop #{o.proposalId}</span>}
                </div>
                <div className="font-medium text-sm">{o.summary}</div>
                {o.recommendedResponse && (
                  <div className="text-xs text-muted-foreground mt-2 flex gap-2">
                    <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                    <span className="line-clamp-2">{o.recommendedResponse}</span>
                  </div>
                )}
                {o.status === "resolved" && o.resolvedAt && (
                  <div className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Resolved {new Date(o.resolvedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
