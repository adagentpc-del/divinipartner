import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, Send, Activity, Settings, Search, MoreHorizontal,
  Download, Eye, RefreshCw, XCircle, CheckCircle2, Clock, Shield,
  AlertTriangle, Loader2, ExternalLink, File, Replace, Power, PowerOff,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DOCUMENT_TYPES = [
  { value: "w9", label: "W-9" },
  { value: "act_docs", label: "ACT Docs" },
  { value: "articles_registration", label: "Articles / Registration" },
  { value: "certificate_of_insurance", label: "Certificate of Insurance" },
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "capability_sheet", label: "Capability Sheet" },
  { value: "vendor_onboarding_packet", label: "Vendor Onboarding Packet" },
  { value: "product_guide", label: "Product Guide" },
  { value: "artwork_upload_guide", label: "Artwork Upload Guide" },
  { value: "installation_guide", label: "Installation Guide" },
  { value: "partner_packet", label: "Partner Packet" },
  { value: "customer_support_docs", label: "Customer Support Docs" },
  { value: "internal_only_document", label: "Internal Only Document" },
  { value: "other", label: "Other" },
] as const;

const CATEGORIES = [
  { value: "compliance", label: "Compliance" },
  { value: "insurance", label: "Insurance" },
  { value: "corporate", label: "Corporate" },
  { value: "sales", label: "Sales" },
  { value: "onboarding", label: "Onboarding" },
  { value: "guides", label: "Guides" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" },
] as const;

const VISIBILITY_LEVELS = [
  { value: "public_sales", label: "Public Sales", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "customer_requestable", label: "Customer Requestable", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "internal_only", label: "Internal Only", tone: "bg-rose-50 text-rose-700 border-rose-200" },
] as const;

const EVENT_TYPE_LABELS: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-emerald-50 text-emerald-700" },
  updated: { label: "Updated", tone: "bg-blue-50 text-blue-700" },
  assigned: { label: "Assigned", tone: "bg-indigo-50 text-indigo-700" },
  requested: { label: "Requested", tone: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", tone: "bg-emerald-50 text-emerald-700" },
  denied: { label: "Denied", tone: "bg-rose-50 text-rose-700" },
  sent: { label: "Sent", tone: "bg-blue-50 text-blue-700" },
  email_opened: { label: "Email Opened", tone: "bg-slate-50 text-slate-700" },
  viewed: { label: "Viewed", tone: "bg-slate-50 text-slate-700" },
  downloaded: { label: "Downloaded", tone: "bg-emerald-50 text-emerald-700" },
  expired: { label: "Expired", tone: "bg-amber-50 text-amber-700" },
  revoked: { label: "Revoked", tone: "bg-rose-50 text-rose-700" },
};

const REQUEST_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  denied: { label: "Denied", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  sent: { label: "Sent", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  fulfilled: { label: "Fulfilled", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

type Doc = {
  id: number; title: string; description: string | null; category: string;
  documentType: string; visibilityLevel: string; storageKey: string;
  originalFilename: string; fileMimeType: string; fileSizeBytes: number;
  versionLabel: string | null; expirationDate: string | null;
  isActive: boolean; isCustomerDownloadable: boolean;
  requiresAdminApproval: boolean; autoSendWhenRequested: boolean;
  internalNotes: string | null; uploadedByUserId: string | null;
  createdAt: string; updatedAt: string;
};

type DocRequest = {
  id: number; partnerId: number | null; requesterName: string;
  requesterEmail: string; requesterCompany: string | null;
  requestedDocumentTypes: string[] | null; requestMessage: string | null;
  status: string; reviewedByUserId: string | null;
  reviewedAt: string | null; createdAt: string; updatedAt: string;
};

type DocEvent = {
  id: number; documentId: number | null; requestId: number | null;
  assignmentId: number | null; partnerId: number | null;
  customerEmail: string | null; customerName: string | null;
  eventType: string; eventMetadata: any;
  ipAddress: string | null; userAgent: string | null;
  performedByUserId: string | null; createdAt: string;
};

export default function DocumentCenter() {
  const [activeTab, setActiveTab] = useState("library");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Document Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage A3 operational documents — W9, COI, capability sheets, vendor packets, and more. Send securely to customers and track every interaction.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="library" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Library</TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Requests</TabsTrigger>
          <TabsTrigger value="send" className="gap-1.5"><Send className="h-3.5 w-3.5" />Send Documents</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity Log</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" />Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="library"><LibraryTab /></TabsContent>
        <TabsContent value="requests"><RequestsTab /></TabsContent>
        <TabsContent value="send"><SendDocumentsTab /></TabsContent>
        <TabsContent value="activity"><ActivityLogTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Library Tab ─────────────────────────────────────────────────────────────
function LibraryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [visFilter, setVisFilter] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showReplace, setShowReplace] = useState<Doc | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-documents", visFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (visFilter !== "all") params.set("visibilityLevel", visFilter);
      if (search) params.set("search", search);
      return apiFetch<{ documents: Doc[] }>(`/api/admin/documents?${params}`);
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/documents/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-documents"] }); toast({ title: "Document deactivated" }); },
  });

  const reactivate = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/documents/${id}/reactivate`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-documents"] }); toast({ title: "Document reactivated" }); },
  });

  const testLink = useMutation({
    mutationFn: (id: number) => apiFetch<{ url: string; expiresInSeconds: number }>(`/api/admin/documents/${id}/test-link`, { method: "POST" }),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast({ title: "Test link opened in new tab" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const docs = data?.documents || [];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Document Library</CardTitle>
            <CardDescription className="text-xs">{docs.length} document{docs.length !== 1 ? "s" : ""}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Document
          </Button>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Select value={visFilter} onValueChange={setVisFilter}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visibility</SelectItem>
              {VISIBILITY_LEVELS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No documents yet. Upload your first document to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Visibility</th>
                  <th className="py-2 pr-3">Version</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Updated</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const vis = VISIBILITY_LEVELS.find(v => v.value === doc.visibilityLevel);
                  const typ = DOCUMENT_TYPES.find(t => t.value === doc.documentType);
                  return (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium truncate max-w-[200px]">{doc.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{doc.originalFilename}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{typ?.label || doc.documentType}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="outline" className={`text-[10px] font-semibold ${vis?.tone || ""}`}>{vis?.label || doc.visibilityLevel}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{doc.versionLabel || "—"}</td>
                      <td className="py-2.5 pr-3 text-xs tabular-nums">{formatBytes(doc.fileSizeBytes)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className={`text-[10px] ${doc.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                            {doc.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {doc.isCustomerDownloadable && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Downloadable</Badge>}
                          {doc.autoSendWhenRequested && <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">Auto Send</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{formatDate(doc.expirationDate)}</td>
                      <td className="py-2.5 pr-3 text-xs">{formatDate(doc.updatedAt)}</td>
                      <td className="py-2.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => testLink.mutate(doc.id)}>
                              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Test Download Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowReplace(doc)}>
                              <Replace className="h-3.5 w-3.5 mr-2" /> Replace File
                            </DropdownMenuItem>
                            {doc.isActive ? (
                              <DropdownMenuItem onClick={() => deactivate.mutate(doc.id)} className="text-rose-600">
                                <PowerOff className="h-3.5 w-3.5 mr-2" /> Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => reactivate.mutate(doc.id)} className="text-emerald-600">
                                <Power className="h-3.5 w-3.5 mr-2" /> Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showUpload && <UploadDocumentModal onClose={() => { setShowUpload(false); queryClient.invalidateQueries({ queryKey: ["admin-documents"] }); }} />}
      {showReplace && <ReplaceFileModal doc={showReplace} onClose={() => { setShowReplace(null); queryClient.invalidateQueries({ queryKey: ["admin-documents"] }); }} />}
    </Card>
  );
}

// ─── Upload Document Modal ───────────────────────────────────────────────────
function UploadDocumentModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [documentType, setDocumentType] = useState("");
  const [visibilityLevel, setVisibilityLevel] = useState("internal_only");
  const [versionLabel, setVersionLabel] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [isCustomerDownloadable, setIsCustomerDownloadable] = useState(false);
  const [requiresAdminApproval, setRequiresAdminApproval] = useState(true);
  const [autoSendWhenRequested, setAutoSendWhenRequested] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isInternal = visibilityLevel === "internal_only";

  async function handleUpload() {
    if (!title || !documentType || !visibilityLevel || !file) {
      toast({ title: "Please fill in required fields and select a file", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const resp = await apiFetch<{ document: Doc; uploadUrl: string }>("/api/admin/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          title, description: description || undefined, category, documentType, visibilityLevel,
          versionLabel: versionLabel || undefined, expirationDate: expirationDate || null,
          isActive: true,
          isCustomerDownloadable: isInternal ? false : isCustomerDownloadable,
          requiresAdminApproval,
          autoSendWhenRequested: isInternal ? false : autoSendWhenRequested,
          internalNotes: internalNotes || null,
          originalFilename: file.name,
          fileMimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });

      const putResp = await fetch(resp.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!putResp.ok) {
        throw new Error(`File upload failed (HTTP ${putResp.status}). The document record was created but the file was not stored. Please try replacing the file.`);
      }

      toast({ title: "Document uploaded successfully" });
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Add a new document to the A3 Document Center.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. A3 Visual W-9 (2026)" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this document" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Type *</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{DOCUMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Visibility *</Label>
              <Select value={visibilityLevel} onValueChange={setVisibilityLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VISIBILITY_LEVELS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Version Label</Label>
              <Input value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="e.g. v2.1" />
            </div>
          </div>
          <div>
            <Label>Expiration Date</Label>
            <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            {!isInternal && (
              <div className="flex items-center gap-2">
                <Checkbox checked={isCustomerDownloadable} onCheckedChange={v => setIsCustomerDownloadable(!!v)} id="downloadable" />
                <Label htmlFor="downloadable" className="text-sm">Customer downloadable</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox checked={requiresAdminApproval} onCheckedChange={v => setRequiresAdminApproval(!!v)} id="approval" />
              <Label htmlFor="approval" className="text-sm">Requires admin approval before sending</Label>
            </div>
            {!isInternal && (
              <div className="flex items-center gap-2">
                <Checkbox checked={autoSendWhenRequested} onCheckedChange={v => setAutoSendWhenRequested(!!v)} id="autosend" />
                <Label htmlFor="autosend" className="text-sm">Auto-send when customer requests this document type</Label>
              </div>
            )}
          </div>
          {isInternal && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
              This document is internal only and cannot be sent to customers.
            </div>
          )}
          <div>
            <Label>Internal Notes</Label>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Notes visible only to A3 admins" rows={2} />
          </div>
          <div>
            <Label>File *</Label>
            <Input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] || null)} />
            <p className="text-[11px] text-muted-foreground mt-1">PDF, DOC, DOCX, PNG, JPG, JPEG — max 25 MB</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleUpload} disabled={busy || !title || !documentType || !file}>
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Uploading…</> : <><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Replace File Modal ──────────────────────────────────────────────────────
function ReplaceFileModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState(doc.versionLabel || "");

  async function handleReplace() {
    if (!file) return;
    setBusy(true);
    try {
      const resp = await apiFetch<{ document: Doc; uploadUrl: string }>(`/api/admin/documents/${doc.id}/replace`, {
        method: "POST",
        body: JSON.stringify({
          originalFilename: file.name,
          fileMimeType: file.type,
          fileSizeBytes: file.size,
          versionLabel: versionLabel || undefined,
        }),
      });

      const putResp = await fetch(resp.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putResp.ok) {
        throw new Error(`File upload failed (HTTP ${putResp.status}). The metadata was updated but the file was not stored. Please try again.`);
      }
      toast({ title: "File replaced successfully" });
      onClose();
    } catch (err: any) {
      toast({ title: "Replace failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Replace File</DialogTitle>
          <DialogDescription>Upload a new version of "{doc.title}". Existing links will serve the new file.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/30 text-xs">
            <div className="font-medium">{doc.originalFilename}</div>
            <div className="text-muted-foreground">{formatBytes(doc.fileSizeBytes)} · {doc.versionLabel || "no version"}</div>
          </div>
          <div>
            <Label>New Version Label</Label>
            <Input value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="e.g. v2.0" />
          </div>
          <div>
            <Label>New File *</Label>
            <Input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleReplace} disabled={busy || !file}>
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Replacing…</> : <><Replace className="h-3.5 w-3.5 mr-1.5" />Replace</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Requests Tab ────────────────────────────────────────────────────────────
function RequestsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewingRequest, setReviewingRequest] = useState<DocRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-doc-requests", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiFetch<{ requests: DocRequest[] }>(`/api/admin/document-requests?${params}`);
    },
  });

  const deny = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/document-requests/${id}/deny`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-doc-requests"] }); toast({ title: "Request denied" }); },
  });

  const requests = data?.requests || [];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Document Requests</CardTitle>
            <CardDescription className="text-xs">Customer requests for A3 vendor documents</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No document requests yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(req => {
              const st = REQUEST_STATUS_LABELS[req.status] || { label: req.status, tone: "" };
              return (
                <div key={req.id} className="border rounded-md p-3 bg-white hover:bg-muted/20">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{req.requesterName}</div>
                      <div className="text-xs text-muted-foreground">{req.requesterEmail}{req.requesterCompany ? ` · ${req.requesterCompany}` : ""}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Requested: {(req.requestedDocumentTypes || []).map(t => DOCUMENT_TYPES.find(dt => dt.value === t)?.label || t).join(", ")}
                      </div>
                      {req.requestMessage && <div className="text-xs text-muted-foreground mt-1 italic">"{req.requestMessage}"</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] font-semibold ${st.tone}`}>{st.label}</Badge>
                      <span className="text-[11px] text-muted-foreground">{formatDate(req.createdAt)}</span>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviewingRequest(req)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Review
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => deny.mutate(req.id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Deny
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {reviewingRequest && (
        <ReviewRequestModal
          request={reviewingRequest}
          onClose={() => { setReviewingRequest(null); queryClient.invalidateQueries({ queryKey: ["admin-doc-requests"] }); }}
        />
      )}
    </Card>
  );
}

// ─── Review Request Modal ────────────────────────────────────────────────────
function ReviewRequestModal({ request, onClose }: { request: DocRequest; onClose: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data } = useQuery({
    queryKey: ["admin-documents-active"],
    queryFn: () => apiFetch<{ documents: Doc[] }>("/api/admin/documents?isActive=true"),
  });

  const sendableDocs = (data?.documents || []).filter(d => d.visibilityLevel !== "internal_only");

  function toggleDoc(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleApproveAndSend() {
    if (selectedIds.length === 0) {
      toast({ title: "Select at least one document to send", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/document-requests/${request.id}/approve-send`, {
        method: "POST",
        body: JSON.stringify({ documentIds: selectedIds }),
      });
      toast({ title: "Request approved and documents sent" });
      onClose();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Document Request</DialogTitle>
          <DialogDescription>Select documents to approve and send to {request.requesterName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-sm font-medium">{request.requesterName}</div>
            <div className="text-xs text-muted-foreground">{request.requesterEmail}{request.requesterCompany ? ` · ${request.requesterCompany}` : ""}</div>
            <div className="text-xs mt-1">Requested: {(request.requestedDocumentTypes || []).map(t => DOCUMENT_TYPES.find(dt => dt.value === t)?.label || t).join(", ")}</div>
            {request.requestMessage && <div className="text-xs text-muted-foreground mt-1 italic">"{request.requestMessage}"</div>}
          </div>

          <div>
            <Label className="text-sm font-medium">Select documents to send</Label>
            <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
              {sendableDocs.map(doc => (
                <label key={doc.id} className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/20 cursor-pointer">
                  <Checkbox checked={selectedIds.includes(doc.id)} onCheckedChange={() => toggleDoc(doc.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{doc.title}</div>
                    <div className="text-[11px] text-muted-foreground">{DOCUMENT_TYPES.find(t => t.value === doc.documentType)?.label} · {doc.versionLabel || "—"}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleApproveAndSend} disabled={busy || selectedIds.length === 0}>
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</> : <><Send className="h-3.5 w-3.5 mr-1.5" />Approve & Send ({selectedIds.length})</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Documents Tab ──────────────────────────────────────────────────────
function SendDocumentsTab() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showInternal, setShowInternal] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-documents-active"],
    queryFn: () => apiFetch<{ documents: Doc[] }>("/api/admin/documents?isActive=true"),
  });

  const docs = data?.documents || [];
  const filteredDocs = showInternal ? docs : docs.filter(d => d.visibilityLevel !== "internal_only");

  const grouped = filteredDocs.reduce<Record<string, Doc[]>>((acc, d) => {
    const cat = CATEGORIES.find(c => c.value === d.category)?.label || d.category;
    (acc[cat] = acc[cat] || []).push(d);
    return acc;
  }, {});

  function toggleDoc(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSend() {
    if (!email || selectedIds.length === 0) {
      toast({ title: "Enter an email and select documents", variant: "destructive" });
      return;
    }
    const internalSelected = selectedIds.some(id => docs.find(d => d.id === id)?.visibilityLevel === "internal_only");
    if (internalSelected) {
      toast({ title: "Internal-only documents cannot be sent to customers", variant: "destructive" });
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
          documentIds: selectedIds,
          note: note || undefined,
        }),
      });
      toast({ title: `${selectedIds.length} document${selectedIds.length > 1 ? "s" : ""} sent to ${email}` });
      setSelectedIds([]);
      setEmail("");
      setName("");
      setCompany("");
      setNote("");
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Send Documents</CardTitle>
        <CardDescription className="text-xs">Manually send A3 documents to a customer with secure, expiring links.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Customer Email *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" />
          </div>
          <div>
            <Label>Customer Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
          </div>
        </div>

        <div>
          <Label>Note (optional)</Label>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional message included in the email" rows={2} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Select Documents</Label>
            <div className="flex items-center gap-2">
              <Checkbox checked={showInternal} onCheckedChange={v => setShowInternal(!!v)} id="showInternal" />
              <Label htmlFor="showInternal" className="text-xs text-muted-foreground">Show internal documents</Label>
            </div>
          </div>
          <div className="space-y-4 max-h-80 overflow-y-auto border rounded-md p-3">
            {Object.entries(grouped).map(([cat, catDocs]) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat}</div>
                <div className="space-y-1">
                  {catDocs.map(doc => {
                    const isInternal = doc.visibilityLevel === "internal_only";
                    return (
                      <label key={doc.id} className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer ${isInternal ? "opacity-50 bg-rose-50/30" : "hover:bg-muted/20"}`}>
                        <Checkbox
                          checked={selectedIds.includes(doc.id)}
                          onCheckedChange={() => !isInternal && toggleDoc(doc.id)}
                          disabled={isInternal}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{doc.title}</div>
                          <div className="text-[11px] text-muted-foreground">{DOCUMENT_TYPES.find(t => t.value === doc.documentType)?.label} · {doc.versionLabel || "—"} · {formatBytes(doc.fileSizeBytes)}</div>
                        </div>
                        {isInternal && <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-600 border-rose-200">Internal Only</Badge>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredDocs.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No active documents available.</div>}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={busy || !email || selectedIds.length === 0}>
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</> : <><Send className="h-3.5 w-3.5 mr-1.5" />Send {selectedIds.length} Document{selectedIds.length !== 1 ? "s" : ""}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Activity Log Tab ────────────────────────────────────────────────────────
function ActivityLogTab() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-doc-events", eventTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
      return apiFetch<{ events: DocEvent[] }>(`/api/admin/document-events?${params}`);
    },
  });

  const events = data?.events || [];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Activity Log</CardTitle>
            <CardDescription className="text-xs">All document events — uploads, sends, downloads, requests</CardDescription>
          </div>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No activity logged yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map(evt => {
              const et = EVENT_TYPE_LABELS[evt.eventType] || { label: evt.eventType, tone: "bg-slate-50 text-slate-700" };
              return (
                <div key={evt.id} className="flex items-center gap-3 p-2.5 border rounded-md bg-white text-sm">
                  <Badge variant="outline" className={`text-[10px] font-semibold whitespace-nowrap ${et.tone}`}>{et.label}</Badge>
                  <div className="flex-1 min-w-0">
                    {evt.customerEmail && <span className="text-xs text-muted-foreground">{evt.customerName ? `${evt.customerName} · ` : ""}{evt.customerEmail}</span>}
                    {evt.documentId && <span className="text-xs text-muted-foreground"> · Doc #{evt.documentId}</span>}
                    {evt.requestId && <span className="text-xs text-muted-foreground"> · Req #{evt.requestId}</span>}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDateTime(evt.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-doc-settings"],
    queryFn: () => apiFetch<{ settings: any }>("/api/admin/document-settings"),
  });

  const s = data?.settings;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Document Center Settings</CardTitle>
        <CardDescription className="text-xs">System defaults for the A3 Document Center</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
        ) : s ? (
          <div className="space-y-3">
            <SettingRow label="Public Sales link expiration" value={`${s.publicSalesExpirationDays} days`} />
            <SettingRow label="Customer Requestable link expiration" value={`${s.customerRequestableExpirationDays} days`} />
            <SettingRow label="Private / Compliance link expiration" value={`${s.privateComplianceExpirationDays} days`} />
            <SettingRow label="Max upload size" value={formatBytes(s.maxUploadSizeBytes)} />
            <SettingRow label="Allowed file types" value="PDF, DOC, DOCX, PNG, JPG, JPEG" />
            <SettingRow label="Customer self-service requests" value={s.customerSelfServiceEnabled ? "Enabled" : "Disabled"} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
