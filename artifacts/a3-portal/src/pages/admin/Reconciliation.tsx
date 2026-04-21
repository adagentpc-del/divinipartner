import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calculator, AlertTriangle, DollarSign, FileSpreadsheet, Flag, Save, Plus, ExternalLink, Trash2, RefreshCw } from "lucide-react";

type Recon = { id: number; orderNumber: string; partnerName?: string | null; eventName?: string | null; supplierName?: string | null; paymentModel: string; billingEntity?: string | null; totalEstimate: string | null; supplierEstimatedCost: string | null; supplierFinalCost: string | null; expectedCommission: string | null; paidCommission: string | null; commissionStatus: string; supplierPayableStatus: string; paymentStatus: string; reconciliationStatus: string; reconciliationNotes: string | null; financeNotes: string | null; commissionPaidDate: string | null; commissionPaidThrough: string | null; payoutStatus: string; grossMargin: number; commissionVariance: number; supplierCostVariance: number; openDiscrepancies: number; discrepancies: any[] };
type Summary = { totalRetailBooked: number; totalEstimatedSupplierCost: number; totalFinalSupplierCost: number; expectedCommission: number; paidCommission: number; commissionVarianceTotal: number; supplierCostVarianceTotal: number; openDiscrepanciesCount: number; awaitingReconciliationCount: number; ordersTotal: number; byBillingModel: Record<string, number>; byReconciliationStatus: Record<string, number> };
type Discrepancy = { id: number; orderId: number; orderNumber?: string | null; partnerName?: string | null; type: string; severity: string; status: string; reason: string | null; notes: string | null; expectedAmount: string | null; actualAmount: string | null; varianceAmount: string | null; createdAt: string; resolvedAt: string | null; resolutionNotes: string | null };

const PAYMENT_MODELS = ["partner_billed", "client_direct", "a3_billed", "prepaid"];
const RECON_STATUSES = ["not_started", "in_review", "waiting_payment", "waiting_supplier_final", "waiting_commission", "discrepancy_found", "reconciled"];
const COMMISSION_STATUSES = ["not_started", "expected", "partially_paid", "paid", "disputed", "verified"];
const SUPPLIER_PAYABLE_STATUSES = ["not_started", "invoiced", "paid", "overdue"];
const PAYMENT_STATUSES = ["not_charged", "invoiced", "paid", "refunded"];

