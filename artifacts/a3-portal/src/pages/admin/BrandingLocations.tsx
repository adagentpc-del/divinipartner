import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DimensionInput } from "@/components/units/DimensionInput";
import { PricingModelInput } from "@/components/units/PricingModelInput";
import { normalizeUnit, convert, type LengthUnit, type PricingModel, type PricingUnit } from "@/lib/units";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, MapPin, Eye, EyeOff, Check, AlertTriangle, Upload, FileText } from "lucide-react";
import { ImportDialog } from "@/components/imports/ImportDialog";
import { Link, useLocation } from "wouter";

import type { PartnerBrandingLocation } from "@workspace/db/schema";
type BrandingLocation = Omit<PartnerBrandingLocation, "unitRate" | "minCharge" | "pricingModel" | "createdAt" | "updatedAt"> & {
  pricingModel: string | null;
  unitRate: number | string | null;
  minCharge: number | string | null;
}

const CATEGORIES = [
  "Wall Graphic", "Window Decal", "Column Wrap", "Pole Banner", "Fence Banner",
  "Floor Graphic", "Door Graphic", "Directional Signage", "Registration Branding",
  "Step and Repeat Zone", "Sponsor Zone", "Custom / Other"
];

const emptyLocation: Partial<BrandingLocation> = {
  name: "", internalCode: "", category: "Wall Graphic", description: "",
  sizeWidth: null, sizeHeight: null, sizeUnit: "inches",
  previewImageUrl: "", productionNotesInternal: "", installNotesInternal: "",
  templateFileUrl: "", artworkGuidelines: "", reviewStatus: "needs_review",
  isActive: false, sortOrder: 0,
};

