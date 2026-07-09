import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronLeft, ChevronRight, Check, Route, Layers, Wrench, Users, Package, FileText, Plus, Trash2, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { HubShell } from "@/components/HubShell";

// ── Constants ──────────────────────────────────────────────────────────────

const ROAD_ACTIVITIES = [
  "Earthwork Excavation", "Sub-grade Preparation", "GSB Laying", "WMM Laying",
  "WBM Laying", "Scarifying", "Priming", "Tack Coat Application", "PMC Laying",
  "DBM Laying", "BC Laying", "SDBC Laying", "BM Laying", "Shoulder Formation",
  "Side Drain", "Compaction", "Patching / Patchwork", "Median Filling",
  "Road Marking", "Culvert Excavation", "Other",
];

const ROAD_UOMS = ["Sqm", "Cum", "RM", "MT", "Ton", "Nos", "Rmt", "Each"];
const ROAD_SIDES = ["Both", "LHS", "RHS", "Full Width", "Median"];
const LABOUR_CATEGORIES = ["MASON", "HELPER", "MAZDOOR", "CARPENTER", "BAR-BENDER", "OPERATOR", "DRIVER", "ELECTRICIAN", "MECHANIC", "WATCHMAN", "OTHER"];
const MATERIAL_UOMS = ["MT", "Ton", "Cum", "RM", "Bag", "Ltr", "Kg", "Nos", "Each"];

// ── Types ──────────────────────────────────────────────────────────────────

type ProgressRow = {
  activity: string;
  chainageFrom: string;
  chainageTo: string;
  side: string;
  length: string;
  width: string;
  thickness: string;
  quantity: string;
  uom: string;
  boqItemId: string;
};

type LabourRow = { category: string; gender: string; count: string; task: string; contractor: string };
type EquipmentRow = { machine: string; operator: string; vehicleNo: string; startTime: string; endTime: string; hoursWorked: string; diesel: string; task: string };
type MaterialRow = { type: "Received" | "Issued"; material: string; quantity: string; uom: string; supplier: string; vehicleNumber: string; location: string; receiptNumber: string };

const emptyProgress = (): ProgressRow => ({ activity: "", chainageFrom: "", chainageTo: "", side: "", length: "", width: "", thickness: "", quantity: "", uom: "Sqm", boqItemId: "" });
const emptyLabour = (): LabourRow => ({ category: "MAZDOOR", gender: "Male", count: "", task: "", contractor: "" });
const emptyEquip = (): EquipmentRow => ({ machine: "", operator: "", vehicleNo: "", startTime: "", endTime: "", hoursWorked: "", diesel: "", task: "" });
const emptyMaterial = (): MaterialRow => ({ type: "Received", material: "", quantity: "", uom: "MT", supplier: "", vehicleNumber: "", location: "", receiptNumber: "" });

