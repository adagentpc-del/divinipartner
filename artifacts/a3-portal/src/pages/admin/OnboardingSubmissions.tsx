import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Eye, Mail, Phone, Globe, Building2, Receipt, Palette, FileText, ExternalLink, Inbox, CheckCircle2, Clock, X } from "lucide-react";

import type { PartnerOnboardingSubmission } from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";
type Submission = SerializedRow<PartnerOnboardingSubmission>;

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  reviewing: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  converted: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function OnboardingSubmissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Submission | null>(null);
  const [notes, setNotes] = useState("");

  const { data: submissions, isLoading, isError, refetch } = useQuery<Submission[]>({
    queryKey: ["/api/onboarding/submissions"],
    queryFn: () => apiFetch("/api/onboarding/submissions"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/api/onboarding/submissions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/onboarding/submissions"] }); toast({ title: "Updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const convertMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/onboarding/submissions/${id}/convert`, { method: "POST" }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/submissions"] });
      toast({ title: "Partner created", description: "Opening editor…" });
      setSelected(null);
      setLocation(`/admin/partners/${data.partnerId}/edit`);
    },
    onError: (e: any) => toast({ title: "Could not convert", description: e?.message, variant: "destructive" }),
  });

  const [publicCfg, setPublicCfg] = useState<import("@/lib/publicUrl").PublicConfig | null>(null);
  useEffect(() => { import("@/lib/publicUrl").then(m => m.fetchPublicConfig().then(setPublicCfg).catch(() => {})); }, []);
  const onboardingUrl = publicCfg && publicCfg.publicAppUrlConfigured
    ? `${publicCfg.publicAppUrl.replace(/\/$/, "")}${import.meta.env.BASE_URL.replace(/\/$/, "")}/onboard`
    : `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/onboard`;

  const copyLink = () => {
    navigator.clipboard.writeText(onboardingUrl);
    toast({ title: "Link copied", description: onboardingUrl });
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="text-center py-12 text-sm text-muted-foreground">Could not load submissions. <button onClick={() => refetch()} className="text-primary hover:underline">Retry</button></div>;

  const stats = {
    new: submissions?.filter(s => s.status === "new").length || 0,
    reviewing: submissions?.filter(s => s.status === "reviewing").length || 0,
    converted: submissions?.filter(s => s.status === "converted").length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding Submissions</h1>
          <p className="text-muted-foreground text-sm mt-1">New client requests submitted via the public onboarding form.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2"><ExternalLink className="h-3.5 w-3.5" />Preview Form</Button>
          </a>
          <Button onClick={copyLink} size="sm" className="gap-2"><UserPlus className="h-3.5 w-3.5" />Copy Onboarding Link</Button>
        </div>
      </div>

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="py-4">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">Shareable onboarding link</div>
          <div className="font-mono text-sm break-all text-foreground">{onboardingUrl}</div>
          <p className="text-xs text-muted-foreground mt-2">Send this link to new prospective clients. They fill out company, branding, contact, and billing info — submissions appear here for you to review and convert into partners.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Inbox} label="New" value={stats.new} color="blue" />
        <StatCard icon={Clock} label="Reviewing" value={stats.reviewing} color="amber" />
        <StatCard icon={CheckCircle2} label="Converted" value={stats.converted} color="emerald" />
      </div>

      {submissions && submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map(s => (
            <Card key={s.id} className="hover:shadow-sm transition cursor-pointer" onClick={() => { setSelected(s); setNotes(s.internalNotes || ""); }}>
              <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-10 w-10 rounded-md object-contain bg-white border" /> : <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center"><Building2 className="h-4 w-4 text-muted-foreground" /></div>}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.companyName}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.contactName} · {s.contactEmail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {s.partnerType && <Badge variant="outline" className="text-[10px] uppercase">{s.partnerType}</Badge>}
                  {s.portalMode && <Badge variant="secondary" className="text-[10px]">{s.portalMode}</Badge>}
                  <Badge className={`text-[10px] border ${STATUS_BADGE[s.status] || ""}`} variant="outline">{s.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                  <Button size="sm" variant="ghost" className="gap-1"><Eye className="h-3.5 w-3.5" />Review</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground mb-1">No submissions yet</p>
          <p className="text-sm">Share the onboarding link above with new clients to get started.</p>
        </CardContent></Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selected.logoUrl && <img src={selected.logoUrl} alt="" className="h-8 w-8 rounded object-contain bg-white border" />}
                  {selected.companyName}
                  <Badge className={`text-[10px] border ${STATUS_BADGE[selected.status] || ""}`} variant="outline">{selected.status}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <Section icon={Building2} title="Company">
                  <Field label="Company">{selected.companyName}</Field>
                  <Field label="Website">{selected.websiteUrl || "—"}</Field>
                  <Field label="Industry">{selected.industryFocus || "—"}</Field>
                  <Field label="Type">{selected.partnerType || "—"} · Portal: {selected.portalMode || "—"} · Tours: {selected.hasTours || "—"}</Field>
                </Section>

                <Section icon={Palette} title="Brand">
                  <Field label="Headline">{selected.introHeadline || "—"}</Field>
                  <Field label="Intro">{selected.introText || "—"}</Field>
                  <Field label="Thank-you">{selected.thankYouText || "—"}</Field>
                  <Field label="Colors">{selected.brandColors || "—"}</Field>
                  <div className="flex items-center gap-3 pt-2">
                    {selected.logoUrl && <a href={selected.logoUrl} target="_blank" rel="noopener noreferrer"><img src={selected.logoUrl} alt="logo" className="h-14 w-14 rounded border bg-white object-contain" /></a>}
                    {selected.secondaryLogoUrl && <a href={selected.secondaryLogoUrl} target="_blank" rel="noopener noreferrer"><img src={selected.secondaryLogoUrl} alt="logo" className="h-14 w-14 rounded border bg-white object-contain" /></a>}
                  </div>
                  {selected.brandAssetsJson && selected.brandAssetsJson.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {selected.brandAssetsJson.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"><Badge variant="secondary" className="gap-1 text-[10px]"><FileText className="h-3 w-3" />{a.name}</Badge></a>
                      ))}
                    </div>
                  )}
                </Section>

                <Section icon={Mail} title="Primary Contact">
                  <Field label="Name">{selected.contactName} {selected.contactRole && <span className="text-muted-foreground">— {selected.contactRole}</span>}</Field>
                  <Field label="Email">{selected.contactEmail}</Field>
                  <Field label="Phone">{selected.contactPhone || "—"}</Field>
                </Section>

                <Section icon={Receipt} title="Billing">
                  <Field label="Contact">{selected.billingContactName || "—"}</Field>
                  <Field label="Email">{selected.billingEmail || "—"}</Field>
                  <Field label="Phone">{selected.billingPhone || "—"}</Field>
                  <Field label="Address">{selected.billingAddress || "—"}</Field>
                  <Field label="Tax ID">{selected.taxId || "—"}</Field>
                  <Field label="Terms">{selected.paymentTerms || "—"}</Field>
                  <Field label="Budget">{selected.budgetRange || "—"}</Field>
                  <Field label="Notes">{selected.billingNotes || "—"}</Field>
                </Section>

                <Section icon={Globe} title="Goals">
                  <Field label="Need">{selected.whatWeNeed || "—"}</Field>
                  <Field label="Timeline">{selected.timeline || "—"}</Field>
                  <Field label="References">{selected.referenceUrls || "—"}</Field>
                </Section>

                <div>
                  <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">Internal notes</div>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the team…" className="min-h-[60px] resize-none" />
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => updateMut.mutate({ id: selected.id, body: { internalNotes: notes } })} disabled={updateMut.isPending}>Save notes</Button>
                </div>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => updateMut.mutate({ id: selected.id, body: { status: "reviewing" } })}>Mark Reviewing</Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => updateMut.mutate({ id: selected.id, body: { status: "rejected" } })}><X className="h-3.5 w-3.5" />Reject</Button>
                {selected.convertedPartnerId ? (
                  <Button size="sm" className="gap-1" onClick={() => setLocation(`/admin/partners/${selected.convertedPartnerId}/edit`)}><ExternalLink className="h-3.5 w-3.5" />Open Partner</Button>
                ) : (
                  <Button size="sm" className="gap-1" disabled={convertMut.isPending} onClick={() => convertMut.mutate(selected.id)}>
                    {convertMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Convert to Partner
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><div className={`h-8 w-8 rounded-lg flex items-center justify-center ${map[color]}`}><Icon className="h-4 w-4" /></div></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Icon className="h-4 w-4 text-muted-foreground" />{title}</h3>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[100px_1fr] gap-2 text-sm"><span className="text-muted-foreground text-xs uppercase tracking-wide pt-0.5">{label}</span><span className="break-words">{children}</span></div>;
}
