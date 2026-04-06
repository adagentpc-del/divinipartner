import { Link } from "wouter";
import { useListPartners } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Users, ExternalLink } from "lucide-react";

export default function PartnersList() {
  const { data: partners, isLoading } = useListPartners();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
          <p className="text-muted-foreground mt-1">{partners?.length || 0} partner{partners?.length !== 1 ? "s" : ""} configured</p>
        </div>
        <Link href="/admin/partners/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Partner
          </Button>
        </Link>
      </div>

      {partners && partners.length > 0 ? (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold">Company</TableHead>
                <TableHead className="font-semibold">Portal URL</TableHead>
                <TableHead className="font-semibold">Contact</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partner) => (
                <TableRow key={partner.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground uppercase shrink-0">
                        {partner.companyName?.slice(0, 2)}
                      </div>
                      <span className="font-medium">{partner.companyName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/partner/${partner.slug}`}>
                      <span className="text-sm text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
                        /partner/{partner.slug}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{partner.contactName}</p>
                      <p className="text-xs text-muted-foreground">{partner.contactEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={partner.isActive ? "default" : "secondary"} className="text-xs">
                      {partner.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/partners/${partner.id}/edit`}>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">Edit</Button>
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
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">No partners yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first partner to get started.</p>
          <Link href="/admin/partners/new">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Partner</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
