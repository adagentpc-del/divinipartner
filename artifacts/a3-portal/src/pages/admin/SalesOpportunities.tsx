import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Target, Search, FileText, ExternalLink, StickyNote, Trophy, XCircle, DollarSign,
} from "lucide-react";

type Opportunity = {
  id: number;
  companyName: string;
  contactName: string | null;
  assignedRepId: number | null;
  assignedRepName: string | null;
  matchedAccountId: number | null;
  intakeSubmissionId: number | null;
  projectType: string | null;
  estimatedValue: string | null;
  stage: string;
  quoteNeededBy: string | null;
  eventDate: string | null;
  installDate: string | null;
  removalDate: string | null;
  filesJson: { name: string; url: string }[] | null;
  notes: string | null;
  source: string | null;
  routingMethod: string | null;
  lostReason: string | null;
  competitorName: string | null;
  competitorPrice: string | null;
  a3Price: string | null;
  lostNotes: string | null;
  createdAt: string;
};

type Note = {
  id: number;
  authorName: string | null;
  body: string;
  createdAt: string;
};

type Detail = Opportunity & { notes: Note[] };
type Rep = { id: number; firstName: string; lastName: string };

const STAGES = [
  "new_intake", "discovery", "estimating", "quote_sent", "follow_up",
  "negotiation", "won", "lost", "production", "install_scheduled", "completed",
] as const;

const STAGE_LABELS: Record<string, string> = {
  new_intake: "New Intake", discovery: "Discovery", estimating: "Estimating",
  quote_sent: "Quote Sent", follow_up: "Follow Up", negotiation: "Negotiation",
  won: "Won", lost: "Lost", production: "Production",
  install_scheduled: "Install Scheduled", completed: "Completed",
};

// Stages shown as columns on the board (won/lost handled via actions, but
// still rendered so closed deals remain visible).
const BOARD_STAGES = STAGES;

const LOST_REASONS = [
  "price", "install_cost", "lead_time", "existing_vendor", "competitor",
  "budget", "no_decision", "relationship", "scope_changed", "other",
] as const;

const LOST_REASON_LABELS: Record<string, string> = {
  price: "Price", install_cost: "Install cost", lead_time: "Lead time",
  existing_vendor: "Existing vendor", competitor: "Lost to competitor",
  budget: "Budget", no_decision: "No decision", relationship: "Relationship",
  scope_changed: "Scope changed", other: "Other",
};

const STAGE_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  won: "default", lost: "destructive", new_intake: "secondary",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}
function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return s; }
}
function fmtMoney(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
// Defensive: only render links we'd trust as an anchor href (https / same-origin).
function isSafeFileUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (u.startsWith("/")) return true;
  return /^https:\/\//i.test(u);
}

