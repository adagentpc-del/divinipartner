import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Upload, Loader2 } from "lucide-react";

const CATEGORIES = [
  { value: "client_artwork", label: "Client artwork" },
  { value: "approved_artwork", label: "Approved artwork" },
  { value: "proof", label: "Proof" },
  { value: "print_ready", label: "Print-ready file" },
  { value: "reference", label: "Reference" },
  { value: "install_reference", label: "Install reference" },
  { value: "shipping_document", label: "Shipping document" },
  { value: "photo", label: "Photo" },
  { value: "spec", label: "Spec" },
  { value: "internal_only", label: "Internal only" },
];
const VISIBILITIES = [
  { value: "internal_only", label: "Internal only" },
  { value: "partner_visible", label: "Partner visible" },
  { value: "client_visible", label: "Client visible" },
  { value: "vendor_visible", label: "Vendor visible" },
];

export type AssetUploaderContext = {
  partnerId?: number | null;
  eventId?: number | null;
  orderId?: number | null;
  productId?: number | null;
  brandingZoneId?: number | null;
  supplierId?: number | null;
  linkOrderItemIds?: number[];
};

export default function AssetUploader({
  context,
  onCreated,
  defaultCategory = "client_artwork",
  defaultVisibility = "internal_only",
  compact = false,
}: {
  context: AssetUploaderContext;
  onCreated?: (asset: any) => void;
  defaultCategory?: string;
  defaultVisibility?: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [notes, setNotes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(f: File | null) {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function upload() {
    if (!file) {
      toast({ title: "Choose a file first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!r.ok) throw new Error("Upload URL failed");
      const { uploadURL, objectPath } = await r.json();
      const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("File upload failed");
      const asset = await apiFetch("/api/assets", {
        method: "POST",
        body: JSON.stringify({
          title: title || file.name,
          fileUrl: objectPath,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          category,
          visibility,
          notes: notes || null,
          ...context,
        }),
      });
      toast({ title: "Asset uploaded" });
      setFile(null); setTitle(""); setNotes("");
      if (inputRef.current) inputRef.current.value = "";
      onCreated?.(asset);
    } catch (e: any) {
      toast({ title: e.message || "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const dropZone = (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0] || null); }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50"}`}
    >
      <Upload className="h-6 w-6 text-muted-foreground mb-2" />
      {file ? (
        <p className="text-sm font-medium">{file.name} <span className="text-muted-foreground">({(file.size/1024).toFixed(1)} KB)</span></p>
      ) : (
        <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
      )}
      <input ref={inputRef} type="file" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {dropZone}
        <div className="grid grid-cols-2 gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VISIBILITIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={upload} disabled={busy || !file} className="w-full">
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Upload
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      {dropZone}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Asset title" />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Visibility</Label>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VISIBILITIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
        </div>
      </div>
      <Button onClick={upload} disabled={busy || !file}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Upload asset
      </Button>
    </Card>
  );
}
