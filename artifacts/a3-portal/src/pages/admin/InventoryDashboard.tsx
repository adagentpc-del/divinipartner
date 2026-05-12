import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Pencil, Trash2, Boxes, AlertTriangle, MapPin, Package, Wrench, ShoppingCart, TrendingDown, CalendarDays } from "lucide-react";

import type { Inventory, InventoryReservation, City as SchemaCity, ProductCatalog, Partner as SchemaPartner } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";
type InvRow = Inventory & {
  partnerName?: string | null; cityName?: string;
  productName?: string | null; productCategory?: string | null;
  total: number; available: number; accountedFor: number; overcommitted: boolean; isLow: boolean;
  displayName: string;
};
type City = Pick<SchemaCity, "id" | "name">;
type Product = Pick<ProductCatalog, "id" | "name" | "category">;
type Partner = Pick<SchemaPartner, "id" | "companyName">;
type Reservation = SerializedRow<InventoryReservation> & { eventName?: string; inventoryName?: string | null; productName?: string | null; cityName?: string | null };

const ASSET_TYPES = [
  { value: "hardware", label: "Hardware" },
  { value: "reusable_asset", label: "Reusable Asset" },
];

function InvDialog({ cities, products, partners, inv, trigger, onSaved }: { cities: City[]; products: Product[]; partners: Partner[]; inv?: InvRow | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    partnerId: inv?.partnerId?.toString() || "",
    cityId: inv?.cityId?.toString() || "",
    productId: inv?.productId?.toString() || "",
    name: inv?.name || "",
    category: inv?.category || "",
    assetType: inv?.assetType || "hardware",
    storageLocation: inv?.storageLocation || "",
    totalQuantity: (inv?.total ?? 0).toString(),
    reserved: (inv?.reserved ?? 0).toString(),
    inUse: (inv?.inUse ?? 0).toString(),
    damaged: (inv?.damaged ?? 0).toString(),
    retired: (inv?.retired ?? 0).toString(),
    onOrder: (inv?.onOrder ?? 0).toString(),
    reorderThreshold: (inv?.reorderThreshold ?? 2).toString(),
    graphicOnlyAvailable: inv?.graphicOnlyAvailable ?? true,
    notes: inv?.notes || "",
  });

  const totalNum = parseInt(form.totalQuantity) || 0;
  const accountedFor = (parseInt(form.reserved) || 0) + (parseInt(form.inUse) || 0) + (parseInt(form.damaged) || 0) + (parseInt(form.retired) || 0);
  const liveAvailable = Math.max(0, totalNum - accountedFor);
  const wouldOvercommit = accountedFor > totalNum;

  const handleSave = async () => {
    try {
      const body: any = {
        partnerId: form.partnerId ? parseInt(form.partnerId) : null,
        cityId: parseInt(form.cityId),
        productId: form.productId ? parseInt(form.productId) : null,
        name: form.name || null,
        category: form.category || null,
        assetType: form.assetType,
        storageLocation: form.storageLocation || null,
        totalQuantity: totalNum,
        reserved: parseInt(form.reserved) || 0,
        inUse: parseInt(form.inUse) || 0,
        damaged: parseInt(form.damaged) || 0,
        retired: parseInt(form.retired) || 0,
        onOrder: parseInt(form.onOrder) || 0,
        reorderThreshold: parseInt(form.reorderThreshold) || 0,
        graphicOnlyAvailable: form.graphicOnlyAvailable,
        notes: form.notes || null,
      };
      if (inv) await apiFetch(`/api/inventory/${inv.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/inventory`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: inv ? "Asset updated" : "Asset added" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  const valid = !!form.cityId && (!!form.name || !!form.productId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inv ? "Edit Asset" : "Add Asset"}</DialogTitle>
          <DialogDescription>Track owned hardware and reusable assets per city or storage location.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Asset Name</Label><Input placeholder="6ft Folding Table" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input placeholder="Tables / Frames / Banner Bases" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Type</Label>
              <Select value={form.assetType} onValueChange={v => setForm({ ...form, assetType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>City *</Label>
              <Select value={form.cityId} onValueChange={v => setForm({ ...form, cityId: v })}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Storage Location</Label><Input placeholder="Warehouse A / Aisle 3" value={form.storageLocation} onChange={e => setForm({ ...form, storageLocation: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Linked Product (optional)</Label>
              <Select value={form.productId || "none"} onValueChange={v => setForm({ ...form, productId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No link" /></SelectTrigger>
                <SelectContent><SelectItem value="none">No product link</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Owner Partner (optional)</Label>
              <Select value={form.partnerId || "none"} onValueChange={v => setForm({ ...form, partnerId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Shared inventory" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Shared / unowned</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="text-sm font-semibold">Quantities</div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Total Owned</Label><Input type="number" min="0" value={form.totalQuantity} onChange={e => setForm({ ...form, totalQuantity: e.target.value })} /></div>
              <div><Label className="text-xs">Reserved</Label><Input type="number" min="0" value={form.reserved} onChange={e => setForm({ ...form, reserved: e.target.value })} /></div>
              <div><Label className="text-xs">In Use</Label><Input type="number" min="0" value={form.inUse} onChange={e => setForm({ ...form, inUse: e.target.value })} /></div>
              <div><Label className="text-xs">Damaged</Label><Input type="number" min="0" value={form.damaged} onChange={e => setForm({ ...form, damaged: e.target.value })} /></div>
              <div><Label className="text-xs">Retired</Label><Input type="number" min="0" value={form.retired} onChange={e => setForm({ ...form, retired: e.target.value })} /></div>
              <div><Label className="text-xs">On Order</Label><Input type="number" min="0" value={form.onOrder} onChange={e => setForm({ ...form, onOrder: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted-foreground">Available now:</span>
              <span className={`font-semibold ${wouldOvercommit ? "text-red-600" : "text-emerald-600"}`}>{liveAvailable}</span>
            </div>
            {wouldOvercommit && <div className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Allocations exceed total — adjust quantities or order more.</div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Reorder Threshold</Label><Input type="number" min="0" value={form.reorderThreshold} onChange={e => setForm({ ...form, reorderThreshold: e.target.value })} /></div>
            <div className="flex items-end gap-2 pb-2"><Switch checked={form.graphicOnlyAvailable} onCheckedChange={v => setForm({ ...form, graphicOnlyAvailable: v })} /><Label className="text-sm">Print-only available</Label></div>
          </div>
          <div><Label>Internal Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!valid}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "default" }: { icon: any; label: string; value: number | string; sub?: string; tone?: "default" | "warn" | "alert" | "ok" }) {
  const tones: Record<string, string> = {
    default: "border-border",
    warn: "border-amber-200 bg-amber-50/40",
    alert: "border-red-200 bg-red-50/40",
    ok: "border-emerald-200 bg-emerald-50/40",
  };
  const iconTones: Record<string, string> = {
    default: "text-muted-foreground bg-muted",
    warn: "text-amber-600 bg-amber-100",
    alert: "text-red-600 bg-red-100",
    ok: "text-emerald-600 bg-emerald-100",
  };
  return (
    <Card className={`p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        <div className={`p-2 rounded-lg ${iconTones[tone]}`}><Icon className="h-4 w-4" /></div>
      </div>
    </Card>
  );
}

function AssetCard({ inv, cities, products, partners, onSaved, onDelete }: { inv: InvRow; cities: City[]; products: Product[]; partners: Partner[]; onSaved: () => void; onDelete: (id: number) => void }) {
  const tone = inv.overcommitted ? "border-red-300" : inv.isLow ? "border-amber-300" : "border-border";
  return (
    <Card className={`p-4 ${tone} hover:shadow-md transition`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold truncate">{inv.displayName}</div>
            {inv.assetType === "hardware" ? (
              <Badge variant="secondary" className="text-[10px] gap-1"><Wrench className="h-2.5 w-2.5" />Hardware</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] gap-1"><Package className="h-2.5 w-2.5" />Reusable</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{inv.cityName}</span>
            {inv.storageLocation && <span>· {inv.storageLocation}</span>}
            {inv.category && <span>· {inv.category}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <InvDialog cities={cities} products={products} partners={partners} inv={inv} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={onSaved} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Remove asset?")) onDelete(inv.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded bg-muted/50 py-1.5">
          <div className="text-[10px] uppercase text-muted-foreground">Total</div>
          <div className="text-lg font-semibold">{inv.total}</div>
        </div>
        <div className={`rounded py-1.5 ${inv.overcommitted ? "bg-red-100" : inv.isLow ? "bg-amber-100" : "bg-emerald-100"}`}>
          <div className="text-[10px] uppercase text-muted-foreground">Available</div>
          <div className={`text-lg font-semibold ${inv.overcommitted ? "text-red-700" : inv.isLow ? "text-amber-700" : "text-emerald-700"}`}>{inv.available}</div>
        </div>
        <div className="rounded bg-muted/50 py-1.5">
          <div className="text-[10px] uppercase text-muted-foreground">Reserved</div>
          <div className="text-lg font-semibold">{inv.reserved}</div>
        </div>
        <div className="rounded bg-muted/50 py-1.5">
          <div className="text-[10px] uppercase text-muted-foreground">In Use</div>
          <div className="text-lg font-semibold">{inv.inUse}</div>
        </div>
      </div>

      {(inv.damaged > 0 || inv.retired > 0 || inv.onOrder > 0) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {inv.damaged > 0 && <span>Damaged: {inv.damaged}</span>}
          {inv.retired > 0 && <span>Retired: {inv.retired}</span>}
          {inv.onOrder > 0 && <span className="text-blue-600 flex items-center gap-1"><ShoppingCart className="h-3 w-3" />On Order: {inv.onOrder}</span>}
        </div>
      )}

      {(inv.overcommitted || inv.isLow) && (
        <div className={`mt-2 text-xs flex items-center gap-1.5 ${inv.overcommitted ? "text-red-600" : "text-amber-600"}`}>
          <AlertTriangle className="h-3.5 w-3.5" />
          {inv.overcommitted ? "Overcommitted — order more or release reservations" : `Low stock — at or below threshold of ${inv.reorderThreshold}`}
        </div>
      )}
    </Card>
  );
}

export default function InventoryDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cityFilter, setCityFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const params = new URLSearchParams();
  if (cityFilter) params.set("cityId", cityFilter);
  if (partnerFilter) params.set("partnerId", partnerFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data: inventory = [], isLoading } = useQuery<InvRow[]>({ queryKey: ["/api/inventory", { cityFilter, partnerFilter }], queryFn: () => apiFetch(`/api/inventory${qs}`) });
  const { data: shortages = [] } = useQuery<InvRow[]>({ queryKey: ["/api/inventory/shortages"], queryFn: () => apiFetch(`/api/inventory/shortages`) });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });
  const { data: partners = [] } = useQuery<Partner[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });
  const { data: reservations = [] } = useQuery<Reservation[]>({ queryKey: ["/api/inventory/reservations"], queryFn: () => apiFetch("/api/inventory/reservations") });

  const refetch = () => { qc.invalidateQueries({ queryKey: ["/api/inventory"] }); qc.invalidateQueries({ queryKey: ["/api/inventory/shortages"] }); qc.invalidateQueries({ queryKey: ["/api/inventory/reservations"] }); };
  const del = useMutation({ mutationFn: (id: number) => apiFetch(`/api/inventory/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Asset removed" }); } });
  const onErr = (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" });
  const releaseRes = useMutation({ mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "released" }) }), onSuccess: () => { refetch(); toast({ title: "Reservation released" }); }, onError: onErr });
  const fulfillRes = useMutation({ mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "fulfilled" }) }), onSuccess: () => { refetch(); toast({ title: "Marked as in use" }); }, onError: onErr });
  const deleteRes = useMutation({ mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Reservation removed" }); }, onError: onErr });

  const filtered = useMemo(() => {
    if (!search.trim()) return inventory;
    const q = search.toLowerCase();
    return inventory.filter(i => (i.displayName || "").toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q) || (i.cityName || "").toLowerCase().includes(q));
  }, [inventory, search]);

  const groupedByCity = useMemo(() => {
    const map = new Map<string, InvRow[]>();
    filtered.forEach(i => {
      const k = i.cityName || "Unassigned";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const stats = useMemo(() => {
    const totalAssets = inventory.reduce((s, i) => s + i.total, 0);
    const lowCount = inventory.filter(i => i.isLow).length;
    const overCount = inventory.filter(i => i.overcommitted).length;
    const onOrderTotal = inventory.reduce((s, i) => s + i.onOrder, 0);
    const reservedTotal = inventory.reduce((s, i) => s + i.reserved, 0);
    const inUseTotal = inventory.reduce((s, i) => s + i.inUse, 0);
    return { totalAssets, lowCount, overCount, onOrderTotal, reservedTotal, inUseTotal };
  }, [inventory]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const activeReservations = reservations.filter(r => r.status === "active");
  const fulfilledReservations = reservations.filter(r => r.status === "fulfilled");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">Reusable hardware and assets across cities and storage locations.</p>
        </div>
        <InvDialog cities={cities} products={products} partners={partners} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add Asset</Button>} onSaved={refetch} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard icon={Boxes} label="Total Assets" value={stats.totalAssets} sub={`${inventory.length} SKU${inventory.length !== 1 ? "s" : ""}`} />
        <StatCard icon={CalendarDays} label="Reserved" value={stats.reservedTotal} sub="Across upcoming events" />
        <StatCard icon={Wrench} label="In Use" value={stats.inUseTotal} sub="Out at active events" />
        <StatCard icon={ShoppingCart} label="On Order" value={stats.onOrderTotal} sub="Awaiting delivery" tone={stats.onOrderTotal > 0 ? "ok" : "default"} />
        <StatCard icon={TrendingDown} label="Low Stock" value={stats.lowCount} sub="At or below threshold" tone={stats.lowCount > 0 ? "warn" : "default"} />
        <StatCard icon={AlertTriangle} label="Overcommitted" value={stats.overCount} sub="Need replenishment" tone={stats.overCount > 0 ? "alert" : "default"} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bycity">By City</TabsTrigger>
          <TabsTrigger value="shortages">Shortages {shortages.length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">{shortages.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="reservations">Reservations {activeReservations.length > 0 && <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{activeReservations.length}</Badge>}</TabsTrigger>
        </TabsList>

        <div className="flex gap-2 mt-4 flex-wrap">
          <Input placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={cityFilter || "all"} onValueChange={v => setCityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All cities" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={partnerFilter || "all"} onValueChange={v => setPartnerFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="All partners" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <TabsContent value="overview" className="mt-4">
          {filtered.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground"><Boxes className="h-10 w-10 mx-auto mb-2 opacity-40" />No assets tracked yet. Add your first hardware or reusable asset above.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(inv => <AssetCard key={inv.id} inv={inv} cities={cities} products={products} partners={partners} onSaved={refetch} onDelete={(id) => del.mutate(id)} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bycity" className="mt-4 space-y-6">
          {groupedByCity.map(([city, items]) => {
            const cityTotal = items.reduce((s, i) => s + i.total, 0);
            const cityAvail = items.reduce((s, i) => s + i.available, 0);
            const cityLow = items.filter(i => i.isLow).length;
            return (
              <div key={city}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{city}</h2>
                  <div className="text-xs text-muted-foreground">{items.length} asset{items.length !== 1 ? "s" : ""} · {cityAvail}/{cityTotal} available {cityLow > 0 && <span className="text-amber-600 ml-2">· {cityLow} low</span>}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map(inv => <AssetCard key={inv.id} inv={inv} cities={cities} products={products} partners={partners} onSaved={refetch} onDelete={(id) => del.mutate(id)} />)}
                </div>
              </div>
            );
          })}
          {groupedByCity.length === 0 && <Card className="p-12 text-center text-muted-foreground">No assets match your filters.</Card>}
        </TabsContent>

        <TabsContent value="shortages" className="mt-4">
          {shortages.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground"><div className="text-emerald-600 mb-2">✓</div>No shortages or low-stock alerts. Inventory looks healthy.</Card>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Recommend replenishment for these assets — order more hardware or release reservations.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {shortages.map(inv => <AssetCard key={inv.id} inv={inv} cities={cities} products={products} partners={partners} onSaved={refetch} onDelete={(id) => del.mutate(id)} />)}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reservations" className="mt-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Active reservations <span className="text-muted-foreground font-normal">({activeReservations.length})</span></h3>
            {activeReservations.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">No active reservations.</Card>
            ) : (
              <div className="border rounded-xl bg-card overflow-hidden">
                {activeReservations.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border-b last:border-0">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.inventoryName || r.productName} <span className="text-muted-foreground font-normal">×{r.quantity}</span></div>
                      <div className="text-xs text-muted-foreground">{r.eventName} · {r.cityName}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={fulfillRes.isPending} onClick={() => fulfillRes.mutate(r.id)}>Mark in use</Button>
                      <Button size="sm" variant="outline" disabled={releaseRes.isPending} onClick={() => releaseRes.mutate(r.id)}>Release</Button>
                      <Button size="sm" variant="ghost" disabled={deleteRes.isPending} onClick={() => { if (confirm("Delete reservation?")) deleteRes.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {fulfilledReservations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">In use <span className="text-muted-foreground font-normal">({fulfilledReservations.length})</span></h3>
              <div className="border rounded-xl bg-card overflow-hidden">
                {fulfilledReservations.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border-b last:border-0">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.inventoryName || r.productName} <span className="text-muted-foreground font-normal">×{r.quantity}</span></div>
                      <div className="text-xs text-muted-foreground">{r.eventName} · {r.cityName}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={releaseRes.isPending} onClick={() => releaseRes.mutate(r.id)}>Return to stock</Button>
                      <Button size="sm" variant="ghost" disabled={deleteRes.isPending} onClick={() => { if (confirm("Delete?")) deleteRes.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
