import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, AlertTriangle, Truck, Clock, Package, FileWarning, CheckCircle2,
  CircleDashed, FileText, RefreshCw, Filter as FilterIcon, Inbox,
} from "lucide-react";

type CCItem = {
  id: number; orderId: number; orderNumber: string;
  partnerId: number | null; partnerName: string | null;
  eventId: number | null; eventName: string | null; eventStartDate: string | null;
  portalType: string | null; name: string; quantity: number;
  productId: number | null; fulfillmentMode: string | null;
  printDemandQuantity: number | null; hardwareDemandQuantity: number | null; shortageQuantity: number | null;
  assignedSupplierId: number | null; supplierName: string | null;
  supplierAssignmentSource: string | null; supplierStatus: string;
  supplierDueDate: string | null; supplierShipDate: string | null; supplierAcknowledgedAt: string | null;
  supplierReference: string | null; exceptionFlag: boolean; exceptionReason: string | null;
  hasQuoteSpec: boolean; cityId: number | null; createdAt: string;
};
type CCStats = {
  total: number; unassigned: number; awaitingAcknowledge: number; dueSoon: number; awaitingAssets: number;
  issues: number; shippedNotDelivered: number; installUpcoming: number; completedToday: number;
  missingQuoteSpec: number; withShortage: number;
};
type Supplier = { id: number; name: string };
type Partner = { id: number; companyName: string };
type City = { id: number; name: string };

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned", assigned: "Assigned", acknowledged: "Acknowledged",
  in_production: "In Production", awaiting_assets: "Awaiting Assets",
  awaiting_approval: "Awaiting Approval", shipped: "Shipped",
  delivered: "Delivered", installed: "Installed", completed: "Completed",
  issue_flagged: "Issue", cancelled: "Cancelled",
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
const SOURCE_LABEL: Record<string, string> = {
  product: "Product", package: "Package", zone: "Zone", order: "Order",
  manual: "Manual", none: "None",
};

