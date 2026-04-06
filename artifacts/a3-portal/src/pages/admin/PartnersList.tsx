import { Link } from "wouter";
import { useListPartners } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export default function PartnersList() {
  const { data: partners, isLoading } = useListPartners();

  if (isLoading) {
    return <div>Loading partners...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
        <Link href="/admin/partners/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Partner
          </Button>
        </Link>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Slug / URL</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners?.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.companyName}</TableCell>
                <TableCell>
                  <Link href={`/partner/${partner.slug}`}>
                    <div className="text-primary hover:underline cursor-pointer">/partner/{partner.slug}</div>
                  </Link>
                </TableCell>
                <TableCell>{partner.contactName} ({partner.contactEmail})</TableCell>
                <TableCell>
                  <Badge variant={partner.isActive ? "default" : "secondary"}>
                    {partner.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/partners/${partner.id}/edit`}>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {partners?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  No partners found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
