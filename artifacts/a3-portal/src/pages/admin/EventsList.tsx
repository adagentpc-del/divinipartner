import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Pencil, Trash2, Calendar, Copy, ChevronLeft, MapPin, Boxes } from "lucide-react";
import { EventInventoryDialog } from "@/components/admin/EventInventoryDialog";
import { UnitPreferenceSelect } from "@/components/units/DimensionInput";

import type { Event as SchemaEvent, PartnerAddon as SchemaPartnerAddon, City as SchemaCity, Venue as SchemaVenue, Package as SchemaPackage } from "@workspace/db/schema";
type AddonOverride = { mode: "inherit" | "override"; productIds?: number[]; categories?: string[] } | null;
type EventRow = SchemaEvent & { cityName?: string | null; venueName?: string | null };
type PartnerAddon = Omit<SchemaPartnerAddon, "productId"> & { productId: number; productName: string | null; productCategory: string | null };
type City = Pick<SchemaCity, "id" | "name">;
type Venue = Pick<SchemaVenue, "id" | "name" | "cityId">;
type Pkg = Pick<SchemaPackage, "id" | "name" | "tier">;

const STATUS_OPTIONS = ["draft", "upcoming", "live", "completed", "archived"];
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  upcoming: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
  archived: "bg-zinc-100 text-zinc-500",
};

