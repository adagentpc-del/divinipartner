import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Building2, Megaphone, MapPin, FileBadge, Wrench, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { type AssetFile, uploadIntakeFile, normalizeSource, Field, Recap, PillGroup, UploadBucket, TemplateDownloads } from "@/components/intake/intakeControls";
import { logos } from "@/lib/brand";
import { Reveal } from "@/components/public/motion";

const GREEN = "#1E5340";

const ORG_TYPES = ["City / Municipality", "Business District / BID", "University / Campus", "Nonprofit", "Corporate", "Event / Festival", "Other"];
const POLE_TYPES = ["City Pole", "Decorative Pole", "Utility Pole", "Campus Pole", "Private Property Pole", "Unsure"];
const YND = ["Yes", "No", "Unsure"];
const YN = ["Yes", "No"];

type Form = Record<string, any>;

const INITIAL: Form = {
  companyName: "", contactName: "", contactEmail: "", contactPhone: "", organizationType: "",
  campaignName: "", campaignStartDate: "", campaignEndDate: "", installationDeadline: "", removalDeadline: "", cityJurisdiction: "", programPurpose: "",
  numberOfPoles: "", locationsKnown: "", desiredStreets: "", existingHardware: "", poleType: "",
  bannerSize: "", quantity: "", bannerCount: "", sidedness: "", material: "", hardwareNeeded: "", artworkReady: "",
  permitRequired: "", a3HandlePermit: "", existingApproval: "",
  installRequired: "", liftRequired: "", trafficControl: "", nightInstall: "",
  removalRequired: "", storeAfterRemoval: "", disposeAfterRemoval: "", reinstallLater: "",
};

const STEPS = [
  { label: "Client", icon: Building2 },
  { label: "Campaign", icon: Megaphone },
  { label: "Poles & Specs", icon: MapPin },
  { label: "Permits", icon: FileBadge },
  { label: "Install / Removal", icon: Wrench },
];

