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
import { Plus, Loader2, Pencil, Trash2, Boxes, AlertTriangle } from "lucide-react";

type InvRow = { id: number; cityId: number; cityName?: string; productId: number; productName?: string; productCategory?: string; hardwareOnHand: number; reserved: number; damaged: number; graphicOnlyAvailable: boolean; lowInventoryThreshold: number; notes: string | null };
type City = { id: number; name: string };
type Product = { id: number; name: string; category: string };

function InvDialog({ cities, products, inv, trigger, onSaved }: { cities: City[]; products: Product[]; inv?: InvRow | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    cityId: inv?.cityId?.toString() || "", productId: inv?.productId?.toString() || "",
    hardwareOnHand: inv?.hardwareOnHand?.toString() || "0",
    reserved: inv?.reserved?.toString() || "0", damaged: inv?.damaged?.toString() || "0",
    graphicOnlyAvailable: inv?.graphicOnlyAvailable ?? true,
    lowInventoryThreshold: inv?.lowInventoryThreshold?.toString() || "2",
    notes: inv?.notes || "",
  });
  const handleSave = async () => {
    try {
      const body = {
        cityId: parseInt(form.cityId), productId: parseInt(form.productId),
        hardwareOnHand: parseInt(form.hardwareOnHand) || 0,
        reserved: parseInt(form.reserved) || 0, damaged: parseInt(form.damaged) || 0,
        graphicOnlyAvailable: form.graphicOnlyAvailable,
        lowInventoryThreshold: parseInt(form.lowInventoryThreshold) || 2,
        notes: form.notes || null,
      };
      if (inv) await apiFetch(`/api/inventory/${inv.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/inventory`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: inv ? "Inventory updated" : "Inventory record added" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{inv ? "Edit Inventory" : "Add Inventory"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label><Select value={form.cityId} onValueChange={v => setForm({ ...form, cityId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Product</Label><Select value={form.productId} onValueChange={v => setForm({ ...form, productId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>On Hand</Label><Input type="number" min="0" value={form.hardwareOnHand} onChange={e => setForm({ ...form, hardwareOnHand: e.target.value })} /></div>
            <div><Label>Reserved</Label><Input type="number" min="0" value={form.reserved} onChange={e => setForm({ ...form, reserved: e.target.value })} /></div>
            <div><Label>Damaged</Label><Input type="number" min="0" value={form.damaged} onChange={e => setForm({ ...form, damaged: e.target.value })} /></div>
          </div>
          <div><Label>Low Threshold</Label><Input type="number" min="0" value={form.lowInventoryThreshold} onChange={e => setForm({ ...form, lowInventoryThreshold: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.graphicOnlyAvailable} onCheckedChange={v => setForm({ ...form, graphicOnlyAvailable: v })} /><Label>Graphic-only available</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.cityId || !form.productId}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cityFilter, setCityFilter] = useState("");
  const queryString = cityFilter ? `?cityId=${cityFilter}` : "";
  const { data: inventory = [], isLoading } = useQuery<InvRow[]>({ queryKey: ["/api/inventory", { cityFilter }], queryFn: () => apiFetch(`/api/inventory${queryString}`) });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });

  const refetch = () => qc.invalidateQueries({ queryKey: ["/api/inventory"] });
  const del = useMutation({ mutationFn: (id: number) => apiFetch(`/api/inventory/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Removed" }); } });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">{inventory.length} record{inventory.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Select value={cityFilter} onValueChange={v => setCityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All cities" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <InvDialog cities={cities} products={products} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add</Button>} onSaved={refetch} />
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/50"><TableHead>City</TableHead><TableHead>Product</TableHead><TableHead className="text-right">On Hand</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Damaged</TableHead><TableHead>Graphic Only</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {inventory.map(inv => {
              const available = inv.hardwareOnHand - inv.reserved;
              const isLow = available <= inv.lowInventoryThreshold;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.cityName}</TableCell>
                  <TableCell><div>{inv.productName}<div className="text-xs text-muted-foreground">{inv.productCategory}</div></div></TableCell>
                  <TableCell className="text-right">{inv.hardwareOnHand}</TableCell>
                  <TableCell className="text-right">{inv.reserved}</TableCell>
                  <TableCell className="text-right"><span className={isLow ? "text-amber-600 font-semibold flex items-center justify-end gap-1" : ""}>{isLow && <AlertTriangle className="h-3 w-3" />}{available}</span></TableCell>
                  <TableCell className="text-right">{inv.damaged}</TableCell>
                  <TableCell>{inv.graphicOnlyAvailable ? <Badge variant="secondary" className="text-xs">Yes</Badge> : <Badge variant="outline" className="text-xs">No</Badge>}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1">
                    <InvDialog cities={cities} products={products} inv={inv} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetch} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Remove?")) del.mutate(inv.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
            {inventory.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12"><Boxes className="h-10 w-10 mx-auto mb-2 opacity-40" />No inventory tracked.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