function EventDialog({ partnerId, cities, venues, packages, ev, trigger, onSaved }: { partnerId: number; cities: City[]; venues: Venue[]; packages: Pkg[]; ev?: EventRow | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: ev?.name || "",
    cityId: ev?.cityId?.toString() || "",
    venueId: ev?.venueId?.toString() || "",
    eventStartDate: ev?.eventStartDate || "",
    eventEndDate: ev?.eventEndDate || "",
    installDate: ev?.installDate || "",
    teardownDate: ev?.teardownDate || "",
    shippingDeadline: ev?.shippingDeadline || "",
    status: ev?.status || "draft",
    notes: ev?.notes || "",
    isActive: ev?.isActive ?? true,
    availablePackageIds: ev?.availablePackageIdsJson || [],
    unitPreference: ((ev as any)?.unitPreference || "") as string,
    addonMode: (ev?.addonOverrideJson?.mode || "inherit") as "inherit" | "override",
    addonProductIds: (ev?.addonOverrideJson?.productIds || []) as number[],
    // Section 36
    addonCategories: (ev?.addonOverrideJson?.categories || []) as string[],
    addonDisplayFormat: (((ev as any)?.addonDisplayFormat as string | null) || "") as "" | "flat" | "grid" | "category_tiles",
  });
  // Partner add-on library — fetched lazily so the picker shows real products
  // even when the dialog opens for a brand-new event.
  const { data: partnerAddons = [] } = useQuery<PartnerAddon[]>({
    queryKey: [`/api/partners/${partnerId}/addons`],
    queryFn: () => apiFetch(`/api/partners/${partnerId}/addons`),
    enabled: open,
  });
  const filteredVenues = form.cityId ? venues.filter(v => v.cityId === parseInt(form.cityId)) : venues;

  const handleSave = async () => {
    try {
      const body: any = {
        partnerId,
        name: form.name,
        cityId: form.cityId ? parseInt(form.cityId) : null,
        venueId: form.venueId ? parseInt(form.venueId) : null,
        eventStartDate: form.eventStartDate || null,
        eventEndDate: form.eventEndDate || null,
        installDate: form.installDate || null,
        teardownDate: form.teardownDate || null,
        shippingDeadline: form.shippingDeadline || null,
        status: form.status,
        notes: form.notes || null,
        isActive: form.isActive,
        availablePackageIdsJson: form.availablePackageIds,
        unitPreference: form.unitPreference || null,
        addonOverrideJson: {
          mode: form.addonMode,
          ...(form.addonMode === "override" ? { productIds: form.addonProductIds } : {}),
          ...(form.addonCategories.length > 0 ? { categories: form.addonCategories } : {}),
        },
        addonDisplayFormat: form.addonDisplayFormat || null,
      };
      if (ev) await apiFetch(`/api/events/${ev.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/events`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: ev ? "Event updated" : "Event created" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  const togglePackage = (pkgId: number) => {
    setForm({ ...form, availablePackageIds: form.availablePackageIds.includes(pkgId) ? form.availablePackageIds.filter(id => id !== pkgId) : [...form.availablePackageIds, pkgId] });
  };
  const toggleAddon = (productId: number) => {
    setForm({ ...form, addonProductIds: form.addonProductIds.includes(productId) ? form.addonProductIds.filter(id => id !== productId) : [...form.addonProductIds, productId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ev ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Event Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label><Select value={form.cityId} onValueChange={v => setForm({ ...form, cityId: v, venueId: "" })}><SelectTrigger><SelectValue placeholder="Choose city" /></SelectTrigger><SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Venue</Label><Select value={form.venueId} onValueChange={v => setForm({ ...form, venueId: v })}><SelectTrigger><SelectValue placeholder="Choose venue" /></SelectTrigger><SelectContent>{filteredVenues.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Event Start Date</Label><Input type="date" value={form.eventStartDate} onChange={e => setForm({ ...form, eventStartDate: e.target.value })} /></div>
            <div><Label>Event End Date</Label><Input type="date" value={form.eventEndDate} onChange={e => setForm({ ...form, eventEndDate: e.target.value })} /></div>
            <div><Label>Install Date</Label><Input type="date" value={form.installDate} onChange={e => setForm({ ...form, installDate: e.target.value })} /></div>
            <div><Label>Teardown Date</Label><Input type="date" value={form.teardownDate} onChange={e => setForm({ ...form, teardownDate: e.target.value })} /></div>
            <div><Label>Shipping Deadline</Label><Input type="date" value={form.shippingDeadline} onChange={e => setForm({ ...form, shippingDeadline: e.target.value })} /></div>
            <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div>
            <Label>Measurement Preference</Label>
            <UnitPreferenceSelect value={form.unitPreference || null} onChange={v => setForm({ ...form, unitPreference: v || "" })} inheritLabel="Inherit from venue / partner" />
            <p className="text-xs text-muted-foreground mt-1">Use Metric for overseas events to keep all dimensions in cm/m.</p>
          </div>
          {packages.length > 0 && <div>
            <Label>Available Packages</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {packages.map(p => (
                <button key={p.id} type="button" onClick={() => togglePackage(p.id)} className={`px-3 py-1.5 text-xs rounded-lg border transition ${form.availablePackageIds.includes(p.id) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>Tier {p.tier} · {p.name}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Tap to toggle. Empty = all packages available.</p>
          </div>}
          <div className="border-t pt-3">
            <Label>Add-Ons</Label>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setForm({ ...form, addonMode: "inherit" })} className={`px-3 py-1.5 text-xs rounded-lg border transition ${form.addonMode === "inherit" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>Inherit from partner ({partnerAddons.filter(a => a.isActive).length} available)</button>
              <button type="button" onClick={() => setForm({ ...form, addonMode: "override" })} className={`px-3 py-1.5 text-xs rounded-lg border transition ${form.addonMode === "override" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>Override (pick subset)</button>
            </div>
            {form.addonMode === "override" && (
              partnerAddons.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">This partner has no add-ons configured. <Link href={`/admin/partners/${partnerId}/addons`}><a className="underline">Configure add-ons</a></Link> first.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {partnerAddons.filter(a => a.isActive).map(a => (
                      <button key={a.productId} type="button" onClick={() => toggleAddon(a.productId)} className={`px-3 py-1.5 text-xs rounded-lg border transition ${form.addonProductIds.includes(a.productId) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>{a.productName || `#${a.productId}`}</button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Tap to toggle. Empty = no add-ons offered for this event.</p>
                </>
              )
            )}
            {form.addonMode === "inherit" && partnerAddons.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">No partner-level add-ons configured yet. <Link href={`/admin/partners/${partnerId}/addons`}><a className="underline">Configure add-ons</a></Link> to make them available here.</p>
            )}
            {/* Section 36: per-event display format + category filter */}
            {partnerAddons.length > 0 && (() => {
              // Build the unique category list from the partner's active add-ons
              // (using effectiveCategory so overrides are respected). Memoising
              // here is fine — partnerAddons is already memoised by react-query.
              const cats = Array.from(new Set(partnerAddons
                .filter(a => a.isActive)
                .map(a => (a as any).effectiveCategory || a.productCategory || "Uncategorized")
              )).sort();
              return (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-32">Display format</Label>
                    <select
                      className="h-8 rounded border bg-background px-2 text-xs"
                      value={form.addonDisplayFormat}
                      onChange={(e) => setForm({ ...form, addonDisplayFormat: e.target.value as any })}
                    >
                      <option value="">Inherit from partner</option>
                      <option value="grid">Card / grid</option>
                      <option value="flat">Flat list</option>
                      <option value="category_tiles">Category tiles</option>
                    </select>
                  </div>
                  {cats.length > 0 && (
                    <div>
                      <Label className="text-xs">Restrict to categories <span className="text-muted-foreground">(optional)</span></Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {cats.map((c) => {
                          const active = form.addonCategories.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setForm({ ...form, addonCategories: active ? form.addonCategories.filter(x => x !== c) : [...form.addonCategories, c] })}
                              className={`px-2 py-1 text-[11px] rounded border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
                            >{c}</button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Empty = show all categories. Useful when a venue only allows certain item types.</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsList() {
  const params = useParams<{ id: string }>();
  const partnerId = parseInt(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: partner } = useQuery<{ companyName: string }>({ queryKey: [`/api/partners/${partnerId}`], queryFn: () => apiFetch(`/api/partners/${partnerId}`) });
  const { data: events = [], isLoading } = useQuery<EventRow[]>({ queryKey: [`/api/events`, { partnerId }], queryFn: () => apiFetch(`/api/events?partnerId=${partnerId}`) });
  const { data: cities = [] } = useQuery<City[]>({ queryKey: [`/api/cities`, { partnerId }], queryFn: () => apiFetch(`/api/cities?partnerId=${partnerId}`) });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: [`/api/venues`, { partnerId }], queryFn: () => apiFetch(`/api/venues?partnerId=${partnerId}`) });
  const { data: packages = [] } = useQuery<Pkg[]>({ queryKey: [`/api/packages`, { partnerId }], queryFn: () => apiFetch(`/api/packages?partnerId=${partnerId}`) });

  const refetch = () => qc.invalidateQueries({ queryKey: [`/api/events`, { partnerId }] });
  const del = useMutation({ mutationFn: (id: number) => apiFetch(`/api/events/${id}`, { method: "DELETE" }), onSuccess: () => { refetch(); toast({ title: "Event deleted" }); } });
  const dup = useMutation({ mutationFn: (id: number) => apiFetch(`/api/events/${id}/duplicate`, { method: "POST" }), onSuccess: () => { refetch(); toast({ title: "Event duplicated" }); } });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/partners/${partnerId}/edit`}><Button variant="ghost" size="sm" className="gap-1 -ml-3 mb-2"><ChevronLeft className="h-4 w-4" />Back to partner</Button></Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Events</h1>
            <p className="text-muted-foreground mt-1">{partner?.companyName} · {events.length} event{events.length !== 1 ? "s" : ""}</p>
          </div>
          <EventDialog partnerId={partnerId} cities={cities} venues={venues} packages={packages} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Create Event</Button>} onSaved={refetch} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {events.map(ev => (
          <Card key={ev.id} className="p-4 hover:shadow-md transition">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[ev.status]}`}>{ev.status}</span>
                  {!ev.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <div className="font-semibold mt-1">{ev.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{ev.cityName} · {ev.venueName || "no venue"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="h-3 w-3" />{ev.eventStartDate || "—"}{ev.eventEndDate && ev.eventEndDate !== ev.eventStartDate && ` → ${ev.eventEndDate}`}</div>
                {ev.shippingDeadline && <div className="text-xs mt-1"><span className="text-muted-foreground">Ship by:</span> {ev.shippingDeadline}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <EventInventoryDialog eventId={ev.id} eventName={ev.name} eventCityId={ev.cityId} trigger={<Button variant="ghost" size="icon" className="h-7 w-7" title="Inventory & reservations"><Boxes className="h-3.5 w-3.5" /></Button>} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dup.mutate(ev.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                <EventDialog partnerId={partnerId} cities={cities} venues={venues} packages={packages} ev={ev} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetch} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${ev.name}?`)) del.mutate(ev.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {events.length === 0 && <Card className="col-span-3 p-12 text-center text-muted-foreground"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />No events yet. Create your first event to enable client ordering.</Card>}
      </div>
    </div>
  );
}
