/**
 * Partner-specific Add-Ons (Section 35).
 *
 * Two-pane builder:
 *   LEFT  — Selected add-ons (sorted, with featured/active toggles + remove).
 *   RIGHT — Searchable product catalog with "Add" buttons. Already-added items
 *           are shown as "Added".
 *
 * Saves via PUT /api/partners/:id/addons (bulk replace).
 */
import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Plus, Trash2, Star, ChevronUp, ChevronDown, Search, PackagePlus, Save,
} from "lucide-react";

type Product = { id: number; name: string; category: string; imageUrl: string | null; isActive: boolean; slug: string };
type AddonRow = {
  id?: number; productId: number; sortOrder: number; isFeatured: boolean; isActive: boolean;
  productName?: string | null; productCategory?: string | null; productImageUrl?: string | null; productSlug?: string | null; productIsActive?: boolean | null;
};

export default function PartnerAddons() {
  const { id } = useParams<{ id: string }>();
  const partnerId = Number(id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: partner } = useQuery<{ id: number; companyName: string; slug: string }>({
    queryKey: [`/api/partners/${partnerId}`],
    queryFn: () => apiFetch(`/api/partners/${partnerId}`),
  });
  const { data: addonsServer = [], isLoading: loadingAddons } = useQuery<AddonRow[]>({
    queryKey: [`/api/partners/${partnerId}/addons`],
    queryFn: () => apiFetch(`/api/partners/${partnerId}/addons`),
  });
  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/product-catalog"],
    queryFn: () => apiFetch("/api/product-catalog"),
  });

  const [rows, setRows] = useState<AddonRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setRows(addonsServer.map((a, i) => ({ ...a, sortOrder: a.sortOrder ?? i })));
    setDirty(false);
  }, [addonsServer]);

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.isActive)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  const addProduct = (p: Product) => {
    if (selectedIds.has(p.id)) return;
    setRows((prev) => [
      ...prev,
      {
        productId: p.id,
        sortOrder: prev.length,
        isFeatured: false,
        isActive: true,
        productName: p.name,
        productCategory: p.category,
        productImageUrl: p.imageUrl,
        productSlug: p.slug,
        productIsActive: p.isActive,
      },
    ]);
    setDirty(true);
  };
  const removeRow = (productId: number) => {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRows(next.map((r, i) => ({ ...r, sortOrder: i })));
    setDirty(true);
  };
  const updateRow = (productId: number, patch: Partial<AddonRow>) => {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => apiFetch(`/api/partners/${partnerId}/addons`, {
      method: "PUT",
      body: JSON.stringify({
        addons: rows.map((r, i) => ({
          productId: r.productId,
          sortOrder: i,
          isFeatured: r.isFeatured,
          isActive: r.isActive,
        })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/partners/${partnerId}/addons`] });
      toast({ title: "Add-ons saved", description: `${rows.length} add-on${rows.length === 1 ? "" : "s"} configured.` });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const isLoading = loadingAddons || loadingProducts;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/partners"><Button variant="ghost" size="sm" className="gap-1 mb-1"><ArrowLeft className="w-4 h-4" /> Partners</Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PackagePlus className="w-6 h-6" /> Add-Ons</h1>
          <p className="text-sm text-muted-foreground">
            {partner ? <>Configure which products are offered as add-ons on <span className="font-medium">{partner.companyName}</span>'s portal.</> : "Loading partner…"}
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selected */}
        <Card>
          <CardHeader>
            <CardTitle>Selected add-ons ({rows.length})</CardTitle>
            <CardDescription>Reorder with the arrows. Featured items appear first in the ordering flow.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed rounded p-6 text-center">
                  No add-ons selected yet. Use the catalog on the right to add products.
                </div>
              ) : (
                <ul className="space-y-2">
                  {rows.map((r, idx) => (
                    <li key={r.productId} className="flex items-center gap-3 border rounded p-2">
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, -1)} disabled={idx === 0}><ChevronUp className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}><ChevronDown className="w-3.5 h-3.5" /></Button>
                      </div>
                      {r.productImageUrl
                        ? <img src={r.productImageUrl} alt="" className="w-10 h-10 rounded object-cover bg-muted" />
                        : <div className="w-10 h-10 rounded bg-muted" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.productName || `Product #${r.productId}`}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.productCategory}</div>
                      </div>
                      <button
                        onClick={() => updateRow(r.productId, { isFeatured: !r.isFeatured })}
                        className={`p-1 rounded ${r.isFeatured ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
                        title={r.isFeatured ? "Unfeature" : "Mark featured"}
                      >
                        <Star className={`w-4 h-4 ${r.isFeatured ? "fill-amber-400" : ""}`} />
                      </button>
                      <div className="flex items-center gap-1">
                        <Switch checked={r.isActive} onCheckedChange={(v) => updateRow(r.productId, { isActive: v })} />
                        <span className="text-xs text-muted-foreground w-10">{r.isActive ? "Active" : "Off"}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => removeRow(r.productId)}><Trash2 className="w-4 h-4" /></Button>
                    </li>
                  ))}
                </ul>
              )}
          </CardContent>
        </Card>

        {/* Catalog picker */}
        <Card>
          <CardHeader>
            <CardTitle>Product catalog</CardTitle>
            <CardDescription>Pick from active products to add to this partner's add-on library.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by name or category" className="pl-8" />
            </div>
            <div className="max-h-[600px] overflow-auto border rounded">
              {filteredProducts.length === 0
                ? <div className="p-6 text-center text-sm text-muted-foreground">No products match.</div>
                : (
                  <ul className="divide-y">
                    {filteredProducts.map((p) => {
                      const added = selectedIds.has(p.id);
                      return (
                        <li key={p.id} className="flex items-center gap-3 p-2">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-10 h-10 rounded object-cover bg-muted" /> : <div className="w-10 h-10 rounded bg-muted" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{p.category}</div>
                          </div>
                          {added
                            ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Added</Badge>
                            : <Button size="sm" variant="outline" className="gap-1" onClick={() => addProduct(p)}><Plus className="w-3.5 h-3.5" /> Add</Button>}
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
