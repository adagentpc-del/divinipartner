import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Check, Pencil, Trash2, Copy, Eye, EyeOff, MapPin, FileText, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";

import type { DeckExtraction, DeckExtractionItem } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";
type ExtractionItem = DeckExtractionItem;
type Extraction = SerializedRow<DeckExtraction> & { items: ExtractionItem[] };

const CATEGORIES = [
  "Wall Graphic", "Window Decal", "Column Wrap", "Pole Banner", "Fence Banner",
  "Floor Graphic", "Door Graphic", "Directional Signage", "Registration Branding",
  "Step and Repeat Zone", "Sponsor Zone", "Custom / Other"
];

export default function DeckExtractionReview() {
  const params = useParams();
  const extractionId = parseInt(params.extractionId || "0");
  const partnerId = parseInt(params.id || "0");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [editingItem, setEditingItem] = useState<ExtractionItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);

  const loadExtraction = () => {
    fetch(`/api/deck-extractions/${extractionId}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setExtraction(data); setLoading(false); })
      .catch(() => { setExtraction(null); setLoading(false); });
  };

  useEffect(() => { loadExtraction(); }, [extractionId]);

  const handleUpdateItem = async (itemId: number, updates: Partial<ExtractionItem>) => {
    const res = await fetch(`/api/deck-extraction-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      loadExtraction();
      toast({ title: "Item updated" });
    } else {
      toast({ title: "Failed to update item", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    const res = await fetch(`/api/deck-extraction-items/${itemId}`, { method: "DELETE" });
    if (res.ok) {
      loadExtraction();
      toast({ title: "Item removed" });
    } else {
      toast({ title: "Failed to remove item", variant: "destructive" });
    }
  };

  const handleDuplicate = async (itemId: number) => {
    const res = await fetch(`/api/deck-extraction-items/${itemId}/duplicate`, { method: "POST" });
    if (res.ok) {
      loadExtraction();
      toast({ title: "Item duplicated" });
    } else {
      toast({ title: "Failed to duplicate item", variant: "destructive" });
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setApproving(true);

    const res = await fetch("/api/deck-extraction-items/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (res.ok) {
      const data = await res.json();
      toast({ title: `${data.approved} locations approved and created` });
      setSelectedIds(new Set());
      loadExtraction();
    } else {
      toast({ title: "Bulk approve failed", variant: "destructive" });
    }
    setApproving(false);
  };

  const handleApproveSingle = async (itemId: number) => {
    setApproving(true);
    const res = await fetch("/api/deck-extraction-items/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [itemId] }),
    });
    if (res.ok) {
      const data = await res.json();
      toast({ title: `Location approved and created` });
      loadExtraction();
    } else {
      toast({ title: "Approve failed", variant: "destructive" });
    }
    setApproving(false);
  };

  const handleApproveAll = async () => {
    if (!extraction) return;
    const pendingIds = extraction.items
      .filter(i => i.reviewStatus === "pending" && !i.isHidden)
      .map(i => i.id);
    if (pendingIds.length === 0) return;
    setApproving(true);

    const res = await fetch("/api/deck-extraction-items/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: pendingIds }),
    });

    if (res.ok) {
      const data = await res.json();
      toast({ title: `${data.approved} locations approved and created` });
      loadExtraction();
    } else {
      toast({ title: "Approve all failed", variant: "destructive" });
    }
    setApproving(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveEditItem = async () => {
    if (!editingItem) return;
    await handleUpdateItem(editingItem.id, {
      locationName: editingItem.locationName,
      category: editingItem.category,
      description: editingItem.description || undefined,
      sizeWidth: editingItem.sizeWidth,
      sizeHeight: editingItem.sizeHeight,
      sizeUnit: editingItem.sizeUnit,
      adminNotes: editingItem.adminNotes || undefined,
    });
    setEditingItem(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!extraction) return <div className="text-center py-12 text-muted-foreground">Extraction not found.</div>;

  const pendingCount = extraction.items.filter(i => i.reviewStatus === "pending" && !i.isHidden).length;
  const approvedCount = extraction.items.filter(i => i.reviewStatus === "approved").length;

  const rejectedCount = extraction.items.filter(i => i.isHidden).length;

  const confidenceColor = (score: number | null) => {
    if (score == null) return "text-gray-400";
    if (score >= 0.7) return "text-green-600";
    if (score >= 0.4) return "text-amber-600";
    return "text-red-500";
  };

  const confidenceBg = (score: number | null) => {
    if (score == null) return "bg-gray-200";
    if (score >= 0.7) return "bg-green-500";
    if (score >= 0.4) return "bg-amber-500";
    return "bg-red-500";
  };

  const categoryGroups = extraction.items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/admin/partners/${partnerId}/branding-locations`}>
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Branding Locations
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Deck Extraction Review</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Extraction Review
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {extraction.sourceFileName} · {extraction.totalPages || "?"} pages · {extraction.items.length} candidates
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={
            extraction.status === "parsed" || extraction.status === "completed" ? "default" :
            extraction.status === "parse_failed" || extraction.status === "failed" ? "destructive" :
            "secondary"
          }>{extraction.status}</Badge>
          {extraction.parseSource === "reused_dedup" && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
              ♻ Reused (dedup #{extraction.dedupedFromId})
            </Badge>
          )}
          {extraction.parseSource === "ai" && (
            <Badge variant="outline" className="text-violet-700 border-violet-300 bg-violet-50" title="AI tokens used">
              AI · {extraction.chunkCount ?? "?"} chunks · {(extraction.aiTokensInput || 0) + (extraction.aiTokensOutput || 0)} tok
            </Badge>
          )}
          {extraction.parseSource === "rules" && (
            <Badge variant="outline" className="text-zinc-600 border-zinc-300">Rules-only (no AI)</Badge>
          )}
          {(extraction.status === "parsed" || extraction.status === "duplicate_reused") && (
            <Button variant="outline" size="sm"
              onClick={async () => {
                if (!confirm("Re-run parse? This will re-extract from the original PDF and incur AI cost.")) return;
                await fetch(`/api/deck-extractions/${extraction.id}/rerun`, { method: "POST" });
                loadExtraction();
              }}>Re-run parse</Button>
          )}
        </div>
      </div>

      {(extraction.status === "processing" || extraction.status === "uploaded" || extraction.status === "text_extracted" || extraction.status === "chunked" || extraction.status === "awaiting_ai") && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            <p className="text-sm">Extraction is still processing. Refresh to check for updates.</p>
            <Button variant="outline" size="sm" onClick={loadExtraction}>Refresh</Button>
          </CardContent>
        </Card>
      )}

      {extraction.errorMessage && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{extraction.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {extraction.items.length > 0 && (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-blue-100">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold">{extraction.items.length}</p>
              <p className="text-[11px] text-muted-foreground">Total Found</p>
            </CardContent>
          </Card>
          <Card className="border-amber-100">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              <p className="text-[11px] text-muted-foreground">Pending Review</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-100">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
              <p className="text-[11px] text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card className="border-gray-100">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-gray-400">{rejectedCount}</p>
              <p className="text-[11px] text-muted-foreground">Hidden</p>
            </CardContent>
          </Card>
        </div>

        {Object.keys(categoryGroups).length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(categoryGroups).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <Badge key={cat} variant="outline" className="text-[10px] gap-1 font-normal">
                {cat} <span className="font-semibold">{count}</span>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            {selectedIds.size > 0 && (
              <span className="text-primary font-medium">{selectedIds.size} selected</span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={handleBulkApprove} disabled={approving} className="gap-1.5">
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve Selected ({selectedIds.size})
              </Button>
            )}
            {pendingCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleApproveAll} disabled={approving} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve All Pending ({pendingCount})
              </Button>
            )}
          </div>
        </div>

      <div className="space-y-3">
        {extraction.items.map(item => (
          <Card key={item.id} className={`${item.isHidden ? "opacity-40" : ""} ${item.reviewStatus === "approved" ? "border-emerald-200 bg-emerald-50/20" : ""}`}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                {item.reviewStatus === "pending" && !item.isHidden && (
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleSelect(item.id)}
                    className="mt-1"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">{item.locationName}</h3>
                    <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                    {item.sourcePageNumber && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">p.{item.sourcePageNumber}</span>
                    )}
                    {item.confidenceScore != null && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <span className={`block h-full rounded-full ${confidenceBg(item.confidenceScore)}`} style={{ width: `${item.confidenceScore * 100}%` }} />
                        </span>
                        <span className={`text-[10px] font-mono ${confidenceColor(item.confidenceScore)}`}>
                          {Math.round(item.confidenceScore * 100)}%
                        </span>
                      </span>
                    )}
                    {item.reviewStatus === "approved" && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                      </Badge>
                    )}
                    {item.isHidden && (
                      <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300 gap-0.5">
                        <EyeOff className="h-2.5 w-2.5" /> Hidden
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {item.dimensionsText && (
                      <p className="text-xs text-muted-foreground">
                        Dimensions: {item.dimensionsText}
                        {item.sizeWidth && item.sizeHeight ? ` (${item.sizeWidth} × ${item.sizeHeight} ${item.sizeUnit})` : ""}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  {item.extractedTextSnippet && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 bg-muted/40 p-2 rounded">{item.extractedTextSnippet}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItem({ ...item })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(item.id)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUpdateItem(item.id, { isHidden: !item.isHidden })}>
                    {item.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  {item.reviewStatus === "pending" && !item.isHidden && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleApproveSingle(item.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </>
      )}

      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Extraction Candidate</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Location Name</Label>
                <Input value={editingItem.locationName} onChange={e => setEditingItem(p => p ? { ...p, locationName: e.target.value } : p)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={editingItem.category} onValueChange={v => setEditingItem(p => p ? { ...p, category: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (public)</Label>
                <Textarea value={editingItem.description || ""} onChange={e => setEditingItem(p => p ? { ...p, description: e.target.value } : p)} className="min-h-[60px] resize-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Width</Label>
                  <Input type="number" value={editingItem.sizeWidth ?? ""} onChange={e => setEditingItem(p => p ? { ...p, sizeWidth: e.target.value ? Number(e.target.value) : null } : p)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Height</Label>
                  <Input type="number" value={editingItem.sizeHeight ?? ""} onChange={e => setEditingItem(p => p ? { ...p, sizeHeight: e.target.value ? Number(e.target.value) : null } : p)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select value={editingItem.sizeUnit || "inches"} onValueChange={v => setEditingItem(p => p ? { ...p, sizeUnit: v } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inches">Inches</SelectItem>
                      <SelectItem value="feet">Feet</SelectItem>
                      <SelectItem value="cm">CM</SelectItem>
                      <SelectItem value="meters">Meters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Admin Notes (internal)</Label>
                <Textarea value={editingItem.adminNotes || ""} onChange={e => setEditingItem(p => p ? { ...p, adminNotes: e.target.value } : p)} className="min-h-[50px] resize-none" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={saveEditItem}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
