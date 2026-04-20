import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft, Save, Printer, ShoppingCart, MapPin, Calendar, Truck, User, Building2, FileText, Image as ImageIcon, AlertTriangle, Package, Boxes, Printer as PrintIcon } from "lucide-react";

type OrderItem = {
  id: number; itemType: string; productId: number | null; productName?: string | null; productImageUrl?: string | null;
  packageId: number | null; packageName?: string | null; brandingZoneId: number | null; brandingZoneName?: string | null;
  name: string; quantity: number; unitPrice: string | null; fulfillmentMode: string | null;
  hardwareRequired: boolean | null; printDemandQuantity: number | null; hardwareDemandQuantity: number | null;
  reservedQuantity: number | null; shortageQuantity: number | null;
  inventorySourceCityId: number | null; inventorySourceInventoryId: number | null; inventoryReservationId: number | null;
  internalFulfillmentNotes: string | null;
  artworkFileUrl: string | null; notes: string | null;
};
type OrderFull = { id: number; orderNumber: string; partnerId: number; partnerName?: string; eventId: number | null; eventName?: string; status: string; paymentStatus: string; fulfillmentMode: string | null; assignedSupplierId: number | null; supplierName?: string; contactName: string; contactEmail: string; contactPhone: string | null; companyName: string | null; shippingAddressJson: any; billingAddressJson: any; artworkFilesJson: any[] | null; totalEstimate: string | null; notes: string | null; internalNotes: string | null; vendorNotes: string | null; fulfillmentStatus: string | null; createdAt: string; items: OrderItem[]; partner?: any; event?: any; venue?: any; supplier?: any };
type Supplier = { id: number; name: string };
type City = { id: number; name: string };

