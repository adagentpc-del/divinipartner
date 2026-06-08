import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Send, Search, Loader2, Shield, CheckCircle2, ArrowRight,
} from "lucide-react";
import PublicFormShell from "@/components/public/PublicFormShell";
import { Stagger, Item } from "@/components/public/motion";

const GREEN = "#1E5340";

const REQUESTABLE_DOC_TYPES = [
  { value: "w9", label: "W-9" },
  { value: "certificate_of_insurance", label: "Certificate of Insurance" },
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "capability_sheet", label: "Capability Sheet" },
  { value: "vendor_onboarding_packet", label: "Vendor Onboarding Packet" },
  { value: "product_guide", label: "Product Guide" },
  { value: "artwork_upload_guide", label: "Artwork Upload Guide" },
  { value: "installation_guide", label: "Installation Guide" },
  { value: "partner_packet", label: "Partner Packet" },
  { value: "customer_support_docs", label: "Customer Support Docs" },
];

type AssignedDoc = {
  assignmentId: number; accessStatus: string; signedUrlExpiresAt: string | null;
  assignedAt: string; documentId: number; title: string; description: string | null;
  category: string; documentType: string; versionLabel: string | null;
  expirationDate: string | null; downloadToken: string;
};

export default function DocumentAccess() {
  const [mode, setMode] = useState<"landing" | "access" | "request">("landing");

  return (
    <PublicFormShell
      eyebrow="A3 Visual"
      title="Document Center"
      subtitle="Securely access or request vendor documents shared by A3 Visual."
      footnote={
        <>
          All document links are time-limited and encrypted for security.<br />
          Need help? Contact your A3 Visual representative.
        </>
      }
    >
      {mode === "landing" && (
        <Stagger className="space-y-4">
          <Item>
            <Card
              className="surface-luxe lift cursor-pointer border-divini-green/15"
              onClick={() => setMode("access")}
            >
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-divini-green/10">
                  <Download className="h-6 w-6 text-divini-green" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-xl text-divini-green">Access your documents</h3>
                  <p className="mt-0.5 text-sm text-divini-muted">Download documents that have been shared with you by A3 Visual.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-divini-champagne" />
              </CardContent>
            </Card>
          </Item>

          <Item>
            <Card
              className="surface-luxe lift cursor-pointer border-divini-green/15"
              onClick={() => setMode("request")}
            >
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-divini-champagne/20">
                  <Send className="h-6 w-6" style={{ color: "#9a7b34" }} />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-xl text-divini-green">Request documents</h3>
                  <p className="mt-0.5 text-sm text-divini-muted">Request vendor documents like W-9, COI, capability sheets, and more.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-divini-champagne" />
              </CardContent>
            </Card>
          </Item>
        </Stagger>
      )}

      {mode === "access" && <AccessSection onBack={() => setMode("landing")} />}
      {mode === "request" && <RequestSection onBack={() => setMode("landing")} />}
    </PublicFormShell>
  );
}

function AccessSection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["customer-documents", email],
    queryFn: () => apiFetch<{ documents: AssignedDoc[] }>(`/api/customer/documents?email=${encodeURIComponent(email)}`),
    enabled: submitted && !!email,
  });

  const docs = data?.documents || [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    refetch();
  }

  async function handleDownload(assignmentId: number, downloadToken: string) {
    try {
      const resp = await apiFetch<{ url: string }>(`/api/customer/documents/${assignmentId}/download?token=${encodeURIComponent(downloadToken)}`);
      window.open(resp.url, "_blank");
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Card className="surface-luxe border-divini-green/15">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs text-divini-muted">&larr; Back</Button>
        </div>
        <CardTitle className="font-display text-2xl text-divini-green">Access your documents</CardTitle>
        <CardDescription className="text-divini-muted">Enter your email to view documents shared with you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email address" required className="flex-1" />
          <Button type="submit" disabled={isLoading || !email} className="text-white" style={{ backgroundColor: GREEN }}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {submitted && !isLoading && docs.length === 0 && (
          <div className="py-8 text-center text-divini-muted">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">No documents found for this email.</p>
            <p className="mt-1 text-xs">Documents may have expired or not yet been assigned. You can request documents below.</p>
            <Button variant="outline" size="sm" className="mt-3 border-divini-green/30 text-divini-green" onClick={onBack}>Request Documents</Button>
          </div>
        )}

        {docs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-divini-muted">{docs.length} document{docs.length !== 1 ? "s" : ""} available</div>
            {docs.map(doc => (
              <div key={doc.assignmentId} className="flex items-center gap-3 rounded-lg border border-divini-green/12 p-3 transition-colors hover:bg-divini-green/5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-divini-green/10">
                  <FileText className="h-4 w-4 text-divini-green" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-divini-ink">{doc.title}</div>
                  <div className="text-xs text-divini-muted">
                    {doc.versionLabel && <span>{doc.versionLabel} · </span>}
                    Shared {new Date(doc.assignedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <Button size="sm" onClick={() => handleDownload(doc.assignmentId, doc.downloadToken)} className="flex-shrink-0 text-white" style={{ backgroundColor: GREEN }}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestSection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  function toggleType(val: string) {
    setSelectedTypes(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || selectedTypes.length === 0) {
      toast({ title: "Please fill in all required fields and select at least one document type", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const resp = await apiFetch<{ ok: boolean; autoSentCount: number }>("/api/customer/document-requests", {
        method: "POST",
        body: JSON.stringify({
          name, email, company: company || undefined,
          requestedDocumentTypes: selectedTypes,
          message: message || undefined,
        }),
      });
      setDone(true);
      if (resp.autoSentCount > 0) {
        toast({ title: `${resp.autoSentCount} document${resp.autoSentCount > 1 ? "s" : ""} sent to your email automatically!` });
      }
    } catch (err: any) {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="surface-luxe border-divini-green/15">
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-divini-green" />
          <h3 className="font-display text-2xl text-divini-green">Request submitted</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-divini-muted">
            Your document request has been received. If any documents are available for auto-delivery, they've been sent to your email. Otherwise, an A3 Visual team member will review your request shortly.
          </p>
          <Button variant="outline" className="mt-6 border-divini-green/30 text-divini-green" onClick={onBack}>Back to Document Center</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="surface-luxe border-divini-green/15">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs text-divini-muted">&larr; Back</Button>
        </div>
        <CardTitle className="font-display text-2xl text-divini-green">Request documents</CardTitle>
        <CardDescription className="text-divini-muted">Select the documents you need and we'll send them to your email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Your Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" required />
            </div>
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
          </div>

          <div>
            <Label className="text-sm font-medium">Select Documents *</Label>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {REQUESTABLE_DOC_TYPES.map(dt => (
                <label key={dt.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-divini-green/12 p-2.5 transition-colors hover:bg-divini-green/5">
                  <Checkbox checked={selectedTypes.includes(dt.value)} onCheckedChange={() => toggleType(dt.value)} />
                  <span className="text-sm">{dt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Message (optional)</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Any additional context or special requirements" rows={3} />
          </div>

          <div className="flex items-center gap-2 text-xs text-divini-muted">
            <Shield className="h-3.5 w-3.5" />
            Your information is kept secure and only used for document delivery.
          </div>

          <Button type="submit" className="w-full text-white" style={{ backgroundColor: GREEN }} disabled={busy || selectedTypes.length === 0}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : <><Send className="mr-2 h-4 w-4" />Submit Request</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
