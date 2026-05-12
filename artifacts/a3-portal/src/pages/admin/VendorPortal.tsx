import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Truck, Inbox, AlertTriangle, FileText, Printer, ChevronLeft,
  Clock, Package, Image as ImageIcon, MapPin, User, Calendar,
} from "lucide-react";

import type { Supplier as SchemaSupplier, OrderItem } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";
type Supplier = Pick<SchemaSupplier, "id" | "name">;
type VItem = SerializedRow<Pick<OrderItem,
  "id" | "orderId" | "name" | "quantity" | "fulfillmentMode"
  | "printDemandQuantity" | "hardwareDemandQuantity"
  | "supplierStatus" | "supplierDueDate" | "supplierShipDate"
  | "supplierReference" | "supplierNotes"
  | "exceptionFlag" | "exceptionReason"
  | "artworkFileUrl" | "notes" | "productId"
>> & {
  orderNumber: string;
  partnerName: string | null;
  eventName: string | null;
  eventStartDate: string | null;
  venueName: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned", assigned: "Assigned (please acknowledge)", acknowledged: "Acknowledged",
  in_production: "In Production", awaiting_assets: "Awaiting Assets",
  awaiting_approval: "Awaiting Approval", shipped: "Shipped",
  delivered: "Delivered", installed: "Installed", completed: "Completed",
  issue_flagged: "Issue Flagged", cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  unassigned: "bg-zinc-100 text-zinc-700",
  assigned: "bg-blue-100 text-blue-800",
  acknowledged: "bg-indigo-100 text-indigo-800",
  in_production: "bg-amber-100 text-amber-800",
  awaiting_assets: "bg-orange-100 text-orange-800",
  awaiting_approval: "bg-purple-100 text-purple-800",
  shipped: "bg-cyan-100 text-cyan-800",
  delivered: "bg-emerald-100 text-emerald-800",
  installed: "bg-emerald-200 text-emerald-900",
  completed: "bg-emerald-600 text-white",
  issue_flagged: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-200 text-zinc-600 line-through",
};
const VENDOR_NEXT: Record<string, string[]> = {
  assigned: ["acknowledged", "issue_flagged"],
  acknowledged: ["in_production", "awaiting_assets", "awaiting_approval", "issue_flagged"],
  in_production: ["awaiting_assets", "awaiting_approval", "shipped", "issue_flagged"],
  awaiting_assets: ["in_production", "issue_flagged"],
  awaiting_approval: ["in_production", "shipped", "issue_flagged"],
  shipped: ["delivered", "issue_flagged"],
  delivered: ["installed", "completed", "issue_flagged"],
  installed: ["completed", "issue_flagged"],
  issue_flagged: ["acknowledged", "in_production", "shipped"],
  completed: [], cancelled: [], unassigned: [],
};