const MODE_LABELS: Record<string, string> = {
  full: "Full (hardware + print)",
  graphic_only: "Graphic only (print)",
  use_existing_partner_inventory: "Use partner inventory",
  rental_plus_print: "Rental + print",
  new_hardware_required: "New hardware",
  client_owned_plus_print: "Client-owned + print",
};

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: order, isLoading, isError } = useQuery<OrderFull>({ queryKey: [`/api/orders/${id}`], queryFn: () => apiFetch(`/api/orders/${id}`) });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities") });
  const [internal, setInternal] = useState({ status: "", paymentStatus: "", assignedSupplierId: "", internalNotes: "", vendorNotes: "", fulfillmentStatus: "", totalEstimate: "" });

  useEffect(() => {
    if (order) {
      setInternal({
        status: order.status, paymentStatus: order.paymentStatus,
        assignedSupplierId: order.assignedSupplierId?.toString() || "",
        internalNotes: order.internalNotes || "", vendorNotes: order.vendorNotes || "",
        fulfillmentStatus: order.fulfillmentStatus || "", totalEstimate: order.totalEstimate || "",
      });
    }
  }, [order?.id]);

  const update = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/orders/${id}`] }); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError || !order) return <div className="py-24 text-center text-muted-foreground">Could not load this order. <Link href="/admin/orders"><Button variant="link">Back to orders</Button></Link></div>;

  const handleSave = () => {
    update.mutate({
      status: internal.status,
      paymentStatus: internal.paymentStatus,
      assignedSupplierId: internal.assignedSupplierId ? parseInt(internal.assignedSupplierId) : null,
      internalNotes: internal.internalNotes,
      vendorNotes: internal.vendorNotes,
      fulfillmentStatus: internal.fulfillmentStatus || null,
      totalEstimate: internal.totalEstimate || null,
    });
  };

  const cityName = (cid: number | null) => cities.find(c => c.id === cid)?.name || `City #${cid}`;

  const totalShortage = order.items.reduce((s, it) => s + (it.shortageQuantity || 0), 0);
  const totalReserved = order.items.reduce((s, it) => s + (it.reservedQuantity || 0), 0);
  const totalPrint = order.items.reduce((s, it) => s + (it.printDemandQuantity || 0), 0);
  const totalHardware = order.items.reduce((s, it) => s + (it.hardwareDemandQuantity || 0), 0);

  return (
    <div className="space-y-6 print:space-y-3">
      <style>{`@media print { @page { margin: 1.5cm; } body { background: white !important; } header, .no-print, button { display: none !important; } main { padding: 0 !important; max-width: 100% !important; } .print\\:break-inside-avoid { break-inside: avoid; } .lg\\:col-span-2 { grid-column: span 3 / span 3 !important; } aside, .lg\\:grid-cols-3 > div:last-child { display: none !important; } }`}</style>
      <div className="flex items-center justify-between no-print">
        <div>
          <Link href="/admin/orders"><Button variant="ghost" size="sm" className="gap-1 -ml-3 mb-2"><ChevronLeft className="h-4 w-4" />Back to orders</Button></Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{order.orderNumber}</h1>
            <Badge>{order.status}</Badge>
            <Badge variant="outline">{order.paymentStatus}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{order.partnerName} · {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <Button variant="outline" className="gap-2 no-print" onClick={() => window.print()}><Printer className="h-4 w-4" />Print Packet</Button>
      </div>

      {totalShortage > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900">Inventory shortage on this order</h3>
            <p className="text-sm text-amber-800 mt-0.5">{totalShortage} unit{totalShortage > 1 ? "s" : ""} could not be reserved from existing partner inventory. Either source new hardware, swap to a different fulfillment mode, or restock the source city.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><PrintIcon className="h-3.5 w-3.5" /> Print demand</div><div className="text-2xl font-bold tabular-nums mt-1">{totalPrint}</div></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" /> Hardware demand</div><div className="text-2xl font-bold tabular-nums mt-1">{totalHardware}</div></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Reserved from inventory</div><div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">{totalReserved}</div></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Shortage</div><div className={`text-2xl font-bold tabular-nums mt-1 ${totalShortage > 0 ? "text-amber-600" : ""}`}>{totalShortage}</div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-muted-foreground" />Items ({order.items.length})</h2>
            <div className="space-y-3">
              {order.items.map(it => (
                <div key={it.id} className="border rounded-lg p-3 print:break-inside-avoid">
                  <div className="flex items-start gap-3">
                    {it.productImageUrl ? <img src={it.productImageUrl} className="h-14 w-14 rounded object-cover bg-muted shrink-0" alt="" /> : <div className="h-14 w-14 rounded bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{it.itemType.replace("_", " ")}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold">{it.quantity}x</div>
                          {it.unitPrice && <div className="text-xs text-muted-foreground">${it.unitPrice}</div>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {it.fulfillmentMode && <Badge variant="outline" className="text-[10px]">{MODE_LABELS[it.fulfillmentMode] || it.fulfillmentMode}</Badge>}
                        {(it.printDemandQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700">Print: {it.printDemandQuantity}</Badge>}
                        {(it.hardwareDemandQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">Hardware: {it.hardwareDemandQuantity}</Badge>}
                        {(it.reservedQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">Reserved: {it.reservedQuantity}{it.inventoryReservationId && ` (#${it.inventoryReservationId})`}</Badge>}
                        {(it.shortageQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">Shortage: {it.shortageQuantity}</Badge>}
                        {it.inventorySourceCityId && <Badge variant="outline" className="text-[10px]"><MapPin className="h-2.5 w-2.5 mr-0.5" />Source: {cityName(it.inventorySourceCityId)}</Badge>}
                        {it.artworkFileUrl && <Badge variant="secondary" className="text-[10px]">artwork</Badge>}
                      </div>

                      {it.productId && <ProductSpecRefs productId={it.productId} />}

                      {it.notes && <div className="text-xs text-muted-foreground mt-2 italic">Client note: {it.notes}</div>}
                      {it.internalFulfillmentNotes && <div className="text-xs text-muted-foreground mt-1">Internal: {it.internalFulfillmentNotes}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-muted-foreground" />Artwork & Files</h2>
            <div className="space-y-2">
              {(order.artworkFilesJson || []).map((f: any, i: number) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="h-4 w-4" />{f.name || f.url}</a>
              ))}
              {(!order.artworkFilesJson || order.artworkFilesJson.length === 0) && <p className="text-sm text-muted-foreground">No artwork uploaded.</p>}
            </div>
          </Card>

          {order.notes && <Card className="p-5"><h2 className="font-semibold text-lg mb-2">Client Notes</h2><p className="text-sm whitespace-pre-wrap">{order.notes}</p></Card>}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />Contact</h2>
            <div className="space-y-1 text-sm">
              <div className="font-medium">{order.contactName}</div>
              {order.companyName && <div className="text-muted-foreground">{order.companyName}</div>}
              <div className="text-muted-foreground">{order.contactEmail}</div>
              {order.contactPhone && <div className="text-muted-foreground">{order.contactPhone}</div>}
            </div>
          </Card>

          {order.event && <Card className="p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Event</h2>
            <div className="space-y-1 text-sm">
              <div className="font-medium">{order.event.name}</div>
              {order.event.eventStartDate && <div className="text-muted-foreground">Event: {order.event.eventStartDate}</div>}
              {order.event.installDate && <div className="text-muted-foreground">Install: {order.event.installDate}</div>}
              {order.event.shippingDeadline && <div className="text-amber-600">Ship by: {order.event.shippingDeadline}</div>}
            </div>
          </Card>}

          {order.venue && <Card className="p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />Venue</h2>
            <div className="space-y-1 text-sm">
              <div className="font-medium">{order.venue.name}</div>
              {order.venue.shippingAddress && <div className="text-muted-foreground"><MapPin className="h-3 w-3 inline mr-1" />{order.venue.shippingAddress}</div>}
              {order.venue.onsiteContactName && <div className="text-xs text-muted-foreground mt-2">Onsite: {order.venue.onsiteContactName} · {order.venue.onsiteContactPhone}</div>}
              {order.venue.installNotes && <div className="text-xs text-muted-foreground mt-1 italic">{order.venue.installNotes}</div>}
            </div>
          </Card>}

          <Card className="p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />Internal Management</h2>
            <div className="space-y-3">
              <div><Label className="text-xs">Status</Label>
                <Select value={internal.status} onValueChange={v => setInternal({ ...internal, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["new","approved","in_production","shipped","delivered","completed","cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-xs">Payment</Label>
                <Select value={internal.paymentStatus} onValueChange={v => setInternal({ ...internal, paymentStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["not_charged","invoiced","paid","refunded"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-xs">Assigned Supplier</Label>
                <Select value={internal.assignedSupplierId || "0"} onValueChange={v => setInternal({ ...internal, assignedSupplierId: v === "0" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Unassigned</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-xs">Total Estimate</Label><Input value={internal.totalEstimate} onChange={e => setInternal({ ...internal, totalEstimate: e.target.value })} placeholder="0.00" /></div>
              <div><Label className="text-xs">Fulfillment Status</Label><Input value={internal.fulfillmentStatus} onChange={e => setInternal({ ...internal, fulfillmentStatus: e.target.value })} placeholder="In production / Shipped / etc." /></div>
              <div><Label className="text-xs">Internal Notes</Label><Textarea value={internal.internalNotes} onChange={e => setInternal({ ...internal, internalNotes: e.target.value })} rows={3} /></div>
              <div><Label className="text-xs">Vendor Notes (visible to vendor)</Label><Textarea value={internal.vendorNotes} onChange={e => setInternal({ ...internal, vendorNotes: e.target.value })} rows={2} /></div>
              <Button onClick={handleSave} disabled={update.isPending} className="w-full gap-2">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProductSpecRefs({ productId }: { productId: number }) {
  const { data: refs = [] } = useQuery<any[]>({ queryKey: [`/api/quote-assets`, "product", productId], queryFn: () => apiFetch(`/api/quote-assets?attachableType=product&attachableId=${productId}`) });
  const approved = refs.filter(r => r.isApprovedStandard);
  const visible = approved.length ? approved : refs.slice(0, 2);
  if (!visible.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map(r => (
        <a key={r.id} href={r.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:underline">
          <FileText className="h-2.5 w-2.5" />{r.name}{r.version && ` v${r.version}`}
        </a>
      ))}
    </div>
  );
}
