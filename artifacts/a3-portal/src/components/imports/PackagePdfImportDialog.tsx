import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, RotateCw, ChevronRight, ChevronDown } from "lucide-react";

/**
 * PDF Package Intake — Section 25 ext#3.
 *
 * Four stages: Upload → Processing (poll every 1.5s) → Review (grouped + editable)
 * → Results. Reuses the file-hash dedup pre-flight to short-circuit a duplicate
 * upload before billing AI.
 */

type Status =
  | "processing" | "uploaded" | "text_extracted" | "chunked" | "awaiting_ai"
  | "parsed" | "needs_review" | "duplicate_reused" | "parse_failed" | "imported" | "archived";

type Warning = { severity: string; code: string; message: string };
type ParsedRow = Record<string, any> & { _confidence?: number; _sourcePage?: number; _groupKey?: string; _warnings?: string[] };
type Extraction = {
  id: number; partnerId: number; sourceFileUrl: string; sourceFileName: string;
  status: Status; totalPages: number | null;
  parsedRows: ParsedRow[] | null; parseWarnings: Warning[] | null;
  parseSource: string | null; aiTokensInput: number | null; aiTokensOutput: number | null;
  errorMessage: string | null;
  commitResult?: { created: number; updated: number; skipped: number; failed: number; itemsCreated?: number; productsCreated?: number; errors: { row: number; error: string }[] } | null;
};

type Stage = "upload" | "processing" | "review" | "results";

const TERMINAL: Status[] = ["parsed", "needs_review", "duplicate_reused", "parse_failed", "imported"];

