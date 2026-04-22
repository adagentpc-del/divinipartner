import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Calendar, AlertTriangle, CheckCircle2, CalendarOff, Trash2, Plus, Pencil } from "lucide-react";
import { apiFetch, apiUrl } from "@/lib/api";

type Availability = {
  inventoryId: number;
  totalQuantity: number;
  damaged: number;
  retired: number;
  inUse: number;
  reservedInWindow: number;
  blackedOutInWindow: number;
  available: number;
  status: "available" | "partial" | "fully_booked" | "blacked_out";
  conflicts: Array<{
    kind: "reservation" | "blackout";
    id: number;
    quantity: number;
    startDate: string | null;
    endDate: string | null;
    eventId: number | null;
    reason: string | null;
    note: string | null;
  }>;
};

type RentableRow = {
  id: number;
  name: string | null;
  category: string | null;
  assetType: string;
  rentable: boolean;
  rentalPrice: string | null;
  priceBasis: string;
  eligibilityMode: string;
  eligibleEventIds: number[];
  eligibleCityIds: number[];
  archivedAt: string | null;
  totalQuantity: number;
  cityId: number | null;
  cityName: string | null;
  productId: number | null;
  productName: string | null;
  productDisplayName: string | null;
  notes: string | null;
  availability: Availability | null;
};

const STATUS_BADGE: Record<Availability["status"], { label: string; className: string; icon: React.ReactNode }> = {
  available:    { label: "Available",        className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  partial:      { label: "Partially booked", className: "bg-amber-100 text-amber-800 border-amber-200",       icon: <AlertTriangle className="h-3 w-3" /> },
  fully_booked: { label: "Fully booked",     className: "bg-rose-100 text-rose-800 border-rose-200",          icon: <AlertTriangle className="h-3 w-3" /> },
  blacked_out:  { label: "Blacked out",      className: "bg-zinc-200 text-zinc-800 border-zinc-300",          icon: <CalendarOff className="h-3 w-3" /> },
};

export function RentableAssetsCard({ partnerId }: { partnerId: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ rows: RentableRow[] }>({
    queryKey: ["/api/partners", partnerId, "rentable-assets", start, end],
    queryFn: () => apiFetch(`/api/partners/${partnerId}/rentable-assets?start=${start}&end=${end}`),
    enabled: Number.isFinite(partnerId),
  });
  const rows = data?.rows ?? [];
  const rentableOnly = useMemo(() => rows.filter(r => r.rentable || r.assetType === "rentable"), [rows]);
  const otherInventory = useMemo(() => rows.filter(r => !(r.rentable || r.assetType === "rentable")), [rows]);

  return (
    <Card className="p-5 space-y-4" data-testid="card-rentable-assets">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Rentable inventory</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Tables, chairs, frames and other partner-owned rentable assets. Pricing, event eligibility, and date-based blackouts all live here.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px]">Window start</Label>
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-8 w-40" data-testid="input-window-start" />
          </div>
          <div>
            <Label className="text-[11px]">Window end</Label>
            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-8 w-40" data-testid="input-window-end" />
          </div>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

      {rentableOnly.length > 0 && (
        <RentableTable
          title="Rentable assets"
          rows={rentableOnly}
          partnerId={partnerId}
          start={start}
          end={end}
          onChanged={() => qc.invalidateQueries({ queryKey: ["/api/partners", partnerId, "rentable-assets"] })}
        />
      )}

      {otherInventory.length > 0 && (
        <details className="border rounded-md">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50">
            Other inventory rows ({otherInventory.length}) — flag any of these as rentable to expose pricing & event eligibility
          </summary>
          <div className="p-3">
            <RentableTable
              title="Non-rentable inventory"
              rows={otherInventory}
              partnerId={partnerId}
              start={start}
              end={end}
              onChanged={() => qc.invalidateQueries({ queryKey: ["/api/partners", partnerId, "rentable-assets"] })}
              compact
            />
          </div>
        </details>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
          No inventory rows for this partner yet. Add inventory from the Inventory page, then return here to mark items rentable.
        </div>
      )}
    </Card>
  );
}

