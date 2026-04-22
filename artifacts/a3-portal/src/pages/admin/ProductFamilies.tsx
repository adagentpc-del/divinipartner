import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Package, Loader2, Layers } from "lucide-react";

type Product = { id: number; name: string; displayName: string | null; sku: string | null };
type Member = {
  id: number; familyId: number; productId: number; role: "hardware" | "component" | "accessory";
  requiresHardwareUnits: number; isOptional: boolean; sortOrder: number;
  productName?: string | null; productDisplayName?: string | null;
};
type Family = {
  id: number; slug: string; name: string; description: string | null;
  hardwareProductId: number | null; requiresHardwareDefault: boolean; isActive: boolean;
  members: Member[];
};

export default function ProductFamilies() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: families = [], isLoading } = useQuery<Family[]>({ queryKey: ["/api/product-families"], queryFn: () => apiFetch("/api/product-families") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });

  const [editing, setEditing] = useState<Family | null>(null);
  const [creating, setCreating] = useState(false);
  const refetch = () => qc.invalidateQueries({ queryKey: ["/api/product-families"] });

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="h-6 w-6" /> Product Families</h1>
          <p className="text-muted-foreground mt-1 text-sm">Group a hardware base item (e.g. tent frame) with its dependent components. The ordering flow uses the family to reserve partner-owned hardware and auto-switch to "full unit required" when it runs out.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" />New Family</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : families.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No families yet. Create one to connect a hardware product (like an Easy Up tent frame) to its dependent components.
        </Card>
      ) : (
        <div className="space-y-3">
          {families.map(f => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{f.name}</h3>
                    <Badge variant="outline" className="font-mono text-xs">{f.slug}</Badge>
                    {!f.isActive && <Badge variant="secondary">Inactive</Badge>}
                    {f.requiresHardwareDefault && <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">Requires hardware</Badge>}
                  </div>
                  {f.description && <p className="text-sm text-muted-foreground mt-1">{f.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {f.members.map(m => (
                      <Badge key={m.id} variant={m.role === "hardware" ? "default" : "secondary"} className="text-xs">
                        {m.role === "hardware" && <Package className="h-3 w-3 mr-1" />}
                        {m.productDisplayName || m.productName || `#${m.productId}`}
                        {m.role === "component" && m.requiresHardwareUnits > 0 && <span className="ml-1 opacity-70">·{m.requiresHardwareUnits}</span>}
                      </Badge>
                    ))}
                    {f.members.length === 0 && <span className="text-xs text-muted-foreground">No members yet</span>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(f)}>Edit</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <FamilyDialog
          family={editing}
          products={products}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refetch(); toast({ title: "Saved" }); }}
        />
      )}
    </div>
  );
}

function FamilyDialog({ family, products, onClose, onSaved }: { family: Family | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!family;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(family?.name || "");
  const [slug, setSlug] = useState(family?.slug || "");
  const [description, setDescription] = useState(family?.description || "");
  const [hardwareProductId, setHardwareProductId] = useState<number | null>(family?.hardwareProductId ?? null);
  const [requiresHardware, setRequiresHardware] = useState(family?.requiresHardwareDefault ?? true);
  const [isActive, setIsActive] = useState(family?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  // Member-add state (only after the family exists).
  const [newMemberProductId, setNewMemberProductId] = useState<number | null>(null);
  const [newMemberRole, setNewMemberRole] = useState<Member["role"]>("component");
  const [newMemberUnits, setNewMemberUnits] = useState(1);

  const productById = new Map(products.map(p => [p.id, p]));

  const save = async () => {
    if (!name || !slug) { toast({ title: "Name and slug required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { name, slug, description: description || null, hardwareProductId, requiresHardwareDefault: requiresHardware, isActive };
      if (isEdit) await apiFetch(`/api/product-families/${family!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else await apiFetch("/api/product-families", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const addMember = async () => {
    if (!family || !newMemberProductId) return;
    try {
      await apiFetch(`/api/product-families/${family.id}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: newMemberProductId, role: newMemberRole, requiresHardwareUnits: newMemberUnits }),
      });
      setNewMemberProductId(null);
      qc.invalidateQueries({ queryKey: ["/api/product-families"] });
      toast({ title: "Member added" });
    } catch (e: any) { toast({ title: "Could not add member", description: e.message, variant: "destructive" }); }
  };

  const removeMember = async (memberId: number) => {
    if (!family) return;
    if (!window.confirm("Remove this member from the family?")) return;
    try {
      await apiFetch(`/api/product-families/${family.id}/members/${memberId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/product-families"] });
    } catch (e: any) { toast({ title: "Could not remove", description: e.message, variant: "destructive" }); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? `Edit family: ${family!.name}` : "New product family"}</DialogTitle></DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Easy Up Tent" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="easy-up-tent" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes for admins" rows={2} />
          </div>
          <div>
            <Label>Hardware base product</Label>
            <Select value={hardwareProductId?.toString() ?? ""} onValueChange={(v) => setHardwareProductId(v ? Number(v) : null)}>
              <SelectTrigger><SelectValue placeholder="Pick the frame / hardware product…" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.displayName || p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">This product's per-partner inventory drives availability for the whole family.</p>
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <div className="text-sm font-medium">Requires hardware</div>
              <div className="text-xs text-muted-foreground">When ON, ordering a component reserves a unit of the hardware (or forces ordering it) once partner stock hits zero.</div>
            </div>
            <Switch checked={requiresHardware} onCheckedChange={setRequiresHardware} />
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div className="text-sm font-medium">Active</div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {isEdit && family && (
            <div className="border rounded-md p-3 space-y-3">
              <div className="font-medium text-sm">Members</div>
              {family.members.length === 0 && <div className="text-xs text-muted-foreground">No members yet — add the components below.</div>}
              {family.members.map(m => {
                const p = productById.get(m.productId);
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={m.role === "hardware" ? "default" : "secondary"} className="text-xs">{m.role}</Badge>
                    <span className="flex-1 truncate">{p?.displayName || p?.name || m.productName || `#${m.productId}`}</span>
                    {m.role !== "hardware" && <span className="text-xs text-muted-foreground">{m.requiresHardwareUnits} frame{m.requiresHardwareUnits === 1 ? "" : "s"} per unit</span>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMember(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Add product</Label>
                  <Select value={newMemberProductId?.toString() ?? ""} onValueChange={(v) => setNewMemberProductId(v ? Number(v) : null)}>
                    <SelectTrigger><SelectValue placeholder="Pick a product…" /></SelectTrigger>
                    <SelectContent>
                      {products
                        .filter(p => !family.members.some(m => m.productId === p.id))
                        .map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.displayName || p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as Member["role"])}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hardware">hardware</SelectItem>
                      <SelectItem value="component">component</SelectItem>
                      <SelectItem value="accessory">accessory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Frames / unit</Label>
                  <Input type="number" min={0} className="w-20" value={newMemberUnits} onChange={e => setNewMemberUnits(Number(e.target.value) || 0)} />
                </div>
                <Button size="sm" onClick={addMember} disabled={!newMemberProductId} className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{isEdit ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
