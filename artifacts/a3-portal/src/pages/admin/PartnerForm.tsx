import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetPartner, useCreatePartner, useUpdatePartner, getListPartnersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  slug: z.string().min(1, "Slug is required"),
  logoUrl: z.string().optional(),
  introHeadline: z.string().optional(),
  introText: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
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
      companyName: "", slug: "", logoUrl: "", introHeadline: "", introText: "",
      contactName: "", contactEmail: "", contactPhone: "",
      isActive: true, smallA3BadgeEnabled: true, pricingDisplayEnabled: false,
    }
  });

  useEffect(() => {
    if (partner) {
      form.reset({
        companyName: partner.companyName, slug: partner.slug,
        logoUrl: partner.logoUrl || "", introHeadline: partner.introHeadline || "",
        introText: partner.introText || "", contactName: partner.contactName || "",
        contactEmail: partner.contactEmail || "", contactPhone: partner.contactPhone || "",
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/partners">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Partners
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{isEditing ? "Edit" : "New"}</span>
      </div>

      <h1 className="text-2xl font-bold">{isEditing ? "Edit Partner" : "New Partner"}</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Company Details</CardTitle>
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
              <FormField control={form.control} name="logoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Portal Customization</CardTitle>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Contact Information</CardTitle>
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