function RentableTable({ title, rows, partnerId, start, end, onChanged, compact }: {
  title: string;
  rows: RentableRow[];
  partnerId: number;
  start: string;
  end: string;
  onChanged: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      {!compact && <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</div>}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="w-[120px]">Total</TableHead>
              <TableHead className="w-[160px]">Available in window</TableHead>
              <TableHead className="w-[140px]">Rental price</TableHead>
              <TableHead className="w-[140px]">Eligibility</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => <RentableRowItem key={r.id} row={r} partnerId={partnerId} start={start} end={end} onChanged={onChanged} />)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RentableRowItem({ row, partnerId, start, end, onChanged }: { row: RentableRow; partnerId: number; start: string; end: string; onChanged: () => void; }) {
  const a = row.availability;
  const status = a?.status ?? "available";
  const sb = STATUS_BADGE[status];
  const displayName = row.name || row.productDisplayName || row.productName || `Asset #${row.id}`;
  return (
    <TableRow data-testid={`row-rentable-${row.id}`}>
      <TableCell>
        <div className="font-medium">{displayName}</div>
        <div className="text-[11px] text-muted-foreground">{row.category || row.assetType}{row.cityName ? ` · ${row.cityName}` : ""}</div>
      </TableCell>
      <TableCell>{row.totalQuantity}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{a?.available ?? row.totalQuantity}</span>
          <Badge variant="outline" className={`text-[10px] gap-1 ${sb.className}`}>{sb.icon}{sb.label}</Badge>
        </div>
        {a && (a.reservedInWindow > 0 || a.blackedOutInWindow > 0) && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {a.reservedInWindow > 0 && <>Reserved {a.reservedInWindow}</>}
            {a.reservedInWindow > 0 && a.blackedOutInWindow > 0 && <> · </>}
            {a.blackedOutInWindow > 0 && <>Blacked out {a.blackedOutInWindow}</>}
          </div>
        )}
      </TableCell>
      <TableCell>
        {row.rentalPrice ? <>${row.rentalPrice} <span className="text-[10px] text-muted-foreground">/ {row.priceBasis === "per_day" ? "day" : "event"}</span></> : <span className="text-muted-foreground text-xs">—</span>}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">{row.eligibilityMode === "all" ? "All events" : `${row.eligibleEventIds.length} events`}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <EditRentalDialog row={row} onChanged={onChanged} />
        <BlackoutsDialog row={row} partnerId={partnerId} start={start} end={end} onChanged={onChanged} />
      </TableCell>
    </TableRow>
  );
}

