import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Send, Search, Loader2, Shield, CheckCircle2, ArrowRight,
} from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-slate-900">A3 Visual</div>
          <div className="text-sm text-slate-500 mt-1">Document Center</div>
        </div>

        {mode === "landing" && (
          <div className="space-y-4">
            <Card className="cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setMode("access")}>
              <CardContent className="flex items-center gap-4 py-6">
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Download className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Access Your Documents</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Download documents that have been shared with you by A3 Visual.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setMode("request")}>
              <CardContent className="flex items-center gap-4 py-6">
                <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Send className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Request Documents</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Request vendor documents like W-9, COI, capability sheets, and more.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "access" && <AccessSection onBack={() => setMode("landing")} />}
        {mode === "request" && <RequestSection onBack={() => setMode("landing")} />}

        <div className="text-center mt-12">
          <p className="text-xs text-slate-400">
            All document links are time-limited and encrypted for security.<br />
            Need help? Contact your A3 Visual representative.
          </p>
        </div>
      </div>
    </div>
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">&larr; Back</Button>
        </div>
        <CardTitle className="text-lg">Access Your Documents</CardTitle>
        <CardDescription>Enter your email to view documents shared with you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email address" required className="flex-1" />
          <Button type="submit" disabled={isLoading || !email}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {submitted && !isLoading && docs.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No documents found for this email.</p>
            <p className="text-xs mt-1">Documents may have expired or not yet been assigned. You can request documents below.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>Request Documents</Button>
          </div>
        )}

        {docs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{docs.length} document{docs.length !== 1 ? "s" : ""} available</div>
            {docs.map(doc => (
              <div key={doc.assignmentId} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                <div className="h-9 w-9 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{doc.title}</div>
                  <div className="text-xs text-slate-500">
                    {doc.versionLabel && <span>{doc.versionLabel} · </span>}
                    Shared {new Date(doc.assignedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <Button size="sm" onClick={() => handleDownload(doc.assignmentId, doc.downloadToken)} className="flex-shrink-0">
                  <Download className="h-3.5 w-3.5 mr-1.5" />Download
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
      <Card>
        <CardContent className="text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900">Request Submitted</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
            Your document request has been received. If any documents are available for auto-delivery, they've been sent to your email. Otherwise, an A3 Visual team member will review your request shortly.
          </p>
          <Button variant="outline" className="mt-6" onClick={onBack}>Back to Document Center</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">&larr; Back</Button>
        </div>
        <CardTitle className="text-lg">Request Documents</CardTitle>
        <CardDescription>Select the documents you need and we'll send them to your email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
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
            <div className="mt-2 grid sm:grid-cols-2 gap-1.5">
              {REQUESTABLE_DOC_TYPES.map(dt => (
                <label key={dt.value} className="flex items-center gap-2 p-2.5 border rounded-md hover:bg-slate-50 cursor-pointer">
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

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="h-3.5 w-3.5" />
            Your information is kept secure and only used for document delivery.
          </div>

          <Button type="submit" className="w-full" disabled={busy || selectedTypes.length === 0}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> : <><Send className="h-4 w-4 mr-2" />Submit Request</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
