/**
 * Partner-specific Add-Ons (Section 35).
 *
 * Single-pane builder:
 *   TOP    — Searchable autocomplete combobox. Type product name / SKU /
 *            category to filter the catalog; click a result to add. Already-
 *            added items are disabled in the list.
 *   BOTTOM — Selected add-ons (sorted, with featured/active toggles + remove).
 *
 * Saves via PUT /api/partners/:id/addons (bulk replace).
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Plus, Trash2, Star, ChevronUp, ChevronDown, PackagePlus, Save, Check, Search,
} from "lucide-react";

import type { ProductCatalog, PartnerAddon } from "@workspace/db/schema";
type Product = ProductCatalog;

type AddonRow = Omit<PartnerAddon, "id" | "createdAt" | "updatedAt" | "productId" | "partnerId" | "surveyAssetId"> & {
  id?: number;
  productId: number;
  productName?: string | null; productCategory?: string | null; productImageUrl?: string | null; productSlug?: string | null; productIsActive?: boolean | null;
  productSku?: string | null;
  effectiveCategory?: string | null;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setRows(addonsServer.map((a, i) => ({ ...a, sortOrder: a.sortOrder ?? i })));
    setDirty(false);
  }, [addonsServer]);

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);

  // Searchable filter — matches product name, displayName, SKU, slug, or
  // category against each whitespace-separated token in the query. All tokens
  // must match somewhere for the product to appear.
  const filteredProducts = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products
      .filter((p) => includeInactive || p.isActive)
      .filter((p) => {
        if (tokens.length === 0) return true;
        const haystack = [
          p.name,
          p.displayName || "",
          p.sku || "",
          p.slug || "",
          p.category || "",
        ].join(" ").toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
  }, [products, search, includeInactive]);

  const addProduct = (p: Product) => {
    if (selectedIds.has(p.id)) return;
    setRows((prev) => [
      ...prev,
      {
        productId: p.id,
        sortOrder: prev.length,
        isFeatured: false,
        isActive: true,
        categoryOverride: null,
        productName: p.name,
        productCategory: p.category,
        productImageUrl: p.imageUrl,
        productSlug: p.slug,
        productIsActive: p.isActive,
        productSku: p.sku,
      },
    ]);
    setDirty(true);
    // Keep the picker open so the user can rapidly add several products.
    setSearch("");
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
          categoryOverride: r.categoryOverride && r.categoryOverride.trim() ? r.categoryOverride.trim() : null,
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
  const totalCatalog = products.length;
  const matchCount = filteredProducts.length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add a product</CardTitle>
          <CardDescription>
            Type to search the catalog by name, SKU, or category. Click a result to add it to this partner's add-on list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  ref={triggerRef}
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="justify-between w-full sm:w-[420px]"
                  disabled={loadingProducts}
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Search className="w-4 h-4" />
                    {loadingProducts ? "Loading catalog…" : "Search products to add…"}
                  </span>
                  <Plus className="w-4 h-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[420px]"
                align="start"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type product name, SKU, or category…"
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList className="max-h-[360px]">
                    <CommandEmpty>
                      <div className="py-6 text-center text-sm">
                        <div className="font-medium">No matching products found</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Try a different name, SKU, or category{!includeInactive ? " — or include inactive products below." : "."}
                        </div>
                      </div>
                    </CommandEmpty>
                    {filteredProducts.length > 0 && (
                      <CommandGroup heading={`${matchCount} of ${totalCatalog} products`}>
                        {filteredProducts.slice(0, 50).map((p) => {
                          const added = selectedIds.has(p.id);
                          return (
                            <CommandItem
                              key={p.id}
                              value={`${p.id}-${p.name}`}
                              onSelect={() => { if (!added) addProduct(p); }}
                              disabled={added}
                              className="flex items-center gap-3"
                            >
                              {p.imageUrl
                                ? <img src={p.imageUrl} alt="" className="w-9 h-9 rounded object-cover bg-muted shrink-0" />
                                : <div className="w-9 h-9 rounded bg-muted shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{p.displayName || p.name}</div>
                                <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                                  <span>{p.category || "Uncategorized"}</span>
                                  {p.sku ? <span className="font-mono">· SKU {p.sku}</span> : null}
                                  {!p.isActive ? <Badge variant="outline" className="h-4 text-[10px] px-1 border-amber-300 text-amber-700">Inactive</Badge> : null}
                                </div>
                              </div>
                              {added
                                ? <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span>
                                : <Plus className="w-4 h-4 opacity-60" />}
                            </CommandItem>
                          );
                        })}
                        {filteredProducts.length > 50 && (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            Showing first 50 — refine your search to see more.
                          </div>
                        )}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
              <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
              Include inactive products
            </label>
          </div>

          {/* Selected as quick chips for at-a-glance review */}
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {rows.map((r) => (
                <Badge key={r.productId} variant="secondary" className="gap-1 pl-2 pr-1">
                  <span className="max-w-[180px] truncate">{r.productName || `Product #${r.productId}`}</span>
                  <button
                    onClick={() => removeRow(r.productId)}
                    className="ml-0.5 rounded p-0.5 hover:bg-muted-foreground/10 text-muted-foreground hover:text-red-600"
                    title="Remove"
                    aria-label={`Remove ${r.productName || r.productId}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected add-ons ({rows.length})</CardTitle>
          <CardDescription>Reorder with the arrows. Featured items appear first in the ordering flow. Toggle off to hide without removing.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded p-8 text-center">
              No add-ons selected yet. Use the search box above to add products.
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
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.productCategory || "Uncategorized"}{r.productSku ? ` · SKU ${r.productSku}` : ""}
                    </div>
                    <Input
                      value={r.categoryOverride ?? ""}
                      onChange={(e) => updateRow(r.productId, { categoryOverride: e.target.value })}
                      placeholder={`Override category (default: ${r.productCategory || "Uncategorized"})`}
                      className="h-7 mt-1 text-xs"
                      title="Category for tile-view grouping. Blank = use product's catalog category."
                    />
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
    </div>
  );
}
