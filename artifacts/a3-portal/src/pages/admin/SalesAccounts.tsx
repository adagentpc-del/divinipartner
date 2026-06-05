import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Building2, Search } from "lucide-react";

type Account = {
  id: number;
  companyName: string;
  parentCompany: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  industry: string | null;
  ownerRepId: number | null;
  status: string;
  notes: string | null;
};

type Rep = { id: number; firstName: string; lastName: string; status: string };

const STATUSES = ["active", "prospect", "past_client", "lost", "dormant"];

type FormState = {
  companyName: string; parentCompany: string; contactName: string; contactEmail: string;
  contactPhone: string; website: string; industry: string; ownerRepId: string; status: string; notes: string;
};

const EMPTY: FormState = {
  companyName: "", parentCompany: "", contactName: "", contactEmail: "",
  contactPhone: "", website: "", industry: "", ownerRepId: "", status: "prospect", notes: "",
};

export default function SalesAccounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [search, setSearch] = useState("");

  const me = useQuery<{ role: string }>({ queryKey: ["/api/sales/me"], queryFn: () => apiFetch("/api/sales/me") });
  const isSuperAdmin = me.data?.role === "super_admin";

  const { data: accounts, isLoading, isError, refetch } = useQuery<Account[]>({
    queryKey: ["/api/sales/accounts"],
    queryFn: () => apiFetch("/api/sales/accounts"),
  });

  const { data: reps } = useQuery<Rep[]>({
    queryKey: ["/api/sales/reps"],
    queryFn: () => apiFetch("/api/sales/reps"),
    enabled: isSuperAdmin,
  });

  const saveMut = useMutation({
    mutationFn: (body: FormState) => {
      const payload = {
        companyName: body.companyName,
        parentCompany: body.parentCompany || null,
        contactName: body.contactName || null,
        contactEmail: body.contactEmail || null,
        contactPhone: body.contactPhone || null,
        website: body.website || null,
        industry: body.industry || null,
        ownerRepId: body.ownerRepId ? Number(body.ownerRepId) : null,
        status: body.status,
        notes: body.notes || null,
      };
      return editing
        ? apiFetch(`/api/sales/accounts/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/api/sales/accounts", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales/accounts"] });
      toast({ title: editing ? "Account updated" : "Account created" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({
      companyName: a.companyName, parentCompany: a.parentCompany || "", contactName: a.contactName || "",
      contactEmail: a.contactEmail || "", contactPhone: a.contactPhone || "", website: a.website || "",
      industry: a.industry || "", ownerRepId: a.ownerRepId ? String(a.ownerRepId) : "", status: a.status, notes: a.notes || "",
    });
    setOpen(true);
  };

  const repName = (id: number | null) => {
    if (!id) return "Unassigned";
    const r = reps?.find((x) => x.id === id);
    return r ? `${r.firstName} ${r.lastName}` : `Rep #${id}`;
  };

  const filtered = (accounts || []).filter((a) =>
    !search || a.companyName.toLowerCase().includes(search.toLowerCase()) || (a.contactName || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load accounts. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" />Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">{isSuperAdmin ? "All client accounts. Assign an owner so matching intakes route to them." : "Your assigned accounts."}</p>
        </div>
        {isSuperAdmin && <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />New Account</Button>}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company or contact" className="pl-9" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{a.companyName}</div>
                  {a.parentCompany && <div className="text-xs text-muted-foreground truncate">{a.parentCompany}</div>}
                  {a.contactName && <div className="text-xs text-muted-foreground mt-1 truncate">{a.contactName}{a.contactEmail ? ` · ${a.contactEmail}` : ""}</div>}
                </div>
                {isSuperAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="secondary" className="text-[10px] capitalize">{a.status.replace("_", " ")}</Badge>
                <Badge variant="outline" className="text-[10px]">Owner: {repName(a.ownerRepId)}</Badge>
                {a.industry && <Badge variant="outline" className="text-[10px]">{a.industry}</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No accounts {search ? "match your search" : "yet"}.</CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Company Name *</Label><Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} /></div>
            <div><Label>Parent Company</Label><Input value={form.parentCompany} onChange={(e) => setForm((f) => ({ ...f, parentCompany: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} /></div>
              <div><Label>Contact Phone</Label><Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm capitalize" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Account Owner</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.ownerRepId} onChange={(e) => setForm((f) => ({ ...f, ownerRepId: e.target.value }))}>
                <option value="">Unassigned</option>
                {reps?.filter((r) => r.status === "active").map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}
              </select>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="min-h-[60px] resize-none" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.companyName.trim() || saveMut.isPending} className="gap-2">
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
