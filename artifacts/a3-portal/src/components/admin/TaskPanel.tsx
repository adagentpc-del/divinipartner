import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, ListChecks, Plus } from "lucide-react";

const HEALTH_COLOR: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-700",
  due_soon: "bg-amber-100 text-amber-700",
  at_risk: "bg-orange-100 text-orange-700",
  overdue: "bg-rose-100 text-rose-700",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-rose-100 text-rose-700",
};

export default function TaskPanel({ orderId, invoiceId, eventId, partnerId, supplierId }: { orderId?: number; invoiceId?: number; eventId?: number; partnerId?: number; supplierId?: number }) {
  const qc = useQueryClient();
  const params = new URLSearchParams({ status: "open_any" });
  if (orderId) params.set("orderId", String(orderId));
  if (invoiceId) params.set("invoiceId", String(invoiceId));
  if (eventId) params.set("eventId", String(eventId));
  if (partnerId) params.set("partnerId", String(partnerId));
  if (supplierId) params.set("supplierId", String(supplierId));
  const path = `/api/workflow/tasks?${params.toString()}`;

  const { data: tasks = [] } = useQuery<any[]>({ queryKey: [path], queryFn: () => apiFetch(path) });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: [path] });

  async function complete(id: number) {
    await apiFetch(`/api/workflow/tasks/${id}/complete`, { method: "POST", body: JSON.stringify({}) });
    refresh();
  }
  async function snooze(id: number) {
    await apiFetch(`/api/workflow/tasks/${id}/snooze`, { method: "POST", body: JSON.stringify({ days: 1 }) });
    refresh();
  }
  async function add() {
    if (!title.trim()) return;
    await apiFetch("/api/workflow/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        category: invoiceId ? "billing_follow_up" : eventId ? "event_prep" : orderId ? "production_review" : "general",
        priority: "medium",
        orderId: orderId ?? null,
        invoiceId: invoiceId ?? null,
        eventId: eventId ?? null,
        partnerId: partnerId ?? null,
        supplierId: supplierId ?? null,
        linkedObjectType: orderId ? "order" : invoiceId ? "invoice" : eventId ? "event" : null,
        linkedObjectId: orderId ?? invoiceId ?? eventId ?? null,
      }),
    });
    setTitle(""); setAdding(false); refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Workflow tasks</h3>
          <Badge variant="outline" className="text-xs">{tasks.length} open</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 mb-3">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" autoFocus onKeyDown={e => e.key === "Enter" && add()} />
          <Button size="sm" onClick={add}>Save</Button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No open tasks for this record.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <div key={t.id} className="flex items-start justify-between gap-2 p-2 border rounded">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <Badge className={`${PRIORITY_COLOR[t.priority] || ""} text-xs`}>{t.priority}</Badge>
                  {t.deadlineHealth && <Badge className={`${HEALTH_COLOR[t.deadlineHealth] || ""} text-xs`}>{t.deadlineHealth.replace("_", " ")}</Badge>}
                  {t.autoCreated && <Badge variant="secondary" className="text-xs">auto</Badge>}
                </div>
                <p className="text-sm font-medium">{t.title}</p>
                {t.dueDate && <p className="text-xs text-muted-foreground">Due {new Date(t.dueDate).toLocaleDateString()}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => snooze(t.id)}>+1d</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => complete(t.id)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
