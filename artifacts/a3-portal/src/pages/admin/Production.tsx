import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CheckCircle2, Clock, AlertTriangle, Send, RotateCcw, FileText, ExternalLink } from "lucide-react";

type DashboardData = {
  counters: { awaitingReview: number; awaitingApproval: number; approved: number; vendorReleased: number; revisionRequested: number; superseded: number };
  latest: any[];
  byEvent: Record<string, number>;
  bySupplier: Record<string, number>;
  orderIssues: Array<{ orderId: number; orderNumber: string; partnerId: number; total: number; ready: number; blocked: number; missingArtwork: number; awaitingApproval: number }>;
};

function Counter({ icon: Icon, label, value, tone }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
          <p className="text-3xl font-semibold mt-1">{value}</p>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default function Production() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/production/dashboard"],
    queryFn: () => apiFetch("/api/production/dashboard"),
  });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"], queryFn: () => apiFetch("/api/events") });
  const { data: suppliers = [] } = useQuery<any[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const eventName = (id: string) => events.find(e => String(e.id) === String(id))?.name || `Event #${id}`;
  const supplierName = (id: string) => suppliers.find(s => String(s.id) === String(id))?.name || `Supplier #${id}`;

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Production Review</h1>
          <p className="text-muted-foreground mt-1">Asset readiness, approvals, and vendor handoff for the production floor.</p>
        </div>

        {isLoading || !data ? (
          <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Counter icon={Clock} label="Awaiting review" value={data.counters.awaitingReview} tone="bg-amber-100 text-amber-800" />
              <Counter icon={FileText} label="Awaiting approval" value={data.counters.awaitingApproval} tone="bg-orange-100 text-orange-800" />
              <Counter icon={RotateCcw} label="Revision requested" value={data.counters.revisionRequested} tone="bg-red-100 text-red-800" />
              <Counter icon={CheckCircle2} label="Approved" value={data.counters.approved} tone="bg-emerald-100 text-emerald-800" />
              <Counter icon={Send} label="Vendor released" value={data.counters.vendorReleased} tone="bg-indigo-100 text-indigo-800" />
              <Counter icon={AlertTriangle} label="Superseded" value={data.counters.superseded} tone="bg-zinc-100 text-zinc-700" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Orders with asset issues</h2>
                  <Badge variant="outline">{data.orderIssues.length}</Badge>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {data.orderIssues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No issues — every reviewed order is ready.</p>
                  ) : data.orderIssues.map(o => (
                    <div key={o.orderId} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{o.ready}/{o.total} ready</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {o.missingArtwork > 0 && <Badge className="bg-red-100 text-red-800">{o.missingArtwork} missing</Badge>}
                        {o.awaitingApproval > 0 && <Badge className="bg-amber-100 text-amber-800">{o.awaitingApproval} pending</Badge>}
                        {o.blocked > 0 && <Badge className="bg-orange-100 text-orange-800">{o.blocked} blocked</Badge>}
                        <Link href={`/admin/orders/${o.orderId}`}>
                          <Button variant="ghost" size="icon"><ExternalLink className="h-4 w-4" /></Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <h2 className="font-semibold mb-3">Latest uploads</h2>
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {data.latest.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No assets uploaded yet.</p>
                  ) : data.latest.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded border">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.category.replace(/_/g," ")} · v{a.version}</p>
                      </div>
                      <Badge variant="outline">{a.status.replace(/_/g," ")}</Badge>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <h2 className="font-semibold mb-3">Assets by event</h2>
                {Object.keys(data.byEvent).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No event-tagged assets.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(data.byEvent).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <div key={id} className="flex items-center justify-between text-sm py-1">
                        <span>{eventName(id)}</span>
                        <Badge variant="secondary">{n}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="font-semibold mb-3">Assets by supplier</h2>
                {Object.keys(data.bySupplier).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No supplier-tagged assets.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(data.bySupplier).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <div key={id} className="flex items-center justify-between text-sm py-1">
                        <span>{supplierName(id)}</span>
                        <Badge variant="secondary">{n}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
    </div>
  );
}
