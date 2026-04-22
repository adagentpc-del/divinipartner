import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, resolveAssetUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Pencil, Trash2, Package, Copy, ChevronLeft, GripVertical, Upload, X as XIcon } from "lucide-react";
import { DimensionInput } from "@/components/units/DimensionInput";
import type { LengthUnit } from "@/lib/units";

type Pkg = { id: number; partnerId: number | null; supplierId: number | null; name: string; displayName: string | null; description: string | null; tier: number; price: string | null; currency: string; isActive: boolean; imageUrl?: string | null; imageUrls?: string[] | null; sizeWidth?: number | null; sizeHeight?: number | null; sizeDepth?: number | null; sizeDiameter?: number | null; sizeUnit?: string | null };
type Supplier = { id: number; name: string };
type Product = { id: number; name: string; category: string };
type PkgItem = { id: number; productId: number; productName?: string | null; productCategory?: string | null; quantity: number; isOptional: boolean; sortOrder: number };
type PkgFull = Pkg & { items: PkgItem[] };

function PkgDialog({ partnerId, suppliers, pkg, trigger, onSaved }: { partnerId: number; suppliers: Supplier[]; pkg?: Pkg | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: pkg?.name || "", displayName: pkg?.displayName || "", description: pkg?.description || "",
    tier: pkg?.tier?.toString() || "1", price: pkg?.price || "", supplierId: pkg?.supplierId?.toString() || "",
    isActive: pkg?.isActive ?? true,
    imageUrls: ((pkg?.imageUrls && pkg.imageUrls.length > 0)
      ? pkg.imageUrls
      : (pkg?.imageUrl ? [pkg.imageUrl] : [])) as string[],
    sizeWidth: pkg?.sizeWidth ?? null as number | null,
    sizeHeight: pkg?.sizeHeight ?? null as number | null,
    sizeDepth: pkg?.sizeDepth ?? null as number | null,
    sizeDiameter: pkg?.sizeDiameter ?? null as number | null,
    sizeUnit: (pkg?.sizeUnit as LengthUnit | null) ?? "in" as LengthUnit,
  });
  const [uploadingImg, setUploadingImg] = useState(false);
  const uploadOne = async (file: File): Promise<string> => {
    const r = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
    });
    if (!r.ok) throw new Error("Failed to prepare upload");
    const { uploadURL, objectPath } = await r.json();
    const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    if (!put.ok) throw new Error("Upload failed");
    return objectPath as string;
  };
  const MAX_IMAGES = 12;
  const onPickImages = async (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - form.imageUrls.length;
    if (remaining <= 0) { toast({ title: "Image limit reached", description: `Maximum ${MAX_IMAGES} images per package.`, variant: "destructive" }); return; }
    let list = Array.from(files);
    if (list.length > remaining) {
      toast({ title: "Some images skipped", description: `Only ${remaining} more allowed; uploading the first ${remaining}.` });
      list = list.slice(0, remaining);
    }
    for (const f of list) {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name} too large`, description: "Max 10MB per image", variant: "destructive" }); return; }
    }
    setUploadingImg(true);
    try {
      const uploaded: string[] = [];
      for (const f of list) uploaded.push(await uploadOne(f));
      setForm(f => ({ ...f, imageUrls: [...f.imageUrls, ...uploaded] }));
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploadingImg(false); }
  };
  const removeImageAt = (idx: number) => setForm(f => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }));
  const moveImage = (idx: number, dir: -1 | 1) => setForm(f => {
    const next = [...f.imageUrls];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return f;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...f, imageUrls: next };
  });
  const handleSave = async () => {
    try {
      const body: any = {
        partnerId,
        name: form.name, displayName: form.displayName || null, description: form.description || null,
        tier: parseInt(form.tier), price: form.price || null,
        supplierId: form.supplierId ? parseInt(form.supplierId) : null,
        isActive: form.isActive,
        sizeWidth: form.sizeWidth, sizeHeight: form.sizeHeight,
        sizeDepth: form.sizeDepth, sizeDiameter: form.sizeDiameter,
        sizeUnit: form.sizeUnit,
        imageUrls: form.imageUrls,
        imageUrl: form.imageUrls[0] || null,
      };
      if (pkg) await apiFetch(`/api/packages/${pkg.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/packages`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: pkg ? "Package updated" : "Package created" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{pkg ? "Edit Package" : "Create Package"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Display Name</Label><Input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Tier 1 - Essentials" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Package images (shown to customers)</Label>
              <span className="text-xs text-muted-foreground">{form.imageUrls.length} / 12</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">First image is the cover. Add multiple to showcase every piece included in the package.</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {form.imageUrls.map((url, idx) => (
                <div key={url + idx} className="relative group aspect-[4/3] rounded-md overflow-hidden border bg-muted">
                  <img src={resolveAssetUrl(url)} alt={`Image ${idx + 1}`} className="h-full w-full object-cover" />
                  {idx === 0 && <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wide">Cover</span>}
                  <button type="button" onClick={() => removeImageAt(idx)} className="absolute top-1 right-1 bg-background/90 border rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition" aria-label="Remove image">
                    <XIcon className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                    <button type="button" onClick={() => moveImage(idx, -1)} disabled={idx === 0} className="bg-background/90 border rounded px-1.5 py-0.5 text-[10px] disabled:opacity-30">←</button>
                    <span className="text-[10px] bg-background/90 border rounded px-1.5 py-0.5">{idx + 1}</span>
                    <button type="button" onClick={() => moveImage(idx, 1)} disabled={idx === form.imageUrls.length - 1} className="bg-background/90 border rounded px-1.5 py-0.5 text-[10px] disabled:opacity-30">→</button>
                  </div>
                </div>
              ))}
              {form.imageUrls.length < 12 && (
                <label className="aspect-[4/3] rounded-md border-2 border-dashed bg-muted/40 hover:bg-muted/70 flex flex-col items-center justify-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground transition">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { onPickImages(e.target.files); e.currentTarget.value = ""; }} disabled={uploadingImg} />
                  {uploadingImg ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  <span className="text-xs font-medium text-center px-2">
                    {uploadingImg ? "Uploading…" : (form.imageUrls.length === 0 ? "Upload image" : "Add more images")}
                  </span>
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">JPG or PNG, up to 10MB each. You can upload several at once.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Tier</Label><Select value={form.tier} onValueChange={v => setForm({ ...form, tier: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={n.toString()}>Tier {n}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Price</Label><Input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="1850.00" /></div>
            <div><Label>Supplier</Label><Select value={form.supplierId} onValueChange={v => setForm({ ...form, supplierId: v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
          <DimensionInput
            label="Package dimensions (optional)"
            helperText="Overall printed/installed footprint. Stored normalized to mm."
            showDepth
            value={{ width: form.sizeWidth, height: form.sizeHeight, depth: form.sizeDepth, diameter: form.sizeDiameter, unit: form.sizeUnit }}
            onChange={(v) => setForm({ ...form, sizeWidth: v.width, sizeHeight: v.height, sizeDepth: v.depth ?? null, sizeDiameter: v.diameter ?? null, sizeUnit: v.unit })}
          />
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageDetailDialog({ pkg, products, trigger, onSaved }: { pkg: Pkg; products: Product[]; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: full, refetch } = useQuery<PkgFull>({ queryKey: [`/api/packages/${pkg.id}`], queryFn: () => apiFetch(`/api/packages/${pkg.id}`), enabled: open });
  const { toast } = useToast();
  const [newProductId, setNewProductId] = useState("");
  const [newQty, setNewQty] = useState("1");

  const addItem = async () => {
    if (!newProductId) return;
    try {
      await apiFetch(`/api/packages/${pkg.id}/items`, { method: "POST", body: JSON.stringify({ productId: parseInt(newProductId), quantity: parseInt(newQty) || 1 }) });
      setNewProductId(""); setNewQty("1");
      refetch();
      onSaved();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  const updateItem = async (itemId: number, body: Partial<PkgItem>) => {
    await apiFetch(`/api/package-items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) });
    refetch();
  };
  const removeItem = async (itemId: number) => {
    await apiFetch(`/api/package-items/${itemId}`, { method: "DELETE" });
    refetch(); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{pkg.displayName || pkg.name} · Items</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-end gap-2 p-3 bg-muted/40 rounded-lg">
            <div className="flex-1"><Label className="text-xs">Add product</Label>
              <Select value={newProductId} onValueChange={setNewProductId}><SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name} ({p.category})</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="w-20"><Label className="text-xs">Qty</Label><Input type="number" min="1" value={newQty} onChange={e => setNewQty(e.target.value)} /></div>
            <Button onClick={addItem} disabled={!newProductId}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {full?.items.map(it => (
              <div key={it.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{it.productName}</div>
                  <div className="text-xs text-muted-foreground">{it.productCategory}</div>
                </div>
                <Input type="number" min="1" value={it.quantity} onChange={e => updateItem(it.id, { quantity: parseInt(e.target.value) || 1 })} className="w-20" />
                <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {(full?.items.length ?? 0) === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No items yet. Add products above.</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PackagesList() {
  const params = useParams<{ id: string }>();
  const partnerId = parseInt(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: partner } = useQuery<{ companyName: string }>({ queryKey: [`/api/partners/${partnerId}`], queryFn: () => apiFetch(`/api/partners/${partnerId}`) });
  const { data: packages = [], isLoading } = useQuery<Pkg[]>({ queryKey: [`/api/packages`, { partnerId }], queryFn: () => apiFetch(`/api/packages?partnerId=${partnerId}`) });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });

  const refetch = () => qc.invalidateQueries({ queryKey: [`/api/packages`, { partnerId }] });
  const del = useMutation({ mutationFn: (id: number) => apiFetch(`/api/packages/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Package deleted" }); } });
  const dup = useMutation({ mutationFn: (id: number) => apiFetch(`/api/packages/${id}/duplicate`, { method: "POST" }), onSuccess: () => { refetch(); toast({ title: "Package duplicated" }); } });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/partners/${partnerId}/edit`}><Button variant="ghost" size="sm" className="gap-1 -ml-3 mb-2"><ChevronLeft className="h-4 w-4" />Back to partner</Button></Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Packages</h1>
            <p className="text-muted-foreground mt-1">{partner?.companyName} · {packages.length} package{packages.length !== 1 ? "s" : ""}</p>
          </div>
          <PkgDialog partnerId={partnerId} suppliers={suppliers} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Create Package</Button>} onSaved={refetch} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {packages.map(p => (
          <Card key={p.id} className="p-5 hover:shadow-md transition flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <Badge variant="secondary">Tier {p.tier}</Badge>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dup.mutate(p.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                <PkgDialog partnerId={partnerId} suppliers={suppliers} pkg={p} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetch} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="font-semibold text-lg">{p.displayName || p.name}</div>
            <div className="text-sm text-muted-foreground line-clamp-3 flex-1 mt-1">{p.description}</div>
            <div className="mt-3 flex items-center justify-between pt-3 border-t">
              <div className="text-xl font-bold">{p.price ? `$${p.price}` : "TBD"}</div>
              <PackageDetailDialog pkg={p} products={products} trigger={<Button size="sm" variant="outline">Manage Items</Button>} onSaved={refetch} />
            </div>
            {!p.isActive && <Badge variant="outline" className="mt-2 self-start text-xs">Inactive</Badge>}
          </Card>
        ))}
        {packages.length === 0 && <Card className="col-span-3 p-12 text-center text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-2 opacity-40" />No packages yet. Create one to enable package ordering.</Card>}
      </div>
    </div>
  );
}
