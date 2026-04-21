import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { Download, AlertTriangle, TrendingUp, DollarSign, Package, Truck, Calendar, Users, Building2, MapPin, Layers, Tags } from "lucide-react";

const fmt = (n: number) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;
const COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#eab308", "#ef4444", "#14b8a6", "#6366f1"];

type Filters = {
  from: string; to: string;
  partnerId: string; portalType: string; cityId: string; supplierId: string; billingExecModel: string;
};
const EMPTY_FILTERS: Filters = { from: "", to: "", partnerId: "", portalType: "", cityId: "", supplierId: "", billingExecModel: "" };

function buildQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function KpiCard({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; icon?: any }) {
  const toneCls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

function FiltersBar({ filters, setFilters, partners, suppliers, cities }: any) {
  const set = (k: keyof Filters, v: string) => setFilters((f: Filters) => ({ ...f, [k]: v }));
  return (
    <Card className="mb-4">
      <CardContent className="grid grid-cols-2 gap-3 pt-6 md:grid-cols-7">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={filters.from} onChange={e => set("from", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={filters.to} onChange={e => set("to", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Partner</label>
          <Select value={filters.partnerId || "all"} onValueChange={v => set("partnerId", v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {(partners || []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Portal type</label>
          <Select value={filters.portalType || "all"} onValueChange={v => set("portalType", v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="standard">standard</SelectItem>
              <SelectItem value="event">event</SelectItem>
              <SelectItem value="custom">custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">City</label>
          <Select value={filters.cityId || "all"} onValueChange={v => set("cityId", v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {(cities || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Supplier</label>
          <Select value={filters.supplierId || "all"} onValueChange={v => set("supplierId", v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {(suppliers || []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Billing model</label>
          <Select value={filters.billingExecModel || "all"} onValueChange={v => set("billingExecModel", v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              <SelectItem value="a3_handles_billing">A3 bills</SelectItem>
              <SelectItem value="partner_handles_billing">Partner bills</SelectItem>
              <SelectItem value="external_handles_billing">External</SelectItem>
              <SelectItem value="not_required">Not required</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function exportCsv(view: string, filters: Filters, extra: Record<string, string> = {}) {
  const url = `/api/analytics/export${buildQuery(filters, { view, ...extra })}`;
  window.open(url, "_blank");
}

// ---------------- Overview ----------------
function OverviewTab({ filters }: { filters: Filters }) {
  const q = buildQuery(filters);
  const { data: k } = useQuery({ queryKey: ["analytics-kpis", q], queryFn: () => apiFetch<any>(`/api/analytics/kpis${q}`) });
  const { data: t } = useQuery({ queryKey: ["analytics-trends", q], queryFn: () => apiFetch<any>(`/api/analytics/trends${q}&granularity=month`) });
  const m = k?.money || {};
  const c = k?.counts || {};
  const trendData = t || [];
  const statusData = useMemo(() => Object.entries(k?.statusCounts || {}).map(([name, value]) => ({ name, value })), [k]);
  const billingData = useMemo(() => Object.entries(k?.billingCounts || {}).map(([name, value]) => ({ name, value })), [k]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Retail booked" value={fmt(m.totalRetail)} sub={`${c.orders || 0} orders`} icon={DollarSign} />
        <KpiCard label="Invoiced" value={fmt(m.totalInvoiced)} sub={`${fmt(m.totalCollected || 0)} collected`} icon={DollarSign} />
        <KpiCard label="Outstanding A/R" value={fmt(m.totalOutstanding)} tone={m.totalOutstanding > 0 ? "warn" : undefined} icon={DollarSign} />
        <KpiCard label="Est. gross margin" value={fmt(m.estGrossMargin)} sub={fmtPct(m.estMarginPct)} tone="good" icon={TrendingUp} />
        <KpiCard label="Actual gross margin" value={fmt(m.actGrossMargin)} sub={fmtPct(m.actMarginPct)} tone="good" icon={TrendingUp} />
        <KpiCard label="Supplier est. cost" value={fmt(m.totalEst)} icon={Truck} />
        <KpiCard label="Supplier final cost" value={fmt(m.totalFin)} sub={`${m.totalFin > m.totalEst ? "+" : ""}${fmt((m.totalFin || 0) - (m.totalEst || 0))} vs est.`} icon={Truck} />
        <KpiCard label="Commission expected" value={fmt(m.totalExpComm)} sub={`${fmt(m.totalPaidComm)} paid`} />
        <KpiCard label="Commission variance" value={fmt(m.commVariance)} tone={m.commVariance > 0 ? "warn" : "good"} />
        <KpiCard label="Active partners" value={String(c.activePartners || 0)} icon={Users} />
        <KpiCard label="Open discrepancies" value={String(c.openDiscrepancies || 0)} tone={c.openDiscrepancies ? "bad" : undefined} icon={AlertTriangle} />
        <KpiCard label="Overdue invoices" value={String(c.overdueInvoices || 0)} tone={c.overdueInvoices ? "bad" : undefined} />
        <KpiCard label="Blocked orders" value={String(c.blockedOrders || 0)} tone={c.blockedOrders ? "bad" : undefined} />
        <KpiCard label="Shortages" value={String(c.shortageOrders || 0)} tone={c.shortageOrders ? "warn" : undefined} />
        <KpiCard label="Upcoming events (60d)" value={String(c.upcomingEvents || 0)} icon={Calendar} />
        <KpiCard label="At-risk events" value={String(c.atRiskEvents || 0)} tone={c.atRiskEvents ? "bad" : undefined} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Retail vs supplier cost over time</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Legend />
                <Area type="monotone" dataKey="retail" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} name="Retail" />
                <Area type="monotone" dataKey="estCost" stroke="#f97316" fill="#f97316" fillOpacity={0.2} name="Est. cost" />
                <Area type="monotone" dataKey="finCost" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} name="Final cost" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Margin trend</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Legend />
                <Line type="monotone" dataKey="estMargin" stroke="#22c55e" name="Est. margin" />
                <Line type="monotone" dataKey="actMargin" stroke="#14b8a6" name="Actual margin" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Commission expected vs paid</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Legend />
                <Bar dataKey="expComm" fill="#a855f7" name="Expected" />
                <Bar dataKey="paidComm" fill="#6366f1" name="Paid" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Orders by status / billing model</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2" style={{ height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={70} label>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={billingData} dataKey="value" nameKey="name" outerRadius={70} label>
                    {billingData.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Profitability ----------------
const DIMS = [
  { v: "partner", label: "Partner", icon: Building2 },
  { v: "event", label: "Event", icon: Calendar },
  { v: "city", label: "City", icon: MapPin },
  { v: "portalType", label: "Portal type", icon: Layers },
  { v: "billingModel", label: "Billing model", icon: DollarSign },
  { v: "supplier", label: "Supplier", icon: Truck },
  { v: "package", label: "Package", icon: Package },
  { v: "zone", label: "Branding zone", icon: Tags },
  { v: "productCategory", label: "Product category", icon: Layers },
];

function ProfitabilityTab({ filters }: { filters: Filters }) {
  const [dim, setDim] = useState("partner");
  const q = buildQuery(filters, { dimension: dim });
  const { data, isLoading } = useQuery({ queryKey: ["analytics-prof", q], queryFn: () => apiFetch<any[]>(`/api/analytics/profitability${q}`) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {DIMS.map(d => (
            <Button key={d.v} variant={dim === d.v ? "default" : "outline"} size="sm" onClick={() => setDim(d.v)}>
              <d.icon className="mr-1.5 h-3.5 w-3.5" />{d.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => exportCsv("profitability", filters, { dimension: dim })}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{DIMS.find(d => d.v === dim)?.label}</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Retail</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
                <TableHead className="text-right">Final cost</TableHead>
                <TableHead className="text-right">Est. margin</TableHead>
                <TableHead className="text-right">Actual margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Comm. var.</TableHead>
                <TableHead className="text-right">Open A/R</TableHead>
                <TableHead className="text-right">Avg order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11}>Loading…</TableCell></TableRow>}
              {(data || []).map((r: any) => (
                <TableRow key={String(r.key)}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                  <TableCell className="text-right">{fmt(r.retail)}</TableCell>
                  <TableCell className="text-right">{fmt(r.estCost)}</TableCell>
                  <TableCell className="text-right">{fmt(r.finCost)}</TableCell>
                  <TableCell className="text-right">{fmt(r.estMargin)}</TableCell>
                  <TableCell className="text-right">{fmt(r.actMargin)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.actMarginPct > 30 ? "default" : r.actMarginPct < 15 ? "destructive" : "secondary"}>{fmtPct(r.actMarginPct)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.commVariance)}</TableCell>
                  <TableCell className="text-right">{fmt(r.outstanding)}</TableCell>
                  <TableCell className="text-right">{fmt(r.avgOrderValue)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && !(data || []).length && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Suppliers ----------------
function SuppliersTab({ filters }: { filters: Filters }) {
  const q = buildQuery(filters);
  const { data } = useQuery({ queryKey: ["analytics-suppliers", q], queryFn: () => apiFetch<any[]>(`/api/analytics/suppliers${q}`) });
  const rows = data || [];
  const top5 = useMemo(() => [...rows].slice(0, 5), [rows]);
  const issues = useMemo(() => [...rows].sort((a, b) => b.issueRate - a.issueRate).slice(0, 5), [rows]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top 5 by revenue</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={top5} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} />
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Bar dataKey="revenue" fill="#0ea5e9" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Highest issue-rate suppliers</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={issues} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" width={110} />
                <Tooltip formatter={(v: any) => `${(v as number).toFixed(1)}%`} />
                <Bar dataKey="issueRate" fill="#ef4444" name="Issue rate" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => exportCsv("suppliers", filters)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
                <TableHead className="text-right">Final cost</TableHead>
                <TableHead className="text-right">Cost var.</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Shortages</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Due soon</TableHead>
                <TableHead className="text-right">Issue %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.supplierId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                  <TableCell className="text-right">{r.itemCount}</TableCell>
                  <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.estCost)}</TableCell>
                  <TableCell className="text-right">{fmt(r.finCost)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.costVariance > 0 ? "text-rose-600" : r.costVariance < 0 ? "text-emerald-600" : ""}>{fmt(r.costVariance)}</span>
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.actMargin)}</TableCell>
                  <TableCell className="text-right">{r.blockedItems > 0 ? <Badge variant="destructive">{r.blockedItems}</Badge> : 0}</TableCell>
                  <TableCell className="text-right">{r.shortageItems || 0}</TableCell>
                  <TableCell className="text-right">{r.overdueItems > 0 ? <Badge variant="destructive">{r.overdueItems}</Badge> : 0}</TableCell>
                  <TableCell className="text-right">{r.dueSoonItems || 0}</TableCell>
                  <TableCell className="text-right">{fmtPct(r.issueRate)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">No supplier activity in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Catalog (packages/zones/products) ----------------
function CatalogTab({ filters }: { filters: Filters }) {
  const q = buildQuery(filters);
  const { data: packages } = useQuery({ queryKey: ["a-pkg", q], queryFn: () => apiFetch<any[]>(`/api/analytics/packages${q}`) });
  const { data: zones } = useQuery({ queryKey: ["a-zone", q], queryFn: () => apiFetch<any[]>(`/api/analytics/zones${q}`) });
  const { data: products } = useQuery({ queryKey: ["a-prod", q], queryFn: () => apiFetch<any[]>(`/api/analytics/products${q}`) });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Package performance</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => exportCsv("packages", filters)}><Download className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Package</TableHead><TableHead className="text-right">Selected</TableHead><TableHead className="text-right">Retail</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
              <TableBody>
                {(packages || []).slice(0, 12).map((r: any) => (
                  <TableRow key={String(r.key)}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right">{r.itemCount}</TableCell>
                    <TableCell className="text-right">{fmt(r.retail)}</TableCell>
                    <TableCell className="text-right">{fmt(r.estMargin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Branding zone usage</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => exportCsv("zones", filters)}><Download className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Zone</TableHead><TableHead className="text-right">Selected</TableHead><TableHead className="text-right">Retail</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
              <TableBody>
                {(zones || []).slice(0, 12).map((r: any) => (
                  <TableRow key={String(r.key)}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right">{r.itemCount}</TableCell>
                    <TableCell className="text-right">{fmt(r.retail)}</TableCell>
                    <TableCell className="text-right">{fmt(r.estMargin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Product performance</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => exportCsv("products", filters)}><Download className="h-3.5 w-3.5" /> Export</Button>
          </div>
          <CardDescription>Demand mix, shortages, and missing-spec exposure by product.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Print only</TableHead>
                <TableHead className="text-right">Full unit</TableHead>
                <TableHead className="text-right">Shortages</TableHead>
                <TableHead className="text-right">Missing artwork</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products || []).map((r: any) => (
                <TableRow key={r.productId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right">{r.quantity}</TableCell>
                  <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.estMargin)}</TableCell>
                  <TableCell className="text-right">{r.printOnly}</TableCell>
                  <TableCell className="text-right">{r.fullUnit}</TableCell>
                  <TableCell className="text-right">{r.shortages > 0 ? <Badge variant="destructive">{r.shortages}</Badge> : 0}</TableCell>
                  <TableCell className="text-right">{r.missingArtwork > 0 ? <Badge variant="secondary">{r.missingArtwork}</Badge> : 0}</TableCell>
                </TableRow>
              ))}
              {!(products || []).length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No product activity.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Forecast ----------------
function ForecastTab({ filters }: { filters: Filters }) {
  const q = buildQuery(filters);
  const { data } = useQuery({ queryKey: ["analytics-forecast", q], queryFn: () => apiFetch<any>(`/api/analytics/forecast${q}`) });
  const horizons = data?.horizons || [];
  const stages = data?.stages || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {horizons.map((h: any) => (
          <Card key={h.key}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{h.label}</CardTitle><CardDescription>{h.eventCount} events · {h.orderCount} orders</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground">Forecast retail</div><div className="text-lg font-semibold">{fmt(h.retail)}</div></div>
                <div><div className="text-muted-foreground">Est. cost</div><div className="text-lg font-semibold">{fmt(h.estCost)}</div></div>
                <div><div className="text-muted-foreground">Est. margin</div><div className="text-lg font-semibold text-emerald-600">{fmt(h.estMargin)}</div></div>
                <div><div className="text-muted-foreground">Exp. commission</div><div className="text-lg font-semibold">{fmt(h.expComm)}</div></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Pipeline by stage</CardTitle><CardDescription>Operations-driven, derived from current order state.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Retail</TableHead><TableHead className="text-right">Est. cost</TableHead><TableHead className="text-right">Est. margin</TableHead><TableHead className="text-right">Exp. commission</TableHead></TableRow></TableHeader>
            <TableBody>
              {stages.map((s: any) => (
                <TableRow key={s.key}>
                  <TableCell><Badge variant={s.key === "at_risk" || s.key === "delayed" ? "destructive" : s.key === "confirmed" ? "default" : "secondary"}>{s.label}</Badge></TableCell>
                  <TableCell className="text-right">{s.orderCount}</TableCell>
                  <TableCell className="text-right">{fmt(s.retail)}</TableCell>
                  <TableCell className="text-right">{fmt(s.estCost)}</TableCell>
                  <TableCell className="text-right">{fmt(s.estMargin)}</TableCell>
                  <TableCell className="text-right">{fmt(s.expComm)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Risk ----------------
function RiskTab({ filters }: { filters: Filters }) {
  const q = buildQuery(filters);
  const { data } = useQuery({ queryKey: ["analytics-risk", q], queryFn: () => apiFetch<any>(`/api/analytics/risk${q}`) });
  const c = data?.counts || {};
  return (
    <div className="space-y-4">
      <Card className="border-rose-200 bg-rose-50/40">
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-rose-700">Revenue at risk</div>
            <div className="text-3xl font-semibold text-rose-700">{fmt(data?.revenueAtRisk || 0)}</div>
            <div className="text-xs text-muted-foreground">Sum of retail tied to any order with blocked items, shortages, or missing artwork.</div>
          </div>
          <AlertTriangle className="h-10 w-10 text-rose-600" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Blocked orders" value={String(c.blockedOrders || 0)} tone="bad" />
        <KpiCard label="Blocked items" value={String(c.blockedItems || 0)} tone="bad" />
        <KpiCard label="Shortages" value={String(c.shortages || 0)} tone="warn" />
        <KpiCard label="Missing artwork" value={String(c.missingArtwork || 0)} tone="warn" />
        <KpiCard label="Unassigned items" value={String(c.unassignedItems || 0)} tone="warn" />
        <KpiCard label="Overdue invoices" value={String(c.overdueInvoices || 0)} tone="bad" />
        <KpiCard label="Unreconciled" value={String(c.unreconciled || 0)} tone="warn" />
        <KpiCard label="Commission discrepancies" value={String(c.commissionDiscrepancies || 0)} tone="warn" />
        <KpiCard label="Events approaching w/ issues" value={String(c.eventsApproaching || 0)} tone="bad" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RiskList title="Blocked orders" rows={data?.blockedOrders} cols={[["orderNumber", "Order"], ["retail", "Retail", true]]} linkOrder />
        <RiskList title="Overdue invoices" rows={data?.overdueInvoices} cols={[["invoiceNumber", "Invoice"], ["dueDate", "Due"], ["balanceDue", "Balance", true]]} linkInvoice />
        <RiskList title="Shortages" rows={data?.shortages} cols={[["orderNumber", "Order"], ["name", "Item"], ["shortageQuantity", "Short qty"]]} linkOrder />
        <RiskList title="Missing artwork" rows={data?.missingArtwork} cols={[["orderNumber", "Order"], ["name", "Item"]]} linkOrder />
        <RiskList title="Events approaching with issues" rows={data?.eventsApproaching} cols={[["name", "Event"], ["daysOut", "Days out"], ["issues", "Issues"]]} />
        <RiskList title="Commission discrepancies" rows={data?.commissionDiscrepancies} cols={[["orderNumber", "Order"], ["expected", "Expected", true], ["paid", "Paid", true], ["variance", "Variance", true]]} linkOrder />
      </div>
    </div>
  );
}

function RiskList({ title, rows, cols, linkOrder, linkInvoice }: { title: string; rows: any[]; cols: [string, string, boolean?][]; linkOrder?: boolean; linkInvoice?: boolean }) {
  const list = rows || [];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle><CardDescription>{list.length} record(s)</CardDescription></CardHeader>
      <CardContent>
        {list.length === 0 ? <div className="text-sm text-muted-foreground">All clear.</div> : (
          <Table>
            <TableHeader><TableRow>{cols.map(c => <TableHead key={c[0]} className={c[2] ? "text-right" : ""}>{c[1]}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {list.slice(0, 10).map((r, i) => (
                <TableRow key={i}>
                  {cols.map(c => {
                    const v = r[c[0]];
                    const display = Array.isArray(v) ? v.join(", ") : c[2] ? fmt(Number(v)) : (v ?? "");
                    if (c[0] === "orderNumber" && linkOrder && r.orderId) return <TableCell key={c[0]}><Link href={`/admin/orders/${r.orderId}`} className="text-blue-600 hover:underline">{display}</Link></TableCell>;
                    if (c[0] === "invoiceNumber" && linkInvoice && r.invoiceId) return <TableCell key={c[0]}><Link href={`/admin/invoices/${r.invoiceId}`} className="text-blue-600 hover:underline">{display}</Link></TableCell>;
                    return <TableCell key={c[0]} className={c[2] ? "text-right" : ""}>{display}</TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Page shell ----------------
export default function Analytics() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { data: partners } = useQuery({ queryKey: ["partners-light"], queryFn: () => apiFetch<any[]>(`/api/partners`) });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers-light"], queryFn: () => apiFetch<any[]>(`/api/suppliers`) });
  const { data: cities } = useQuery({ queryKey: ["cities-light"], queryFn: () => apiFetch<any[]>(`/api/cities`) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Executive analytics</h1>
          <p className="text-sm text-muted-foreground">Revenue, profitability, supplier performance, forecast, and operational risk across the portal.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</Button>
      </div>
      <FiltersBar filters={filters} setFilters={setFilters} partners={partners} suppliers={suppliers} cities={cities} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="profit">Profitability</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="catalog">Packages / zones / products</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab filters={filters} /></TabsContent>
        <TabsContent value="profit"><ProfitabilityTab filters={filters} /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab filters={filters} /></TabsContent>
        <TabsContent value="catalog"><CatalogTab filters={filters} /></TabsContent>
        <TabsContent value="forecast"><ForecastTab filters={filters} /></TabsContent>
        <TabsContent value="risk"><RiskTab filters={filters} /></TabsContent>
      </Tabs>
    </div>
  );
}