// ── Step config ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "setup",      label: "Setup",       icon: FileText },
  { key: "activity",   label: "Activity",    icon: Route },
  { key: "quantities", label: "Quantities",  icon: Layers },
  { key: "labour",     label: "Labour",      icon: Users },
  { key: "equipment",  label: "Equipment",   icon: Wrench },
  { key: "materials",  label: "Materials",   icon: Package },
  { key: "review",     label: "Review",      icon: Check },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const S = STEPS[i];
        const Icon = S.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${done ? "bg-amber-500 border-amber-500" : active ? "bg-white border-amber-500" : "bg-white border-slate-200"}`}>
              {done
                ? <Check className="w-3.5 h-3.5 text-white" />
                : <Icon className={`w-3.5 h-3.5 ${active ? "text-amber-600" : "text-slate-300"}`} />
              }
            </div>
            {i < total - 1 && <div className={`w-6 h-0.5 ${i < current ? "bg-amber-400" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RoadDprEntry() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const today = format(new Date(), "yyyy-MM-dd");
  const fullName = user?.fullName ?? "";

  const [step, setStep] = useState(0);

  // Step 1 – Setup
  const [date, setDate] = useState(today);
  const [site, setSite] = useState("");
  const [engineer, setEngineer] = useState(fullName);

  // Steps 2–3 – Activity & Quantities (multiple rows)
  const [progress, setProgress] = useState<ProgressRow[]>([emptyProgress()]);

  // Step 4 – Labour
  const [labour, setLabour] = useState<LabourRow[]>([emptyLabour()]);

  // Step 5 – Equipment
  const [equipment, setEquipment] = useState<EquipmentRow[]>([emptyEquip()]);

  // Step 6 – Materials
  const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial()]);

  // Step 7 – Review
  const [remarks, setRemarks] = useState("");

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const activeSites = useMemo(() => (sites as any[]).filter((s: any) => s.isActive !== 0), [sites]);

  const { data: equipmentMasters = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment-master"],
    queryFn: () => fetch("/api/equipment-master", { credentials: "include" }).then((r) => r.json()),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      const progressPayload = progress
        .filter((p) => p.activity)
        .map((p) => ({
          activity: p.activity,
          chainageFrom: p.chainageFrom || null,
          chainageTo: p.chainageTo || null,
          side: p.side || null,
          length: p.length ? parseFloat(p.length) : null,
          width: p.width ? parseFloat(p.width) : null,
          thickness: p.thickness ? parseFloat(p.thickness) : null,
          quantity: p.quantity ? parseFloat(p.quantity) : null,
          uom: p.uom || null,
          boqItemId: p.boqItemId ? parseInt(p.boqItemId) : null,
        }));
      const labourPayload = labour.filter((l) => l.category && l.count).map((l) => ({
        category: l.category,
        gender: l.gender || null,
        count: parseInt(l.count) || 0,
        task: l.task || null,
        contractor: l.contractor || null,
      }));
      const equipPayload = equipment.filter((e) => e.machine).map((e) => ({
        machine: e.machine,
        operator: e.operator || null,
        vehicleNo: e.vehicleNo || null,
        entryType: "time_meter",
        startTime: e.startTime || null,
        endTime: e.endTime || null,
        hoursWorked: e.hoursWorked ? parseFloat(e.hoursWorked) : null,
        diesel: e.diesel ? parseFloat(e.diesel) : null,
        task: e.task || null,
      }));
      const matPayload = materials.filter((m) => m.material).map((m) => ({
        type: m.type,
        material: m.material,
        quantity: m.quantity ? parseFloat(m.quantity) : null,
        uom: m.uom || null,
        supplier: m.supplier || null,
        vehicleNumber: m.vehicleNumber || null,
        location: m.location || null,
        receiptNumber: m.receiptNumber || null,
      }));
      const res = await apiRequest("POST", "/api/dprs", {
        date, site, engineer, role: "engineer", workType: "road",
        progress: progressPayload,
        structureItems: [],
        equipment: equipPayload,
        labour: labourPayload,
        materials: matPayload,
        sitePurchases: [],
        remarks: remarks.trim() || undefined,
        clientTimestamp,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      toast({ title: "DPR Submitted", description: "Road DPR saved successfully." });
      setLocation(`/site/success/${data.id}?type=road`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit DPR. Please try again.", variant: "destructive" });
    },
  });

  // ── Step validation ────────────────────────────────────────────────────

  const canNext = useMemo(() => {
    if (step === 0) return !!(date && site && engineer);
    if (step === 1) return progress.some((p) => p.activity);
    if (step === 6) return true;
    return true;
  }, [step, date, site, engineer, progress]);

  const next = () => { if (step < STEPS.length - 1) setStep((s) => s + 1); };
  const back = () => { if (step > 0) setStep((s) => s - 1); };

  // ── Row helpers ────────────────────────────────────────────────────────

  const updateProgress = (i: number, key: keyof ProgressRow, val: string) =>
    setProgress((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const updateLabour = (i: number, key: keyof LabourRow, val: string) =>
    setLabour((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const updateEquip = (i: number, key: keyof EquipmentRow, val: string) =>
    setEquipment((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const updateMat = (i: number, key: keyof MaterialRow, val: string) =>
    setMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <HubShell
      title="Road Works DPR"
      subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
      backHref="/site/hub"
      backLabel="Site Hub"
    >
      <div className="max-w-2xl mx-auto px-4 pb-20 space-y-6">

        {/* Step progress bar */}
        <div className="flex items-center justify-between pt-2">
          <StepBar current={step} total={STEPS.length} />
          <span className="text-xs font-medium text-slate-400">{step + 1} / {STEPS.length}</span>
        </div>

        {/* ── Step 0: Setup ────────────────────────────────────── */}
        {step === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Report Setup</h3>
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-road-date" />
            </Field>
            <Field label="Site" required>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger data-testid="select-road-site">
                  <SelectValue placeholder="Select site…" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s: any) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Engineer / Supervisor" required>
              <Input
                placeholder="Full name"
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
                data-testid="input-road-engineer"
              />
            </Field>
          </div>
        )}

        {/* ── Step 1: Activity ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Road Activities</h3>
            <p className="text-sm text-slate-500">Add one or more work activities performed today.</p>
            {progress.map((row, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Activity {i + 1}</span>
                  {progress.length > 1 && (
                    <button onClick={() => setProgress((rows) => rows.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600" data-testid={`button-remove-activity-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Field label="Activity / Work Type" required>
                  <Select value={row.activity} onValueChange={(v) => updateProgress(i, "activity", v)}>
                    <SelectTrigger data-testid={`select-activity-${i}`}>
                      <SelectValue placeholder="Select activity…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROAD_ACTIVITIES.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Chainage From">
                    <Input placeholder="e.g. 0+000" value={row.chainageFrom} onChange={(e) => updateProgress(i, "chainageFrom", e.target.value)} data-testid={`input-chainage-from-${i}`} />
                  </Field>
                  <Field label="Chainage To">
                    <Input placeholder="e.g. 0+200" value={row.chainageTo} onChange={(e) => updateProgress(i, "chainageTo", e.target.value)} data-testid={`input-chainage-to-${i}`} />
                  </Field>
                </div>
                <Field label="Side">
                  <Select value={row.side} onValueChange={(v) => updateProgress(i, "side", v)}>
                    <SelectTrigger data-testid={`select-side-${i}`}>
                      <SelectValue placeholder="Select side…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROAD_SIDES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => setProgress((rows) => [...rows, emptyProgress()])}
              data-testid="button-add-activity"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Another Activity
            </Button>
          </div>
        )}

        {/* ── Step 2: Quantities ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Quantities & Dimensions</h3>
            <p className="text-sm text-slate-500">Enter dimensions and quantities for each activity.</p>
            {progress.filter((p) => p.activity).map((row, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <p className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">{row.activity}</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Length (m)">
                    <Input type="number" step="0.01" placeholder="0" value={row.length} onChange={(e) => updateProgress(i, "length", e.target.value)} data-testid={`input-length-${i}`} />
                  </Field>
                  <Field label="Width (m)">
                    <Input type="number" step="0.01" placeholder="0" value={row.width} onChange={(e) => updateProgress(i, "width", e.target.value)} data-testid={`input-width-${i}`} />
                  </Field>
                  <Field label="Thickness (m)">
                    <Input type="number" step="0.001" placeholder="0" value={row.thickness} onChange={(e) => updateProgress(i, "thickness", e.target.value)} data-testid={`input-thickness-${i}`} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity">
                    <Input type="number" step="0.01" placeholder="0" value={row.quantity} onChange={(e) => updateProgress(i, "quantity", e.target.value)} data-testid={`input-quantity-${i}`} />
                  </Field>
                  <Field label="Unit (UOM)">
                    <Select value={row.uom} onValueChange={(v) => updateProgress(i, "uom", v)}>
                      <SelectTrigger data-testid={`select-uom-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROAD_UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Labour ──────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Labour</h3>
            <p className="text-sm text-slate-500">Record manpower deployed today.</p>
            {labour.map((row, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Entry {i + 1}</span>
                  {labour.length > 1 && (
                    <button onClick={() => setLabour((rows) => rows.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600" data-testid={`button-remove-labour-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category" required>
                    <Select value={row.category} onValueChange={(v) => updateLabour(i, "category", v)}>
                      <SelectTrigger data-testid={`select-labour-cat-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LABOUR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Gender">
                    <Select value={row.gender} onValueChange={(v) => updateLabour(i, "gender", v)}>
                      <SelectTrigger data-testid={`select-labour-gender-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Count" required>
                  <Input type="number" min="0" placeholder="0" value={row.count} onChange={(e) => updateLabour(i, "count", e.target.value)} data-testid={`input-labour-count-${i}`} />
                </Field>
                <Field label="Task / Work Description">
                  <Input placeholder="e.g. WMM laying, BC compaction…" value={row.task} onChange={(e) => updateLabour(i, "task", e.target.value)} data-testid={`input-labour-task-${i}`} />
                </Field>
                <Field label="Contractor / Gang">
                  <Input placeholder="Contractor name" value={row.contractor} onChange={(e) => updateLabour(i, "contractor", e.target.value)} data-testid={`input-labour-contractor-${i}`} />
                </Field>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed" onClick={() => setLabour((rows) => [...rows, emptyLabour()])} data-testid="button-add-labour">
              <Plus className="w-4 h-4 mr-2" /> Add Labour Entry
            </Button>
          </div>
        )}

        {/* ── Step 4: Equipment ────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Equipment</h3>
            <p className="text-sm text-slate-500">Log machinery deployed today.</p>
            {equipment.map((row, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Machine {i + 1}</span>
                  {equipment.length > 1 && (
                    <button onClick={() => setEquipment((rows) => rows.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600" data-testid={`button-remove-equip-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Field label="Machine / Equipment" required>
                  {equipmentMasters.length > 0 ? (
                    <Select value={row.machine} onValueChange={(v) => updateEquip(i, "machine", v)}>
                      <SelectTrigger data-testid={`select-machine-${i}`}>
                        <SelectValue placeholder="Select machine…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(equipmentMasters as any[]).map((eq: any) => (
                          <SelectItem key={eq.id} value={eq.name}>{eq.name}{eq.registrationNumber ? ` (${eq.registrationNumber})` : ""}</SelectItem>
                        ))}
                        <SelectItem value="__other">Other (type below)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input placeholder="Machine name" value={row.machine} onChange={(e) => updateEquip(i, "machine", e.target.value)} data-testid={`input-machine-${i}`} />
                  )}
                  {row.machine === "__other" && (
                    <Input className="mt-2" placeholder="Specify machine name" onChange={(e) => updateEquip(i, "machine", e.target.value)} data-testid={`input-machine-other-${i}`} />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Operator">
                    <Input placeholder="Operator name" value={row.operator} onChange={(e) => updateEquip(i, "operator", e.target.value)} data-testid={`input-operator-${i}`} />
                  </Field>
                  <Field label="Vehicle No.">
                    <Input placeholder="Reg. number" value={row.vehicleNo} onChange={(e) => updateEquip(i, "vehicleNo", e.target.value)} data-testid={`input-vehicle-no-${i}`} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Time">
                    <Input type="time" value={row.startTime} onChange={(e) => updateEquip(i, "startTime", e.target.value)} data-testid={`input-start-time-${i}`} />
                  </Field>
                  <Field label="End Time">
                    <Input type="time" value={row.endTime} onChange={(e) => updateEquip(i, "endTime", e.target.value)} data-testid={`input-end-time-${i}`} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hours Worked">
                    <Input type="number" step="0.5" placeholder="0" value={row.hoursWorked} onChange={(e) => updateEquip(i, "hoursWorked", e.target.value)} data-testid={`input-hours-worked-${i}`} />
                  </Field>
                  <Field label="Diesel (L)">
                    <Input type="number" step="0.1" placeholder="0" value={row.diesel} onChange={(e) => updateEquip(i, "diesel", e.target.value)} data-testid={`input-diesel-${i}`} />
                  </Field>
                </div>
                <Field label="Task">
                  <Input placeholder="e.g. Rolling WMM" value={row.task} onChange={(e) => updateEquip(i, "task", e.target.value)} data-testid={`input-equip-task-${i}`} />
                </Field>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed" onClick={() => setEquipment((rows) => [...rows, emptyEquip()])} data-testid="button-add-equipment">
              <Plus className="w-4 h-4 mr-2" /> Add Equipment
            </Button>
          </div>
        )}

        {/* ── Step 5: Materials ────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Materials</h3>
            <p className="text-sm text-slate-500">Log materials received or issued at site.</p>
            {materials.map((row, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Material {i + 1}</span>
                  {materials.length > 1 && (
                    <button onClick={() => setMaterials((rows) => rows.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600" data-testid={`button-remove-mat-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <Select value={row.type} onValueChange={(v: any) => updateMat(i, "type", v)}>
                      <SelectTrigger data-testid={`select-mat-type-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Received">Received</SelectItem>
                        <SelectItem value="Issued">Issued</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Material" required>
                    <Input placeholder="Material name" value={row.material} onChange={(e) => updateMat(i, "material", e.target.value)} data-testid={`input-mat-name-${i}`} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity">
                    <Input type="number" step="0.01" placeholder="0" value={row.quantity} onChange={(e) => updateMat(i, "quantity", e.target.value)} data-testid={`input-mat-qty-${i}`} />
                  </Field>
                  <Field label="UOM">
                    <Select value={row.uom} onValueChange={(v) => updateMat(i, "uom", v)}>
                      <SelectTrigger data-testid={`select-mat-uom-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIAL_UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {row.type === "Received" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Supplier">
                      <Input placeholder="Supplier name" value={row.supplier} onChange={(e) => updateMat(i, "supplier", e.target.value)} data-testid={`input-mat-supplier-${i}`} />
                    </Field>
                    <Field label="Vehicle No.">
                      <Input placeholder="Vehicle number" value={row.vehicleNumber} onChange={(e) => updateMat(i, "vehicleNumber", e.target.value)} data-testid={`input-mat-vehicle-${i}`} />
                    </Field>
                  </div>
                )}
                <Field label={row.type === "Issued" ? "Issued To / Location" : "Unload Location"}>
                  <Input placeholder="Location or purpose" value={row.location} onChange={(e) => updateMat(i, "location", e.target.value)} data-testid={`input-mat-location-${i}`} />
                </Field>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed" onClick={() => setMaterials((rows) => [...rows, emptyMaterial()])} data-testid="button-add-material">
              <Plus className="w-4 h-4 mr-2" /> Add Material Entry
            </Button>
          </div>
        )}

        {/* ── Step 6: Review & Submit ─────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Review & Submit</h3>

            {/* Summary cards */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-amber-600" /><span className="text-sm font-semibold text-amber-900">Road Works DPR</span></div>
              <p className="text-sm text-amber-800"><span className="font-medium">Site:</span> {site}</p>
              <p className="text-sm text-amber-800"><span className="font-medium">Date:</span> {date}</p>
              <p className="text-sm text-amber-800"><span className="font-medium">Engineer:</span> {engineer}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{progress.filter((p) => p.activity).length}</p>
                <p className="text-xs text-slate-500 mt-1">Activities</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{labour.filter((l) => l.category && l.count).reduce((s, l) => s + (parseInt(l.count) || 0), 0)}</p>
                <p className="text-xs text-slate-500 mt-1">Workers</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{equipment.filter((e) => e.machine).length}</p>
                <p className="text-xs text-slate-500 mt-1">Equipment</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{materials.filter((m) => m.material).length}</p>
                <p className="text-xs text-slate-500 mt-1">Materials</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Remarks / Notes</Label>
              <Textarea
                placeholder="Any site observations, issues, or special notes…"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={4}
                data-testid="textarea-remarks"
              />
            </div>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white h-12 text-base font-semibold"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              data-testid="button-submit-road-dpr"
            >
              {submitMutation.isPending ? "Submitting…" : "Submit Road DPR"}
            </Button>
          </div>
        )}

        {/* ── Nav buttons ────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2">
          {step > 0 ? (
            <Button variant="outline" onClick={back} className="flex-1" data-testid="button-step-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setLocation("/site/hub")} className="flex-1" data-testid="button-cancel-road-dpr">
              <ArrowLeft className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={next}
              disabled={!canNext}
              data-testid="button-step-next"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </HubShell>
  );
}
