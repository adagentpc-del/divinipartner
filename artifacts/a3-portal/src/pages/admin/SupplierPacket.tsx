import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, ChevronLeft, FileText, Image as ImageIcon, AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import { Link } from "wouter";
import { formatWeight, convertWeight, pickDisplayWeightUnit, type WeightUnit, type UnitSystem } from "@/lib/units";

type PacketAsset = { linkId: number; role: string; asset: any };

type DualValue = { primary: string; secondary: string | null; converted: boolean };
type ItemSpecs = {
  finished: DualValue | null;
  artwork: DualValue | null;
  visible: DualValue | null;
  bleed: DualValue | null;
  safeArea: DualValue | null;
};
type Packet = {
  order: any; partner: any; event: any; supplier: any;
  items: Array<{
    itemId: number; name: string; productName: string | null; quantity: number;
    dimensionDisplay: string | null;
    specs: ItemSpecs | null;
    pricingBasis: {
      pricingModel: string | null; pricingUnit: string | null; pricingUnitLabel: string | null;
      unitRate: string | number | null; billableAreaSqm: number | null; billableLinearM: number | null;
      unitPrice: string | number | null; minBillableSize: number | null;
      minCharge: string | number | null; calculation: string | null; requiresQuote?: boolean;
    } | null;
    fulfillmentMode: string | null; supplierStatus: string;
    supplierDueDate: string | null; supplierShipDate: string | null; supplierInstallDate: string | null;
    internalFulfillmentNotes: string | null; productionBlockedReason: string | null;
    assets: PacketAsset[]; flags: string[]; ready: boolean;
  }>;
  measurementContext?: { system: string; primarySystem?: string; secondarySystem?: string; source: string; reason: string };
  orderLevelAssets: any[];
  summary: { totalItems: number; ready: number; blocked: number };
};

function DualSpec({ label, v }: { label: string; v: DualValue | null }) {
  if (!v?.primary) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{v.primary}</span>
      {v.secondary && <span className="text-muted-foreground">(≈ {v.secondary})</span>}
    </span>
  );
}

function formatWeightForOrder(value: number | null, unit: string | null, system: UnitSystem): string | null {
  if (value == null) return null;
  const u = (unit as WeightUnit) || (system === "metric" ? "kg" : "lb");
  // If the unit's system already matches the preferred system, render as-is.
  // Otherwise convert to the system's most readable unit so packets shipping
  // overseas show kg/g first by default.
  const isMetric = u === "kg" || u === "g";
  const matches = (system === "metric" && isMetric) || (system === "imperial" && !isMetric);
  if (matches) return formatWeight(value, u);
  const grams = convertWeight(value, u, "g");
  const tgt = pickDisplayWeightUnit(grams, system);
  return formatWeight(convertWeight(value, u, tgt), tgt);
}

