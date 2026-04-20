import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Trash2, AlertTriangle, Package, MapPin, Boxes } from "lucide-react";

type InvRow = { id: number; cityId: number; cityName?: string; name: string | null; productName?: string | null; displayName: string; total: number; available: number; reserved: number; reorderThreshold: number; isLow: boolean; storageLocation: string | null; assetType: string };
type Reservation = { id: number; inventoryId: number; quantity: number; status: string; inventoryName?: string | null; productName?: string | null; cityName?: string | null; notes: string | null };

export function EventInventoryDialog({ eventId, eventName, eventCityId, trigger }: { eventId: number; eventName: string; eventCityId?: number | null; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pickInvId, setPickInvId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [filterCity, setFilterCity] = useState<string>(eventCityId?.toString() || "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: inventory = [], isLoading: invLoading } = useQuery<InvRow[]>({
    queryKey: ["/api/inventory", { eventCity: filterCity }],
    queryFn: () => apiFetch(`/api/inventory${filterCity ? `?cityId=${filterCity}` : ""}`),
    enabled: open,
  });
  const { data: reservations = [], isLoading: resLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/inventory/reservations", { eventId }],
    queryFn: () => apiFetch(`/api/inventory/reservations?eventId=${eventId}`),
    enabled: open,
  });
  const { data: cities = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/cities"], queryFn: () => apiFetch("/api/cities"), enabled: open,
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["/api/inventory"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory/reservations"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory/shortages"] });
  };

  const create = useMutation({
    mutationFn: (body: any) => apiFetch("/api/inventory/reservations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { refetch(); toast({ title: "Reserved" }); setPickInvId(""); setQty("1"); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const onErr = (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" });
  const release = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "released" }) }),
    onSuccess: () => { refetch(); toast({ title: "Released" }); }, onError: onErr,
  });
  const fulfill = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "fulfilled" }) }),
    onSuccess: () => { refetch(); toast({ title: "Marked in use" }); }, onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/inventory/reservations/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); toast({ title: "Reservation removed" }); }, onError: onErr,
  });

  const selectedInv = useMemo(() => inventory.find(i => i.id.toString() === pickInvId) || null, [inventory, pickInvId]);
  const requestedQty = parseInt(qty) || 0;
  const willShort = selectedInv ? requestedQty > selectedInv.available : false;

  const activeRes = reservations.filter(r => r.status === "active");
  const fulfilledRes = reservations.filter(r => r.status === "fulfilled");
  const releasedRes = reservations.filter(r => r.status === "released");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inventory · {eventName}</DialogTitle>
          <DialogDescription>Reserve hardware and reusable assets for this event. Reservations reduce available inventory.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Card className="p-4 bg-muted/30">
            <div className="text-sm font-semibold mb-2">Reserve from inventory</div>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <Label className="text-xs">City</Label>
                <Select value={filterCity || "all"} onValueChange={v => { setFilterCity(v === "all" ? "" : v); setPickInvId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-6">
                <Label className="text-xs">Asset</Label>
                <Select value={pickInvId} onValueChange={setPickInvId}>
                  <SelectTrigger><SelectValue placeholder={invLoading ? "Loading…" : "Select an asset"} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {inventory.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No inventory in this city.</div>}
                    {inventory.map(i => (
                      <SelectItem key={i.id} value={i.id.toString()}>
                        <span className="font-medium">{i.displayName}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{i.cityName} · {i.available}/{i.total} available</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div className="col-span-1">
                <Button className="w-full gap-1" disabled={!selectedInv || requestedQty < 1 || create.isPending} onClick={() => create.mutate({ inventoryId: selectedInv!.id, eventId, quantity: requestedQty })}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {selectedInv && (
              <div className={`mt-3 text-xs flex items-center gap-1.5 ${willShort ? "text-red-600" : "text-emerald-600"}`}>
                {willShort ? (
                  <><AlertTriangle className="h-3.5 w-3.5" />Shortfall: only {selectedInv.available} available — you'll need to order {requestedQty - selectedInv.available} more.</>
                ) : (
                  <>✓ Enough inventory available ({selectedInv.available} on hand).</>
                )}
              </div>
            )}
          </Card>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Reserved for this event</h3>
              <span className="text-xs text-muted-foreground">{activeRes.length} active{fulfilledRes.length > 0 && ` · ${fulfilledRes.length} in use`}</span>
            </div>
            {resLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : reservations.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground"><Boxes className="h-8 w-8 mx-auto mb-1 opacity-40" />No reservations yet.</Card>
            ) : (
              <div className="border rounded-xl bg-card overflow-hidden">
                {[...activeRes, ...fulfilledRes, ...releasedRes].map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border-b last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="font-medium truncate">{r.inventoryName || r.productName} <span className="font-normal text-muted-foreground">×{r.quantity}</span></div>
                        <Badge variant={r.status === "active" ? "default" : r.status === "fulfilled" ? "secondary" : "outline"} className="text-[10px]">{r.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-2.5 w-2.5" />{r.cityName}</div>
                    </div>
                    <div className="flex gap-1">
                      {r.status === "active" && <>
                        <Button size="sm" variant="outline" disabled={fulfill.isPending} onClick={() => fulfill.mutate(r.id)}>Mark in use</Button>
                        <Button size="sm" variant="outline" disabled={release.isPending} onClick={() => release.mutate(r.id)}>Release</Button>
                      </>}
                      {r.status === "fulfilled" && <Button size="sm" variant="outline" disabled={release.isPending} onClick={() => release.mutate(r.id)}>Return</Button>}
                      <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => { if (confirm("Remove?")) remove.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
