import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPartners || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.activePartners || 0} active
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalRequests || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.newRequestsToday || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Basic list of recent partners as requested */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Partners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary?.recentPartners?.map(partner => (
                <div key={partner.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{partner.companyName}</p>
                    <p className="text-sm text-muted-foreground">{partner.slug}</p>
                  </div>
                  <div className="text-sm">{partner.isActive ? "Active" : "Inactive"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary?.requestsByStatus?.map(stat => (
                <div key={stat.status} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{stat.status}</span>
                  <span className="text-sm text-muted-foreground">{stat.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
