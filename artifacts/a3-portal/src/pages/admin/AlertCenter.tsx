import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Bell, Plus, RefreshCw } from "lucide-react";
import AlertList from "@/components/admin/AlertList";
import { ALERT_TYPE_LABEL, type AlertsResponse, type AlertType, type AlertSeverity } from "@/lib/alertTypes";

const SEVERITIES: AlertSeverity[] = ["critical", "warning", "info"];

export default function AlertCenter() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [sevFilter, setSevFilter] = useState<AlertSeverity | "all">("all");
  const [followupOpen, setFollowupOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/alerts"],
    queryFn: () => apiFetch("/api/admin/alerts"),
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(() => {
    const items = data?.alerts ?? [];
    return items.filter(a => (typeFilter === "all" || a.type === typeFilter) && (sevFilter === "all" || a.severity === sevFilter));
  }, [data, typeFilter, sevFilter]);

  const summary = data?.summary;

  const followup = useMutation({
    mutationFn: (body: { title: string; note?: string; partnerId?: number; orderId?: number }) =>
      apiFetch("/api/admin/alerts/manual-followup", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/alerts/summary"] });
      setFollowupOpen(false);
    },
  });

  const supportIssue = useMutation({
    mutationFn: (body: { subject: string; body?: string; severity?: AlertSeverity; partnerId?: number; contactPhone?: string }) =>
      apiFetch("/api/admin/support-issues", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/alerts/summary"] });
      setIssueOpen(false);
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <Card className="max-w-md mx-auto mt-12 border-destructive/40"><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Couldn't load alerts</CardTitle></CardHeader></Card>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bell className="h-5 w-5" /> Alert Center</h1>
          <p className="text-sm text-muted-foreground">Operational alerts derived from current system state. Resolve the underlying issue and the alert clears automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}><RefreshCw className={`h-3.5 w-3.5 mr-2 ${isRefetching ? "animate-spin" : ""}`} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setIssueOpen(true)}><Plus className="h-3.5 w-3.5 mr-2" />Log support issue</Button>
          <Button size="sm" onClick={() => setFollowupOpen(true)}><Plus className="h-3.5 w-3.5 mr-2" />Add follow-up</Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Total" value={summary.total} tone="default" />
          <Tile label="Critical" value={summary.bySeverity.critical} tone="critical" />
          <Tile label="Warning" value={summary.bySeverity.warning} tone="warning" />
          <Tile label="Info" value={summary.bySeverity.info} tone="info" />
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs text-muted-foreground">Severity:</span>
        <FilterPill active={sevFilter === "all"} onClick={() => setSevFilter("all")}>All</FilterPill>
        {SEVERITIES.map(s => (
          <FilterPill key={s} active={sevFilter === s} onClick={() => setSevFilter(s)}>{s} ({summary?.bySeverity[s] ?? 0})</FilterPill>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Type:</span>
        <FilterPill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</FilterPill>
        {Object.entries(ALERT_TYPE_LABEL).map(([t, label]) => (
          <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t as AlertType)}>
            {label} ({summary?.byType[t as AlertType] ?? 0})
          </FilterPill>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <AlertList alerts={filtered} emptyText="Nothing matches these filters." />
        </CardContent>
      </Card>

      <FollowupDialog open={followupOpen} onOpenChange={setFollowupOpen} onSubmit={(b) => followup.mutate(b)} pending={followup.isPending} />
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onSubmit={(b) => supportIssue.mutate(b)} pending={supportIssue.isPending} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: "default" | "critical" | "warning" | "info" }) {
  const toneCls = tone === "critical" ? "border-red-200 bg-red-50" : tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "info" ? "border-sky-200 bg-sky-50" : "";
  return (
    <Card className={toneCls}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`text-xs px-2.5 py-1 rounded-full border capitalize ${active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function FollowupDialog({ open, onOpenChange, onSubmit, pending }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (b: any) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [orderId, setOrderId] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add manual follow-up</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title (e.g. Call partner about late artwork)" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Partner ID (optional)" value={partnerId} onChange={e => setPartnerId(e.target.value)} />
            <Input placeholder="Order ID (optional)" value={orderId} onChange={e => setOrderId(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim() || pending} onClick={() => onSubmit({ title: title.trim(), note: note.trim() || undefined, partnerId: partnerId ? Number(partnerId) : undefined, orderId: orderId ? Number(orderId) : undefined })}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}Add follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueDialog({ open, onOpenChange, onSubmit, pending }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (b: any) => void; pending: boolean }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AlertSeverity>("warning");
  const [partnerId, setPartnerId] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log support issue</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          <Textarea placeholder="Details" value={body} onChange={e => setBody(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={severity} onChange={e => setSeverity(e.target.value as AlertSeverity)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <Input placeholder="Partner ID (optional)" value={partnerId} onChange={e => setPartnerId(e.target.value)} />
          </div>
          <Input placeholder="Contact phone for SMS routing (optional, future)" value={phone} onChange={e => setPhone(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">SMS routing is recorded for audit only — provider not yet wired.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!subject.trim() || pending} onClick={() => onSubmit({ subject: subject.trim(), body: body.trim() || undefined, severity, partnerId: partnerId ? Number(partnerId) : undefined, contactPhone: phone.trim() || undefined })}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}Log issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