export default function VendorPortal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const [supplierId, setSupplierId] = useState<string>("");
  const [bucket, setBucket] = useState<string>("all");
  const [packetOrderId, setPacketOrderId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ items: VItem[]; buckets: Record<string, number> }>({
    queryKey: ["/api/vendor/items", supplierId, bucket],
    queryFn: () => apiFetch(`/api/vendor/items?supplierId=${supplierId}&bucket=${bucket}`),
    enabled: !!supplierId,
  });

  const items = data?.items || [];
  const buckets = data?.buckets || { all: 0, due_soon: 0, awaiting_assets: 0, in_production: 0, issues: 0, recent: 0 };

  const update = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: number; itemId: number; status: string }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/status`, { method: "POST", body: JSON.stringify({ status, role: "vendor" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/vendor/items"] }); toast({ title: "Status updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const flag = useMutation({
    mutationFn: ({ orderId, itemId, reason }: { orderId: number; itemId: number; reason: string }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/exception`, { method: "POST", body: JSON.stringify({ flag: true, reason, role: "vendor" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/vendor/items"] }); toast({ title: "Issue flagged" }); },
  });

  const TabBtn = ({ value, label, count, icon: Icon }: any) => (
    <button onClick={() => setBucket(value)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${bucket === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
      <Icon className="h-4 w-4" />{label}<span className={`text-xs px-1.5 py-0.5 rounded ${bucket === value ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>
    </button>
  );

  if (packetOrderId && supplierId) {
    return <PacketView orderId={packetOrderId} supplierId={parseInt(supplierId)} onBack={() => setPacketOrderId(null)} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" />Vendor Workspace</h1>
        <p className="text-muted-foreground mt-1 text-sm">Switch supplier perspective to see assigned items, update statuses, and print packets.</p>
      </div>

      <Card className="p-4 flex items-center gap-3 max-w-lg">
        <Truck className="h-5 w-5 text-muted-foreground" />
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
          <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </Card>

      {!supplierId && <Card className="p-12 text-center text-muted-foreground">Choose a supplier to load their workspace.</Card>}

      {supplierId && (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-3">
            <TabBtn value="all" label="All" count={buckets.all} icon={Inbox} />
            <TabBtn value="due_soon" label="Due in 7d" count={buckets.due_soon} icon={Clock} />
            <TabBtn value="awaiting_assets" label="Awaiting Assets" count={buckets.awaiting_assets} icon={FileText} />
            <TabBtn value="in_production" label="In Production" count={buckets.in_production} icon={Package} />
            <TabBtn value="issues" label="Issues" count={buckets.issues} icon={AlertTriangle} />
          </div>

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead>Order</TableHead><TableHead>Item</TableHead><TableHead>Event / Venue</TableHead>
                  <TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map(it => (
                    <TableRow key={it.id} className={it.exceptionFlag ? "bg-red-50/40" : ""}>
                      <TableCell><button onClick={() => setPacketOrderId(it.orderId)} className="font-mono text-xs text-primary hover:underline">{it.orderNumber}</button>
                        <div className="text-[10px] text-muted-foreground">{it.partnerName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">Qty {it.quantity}{it.printDemandQuantity ? ` · Print ${it.printDemandQuantity}` : ""}{it.hardwareDemandQuantity ? ` · HW ${it.hardwareDemandQuantity}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{it.eventName || "—"}</div>
                        <div className="text-muted-foreground">{it.venueName || ""}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_TONE[it.supplierStatus] || ""}`}>{STATUS_LABEL[it.supplierStatus] || it.supplierStatus}</span>
                        {it.exceptionFlag && <div className="text-[10px] text-red-700 mt-1">⚠ {it.exceptionReason}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{it.supplierDueDate ? new Date(it.supplierDueDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(VENDOR_NEXT[it.supplierStatus] || []).length > 0 && (
                            <Select onValueChange={(v) => update.mutate({ orderId: it.orderId, itemId: it.id, status: v })}>
                              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Update status" /></SelectTrigger>
                              <SelectContent>{(VENDOR_NEXT[it.supplierStatus] || []).map(s => <SelectItem key={s} value={s} className="text-xs">→ {STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setPacketOrderId(it.orderId)}><FileText className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No items in this bucket.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PacketView({ orderId, supplierId, onBack }: { orderId: number; supplierId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/vendor/orders/${orderId}/packet`, supplierId],
    queryFn: () => apiFetch(`/api/vendor/orders/${orderId}/packet?supplierId=${supplierId}`),
  });
  const update = useMutation({
    mutationFn: ({ itemId, status }: any) => apiFetch(`/api/orders/${orderId}/items/${itemId}/status`, { method: "POST", body: JSON.stringify({ status, role: "vendor" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/vendor/orders/${orderId}/packet`, supplierId] }); toast({ title: "Status updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <div className="py-24 text-center text-muted-foreground">Could not load packet.</div>;

  const { order, supplier, items, products, quoteAssets } = data;
  const productsById = new Map<number, any>(products.map((p: any) => [p.id, p]));
  const assetsByProduct = new Map<number, any[]>();
  for (const a of quoteAssets) {
    if (!assetsByProduct.has(a.attachableId)) assetsByProduct.set(a.attachableId, []);
    assetsByProduct.get(a.attachableId)!.push(a);
  }

  return (
    <div className="space-y-5 print:space-y-3">
      <style>{`@media print { @page { margin: 1.5cm; } .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ChevronLeft className="h-4 w-4" />Back to workspace</Button>
        <Button variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" />Print Packet</Button>
      </div>

      <div className="border-b pb-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Vendor Packet for {supplier?.name}</div>
        <h1 className="text-2xl font-bold tracking-tight font-mono mt-1">{order.orderNumber}</h1>
        <div className="text-sm text-muted-foreground mt-1">Created {new Date(order.createdAt).toLocaleString()}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />Partner</div>
          <div className="font-medium mt-1">{order.partnerName || "—"}</div>
          <div className="text-sm text-muted-foreground mt-1">Onsite contact:</div>
          <div className="text-sm">{order.contactName}</div>
          <div className="text-xs text-muted-foreground">{order.contactEmail}{order.contactPhone ? ` · ${order.contactPhone}` : ""}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Event</div>
          <div className="font-medium mt-1">{order.eventName || "—"}</div>
          <div className="text-sm text-muted-foreground mt-1">{order.cityName || ""}</div>
          {order.eventStartDate && <div className="text-sm">Starts: {new Date(order.eventStartDate).toLocaleDateString()}</div>}
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Ship To</div>
          <div className="font-medium mt-1">{order.venueName || "—"}</div>
          {order.shippingAddressJson && (
            <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
              {[order.shippingAddressJson.street, order.shippingAddressJson.city, order.shippingAddressJson.state, order.shippingAddressJson.postalCode, order.shippingAddressJson.country].filter(Boolean).join("\n")}
            </div>
          )}
        </Card>
      </div>

      {order.vendorNotes && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <div className="text-xs uppercase tracking-wider text-amber-800">Notes from A3</div>
          <div className="text-sm whitespace-pre-wrap mt-1 text-amber-900">{order.vendorNotes}</div>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="font-semibold text-lg mb-3">Your Items ({items.length})</h2>
        <div className="space-y-3">
          {items.map((it: VItem) => {
            const prod = it.productId ? productsById.get(it.productId) : null;
            const specs = it.productId ? assetsByProduct.get(it.productId) || [] : [];
            return (
              <div key={it.id} className={`border rounded-lg p-3 print:break-inside-avoid ${it.exceptionFlag ? "border-red-300 bg-red-50/30" : ""}`}>
                <div className="flex items-start gap-3">
                  {prod?.imageUrl ? <img src={prod.imageUrl} className="h-16 w-16 rounded object-cover bg-muted shrink-0" alt="" /> : <div className="h-16 w-16 rounded bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">Qty {it.quantity}{it.printDemandQuantity ? ` · Print ${it.printDemandQuantity}` : ""}{it.hardwareDemandQuantity ? ` · HW ${it.hardwareDemandQuantity}` : ""}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${STATUS_TONE[it.supplierStatus] || ""}`}>{STATUS_LABEL[it.supplierStatus] || it.supplierStatus}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {it.supplierDueDate && <Badge variant="outline" className="text-[10px]">Due {new Date(it.supplierDueDate).toLocaleDateString()}</Badge>}
                      {it.supplierReference && <Badge variant="outline" className="text-[10px]">Ref: {it.supplierReference}</Badge>}
                      {it.artworkFileUrl && <a href={it.artworkFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:underline"><FileText className="h-2.5 w-2.5" />Artwork</a>}
                      {specs.map(s => (
                        <a key={s.id} href={s.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:underline">
                          <FileText className="h-2.5 w-2.5" />{s.name}{s.version ? ` v${s.version}` : ""}
                        </a>
                      ))}
                    </div>
                    {it.notes && <div className="text-xs text-muted-foreground mt-2 italic">Note: {it.notes}</div>}
                    {it.supplierNotes && <div className="text-xs text-muted-foreground mt-1">A3 note: {it.supplierNotes}</div>}
                    {(VENDOR_NEXT[it.supplierStatus] || []).length > 0 && (
                      <div className="mt-2 no-print flex items-center gap-1 flex-wrap">
                        {(VENDOR_NEXT[it.supplierStatus] || []).map(s => (
                          <Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => update.mutate({ itemId: it.id, status: s })}>
                            → {STATUS_LABEL[s]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
