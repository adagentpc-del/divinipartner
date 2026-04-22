import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Pencil, Trash2, Truck, Upload } from "lucide-react";
import { ImportDialog } from "@/components/imports/ImportDialog";
import { EmptyStateCard } from "@/components/admin/EmptyStateCard";

type Supplier = {
  id: number; name: string; slug: string; description?: string | null;
  categoriesJson?: string[] | null; capabilitiesJson?: string[] | null; territoryJson?: string[] | null;
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  fulfillmentNotes?: string | null; isActive: boolean;
};

function SupplierDialog({ supplier, trigger, onSaved }: { supplier?: Supplier | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: supplier?.name || "",
    slug: supplier?.slug || "",
    description: supplier?.description || "",
    categories: (supplier?.categoriesJson || []).join(", "),
    capabilities: (supplier?.capabilitiesJson || []).join(", "),
    territory: (supplier?.territoryJson || []).join(", "),
    contactName: supplier?.contactName || "",
    contactEmail: supplier?.contactEmail || "",
    contactPhone: supplier?.contactPhone || "",
    fulfillmentNotes: supplier?.fulfillmentNotes || "",
    isActive: supplier?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null,
        categoriesJson: form.categories.split(",").map(s => s.trim()).filter(Boolean),
        capabilitiesJson: form.capabilities.split(",").map(s => s.trim()).filter(Boolean),
        territoryJson: form.territory.split(",").map(s => s.trim()).filter(Boolean),
        contactName: form.contactName || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        fulfillmentNotes: form.fulfillmentNotes || null,
        isActive: form.isActive,
      };
      if (supplier) await apiFetch(`/api/suppliers/${supplier.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/suppliers`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: supplier ? "Supplier updated" : "Supplier created" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{supplier ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto from name" /></div>
          </div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div><Label>Categories (comma separated)</Label><Input value={form.categories} onChange={e => setForm({ ...form, categories: e.target.value })} placeholder="Print, Fabrication, Immersive" /></div>
          <div><Label>Capabilities (comma separated)</Label><Input value={form.capabilities} onChange={e => setForm({ ...form, capabilities: e.target.value })} placeholder="Vinyl banners, Custom build" /></div>
          <div><Label>Territory (comma separated)</Label><Input value={form.territory} onChange={e => setForm({ ...form, territory: e.target.value })} placeholder="USA, Canada" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></div>
            <div><Label>Contact Email</Label><Input value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} /></div>
            <div><Label>Contact Phone</Label><Input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></div>
          </div>
          <div><Label>Fulfillment Notes</Label><Textarea value={form.fulfillmentNotes} onChange={e => setForm({ ...form, fulfillmentNotes: e.target.value })} rows={2} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={saving || !form.name}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersList() {
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const { data: suppliers, isLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground mt-1">{suppliers?.length || 0} supplier{suppliers?.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Import Suppliers</Button>
          <SupplierDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add Supplier</Button>} onSaved={() => qc.invalidateQueries({ queryKey: ["/api/suppliers"] })} />
        </div>
        <ImportDialog resource="suppliers" open={importOpen} onOpenChange={setImportOpen} onComplete={() => qc.invalidateQueries({ queryKey: ["/api/suppliers"] })} />
      </div>

      {suppliers && suppliers.length > 0 ? (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-muted/50"><TableHead>Supplier</TableHead><TableHead>Categories</TableHead><TableHead>Territory</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {suppliers.map(s => (
                <TableRow key={s.id}>
                  <TableCell><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Truck className="h-4 w-4 text-muted-foreground" /></div><div><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.slug}</div></div></div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(s.categoriesJson || []).map(c => <Badge key={c} variant="secondary">{c}</Badge>)}</div></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(s.territoryJson || []).join(", ")}</TableCell>
                  <TableCell className="text-sm">{s.contactName}<br /><span className="text-xs text-muted-foreground">{s.contactEmail}</span></TableCell>
                  <TableCell>{s.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <SupplierDialog supplier={s} trigger={<Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>} onSaved={() => qc.invalidateQueries({ queryKey: ["/api/suppliers"] })} />
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${s.name}?`)) del.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyStateCard
          icon={Truck}
          title="No suppliers configured"
          description="Add suppliers so partners can route fulfillment, manage capacity, and ship branded inventory."
          tips={[
            "Tag suppliers with categories and territories so the right one is offered for each event.",
            "Suppliers can be linked to specific partners from the partner detail page.",
          ]}
        />
      )}
    </div>
  );
}
