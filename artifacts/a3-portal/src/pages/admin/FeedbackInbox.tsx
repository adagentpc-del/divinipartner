import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, ExternalLink } from "lucide-react";

const STATUS_OPTS = ["new", "triaged", "in_progress", "resolved", "wontfix"];
const SEV_COLOR: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-700",
};

export default function FeedbackInbox() {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const qc = useQueryClient();
  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (categoryFilter) params.set("category", categoryFilter);
  const qs = params.toString() ? `?${params}` : "";
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["feedback", statusFilter, categoryFilter], queryFn: () => apiFetch(`/api/feedback${qs}`) });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: any }) => apiFetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquare className="h-6 w-6" /> Feedback inbox</h1>
        <p className="text-muted-foreground mt-1">Internal product feedback from admins, partners, and vendors.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["ux", "bug", "performance", "missing_feature", "data", "onboarding", "billing", "other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : !data || data.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No feedback yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.map(f => <FeedbackRow key={f.id} item={f} onUpdate={(patch) => update.mutate({ id: f.id, patch })} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ item, onUpdate }: { item: any; onUpdate: (patch: any) => void }) {
  const [notes, setNotes] = useState(item.internalNotes || "");
  const [showNotes, setShowNotes] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={SEV_COLOR[item.severity] || ""}>{item.severity}</Badge>
              <Badge variant="outline">{item.category}</Badge>
              <Badge variant={item.status === "resolved" ? "default" : "secondary"}>{item.status}</Badge>
              {item.screenPath && <a href={item.screenPath} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" /> {item.screenPath}</a>}
            </div>
            <CardTitle className="text-sm font-normal whitespace-pre-wrap">{item.message}</CardTitle>
            <CardDescription className="text-xs">
              Submitted {new Date(item.createdAt).toLocaleString()}
              {item.submitterRole && ` · ${item.submitterRole}`}
              {item.partnerId && ` · partner #${item.partnerId}`}
            </CardDescription>
          </div>
          <Select value={item.status} onValueChange={(v) => onUpdate({ status: v })}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!showNotes ? (
          <Button size="sm" variant="ghost" onClick={() => setShowNotes(true)}>{item.internalNotes ? "Edit notes" : "Add notes"}</Button>
        ) : (
          <div className="space-y-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onUpdate({ internalNotes: notes }); setShowNotes(false); }}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setNotes(item.internalNotes || ""); setShowNotes(false); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
