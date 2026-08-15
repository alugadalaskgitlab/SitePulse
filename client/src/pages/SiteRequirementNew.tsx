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
import { resolveBoqUomProfile } from "@/lib/dprUom";
import { calculateLengthFromChainage, calculateDprQuantity } from "@/lib/dprCalculations";
import {
  ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2, Send,
  HardHat, Package, Wrench, Users, AlertTriangle, ClipboardList,
} from "lucide-react";
import { EXECUTION_STATE_COLORS } from "@shared/executionState";
import { executionArrangementCategoryForItem } from "@shared/planningEngine";
import { useProjectArrangements } from "@/components/ExecutionStateBadge";
import { derivePlannedWorkExecutionState, type PlannedWorkBar } from "@/lib/plannedWorkArrangement";
import { newLineKey } from "@shared/requirementFulfilment";
import { buildPlannedWork, getPlannedActivities } from "@shared/plannedWork";

type SiteBoqItem = { id: number; description: string; itemCode: string | null; itemName: string | null; unit: string; dprConversionFactor: number | null; categoryName?: string | null; sortOrder?: number | null; dprMeasurementMethod?: string | null };

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

// 06F: every NEW line gets a stable client-generated lineKey (once, at row
// creation). It survives reorder/save/reopen; legacy rows without one stay as-is.
type MaterialLine = { lineKey?: string; materialName: string; qty: string; uom: string; requiredBy: string; sourcePreference: string; urgency: string };
type EquipmentLine = { lineKey?: string; equipmentType: string; numberRequired: string; requiredFromTime: string; expectedDuration: string; operatorRequired: boolean };
type LabourLine = { lineKey?: string; labourType: string; count: string; skilledType: string; requiredFromTime: string };
type ImmediateLine = { lineKey?: string; description: string; category: string; urgency: string; reason: string };

function emptyMaterial(): MaterialLine {
  return { lineKey: newLineKey(), materialName: "", qty: "", uom: "", requiredBy: TOMORROW, sourcePreference: "store", urgency: "normal" };
}
function emptyEquipment(): EquipmentLine {
  return { lineKey: newLineKey(), equipmentType: "", numberRequired: "1", requiredFromTime: "07:00", expectedDuration: "", operatorRequired: false };
}
function emptyLabour(): LabourLine {
  return { lineKey: newLineKey(), labourType: "", count: "", skilledType: "skilled", requiredFromTime: "07:00" };
}
function emptyImmediate(): ImmediateLine {
  return { lineKey: newLineKey(), description: "", category: "material", urgency: "urgent", reason: "" };
}

