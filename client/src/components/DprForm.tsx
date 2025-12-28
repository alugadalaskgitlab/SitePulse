import { useForm, useFieldArray, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDprRequestSchema, type CreateDprRequest } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Truck, Users, Package, Activity } from "lucide-react";
import { useCreateDpr } from "@/hooks/use-dprs";
import { useLocation } from "wouter";

export function DprForm() {
  const [, setLocation] = useLocation();
  const createDpr = useCreateDpr();

  const form = useForm<CreateDprRequest>({
    resolver: zodResolver(createDprRequestSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      site: "",
      engineer: "",
      progress: [],
      equipment: [],
      labour: [],
      materials: [],
    },
  });

  const onSubmit = async (data: CreateDprRequest) => {
    try {
      await createDpr.mutateAsync(data);
      setLocation("/");
    } catch (error) {
      // Error handled by hook toast
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Header Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-card p-6 rounded-xl border shadow-sm">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="site"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Site Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Highway Project A1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="engineer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Engineer Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Dynamic Sections */}
        <ProgressSection control={form.control} />
        <EquipmentSection control={form.control} />
        <LabourSection control={form.control} />
        <MaterialSection control={form.control} />

        <div className="flex justify-end gap-4 sticky bottom-6 bg-background/80 backdrop-blur p-4 border rounded-xl shadow-lg">
          <Button type="button" variant="outline" onClick={() => setLocation("/")}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createDpr.isPending}
            className="bg-primary hover:bg-primary/90 min-w-[150px]"
          >
            {createDpr.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ProgressSection({ control }: { control: Control<CreateDprRequest> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "progress",
  });

  return (
    <div className="form-section">
      <div className="form-section-title text-blue-600">
        <Activity className="w-5 h-5" />
        <h3>Activity Progress</h3>
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
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={control}
                name={`progress.${index}.activity`}
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Activity Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. BC Laying" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`progress.${index}.side`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Side</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select side" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LHS">LHS</SelectItem>
                        <SelectItem value="RHS">RHS</SelectItem>
                        <SelectItem value="Median">Median</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={control}
                  name={`progress.${index}.chainageFrom`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl>
                        <Input placeholder="0+000" {...field} value={field.value || ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`progress.${index}.chainageTo`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl>
                        <Input placeholder="0+100" {...field} value={field.value || ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={control}
                name={`progress.${index}.quantity`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value))}
                        value={field.value || ''}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`progress.${index}.uom`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UOM</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cum" {...field} value={field.value || ''} />
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
          onClick={() => append({ activity: "", quantity: 0 })}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Activity
        </Button>
      </div>
    </div>
  );
}

function EquipmentSection({ control }: { control: Control<CreateDprRequest> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "equipment",
  });

  return (
    <div className="form-section">
      <div className="form-section-title text-orange-600">
        <Truck className="w-5 h-5" />
        <h3>Equipment Log</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-muted/30 rounded-lg relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <FormField
              control={control}
              name={`equipment.${index}.machine`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machine Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Excavator 01" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`equipment.${index}.operator`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operator</FormLabel>
                  <FormControl>
                    <Input placeholder="Name" {...field} value={field.value || ''} />
                  </FormControl>
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name={`equipment.${index}.diesel`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diesel (L)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.1" 
                      {...field} 
                      onChange={e => field.onChange(parseFloat(e.target.value))}
                      value={field.value || ''}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => append({ machine: "" })}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Equipment
        </Button>
      </div>
    </div>
  );
}

function LabourSection({ control }: { control: Control<CreateDprRequest> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "labour",
  });

  return (
    <div className="form-section">
      <div className="form-section-title text-green-600">
        <Users className="w-5 h-5" />
        <h3>Labour Strength</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-muted/30 rounded-lg relative">
             <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <FormField
              control={control}
              name={`labour.${index}.category`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Skilled">Skilled</SelectItem>
                      <SelectItem value="Unskilled">Unskilled</SelectItem>
                      <SelectItem value="Supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name={`labour.${index}.gender`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`labour.${index}.count`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Count</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={e => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => append({ category: "Unskilled", count: 0 })}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Labour
        </Button>
      </div>
    </div>
  );
}

function MaterialSection({ control }: { control: Control<CreateDprRequest> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "materials",
  });

  return (
    <div className="form-section">
      <div className="form-section-title text-purple-600">
        <Package className="w-5 h-5" />
        <h3>Materials Log</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end p-4 bg-muted/30 rounded-lg relative">
             <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <FormField
              control={control}
              name={`materials.${index}.type`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Received">Received</SelectItem>
                      <SelectItem value="Issued">Issued</SelectItem>
                      <SelectItem value="Consumed">Consumed</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name={`materials.${index}.material`}
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Material Name</FormLabel>
                  <FormControl>
                     <Input placeholder="e.g. Cement" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`materials.${index}.quantity`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qty</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      {...field} 
                      onChange={e => field.onChange(parseFloat(e.target.value))}
                      value={field.value || ''}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`materials.${index}.uom`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UOM</FormLabel>
                  <FormControl>
                    <Input placeholder="Kg/Tonne" {...field} value={field.value || ''} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => append({ type: "Received", material: "", quantity: 0 })}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Material
        </Button>
      </div>
    </div>
  );
}
