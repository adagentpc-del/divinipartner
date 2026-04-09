import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X, CheckCircle2 } from "lucide-react";

interface FileEntry {
  file: File;
  label: string;
}

interface RequestFormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  slug: string;
  endpoint: string;
  extraFields?: Record<string, any>;
  showSizeSelector?: boolean;
  sizeOptions?: string[];
  showQuantity?: boolean;
  showDescription?: boolean;
  showBudget?: boolean;
  showVenue?: boolean;
  showGoals?: boolean;
  themeColor?: string;
}

async function uploadFile(file: File): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  const { uploadURL, objectPath } = await res.json();
  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return { fileUrl: objectPath, fileName: file.name, fileType: file.type };
}

export default function RequestFormDialog({
  open, onClose, title, slug, endpoint,
  extraFields = {},
  showSizeSelector, sizeOptions = [], showQuantity, showDescription,
  showBudget, showVenue, showGoals, themeColor,
}: RequestFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [designHelp, setDesignHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const designFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    mainContactName: "", companyName: "", email: "", phone: "",
    websiteUrl: "", eventPageUrl: "", eventName: "", eventDate: "",
    neededByDate: "", selectedSize: "", quantity: 1,
    artworkStatus: "will_provide", notes: "", description: "",
    budgetRange: "", venueName: "", venueLocation: "", eventGoals: "",
    designBrief: "", styleNotes: "", textCopy: "",
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [designFiles, setDesignFiles] = useState<FileEntry[]>([]);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const addFiles = (fileList: FileList | null, target: "main" | "design") => {
    if (!fileList) return;
    const entries = Array.from(fileList).map(f => ({ file: f, label: f.name }));
    if (target === "main") setFiles(prev => [...prev, ...entries]);
    else setDesignFiles(prev => [...prev, ...entries]);
  };

  const removeFile = (index: number, target: "main" | "design") => {
    if (target === "main") setFiles(prev => prev.filter((_, i) => i !== index));
    else setDesignFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!form.mainContactName || !form.email) return;
    setSubmitting(true);

    try {
      const allFiles = [...files, ...designFiles];
      const uploadedFiles = [];

      for (const entry of allFiles) {
        const uploaded = await uploadFile(entry.file);
        uploadedFiles.push({ ...uploaded, label: entry.label });
      }

      const body: any = {
        ...extraFields,
        mainContactName: form.mainContactName,
        companyName: form.companyName || undefined,
        email: form.email,
        phone: form.phone || undefined,
        websiteUrl: form.websiteUrl || undefined,
        eventPageUrl: form.eventPageUrl || undefined,
        eventName: form.eventName || undefined,
        eventDate: form.eventDate || undefined,
        neededByDate: form.neededByDate || undefined,
        designHelpNeeded: designHelp,
        artworkStatus: form.artworkStatus || undefined,
        notes: form.notes || undefined,
        files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      };

      if (showQuantity) body.quantity = form.quantity;
      if (showSizeSelector && form.selectedSize) body.selectedSize = form.selectedSize;
      if (showDescription || showGoals) body.description = form.description || form.eventGoals || undefined;
      if (showBudget) body.budgetRange = form.budgetRange || undefined;
      if (showVenue) {
        body.venueName = form.venueName || undefined;
        body.venueLocation = form.venueLocation || undefined;
      }

      if (designHelp) {
        const briefParts = [form.designBrief, form.textCopy ? `Text/Copy: ${form.textCopy}` : ""].filter(Boolean);
        body.designBrief = briefParts.join("\n\n") || undefined;
        body.styleNotes = form.styleNotes || undefined;
      }

      const res = await fetch(`/api/public/partners/${slug}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch (e) {
      console.error("Submit failed", e);
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setSubmitted(false);
    setForm({
      mainContactName: "", companyName: "", email: "", phone: "",
      websiteUrl: "", eventPageUrl: "", eventName: "", eventDate: "",
      neededByDate: "", selectedSize: "", quantity: 1,
      artworkStatus: "will_provide", notes: "", description: "",
      budgetRange: "", venueName: "", venueLocation: "", eventGoals: "",
      designBrief: "", styleNotes: "", textCopy: "",
    });
    setFiles([]);
    setDesignFiles([]);
    setDesignHelp(false);
    onClose();
  };

  const btnStyle = themeColor ? { backgroundColor: themeColor, borderColor: themeColor, color: "#fff" } : {};

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold">Request Submitted</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Your request has been received. Our team will review it and get back to you shortly.
            </p>
            <Button onClick={handleClose} style={btnStyle}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact Information</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input value={form.mainContactName} onChange={e => set("mainContactName", e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <Input value={form.companyName} onChange={e => set("companyName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@company.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website URL</Label>
                <Input value={form.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Event Page URL</Label>
                <Input value={form.eventPageUrl} onChange={e => set("eventPageUrl", e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Event Details</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Event Name</Label>
                <Input value={form.eventName} onChange={e => set("eventName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Event Date</Label>
                <Input type="date" value={form.eventDate} onChange={e => set("eventDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Needed By Date</Label>
                <Input type="date" value={form.neededByDate} onChange={e => set("neededByDate", e.target.value)} />
              </div>
              {showVenue && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Venue</Label>
                    <Input value={form.venueName} onChange={e => set("venueName", e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>

          {showGoals && (
            <div className="space-y-1">
              <Label className="text-xs">Event Goals / Vision</Label>
              <Textarea value={form.eventGoals} onChange={e => set("eventGoals", e.target.value)} className="min-h-[80px] resize-none" placeholder="Describe your vision for this experience..." />
            </div>
          )}

          {showSizeSelector && sizeOptions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Size</Label>
              <Select value={form.selectedSize} onValueChange={v => set("selectedSize", v)}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  {sizeOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showQuantity && (
            <div className="space-y-1 max-w-[120px]">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min={1} value={form.quantity} onChange={e => set("quantity", parseInt(e.target.value) || 1)} />
            </div>
          )}

          {showBudget && (
            <div className="space-y-1">
              <Label className="text-xs">Budget Range (optional)</Label>
              <Input value={form.budgetRange} onChange={e => set("budgetRange", e.target.value)} placeholder="e.g. $5,000 - $15,000" />
            </div>
          )}

          {(showDescription || showGoals) && !showGoals && (
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} className="min-h-[80px] resize-none" placeholder="Describe what you're looking for..." />
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Artwork & Design</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Artwork Status</Label>
                <Select value={form.artworkStatus} onValueChange={v => set("artworkStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="will_provide">I will provide artwork</SelectItem>
                    <SelectItem value="have_artwork">Artwork ready to upload</SelectItem>
                    <SelectItem value="need_help">Need design help</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 py-2">
                <Switch checked={designHelp} onCheckedChange={setDesignHelp} />
                <Label className="text-sm">I need design assistance</Label>
              </div>

              {designHelp && (
                <div className="border rounded-xl p-4 space-y-3 bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-200">
                  <p className="text-xs font-medium text-muted-foreground">Design Support Details</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Design Brief</Label>
                    <Textarea value={form.designBrief} onChange={e => set("designBrief", e.target.value)} className="min-h-[60px] resize-none" placeholder="Describe the look and feel you want..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Style Notes</Label>
                    <Textarea value={form.styleNotes} onChange={e => set("styleNotes", e.target.value)} className="min-h-[50px] resize-none" placeholder="Colors, fonts, visual style references..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Text / Copy for Design</Label>
                    <Textarea value={form.textCopy} onChange={e => set("textCopy", e.target.value)} className="min-h-[50px] resize-none" placeholder="Headlines, body text, taglines..." />
                  </div>
                  <div>
                    <Label className="text-xs">Logo, Brand Guide & Inspiration Files</Label>
                    <input
                      ref={designFileRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => addFiles(e.target.files, "design")}
                    />
                    <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => designFileRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Upload Design Files
                    </Button>
                    {designFiles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {designFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-card border rounded px-2 py-1">
                            <span className="truncate flex-1">{f.file.name}</span>
                            <button type="button" onClick={() => removeFile(i, "design")}><X className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Additional Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="min-h-[60px] resize-none" />
          </div>

          <div>
            <Label className="text-xs">File Uploads</Label>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files, "main")}
            />
            <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload Files
            </Button>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted border rounded px-2 py-1">
                    <span className="truncate flex-1">{f.file.name}</span>
                    <span className="text-muted-foreground shrink-0">{(f.file.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(i, "main")}><X className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.mainContactName || !form.email} style={btnStyle}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