export default function BrandingLocations() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<BrandingLocation[]>([]);
  const [editingLocation, setEditingLocation] = useState<Partial<BrandingLocation> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractions, setExtractions] = useState<any[]>([]);
  const [importZonesOpen, setImportZonesOpen] = useState(false);
  const [importMeasurementsOpen, setImportMeasurementsOpen] = useState(false);

  const loadLocations = () => {
    fetch(`/api/partners/${id}/branding-locations`)
      .then(r => r.json())
      .then(data => { setLocations(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const loadExtractions = () => {
    fetch(`/api/partners/${id}/deck-extractions`)
      .then(r => r.json())
      .then(data => setExtractions(data || []))
      .catch(() => {});
  };

  useEffect(() => { loadLocations(); loadExtractions(); }, [id]);

  const handleDeckUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const uploadRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!uploadRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await uploadRes.json();
      if (!uploadURL || !objectPath) throw new Error("Invalid upload response");

      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("File upload failed");

      const extractRes = await fetch(`/api/partners/${id}/deck-extractions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileUrl: objectPath, sourceFileName: file.name }),
      });

      if (extractRes.ok) {
        const extraction = await extractRes.json();
        toast({ title: "Deck uploaded — extraction started" });
        navigate(`/admin/partners/${id}/deck-extractions/${extraction.id}`);
      } else {
        const err = await extractRes.json().catch(() => ({}));
        toast({ title: err.error || "Extraction failed", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    }
    setUploading(false);
  };

  const openNew = () => {
    setEditingLocation({ ...emptyLocation, sortOrder: locations.length });
    setIsNew(true);
  };

  const openEdit = (loc: BrandingLocation) => {
    setEditingLocation({ ...loc });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editingLocation?.name || !editingLocation?.category) return;
    setSaving(true);

    const url = isNew
      ? `/api/partners/${id}/branding-locations`
      : `/api/partners/${id}/branding-locations/${editingLocation.id}`;
    const method = isNew ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingLocation),
      });
      if (res.ok) {
        toast({ title: isNew ? "Location added" : "Location updated" });
        setEditingLocation(null);
        loadLocations();
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (locId: number) => {
    await fetch(`/api/partners/${id}/branding-locations/${locId}`, { method: "DELETE" });
    toast({ title: "Location removed" });
    loadLocations();
  };

  const handleBulkApprove = async () => {
    const needsReview = locations.filter(l => l.reviewStatus === "needs_review");
    if (needsReview.length === 0) return;

    await fetch(`/api/partners/${id}/branding-locations/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: needsReview.map(l => l.id), update: { reviewStatus: "approved", isActive: true } }),
    });
    toast({ title: `Approved ${needsReview.length} locations` });
    loadLocations();
  };

  const reviewCount = locations.filter(l => l.reviewStatus === "needs_review").length;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/partners">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Partners
          </span>
        </Link>
        <span>/</span>
        <Link href={`/admin/partners/${id}/edit`}>
          <span className="hover:text-primary transition-colors cursor-pointer">Edit</span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Venue Branding Locations</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6" /> Venue Branding Map</h1>
          <p className="text-sm text-muted-foreground mt-1">{locations.length} locations configured</p>
        </div>
        <div className="flex gap-2">
          <label>
            <input type="file" accept=".pdf" className="hidden" onChange={handleDeckUpload} disabled={uploading} />
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" asChild disabled={uploading}>
              <span>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload Deck
              </span>
            </Button>
          </label>
          {reviewCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleBulkApprove} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Approve All ({reviewCount})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setImportZonesOpen(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import Zones
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportMeasurementsOpen(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import Measurements
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Location
          </Button>
        </div>
      </div>

      <ImportDialog
        resource="branding-locations"
        open={importZonesOpen}
        onOpenChange={setImportZonesOpen}
        context={{ partnerId: id }}
        onComplete={loadLocations}
      />
      <ImportDialog
        resource="zone-measurements"
        open={importMeasurementsOpen}
        onOpenChange={setImportMeasurementsOpen}
        context={{ partnerId: id }}
        onComplete={loadLocations}
      />

      {extractions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Deck Extractions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {extractions.map(ext => (
                <Link key={ext.id} href={`/admin/partners/${id}/deck-extractions/${ext.id}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{ext.sourceFileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {ext.totalPages ? `${ext.totalPages} pages` : "Processing..."} · {new Date(ext.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={ext.status === "completed" ? "default" : ext.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                      {ext.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {locations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No branding locations yet.</p>
            <p className="text-xs text-muted-foreground mb-4">Add locations manually or upload a venue branding deck to extract them automatically.</p>
            <Button onClick={openNew}>Add First Location</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {locations.map(loc => (
            <Card key={loc.id} className={!loc.isActive ? "opacity-60" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {loc.previewImageUrl ? (
                      <img src={loc.previewImageUrl} alt={loc.name} className="h-12 w-16 object-cover rounded border" />
                    ) : (
                      <div className="h-12 w-16 bg-muted rounded border flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm truncate">{loc.name}</h3>
                        {loc.reviewStatus === "needs_review" && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> Review
                          </Badge>
                        )}
                        {loc.reviewStatus === "approved" && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 gap-0.5">
                            <Check className="h-2.5 w-2.5" /> Approved
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {loc.category}
                        {loc.sizeWidth && loc.sizeHeight ? ` — ${loc.sizeWidth} x ${loc.sizeHeight} ${loc.sizeUnit}` : ""}
                        {loc.internalCode ? ` (${loc.internalCode})` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)} aria-label="Edit location">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(loc.id)} aria-label="Delete location">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingLocation} onOpenChange={() => setEditingLocation(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Branding Location" : "Edit Branding Location"}</DialogTitle>
          </DialogHeader>
          {editingLocation && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Location Name</Label>
                  <Input value={editingLocation.name || ""} onChange={e => setEditingLocation(p => p ? { ...p, name: e.target.value } : p)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Internal Code</Label>
                  <Input value={editingLocation.internalCode || ""} onChange={e => setEditingLocation(p => p ? { ...p, internalCode: e.target.value } : p)} placeholder="e.g. EXT-01" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={editingLocation.category || ""} onValueChange={v => setEditingLocation(p => p ? { ...p, category: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client-Facing Description</Label>
                <Textarea value={editingLocation.description || ""} onChange={e => setEditingLocation(p => p ? { ...p, description: e.target.value } : p)} className="min-h-[60px] resize-none" />
              </div>
              <DimensionInput
                label="Dimensions"
                value={{
                  width: editingLocation.sizeWidth ?? null,
                  height: editingLocation.sizeHeight ?? null,
                  unit: (normalizeUnit(editingLocation.sizeUnit) || "in") as LengthUnit,
                }}
                onChange={(v) => setEditingLocation(p => p ? { ...p, sizeWidth: v.width, sizeHeight: v.height, sizeUnit: v.unit } : p)}
                helperText="Mix imperial and metric freely — values are stored as entered."
              />
              <PricingModelInput
                value={{
                  pricingModel: (editingLocation.pricingModel as PricingModel) || "fixed",
                  unitRate: editingLocation.unitRate ?? null,
                  pricingUnit: (editingLocation.pricingUnit as PricingUnit) || null,
                  minBillableSize: editingLocation.minBillableSize ?? null,
                  minCharge: editingLocation.minCharge ?? null,
                  allowsCustomSize: editingLocation.allowsCustomSize ?? false,
                }}
                onChange={(v) => setEditingLocation(p => p ? {
                  ...p,
                  pricingModel: v.pricingModel,
                  unitRate: v.unitRate,
                  pricingUnit: v.pricingUnit,
                  minBillableSize: v.minBillableSize,
                  minCharge: v.minCharge,
                  allowsCustomSize: v.allowsCustomSize,
                } : p)}
                sampleWidthMm={editingLocation.sizeWidth != null && editingLocation.sizeUnit
                  ? convert(editingLocation.sizeWidth, editingLocation.sizeUnit, "mm") : null}
                sampleHeightMm={editingLocation.sizeHeight != null && editingLocation.sizeUnit
                  ? convert(editingLocation.sizeHeight, editingLocation.sizeUnit, "mm") : null}
              />
              
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Preview Image URL</Label>
                  <Input value={editingLocation.previewImageUrl || ""} onChange={e => setEditingLocation(p => p ? { ...p, previewImageUrl: e.target.value } : p)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Template File URL</Label>
                  <Input value={editingLocation.templateFileUrl || ""} onChange={e => setEditingLocation(p => p ? { ...p, templateFileUrl: e.target.value } : p)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Artwork Guidelines</Label>
                <Textarea value={editingLocation.artworkGuidelines || ""} onChange={e => setEditingLocation(p => p ? { ...p, artworkGuidelines: e.target.value } : p)} className="min-h-[50px] resize-none" placeholder="Guidelines for the client..." />
              </div>

              <div className="border-t pt-4 mt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">INTERNAL ONLY (Not shown to clients)</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Production Notes</Label>
                    <Textarea value={editingLocation.productionNotesInternal || ""} onChange={e => setEditingLocation(p => p ? { ...p, productionNotesInternal: e.target.value } : p)} className="min-h-[50px] resize-none" placeholder="Mounting, substrate, lamination..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Install Notes</Label>
                    <Textarea value={editingLocation.installNotesInternal || ""} onChange={e => setEditingLocation(p => p ? { ...p, installNotesInternal: e.target.value } : p)} className="min-h-[50px] resize-none" placeholder="Access requirements, timing..." />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingLocation.isActive || false}
                    onCheckedChange={v => setEditingLocation(p => p ? { ...p, isActive: v } : p)}
                  />
                  <Label className="text-xs">Active (visible to clients)</Label>
                </div>
                <Select value={editingLocation.reviewStatus || "needs_review"} onValueChange={v => setEditingLocation(p => p ? { ...p, reviewStatus: v } : p)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLocation(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isNew ? "Add Location" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