export default function FulfillmentCommandCenter() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    supplierId: "", status: "", partnerId: "", portalType: "", cityId: "", fulfillmentMode: "",
    dueWithinDays: "", shortageOnly: false, issueOnly: false, unassignedOnly: false, hasQuoteSpec: "",
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const params = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "") q.set(k, String(v)); });
    return q.toString();
  }, [filters]);

  const { data, isLoading, refetch, isFetching } = useQuery<{ items: CCItem[]; stats: CCStats }>({
    queryKey: ["/api/fulfillment/command-center", params],
    queryFn: () => apiFetch(`/api/fulfillment/command-center${params ? `?${params}` : ""}`),
  });
  const items = data?.items || [];
  const stats = data?.stats;

  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const { data: partners = [] } = useQuery<Partner[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities") });

  const setStatus = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: number; itemId: number; status: string }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/status`, { method: "POST", body: JSON.stringify({ status, role: "admin" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fulfillment/command-center"] }); toast({ title: "Status updated" }); },
    onError: (e: any) => toast({ title: "Status change failed", description: e.message, variant: "destructive" }),
  });
  const toggleException = useMutation({
    mutationFn: ({ orderId, itemId, flag, reason }: any) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/exception`, { method: "POST", body: JSON.stringify({ flag, reason, role: "admin" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fulfillment/command-center"] }); toast({ title: "Exception updated" }); },
  });
  const setDueDate = useMutation({
    mutationFn: ({ orderId, itemId, supplierDueDate }: any) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/dates`, { method: "POST", body: JSON.stringify({ supplierDueDate }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fulfillment/command-center"] }); toast({ title: "Due date saved" }); },
  });
  const bulkAssign = useMutation({
    mutationFn: async ({ supplierId }: { supplierId: number | null }) => {
      const byOrder = new Map<number, number[]>();
      for (const it of items.filter(i => selected.has(i.id))) {
        if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, []);
        byOrder.get(it.orderId)!.push(it.id);
      }
      for (const [orderId, itemIds] of byOrder) {
        await apiFetch(`/api/orders/${orderId}/bulk-assign-supplier`, { method: "POST", body: JSON.stringify({ itemIds, supplierId, source: "manual" }) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fulfillment/command-center"] }); setSelected(new Set()); toast({ title: "Bulk assignment complete" }); },
  });

  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)));
  const toggleOne = (id: number) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  const StatCard = ({ icon: Icon, label, value, tone, onClick, active }: any) => (
    <button onClick={onClick} className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow ${active ? "border-primary ring-2 ring-primary/30" : "bg-card"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${tone || ""}`} />{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" />Fulfillment Command Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">Triage every line item across every supplier, in real time.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard icon={Inbox} label="All items" value={stats.total} onClick={() => setFilters({ ...filters, status: "", unassignedOnly: false, issueOnly: false, dueWithinDays: "", shortageOnly: false })} />
          <StatCard icon={CircleDashed} label="Unassigned" value={stats.unassigned} tone="text-zinc-500" active={filters.unassignedOnly} onClick={() => setFilters({ ...filters, unassignedOnly: !filters.unassignedOnly })} />
          <StatCard icon={Clock} label="Awaiting ack" value={stats.awaitingAcknowledge} tone="text-blue-500" active={filters.status === "assigned"} onClick={() => setFilters({ ...filters, status: filters.status === "assigned" ? "" : "assigned" })} />
          <StatCard icon={Clock} label="Due in 7d" value={stats.dueSoon} tone="text-amber-500" active={filters.dueWithinDays === "7"} onClick={() => setFilters({ ...filters, dueWithinDays: filters.dueWithinDays === "7" ? "" : "7" })} />
          <StatCard icon={FileText} label="Awaiting assets" value={stats.awaitingAssets} tone="text-orange-500" active={filters.status === "awaiting_assets"} onClick={() => setFilters({ ...filters, status: filters.status === "awaiting_assets" ? "" : "awaiting_assets" })} />
          <StatCard icon={AlertTriangle} label="Issues" value={stats.issues} tone="text-red-500" active={filters.issueOnly} onClick={() => setFilters({ ...filters, issueOnly: !filters.issueOnly })} />
          <StatCard icon={Truck} label="Shipped" value={stats.shippedNotDelivered} tone="text-cyan-500" active={filters.status === "shipped"} onClick={() => setFilters({ ...filters, status: filters.status === "shipped" ? "" : "shipped" })} />
          <StatCard icon={Package} label="Install upcoming" value={stats.installUpcoming} tone="text-emerald-500" />
          <StatCard icon={CheckCircle2} label="Completed today" value={stats.completedToday} tone="text-emerald-600" />
          <StatCard icon={FileWarning} label="Missing spec" value={stats.missingQuoteSpec} tone="text-purple-500" active={filters.hasQuoteSpec === "false"} onClick={() => setFilters({ ...filters, hasQuoteSpec: filters.hasQuoteSpec === "false" ? "" : "false" })} />
          <StatCard icon={AlertTriangle} label="With shortage" value={stats.withShortage} tone="text-amber-500" active={filters.shortageOnly} onClick={() => setFilters({ ...filters, shortageOnly: !filters.shortageOnly })} />
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground"><FilterIcon className="h-4 w-4" />Filters</div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Select value={filters.supplierId || "all"} onValueChange={v => setFilters({ ...filters, supplierId: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.status || "all"} onValueChange={v => setFilters({ ...filters, status: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.partnerId || "all"} onValueChange={v => setFilters({ ...filters, partnerId: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Partner" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.cityId || "all"} onValueChange={v => setFilters({ ...filters, cityId: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.portalType || "all"} onValueChange={v => setFilters({ ...filters, portalType: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Portal" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All portals</SelectItem>{["activation","retail","franchise","trade_show"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.fulfillmentMode || "all"} onValueChange={v => setFilters({ ...filters, fulfillmentMode: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Fulfillment mode" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All modes</SelectItem>{["full","graphic_only","use_existing_partner_inventory","rental_plus_print","new_hardware_required","client_owned_plus_print"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select onValueChange={(v) => bulkAssign.mutate({ supplierId: v === "0" ? null : parseInt(v) })}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Bulk assign supplier…" /></SelectTrigger>
            <SelectContent><SelectItem value="0">Unassign</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <Table>
            <TableHeader><TableRow className="bg-muted/50">
              <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Partner / Event</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map(it => (
                <TableRow key={it.id} className={it.exceptionFlag ? "bg-red-50/40" : ""}>
                  <TableCell><Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleOne(it.id)} /></TableCell>
                  <TableCell><Link href={`/admin/orders/${it.orderId}`}><span className="font-mono text-xs text-primary hover:underline">{it.orderNumber}</span></Link></TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">Qty {it.quantity}{it.printDemandQuantity ? ` · Print ${it.printDemandQuantity}` : ""}{it.hardwareDemandQuantity ? ` · HW ${it.hardwareDemandQuantity}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium text-sm">{it.partnerName || "—"}</div>
                    <div className="text-muted-foreground">{it.eventName || "No event"}</div>
                  </TableCell>
                  <TableCell>
                    {it.assignedSupplierId ? (
                      <div>
                        <div className="text-sm font-medium">{it.supplierName}</div>
                        <Badge variant="outline" className="text-[10px] mt-0.5">{SOURCE_LABEL[it.supplierAssignmentSource || "none"]}</Badge>
                      </div>
                    ) : <Badge variant="outline" className="text-zinc-500">Unassigned</Badge>}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_TONE[it.supplierStatus] || ""}`}>{STATUS_LABEL[it.supplierStatus] || it.supplierStatus}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Input type="date" defaultValue={it.supplierDueDate ? new Date(it.supplierDueDate).toISOString().slice(0, 10) : ""}
                      className="h-7 text-xs w-32"
                      onBlur={(e) => { const v = e.target.value; if (v !== (it.supplierDueDate ? new Date(it.supplierDueDate).toISOString().slice(0, 10) : "")) setDueDate.mutate({ orderId: it.orderId, itemId: it.id, supplierDueDate: v || null }); }} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(it.shortageQuantity || 0) > 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">Shortage {it.shortageQuantity}</Badge>}
                      {!it.hasQuoteSpec && it.productId && <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700">No spec</Badge>}
                      {it.exceptionFlag && <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">{it.exceptionReason || "Issue"}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Select value={it.supplierStatus} onValueChange={(v) => setStatus.mutate({ orderId: it.orderId, itemId: it.id, status: v })}>
                        <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="h-7 px-2"
                        onClick={() => toggleException.mutate({ orderId: it.orderId, itemId: it.id, flag: !it.exceptionFlag, reason: it.exceptionFlag ? null : "Flagged from command center" })}>
                        <AlertTriangle className={`h-4 w-4 ${it.exceptionFlag ? "text-red-600" : "text-muted-foreground"}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">No items match these filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
