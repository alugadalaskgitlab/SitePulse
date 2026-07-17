import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BillItemPicker } from "@/components/BillItemPicker";
import { canonicalizeUnit } from "@shared/boqNormalise";
import {
  ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2, Send,
  HardHat, Package, Wrench, Users, AlertTriangle, ClipboardList,
} from "lucide-react";

type SiteBoqItem = { id: number; description: string; itemCode: string | null; itemName: string | null; unit: string; dprConversionFactor: number | null; categoryName?: string | null; sortOrder?: number | null };

const TOMORROW = format(addDays(new Date(), 1), "yyyy-MM-dd");

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"] as const;
const PLANNED_UOM_OPTIONS = ["Cum", "Sqm", "Rmt", "MT", "Nos", "LS"];
const URGENCY_OPTIONS = ["normal", "urgent", "immediate"] as const;
const SOURCE_OPTIONS = ["store", "purchase", "plant", "local_purchase"] as const;
const SKILLED_OPTIONS = ["skilled", "unskilled", "mason", "helper", "operator", "driver", "other"] as const;
const CATEGORY_OPTIONS = ["material", "equipment", "labour", "other"] as const;
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted", approved: "Approved", arranged: "Arranged",
  sent_store: "Sent to Store", sent_purchase: "Sent to Purchase",
  sent_plant: "Sent to Plant", rejected: "Rejected", clarification: "Need Clarification",
};

type MaterialLine = { materialName: string; qty: string; uom: string; requiredBy: string; sourcePreference: string; urgency: string };
type EquipmentLine = { equipmentType: string; numberRequired: string; requiredFromTime: string; expectedDuration: string; operatorRequired: boolean };
type LabourLine = { labourType: string; count: string; skilledType: string; requiredFromTime: string };
type ImmediateLine = { description: string; category: string; urgency: string; reason: string };

function emptyMaterial(): MaterialLine {
  return { materialName: "", qty: "", uom: "", requiredBy: TOMORROW, sourcePreference: "store", urgency: "normal" };
}
function emptyEquipment(): EquipmentLine {
  return { equipmentType: "", numberRequired: "1", requiredFromTime: "07:00", expectedDuration: "", operatorRequired: false };
}
function emptyLabour(): LabourLine {
  return { labourType: "", count: "", skilledType: "skilled", requiredFromTime: "07:00" };
}
function emptyImmediate(): ImmediateLine {
  return { description: "", category: "material", urgency: "urgent", reason: "" };
}

function Section({ title, icon: Icon, color, open, onToggle, children }: {
  title: string; icon: any; color: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800">{children}</div>}
    </div>
  );
}

