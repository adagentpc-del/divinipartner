import { useState, useMemo, useEffect } from "react";
import { useGetPublicPartner, useSubmitPublicRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check, Loader2, ArrowRight, ArrowLeft, Printer, Video, Paintbrush,
  Hammer, Sparkles, Gift, Upload, Shield, Clock, Star, AlertTriangle,
  Map, Ruler, Presentation, Image, Lightbulb, Info, DollarSign
} from "lucide-react";
import FullPortal from "./portal/FullPortal";

const step1Schema = z.object({
  contactName: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  companyName: z.string().min(1, "Company name is required"),
  eventName: z.string().min(1, "Event/Project name is required"),
  eventDate: z.string().optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  installDatetime: z.string().optional(),
  removalDatetime: z.string().optional(),
  postEventDisposition: z.string().optional(),
});

const step2Schema = z.object({
  industry: z.string().optional(),
  useCase: z.string().optional(),
  additionalNotes: z.string().optional(),
});

const finalSchema = z.object({
  contactName: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  companyName: z.string(),
  eventName: z.string(),
  eventDate: z.string().optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  installDatetime: z.string().optional(),
  removalDatetime: z.string().optional(),
  postEventDisposition: z.string().optional(),
  industry: z.string().optional(),
  useCase: z.string().optional(),
  additionalNotes: z.string().optional(),
});

const SERVICE_CATEGORIES = [
  { id: "printing", label: "Printing", icon: Printer, desc: "Large format banners, signage, decals" },
  { id: "rentals", label: "Rentals", icon: Video, desc: "LED screens, AV equipment, structures" },
  { id: "design", label: "Design & Artwork", icon: Paintbrush, desc: "Creative assistance and print-ready prep", feeNote: "Additional fees may apply" },
  { id: "fabrication", label: "Custom Fabrication", icon: Hammer, desc: "Bespoke structures, stage builds, scenic" },
  { id: "immersive", label: "Immersive Experiences", icon: Sparkles, desc: "Interactive tech, lighting, projection" },
  { id: "promo", label: "Promotional Items", icon: Gift, desc: "Branded merch, apparel, giveaways" }
];

const UPLOAD_SECTIONS = [
  { id: "floor_map", label: "Floor Maps", icon: Map, desc: "Venue layouts, booth maps, site plans" },
  { id: "measurements", label: "Measurements", icon: Ruler, desc: "Dimensions, specs, technical drawings" },
  { id: "deck", label: "Decks & Briefs", icon: Presentation, desc: "Presentations, brand guides, briefs" },
  { id: "artwork", label: "Artwork", icon: Image, desc: "Print-ready files, logos, creative assets" },
  { id: "inspiration", label: "Inspiration & Concepts", icon: Lightbulb, desc: "Reference images, mood boards, ideas" },
];

const STEP_LABELS = ["Details", "Context", "Services", "Uploads", "Review"];

const DISPOSITION_OPTIONS = [
  { value: "keep", label: "Keep" },
  { value: "remove", label: "Remove" },
  { value: "discard", label: "Discard" },
];

