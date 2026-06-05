import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Building2, Megaphone, MapPin, FileBadge, Wrench, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { type AssetFile, uploadIntakeFile, normalizeSource, Field, Recap, PillGroup, UploadBucket } from "@/components/intake/intakeControls";

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-xl">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
            <p className="text-muted-foreground mb-6">Your pole banner program details have been received. The A3 Visual team will review and reach out shortly.</p>
            {form.contactEmail && <Badge variant="secondary" className="text-xs">Confirmation will go to {form.contactEmail}</Badge>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3" variant="secondary"><Sparkles className="h-3 w-3 mr-1" />A3 Visual</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Pole Banner Program Intake</h1>
          <p className="text-muted-foreground mt-2">Tell us about your pole banner campaign and we'll handle the rest.</p>
        </div>

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
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()} className="gap-1">Next<ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">Your information is sent securely to the A3 Visual team.</p>
      </div>
    </div>
  );
}