export default function SiteRequirementNew() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const returnTo = new URLSearchParams(search).get("returnTo") || "/site";
  const mode = new URLSearchParams(search).get("mode");
  const editId = new URLSearchParams(search).get("editId");
  const isImmediateMode = mode === "immediate";
  const isEditMode = !!editId;

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const { data: existingReq } = useQuery<any>({
    queryKey: [`/api/site-requirements/${editId}`],
    enabled: isEditMode,
  });

  const [date, setDate] = useState(isImmediateMode ? format(new Date(), "yyyy-MM-dd") : TOMORROW);
  const [siteId, setSiteId] = useState<string>("");

  // Fetch BOQ projects and items for the selected site — reuses same pattern as SiteEntry.tsx
  const { data: siteBoqProjects = [] } = useQuery<Array<{ id: number; name: string; status?: string; barCount?: number }>>({
    queryKey: ["/api/boq/projects", siteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteId,
  });
  const siteBoqProjectId = useMemo(() => {
    if (!siteBoqProjects.length) return null;
    const activeWithBars = siteBoqProjects.find((p) => p.status === "active" && (p.barCount ?? 0) > 0);
    if (activeWithBars) return activeWithBars.id;
    const active = siteBoqProjects.find((p) => p.status === "active");
    return active?.id ?? siteBoqProjects[0].id;
  }, [siteBoqProjects]);
  const { data: siteBoqItems = [] } = useQuery<SiteBoqItem[]>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/items`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteBoqProjectId,
  });

  // Section open state — immediate mode auto-opens Section E only
  const [openSections, setOpenSections] = useState({
    plannedWork: !isImmediateMode,
    materials: false,
    equipment: false,
    labour: false,
    immediate: isImmediateMode,
  });
  const toggleSection = (s: keyof typeof openSections) =>
    setOpenSections(prev => ({ ...prev, [s]: !prev[s] }));

  // Section A — Planned work
  const [activity, setActivity] = useState("");
  const [side, setSide] = useState("");
  const [pwLength, setPwLength] = useState(""); // L (m) — auto-set from chainage, manually editable
  const [boqItemId, setBoqItemId] = useState<number | null>(null);
  const [chainageFrom, setChainageFrom] = useState("");
  const [chainageTo, setChainageTo] = useState("");
  const [pwWidth, setPwWidth] = useState("");
  const [pwThickness, setPwThickness] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [plannedUom, setPlannedUom] = useState("");
  const [pwRemarks, setPwRemarks] = useState("");

  // Derived from selected BOQ item unit — determines which dimension fields to show
  const selectedBoqItem = useMemo(() => siteBoqItems.find(it => it.id === boqItemId) ?? null, [siteBoqItems, boqItemId]);
  const itemUnit = useMemo(() => selectedBoqItem ? canonicalizeUnit(selectedBoqItem.unit ?? "") : "", [selectedBoqItem]);
  const showWidth = itemUnit === "Cum" || itemUnit === "Sqm";
  const showThickness = itemUnit === "Cum";

  // Auto-set L (m) when both chainage values are present
  useEffect(() => {
    const cf = parseFloat(chainageFrom);
    const ct = parseFloat(chainageTo);
    if (!isNaN(cf) && !isNaN(ct) && cf !== ct) {
      setPwLength(String(Math.round(Math.abs(ct - cf) * 1000)));
    }
  }, [chainageFrom, chainageTo]);

  // Auto-calculate planned qty from L × W × T (or L × W, or L) depending on unit
  useEffect(() => {
    const l = parseFloat(pwLength);
    if (isNaN(l) || l <= 0) return;
    const w = parseFloat(pwWidth);
    const t = parseFloat(pwThickness);
    let qty: number | null = null;
    if (itemUnit === "Cum" && !isNaN(w) && w > 0 && !isNaN(t) && t > 0) {
      qty = l * w * t;
    } else if (itemUnit === "Sqm" && !isNaN(w) && w > 0) {
      qty = l * w;
    } else if (itemUnit === "Rmt") {
      qty = l;
    }
    if (qty !== null) {
      const qtyStr = String(Math.round(qty * 1000) / 1000);
      setPlannedQty(qtyStr);
      setMaterials(prev => prev.map(m => m.qty === "" ? { ...m, qty: qtyStr } : m));
    }
  }, [pwLength, pwWidth, pwThickness, itemUnit]);

  // Prefill from existing requirement when editing
  const prefillDone = useRef(false);
  useEffect(() => {
    if (!existingReq || prefillDone.current) return;
    prefillDone.current = true;
    setDate(existingReq.date ?? TOMORROW);
    setSiteId(existingReq.siteId ? String(existingReq.siteId) : "");
    if (existingReq.plannedWork) {
      setActivity(existingReq.plannedWork.activity ?? "");
      setBoqItemId(existingReq.plannedWork.boqItemId ?? null);
      // Backward-compat: old records have a single `chainage` text field; new ones have chainageFrom/chainageTo numbers
      setChainageFrom(existingReq.plannedWork.chainageFrom != null ? String(existingReq.plannedWork.chainageFrom) : (existingReq.plannedWork.chainage ?? ""));
      setChainageTo(existingReq.plannedWork.chainageTo != null ? String(existingReq.plannedWork.chainageTo) : "");
      setPlannedQty(existingReq.plannedWork.plannedQty ?? "");
      setPlannedUom(existingReq.plannedWork.plannedUom ?? "");
      setPwRemarks(existingReq.plannedWork.remarks ?? "");
      setPwWidth(existingReq.plannedWork.pwWidth != null ? String(existingReq.plannedWork.pwWidth) : "");
      setPwThickness(existingReq.plannedWork.pwThickness != null ? String(existingReq.plannedWork.pwThickness) : "");
      setPwLength(existingReq.plannedWork.pwLength != null ? String(existingReq.plannedWork.pwLength) : "");
      setSide(existingReq.plannedWork.side ?? "");
    }
    if (existingReq.materials?.length) setMaterials(existingReq.materials);
    if (existingReq.equipment?.length) setEquipment(existingReq.equipment);
    if (existingReq.labour?.length) setLabour(existingReq.labour);
    if (existingReq.immediateRequirements?.length) setImmediate(existingReq.immediateRequirements);
  }, [existingReq]);

  // Section B — Materials
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const addMaterial = () => setMaterials(p => [...p, { ...emptyMaterial(), qty: plannedQty || "" }]);
  const updateMaterial = (i: number, field: keyof MaterialLine, val: string) =>
    setMaterials(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const removeMaterial = (i: number) => setMaterials(p => p.filter((_, idx) => idx !== i));

  // Section C — Equipment
  const [equipment, setEquipment] = useState<EquipmentLine[]>([]);
  const addEquipment = () => setEquipment(p => [...p, emptyEquipment()]);
  const updateEquipment = (i: number, field: keyof EquipmentLine, val: any) =>
    setEquipment(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const removeEquipment = (i: number) => setEquipment(p => p.filter((_, idx) => idx !== i));

  // Section D — Labour
  const [labour, setLabour] = useState<LabourLine[]>([]);
  const addLabour = () => setLabour(p => [...p, emptyLabour()]);
  const updateLabour = (i: number, field: keyof LabourLine, val: string) =>
    setLabour(p => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const removeLabour = (i: number) => setLabour(p => p.filter((_, idx) => idx !== i));

  // Section E — Immediate
  const [immediate, setImmediate] = useState<ImmediateLine[]>([]);
  const addImmediate = () => setImmediate(p => [...p, emptyImmediate()]);
  const updateImmediate = (i: number, field: keyof ImmediateLine, val: string) =>
    setImmediate(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const removeImmediate = (i: number) => setImmediate(p => p.filter((_, idx) => idx !== i));

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: any = {};
      const chFrom = chainageFrom !== "" ? parseFloat(chainageFrom) : null;
      const chTo = chainageTo !== "" ? parseFloat(chainageTo) : null;
      if (activity || boqItemId != null || chFrom != null || chTo != null || plannedQty || pwRemarks) {
        body.plannedWork = {
          activity, boqItemId, chainageFrom: chFrom, chainageTo: chTo,
          side: side || undefined,
          pwLength: pwLength ? parseFloat(pwLength) : null,
          pwWidth: pwWidth !== "" ? parseFloat(pwWidth) : null,
          pwThickness: pwThickness !== "" ? parseFloat(pwThickness) : null,
          plannedQty, plannedUom, remarks: pwRemarks,
        };
      }
      const filteredMaterials = materials.filter(m => m.materialName);
      const filteredEquipment = equipment.filter(e => e.equipmentType);
      const filteredLabour = labour.filter(l => l.labourType);
      const filteredImmediate = immediate.filter(i => i.description);
      if (filteredMaterials.length > 0) body.materials = filteredMaterials;
      if (filteredEquipment.length > 0) body.equipment = filteredEquipment;
      if (filteredLabour.length > 0) body.labour = filteredLabour;
      if (filteredImmediate.length > 0) body.immediateRequirements = filteredImmediate;

      if (isEditMode) {
        return apiRequest("PUT", `/api/site-requirements/${editId}`, body);
      }
      // New submission — include identity and date/site
      body.date = date;
      body.siteId = siteId ? parseInt(siteId) : null;
      return apiRequest("POST", "/api/site-requirements", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      if (editId) {
        queryClient.invalidateQueries({ queryKey: [`/api/site-requirements/${editId}`] });
      }
      toast({
        title: isEditMode ? "Requirement revised" : "Requirement submitted",
        description: isEditMode
          ? "Your revision has been saved. PM/Admin has been notified."
          : isImmediateMode
            ? "Your immediate requirement has been raised."
            : "Your tomorrow's plan has been sent to the PM.",
      });
      setLocation(returnTo);
    },
    onError: (err: any) => {
      toast({ title: isEditMode ? "Failed to save revision" : "Failed to submit", description: err.message, variant: "destructive" });
    },
  });

  const hasAnyContent = isImmediateMode
    ? immediate.some(i => i.description)
    : (activity || boqItemId != null || chainageFrom || chainageTo || plannedQty ||
       materials.some(m => m.materialName) ||
       equipment.some(e => e.equipmentType) ||
       labour.some(l => l.labourType) ||
       immediate.some(i => i.description));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setLocation(returnTo)}
          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isEditMode ? "Revise Requirement" : isImmediateMode ? "Immediate Requirement" : "Tomorrow's Requirement"}
          </h1>
          <p className="text-xs text-slate-400">
            {isEditMode
              ? "Update the details — you can add missed items or correct existing ones"
              : isImmediateMode
                ? "Raise an urgent site requirement now"
                : "Plan and request what you need for tomorrow"}
          </p>
        </div>
        {isEditMode && (
          <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">REVISION</span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">

        {/* Date + Site row */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 py-3 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">For Date</label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm"
              data-testid="input-date"
            />
          </div>
          {sites.length > 0 && (
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Site</label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger className="text-sm" data-testid="select-site">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Section A — Planned Work (hidden in immediate mode) */}
        {!isImmediateMode && <Section title="A. Tomorrow's Planned Work" icon={ClipboardList} color="bg-orange-500" open={openSections.plannedWork} onToggle={() => toggleSection("plannedWork")}>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                {siteBoqItems.length > 0 ? "BOQ Item" : "Activity / BOQ Item"}
              </label>
              {siteBoqItems.length > 0 ? (
                <BillItemPicker
                  items={siteBoqItems}
                  value={boqItemId}
                  stacked
                  labels={false}
                  testidPrefix="req-activity"
                  reviewPath={siteBoqProjectId ? `/work-program/${siteBoqProjectId}/item-review` : undefined}
                  onChange={(id, it) => {
                    setBoqItemId(id);
                    setActivity(it ? it.description : "");
                    if (it) setPlannedUom(canonicalizeUnit(it.unit ?? ""));
                    setPwWidth("");
                    setPwThickness("");
                  }}
                />
              ) : (
                <Input value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. Earthwork excavation, WMM layer..." className="text-sm" data-testid="input-activity" />
              )}
            </div>
            {/* Field grid: Side → Ch.From → Ch.To → L(m) → W(m) → T(m) → UOM → Qty — same order as DPR */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Side</label>
                <Select value={side} onValueChange={setSide}>
                  <SelectTrigger className="text-sm" data-testid="select-side">
                    <SelectValue placeholder="Side" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">From (Ch.)</label>
                <Input value={chainageFrom} onChange={e => setChainageFrom(e.target.value)} placeholder="5.000" type="number" step="0.001" className="text-sm" data-testid="input-chainage-from" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">To (Ch.)</label>
                <Input value={chainageTo} onChange={e => setChainageTo(e.target.value)} placeholder="5.500" type="number" step="0.001" className="text-sm" data-testid="input-chainage-to" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">L (m)</label>
                <Input value={pwLength} onChange={e => setPwLength(e.target.value)} type="number" step="0.01" placeholder="0" className="text-sm" data-testid="input-pw-length" />
              </div>
              {showWidth && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">W (m)</label>
                  <Input value={pwWidth} onChange={e => setPwWidth(e.target.value)} type="number" step="0.01" min="0" placeholder="0" className="text-sm" data-testid="input-pw-width" />
                </div>
              )}
              {showThickness && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">T (m)</label>
                  <Input value={pwThickness} onChange={e => setPwThickness(e.target.value)} type="number" step="0.001" min="0" placeholder="0" className="text-sm" data-testid="input-pw-thickness" />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  UOM
                  {boqItemId != null && !!plannedUom && (
                    <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>
                  )}
                </label>
                <Select value={plannedUom} disabled={boqItemId != null && !!plannedUom} onValueChange={setPlannedUom}>
                  <SelectTrigger className="text-sm" data-testid="select-planned-uom">
                    <SelectValue placeholder="UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANNED_UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  Qty
                  {!!plannedQty && <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>}
                </label>
                <Input value={plannedQty} onChange={e => setPlannedQty(e.target.value)} type="number" placeholder="0" className="text-sm" data-testid="input-planned-qty" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Remarks</label>
              <Textarea value={pwRemarks} onChange={e => setPwRemarks(e.target.value)} placeholder="Any notes about tomorrow's plan..." className="text-sm resize-none" rows={2} data-testid="input-pw-remarks" />
            </div>
          </div>
        </Section>}

        {/* Section B — Materials (hidden in immediate mode) */}
        {!isImmediateMode && <Section title="B. Material Requirement" icon={Package} color="bg-emerald-500" open={openSections.materials} onToggle={() => toggleSection("materials")}>
          <div className="space-y-3 mt-2">
            {materials.map((m, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2 relative" data-testid={`material-line-${i}`}>
                <button type="button" onClick={() => removeMaterial(i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500" data-testid={`remove-material-${i}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Material Name</label>
                  <Input value={m.materialName} onChange={e => updateMaterial(i, "materialName", e.target.value)} placeholder="e.g. Aggregate 20mm, Cement OPC 53" className="text-sm" data-testid={`input-material-name-${i}`} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Qty</label>
                    <Input value={m.qty} onChange={e => updateMaterial(i, "qty", e.target.value)} type="number" placeholder="0" className="text-sm" data-testid={`input-material-qty-${i}`} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Unit</label>
                    <Input value={m.uom} onChange={e => updateMaterial(i, "uom", e.target.value)} placeholder="MT" className="text-sm" data-testid={`input-material-uom-${i}`} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Required By</label>
                    <Input value={m.requiredBy} onChange={e => updateMaterial(i, "requiredBy", e.target.value)} type="date" className="text-sm" data-testid={`input-material-required-by-${i}`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Source</label>
                    <Select value={m.sourcePreference} onValueChange={v => updateMaterial(i, "sourcePreference", v)}>
                      <SelectTrigger className="text-sm" data-testid={`select-material-source-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Urgency</label>
                    <Select value={m.urgency} onValueChange={v => updateMaterial(i, "urgency", v)}>
                      <SelectTrigger className="text-sm" data-testid={`select-material-urgency-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {URGENCY_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addMaterial} className="w-full gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50" data-testid="button-add-material">
              <Plus className="w-3.5 h-3.5" /> Add Material
            </Button>
          </div>
        </Section>}

        {/* Section C — Equipment (hidden in immediate mode) */}
        {!isImmediateMode && <Section title="C. Equipment Requirement" icon={Wrench} color="bg-amber-500" open={openSections.equipment} onToggle={() => toggleSection("equipment")}>
          <div className="space-y-3 mt-2">
            {equipment.map((e, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2 relative" data-testid={`equipment-line-${i}`}>
                <button type="button" onClick={() => removeEquipment(i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500" data-testid={`remove-equipment-${i}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Equipment Type</label>
                  <Input value={e.equipmentType} onChange={v => updateEquipment(i, "equipmentType", v.target.value)} placeholder="e.g. JCB, Tipper, Paver, Roller" className="text-sm" data-testid={`input-equipment-type-${i}`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">No. Required</label>
                    <Input value={e.numberRequired} onChange={v => updateEquipment(i, "numberRequired", v.target.value)} type="number" min="1" className="text-sm" data-testid={`input-equipment-count-${i}`} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Required From</label>
                    <Input value={e.requiredFromTime} onChange={v => updateEquipment(i, "requiredFromTime", v.target.value)} type="time" className="text-sm" data-testid={`input-equipment-from-time-${i}`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Expected Duration</label>
                    <Input value={e.expectedDuration} onChange={v => updateEquipment(i, "expectedDuration", v.target.value)} placeholder="e.g. 4 hrs, full day" className="text-sm" data-testid={`input-equipment-duration-${i}`} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={e.operatorRequired}
                        onChange={v => updateEquipment(i, "operatorRequired", v.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                        data-testid={`checkbox-operator-${i}`}
                      />
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Operator required</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addEquipment} className="w-full gap-1 text-amber-600 border-amber-200 hover:bg-amber-50" data-testid="button-add-equipment">
              <Plus className="w-3.5 h-3.5" /> Add Equipment
            </Button>
          </div>
        </Section>}

        {/* Section D — Labour (hidden in immediate mode) */}
        {!isImmediateMode && <Section title="D. Labour Requirement" icon={Users} color="bg-teal-500" open={openSections.labour} onToggle={() => toggleSection("labour")}>
          <div className="space-y-3 mt-2">
            {labour.map((l, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2 relative" data-testid={`labour-line-${i}`}>
                <button type="button" onClick={() => removeLabour(i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500" data-testid={`remove-labour-${i}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Labour Type / Role</label>
                  <Input value={l.labourType} onChange={e => updateLabour(i, "labourType", e.target.value)} placeholder="e.g. Mason, Helper, Supervisor" className="text-sm" data-testid={`input-labour-type-${i}`} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Count</label>
                    <Input value={l.count} onChange={e => updateLabour(i, "count", e.target.value)} type="number" min="1" className="text-sm" data-testid={`input-labour-count-${i}`} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Skill Level</label>
                    <Select value={l.skilledType} onValueChange={v => updateLabour(i, "skilledType", v)}>
                      <SelectTrigger className="text-sm" data-testid={`select-labour-skill-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SKILLED_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Required From</label>
                    <Input value={l.requiredFromTime} onChange={e => updateLabour(i, "requiredFromTime", e.target.value)} type="time" className="text-sm" data-testid={`input-labour-from-time-${i}`} />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLabour} className="w-full gap-1 text-teal-600 border-teal-200 hover:bg-teal-50" data-testid="button-add-labour">
              <Plus className="w-3.5 h-3.5" /> Add Labour Requirement
            </Button>
          </div>
        </Section>}

        {/* Section E — Immediate (always visible; title simplified in immediate mode) */}
        <Section
          title={isImmediateMode ? "Immediate Site Requirement" : "E. Immediate Site Requirement"}
          icon={AlertTriangle} color="bg-red-500"
          open={openSections.immediate} onToggle={() => toggleSection("immediate")}>
          <div className="space-y-3 mt-2">
            {immediate.map((item, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2 relative" data-testid={`immediate-line-${i}`}>
                <button type="button" onClick={() => removeImmediate(i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500" data-testid={`remove-immediate-${i}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Description</label>
                  <Input value={item.description} onChange={e => updateImmediate(i, "description", e.target.value)} placeholder="Describe the requirement clearly" className="text-sm" data-testid={`input-immediate-desc-${i}`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Category</label>
                    <Select value={item.category} onValueChange={v => updateImmediate(i, "category", v)}>
                      <SelectTrigger className="text-sm" data-testid={`select-immediate-category-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Urgency</label>
                    <Select value={item.urgency} onValueChange={v => updateImmediate(i, "urgency", v)}>
                      <SelectTrigger className="text-sm" data-testid={`select-immediate-urgency-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {URGENCY_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Reason / Context</label>
                  <Textarea value={item.reason} onChange={e => updateImmediate(i, "reason", e.target.value)} placeholder="Why is this needed urgently?" className="text-sm resize-none" rows={2} data-testid={`input-immediate-reason-${i}`} />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addImmediate} className="w-full gap-1 text-red-600 border-red-200 hover:bg-red-50" data-testid="button-add-immediate">
              <Plus className="w-3.5 h-3.5" /> Add Immediate Requirement
            </Button>
          </div>
        </Section>

        {/* Submit */}
        <div className="pb-6">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasAnyContent || saveMutation.isPending}
            className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
            data-testid="button-submit-requirement"
          >
            {saveMutation.isPending ? (
              <span className="text-sm">{isEditMode ? "Saving revision..." : "Submitting..."}</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {isEditMode
                  ? "Save Revision"
                  : isImmediateMode
                    ? "Submit Immediate Requirement"
                    : "Submit Tomorrow's Requirement"}
              </>
            )}
          </Button>
          {!hasAnyContent && (
            <p className="text-xs text-slate-400 text-center mt-2">
              {isEditMode
                ? "Make at least one change before saving."
                : isImmediateMode
                  ? "Describe at least one immediate requirement before submitting."
                  : "Fill in at least one section before submitting."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
