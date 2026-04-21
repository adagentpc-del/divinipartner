import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import AssetUploader from "./AssetUploader";
import AssetCard from "./AssetCard";
import { CheckCircle2, AlertTriangle, Plus, Link2, Unlink, ExternalLink, Send, Ban, FileText, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";

type ReadinessItem = {
  itemId: number; name: string; itemType: string; quantity: number;
  productId: number | null; brandingZoneId: number | null;
  assignedSupplierId: number | null; supplierStatus: string;
  fulfillmentMode: string | null;
  expectations: { needsArtwork: boolean; needsProof: boolean };
  assets: Array<{ linkId: number; role: string; asset: any }>;
  flags: string[]; productionReady: boolean; productionBlockedReason: string | null;
};

export default function OrderAssetsPanel({ orderId, partnerId, eventId }: { orderId: number; partnerId?: number | null; eventId?: number | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [linkingAssetId, setLinkingAssetId] = useState<number | "">("");
  const [linkingRole, setLinkingRole] = useState<string>("primary_artwork");
  const [orderUploadOpen, setOrderUploadOpen] = useState(false);

  const { data: readiness, refetch } = useQuery<{ orderId: number; items: ReadinessItem[]; summary: any }>({
    queryKey: [`/api/orders/${orderId}/readiness`],
    queryFn: () => apiFetch(`/api/orders/${orderId}/readiness`),
  });

  const { data: orderAssets = [] } = useQuery<any[]>({
    queryKey: [`/api/assets`, { orderId }],
    queryFn: () => apiFetch(`/api/assets?orderId=${orderId}&currentOnly=true`),
  });

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: [`/api/assets`] });
    qc.invalidateQueries({ queryKey: ["/api/production/dashboard"] });
  };

  async function linkExisting(orderItemId: number, assetId: number, role = "primary_artwork") {
    if (!assetId) return;
    try {
      await apiFetch(`/api/assets/${assetId}/links`, { method: "POST", body: JSON.stringify({ orderItemId, role }) });
      toast({ title: "Asset linked" });
      refreshAll();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }
  async function unlink(assetId: number, linkId: number) {
    try {
      await apiFetch(`/api/assets/${assetId}/links/${linkId}`, { method: "DELETE" });
      toast({ title: "Unlinked" });
      refreshAll();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }
  async function setBlock(itemId: number, reason: string | null) {
    try {
      await apiFetch(`/api/order-items/${itemId}/production-block`, { method: "PATCH", body: JSON.stringify({ reason }) });
      toast({ title: reason ? "Marked blocked" : "Block cleared" });
      refreshAll();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }

  const linkableAssets = orderAssets;
  const supplierIds = [...new Set((readiness?.items || []).map(i => i.assignedSupplierId).filter((x): x is number => !!x))];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold">Production readiness</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {readiness ? `${readiness.summary.ready}/${readiness.summary.total} line items ready` : "Loading…"}
            </p>
          </div>
          {readiness && (
            <div className="flex items-center gap-2">
              {readiness.summary.missingArtwork > 0 && <Badge className="bg-red-100 text-red-800">{readiness.summary.missingArtwork} missing artwork</Badge>}
              {readiness.summary.awaitingApproval > 0 && <Badge className="bg-amber-100 text-amber-800">{readiness.summary.awaitingApproval} awaiting approval</Badge>}
              {readiness.summary.blocked > 0 && <Badge className="bg-orange-100 text-orange-800">{readiness.summary.blocked} blocked</Badge>}
              {readiness.summary.blocked === 0 && readiness.summary.missingArtwork === 0 && readiness.summary.awaitingApproval === 0 && <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />All clear</Badge>}
            </div>
          )}
        </div>
        {supplierIds.length > 0 && (
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Supplier packets:</span>
            {supplierIds.map(sid => (
              <Link key={sid} href={`/admin/orders/${orderId}/packet/${sid}`}>
                <Button variant="outline" size="sm"><ExternalLink className="h-3 w-3 mr-1" />Supplier #{sid}</Button>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Order-level assets ({orderAssets.length})</h3>
          <Button size="sm" variant="outline" onClick={() => setOrderUploadOpen(v => !v)}>
            <Plus className="h-4 w-4 mr-1" />{orderUploadOpen ? "Close" : "Add asset"}
          </Button>
        </div>
        {orderUploadOpen && (
          <div className="mb-3">
            <AssetUploader
              context={{ orderId, partnerId: partnerId || null, eventId: eventId || null }}
              onCreated={() => { setOrderUploadOpen(false); refreshAll(); }}
            />
          </div>
        )}
        {orderAssets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No order-level assets yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {orderAssets.map(a => <AssetCard key={a.id} asset={a} onChanged={refreshAll} />)}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold">Line items</h3>
        {readiness?.items.map(it => (
          <Card key={it.itemId} className={`p-4 ${it.productionReady ? "" : it.flags.includes("blocked") || it.flags.includes("artwork_missing") ? "border-red-300" : "border-amber-300"}`}>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium">{it.name}</h4>
                  <Badge variant="outline">×{it.quantity}</Badge>
                  {it.fulfillmentMode && <Badge variant="secondary">{it.fulfillmentMode.replace(/_/g," ")}</Badge>}
                  {it.expectations.needsArtwork && <Badge variant="outline" className="text-xs">artwork required</Badge>}
                  {it.expectations.needsProof && <Badge variant="outline" className="text-xs">proof required</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {it.productionReady && <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />Production ready</Badge>}
                  {it.flags.map(f => <Badge key={f} className={f === "blocked" || f.includes("missing") ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}><AlertTriangle className="h-3 w-3 mr-1" />{f.replace(/_/g," ")}</Badge>)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpenItem(openItem === it.itemId ? null : it.itemId)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Asset
                </Button>
                {it.productionBlockedReason ? (
                  <Button size="sm" variant="outline" onClick={() => setBlock(it.itemId, null)}>Unblock</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { const r = prompt("Block reason?"); if (r) setBlock(it.itemId, r); }}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Block
                  </Button>
                )}
              </div>
            </div>
            {it.productionBlockedReason && <div className="mt-2 text-sm p-2 rounded bg-red-50 border border-red-200">{it.productionBlockedReason}</div>}

            {it.assets.length > 0 && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {it.assets.map(l => (
                  <div key={l.linkId} className="flex items-center gap-2 p-2 border rounded">
                    {l.asset.mimeType?.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{l.asset.title}</p>
                      <p className="text-[11px] text-muted-foreground">{l.role?.replace(/_/g," ")} · v{l.asset.version} · {l.asset.status.replace(/_/g," ")}</p>
                    </div>
                    {l.asset.approvalStatus === "approved" && <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">approved</Badge>}
                    {l.asset.visibility === "vendor_visible" && <Badge className="bg-indigo-100 text-indigo-800 text-[10px]"><Send className="h-2.5 w-2.5 mr-0.5" />vendor</Badge>}
                    <Button size="icon" variant="ghost" onClick={() => unlink(l.asset.id, l.linkId)} title="Unlink">
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {openItem === it.itemId && (
              <div className="mt-3 pt-3 border-t space-y-3">
                {linkableAssets.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <select className="flex-1 border rounded h-9 px-2 text-sm" value={linkingAssetId} onChange={e => setLinkingAssetId(e.target.value === "" ? "" : parseInt(e.target.value))}>
                      <option value="">Link existing order asset…</option>
                      {linkableAssets.map(a => <option key={a.id} value={a.id}>{a.title} · {a.category}</option>)}
                    </select>
                    <select className="border rounded h-9 px-2 text-sm" value={linkingRole} onChange={e => setLinkingRole(e.target.value)}>
                      <option value="primary_artwork">primary_artwork</option>
                      <option value="proof">proof</option>
                      <option value="reference">reference</option>
                      <option value="install_diagram">install_diagram</option>
                      <option value="shipping_doc">shipping_doc</option>
                    </select>
                    <Button size="sm" disabled={!linkingAssetId} onClick={() => { linkExisting(it.itemId, linkingAssetId as number, linkingRole); setLinkingAssetId(""); }}>Link</Button>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium mb-2">Or upload new asset for this line item:</p>
                  <AssetUploader
                    compact
                    context={{ orderId, partnerId: partnerId || null, eventId: eventId || null, productId: it.productId, brandingZoneId: it.brandingZoneId, supplierId: it.assignedSupplierId, linkOrderItemIds: [it.itemId] }}
                    onCreated={() => { setOpenItem(null); refreshAll(); }}
                  />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
