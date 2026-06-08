import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Building2, CalendarClock, Package, Wrench, Sparkles, ChevronRight, ChevronLeft, DollarSign } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { type AssetFile, uploadIntakeFile, normalizeSource, Field, Recap, PillGroup, ChipMulti, UploadBucket, TemplateDownloads } from "@/components/intake/intakeControls";
import { logos } from "@/lib/brand";
import { Reveal } from "@/components/public/motion";

const GREEN = "#1E5340";

const PRODUCT_OPTIONS = [
  "Vinyl Banner", "Fabric Banner", "Mesh Banner", "Pole Banner", "Fence Banner",
  "Wall Graphic", "Floor Graphic", "Window Graphic", "Retractable Banner", "Table Throw",
  "Tent", "Flags", "Step & Repeat", "Foamcore", "PVC", "Acrylic", "Aluminum Signage",
  "Custom Fabrication", "Branded Structure", "Backdrop Wall", "Scenic Element",
  "LED / Screen Partner", "Projection Mapping", "Other",
];
const FINISHING_OPTIONS = ["Grommets", "Pole Pocket", "Hemmed", "Sewn", "Velcro", "Keder", "Wind Slits", "Other"];
const BUDGET_RANGES = ["Under $5,000", "$5,000–$10,000", "$10,000–$25,000", "$25,000–$50,000", "$50,000–$100,000", "$100,000+"];
const YND = ["Yes", "No", "Unsure"];
const YN = ["Yes", "No"];

type Form = Record<string, any>;

const INITIAL: Form = {
  companyName: "", contactName: "", title: "", contactEmail: "", contactPhone: "", website: "", billingAddress: "",
  projectName: "", eventName: "", eventDate: "", eventStartTime: "", eventEndTime: "",
  venueName: "", venueAddress: "", venueContactName: "", venueContactEmail: "", venueContactPhone: "",
  quoteNeededBy: "", artworkDueDate: "", productionDueDate: "", pickupDate: "", deliveryDate: "",
  installDate: "", installTime: "", removalDate: "", removalTime: "", hardDeadline: "",
  products: [] as string[],
  quantity: "", dimensions: "", material: "", sidedness: "", environment: "", finishing: [] as string[],
  artworkReady: "", designNeeded: "", artworkNotes: "",
  installRequired: "", installLocationDetails: "", installHeight: "", liftRequired: "", riggingRequired: "",
  unionVenue: "", overnightInstall: "", siteRestrictions: "", loadingDock: "", parkingInstructions: "", securityCoi: "",
  removalRequired: "", removalHandling: "",
  budgetRange: "", budgetApproved: "", bidDeadline: "", competingQuotes: "",
};

const STEPS = [
  { label: "Client", icon: Building2 },
  { label: "Project", icon: Sparkles },
  { label: "Timeline", icon: CalendarClock },
  { label: "Products & Specs", icon: Package },
  { label: "Install & Removal", icon: Wrench },
  { label: "Budget & Review", icon: DollarSign },
];

