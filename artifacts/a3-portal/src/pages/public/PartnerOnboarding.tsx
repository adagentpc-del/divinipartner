import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Building2, Palette, User, Receipt, Image as ImageIcon, Upload, X, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";

type AssetFile = { name: string; url: string };

type FormState = {
  companyName: string; websiteUrl: string; industryFocus: string;
  partnerType: "branding" | "ordering" | "";
  portalMode: "intake" | "full" | "ordering" | "";
  hasTours: "yes" | "no" | "";
  introHeadline: string; introText: string; thankYouText: string;
  brandColors: string;
  contactName: string; contactEmail: string; contactPhone: string; contactRole: string;
  billingContactName: string; billingEmail: string; billingPhone: string; billingAddress: string;
  taxId: string; paymentTerms: string; billingNotes: string;
  whatWeNeed: string; timeline: string; budgetRange: string; referenceUrls: string;
};

const INITIAL: FormState = {
  companyName: "", websiteUrl: "", industryFocus: "",
  partnerType: "", portalMode: "", hasTours: "",
  introHeadline: "", introText: "", thankYouText: "",
  brandColors: "",
  contactName: "", contactEmail: "", contactPhone: "", contactRole: "",
  billingContactName: "", billingEmail: "", billingPhone: "", billingAddress: "",
  taxId: "", paymentTerms: "", billingNotes: "",
  whatWeNeed: "", timeline: "", budgetRange: "", referenceUrls: "",
};

const STEPS = [
  { label: "Your Company", icon: Building2 },
  { label: "Portal Type", icon: Sparkles },
  { label: "Brand & Visuals", icon: Palette },
  { label: "Contact", icon: User },
  { label: "Billing", icon: Receipt },
  { label: "Review", icon: CheckCircle2 },
];

async function uploadFile(file: File): Promise<AssetFile> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Failed to prepare upload");
  const { uploadURL, objectPath } = await res.json();
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload failed");
  return { name: file.name, url: objectPath };
}

