import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, isForbiddenError, NO_CREATE_PERMISSION_DESCRIPTION, queryClient } from "@/lib/queryClient";
import { EQUIPMENT_TYPES, type EquipmentMasterType, type PlantSettingsWithSite } from "@shared/schema";

const CANONICAL_UNITS = ["CUM", "SQM", "MT", "RM", "HECT", "KL", "LS", "NOS"];

export interface EquipmentMasterCreateDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialName?: string;
  onCreated?: (equipment: EquipmentMasterType) => void;
  trigger?: ReactNode;
}

export function EquipmentMasterCreateDialog({
  open: controlledOpen,
  onOpenChange,
  initialName = "",
  onCreated,
  trigger,
}: EquipmentMasterCreateDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState(initialName.toUpperCase());
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [ownership, setOwnership] = useState("owned");
  const [vendorName, setVendorName] = useState("");
  const [hireBasis, setHireBasis] = useState("");
  const [hireRate, setHireRate] = useState("");
  const [hireStartDate, setHireStartDate] = useState("");
  const [hireEndDate, setHireEndDate] = useState("");
  const [hireDieselResponsibility, setHireDieselResponsibility] = useState("hlc");
  const [hireOperatorResponsibility, setHireOperatorResponsibility] = useState("hlc");
  const [hireRemarks, setHireRemarks] = useState("");
  const [hireDeductionEnabled, setHireDeductionEnabled] = useState(false);
  const [monthlyDivisorType, setMonthlyDivisorType] = useState("calendar");
  const [monthlyDivisorCustom, setMonthlyDivisorCustom] = useState("");
  const [meterType, setMeterType] = useState("hour_meter");
  const [consumptionNorm, setConsumptionNorm] = useState("");
  const [plantName, setPlantName] = useState("");
  const [standardOutputsMap, setStandardOutputsMap] = useState<Record<string, string>>({});
  const [outputEfficiency, setOutputEfficiency] = useState("75");
  const [showPlanningOutput, setShowPlanningOutput] = useState(false);

  const { data: plants = [] } = useQuery<PlantSettingsWithSite[]>({
    queryKey: ["/api/plant-module/plant-settings"],
  });

  const reset = () => {
    setName(initialName.toUpperCase());
    setRegistrationNumber("");
    setEquipmentType("");
    setOwnership("owned");
    setVendorName("");
    setHireBasis("");
    setHireRate("");
    setHireStartDate("");
    setHireEndDate("");
    setHireDieselResponsibility("hlc");
    setHireOperatorResponsibility("hlc");
    setHireRemarks("");
    setHireDeductionEnabled(false);
    setMonthlyDivisorType("calendar");
    setMonthlyDivisorCustom("");
    setMeterType("hour_meter");
    setConsumptionNorm("");
    setPlantName("");
    setStandardOutputsMap({});
    setOutputEfficiency("75");
    setShowPlanningOutput(false);
  };

  useEffect(() => {
    if (open) setName(initialName.toUpperCase());
  }, [open, initialName]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", "/api/plant-module/equipment", data);
      return response.json() as Promise<EquipmentMasterType>;
    },
    onSuccess: (equipment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      setOpen(false);
      reset();
      onCreated?.(equipment);
      toast({ title: "Equipment created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const submit = () => {
    if (!name.trim()) return;
    const hasHireTerms = ownership === "hired" && Boolean(
      hireBasis || hireRate || hireStartDate || hireEndDate || hireRemarks || hireDeductionEnabled,
    );
    if (ownership === "hired") {
      if (!vendorName.trim()) {
        toast({ title: "Vendor / contractor name is required for hired equipment", variant: "destructive" });
        return;
      }
      if (hasHireTerms && (!vendorName.trim() || !hireBasis || !hireRate || !hireStartDate)) {
        toast({ title: "Vendor, hire basis, rate, and start date are required when adding hire terms", variant: "destructive" });
        return;
      }
      if (hasHireTerms && (!Number.isFinite(Number(hireRate)) || Number(hireRate) <= 0)) {
        toast({ title: "Hire rate must be greater than zero", variant: "destructive" });
        return;
      }
      if (hireEndDate && hireEndDate < hireStartDate) {
        toast({ title: "Hire end date cannot be before the start date", variant: "destructive" });
        return;
      }
      if (hireBasis === "monthly" && monthlyDivisorType === "custom" && (!Number.isFinite(Number(monthlyDivisorCustom)) || Number(monthlyDivisorCustom) <= 0)) {
        toast({ title: "Enter a custom monthly divisor greater than zero", variant: "destructive" });
        return;
      }
    }
    const standardOutputs = CANONICAL_UNITS
      .filter(unit => standardOutputsMap[unit] && parseFloat(standardOutputsMap[unit]) > 0)
      .map(unit => ({ unit, outputPerHr: parseFloat(standardOutputsMap[unit]) }));
    createMutation.mutate({
      name: name.trim(),
      registrationNumber: registrationNumber || undefined,
      equipmentType,
      ownership,
      vendorName: ownership === "hired" ? vendorName || undefined : undefined,
      hireBillingBasis: hasHireTerms ? hireBasis : null,
      hireRate: hasHireTerms ? parseFloat(hireRate) : null,
      hireStartDate: hasHireTerms ? hireStartDate : null,
      hireEndDate: hasHireTerms ? hireEndDate || null : null,
      hireDieselResponsibility: hasHireTerms ? hireDieselResponsibility : null,
      hireOperatorResponsibility: hasHireTerms ? hireOperatorResponsibility : null,
      hireAgreementRemarks: hasHireTerms ? hireRemarks || null : null,
      hireBreakdownDeductionEnabled: hasHireTerms ? hireDeductionEnabled : false,
      hireMonthlyDivisorType: hasHireTerms && hireBasis === "monthly" ? monthlyDivisorType : null,
      hireMonthlyDivisor: hasHireTerms && hireBasis === "monthly" && monthlyDivisorType === "custom" ? parseFloat(monthlyDivisorCustom) : null,
      meterType,
      consumptionNorm: consumptionNorm ? parseFloat(consumptionNorm) : undefined,
      plantName: plantName || null,
      standardOutputs: standardOutputs.length ? standardOutputs : null,
      outputEfficiency: outputEfficiency ? parseFloat(outputEfficiency) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); setOpen(next); }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Equipment</DialogTitle>
          <DialogDescription>Enter the Equipment Master details used for usage, fuel, and planning records.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div><Label htmlFor="create-equipment-name">Equipment Name</Label><Input id="create-equipment-name" value={name} onChange={e => setName(e.target.value.toUpperCase())} placeholder="e.g., 600 KVA GENERATOR" data-testid="input-equipment-name" /></div>
          <div><Label htmlFor="create-registration-number">Registration / ID Number</Label><Input id="create-registration-number" value={registrationNumber} onChange={e => setRegistrationNumber(e.target.value.toUpperCase())} placeholder="e.g., MH12AB1234" data-testid="input-registration-number" /></div>
          <div>
            <Label htmlFor="create-equipment-type">Equipment Type</Label>
            <select
              id="create-equipment-type"
              value={equipmentType}
              onChange={event => setEquipmentType(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="select-equipment-type"
            >
              <option value="">Select equipment type…</option>
              {EQUIPMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="create-equipment-ownership">Ownership</Label>
            <select
              id="create-equipment-ownership"
              value={ownership}
              onChange={event => setOwnership(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="select-ownership"
            >
              <option value="owned">Owned</option>
              <option value="hired">Hired</option>
            </select>
          </div>
          {ownership === "hired" && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-3">
              <p className="text-sm font-medium text-amber-800">Hire Terms</p>
              <div><Label>Vendor / Contractor Name</Label><Input value={vendorName} onChange={e => setVendorName(e.target.value.toUpperCase())} placeholder="e.g., ABC CONTRACTORS" data-testid="input-vendor-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Hire Basis</Label><Select value={hireBasis} onValueChange={setHireBasis}><SelectTrigger data-testid="select-hire-basis"><SelectValue placeholder="Select basis" /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="trip">Trip</SelectItem></SelectContent></Select></div>
                <div><Label>Hire Rate (₹)</Label><Input type="number" min="0" step="0.01" value={hireRate} onChange={e => setHireRate(e.target.value)} data-testid="input-hire-rate" /></div>
                <div><Label>Hire Start Date</Label><Input type="date" value={hireStartDate} onChange={e => setHireStartDate(e.target.value)} data-testid="input-hire-start-date" /></div>
                <div><Label>Hire End Date <span className="text-muted-foreground">(open-ended if blank)</span></Label><Input type="date" value={hireEndDate} onChange={e => setHireEndDate(e.target.value)} data-testid="input-hire-end-date" /></div>
                <div><Label>Diesel Responsibility</Label><Select value={hireDieselResponsibility} onValueChange={setHireDieselResponsibility}><SelectTrigger data-testid="select-hire-diesel-responsibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hlc">HLC</SelectItem><SelectItem value="vendor">Vendor</SelectItem></SelectContent></Select></div>
                <div><Label>Operator Responsibility</Label><Select value={hireOperatorResponsibility} onValueChange={setHireOperatorResponsibility}><SelectTrigger data-testid="select-hire-operator-responsibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hlc">HLC</SelectItem><SelectItem value="vendor">Vendor</SelectItem></SelectContent></Select></div>
              </div>
              {hireBasis === "monthly" && <div className="grid grid-cols-2 gap-3"><div><Label>Monthly Divisor</Label><Select value={monthlyDivisorType} onValueChange={setMonthlyDivisorType}><SelectTrigger data-testid="select-monthly-divisor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar">Calendar days</SelectItem><SelectItem value="30">30 days</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>{monthlyDivisorType === "custom" && <div><Label>Custom Divisor (days)</Label><Input type="number" min="1" step="1" value={monthlyDivisorCustom} onChange={e => setMonthlyDivisorCustom(e.target.value)} data-testid="input-monthly-divisor-custom" /></div>}</div>}
              <div className="flex items-center gap-2"><Checkbox id="create-hire-deduction" checked={hireDeductionEnabled} onCheckedChange={checked => setHireDeductionEnabled(checked === true)} data-testid="checkbox-hire-deduction-enabled" /><Label htmlFor="create-hire-deduction">Allow vendor breakdown deductions</Label></div>
              <div><Label>Hire Remarks</Label><Textarea value={hireRemarks} onChange={e => setHireRemarks(e.target.value)} placeholder="Agreement notes (optional)" data-testid="input-hire-remarks" /></div>
            </div>
          )}
          <div><Label>Meter Type</Label><Select value={meterType} onValueChange={setMeterType}><SelectTrigger data-testid="select-meter-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hour_meter">Hour Meter (hrs)</SelectItem><SelectItem value="odometer">Odometer (km)</SelectItem></SelectContent></Select></div>
          <div><Label>Consumption Norm ({meterType === "hour_meter" ? "L/hr" : "L/km"})</Label><Input type="number" step="0.1" value={consumptionNorm} onChange={e => setConsumptionNorm(e.target.value)} placeholder="e.g., 50" data-testid="input-consumption-norm" /></div>
          <div><Label>Plant <span className="text-muted-foreground text-sm">(leave blank if shared across plants)</span></Label><Select value={plantName || "__none__"} onValueChange={value => setPlantName(value === "__none__" ? "" : value)}><SelectTrigger data-testid="select-equipment-plant"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">— Shared / No specific plant —</SelectItem>{plants.map(plant => <SelectItem key={plant.plantName} value={plant.plantName}>{plant.plantName}</SelectItem>)}</SelectContent></Select></div>
          <div className="border border-dashed border-teal-200 rounded-lg">
            <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-teal-700" onClick={() => setShowPlanningOutput(value => !value)} data-testid="button-toggle-planning-output">
              <span><span className="text-[12px] font-bold uppercase tracking-wide text-teal-600">Standard Outputs</span> <span className="text-[12px] text-muted-foreground font-normal">(for auto-duration in Work Programme)</span></span>
              {showPlanningOutput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showPlanningOutput && <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2"><span className="text-xs font-semibold">Unit</span><span className="text-xs font-semibold">Output / hr</span><span className="text-xs font-semibold text-right">Daily (8 hrs)</span></div>
              {CANONICAL_UNITS.map(unit => { const value = standardOutputsMap[unit] || ""; const numeric = value ? parseFloat(value) : 0; return <div key={unit} className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 items-center"><Label>{unit}</Label><Input type="number" step="0.1" min="0" className="h-7" value={value} onChange={e => setStandardOutputsMap(current => ({ ...current, [unit]: e.target.value }))} data-testid={`input-std-output-${unit}`} /><span className="text-xs text-right">{numeric > 0 ? (numeric * 8).toFixed(1) : "—"}</span></div>; })}
              <div className="pt-1 border-t"><Label>Efficiency (%) — applies to fallback theoretical output only</Label><Input type="number" min="0" max="100" step="1" value={outputEfficiency} onChange={e => setOutputEfficiency(e.target.value)} className="h-7 mt-1 w-24" data-testid="input-output-efficiency" /></div>
            </div>}
          </div>
          <Button onClick={submit} className="w-full" disabled={createMutation.isPending || !name.trim() || !equipmentType} data-testid="button-save-equipment">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}