import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, ChevronLeft, FileText, Image as ImageIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

type PacketAsset = { linkId: number; role: string; asset: any };

type Packet = {
  order: any; partner: any; event: any; supplier: any;
  items: Array<{
    itemId: number; name: string; productName: string | null; quantity: number;
    fulfillmentMode: string | null; supplierStatus: string;
    supplierDueDate: string | null; supplierShipDate: string | null; supplierInstallDate: string | null;
    internalFulfillmentNotes: string | null; productionBlockedReason: string | null;
    assets: PacketAsset[]; flags: string[]; ready: boolean;
  }>;
  orderLevelAssets: any[];
  summary: { totalItems: number; ready: number; blocked: number };
};

function fileLink(url: string) {
  if (url.startsWith("http")) return url;
  return `/api/storage${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function SupplierPacket() {
  const params = useParams<{ orderId: string; supplierId: string }>();
  const orderId = parseInt(params.orderId);
  const supplierId = parseInt(params.supplierId);
  const { data, isLoading, isError } = useQuery<Packet>({
    queryKey: [`/api/orders/${orderId}/supplier-packet/${supplierId}`],
    queryFn: () => apiFetch(`/api/orders/${orderId}/supplier-packet/${supplierId}`),
  });

  return (
    <div className="space-y-4 print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/admin/orders/${orderId}`}>
            <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" /> Back to order</Button>
          </Link>
          <Button onClick={() => window.print()} variant="outline" size="sm"><Printer className="h-4 w-4 mr-1" /> Print packet</Button>
        </div>
        {isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Loading packet…</Card>
        ) : isError || !data ? (
          <Card className="p-8 text-center text-red-600">Failed to load packet</Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold">Production Packet · {data.supplier?.name}</h1>
                  <p className="text-sm text-muted-foreground mt-1">Order {data.order.orderNumber} · {data.partner?.companyName}</p>
                  {data.event && <p className="text-sm text-muted-foreground">Event: {data.event.name}{data.event.startDate ? ` · ${new Date(data.event.startDate).toLocaleDateString()}` : ""}</p>}
                </div>
                <div className="flex gap-2">
                  <Badge className={data.summary.blocked === 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                    {data.summary.ready}/{data.summary.totalItems} ready
                  </Badge>
                  {data.summary.blocked > 0 && <Badge className="bg-red-100 text-red-800">{data.summary.blocked} blocked</Badge>}
                </div>
              </div>
              {data.order.vendorNotes && (
                <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-sm">
                  <strong>Vendor notes:</strong> {data.order.vendorNotes}
                </div>
              )}
            </Card>

            {data.orderLevelAssets.length > 0 && (
              <Card className="p-4">
                <h2 className="font-semibold mb-3">Order-level assets</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.orderLevelAssets.map((a: any) => (
                    <a key={a.id} href={fileLink(a.fileUrl)} target="_blank" rel="noreferrer" className="p-2 border rounded hover:bg-muted/40 flex items-center gap-2">
                      {a.mimeType?.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="text-sm truncate">{a.title}</span>
                      <Badge variant="outline" className="ml-auto">v{a.version}</Badge>
                    </a>
                  ))}
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {data.items.map(it => (
                <Card key={it.itemId} className={`p-4 ${it.ready ? "" : "border-red-300"}`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{it.name}</h3>
                        <Badge variant="outline">×{it.quantity}</Badge>
                        {it.fulfillmentMode && <Badge variant="secondary">{it.fulfillmentMode.replace(/_/g," ")}</Badge>}
                      </div>
                      {it.productName && <p className="text-xs text-muted-foreground mt-0.5">{it.productName}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {it.ready ? (
                        <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />Ready</Badge>
                      ) : (
                        it.flags.map(f => <Badge key={f} className="bg-red-100 text-red-800"><AlertTriangle className="h-3 w-3 mr-1" />{f.replace(/_/g," ")}</Badge>)
                      )}
                    </div>
                  </div>
                  {(it.supplierDueDate || it.supplierShipDate || it.supplierInstallDate) && (
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                      {it.supplierDueDate && <span>Due: {new Date(it.supplierDueDate).toLocaleDateString()}</span>}
                      {it.supplierShipDate && <span>Ship: {new Date(it.supplierShipDate).toLocaleDateString()}</span>}
                      {it.supplierInstallDate && <span>Install: {new Date(it.supplierInstallDate).toLocaleDateString()}</span>}
                    </div>
                  )}
                  {it.internalFulfillmentNotes && (
                    <div className="mt-2 text-sm p-2 rounded bg-muted/40">{it.internalFulfillmentNotes}</div>
                  )}
                  {it.productionBlockedReason && (
                    <div className="mt-2 text-sm p-2 rounded bg-red-50 border border-red-200 text-red-900">
                      <strong>Blocked:</strong> {it.productionBlockedReason}
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Assets</p>
                    {it.assets.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No vendor-released assets — contact A3 if you need files.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {it.assets.map(l => l.asset && (
                          <a key={l.linkId} href={fileLink(l.asset.fileUrl)} target="_blank" rel="noreferrer" className="p-2 border rounded hover:bg-muted/40 flex items-center gap-2">
                            {l.asset.mimeType?.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{l.asset.title}</p>
                              <p className="text-[11px] text-muted-foreground">{l.role?.replace(/_/g," ")} · v{l.asset.version}</p>
                            </div>
                            <Badge className="bg-emerald-100 text-emerald-800 shrink-0">approved</Badge>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
    </div>
  );
}
