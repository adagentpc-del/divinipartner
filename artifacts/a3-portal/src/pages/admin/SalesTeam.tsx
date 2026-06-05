import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Pencil, ShieldCheck, Mail, Phone, Users } from "lucide-react";

type Rep = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: "super_admin" | "sales_rep";
  status: "active" | "inactive";
  notificationEmail: string | null;
  notes: string | null;
};

type FormState = {
  firstName: string; lastName: string; email: string; phone: string;
  role: "super_admin" | "sales_rep"; status: "active" | "inactive";
  notificationEmail: string; notes: string;
};

const EMPTY: FormState = {
  firstName: "", lastName: "", email: "", phone: "",
  role: "sales_rep", status: "active", notificationEmail: "", notes: "",
};

export default function SalesTeam() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rep | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: reps, isLoading, isError, refetch } = useQuery<Rep[]>({
    queryKey: ["/api/sales/reps"],
    queryFn: () => apiFetch("/api/sales/reps"),
  });

  const saveMut = useMutation({
    mutationFn: (body: FormState) => {
      const payload = {
        ...body,
        phone: body.phone || null,
        notificationEmail: body.notificationEmail || null,
        notes: body.notes || null,
      };
      return editing
        ? apiFetch(`/api/sales/reps/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/api/sales/reps", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales/reps"] });
      toast({ title: editing ? "Team member updated" : "Team member added" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (rep: Rep) => {
    setEditing(rep);
    setForm({
      firstName: rep.firstName, lastName: rep.lastName, email: rep.email, phone: rep.phone || "",
      role: rep.role, status: rep.status, notificationEmail: rep.notificationEmail || "", notes: rep.notes || "",
    });
    setOpen(true);
  };

  const canSave = form.firstName.trim() && form.lastName.trim() && /^\S+@\S+\.\S+$/.test(form.email);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load the team. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" />Sales Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Add reps and Super Admins. Each person logs in with their own account; their email links them to the role and records here.</p>
        </div>
        <Button onClick={openNew} className="gap-2"><UserPlus className="h-4 w-4" />Add Team Member</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reps?.map((rep) => (
          <Card key={rep.id} className={rep.status === "inactive" ? "opacity-60" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    {rep.firstName} {rep.lastName}
                    {rep.role === "super_admin" && <ShieldCheck className="h-4 w-4 text-amber-500" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Mail className="h-3 w-3" />{rep.email}</div>
                  {rep.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{rep.phone}</div>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rep)}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="flex gap-2 mt-3">
                <Badge variant={rep.role === "super_admin" ? "default" : "secondary"} className="text-[10px]">{rep.role === "super_admin" ? "Super Admin" : "Sales Rep"}</Badge>
                <Badge variant={rep.status === "active" ? "outline" : "destructive"} className="text-[10px]">{rep.status}</Badge>
              </div>
              {rep.notes && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{rep.notes}</p>}
            </CardContent>
          </Card>
        ))}
        {reps?.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No team members yet. Add Alyssa, Drew, and Retta to start routing intakes to them.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Team Member" : "Add Team Member"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
              <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div><Label>Login Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="rep@a3visual.com" /></div>
            <p className="text-xs text-muted-foreground -mt-2">This must match the email they sign in with. For "Drew", set first name to <strong>Drew</strong> so the /intake/drew link routes to them.</p>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as FormState["role"] }))}>
                  <option value="sales_rep">Sales Rep</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FormState["status"] }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div><Label>Notification Email (optional)</Label><Input type="email" value={form.notificationEmail} onChange={(e) => setForm((f) => ({ ...f, notificationEmail: e.target.value }))} placeholder="Where routed-lead emails go (defaults to login email)" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="min-h-[60px] resize-none" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!canSave || saveMut.isPending} className="gap-2">
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
