import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Banknote, FileText, Send, AlertTriangle, Plus, ExternalLink, CheckSquare, RotateCcw } from "lucide-react";

const BILLING_MODELS = [
  { v: "a3_collected", l: "A3 collected" },
  { v: "alyssa_entity_collected", l: "Alyssa entity collected" },
  { v: "manual_invoice", l: "Manual invoice" },
  { v: "split_payout", l: "Split payout (placeholder)" },
  { v: "external_payment_pending", l: "External payment pending" },
];
const INVOICE_STATUSES = ["draft", "ready", "sent", "partially_paid", "paid", "overdue", "cancelled"];

const TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partially_paid: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  ready: "bg-indigo-100 text-indigo-800",
  draft: "bg-zinc-100 text-zinc-700",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-200 text-zinc-600",
};
const tone = (s: string) => TONE[s] || "bg-zinc-100 text-zinc-700";
const money = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(v || "0");
  return isNaN(n) ? "$0.00" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const modelLabel = (v: string) => BILLING_MODELS.find(m => m.v === v)?.l || v;

export default function Billing() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filters, setFilters] = useState({ billingExecModel: "", invoiceStatus: "", paymentStatus: "", needsInvoice: "", overdueOnly: "", missingBillingContact: "", partnerId: "" });
  const [tab, setTab] = useState("orders");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [filters]);

  const { data: summary } = useQuery<any>({ queryKey: ["/api/billing/summary"], queryFn: () => apiFetch("/api/billing/summary") });
  const { data: orderRows = [] } = useQuery<any[]>({ queryKey: ["/api/billing/orders", qs], queryFn: () => apiFetch(`/api/billing/orders${qs}`) });
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", filters.invoiceStatus, filters.billingExecModel], queryFn: () => {
    const p = new URLSearchParams();
    if (filters.invoiceStatus) p.set("status", filters.invoiceStatus);
    if (filters.billingExecModel) p.set("billingExecModel", filters.billingExecModel);
    const q = p.toString();
    return apiFetch(`/api/invoices${q ? "?" + q : ""}`);
  } });
  const { data: partners = [] } = useQuery<any[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });

  const createInvoice = useMutation({
    mutationFn: (orderId: number) => apiFetch(`/api/invoices/from-order/${orderId}`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Invoice created" }); qc.invalidateQueries({ queryKey: ["/api/billing/orders"] }); qc.invalidateQueries({ queryKey: ["/api/invoices"] }); qc.invalidateQueries({ queryKey: ["/api/billing/summary"] }); },
    onError: (e: any) => toast({ title: "Could not create invoice", description: e?.message, variant: "destructive" }),
  });
  const bulk = useMutation({
    mutationFn: (body: any) => apiFetch("/api/billing/bulk", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: (r: any) => { toast({ title: `Done`, description: `${r.count} record(s) updated` }); setSelectedOrders(new Set()); setSelectedInvoices(new Set()); qc.invalidateQueries({ queryKey: ["/api/billing/orders"] }); qc.invalidateQueries({ queryKey: ["/api/invoices"] }); qc.invalidateQueries({ queryKey: ["/api/billing/summary"] }); },
  });
  const scanOverdue = useMutation({
    mutationFn: () => apiFetch("/api/invoices/scan-overdue", { method: "POST" }),
    onSuccess: (r: any) => { toast({ title: "Scan complete", description: `${r.markedOverdue} marked overdue` }); qc.invalidateQueries({ queryKey: ["/api/invoices"] }); qc.invalidateQueries({ queryKey: ["/api/billing/summary"] }); },
  });

  const cards = [
    { label: "Total invoiced", value: money(summary?.totalInvoiced), icon: FileText, tone: "bg-blue-50 text-blue-900" },
    { label: "Total paid", value: money(summary?.totalPaid), icon: Banknote, tone: "bg-emerald-50 text-emerald-900" },
    { label: "Balance due", value: money(summary?.totalBalance), icon: AlertTriangle, tone: (summary?.totalBalance || 0) > 0 ? "bg-amber-50 text-amber-900" : "bg-zinc-50 text-zinc-700" },
    { label: "Overdue invoices", value: summary?.overdueCount || 0, icon: AlertTriangle, tone: (summary?.overdueCount || 0) > 0 ? "bg-red-50 text-red-900" : "bg-zinc-50 text-zinc-700" },
    { label: "Orders missing invoice", value: summary?.ordersNeedingInvoice || 0, icon: Plus, tone: "bg-indigo-50 text-indigo-900" },
  ];

  const allOrderIds = orderRows.map((r: any) => r.orderId);
  const allInvoiceIds = invoices.map((r: any) => r.id);
  const toggleAllOrders = () => setSelectedOrders(s => s.size === allOrderIds.length ? new Set() : new Set(allOrderIds));
  const toggleAllInvoices = () => setSelectedInvoices(s => s.size === allInvoiceIds.length ? new Set() : new Set(allInvoiceIds));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Banknote className="h-6 w-6" /> Billing Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Selective execution — A3 collected, Alyssa entity, manual invoice, split payout, external pending. Inheritance: partner → event → order.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => scanOverdue.mutate()} className="gap-2"><RotateCcw className="h-4 w-4" /> Scan overdue</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(c => (
          <Card key={c.label} className={`p-4 ${c.tone}`}>
            <div className="flex items-center justify-between"><c.icon className="h-4 w-4 opacity-70" /><span className="text-xs uppercase tracking-wide opacity-70">{c.label}</span></div>
            <div className="text-xl font-semibold mt-2">{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <Select value={filters.billingExecModel || "all"} onValueChange={v => setFilters({ ...filters, billingExecModel: v === "all" ? "" : v })}><SelectTrigger><SelectValue placeholder="Billing model" /></SelectTrigger><SelectContent><SelectItem value="all">All models</SelectItem>{BILLING_MODELS.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.invoiceStatus || "all"} onValueChange={v => setFilters({ ...filters, invoiceStatus: v === "all" ? "" : v })}><SelectTrigger><SelectValue placeholder="Invoice status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.paymentStatus || "all"} onValueChange={v => setFilters({ ...filters, paymentStatus: v === "all" ? "" : v })}><SelectTrigger><SelectValue placeholder="Payment status" /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem>{["not_charged","invoiced","partially_paid","paid","refunded"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.partnerId || "all"} onValueChange={v => setFilters({ ...filters, partnerId: v === "all" ? "" : v })}><SelectTrigger><SelectValue placeholder="Partner" /></SelectTrigger><SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map((p: any) => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent></Select>
          <Button variant={filters.needsInvoice === "true" ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, needsInvoice: filters.needsInvoice === "true" ? "" : "true" })}>Needs invoice</Button>
          <Button variant={filters.overdueOnly === "true" ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, overdueOnly: filters.overdueOnly === "true" ? "" : "true" })}>Overdue</Button>
          <Button variant={filters.missingBillingContact === "true" ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, missingBillingContact: filters.missingBillingContact === "true" ? "" : "true" })}>Missing contact</Button>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">Orders ({orderRows.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          {selectedOrders.size > 0 && (
            <Card className="p-3 flex items-center gap-2 bg-blue-50">
              <span className="text-sm font-medium">{selectedOrders.size} selected</span>
              <Button size="sm" variant="default" onClick={() => bulk.mutate({ action: "create_invoices", orderIds: [...selectedOrders] })} className="gap-2"><Plus className="h-3.5 w-3.5" /> Create invoices</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedOrders(new Set())}>Clear</Button>
            </Card>
          )}
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9"><Checkbox checked={selectedOrders.size === allOrderIds.length && allOrderIds.length > 0} onCheckedChange={toggleAllOrders} /></TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Billing model</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRows.map((r: any) => (
                  <TableRow key={r.orderId} className={selectedOrders.has(r.orderId) ? "bg-blue-50/40" : ""}>
                    <TableCell><Checkbox checked={selectedOrders.has(r.orderId)} onCheckedChange={c => { const n = new Set(selectedOrders); c ? n.add(r.orderId) : n.delete(r.orderId); setSelectedOrders(n); }} /></TableCell>
                    <TableCell><Link href={`/admin/orders/${r.orderId}`}><span className="font-medium hover:underline">{r.orderNumber}</span></Link></TableCell>
                    <TableCell className="text-sm">{r.partnerName || "—"}</TableCell>
                    <TableCell className="text-xs">
                      <Badge className={tone(r.billingExecModel)}>{modelLabel(r.billingExecModel)}</Badge>
                      <div className="text-[10px] mt-0.5 text-muted-foreground">via {r.billingExecModelSource}</div>
                    </TableCell>
                    <TableCell>{r.invoice ? (
                      <Link href={`/admin/invoices/${r.invoice.id}`}><div className="hover:underline">
                        <Badge className={tone(r.invoice.isOverdue ? "overdue" : r.invoice.status)}>{r.invoice.isOverdue ? "overdue" : r.invoice.status}</Badge>
                        <div className="text-[10px] mt-0.5">{r.invoice.invoiceNumber}</div>
                      </div></Link>
                    ) : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{money(r.totalEstimate)}</TableCell>
                    <TableCell className="text-sm">{r.invoice ? money(r.invoice.amountPaid) : "—"}</TableCell>
                    <TableCell className="text-sm">{r.invoice ? money(r.invoice.balanceDue) : "—"}</TableCell>
                    <TableCell className="text-xs">{r.invoice?.dueDate || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.needsInvoice && <Badge className="bg-indigo-100 text-indigo-800 mr-1">Needs invoice</Badge>}
                      {r.missingBillingContact && <Badge className="bg-amber-100 text-amber-800">Missing contact</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!r.invoice && <Button size="sm" variant="outline" onClick={() => createInvoice.mutate(r.orderId)} className="gap-1"><Plus className="h-3 w-3" /> Invoice</Button>}
                      {r.invoice && <Link href={`/admin/invoices/${r.invoice.id}`}><Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="h-3 w-3" /> Open</Button></Link>}
                    </TableCell>
                  </TableRow>
                ))}
                {orderRows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">No orders match these filters</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-3">
          {selectedInvoices.size > 0 && (
            <Card className="p-3 flex items-center gap-2 bg-blue-50">
              <span className="text-sm font-medium">{selectedInvoices.size} selected</span>
              <Button size="sm" onClick={() => bulk.mutate({ action: "mark_ready", invoiceIds: [...selectedInvoices] })}>Mark ready</Button>
              <Button size="sm" onClick={() => bulk.mutate({ action: "mark_sent", invoiceIds: [...selectedInvoices] })} className="gap-1"><Send className="h-3 w-3" /> Mark sent</Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "mark_overdue", invoiceIds: [...selectedInvoices] })}>Mark overdue</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedInvoices(new Set())}>Clear</Button>
            </Card>
          )}
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9"><Checkbox checked={selectedInvoices.size === allInvoiceIds.length && allInvoiceIds.length > 0} onCheckedChange={toggleAllInvoices} /></TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id} className={selectedInvoices.has(inv.id) ? "bg-blue-50/40" : ""}>
                    <TableCell><Checkbox checked={selectedInvoices.has(inv.id)} onCheckedChange={c => { const n = new Set(selectedInvoices); c ? n.add(inv.id) : n.delete(inv.id); setSelectedInvoices(n); }} /></TableCell>
                    <TableCell><Link href={`/admin/invoices/${inv.id}`}><span className="font-medium hover:underline">{inv.invoiceNumber}</span></Link></TableCell>
                    <TableCell className="text-sm"><Link href={`/admin/orders/${inv.orderId}`}><span className="hover:underline">{inv.orderNumber}</span></Link></TableCell>
                    <TableCell className="text-sm">{inv.partnerName}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline">{modelLabel(inv.billingExecModel)}</Badge></TableCell>
                    <TableCell><Badge className={tone(inv.isOverdue ? "overdue" : inv.status)}>{inv.isOverdue ? "overdue" : inv.status}</Badge></TableCell>
                    <TableCell className="text-sm">{money(inv.totalAmount)}</TableCell>
                    <TableCell className="text-sm">{money(inv.amountPaid)}</TableCell>
                    <TableCell className="text-sm">{money(inv.balanceDue)}</TableCell>
                    <TableCell className="text-xs">{inv.dueDate || "—"}</TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">No invoices</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
