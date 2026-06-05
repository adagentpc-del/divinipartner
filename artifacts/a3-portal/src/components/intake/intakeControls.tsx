import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Image as ImageIcon, FileDown } from "lucide-react";
import { apiUrl } from "@/lib/api";

export type AssetFile = { name: string; url: string };

type ClientTemplate = {
  id: number;
  fileName: string;
  category: string;
  productType: string | null;
  description: string | null;
  fileUrl: string;
};

const catLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/**
 * Surfaces the active, client-facing templates from the library on a public
 * intake page. Renders nothing while loading or when there are none, so it can
 * be dropped onto any intake form without layout side effects.
 */
export function TemplateDownloads({ title = "Helpful templates & specs" }: { title?: string }) {
  const [templates, setTemplates] = useState<ClientTemplate[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/public/intake/templates"))
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setTemplates(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (templates.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold mb-3">
        <FileDown className="h-4 w-4" />{title}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {templates.map((t) => (
          <a
            key={t.id}
            href={t.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:border-primary transition"
          >
            <FileDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block font-medium truncate">{t.fileName}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {t.productType || catLabel(t.category)}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export const INTAKE_LINK_SOURCES = ["alyssa", "drew", "retta", "general"] as const;

export function normalizeSource(raw: string | undefined): string | null {
  const s = (raw || "").toLowerCase();
  return (INTAKE_LINK_SOURCES as readonly string[]).includes(s) ? s : null;
}

export async function uploadIntakeFile(file: File): Promise<AssetFile> {
  const res = await fetch(apiUrl("/api/storage/uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Failed to prepare upload");
  const { uploadURL, objectPath } = await res.json();
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload failed");
  return { name: file.name, url: objectPath };
}

/**
 * Upload a file to the PUBLIC bucket and return a `/api/storage/public-objects/...`
 * URL that anonymous visitors can download without a session. Use this for
 * client-facing assets such as intake templates and spec sheets.
 */
export async function uploadPublicFile(file: File): Promise<AssetFile> {
  const res = await fetch(apiUrl("/api/storage/public-uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error || "Failed to prepare upload");
  }
  const { uploadURL, publicUrl } = await res.json();
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload failed");
  return { name: file.name, url: publicUrl };
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  );
}

export function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right truncate max-w-[60%]">{value}</dd>
    </div>
  );
}

export function PillGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${value === o ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function ChipMulti({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${on ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function UploadBucket({ label, files, onUpload, onRemove, busy }: { label: string; files: AssetFile[]; onUpload: (f: File) => void; onRemove: (i: number) => void; busy: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <Label className="text-xs flex items-center gap-1.5 mb-2"><ImageIcon className="h-3.5 w-3.5" />{label}</Label>
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1">
            <span className="truncate">{f.name}</span>
            <button onClick={() => onRemove(i)} className="hover:bg-destructive/20 rounded p-0.5"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <label className="cursor-pointer flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary transition">
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Add
        </label>
      </div>
    </div>
  );
}
