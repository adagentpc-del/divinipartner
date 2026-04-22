import { useState, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, FileSpreadsheet } from "lucide-react";

type Resource = "suppliers" | "products" | "specs";
type Field = { key: string; label: string; required?: boolean; type: string; description?: string };
type ParseResp = { headers: string[]; rows: Record<string, unknown>[]; rowCount: number; suggestedMap: Record<string, string>; sample: Record<string, unknown>[] };
type CommitResp = { created: number; updated: number; skipped: number; failed: number; errors: { row: number; error: string }[]; createdIds: number[]; updatedIds: number[] };

const TITLES: Record<Resource, string> = { suppliers: "Import Suppliers", products: "Import Products", specs: "Import Product Specs" };

export function ImportDialog({
  resource, open, onOpenChange, onComplete,
}: { resource: Resource; open: boolean; onOpenChange: (o: boolean) => void; onComplete?: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [parsed, setParsed] = useState<ParseResp | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"create" | "update" | "upsert">("upsert");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResp | null>(null);

  const reset = useCallback(() => { setStep(0); setParsed(null); setMapping({}); setResult(null); setParsing(false); setCommitting(false); }, []);
  const close = (o: boolean) => { onOpenChange(o); if (!o) setTimeout(reset, 200); };

  const loadFields = async () => {
    if (fields.length) return;
    const r = await apiFetch(`/api/imports/fields/${resource}`);
    setFields(r.fields);
  };

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      await loadFields();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("resource", resource);
      const r = await fetch(`/api/imports/parse`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Parse failed");
      const data: ParseResp = await r.json();
      setParsed(data);
      setMapping(data.suggestedMap || {});
      setStep(1);
    } catch (e: any) {
      toast({ title: "Could not read file", description: e.message, variant: "destructive" });
    } finally { setParsing(false); }
  };

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const [header, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey || fieldKey === "__ignore__") continue;
        out[fieldKey] = r[header];
      }
      return out;
    });
  }, [parsed, mapping]);

  const requiredFields = fields.filter(f => f.required);
  const mappedKeys = new Set(Object.values(mapping).filter(v => v && v !== "__ignore__"));
  const missingRequired = requiredFields.filter(f => !mappedKeys.has(f.key));

  const commit = async () => {
    setCommitting(true);
    try {
      const r = await apiFetch(`/api/imports/commit`, {
        method: "POST",
        body: JSON.stringify({ resource, mode, rows: mappedRows }),
        headers: { "Content-Type": "application/json" },
      });
      setResult(r);
      setStep(3);
      if ((r.created + r.updated) > 0) onComplete?.();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally { setCommitting(false); }
  };

  const downloadTemplate = () => { window.open(`/api/imports/template/${resource}`, "_blank"); };
  const downloadErrorReport = () => {
    if (!result?.errors?.length) return;
    const csv = "Row,Error\n" + result.errors.map(e => `${e.row},"${(e.error || "").replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${resource}-import-errors.csv`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />{TITLES[resource]}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          {["Upload", "Map columns", "Preview", "Results"].map((s, i) => (
            <div key={s} className={`flex items-center gap-2 ${i === step ? "text-foreground font-semibold" : ""}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span>
              {s}
              {i < 3 && <ArrowRight className="h-3 w-3 mx-1" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload a CSV or Excel (.xlsx) file. We'll guide you through mapping columns and previewing rows before anything is saved.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" /> Download template (CSV)</Button>
            </div>
            <label className={`block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary transition ${parsing ? "opacity-50 pointer-events-none" : ""}`}>
              <input type="file" accept=".csv,.tsv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} disabled={parsing} />
              {parsing ? <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 mx-auto text-muted-foreground" />}
              <div className="mt-3 font-medium">{parsing ? "Reading file…" : "Click to upload, or drag and drop"}</div>
              <div className="text-xs text-muted-foreground mt-1">CSV, TSV, XLSX up to 10 MB</div>
            </label>
          </div>
        )}

        {step === 1 && parsed && (
          <div className="space-y-3">
            <div className="text-sm">Detected <strong>{parsed.rowCount}</strong> data rows and <strong>{parsed.headers.length}</strong> columns. Map each spreadsheet column to a portal field, or set it to <em>Ignore</em>.</div>
            {missingRequired.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Required fields not mapped: {missingRequired.map(f => f.label).join(", ")}</div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="text-left p-2 w-1/3">Spreadsheet column</th><th className="text-left p-2">Sample value</th><th className="text-left p-2 w-1/3">Maps to</th></tr></thead>
                <tbody>
                  {parsed.headers.map(h => (
                    <tr key={h} className="border-t">
                      <td className="p-2 font-mono text-xs">{h}</td>
                      <td className="p-2 text-muted-foreground text-xs truncate max-w-[200px]">{String((parsed.sample[0]?.[h] ?? "") || "—")}</td>
                      <td className="p-2">
                        <Select value={mapping[h] || "__ignore__"} onValueChange={(v) => setMapping(m => ({ ...m, [h]: v }))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ignore__">— Ignore —</SelectItem>
                            {fields.map(f => (
                              <SelectItem key={f.key} value={f.key}>{f.label}{f.required && " *"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 2 && parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span>Import mode:</span>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">Create new + update existing</SelectItem>
                  <SelectItem value="create">Create new only (skip existing)</SelectItem>
                  <SelectItem value="update">Update existing only (skip new)</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs">{parsed.rowCount} rows ready</span>
            </div>
            <div className="border rounded-lg overflow-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>{[...mappedKeys].map(k => { const f = fields.find(x => x.key === k); return <th key={k} className="text-left p-1.5 whitespace-nowrap">{f?.label || k}</th>; })}</tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      {[...mappedKeys].map(k => <td key={k} className="p-1.5 whitespace-nowrap">{String(r[k] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rowCount > 50 && <div className="text-xs text-muted-foreground">Showing first 50 of {parsed.rowCount} rows.</div>}
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Created</div><div className="text-2xl font-bold text-green-600">{result.created}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Updated</div><div className="text-2xl font-bold text-blue-600">{result.updated}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Skipped</div><div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Failed</div><div className={`text-2xl font-bold ${result.failed ? "text-destructive" : "text-muted-foreground"}`}>{result.failed}</div></div>
            </div>
            {result.errors.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />{result.errors.length} row{result.errors.length === 1 ? "" : "s"} could not be imported</div>
                  <Button variant="outline" size="sm" onClick={downloadErrorReport} className="gap-2"><Download className="h-3.5 w-3.5" />Download error report</Button>
                </div>
                <div className="border rounded-lg overflow-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0"><tr><th className="text-left p-1.5 w-16">Row</th><th className="text-left p-1.5">Error</th></tr></thead>
                    <tbody>{result.errors.slice(0, 100).map((e, i) => <tr key={i} className="border-t"><td className="p-1.5">{e.row}</td><td className="p-1.5 text-destructive">{e.error}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />All rows processed successfully.</div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && step < 3 && <Button variant="outline" onClick={() => setStep((step - 1) as any)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>}
          {step === 1 && <Button onClick={() => setStep(2)} disabled={missingRequired.length > 0}>Preview rows<ArrowRight className="h-4 w-4 ml-1" /></Button>}
          {step === 2 && <Button onClick={commit} disabled={committing || mappedRows.length === 0}>{committing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Import {mappedRows.length} row{mappedRows.length === 1 ? "" : "s"}</Button>}
          {step === 3 && <Badge variant="secondary" className="mr-auto">{(result?.created || 0) + (result?.updated || 0)} record{((result?.created || 0) + (result?.updated || 0)) === 1 ? "" : "s"} saved</Badge>}
          {step === 3 && <Button onClick={() => close(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
