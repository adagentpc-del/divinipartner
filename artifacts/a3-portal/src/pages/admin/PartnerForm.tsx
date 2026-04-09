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
  portalMode: z.string().default("intake"),
  isActive: z.boolean().default(true),
  smallA3BadgeEnabled: z.boolean().default(true),
  pricingDisplayEnabled: z.boolean().default(false),
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
      isActive: true, smallA3BadgeEnabled: true, pricingDisplayEnabled: false,
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
        isActive: partner.isActive, smallA3BadgeEnabled: partner.smallA3BadgeEnabled || false,
        pricingDisplayEnabled: partner.pricingDisplayEnabled || false,
      });
    }
  }, [partner, form]);

  const onSubmit = (values: FormValues) => {
    const mutation = isEditing && id
      ? () => updateMutation.mutate({ id, data: values }, {
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
            <Link href={`/admin/partners/${id}/branding-locations`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Venue Map
              </Button>
            </Link>
            <a href={`/partner/${form.getValues("slug")}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </Button>
            </a>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Details</CardTitle>
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

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Portal Customization</CardTitle>
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
              <FormField control={form.control} name="portalMode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Portal Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="intake">Intake Form (Original 5-step form)</SelectItem>
                      <SelectItem value="full">Full Portal (Multi-section with products & venue)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">Choose between the simple intake form or the full branded portal experience</FormDescription>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Decks & Documents</CardTitle>
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

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Contact & Routing</CardTitle>
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

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Settings</CardTitle>
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
