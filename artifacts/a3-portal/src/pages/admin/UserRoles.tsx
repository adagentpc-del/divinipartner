import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Pencil, Trash2, UserCog } from "lucide-react";

type Role = { id: number; userId: string | null; email: string; fullName: string | null; role: string; partnerId: number | null; supplierId: number | null; isActive: boolean; invitedAt: string | null; acceptedAt: string | null };
type Partner = { id: number; companyName: string };
type Supplier = { id: number; name: string };

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "internal_admin", label: "Internal Admin / PM" },
  { value: "partner_manager", label: "Partner Manager" },
  { value: "client_user", label: "Client User" },
  { value: "vendor_user", label: "Vendor User" },
];

function RoleDialog({ partners, suppliers, role, trigger, onSaved }: { partners: Partner[]; suppliers: Supplier[]; role?: Role | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    email: role?.email || "", fullName: role?.fullName || "", role: role?.role || "client_user",
    partnerId: role?.partnerId?.toString() || "", supplierId: role?.supplierId?.toString() || "",
    isActive: role?.isActive ?? true,
  });
  const handleSave = async () => {
    try {
      const body: any = {
        email: form.email, fullName: form.fullName || null, role: form.role,
        partnerId: form.partnerId ? parseInt(form.partnerId) : null,
        supplierId: form.supplierId ? parseInt(form.supplierId) : null,
        isActive: form.isActive,
      };
      if (role) await apiFetch(`/api/user-roles/${role.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/user-roles`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: role ? "User updated" : "User invited" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{role ? "Edit User" : "Invite User"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Full Name</Label><Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></div>
          <div><Label>Role</Label><Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
          {(form.role === "partner_manager" || form.role === "client_user") && <div><Label>Partner</Label><Select value={form.partnerId} onValueChange={v => setForm({ ...form, partnerId: v })}><SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger><SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent></Select></div>}
          {form.role === "vendor_user" && <div><Label>Supplier</Label><Select value={form.supplierId} onValueChange={v => setForm({ ...form, supplierId: v })}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.email}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UserRoles() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: roles = [], isLoading } = useQuery<Role[]>({ queryKey: ["/api/user-roles"], queryFn: () => apiFetch("/api/user-roles") });
  const { data: partners = [] } = useQuery<Partner[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const refetch = () => qc.invalidateQueries({ queryKey: ["/api/user-roles"] });
  const del = useMutation({ mutationFn: (id: number) => apiFetch(`/api/user-roles/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Removed" }); } });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground mt-1">{roles.length} user{roles.length !== 1 ? "s" : ""}</p>
        </div>
        <RoleDialog partners={partners} suppliers={suppliers} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Invite User</Button>} onSaved={refetch} />
      </div>
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/50"><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Scope</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {roles.map(r => {
              const partnerName = partners.find(p => p.id === r.partnerId)?.companyName;
              const supplierName = suppliers.find(s => s.id === r.supplierId)?.name;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.email}</TableCell>
                  <TableCell>{r.fullName || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{ROLES.find(x => x.value === r.role)?.label || r.role}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{partnerName || supplierName || "Global"}</TableCell>
                  <TableCell>{r.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1">
                    <RoleDialog partners={partners} suppliers={suppliers} role={r} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetch} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Remove ${r.email}?`)) del.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
            {roles.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12"><UserCog className="h-10 w-10 mx-auto mb-2 opacity-40" />No users yet. Invite your first user.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
