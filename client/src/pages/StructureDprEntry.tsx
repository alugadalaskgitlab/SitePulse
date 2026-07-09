import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronLeft, ChevronRight, Check, Building2, Layers, Wrench, Users, Package, FileText,
  Plus, Trash2, ArrowLeft, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { HubShell } from "@/components/HubShell";
import {
  STRUCTURE_TYPES, STRUCTURE_ITEMS, getSubTypes, getStages,
} from "@shared/structureHierarchy";

// ── Constants ──────────────────────────────────────────────────────────────

const STRUCTURE_UOMS = ["Cum", "Sqm", "RM", "MT", "Nos", "Rmt", "Bag", "Each"];
const LABOUR_CATEGORIES = ["MASON", "HELPER", "MAZDOOR", "CARPENTER", "BAR-BENDER", "OPERATOR", "DRIVER", "ELECTRICIAN", "MECHANIC", "WATCHMAN", "OTHER"];
const MATERIAL_UOMS = ["MT", "Ton", "Cum", "RM", "Bag", "Ltr", "Kg", "Nos", "Each"];

// ── Types ──────────────────────────────────────────────────────────────────

type StructureItemRow = {
  structureType: string;
  structureSubType: string;
  structureName: string;
  stage: string;
  itemOfWork: string;
  quantity: string;
  uom: string;
  remarks: string;
};

type LabourRow = { category: string; gender: string; count: string; task: string; contractor: string };
type EquipmentRow = { machine: string; operator: string; vehicleNo: string; startTime: string; endTime: string; hoursWorked: string; diesel: string; task: string };
type MaterialRow = { type: "Received" | "Issued"; material: string; quantity: string; uom: string; supplier: string; vehicleNumber: string; location: string; receiptNumber: string };

const emptyStructItem = (): StructureItemRow => ({
  structureType: "", structureSubType: "", structureName: "", stage: "", itemOfWork: "", quantity: "", uom: "Cum", remarks: "",
});
const emptyLabour = (): LabourRow => ({ category: "MASON", gender: "Male", count: "", task: "", contractor: "" });
const emptyEquip = (): EquipmentRow => ({ machine: "", operator: "", vehicleNo: "", startTime: "", endTime: "", hoursWorked: "", diesel: "", task: "" });
const emptyMaterial = (): MaterialRow => ({ type: "Received", material: "", quantity: "", uom: "MT", supplier: "", vehicleNumber: "", location: "", receiptNumber: "" });

