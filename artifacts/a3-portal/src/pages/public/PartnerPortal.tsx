import { useState } from "react";
import { useGetPublicPartner, useSubmitPublicRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronRight, Loader2, ArrowRight, Printer, Video, Paintbrush, Hammer, Sparkles, Gift, FileText } from "lucide-react";

// Form schemas for steps
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

// A complete schema for the final submission
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
  { id: "immersive", label: "Immersive Experiences", icon: Sparkles, desc: "Interactive tech, lighting, projection mapping" },
  { id: "promo", label: "Promotional Items", icon: Gift, desc: "Branded merch, apparel, giveaways" }
];

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
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!partner) {
    return <div className="min-h-screen flex items-center justify-center text-xl text-muted-foreground">Partner not found.</div>;
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
      window.scrollTo(0, 0);
    }
  };

  const onSubmit = async (values: z.infer<typeof finalSchema>) => {
    if (selectedServices.includes("printing") && !selectedServices.includes("design")) {
      // Logic would typically enforce artwork upload here, but we simplify for demo
      toast({ title: "Reminder", description: "You selected Printing. Ensure you provide print-ready artwork or select Design assistance." });
    }

    const payload = {
      ...values,
      designAssistanceRequested: selectedServices.includes("design"),
      customFabricationRequested: selectedServices.includes("fabrication"),
      immersiveRequested: selectedServices.includes("immersive"),
      promotionalItemsRequested: selectedServices.includes("promo"),
      items: selectedServices.map(s => ({ category: s, itemName: "Requested Service Area" })),
      uploads: [] // File uploads would be handled via signed URLs in a real implementation
    };

    submitMutation.mutate({ slug, data: payload }, {
      onSuccess: () => {
        setShowSuccessModal(true);
      },
      onError: () => {
        toast({ title: "Submission failed", description: "Please try again later.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-card border-b py-6 px-8 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {partner.logoUrl ? (
            <img src={partner.logoUrl} alt={partner.companyName} className="h-12 object-contain" />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{partner.companyName}</h1>
          )}
          {partner.smallA3BadgeEnabled && (
            <>
              <div className="w-px h-8 bg-border"></div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                Powered by <div className="h-6 w-6 bg-primary rounded flex items-center justify-center text-[10px] text-primary-foreground font-bold leading-none">A3</div>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto py-12 px-6">
        
        {step === 1 && (
          <div className="mb-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl font-bold tracking-tight mb-4">
              {partner.introHeadline || `Start your project with ${partner.companyName}`}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {partner.introText || "Fill out the details below to request quote and kick off your event production."}
            </p>
            
            {(partner.globalSizzleReelUrl || partner.partnerVideoUrl) && (
              <div className="mt-8 aspect-video rounded-xl overflow-hidden bg-muted border shadow-lg max-w-3xl mx-auto">
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

        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-muted -z-10"></div>
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm border-2 bg-card transition-colors ${
                step > s ? "border-primary bg-primary text-primary-foreground" :
                step === s ? "border-primary text-primary" : "border-muted text-muted-foreground"
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs font-medium text-muted-foreground">
            <span>Details</span>
            <span>Context</span>
            <span>Services</span>
            <span>Uploads</span>
            <span>Review</span>
          </div>
        </div>

        <div className="bg-card border rounded-xl shadow-sm p-8">
          <Form {...form}>
            <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); if(step===5) form.handleSubmit(onSubmit)(e); }}>
              
              {/* STEP 1: Details */}
              <div className={step === 1 ? "block" : "hidden"}>
                <h3 className="text-2xl font-semibold mb-6">Contact & Event Details</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="contactName" render={({field}) => (
                    <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="companyName" render={({field}) => (
                    <FormItem><FormLabel>Company / Organization</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({field}) => (
                    <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="phone" render={({field}) => (
                    <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  
                  <div className="col-span-2 pt-4"><h4 className="font-medium text-lg border-b pb-2 mb-4">Event Information</h4></div>
                  
                  <FormField control={form.control} name="eventName" render={({field}) => (
                    <FormItem className="col-span-2"><FormLabel>Event / Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="eventDate" render={({field}) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="venueName" render={({field}) => (
                    <FormItem><FormLabel>Venue Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )}/>
                </div>
                <div className="mt-8 flex justify-end">
                  <Button type="button" size="lg" onClick={nextStep}>Next: Context <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>

              {/* STEP 2: Context */}
              <div className={step === 2 ? "block" : "hidden"}>
                <h3 className="text-2xl font-semibold mb-6">Industry & Use Case</h3>
                <div className="space-y-6 max-w-2xl">
                  <FormField control={form.control} name="industry" render={({field}) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger></FormControl>
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
                      <FormLabel>Brief Description of the Project</FormLabel>
                      <FormControl><Textarea className="min-h-[120px]" {...field} /></FormControl>
                      <FormMessage/>
                    </FormItem>
                  )}/>
                </div>
                <div className="mt-8 flex justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>Back</Button>
                  <Button type="button" size="lg" onClick={nextStep}>Next: Services <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>

              {/* STEP 3: Services */}
              <div className={step === 3 ? "block" : "hidden"}>
                <h3 className="text-2xl font-semibold mb-6">What services do you need?</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {SERVICE_CATEGORIES.map((service) => {
                    const isSelected = selectedServices.includes(service.id);
                    return (
                      <div 
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-md' : 'border-muted hover:border-primary/50 hover:bg-muted/30'}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            <service.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg">{service.label}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{service.desc}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-8 flex justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>Back</Button>
                  <Button type="button" size="lg" onClick={() => setStep(4)}>Next: Uploads <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>

              {/* STEP 4: Uploads */}
              <div className={step === 4 ? "block" : "hidden"}>
                <h3 className="text-2xl font-semibold mb-2">File Uploads</h3>
                <p className="text-muted-foreground mb-8">Attach any relevant files to help us scope your project accurately.</p>
                
                <div className="space-y-6">
                  <div className="border-2 border-dashed rounded-xl p-10 text-center hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                      <FileText className="h-6 w-6" />
                    </div>
                    <h4 className="font-medium text-lg mb-1">Click to upload files</h4>
                    <p className="text-sm text-muted-foreground">PDF, JPG, PNG, AI, PSD up to 50MB</p>
                    <p className="text-xs text-muted-foreground mt-4 italic">(Upload functionality simulated for this demo)</p>
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(3)}>Back</Button>
                  <Button type="button" size="lg" onClick={() => setStep(5)}>Next: Review <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>

              {/* STEP 5: Review */}
              <div className={step === 5 ? "block" : "hidden"}>
                <h3 className="text-2xl font-semibold mb-6">Review & Submit</h3>
                
                <div className="bg-muted/30 rounded-xl p-6 space-y-6 border">
                  <div>
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider mb-3">Contact Details</h4>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Name:</div><div className="font-medium">{form.getValues().contactName}</div>
                      <div className="text-muted-foreground">Company:</div><div className="font-medium">{form.getValues().companyName}</div>
                      <div className="text-muted-foreground">Email:</div><div className="font-medium">{form.getValues().email}</div>
                    </div>
                  </div>
                  
                  <div className="w-full h-px bg-border"></div>
                  
                  <div>
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider mb-3">Event Details</h4>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Event:</div><div className="font-medium">{form.getValues().eventName}</div>
                      <div className="text-muted-foreground">Date:</div><div className="font-medium">{form.getValues().eventDate || 'Not specified'}</div>
                    </div>
                  </div>

                  <div className="w-full h-px bg-border"></div>

                  <div>
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider mb-3">Requested Services</h4>
                    {selectedServices.length > 0 ? (
                      <ul className="list-disc list-inside text-sm font-medium pl-2 space-y-1">
                        {selectedServices.map(id => (
                          <li key={id}>{SERVICE_CATEGORIES.find(c => c.id === id)?.label}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No specific services selected.</p>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(4)}>Back</Button>
                  <Button type="submit" size="lg" className="px-8" disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    Submit Request
                  </Button>
                </div>
              </div>

            </form>
          </Form>
        </div>
      </main>

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md text-center p-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
            <Check className="h-8 w-8" />
          </div>
          <DialogTitle className="text-2xl mb-2">Request submitted successfully</DialogTitle>
          <DialogDescription className="text-base">
            Thank you. Your project request has been received. We will review the details and follow up as needed. If you have questions, please email admin@a3visual.com.
          </DialogDescription>
          <DialogFooter className="sm:justify-center mt-8">
            <Button onClick={() => window.location.reload()} size="lg">Start New Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
