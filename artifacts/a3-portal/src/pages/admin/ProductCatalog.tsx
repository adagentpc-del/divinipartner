import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Package, Search } from "lucide-react";

interface Product {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  imageUrl: string;
  isOrderable: boolean;
  allowsDesignRequest: boolean;
  sizeOptionsJson: string[];
  isActive: boolean;
}

export default function ProductCatalog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProducts = () => {
    fetch("/api/products")
      .then(r => r.json())
      .then(data => { setProducts(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, []);

  const openNew = () => {
    setEditing({
      name: "", slug: "", category: "", description: "", imageUrl: "",
      isOrderable: true, allowsDesignRequest: true, sizeOptionsJson: [], isActive: true,
    });
    setIsNew(true);
  };

  const openEdit = (p: Product) => {
    setEditing({ ...p });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editing?.name || !editing?.category) return;
    setSaving(true);

    const slug = editing.slug || editing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const body = { ...editing, slug };

    const url = isNew ? "/api/products" : `/api/products/${editing.id}`;
    const method = isNew ? "POST" : "PATCH";

    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: isNew ? "Product added" : "Product updated" });
        setEditing(null);
        loadProducts();
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (productId: number) => {
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    toast({ title: "Product removed" });
    loadProducts();
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = [...new Set(products.map(p => p.category))].sort();

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} products across {categories.length} categories</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Product
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {categories.map(category => {
        const catProducts = filteredProducts.filter(p => p.category === category);
        if (catProducts.length === 0) return null;
        return (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category} ({catProducts.length})</h2>
            <div className="grid gap-2">
              {catProducts.map(product => (
                <Card key={product.id} className={!product.isActive ? "opacity-50" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm truncate">{product.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">{product.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {product.sizeOptionsJson?.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">{product.sizeOptionsJson.length} sizes</Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(product)} aria-label="Edit product">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(product.id)} aria-label="Delete product">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Product" : "Edit Product"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Product Name</Label>
                <Input value={editing.name || ""} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Input value={editing.category || ""} onChange={e => setEditing(p => p ? { ...p, category: e.target.value } : p)} placeholder="Displays & Backdrops" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Slug</Label>
                  <Input value={editing.slug || ""} onChange={e => setEditing(p => p ? { ...p, slug: e.target.value } : p)} placeholder="auto-generated" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={editing.description || ""} onChange={e => setEditing(p => p ? { ...p, description: e.target.value } : p)} className="min-h-[60px] resize-none" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image URL</Label>
                <Input value={editing.imageUrl || ""} onChange={e => setEditing(p => p ? { ...p, imageUrl: e.target.value } : p)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Size Options (comma separated)</Label>
                <Input
                  value={(editing.sizeOptionsJson || []).join(", ")}
                  onChange={e => setEditing(p => p ? { ...p, sizeOptionsJson: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : p)}
                  placeholder="8x8 ft, 8x10 ft, Custom"
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={editing.isOrderable ?? true} onCheckedChange={v => setEditing(p => p ? { ...p, isOrderable: v } : p)} />
                  <Label className="text-xs">Orderable</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.allowsDesignRequest ?? true} onCheckedChange={v => setEditing(p => p ? { ...p, allowsDesignRequest: v } : p)} />
                  <Label className="text-xs">Design Requests</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing(p => p ? { ...p, isActive: v } : p)} />
                  <Label className="text-xs">Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isNew ? "Add Product" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