// ── Step config ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "setup",       label: "Setup",           icon: FileText },
  { key: "struct-type", label: "Structure Type",  icon: Building2 },
  { key: "sub-type",    label: "Sub-Type",         icon: Tag },
  { key: "location",    label: "Location & Name",  icon: Tag },
  { key: "stage",       label: "Stage",            icon: Layers },
  { key: "items",       label: "Items of Work",    icon: Layers },
  { key: "labour",      label: "Labour",           icon: Users },
  { key: "equipment",   label: "Equipment",        icon: Wrench },
  { key: "materials",   label: "Materials",        icon: Package },
  { key: "review",      label: "Review",           icon: Check },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  const dots = Array.from({ length: total });
  return (
    <div className="flex items-center gap-1">
      {dots.map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1">
            <div className={`rounded-full transition-all ${
              done ? "w-5 h-5 bg-blue-500 flex items-center justify-center" :
              active ? "w-5 h-5 border-2 border-blue-500 bg-white flex items-center justify-center" :
              "w-2 h-2 bg-slate-200 rounded-full"
            }`}>
              {done && <Check className="w-3 h-3 text-white" />}
              {active && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            {i < total - 1 && <div className={`h-0.5 w-3 ${i < current ? "bg-blue-400" : "bg-slate-200"}`} />}
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

export default function StructureDprEntry() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const today = format(new Date(), "yyyy-MM-dd");
  const fullName = user?.fullName ?? "";

  const [step, setStep] = useState(0);

  // Step 0: Setup
  const [date, setDate] = useState(today);
  const [site, setSite] = useState("");
  const [engineer, setEngineer] = useState(fullName);

  // Steps 1–5: Structure item being built (one at a time, then add to list)
  // We track a "current item draft" and a finalized list
  const [draft, setDraft] = useState<StructureItemRow>(emptyStructItem());
  const [structureItems, setStructureItems] = useState<StructureItemRow[]>([]);

  // Step 6: Labour
  const [labour, setLabour] = useState<LabourRow[]>([emptyLabour()]);

  // Step 7: Equipment
  const [equipment, setEquipment] = useState<EquipmentRow[]>([emptyEquip()]);

  // Step 8: Materials
  const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial()]);

  // Step 9: Remarks
  const [remarks, setRemarks] = useState("");

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const activeSites = useMemo(() => (sites as any[]).filter((s: any) => s.isActive !== 0), [sites]);

  const { data: equipmentMasters = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment-master"],
    queryFn: () => fetch("/api/equipment-master", { credentials: "include" }).then((r) => r.json()),
  });

  // Derived cascade values for the draft
  const availableSubTypes = useMemo(() =>
    draft.structureType ? getSubTypes(draft.structureType) : [], [draft.structureType]);
  const availableStages = useMemo(() =>
    draft.structureType && draft.structureSubType ? getStages(draft.structureType, draft.structureSubType) : [],
    [draft.structureType, draft.structureSubType]);

  const updateDraft = (key: keyof StructureItemRow, val: string) => {
    setDraft((d) => {
      const updated = { ...d, [key]: val };
      if (key === "structureType") { updated.structureSubType = ""; updated.stage = ""; }
      if (key === "structureSubType") { updated.stage = ""; }
      return updated;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

      // Include draft if it has content but wasn't explicitly added to the list
      const allItems = [...structureItems];
      if (draft.structureType && draft.itemOfWork) allItems.push(draft);

      const structurePayload = allItems.map((s) => ({
        structureType: s.structureType,
        structureSubType: s.structureSubType || null,
        structureName: s.structureName || null,
        stage: s.stage || null,
        itemOfWork: s.itemOfWork,
        quantity: s.quantity ? parseFloat(s.quantity) : null,
        uom: s.uom || null,
        remarks: s.remarks || null,
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
        date, site, engineer, role: "engineer", workType: "structure",
        progress: [],
        structureItems: structurePayload,
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
      toast({ title: "DPR Submitted", description: "Structure DPR saved successfully." });
      setLocation(`/site/success/${data.id}?type=structure`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit DPR. Please try again.", variant: "destructive" });
    },
  });

  // ── Step validation ────────────────────────────────────────────────────

  const canNext = useMemo(() => {
    if (step === 0) return !!(date && site && engineer);
    if (step === 1) return !!draft.structureType;
    if (step === 2) return !!draft.structureSubType;
    if (step === 5) return !!(draft.itemOfWork);
    return true;
  }, [step, date, site, engineer, draft]);

  const next = () => {
    // On step 5 (items of work), finalize the current draft as a committed item
    if (step === 5 && draft.structureType && draft.itemOfWork) {
      setStructureItems((items) => {
        // Replace existing draft for same type+subtype+name+stage, or add new
        const exists = items.findIndex(
          (it) => it.structureType === draft.structureType &&
                  it.structureSubType === draft.structureSubType &&
                  it.structureName === draft.structureName &&
                  it.stage === draft.stage &&
                  it.itemOfWork === draft.itemOfWork
        );
        if (exists >= 0) {
          const updated = [...items];
          updated[exists] = draft;
          return updated;
        }
        return [...items, draft];
      });
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };

  const back = () => { if (step > 0) setStep((s) => s - 1); };

  const addAnotherItem = () => {
    // Save current draft, reset draft, go back to structure type step
    if (draft.structureType && draft.itemOfWork) {
      setStructureItems((items) => {
        const exists = items.findIndex(
          (it) => it.structureType === draft.structureType &&
                  it.structureSubType === draft.structureSubType &&
                  it.structureName === draft.structureName &&
                  it.stage === draft.stage &&
                  it.itemOfWork === draft.itemOfWork
        );
        if (exists >= 0) {
          const updated = [...items];
          updated[exists] = draft;
          return updated;
        }
        return [...items, draft];
      });
    }
    setDraft(emptyStructItem());
    setStep(1);
  };

  // ── Row helpers ────────────────────────────────────────────────────────

  const updateLabour = (i: number, key: keyof LabourRow, val: string) =>
    setLabour((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const updateEquip = (i: number, key: keyof EquipmentRow, val: string) =>
    setEquipment((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const updateMat = (i: number, key: keyof MaterialRow, val: string) =>
    setMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <HubShell
      title="Structure DPR"
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

        {/* Committed items mini-list (visible from step 1+) */}
        {step >= 1 && step <= 5 && structureItems.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-700 mb-2">Items added so far:</p>
            <div className="space-y-1">
              {structureItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-xs text-blue-800">{it.structureType} › {it.structureSubType} › {it.itemOfWork} {it.quantity ? `(${it.quantity} ${it.uom})` : ""}</span>
                  <button onClick={() => setStructureItems((rows) => rows.filter((_, idx) => idx !== i))} className="ml-auto text-rose-400 hover:text-rose-600 flex-shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 0: Setup ────────────────────────────────────── */}
        {step === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Report Setup</h3>
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-struct-date" />
            </Field>
            <Field label="Site" required>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger data-testid="select-struct-site">
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
              <Input placeholder="Full name" value={engineer} onChange={(e) => setEngineer(e.target.value)} data-testid="input-struct-engineer" />
            </Field>
          </div>
        )}

        {/* ── Step 1: Structure Type ───────────────────────────── */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Structure Type</h3>
            <p className="text-sm text-slate-500">What type of structure was worked on today?</p>
            <div className="grid grid-cols-2 gap-3">
              {STRUCTURE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => updateDraft("structureType", type)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    draft.structureType === type
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                  data-testid={`button-struct-type-${type.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Building2 className={`w-5 h-5 mb-2 ${draft.structureType === type ? "text-blue-600" : "text-slate-400"}`} />
                  <p className={`text-sm font-semibold ${draft.structureType === type ? "text-blue-800" : "text-slate-700"}`}>{type}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Sub-Type ─────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Sub-Type</h3>
            <Badge variant="outline" className="text-blue-700 border-blue-300">{draft.structureType}</Badge>
            <p className="text-sm text-slate-500">Select the specific sub-type:</p>
            <div className="grid grid-cols-1 gap-2">
              {availableSubTypes.map((sub) => (
                <button
                  key={sub}
                  onClick={() => updateDraft("structureSubType", sub)}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                    draft.structureSubType === sub
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                  data-testid={`button-subtype-${sub.toLowerCase().replace(/[\s/]+/g, "-")}`}
                >
                  <p className={`text-sm font-medium ${draft.structureSubType === sub ? "text-blue-800" : "text-slate-700"}`}>{sub}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Location & Name ──────────────────────────── */}
        {step === 3 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Location & Name</h3>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-blue-700 border-blue-300">{draft.structureType}</Badge>
              <Badge variant="outline" className="text-blue-600 border-blue-200">{draft.structureSubType}</Badge>
            </div>
            <Field label="Structure Name / ID (optional)">
              <Input
                placeholder="e.g. Culvert CH 0+350, Bridge No. 3, VUP at CH 5+800…"
                value={draft.structureName}
                onChange={(e) => updateDraft("structureName", e.target.value)}
                data-testid="input-struct-name"
              />
            </Field>
            <p className="text-xs text-slate-400">Leave blank if there's no specific designation for this structure.</p>
          </div>
        )}

        {/* ── Step 4: Stage ────────────────────────────────────── */}
        {step === 4 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Stage of Work</h3>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-blue-700 border-blue-300">{draft.structureType}</Badge>
              {draft.structureSubType && <Badge variant="outline" className="text-blue-600 border-blue-200">{draft.structureSubType}</Badge>}
              {draft.structureName && <Badge variant="outline" className="text-slate-600">{draft.structureName}</Badge>}
            </div>
            <p className="text-sm text-slate-500">What stage of construction is in progress?</p>
            <div className="grid grid-cols-2 gap-2">
              {availableStages.map((stage) => (
                <button
                  key={stage}
                  onClick={() => updateDraft("stage", stage)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    draft.stage === stage
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                  data-testid={`button-stage-${stage.toLowerCase().replace(/[\s/]+/g, "-")}`}
                >
                  <p className={`text-sm font-medium ${draft.stage === stage ? "text-blue-800" : "text-slate-700"}`}>{stage}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 5: Items of Work ────────────────────────────── */}
        {step === 5 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-800">Item of Work & Quantity</h3>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-blue-700 border-blue-300">{draft.structureType}</Badge>
              {draft.structureSubType && <Badge variant="outline" className="text-blue-600 border-blue-200">{draft.structureSubType}</Badge>}
              {draft.stage && <Badge variant="outline" className="text-indigo-600 border-indigo-200">{draft.stage}</Badge>}
            </div>
            <Field label="Item of Work" required>
              <div className="grid grid-cols-2 gap-2">
                {STRUCTURE_ITEMS.map((item) => (
                  <button
                    key={item}
                    onClick={() => updateDraft("itemOfWork", item)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      draft.itemOfWork === item
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-blue-300"
                    }`}
                    data-testid={`button-item-${item.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p className={`text-sm font-medium ${draft.itemOfWork === item ? "text-blue-800" : "text-slate-700"}`}>{item}</p>
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <Input type="number" step="0.01" placeholder="0" value={draft.quantity} onChange={(e) => updateDraft("quantity", e.target.value)} data-testid="input-struct-qty" />
              </Field>
              <Field label="UOM">
                <Select value={draft.uom} onValueChange={(v) => updateDraft("uom", v)}>
                  <SelectTrigger data-testid="select-struct-uom">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Remarks (optional)">
              <Input placeholder="Any notes for this item…" value={draft.remarks} onChange={(e) => updateDraft("remarks", e.target.value)} data-testid="input-struct-item-remarks" />
            </Field>
            <Button
              variant="outline"
              className="w-full border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
              onClick={addAnotherItem}
              disabled={!draft.structureType || !draft.itemOfWork}
              data-testid="button-add-another-structure-item"
            >
              <Plus className="w-4 h-4 mr-2" /> Save & Add Another Structure Item
            </Button>
          </div>
        )}

        {/* ── Step 6: Labour ──────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Labour</h3>
            <p className="text-sm text-slate-500">Record manpower deployed at the structure today.</p>
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
                  <Input placeholder="e.g. Concrete pouring, Shuttering…" value={row.task} onChange={(e) => updateLabour(i, "task", e.target.value)} data-testid={`input-labour-task-${i}`} />
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

        {/* ── Step 7: Equipment ────────────────────────────────── */}
        {step === 7 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Equipment</h3>
            <p className="text-sm text-slate-500">Log machinery used at the structure today.</p>
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
                  {(equipmentMasters as any[]).length > 0 ? (
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
                  <Input placeholder="e.g. Concrete mixing, Excavation" value={row.task} onChange={(e) => updateEquip(i, "task", e.target.value)} data-testid={`input-equip-task-${i}`} />
                </Field>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed" onClick={() => setEquipment((rows) => [...rows, emptyEquip()])} data-testid="button-add-equipment">
              <Plus className="w-4 h-4 mr-2" /> Add Equipment
            </Button>
          </div>
        )}

        {/* ── Step 8: Materials ────────────────────────────────── */}
        {step === 8 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Materials</h3>
            <p className="text-sm text-slate-500">Log materials received or issued at the structure.</p>
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
                    <Input placeholder="e.g. Cement, Steel, Sand…" value={row.material} onChange={(e) => updateMat(i, "material", e.target.value)} data-testid={`input-mat-name-${i}`} />
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

        {/* ── Step 9: Review & Submit ─────────────────────────── */}
        {step === 9 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Review & Submit</h3>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-600" /><span className="text-sm font-semibold text-blue-900">Structure Works DPR</span></div>
              <p className="text-sm text-blue-800"><span className="font-medium">Site:</span> {site}</p>
              <p className="text-sm text-blue-800"><span className="font-medium">Date:</span> {date}</p>
              <p className="text-sm text-blue-800"><span className="font-medium">Engineer:</span> {engineer}</p>
            </div>

            {/* Structure items summary */}
            {(structureItems.length > 0 || (draft.structureType && draft.itemOfWork)) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Structure Items</p>
                <div className="space-y-2">
                  {[...structureItems, ...(draft.structureType && draft.itemOfWork && !structureItems.find(it => it.structureType === draft.structureType && it.itemOfWork === draft.itemOfWork) ? [draft] : [])].map((it, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-700">
                        <span className="font-medium">{it.structureType}</span>
                        {it.structureSubType ? ` › ${it.structureSubType}` : ""}
                        {it.structureName ? ` (${it.structureName})` : ""}
                        {it.stage ? ` — ${it.stage}` : ""}
                        {" "}<span className="text-blue-700">{it.itemOfWork}</span>
                        {it.quantity ? ` · ${it.quantity} ${it.uom}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
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
                data-testid="textarea-struct-remarks"
              />
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              data-testid="button-submit-structure-dpr"
            >
              {submitMutation.isPending ? "Submitting…" : "Submit Structure DPR"}
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
            <Button variant="ghost" onClick={() => setLocation("/site/hub")} className="flex-1" data-testid="button-cancel-struct-dpr">
              <ArrowLeft className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
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
