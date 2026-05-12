import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Package, Search, FileText, CheckCircle2, AlertCircle, Star, Upload, Download, X } from "lucide-react";
import { ImportDialog } from "@/components/imports/ImportDialog";
import { DimensionInput } from "@/components/units/DimensionInput";
import { PackingDetailsInput, type PackingDetailsValue, type PackingMode } from "@/components/units/PackingDetailsInput";
import type { WeightUnit } from "@/lib/units";
import { ArtworkSpecInput } from "@/components/units/ArtworkSpecInput";
import { PricingModelInput } from "@/components/units/PricingModelInput";
import { convert, type LengthUnit, type PricingModel, type PricingUnit } from "@/lib/units";

function toMm(v: number, unit: string): number { return convert(v, unit, "mm"); }

interface Product {
  id: number;
  name: string;
  displayName: string | null;
  slug: string;
  sku: string | null;
  category: string;
  description: string | null;
  imageUrl: string | null;
  galleryImagesJson: string[] | null;
  visibleDimensions: string | null;
  sizeWidth: number | null;
  sizeHeight: number | null;
  sizeDepth: number | null;
  sizeDiameter: number | null;
  sizeUnit: string | null;
  artworkUnit: string | null;
  artworkWidth: number | null;
  artworkHeight: number | null;
  bleed: number | null;
  safeArea: number | null;
  visibleWidth: number | null;
  visibleHeight: number | null;
  backendProductionNotes: string | null;
  installNotes: string | null;
  internalOpsSummary: string | null;
  featureBadgesJson: string[] | null;
  hardwareIncluded: boolean;
  printOnlyAvailable: boolean;
  rentalEligible: boolean;
  usePartnerInventoryEligible: boolean;
  reusableHardwareCompatible: boolean;
  inventoryTracked: boolean;
  requiresAttachmentSelection: boolean;
  requiresMaterialSelection: boolean;
  attachmentMethod: string | null;
  material: string | null;
  finishing: string | null;
  supplierId: number | null;
  leadTimeDays: number | null;
  isOrderable: boolean;
  allowsDesignRequest: boolean;
  sizeOptionsJson: string[] | null;
  isActive: boolean;
  customerFacingSummary: string | null;
  reviewStatus: string;
  missingDataFlagsJson: string[] | null;
  pricingModel: string | null;
  unitRate: number | string | null;
  pricingUnit: string | null;
  minBillableSize: number | null;
  minCharge: number | string | null;
  allowsCustomSize: boolean;
  // Shipping & packing defaults (April 2026 logistics extension).
  packedWidth: number | null;
  packedHeight: number | null;
  packedDepth: number | null;
  packedSizeUnit: string | null;
  shippingWeight: number | null;
  shippingWeightUnit: string | null;
  cartonCount: number | null;
  packingMode: string | null;
  crateRequired: boolean;
  palletRequired: boolean;
  oversizeFlag: boolean;
  freightClass: string | null;
  installKitNotes: string | null;
}

interface SpecStandard {
  id: number;
  productId: number;
  supplierId: number | null;
  title: string;
  standardType: string;
  isCurrent: boolean;
  isApproved: boolean;
  isActive: boolean;
  dimensionsSummary: string | null;
  materialSummary: string | null;
  finishingSummary: string | null;
  attachmentSummary: string | null;
  hardwareSummary: string | null;
  leadTimeDays: number | null;
  printFileRequirements: string | null;
  installNotes: string | null;
  internalOpsNotes: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  reviewStatus: string;
  reviewNotes: string | null;
  missingDataFlagsJson: string[] | null;
}

interface QuoteAsset {
  id: number;
  attachableType: string;
  attachableId: number;
  name: string;
  fileUrl: string;
  fileType: string | null;
  version: string | null;
  supplierName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  isApprovedStandard: boolean;
  internalOnly: boolean;
  vendorVisible: boolean;
  dimensionsSummary: string | null;
  materialSummary: string | null;
  attachmentSummary: string | null;
  hardwareSummary: string | null;
  notes: string | null;
}

