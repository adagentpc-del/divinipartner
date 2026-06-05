import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Inbox, Search, FileText, ExternalLink, Mail, Phone } from "lucide-react";

type Submission = {
  id: number;
  formType: string;
  linkSource: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  payloadJson: Record<string, unknown>;
  matchedAccountId: number | null;
  assignedRepId: number | null;
  routingMethod: string | null;
  status: string;
  createdAt: string;
};

type Rep = { id: number; firstName: string; lastName: string };

const ROUTING_LABELS: Record<string, string> = {
  account_match: "Matched account",
  link_source: "Rep link",
  super_admin_queue: "Super Admin queue",
};

const ROUTING_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  account_match: "default",
  link_source: "secondary",
  super_admin_queue: "destructive",
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return s; }
}

function fileList(payload: Record<string, unknown>) {
  const files: { name: string; url: string }[] = [];
  for (const v of Object.values(payload)) {
    if (Array.isArray(v)) for (const item of v) {
      if (item && typeof item === "object" && "url" in item && "name" in item) {
        const f = item as { name: unknown; url: unknown };
        if (typeof f.url === "string" && typeof f.name === "string") files.push({ name: f.name, url: f.url });
      }
    }
  }
  return files;
}

function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) =>
    v !== null && v !== "" && !(Array.isArray(v) && v.length > 0 && typeof v[0] === "object"),
  );
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="border-b border-border/50 pb-1.5">
          <dt className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
          <dd className="font-medium break-words">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function SalesIntakeInbox() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Submission | null>(null);

  const { data: subs, isLoading, isError, refetch } = useQuery<Submission[]>({
    queryKey: ["/api/sales/submissions"],
    queryFn: () => apiFetch("/api/sales/submissions"),
  });

  const { data: reps } = useQuery<Rep[]>({
    queryKey: ["/api/sales/reps"],
    queryFn: () => apiFetch("/api/sales/reps"),
  });

  const repName = (id: number | null) => {
    if (!id) return "Unassigned";
    const r = reps?.find((x) => x.id === id);
    return r ? `${r.firstName} ${r.lastName}` : `Rep #${id}`;
  };

  const filtered = (subs || []).filter((s) =>
    !search || s.companyName.toLowerCase().includes(search.toLowerCase()) || (s.contactName || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load intakes. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Inbox className="h-6 w-6" />Intake Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Submissions from the public intake links. Each one auto-creates an opportunity and routes to a rep.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company or contact" className="pl-9" />
      </div>

      <div className="space-y-3">
        {filtered.map((s) => {
          const files = fileList(s.payloadJson);
          return (
            <Card key={s.id} className="cursor-pointer hover:border-primary/40 transition" onClick={() => setActive(s)}>
              <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {s.companyName}
                    <Badge variant="outline" className="text-[10px]">{s.formType === "pole_banner" ? "Pole Banner" : "General"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.contactName || "No contact"}{s.contactEmail ? ` · ${s.contactEmail}` : ""} · {fmtDate(s.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {files.length > 0 && <Badge variant="outline" className="text-[10px] gap-1"><FileText className="h-3 w-3" />{files.length}</Badge>}
                  {s.linkSource && <Badge variant="outline" className="text-[10px] capitalize">via {s.linkSource}</Badge>}
                  <Badge variant={s.routingMethod ? ROUTING_VARIANT[s.routingMethod] : "secondary"} className="text-[10px]">{s.routingMethod ? ROUTING_LABELS[s.routingMethod] : "—"}</Badge>
                  <Badge variant="secondary" className="text-[10px]">→ {repName(s.assignedRepId)}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No intake submissions {search ? "match your search" : "yet"}.</CardContent></Card>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {active.companyName}
                  <Badge variant="outline" className="text-[10px]">{active.formType === "pole_banner" ? "Pole Banner" : "General"}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={active.routingMethod ? ROUTING_VARIANT[active.routingMethod] : "secondary"}>{active.routingMethod ? ROUTING_LABELS[active.routingMethod] : "—"}</Badge>
                  <Badge variant="secondary">Assigned: {repName(active.assignedRepId)}</Badge>
                  {active.linkSource && <Badge variant="outline" className="capitalize">Link: {active.linkSource}</Badge>}
                  <Badge variant="outline">{fmtDate(active.createdAt)}</Badge>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  {active.contactName && <span className="font-medium">{active.contactName}</span>}
                  {active.contactEmail && <a href={`mailto:${active.contactEmail}`} className="flex items-center gap-1 text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{active.contactEmail}</a>}
                  {active.contactPhone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{active.contactPhone}</span>}
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Submission details</h4>
                  <PayloadView payload={active.payloadJson} />
                </div>

                {fileList(active.payloadJson).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Files</h4>
                    <div className="space-y-1.5">
                      {fileList(active.payloadJson).map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" />{f.name}<ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
