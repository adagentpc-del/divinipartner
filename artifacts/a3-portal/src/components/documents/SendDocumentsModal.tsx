import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, FileText, Shield } from "lucide-react";

type Doc = {
  id: number; title: string; description: string | null; category: string;
  documentType: string; visibilityLevel: string; originalFilename: string;
  fileSizeBytes: number; versionLabel: string | null; isActive: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  compliance: "Compliance", insurance: "Insurance", corporate: "Corporate",
  sales: "Sales", onboarding: "Onboarding", guides: "Guides",
  internal: "Internal", other: "Other",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  w9: "W-9", act_docs: "ACT Docs", articles_registration: "Articles / Registration",
  certificate_of_insurance: "Certificate of Insurance", insurance_certificate: "Insurance Certificate",
  capability_sheet: "Capability Sheet", vendor_onboarding_packet: "Vendor Onboarding Packet",
  product_guide: "Product Guide", artwork_upload_guide: "Artwork Upload Guide",
  installation_guide: "Installation Guide", partner_packet: "Partner Packet",
  customer_support_docs: "Customer Support Docs", internal_only_document: "Internal Only Document",
  other: "Other",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SendDocumentsModalProps {
  open: boolean;
  onClose: () => void;
  prefillEmail?: string;
  prefillName?: string;
  prefillCompany?: string;
  partnerId?: number;
  partnerName?: string;
}

export default function SendDocumentsModal({
  open, onClose, prefillEmail, prefillName, prefillCompany, partnerId, partnerName,
}: SendDocumentsModalProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(prefillEmail || "");
  const [name, setName] = useState(prefillName || "");
  const [company, setCompany] = useState(prefillCompany || "");
  const [note, setNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data } = useQuery({
    queryKey: ["admin-documents-active-modal"],
    queryFn: () => apiFetch<{ documents: Doc[] }>("/api/admin/documents?isActive=true"),
    enabled: open,
  });

  const docs = (data?.documents || []).filter(d => d.visibilityLevel !== "internal_only");

  const grouped = docs.reduce<Record<string, Doc[]>>((acc, d) => {
    const cat = CATEGORY_LABELS[d.category] || d.category;
    (acc[cat] = acc[cat] || []).push(d);
    return acc;
  }, {});

  function toggleDoc(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSend() {
    if (!email || selectedIds.length === 0) {
      toast({ title: "Enter an email and select at least one document", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/documents/send", {
        method: "POST",
        body: JSON.stringify({
          customerEmail: email,
          customerName: name || undefined,
          company: company || undefined,
          partnerId: partnerId || undefined,
          documentIds: selectedIds,
          note: note || undefined,
        }),
      });
      toast({ title: `${selectedIds.length} document${selectedIds.length > 1 ? "s" : ""} sent to ${email}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Send A3 Documents
          </DialogTitle>
          <DialogDescription>
            {partnerName
              ? `Send secure document links to a contact at ${partnerName}.`
              : "Send secure document links via email with time-limited access."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Recipient Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" />
            </div>
            <div>
              <Label>Recipient Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
            </div>
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional message included in the email" rows={2} />
          </div>

          <div>
            <Label className="text-sm font-medium">Select Documents</Label>
            <div className="mt-2 space-y-3 max-h-52 overflow-y-auto border rounded-md p-3">
              {Object.entries(grouped).map(([cat, catDocs]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{cat}</div>
                  <div className="space-y-1">
                    {catDocs.map(doc => (
                      <label key={doc.id} className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/20 cursor-pointer">
                        <Checkbox checked={selectedIds.includes(doc.id)} onCheckedChange={() => toggleDoc(doc.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{doc.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {DOC_TYPE_LABELS[doc.documentType] || doc.documentType} · {doc.versionLabel || "—"} · {formatBytes(doc.fileSizeBytes)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {docs.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No sendable documents available. Upload documents in the Document Center first.
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSend} disabled={busy || !email || selectedIds.length === 0}>
            {busy
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</>
              : <><Send className="h-3.5 w-3.5 mr-1.5" />Send {selectedIds.length || ""} Document{selectedIds.length !== 1 ? "s" : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
