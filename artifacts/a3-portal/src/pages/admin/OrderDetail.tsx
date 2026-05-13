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
import { Loader2, ChevronLeft, Save, Printer, ShoppingCart, MapPin, Calendar, Truck, User, Building2, FileText, Image as ImageIcon, AlertTriangle, Package, Boxes, Printer as PrintIcon, FolderOpen } from "lucide-react";
import OrderAssetsPanel from "@/components/admin/OrderAssetsPanel";
import TaskPanel from "@/components/admin/TaskPanel";
import OrderEmailDeliveryPanel from "@/components/admin/OrderEmailDeliveryPanel";
import OrderInternalIntakePanel from "@/components/admin/OrderInternalIntakePanel";
import OrderExceptionPanel from "@/components/admin/OrderExceptionPanel";
import EntityAlertsPanel from "@/components/admin/EntityAlertsPanel";
import { formatMoney, SUPPORTED_CURRENCIES, TAX_MODES, TAX_MODE_LABELS } from "@/lib/currency";

/**
 * Compact currency + tax breakdown / override block for an order.
 * Shows the snapshotted subtotal/tax/total in the order's resolved currency,
 * plus inheritance source badges, and lets admins override the resolved
 * currency/tax fields. PATCH posts the override fields; the server re-resolves
 * inheritance, recomputes totals, and updates currencySource/taxModeSource.
 */