export default function PartnerPortal({ slug }: { slug: string }) {
  const { data: partner, isLoading } = useGetPublicPartner(slug);

  const portalMode = (partner as any)?.portalMode;
  if (!isLoading && portalMode === "full") {
    return <FullPortal slug={slug} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <IntakePortal slug={slug} partner={partner} />;
}

function IntakePortal({ slug, partner }: { slug: string; partner: any }) {
  const submitMutation = useSubmitPublicRequest();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [fabricationNotes, setFabricationNotes] = useState("");
  const [immersiveNotes, setImmersiveNotes] = useState("");

  const form = useForm<z.infer<typeof finalSchema>>({
    resolver: zodResolver(step === 1 ? step1Schema : step === 2 ? step2Schema : finalSchema),
    defaultValues: {
      contactName: "", email: "", phone: "", companyName: "", eventName: "",
      eventDate: "", venueName: "", venueAddress: "", installDatetime: "",
      removalDatetime: "", postEventDisposition: "", industry: "", useCase: "", additionalNotes: ""
    }
  });

  const pricingByCategory = useMemo(() => {
    if (!partner?.pricingRules || !partner.pricingRules.length) return {};
    const map: Record<string, { min: number; count: number }> = {};
    for (const rule of partner.pricingRules) {
      const cat = rule.category?.toLowerCase();
      if (!cat || !rule.startingPrice) continue;
      const key = SERVICE_CATEGORIES.find(s =>
        cat.includes(s.id) || s.label.toLowerCase().includes(cat)
      )?.id;
      if (key) {
        if (!map[key]) map[key] = { min: rule.startingPrice, count: 1 };
        else {
          map[key].min = Math.min(map[key].min, rule.startingPrice);
          map[key].count++;
        }
      }
    }
    return map;
  }, [partner?.pricingRules]);

  const hasPricing = partner?.pricingDisplayEnabled && Object.keys(pricingByCategory).length > 0;

  const hasPrintingNoArtwork = selectedServices.includes("printing") && !selectedServices.includes("design");

  if (!partner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">Partner not found</p>
          <p className="text-muted-foreground">This portal link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const toggleService = (id: string) => {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const nextStep = async () => {
    const isValid = await form.trigger();
    if (isValid) {
      setStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const prevStep = () => {
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (values: z.infer<typeof finalSchema>) => {
    let notes = values.additionalNotes || "";
    if (fabricationNotes) notes += `\n\n[Fabrication Details]\n${fabricationNotes}`;
    if (immersiveNotes) notes += `\n\n[Immersive Details]\n${immersiveNotes}`;

    const payload = {
      ...values,
      additionalNotes: notes,
      installDatetime: values.installDatetime || undefined,
      removalDatetime: values.removalDatetime || undefined,
      postEventDisposition: values.postEventDisposition || undefined,
      designAssistanceRequested: selectedServices.includes("design"),
      customFabricationRequested: selectedServices.includes("fabrication"),
      immersiveRequested: selectedServices.includes("immersive"),
      promotionalItemsRequested: selectedServices.includes("promo"),
      items: selectedServices.map(s => ({ category: s, itemName: "Requested Service Area" })),
      uploads: []
    };

    submitMutation.mutate({ slug, data: payload }, {
      onSuccess: () => setShowSuccessModal(true),
      onError: () => toast({ title: "Submission failed", description: "Please try again later.", variant: "destructive" })
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="bg-card border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.companyName} className="h-10 sm:h-11 object-contain" />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{partner.companyName}</h1>
            )}
            {partner.smallA3BadgeEnabled && (
              <>
                <div className="w-px h-7 bg-border hidden sm:block" />
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Powered by</span>
                  <div className="h-5 w-5 bg-primary rounded flex items-center justify-center text-[9px] text-primary-foreground font-bold leading-none">A3</div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6">

        {step === 1 && (
          <div className="mb-10 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance mb-3">
              {partner.introHeadline || `Start your project with ${partner.companyName}`}
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              {partner.introText || "Fill out the details below to request a quote and kick off your event production."}
            </p>

            {(partner.globalSizzleReelUrl || partner.partnerVideoUrl) && (
              <div className="mt-8 aspect-video rounded-xl overflow-hidden bg-primary/5 border shadow-sm max-w-2xl mx-auto">
                <iframe
                  src={partner.partnerVideoUrl || partner.globalSizzleReelUrl || ""}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Partner sizzle reel"
                />
              </div>
            )}
          </div>
        )}

        <div className="mb-10">
          <div className="flex items-center gap-0 relative">
            {STEP_LABELS.map((label, i) => {
              const s = i + 1;
              const isCompleted = step > s;
              const isCurrent = step === s;
              return (
                <div key={s} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <div className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 transition-colors duration-300 ${
                      step > s ? "bg-primary" : step === s ? "bg-primary/30" : "bg-border"
                    }`} />
                  )}
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-card border-2 border-border text-muted-foreground"
                  }`}>
                    {isCompleted ? <Check className="h-4 w-4" /> : s}
                  </div>
                  <span className={`mt-2 text-xs font-medium transition-colors ${
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  } hidden sm:block`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm animate-in fade-in duration-300">
          <Form {...form}>
            <form className="p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); if(step===5) form.handleSubmit(onSubmit)(e); }}>

              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">Contact & Event Details</h3>
                    <p className="text-sm text-muted-foreground mt-1">Tell us about you and your upcoming event.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <FormField control={form.control} name="contactName" render={({field}) => (
                      <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Jane Smith" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="companyName" render={({field}) => (
                      <FormItem><FormLabel>Company / Organization</FormLabel><FormControl><Input placeholder="Acme Corp" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="email" render={({field}) => (
                      <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" placeholder="jane@company.com" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="phone" render={({field}) => (
                      <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="(555) 000-0000" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                  </div>

                  <div className="mt-8 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Information</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <FormField control={form.control} name="eventName" render={({field}) => (
                      <FormItem className="sm:col-span-2"><FormLabel>Event / Project Name</FormLabel><FormControl><Input placeholder="Annual Summit 2026" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="eventDate" render={({field}) => (
                      <FormItem><FormLabel>Event Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="venueName" render={({field}) => (
                      <FormItem><FormLabel>Venue Name</FormLabel><FormControl><Input placeholder="Convention Center" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="venueAddress" render={({field}) => (
                      <FormItem className="sm:col-span-2"><FormLabel>Venue Address</FormLabel><FormControl><Input placeholder="123 Main St, Miami, FL" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                  </div>

                  <div className="mt-8 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Install & Removal</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <FormField control={form.control} name="installDatetime" render={({field}) => (
                      <FormItem><FormLabel>Install Date & Time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="removalDatetime" render={({field}) => (
                      <FormItem><FormLabel>Removal Date & Time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="postEventDisposition" render={({field}) => (
                      <FormItem>
                        <FormLabel>Post-Event Disposition</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="What happens after the event?" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {DISPOSITION_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage/>
                      </FormItem>
                    )}/>
                  </div>
                  <StepNavigation onNext={nextStep} />
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">Industry & Context</h3>
                    <p className="text-sm text-muted-foreground mt-1">Help us understand your project better.</p>
                  </div>
                  <div className="space-y-5 max-w-lg">
                    <FormField control={form.control} name="industry" render={({field}) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select your industry" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="tech">Technology</SelectItem>
                            <SelectItem value="sports">Sports & Athletics</SelectItem>
                            <SelectItem value="music">Music & Entertainment</SelectItem>
                            <SelectItem value="corporate">Corporate / Finance</SelectItem>
                            <SelectItem value="healthcare">Healthcare</SelectItem>
                            <SelectItem value="education">Education</SelectItem>
                            <SelectItem value="nonprofit">Nonprofit</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage/>
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="useCase" render={({field}) => (
                      <FormItem>
                        <FormLabel>Use Case</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select use case" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="conference">Conference / Summit</SelectItem>
                            <SelectItem value="activation">Brand Activation</SelectItem>
                            <SelectItem value="festival">Festival</SelectItem>
                            <SelectItem value="tradeshow">Trade Show Booth</SelectItem>
                            <SelectItem value="permanent">Permanent Install</SelectItem>
                            <SelectItem value="corporate_event">Corporate Event</SelectItem>
                            <SelectItem value="product_launch">Product Launch</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage/>
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="additionalNotes" render={({field}) => (
                      <FormItem>
                        <FormLabel>Brief Description</FormLabel>
                        <FormControl><Textarea className="min-h-[120px] resize-none" placeholder="Tell us about your vision for this project..." {...field} /></FormControl>
                        <FormMessage/>
                      </FormItem>
                    )}/>
                  </div>
                  <StepNavigation onPrev={prevStep} onNext={nextStep} />
                </div>
              )}

              {step === 3 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">What services do you need?</h3>
                    <p className="text-sm text-muted-foreground mt-1">Select all that apply. We'll tailor your quote accordingly.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {SERVICE_CATEGORIES.map((service) => {
                      const isSelected = selectedServices.includes(service.id);
                      const pricing = pricingByCategory[service.id];
                      const isCustomPriced = service.id === "fabrication" || service.id === "immersive";
                      return (
                        <button
                          type="button"
                          key={service.id}
                          onClick={() => toggleService(service.id)}
                          className={`relative flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-transparent bg-muted/50 hover:bg-muted hover:border-border'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-3 right-3 h-5 w-5 bg-primary rounded-full flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                          <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground border'
                          }`}>
                            <service.icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 pr-6">
                            <h4 className="font-semibold text-sm">{service.label}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{service.desc}</p>
                            {service.feeNote && (
                              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                                <Info className="h-3 w-3" /> {service.feeNote}
                              </p>
                            )}
                            {hasPricing && pricing && !isCustomPriced && (
                              <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1 font-medium">
                                <DollarSign className="h-3 w-3" /> Starting at ${pricing.min.toFixed(0)}
                              </p>
                            )}
                            {hasPricing && isCustomPriced && (
                              <p className="text-[11px] text-muted-foreground mt-1.5 italic">Quoted based on scope</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedServices.includes("fabrication") && (
                    <div className="mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-start gap-3">
                        <Hammer className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-amber-900">Custom Fabrication Details</h4>
                          <p className="text-xs text-amber-700 mt-0.5 mb-3">Describe your fabrication needs — structures, materials, dimensions, or concepts.</p>
                          <Textarea
                            value={fabricationNotes}
                            onChange={e => setFabricationNotes(e.target.value)}
                            placeholder="Describe your custom fabrication concept, dimensions, materials..."
                            className="min-h-[80px] resize-none bg-white border-amber-200 text-sm"
                          />
                          <p className="text-[11px] text-amber-600 mt-2">You can also upload concept files in the next step.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedServices.includes("immersive") && (
                    <div className="mt-4 p-5 bg-violet-50 border border-violet-200 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-violet-900">Immersive Experience Details</h4>
                          <p className="text-xs text-violet-700 mt-0.5 mb-3">Tell us about the immersive elements — projection, interactive, LED, scenic, etc.</p>
                          <Textarea
                            value={immersiveNotes}
                            onChange={e => setImmersiveNotes(e.target.value)}
                            placeholder="Describe the immersive experience you envision..."
                            className="min-h-[80px] resize-none bg-white border-violet-200 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedServices.includes("design") && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900">Design Assistance Confirmed</h4>
                        <p className="text-xs text-blue-700 mt-0.5">Our team will assist with creative design and print-ready file preparation. Additional design fees may apply based on scope.</p>
                      </div>
                    </div>
                  )}

                  <StepNavigation onPrev={prevStep} onNext={() => setStep(4)} />
                </div>
              )}

              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">File Uploads</h3>
                    <p className="text-sm text-muted-foreground mt-1">Attach relevant files by category to help us scope your project accurately.</p>
                  </div>

                  <div className="space-y-4">
                    {UPLOAD_SECTIONS.map(section => {
                      const isConceptSection = section.id === "inspiration";
                      const showHighlight = isConceptSection && selectedServices.includes("fabrication");
                      return (
                        <div
                          key={section.id}
                          className={`border-2 border-dashed rounded-xl p-6 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer group ${
                            showHighlight ? "border-amber-300 bg-amber-50/50" : "border-border"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                              showHighlight
                                ? "bg-amber-100 text-amber-600"
                                : "bg-muted group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary"
                            }`}>
                              <section.icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm">{section.label}</h4>
                                {showHighlight && (
                                  <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{section.desc}</p>
                              <p className="text-[11px] text-muted-foreground mt-2">
                                PDF, JPG, PNG, AI, PSD, SVG, EPS, XLS, DOC — up to 50MB each
                              </p>
                            </div>
                            <div className="shrink-0">
                              <div className="h-9 w-9 rounded-lg bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted-foreground mt-4 text-center italic">(Upload functionality available in production)</p>

                  <StepNavigation onPrev={prevStep} onNext={() => setStep(5)} nextLabel="Review" />
                </div>
              )}

              {step === 5 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">Review & Submit</h3>
                    <p className="text-sm text-muted-foreground mt-1">Confirm your details before submitting.</p>
                  </div>

                  {hasPrintingNoArtwork && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-amber-900">Artwork Reminder</h4>
                        <p className="text-xs text-amber-700 mt-0.5">You selected Printing but did not select Design assistance. Make sure you have print-ready artwork files, or go back and add Design & Artwork services.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-6">
                    <ReviewSection title="Contact Details">
                      <ReviewRow label="Name" value={form.getValues().contactName} />
                      <ReviewRow label="Company" value={form.getValues().companyName} />
                      <ReviewRow label="Email" value={form.getValues().email} />
                      {form.getValues().phone && <ReviewRow label="Phone" value={form.getValues().phone} />}
                    </ReviewSection>

                    <ReviewSection title="Event Details">
                      <ReviewRow label="Event" value={form.getValues().eventName} />
                      <ReviewRow label="Date" value={form.getValues().eventDate || "Not specified"} />
                      {form.getValues().venueName && <ReviewRow label="Venue" value={form.getValues().venueName} />}
                      {form.getValues().venueAddress && <ReviewRow label="Address" value={form.getValues().venueAddress} />}
                    </ReviewSection>

                    {(form.getValues().installDatetime || form.getValues().removalDatetime || form.getValues().postEventDisposition) && (
                      <ReviewSection title="Install & Removal">
                        {form.getValues().installDatetime && (
                          <ReviewRow label="Install" value={new Date(form.getValues().installDatetime!).toLocaleString()} />
                        )}
                        {form.getValues().removalDatetime && (
                          <ReviewRow label="Removal" value={new Date(form.getValues().removalDatetime!).toLocaleString()} />
                        )}
                        {form.getValues().postEventDisposition && (
                          <ReviewRow label="Disposition" value={DISPOSITION_OPTIONS.find(o => o.value === form.getValues().postEventDisposition)?.label || form.getValues().postEventDisposition!} />
                        )}
                      </ReviewSection>
                    )}

                    <ReviewSection title="Selected Services">
                      {selectedServices.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedServices.map(id => {
                            const svc = SERVICE_CATEGORIES.find(c => c.id === id);
                            return svc ? (
                              <span key={id} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium px-3 py-1.5 rounded-lg">
                                <svc.icon className="h-3.5 w-3.5" />
                                {svc.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No specific services selected.</p>
                      )}
                    </ReviewSection>

                    {(fabricationNotes || immersiveNotes) && (
                      <ReviewSection title="Additional Details">
                        {fabricationNotes && <ReviewRow label="Fabrication" value={fabricationNotes} />}
                        {immersiveNotes && <ReviewRow label="Immersive" value={immersiveNotes} />}
                      </ReviewSection>
                    )}
                  </div>

                  <div className="mt-8 pt-6 border-t flex flex-col-reverse sm:flex-row justify-between gap-3">
                    <Button type="button" variant="outline" size="lg" onClick={prevStep} className="gap-2">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button type="submit" size="lg" className="gap-2 px-8" disabled={submitMutation.isPending}>
                      {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Submit Request
                    </Button>
                  </div>
                </div>
              )}

            </form>
          </Form>
        </div>

        {step === 1 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-muted-foreground">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Shield className="h-4 w-4" />
              <span>Secure & confidential</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Clock className="h-4 w-4" />
              <span>Response within 24 hours</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Star className="h-4 w-4" />
              <span>No obligation quote</span>
            </div>
          </div>
        )}
      </main>

      {partner.smallA3BadgeEnabled && (
        <footer className="py-6 border-t bg-card">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Production services by</span>
            <div className="h-4 w-4 bg-primary rounded flex items-center justify-center text-[8px] text-primary-foreground font-bold leading-none">A3</div>
            <span className="font-medium text-foreground/70">A3 Visual</span>
          </div>
        </footer>
      )}

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <div className="bg-primary/5 py-10 flex items-center justify-center">
            <div className="h-20 w-20 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
          </div>
          <div className="p-8 text-center">
            <DialogTitle className="text-2xl font-bold mb-3">Request Submitted</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-muted-foreground">
              Thank you! Your project request has been received. Our team will review the details and follow up within one business day. If you have questions, please email admin@a3visual.com.
            </DialogDescription>
            <DialogFooter className="mt-8 sm:justify-center">
              <Button onClick={() => window.location.reload()} size="lg" className="w-full sm:w-auto px-8">
                Start New Request
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepNavigation({ onPrev, onNext, nextLabel }: { onPrev?: () => void; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className="mt-8 pt-6 border-t flex justify-between gap-3">
      {onPrev ? (
        <Button type="button" variant="outline" size="lg" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      ) : <div />}
      {onNext && (
        <Button type="button" size="lg" onClick={onNext} className="gap-2 px-6">
          {nextLabel || "Continue"} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-xl p-5 border">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-words">{value || "—"}</span>
    </div>
  );
}
