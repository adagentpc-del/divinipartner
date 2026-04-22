import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, FileText, Upload, Filter, Search, X, Plus, Sparkles, Package, ImageIcon, AlertTriangle, CheckCircle2, Tag, Trash2, Download, ExternalLink, Wand2, Link as LinkIcon } from "lucide-react";

const SOURCE_TYPES = [
  { value: "quote", label: "Quote" },
  { value: "spec_sheet", label: "Spec sheet" },
  { value: "screenshot", label: "Screenshot" },
  { value: "website_reference", label: "Website reference" },
  { value: "erp_export", label: "ERP export" },
  { value: "manual_note", label: "Manual note" },
  { value: "prior_job_reference", label: "Prior job ref" },
];
const PROCESSING_STATUSES = [
  { value: "new", label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "needs_review", label: "Needs review", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "needs_clarification", label: "Needs clarification", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "mapped", label: "Mapped", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "superseded", label: "Superseded", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  { value: "archived", label: "Archived", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
];
const MISSING_FLAGS = [
  "missing_dimensions", "missing_material", "missing_attachment", "missing_lead_time",
  "unclear_hardware", "duplicate_possible", "conflicting_supplier_info", "expired",
  "missing_customer_summary", "missing_ops_summary",
];

interface Source {
  id: number;
  name: string;
  fileUrl: string;
  fileType: string | null;
  sourceType: string;
  processingStatus: string;
  supplierId: number | null;
  supplierName: string | null;
  version: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  isApprovedStandard: boolean;
  internalOnly: boolean;
  vendorVisible: boolean;
  confidenceFlag: string | null;
  extractedDisplayName: string | null;
  extractedInternalName: string | null;
  extractedCategory: string | null;
  customerFacingSummary: string | null;
  backendOpsSummary: string | null;
  dimensionsSummary: string | null;
  materialSummary: string | null;
  finishingSummary: string | null;
  attachmentSummary: string | null;
  hardwareSummary: string | null;
  leadTimeText: string | null;
  printFileRequirements: string | null;
  installNotes: string | null;
  opsNotes: string | null;
  reviewNotes: string | null;
  clarificationNeeded: string | null;
  missingDataFlagsJson: string[] | null;
  notes: string | null;
  mappings: Mapping[];
  mappingCount: number;
  hasMissingData: boolean;
  createdAt: string;
  // Section 21: parsed billing signals
  parsedAt: string | null;
  parsedSource: string | null;            // 'rules' | 'ai' | 'none' | 'failed'
  parsedReviewStatus: string | null;      // 'pending' | 'approved' | 'dismissed' | 'edited'
  parsedCurrency: string | null;
  parsedCurrencyConfidence: string | null;
  parsedTaxLabel: string | null;
  parsedTaxRate: string | null;
  parsedTaxAmount: string | null;
  parsedTaxInclusive: boolean | null;
  parsedSubtotalAmount: string | null;
  parsedTotalAmount: string | null;
  parsedQuoteReference: string | null;
  parsedSupplierName: string | null;
  parsedPaymentTerms: string | null;
  parsedDepositAmount: string | null;
  parsedBillingCountry: string | null;
  parsedIncoterm: string | null;
  parsedBillingNotes: string | null;
  parsedBillingFlagsJson: string[] | null;
  parsedMissingFieldsJson: string[] | null;
  parsedAiTokensInput: number | null;
  parsedAiTokensOutput: number | null;
}
interface Mapping { id: number; mappingType: string; mappingId: number; note: string | null; label?: string; }
interface Supplier { id: number; name: string; }
interface Product { id: number; name: string; displayName: string | null; category: string; }
interface Pkg { id: number; name: string; }
interface Zone { id: number; name: string; partnerId: number; }

export default function QuoteIngestion() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{ sourceType?: string; processingStatus?: string; supplierId?: string; mappingStatus?: string; missingDataOnly?: boolean; expiredOnly?: boolean; search?: string }>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPatch, setBulkPatch] = useState<{ processingStatus?: string; supplierId?: number | null }>({});

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.sourceType) p.set("sourceType", filters.sourceType);
    if (filters.processingStatus) p.set("processingStatus", filters.processingStatus);
    if (filters.supplierId) p.set("supplierId", filters.supplierId);
    if (filters.mappingStatus) p.set("mappingStatus", filters.mappingStatus);
    if (filters.missingDataOnly) p.set("missingDataOnly", "true");
    if (filters.expiredOnly) p.set("expiredOnly", "true");
    if (filters.search) p.set("search", filters.search);
    return p.toString();
  }, [filters]);

  const { data: sources = [], isLoading } = useQuery<Source[]>({ queryKey: ["/api/quote-assets", queryString], queryFn: () => apiFetch(`/api/quote-assets${queryString ? `?${queryString}` : ""}`) });
  const { data: stats } = useQuery<any>({ queryKey: ["/api/quote-ingestion/stats"], queryFn: () => apiFetch("/api/quote-ingestion/stats") });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });

  const open = sources.find(s => s.id === openId) || null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/quote-assets"] });
    qc.invalidateQueries({ queryKey: ["/api/quote-ingestion/stats"] });
  };

  const bulkApply = useMutation({
    mutationFn: () => apiFetch("/api/quote-assets/bulk-update", { method: "POST", body: JSON.stringify({ ids: [...selected], patch: bulkPatch }) }),
    onSuccess: () => { toast({ title: "Updated" }); setSelected(new Set()); setBulkOpen(false); setBulkPatch({}); refresh(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleSel = (id: number, on: boolean) => {
    setSelected(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6" /> Quote Ingestion Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">Turn supplier quotes, spec sheets, screenshots, and notes into structured catalog intelligence.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}>
              <Tag className="h-3.5 w-3.5" /> Bulk update ({selected.size})
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Upload className="h-3.5 w-3.5" /> Ingest source</Button>
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <StatCard label="Total" value={stats.total} active={!filters.processingStatus} onClick={() => setFilters(f => ({ ...f, processingStatus: undefined }))} />
          <StatCard label="New" value={stats.new} active={filters.processingStatus === "new"} onClick={() => setFilters(f => ({ ...f, processingStatus: f.processingStatus === "new" ? undefined : "new" }))} />
          <StatCard label="Needs review" value={stats.needsReview} tone="amber" active={filters.processingStatus === "needs_review"} onClick={() => setFilters(f => ({ ...f, processingStatus: f.processingStatus === "needs_review" ? undefined : "needs_review" }))} />
          <StatCard label="Mapped" value={stats.mapped} tone="blue" active={filters.processingStatus === "mapped"} onClick={() => setFilters(f => ({ ...f, processingStatus: f.processingStatus === "mapped" ? undefined : "mapped" }))} />
          <StatCard label="Approved" value={stats.approved} tone="emerald" active={filters.processingStatus === "approved"} onClick={() => setFilters(f => ({ ...f, processingStatus: f.processingStatus === "approved" ? undefined : "approved" }))} />
          <StatCard label="Missing data" value={stats.missingData} tone="rose" active={!!filters.missingDataOnly} onClick={() => setFilters(f => ({ ...f, missingDataOnly: !f.missingDataOnly }))} />
          <StatCard label="Expired" value={stats.expired} tone="rose" active={!!filters.expiredOnly} onClick={() => setFilters(f => ({ ...f, expiredOnly: !f.expiredOnly }))} />
        </div>
      )}

      {/* Filter rail */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search title, supplier, notes…" value={filters.search || ""} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="pl-9 h-8 text-sm" />
          </div>
          <SelectFilter value={filters.sourceType} onChange={v => setFilters(f => ({ ...f, sourceType: v }))} placeholder="All source types" options={SOURCE_TYPES} />
          <SelectFilter value={filters.supplierId} onChange={v => setFilters(f => ({ ...f, supplierId: v }))} placeholder="All suppliers" options={suppliers.map(s => ({ value: String(s.id), label: s.name }))} />
          <SelectFilter value={filters.mappingStatus} onChange={v => setFilters(f => ({ ...f, mappingStatus: v }))} placeholder="Mapping status" options={[{ value: "mapped", label: "Mapped" }, { value: "unmapped", label: "Unmapped" }]} />
          {(filters.sourceType || filters.processingStatus || filters.supplierId || filters.mappingStatus || filters.missingDataOnly || filters.expiredOnly || filters.search) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="h-8 gap-1"><X className="h-3.5 w-3.5" /> Clear</Button>
          )}
        </CardContent>
      </Card>

      {/* Cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sources.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />No sources match. Try ingesting a quote or clearing filters.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {sources.map(s => (
            <SourceCard key={s.id} source={s} suppliers={suppliers} selected={selected.has(s.id)} onToggleSel={on => toggleSel(s.id, on)} onOpen={() => setOpenId(s.id)} />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {open && <EnrichmentDrawer source={open} suppliers={suppliers} onChange={refresh} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>

      {/* New source dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Ingest a new source</DialogTitle></DialogHeader>
          <NewSourceForm suppliers={suppliers} onDone={(id) => { setAdding(false); refresh(); setOpenId(id); }} />
        </DialogContent>
      </Dialog>

      {/* Bulk update dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Bulk update {selected.size} source{selected.size === 1 ? "" : "s"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Set processing status</Label>
              <Select value={bulkPatch.processingStatus || ""} onValueChange={v => setBulkPatch(p => ({ ...p, processingStatus: v }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="(no change)" /></SelectTrigger>
                <SelectContent>{PROCESSING_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Set supplier</Label>
              <Select value={bulkPatch.supplierId ? String(bulkPatch.supplierId) : ""} onValueChange={v => setBulkPatch(p => ({ ...p, supplierId: v ? parseInt(v) : null }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="(no change)" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkApply.mutate()} disabled={bulkApply.isPending || (!bulkPatch.processingStatus && bulkPatch.supplierId === undefined)}>{bulkApply.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, active, onClick, tone }: { label: string; value: number; active?: boolean; onClick?: () => void; tone?: "amber" | "emerald" | "blue" | "rose" }) {
  const toneClass = active
    ? (tone === "amber" ? "bg-amber-100 border-amber-300" : tone === "emerald" ? "bg-emerald-100 border-emerald-300" : tone === "blue" ? "bg-blue-100 border-blue-300" : tone === "rose" ? "bg-rose-100 border-rose-300" : "bg-primary/10 border-primary")
    : "bg-card hover:bg-muted/40";
  return (
    <button onClick={onClick} className={`text-left rounded-lg border p-3 transition-all ${toneClass}`}>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</div>
    </button>
  );
}

function SelectFilter({ value, onChange, placeholder, options }: { value?: string; onChange: (v: string | undefined) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value || "__all__"} onValueChange={v => onChange(v === "__all__" ? undefined : v)}>
      <SelectTrigger className="h-8 text-sm w-auto min-w-[140px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function statusBadge(status: string) {
  const s = PROCESSING_STATUSES.find(x => x.value === status);
  return <Badge variant="outline" className={`text-[10px] h-5 ${s?.color || ""}`}>{s?.label || status}</Badge>;
}

function sourceTypeIcon(type: string) {
  if (type === "screenshot") return <ImageIcon className="h-4 w-4" />;
  if (type === "spec_sheet") return <FileText className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function SourceCard({ source, suppliers, selected, onToggleSel, onOpen }: { source: Source; suppliers: Supplier[]; selected: boolean; onToggleSel: (on: boolean) => void; onOpen: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const expired = source.expirationDate && source.expirationDate < today;
  const supplierLabel = source.supplierName || suppliers.find(s => s.id === source.supplierId)?.name || "—";
  const isImage = (source.fileType || "").startsWith("image/");
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={v => onToggleSel(!!v)} className="mt-1" />
          <div className="h-12 w-12 bg-muted rounded-lg overflow-hidden flex items-center justify-center shrink-0">
            {isImage ? <img src={`/api/storage${source.fileUrl}`} className="h-full w-full object-cover" /> : sourceTypeIcon(source.sourceType)}
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{source.name}</h3>
              {statusBadge(source.processingStatus)}
              <Badge variant="outline" className="text-[10px] h-5">{SOURCE_TYPES.find(x => x.value === source.sourceType)?.label || source.sourceType}</Badge>
              {source.version && <Badge variant="outline" className="text-[10px] h-5">v{source.version}</Badge>}
              {source.isApprovedStandard && <Badge className="text-[10px] h-5 bg-emerald-600">Approved standard</Badge>}
              {expired && <Badge variant="destructive" className="text-[10px] h-5"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Expired</Badge>}
              {source.hasMissingData && <Badge variant="outline" className="text-[10px] h-5 border-rose-300 text-rose-700"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{source.missingDataFlagsJson!.length} missing</Badge>}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span>Supplier: <strong className="text-foreground">{supplierLabel}</strong></span>
              {source.effectiveDate && <span>· Effective {source.effectiveDate}</span>}
              {source.expirationDate && <span>· Expires {source.expirationDate}</span>}
              <span>· {source.mappingCount} mapping{source.mappingCount === 1 ? "" : "s"}</span>
            </div>
            {source.mappings.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {source.mappings.slice(0, 4).map(m => (
                  <Badge key={m.id} variant="secondary" className="text-[10px] h-5"><LinkIcon className="h-2.5 w-2.5 mr-0.5" />{mappingTypeLabel(m.mappingType)} #{m.mappingId}</Badge>
                ))}
                {source.mappings.length > 4 && <Badge variant="secondary" className="text-[10px] h-5">+{source.mappings.length - 4}</Badge>}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function mappingTypeLabel(t: string) {
  if (t === "branding_zone") return "Zone";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function EnrichmentDrawer({ source, suppliers, onChange, onClose }: { source: Source; suppliers: Supplier[]; onChange: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<Source>>(source);
  const [tab, setTab] = useState("enrich");
  const [promoteOpen, setPromoteOpen] = useState(false);

  const save = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}`, { method: "PATCH", body: JSON.stringify(draft) }),
    onSuccess: () => { toast({ title: "Saved" }); onChange(); qc.invalidateQueries({ queryKey: ["/api/quote-assets"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Deleted" }); onChange(); onClose(); },
  });

  const toggleFlag = (flag: string) => {
    const cur = new Set(draft.missingDataFlagsJson || []);
    cur.has(flag) ? cur.delete(flag) : cur.add(flag);
    setDraft(d => ({ ...d, missingDataFlagsJson: [...cur] }));
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 pr-6">
          {sourceTypeIcon(source.sourceType)}
          <span className="truncate">{source.name}</span>
          {statusBadge(source.processingStatus)}
        </SheetTitle>
      </SheetHeader>

      <div className="flex items-center gap-2 mt-2 mb-4">
        {source.fileUrl && <Button variant="outline" size="sm" className="gap-1.5" asChild><a href={`/api/storage${source.fileUrl}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open file</a></Button>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPromoteOpen(true)}><Wand2 className="h-3.5 w-3.5" /> Promote to product</Button>
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto text-destructive" onClick={() => { if (confirm("Delete this source?")) del.mutate(); }}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="enrich">Enrich</TabsTrigger>
          <TabsTrigger value="billing">
            Billing{source.parsedSource && source.parsedReviewStatus === "pending" ? " ●" : ""}
          </TabsTrigger>
          <TabsTrigger value="mappings">Mappings ({source.mappings.length})</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="mt-4">
          <BillingSignalsPanel source={source} onChange={onChange} />
        </TabsContent>

        <TabsContent value="enrich" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <DField label="Title" value={draft.name} onChange={v => setDraft(d => ({ ...d, name: v }))} />
            <DField label="Version" value={draft.version} onChange={v => setDraft(d => ({ ...d, version: v }))} />
            <div>
              <Label className="text-xs">Source type</Label>
              <Select value={draft.sourceType || "quote"} onValueChange={v => setDraft(d => ({ ...d, sourceType: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={draft.supplierId ? String(draft.supplierId) : "__none__"} onValueChange={v => setDraft(d => ({ ...d, supplierId: v === "__none__" ? null : parseInt(v) }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="(none)" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">(none)</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DField label="Effective date" type="date" value={draft.effectiveDate} onChange={v => setDraft(d => ({ ...d, effectiveDate: v }))} />
            <DField label="Expiration date" type="date" value={draft.expirationDate} onChange={v => setDraft(d => ({ ...d, expirationDate: v }))} />
            <div>
              <Label className="text-xs">Confidence</Label>
              <Select value={draft.confidenceFlag || "__none__"} onValueChange={v => setDraft(d => ({ ...d, confidenceFlag: v === "__none__" ? null : v }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">—</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Processing status</Label>
              <Select value={draft.processingStatus || "new"} onValueChange={v => setDraft(d => ({ ...d, processingStatus: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PROCESSING_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Extracted intelligence</h4>
            <div className="grid grid-cols-2 gap-3">
              <DField label="Display name (customer-facing)" value={draft.extractedDisplayName} onChange={v => setDraft(d => ({ ...d, extractedDisplayName: v }))} />
              <DField label="Internal name" value={draft.extractedInternalName} onChange={v => setDraft(d => ({ ...d, extractedInternalName: v }))} />
              <DField label="Category" value={draft.extractedCategory} onChange={v => setDraft(d => ({ ...d, extractedCategory: v }))} />
              <DField label="Lead time" value={draft.leadTimeText} onChange={v => setDraft(d => ({ ...d, leadTimeText: v }))} placeholder="3-5 business days" />
              <DField label="Dimensions" value={draft.dimensionsSummary} onChange={v => setDraft(d => ({ ...d, dimensionsSummary: v }))} />
              <DField label="Material" value={draft.materialSummary} onChange={v => setDraft(d => ({ ...d, materialSummary: v }))} />
              <DField label="Finishing" value={draft.finishingSummary} onChange={v => setDraft(d => ({ ...d, finishingSummary: v }))} />
              <DField label="Attachment method" value={draft.attachmentSummary} onChange={v => setDraft(d => ({ ...d, attachmentSummary: v }))} />
              <DField label="Hardware" value={draft.hardwareSummary} onChange={v => setDraft(d => ({ ...d, hardwareSummary: v }))} />
              <DField label="Print file requirements" value={draft.printFileRequirements} onChange={v => setDraft(d => ({ ...d, printFileRequirements: v }))} />
            </div>
            <div className="mt-3 grid gap-3">
              <DTextarea label="Customer-facing summary" value={draft.customerFacingSummary} onChange={v => setDraft(d => ({ ...d, customerFacingSummary: v }))} />
              <DTextarea label="Backend ops summary" value={draft.backendOpsSummary} onChange={v => setDraft(d => ({ ...d, backendOpsSummary: v }))} />
              <DTextarea label="Install notes" value={draft.installNotes} onChange={v => setDraft(d => ({ ...d, installNotes: v }))} />
              <DTextarea label="Internal ops notes" value={draft.opsNotes} onChange={v => setDraft(d => ({ ...d, opsNotes: v }))} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center gap-2"><Switch checked={!!draft.isApprovedStandard} onCheckedChange={v => setDraft(d => ({ ...d, isApprovedStandard: v }))} /><Label className="text-sm">Approved standard</Label></div>
            <div className="flex items-center gap-2"><Switch checked={!!draft.vendorVisible} onCheckedChange={v => setDraft(d => ({ ...d, vendorVisible: v }))} /><Label className="text-sm">Vendor-visible</Label></div>
          </div>

          <div className="flex justify-end pt-2"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes</Button></div>
        </TabsContent>

        <TabsContent value="mappings" className="mt-4">
          <MappingsPanel sourceId={source.id} mappings={source.mappings} suppliers={suppliers} onChange={onChange} />
        </TabsContent>

        <TabsContent value="review" className="space-y-4 mt-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Missing data flags</h4>
            <div className="flex flex-wrap gap-2">
              {MISSING_FLAGS.map(f => {
                const on = (draft.missingDataFlagsJson || []).includes(f);
                return (
                  <button key={f} onClick={() => toggleFlag(f)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-rose-100 border-rose-300 text-rose-800" : "bg-muted/40 border-border hover:bg-muted"}`}>
                    {on ? "✓ " : ""}{f.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>
          <DTextarea label="Review notes" value={draft.reviewNotes} onChange={v => setDraft(d => ({ ...d, reviewNotes: v }))} />
          <DTextarea label="Clarification needed (note)" value={draft.clarificationNeeded} onChange={v => setDraft(d => ({ ...d, clarificationNeeded: v }))} />
          <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save review</Button></div>
        </TabsContent>
      </Tabs>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Promote source to a new product</DialogTitle></DialogHeader>
          <PromoteForm source={source} onDone={() => { setPromoteOpen(false); onChange(); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function MappingsPanel({ sourceId, mappings, suppliers, onChange }: { sourceId: number; mappings: Mapping[]; suppliers: Supplier[]; onChange: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<"product" | "package" | "branding_zone" | "supplier">("product");
  const [target, setTarget] = useState<string>("");
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });
  const { data: pkgs = [] } = useQuery<Pkg[]>({ queryKey: ["/api/packages"], queryFn: () => apiFetch("/api/packages") });
  const { data: zones = [] } = useQuery<Zone[]>({ queryKey: ["/api/branding-locations"], queryFn: () => apiFetch("/api/branding-locations") });

  const { data: details = [] } = useQuery<Mapping[]>({ queryKey: [`/api/quote-assets/${sourceId}/mappings`], queryFn: () => apiFetch(`/api/quote-assets/${sourceId}/mappings`) });

  const add = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${sourceId}/mappings`, { method: "POST", body: JSON.stringify({ mappingType: type, mappingId: parseInt(target) }) }),
    onSuccess: () => { setTarget(""); qc.invalidateQueries({ queryKey: [`/api/quote-assets/${sourceId}/mappings`] }); onChange(); toast({ title: "Mapped" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (mappingId: number) => apiFetch(`/api/quote-assets/${sourceId}/mappings/${mappingId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/quote-assets/${sourceId}/mappings`] }); onChange(); },
  });

  const targetOptions = type === "product"
    ? products.map(p => ({ value: String(p.id), label: `${p.displayName || p.name} · ${p.category}` }))
    : type === "package"
    ? pkgs.map(p => ({ value: String(p.id), label: p.name }))
    : type === "branding_zone"
    ? zones.map(z => ({ value: String(z.id), label: z.name }))
    : suppliers.map(s => ({ value: String(s.id), label: s.name }));

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex items-end gap-2 flex-wrap">
          <div className="w-32">
            <Label className="text-xs">Map to</Label>
            <Select value={type} onValueChange={(v: any) => { setType(v); setTarget(""); }}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="package">Package</SelectItem>
                <SelectItem value="branding_zone">Branding zone</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Target</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-8"><SelectValue placeholder={`Pick a ${mappingTypeLabel(type).toLowerCase()}…`} /></SelectTrigger>
              <SelectContent>{targetOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => add.mutate()} disabled={!target || add.isPending} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
        </CardContent>
      </Card>
      {details.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No mappings yet — link this source to a product, package, zone, or supplier.</div>}
      <div className="space-y-1.5">
        {details.map(m => (
          <Card key={m.id}>
            <CardContent className="p-2.5 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{mappingTypeLabel(m.mappingType)}</Badge>
              <span className="text-sm flex-1 truncate">{m.label}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(m.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PromoteForm({ source, onDone }: { source: Source; onDone: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useState<string>("");
  const [form, setForm] = useState({
    category: source.extractedCategory || "",
    displayName: source.extractedDisplayName || source.name,
    internalName: source.extractedInternalName || "",
    customerFacingSummary: source.customerFacingSummary || "",
    copyAsSpecStandard: true,
  });
  const promote = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}/promote`, { method: "POST", body: JSON.stringify(form) }),
    onSuccess: (r: any) => { toast({ title: `Created product #${r.product.id}`, description: "Open it from the Products page to refine." }); onDone(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3">
      <DField label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="banners / displays / signage" />
      <DField label="Display name (customer-facing)" value={form.displayName} onChange={v => setForm(f => ({ ...f, displayName: v }))} />
      <DField label="Internal name" value={form.internalName} onChange={v => setForm(f => ({ ...f, internalName: v }))} />
      <DTextarea label="Customer-facing summary" value={form.customerFacingSummary} onChange={v => setForm(f => ({ ...f, customerFacingSummary: v }))} />
      <div className="flex items-center gap-2"><Switch checked={form.copyAsSpecStandard} onCheckedChange={v => setForm(f => ({ ...f, copyAsSpecStandard: v }))} /><Label className="text-sm">Also create a preferred spec standard from this source</Label></div>
      <DialogFooter><Button onClick={() => promote.mutate()} disabled={!form.category || promote.isPending}>{promote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create product</Button></DialogFooter>
    </div>
  );
}

function NewSourceForm({ suppliers, onDone }: { suppliers: Supplier[]; onDone: (id: number) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Source>>({ name: "", fileUrl: "", sourceType: "quote", processingStatus: "new" });
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
  const create = useMutation({
    mutationFn: () => apiFetch("/api/quote-assets", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: (r: any) => { toast({ title: "Source ingested" }); onDone(r.id); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">File</Label>
        <div className="flex items-center gap-2">
          <Input type="file" onChange={handleUpload} disabled={uploading} className="text-sm" />
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          {form.fileUrl && <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />uploaded</Badge>}
        </div>
      </div>
      <DField label="Title" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Source type</Label>
          <Select value={form.sourceType || "quote"} onValueChange={v => setForm(f => ({ ...f, sourceType: v }))}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Supplier</Label>
          <Select value={form.supplierId ? String(form.supplierId) : "__none__"} onValueChange={v => setForm(f => ({ ...f, supplierId: v === "__none__" ? null : parseInt(v) }))}>
            <SelectTrigger className="h-8"><SelectValue placeholder="(none)" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">(none)</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!form.name || !form.fileUrl || create.isPending}>{create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Ingest</Button>
      </DialogFooter>
    </div>
  );
}

function DField({ label, value, onChange, placeholder, type }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <div><Label className="text-xs">{label}</Label><Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} className="h-8" /></div>;
}
function DTextarea({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return <div><Label className="text-xs">{label}</Label><Textarea value={value || ""} onChange={e => onChange(e.target.value)} className="min-h-[60px] text-sm" /></div>;
}

// ===========================================================================
// Section 21: Billing signals review panel.
// Shows currency / VAT / tax / totals / overseas cues parsed from the PDF.
// Admin can Approve, Dismiss, Re-run, or apply to billing defaults.
// Always keeps parsed values SEPARATE from approved billing defaults — never
// auto-overwrites partner/order/invoice records.
// ===========================================================================
function BillingSignalsPanel({ source, onChange }: { source: Source; onChange: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["/api/quote-assets"] }); onChange(); };
  const approve = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}/billing-signals/approve`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Approved", description: "Parsed billing signals approved" }); refresh(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const dismiss = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}/billing-signals/dismiss`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Dismissed" }); refresh(); },
  });
  const rerun = useMutation({
    mutationFn: () => apiFetch(`/api/quote-assets/${source.id}/billing-signals/rerun`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Re-running", description: "Refresh in a few seconds" }); setTimeout(refresh, 3000); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (!source.parsedSource) {
    const isPdf = /\.pdf(\?|$)/i.test(source.fileUrl) || source.fileType === "application/pdf";
    return (
      <div className="text-sm text-muted-foreground space-y-3">
        {isPdf
          ? <p>No billing signals parsed yet. The parser runs automatically on PDF upload.</p>
          : <p>Billing-signal parsing is only available for PDF uploads.</p>}
        {isPdf && <Button size="sm" variant="outline" onClick={() => rerun.mutate()} disabled={rerun.isPending}>{rerun.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Run parse now</Button>}
      </div>
    );
  }

  const flags = source.parsedBillingFlagsJson || [];
  const missing = source.parsedMissingFieldsJson || [];
  const tokens = (source.parsedAiTokensInput || 0) + (source.parsedAiTokensOutput || 0);

  const reviewBadge = source.parsedReviewStatus === "approved"
    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>
    : source.parsedReviewStatus === "dismissed"
      ? <Badge variant="outline" className="text-muted-foreground">Dismissed</Badge>
      : <Badge className="bg-amber-100 text-amber-800 border-amber-300">Pending review</Badge>;

  const sourceBadge = source.parsedSource === "rules"
    ? <Badge variant="outline" className="text-xs">Rules-only · 0 tokens</Badge>
    : source.parsedSource === "ai"
      ? <Badge variant="outline" className="text-xs">AI fallback · {tokens} tokens</Badge>
      : <Badge variant="outline" className="text-xs text-rose-700 border-rose-300">{source.parsedSource}</Badge>;

  const fmtRate = (s: string | null) => s ? `${(parseFloat(s) * 100).toFixed(s.endsWith("0") ? 0 : 1)}%` : "—";
  const fmtMoney = (s: string | null, ccy: string | null) => s ? `${ccy || ""} ${parseFloat(s).toFixed(2)}`.trim() : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {reviewBadge}
        {sourceBadge}
        {source.parsedAt && <span className="text-xs text-muted-foreground">Parsed {new Date(source.parsedAt).toLocaleString()}</span>}
      </div>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map(f => (
            <span key={f} className={`text-[11px] px-2 py-0.5 rounded-full border ${
              f.includes("ambiguous") || f.includes("manual_review") || f.includes("failed")
                ? "bg-amber-50 border-amber-300 text-amber-800"
                : "bg-sky-50 border-sky-300 text-sky-800"
            }`}>{f.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      <div className="border rounded-lg divide-y">
        <SignalRow label="Currency" value={source.parsedCurrency || "—"} hint={source.parsedCurrencyConfidence ? `${source.parsedCurrencyConfidence} confidence` : undefined} />
        <SignalRow label="Tax label" value={source.parsedTaxLabel || "—"} />
        <SignalRow label="Tax rate" value={fmtRate(source.parsedTaxRate)} />
        <SignalRow label="Tax amount" value={fmtMoney(source.parsedTaxAmount, source.parsedCurrency)} />
        <SignalRow label="Tax inclusive" value={source.parsedTaxInclusive == null ? "—" : source.parsedTaxInclusive ? "Yes (included)" : "No (excluded)"} />
        <SignalRow label="Subtotal" value={fmtMoney(source.parsedSubtotalAmount, source.parsedCurrency)} />
        <SignalRow label="Total" value={fmtMoney(source.parsedTotalAmount, source.parsedCurrency)} />
        <SignalRow label="Quote ref" value={source.parsedQuoteReference || "—"} />
        <SignalRow label="Payment terms" value={source.parsedPaymentTerms || "—"} />
        <SignalRow label="Deposit" value={fmtMoney(source.parsedDepositAmount, source.parsedCurrency)} />
        <SignalRow label="Billing country" value={source.parsedBillingCountry || "—"} />
        <SignalRow label="Incoterm" value={source.parsedIncoterm || "—"} />
      </div>

      {source.parsedBillingNotes && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
          {source.parsedBillingNotes}
        </div>
      )}
      {missing.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Missing: {missing.join(", ")}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending || source.parsedReviewStatus === "approved"}>
          {approve.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => dismiss.mutate()} disabled={dismiss.isPending || source.parsedReviewStatus === "dismissed"}>Dismiss</Button>
        <Button size="sm" variant="outline" onClick={() => { if (confirm("Re-run billing-signals parse? Will incur AI cost only if regex finds nothing.")) rerun.mutate(); }} disabled={rerun.isPending}>
          {rerun.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Re-run
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground border-t pt-2">
        Parsed values are <strong>suggestions</strong>. Approve to mark them as reviewed; they never auto-overwrite partner / order / invoice billing defaults — apply manually where appropriate.
      </p>
    </div>
  );
}

function SignalRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">
        {value}
        {hint && <span className="ml-2 text-[11px] text-muted-foreground font-normal">({hint})</span>}
      </span>
    </div>
  );
}
