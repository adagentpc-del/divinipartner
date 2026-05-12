import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Search, FileSpreadsheet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Order as OrderRow } from "@workspace/db/schema";

// Source the row shape from the shared Drizzle schema so renamed/removed columns
// surface as type errors instead of silently breaking the dashboard (mirrors the
// approach the product editor took after the historic price-preview drift).
// API serializes timestamps as ISO strings and joins in a few display-only
// fields that aren't part of the orders table.
type Order = Omit<OrderRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  partnerName?: string;
  eventName?: string | null;
  supplierName?: string | null;
  venueName?: string | null;
  totalShortage?: number;
  totalReserved?: number;
  itemFulfillmentModes?: string[];
};

const EXCEPTION_BADGE: Record<string, { label: string; className: string }> = {
  warning:          { label: "Warning",            className: "border-amber-300 text-amber-700 bg-amber-50" },
  exception:        { label: "Exception",          className: "border-red-300 text-red-700 bg-red-50" },
  waiting_client:   { label: "Waiting client",     className: "border-blue-300 text-blue-700 bg-blue-50" },
  waiting_internal: { label: "Waiting internal",   className: "border-violet-300 text-violet-700 bg-violet-50" },
  resolved:         { label: "Resolved",           className: "border-emerald-300 text-emerald-700 bg-emerald-50" },
};
type Partner = { id: number; companyName: string };
type Supplier = { id: number; name: string };
type City = { id: number; name: string };

const FULFILLMENT_MODES = ["full", "graphic_only", "use_existing_partner_inventory", "rental_plus_print", "new_hardware_required", "client_owned_plus_print"];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  in_production: "bg-amber-100 text-amber-700",
  shipped: "bg-violet-100 text-violet-700",
  delivered: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function OrdersDashboard() {
  const searchString = useSearch();
  const initial = new URLSearchParams(searchString);
  const truthyParam = (v: string | null) => v === "1" || v === "true";
  const [partnerId, setPartnerId] = useState(initial.get("partnerId") || "");
  const [supplierId, setSupplierId] = useState(initial.get("supplierId") || "");
  const [status, setStatus] = useState(initial.get("status") || "");
  const [fulfillmentMode, setFulfillmentMode] = useState(initial.get("fulfillmentMode") || "");
  const [shortageOnly, setShortageOnly] = useState(truthyParam(initial.get("shortageOnly")));
  const [sourceCityId, setSourceCityId] = useState(initial.get("sourceCityId") || "");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (partnerId) params.set("partnerId", partnerId);
  if (supplierId) params.set("supplierId", supplierId);
  if (status) params.set("status", status);
  if (fulfillmentMode) params.set("fulfillmentMode", fulfillmentMode);
  if (shortageOnly) params.set("shortageOnly", "1");
  if (sourceCityId) params.set("sourceCityId", sourceCityId);
  const qs = params.toString();
  const { data: orders = [], isLoading } = useQuery<Order[]>({ queryKey: ["/api/orders", qs], queryFn: () => apiFetch(`/api/orders${qs ? `?${qs}` : ""}`) });
  const { data: partners = [] } = useQuery<Partner[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities") });

  const filtered = orders.filter(o => !search || o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.contactName?.toLowerCase().includes(search.toLowerCase()) || o.companyName?.toLowerCase().includes(search.toLowerCase()) || o.eventName?.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} of {orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Export ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.open(`/api/exports/orders.csv${qs ? `?${qs}` : ""}`, "_blank")}>Orders CSV (current filters)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/api/exports/order-items.csv${qs ? `?${qs}` : ""}`, "_blank")}>Line items CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/api/exports/finance.csv${qs ? `?${qs}` : ""}`, "_blank")}>Finance / reconciliation CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/api/exports/suppliers.csv`, "_blank")}>Suppliers summary CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/api/exports/events.csv`, "_blank")}>Events summary CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by order #, contact, company, event..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={partnerId} onValueChange={v => setPartnerId(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All partners" /></SelectTrigger><SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent></Select>
        <Select value={supplierId} onValueChange={v => setSupplierId(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All suppliers" /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={v => setStatus(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={fulfillmentMode} onValueChange={v => setFulfillmentMode(v === "all" ? "" : v)}><SelectTrigger className="w-52"><SelectValue placeholder="Any fulfillment mode" /></SelectTrigger><SelectContent><SelectItem value="all">Any fulfillment mode</SelectItem>{FULFILLMENT_MODES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
        <Select value={sourceCityId} onValueChange={v => setSourceCityId(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="Any source city" /></SelectTrigger><SelectContent><SelectItem value="all">Any source city</SelectItem>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Button variant={shortageOnly ? "default" : "outline"} size="sm" onClick={() => setShortageOnly(!shortageOnly)}>Shortages only</Button>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/50"><TableHead>Order #</TableHead><TableHead>Partner</TableHead><TableHead>Event / Venue</TableHead><TableHead>Contact</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(o => (
              <TableRow key={o.id} className="cursor-pointer">
                <TableCell><Link href={`/admin/orders/${o.id}`}><span className="font-mono text-xs text-primary hover:underline">{o.orderNumber}</span></Link></TableCell>
                <TableCell className="text-sm">{o.partnerName}</TableCell>
                <TableCell className="text-sm"><div>{o.eventName || "—"}</div><div className="text-xs text-muted-foreground">{o.venueName}</div></TableCell>
                <TableCell className="text-sm">{o.contactName}<div className="text-xs text-muted-foreground">{o.companyName}</div></TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(o.itemFulfillmentModes || []).slice(0, 2).map(m => <Badge key={m} variant="outline" className="text-[10px]">{m.replace(/_/g, " ")}</Badge>)}
                    {(o.itemFulfillmentModes || []).length === 0 && <Badge variant="outline" className="text-[10px]">{o.fulfillmentMode || o.portalType}</Badge>}
                    {(o.totalShortage || 0) > 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">⚠ {o.totalShortage} short</Badge>}
                    {(o.totalReserved || 0) > 0 && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">✓ {o.totalReserved} reserved</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>{o.status}</span>
                    {o.exceptionState && o.exceptionState !== "none" && EXCEPTION_BADGE[o.exceptionState] && (
                      <Badge variant="outline" className={`text-[10px] ${EXCEPTION_BADGE[o.exceptionState].className}`}>⚠ {EXCEPTION_BADGE[o.exceptionState].label}</Badge>
                    )}
                    {o.artworkNeededFlag && (
                      <Badge variant="outline" className="text-[10px] border-fuchsia-300 text-fuchsia-700 bg-fuchsia-50">🎨 Artwork needed</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.supplierName || "—"}</TableCell>
                <TableCell className="text-right font-medium">{o.totalEstimate ? `$${o.totalEstimate}` : "—"}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12"><ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-40" />No orders found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
