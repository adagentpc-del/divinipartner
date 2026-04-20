import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Search } from "lucide-react";

type Order = { id: number; orderNumber: string; partnerId: number; partnerName?: string; eventId: number | null; eventName?: string | null; portalType: string; status: string; paymentStatus: string; fulfillmentMode: string | null; assignedSupplierId: number | null; supplierName?: string | null; venueName?: string | null; contactName: string; companyName: string | null; totalEstimate: string | null; createdAt: string };
type Partner = { id: number; companyName: string };
type Supplier = { id: number; name: string };

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
  const [partnerId, setPartnerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (partnerId) params.set("partnerId", partnerId);
  if (supplierId) params.set("supplierId", supplierId);
  if (status) params.set("status", status);
  const qs = params.toString();
  const { data: orders = [], isLoading } = useQuery<Order[]>({ queryKey: ["/api/orders", qs], queryFn: () => apiFetch(`/api/orders${qs ? `?${qs}` : ""}`) });
  const { data: partners = [] } = useQuery<Partner[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });

  const filtered = orders.filter(o => !search || o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.contactName?.toLowerCase().includes(search.toLowerCase()) || o.companyName?.toLowerCase().includes(search.toLowerCase()) || o.eventName?.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-1">{filtered.length} of {orders.length} order{orders.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by order #, contact, company, event..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={partnerId} onValueChange={v => setPartnerId(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All partners" /></SelectTrigger><SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent></Select>
        <Select value={supplierId} onValueChange={v => setSupplierId(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All suppliers" /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={v => setStatus(v === "all" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
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
                <TableCell className="text-xs"><Badge variant="outline">{o.fulfillmentMode || o.portalType}</Badge></TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>{o.status}</span></TableCell>
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
