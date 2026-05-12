import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AssetUploader from "@/components/admin/AssetUploader";
import AssetCard from "@/components/admin/AssetCard";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Asset } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";

// Source the row shape from the shared Drizzle schema so renamed/removed
// columns surface as type errors here instead of silently breaking the
// admin asset library. `timestamp` columns are returned as ISO strings on
// the wire, so we run the schema row through SerializedRow.
type AssetRow = SerializedRow<Asset>;

const STATUSES = ["all", "uploaded", "under_review", "revision_requested", "approved", "vendor_released", "superseded"];
const CATS = ["all", "client_artwork", "approved_artwork", "proof", "print_ready", "reference", "install_reference", "shipping_document", "photo", "spec", "internal_only"];

export default function Assets() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const { data: assets = [] } = useQuery<AssetRow[]>({
    queryKey: ["/api/assets", { status, category }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (category !== "all") params.set("category", category);
      return apiFetch(`/api/assets?${params.toString()}`);
    },
  });
  const filtered = assets.filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()) || a.fileName?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
            <p className="text-muted-foreground mt-1">All artwork, proofs, references, and supporting files across the portal.</p>
          </div>
          <Button onClick={() => setShowUpload(v => !v)}>{showUpload ? "Close" : "Upload asset"}</Button>
        </div>

        {showUpload && (
          <AssetUploader context={{}} onCreated={() => { setShowUpload(false); qc.invalidateQueries({ queryKey: ["/api/assets"] }); }} />
        )}

        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Input placeholder="Search title or filename…" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">{filtered.length} assets</span>
        </Card>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No assets match these filters.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(a => <AssetCard key={a.id} asset={a} />)}
          </div>
        )}
    </div>
  );
}
