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
import { Plus, Loader2, Pencil, Trash2, MapPin, Building2, Copy, ChevronLeft, Upload } from "lucide-react";
import { ImportDialog } from "@/components/imports/ImportDialog";
import { UnitPreferenceSelect } from "@/components/units/DimensionInput";

type City = { id: number; partnerId: number | null; name: string; state: string | null; country: string | null; notes: string | null; isActive: boolean; sortOrder: number };
type Venue = { id: number; partnerId: number | null; cityId: number | null; cityName?: string | null; name: string; venueAddress: string | null; shippingAddress: string | null; onsiteContactName: string | null; onsiteContactPhone: string | null; onsiteContactEmail: string | null; installNotes: string | null; shippingInstructions: string | null; deadlineNotes: string | null; isActive: boolean; unitPreference?: string | null; country?: string | null };

function CityDialog({ partnerId, city, trigger, onSaved }: { partnerId: number; city?: City | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: city?.name || "", state: city?.state || "", country: city?.country || "USA", notes: city?.notes || "", isActive: city?.isActive ?? true,
  });
  const handleSave = async () => {
    try {
      const body = { partnerId, ...form };
      if (city) await apiFetch(`/api/cities/${city.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/cities`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: city ? "City updated" : "City added" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{city ? "Edit City" : "Add City"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>City Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>State</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VenueDialog({ partnerId, cities, venue, trigger, onSaved }: { partnerId: number; cities: City[]; venue?: Venue | null; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    cityId: venue?.cityId?.toString() || (cities[0]?.id?.toString() || ""),
    name: venue?.name || "", venueAddress: venue?.venueAddress || "", shippingAddress: venue?.shippingAddress || "",
    onsiteContactName: venue?.onsiteContactName || "", onsiteContactPhone: venue?.onsiteContactPhone || "", onsiteContactEmail: venue?.onsiteContactEmail || "",
    installNotes: venue?.installNotes || "", shippingInstructions: venue?.shippingInstructions || "", deadlineNotes: venue?.deadlineNotes || "",
    isActive: venue?.isActive ?? true,
    country: venue?.country || "",
    unitPreference: (venue?.unitPreference || "") as string,
  });
  const handleSave = async () => {
    try {
      const body = {
        partnerId,
        ...form,
        cityId: parseInt(form.cityId) || null,
        country: form.country || null,
        unitPreference: form.unitPreference || null,
      };
      if (venue) await apiFetch(`/api/venues/${venue.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch(`/api/venues`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: venue ? "Venue updated" : "Venue added" });
      onSaved(); setOpen(false);
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{venue ? "Edit Venue" : "Add Venue"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label>
              <Select value={form.cityId} onValueChange={v => setForm({ ...form, cityId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Venue Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div><Label>Venue Address</Label><Input value={form.venueAddress} onChange={e => setForm({ ...form, venueAddress: e.target.value })} /></div>
          <div><Label>Shipping Address (if different)</Label><Input value={form.shippingAddress} onChange={e => setForm({ ...form, shippingAddress: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Onsite Contact</Label><Input value={form.onsiteContactName} onChange={e => setForm({ ...form, onsiteContactName: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.onsiteContactPhone} onChange={e => setForm({ ...form, onsiteContactPhone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.onsiteContactEmail} onChange={e => setForm({ ...form, onsiteContactEmail: e.target.value })} /></div>
          </div>
          <div><Label>Install Notes</Label><Textarea value={form.installNotes} onChange={e => setForm({ ...form, installNotes: e.target.value })} rows={2} /></div>
          <div><Label>Shipping Instructions</Label><Textarea value={form.shippingInstructions} onChange={e => setForm({ ...form, shippingInstructions: e.target.value })} rows={2} /></div>
          <div><Label>Deadline Notes</Label><Input value={form.deadlineNotes} onChange={e => setForm({ ...form, deadlineNotes: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Country (ISO, e.g. US, GB, FR)</Label>
              <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="US" />
              <p className="text-xs text-muted-foreground mt-1">Overseas venues default to metric.</p>
            </div>
            <div>
              <Label>Measurement Preference</Label>
              <UnitPreferenceSelect value={form.unitPreference || null} onChange={v => setForm({ ...form, unitPreference: v || "" })} inheritLabel="Inherit from partner / country" />
            </div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={!form.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CitiesAndVenues() {
  const params = useParams<{ id: string }>();
  const partnerId = parseInt(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: partner } = useQuery<{ id: number; companyName: string }>({ queryKey: [`/api/partners/${partnerId}`], queryFn: () => apiFetch(`/api/partners/${partnerId}`) });
  const { data: cities = [], isLoading: loadingCities } = useQuery<City[]>({ queryKey: [`/api/cities`, { partnerId }], queryFn: () => apiFetch(`/api/cities?partnerId=${partnerId}`) });
  const { data: venues = [], isLoading: loadingVenues } = useQuery<Venue[]>({ queryKey: [`/api/venues`, { partnerId }], queryFn: () => apiFetch(`/api/venues?partnerId=${partnerId}`) });

  const refetchAll = () => { qc.invalidateQueries({ queryKey: [`/api/cities`, { partnerId }] }); qc.invalidateQueries({ queryKey: [`/api/venues`, { partnerId }] }); };
  const [importVenuesOpen, setImportVenuesOpen] = useState(false);
  const delCity = useMutation({ mutationFn: (id: number) => apiFetch(`/api/cities/${id}`, { method: "DELETE" }), onSuccess: () => { refetchAll(); toast({ title: "City deleted" }); } });
  const delVenue = useMutation({ mutationFn: (id: number) => apiFetch(`/api/venues/${id}`, { method: "DELETE" }), onSuccess: () => { refetchAll(); toast({ title: "Venue deleted" }); } });
  const dupVenue = useMutation({ mutationFn: (id: number) => apiFetch(`/api/venues/${id}/duplicate`, { method: "POST" }), onSuccess: () => { refetchAll(); toast({ title: "Venue duplicated" }); } });

  if (loadingCities || loadingVenues) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/partners/${partnerId}/edit`}><Button variant="ghost" size="sm" className="gap-1 -ml-3 mb-2"><ChevronLeft className="h-4 w-4" />Back to partner</Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">Cities & Venues</h1>
        <p className="text-muted-foreground mt-1">{partner?.companyName} · {cities.length} cities · {venues.length} venues</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><MapPin className="h-5 w-5 text-muted-foreground" />Cities</h2>
          <CityDialog partnerId={partnerId} trigger={<Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Add City</Button>} onSaved={refetchAll} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cities.map(c => (
            <Card key={c.id} className="p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">{c.name}{!c.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{c.state}{c.state && c.country && " · "}{c.country}</div>
                  <div className="text-xs text-muted-foreground mt-1">{venues.filter(v => v.cityId === c.id).length} venue{venues.filter(v => v.cityId === c.id).length !== 1 ? "s" : ""}</div>
                </div>
                <div className="flex gap-1">
                  <CityDialog partnerId={partnerId} city={c} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetchAll} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${c.name}?`)) delCity.mutate(c.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
          {cities.length === 0 && <Card className="p-8 col-span-3 text-center text-muted-foreground"><MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />No cities yet</Card>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-5 w-5 text-muted-foreground" />Venues</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setImportVenuesOpen(true)} disabled={cities.length === 0}><Upload className="h-4 w-4" />Import Venues</Button>
            <VenueDialog partnerId={partnerId} cities={cities} trigger={<Button size="sm" className="gap-2" disabled={cities.length === 0}><Plus className="h-4 w-4" />Add Venue</Button>} onSaved={refetchAll} />
          </div>
          <ImportDialog
            resource="venues"
            open={importVenuesOpen}
            onOpenChange={setImportVenuesOpen}
            context={{ partnerId }}
            contextLabel={partner?.companyName}
            onComplete={refetchAll}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {venues.map(v => (
            <Card key={v.id} className="p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">{v.name}{!v.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{v.cityName}</div>
                  <div className="text-sm text-muted-foreground mt-2 truncate">{v.venueAddress}</div>
                  {v.onsiteContactName && <div className="text-xs mt-2"><span className="font-medium">{v.onsiteContactName}</span> · {v.onsiteContactPhone}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dupVenue.mutate(v.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                  <VenueDialog partnerId={partnerId} cities={cities} venue={v} trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>} onSaved={refetchAll} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${v.name}?`)) delVenue.mutate(v.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
          {venues.length === 0 && <Card className="p-8 col-span-2 text-center text-muted-foreground"><Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />No venues yet</Card>}
        </div>
      </div>
    </div>
  );
}