export default function SalesOpportunities() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [activeId, setActiveId] = useState<number | null>(null);

  const me = useQuery<{ role: string }>({ queryKey: ["/api/sales/me"], queryFn: () => apiFetch("/api/sales/me") });
  const isSuperAdmin = me.data?.role === "super_admin";

  const { data: opps, isLoading, isError, refetch } = useQuery<Opportunity[]>({
    queryKey: ["/api/sales/opportunities"],
    queryFn: () => apiFetch("/api/sales/opportunities"),
  });

  const { data: reps } = useQuery<Rep[]>({
    queryKey: ["/api/sales/reps"],
    queryFn: () => apiFetch("/api/sales/reps"),
    enabled: isSuperAdmin,
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      apiFetch(`/api/sales/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales/opportunities"] });
      toast({ title: "Stage updated" });
    },
    onError: (e: any) => toast({ title: "Could not update", description: e?.message, variant: "destructive" }),
  });

  const filtered = useMemo(
    () => (opps || []).filter((o) =>
      !search ||
      o.companyName.toLowerCase().includes(search.toLowerCase()) ||
      (o.contactName || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.projectType || "").toLowerCase().includes(search.toLowerCase())),
    [opps, search],
  );

  const byStage = useMemo(() => {
    const m = new Map<string, Opportunity[]>();
    for (const s of BOARD_STAGES) m.set(s, []);
    for (const o of filtered) {
      if (!m.has(o.stage)) m.set(o.stage, []);
      m.get(o.stage)!.push(o);
    }
    return m;
  }, [filtered]);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load opportunities. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" />Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">Your sales pipeline. Move deals through stages, log notes, and record wins and losses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={view === "board" ? "default" : "outline"} size="sm" onClick={() => setView("board")}>Board</Button>
          <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>List</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company, contact, or project" className="pl-9" />
      </div>

      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_STAGES.map((stage) => {
            const items = byStage.get(stage) || [];
            return (
              <div key={stage} className="min-w-[260px] w-[260px] shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{STAGE_LABELS[stage]}</span>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <Card key={o.id} className="cursor-pointer hover:border-primary/40 transition" onClick={() => setActiveId(o.id)}>
                      <CardContent className="py-3 px-3">
                        <div className="font-semibold text-sm truncate">{o.companyName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{o.projectType || "—"}</div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {fmtMoney(o.estimatedValue) && <Badge variant="secondary" className="text-[10px]">{fmtMoney(o.estimatedValue)}</Badge>}
                          {o.assignedRepName && <span className="text-[10px] text-muted-foreground">{o.assignedRepName}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && <div className="text-[11px] text-muted-foreground px-1 py-4 text-center border border-dashed border-border rounded">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:border-primary/40 transition" onClick={() => setActiveId(o.id)}>
              <CardContent className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">{o.companyName}
                    {o.stage === "won" && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                    {o.stage === "lost" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{o.projectType || "—"} · {fmtDate(o.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {fmtMoney(o.estimatedValue) && <Badge variant="secondary" className="text-[10px]">{fmtMoney(o.estimatedValue)}</Badge>}
                  {o.assignedRepName && <Badge variant="outline" className="text-[10px]">{o.assignedRepName}</Badge>}
                  <Badge variant={STAGE_BADGE[o.stage] || "outline"} className="text-[10px]">{STAGE_LABELS[o.stage] || o.stage}</Badge>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select value={o.stage} onValueChange={(v) => stageMut.mutate({ id: o.id, stage: v })}>
                      <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s} className="text-xs">{STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No opportunities {search ? "match your search" : "yet"}.</CardContent></Card>
          )}
        </div>
      )}

      {activeId !== null && (
        <OpportunityDetail
          id={activeId}
          isSuperAdmin={isSuperAdmin}
          reps={reps || []}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

function OpportunityDetail({ id, isSuperAdmin, reps, onClose }: {
  id: number; isSuperAdmin: boolean; reps: Rep[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [lost, setLost] = useState({ lostReason: "", competitorName: "", competitorPrice: "", a3Price: "", lostNotes: "" });

  const { data: opp, isLoading } = useQuery<Detail>({
    queryKey: [`/api/sales/opportunities/${id}`],
    queryFn: () => apiFetch(`/api/sales/opportunities/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/sales/opportunities/${id}`] });
    qc.invalidateQueries({ queryKey: ["/api/sales/opportunities"] });
  };

  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/sales/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast({ title: "Could not update", description: e?.message, variant: "destructive" }),
  });

  const noteMut = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/sales/opportunities/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => { setNoteBody(""); invalidate(); toast({ title: "Note added" }); },
    onError: (e: any) => toast({ title: "Could not add note", description: e?.message, variant: "destructive" }),
  });

  const markWon = () => patchMut.mutate({ stage: "won" }, { onSuccess: () => { invalidate(); toast({ title: "Marked as won" }); } });
  const submitLost = () => {
    if (!lost.lostReason) { toast({ title: "Pick a reason", variant: "destructive" }); return; }
    patchMut.mutate({
      stage: "lost",
      lostReason: lost.lostReason,
      competitorName: lost.competitorName || null,
      competitorPrice: lost.competitorPrice || null,
      a3Price: lost.a3Price || null,
      lostNotes: lost.lostNotes || null,
    }, { onSuccess: () => { invalidate(); setShowLost(false); toast({ title: "Marked as lost" }); } });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        {isLoading || !opp ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {opp.companyName}
                <Badge variant={STAGE_BADGE[opp.stage] || "outline"} className="text-[10px]">{STAGE_LABELS[opp.stage] || opp.stage}</Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Field label="Project">{opp.projectType || "—"}</Field>
                <Field label="Assigned">{opp.assignedRepName || "Unassigned"}</Field>
                <Field label="Contact">{opp.contactName || "—"}</Field>
                <Field label="Estimated value">{fmtMoney(opp.estimatedValue) || "—"}</Field>
                <Field label="Quote needed by">{fmtDate(opp.quoteNeededBy)}</Field>
                <Field label="Event date">{fmtDate(opp.eventDate)}</Field>
                <Field label="Install date">{fmtDate(opp.installDate)}</Field>
                <Field label="Removal date">{fmtDate(opp.removalDate)}</Field>
              </div>

              {/* Stage + reassignment + value */}
              <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40">
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select value={opp.stage} onValueChange={(v) => patchMut.mutate({ stage: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Estimated value (USD)</Label>
                  <Input
                    type="number" defaultValue={opp.estimatedValue || ""} placeholder="0"
                    className="h-9 mt-1"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (opp.estimatedValue || "")) patchMut.mutate({ estimatedValue: v || null });
                    }}
                  />
                </div>
                {isSuperAdmin && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Assigned rep</Label>
                    <Select
                      value={opp.assignedRepId ? String(opp.assignedRepId) : "unassigned"}
                      onValueChange={(v) => patchMut.mutate({ assignedRepId: v === "unassigned" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned (Super Admin queue)</SelectItem>
                        {reps.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.firstName} {r.lastName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Won / Lost actions */}
              {opp.stage !== "won" && opp.stage !== "lost" && (
                <div className="flex gap-2">
                  <Button onClick={markWon} className="gap-1.5" disabled={patchMut.isPending}><Trophy className="h-4 w-4" />Mark Won</Button>
                  <Button variant="destructive" onClick={() => setShowLost((s) => !s)} className="gap-1.5"><XCircle className="h-4 w-4" />Mark Lost</Button>
                </div>
              )}

              {/* Lost detail capture */}
              {showLost && opp.stage !== "lost" && (
                <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="font-semibold text-sm">Why was this lost?</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Reason</Label>
                      <Select value={lost.lostReason} onValueChange={(v) => setLost((s) => ({ ...s, lostReason: v }))}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{LOST_REASON_LABELS[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Competitor</Label>
                      <Input value={lost.competitorName} onChange={(e) => setLost((s) => ({ ...s, competitorName: e.target.value }))} className="h-9 mt-1" placeholder="Optional" />
                    </div>
                    <div>
                      <Label className="text-xs">Their price (USD)</Label>
                      <Input type="number" value={lost.competitorPrice} onChange={(e) => setLost((s) => ({ ...s, competitorPrice: e.target.value }))} className="h-9 mt-1" placeholder="Optional" />
                    </div>
                    <div>
                      <Label className="text-xs">Our price (USD)</Label>
                      <Input type="number" value={lost.a3Price} onChange={(e) => setLost((s) => ({ ...s, a3Price: e.target.value }))} className="h-9 mt-1" placeholder="Optional" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={lost.lostNotes} onChange={(e) => setLost((s) => ({ ...s, lostNotes: e.target.value }))} className="mt-1" rows={2} placeholder="Context for the loss" />
                  </div>
                  <Button variant="destructive" size="sm" onClick={submitLost} disabled={patchMut.isPending}>Save loss</Button>
                </div>
              )}

              {/* Existing lost summary */}
              {opp.stage === "lost" && opp.lostReason && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm space-y-1">
                  <div className="font-semibold flex items-center gap-1.5"><XCircle className="h-4 w-4 text-destructive" />Lost — {LOST_REASON_LABELS[opp.lostReason] || opp.lostReason}</div>
                  {opp.competitorName && <div className="text-muted-foreground">Competitor: {opp.competitorName}</div>}
                  {(fmtMoney(opp.competitorPrice) || fmtMoney(opp.a3Price)) && (
                    <div className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />Their price {fmtMoney(opp.competitorPrice) || "—"} vs ours {fmtMoney(opp.a3Price) || "—"}</div>
                  )}
                  {opp.lostNotes && <div className="text-muted-foreground whitespace-pre-wrap">{opp.lostNotes}</div>}
                </div>
              )}

              {/* Files */}
              {(() => {
                const safeFiles = (opp.filesJson || []).filter((f) => isSafeFileUrl(f.url));
                return safeFiles.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Files</h4>
                    <div className="space-y-1.5">
                      {safeFiles.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" />{f.name}<ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Notes */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><StickyNote className="h-4 w-4" />Notes</h4>
                <div className="flex gap-2 mb-3">
                  <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} placeholder="Add a note…" className="flex-1" />
                  <Button onClick={() => noteBody.trim() && noteMut.mutate(noteBody.trim())} disabled={!noteBody.trim() || noteMut.isPending} className="self-end">Add</Button>
                </div>
                <div className="space-y-2">
                  {opp.notes.length === 0 && <div className="text-xs text-muted-foreground">No notes yet.</div>}
                  {opp.notes.map((n) => (
                    <div key={n.id} className="text-sm border-b border-border/50 pb-2">
                      <div className="whitespace-pre-wrap">{n.body}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{n.authorName || "Unknown"} · {fmtDateTime(n.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/50 pb-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
