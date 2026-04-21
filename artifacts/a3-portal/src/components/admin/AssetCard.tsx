import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Eye, FileText, Image as ImageIcon, MoreVertical, RotateCcw, Send, Upload } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const STATUS_TONE: Record<string, string> = {
  uploaded: "bg-zinc-100 text-zinc-700",
  under_review: "bg-amber-100 text-amber-800",
  revision_requested: "bg-red-100 text-red-800",
  approved: "bg-emerald-100 text-emerald-800",
  vendor_released: "bg-emerald-200 text-emerald-900",
  superseded: "bg-zinc-200 text-zinc-500 line-through",
  archived: "bg-zinc-200 text-zinc-500",
};
const APPROVAL_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  not_required: "bg-zinc-100 text-zinc-600",
};
const VISIBILITY_TONE: Record<string, string> = {
  internal_only: "bg-zinc-100 text-zinc-700",
  partner_visible: "bg-blue-100 text-blue-800",
  client_visible: "bg-purple-100 text-purple-800",
  vendor_visible: "bg-indigo-100 text-indigo-800",
};

function fileIcon(mime?: string | null) {
  if (mime?.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function downloadUrl(fileUrl: string) {
  if (fileUrl.startsWith("http")) return fileUrl;
  return `/api/storage${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

export default function AssetCard({ asset, onChanged }: { asset: any; onChanged?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const newVerRef = useRef<HTMLInputElement>(null);

  async function action(label: string, fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      qc.invalidateQueries();
      onChanged?.();
    } catch (e: any) {
      toast({ title: e.message || "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function uploadNewVersion(file: File) {
    setBusy(true);
    try {
      const r = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await r.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await apiFetch(`/api/assets/${asset.id}/new-version`, {
        method: "POST",
        body: JSON.stringify({ fileUrl: objectPath, fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });
      toast({ title: "New version uploaded" });
      qc.invalidateQueries();
      onChanged?.();
    } catch (e: any) {
      toast({ title: e.message || "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {asset.mimeType?.startsWith("image/") ? (
            <a href={downloadUrl(asset.fileUrl)} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={downloadUrl(asset.fileUrl)} className="h-12 w-12 object-cover rounded border" alt="" />
            </a>
          ) : (
            <div className="h-12 w-12 rounded border flex items-center justify-center bg-muted shrink-0">
              {fileIcon(asset.mimeType)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{asset.title}</p>
            <p className="text-xs text-muted-foreground truncate">{asset.fileName} · v{asset.version}{asset.isCurrent ? "" : " (old)"}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge className={STATUS_TONE[asset.status] || "bg-zinc-100"}>{asset.status.replace(/_/g," ")}</Badge>
              <Badge className={APPROVAL_TONE[asset.approvalStatus] || "bg-zinc-100"}>{asset.approvalStatus}</Badge>
              <Badge className={VISIBILITY_TONE[asset.visibility] || "bg-zinc-100"}>{asset.visibility.replace(/_/g," ")}</Badge>
              <Badge variant="outline">{asset.category.replace(/_/g," ")}</Badge>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy}><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.open(downloadUrl(asset.fileUrl), "_blank")}>
              <Eye className="h-4 w-4 mr-2" /> View / Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={asset.approvalStatus === "approved" && asset.status === "vendor_released"}
              onClick={() => action("Approved & released to vendor", () => apiFetch(`/api/assets/${asset.id}/approve`, { method: "POST", body: JSON.stringify({ releaseToVendor: true }) }))}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & release to vendor
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => action("Approved (internal)", () => apiFetch(`/api/assets/${asset.id}/approve`, { method: "POST", body: JSON.stringify({ releaseToVendor: false }) }))}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRevisionOpen(v => !v)}>
              <RotateCcw className="h-4 w-4 mr-2" /> Request revision
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => newVerRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Upload new version
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => action("Released to vendor", () => apiFetch(`/api/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify({ status: "vendor_released", visibility: "vendor_visible" }) }))}
            >
              <Send className="h-4 w-4 mr-2" /> Release to vendor
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { if (confirm("Archive asset?")) action("Archived", () => apiFetch(`/api/assets/${asset.id}`, { method: "DELETE" })); }}
              className="text-red-600"
            >Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {revisionOpen && (
        <div className="space-y-2 border-t pt-2">
          <Textarea placeholder="Revision notes…" rows={2} value={revisionNote} onChange={e => setRevisionNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setRevisionOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { setRevisionOpen(false); action("Revision requested", () => apiFetch(`/api/assets/${asset.id}/request-revision`, { method: "POST", body: JSON.stringify({ notes: revisionNote }) })); }}>Send</Button>
          </div>
        </div>
      )}
      {asset.notes && <p className="text-xs text-muted-foreground border-t pt-2">{asset.notes}</p>}
      <input ref={newVerRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadNewVersion(f); }} />
    </Card>
  );
}