function EditRentalDialog({ row, onChanged }: { row: RentableRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [rentable, setRentable] = useState(row.rentable);
  const [rentalPrice, setRentalPrice] = useState(row.rentalPrice ?? "");
  const [priceBasis, setPriceBasis] = useState(row.priceBasis);
  const [eligibilityMode, setEligibilityMode] = useState(row.eligibilityMode);
  const [eligibleEventIdsText, setEligibleEventIdsText] = useState((row.eligibleEventIds || []).join(", "));
  const [archived, setArchived] = useState(!!row.archivedAt);
  const [notes, setNotes] = useState(row.notes ?? "");

  const m = useMutation({
    mutationFn: () => apiFetch(`/api/inventory/${row.id}/rental`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rentable,
        rentalPrice: rentalPrice.trim() === "" ? null : rentalPrice.trim(),
        priceBasis,
        eligibilityMode,
        eligibleEventIds: eligibleEventIdsText.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0),
        archivedAt: archived ? (row.archivedAt || new Date().toISOString()) : null,
        notes: notes.trim() === "" ? null : notes.trim(),
      }),
    }),
    onSuccess: () => { onChanged(); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`btn-edit-rental-${row.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Rentable settings — {row.name || row.productName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rentable} onChange={e => setRentable(e.target.checked)} data-testid="check-rentable" />
            Mark this asset as rentable (will appear in partner ordering UIs)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rental price</Label>
              <Input value={rentalPrice} onChange={e => setRentalPrice(e.target.value)} placeholder="0.00" data-testid="input-rental-price" />
            </div>
            <div>
              <Label>Price basis</Label>
              <Select value={priceBasis} onValueChange={setPriceBasis}>
                <SelectTrigger data-testid="select-price-basis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_event">Per event</SelectItem>
                  <SelectItem value="per_day">Per day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Event eligibility</Label>
            <Select value={eligibilityMode} onValueChange={setEligibilityMode}>
              <SelectTrigger data-testid="select-eligibility-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Available for all events</SelectItem>
                <SelectItem value="allowlist">Restricted to specific events</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {eligibilityMode === "allowlist" && (
            <div>
              <Label>Eligible event IDs (comma-separated)</Label>
              <Input value={eligibleEventIdsText} onChange={e => setEligibleEventIdsText(e.target.value)} placeholder="42, 51, 88" data-testid="input-eligible-events" />
              <p className="text-[11px] text-muted-foreground mt-1">Find IDs on the Events admin page. Leave blank to disable allowlist.</p>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} data-testid="check-archived" />
            Archive (hides from rentable list, preserves history)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending} data-testid="btn-save-rental">{m.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlackoutsDialog({ row, partnerId, start, end, onChanged }: { row: RentableRow; partnerId: number; start: string; end: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data, refetch } = useQuery<{ reservations: any[]; blackouts: any[] }>({
    queryKey: ["/api/inventory", row.id, "bookings"],
    queryFn: () => apiFetch(`/api/inventory/${row.id}/bookings`),
    enabled: open,
  });

  const [bStart, setBStart] = useState(start);
  const [bEnd, setBEnd] = useState(end);
  const [bQty, setBQty] = useState(String(row.totalQuantity));
  const [bReason, setBReason] = useState("manual");
  const [bNote, setBNote] = useState("");

  const create = useMutation({
    mutationFn: () => apiFetch(`/api/inventory/${row.id}/blackouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: bStart, endDate: bEnd, quantity: Number(bQty) || 0, reason: bReason, reasonNote: bNote || null }),
    }),
    onSuccess: () => { setBNote(""); refetch(); onChanged(); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/inventory/${row.id}/blackouts/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); onChanged(); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`btn-blackouts-${row.id}`}><CalendarOff className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bookings & blackouts — {row.name || row.productName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Add manual blackout</div>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3"><Label className="text-[11px]">Start</Label><Input type="date" value={bStart} onChange={e => setBStart(e.target.value)} data-testid="input-blackout-start" /></div>
              <div className="col-span-3"><Label className="text-[11px]">End</Label><Input type="date" value={bEnd} onChange={e => setBEnd(e.target.value)} data-testid="input-blackout-end" /></div>
              <div className="col-span-2"><Label className="text-[11px]">Qty</Label><Input value={bQty} onChange={e => setBQty(e.target.value)} data-testid="input-blackout-qty" /></div>
              <div className="col-span-3">
                <Label className="text-[11px]">Reason</Label>
                <Select value={bReason} onValueChange={setBReason}>
                  <SelectTrigger data-testid="select-blackout-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual hold</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="internal">Internal use</SelectItem>
                    <SelectItem value="venue">Venue restricted</SelectItem>
                    <SelectItem value="pending_event">Pending event</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="btn-add-blackout"><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="col-span-12"><Label className="text-[11px]">Note (optional)</Label><Input value={bNote} onChange={e => setBNote(e.target.value)} data-testid="input-blackout-note" /></div>
            </div>
          </section>

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Active blackouts</div>
            <div className="border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead>Window</TableHead><TableHead className="w-20">Qty</TableHead><TableHead>Reason</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                <TableBody>
                  {(data?.blackouts ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground text-center">No blackouts.</TableCell></TableRow>}
                  {(data?.blackouts ?? []).map((b: any) => (
                    <TableRow key={b.id} data-testid={`row-blackout-${b.id}`}>
                      <TableCell>{b.startDate} → {b.endDate}</TableCell>
                      <TableCell>{b.quantity}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{b.reason}</Badge>{b.reasonNote ? <div className="text-[11px] text-muted-foreground">{b.reasonNote}</div> : null}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)} data-testid={`btn-delete-blackout-${b.id}`}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Active reservations (from orders)</div>
            <div className="border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead>Window</TableHead><TableHead className="w-20">Qty</TableHead><TableHead>Event</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data?.reservations ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="text-xs text-muted-foreground text-center">No active reservations.</TableCell></TableRow>}
                  {(data?.reservations ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.startDate ? `${r.startDate} → ${r.endDate}` : <span className="text-muted-foreground">undated</span>}</TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell>{r.eventName ? <>#{r.eventId} {r.eventName}</> : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