// 06N: repeatable planned-work activity row (form state — strings for inputs).
type PwActivityLine = {
  key: string;
  activity: string;
  boqItemId: number | null;
  programmeBarId: number | null;
  side: string;
  chainageFrom: string;
  chainageTo: string;
  /** Legacy free-text chainage from very old plans — preserved verbatim on
   *  save unless the user enters numeric From/To values. Never fed into the
   *  numeric chainage inputs (parseFloat would corrupt "5+200 to 5+800"). */
  legacyChainage: string;
  pwLength: string;
  pwWidth: string;
  pwThickness: string;
  plannedQty: string;
  plannedUom: string;
  pwRemarks: string;
};
function emptyPwActivity(): PwActivityLine {
  return {
    key: newLineKey(), activity: "", boqItemId: null, programmeBarId: null, side: "",
    chainageFrom: "", chainageTo: "", legacyChainage: "", pwLength: "", pwWidth: "", pwThickness: "",
    plannedQty: "", plannedUom: "", pwRemarks: "",
  };
}
function pwActivityHasContent(a: PwActivityLine): boolean {
  return Boolean(a.activity || a.boqItemId != null || a.chainageFrom || a.chainageTo || a.legacyChainage || a.plannedQty || a.pwRemarks);
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

// 06N: one repeatable planned-activity card. Owns exactly the per-activity
// logic the old single-activity section had — BOQ UoM profile, arrangement
// execution-state badge, chainage→L auto-fill, L/W/T→qty auto-calc — so
// each row resolves its BOQ item/programme independently.
function PlannedActivityCard({ act, index, showHeader, canRemove, onPatch, onRemove, siteBoqItems, siteBoqProjectId, projArrangements, projAllocations, projBars, onAutoQty, onArrangementWarning }: {
  act: PwActivityLine;
  index: number;
  showHeader: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<PwActivityLine>) => void;
  onRemove: () => void;
  siteBoqItems: SiteBoqItem[];
  siteBoqProjectId: number | null;
  projArrangements: any[];
  projAllocations: any[];
  projBars: PlannedWorkBar[];
  onAutoQty?: (qtyStr: string) => void;
  onArrangementWarning?: (warn: boolean) => void;
}) {
  const selectedBoqItem = useMemo(() => siteBoqItems.find(it => it.id === act.boqItemId) ?? null, [siteBoqItems, act.boqItemId]);
  const pwBoqProfile = useMemo(() => selectedBoqItem ? resolveBoqUomProfile(selectedBoqItem) : null, [selectedBoqItem]);
  const itemArrangementEligible = useMemo(() => {
    if (!selectedBoqItem) return false;
    try { return executionArrangementCategoryForItem(selectedBoqItem as any) != null; } catch { return false; }
  }, [selectedBoqItem]);
  const plannedWorkExecState = useMemo(() => {
    if (!selectedBoqItem || !itemArrangementEligible) return null;
    return derivePlannedWorkExecutionState({
      item: selectedBoqItem as any,
      chainageFrom: act.chainageFrom !== "" ? parseFloat(act.chainageFrom) : null,
      chainageTo: act.chainageTo !== "" ? parseFloat(act.chainageTo) : null,
      plannedQty: act.plannedQty !== "" ? parseFloat(act.plannedQty) : null,
      arrangements: projArrangements,
      allocations: projAllocations,
      bars: projBars,
    });
  }, [selectedBoqItem, itemArrangementEligible, act.chainageFrom, act.chainageTo, act.plannedQty, projArrangements, projAllocations, projBars]);
  const arrangementWarning = plannedWorkExecState?.state === "arrangement_required";
  useEffect(() => {
    onArrangementWarning?.(arrangementWarning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangementWarning]);
  const showWidth = !pwBoqProfile || pwBoqProfile.dims.includes("W");
  const showThickness = !pwBoqProfile || pwBoqProfile.dims.includes("T");

  // Auto-set L (m) from chainage using the same shared parser DPR uses
  useEffect(() => {
    const l = calculateLengthFromChainage(act.chainageFrom, act.chainageTo);
    if (l !== null) onPatch({ pwLength: String(Math.round(l)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.chainageFrom, act.chainageTo]);

  // Auto-calculate planned qty using the same shared calculateDprQuantity DPR uses —
  // identical code path guarantees identical numbers for the same inputs in both forms.
  useEffect(() => {
    const l = parseFloat(act.pwLength);
    if (isNaN(l) || l <= 0) return;
    const w = parseFloat(act.pwWidth) || null;
    const t = parseFloat(act.pwThickness) || null;
    const qty = calculateDprQuantity(l, w ?? undefined, t ?? undefined, selectedBoqItem);
    if (qty !== null) {
      const qtyStr = String(Math.round(qty * 1000) / 1000);
      onPatch({ plannedQty: qtyStr });
      onAutoQty?.(qtyStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.pwLength, act.pwWidth, act.pwThickness, selectedBoqItem]);

  const tid = (base: string) => index === 0 ? base : `${base}-${index}`;

  return (
    <div className={showHeader ? "bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-3 relative" : "space-y-3 relative"} data-testid={`planned-activity-${index}`}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-orange-500 uppercase tracking-wider">Activity {index + 1}</p>
          {canRemove && (
            <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500" data-testid={`remove-activity-${index}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
          {siteBoqItems.length > 0 ? "BOQ Item / Activity" : "Activity"}
        </label>
        {siteBoqItems.length > 0 ? (
          <BillItemPicker
            items={siteBoqItems}
            value={act.boqItemId}
            stacked
            labels={false}
            testidPrefix={index === 0 ? "req-activity" : `req-activity-${index}`}
            reviewPath={siteBoqProjectId ? `/work-program/${siteBoqProjectId}/item-review` : undefined}
            onChange={(id, it) => {
              onPatch({
                boqItemId: id,
                activity: it ? it.description : "",
                ...(it ? { plannedUom: canonicalizeUnit(it.unit ?? "") } : {}),
                pwWidth: "",
                pwThickness: "",
              });
            }}
          />
        ) : (
          <Input value={act.activity} onChange={e => onPatch({ activity: e.target.value })} placeholder="e.g. Earthwork excavation, WMM layer..." className="text-sm" data-testid={tid("input-activity")} />
        )}
        {/* Instruction 030 Part C: inline execution-state badge (informational only) */}
        {plannedWorkExecState && (
          <span
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded border px-1.5 py-0.5 ${EXECUTION_STATE_COLORS[plannedWorkExecState.state].bg} ${EXECUTION_STATE_COLORS[plannedWorkExecState.state].border} ${EXECUTION_STATE_COLORS[plannedWorkExecState.state].text}`}
            data-testid={tid("badge-planned-work-exec-state")}
          >
            {arrangementWarning && <AlertTriangle className="w-3 h-3" />}
            {plannedWorkExecState.badge}
          </span>
        )}
      </div>
      {/* Legacy free-text chainage (old plans): shown verbatim, kept on save
          unless numeric From/To values are entered below. */}
      {act.legacyChainage && (
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid={tid("text-legacy-chainage")}>
          Chainage (as originally entered): <span className="font-medium">{act.legacyChainage}</span>
        </p>
      )}
      {/* Field grid: Side → Ch.From → Ch.To → L(m) → W(m) → T(m) → UOM → Qty — same order as DPR */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Side</label>
          <Select value={act.side} onValueChange={v => onPatch({ side: v })}>
            <SelectTrigger className="text-sm" data-testid={tid("select-side")}>
              <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
              {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">From (Ch.)</label>
          <Input value={act.chainageFrom} onChange={e => onPatch({ chainageFrom: e.target.value })} placeholder="5.000" type="number" step="0.001" className="text-sm" data-testid={tid("input-chainage-from")} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">To (Ch.)</label>
          <Input value={act.chainageTo} onChange={e => onPatch({ chainageTo: e.target.value })} placeholder="5.500" type="number" step="0.001" className="text-sm" data-testid={tid("input-chainage-to")} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">L (m)</label>
          <Input value={act.pwLength} onChange={e => onPatch({ pwLength: e.target.value })} type="number" step="0.01" placeholder="0" className="text-sm" data-testid={tid("input-pw-length")} />
        </div>
        {showWidth && (
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">W (m)</label>
            <Input value={act.pwWidth} onChange={e => onPatch({ pwWidth: e.target.value })} type="number" step="0.01" min="0" placeholder="0" className="text-sm" data-testid={tid("input-pw-width")} />
          </div>
        )}
        {showThickness && (
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">T (m)</label>
            <Input value={act.pwThickness} onChange={e => onPatch({ pwThickness: e.target.value })} type="number" step="0.001" min="0" placeholder="0" className="text-sm" data-testid={tid("input-pw-thickness")} />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
            UOM
            {act.boqItemId != null && !!act.plannedUom && (
              <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>
            )}
          </label>
          <Select value={act.plannedUom} disabled={act.boqItemId != null && !!act.plannedUom} onValueChange={v => onPatch({ plannedUom: v })}>
            <SelectTrigger className="text-sm" data-testid={tid("select-planned-uom")}>
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
            {!!act.plannedQty && <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>}
          </label>
          <Input value={act.plannedQty} onChange={e => onPatch({ plannedQty: e.target.value })} type="number" placeholder="0" className="text-sm" data-testid={tid("input-planned-qty")} />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Remarks</label>
        <Textarea value={act.pwRemarks} onChange={e => onPatch({ pwRemarks: e.target.value })} placeholder="Any notes about tomorrow's plan..." className="text-sm resize-none" rows={2} data-testid={tid("input-pw-remarks")} />
      </div>
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
  // 06F: programmeBarId is persisted ONLY when the requirement is created
  // from a genuinely known programme bar (?barId=), or when editing a record
  // that already carries one. Never inferred from text/chainage matching.
  const barIdParam = new URLSearchParams(search).get("barId");
  const knownBarIdRef = useRef<number | null>(barIdParam ? parseInt(barIdParam) || null : null);

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

  // Section A — Planned work. 06N: repeatable activity rows; one blank row by
  // default so the single-activity experience is unchanged.
  const [pwActivities, setPwActivities] = useState<PwActivityLine[]>([emptyPwActivity()]);
  const patchPwActivity = (key: string, patch: Partial<PwActivityLine>) =>
    setPwActivities(prev => prev.map(a => a.key === key ? { ...a, ...patch } : a));
  const addPwActivity = () => setPwActivities(prev => [...prev, emptyPwActivity()]);
  const removePwActivity = (key: string) =>
    setPwActivities(prev => {
      const next = prev.filter(a => a.key !== key);
      return next.length > 0 ? next : [emptyPwActivity()];
    });
  const firstPlannedQty = pwActivities[0]?.plannedQty ?? "";

  // 06N: cards report their arrangement-required state up so the plan-level
  // submit banner shows when ANY activity needs an arrangement decision.
  const [warnKeys, setWarnKeys] = useState<Record<string, boolean>>({});
  const reportArrangementWarning = (key: string, warn: boolean) =>
    setWarnKeys(prev => (prev[key] === warn ? prev : { ...prev, [key]: warn }));
  const arrangementWarning = pwActivities.some(a => warnKeys[a.key]);

  // ── Instruction 030 Part C: arrangement awareness (non-blocking) ────────────
  // Queries stay plan-level (one fetch); eligibility is true when ANY activity
  // row has an arrangement-eligible BOQ item selected.
  const selectedArrangementEligible = useMemo(() => {
    return pwActivities.some(a => {
      const it = siteBoqItems.find(i => i.id === a.boqItemId);
      if (!it) return false;
      try { return executionArrangementCategoryForItem(it as any) != null; } catch { return false; }
    });
  }, [pwActivities, siteBoqItems]);
  const { arrangements: projArrangements, allocations: projAllocations } = useProjectArrangements(
    siteBoqProjectId ?? 0,
    selectedArrangementEligible && siteBoqProjectId != null,
  );
  const { data: projBars = [] } = useQuery<PlannedWorkBar[]>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/programme`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: selectedArrangementEligible && siteBoqProjectId != null,
    staleTime: 30_000,
  });
  // 06N: qty auto-calc from activity #1 still seeds empty material qtys —
  // unchanged behavior; additional activities never touch materials.
  const handleFirstActivityAutoQty = (qtyStr: string) => {
    setMaterials(prev => prev.map(m => m.qty === "" ? { ...m, qty: qtyStr } : m));
  };

  // Prefill from existing requirement when editing
  const prefillDone = useRef(false);
  useEffect(() => {
    if (!existingReq || prefillDone.current) return;
    prefillDone.current = true;
    setDate(existingReq.date ?? TOMORROW);
    setSiteId(existingReq.siteId ? String(existingReq.siteId) : "");
    const acts = getPlannedActivities(existingReq.plannedWork);
    if (acts.length > 0) {
      if (acts[0].programmeBarId != null) knownBarIdRef.current = acts[0].programmeBarId;
      setPwActivities(acts.map(a => ({
        key: newLineKey(),
        activity: a.activity ?? "",
        boqItemId: a.boqItemId ?? null,
        programmeBarId: a.programmeBarId ?? null,
        // Backward-compat: old records have a single `chainage` text field; new
        // ones have chainageFrom/chainageTo numbers. Legacy text is preserved
        // separately — never pushed into the numeric inputs.
        chainageFrom: a.chainageFrom != null ? String(a.chainageFrom) : "",
        chainageTo: a.chainageTo != null ? String(a.chainageTo) : "",
        legacyChainage: a.chainageFrom == null && a.chainageTo == null ? (a.chainage ?? "") : "",
        plannedQty: a.plannedQty != null ? String(a.plannedQty) : "",
        plannedUom: a.plannedUom ?? "",
        pwRemarks: a.remarks ?? "",
        pwWidth: a.pwWidth != null ? String(a.pwWidth) : "",
        pwThickness: a.pwThickness != null ? String(a.pwThickness) : "",
        pwLength: a.pwLength != null ? String(a.pwLength) : "",
        side: a.side ?? "",
      })));
    }
    if (existingReq.materials?.length) setMaterials(existingReq.materials);
    if (existingReq.equipment?.length) setEquipment(existingReq.equipment);
    if (existingReq.labour?.length) setLabour(existingReq.labour);
    if (existingReq.immediateRequirements?.length) setImmediate(existingReq.immediateRequirements);
  }, [existingReq]);

  // Section B — Materials
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const addMaterial = () => setMaterials(p => [...p, { ...emptyMaterial(), qty: firstPlannedQty || "" }]);
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
      // 06N: build one persisted object per meaningful activity row. Activity
      // #1 keeps the 06F programmeBarId rule (?barId= or pre-existing value);
      // additional rows keep only a bar id they were loaded with.
      const activityObjects = pwActivities.filter(pwActivityHasContent).map((a, i) => ({
        activity: a.activity,
        boqItemId: a.boqItemId,
        chainageFrom: a.chainageFrom !== "" ? parseFloat(a.chainageFrom) : null,
        chainageTo: a.chainageTo !== "" ? parseFloat(a.chainageTo) : null,
        // Legacy free-text chainage survives an edit round-trip verbatim
        // unless the user filled the numeric From/To fields.
        ...(a.legacyChainage && a.chainageFrom === "" && a.chainageTo === ""
          ? { chainage: a.legacyChainage } : {}),
        programmeBarId: i === 0 ? knownBarIdRef.current : (a.programmeBarId ?? null),
        side: a.side || undefined,
        pwLength: a.pwLength ? parseFloat(a.pwLength) : null,
        pwWidth: a.pwWidth !== "" ? parseFloat(a.pwWidth) : null,
        pwThickness: a.pwThickness !== "" ? parseFloat(a.pwThickness) : null,
        plannedQty: a.plannedQty, plannedUom: a.plannedUom, remarks: a.pwRemarks,
      }));
      const builtPlannedWork = buildPlannedWork(activityObjects as any);
      if (builtPlannedWork) body.plannedWork = builtPlannedWork;
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
    : (pwActivities.some(pwActivityHasContent) ||
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
            {pwActivities.map((act, i) => (
              <PlannedActivityCard
                key={act.key}
                act={act}
                index={i}
                showHeader={pwActivities.length > 1}
                canRemove={pwActivities.length > 1 || pwActivityHasContent(act)}
                onPatch={(patch) => patchPwActivity(act.key, patch)}
                onRemove={() => removePwActivity(act.key)}
                siteBoqItems={siteBoqItems}
                siteBoqProjectId={siteBoqProjectId}
                projArrangements={projArrangements}
                projAllocations={projAllocations}
                projBars={projBars}
                onAutoQty={i === 0 ? handleFirstActivityAutoQty : undefined}
                onArrangementWarning={(warn) => reportArrangementWarning(act.key, warn)}
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addPwActivity} className="w-full border-dashed" data-testid="button-add-activity">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Activity
            </Button>
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
          {/* Instruction 030 Part C: non-blocking arrangement warning — never blocks submission */}
          {arrangementWarning && !isImmediateMode && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="banner-arrangement-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>Execution arrangement not yet decided</b> for this stretch of the selected BOQ item.
                You can still submit — the PM will see the same warning during review.
              </span>
            </div>
          )}
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
