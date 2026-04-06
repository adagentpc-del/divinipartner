import { useState } from "react";
import { useListPricingRules, useCreatePricingRule, useUpdatePricingRule, useDeletePricingRule, getListPricingRulesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, Tags, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  category: z.string().min(1, "Category is required"),
  itemName: z.string().min(1, "Item name is required"),
  startingPrice: z.coerce.number().optional(),
  internalCostBasis: z.coerce.number().optional(),
  rushFeeRule: z.string().optional(),
  installFeeRule: z.string().optional(),
  removalFeeRule: z.string().optional(),
  designFeeRule: z.string().optional(),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function PricingRules() {
  const { data: rules, isLoading } = useListPricingRules();
  const createMutation = useCreatePricingRule();
  const updateMutation = useUpdatePricingRule();
  const deleteMutation = useDeletePricingRule();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "", itemName: "", startingPrice: undefined, internalCostBasis: undefined,
      rushFeeRule: "", installFeeRule: "", removalFeeRule: "", designFeeRule: "", isActive: true,
    }
  });

  const openEditDialog = (rule: any) => {
    setEditingRule(rule);
    form.reset({
      category: rule.category, itemName: rule.itemName,
      startingPrice: rule.startingPrice || undefined, internalCostBasis: rule.internalCostBasis || undefined,
      rushFeeRule: rule.rushFeeRule || "", installFeeRule: rule.installFeeRule || "",
      removalFeeRule: rule.removalFeeRule || "", designFeeRule: rule.designFeeRule || "",
      isActive: rule.isActive,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    form.reset({
      category: "", itemName: "", startingPrice: undefined, internalCostBasis: undefined,
      rushFeeRule: "", installFeeRule: "", removalFeeRule: "", designFeeRule: "", isActive: true,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPricingRulesQueryKey() });
        setIsDialogOpen(false);
        toast({ title: editingRule ? "Pricing rule updated" : "Pricing rule created" });
      }
    };
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: values }, opts);
    } else {
      createMutation.mutate({ data: values }, opts);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this pricing rule?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPricingRulesQueryKey() });
          toast({ title: "Pricing rule deleted" });
        }
      });
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const groupedRules = rules?.reduce((acc: any, rule: any) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Rules</h1>
          <p className="text-muted-foreground mt-1">Manage service catalog and internal pricing basis.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Pricing Rule" : "New Pricing Rule"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl><Input placeholder="e.g. Printing, Rentals" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="itemName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl><Input placeholder="e.g. Large Format Banner" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startingPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Public Starting Price ($)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="internalCostBasis" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Cost Basis ($)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="rushFeeRule" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rush Fee Rule</FormLabel>
                    <FormControl><Input placeholder="e.g. +50% for < 48hr" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="designFeeRule" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Design Fee Rule</FormLabel>
                    <FormControl><Input placeholder="e.g. $150/hr" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="installFeeRule" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Install Fee Rule</FormLabel>
                    <FormControl><Input placeholder="e.g. 20% of subtotal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="removalFeeRule" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Removal Fee Rule</FormLabel>
                    <FormControl><Input placeholder="e.g. Flat $500" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel>Active</FormLabel>
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Rule
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {groupedRules && Object.entries(groupedRules).map(([category, items]: [string, any]) => (
          <Card key={category} className="overflow-hidden">
            <CardHeader className="py-3 px-4 bg-muted/40 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Tags className="h-4 w-4 text-muted-foreground" />
                {category}
                <Badge variant="secondary" className="text-xs ml-auto">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[30%] font-semibold">Item Name</TableHead>
                  <TableHead className="font-semibold">Starting Price</TableHead>
                  <TableHead className="font-semibold">Cost Basis</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.itemName}</TableCell>
                    <TableCell className="tabular-nums">{rule.startingPrice ? `$${rule.startingPrice.toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{rule.internalCostBasis ? `$${rule.internalCostBasis.toFixed(2)}` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"} className="text-xs">
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => openEditDialog(rule)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(rule.id)} aria-label={`Delete ${rule.itemName}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
        {(!groupedRules || Object.keys(groupedRules).length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-card">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Tags className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No pricing rules</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first pricing rule to get started.</p>
            <Button onClick={openCreateDialog} className="gap-2"><Plus className="h-4 w-4" /> Add Rule</Button>
          </div>
        )}
      </div>
    </div>
  );
}
