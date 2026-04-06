import { Link } from "wouter";
import { useListRequests } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function RequestsList() {
  const { data, isLoading } = useListRequests();
  const requests = data?.requests || [];

  if (isLoading) {
    return <div>Loading requests...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Name</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.eventName}</TableCell>
                <TableCell>{request.partnerName}</TableCell>
                <TableCell>{request.contactName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{request.status}</Badge>
                </TableCell>
                <TableCell>{format(new Date(request.createdAt), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/requests/${request.id}`}>
                    <Button variant="ghost" size="sm">View Details</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No requests found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
