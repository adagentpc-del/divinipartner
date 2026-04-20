import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, MapPin, Calendar, AlertTriangle, Boxes, Package, TrendingDown } from "lucide-react";

type Summary = {
  partnerId: number;
  partnerName: string;
  cities: { cityId: number; cityName: string | null; total: number; available: number; reserved: number; inUse: number; assetCount: number; lowCount: number }[];
  inventory: { id: number; cityId: number; cityName: string | null; productId: number | null; productName: string | null; name: string | null; assetType: string | null; total: number; available: number; reserved: number | null; inUse: number | null; isLow: boolean; overcommitted: boolean; displayName: string }[];
  reservations: { id: number; inventoryId: number; inventoryName: string | null; productName: string | null; eventId: number | null; eventName: string | null; eventStartDate: string | null; cityName: string | null; quantity: number; status: string; notes: string | null }[];
  upcomingByEvent: { eventId: number; eventName: string | null; eventStartDate: string | null; cityName: string | null; reservations: any[]; totalUnits: number; statuses: Record<string, number> }[];
  totals: { assetCount: number; total: number; available: number; reserved: number; inUse: number; onOrder: number; lowCount: number; overcommittedCount: number };
};

export default function CommittedInventory() {
  const { id } = useParams<{ id: string }>();
  const partnerId = parseInt(id);
  const { data, isLoading } = useQuery<Summary>({ queryKey: [`/api/partners/${partnerId}/inventory-summary`], queryFn: () => apiFetch(`/api/partners/${partnerId}/inventory-summary`) });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="py-24 text-center text-muted-foreground">No inventory summary.</div>;

  const shortageItems = data.inventory.filter(i => i.overcommitted || i.isLow);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/partners"><Button variant="ghost" size="sm" className="gap-1 -ml-3 mb-2"><ChevronLeft className="h-4 w-4" />Back to partners</Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">{data.partnerName} — Committed Inventory</h1>
        <p className="text-muted-foreground mt-1">{data.totals.assetCount} assets across {data.cities.length} cit{data.cities.length === 1 ? "y" : "ies"}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> Total units</div><div className="text-2xl font-bold tabular-nums mt-1">{data.totals.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Available</div><div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">{data.totals.available}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Reserved</div><div className="text-2xl font-bold tabular-nums mt-1 text-violet-600">{data.totals.reserved}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">In use</div><div className="text-2xl font-bold tabular-nums mt-1 text-blue-600">{data.totals.inUse}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Low / over-committed</div><div className={`text-2xl font-bold tabular-nums mt-1 ${data.totals.lowCount + data.totals.overcommittedCount > 0 ? "text-amber-600" : ""}`}>{data.totals.lowCount + data.totals.overcommittedCount}</div></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">By city</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming commitments ({data.upcomingByEvent.length})</TabsTrigger>
          <TabsTrigger value="shortages">Shortages ({shortageItems.length})</TabsTrigger>
          <TabsTrigger value="all">All assets ({data.inventory.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 mt-4">
          {data.cities.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No assets owned by this partner yet.</p>}
          {data.cities.map(c => {
            const cityAssets = data.inventory.filter(i => i.cityId === c.cityId);
            return (
              <Card key={c.cityId}>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{c.cityName || `City #${c.cityId}`}</span><span className="text-xs text-muted-foreground font-normal">{c.assetCount} assets · {c.total} units</span></CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center mb-3">
                    <div className="p-2 rounded bg-emerald-50"><div className="text-xs text-emerald-700">Available</div><div className="font-bold text-emerald-700">{c.available}</div></div>
                    <div className="p-2 rounded bg-violet-50"><div className="text-xs text-violet-700">Reserved</div><div className="font-bold text-violet-700">{c.reserved}</div></div>
                    <div className="p-2 rounded bg-blue-50"><div className="text-xs text-blue-700">In use</div><div className="font-bold text-blue-700">{c.inUse}</div></div>
                    <div className="p-2 rounded bg-amber-50"><div className="text-xs text-amber-700">Low</div><div className="font-bold text-amber-700">{c.lowCount}</div></div>
                  </div>
                  <div className="space-y-1">
                    {cityAssets.map(a => (
                      <div key={a.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                        <span className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-muted-foreground" />{a.displayName}{a.isLow && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Low</Badge>}{a.overcommitted && <Badge variant="destructive" className="text-[10px]">Over-committed</Badge>}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{a.available} / {a.total}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4 space-y-2">
          {data.upcomingByEvent.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No upcoming commitments.</p>}
          {data.upcomingByEvent.map(e => (
            <Card key={e.eventId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{e.eventName}</span>
                  <span className="text-xs text-muted-foreground font-normal">{e.cityName} · {e.eventStartDate || "Date TBD"} · {e.totalUnits} units committed</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(e.statuses).map(([st, ct]) => <Badge key={st} variant="outline" className="text-[10px] capitalize">{st}: {ct}</Badge>)}
                </div>
                <div className="space-y-1">
                  {e.reservations.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-muted-foreground" />{r.inventoryName || r.productName || `#${r.inventoryId}`}<span className="text-xs text-muted-foreground">({r.status})</span></span>
                      <span className="text-xs tabular-nums">{r.quantity} units</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="shortages" className="mt-4">
          {shortageItems.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No shortages — inventory is healthy.</p> : (
            <Card>
              <CardContent className="pt-6 space-y-2">
                {shortageItems.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2"><TrendingDown className="h-3.5 w-3.5 text-amber-600" />{a.displayName}</div>
                      <div className="text-xs text-muted-foreground">{a.cityName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-700">{a.available} available</div>
                      <div className="text-xs text-muted-foreground">{a.total} total · {a.reserved || 0} reserved · {a.inUse || 0} in use</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-1">
              {data.inventory.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{a.displayName}</div>
                    <div className="text-xs text-muted-foreground">{a.cityName} · {a.assetType || "asset"}</div>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <div>{a.available} / {a.total}</div>
                    <div className="text-muted-foreground">{a.reserved || 0} res · {a.inUse || 0} use</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