// SHA-256 of file bytes for the pre-flight duplicate check (matches server-side
// fingerprintBuffer which uses the same algorithm).
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function PackagePdfImportDialog({
  partnerId, partnerName, open, onOpenChange, onComplete,
}: {
  partnerId: number;
  partnerName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("upload");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"create" | "update" | "upsert">("upsert");
  const pollRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStage("upload"); setExtraction(null); setRows([]); setCollapsed({});
    setUploading(false); setCommitting(false); setMode("upsert");
    if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);
  const close = (o: boolean) => { onOpenChange(o); if (!o) setTimeout(reset, 200); };

  // ----- Polling --------------------------------------------------------------
  const pollOnce = useCallback(async (id: number) => {
    try {
      const data: Extraction = await apiFetch(`/api/package-extractions/${id}`);
      setExtraction(data);
      if (TERMINAL.includes(data.status)) {
        if (data.status === "parse_failed") {
          toast({ title: "PDF parse failed", description: data.errorMessage || "Unknown error", variant: "destructive" });
          setStage("upload");
          return;
        }
        setRows(data.parsedRows || []);
        setStage("review");
      } else {
        pollRef.current = window.setTimeout(() => pollOnce(id), 1500);
      }
    } catch (e: any) {
      toast({ title: "Lost connection while parsing", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  // ----- Upload --------------------------------------------------------------
  const onFile = async (file: File) => {
    if (!/\.pdf$/i.test(file.name)) { toast({ title: "PDF required", description: "Please choose a .pdf file.", variant: "destructive" }); return; }
    setUploading(true);
    try {
      // Pre-flight dedup so an admin doesn't burn AI budget on the same file twice.
      const hash = await sha256Hex(file);
      const dup = await apiFetch(`/api/partners/${partnerId}/package-extractions/check-duplicate?hash=${hash}`);
      if (dup.duplicate) {
        const ok = window.confirm(
          `This PDF was already parsed for this partner on ${new Date(dup.processedAt).toLocaleString()} ` +
          `(${dup.rowCount} rows). Reuse those results instead of re-parsing?`
        );
        if (ok) {
          // Open the existing extraction directly — no upload needed.
          setStage("processing");
          const ext: Extraction = await apiFetch(`/api/package-extractions/${dup.extractionId}`);
          setExtraction(ext);
          setRows(ext.parsedRows || []);
          setStage("review");
          return;
        }
      }

      // 1. signed URL
      const uploadReq = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: "application/pdf" }),
      });
      if (!uploadReq.ok) throw new Error("Failed to prepare upload");
      const { uploadURL, objectPath } = await uploadReq.json();
      // 2. PUT to GCS
      const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error("Upload failed");
      // 3. Create extraction
      const created: Extraction = await apiFetch(`/api/partners/${partnerId}/package-extractions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileUrl: objectPath, sourceFileName: file.name }),
      });
      setExtraction(created);
      setStage("processing");
      pollOnce(created.id);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // ----- Group rows by _groupKey for the review UI --------------------------
  const groups = useMemo(() => {
    const map = new Map<string, ParsedRow[]>();
    let nextKey = 0;
    let lastKey = "";
    for (const r of rows) {
      let key = r._groupKey;
      if (!key) {
        // No groupKey from AI — start a new group whenever a row has packageName.
        if (r.packageName || !lastKey) { key = `auto-${nextKey++}`; lastKey = key; }
        else key = lastKey;
      } else {
        lastKey = key;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, rs]) => ({ key, rows: rs }));
  }, [rows]);

  // ----- Row mutations -------------------------------------------------------
  const setCell = (rowIdx: number, field: string, value: any) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r));
  };
  const deleteRow = (rowIdx: number) => setRows(prev => prev.filter((_, i) => i !== rowIdx));
  const addItemRow = (groupKey: string, afterIdx: number) => {
    const blank: ParsedRow = { _groupKey: groupKey, _confidence: 1, itemName: "" };
    setRows(prev => [...prev.slice(0, afterIdx + 1), blank, ...prev.slice(afterIdx + 1)]);
  };
  const addPackage = () => {
    const key = `manual-${Date.now()}`;
    setRows(prev => [...prev, { _groupKey: key, _confidence: 1, packageName: "New package", tier: 1 }]);
  };

  // ----- Commit --------------------------------------------------------------
  const commit = async () => {
    if (!extraction) return;
    setCommitting(true);
    try {
      const result = await apiFetch(`/api/package-extractions/${extraction.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, rows }),
      });
      const refreshed: Extraction = await apiFetch(`/api/package-extractions/${extraction.id}`);
      setExtraction({ ...refreshed, commitResult: result });
      setStage("results");
      onComplete?.();
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally { setCommitting(false); }
  };

  const rerun = async () => {
    if (!extraction) return;
    try {
      await apiFetch(`/api/package-extractions/${extraction.id}/rerun`, { method: "POST" });
      setStage("processing");
      pollOnce(extraction.id);
    } catch (e: any) {
      toast({ title: "Rerun failed", description: e.message, variant: "destructive" });
    }
  };

  // ----- Render --------------------------------------------------------------
  const headerSubtitle = partnerName ? `into ${partnerName}` : "";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Convert vendor package PDF
            {headerSubtitle && <span className="text-sm text-muted-foreground font-normal">{headerSubtitle}</span>}
          </DialogTitle>
        </DialogHeader>

        {stage === "upload" && (
          <UploadStage uploading={uploading} onFile={onFile} />
        )}

        {stage === "processing" && extraction && (
          <ProcessingStage extraction={extraction} />
        )}

        {stage === "review" && extraction && (
          <ReviewStage
            extraction={extraction} groups={groups} rows={rows}
            collapsed={collapsed} setCollapsed={setCollapsed}
            setCell={setCell} deleteRow={deleteRow}
            addItemRow={addItemRow} addPackage={addPackage}
            mode={mode} setMode={setMode}
            committing={committing} commit={commit} rerun={rerun}
          />
        )}

        {stage === "results" && extraction?.commitResult && (
          <ResultsStage extraction={extraction} onClose={() => close(false)} onRerun={() => { setStage("review"); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== Stages ===============================================================

function UploadStage({ uploading, onFile }: { uploading: boolean; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="py-6">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Uploading…</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <div className="font-medium">Drop a vendor package PDF here</div>
              <div className="text-xs text-muted-foreground mt-1">or click to choose a file (max 25 MB)</div>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        We'll extract package tiers, pricing, sizes, and itemized contents into a review table you can edit before importing.
        Files are deduped by content — uploading the same PDF twice reuses the prior parse for free.
      </p>
    </div>
  );
}

function ProcessingStage({ extraction }: { extraction: Extraction }) {
  const STEPS: { status: Status; label: string }[] = [
    { status: "uploaded",       label: "Uploaded" },
    { status: "text_extracted", label: "PDF text extracted" },
    { status: "chunked",        label: "Relevant pages selected" },
    { status: "awaiting_ai",    label: "AI extracting package rows" },
    { status: "parsed",         label: "Done" },
  ];
  const currentIdx = STEPS.findIndex(s => s.status === extraction.status);
  return (
    <div className="py-8 space-y-3">
      <div className="text-sm text-muted-foreground text-center mb-4">{extraction.sourceFileName}</div>
      {STEPS.map((s, i) => {
        const done = currentIdx > i || extraction.status === "parsed" || extraction.status === "needs_review";
        const active = currentIdx === i || (i === 0 && extraction.status === "processing");
        return (
          <div key={s.status} className="flex items-center gap-3">
            {done ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : active ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
              : <div className="h-4 w-4 rounded-full border border-muted" />}
            <span className={done ? "text-foreground" : active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const EDITABLE_FIELDS = [
  { key: "packageName", label: "Package name", header: true },
  { key: "tier", label: "Tier", header: true, type: "number", width: "w-16" },
  { key: "price", label: "Price", header: true, type: "number", width: "w-24" },
  { key: "currency", label: "Cur", header: true, width: "w-16" },
  { key: "displayName", label: "Display", header: true },
  { key: "description", label: "Description", header: true },
  { key: "category", label: "Category", header: true },
  { key: "supplierName", label: "Vendor", header: true },
  { key: "sizeWidth", label: "W", header: true, type: "number", width: "w-16" },
  { key: "sizeHeight", label: "H", header: true, type: "number", width: "w-16" },
  { key: "sizeUnit", label: "Unit", header: true, width: "w-16" },
  { key: "itemName", label: "Item name", item: true },
  { key: "itemSku", label: "SKU", item: true },
  { key: "quantity", label: "Qty", item: true, type: "number", width: "w-16" },
  { key: "itemMaterial", label: "Material", item: true },
  { key: "itemFinishing", label: "Finish", item: true },
  { key: "itemPrice", label: "Item $", item: true, type: "number", width: "w-20" },
] as const;

function ReviewStage({
  extraction, groups, rows, collapsed, setCollapsed,
  setCell, deleteRow, addItemRow, addPackage, mode, setMode, committing, commit, rerun,
}: any) {
  const totalRows = rows.length;
  const lowConfRows = rows.filter((r: ParsedRow) => (r._confidence ?? 1) < 0.5).length;

  return (
    <div className="space-y-4">
      {/* Warnings banner */}
      {extraction.parseWarnings && extraction.parseWarnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
          {extraction.parseWarnings.map((w: Warning, i: number) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${w.severity === "error" ? "text-red-600" : "text-amber-600"}`} />
              <div><span className="font-medium">{w.code}:</span> {w.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">{groups.length} package{groups.length !== 1 ? "s" : ""}</Badge>
        <Badge variant="outline">{totalRows} rows</Badge>
        {extraction.parseSource === "ai" && extraction.aiTokensInput && (
          <Badge variant="secondary" className="font-normal">{extraction.aiTokensInput} in / {extraction.aiTokensOutput} out tokens</Badge>
        )}
        {extraction.parseSource === "reused_dedup" && <Badge variant="secondary">Reused prior parse</Badge>}
        {lowConfRows > 0 && <Badge variant="outline" className="border-amber-400 text-amber-700">{lowConfRows} low-confidence</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={rerun}><RotateCw className="h-3.5 w-3.5 mr-1" />Re-parse</Button>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {groups.map((g: { key: string; rows: ParsedRow[] }) => {
          const headerRow = g.rows[0];
          const itemRows = g.rows.slice(1);
          const headerIdx = rows.indexOf(headerRow);
          const isCollapsed = collapsed[g.key];
          return (
            <div key={g.key} className="border rounded-lg p-3 bg-card">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1 flex-shrink-0"
                  onClick={() => setCollapsed((c: any) => ({ ...c, [g.key]: !c[g.key] }))}>
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <RowEditor row={headerRow} mode="header" onCell={(f, v) => setCell(headerIdx, f, v)} onDelete={() => deleteRow(headerIdx)} />
              </div>
              {!isCollapsed && (
                <div className="ml-7 mt-2 space-y-1.5">
                  {itemRows.map((ir, i) => {
                    const irIdx = rows.indexOf(ir);
                    return (
                      <RowEditor key={irIdx} row={ir} mode="item" onCell={(f, v) => setCell(irIdx, f, v)} onDelete={() => deleteRow(irIdx)} />
                    );
                  })}
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => addItemRow(g.key, headerIdx + itemRows.length)}>
                    <Plus className="h-3 w-3" /> Add item
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        <Button variant="outline" size="sm" className="gap-1" onClick={addPackage}>
          <Plus className="h-3.5 w-3.5" /> Add package manually
        </Button>
      </div>

      <DialogFooter className="flex items-center gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-sm text-muted-foreground">Mode</span>
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="upsert">Upsert</SelectItem>
              <SelectItem value="create">Create only</SelectItem>
              <SelectItem value="update">Update only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={commit} disabled={committing || rows.length === 0} className="gap-2">
          {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Commit {rows.length} row{rows.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}

function RowEditor({ row, mode, onCell, onDelete }: { row: ParsedRow; mode: "header" | "item"; onCell: (f: string, v: any) => void; onDelete: () => void }) {
  const fields = EDITABLE_FIELDS.filter(f => mode === "header" ? f.header : f.item);
  const conf = row._confidence ?? 1;
  const lowConf = conf < 0.5;
  return (
    <div className={`flex flex-wrap items-start gap-1.5 p-2 rounded ${mode === "header" ? "bg-muted/40" : "bg-muted/10"} ${lowConf ? "ring-1 ring-amber-400" : ""}`}>
      {fields.map(f => (
        <div key={f.key} className="flex flex-col">
          <Input
            value={row[f.key] ?? ""}
            placeholder={f.label}
            type={(f as any).type === "number" ? "number" : "text"}
            className={`h-7 text-xs ${(f as any).width || "w-32"}`}
            onChange={(e) => {
              const v = e.target.value;
              onCell(f.key, (f as any).type === "number" ? (v === "" ? null : Number(v)) : v);
            }}
          />
        </div>
      ))}
      <div className="flex items-center gap-1 ml-auto">
        {row._sourcePage && <span className="text-[10px] text-muted-foreground">p.{row._sourcePage}</span>}
        {lowConf && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 h-5">~{Math.round(conf * 100)}%</Badge>}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function ResultsStage({ extraction, onClose, onRerun }: { extraction: Extraction; onClose: () => void; onRerun: () => void }) {
  const r = extraction.commitResult!;
  const ok = r.created > 0 || r.updated > 0;
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 className="h-8 w-8 text-green-600" /> : <AlertTriangle className="h-8 w-8 text-amber-600" />}
        <div>
          <div className="font-medium">{ok ? "Import committed" : "Nothing imported"}</div>
          <div className="text-sm text-muted-foreground">{extraction.sourceFileName}</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-md border p-3"><div className="text-2xl font-semibold text-green-600">{r.created}</div><div className="text-xs text-muted-foreground">Created</div></div>
        <div className="rounded-md border p-3"><div className="text-2xl font-semibold text-blue-600">{r.updated}</div><div className="text-xs text-muted-foreground">Updated</div></div>
        <div className="rounded-md border p-3"><div className="text-2xl font-semibold text-muted-foreground">{r.skipped}</div><div className="text-xs text-muted-foreground">Skipped</div></div>
        <div className="rounded-md border p-3"><div className="text-2xl font-semibold text-red-600">{r.failed}</div><div className="text-xs text-muted-foreground">Failed</div></div>
      </div>
      {(r.itemsCreated || r.productsCreated) && (
        <div className="text-sm text-muted-foreground text-center">
          {r.itemsCreated} package items · {r.productsCreated} placeholder products created
        </div>
      )}
      {r.errors.length > 0 && (
        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1">
          <div className="text-sm font-medium mb-1">Errors</div>
          {r.errors.map((e, i) => (
            <div key={i} className="text-xs"><span className="text-muted-foreground">Row {e.row}:</span> {e.error}</div>
          ))}
        </div>
      )}
      <DialogFooter>
        {!ok && <Button variant="outline" onClick={onRerun}>Back to review</Button>}
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  );
}
