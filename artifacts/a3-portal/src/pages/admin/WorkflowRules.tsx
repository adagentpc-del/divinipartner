import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { ChevronLeft, Copy, Trash2 } from "lucide-react";

const TRIGGERS = [
  "asset.uploaded", "asset.approved", "asset.revision_requested", "asset.awaiting_approval",
  "order.submitted", "order.approved",
  "supplier.assigned", "supplier.status_changed",
  "production.blocked", "production.unblocked", "production.ready",
  "invoice.created", "invoice.sent", "invoice.overdue",
  "deadline.approaching", "deadline.overdue",
  "event.approaching",
  "reconciliation.discrepancy",
  "inventory.shortage",
];

export default function WorkflowRules() {
  const qc = useQueryClient();
  const { data: rules = [] } = useQuery<any[]>({ queryKey: ["/api/workflow/rules"], queryFn: () => apiFetch("/api/workflow/rules") });
  const [editing, setEditing] = useState<any | null>(null);

  async function toggle(id: number) {
    await apiFetch(`/api/workflow/rules/${id}/toggle`, { method: "POST", body: JSON.stringify({}) });
    qc.invalidateQueries({ queryKey: ["/api/workflow/rules"] });
  }
  async function duplicate(id: number) {
    await apiFetch(`/api/workflow/rules/${id}/duplicate`, { method: "POST", body: JSON.stringify({}) });
    qc.invalidateQueries({ queryKey: ["/api/workflow/rules"] });
  }
  async function remove(id: number) {
    if (!confirm("Delete this rule?")) return;
    await apiFetch(`/api/workflow/rules/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/workflow/rules"] });
  }

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rules) {
      const arr = m.get(r.triggerType) || [];
      arr.push(r); m.set(r.triggerType, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rules]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/workflow"><Button variant="ghost" size="sm" className="-ml-2 mb-1"><ChevronLeft className="h-4 w-4 mr-1" /> Back to workflow</Button></Link>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Rules</h1>
          <p className="text-muted-foreground mt-1">{rules.length} rule(s) · grouped by trigger.</p>
        </div>
        <Button onClick={() => setEditing({ name: "", triggerType: TRIGGERS[0], priority: "medium", escalationLevel: "none", isActive: true, conditionsJson: {}, actionsJson: [{ type: "create_task", params: { title: "New task", category: "general", dueInDays: 1 } }] })}>New rule</Button>
      </div>

      <div className="space-y-6">
        {grouped.map(([trigger, list]) => (
          <div key={trigger}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{trigger}</h2>
            <div className="space-y-2">
              {list.map(r => (
                <Card key={r.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>{r.isActive ? "active" : "inactive"}</Badge>
                      {r.isSystem && <Badge variant="secondary" className="text-xs">system</Badge>}
                      <Badge variant="outline" className="text-xs">{r.priority}</Badge>
                      {r.escalationLevel !== "none" && <Badge variant="outline" className="text-xs">esc: {r.escalationLevel}</Badge>}
                    </div>
                    <p className="font-semibold">{r.name}</p>
                    {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {(r.actionsJson || []).map((a: any) => a.type).join(", ") || "no actions"}
                      {r.objectType ? ` · object: ${r.objectType}` : ""}
                      {Object.keys(r.conditionsJson || {}).length > 0 ? " · has conditions" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => toggle(r.id)}>{r.isActive ? "Disable" : "Enable"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicate(r.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                    {!r.isSystem && <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <RuleEditor open={!!editing} rule={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["/api/workflow/rules"] }); }} />
    </div>
  );
}

function RuleEditor({ open, rule, onClose, onSaved }: { open: boolean; rule: any | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<any>(rule);
  if (!open || !rule) return null;
  const cur = draft || rule;
  const update = (patch: any) => setDraft({ ...cur, ...patch });

  async function save() {
    const body = {
      name: cur.name,
      description: cur.description || null,
      triggerType: cur.triggerType,
      objectType: cur.objectType || null,
      conditionsJson: typeof cur.conditionsJson === "string" ? safeJson(cur.conditionsJson, {}) : (cur.conditionsJson || {}),
      actionsJson: typeof cur.actionsJson === "string" ? safeJson(cur.actionsJson, []) : (cur.actionsJson || []),
      priority: cur.priority || "medium",
      escalationLevel: cur.escalationLevel || "none",
      isActive: cur.isActive !== false,
      notes: cur.notes || null,
    };
    if (cur.id) {
      await apiFetch(`/api/workflow/rules/${cur.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await apiFetch("/api/workflow/rules", { method: "POST", body: JSON.stringify(body) });
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cur.id ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Name</label>
            <Input value={cur.name || ""} onChange={e => update({ name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Trigger</label>
              <select className="w-full border rounded h-9 px-2 text-sm" value={cur.triggerType} onChange={e => update({ triggerType: e.target.value })}>
                {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Object type</label>
              <Input value={cur.objectType || ""} placeholder="order | invoice | asset…" onChange={e => update({ objectType: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Priority</label>
              <select className="w-full border rounded h-9 px-2 text-sm" value={cur.priority || "medium"} onChange={e => update({ priority: e.target.value })}>
                {["low", "medium", "high", "urgent"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Escalation</label>
              <select className="w-full border rounded h-9 px-2 text-sm" value={cur.escalationLevel || "none"} onChange={e => update({ escalationLevel: e.target.value })}>
                {["none", "low", "medium", "high", "urgent"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea rows={2} value={cur.description || ""} onChange={e => update({ description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium">Conditions (JSON)</label>
            <Textarea rows={3} className="font-mono text-xs" value={typeof cur.conditionsJson === "string" ? cur.conditionsJson : JSON.stringify(cur.conditionsJson || {}, null, 2)} onChange={e => update({ conditionsJson: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Example: {"{ \"all\": [{ \"field\": \"daysUntilDue\", \"op\": \"lte\", \"value\": 5 }] }"}</p>
          </div>
          <div>
            <label className="text-xs font-medium">Actions (JSON array)</label>
            <Textarea rows={6} className="font-mono text-xs" value={typeof cur.actionsJson === "string" ? cur.actionsJson : JSON.stringify(cur.actionsJson || [], null, 2)} onChange={e => update({ actionsJson: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Each: {"{ type: 'create_task' | 'create_alert' | 'draft_communication' | 'log_audit', params: {...} }"}</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={cur.isActive !== false} onChange={e => update({ isActive: e.target.checked })} />
            <label htmlFor="active" className="text-sm">Active</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}
