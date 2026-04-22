import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import { Loader2, Plus, Send, Trash2, Users, Pencil, Check, X } from "lucide-react";

const ROLES = [
  { value: "ops", label: "Ops", desc: "Receives the operational order summary." },
  { value: "finance", label: "Finance", desc: "Receives a billing-focused notification." },
  { value: "partner_contact", label: "Partner Contact", desc: "Polished, partner-facing summary." },
  { value: "vendor", label: "Vendor", desc: "Reserved for vendor notifications." },
  { value: "cc", label: "CC", desc: "CC'd on the ops email." },
  { value: "bcc", label: "BCC", desc: "BCC'd on the ops email." },
] as const;

type Role = typeof ROLES[number]["value"];

interface Recipient {
  id: number;
  partnerId: number;
  role: Role;
  email: string;
  label: string | null;
  isActive: boolean;
  notes: string | null;
  sortOrder: number;
}

export function RecipientsManager({ partnerId }: { partnerId: number }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Recipient[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Inline add form
  const [draftRole, setDraftRole] = useState<Role>("ops");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editRole, setEditRole] = useState<Role>("ops");

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/email-recipients`));
      const data = res.ok ? await res.json() : [];
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [partnerId]);

  const grouped = useMemo(() => {
    const g: Record<Role, Recipient[]> = { ops: [], finance: [], partner_contact: [], vendor: [], cc: [], bcc: [] };
    for (const r of (items ?? [])) g[r.role]?.push(r);
    return g;
  }, [items]);

  async function add() {
    const email = draftEmail.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setBusyId("add");
    try {
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/email-recipients`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: draftRole, email, label: draftLabel.trim() || null, isActive: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Could not add recipient", description: json.error || `HTTP ${res.status}`, variant: "destructive" }); return; }
      setDraftEmail("");
      setDraftLabel("");
      await reload();
      toast({ title: "Recipient added" });
    } finally {
      setBusyId(null);
    }
  }

  async function patch(id: number, body: any, label?: string) {
    setBusyId(`p${id}`);
    try {
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/email-recipients/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Update failed", description: json.error || `HTTP ${res.status}`, variant: "destructive" }); return; }
      await reload();
      if (label) toast({ title: label });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remove this recipient? They won't receive future order emails.")) return;
    setBusyId(`d${id}`);
    try {
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/email-recipients/${id}`), { method: "DELETE" });
      if (!res.ok) { toast({ title: "Delete failed", variant: "destructive" }); return; }
      await reload();
      toast({ title: "Recipient removed" });
    } finally {
      setBusyId(null);
    }
  }

  async function testSend(role: Role, to: string) {
    setBusyId(`t${role}-${to}`);
    try {
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/test-role-email`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, to }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) toast({ title: `Test ${role} email sent to ${to}` });
      else toast({ title: "Test send failed", description: json.error || `HTTP ${res.status}`, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card id="sec-email-recipients" className="scroll-mt-20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Email Recipients
          <span className="text-xs font-normal text-muted-foreground ml-auto">Per-role routing</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Route each new order to multiple addresses by audience. Each role uses a tailored template.
          When a role has no recipients here, the system falls back to the legacy Communications fields above
          (internal forwarding email, CC email, billing contact).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading recipients…</div>
        )}

        {!loading && (
          <div className="space-y-4">
            {ROLES.map((roleDef) => {
              const list = grouped[roleDef.value] ?? [];
              return (
                <div key={roleDef.value} className="rounded-md border bg-muted/20">
                  <div className="px-3 py-2 flex items-center gap-2 border-b">
                    <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">{roleDef.label}</Badge>
                    <span className="text-xs text-muted-foreground">{roleDef.desc}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{list.length} recipient{list.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="divide-y">
                    {list.length === 0 && (
                      <div className="px-3 py-3 text-xs text-muted-foreground italic">No recipients configured for this role.</div>
                    )}
                    {list.map((r) => {
                      const isEditing = editingId === r.id;
                      return (
                        <div key={r.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                          {isEditing ? (
                            <>
                              <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>{ROLES.map(rd => <SelectItem key={rd.value} value={rd.value}>{rd.label}</SelectItem>)}</SelectContent>
                              </Select>
                              <Input className="h-8 flex-1 min-w-[200px]" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                              <Input className="h-8 w-44" placeholder="Label (optional)" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                              <Button type="button" size="sm" variant="ghost" disabled={busyId === `p${r.id}`} onClick={async () => {
                                await patch(r.id, { role: editRole, email: editEmail.trim(), label: editLabel.trim() || null }, "Recipient updated");
                                setEditingId(null);
                              }}><Check className="h-4 w-4" /></Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Checkbox
                                checked={r.isActive}
                                disabled={busyId === `p${r.id}`}
                                onCheckedChange={(checked) => patch(r.id, { isActive: !!checked }, checked ? "Recipient enabled" : "Recipient disabled")}
                              />
                              <div className="flex-1 min-w-[200px]">
                                <div className={`text-sm font-medium ${r.isActive ? "" : "text-muted-foreground line-through"}`}>{r.email}</div>
                                {r.label && <div className="text-xs text-muted-foreground">{r.label}</div>}
                              </div>
                              <Button type="button" size="sm" variant="outline" disabled={busyId?.startsWith(`t${r.role}-${r.email}`)} onClick={() => testSend(r.role, r.email)}>
                                {busyId === `t${r.role}-${r.email}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                <span className="ml-1 text-xs">Test</span>
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingId(r.id); setEditEmail(r.email); setEditLabel(r.label || ""); setEditRole(r.role); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" size="sm" variant="ghost" disabled={busyId === `d${r.id}`} onClick={() => remove(r.id)}>
                                {busyId === `d${r.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new recipient */}
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add recipient</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={draftRole} onValueChange={(v) => setDraftRole(v as Role)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(rd => <SelectItem key={rd.value} value={rd.value}>{rd.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-9 flex-1 min-w-[220px]" type="email" placeholder="email@partner.com" value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} />
            <Input className="h-9 w-48" placeholder="Label (optional)" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} />
            <Button type="button" size="sm" disabled={busyId === "add"} onClick={add}>
              {busyId === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Add</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
