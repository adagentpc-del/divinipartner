import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Clock, Inbox, Zap, Bell, ListChecks, Settings2, RotateCw } from "lucide-react";

const HEALTH_COLOR: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-700 border-emerald-200",
  due_soon: "bg-amber-100 text-amber-700 border-amber-200",
  at_risk: "bg-orange-100 text-orange-700 border-orange-200",
  overdue: "bg-rose-100 text-rose-700 border-rose-200",
  blocked: "bg-rose-100 text-rose-700 border-rose-200",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-rose-100 text-rose-700",
};
const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-700",
};

function fmtDate(d: any): string {
  if (!d) return "—";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "—";
  return x.toLocaleDateString();
}

export default function WorkflowDashboard() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("queue");
  const [filter, setFilter] = useState("");

  const { data: queue } = useQuery<any>({ queryKey: ["/api/workflow/queue"], queryFn: () => apiFetch("/api/workflow/queue"), refetchInterval: 15000 });
  const { data: rules = [] } = useQuery<any[]>({ queryKey: ["/api/workflow/rules"], queryFn: () => apiFetch("/api/workflow/rules") });
  const { data: audit = [] } = useQuery<any[]>({ queryKey: ["/api/workflow/audit"], queryFn: () => apiFetch("/api/workflow/audit") });

  const counters = queue?.counters || {};
  const tasks: any[] = queue?.tasks || [];
  const alerts: any[] = queue?.alerts || [];

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/workflow/queue"] });
    qc.invalidateQueries({ queryKey: ["/api/workflow/audit"] });
  };

  async function tickNow() {
    await apiFetch("/api/workflow/tick", { method: "POST" });
    setTimeout(refreshAll, 500);
  }
  async function completeTask(id: number) {
    await apiFetch(`/api/workflow/tasks/${id}/complete`, { method: "POST", body: JSON.stringify({}) });
    refreshAll();
  }
  async function snoozeTask(id: number, days = 1) {
    await apiFetch(`/api/workflow/tasks/${id}/snooze`, { method: "POST", body: JSON.stringify({ days }) });
    refreshAll();
  }
  async function resolveAlert(id: number) {
    await apiFetch(`/api/workflow/alerts/${id}/resolve`, { method: "POST", body: JSON.stringify({}) });
    refreshAll();
  }

  const filteredTasks = tasks.filter(t => !filter || t.title.toLowerCase().includes(filter.toLowerCase()));
  const overdueTasks = filteredTasks.filter(t => t.deadlineHealth === "overdue");
  const dueSoonTasks = filteredTasks.filter(t => t.deadlineHealth === "due_soon" || t.deadlineHealth === "at_risk");
  const escalatedTasks = filteredTasks.filter(t => ["high", "urgent"].includes(t.escalationLevel) || t.priority === "urgent");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Orchestration</h1>
          <p className="text-muted-foreground mt-1">Auto-created tasks, alerts, deadline health, and rule firings — your operational nerve center.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={tickNow} title="Run a deadline sweep right now">
            <RotateCw className="h-4 w-4 mr-2" /> Run sweep now
          </Button>
          <Link href="/admin/workflow/rules">
            <Button size="sm"><Settings2 className="h-4 w-4 mr-2" /> Manage rules</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <CounterCard label="Open tasks" value={counters.openTasks ?? 0} icon={ListChecks} tone="slate" />
        <CounterCard label="Overdue" value={counters.overdueTasks ?? 0} icon={Clock} tone="rose" />
        <CounterCard label="Due soon" value={counters.dueSoonTasks ?? 0} icon={Clock} tone="amber" />
        <CounterCard label="Urgent" value={counters.urgentTasks ?? 0} icon={Zap} tone="orange" />
        <CounterCard label="Escalated" value={counters.escalatedTasks ?? 0} icon={AlertTriangle} tone="orange" />
        <CounterCard label="Open alerts" value={counters.unresolvedAlerts ?? 0} icon={Bell} tone="blue" />
        <CounterCard label="Critical" value={counters.criticalAlerts ?? 0} icon={AlertTriangle} tone="rose" />
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Search tasks…" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-xs" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">All ({filteredTasks.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdueTasks.length})</TabsTrigger>
          <TabsTrigger value="due_soon">Due soon ({dueSoonTasks.length})</TabsTrigger>
          <TabsTrigger value="escalated">Escalated ({escalatedTasks.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="audit">Activity</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue"><TaskGrid tasks={filteredTasks} onComplete={completeTask} onSnooze={snoozeTask} /></TabsContent>
        <TabsContent value="overdue"><TaskGrid tasks={overdueTasks} onComplete={completeTask} onSnooze={snoozeTask} /></TabsContent>
        <TabsContent value="due_soon"><TaskGrid tasks={dueSoonTasks} onComplete={completeTask} onSnooze={snoozeTask} /></TabsContent>
        <TabsContent value="escalated"><TaskGrid tasks={escalatedTasks} onComplete={completeTask} onSnooze={snoozeTask} /></TabsContent>

        <TabsContent value="alerts">
          {alerts.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No open alerts.</Card>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <Card key={a.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={SEVERITY_COLOR[a.severity] || ""}>{a.severity}</Badge>
                      <span className="font-semibold">{a.title}</span>
                      {a.linkedObjectType && <Badge variant="outline" className="text-xs">{a.linkedObjectType} #{a.linkedObjectId}</Badge>}
                    </div>
                    {a.message && <p className="text-sm text-muted-foreground mt-1">{a.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveAlert(a.id)}>Resolve</Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          {audit.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No activity yet.</Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Summary</th>
                    <th className="p-3">Object</th>
                    <th className="p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(0, 100).map(a => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{a.eventType}</Badge></td>
                      <td className="p-3">
                        {a.summary}
                        {a.overrideNote && <p className="text-xs text-amber-700 italic mt-1">Override: "{a.overrideNote}"</p>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{a.objectType ? `${a.objectType} #${a.objectId ?? "?"}` : "—"}</td>
                      <td className="p-3 text-xs">{a.isAutomated ? <Badge variant="secondary">auto</Badge> : <Badge>manual</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rules">
          <RuleQuickList rules={rules} onChanged={() => qc.invalidateQueries({ queryKey: ["/api/workflow/rules"] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CounterCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <Card className="p-3">
      <div className={`inline-flex items-center justify-center h-8 w-8 rounded-md ${tones[tone] || tones.slate}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

function TaskGrid({ tasks, onComplete, onSnooze }: { tasks: any[]; onComplete: (id: number) => void; onSnooze: (id: number) => void }) {
  if (tasks.length === 0) return <Card className="p-10 text-center text-muted-foreground"><Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />Nothing in this queue.</Card>;
  return (
    <div className="space-y-2">
      {tasks.map(t => (
        <Card key={t.id} className="p-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={PRIORITY_COLOR[t.priority] || ""}>{t.priority}</Badge>
              {t.deadlineHealth && <Badge className={HEALTH_COLOR[t.deadlineHealth] || ""}>{t.deadlineHealth.replace("_", " ")}</Badge>}
              {t.autoCreated && <Badge variant="secondary" className="text-xs">auto</Badge>}
              {t.escalationLevel !== "none" && <Badge variant="outline" className="text-xs">esc: {t.escalationLevel}</Badge>}
              <Badge variant="outline" className="text-xs">{t.category}</Badge>
            </div>
            <p className="font-semibold mt-1">{t.title}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              <span>Due {fmtDate(t.dueDate)}</span>
              {t.linkedObjectType && (
                <Link href={t.orderId ? `/admin/orders/${t.orderId}` : t.invoiceId ? `/admin/billing/invoices/${t.invoiceId}` : "#"}>
                  <span className="underline-offset-2 hover:underline cursor-pointer">{t.linkedObjectType} #{t.linkedObjectId}</span>
                </Link>
              )}
              {t.notes && <span className="italic">{t.notes}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onSnooze(t.id)}>Snooze 1d</Button>
            <Button size="sm" onClick={() => onComplete(t.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Done</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function RuleQuickList({ rules, onChanged }: { rules: any[]; onChanged: () => void }) {
  async function toggle(id: number) {
    await apiFetch(`/api/workflow/rules/${id}/toggle`, { method: "POST", body: JSON.stringify({}) });
    onChanged();
  }
  return (
    <div className="space-y-2">
      {rules.map(r => (
        <Card key={r.id} className="p-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{r.triggerType}</Badge>
              {r.isSystem && <Badge variant="secondary" className="text-xs">system</Badge>}
              <Badge className={r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>{r.isActive ? "active" : "inactive"}</Badge>
              <Badge className={PRIORITY_COLOR[r.priority] || ""}>{r.priority}</Badge>
            </div>
            <p className="font-semibold mt-1">{r.name}</p>
            {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">{(r.actionsJson || []).length} action(s) · {r.objectType || "any"} object</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => toggle(r.id)}>{r.isActive ? "Disable" : "Enable"}</Button>
            <Link href="/admin/workflow/rules"><Button size="sm" variant="ghost">Edit</Button></Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
