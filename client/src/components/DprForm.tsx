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
      role: "engineer",
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-card p-6 rounded-xl border shadow-sm">
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
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role Level</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || "engineer"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="engineer">Site Engineer (View Only)</SelectItem>
                    <SelectItem value="manager">Project Manager (Edit)</SelectItem>
                    <SelectItem value="admin">Admin (Full Control)</SelectItem>
                  </SelectContent>
                </Select>
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

  const calculateQuantity = (length?: number, width?: number, thickness?: number, uom?: string) => {
    if (!length || !width || !uom) return null;
    if (uom.toLowerCase() === 'sqm') {
      return length * width;
    } else if (uom.toLowerCase() === 'cum') {
      if (!thickness) return null;
      return length * width * thickness;
    }
    return null;
  };

  return (
    <div className="form-section">
      <div className="form-section-title text-blue-600">
        <Activity className="w-5 h-5" />
        <h3>Activity Progress</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => {
          const length = control._formValues.progress?.[index]?.length;
          const width = control._formValues.progress?.[index]?.width;
          const thickness = control._formValues.progress?.[index]?.thickness;
          const uom = control._formValues.progress?.[index]?.uom;
          const calculatedQty = calculateQuantity(length, width, thickness, uom);

          return (
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
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={control}
                    name={`progress.${index}.activity`}
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2 lg:col-span-1">
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
                            <SelectItem value="Full Width">Full Width</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`progress.${index}.uom`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UOM</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select UOM" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sqm">sqm (Length × Width)</SelectItem>
                            <SelectItem value="cum">cum (Length × Width × Thickness)</SelectItem>
                            <SelectItem value="m">m</SelectItem>
                            <SelectItem value="MT">MT</SelectItem>
                            <SelectItem value="Liters">Liters</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={control}
                    name={`progress.${index}.chainageFrom`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chainage From</FormLabel>
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
                        <FormLabel>Chainage To</FormLabel>
                        <FormControl>
                          <Input placeholder="0+100" {...field} value={field.value || ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FormField
                    control={control}
                    name={`progress.${index}.length`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Length (m)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`progress.${index}.width`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Width (m)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {uom?.toLowerCase() === 'cum' && (
                    <FormField
                      control={control}
                      name={`progress.${index}.thickness`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Thickness (m)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00" 
                              {...field} 
                              onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                              value={field.value || ''}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  <div className="flex flex-col justify-end">
                    <FormLabel className="text-xs text-muted-foreground">Calculated Qty</FormLabel>
                    <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary">
                      {calculatedQty !== null ? calculatedQty.toFixed(2) : '-'}
                    </div>
                  </div>
                </div>

                <FormField
                  control={control}
                  name={`progress.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manual Quantity (override if needed)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="Leave empty for auto-calculation" 
                          {...field} 
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '') {
                              field.onChange(calculatedQty || undefined);
                            } else {
                              field.onChange(parseFloat(val));
                            }
                          }}
                          value={field.value !== null && field.value !== undefined ? field.value : ''}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          );
        })}
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

  const calculateWorkingHours = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return null;
    try {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      if (diff < 0) return null;
      return (diff / 60).toFixed(2);
    } catch {
      return null;
    }
  };

  const totalDiesel = fields.reduce((sum, _, index) => {
    const diesel = control._formValues.equipment?.[index]?.diesel || 0;
    return sum + (typeof diesel === 'number' ? diesel : 0);
  }, 0);

  return (
    <div className="form-section">
      <div className="form-section-title text-orange-600">
        <Truck className="w-5 h-5" />
        <h3>Equipment Log</h3>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => {
          const startTime = control._formValues.equipment?.[index]?.startTime;
          const endTime = control._formValues.equipment?.[index]?.endTime;
          const workingHours = calculateWorkingHours(startTime, endTime);

          return (
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
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <FormLabel>Operator Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Name" {...field} value={field.value || ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={control}
                    name={`equipment.${index}.startTime`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            {...field} 
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`equipment.${index}.endTime`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            {...field} 
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col justify-end">
                    <FormLabel className="text-xs text-muted-foreground">Working Hours</FormLabel>
                    <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary">
                      {workingHours !== null ? `${workingHours} hrs` : '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={control}
                    name={`equipment.${index}.diesel`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diesel Issued (Liters)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.1" 
                            placeholder="0.0" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`equipment.${index}.task`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Performed (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Rolling WMM, Watering shoulders" {...field} value={field.value || ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {fields.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Total Diesel Issued</p>
              <p className="text-2xl font-bold text-primary">{totalDiesel.toFixed(1)} L</p>
            </div>
          </div>
        )}

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
          <div key={field.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end p-4 bg-muted/30 rounded-lg relative">
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
                <FormItem>
                  <FormLabel>Material Name</FormLabel>
                  <FormControl>
                     <Input placeholder="e.g. Cement" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`materials.${index}.supplier`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <FormControl>
                     <Input placeholder="e.g. ABC Corp" {...field} value={field.value || ''} />
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
