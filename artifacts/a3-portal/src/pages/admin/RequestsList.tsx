import { Link } from "wouter";
import { useListRequests } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, FileText, ArrowUpRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  "New": "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  "Reviewing": "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  "Waiting for files": "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100",
  "Waiting for dimensions": "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100",
  "Quote prep": "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  "Quote sent": "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  "Follow up": "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
  "Closed won": "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  "Closed lost": "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
};

export default function RequestsList() {
  const { data, isLoading } = useListRequests();
  const requests = data?.requests || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground mt-1">{requests.length} total submission{requests.length !== 1 ? "s" : ""}</p>
      </div>

      {requests.length > 0 ? (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold">Event Name</TableHead>
                <TableHead className="font-semibold">Partner</TableHead>
                <TableHead className="font-semibold">Contact</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id} className="group">
                  <TableCell>
                    <Link href={`/admin/requests/${request.id}`}>
                      <span className="font-medium text-primary hover:underline cursor-pointer">{request.eventName}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{request.partnerName}</TableCell>
                  <TableCell className="text-muted-foreground">{request.contactName}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_STYLES[request.status] || "bg-muted text-muted-foreground border-border"}`}>
                      {request.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{format(new Date(request.createdAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/requests/${request.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-primary">
                        View <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-card">
          <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">No requests yet</p>
          <p className="text-sm text-muted-foreground mt-1">Requests will appear here when partners submit them.</p>
        </div>
      )}
    </div>
  );
}
