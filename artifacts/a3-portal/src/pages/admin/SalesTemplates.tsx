import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { uploadPublicFile } from "@/components/intake/intakeControls";
import {
  Loader2, Plus, Pencil, FileText, Search, Upload, Download, Eye, EyeOff, Archive, ArchiveRestore,
} from "lucide-react";

type Template = {
  id: number;
  fileName: string;
  category: string;
  productType: string | null;
  description: string | null;
  fileUrl: string;
  uploadedByName: string | null;
  isActive: boolean;
  clientFacing: boolean;
  createdAt: string;
};

const CATEGORIES = [
  "pole_banner_template",
  "pole_banner_spec",
  "material_spec",
  "print_template",
  "install_instructions",
  "permit_document",
  "coi_template",
  "artwork_guidelines",
  "production_standards",
];

const catLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

type FormState = {
  fileName: string; category: string; productType: string; description: string;
  fileUrl: string; isActive: boolean; clientFacing: boolean;
};
const EMPTY: FormState = {
  fileName: "", category: CATEGORIES[0], productType: "", description: "",
  fileUrl: "", isActive: true, clientFacing: false,
};

export default function SalesTemplates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [uploading, setUploading] = useState(false);

  const me = useQuery<{ role: string }>({ queryKey: ["/api/sales/me"], queryFn: () => apiFetch("/api/sales/me") });
  const isSuperAdmin = me.data?.role === "super_admin";

  const { data: templates, isLoading, isError, refetch } = useQuery<Template[]>({
    queryKey: ["/api/sales/templates"],
    queryFn: () => apiFetch("/api/sales/templates"),
  });

  const saveMut = useMutation({
    mutationFn: (body: FormState) => {
      const payload = {
        fileName: body.fileName,
        category: body.category,
        productType: body.productType || null,
        description: body.description || null,
        fileUrl: body.fileUrl,
        isActive: body.isActive,
        clientFacing: body.clientFacing,
      };
      return editing
        ? apiFetch(`/api/sales/templates/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/api/sales/templates", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales/templates"] });
      toast({ title: editing ? "Template updated" : "Template added" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Pick<Template, "isActive" | "clientFacing">> }) =>
      apiFetch(`/api/sales/templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/sales/templates"] }),
    onError: (e: any) => toast({ title: "Could not update", description: e?.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      fileName: t.fileName, category: t.category, productType: t.productType || "",
      description: t.description || "", fileUrl: t.fileUrl, isActive: t.isActive, clientFacing: t.clientFacing,
    });
    setOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadPublicFile(file);
      setForm((f) => ({ ...f, fileUrl: result.url, fileName: f.fileName || result.name }));
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const filtered = (templates || []).filter((t) => {
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.fileName.toLowerCase().includes(q) || (t.productType || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load templates. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Templates &amp; Specs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin ? "Manage the file library. Mark items client-facing to surface them on intake pages." : "Reference library of templates and specs."}
          </p>
        </div>
        {isSuperAdmin && <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />Add Template</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" className="pl-9" />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} className={t.isActive ? "" : "opacity-60"}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-1.5"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" />{t.fileName}</div>
                  {t.productType && <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.productType}</div>}
                  {t.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
                </div>
                {isSuperAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge variant="secondary" className="text-[10px]">{catLabel(t.category)}</Badge>
                {t.isActive ? <Badge variant="outline" className="text-[10px]">Active</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Archived</Badge>}
                {t.clientFacing && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Client-facing</Badge>}
              </div>
              {t.uploadedByName && <div className="text-[10px] text-muted-foreground mt-2">Uploaded by {t.uploadedByName}</div>}
              <div className="flex items-center gap-2 mt-3">
                <a href={t.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Download className="h-3.5 w-3.5" />Download
                </a>
                {isSuperAdmin && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" disabled={toggleMut.isPending}
                      onClick={() => toggleMut.mutate({ id: t.id, patch: { clientFacing: !t.clientFacing } })}>
                      {t.clientFacing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {t.clientFacing ? "Hide" : "Publish"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" disabled={toggleMut.isPending}
                      onClick={() => toggleMut.mutate({ id: t.id, patch: { isActive: !t.isActive } })}>
                      {t.isActive ? <Archive className="h-3 w-3" /> : <ArchiveRestore className="h-3 w-3" />}
                      {t.isActive ? "Archive" : "Restore"}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No templates {search || categoryFilter ? "match your filters" : "yet"}.</CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "Add Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File *</Label>
              {form.fileUrl ? (
                <div className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-3 py-2 mt-1">
                  <span className="truncate flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{form.fileName || "Uploaded file"}</span>
                  <button className="text-xs text-primary hover:underline" onClick={() => setForm((f) => ({ ...f, fileUrl: "" }))}>Replace</button>
                </div>
              ) : (
                <label className="mt-1 cursor-pointer flex items-center justify-center gap-2 text-sm px-3 py-3 rounded border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary transition">
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload file
                </label>
              )}
            </div>
            <div><Label>File Name *</Label><Input value={form.fileName} onChange={(e) => setForm((f) => ({ ...f, fileName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                </select>
              </div>
              <div><Label>Product Type</Label><Input value={form.productType} onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))} placeholder="e.g. Pole Banner" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="min-h-[60px] resize-none" /></div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.clientFacing} onChange={(e) => setForm((f) => ({ ...f, clientFacing: e.target.checked }))} />
                Client-facing (show on intake)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.fileName.trim() || !form.fileUrl || saveMut.isPending} className="gap-2">
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
