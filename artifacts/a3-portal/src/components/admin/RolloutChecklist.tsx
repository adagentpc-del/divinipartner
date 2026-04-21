import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, Circle, Rocket, Eye, Pause, Lock, ExternalLink } from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Lock },
  preview: { label: "Preview", color: "bg-blue-100 text-blue-700", icon: Eye },
  internal_only: { label: "Internal only", color: "bg-amber-100 text-amber-700", icon: Lock },
  live: { label: "Live", color: "bg-emerald-100 text-emerald-700", icon: Rocket },
  paused: { label: "Paused", color: "bg-rose-100 text-rose-700", icon: Pause },
};

export function RolloutChecklist({ partnerId }: { partnerId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["launch-readiness", partnerId],
    queryFn: () => apiFetch<any>(`/api/launch/partner/${partnerId}`),
  });
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("live");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideRequired, setOverrideRequired] = useState(false);

  const activate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/launch/partner/${partnerId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pendingStatus, overrideNote: overrideNote || null }),
      });
      const json = await res.json();
      if (res.status === 409) { setOverrideRequired(true); throw new Error(json.error); }
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setOpen(false); setOverrideNote(""); setOverrideRequired(false);
      qc.invalidateQueries({ queryKey: ["launch-readiness", partnerId] });
      qc.invalidateQueries({ queryKey: ["partner", partnerId] });
    },
  });

  if (isLoading || !data) return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading rollout checklist…</CardContent></Card>;
  const status = data.partner.launchStatus || "draft";
  const meta = STATUS_META[status] || STATUS_META.draft;
  const StatusIcon = meta.icon;
  const grouped: Record<string, any[]> = {};
  for (const it of data.items) (grouped[it.category] ||= []).push(it);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" /> Rollout checklist
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
                <StatusIcon className="h-3 w-3" /> {meta.label}
              </span>
            </CardTitle>
            <CardDescription>
              {data.completionPct}% complete · {data.blockerCount} blocker(s) · {data.warningCount} warning(s)
              {data.partner.launchedAt && status === "live" && ` · launched ${new Date(data.partner.launchedAt).toLocaleDateString()}`}
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant={data.readyToLaunch && status !== "live" ? "default" : "outline"}>
                <Rocket className="mr-1.5 h-3.5 w-3.5" /> Change launch state
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update launch state</DialogTitle>
                <DialogDescription>Move this partner between draft, preview, internal-only, live, and paused.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">New state</label>
                  <Select value={pendingStatus} onValueChange={setPendingStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft — internal setup only</SelectItem>
                      <SelectItem value="preview">Preview — share private preview link</SelectItem>
                      <SelectItem value="internal_only">Internal only — staff sees portal, public doesn't</SelectItem>
                      <SelectItem value="live">Live — partner is fully launched</SelectItem>
                      <SelectItem value="paused">Paused — temporarily disable ordering</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {pendingStatus === "live" && data.blockerCount > 0 && (
                  <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    <div className="font-medium">{data.blockerCount} blocker(s) outstanding.</div>
                    <div>Provide an override note to launch anyway. This is recorded in the audit trail.</div>
                  </div>
                )}
                {(pendingStatus === "live" && (data.blockerCount > 0 || overrideRequired)) && (
                  <div>
                    <label className="text-sm font-medium">Override note (required)</label>
                    <Textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Why is launch proceeding despite blockers?" rows={3} />
                  </div>
                )}
                {activate.isError && <div className="text-sm text-rose-600">{(activate.error as Error).message}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => activate.mutate()} disabled={activate.isPending || (pendingStatus === "live" && data.blockerCount > 0 && !overrideNote)}>
                  {activate.isPending ? "Updating…" : "Confirm"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Progress value={data.completionPct} className="mt-3" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</div>
            <div className="divide-y rounded-md border">
              {items.map(it => (
                <div key={it.key} className="flex items-start gap-3 p-3">
                  {it.status === "complete"
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    : it.severity === "blocker"
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
                      : <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${it.status === "complete" ? "line-through text-muted-foreground" : ""}`}>{it.label}</span>
                      {it.status !== "complete" && it.severity === "blocker" && <Badge variant="destructive" className="text-[10px]">Blocker</Badge>}
                      {it.status !== "complete" && it.severity === "warning" && <Badge variant="secondary" className="text-[10px]">Warning</Badge>}
                    </div>
                    {it.hint && <p className="mt-0.5 text-xs text-muted-foreground">{it.hint}</p>}
                  </div>
                  {it.link && it.status !== "complete" && (
                    <Link href={it.link}><Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3" /></Button></Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.partner.launchOverrideNote && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">
            <div className="font-medium text-amber-900">Launch override on file</div>
            <div className="text-amber-800">{data.partner.launchOverrideNote}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
