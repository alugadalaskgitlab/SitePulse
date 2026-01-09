import { useForm, useFieldArray, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ChevronLeft, Factory, Package } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { createPlantReportRequestSchema, type CreatePlantReportRequest } from "@shared/schema";

export default function PlantNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");

  const form = useForm<CreatePlantReportRequest>({
    resolver: zodResolver(createPlantReportRequestSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      siteName: "",
      production: [],
    },
  });

  const createPlantReport = useMutation({
    mutationFn: async (data: CreatePlantReportRequest) => {
      const response = await apiRequest("POST", "/api/plant", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Plant report created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/plant'] });
      setLocation(appendOrigin("/plant/dashboard"));
    },
    onError: () => {
      toast({ title: "Failed to create plant report", variant: "destructive" });
    },
  });

  const onSubmit = async (data: CreatePlantReportRequest) => {
    await createPlantReport.mutateAsync(data);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">New Plant Report</h1>
          <p className="text-muted-foreground mt-1">Record plant production and material details</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Header Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-card p-6 rounded-xl border shadow-sm">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="siteName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plant/Site Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Central Batching Plant" {...field} data-testid="input-site-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Production Section */}
          <ProductionSection control={form.control} />

          {/* Submit */}
          <div className="flex gap-4 justify-end">
            <Link href={backLink}>
              <Button type="button" variant="outline" data-testid="button-cancel">Cancel</Button>
            </Link>
            <Button 
              type="submit" 
              disabled={createPlantReport.isPending}
              className="gap-2"
              data-testid="button-submit"
            >
              <Factory className="w-4 h-4" />
              {createPlantReport.isPending ? "Saving..." : "Save Plant Report"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function ProductionSection({ control }: { control: Control<CreatePlantReportRequest> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "production",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-purple-600">
        <Package className="w-5 h-5" />
        <h3 className="font-semibold text-lg">Production / Materials</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <Card key={field.id} className="bg-muted/30 relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              data-testid={`button-remove-production-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                control={control}
                name={`production.${index}.material`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Ready Mix Concrete" {...field} data-testid={`input-material-${index}`} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`production.${index}.supplier`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. ABC Suppliers" {...field} value={field.value || ''} data-testid={`input-supplier-${index}`} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`production.${index}.quantity`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00"
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                        value={field.value || ''}
                        data-testid={`input-quantity-${index}`}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`production.${index}.uom`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UOM</FormLabel>
                    <FormControl>
                      <Input placeholder="cum/MT" {...field} value={field.value || ''} data-testid={`input-uom-${index}`} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => append({ material: "" })}
          data-testid="button-add-production"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Production Entry
        </Button>
      </div>
    </div>
  );
}
