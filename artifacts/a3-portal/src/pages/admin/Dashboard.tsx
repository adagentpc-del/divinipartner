import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Activity, TrendingUp, ArrowUpRight, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  "New": "bg-blue-50 text-blue-700 border-blue-200",
  "Reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "Quote prep": "bg-violet-50 text-violet-700 border-violet-200",
  "Quote sent": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Closed won": "bg-green-50 text-green-700 border-green-200",
  "Closed lost": "bg-red-50 text-red-700 border-red-200",
};

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your partner portal activity.</p>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Partners</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalPartners || 0}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {summary?.activePartners || 0} currently active
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalRequests || 0}</div>
            <Link href="/admin/requests">
              <span className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </span>
            </Link>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Today</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.newRequestsToday || 0}</div>
            <p className="text-sm text-muted-foreground mt-1">Submissions today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Partners</CardTitle>
              <Link href="/admin/partners">
                <span className="text-sm text-muted-foreground hover:text-primary transition-colors">View all</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {summary?.recentPartners?.length ? summary.recentPartners.map(partner => (
                <div key={partner.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground uppercase">
                      {partner.companyName?.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{partner.companyName}</p>
                      <p className="text-xs text-muted-foreground">/partner/{partner.slug}</p>
                    </div>
                  </div>
                  <Badge variant={partner.isActive ? "default" : "secondary"} className="text-xs">
                    {partner.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-6">No partners yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Requests by Status</CardTitle>
              <Link href="/admin/requests">
                <span className="text-sm text-muted-foreground hover:text-primary transition-colors">View all</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {summary?.requestsByStatus?.length ? summary.requestsByStatus.map(stat => (
                <div key={stat.status} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_COLORS[stat.status] || "bg-muted text-muted-foreground border-border"}`}>
                      {stat.status}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{stat.count}</span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-6">No requests yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
