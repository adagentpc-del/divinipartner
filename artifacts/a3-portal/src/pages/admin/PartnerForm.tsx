import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetPartner, useCreatePartner, useUpdatePartner, getListPartnersQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Palette, Settings, Building2, FileText, Globe, Mail, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { RolloutChecklist } from "@/components/admin/RolloutChecklist";
import { PartnerLogo } from "@/components/branding/PartnerLogo";
import { resolveBranding } from "@/components/branding/usePartnerBranding";
import { apiUrl } from "@/lib/api";
import { RecipientsManager } from "@/components/admin/RecipientsManager";
import PartnerContactsPanel from "@/components/admin/PartnerContactsPanel";
import EntityAlertsPanel from "@/components/admin/EntityAlertsPanel";
import PartnerStatusBadges from "@/components/admin/PartnerStatusBadges";
import { FamilyStatusGrid, type FamilyAvailability } from "@/components/admin/FamilyStatusCard";
import { RentableAssetsCard } from "@/components/admin/RentableAssetsCard";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

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
  unitPreference: z.enum(["imperial", "metric"]).nullable().optional(),
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
  // Communications / email config (April 2026)
  emailFromName: z.string().optional(),
  replyToEmail: z.string().email().optional().or(z.literal("")),
  emailSenderLabel: z.string().optional(),
  internalForwardEmail: z.string().email().optional().or(z.literal("")),
  ccEmail: z.string().email().optional().or(z.literal("")),
  emailEnabled: z.boolean().default(true),
  // PDF attachment toggles (April 2026)
  attachPdfCustomer: z.boolean().default(false),
  attachPdfOps: z.boolean().default(true),
  attachPdfFinance: z.boolean().default(false),
  attachPdfPartnerContact: z.boolean().default(false),
  // Currency / tax defaults (Section 19).
  defaultCurrency: z.string().default("USD"),
  defaultTaxMode: z.string().default("none"),
  defaultTaxLabel: z.string().optional(),
  defaultTaxRate: z.string().optional(),
  taxInclusive: z.boolean().default(false),
  billingCountry: z.string().optional(),
  invoiceDisplayNotes: z.string().optional(),
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
      unitPreference: null,
      isActive: true, smallA3BadgeEnabled: true, pricingDisplayEnabled: false,
      defaultBillingExecModel: "a3_collected", billingEntityName: "", paymentTerms: "net_30",
      depositRequired: false, depositPct: "", allowPartialPayment: true, allowOrderOverride: true,
      defaultBillingNotes: "", billingContactName: "", billingContactEmail: "", billingContactPhone: "",
      billingActive: true,
      emailFromName: "", replyToEmail: "", emailSenderLabel: "",
      internalForwardEmail: "", ccEmail: "", emailEnabled: true,
      attachPdfCustomer: false, attachPdfOps: true, attachPdfFinance: false, attachPdfPartnerContact: false,
      defaultCurrency: "USD", defaultTaxMode: "none", defaultTaxLabel: "", defaultTaxRate: "",
      taxInclusive: false, billingCountry: "", invoiceDisplayNotes: "",
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
        unitPreference: ((partner as any).unitPreference || null) as any,
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
        emailFromName: (partner as any).emailFromName || "",
        replyToEmail: (partner as any).replyToEmail || "",
        emailSenderLabel: (partner as any).emailSenderLabel || "",
        internalForwardEmail: (partner as any).internalForwardEmail || "",
        ccEmail: (partner as any).ccEmail || "",
        emailEnabled: (partner as any).emailEnabled ?? true,
        attachPdfCustomer: (partner as any).attachPdfCustomer ?? false,
        attachPdfOps: (partner as any).attachPdfOps ?? true,
        attachPdfFinance: (partner as any).attachPdfFinance ?? false,
        attachPdfPartnerContact: (partner as any).attachPdfPartnerContact ?? false,
        defaultCurrency: (partner as any).defaultCurrency || "USD",
        defaultTaxMode: (partner as any).defaultTaxMode || "none",
        defaultTaxLabel: (partner as any).defaultTaxLabel || "",
        defaultTaxRate: (partner as any).defaultTaxRate || "",
        taxInclusive: (partner as any).taxInclusive ?? false,
        billingCountry: (partner as any).billingCountry || "",
        invoiceDisplayNotes: (partner as any).invoiceDisplayNotes || "",
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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{isEditing ? "Edit Partner" : "New Partner"}</h1>
          {isEditing && partner && <PartnerStatusBadges partner={partner as any} size="sm" />}
        </div>
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
            <Link href={`/admin/partners/${id}/cities-venues`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Cities &amp; Venues
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
            <a href={`/${form.getValues("slug")}`} target="_blank" rel="noopener noreferrer">
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
                    <FormDescription className="text-xs">Share URL: /{field.value || "slug"}</FormDescription>
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
                    <FormDescription className="text-xs">What clients see at /{`{slug}`}</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="unitPreference" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Measurement System</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === "inherit" ? null : v)} value={field.value || "inherit"}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="inherit">Inherit from account / country</SelectItem>
                        <SelectItem value="imperial">Imperial (in / ft)</SelectItem>
                        <SelectItem value="metric">Metric (cm / m)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Default unit for new venues, packages, and product specs.</FormDescription>
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

          <Card id="sec-currency" className="scroll-mt-20">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Currency &amp; Tax Defaults</CardTitle>
              <CardDescription className="text-xs">Sets the partner's billing currency and how tax is calculated &amp; displayed. Events and orders inherit these unless overridden. Order/invoice records snapshot the resolved values so historical totals stay stable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="defaultCurrency" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Default currency</FormLabel>
                    <Select value={field.value || "USD"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{["USD","EUR","GBP","AED","CAD","AUD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="billingCountry" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Billing country (ISO-2)</FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="US, GB, AE…" maxLength={2} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="defaultTaxMode" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Tax mode</FormLabel>
                    <Select value={field.value || "none"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="sales_tax">Sales tax (US)</SelectItem>
                        <SelectItem value="vat">VAT</SelectItem>
                        <SelectItem value="gst">GST</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select></FormItem>
                )} />
                <FormField control={form.control} name="defaultTaxLabel" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Tax label override</FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="e.g. VAT, GST, Sales tax" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="defaultTaxRate" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Default tax rate (%)</FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="e.g. 20.000" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="taxInclusive" render={({ field }) => (
                  <FormItem className="flex items-end gap-2 space-y-0 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">Prices are tax-inclusive (line totals already contain tax)</FormLabel></FormItem>
                )} />
                <FormField control={form.control} name="invoiceDisplayNotes" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel className="text-xs">Invoice display notes (e.g. overseas billing instructions, VAT registration #)</FormLabel><FormControl><Textarea {...field} value={field.value || ""} rows={2} /></FormControl></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {isEditing && id && (
            <>
              <EntityAlertsPanel scope="partner" id={id} />
              <CommunicationsCard partnerId={id} form={form} />
              <PartnerContactsPanel partnerId={id} />
              <RecipientsManager partnerId={id} />
              <ReusableAssetsCard partnerId={id} />
              <RentableAssetsCard partnerId={id} />
              <PartnerArchiveCard partnerId={id} partner={partner} />
            </>
          )}

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
            {/* keep submit button below */}
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

// ---------------------------------------------------------------------------
// Communications card — partner email config + branding/logo previews + test
// send actions. Lives below the main form so it can use form.watch() reactively.
// ---------------------------------------------------------------------------
function CommunicationsCard({ partnerId, form }: { partnerId: number; form: any }) {
  const { toast } = useToast();
  const [testTo, setTestTo] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [busy, setBusy] = useState<null | "confirmation" | "forward">(null);
  // Pull theme so the preview matches what end customers actually see.
  const [theme, setTheme] = useState<any>(null);
  useEffect(() => {
    fetch(apiUrl(`/api/partners/${partnerId}/theme`)).then(r => r.ok ? r.json() : null).then(setTheme).catch(() => {});
  }, [partnerId]);

  const branding = resolveBranding(theme);
  const v = form.watch();
  const internalForward = v.internalForwardEmail || v.routingEmail;
  const replyTo = v.replyToEmail || v.contactEmail;
  const senderName = v.emailFromName || v.companyName;
  const issues: string[] = [];
  if (!v.emailEnabled) issues.push("Outbound email is disabled — orders will save but no emails will send.");
  if (!internalForward) issues.push("No internal forwarding email — order details won't be sent to your team.");
  if (!replyTo) issues.push("No reply-to or contact email — replies will go to the default sender address.");
  const ready = v.emailEnabled && !!internalForward && !!replyTo;

  async function send(kind: "confirmation" | "forward") {
    const to = kind === "confirmation" ? testTo : forwardTo;
    if (kind === "confirmation" && !to) { toast({ title: "Enter an email to send the test to", variant: "destructive" }); return; }
    setBusy(kind);
    try {
      const path = kind === "confirmation" ? "test-confirmation-email" : "test-internal-forward";
      const res = await fetch(apiUrl(`/api/partners/${partnerId}/${path}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) toast({ title: kind === "confirmation" ? "Test confirmation sent" : "Test internal forward sent" });
      else toast({ title: "Test send failed", description: json.error || `HTTP ${res.status}`, variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test send failed", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="sec-communications" className="scroll-mt-20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Communications &amp; Email
          <span className="text-xs font-normal text-muted-foreground ml-auto">Customer confirmations &amp; internal forwarding</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Configure how branded order confirmations are sent to customers and forwarded to your team. Save the form after editing fields, then use the test buttons below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${ready ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          {ready ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
          <div>
            <div className="font-semibold mb-0.5">{ready ? "Email setup looks good." : "Email setup is incomplete."}</div>
            {issues.length > 0 ? <ul className="list-disc pl-4 space-y-0.5">{issues.map(i => <li key={i}>{i}</li>)}</ul> : <span>Customer confirmations and internal forwards will go out for every new order.</span>}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <FormField control={form.control} name="emailFromName" render={({ field }: any) => (
            <FormItem>
              <FormLabel>From Name</FormLabel>
              <FormControl><Input placeholder="Acme Events" {...field} value={field.value || ""} /></FormControl>
              <FormDescription className="text-xs">Shown as the sender on outbound emails. Defaults to company name.</FormDescription>
            </FormItem>
          )} />
          <FormField control={form.control} name="emailSenderLabel" render={({ field }: any) => (
            <FormItem>
              <FormLabel>Confirmation Sender Label</FormLabel>
              <FormControl><Input placeholder="Acme Events Orders" {...field} value={field.value || ""} /></FormControl>
              <FormDescription className="text-xs">Used in the customer subject line, e.g. "Acme Events — order received".</FormDescription>
            </FormItem>
          )} />
          <FormField control={form.control} name="replyToEmail" render={({ field }: any) => (
            <FormItem>
              <FormLabel>Reply-To Email</FormLabel>
              <FormControl><Input type="email" placeholder="orders@acme.com" {...field} value={field.value || ""} /></FormControl>
              <FormDescription className="text-xs">Where customer replies are routed. Falls back to Contact Email.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="internalForwardEmail" render={({ field }: any) => (
            <FormItem>
              <FormLabel>Internal Forwarding Email</FormLabel>
              <FormControl><Input type="email" placeholder="ops@acme.com" {...field} value={field.value || ""} /></FormControl>
              <FormDescription className="text-xs">Receives the operational copy of every new order.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="ccEmail" render={({ field }: any) => (
            <FormItem>
              <FormLabel>CC Email (optional)</FormLabel>
              <FormControl><Input type="email" placeholder="finance@acme.com" {...field} value={field.value || ""} /></FormControl>
              <FormDescription className="text-xs">CC'd on internal forward only — not on customer confirmations.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="emailEnabled" render={({ field }: any) => (
            <FormItem className="flex items-end gap-3 space-y-0 pb-1.5">
              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              <div>
                <FormLabel className="text-sm">Send order emails</FormLabel>
                <FormDescription className="text-xs">When off, orders still save but no emails are sent.</FormDescription>
              </div>
            </FormItem>
          )} />
        </div>

        {/* PDF attachment toggles — choose which audiences get the branded order summary PDF attached. */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Attach branded PDF order summary</div>
            <div className="text-xs text-muted-foreground">A one-page branded PDF is generated automatically for each new order. Choose which recipient roles get it as an email attachment. The customer PDF hides pricing and supplier details; the internal/finance PDFs include them.</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField control={form.control} name="attachPdfCustomer" render={({ field }: any) => (
              <FormItem className="flex items-start gap-2 space-y-0">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div><FormLabel className="text-sm">Customer confirmation</FormLabel><FormDescription className="text-xs">Sent to the order's contact email.</FormDescription></div>
              </FormItem>
            )} />
            <FormField control={form.control} name="attachPdfOps" render={({ field }: any) => (
              <FormItem className="flex items-start gap-2 space-y-0">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div><FormLabel className="text-sm">Internal / ops forward</FormLabel><FormDescription className="text-xs">Full operational detail — recommended ON.</FormDescription></div>
              </FormItem>
            )} />
            <FormField control={form.control} name="attachPdfFinance" render={({ field }: any) => (
              <FormItem className="flex items-start gap-2 space-y-0">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div><FormLabel className="text-sm">Finance notification</FormLabel><FormDescription className="text-xs">Billing-focused header, full pricing.</FormDescription></div>
              </FormItem>
            )} />
            <FormField control={form.control} name="attachPdfPartnerContact" render={({ field }: any) => (
              <FormItem className="flex items-start gap-2 space-y-0">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div><FormLabel className="text-sm">Partner contact notification</FormLabel><FormDescription className="text-xs">Customer-facing PDF (no internal pricing).</FormDescription></div>
              </FormItem>
            )} />
          </div>
        </div>

        {/* Branding + logo preview — what customers actually see at the top of their email */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Branding preview</div>
          <div className="rounded-lg overflow-hidden border" style={{ background: branding.background }}>
            <div className="p-5 text-center" style={{ background: `linear-gradient(135deg, ${branding.primary} 0%, ${branding.primary}dd 100%)` }}>
              <div className="inline-block bg-white rounded-lg px-4 py-3">
                <PartnerLogo src={v.logoUrl} name={v.companyName || "Partner"} size={48} />
              </div>
              <div className="mt-3 text-xs font-medium text-white/80">{senderName} · {replyTo || "no-reply@"}</div>
            </div>
            <div className="p-5 text-sm" style={{ color: branding.text }}>
              <div className="font-semibold">Thanks, Sample Customer!</div>
              <div className="text-xs mt-1" style={{ color: branding.muted }}>We received your order. Our team will follow up shortly.</div>
              <div className="mt-3">
                <span className="inline-block px-3 py-2 rounded-md text-white text-xs font-semibold" style={{ background: branding.button, color: branding.buttonText }}>Reply to this order</span>
              </div>
              <div className="flex gap-1.5 mt-4">
                {[branding.primary, branding.secondary, branding.accent, branding.button, branding.background].map((c, i) => (
                  <div key={i} className="flex-1 h-6 rounded border" style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">Preview reflects current saved theme. Adjust colors in the <Link href={`/admin/partners/${partnerId}/theme`}><span className="underline cursor-pointer">Theme editor</span></Link>.</div>
        </div>

        {/* Test send actions */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send a test customer confirmation</div>
            <div className="flex gap-2">
              <Input type="email" placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button type="button" variant="outline" disabled={busy === "confirmation"} onClick={() => send("confirmation")}>
                {busy === "confirmation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">Uses your most recent order as the preview, addressed to the email above.</div>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send a test internal forward</div>
            <div className="flex gap-2">
              <Input type="email" placeholder="(blank = use Internal Forwarding Email)" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} />
              <Button type="button" variant="outline" disabled={busy === "forward"} onClick={() => send("forward")}>
                {busy === "forward" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">Leave blank to send to the configured internal forwarding address.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReusableAssetsCard({ partnerId }: { partnerId: number }) {
  const { data: families = [], isLoading } = useQuery<FamilyAvailability[]>({
    queryKey: ["/api/partners", partnerId, "family-availability"],
    queryFn: () => apiFetch(`/api/partners/${partnerId}/family-availability`),
    enabled: Number.isFinite(partnerId),
  });
  // Hide the section entirely if no families exist — keeps the form clean
  // for partners who haven't been wired up to any reusable hardware.
  if (!isLoading && families.length === 0) return null;
  return (
    <Card id="sec-reusable-assets" className="scroll-mt-20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          Reusable Asset Inventory
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            Live from this partner's hardware inventory
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Connected product families backed by partner-owned hardware (e.g. Easy Up tent frames).
          Component orders reserve from the totals below; when remaining hits zero the ordering flow
          automatically switches to "full unit required".
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading
          ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading…</div>
          : <FamilyStatusGrid families={families} partnerId={pid} />}
      </CardContent>
    </Card>
  );
}

function PartnerArchiveCard({ partnerId, partner }: { partnerId: number; partner: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const isArchived = !!partner?.archivedAt;
  const mutation = useMutation({
    mutationFn: async () => {
      const path = isArchived ? `/api/admin/partners/${partnerId}/unarchive` : `/api/admin/partners/${partnerId}/archive`;
      return apiFetch(path, { method: "POST", body: JSON.stringify(isArchived ? {} : { reason: reason.trim() || undefined }) });
    },
    onSuccess: () => {
      toast({ title: isArchived ? "Partner unarchived" : "Partner archived" });
      qc.invalidateQueries();
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || String(e), variant: "destructive" }),
  });
  return (
    <Card className={isArchived ? "border-red-300 bg-red-50/40" : "border-amber-200"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{isArchived ? "Archived" : "Archive partner"}</CardTitle>
        <CardDescription>
          {isArchived
            ? `Archived ${partner.archivedAt ? new Date(partner.archivedAt).toLocaleDateString() : ""}${partner.archivedReason ? ` · ${partner.archivedReason}` : ""}. The partner is hidden from active flows but no data is deleted.`
            : "Mark this partner inactive and stash for retention. Their orders, assets, and history are preserved — only listing visibility and operational alerts change."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isArchived && (
          <Input placeholder="Optional reason (e.g. partner offboarded April 2026)" value={reason} onChange={e => setReason(e.target.value)} />
        )}
        <Button
          type="button"
          variant={isArchived ? "outline" : "destructive"}
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
          {isArchived ? "Unarchive partner" : "Archive partner"}
        </Button>
      </CardContent>
    </Card>
  );
}
