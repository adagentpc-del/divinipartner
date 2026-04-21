import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetPartner, useCreatePartner, useUpdatePartner, getListPartnersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Palette, Settings, Building2, FileText, Globe } from "lucide-react";
import { Link } from "wouter";
import { RolloutChecklist } from "@/components/admin/RolloutChecklist";

const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  slug: z.string().min(1, "Slug is required"),
  logoUrl: z.string().optional(),
  secondaryLogoUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  introHeadline: z.string().optional(),
  introText: z.string().optional(),
  thankYouText: z.string().optional(),
  capabilitiesLink: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  routingEmail: z.string().email().optional().or(z.literal("")),
  venueAddress: z.string().optional(),
  industryFocus: z.string().optional(),
  globalSizzleReelUrl: z.string().optional(),
  partnerVideoUrl: z.string().optional(),
  partnerDeckFileUrl: z.string().optional(),
  siteSurveyDeckFileUrl: z.string().optional(),
  portalMode: z.enum(["intake", "full", "ordering"]).default("intake"),
  partnerType: z.enum(["branding", "ordering"]).nullable().optional(),
  isActive: z.boolean().default(true),
  smallA3BadgeEnabled: z.boolean().default(true),
  pricingDisplayEnabled: z.boolean().default(false),
  defaultBillingExecModel: z.string().optional(),
  billingEntityName: z.string().optional(),
  paymentTerms: z.string().optional(),
  depositRequired: z.boolean().default(false),
  depositPct: z.string().optional(),
  allowPartialPayment: z.boolean().default(true),
  allowOrderOverride: z.boolean().default(true),
  defaultBillingNotes: z.string().optional(),
  billingContactName: z.string().optional(),
  billingContactEmail: z.string().optional(),
  billingContactPhone: z.string().optional(),
  billingActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function PartnerForm() {
  const params = useParams();
  const id = params.id ? parseInt(params.id) : undefined;
  const isEditing = !!id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partner, isLoading } = useGetPartner(id as number, {
    query: { enabled: isEditing }
  });

  const createMutation = useCreatePartner();
  const updateMutation = useUpdatePartner();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "", slug: "", logoUrl: "", secondaryLogoUrl: "", websiteUrl: "",
      introHeadline: "", introText: "", thankYouText: "", capabilitiesLink: "",
      contactName: "", contactEmail: "", contactPhone: "", routingEmail: "",
      venueAddress: "", industryFocus: "", globalSizzleReelUrl: "", partnerVideoUrl: "",
      partnerDeckFileUrl: "", siteSurveyDeckFileUrl: "",
      portalMode: "intake",
      partnerType: "branding",
      isActive: true, smallA3BadgeEnabled: true, pricingDisplayEnabled: false,
      defaultBillingExecModel: "a3_collected", billingEntityName: "", paymentTerms: "net_30",
      depositRequired: false, depositPct: "", allowPartialPayment: true, allowOrderOverride: true,
      defaultBillingNotes: "", billingContactName: "", billingContactEmail: "", billingContactPhone: "",
      billingActive: true,
    }
  });

  useEffect(() => {
    if (partner) {
      form.reset({
        companyName: partner.companyName, slug: partner.slug,
        logoUrl: partner.logoUrl || "", secondaryLogoUrl: (partner as any).secondaryLogoUrl || "",
        websiteUrl: (partner as any).websiteUrl || "",
        introHeadline: partner.introHeadline || "", introText: partner.introText || "",
        thankYouText: (partner as any).thankYouText || "",
        capabilitiesLink: (partner as any).capabilitiesLink || "",
        contactName: partner.contactName || "", contactEmail: partner.contactEmail || "",
        contactPhone: partner.contactPhone || "",
        routingEmail: (partner as any).routingEmail || "",
        venueAddress: partner.venueAddress || "", industryFocus: partner.industryFocus || "",
        globalSizzleReelUrl: partner.globalSizzleReelUrl || "",
        partnerVideoUrl: partner.partnerVideoUrl || "",
        partnerDeckFileUrl: (partner as any).partnerDeckFileUrl || "",
        siteSurveyDeckFileUrl: (partner as any).siteSurveyDeckFileUrl || "",
        portalMode: (partner as any).portalMode || "intake",
        partnerType: (partner as any).partnerType || "branding",
        isActive: partner.isActive, smallA3BadgeEnabled: partner.smallA3BadgeEnabled || false,
        pricingDisplayEnabled: partner.pricingDisplayEnabled || false,
        defaultBillingExecModel: (partner as any).defaultBillingExecModel || "a3_collected",
        billingEntityName: (partner as any).billingEntityName || "",
        paymentTerms: (partner as any).paymentTerms || "net_30",
        depositRequired: (partner as any).depositRequired ?? false,
        depositPct: (partner as any).depositPct || "",
        allowPartialPayment: (partner as any).allowPartialPayment ?? true,
        allowOrderOverride: (partner as any).allowOrderOverride ?? true,
        defaultBillingNotes: (partner as any).defaultBillingNotes || "",
        billingContactName: (partner as any).billingContactName || "",
        billingContactEmail: (partner as any).billingContactEmail || "",
        billingContactPhone: (partner as any).billingContactPhone || "",
        billingActive: (partner as any).billingActive ?? true,
      });
    }
  }, [partner, form]);

  const onSubmit = (values: FormValues) => {
    const data = values as any;
    const mutation = isEditing && id
      ? () => updateMutation.mutate({ id, data }, {
          onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() }); toast({ title: "Partner updated" }); setLocation("/admin/partners"); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" })
        })
      : () => createMutation.mutate({ data: values }, {
          onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() }); toast({ title: "Partner created" }); setLocation("/admin/partners"); },
          onError: () => toast({ title: "Failed to create", variant: "destructive" })
        });
    mutation();
  };

  if (isEditing && isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/partners">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Partners
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{isEditing ? "Edit" : "New"}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEditing ? "Edit Partner" : "New Partner"}</h1>
        {isEditing && id && (
          <div className="flex gap-2">
            <Link href={`/admin/partners/${id}/theme`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Palette className="h-3.5 w-3.5" /> Theme
              </Button>
            </Link>
            <Link href={`/admin/partners/${id}/sections`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" /> Sections
              </Button>
            </Link>
            {form.watch("partnerType") !== "ordering" && (
              <Link href={`/admin/partners/${id}/branding-locations`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Branding Zones
                </Button>
              </Link>
            )}
            {form.watch("partnerType") === "ordering" && (
              <>
                <Link href={`/admin/partners/${id}/cities-venues`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Cities & Venues
                  </Button>
                </Link>
                <Link href={`/admin/partners/${id}/events`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Events
                  </Button>
                </Link>
                <Link href={`/admin/partners/${id}/packages`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Packages
                  </Button>
                </Link>
              </>
            )}
            <a href={`/partner/${form.getValues("slug")}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </Button>
            </a>
          </div>
        )}
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b -mx-2 px-2 py-2">
        <nav className="flex items-center gap-1 overflow-x-auto text-xs">
          {[
            { id: "company", label: "1. Basics", icon: Building2 },
            { id: "portal", label: "2. Portal", icon: Globe },
            { id: "decks", label: "3. Documents", icon: FileText },
            { id: "contact", label: "4. Contact", icon: Settings },
            { id: "settings", label: "5. Settings", icon: Settings },
          ].map(s => (
            <a key={s.id} href={`#sec-${s.id}`} className="px-3 py-1.5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap font-medium">
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {isEditing && id && <div className="mb-4"><RolloutChecklist partnerId={parseInt(id)} /></div>}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card id="sec-company" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Details <span className="text-xs font-normal text-muted-foreground ml-auto">Step 1 of 5</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl><Input placeholder="Acme Events" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Slug</FormLabel>
                    <FormControl><Input placeholder="acme-events" {...field} /></FormControl>
                    <FormDescription className="text-xs">/partner/{field.value || "slug"}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="logoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Logo URL</FormLabel>
                    <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="secondaryLogoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secondary Logo URL</FormLabel>
                    <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="websiteUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Website URL</FormLabel>
                  <FormControl><Input placeholder="https://partner.com" {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card id="sec-portal" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Portal Customization <span className="text-xs font-normal text-muted-foreground ml-auto">Step 2 of 5</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="introHeadline" render={({ field }) => (
                <FormItem>
                  <FormLabel>Intro Headline</FormLabel>
                  <FormControl><Input placeholder="Start your project with us" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="introText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Intro Text</FormLabel>
                  <FormControl><Textarea placeholder="Describe the portal experience..." className="min-h-[80px] resize-none" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="thankYouText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Thank You / Welcome Copy</FormLabel>
                  <FormControl><Textarea placeholder="Custom thank-you message shown after submission..." className="min-h-[60px] resize-none" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="capabilitiesLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>A3 Capabilities Link</FormLabel>
                  <FormControl><Input placeholder="https://a3visual.com/capabilities" {...field} /></FormControl>
                </FormItem>
              )} />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="globalSizzleReelUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sizzle Reel URL</FormLabel>
                    <FormControl><Input placeholder="https://youtube.com/embed/..." {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="partnerVideoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Video URL</FormLabel>
                    <FormControl><Input placeholder="https://youtube.com/embed/..." {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="partnerType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "branding"}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="branding">Branding Partner (venues, zones — Move Miami / Hilton)</SelectItem>
                        <SelectItem value="ordering">Ordering Partner (cities, events, packages — SCF)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Determines which workspace modules are available</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="portalMode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client-Facing Portal</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="intake">Intake Form (5-step request form)</SelectItem>
                        <SelectItem value="full">Full Portal (multi-section catalog + venue)</SelectItem>
                        <SelectItem value="ordering">Ordering Portal (event/package/cart flow)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">What clients see at /partner/{`{slug}`}</FormDescription>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card id="sec-decks" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Decks & Documents <span className="text-xs font-normal text-muted-foreground ml-auto">Step 3 of 5</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="partnerDeckFileUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Partner Deck URL</FormLabel>
                  <FormControl><Input placeholder="https://storage.../partner-deck.pdf" {...field} /></FormControl>
                  <FormDescription className="text-xs">Upload via Assets, then paste URL here</FormDescription>
                </FormItem>
              )} />
              <FormField control={form.control} name="siteSurveyDeckFileUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Site Survey / Venue Branding Deck URL</FormLabel>
                  <FormControl><Input placeholder="https://storage.../venue-deck.pdf" {...field} /></FormControl>
                  <FormDescription className="text-xs">Used for AI-assisted venue branding location extraction</FormDescription>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card id="sec-contact" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">Contact & Routing <span className="text-xs font-normal text-muted-foreground ml-auto">Step 4 of 5</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl><Input type="tel" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="routingEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Email</FormLabel>
                    <FormControl><Input type="email" placeholder="notifications@..." {...field} /></FormControl>
                    <FormDescription className="text-xs">Request notifications sent here</FormDescription>
                  </FormItem>
                )} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <FormField control={form.control} name="venueAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="industryFocus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industry Focus</FormLabel>
                    <FormControl><Input placeholder="Entertainment, Hospitality..." {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card id="sec-billing" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">Billing Settings</CardTitle>
              <CardDescription className="text-xs">Default billing execution model and contact. These propagate to new orders unless overridden at event or order level.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="defaultBillingExecModel" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Default billing model</FormLabel>
                    <Select value={field.value || "a3_collected"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="a3_collected">A3 collected</SelectItem>
                        <SelectItem value="alyssa_entity_collected">Alyssa entity collected</SelectItem>
                        <SelectItem value="manual_invoice">Manual invoice</SelectItem>
                        <SelectItem value="split_payout">Split payout</SelectItem>
                        <SelectItem value="external_payment_pending">External payment pending</SelectItem>
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Payment terms</FormLabel>
                    <Select value={field.value || "net_30"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{["due_on_receipt","net_15","net_30","net_45","net_60"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="billingEntityName" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel className="text-xs">Billing entity (legal name on invoice)</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="billingContactName" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Billing contact</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="billingContactEmail" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Billing email</FormLabel><FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="billingContactPhone" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Billing phone</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="depositPct" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Deposit % (0–100)</FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="e.g. 25" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="defaultBillingNotes" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel className="text-xs">Default billing notes (added to invoices)</FormLabel><FormControl><Textarea {...field} value={field.value || ""} rows={2} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="depositRequired" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">Deposit required</FormLabel></FormItem>
                )} />
                <FormField control={form.control} name="allowPartialPayment" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">Allow partial payments</FormLabel></FormItem>
                )} />
                <FormField control={form.control} name="allowOrderOverride" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">Allow per-order override</FormLabel></FormItem>
                )} />
                <FormField control={form.control} name="billingActive" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">Billing active</FormLabel></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card id="sec-settings" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">Settings <span className="text-xs font-normal text-muted-foreground ml-auto">Step 5 of 5</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="text-sm">Active</FormLabel>
                    <FormDescription className="text-xs">Publicly accessible portal</FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="smallA3BadgeEnabled" render={({ field }) => (
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="text-sm">A3 Badge</FormLabel>
                    <FormDescription className="text-xs">Show "Powered by A3" on portal</FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="pricingDisplayEnabled" render={({ field }) => (
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="text-sm">Pricing Display</FormLabel>
                    <FormDescription className="text-xs">Show pricing estimates on portal</FormDescription>
                  </div>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/partners")}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Update Partner" : "Create Partner"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
