import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck } from "lucide-react";

type VOrder = { id: number; orderNumber: string; partnerName?: string; eventName?: string; venueName?: string; fulfillmentMode: string | null; status: string; fulfillmentStatus: string | null; contactName: string; createdAt: string };
type Supplier = { id: number; name: string };

export default function VendorPortal() {
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], queryFn: () => apiFetch("/api/suppliers") });
  const [supplierId, setSupplierId] = useState<string>("");
  const { data: orders = [], isLoading } = useQuery<VOrder[]>({ queryKey: ["/api/vendor/orders", supplierId], queryFn: () => apiFetch(`/api/vendor/orders?supplierId=${supplierId}`), enabled: !!supplierId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Fulfillment View</h1>
        <p className="text-muted-foreground mt-1">Switch supplier perspective to see assigned orders</p>
      </div>
      <Card className="p-5">
        <div className="flex items-center gap-3 max-w-md">
          <Truck className="h-5 w-5 text-muted-foreground" />
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      {supplierId && (isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-muted/50"><TableHead>Order #</TableHead><TableHead>Partner</TableHead><TableHead>Event</TableHead><TableHead>Venue</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {orders.map(o => (
                <TableRow key={o.id}>
                  <TableCell><Link href={`/admin/orders/${o.id}`}><span className="font-mono text-xs text-primary hover:underline">{o.orderNumber}</span></Link></TableCell>
                  <TableCell className="text-sm">{o.partnerName}</TableCell>
                  <TableCell className="text-sm">{o.eventName || "—"}</TableCell>
                  <TableCell className="text-sm">{o.venueName || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{o.fulfillmentMode || "—"}</Badge></TableCell>
                  <TableCell><Badge>{o.status}</Badge></TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No orders assigned to this supplier.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