export default function PoleBannerIntake({ source }: { source?: string }) {
  const linkSource = normalizeSource(source);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL);
  const [poleListFiles, setPoleListFiles] = useState<AssetFile[]>([]);
  const [mapFiles, setMapFiles] = useState<AssetFile[]>([]);
  const [photoFiles, setPhotoFiles] = useState<AssetFile[]>([]);
  const [artworkFiles, setArtworkFiles] = useState<AssetFile[]>([]);
  const [brandFiles, setBrandFiles] = useState<AssetFile[]>([]);
  const [permitFiles, setPermitFiles] = useState<AssetFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleUpload = async (file: File, bucket: string, setter: React.Dispatch<React.SetStateAction<AssetFile[]>>) => {
    setUploading(bucket);
    try {
      const result = await uploadIntakeFile(file);
      setter((p) => [...p, result]);
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
        poleListFiles, mapFiles, photoFiles,
        artworkFiles, brandGuidelineFiles: brandFiles, permitFiles,
      };
      const res = await fetch(apiUrl("/api/public/intake/submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "pole_banner",
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
            <p className="mb-6 text-divini-muted">Your pole banner program details have been received. The A3 Visual team will review and reach out shortly.</p>
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
          <h1 className="font-display mt-2 text-4xl tracking-tight text-divini-ink md:text-5xl">Pole Banner Program Intake</h1>
          <p className="mt-3 text-divini-muted">Tell us about your pole banner campaign and we'll handle the rest.</p>
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

        <div className="mb-4"><TemplateDownloads title="Pole banner templates & specs" /></div>

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
                  <Field label="Organization Type"><PillGroup options={ORG_TYPES} value={form.organizationType} onChange={(v) => update("organizationType", v)} /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Email *"><Input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} /></Field>
                  <Field label="Phone"><Input type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Field label="Campaign Name"><Input value={form.campaignName} onChange={(e) => update("campaignName", e.target.value)} /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Campaign Start Date"><Input type="date" value={form.campaignStartDate} onChange={(e) => update("campaignStartDate", e.target.value)} /></Field>
                  <Field label="Campaign End Date"><Input type="date" value={form.campaignEndDate} onChange={(e) => update("campaignEndDate", e.target.value)} /></Field>
                  <Field label="Installation Deadline"><Input type="date" value={form.installationDeadline} onChange={(e) => update("installationDeadline", e.target.value)} /></Field>
                  <Field label="Removal Deadline"><Input type="date" value={form.removalDeadline} onChange={(e) => update("removalDeadline", e.target.value)} /></Field>
                </div>
                <Field label="City / Jurisdiction"><Input value={form.cityJurisdiction} onChange={(e) => update("cityJurisdiction", e.target.value)} /></Field>
                <Field label="Program Purpose"><Textarea value={form.programPurpose} onChange={(e) => update("programPurpose", e.target.value)} className="min-h-[60px] resize-none" /></Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Number of Poles Needed"><Input value={form.numberOfPoles} onChange={(e) => update("numberOfPoles", e.target.value)} /></Field>
                  <Field label="Locations Known?"><PillGroup options={YND} value={form.locationsKnown} onChange={(v) => update("locationsKnown", v)} /></Field>
                </div>
                <Field label="Desired Streets / Areas"><Textarea value={form.desiredStreets} onChange={(e) => update("desiredStreets", e.target.value)} className="min-h-[50px] resize-none" /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Existing Hardware?"><PillGroup options={YND} value={form.existingHardware} onChange={(v) => update("existingHardware", v)} /></Field>
                  <Field label="Hardware Needed?"><PillGroup options={YND} value={form.hardwareNeeded} onChange={(v) => update("hardwareNeeded", v)} /></Field>
                </div>
                <Field label="Pole Type"><PillGroup options={POLE_TYPES} value={form.poleType} onChange={(v) => update("poleType", v)} /></Field>
                <div className="grid sm:grid-cols-3 gap-3">
                  <UploadBucket label="Pole List" files={poleListFiles} onUpload={(f) => handleUpload(f, "poleList", setPoleListFiles)} onRemove={(i) => setPoleListFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "poleList"} />
                  <UploadBucket label="Map" files={mapFiles} onUpload={(f) => handleUpload(f, "map", setMapFiles)} onRemove={(i) => setMapFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "map"} />
                  <UploadBucket label="Photos" files={photoFiles} onUpload={(f) => handleUpload(f, "photos", setPhotoFiles)} onRemove={(i) => setPhotoFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "photos"} />
                </div>
                <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                  <h4 className="text-sm font-semibold">Banner Specs</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Banner Size"><Input value={form.bannerSize} onChange={(e) => update("bannerSize", e.target.value)} /></Field>
                    <Field label="Quantity"><Input value={form.quantity} onChange={(e) => update("quantity", e.target.value)} /></Field>
                    <Field label="Banner Count"><PillGroup options={["Single Banner", "Double Banner"]} value={form.bannerCount} onChange={(v) => update("bannerCount", v)} /></Field>
                    <Field label="Sided"><PillGroup options={["Single-Sided", "Double-Sided"]} value={form.sidedness} onChange={(v) => update("sidedness", v)} /></Field>
                    <Field label="Material"><Input value={form.material} onChange={(e) => update("material", e.target.value)} /></Field>
                    <Field label="Artwork Ready?"><PillGroup options={YN} value={form.artworkReady} onChange={(v) => update("artworkReady", v)} /></Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <UploadBucket label="Artwork" files={artworkFiles} onUpload={(f) => handleUpload(f, "artwork", setArtworkFiles)} onRemove={(i) => setArtworkFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "artwork"} />
                    <UploadBucket label="Brand Guidelines" files={brandFiles} onUpload={(f) => handleUpload(f, "brand", setBrandFiles)} onRemove={(i) => setBrandFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "brand"} />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <Field label="Permit Required?"><PillGroup options={YND} value={form.permitRequired} onChange={(v) => update("permitRequired", v)} /></Field>
                <Field label="Need A3 To Handle Permit?"><PillGroup options={YN} value={form.a3HandlePermit} onChange={(v) => update("a3HandlePermit", v)} /></Field>
                <Field label="Existing Approval?"><PillGroup options={YN} value={form.existingApproval} onChange={(v) => update("existingApproval", v)} /></Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <UploadBucket label="Permit Documents" files={permitFiles} onUpload={(f) => handleUpload(f, "permit", setPermitFiles)} onRemove={(i) => setPermitFiles((p) => p.filter((_, idx) => idx !== i))} busy={uploading === "permit"} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <Field label="Install Required?"><PillGroup options={YN} value={form.installRequired} onChange={(v) => update("installRequired", v)} /></Field>
                {form.installRequired === "Yes" && (
                  <div className="grid sm:grid-cols-3 gap-4 rounded-lg border bg-muted/20 p-4">
                    <Field label="Lift Required?"><PillGroup options={YND} value={form.liftRequired} onChange={(v) => update("liftRequired", v)} /></Field>
                    <Field label="Traffic Control?"><PillGroup options={YND} value={form.trafficControl} onChange={(v) => update("trafficControl", v)} /></Field>
                    <Field label="Night Install?"><PillGroup options={YND} value={form.nightInstall} onChange={(v) => update("nightInstall", v)} /></Field>
                  </div>
                )}
                <Field label="Removal Required?"><PillGroup options={YN} value={form.removalRequired} onChange={(v) => update("removalRequired", v)} /></Field>
                {form.removalRequired === "Yes" && (
                  <div className="grid sm:grid-cols-3 gap-4 rounded-lg border bg-muted/20 p-4">
                    <Field label="Store After Removal?"><PillGroup options={YN} value={form.storeAfterRemoval} onChange={(v) => update("storeAfterRemoval", v)} /></Field>
                    <Field label="Dispose After Removal?"><PillGroup options={YN} value={form.disposeAfterRemoval} onChange={(v) => update("disposeAfterRemoval", v)} /></Field>
                    <Field label="Reinstall Later?"><PillGroup options={YN} value={form.reinstallLater} onChange={(v) => update("reinstallLater", v)} /></Field>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-4">
                  <h3 className="font-semibold text-sm mb-3">Quick recap</h3>
                  <dl className="text-xs space-y-1.5">
                    <Recap label="Company" value={form.companyName} />
                    <Recap label="Campaign" value={form.campaignName || "—"} />
                    <Recap label="City" value={form.cityJurisdiction || "—"} />
                    <Recap label="Poles" value={form.numberOfPoles || "—"} />
                    <Recap label="Files" value={`${poleListFiles.length + mapFiles.length + photoFiles.length + artworkFiles.length + brandFiles.length + permitFiles.length} uploaded`} />
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