const TONE: Record<string, string> = {
  reconciled: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-100 text-emerald-800",
  verified: "bg-emerald-200 text-emerald-900",
  open: "bg-red-100 text-red-800",
  in_review: "bg-amber-100 text-amber-800",
  discrepancy_found: "bg-red-100 text-red-800",
  waiting_payment: "bg-amber-100 text-amber-800",
  waiting_supplier_final: "bg-amber-100 text-amber-800",
  waiting_commission: "bg-amber-100 text-amber-800",
  not_started: "bg-zinc-100 text-zinc-700",
  expected: "bg-blue-100 text-blue-800",
  partially_paid: "bg-amber-100 text-amber-800",
  disputed: "bg-red-100 text-red-800",
  invoiced: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
  resolved: "bg-emerald-100 text-emerald-800",
  wont_fix: "bg-zinc-200 text-zinc-700",
  critical: "bg-red-200 text-red-900",
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};
const tone = (s: string) => TONE[s] || "bg-zinc-100 text-zinc-700";
const money = (v: number | string | null) => {
  const n = typeof v === "number" ? v : parseFloat(v || "0");
  return isNaN(n) ? "$0.00" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function Reconciliation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    partnerId: "", reconciliationStatus: "", commissionStatus: "", paymentModel: "", supplierPayableStatus: "",
    discrepancyOnly: false, missingSupplierFinal: false, missingCommissionVerification: false, missingPaymentConfirmation: false,
  });
  const [search, setSearch] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.partnerId) p.set("partnerId", filters.partnerId);
    if (filters.reconciliationStatus) p.set("reconciliationStatus", filters.reconciliationStatus);
    if (filters.commissionStatus) p.set("commissionStatus", filters.commissionStatus);
    if (filters.paymentModel) p.set("paymentModel", filters.paymentModel);
    if (filters.supplierPayableStatus) p.set("supplierPayableStatus", filters.supplierPayableStatus);
    if (filters.discrepancyOnly) p.set("discrepancyOnly", "true");
    if (filters.missingSupplierFinal) p.set("missingSupplierFinal", "true");
    if (filters.missingCommissionVerification) p.set("missingCommissionVerification", "true");
    if (filters.missingPaymentConfirmation) p.set("missingPaymentConfirmation", "true");
    return p.toString();
  }, [filters]);

  const { data: summary } = useQuery<Summary>({ queryKey: ["/api/reconciliation/summary"], queryFn: () => apiFetch("/api/reconciliation/summary") });
  const { data: rows = [], isLoading } = useQuery<Recon[]>({ queryKey: ["/api/reconciliation/orders", qs], queryFn: () => apiFetch(`/api/reconciliation/orders${qs ? `?${qs}` : ""}`) });
  const { data: discrepancies = [] } = useQuery<Discrepancy[]>({ queryKey: ["/api/discrepancies"], queryFn: () => apiFetch("/api/discrepancies") });
  const { data: partners = [] } = useQuery<{ id: number; companyName: string }[]>({ queryKey: ["/api/partners"], queryFn: () => apiFetch("/api/partners") });

  const filtered = rows.filter(r => !search || r.orderNumber.toLowerCase().includes(search.toLowerCase()) || (r.partnerName || "").toLowerCase().includes(search.toLowerCase()) || (r.eventName || "").toLowerCase().includes(search.toLowerCase()));

  const autoFlag = useMutation({
    mutationFn: (orderId: number) => apiFetch(`/api/reconciliation/orders/${orderId}/auto-flag`, { method: "POST" }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/discrepancies"] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] });
      toast({ title: `Auto-flagged ${res.flaggedCount} discrepancies` });
    },
  });

  const exportFinance = () => {
    const url = `/api/exports/finance.csv${qs ? `?${qs}` : ""}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Calculator className="h-6 w-6 text-primary" /> Reconciliation</h1>
          <p className="text-muted-foreground mt-1">Verify supplier costs, commissions, and finalize the books per order.</p>
        </div>
        <Button onClick={exportFinance} variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Export finance CSV</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Retail booked" value={money(summary?.totalRetailBooked || 0)} sub={`${summary?.ordersTotal || 0} orders`} />
        <SummaryCard label="Supplier final cost" value={money(summary?.totalFinalSupplierCost || 0)} sub={`est ${money(summary?.totalEstimatedSupplierCost || 0)}`} tone={summary && summary.supplierCostVarianceTotal !== 0 ? (summary.supplierCostVarianceTotal > 0 ? "warn" : "good") : undefined} />
        <SummaryCard label="Commission paid" value={money(summary?.paidCommission || 0)} sub={`expected ${money(summary?.expectedCommission || 0)}`} tone={summary && Math.abs(summary.commissionVarianceTotal) > 0.5 ? "warn" : "good"} />
        <SummaryCard label="Awaiting recon" value={String(summary?.awaitingReconciliationCount || 0)} sub="not finalized" tone={summary && summary.awaitingReconciliationCount > 0 ? "warn" : undefined} icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryCard label="Open discrepancies" value={String(summary?.openDiscrepanciesCount || 0)} sub={summary?.openDiscrepanciesCount ? "needs review" : "clean"} tone={summary && summary.openDiscrepanciesCount > 0 ? "bad" : "good"} icon={<Flag className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders ({filtered.length})</TabsTrigger>
          <TabsTrigger value="discrepancies">Discrepancies ({discrepancies.filter(d => d.status === "open" || d.status === "in_review").length})</TabsTrigger>
          <TabsTrigger value="commission">Commission</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Search order #, partner, event…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
            <Select value={filters.partnerId || "all"} onValueChange={v => setFilters({ ...filters, partnerId: v === "all" ? "" : v })}><SelectTrigger className="w-40"><SelectValue placeholder="All partners" /></SelectTrigger><SelectContent><SelectItem value="all">All partners</SelectItem>{partners.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}</SelectContent></Select>
            <Select value={filters.paymentModel || "all"} onValueChange={v => setFilters({ ...filters, paymentModel: v === "all" ? "" : v })}><SelectTrigger className="w-44"><SelectValue placeholder="Any billing model" /></SelectTrigger><SelectContent><SelectItem value="all">Any billing model</SelectItem>{PAYMENT_MODELS.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            <Select value={filters.reconciliationStatus || "all"} onValueChange={v => setFilters({ ...filters, reconciliationStatus: v === "all" ? "" : v })}><SelectTrigger className="w-48"><SelectValue placeholder="Any recon status" /></SelectTrigger><SelectContent><SelectItem value="all">Any recon status</SelectItem>{RECON_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            <Select value={filters.commissionStatus || "all"} onValueChange={v => setFilters({ ...filters, commissionStatus: v === "all" ? "" : v })}><SelectTrigger className="w-44"><SelectValue placeholder="Any commission status" /></SelectTrigger><SelectContent><SelectItem value="all">Any commission status</SelectItem>{COMMISSION_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            <Button variant={filters.discrepancyOnly ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, discrepancyOnly: !filters.discrepancyOnly })}>Discrepancies only</Button>
            <Button variant={filters.missingSupplierFinal ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, missingSupplierFinal: !filters.missingSupplierFinal })}>Missing final cost</Button>
            <Button variant={filters.missingCommissionVerification ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, missingCommissionVerification: !filters.missingCommissionVerification })}>Commission unverified</Button>
            <Button variant={filters.missingPaymentConfirmation ? "default" : "outline"} size="sm" onClick={() => setFilters({ ...filters, missingPaymentConfirmation: !filters.missingPaymentConfirmation })}>Unpaid</Button>
          </div>

          <div className="border rounded-xl bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead>Order</TableHead><TableHead>Partner / Event</TableHead><TableHead>Billing</TableHead>
                <TableHead className="text-right">Retail</TableHead><TableHead className="text-right">Cost (est→final)</TableHead><TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Commission</TableHead><TableHead>Recon</TableHead><TableHead>Issues</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin inline" /></TableCell></TableRow>}
                {!isLoading && filtered.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setActiveOrderId(r.id)}>
                    <TableCell><span className="font-mono text-xs text-primary">{r.orderNumber}</span></TableCell>
                    <TableCell className="text-sm"><div>{r.partnerName || "—"}</div><div className="text-xs text-muted-foreground">{r.eventName || "—"}</div></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.paymentModel.replace(/_/g, " ")}</Badge><div className="text-[10px] text-muted-foreground mt-0.5">{r.billingEntity || "—"}</div></TableCell>
                    <TableCell className="text-right font-medium">{money(r.totalEstimate)}</TableCell>
                    <TableCell className="text-right text-sm"><span className="text-muted-foreground">{money(r.supplierEstimatedCost)}</span> → <span className={r.supplierCostVariance > 0 ? "text-red-700 font-medium" : r.supplierCostVariance < 0 ? "text-emerald-700 font-medium" : ""}>{r.supplierFinalCost ? money(r.supplierFinalCost) : "—"}</span></TableCell>
                    <TableCell className={`text-right font-medium ${r.grossMargin < 0 ? "text-red-700" : ""}`}>{money(r.grossMargin)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <div>{money(r.paidCommission)} / <span className="text-muted-foreground">{money(r.expectedCommission)}</span></div>
                      <Badge variant="outline" className={`text-[10px] ${tone(r.commissionStatus)}`}>{r.commissionStatus.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell><Badge className={`text-[10px] ${tone(r.reconciliationStatus)}`}>{r.reconciliationStatus.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>
                      {r.openDiscrepancies > 0 ? <Badge className="bg-red-100 text-red-800">⚠ {r.openDiscrepancies}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">No orders matched these filters.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="discrepancies" className="space-y-3">
          <div className="border rounded-xl bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/50"><TableHead>Created</TableHead><TableHead>Order</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Variance</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {discrepancies.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">No discrepancies recorded.</TableCell></TableRow>}
                {discrepancies.map(d => (
                  <DiscrepancyRow key={d.id} d={d} onOpenOrder={(oid) => setActiveOrderId(oid)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="commission" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => filtered.forEach(r => autoFlag.mutate(r.id))}>
              <RefreshCw className="h-4 w-4" /> Auto-flag visible orders
            </Button>
          </div>
          <div className="border rounded-xl bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead>Order</TableHead><TableHead>Partner</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Status</TableHead><TableHead>Through</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.filter(r => r.expectedCommission || r.paidCommission).map(r => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setActiveOrderId(r.id)}>
                    <TableCell className="font-mono text-xs text-primary">{r.orderNumber}</TableCell>
                    <TableCell className="text-sm">{r.partnerName || "—"}</TableCell>
                    <TableCell className="text-right">{money(r.expectedCommission)}</TableCell>
                    <TableCell className="text-right">{money(r.paidCommission)}</TableCell>
                    <TableCell className={`text-right font-medium ${Math.abs(r.commissionVariance) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>{money(r.commissionVariance)}</TableCell>
                    <TableCell><Badge className={`text-[10px] ${tone(r.commissionStatus)}`}>{r.commissionStatus.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{r.commissionPaidThrough || "—"}</TableCell>
                    <TableCell className="text-xs">{r.commissionPaidDate || "—"}</TableCell>
                  </TableRow>
                ))}
                {filtered.filter(r => r.expectedCommission || r.paidCommission).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">No commission rows yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={activeOrderId != null} onOpenChange={(o) => !o && setActiveOrderId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {activeOrderId && <ReconDrawer orderId={activeOrderId} onClose={() => setActiveOrderId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; icon?: React.ReactNode }) {
  const tonecls = tone === "good" ? "border-emerald-200 bg-emerald-50/50" : tone === "warn" ? "border-amber-200 bg-amber-50/50" : tone === "bad" ? "border-red-200 bg-red-50/50" : "";
  return (
    <Card className={`p-4 ${tonecls}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        {icon || <DollarSign className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function DiscrepancyRow({ d, onOpenOrder }: { d: Discrepancy; onOpenOrder: (id: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useMutation({
    mutationFn: (patch: any) => apiFetch(`/api/discrepancies/${d.id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/discrepancies"] }); qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] }); toast({ title: "Updated" }); },
  });
  const del = useMutation({
    mutationFn: () => apiFetch(`/api/discrepancies/${d.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/discrepancies"] }); qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] }); },
  });
  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">{d.createdAt.slice(0, 10)}</TableCell>
      <TableCell><button className="font-mono text-xs text-primary hover:underline" onClick={() => onOpenOrder(d.orderId)}>{d.orderNumber}</button><div className="text-[10px] text-muted-foreground">{d.partnerName || ""}</div></TableCell>
      <TableCell className="text-xs">{d.type.replace(/_/g, " ")}</TableCell>
      <TableCell><Badge className={`text-[10px] ${tone(d.severity)}`}>{d.severity}</Badge></TableCell>
      <TableCell><Select value={d.status} onValueChange={v => update.mutate({ status: v })}><SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger><SelectContent>{["open","in_review","resolved","wont_fix"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></TableCell>
      <TableCell className="text-xs max-w-xs">{d.reason || "—"}</TableCell>
      <TableCell className="text-right text-xs">{d.varianceAmount ? money(d.varianceAmount) : "—"}</TableCell>
      <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate()}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
    </TableRow>
  );
}

function ReconDrawer({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: order } = useQuery<Recon>({ queryKey: ["/api/reconciliation/orders", "drawer", orderId], queryFn: async () => {
    const all = await apiFetch<Recon[]>("/api/reconciliation/orders");
    return all.find(o => o.id === orderId)!;
  } });
  const { data: payouts = [] } = useQuery<any[]>({ queryKey: [`/api/orders/${orderId}/commission-payouts`], queryFn: () => apiFetch(`/api/orders/${orderId}/commission-payouts`) });
  const [form, setForm] = useState<any>({});
  const [payout, setPayout] = useState({ amount: "", paidDate: "", paidThrough: "ach", reference: "", notes: "" });

  // Sync form when order loads
  useMemo(() => {
    if (order) setForm({
      paymentModel: order.paymentModel, billingEntity: order.billingEntity || "",
      paymentStatus: order.paymentStatus,
      supplierEstimatedCost: order.supplierEstimatedCost || "", supplierFinalCost: order.supplierFinalCost || "",
      expectedCommission: order.expectedCommission || "", paidCommission: order.paidCommission || "",
      commissionStatus: order.commissionStatus, supplierPayableStatus: order.supplierPayableStatus,
      reconciliationStatus: order.reconciliationStatus,
      reconciliationNotes: order.reconciliationNotes || "", financeNotes: order.financeNotes || "",
    });
  }, [order?.id]);

  const update = useMutation({
    mutationFn: (patch: any) => apiFetch(`/api/reconciliation/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] });
      qc.invalidateQueries({ queryKey: [`/api/orders/${orderId}`] });
      toast({ title: "Saved" });
    },
  });
  const addPayout = useMutation({
    mutationFn: () => apiFetch(`/api/orders/${orderId}/commission-payouts`, { method: "POST", body: JSON.stringify(payout) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/orders/${orderId}/commission-payouts`] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] });
      setPayout({ amount: "", paidDate: "", paidThrough: "ach", reference: "", notes: "" });
      toast({ title: "Payout recorded" });
    },
  });
  const autoFlag = useMutation({
    mutationFn: () => apiFetch(`/api/reconciliation/orders/${orderId}/auto-flag`, { method: "POST" }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/discrepancies"] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] });
      toast({ title: `Flagged ${res.flaggedCount} new` });
    },
  });
  const delPayout = useMutation({
    mutationFn: (pid: number) => apiFetch(`/api/orders/${orderId}/commission-payouts/${pid}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/orders/${orderId}/commission-payouts`] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/reconciliation/summary"] });
    },
  });

  if (!order) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center justify-between">
          <span>Reconcile <span className="font-mono text-sm text-primary">{order.orderNumber}</span></span>
          <div className="flex gap-2">
            <Link href={`/admin/orders/${orderId}`}><Button variant="ghost" size="sm" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" />Open order</Button></Link>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(`/api/exports/orders/${orderId}/packet.html`, "_blank")}><FileSpreadsheet className="h-3.5 w-3.5" />Packet</Button>
          </div>
        </SheetTitle>
      </SheetHeader>

      <div className="space-y-5 mt-5">
        {/* Sub-totals */}
        <Card className="p-4 bg-muted/30">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-[10px] text-muted-foreground uppercase">Retail</div><div className="font-bold">{money(order.totalEstimate)}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Supplier final</div><div className="font-bold">{order.supplierFinalCost ? money(order.supplierFinalCost) : <span className="text-muted-foreground">—</span>}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Margin</div><div className={`font-bold ${order.grossMargin < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(order.grossMargin)}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Expected commission</div><div className="font-medium">{money(order.expectedCommission)}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Paid commission</div><div className="font-medium">{money(order.paidCommission)}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Variance</div><div className={`font-medium ${Math.abs(order.commissionVariance) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>{money(order.commissionVariance)}</div></div>
          </div>
        </Card>

        {/* Form */}
        <Card className="p-4 space-y-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Billing & costs</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Payment model</Label><Select value={form.paymentModel} onValueChange={v => setForm({ ...form, paymentModel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_MODELS.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Billing entity</Label><Input value={form.billingEntity || ""} onChange={e => setForm({ ...form, billingEntity: e.target.value })} placeholder="Who is invoiced" /></div>
            <div><Label className="text-xs">Payment status</Label><Select value={form.paymentStatus} onValueChange={v => setForm({ ...form, paymentStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Supplier payable</Label><Select value={form.supplierPayableStatus} onValueChange={v => setForm({ ...form, supplierPayableStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPLIER_PAYABLE_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Estimated supplier cost</Label><Input value={form.supplierEstimatedCost || ""} onChange={e => setForm({ ...form, supplierEstimatedCost: e.target.value })} placeholder="0.00" /></div>
            <div><Label className="text-xs">Final supplier cost</Label><Input value={form.supplierFinalCost || ""} onChange={e => setForm({ ...form, supplierFinalCost: e.target.value })} placeholder="0.00" /></div>
            <div><Label className="text-xs">Expected commission</Label><Input value={form.expectedCommission || ""} onChange={e => setForm({ ...form, expectedCommission: e.target.value })} placeholder="0.00" /></div>
            <div><Label className="text-xs">Commission status</Label><Select value={form.commissionStatus} onValueChange={v => setForm({ ...form, commissionStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMMISSION_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide pt-2">Reconciliation</div>
          <div><Label className="text-xs">Reconciliation status</Label><Select value={form.reconciliationStatus} onValueChange={v => setForm({ ...form, reconciliationStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECON_STATUSES.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Finance notes</Label><Textarea value={form.financeNotes || ""} onChange={e => setForm({ ...form, financeNotes: e.target.value })} rows={2} placeholder="Internal finance notes" /></div>
          <div><Label className="text-xs">Reconciliation notes</Label><Textarea value={form.reconciliationNotes || ""} onChange={e => setForm({ ...form, reconciliationNotes: e.target.value })} rows={2} placeholder="What was verified, what's outstanding" /></div>

          <div className="flex gap-2 pt-1">
            <Button onClick={() => update.mutate(form)} disabled={update.isPending} className="gap-2 flex-1">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</Button>
            <Button variant="outline" onClick={() => autoFlag.mutate()} className="gap-2"><Flag className="h-4 w-4" />Auto-flag</Button>
          </div>
        </Card>

        {/* Discrepancies */}
        <Card className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Discrepancies ({order.discrepancies.length})</div>
          {order.discrepancies.length === 0 && <div className="text-xs text-muted-foreground">None recorded.</div>}
          {order.discrepancies.map(d => (
            <div key={d.id} className="text-xs flex items-start gap-2 border-l-2 border-amber-300 pl-2 py-1">
              <Badge className={`text-[10px] ${tone(d.severity)}`}>{d.severity}</Badge>
              <div className="flex-1">
                <div className="font-medium">{d.type.replace(/_/g, " ")} <Badge variant="outline" className={`text-[10px] ml-1 ${tone(d.status)}`}>{d.status.replace(/_/g, " ")}</Badge></div>
                {d.reason && <div className="text-muted-foreground">{d.reason}</div>}
                {d.varianceAmount && <div className="text-muted-foreground">Variance: {money(d.varianceAmount)}</div>}
              </div>
            </div>
          ))}
        </Card>

        {/* Commission payouts */}
        <Card className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Commission payouts ({payouts.length})</div>
          {payouts.length === 0 && <div className="text-xs text-muted-foreground">No payouts recorded.</div>}
          {payouts.map(p => (
            <div key={p.id} className="text-xs flex items-center justify-between border-b py-1.5">
              <div>
                <div className="font-medium">{money(p.amount)} <span className="text-muted-foreground">via {p.paidThrough || "—"}</span></div>
                <div className="text-muted-foreground">{p.paidDate || "—"} {p.reference ? `· ${p.reference}` : ""}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delPayout.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <Input placeholder="Amount" value={payout.amount} onChange={e => setPayout({ ...payout, amount: e.target.value })} />
            <Input type="date" value={payout.paidDate} onChange={e => setPayout({ ...payout, paidDate: e.target.value })} />
            <Select value={payout.paidThrough} onValueChange={v => setPayout({ ...payout, paidThrough: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["ach","check","wire","platform"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Reference" value={payout.reference} onChange={e => setPayout({ ...payout, reference: e.target.value })} />
          </div>
          <Button size="sm" onClick={() => addPayout.mutate()} disabled={!payout.amount || addPayout.isPending} className="w-full gap-1"><Plus className="h-3.5 w-3.5" />Record payout</Button>
        </Card>
      </div>
    </>
  );
}