function CurrencyTaxBreakdown({ order, onSave, saving }: { order: any; onSave: (patch: any) => void; saving?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({
    currency: order.currency || "USD",
    taxMode: order.taxMode || "none",
    taxLabel: order.taxLabel || "",
    taxRate: order.taxRate ?? "",
    taxInclusive: !!order.taxInclusive,
  });
  useEffect(() => {
    setDraft({
      currency: order.currency || "USD",
      taxMode: order.taxMode || "none",
      taxLabel: order.taxLabel || "",
      taxRate: order.taxRate ?? "",
      taxInclusive: !!order.taxInclusive,
    });
  }, [order.id, order.currency, order.taxMode, order.taxRate, order.taxInclusive, order.taxLabel]);
  const cur = order.currency || "USD";
  const subtotal = order.subtotal;
  const taxAmount = order.taxAmount;
  const taxRate = Number(order.taxRate ?? 0);
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing breakdown</div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px]">{cur}</Badge>
          {order.currencySource && order.currencySource !== "partner" && <Badge variant="secondary" className="text-[10px]">currency: {order.currencySource}</Badge>}
          {order.taxModeSource && order.taxModeSource !== "partner" && <Badge variant="secondary" className="text-[10px]">tax: {order.taxModeSource}</Badge>}
        </div>
      </div>
      <div className="text-xs space-y-0.5">
        {subtotal != null && (<div className="flex justify-between"><span className="text-muted-foreground">{order.taxInclusive ? "Net subtotal" : "Subtotal"}</span><span>{formatMoney(subtotal, cur)}</span></div>)}
        {taxAmount != null && Number(taxAmount) !== 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{order.taxLabel || "Tax"}{taxRate > 0 ? ` (${taxRate}%${order.taxInclusive ? ", incl." : ""})` : ""}</span>
            <span>{formatMoney(taxAmount, cur)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{formatMoney(order.totalEstimate ?? 0, cur)} {cur}</span></div>
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} className="text-[11px] text-primary hover:underline">{open ? "Hide override" : "Override currency / tax"}</button>
      {open && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div><Label className="text-[10px]">Currency</Label>
            <Select value={draft.currency} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-[10px]">Tax mode</Label>
            <Select value={draft.taxMode} onValueChange={(v) => setDraft({ ...draft, taxMode: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{TAX_MODES.map(m => <SelectItem key={m} value={m}>{TAX_MODE_LABELS[m]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-[10px]">Tax label</Label><Input className="h-8 text-xs" value={draft.taxLabel} onChange={e => setDraft({ ...draft, taxLabel: e.target.value })} placeholder="VAT, GST…" /></div>
          <div><Label className="text-[10px]">Tax rate %</Label><Input className="h-8 text-xs" value={draft.taxRate} onChange={e => setDraft({ ...draft, taxRate: e.target.value })} placeholder="e.g. 20" /></div>
          <label className="col-span-2 flex items-center gap-2 text-[11px]"><input type="checkbox" checked={!!draft.taxInclusive} onChange={e => setDraft({ ...draft, taxInclusive: e.target.checked })} />Prices are tax-inclusive</label>
          <Button size="sm" disabled={saving} className="col-span-2 h-7 text-xs" onClick={() => onSave({ currency: draft.currency, taxMode: draft.taxMode, taxLabel: draft.taxLabel || null, taxRate: draft.taxRate === "" ? null : String(draft.taxRate), taxInclusive: !!draft.taxInclusive })}>Apply override &amp; recalc</Button>
        </div>
      )}
    </div>
  );
}
import { formatWxHDual, formatPrimarySecondary, formatWeight, pickDisplayWeightUnit, convertWeight, defaultWeightUnit, type UnitSystem, type WeightUnit, type LengthUnit } from "@/lib/units";
import { PackingDetailsInput, type PackingDetailsValue, type PackingMode } from "@/components/units/PackingDetailsInput";
import { WeightInput, type WeightValue } from "@/components/units/WeightInput";
import type { Order as SchemaOrder, OrderItem as SchemaOrderItem, Supplier as SchemaSupplier, City as SchemaCity } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";

// Source row shapes from the shared Drizzle schema so renamed/removed columns
// surface as type errors instead of silently breaking the editor. SerializedRow
// converts Drizzle Date columns to the ISO strings the API actually returns;
// extra fields below are display-only joins not in the order_items table.
type OrderItem = SerializedRow<SchemaOrderItem> & {
  productName?: string | null;
  productImageUrl?: string | null;
  packageName?: string | null;
  brandingZoneName?: string | null;
  assignedSupplierName: string | null;
};

const SUPPLIER_STATUSES = [
  "unassigned", "assigned", "acknowledged", "in_production", "awaiting_assets",
  "awaiting_approval", "shipped", "delivered", "installed", "completed",
  "issue_flagged", "cancelled",
] as const;
const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned", assigned: "Assigned", acknowledged: "Acknowledged",
  in_production: "In Production", awaiting_assets: "Awaiting Assets",
  awaiting_approval: "Awaiting Approval", shipped: "Shipped",
  delivered: "Delivered", installed: "Installed", completed: "Completed",
  issue_flagged: "Issue", cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  unassigned: "bg-zinc-100 text-zinc-700", assigned: "bg-blue-100 text-blue-800",
  acknowledged: "bg-indigo-100 text-indigo-800", in_production: "bg-amber-100 text-amber-800",
  awaiting_assets: "bg-orange-100 text-orange-800", awaiting_approval: "bg-purple-100 text-purple-800",
  shipped: "bg-cyan-100 text-cyan-800", delivered: "bg-emerald-100 text-emerald-800",
  installed: "bg-emerald-200 text-emerald-900", completed: "bg-emerald-600 text-white",
  issue_flagged: "bg-red-100 text-red-800", cancelled: "bg-zinc-200 text-zinc-600 line-through",
};
const SOURCE_LABEL: Record<string, string> = {
  product: "Inherited from product", package: "Inherited from package",
  zone: "Inherited from zone", order: "Inherited from order",
  manual: "Manually assigned", none: "Unassigned",
};
type OrderFull = Omit<SerializedRow<SchemaOrder>, "measurementSystem"> & {
  measurementSystem: "imperial" | "metric" | null;
  partnerName?: string;
  eventName?: string;
  supplierName?: string;
  items: OrderItem[];
  partner?: any;
  event?: any;
  venue?: any;
  supplier?: any;
  partnerContacts?: Array<{ id: number; role: string; fullName: string; email: string | null; phone: string | null; isPrimary: boolean; isActive: boolean }>;
};
type Supplier = Pick<SchemaSupplier, "id" | "name">;
type City = Pick<SchemaCity, "id" | "name">;

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
  const [logistics, setLogistics] = useState<{
    shipDateTarget: string; deliveryByDate: string;
    packageCount: string;
    totalShipmentWeight: number | null; totalShipmentWeightUnit: WeightUnit;
    measurementSystem: "imperial" | "metric";
    oversizeFlag: boolean; crateRequired: boolean; palletRequired: boolean;
    customsNotes: string; internationalShippingNotes: string; logisticsNotes: string;
    shippingContactName: string; shippingContactPhone: string; shippingContactEmail: string;
    receivingContactName: string; receivingContactPhone: string; receivingContactEmail: string;
  }>({
    shipDateTarget: "", deliveryByDate: "", packageCount: "",
    totalShipmentWeight: null, totalShipmentWeightUnit: "lb",
    measurementSystem: "imperial",
    oversizeFlag: false, crateRequired: false, palletRequired: false,
    customsNotes: "", internationalShippingNotes: "", logisticsNotes: "",
    shippingContactName: "", shippingContactPhone: "", shippingContactEmail: "",
    receivingContactName: "", receivingContactPhone: "", receivingContactEmail: "",
  });

  useEffect(() => {
    if (order) {
      setInternal({
        status: order.status, paymentStatus: order.paymentStatus,
        assignedSupplierId: order.assignedSupplierId?.toString() || "",
        internalNotes: order.internalNotes || "", vendorNotes: order.vendorNotes || "",
        fulfillmentStatus: order.fulfillmentStatus || "", totalEstimate: order.totalEstimate || "",
      });
      const sys = (order.measurementSystem || "imperial") as "imperial" | "metric";
      const sc = order.shippingContactJson || {};
      const rc = order.receivingContactJson || {};
      setLogistics({
        shipDateTarget: order.shipDateTarget ? order.shipDateTarget.slice(0, 10) : "",
        deliveryByDate: order.deliveryByDate ? order.deliveryByDate.slice(0, 10) : "",
        packageCount: order.packageCount != null ? String(order.packageCount) : "",
        totalShipmentWeight: order.totalShipmentWeight != null ? Number(order.totalShipmentWeight) : null,
        totalShipmentWeightUnit: ((order.totalShipmentWeightUnit as WeightUnit) || defaultWeightUnit(sys)),
        measurementSystem: sys,
        oversizeFlag: !!order.oversizeFlag, crateRequired: !!order.crateRequired, palletRequired: !!order.palletRequired,
        customsNotes: order.customsNotes || "",
        internationalShippingNotes: order.internationalShippingNotes || "",
        logisticsNotes: order.logisticsNotes || "",
        shippingContactName: sc.name || "", shippingContactPhone: sc.phone || "", shippingContactEmail: sc.email || "",
        receivingContactName: rc.name || "", receivingContactPhone: rc.phone || "", receivingContactEmail: rc.email || "",
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

  const handleSaveLogistics = () => {
    const sc = {
      name: logistics.shippingContactName || null,
      phone: logistics.shippingContactPhone || null,
      email: logistics.shippingContactEmail || null,
    };
    const rc = {
      name: logistics.receivingContactName || null,
      phone: logistics.receivingContactPhone || null,
      email: logistics.receivingContactEmail || null,
    };
    update.mutate({
      shipDateTarget: logistics.shipDateTarget || null,
      deliveryByDate: logistics.deliveryByDate || null,
      packageCount: logistics.packageCount ? parseInt(logistics.packageCount) : null,
      totalShipmentWeight: logistics.totalShipmentWeight,
      totalShipmentWeightUnit: logistics.totalShipmentWeightUnit,
      measurementSystem: logistics.measurementSystem,
      oversizeFlag: logistics.oversizeFlag,
      crateRequired: logistics.crateRequired,
      palletRequired: logistics.palletRequired,
      customsNotes: logistics.customsNotes || null,
      internationalShippingNotes: logistics.internationalShippingNotes || null,
      logisticsNotes: logistics.logisticsNotes || null,
      shippingContactJson: (sc.name || sc.phone || sc.email) ? sc : null,
      receivingContactJson: (rc.name || rc.phone || rc.email) ? rc : null,
    });
  };

  const itemsRollup = (() => {
    if (!order) return null;
    let totalG = 0; let knownWeight = 0;
    let crate = false, pallet = false, oversize = false;
    let cartonTotal = 0;
    for (const it of order.items) {
      if (it.crateRequired) crate = true;
      if (it.palletRequired) pallet = true;
      if (it.oversizeFlag) oversize = true;
      cartonTotal += (it.cartonCount ?? 0) * (it.quantity ?? 1);
      if (it.shippingWeight != null && it.shippingWeightUnit) {
        const grams = convertWeight(it.shippingWeight, it.shippingWeightUnit as WeightUnit, "g");
        totalG += grams * (it.cartonCount ?? 1) * (it.quantity ?? 1);
        knownWeight += 1;
      }
    }
    return { totalG, knownWeight, crate, pallet, oversize, cartonTotal };
  })();

  const cityName = (cid: number | null) => cities.find(c => c.id === cid)?.name || `City #${cid}`;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const bulkAssign = useMutation({
    mutationFn: ({ supplierId }: { supplierId: number | null }) =>
      apiFetch(`/api/orders/${id}/bulk-assign-supplier`, { method: "POST", body: JSON.stringify({ itemIds: Array.from(selected), supplierId, source: "manual" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/orders/${id}`] }); setSelected(new Set()); toast({ title: "Bulk assignment applied" }); },
    onError: (e: any) => toast({ title: "Bulk assignment failed", description: e.message, variant: "destructive" }),
  });

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
        <div className="flex gap-2 no-print">
          <Button variant="outline" className="gap-2" onClick={() => window.open(`/api/exports/orders/${id}/packet.html`, "_blank")}><Printer className="h-4 w-4" />Ops Packet</Button>
          {order.assignedSupplierId && <Button variant="outline" className="gap-2" onClick={() => window.open(`/api/exports/orders/${id}/packet.html?supplierId=${order.assignedSupplierId}`, "_blank")}><Truck className="h-4 w-4" />Supplier Packet</Button>}
        </div>
      </div>

      {/* Branded order summary PDFs — preview opens inline; download forces save. */}
      <Card className="p-4 no-print">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Order summary PDF</div>
            <div className="text-xs text-muted-foreground">Branded one-pager. Customer version hides pricing/supplier; internal includes everything; finance is billing-focused.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/orders/${id}/summary-pdf?audience=customer`, "_blank")}>Preview customer</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/orders/${id}/summary-pdf?audience=internal`, "_blank")}>Preview internal</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/orders/${id}/summary-pdf?audience=finance`, "_blank")}>Preview finance</Button>
            <Button size="sm" variant="ghost" onClick={() => window.open(`/api/orders/${id}/summary-pdf?audience=internal&download=1`, "_blank")}>Download</Button>
          </div>
        </div>
      </Card>

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
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="font-semibold text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-muted-foreground" />Items ({order.items.length})</h2>
              {selected.size > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{selected.size} selected</span>
                  <Select onValueChange={(v) => bulkAssign.mutate({ supplierId: v === "0" ? null : parseInt(v) })}>
                    <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Bulk assign supplier…" /></SelectTrigger>
                    <SelectContent><SelectItem value="0">Unassign</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {order.items.map(it => (
                <div key={it.id} className={`border rounded-lg p-3 print:break-inside-avoid ${it.exceptionFlag ? "border-red-300 bg-red-50/30" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 no-print" checked={selected.has(it.id)} onChange={() => { const n = new Set(selected); n.has(it.id) ? n.delete(it.id) : n.add(it.id); setSelected(n); }} />
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
                      {(it as any).calculationBasis && (
                        <div className="text-[11px] font-mono mt-1 text-muted-foreground">
                          Pricing: {(it as any).calculationBasis}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {it.fulfillmentMode && <Badge variant="outline" className="text-[10px]">{MODE_LABELS[it.fulfillmentMode] || it.fulfillmentMode}</Badge>}
                        {(it.printDemandQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700">Print: {it.printDemandQuantity}</Badge>}
                        {(it.hardwareDemandQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">Hardware: {it.hardwareDemandQuantity}</Badge>}
                        {(it.reservedQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">Reserved: {it.reservedQuantity}{it.inventoryReservationId && ` (#${it.inventoryReservationId})`}</Badge>}
                        {(it.shortageQuantity ?? 0) > 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">Shortage: {it.shortageQuantity}</Badge>}
                        {it.inventorySourceCityId && <Badge variant="outline" className="text-[10px]"><MapPin className="h-2.5 w-2.5 mr-0.5" />Source: {cityName(it.inventorySourceCityId)}</Badge>}
                        {it.artworkFileUrl && <Badge variant="secondary" className="text-[10px]">artwork</Badge>}
                      </div>

                      {it.productId && <ItemSpecsLine productId={it.productId} partnerId={order.partnerId} />}
                      {it.productId && <ProductSpecRefs productId={it.productId} />}

                      <ItemSupplierControls item={it} orderId={id} suppliers={suppliers} />

                      {it.notes && <div className="text-xs text-muted-foreground mt-2 italic">Client note: {it.notes}</div>}
                      {it.internalFulfillmentNotes && <div className="text-xs text-muted-foreground mt-1">Internal: {it.internalFulfillmentNotes}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card id="files" className="p-5">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2"><FolderOpen className="h-5 w-5 text-muted-foreground" />Production Assets</h2>
            <OrderAssetsPanel orderId={order.id} partnerId={order.partnerId} eventId={order.eventId} />
            <TaskPanel orderId={order.id} partnerId={order.partnerId} eventId={order.eventId ?? undefined} supplierId={order.assignedSupplierId ?? undefined} />
            {order.artworkFilesJson && order.artworkFilesJson.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Legacy attachments</p>
                <div className="space-y-1">
                  {order.artworkFilesJson.map((f: any, i: number) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="h-4 w-4" />{f.name || f.url}</a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {order.notes && <Card className="p-5"><h2 className="font-semibold text-lg mb-2">Client Notes</h2><p className="text-sm whitespace-pre-wrap">{order.notes}</p></Card>}

          {(() => {
            // Section 30 — prefer the designated graphic_designer partner contact
            // (primary first, then any active one) over the legacy
            // partner.designContactName/Email columns.
            const designer = (order.partnerContacts || [])
              .filter(c => c.role === "graphic_designer" && c.isActive)
              .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
            return (
              <OrderExceptionPanel
                order={{
                  id: order.id,
                  orderNumber: order.orderNumber,
                  contactEmail: order.contactEmail,
                  contactName: order.contactName,
                  exceptionState: order.exceptionState,
                  exceptionType: order.exceptionType,
                  exceptionMessage: order.exceptionMessage,
                  exceptionUpdatedAt: order.exceptionUpdatedAt,
                  artworkNeededFlag: order.artworkNeededFlag,
                  artworkBrief: order.artworkBrief,
                  artworkContactName: order.artworkContactName,
                  artworkContactEmail: order.artworkContactEmail,
                }}
                partnerDesignContactName={designer?.fullName ?? order.partner?.designContactName}
                partnerDesignContactEmail={designer?.email ?? order.partner?.designContactEmail}
              />
            );
          })()}

          {/* Pass 7 (April 2026) — A3-side intake summary mirroring the
              polished internal ops email. Built from buildA3IntakeAnalysis
              so the inbox view and this panel never disagree. */}
          <OrderInternalIntakePanel orderId={order.id} />

          {/* Section 28 — per-order email delivery timeline. Reads usage_events. */}
          <OrderEmailDeliveryPanel orderId={order.id} />

          {/* Section 32 — derived alerts scoped to this order */}
          <EntityAlertsPanel scope="order" id={order.id} />
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

          {order.partnerContacts && order.partnerContacts.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />Partner Contacts</h2>
              <div className="space-y-2">
                {order.partnerContacts.filter(c => c.isActive).slice(0, 8).map(c => (
                  <div key={c.id} className="text-xs border rounded p-2 bg-muted/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.fullName}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.role.replace(/_/g, " ")}</span>
                      {c.isPrimary && <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-800 border border-amber-200">primary</span>}
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                      {c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
              <div><Label className="text-xs">Total Estimate ({(order as any).currency || "USD"})</Label><Input value={internal.totalEstimate} onChange={e => setInternal({ ...internal, totalEstimate: e.target.value })} placeholder="0.00" /></div>
              <CurrencyTaxBreakdown order={order as any} onSave={(patch) => update.mutate(patch)} saving={update.isPending} />
              <div><Label className="text-xs">Fulfillment Status</Label><Input value={internal.fulfillmentStatus} onChange={e => setInternal({ ...internal, fulfillmentStatus: e.target.value })} placeholder="In production / Shipped / etc." /></div>
              <div><Label className="text-xs">Internal Notes</Label><Textarea value={internal.internalNotes} onChange={e => setInternal({ ...internal, internalNotes: e.target.value })} rows={3} /></div>
              <div><Label className="text-xs">Vendor Notes (visible to vendor)</Label><Textarea value={internal.vendorNotes} onChange={e => setInternal({ ...internal, vendorNotes: e.target.value })} rows={2} /></div>
              <Button onClick={handleSave} disabled={update.isPending} className="w-full gap-2">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />Shipping & Logistics</h2>
              <Select value={logistics.measurementSystem} onValueChange={(v: any) => {
                const sys = v as "imperial" | "metric";
                setLogistics(p => ({ ...p, measurementSystem: sys, totalShipmentWeightUnit: defaultWeightUnit(sys) }));
              }}>
                <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="imperial">Imperial</SelectItem><SelectItem value="metric">Metric</SelectItem></SelectContent>
              </Select>
            </div>
            {itemsRollup && (
              <div className="rounded-md bg-muted/40 border text-xs p-2.5 mb-3 space-y-1">
                <div className="font-medium text-foreground/80">Computed from line items</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                  <div>Cartons (qty × ct):</div><div className="text-foreground tabular-nums">{itemsRollup.cartonTotal || "—"}</div>
                  <div>Total weight ({itemsRollup.knownWeight}/{order.items.length} known):</div>
                  <div className="text-foreground tabular-nums">
                    {itemsRollup.totalG > 0
                      ? formatWeight(convertWeight(itemsRollup.totalG, "g", pickDisplayWeightUnit(itemsRollup.totalG, logistics.measurementSystem)), pickDisplayWeightUnit(itemsRollup.totalG, logistics.measurementSystem))
                      : "—"}
                  </div>
                  <div>Item flags:</div>
                  <div className="text-foreground">
                    {[itemsRollup.crate && "crate", itemsRollup.pallet && "pallet", itemsRollup.oversize && "oversize"].filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Ship date target</Label><Input type="date" value={logistics.shipDateTarget} onChange={e => setLogistics(p => ({ ...p, shipDateTarget: e.target.value }))} /></div>
              <div><Label className="text-xs">Delivery by</Label><Input type="date" value={logistics.deliveryByDate} onChange={e => setLogistics(p => ({ ...p, deliveryByDate: e.target.value }))} /></div>
              <div><Label className="text-xs">Package count</Label><Input type="number" min={0} value={logistics.packageCount} onChange={e => setLogistics(p => ({ ...p, packageCount: e.target.value }))} /></div>
              <WeightInput
                label="Total shipment weight"
                preferredSystem={logistics.measurementSystem}
                value={{ value: logistics.totalShipmentWeight, unit: logistics.totalShipmentWeightUnit }}
                onChange={(w: WeightValue) => setLogistics(p => ({ ...p, totalShipmentWeight: w.value, totalShipmentWeightUnit: w.unit }))}
              />
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={logistics.oversizeFlag} onChange={e => setLogistics(p => ({ ...p, oversizeFlag: e.target.checked }))} />Oversize</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={logistics.crateRequired} onChange={e => setLogistics(p => ({ ...p, crateRequired: e.target.checked }))} />Crate required</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={logistics.palletRequired} onChange={e => setLogistics(p => ({ ...p, palletRequired: e.target.checked }))} />Pallet required</label>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Shipping (sender) contact</div>
                <Input placeholder="Name" value={logistics.shippingContactName} onChange={e => setLogistics(p => ({ ...p, shippingContactName: e.target.value }))} />
                <Input placeholder="Phone" value={logistics.shippingContactPhone} onChange={e => setLogistics(p => ({ ...p, shippingContactPhone: e.target.value }))} />
                <Input placeholder="Email" value={logistics.shippingContactEmail} onChange={e => setLogistics(p => ({ ...p, shippingContactEmail: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Receiving (onsite) contact</div>
                <Input placeholder="Name" value={logistics.receivingContactName} onChange={e => setLogistics(p => ({ ...p, receivingContactName: e.target.value }))} />
                <Input placeholder="Phone" value={logistics.receivingContactPhone} onChange={e => setLogistics(p => ({ ...p, receivingContactPhone: e.target.value }))} />
                <Input placeholder="Email" value={logistics.receivingContactEmail} onChange={e => setLogistics(p => ({ ...p, receivingContactEmail: e.target.value }))} />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div><Label className="text-xs">Logistics notes</Label><Textarea rows={2} value={logistics.logisticsNotes} onChange={e => setLogistics(p => ({ ...p, logisticsNotes: e.target.value }))} placeholder="Carrier preferences, dock access, lift gate, etc." /></div>
              <div><Label className="text-xs">International shipping notes</Label><Textarea rows={2} value={logistics.internationalShippingNotes} onChange={e => setLogistics(p => ({ ...p, internationalShippingNotes: e.target.value }))} placeholder="Incoterms, broker, declared values, etc." /></div>
              <div><Label className="text-xs">Customs notes</Label><Textarea rows={2} value={logistics.customsNotes} onChange={e => setLogistics(p => ({ ...p, customsNotes: e.target.value }))} placeholder="HS codes, country of origin, duty handling…" /></div>
            </div>
            <Button onClick={handleSaveLogistics} disabled={update.isPending} className="w-full mt-3 gap-2">
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save logistics
            </Button>
          </Card>

          <BillingCard orderId={id} />
          <FinancePanel orderId={id} />
        </div>
      </div>
    </div>
  );
}

function BillingCard({ orderId }: { orderId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: resolved } = useQuery<any>({ queryKey: [`/api/billing/orders/${orderId}/resolve`], queryFn: () => apiFetch(`/api/billing/orders/${orderId}/resolve`) });
  const { data: invs = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", "for-order", orderId], queryFn: () => apiFetch(`/api/invoices?orderId=${orderId}`) });
  const inv = invs[0];
  const create = useMutation({
    mutationFn: () => apiFetch(`/api/invoices/from-order/${orderId}`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Invoice created" }); qc.invalidateQueries({ queryKey: ["/api/invoices", "for-order", orderId] }); },
  });
  const override = useMutation({
    mutationFn: (model: string | null) => apiFetch(`/api/billing/orders/${orderId}/override`, { method: "POST", body: JSON.stringify({ billingExecModel: model }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Updated" }); qc.invalidateQueries({ queryKey: [`/api/billing/orders/${orderId}/resolve`] }); },
  });
  const MODELS = ["a3_collected", "alyssa_entity_collected", "manual_invoice", "split_payout", "external_payment_pending"];
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Billing</h3>
        {resolved && <Badge variant="outline" className="text-[10px]">via {resolved.resolved.source}</Badge>}
      </div>
      <div>
        <Label className="text-xs">Billing model</Label>
        <Select value={resolved?.resolved?.model || ""} onValueChange={v => override.mutate(v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>{MODELS.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
        </Select>
        {resolved?.resolved?.source === "order" && <Button size="sm" variant="ghost" className="mt-1 text-xs h-6" onClick={() => override.mutate(null)}>Clear order override</Button>}
      </div>
      {inv ? (
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">{inv.invoiceNumber}</span><Badge>{inv.status}</Badge></div>
          <div className="text-xs text-muted-foreground">Total {inv.totalAmount} • Paid {inv.amountPaid} • Bal {inv.balanceDue}</div>
          <Link href={`/admin/invoices/${inv.id}`}><Button size="sm" variant="outline" className="w-full mt-1">Open invoice</Button></Link>
        </div>
      ) : (
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} className="w-full">Create invoice</Button>
      )}
    </Card>
  );
}

function FinancePanel({ orderId }: { orderId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rec } = useQuery<any>({ queryKey: ["/api/reconciliation/orders", "for-order", orderId], queryFn: async () => {
    const all = await apiFetch<any[]>("/api/reconciliation/orders");
    return all.find(r => r.id === orderId);
  } });
  const { data: payouts = [] } = useQuery<any[]>({ queryKey: [`/api/orders/${orderId}/commission-payouts`], queryFn: () => apiFetch(`/api/orders/${orderId}/commission-payouts`) });
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (rec && !f) setF({
      paymentModel: rec.paymentModel, billingEntity: rec.billingEntity || "",
      supplierEstimatedCost: rec.supplierEstimatedCost || "", supplierFinalCost: rec.supplierFinalCost || "",
      expectedCommission: rec.expectedCommission || "",
      commissionStatus: rec.commissionStatus, supplierPayableStatus: rec.supplierPayableStatus,
      reconciliationStatus: rec.reconciliationStatus,
      financeNotes: rec.financeNotes || "", reconciliationNotes: rec.reconciliationNotes || "",
    });
  }, [rec?.id]);
  const update = useMutation({
    mutationFn: (patch: any) => apiFetch(`/api/reconciliation/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] }); toast({ title: "Finance saved" }); },
  });
  const autoFlag = useMutation({
    mutationFn: () => apiFetch(`/api/reconciliation/orders/${orderId}/auto-flag`, { method: "POST" }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] }); qc.invalidateQueries({ queryKey: ["/api/discrepancies"] }); toast({ title: `Flagged ${res.flaggedCount}` }); },
  });
  if (!rec || !f) return null;
  const money = (v: any) => `$${(parseFloat(v || "0") || 0).toFixed(2)}`;

  return (
    <Card className="p-5 no-print">
      <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />Finance & Reconciliation</h2>
      <div className="rounded-lg bg-muted/40 p-3 mb-3 grid grid-cols-2 gap-2 text-xs">
        <div><div className="text-muted-foreground">Margin</div><div className={`font-bold ${rec.grossMargin < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(rec.grossMargin)}</div></div>
        <div><div className="text-muted-foreground">Commission var.</div><div className={`font-bold ${Math.abs(rec.commissionVariance) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>{money(rec.commissionVariance)}</div></div>
        <div><div className="text-muted-foreground">Open issues</div><div className="font-bold">{rec.openDiscrepancies}</div></div>
        <div><div className="text-muted-foreground">Recon</div><Badge variant="outline" className="text-[10px]">{rec.reconciliationStatus.replace(/_/g, " ")}</Badge></div>
      </div>
      <div className="space-y-3">
        <div><Label className="text-xs">Payment model</Label><Select value={f.paymentModel} onValueChange={v => setF({ ...f, paymentModel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["partner_billed","client_direct","a3_billed","prepaid"].map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Billing entity</Label><Input value={f.billingEntity} onChange={e => setF({ ...f, billingEntity: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Est. supplier cost</Label><Input value={f.supplierEstimatedCost} onChange={e => setF({ ...f, supplierEstimatedCost: e.target.value })} placeholder="0.00" /></div>
          <div><Label className="text-xs">Final supplier cost</Label><Input value={f.supplierFinalCost} onChange={e => setF({ ...f, supplierFinalCost: e.target.value })} placeholder="0.00" /></div>
        </div>
        <div><Label className="text-xs">Expected commission</Label><Input value={f.expectedCommission} onChange={e => setF({ ...f, expectedCommission: e.target.value })} placeholder="0.00" /></div>
        <div><Label className="text-xs">Commission status</Label><Select value={f.commissionStatus} onValueChange={v => setF({ ...f, commissionStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["not_started","expected","partially_paid","paid","disputed","verified"].map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Supplier payable</Label><Select value={f.supplierPayableStatus} onValueChange={v => setF({ ...f, supplierPayableStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["not_started","invoiced","paid","overdue"].map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Reconciliation status</Label><Select value={f.reconciliationStatus} onValueChange={v => setF({ ...f, reconciliationStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["not_started","in_review","waiting_payment","waiting_supplier_final","waiting_commission","discrepancy_found","reconciled"].map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Finance notes</Label><Textarea value={f.financeNotes} onChange={e => setF({ ...f, financeNotes: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Reconciliation notes</Label><Textarea value={f.reconciliationNotes} onChange={e => setF({ ...f, reconciliationNotes: e.target.value })} rows={2} /></div>
        <div className="flex gap-2">
          <Button onClick={() => update.mutate(f)} disabled={update.isPending} className="flex-1 gap-2">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</Button>
          <Button variant="outline" onClick={() => autoFlag.mutate()}><AlertTriangle className="h-4 w-4" /></Button>
        </div>
      </div>

      {rec.discrepancies.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Discrepancies</div>
          {rec.discrepancies.map((d: any) => (
            <div key={d.id} className="text-xs border-l-2 border-amber-300 pl-2 py-1 mb-1">
              <Badge className="text-[10px] mr-1">{d.severity}</Badge>{d.type.replace(/_/g, " ")} · <span className="text-muted-foreground">{d.status}</span>
              {d.reason && <div className="text-muted-foreground">{d.reason}</div>}
            </div>
          ))}
        </div>
      )}

      {payouts.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Commission payouts</div>
          {payouts.map((p: any) => (
            <div key={p.id} className="text-xs flex justify-between border-b py-1">
              <span>{money(p.amount)} via {p.paidThrough || "—"}</span>
              <span className="text-muted-foreground">{p.paidDate || ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t">
        <Link href="/admin/reconciliation"><Button variant="link" size="sm" className="px-0 h-auto text-xs">Open in Reconciliation workspace →</Button></Link>
      </div>
    </Card>
  );
}

function ItemSupplierControls({ item, orderId, suppliers }: { item: OrderItem; orderId: number; suppliers: Supplier[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingDate, setEditingDate] = useState(false);
  const [editingRef, setEditingRef] = useState(false);
  const [refValue, setRefValue] = useState(item.supplierReference || "");

  const inv = () => qc.invalidateQueries({ queryKey: [`/api/orders/${orderId}`] });
  const assign = useMutation({
    mutationFn: (supplierId: number | null) => apiFetch(`/api/orders/${orderId}/items/${item.id}/assign-supplier`, { method: "POST", body: JSON.stringify({ supplierId, source: "manual" }) }),
    onSuccess: () => { inv(); toast({ title: "Supplier assigned" }); },
  });
  const status = useMutation({
    mutationFn: (s: string) => apiFetch(`/api/orders/${orderId}/items/${item.id}/status`, { method: "POST", body: JSON.stringify({ status: s, role: "admin" }) }),
    onSuccess: () => { inv(); toast({ title: "Status updated" }); },
  });
  const exception = useMutation({
    mutationFn: (vars: { flag: boolean; reason?: string | null }) => apiFetch(`/api/orders/${orderId}/items/${item.id}/exception`, { method: "POST", body: JSON.stringify({ flag: vars.flag, reason: vars.reason ?? null, role: "admin" }) }),
    onSuccess: () => { inv(); toast({ title: "Exception updated" }); },
  });
  const dates = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/orders/${orderId}/items/${item.id}/dates`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { inv(); toast({ title: "Saved" }); setEditingDate(false); setEditingRef(false); },
  });

  const handleAssign = (val: string) => {
    const newId = val === "0" ? null : parseInt(val);
    if (item.supplierAssignmentSource && item.supplierAssignmentSource !== "manual" && item.supplierAssignmentSource !== "none" && item.assignedSupplierId !== newId) {
      if (!confirm(`This supplier was ${SOURCE_LABEL[item.supplierAssignmentSource].toLowerCase()}. Override with a manual assignment?`)) return;
    }
    assign.mutate(newId);
  };

  return (
    <div className="mt-3 pt-3 border-t border-dashed space-y-2 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={item.assignedSupplierId?.toString() || "0"} onValueChange={handleAssign}>
          <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="Assign supplier" /></SelectTrigger>
          <SelectContent><SelectItem value="0">Unassigned</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[item.supplierAssignmentSource || "none"]}</Badge>
        <Select value={item.supplierStatus} onValueChange={(v) => status.mutate(v)}>
          <SelectTrigger className={`h-7 text-xs w-36 ${STATUS_TONE[item.supplierStatus] || ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
        {editingDate ? (
          <Input type="date" autoFocus className="h-7 text-xs w-36"
            defaultValue={item.supplierDueDate ? new Date(item.supplierDueDate).toISOString().slice(0, 10) : ""}
            onBlur={(e) => dates.mutate({ supplierDueDate: e.target.value || null })} />
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditingDate(true)}>
            <Calendar className="h-3 w-3" />{item.supplierDueDate ? `Due ${new Date(item.supplierDueDate).toLocaleDateString()}` : "Set due date"}
          </Button>
        )}
        {editingRef ? (
          <Input autoFocus className="h-7 text-xs w-44" placeholder="PO / vendor ref"
            value={refValue} onChange={(e) => setRefValue(e.target.value)}
            onBlur={() => dates.mutate({ supplierReference: refValue || null })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditingRef(true)}>
            <FileText className="h-3 w-3" />{item.supplierReference || "Add ref"}
          </Button>
        )}
        <Button size="sm" variant={item.exceptionFlag ? "destructive" : "ghost"} className="h-7 text-xs gap-1"
          onClick={() => {
            if (item.exceptionFlag) { exception.mutate({ flag: false }); return; }
            const reason = prompt("Issue reason?"); if (reason !== null) exception.mutate({ flag: true, reason });
          }}>
          <AlertTriangle className="h-3 w-3" />{item.exceptionFlag ? "Clear issue" : "Flag issue"}
        </Button>
      </div>
      {item.exceptionFlag && item.exceptionReason && <div className="text-xs text-red-700">⚠ {item.exceptionReason}</div>}
    </div>
  );
}

function ItemSpecsLine({ productId, partnerId }: { productId: number; partnerId: number }) {
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/products"], queryFn: () => apiFetch("/api/products") });
  const { data: pref } = useQuery<{ system: UnitSystem }>({ queryKey: ["/api/units/resolve", "partner", partnerId], queryFn: () => apiFetch(`/api/units/resolve?partnerId=${partnerId}`) });
  const p = products.find((x: any) => x.id === productId);
  if (!p) return null;
  const sys = pref?.system;
  const aUnit = p.artworkUnit || p.sizeUnit;
  const finished = formatWxHDual(p.sizeWidth, p.sizeHeight, p.sizeUnit, sys);
  const artwork  = formatWxHDual(p.artworkWidth, p.artworkHeight, aUnit, sys);
  const bleed    = formatPrimarySecondary(p.bleed, aUnit, sys);
  const safe     = formatPrimarySecondary(p.safeArea, aUnit, sys);
  const visible  = formatWxHDual(p.visibleWidth, p.visibleHeight, aUnit, sys);
  if (!finished.primary && !artwork.primary && !bleed.primary && !safe.primary && !visible.primary) return null;
  const Bit = ({ label, v }: { label: string; v: { primary: string; secondary?: string | null } }) => (
    v.primary ? <span className="mr-3"><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{v.primary}</span>{v.secondary && <span className="text-muted-foreground/80"> (≈ {v.secondary})</span>}</span> : null
  );
  return (
    <div className="text-[11px] mt-1 flex flex-wrap">
      <Bit label="Finished" v={finished} />
      <Bit label="Artwork"  v={artwork} />
      <Bit label="Visible"  v={visible} />
      <Bit label="Bleed"    v={bleed} />
      <Bit label="Safe"     v={safe} />
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