function LogisticsBlock({ order }: { order: any }) {
  const system: UnitSystem = (order.measurementSystem === "metric" ? "metric" : "imperial");
  const sc = order.shippingContactJson || null;
  const rc = order.receivingContactJson || null;
  const flags = [
    order.oversizeFlag && "Oversize",
    order.crateRequired && "Crate required",
    order.palletRequired && "Pallet required",
  ].filter(Boolean) as string[];
  const totalWt = formatWeightForOrder(order.totalShipmentWeight != null ? Number(order.totalShipmentWeight) : null, order.totalShipmentWeightUnit, system);
  const hasAny = order.shipDateTarget || order.deliveryByDate || order.packageCount != null
    || totalWt || flags.length > 0 || sc || rc
    || order.customsNotes || order.internationalShippingNotes || order.logisticsNotes;
  if (!hasAny) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Logistics</h2>
        <Badge variant="outline" className="text-[10px]">{system === "metric" ? "Metric" : "Imperial"}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
        {order.shipDateTarget && <div><div className="text-[11px] text-muted-foreground">Ship by</div><div className="font-medium">{new Date(order.shipDateTarget).toLocaleDateString()}</div></div>}
        {order.deliveryByDate && <div><div className="text-[11px] text-muted-foreground">Deliver by</div><div className="font-medium">{new Date(order.deliveryByDate).toLocaleDateString()}</div></div>}
        {order.packageCount != null && <div><div className="text-[11px] text-muted-foreground">Packages</div><div className="font-medium tabular-nums">{order.packageCount}</div></div>}
        {totalWt && <div><div className="text-[11px] text-muted-foreground">Total weight</div><div className="font-medium tabular-nums">{totalWt}</div></div>}
      </div>
      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {flags.map(f => <Badge key={f} className="bg-amber-100 text-amber-900">{f}</Badge>)}
        </div>
      )}
      {(sc || rc) && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {sc && (
            <div className="rounded border p-2">
              <div className="text-[11px] uppercase text-muted-foreground mb-0.5">Shipping (sender) contact</div>
              <div className="font-medium">{sc.name || "—"}</div>
              {sc.phone && <div className="text-xs">{sc.phone}</div>}
              {sc.email && <div className="text-xs">{sc.email}</div>}
            </div>
          )}
          {rc && (
            <div className="rounded border p-2">
              <div className="text-[11px] uppercase text-muted-foreground mb-0.5">Receiving (onsite) contact</div>
              <div className="font-medium">{rc.name || "—"}</div>
              {rc.phone && <div className="text-xs">{rc.phone}</div>}
              {rc.email && <div className="text-xs">{rc.email}</div>}
            </div>
          )}
        </div>
      )}
      {(order.logisticsNotes || order.internationalShippingNotes || order.customsNotes) && (
        <div className="mt-3 space-y-2 text-sm">
          {order.logisticsNotes && <div className="p-2 rounded bg-muted/40"><strong className="text-xs">Logistics:</strong> {order.logisticsNotes}</div>}
          {order.internationalShippingNotes && <div className="p-2 rounded bg-blue-50 border border-blue-200"><strong className="text-xs">International shipping:</strong> {order.internationalShippingNotes}</div>}
          {order.customsNotes && <div className="p-2 rounded bg-amber-50 border border-amber-200"><strong className="text-xs">Customs:</strong> {order.customsNotes}</div>}
        </div>
      )}
    </Card>
  );
}

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

            <LogisticsBlock order={data.order} />

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
                      {it.specs && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <DualSpec label="Finished" v={it.specs.finished} />
                          <DualSpec label="Artwork"  v={it.specs.artwork} />
                          <DualSpec label="Visible"  v={it.specs.visible} />
                          <DualSpec label="Bleed"    v={it.specs.bleed} />
                          <DualSpec label="Safe"     v={it.specs.safeArea} />
                        </div>
                      )}
                      {!it.specs && it.dimensionDisplay && <p className="text-xs font-medium mt-0.5">Size: {it.dimensionDisplay}</p>}
                      {it.pricingBasis && (
                        <p className="text-xs mt-1">
                          <span className="text-muted-foreground">Pricing:</span>{" "}
                          {it.pricingBasis.requiresQuote ? (
                            <span className="font-medium">Custom quote required</span>
                          ) : (
                            <>
                              <span className="font-medium">{it.pricingBasis.pricingModel}</span>
                              {it.pricingBasis.unitRate != null && it.pricingBasis.pricingUnitLabel && (
                                <> @ {it.pricingBasis.unitRate} {it.pricingBasis.pricingUnitLabel}</>
                              )}
                              {it.pricingBasis.billableAreaSqm != null && (
                                <>, billable {it.pricingBasis.billableAreaSqm} sqm</>
                              )}
                              {it.pricingBasis.billableLinearM != null && (
                                <>, billable {it.pricingBasis.billableLinearM} m</>
                              )}
                              {it.pricingBasis.unitPrice != null && (
                                <> = <span className="font-semibold">${it.pricingBasis.unitPrice}</span></>
                              )}
                            </>
                          )}
                        </p>
                      )}
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
