import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, ShoppingCart, AlertTriangle, ArrowUpRight, Loader2, Clock, Truck, Calendar, TrendingUp, Boxes } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

type Summary = {
  totalPartners: number; activePartners: number; orderingPartners: number; brandingPartners: number;
  totalRequests: number; newRequestsToday: number;
  totalOrders: number; pendingOrders: number; unassignedOrders: number; ordersToday: number;
  requestsByStatus: { status: string; count: number }[];
  recentPartners: { id: number; companyName: string; slug: string; isActive: boolean; partnerType: string | null }[];
  recentOrders: { id: number; orderNumber: string; partnerName: string | null; status: string; createdAt: string; contactName: string; totalEstimate: string | null }[];
  lowInventory: { id: number; cityName: string | null; productName: string | null; onHand: number; reserved: number; threshold: number }[];
  upcomingEvents: { id: number; name: string; eventStartDate: string | null; shippingDeadline: string | null; partnerName: string | null; cityName: string | null }[];
};

const ORDER_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-violet-50 text-violet-700 border-violet-200",
  in_production: "bg-amber-50 text-amber-700 border-amber-200",
  shipped: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function StatCard({ icon: Icon, label, value, sub, color = "primary", href }: { icon: any; label: string; value: number | string; sub?: string; color?: string; href?: string }) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    rose: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  const card = (
    <Card className="relative overflow-hidden hover:shadow-md transition">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function Dashboard() {
  const { data: s, isLoading, isError, refetch } = useQuery<Summary>({ queryKey: ["/api/dashboard/summary"], queryFn: () => apiFetch("/api/dashboard/summary") });

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError || !s) return (
    <Card className="max-w-md mx-auto mt-12 border-destructive/40">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Couldn't load dashboard</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">The dashboard summary failed to load. Check that the API is running.</p>
        <button onClick={() => refetch()} className="text-sm font-medium text-primary hover:underline">Retry</button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Operations overview across all partners and orders.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Partners" value={s.totalPartners} sub={`${s.activePartners} active · ${s.orderingPartners} ordering · ${s.brandingPartners} branding`} href="/admin/partners" />
        <StatCard icon={ShoppingCart} label="Total Orders" value={s.totalOrders} sub={`${s.ordersToday} today`} color="emerald" href="/admin/orders" />
        <StatCard icon={Clock} label="Pending Orders" value={s.pendingOrders} sub={`${s.unassignedOrders} unassigned`} color="amber" href="/admin/orders" />
        <StatCard icon={FileText} label="Intake Requests" value={s.totalRequests} sub={`${s.newRequestsToday} new today`} color="violet" href="/admin/requests" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-muted-foreground" />Recent Orders</CardTitle>
              <Link href="/admin/orders"><span className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3" /></span></Link>
            </div>
          </CardHeader>
          <CardContent>
            {s.recentOrders.length ? (
              <div className="space-y-1">
                {s.recentOrders.map(o => (
                  <Link key={o.id} href={`/admin/orders/${o.id}`}>
                    <div className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">{o.orderNumber}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${ORDER_BADGE[o.status] || "bg-muted"}`}>{o.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{o.partnerName} · {o.contactName}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {o.totalEstimate && <div className="text-sm font-semibold">${o.totalEstimate}</div>}
                        <div className="text-[10px] text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No orders yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Low Inventory</CardTitle></CardHeader>
          <CardContent>
            {s.lowInventory.length ? (
              <div className="space-y-1">
                {s.lowInventory.map(i => {
                  const avail = i.onHand - i.reserved;
                  return (
                    <div key={i.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{i.productName}</p>
                        <p className="text-xs text-muted-foreground">{i.cityName}</p>
                      </div>
                      <Badge variant={avail <= 0 ? "destructive" : "outline"} className="text-xs ml-2 shrink-0">{avail} left</Badge>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">All inventory healthy.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {s.upcomingEvents.length ? (
              <div className="space-y-1">
                {s.upcomingEvents.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.partnerName} · {e.cityName}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs font-medium">{e.eventStartDate}</div>
                      {e.shippingDeadline && <div className="text-[10px] text-amber-600">Ship by {e.shippingDeadline}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No upcoming events.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />Recent Partners</CardTitle></CardHeader>
          <CardContent>
            {s.recentPartners.length ? (
              <div className="space-y-1">
                {s.recentPartners.map(p => (
                  <Link key={p.id} href={`/admin/partners/${p.id}/edit`}>
                    <div className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold uppercase shrink-0">{p.companyName?.slice(0,2)}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{p.companyName}</p>
                          <p className="text-xs text-muted-foreground truncate">/{p.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.partnerType && <Badge variant="outline" className="text-[10px] capitalize">{p.partnerType}</Badge>}
                        <Badge variant={p.isActive ? "default" : "secondary"} className="text-[10px]">{p.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No partners yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