export default function PartnerOnboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [logo, setLogo] = useState<AssetFile | null>(null);
  const [secondaryLogo, setSecondaryLogo] = useState<AssetFile | null>(null);
  const [brandAssets, setBrandAssets] = useState<AssetFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));

  const handleFileUpload = async (file: File, kind: "logo" | "secondaryLogo" | "asset") => {
    setUploading(kind);
    try {
      const result = await uploadFile(file);
      if (kind === "logo") setLogo(result);
      else if (kind === "secondaryLogo") setSecondaryLogo(result);
      else setBrandAssets(prev => [...prev, result]);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const canAdvance = (): boolean => {
    if (step === 0) return form.companyName.trim().length > 0;
    if (step === 3) return form.contactName.trim().length > 0 && /^\S+@\S+\.\S+$/.test(form.contactEmail);
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: any = {
        ...form,
        partnerType: form.partnerType || null,
        portalMode: form.portalMode || null,
        hasTours: form.hasTours || null,
        logoUrl: logo?.url || null,
        secondaryLogoUrl: secondaryLogo?.url || null,
        brandAssetsJson: brandAssets.length > 0 ? brandAssets : null,
      };
      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Submission failed. Please check the form and try again.");
      }
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-xl">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
            <p className="text-muted-foreground mb-6">Your onboarding info has been received. The A3 team will review your submission and get back to you shortly to confirm next steps and activate your portal.</p>
            <Badge variant="secondary" className="text-xs">Confirmation sent to {form.contactEmail}</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3" variant="secondary"><Sparkles className="h-3 w-3 mr-1" />Partner Onboarding</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Let's get your portal set up</h1>
          <p className="text-muted-foreground mt-2">Tell us about your company and how you'd like to use A3. Takes about 5 minutes.</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5" />}
            </div>
          ))}
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">{STEPS[step].label}</CardTitle>
            <CardDescription>Step {step + 1} of {STEPS.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <Label>Company / Brand Name *</Label>
                  <Input value={form.companyName} onChange={e => update("companyName", e.target.value)} placeholder="Acme Events" autoFocus />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <Input value={form.websiteUrl} onChange={e => update("websiteUrl", e.target.value)} placeholder="https://acme.com" />
                  </div>
                  <div>
                    <Label>Industry / Focus</Label>
                    <Input value={form.industryFocus} onChange={e => update("industryFocus", e.target.value)} placeholder="Events, Hospitality, Retail..." />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-sm mb-2 block">What kind of partner are you? *</Label>
                  <RadioGroup value={form.partnerType} onValueChange={(v: any) => update("partnerType", v)}>
                    <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${form.partnerType === "branding" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}>
                      <RadioGroupItem value="branding" className="mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium">Branding Partner</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Venue zones, signage, branded environments (e.g. hotels, conference spaces, retail).</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${form.partnerType === "ordering" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}>
                      <RadioGroupItem value="ordering" className="mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium">Ordering Partner</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Multi-city events with packages and add-ons (e.g. festivals, multi-stop tours).</div>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Client portal style</Label>
                  <RadioGroup value={form.portalMode} onValueChange={(v: any) => update("portalMode", v)}>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${form.portalMode === "intake" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}>
                      <RadioGroupItem value="intake" className="mt-0.5" />
                      <div className="flex-1"><div className="font-medium text-sm">Simple Intake Form</div><div className="text-xs text-muted-foreground">5-step request form for quick lead capture</div></div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${form.portalMode === "full" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}>
                      <RadioGroupItem value="full" className="mt-0.5" />
                      <div className="flex-1"><div className="font-medium text-sm">Full Portal (catalog + venue)</div><div className="text-xs text-muted-foreground">Multi-section catalog with branding zones</div></div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${form.portalMode === "ordering" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}>
                      <RadioGroupItem value="ordering" className="mt-0.5" />
                      <div className="flex-1"><div className="font-medium text-sm">Ordering Portal (event/package/cart)</div><div className="text-xs text-muted-foreground">For multi-stop events and package-based orders</div></div>
                    </label>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Will this be used for events with tours / multiple stops?</Label>
                  <RadioGroup value={form.hasTours} onValueChange={(v: any) => update("hasTours", v)} className="flex gap-3">
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer ${form.hasTours === "yes" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="yes" /> Yes — tours
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer ${form.hasTours === "no" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="no" /> No — single venue
                    </label>
                  </RadioGroup>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FileSlot label="Primary Logo" file={logo} onClear={() => setLogo(null)} onUpload={f => handleFileUpload(f, "logo")} uploading={uploading === "logo"} />
                  <FileSlot label="Secondary / Mark" file={secondaryLogo} onClear={() => setSecondaryLogo(null)} onUpload={f => handleFileUpload(f, "secondaryLogo")} uploading={uploading === "secondaryLogo"} />
                </div>
                <div>
                  <Label>Brand Colors (hex codes, separated by commas)</Label>
                  <Input value={form.brandColors} onChange={e => update("brandColors", e.target.value)} placeholder="#1a1a1a, #ff6600, #f5f5f5" />
                </div>
                <div>
                  <Label>Welcome Headline</Label>
                  <Input value={form.introHeadline} onChange={e => update("introHeadline", e.target.value)} placeholder="Order your event materials" />
                </div>
                <div>
                  <Label>Welcome / Intro Copy</Label>
                  <Textarea value={form.introText} onChange={e => update("introText", e.target.value)} placeholder="What clients should see at the top of your portal..." className="min-h-[80px] resize-none" />
                </div>
                <div>
                  <Label>Thank-You Message</Label>
                  <Textarea value={form.thankYouText} onChange={e => update("thankYouText", e.target.value)} placeholder="Shown after a client submits a request..." className="min-h-[60px] resize-none" />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> Additional Brand Assets (style guides, decks, photos)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {brandAssets.map((a, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 pr-1">
                        {a.name}
                        <button onClick={() => setBrandAssets(prev => prev.filter((_, idx) => idx !== i))} className="hover:bg-destructive/20 rounded p-0.5"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                    <label className="cursor-pointer">
                      <input type="file" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], "asset")} />
                      <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary transition">
                        {uploading === "asset" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        Add file
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Your Name *</Label>
                    <Input value={form.contactName} onChange={e => update("contactName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Role / Title</Label>
                    <Input value={form.contactRole} onChange={e => update("contactRole", e.target.value)} placeholder="VP Marketing, Event Producer..." />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={form.contactEmail} onChange={e => update("contactEmail", e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input type="tel" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">Optional — used for invoicing and payment routing. We'll confirm everything with you before sending any invoice.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Billing Contact</Label>
                    <Input value={form.billingContactName} onChange={e => update("billingContactName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Billing Email</Label>
                    <Input type="email" value={form.billingEmail} onChange={e => update("billingEmail", e.target.value)} placeholder="ap@company.com" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Billing Phone</Label>
                    <Input type="tel" value={form.billingPhone} onChange={e => update("billingPhone", e.target.value)} />
                  </div>
                  <div>
                    <Label>Tax ID / EIN</Label>
                    <Input value={form.taxId} onChange={e => update("taxId", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Billing Address</Label>
                  <Textarea value={form.billingAddress} onChange={e => update("billingAddress", e.target.value)} className="min-h-[60px] resize-none" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Preferred Payment Terms</Label>
                    <Input value={form.paymentTerms} onChange={e => update("paymentTerms", e.target.value)} placeholder="Net 30, 50% deposit, etc." />
                  </div>
                  <div>
                    <Label>Estimated Budget Range</Label>
                    <Input value={form.budgetRange} onChange={e => update("budgetRange", e.target.value)} placeholder="$5k–$25k per event" />
                  </div>
                </div>
                <div>
                  <Label>Billing Notes</Label>
                  <Textarea value={form.billingNotes} onChange={e => update("billingNotes", e.target.value)} placeholder="PO requirements, approval process, etc." className="min-h-[60px] resize-none" />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <Label>What do you need from A3?</Label>
                  <Textarea value={form.whatWeNeed} onChange={e => update("whatWeNeed", e.target.value)} placeholder="Brief description of your goals, products, or services you want to offer..." className="min-h-[80px] resize-none" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Timeline</Label>
                    <Input value={form.timeline} onChange={e => update("timeline", e.target.value)} placeholder="Q3 2026, ASAP, ongoing..." />
                  </div>
                  <div>
                    <Label>Reference URLs</Label>
                    <Input value={form.referenceUrls} onChange={e => update("referenceUrls", e.target.value)} placeholder="Inspiration sites, past work..." />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 mt-4">
                  <h3 className="font-semibold text-sm mb-3">Quick recap</h3>
                  <dl className="text-xs space-y-1.5">
                    <Row label="Company" value={form.companyName} />
                    <Row label="Type" value={form.partnerType || "—"} />
                    <Row label="Portal" value={form.portalMode || "—"} />
                    <Row label="Tours" value={form.hasTours || "—"} />
                    <Row label="Logo" value={logo ? logo.name : "—"} />
                    <Row label="Brand assets" value={brandAssets.length > 0 ? `${brandAssets.length} file${brandAssets.length !== 1 ? "s" : ""}` : "—"} />
                    <Row label="Contact" value={`${form.contactName} <${form.contactEmail}>`} />
                    <Row label="Billing email" value={form.billingEmail || "—"} />
                  </dl>
                </div>

                {submitError && <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</div>}
              </div>
            )}

            <div className="flex items-center justify-between pt-6 mt-2 border-t">
              <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="gap-1"><ChevronLeft className="h-4 w-4" />Back</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()} className="gap-1">Next<ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">Your information is sent securely to the A3 team. We'll review and reach out within 1–2 business days.</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium text-right truncate max-w-[60%]">{value}</dd></div>
  );
}

function FileSlot({ label, file, onUpload, onClear, uploading }: { label: string; file: AssetFile | null; onUpload: (f: File) => void; onClear: () => void; uploading: boolean }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      {file ? (
        <div className="mt-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-xs">
          <span className="truncate font-medium">{file.name}</span>
          <button onClick={onClear} className="hover:bg-destructive/20 rounded p-0.5"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <label className="mt-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary transition text-sm">
          <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4" />Upload {label}</>}
        </label>
      )}
    </div>
  );
}