const CAPABILITY_LABELS: Record<keyof Product, string> = {
  hardwareIncluded: "Hardware included",
  printOnlyAvailable: "Allows graphic only",
  rentalEligible: "Rental eligible",
  usePartnerInventoryEligible: "Allows partner-owned inventory",
  reusableHardwareCompatible: "Reusable hardware compatible",
  inventoryTracked: "Inventory tracked",
  requiresAttachmentSelection: "Requires attachment method",
  requiresMaterialSelection: "Requires material selection",
} as any;

export default function ProductCatalog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importProductsOpen, setImportProductsOpen] = useState(false);
  const [importSpecsOpen, setImportSpecsOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (body: Partial<Product>) => {
      const url = isNew ? "/api/products" : `/api/products/${body.id}`;
      const method = isNew ? "POST" : "PATCH";
      return apiFetch(url, { method, body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/products"] }); toast({ title: isNew ? "Product added" : "Product updated" }); setEditing(null); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/products"] }); toast({ title: "Removed" }); },
  });

  const openNew = () => {
    setEditing({ name: "", slug: "", category: "", isOrderable: true, allowsDesignRequest: true, isActive: true });
    setIsNew(true);
  };
  const openEdit = (p: Product) => { setEditing({ ...p }); setIsNew(false); };

  const handleSave = () => {
    if (!editing?.name || !editing?.category) return;
    const slug = editing.slug || editing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    save.mutate({ ...editing, slug });
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(products.map(p => p.category))].sort();

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} products across {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportProductsOpen(true)} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Import Products</Button>
          <Button size="sm" variant="outline" onClick={() => setImportSpecsOpen(true)} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Import Specs</Button>
          <Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Product</Button>
        </div>
      </div>
      <ImportDialog resource="products" open={importProductsOpen} onOpenChange={setImportProductsOpen} onComplete={() => qc.invalidateQueries({ queryKey: ["/api/products"] })} />
      <ImportDialog resource="specs" open={importSpecsOpen} onOpenChange={setImportSpecsOpen} onComplete={() => qc.invalidateQueries({ queryKey: ["/api/products"] })} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search products, SKU, category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {categories.map(category => {
        const catProducts = filtered.filter(p => p.category === category);
        if (!catProducts.length) return null;
        return (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category} ({catProducts.length})</h2>
            <div className="grid gap-2">
              {catProducts.map(p => (
                <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                        {p.imageUrl ? <img src={p.imageUrl} className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{p.displayName || p.name}</h3>
                          {p.sku && <span className="text-[10px] text-muted-foreground font-mono">{p.sku}</span>}
                        </div>
                        {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.hardwareIncluded && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Hardware</Badge>}
                          {p.printOnlyAvailable && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-200 text-blue-700">Graphic only</Badge>}
                          {p.rentalEligible && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-200 text-violet-700">Rental</Badge>}
                          {p.usePartnerInventoryEligible && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-200 text-emerald-700">Partner-owned</Badge>}
                          {p.reusableHardwareCompatible && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-200 text-amber-700">Reusable HW</Badge>}
                          {p.inventoryTracked && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Tracked</Badge>}
                          {p.leadTimeDays && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{p.leadTimeDays}d lead</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete?")) del.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Product" : `Edit ${editing?.name || ""}`}</DialogTitle>
          </DialogHeader>
          {editing && (
            <Tabs defaultValue="customer" className="mt-2">
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="customer">Customer-facing</TabsTrigger>
                <TabsTrigger value="caps">Capabilities</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="shipping">Shipping</TabsTrigger>
                <TabsTrigger value="ops">Backend Ops</TabsTrigger>
                <TabsTrigger value="standards" disabled={isNew}>Spec Standards</TabsTrigger>
                <TabsTrigger value="quotes" disabled={isNew}>Sources ({editing.id ? <QuoteCount productId={editing.id} /> : 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="customer" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Internal Name" value={editing.name} onChange={v => setEditing(p => ({ ...p!, name: v }))} />
                  <Field label="Display Name (customer-facing)" value={editing.displayName} onChange={v => setEditing(p => ({ ...p!, displayName: v }))} />
                  <Field label="Category" value={editing.category} onChange={v => setEditing(p => ({ ...p!, category: v }))} />
                  <Field label="Slug" value={editing.slug} onChange={v => setEditing(p => ({ ...p!, slug: v }))} />
                  <Field label="SKU" value={editing.sku} onChange={v => setEditing(p => ({ ...p!, sku: v }))} />
                  <Field label="Visible Dimensions (label)" value={editing.visibleDimensions} onChange={v => setEditing(p => ({ ...p!, visibleDimensions: v }))} placeholder="8ft x 8ft" />
                </div>
                <div><Label className="text-xs">Short Description</Label><Textarea value={editing.description || ""} onChange={e => setEditing(p => ({ ...p!, description: e.target.value }))} className="min-h-[60px]" /></div>
                <div><Label className="text-xs">Customer-facing summary (longer)</Label><Textarea value={editing.customerFacingSummary || ""} onChange={e => setEditing(p => ({ ...p!, customerFacingSummary: e.target.value }))} className="min-h-[60px]" /></div>
                {!isNew && editing.id && <ProductIntelligencePanel product={editing as Product} onChange={(p) => setEditing(prev => ({ ...prev!, ...p }))} />}
                <Field label="Thumbnail URL" value={editing.imageUrl} onChange={v => setEditing(p => ({ ...p!, imageUrl: v }))} />
                <div><Label className="text-xs">Feature badges (comma-separated)</Label><Input value={(editing.featureBadgesJson || []).join(", ")} onChange={e => setEditing(p => ({ ...p!, featureBadgesJson: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} placeholder="LED, Heavy duty, Quick install" /></div>
                <div><Label className="text-xs">Size options (comma-separated)</Label><Input value={(editing.sizeOptionsJson || []).join(", ")} onChange={e => setEditing(p => ({ ...p!, sizeOptionsJson: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} /></div>
                <DimensionInput
                  label="Structured dimensions"
                  helperText="Stored normalized to mm so this product reads cleanly in either unit system."
                  showDepth
                  showDiameter
                  value={{
                    width: editing.sizeWidth ?? null,
                    height: editing.sizeHeight ?? null,
                    depth: editing.sizeDepth ?? null,
                    diameter: editing.sizeDiameter ?? null,
                    unit: ((editing.sizeUnit as LengthUnit) || "in"),
                  }}
                  onChange={(v) => setEditing(p => ({
                    ...p!,
                    sizeWidth: v.width,
                    sizeHeight: v.height,
                    sizeDepth: v.depth ?? null,
                    sizeDiameter: v.diameter ?? null,
                    sizeUnit: v.unit,
                  }))}
                />
                <ArtworkSpecInput
                  label="Artwork specs (bleed, safe area, visible)"
                  value={{
                    artworkWidth: editing.artworkWidth ?? null,
                    artworkHeight: editing.artworkHeight ?? null,
                    bleed: editing.bleed ?? null,
                    safeArea: editing.safeArea ?? null,
                    visibleWidth: editing.visibleWidth ?? null,
                    visibleHeight: editing.visibleHeight ?? null,
                    artworkUnit: ((editing.artworkUnit as LengthUnit) || (editing.sizeUnit as LengthUnit) || "in"),
                  }}
                  onChange={(v) => setEditing(p => ({
                    ...p!,
                    artworkWidth: v.artworkWidth,
                    artworkHeight: v.artworkHeight,
                    bleed: v.bleed,
                    safeArea: v.safeArea,
                    visibleWidth: v.visibleWidth,
                    visibleHeight: v.visibleHeight,
                    artworkUnit: v.artworkUnit,
                  }))}
                />
              </TabsContent>

              <TabsContent value="caps" className="space-y-1 mt-4">
                <p className="text-xs text-muted-foreground mb-3">Capability flags drive which fulfillment modes appear when ordering this product.</p>
                {(["hardwareIncluded","printOnlyAvailable","rentalEligible","usePartnerInventoryEligible","reusableHardwareCompatible","inventoryTracked","requiresAttachmentSelection","requiresMaterialSelection"] as (keyof Product)[]).map(key => (
                  <div key={key} className="flex items-center justify-between py-2 border-b">
                    <Label className="text-sm">{CAPABILITY_LABELS[key]}</Label>
                    <Switch checked={!!(editing as any)[key]} onCheckedChange={v => setEditing(p => ({ ...p!, [key]: v }))} />
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 border-b"><Label className="text-sm">Orderable</Label><Switch checked={editing.isOrderable ?? true} onCheckedChange={v => setEditing(p => ({ ...p!, isOrderable: v }))} /></div>
                <div className="flex items-center justify-between py-2 border-b"><Label className="text-sm">Allows design request</Label><Switch checked={editing.allowsDesignRequest ?? true} onCheckedChange={v => setEditing(p => ({ ...p!, allowsDesignRequest: v }))} /></div>
                <div className="flex items-center justify-between py-2"><Label className="text-sm">Active</Label><Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing(p => ({ ...p!, isActive: v }))} /></div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-3 mt-4">
                <PricingModelInput
                  value={{
                    pricingModel: (editing.pricingModel as PricingModel | null) ?? null,
                    unitRate: (editing as any).unitRate ?? null,
                    pricingUnit: (editing.pricingUnit as PricingUnit | null) ?? null,
                    minBillableSize: (editing as any).minBillableSize ?? null,
                    minCharge: (editing as any).minCharge ?? null,
                    allowsCustomSize: (editing as any).allowsCustomSize ?? false,
                  }}
                  onChange={patch => setEditing(p => ({ ...p!, ...patch }))}
                  sampleWidthMm={(editing as any).sizeWidthMm ?? null}
                  sampleHeightMm={(editing as any).sizeHeightMm ?? null}
                />
              </TabsContent>

              <TabsContent value="shipping" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  These are the default packed dimensions, weight, and handling flags for this product.
                  When an order line is created, these defaults are copied onto the order item — admins
                  can still override them per shipment.
                </p>
                <PackingDetailsInput
                  title="Shipping & packing defaults"
                  value={{
                    packedWidth: editing.packedWidth ?? null,
                    packedHeight: editing.packedHeight ?? null,
                    packedDepth: editing.packedDepth ?? null,
                    packedSizeUnit: ((editing.packedSizeUnit as LengthUnit | null) || (editing.sizeUnit as LengthUnit | null)),
                    shippingWeight: editing.shippingWeight ?? null,
                    shippingWeightUnit: (editing.shippingWeightUnit as WeightUnit | null),
                    cartonCount: editing.cartonCount ?? null,
                    packingMode: (editing.packingMode as PackingMode | null) ?? null,
                    crateRequired: !!editing.crateRequired,
                    palletRequired: !!editing.palletRequired,
                    oversizeFlag: !!editing.oversizeFlag,
                    freightClass: editing.freightClass ?? null,
                    installKitNotes: editing.installKitNotes ?? null,
                  }}
                  onChange={(v: PackingDetailsValue) => setEditing(p => ({
                    ...p!,
                    packedWidth: v.packedWidth, packedHeight: v.packedHeight, packedDepth: v.packedDepth,
                    packedSizeUnit: v.packedSizeUnit,
                    shippingWeight: v.shippingWeight, shippingWeightUnit: v.shippingWeightUnit,
                    cartonCount: v.cartonCount, packingMode: v.packingMode,
                    crateRequired: v.crateRequired, palletRequired: v.palletRequired, oversizeFlag: v.oversizeFlag,
                    freightClass: v.freightClass, installKitNotes: v.installKitNotes,
                  }))}
                />
              </TabsContent>

              <TabsContent value="ops" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Attachment method" value={editing.attachmentMethod} onChange={v => setEditing(p => ({ ...p!, attachmentMethod: v }))} placeholder="Velcro / Grommets / Pole pocket" />
                  <Field label="Material" value={editing.material} onChange={v => setEditing(p => ({ ...p!, material: v }))} placeholder="13oz vinyl / Polyester" />
                  <Field label="Finishing" value={editing.finishing} onChange={v => setEditing(p => ({ ...p!, finishing: v }))} />
                  <Field label="Lead time (days)" value={editing.leadTimeDays?.toString()} onChange={v => setEditing(p => ({ ...p!, leadTimeDays: v ? parseInt(v) : null }))} type="number" />
                </div>
                <div><Label className="text-xs">Production notes (vendor-facing)</Label><Textarea value={editing.backendProductionNotes || ""} onChange={e => setEditing(p => ({ ...p!, backendProductionNotes: e.target.value }))} className="min-h-[60px]" /></div>
                <div><Label className="text-xs">Install notes</Label><Textarea value={editing.installNotes || ""} onChange={e => setEditing(p => ({ ...p!, installNotes: e.target.value }))} className="min-h-[60px]" /></div>
                <div><Label className="text-xs">Internal ops summary</Label><Textarea value={editing.internalOpsSummary || ""} onChange={e => setEditing(p => ({ ...p!, internalOpsSummary: e.target.value }))} className="min-h-[60px]" placeholder="Stuff your team needs to remember about this product." /></div>
              </TabsContent>

              {!isNew && editing.id && (
                <TabsContent value="standards" className="mt-4">
                  <SpecStandardsPanel productId={editing.id} />
                </TabsContent>
              )}

              {!isNew && editing.id && (
                <TabsContent value="quotes" className="mt-4">
                  <QuoteAssetsPanel attachableType="product" attachableId={editing.id} />
                </TabsContent>
              )}
            </Tabs>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isNew ? "Add Product" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} /></div>;
}

function QuoteCount({ productId }: { productId: number }) {
  const { data: assets = [] } = useQuery<QuoteAsset[]>({ queryKey: [`/api/quote-assets`, productId], queryFn: () => apiFetch(`/api/quote-assets?attachableType=product&attachableId=${productId}`) });
  return <>{assets.length}</>;
}

export function QuoteAssetsPanel({ attachableType, attachableId }: { attachableType: string; attachableId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { data: assets = [], refetch } = useQuery<QuoteAsset[]>({ queryKey: [`/api/quote-assets`, attachableType, attachableId], queryFn: () => apiFetch(`/api/quote-assets?attachableType=${attachableType}&attachableId=${attachableId}`) });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Attach quotes, spec sheets, or supplier references to this {attachableType.replace("_", " ")}.</p>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add reference</Button>
      </div>

      {assets.length === 0 && !adding && (
        <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />No quotes or specs attached yet.</div>
      )}

      <div className="space-y-2">
        {assets.map(a => {
          const expired = a.expirationDate && a.expirationDate < today;
          return editingId === a.id ? (
            <QuoteForm key={a.id} initial={a} attachableType={attachableType} attachableId={attachableId} onClose={() => { setEditingId(null); refetch(); }} />
          ) : (
            <Card key={a.id} className={a.isApprovedStandard ? "border-emerald-300 bg-emerald-50/40" : ""}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.name}</span>
                      {a.version && <Badge variant="outline" className="text-[10px]">v{a.version}</Badge>}
                      {a.isApprovedStandard && <Badge className="text-[10px] bg-emerald-600"><Star className="h-2.5 w-2.5 mr-0.5" />Approved standard</Badge>}
                      {expired && <Badge variant="destructive" className="text-[10px]"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />Expired</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.supplierName && <>Supplier: {a.supplierName} · </>}
                      {a.effectiveDate && <>Effective {a.effectiveDate} </>}
                      {a.expirationDate && <>· Expires {a.expirationDate}</>}
                    </div>
                    {(a.dimensionsSummary || a.materialSummary || a.attachmentSummary || a.hardwareSummary) && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                        {a.dimensionsSummary && <div><span className="text-muted-foreground">Dimensions:</span> {a.dimensionsSummary}</div>}
                        {a.materialSummary && <div><span className="text-muted-foreground">Material:</span> {a.materialSummary}</div>}
                        {a.attachmentSummary && <div><span className="text-muted-foreground">Attachment:</span> {a.attachmentSummary}</div>}
                        {a.hardwareSummary && <div><span className="text-muted-foreground">Hardware:</span> {a.hardwareSummary}</div>}
                      </div>
                    )}
                    {a.notes && <div className="text-xs mt-2 text-muted-foreground italic">{a.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(a.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { if (confirm("Delete?")) { await apiFetch(`/api/quote-assets/${a.id}`, { method: "DELETE" }); refetch(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {adding && <QuoteForm attachableType={attachableType} attachableId={attachableId} onClose={() => { setAdding(false); refetch(); }} />}
      </div>
    </div>
  );
}

function QuoteForm({ initial, attachableType, attachableId, onClose }: { initial?: QuoteAsset; attachableType: string; attachableId: number; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<QuoteAsset>>(initial || { name: "", fileUrl: "", attachableType, attachableId });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await apiFetch("/api/storage/uploads/request-url", { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) });
      if (!r.uploadURL || !r.objectPath) throw new Error("Invalid upload response");
      const putRes = await fetch(r.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
      setForm(f => ({ ...f, fileUrl: r.objectPath, fileType: file.type, name: f.name || file.name.replace(/\.[^.]+$/, "") }));
      toast({ title: "Uploaded" });
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.fileUrl) { toast({ title: "Name and file required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = initial ? `/api/quote-assets/${initial.id}` : "/api/quote-assets";
      const method = initial ? "PATCH" : "POST";
      await apiFetch(url, { method, body: JSON.stringify({ ...form, attachableType, attachableId }) });
      toast({ title: "Saved" });
      onClose();
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">{initial ? "Edit reference" : "New quote/spec reference"}</h4>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Title" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <Field label="Supplier" value={form.supplierName} onChange={v => setForm(f => ({ ...f, supplierName: v }))} />
          <Field label="Version" value={form.version} onChange={v => setForm(f => ({ ...f, version: v }))} />
          <div></div>
          <Field label="Effective date" value={form.effectiveDate} onChange={v => setForm(f => ({ ...f, effectiveDate: v }))} type="date" />
          <Field label="Expiration date" value={form.expirationDate} onChange={v => setForm(f => ({ ...f, expirationDate: v }))} type="date" />
          <Field label="Dimensions summary" value={form.dimensionsSummary} onChange={v => setForm(f => ({ ...f, dimensionsSummary: v }))} placeholder="8x8 ft" />
          <Field label="Material summary" value={form.materialSummary} onChange={v => setForm(f => ({ ...f, materialSummary: v }))} />
          <Field label="Attachment summary" value={form.attachmentSummary} onChange={v => setForm(f => ({ ...f, attachmentSummary: v }))} />
          <Field label="Hardware summary" value={form.hardwareSummary} onChange={v => setForm(f => ({ ...f, hardwareSummary: v }))} />
        </div>
        <div><Label className="text-xs">Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[50px]" /></div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Upload className="h-3.5 w-3.5" />{uploading ? "Uploading..." : (form.fileUrl ? "Replace file" : "Upload file")}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {form.fileUrl && <span className="text-xs text-muted-foreground truncate flex-1">{form.fileUrl}</span>}
          <div className="flex items-center gap-1.5 ml-auto"><Switch checked={!!form.isApprovedStandard} onCheckedChange={v => setForm(f => ({ ...f, isApprovedStandard: v }))} /><Label className="text-xs">Approved standard</Label></div>
          <div className="flex items-center gap-1.5"><Switch checked={!!form.vendorVisible} onCheckedChange={v => setForm(f => ({ ...f, vendorVisible: v }))} /><Label className="text-xs">Vendor visible</Label></div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save</Button></div>
      </CardContent>
    </Card>
  );
}

const MISSING_FLAGS_PRODUCT = [
  "missing_dimensions", "missing_material", "missing_attachment", "missing_lead_time",
  "unclear_hardware", "missing_customer_summary", "missing_ops_summary", "needs_supplier",
];
const REVIEW_STATUSES = [
  { value: "new", label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "in_review", label: "In review", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "needs_clarification", label: "Needs clarification", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "archived", label: "Archived", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
];

function ProductIntelligencePanel({ product, onChange }: { product: Partial<Product>; onChange: (patch: Partial<Product>) => void }) {
  const flags = product.missingDataFlagsJson || [];
  const toggleFlag = (flag: string) => {
    const cur = new Set(flags);
    cur.has(flag) ? cur.delete(flag) : cur.add(flag);
    onChange({ missingDataFlagsJson: [...cur] });
  };
  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal review</Label>
        <Select value={product.reviewStatus || "approved"} onValueChange={v => onChange({ reviewStatus: v })}>
          <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{REVIEW_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Missing data flags</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {MISSING_FLAGS_PRODUCT.map(f => {
            const on = flags.includes(f);
            return (
              <button key={f} type="button" onClick={() => toggleFlag(f)} className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${on ? "bg-rose-100 border-rose-300 text-rose-800" : "bg-card border-border hover:bg-muted"}`}>
                {on ? "✓ " : ""}{f.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpecStandardsPanel({ productId }: { productId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: standards = [] } = useQuery<SpecStandard[]>({ queryKey: [`/api/products/${productId}/spec-standards`], queryFn: () => apiFetch(`/api/products/${productId}/spec-standards`) });
  const { data: suppliers = [] } = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const [editing, setEditing] = useState<Partial<SpecStandard> | null>(null);
  const isNew = editing && !editing.id;

  const save = useMutation({
    mutationFn: () => {
      const url = editing!.id ? `/api/products/${productId}/spec-standards/${editing!.id}` : `/api/products/${productId}/spec-standards`;
      return apiFetch(url, { method: editing!.id ? "PATCH" : "POST", body: JSON.stringify(editing) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/products/${productId}/spec-standards`] }); setEditing(null); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/products/${productId}/spec-standards/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/products/${productId}/spec-standards`] }); toast({ title: "Removed" }); },
  });
  const setCurrent = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/products/${productId}/spec-standards/${id}/set-current`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/products/${productId}/spec-standards`] }); toast({ title: "Set as current preferred" }); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Standardized spec records — one is marked as the current preferred. Multiple suppliers can each have their own standard.</p>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing({ title: "", standardType: "preferred", isActive: true, isApproved: false, isCurrent: standards.length === 0 })}><Plus className="h-3.5 w-3.5" /> Add standard</Button>
      </div>

      {standards.length === 0 && !editing && <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground"><Star className="h-8 w-8 mx-auto mb-2 opacity-40" />No spec standards yet. Add one or promote a source from the Ingestion workspace.</div>}

      <div className="space-y-2">
        {standards.map(s => (
          <Card key={s.id} className={s.isCurrent ? "border-emerald-300 bg-emerald-50/40" : ""}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.title}</span>
                    {s.isCurrent && <Badge className="text-[10px] bg-emerald-600"><Star className="h-2.5 w-2.5 mr-0.5" />Current preferred</Badge>}
                    <Badge variant="outline" className="text-[10px]">{s.standardType.replace(/_/g, " ")}</Badge>
                    {s.isApproved && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800">Approved</Badge>}
                    {!s.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    {s.supplierId && <Badge variant="secondary" className="text-[10px]">{suppliers.find(x => x.id === s.supplierId)?.name || `Supplier #${s.supplierId}`}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                    {s.dimensionsSummary && <div><span className="text-muted-foreground">Dimensions:</span> {s.dimensionsSummary}</div>}
                    {s.materialSummary && <div><span className="text-muted-foreground">Material:</span> {s.materialSummary}</div>}
                    {s.attachmentSummary && <div><span className="text-muted-foreground">Attachment:</span> {s.attachmentSummary}</div>}
                    {s.hardwareSummary && <div><span className="text-muted-foreground">Hardware:</span> {s.hardwareSummary}</div>}
                    {s.leadTimeDays != null && <div><span className="text-muted-foreground">Lead time:</span> {s.leadTimeDays}d</div>}
                  </div>
                  {s.missingDataFlagsJson && s.missingDataFlagsJson.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">{s.missingDataFlagsJson.map(f => <Badge key={f} variant="outline" className="text-[10px] border-rose-300 text-rose-700">{f.replace(/_/g, " ")}</Badge>)}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!s.isCurrent && <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setCurrent.mutate(s.id)}><Star className="h-3 w-3" />Set current</Button>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing({ ...s })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete?")) del.mutate(s.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{isNew ? "New spec standard" : "Edit standard"}</h4>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Title" value={editing.title} onChange={v => setEditing(e => ({ ...e!, title: v }))} />
              <div>
                <Label className="text-xs">Standard type</Label>
                <Select value={editing.standardType || "preferred"} onValueChange={v => setEditing(e => ({ ...e!, standardType: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preferred">Preferred</SelectItem>
                    <SelectItem value="alternate">Alternate</SelectItem>
                    <SelectItem value="legacy">Legacy</SelectItem>
                    <SelectItem value="zone_specific">Zone-specific</SelectItem>
                    <SelectItem value="package_specific">Package-specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Supplier</Label>
                <Select value={editing.supplierId ? String(editing.supplierId) : "__none__"} onValueChange={v => setEditing(e => ({ ...e!, supplierId: v === "__none__" ? null : parseInt(v) }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">(none)</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Field label="Lead time (days)" type="number" value={editing.leadTimeDays?.toString()} onChange={v => setEditing(e => ({ ...e!, leadTimeDays: v ? parseInt(v) : null }))} />
              <Field label="Dimensions" value={editing.dimensionsSummary} onChange={v => setEditing(e => ({ ...e!, dimensionsSummary: v }))} />
              <Field label="Material" value={editing.materialSummary} onChange={v => setEditing(e => ({ ...e!, materialSummary: v }))} />
              <Field label="Finishing" value={editing.finishingSummary} onChange={v => setEditing(e => ({ ...e!, finishingSummary: v }))} />
              <Field label="Attachment" value={editing.attachmentSummary} onChange={v => setEditing(e => ({ ...e!, attachmentSummary: v }))} />
              <Field label="Hardware" value={editing.hardwareSummary} onChange={v => setEditing(e => ({ ...e!, hardwareSummary: v }))} />
              <Field label="Effective date" type="date" value={editing.effectiveDate} onChange={v => setEditing(e => ({ ...e!, effectiveDate: v }))} />
              <Field label="Expiration date" type="date" value={editing.expirationDate} onChange={v => setEditing(e => ({ ...e!, expirationDate: v }))} />
            </div>
            <div><Label className="text-xs">Print file requirements</Label><Textarea value={editing.printFileRequirements || ""} onChange={e => setEditing(p => ({ ...p!, printFileRequirements: e.target.value }))} className="min-h-[50px]" /></div>
            <div><Label className="text-xs">Install notes</Label><Textarea value={editing.installNotes || ""} onChange={e => setEditing(p => ({ ...p!, installNotes: e.target.value }))} className="min-h-[50px]" /></div>
            <div><Label className="text-xs">Internal ops notes</Label><Textarea value={editing.internalOpsNotes || ""} onChange={e => setEditing(p => ({ ...p!, internalOpsNotes: e.target.value }))} className="min-h-[50px]" /></div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5"><Switch checked={!!editing.isApproved} onCheckedChange={v => setEditing(e => ({ ...e!, isApproved: v }))} /><Label className="text-xs">Approved</Label></div>
              <div className="flex items-center gap-1.5"><Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing(e => ({ ...e!, isActive: v }))} /><Label className="text-xs">Active</Label></div>
              <div className="flex items-center gap-1.5"><Switch checked={!!editing.isCurrent} onCheckedChange={v => setEditing(e => ({ ...e!, isCurrent: v }))} /><Label className="text-xs">Current preferred</Label></div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={() => save.mutate()} disabled={!editing.title || save.isPending}>{save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
