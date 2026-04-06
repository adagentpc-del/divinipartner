import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetPartner, useCreatePartner, useUpdatePartner, getListPartnersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

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
      companyName: "",
      slug: "",
      logoUrl: "",
      introHeadline: "",
      introText: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      isActive: true,
      smallA3BadgeEnabled: true,
      pricingDisplayEnabled: false,
    }
  });

  useEffect(() => {
    if (partner) {
      form.reset({
        companyName: partner.companyName,
        slug: partner.slug,
        logoUrl: partner.logoUrl || "",
        introHeadline: partner.introHeadline || "",
        introText: partner.introText || "",
        contactName: partner.contactName || "",
        contactEmail: partner.contactEmail || "",
        contactPhone: partner.contactPhone || "",
        isActive: partner.isActive,
        smallA3BadgeEnabled: partner.smallA3BadgeEnabled || false,
        pricingDisplayEnabled: partner.pricingDisplayEnabled || false,
      });
    }
  }, [partner, form]);

  const onSubmit = (values: FormValues) => {
    if (isEditing && id) {
      updateMutation.mutate({ id, data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
          toast({ title: "Partner updated" });
          setLocation("/admin/partners");
        },
        onError: () => {
          toast({ title: "Failed to update", variant: "destructive" });
        }
      });
    } else {
      createMutation.mutate({ data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
          toast({ title: "Partner created" });
          setLocation("/admin/partners");
        },
        onError: () => {
          toast({ title: "Failed to create", variant: "destructive" });
        }
      });
    }
  };

  if (isEditing && isLoading) return <div>Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 bg-card p-6 rounded-lg border">
      <h1 className="text-2xl font-bold">{isEditing ? "Edit Partner" : "New Partner"}</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Slug</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo URL</FormLabel>
                <FormControl><Input {...field} /></FormControl>
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="introHeadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intro Headline</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="introText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intro Text</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-medium">Settings</h3>
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel>Active (Publicly accessible)</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="smallA3BadgeEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel>Show A3 Badge on Portal</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pricingDisplayEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel>Enable Pricing Display</FormLabel>
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2 pt-6">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/partners")}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {isEditing ? "Update Partner" : "Create Partner"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