export default function SalesIntake({ source }: { source?: string }) {
  const linkSource = normalizeSource(source);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL);
  const [artworkFiles, setArtworkFiles] = useState<AssetFile[]>([]);
  const [brandFiles, setBrandFiles] = useState<AssetFile[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<AssetFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: string, value: string) =>
    setForm((f) => {
      const arr: string[] = f[key] || [];
      return { ...f, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });

  const handleUpload = async (file: File, bucket: "artwork" | "brand" | "reference") => {
    setUploading(bucket);
    try {
      const result = await uploadIntakeFile(file);
      if (bucket === "artwork") setArtworkFiles((p) => [...p, result]);
      else if (bucket === "brand") setBrandFiles((p) => [...p, result]);
      else setReferenceFiles((p) => [...p, result]);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const canAdvance = (): boolean => {
    if (step === 0) return form.companyName.trim().length > 0 && /^\S+@\S+\.\S+$/.test(form.contactEmail);
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        ...form,
        artworkFiles,
        brandGuidelineFiles: brandFiles,
        referenceFiles,
      };
      const res = await fetch(apiUrl("/api/public/intake/submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "general",
          linkSource,
          companyName: form.companyName,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
          payload,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Submission failed. Please review and try again.");
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
      <div className="flex min-h-screen items-center justify-center bg-divini-cream p-6">
        <Card className="surface-luxe w-full max-w-lg border-divini-green/15">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-divini-green/10">
              <CheckCircle2 className="h-8 w-8 text-divini-green" />
            </div>
            <h1 className="font-display mb-2 text-3xl text-divini-green">Thank you</h1>
            <p className="mb-6 text-divini-muted">Your project details have been received. The A3 Visual team will review your request and reach out shortly with next steps.</p>
            {form.contactEmail && <Badge variant="secondary" className="text-xs">Confirmation will go to {form.contactEmail}</Badge>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-divini-cream text-divini-ink">
      <div className="aura aura-a" style={{ width: 440, height: 440, top: -180, left: -140, background: "radial-gradient(circle, hsl(var(--divini-green) / 0.10), transparent 70%)" }} />
      <div className="aura aura-c" style={{ width: 320, height: 320, top: -90, right: -70, background: "radial-gradient(circle, rgba(195,163,104,0.14), transparent 70%)" }} />
      <div className="relative mx-auto max-w-3xl px-4 py-10 md:py-14">
        <div className="mb-8 text-center">
          <img src={logos.monogramGreen} alt="Divini Group" className="mx-auto h-12 w-12 object-contain" />
          <p className="eyebrow mt-5">A3 Visual</p>
          <h1 className="font-display mt-2 text-4xl tracking-tight text-divini-ink md:text-5xl">Project Intake</h1>
          <p className="mt-3 text-divini-muted">Tell us about your project and we'll put together exactly what you need.</p>
        </div>

        <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${i === step ? "bg-divini-green text-divini-green-foreground" : i < step ? "bg-divini-green/12 text-divini-green" : "bg-divini-sand/70 text-divini-muted"}`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-divini-champagne" />}
            </div>
          ))}
        </div>

        <div className="mb-4"><TemplateDownloads /></div>

        <Reveal>
        <Card className="surface-luxe border-divini-green/15">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-divini-green">{STEPS[step].label}</CardTitle>
            <CardDescription className="text-divini-muted">Step {step + 1} of {STEPS.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <div className="space-y-4">
                <Field label="Company Name *"><Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} autoFocus /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Contact Name"><Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} /></Field>
                  <Field label="Title"><Input value={form.title} onChange={(e) => update("title", e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Email *"><Input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} /></Field>
                  <Field label="Phone"><Input type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></Field>
                </div>
                <Field label="Company Website"><Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" /></Field>
                <Field label="Billing Address"><Textarea value={form.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} className="min-h-[60px] resize-none" /></Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Project Name"><Input value={form.projectName} onChange={(e) => update("projectName", e.target.value)} /></Field>
                  <Field label="Event Name"><Input value={form.eventName} onChange={(e) => update("eventName", e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Event Date"><Input type="date" value={form.eventDate} onChange={(e) => update("eventDate", e.target.value)} /></Field>
                  <Field label="Start Time"><Input type="time" value={form.eventStartTime} onChange={(e) => update("eventStartTime", e.target.value)} /></Field>
                  <Field label="End Time"><Input type="time" value={form.eventEndTime} onChange={(e) => update("eventEndTime", e.target.value)} /></Field>
                </div>
                <Field label="Venue Name"><Input value={form.venueName} onChange={(e) => update("venueName", e.target.value)} /></Field>
                <Field label="Venue Address"><Textarea value={form.venueAddress} onChange={(e) => update("venueAddress", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Venue Contact"><Input value={form.venueContactName} onChange={(e) => update("venueContactName", e.target.value)} /></Field>
                  <Field label="Venue Email"><Input type="email" value={form.venueContactEmail} onChange={(e) => update("venueContactEmail", e.target.value)} /></Field>
                  <Field label="Venue Phone"><Input type="tel" value={form.venueContactPhone} onChange={(e) => update("venueContactPhone", e.target.value)} /></Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Quote Needed By"><Input type="date" value={form.quoteNeededBy} onChange={(e) => update("quoteNeededBy", e.target.value)} /></Field>
                <Field label="Artwork Due Date"><Input type="date" value={form.artworkDueDate} onChange={(e) => update("artworkDueDate", e.target.value)} /></Field>
                <Field label="Production Due Date"><Input type="date" value={form.productionDueDate} onChange={(e) => update("productionDueDate", e.target.value)} /></Field>
                <Field label="Pickup Date"><Input type="date" value={form.pickupDate} onChange={(e) => update("pickupDate", e.target.value)} /></Field>
                <Field label="Delivery Date"><Input type="date" value={form.deliveryDate} onChange={(e) => update("deliveryDate", e.target.value)} /></Field>
                <Field label="Install Date"><Input type="date" value={form.installDate} onChange={(e) => update("installDate", e.target.value)} /></Field>
                <Field label="Install Time"><Input type="time" value={form.installTime} onChange={(e) => update("installTime", e.target.value)} /></Field>
                <Field label="Removal Date"><Input type="date" value={form.removalDate} onChange={(e) => update("removalDate", e.target.value)} /></Field>
                <Field label="Removal Time"><Input type="time" value={form.removalTime} onChange={(e) => update("removalTime", e.target.value)} /></Field>
                <Field label="Hard Deadline"><Input type="date" value={form.hardDeadline} onChange={(e) => update("hardDeadline", e.target.value)} /></Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <Field label="Products Needed">
                  <ChipMulti options={PRODUCT_OPTIONS} selected={form.products} onToggle={(v) => toggleIn("products", v)} />
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Quantity"><Input value={form.quantity} onChange={(e) => update("quantity", e.target.value)} /></Field>
                  <Field label="Dimensions"><Input value={form.dimensions} onChange={(e) => update("dimensions", e.target.value)} placeholder='e.g. 3ft x 8ft' /></Field>
                  <Field label="Material"><Input value={form.material} onChange={(e) => update("material", e.target.value)} /></Field>
                  <Field label="Sided"><PillGroup options={["Single-Sided", "Double-Sided"]} value={form.sidedness} onChange={(v) => update("sidedness", v)} /></Field>
                  <Field label="Environment"><PillGroup options={["Indoor", "Outdoor"]} value={form.environment} onChange={(v) => update("environment", v)} /></Field>
                </div>
                <Field label="Finishing">
                  <ChipMulti options={FINISHING_OPTIONS} selected={form.finishing} onToggle={(v) => toggleIn("finishing", v)} />
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Artwork Ready?"><PillGroup options={YN} value={form.artworkReady} onChange={(v) => update("artworkReady", v)} /></Field>
                  <Field label="Design Needed?"><PillGroup options={YN} value={form.designNeeded} onChange={(v) => update("designNeeded", v)} /></Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <UploadBucket label="Artwork" files={artworkFiles} onUpload={(f) => handleUpload(f, "artwork")} onRemove={(i) => setArtworkFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "artwork"} />
                  <UploadBucket label="Brand Guidelines" files={brandFiles} onUpload={(f) => handleUpload(f, "brand")} onRemove={(i) => setBrandFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "brand"} />
                  <UploadBucket label="Reference Images" files={referenceFiles} onUpload={(f) => handleUpload(f, "reference")} onRemove={(i) => setReferenceFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "reference"} />
                </div>
                <Field label="Notes"><Textarea value={form.artworkNotes} onChange={(e) => update("artworkNotes", e.target.value)} className="min-h-[60px] resize-none" /></Field>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <Field label="Install Required?"><PillGroup options={YN} value={form.installRequired} onChange={(v) => update("installRequired", v)} /></Field>
                {form.installRequired === "Yes" && (
                  <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <Field label="Install Location Details"><Textarea value={form.installLocationDetails} onChange={(e) => update("installLocationDetails", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Install Height"><Input value={form.installHeight} onChange={(e) => update("installHeight", e.target.value)} /></Field>
                      <Field label="Lift Required?"><PillGroup options={YND} value={form.liftRequired} onChange={(v) => update("liftRequired", v)} /></Field>
                      <Field label="Rigging Required?"><PillGroup options={YND} value={form.riggingRequired} onChange={(v) => update("riggingRequired", v)} /></Field>
                      <Field label="Union Venue?"><PillGroup options={YND} value={form.unionVenue} onChange={(v) => update("unionVenue", v)} /></Field>
                      <Field label="Overnight Install?"><PillGroup options={YND} value={form.overnightInstall} onChange={(v) => update("overnightInstall", v)} /></Field>
                      <Field label="Loading Dock?"><PillGroup options={YND} value={form.loadingDock} onChange={(v) => update("loadingDock", v)} /></Field>
                    </div>
                    <Field label="Site Restrictions"><Textarea value={form.siteRestrictions} onChange={(e) => update("siteRestrictions", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                    <Field label="Parking Instructions"><Textarea value={form.parkingInstructions} onChange={(e) => update("parkingInstructions", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                    <Field label="Security / COI Requirements"><Textarea value={form.securityCoi} onChange={(e) => update("securityCoi", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                  </div>
                )}
                <Field label="Removal Required?"><PillGroup options={YN} value={form.removalRequired} onChange={(v) => update("removalRequired", v)} /></Field>
                {form.removalRequired === "Yes" && (
                  <Field label="Removal Handling"><PillGroup options={["Remove and Dispose", "Remove and Return", "Remove and Store"]} value={form.removalHandling} onChange={(v) => update("removalHandling", v)} /></Field>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <Field label="Budget Range"><PillGroup options={BUDGET_RANGES} value={form.budgetRange} onChange={(v) => update("budgetRange", v)} /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Budget Approved?"><PillGroup options={YND} value={form.budgetApproved} onChange={(v) => update("budgetApproved", v)} /></Field>
                  <Field label="Competing Quotes?"><PillGroup options={YND} value={form.competingQuotes} onChange={(v) => update("competingQuotes", v)} /></Field>
                </div>
                <Field label="Bid Deadline"><Input type="date" value={form.bidDeadline} onChange={(e) => update("bidDeadline", e.target.value)} /></Field>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <h3 className="font-semibold text-sm mb-3">Quick recap</h3>
                  <dl className="text-xs space-y-1.5">
                    <Recap label="Company" value={form.companyName} />
                    <Recap label="Contact" value={`${form.contactName} ${form.contactEmail ? `<${form.contactEmail}>` : ""}`.trim() || "—"} />
                    <Recap label="Project" value={form.projectName || form.eventName || "—"} />
                    <Recap label="Products" value={form.products.length ? `${form.products.length} selected` : "—"} />
                    <Recap label="Budget" value={form.budgetRange || "—"} />
                    <Recap label="Files" value={`${artworkFiles.length + brandFiles.length + referenceFiles.length} uploaded`} />
                  </dl>
                </div>
                {submitError && <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</div>}
              </div>
            )}

            <div className="flex items-center justify-between pt-6 mt-2 border-t">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="gap-1"><ChevronLeft className="h-4 w-4" />Back</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()} className="gap-1 text-white" style={{ backgroundColor: GREEN }}>Next<ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2 text-white" style={{ backgroundColor: GREEN }}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        </Reveal>
        <p className="mt-6 text-center text-xs text-divini-muted">Your information is sent securely to the A3 Visual team.</p>
      </div>
    </div>
  );
}
