import { useState } from "react";
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
import { Check, Loader2, ArrowRight, ArrowLeft, Printer, Video, Paintbrush, Hammer, Sparkles, Gift, Upload, Shield, Clock, Star } from "lucide-react";

const step1Schema = z.object({
  contactName: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  companyName: z.string().min(1, "Company name is required"),
  eventName: z.string().min(1, "Event/Project name is required"),
  eventDate: z.string().optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
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
  industry: z.string().optional(),
  useCase: z.string().optional(),
  additionalNotes: z.string().optional(),
});

const SERVICE_CATEGORIES = [
  { id: "printing", label: "Printing", icon: Printer, desc: "Large format banners, signage, decals" },
  { id: "rentals", label: "Rentals", icon: Video, desc: "LED screens, AV equipment, structures" },
  { id: "design", label: "Design & Artwork", icon: Paintbrush, desc: "Creative assistance and print-ready prep" },
  { id: "fabrication", label: "Custom Fabrication", icon: Hammer, desc: "Bespoke structures, stage builds, scenic" },
  { id: "immersive", label: "Immersive Experiences", icon: Sparkles, desc: "Interactive tech, lighting, projection" },
  { id: "promo", label: "Promotional Items", icon: Gift, desc: "Branded merch, apparel, giveaways" }
];

const STEP_LABELS = ["Details", "Context", "Services", "Uploads", "Review"];

export default function PartnerPortal({ slug }: { slug: string }) {
  const { data: partner, isLoading } = useGetPublicPartner(slug);
  const submitMutation = useSubmitPublicRequest();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const form = useForm<z.infer<typeof finalSchema>>({
    resolver: zodResolver(step === 1 ? step1Schema : step === 2 ? step2Schema : finalSchema),
    defaultValues: {
      contactName: "", email: "", phone: "", companyName: "", eventName: "",
      eventDate: "", venueName: "", venueAddress: "", industry: "", useCase: "", additionalNotes: ""
    }
  });

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
    const payload = {
      ...values,
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
                      <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="venueName" render={({field}) => (
                      <FormItem><FormLabel>Venue Name</FormLabel><FormControl><Input placeholder="Convention Center" {...field} /></FormControl><FormMessage/></FormItem>
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
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm">{service.label}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{service.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <StepNavigation onPrev={prevStep} onNext={() => setStep(4)} />
                </div>
              )}

              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">File Uploads</h3>
                    <p className="text-sm text-muted-foreground mt-1">Attach any relevant files to help us scope your project.</p>
                  </div>
                  
                  <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer group">
                    <div className="mx-auto w-14 h-14 bg-muted group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary rounded-2xl flex items-center justify-center mb-4 transition-all">
                      <Upload className="h-6 w-6" />
                    </div>
                    <h4 className="font-semibold mb-1">Drag & drop files here, or click to browse</h4>
                    <p className="text-sm text-muted-foreground">PDF, JPG, PNG, AI, PSD — up to 50MB each</p>
                    <p className="text-xs text-muted-foreground mt-4 italic">(Upload functionality available in production)</p>
                  </div>

                  <StepNavigation onPrev={prevStep} onNext={() => setStep(5)} nextLabel="Review" />
                </div>
              )}

              {step === 5 && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold">Review & Submit</h3>
                    <p className="text-sm text-muted-foreground mt-1">Confirm your details before submitting.</p>
                  </div>
                  
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
                    </ReviewSection>

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
              Thank you! Your project request has been received. Our team will review the details and follow up within one business day.
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
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
}
