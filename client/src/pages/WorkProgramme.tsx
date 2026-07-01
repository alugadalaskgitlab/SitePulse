import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Plus, Trash2,
  AlertTriangle, CheckCircle2, Loader2, CalendarDays,
  Scissors, BookOpen, ChevronDown, ChevronUp, Info,
  GanttChartSquare, TableProperties, ArrowLeftRight, Settings2, Sparkles,
  Undo2, Redo2, Upload, MapPin, Building2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  calculateStretchQty,
  calculateAutoDurationFull,
  calculateRequiredOutput,
  monthLabel,
  dateToMonthIndex,
  monthIndexToDate,
  formatDateForInput,
  fmtQty,
  WORKING_DAYS_DEFAULT,
  WORKING_HRS_DEFAULT,
  type EquipmentProductivity,
  type LayerConfig,
  type ProductivitySettings,
} from "@shared/planningEngine";
import { SEQUENCE_RULES } from "@shared/programmeSequencer";
import { shortItemName } from "@/lib/itemName";
import type {
  BoqProject,
  BoqItemWithCategory,
  WorkProgramBarWithItem,
  BoqItemEquipmentWithMaster,
} from "@shared/schema";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LEFT_W = 560;       // px left sticky panel
const MONTH_W_DEFAULT = 110; // px per month column (default, user-resizable)
const ROW_H = 52;         // px stretch row height (extra space for duration label below bar)
const ITEM_H = 42;        // px item header row height
const CAT_H = 28;         // px category row height
const MIN_COL_W = 55;     // minimum column width when resizing
const MAX_COL_W = 300;    // maximum column width when resizing

const CAT_COLORS = [
  "#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be185d",
  "#0369a1", "#15803d", "#c2410c", "#0891b2", "#65a30d",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 1) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

function getCatColor(idx: number) { return CAT_COLORS[idx % CAT_COLORS.length]; }

// ─── Coverage Badge ─────────────────────────────────────────────────────────────

function CoverageBadge({ planned, boqQty, unit }: { planned: number; boqQty: number; unit: string }) {
  if (planned === 0) return (
    <span className="inline-flex text-[12px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
      Not programmed
    </span>
  );
  const diff = planned - boqQty;
  const absDiff = Math.abs(diff);
  // Treat differences < 0.5 unit as "fully covered" to avoid showing "Over/Under by 0"
  // due to floating-point rounding when the gap is smaller than display precision.
  if (absDiff < 0.5) return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Fully covered
    </span>
  );
  if (diff < 0) return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Under by {fmtQty(absDiff)} {unit}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Over by {fmtQty(absDiff)} {unit}
    </span>
  );
}

// ─── StretchRow ─────────────────────────────────────────────────────────────────

interface StretchRowProps {
  bar: WorkProgramBarWithItem;
  itemBars: WorkProgramBarWithItem[];
  item: BoqItemWithCategory;
  project: BoqProject;
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
  projectId: number;
  color: string;
  isFirst: boolean;
  totalMonths: number;
  colW: number;
  onDelete: (id: number) => void;
  onSplit: (bar: WorkProgramBarWithItem) => void;
  onBeforeMutate?: () => void;
  productivitySettings?: ProductivitySettings | null;
}

function StretchRow({
  bar, itemBars, item, project, recipesMap, projectId, color, isFirst, totalMonths, colW, onDelete, onSplit,
  onBeforeMutate,
  productivitySettings,
}: StretchRowProps) {
  const { toast } = useToast();
  const dirty = useRef(false);

  const roadLen = project.roadLengthKm ?? 0;
  const boqQty = item.currentQty;

  // Derive initial multiplier from saved data (back-calc from qty/chainage, or default to boqQty/roadLen)
  function initMult() {
    const cf0 = bar.chainageFrom ?? 0;
    const ct0 = bar.chainageTo ?? 0;
    const len = ct0 - cf0;
    if (len > 0 && bar.plannedQty > 0) return String(+(bar.plannedQty / len).toFixed(4));
    if (roadLen > 0 && boqQty > 0) return String(+(boqQty / roadLen).toFixed(4));
    return "1";
  }

  const [cf, setCf] = useState(bar.chainageFrom != null ? String(bar.chainageFrom) : "");
  const [ct, setCt] = useState(bar.chainageTo != null ? String(bar.chainageTo) : "");
  const [mult, setMult] = useState(initMult);
  const [startM, setStartM] = useState(String(+(bar.startMonth).toFixed(1)));
  const [endM, setEndM] = useState(String(+(bar.endMonth).toFixed(1)));
  const [durationModeState, setDurationModeState] = useState<"auto" | "fixed">(
    (bar.durationMode as "auto" | "fixed") ?? "auto",
  );
  // Locked duration (months) for fixed mode: set when entering FIX, preserved when start shifts.
  const lockedDurationRef = useRef<number>(bar.endMonth - bar.startMonth);

  // Structure-aware mode: for bridge/CD/culvert items, qty is entered directly per location.
  const isStructure = (item as any).planningWorkType === "structure";
  const [structQtyStr, setStructQtyStr] = useState(() =>
    bar.plannedQty > 0 ? String(bar.plannedQty) : "",
  );

  // Sync from DB when not dirty
  useEffect(() => {
    if (dirty.current) return;
    setCf(bar.chainageFrom != null ? String(bar.chainageFrom) : "");
    setCt(bar.chainageTo != null ? String(bar.chainageTo) : "");
    setStartM(String(+(bar.startMonth).toFixed(1)));
    setEndM(String(+(bar.endMonth).toFixed(1)));
    setDurationModeState((bar.durationMode as "auto" | "fixed") ?? "auto");
    // back-calc mult from updated bar
    const len = (bar.chainageTo ?? 0) - (bar.chainageFrom ?? 0);
    if (len > 0 && bar.plannedQty > 0) {
      setMult(String(+(bar.plannedQty / len).toFixed(4)));
    } else if (roadLen > 0 && boqQty > 0) {
      setMult(String(+(boqQty / roadLen).toFixed(4)));
    }
    if (isStructure) setStructQtyStr(bar.plannedQty > 0 ? String(bar.plannedQty) : "");
  }, [bar.chainageFrom, bar.chainageTo, bar.startMonth, bar.endMonth, bar.durationMode, bar.plannedQty]);

  const cfNum = parseFloat(cf);
  const ctNum = parseFloat(ct);
  const multNum = parseFloat(mult);
  const smNum = parseFloat(startM) || 1;
  const validCh = !isNaN(cfNum) && !isNaN(ctNum) && ctNum > cfNum;

  // Auto qty from chainage × editable multiplier (disabled for structure items)
  const autoQty = useMemo(() => {
    if (isStructure) return null;
    if (!validCh) return null;
    const stretchLen = ctNum - cfNum;
    if (!isNaN(multNum) && multNum > 0) return +(stretchLen * multNum).toFixed(4);
    if (roadLen > 0) return calculateStretchQty(boqQty, cfNum, ctNum, roadLen);
    return boqQty;
  }, [isStructure, validCh, cfNum, ctNum, multNum, roadLen, boqQty]);

  // Default multiplier (boqQty/roadLen) for display hint
  const defaultRate = roadLen > 0 ? boqQty / roadLen : null;

  // Equipment recipes for auto-duration
  const workingDays = project.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT;
  const workingHrs = project.workingHoursPerDay ?? WORKING_HRS_DEFAULT;
  const equipment = useMemo((): Array<EquipmentProductivity & { name: string }> => {
    return (recipesMap.get(item.id) ?? []).map(e => ({
      name: e.equipmentName,
      outputUnit: e.outputUnit,
      outputTheoretical: e.outputTheoretical,
      outputEfficiency: e.outputEfficiency,
      standardOutputs: e.standardOutputs as Array<{ unit: string; outputPerHr: number }> | null,
      count: e.count ?? 1,
    }));
  }, [item.id, recipesMap]);

  const structQtyNum = isStructure ? (parseFloat(structQtyStr) || 0) : 0;
  const effectiveQty = isStructure
    ? (structQtyNum > 0 ? structQtyNum : bar.plannedQty)
    : (autoQty ?? bar.plannedQty);
  // Prefer the specific mix type (BC/DBM/WMM/M20 stored when a mix template is linked)
  // over the generic layerType ("bituminous"/"granular") so the planning engine can
  // resolve the correct per-type productivity override without alias collapse.
  const _lc = item.layerConfig as LayerConfig | null;
  const itemType = (_lc?.mixType ?? _lc?.layerType) ?? null;
  const autoDuration = useMemo(() => {
    if (effectiveQty <= 0 && !productivitySettings) return null;
    if (effectiveQty <= 0) return null;
    return calculateAutoDurationFull(
      effectiveQty, item.unit, equipment, workingHrs, workingDays,
      productivitySettings, itemType,
    );
  }, [effectiveQty, item.unit, equipment, workingHrs, workingDays, productivitySettings, itemType]);

  // ── Chainage overlap detection ────────────────────────────────────────────
  const hasChainageOverlap = useMemo(() => {
    if (!validCh) return false;
    return itemBars.some(b => {
      if (b.id === bar.id) return false;
      const bcf = b.chainageFrom ?? 0;
      const bct = b.chainageTo ?? 0;
      if (bct <= bcf) return false;
      // Two intervals [cfNum, ctNum) and [bcf, bct) overlap if bcf < ctNum && bct > cfNum
      return bcf < ctNum && bct > cfNum;
    });
  }, [itemBars, bar.id, validCh, cfNum, ctNum]);

  // ── Duration preservation (Rule 4) ────────────────────────────────────────
  const autoDurationMonths = (autoDuration?.months ?? 0) > 0 ? autoDuration!.months : null;
  const savedDurationMonths = bar.endMonth - bar.startMonth;
  const endMNum = parseFloat(endM) || (smNum + 1);

  // Fixed-duration mode: user controls the end month/date directly
  // Auto-duration mode: system calculates from qty ÷ equipment output
  const effectiveDurationMonths = durationModeState === "fixed"
    ? Math.max(0.1, endMNum - smNum)
    : (autoDurationMonths ?? (savedDurationMonths > 0 ? savedDurationMonths : 1));

  // Max feasible monthly output from equipment (auto-duration denominator)
  const capacityMonthlyOutput = useMemo(() => {
    if (!autoDuration || autoDuration.months <= 0) return null;
    const qty = autoQty ?? bar.plannedQty;
    return qty / autoDuration.months; // qty/month at normal equipment intensity
  }, [autoDuration, autoQty, bar.plannedQty]);

  // Required-output calculation for fixed-duration mode
  const requiredOutput = useMemo(() => {
    if (durationModeState !== "fixed" || !project.startDate) return null;
    const qty = autoQty ?? bar.plannedQty;
    if (qty <= 0) return null;
    const startDateStr = formatDateForInput(monthIndexToDate(smNum, project.startDate));
    const endDateStr = formatDateForInput(monthIndexToDate(endMNum, project.startDate));
    if (endMNum <= smNum) return null;
    // Pass capacityMonthlyOutput so calculateRequiredOutput can derive requiredResourceMultiplier
    const result = calculateRequiredOutput(qty, startDateStr, endDateStr, workingDays, capacityMonthlyOutput ?? undefined);
    // Only show warning badge as red when required output exceeds equipment capacity
    const exceedsCapacity = result.requiredResourceMultiplier != null && result.requiredResourceMultiplier > 1.0;
    const capacityPct = result.requiredResourceMultiplier != null
      ? Math.round(result.requiredResourceMultiplier * 100)
      : null;
    // Compute additional equipment units needed when schedule exceeds capacity
    let additionalEquipmentNeeded: number | null = null;
    const bottleneckEquipmentName = autoDuration?.bottleneckEquipment ?? null;
    if (exceedsCapacity && capacityMonthlyOutput != null && capacityMonthlyOutput > 0 && bottleneckEquipmentName) {
      const bottleneckEq = equipment.find(e => e.name === bottleneckEquipmentName);
      const bottleneckCount = bottleneckEq?.count ?? 1;
      const outputPerUnit = capacityMonthlyOutput / bottleneckCount;
      if (outputPerUnit > 0) {
        const unitsRequired = Math.ceil(result.monthlyOutput / outputPerUnit);
        additionalEquipmentNeeded = Math.max(0, unitsRequired - bottleneckCount);
      }
    }
    return { ...result, exceedsCapacity, capacityPct, additionalEquipmentNeeded, bottleneckEquipmentName };
  }, [durationModeState, project.startDate, autoQty, bar.plannedQty, smNum, endMNum, workingDays, capacityMonthlyOutput, autoDuration, equipment]);

  // Haul distance: prefer new directional lead distance fields; fall back to legacy chainage fields.
  const haulDistanceKm = useMemo(() => {
    const lc = item.layerConfig as LayerConfig | null;
    if (!lc) return null;
    let dist: number | null = null;
    const p = project as any;
    if (lc.layerType === "bituminous") dist = p.hmpToSiteKm ?? project.hmpChainageKm ?? null;
    else if (lc.layerType === "spray_coat") dist = p.hmpToSiteKm ?? project.hmpChainageKm ?? null;
    else if (lc.layerType === "granular" && lc.granularSource === "plant") dist = p.wmmPlantToSiteKm ?? project.wmmPlantChainageKm ?? null;
    else if (lc.layerType === "granular") dist = p.quarryToSiteKm ?? project.quarryChainageKm ?? null;
    else if (lc.layerType === "earthwork" && (lc as any).earthworkType === "cut") dist = p.disposalDistanceKm ?? p.disposalChainageKm ?? null;
    else if (lc.layerType === "earthwork") dist = p.borrowToSiteKm ?? p.borrowChainageKm ?? p.disposalDistanceKm ?? null;
    else if (lc.layerType === "concrete") dist = p.rmcToSiteKm ?? p.rmcChainageKm ?? null;
    return dist != null && dist > 0 ? dist : null;
  }, [item.layerConfig, project.hmpChainageKm, project.wmmPlantChainageKm, project.quarryChainageKm,
      (project as any).borrowChainageKm, (project as any).disposalChainageKm, (project as any).rmcChainageKm,
      (project as any).hmpToSiteKm, (project as any).wmmPlantToSiteKm, (project as any).quarryToSiteKm,
      (project as any).quarryToHmpKm, (project as any).quarryToRmcKm, (project as any).rmcToSiteKm,
      (project as any).borrowToSiteKm, (project as any).disposalDistanceKm]);

  const patch = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/boq/programme/bars/${bar.id}`, data),
    onSuccess: async () => {
      dirty.current = false;
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  function save() {
    onBeforeMutate?.();
    dirty.current = false;
    const qty = effectiveQty;
    const em = +(smNum + effectiveDurationMonths).toFixed(2);
    const isQtyOverride = isStructure
      ? false
      : !!(autoQty != null && defaultRate != null && Math.abs(multNum - defaultRate) > 0.0001);
    const isDurationOverride = durationModeState === "fixed" || (autoDurationMonths == null && bar.isDurationOverride === true);
    // Compute real calendar dates if project has a start date
    const startDateVal = project.startDate
      ? formatDateForInput(monthIndexToDate(smNum, project.startDate))
      : null;
    const endDateVal = project.startDate
      ? formatDateForInput(monthIndexToDate(em, project.startDate))
      : null;
    patch.mutate({
      chainageFrom: validCh ? cfNum : bar.chainageFrom,
      chainageTo: validCh ? ctNum : bar.chainageTo,
      plannedQty: qty,
      startMonth: smNum,
      endMonth: em,
      isQtyOverride,
      isDurationOverride,
      durationMode: durationModeState,
      ...(startDateVal != null ? { startDate: startDateVal, endDate: endDateVal } : {}),
    });
  }

  // ── Bar positioning: uses live draft start + effective duration ─────────────
  const liveStart = smNum;
  const liveEnd = +(smNum + effectiveDurationMonths).toFixed(2);
  const liveQty = effectiveQty;
  const barLeft = Math.max(0, (liveStart - 1) * colW);
  const barWidth = Math.max(4, (liveEnd - liveStart) * colW);
  const durationMonths = liveEnd - liveStart;

  return (
    <div
      style={{ display: "flex", height: ROW_H, minHeight: ROW_H }}
      className="border-b border-dashed border-slate-100 dark:border-slate-800"
      data-testid={`stretch-row-${bar.id}`}
    >
      {/* ── Left sticky panel ── */}
      <div
        style={{ width: LEFT_W, minWidth: LEFT_W, maxWidth: LEFT_W, overflow: "hidden", position: "sticky", left: 0, zIndex: 10 }}
        className={`flex items-center gap-1 px-1.5 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 ${
          patch.isPending ? "opacity-70" : ""
        }`}
      >
        {/* Split indicator */}
        <div
          className="flex-shrink-0 self-stretch w-0.5 mr-0.5"
          style={{ backgroundColor: isFirst ? "transparent" : color, opacity: 0.5 }}
        />
        {(bar as any).reachLabel ? (
          <span className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 font-semibold flex-shrink-0 dark:bg-teal-900/30 dark:text-teal-300" title="Reach front">
            {(bar as any).reachLabel}
          </span>
        ) : !isFirst ? (
          <span className="text-[12px] text-orange-500 font-medium flex-shrink-0 w-8">(split)</span>
        ) : null}

        {/* Chainage inputs */}
        <span className="text-xs text-slate-400 flex-shrink-0">Ch</span>
        <input
          type="number" step="0.001"
          value={cf}
          onChange={e => { dirty.current = true; setCf(e.target.value); }}
          onBlur={save}
          className="w-[52px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-cf-${bar.id}`}
        />
        <span className="text-xs text-slate-400 flex-shrink-0">to</span>
        <input
          type="number" step="0.001"
          value={ct}
          onChange={e => { dirty.current = true; setCt(e.target.value); }}
          onBlur={save}
          className="w-[52px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-ct-${bar.id}`}
        />

        {/* Chainage overlap warning */}
        {hasChainageOverlap && (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5 flex-shrink-0"
            title="Chainage overlaps with another stretch on this item. Adjust from/to values."
          >
            <AlertTriangle className="w-2.5 h-2.5" />overlap
          </span>
        )}

        {/* Qty input: structure items get direct entry; road items get @ multiplier */}
        {isStructure ? (
          <>
            <span className="text-xs text-violet-400 flex-shrink-0 font-semibold">Qty</span>
            <input
              type="number" step="any" min="0"
              value={structQtyStr}
              onChange={e => { dirty.current = true; setStructQtyStr(e.target.value); }}
              onBlur={save}
              className="w-[54px] text-xs font-mono border-b bg-transparent text-center focus:outline-none focus:border-violet-500 dark:text-slate-200 border-violet-300 dark:border-violet-600"
              title="Quantity at this location (structure/bridge — not chainage-derived)"
              data-testid={`input-struct-qty-${bar.id}`}
            />
          </>
        ) : (
          <>
            <span className="text-xs text-slate-400 flex-shrink-0">@</span>
            <input
              type="number" step="0.0001" min="0.0001"
              value={mult}
              onChange={e => { dirty.current = true; setMult(e.target.value); }}
              onBlur={save}
              className={`w-[42px] text-xs font-mono border-b bg-transparent text-center focus:outline-none focus:border-teal-500 dark:text-slate-200 ${
                defaultRate != null && !isNaN(multNum) && Math.abs(multNum - defaultRate) > 0.0001
                  ? "border-orange-400 text-orange-600 dark:text-orange-400"
                  : "border-slate-300 dark:border-slate-600"
              }`}
              title={defaultRate != null ? `Default rate: ${fmtQty(defaultRate, 4)} ${item.unit}/km` : "Multiplier (qty per km)"}
              data-testid={`input-mult-${bar.id}`}
            />
          </>
        )}

        {/* Live qty display — violet = structure direct qty, orange = auto from chainage×mult */}
        <span
          className={`text-xs font-bold w-[54px] text-right flex-shrink-0 font-mono ${
            isStructure ? "text-violet-600 dark:text-violet-400" :
            autoQty != null ? "text-orange-600 dark:text-orange-400" : "text-slate-600 dark:text-slate-300"
          }`}
          title={isStructure ? "Direct qty at this location" : autoQty != null ? "Auto-calculated: chainage × multiplier" : "Saved quantity"}
        >
          {fmtQty(liveQty, 1)}
        </span>

        {/* Start: date picker when project has a start date, otherwise numeric month input */}
        {project.startDate ? (
          <input
            type="date"
            value={
              !isNaN(smNum) && project.startDate
                ? formatDateForInput(monthIndexToDate(smNum, project.startDate))
                : ""
            }
            onChange={e => {
              dirty.current = true;
              if (e.target.value && project.startDate) {
                const idx = dateToMonthIndex(e.target.value, project.startDate);
                setStartM(String(+idx.toFixed(2)));
                // In fixed mode: shift end by the locked duration (preserve window length)
                if (durationModeState === "fixed") {
                  const shiftedEnd = +(idx + lockedDurationRef.current).toFixed(2);
                  setEndM(String(shiftedEnd));
                }
              }
            }}
            onBlur={save}
            className="w-[108px] text-xs border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200 ml-1"
            title="Stretch start date"
            data-testid={`input-date-${bar.id}`}
          />
        ) : (
          <>
            <span className="text-xs text-slate-400 flex-shrink-0 ml-1">M</span>
            <input
              type="number" min="0.1" max="120" step="0.1"
              value={startM}
              onChange={e => { dirty.current = true; setStartM(e.target.value); }}
              onBlur={save}
              className="w-[36px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
              title="Start month (decimal OK, e.g. 1.5)"
              data-testid={`input-sm-${bar.id}`}
            />
          </>
        )}

        {/* Mode toggle: auto ↔ fixed */}
        {project.startDate && (
          <button
            onClick={() => {
              const next = durationModeState === "auto" ? "fixed" : "auto";
              setDurationModeState(next);
              // When switching to fixed, seed endM from current auto end and lock the duration
              if (next === "fixed") {
                const seedEnd = +(smNum + effectiveDurationMonths).toFixed(1);
                lockedDurationRef.current = effectiveDurationMonths;
                setEndM(String(seedEnd));
                // Persist mode immediately so the toggle is never silently lost
                const qty = effectiveQty;
                const em = +seedEnd;
                const isQtyOverride = !!(autoQty != null && defaultRate != null && Math.abs(multNum - defaultRate) > 0.0001);
                const startDateVal = project.startDate ? formatDateForInput(monthIndexToDate(smNum, project.startDate)) : null;
                const endDateVal = project.startDate ? formatDateForInput(monthIndexToDate(em, project.startDate)) : null;
                patch.mutate({
                  plannedQty: qty, startMonth: smNum, endMonth: em,
                  isQtyOverride, isDurationOverride: true, durationMode: "fixed",
                  ...(startDateVal != null ? { startDate: startDateVal, endDate: endDateVal } : {}),
                });
              } else {
                // Switching back to auto: persist immediately
                const qty = effectiveQty;
                const em = +(smNum + (autoDurationMonths ?? effectiveDurationMonths)).toFixed(2);
                const startDateVal = project.startDate ? formatDateForInput(monthIndexToDate(smNum, project.startDate)) : null;
                const endDateVal = project.startDate ? formatDateForInput(monthIndexToDate(em, project.startDate)) : null;
                patch.mutate({
                  plannedQty: qty, startMonth: smNum, endMonth: em,
                  isQtyOverride: false, isDurationOverride: false, durationMode: "auto",
                  ...(startDateVal != null ? { startDate: startDateVal, endDate: endDateVal } : {}),
                });
              }
            }}
            className={`ml-1 px-1 rounded text-xs font-semibold flex-shrink-0 border ${
              durationModeState === "fixed"
                ? "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300"
                : "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
            }`}
            title={durationModeState === "fixed" ? "Fixed duration — click to switch to auto" : "Auto duration — click to lock end date"}
            data-testid={`button-dur-mode-${bar.id}`}
          >
            {durationModeState === "fixed" ? "FIX" : "AUTO"}
          </button>
        )}

        {/* Auto-mode computed end date — read-only badge */}
        {durationModeState === "auto" && project.startDate && !isNaN(liveEnd) && (
          <span
            className="text-xs text-slate-400 ml-0.5 font-mono truncate min-w-0"
            title="Computed end date (auto-duration from equipment output)"
          >
            → {formatDateForInput(monthIndexToDate(liveEnd, project.startDate))}
          </span>
        )}

        {/* End date (fixed mode only) */}
        {durationModeState === "fixed" && project.startDate && (
          <>
            <span className="text-xs text-slate-400 flex-shrink-0 ml-0.5">→</span>
            <input
              type="date"
              value={
                !isNaN(endMNum) && project.startDate
                  ? formatDateForInput(monthIndexToDate(endMNum, project.startDate))
                  : ""
              }
              onChange={e => {
                dirty.current = true;
                if (e.target.value && project.startDate) {
                  const idx = dateToMonthIndex(e.target.value, project.startDate);
                  setEndM(String(+idx.toFixed(2)));
                  // Update locked duration so subsequent start shifts use new window length
                  lockedDurationRef.current = Math.max(0.1, idx - smNum);
                }
              }}
              onBlur={save}
              className="w-[108px] text-xs border-b border-violet-400 bg-transparent text-center focus:outline-none focus:border-violet-600 dark:text-slate-200 ml-0.5"
              title="Stretch end date (fixed duration)"
              data-testid={`input-end-date-${bar.id}`}
            />
          </>
        )}

        {/* Required output intensity badge — tooltip carries the full detail; badge is compact */}
        {requiredOutput && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded px-1 py-0.5 min-w-0 ml-0.5 border max-w-[110px] overflow-hidden ${
              requiredOutput.exceedsCapacity
                ? "text-red-700 bg-red-50 border-red-300 dark:bg-red-950/30 dark:text-red-400"
                : "text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400"
            }`}
            title={[
              `Requires ${fmtQty(requiredOutput.monthlyOutput, 1)} ${bar.unit}/month`,
              `(${fmtQty(requiredOutput.dailyOutput, 2)}/day over ${fmtQty(requiredOutput.durationWorkingDays, 0)} working days)`,
              requiredOutput.capacityPct != null
                ? `= ${requiredOutput.capacityPct}% of equipment capacity`
                : "",
              requiredOutput.exceedsCapacity ? "⚠ Exceeds normal equipment capacity!" : "",
              requiredOutput.additionalEquipmentNeeded != null && requiredOutput.additionalEquipmentNeeded > 0
                ? `Need +${requiredOutput.additionalEquipmentNeeded} more ${requiredOutput.bottleneckEquipmentName} to meet this deadline`
                : "",
            ].filter(Boolean).join(" ")}
          >
            {requiredOutput.exceedsCapacity && <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />}
            <span className="truncate">
              {fmtQty(requiredOutput.monthlyOutput, 1)}/{bar.unit.toLowerCase() || "unit"}/mo
              {requiredOutput.capacityPct != null && (
                <span className="opacity-75"> ({requiredOutput.capacityPct}%)</span>
              )}
            </span>
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Saving indicator */}
        {patch.isPending && <Loader2 className="w-3 h-3 animate-spin text-teal-500 flex-shrink-0 mr-0.5" />}

        {/* Buttons */}
        <button
          onClick={() => onSplit(bar)}
          className="p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 flex-shrink-0"
          title="Split stretch at midpoint"
          data-testid={`button-split-${bar.id}`}
        >
          <Scissors className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(bar.id)}
          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
          title="Delete stretch"
          data-testid={`button-delete-${bar.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* ── Right: Gantt cells ── */}
      <div
        style={{ width: totalMonths * colW, minWidth: totalMonths * colW, position: "relative", flexShrink: 0, overflow: "hidden" }}
        className="bg-slate-50/20 dark:bg-slate-900/10"
      >
        {/* Month column grid lines */}
        {Array.from({ length: totalMonths }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800"
            style={{ left: i * colW, width: colW }}
          />
        ))}

        {/* Gantt bar — label rendered inside the bar to avoid vertical overflow into rows below */}
        <div
          className="absolute rounded overflow-hidden group select-none"
          style={{
            top: 7,
            left: barLeft,
            width: barWidth,
            height: 24,
            backgroundColor: color,
            opacity: 0.88,
          }}
          title={(() => {
            const ch = `Ch ${validCh ? cfNum : (bar.chainageFrom ?? "?")} – ${validCh ? ctNum : (bar.chainageTo ?? "?")} km`;
            const qty = `${fmtQty(liveQty, 1)} ${bar.unit}`;
            const span = project.startDate
              ? `${formatDateForInput(monthIndexToDate(liveStart, project.startDate))} → ${formatDateForInput(monthIndexToDate(liveEnd, project.startDate))} (${fmtQty(durationMonths, 2)} mo)`
              : `M${fmtQty(liveStart, 1)} → M${fmtQty(liveEnd, 1)} (${fmtQty(durationMonths, 2)} mo)`;
            const extras = [
              autoDuration?.bottleneckEquipment ? `Bottleneck: ${autoDuration.bottleneckEquipment}` : null,
              haulDistanceKm != null ? `Haul: ${fmtQty(haulDistanceKm, 1)} km` : null,
            ].filter(Boolean).join(" | ");
            return [ch, qty, span, extras].filter(Boolean).join(" | ");
          })()}
        >
          <div className="absolute inset-0 group-hover:bg-white/15 rounded" />
          {/* Inline label — white text inside bar; no vertical bleed into next row */}
          {barWidth >= 50 && (
            <div
              className="absolute inset-0 flex items-center px-1.5 pointer-events-none select-none overflow-hidden"
            >
              <span className="text-white text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis opacity-90 drop-shadow-sm">
                {fmtQty(liveQty, 1)} {bar.unit} | {(durationMonths * workingDays).toFixed(1)}d
                {autoDuration?.bottleneckEquipment && (
                  <span className="opacity-70 font-normal"> · {autoDuration.bottleneckEquipment}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StructureLocationRow ─────────────────────────────────────────────────────
// Read-only row for bars imported via Structure Schedule Import wizard
// (planningMode = "structure_location"). Shows Structure ID, chainage, qty,
// dates. No split, no multiplier — user manages these bars by re-importing.

function StructureLocationRow({
  bar,
  project,
  projectId,
  color,
  totalMonths,
  colW,
  onDelete,
}: {
  bar: WorkProgramBarWithItem;
  project: BoqProject;
  projectId: number;
  color: string;
  totalMonths: number;
  colW: number;
  onDelete: (id: number) => void;
}) {
  const b = bar as any;

  const liveStart = bar.startMonth;
  const liveEnd   = bar.endMonth;
  const barLeft   = Math.max(0, (liveStart - 1) * colW);
  const barWidth  = Math.max(4, (liveEnd - liveStart) * colW);

  return (
    <div
      style={{ display: "flex", height: ROW_H, minHeight: ROW_H }}
      className="border-b border-dashed border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/10"
      data-testid={`structure-loc-row-${bar.id}`}
    >
      {/* ── Left sticky panel (read-only — re-import to change values) ── */}
      <div
        style={{ width: LEFT_W, minWidth: LEFT_W, maxWidth: LEFT_W, overflow: "hidden", position: "sticky", left: 0, zIndex: 10 }}
        className="flex flex-col justify-center gap-0.5 px-2 border-r border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/30"
      >
        {/* Row 1: icon + structure name + chainage */}
        <div className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-violet-500 flex-shrink-0" />
          <span
            className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate"
            title={b.structureId ?? ""}
          >
            {b.structureId ?? b.reachLabel ?? "—"}
          </span>
          {b.structureChainageKm != null && (
            <span className="text-[10px] text-violet-500 font-mono flex-shrink-0 ml-auto">
              Km {Number(b.structureChainageKm).toFixed(3)}
            </span>
          )}
        </div>
        {/* Row 2: structure type + BOQ item code + sub-item + qty */}
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          {b.structureLocType && (
            <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1 border border-violet-200 flex-shrink-0 capitalize">
              {b.structureLocType}
            </span>
          )}
          {(bar as any).itemCode && (
            <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
              {(bar as any).itemCode}
            </span>
          )}
          {b.boqSubItem && (
            <span className="text-[10px] bg-violet-50 text-violet-600 rounded px-1 border border-violet-200 flex-shrink-0 font-mono">
              {b.boqSubItem}
            </span>
          )}
          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-300 flex-shrink-0 ml-auto">
            {fmtQty(bar.plannedQty, 2)} {(bar as any).unit ?? ""}
          </span>
        </div>
        {/* Row 3: start date + duration + delete */}
        <div className="flex items-center gap-1 min-w-0">
          {bar.startDate && (
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
              {String(bar.startDate).slice(0, 10)}
            </span>
          )}
          {b.durationDays != null && (
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {b.durationDays}d
            </span>
          )}
          <button
            onClick={() => onDelete(bar.id)}
            className="p-0.5 rounded text-violet-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0 ml-auto"
            title="Delete this structure bar (re-import to update values)"
            data-testid={`button-delete-sloc-${bar.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Right: Gantt cells ── */}
      <div
        style={{ width: totalMonths * colW, minWidth: totalMonths * colW, position: "relative", flexShrink: 0, overflow: "hidden" }}
        className="bg-violet-50/10 dark:bg-violet-900/5"
      >
        {Array.from({ length: totalMonths }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-r border-violet-100 dark:border-violet-900/20"
            style={{ left: i * colW, width: colW }}
          />
        ))}
        <div
          className="absolute rounded overflow-hidden select-none"
          style={{ top: 7, left: barLeft, width: barWidth, height: 24, backgroundColor: "#7c3aed", opacity: 0.80 }}
          title={`${b.structureId ?? ""} | ${fmtQty(bar.plannedQty, 1)} ${(bar as any).unit ?? ""} | M${fmtQty(liveStart, 1)} → M${fmtQty(liveEnd, 1)}`}
        >
          {barWidth >= 50 && (
            <div className="absolute inset-0 flex items-center px-1.5 pointer-events-none overflow-hidden">
              <span className="text-white text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis opacity-90 drop-shadow-sm">
                {fmtQty(bar.plannedQty, 1)} {(bar as any).unit ?? ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StructureImportWizard ────────────────────────────────────────────────────
// 2-step wizard: (1) upload → server parses XLSX & returns matched rows for
// preview, (2) confirm import via /import-structure with pre-matched JSON rows.
// BOQ matching is authoritative on the server (priority: code+subItem > code > desc).

interface StructureScheduleRow {
  rowIdx: number;
  structureId: string;
  structureType: string;
  chainageKm: number;
  boqItemCode: string;
  boqSubItem: string;
  boqExcelRow: number;
  boqDescription: string;
  plannedQty: number;
  uom: string;
  startDate: string;
  durationDays: number;
  remarks: string;
  boqItemId?: number;   // resolved by server
  matchStatus?: "matched" | "unmatched";
}

function StructureImportWizard({
  open,
  onOpenChange,
  projectId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: number;
  /** Passed by parent for potential future use; matching is authoritative on server */
  boqItems?: BoqItemWithCategory[];
  onImported: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [rows, setRows] = useState<StructureScheduleRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [parsing, setParsing] = useState(false);

  function reset() {
    setStep(1);
    setRows([]);
    setParseError(null);
    setParsing(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Upload file to server for authoritative BOQ matching and XLSX parsing.
  // Server applies priority: P1 code+subItem, P2 code (strip leading zeros), P3 description.
  async function parseFile(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/boq/projects/${projectId}/parse-structure-schedule`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error ?? `Server error ${res.status}`);
      }
      const data: { sheetName: string; rows: StructureScheduleRow[]; totalRows: number } = await res.json();
      if (!data.rows?.length) throw new Error("No data rows could be read. Check the column headers.");
      setRows(data.rows);
      setStep(2);
    } catch (e: any) {
      setParseError(e?.message ?? String(e));
    } finally {
      setParsing(false);
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/import-structure`, {
        rows: rows.map(r => ({
          structureId:    r.structureId,
          structureType:  r.structureType,
          chainageKm:     r.chainageKm,
          boqItemCode:    r.boqItemCode,
          boqSubItem:     r.boqSubItem,
          boqExcelRow:    r.boqExcelRow || undefined,
          boqDescription: r.boqDescription,
          plannedQty:     r.plannedQty,
          uom:            r.uom,
          startDate:      r.startDate || undefined,
          durationDays:   r.durationDays || undefined,
          remarks:        r.remarks || undefined,
          boqItemId:      r.boqItemId,
        })),
        mode,
      });
      return res.json();
    },
    onSuccess: (data: { created: number; skipped: number; total: number; warnings?: string[]; unmatchedBoqRows?: number; uomMismatchRows?: number; overPlannedItems?: unknown[] }) => {
      onImported();
      onOpenChange(false);
      reset();
      const parts: string[] = [`${data.created} bars created`];
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      if (data.uomMismatchRows) parts.push(`${data.uomMismatchRows} UOM mismatch(es)`);
      if (data.overPlannedItems?.length) parts.push(`${data.overPlannedItems.length} over-planned BOQ item(s)`);
      toast({
        title: "Structure schedule imported",
        description: parts.join(", ") + (data.warnings?.length ? ` — ${data.warnings.length} warning(s)` : ""),
      });
    },
    onError: (err: any) =>
      toast({ title: "Import failed", description: String(err?.message ?? err), variant: "destructive" }),
  });

  const matchedCount  = rows.filter(r => r.matchStatus === "matched").length;
  const unmatchedCount = rows.filter(r => r.matchStatus !== "matched").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-600" />
            Import Structure Schedule
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload an Excel file containing the structure schedule. The sheet should be named{" "}
              <code className="text-violet-700 font-mono bg-violet-50 px-1 rounded">Structure_Schedule_Import</code>{" "}
              with columns: <em>structure_id, structure_type, chainage_km, boq_item_code, boq_sub_item, planned_qty, uom, start_date, duration_days, remarks</em>.
            </p>

            <div className="rounded-lg border-2 border-dashed border-violet-200 p-6 text-center bg-violet-50/40">
              <Upload className="w-8 h-8 text-violet-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 mb-3">Click to browse or drag an Excel file here</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="border-violet-300 text-violet-700 hover:bg-violet-50"
                disabled={parsing}
                data-testid="button-browse-structure-excel"
              >
                {parsing ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Parsing…</> : "Browse file"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
                data-testid="input-structure-excel"
              />
            </div>

            {parseError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
                {parseError}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 text-teal-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />{matchedCount} matched
              </span>
              {unmatchedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />{unmatchedCount} unmatched (will be skipped)
                </span>
              )}
              <span className="text-muted-foreground ml-auto">{rows.length} total rows</span>
            </div>

            <div className="border rounded-lg overflow-auto max-h-72 text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Structure ID</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Type</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Chainage</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">BOQ Code</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Description</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Qty</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Start</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={r.matchStatus === "matched"
                        ? "hover:bg-slate-50/50"
                        : "bg-amber-50/60 dark:bg-amber-900/10"}
                    >
                      <td className="px-2 py-1 border-b truncate max-w-[120px]" title={r.structureId}>{r.structureId || "—"}</td>
                      <td className="px-2 py-1 border-b truncate max-w-[90px]">{r.structureType || "—"}</td>
                      <td className="px-2 py-1 border-b font-mono">{r.chainageKm > 0 ? r.chainageKm.toFixed(3) : "—"}</td>
                      <td className="px-2 py-1 border-b font-mono">{r.boqItemCode || "—"}</td>
                      <td className="px-2 py-1 border-b truncate max-w-[140px]" title={r.boqDescription}>{r.boqDescription || "—"}</td>
                      <td className="px-2 py-1 border-b font-mono">{r.plannedQty > 0 ? fmtQty(r.plannedQty, 2) : "—"} {r.uom}</td>
                      <td className="px-2 py-1 border-b">{r.startDate || "—"}</td>
                      <td className="px-2 py-1 border-b">
                        {r.matchStatus === "matched"
                          ? <span className="text-teal-600 font-semibold">✓ matched</span>
                          : <span className="text-amber-600 font-semibold">⚠ no match</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <Label className="font-medium text-slate-700">Import mode</Label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="import-mode" value="append" checked={mode === "append"} onChange={() => setMode("append")} data-testid="radio-mode-append" />
                <span>Append</span>
                <span className="text-muted-foreground text-xs">(keep existing structure bars)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} data-testid="radio-mode-replace" />
                <span>Replace</span>
                <span className="text-muted-foreground text-xs">(delete existing structure bars first)</span>
              </label>
            </div>

            {unmatchedCount === rows.length && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                No rows could be matched to BOQ items — check that BOQ item codes in the file match those in this project.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { if (step === 2) setStep(1); else onOpenChange(false); }}>
            {step === 2 ? "← Back" : "Cancel"}
          </Button>
          {step === 2 && matchedCount > 0 && (
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              data-testid="button-confirm-structure-import"
            >
              {importMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Importing…</>
                : <><Upload className="w-3.5 h-3.5 mr-1" />Import {matchedCount} bars</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── InlineGanttTable ────────────────────────────────────────────────────────────

// Natural sort for MoRTH bill/item codes: 1.01 < 1.02 < 1.10 < 2.01 < 10.01
function compareItemCode(a?: string | null, b?: string | null): number {
  const seg = (s?: string | null) => (s ?? "").split(".").map(p => parseInt(p.replace(/\D/g, ""), 10) || 0);
  const pa = seg(a), pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return (a ?? "").localeCompare(b ?? "");
}

function InlineGanttTable({
  project,
  items,
  bars,
  recipesMap,
  projectId,
  productivitySettings,
  onBeforeMutate,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
  projectId: number;
  productivitySettings?: ProductivitySettings | null;
  onBeforeMutate?: () => void;
}) {
  const { toast } = useToast();
  const totalMonths = project.totalMonths ?? 12;
  const roadLen = project.roadLengthKm ?? 0;
  const workingDays = project.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT;
  const workingHrs = project.workingHoursPerDay ?? WORKING_HRS_DEFAULT;

  // ── Resizable column width ─────────────────────────────────────────────────
  const [colW, setColW] = useState(MONTH_W_DEFAULT);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragRef.current = { startX: e.clientX, startW: colW };

    const onMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const dx = ev.clientX - resizeDragRef.current.startX;
      setColW(Math.min(MAX_COL_W, Math.max(MIN_COL_W, resizeDragRef.current.startW + dx)));
    };
    const onUp = () => {
      resizeDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colW]);

  const [deleteBarId, setDeleteBarId] = useState<number | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const barsByItemId = useMemo(() => {
    const m: Record<number, WorkProgramBarWithItem[]> = {};
    for (const b of bars) {
      if (!m[b.boqItemId]) m[b.boqItemId] = [];
      m[b.boqItemId].push(b);
    }
    return m;
  }, [bars]);

  const plannedByItemId = useMemo(() => {
    const m: Record<number, number> = {};
    for (const [id, itemBars] of Object.entries(barsByItemId)) {
      m[Number(id)] = itemBars.reduce((s, b) => s + b.plannedQty, 0);
    }
    return m;
  }, [barsByItemId]);

  // Items with at least one structure_import bar are implicitly structure-planned.
  const structureImportItemIds = useMemo(
    () => new Set(bars.filter(b => (b as any).source === "structure_import").map(b => b.boqItemId)),
    [bars],
  );

  const grouped = useMemo(() => {
    const m: Record<string, BoqItemWithCategory[]> = {};
    for (const it of items) {
      if (it.includedInPlanning === false) continue;
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) m[cat] = [];
      m[cat].push(it);
    }
    for (const cat of Object.keys(m)) {
      m[cat].sort((a, b) => compareItemCode(a.itemCode, b.itemCode));
    }
    return m;
  }, [items]);

  const allCategoryKeys = useMemo(() => {
    const keys = Object.keys(grouped).filter(k => k !== "__uncategorised__");
    keys.sort((a, b) => compareItemCode(grouped[a][0]?.itemCode, grouped[b][0]?.itemCode));
    if (grouped["__uncategorised__"]?.length) keys.push("__uncategorised__");
    return keys;
  }, [grouped]);

  const monthHeaders = useMemo(
    () => Array.from({ length: totalMonths }, (_, i) => ({ num: i + 1, label: monthLabel(i + 1, project.startDate) })),
    [totalMonths, project.startDate],
  );

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme`, data),
    onMutate: onBeforeMutate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
    },
    onError: () => toast({ title: "Failed to add stretch", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/programme/bars/${id}`),
    onMutate: onBeforeMutate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch deleted" });
      setDeleteBarId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const splitMutation = useMutation({
    mutationFn: async (bar: WorkProgramBarWithItem) => {
      const cf = bar.chainageFrom ?? 0;
      const ct = bar.chainageTo ?? roadLen;
      const mid = (cf + ct) / 2;
      const totalLen = ct - cf;
      const leftFraction = totalLen > 0 ? (mid - cf) / totalLen : 0.5;
      const totalDur = bar.endMonth - bar.startMonth;
      const leftEnd = +(bar.startMonth + totalDur * leftFraction).toFixed(2);
      const boqQty = items.find(it => it.id === bar.boqItemId)?.currentQty ?? bar.plannedQty * 2;
      const leftQty = +(bar.plannedQty * leftFraction).toFixed(4);
      const rightQty = +(bar.plannedQty * (1 - leftFraction)).toFixed(4);

      await apiRequest("PATCH", `/api/boq/programme/bars/${bar.id}`, {
        chainageFrom: cf, chainageTo: mid,
        endMonth: leftEnd,
        plannedQty: leftQty,
        reachLabel: bar.reachLabel ? `${bar.reachLabel}A` : "A",
        isQtyOverride: false,
      });
      await apiRequest("POST", `/api/boq/projects/${projectId}/programme`, {
        boqItemId: bar.boqItemId,
        chainageFrom: mid, chainageTo: ct,
        startMonth: leftEnd, endMonth: bar.endMonth,
        plannedQty: rightQty,
        reachLabel: bar.reachLabel ? `${bar.reachLabel}B` : "B",
        isQtyOverride: false,
      });
    },
    onMutate: onBeforeMutate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch split" });
    },
    onError: () => toast({ title: "Failed to split", variant: "destructive" }),
  });

  function addStretch(itemId: number, clickedMonth?: number) {
    const item = items.find(it => it.id === itemId);
    if (!item) return;
    const itemBars = barsByItemId[itemId] ?? [];

    // Gate: don't create when the clicked month is fully inside an existing bar
    if (clickedMonth) {
      const alreadyCovered = itemBars.some(
        b => b.startMonth <= clickedMonth && b.endMonth > clickedMonth,
      );
      if (alreadyCovered) {
        toast({
          title: "Month already scheduled",
          description: `M${clickedMonth} is inside an existing stretch. Use "+ add stretch" to append a new one.`,
        });
        return;
      }
    }

    const lastBar = itemBars[itemBars.length - 1];
    const cfVal = lastBar?.chainageTo ?? 0;
    const ctVal = roadLen > 0 ? roadLen : (cfVal + 1);
    const sm = clickedMonth ?? (lastBar ? Math.ceil(lastBar.endMonth) : 1);
    const isStructItem = (item as any).planningWorkType === "structure" || structureImportItemIds.has(item.id);
    const existingLen = isStructItem ? 0 : itemBars.reduce(
      (s, b) => s + Math.max(0, (b.chainageTo ?? 0) - (b.chainageFrom ?? 0)), 0,
    );
    const newLen = ctVal - cfVal;
    const totalLen = existingLen + newLen;
    const qty = isStructItem
      ? item.currentQty
      : (totalLen > 0 && newLen > 0
        ? +(item.currentQty * (newLen / totalLen)).toFixed(4)
        : (roadLen > 0 ? calculateStretchQty(item.currentQty, cfVal, ctVal, roadLen) : item.currentQty));

    // auto-duration
    const equipment = (recipesMap.get(itemId) ?? []).map(e => ({
      name: e.equipmentName,
      outputUnit: e.outputUnit,
      outputTheoretical: e.outputTheoretical,
      outputEfficiency: e.outputEfficiency,
      standardOutputs: e.standardOutputs as Array<{ unit: string; outputPerHr: number }> | null,
      count: e.count ?? 1,
    }));
    // Prefer specific mix type (BC/DBM/WMM) over generic layerType — same resolution as StretchRow
    const _addLc = item.layerConfig as LayerConfig | null;
    const addItemType = (_addLc?.mixType ?? _addLc?.layerType) ?? null;
    const dur = qty > 0 && (equipment.length || productivitySettings?.mode === "project")
      ? calculateAutoDurationFull(qty, item.unit, equipment, workingHrs, workingDays,
          productivitySettings, addItemType)
      : null;
    const em = dur?.months ? +(sm + dur.months).toFixed(2) : sm + 1;

    createMutation.mutate({
      boqItemId: itemId,
      chainageFrom: cfVal,
      chainageTo: ctVal,
      startMonth: sm,
      endMonth: em,
      plannedQty: qty,
      isQtyOverride: false,
      isDurationOverride: !dur,
    });
  }

  const totalRightW = totalMonths * colW;

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-950" style={{ overflow: "clip" }}>
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
        {/* ── Header row ── */}
        <div
          style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: 44, position: "sticky", top: 0, zIndex: 30 }}
          className="border-b border-slate-700"
        >
          {/* Left header */}
          <div
            style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 20, background: "#0F5F64" }}
            className="flex items-center px-3 border-r border-teal-700"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              BOQ Item / Stretch
            </span>
            <span className="ml-auto text-xs text-white/50 font-normal normal-case tracking-normal">
              Drag month edge to resize
            </span>
          </div>
          {/* Month headers */}
          <div
            style={{ display: "flex", width: totalRightW, minWidth: totalRightW, flexShrink: 0, background: "#0F5F64" }}
          >
            {monthHeaders.map(m => (
              <div
                key={m.num}
                style={{ width: colW, minWidth: colW }}
                className="relative flex items-center justify-center text-[12px] font-semibold text-white/90 border-r border-teal-600/50 flex-shrink-0 select-none overflow-hidden"
              >
                <span className="truncate px-1">{m.label}</span>
                {/* Drag-to-resize handle — right edge of every month header */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/25 active:bg-white/40 z-10"
                  onMouseDown={handleResizeStart}
                  title="Drag to resize month columns"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Category groups ── */}
        {allCategoryKeys.map((cat, catIdx) => {
          const catItems = grouped[cat] ?? [];
          const catLabel = cat === "__uncategorised__" ? "Uncategorised" : cat;
          const color = getCatColor(catIdx);
          const collapsed = collapsedCats[cat] ?? false;

          return (
            <div key={cat}>
              {/* Category header row — sticky below Gantt column header (top: 44px) */}
              <div
                style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: CAT_H, position: "sticky", top: 44, zIndex: 20 }}
                className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950"
              >
                <div
                  style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10, backgroundColor: `${color}18` }}
                  className="flex items-center gap-2 px-3 cursor-pointer border-r border-slate-200 dark:border-slate-700"
                  onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[12px] font-bold uppercase tracking-wider flex-1 truncate" style={{ color }}>
                    {catLabel}
                  </span>
                  <span className="text-[12px] text-slate-500 flex-shrink-0">{catItems.length}</span>
                  {collapsed
                    ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    : <ChevronUp className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                </div>
                <div
                  style={{ width: totalRightW, minWidth: totalRightW, flexShrink: 0, backgroundColor: `${color}10` }}
                />
              </div>

              {!collapsed && catItems.map(item => {
                const itemBars = barsByItemId[item.id] ?? [];
                const totalPlanned = plannedByItemId[item.id] ?? 0;
                const hasEquipment = (recipesMap.get(item.id) ?? []).length > 0;

                return (
                  <div key={item.id} className="border-b border-slate-200 dark:border-slate-700">
                    {/* Item header row */}
                    <div
                      style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: ITEM_H, overflow: "hidden" }}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      {/* Item left */}
                      <div
                        style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10, overflow: "hidden" }}
                        className="flex items-center gap-2 px-3 bg-white dark:bg-gray-950 border-r border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            {item.itemCode && (
                              <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{item.itemCode}</span>
                            )}
                            <HoverCard openDelay={120} closeDelay={40}>
                              <HoverCardTrigger asChild>
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate min-w-0 cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
                                  {shortItemName(item.description)}
                                </span>
                              </HoverCardTrigger>
                              <HoverCardContent align="start" side="bottom" className="w-96 max-w-[90vw]">
                                {item.itemCode && (
                                  <span className="font-mono text-xs text-teal-700">{item.itemCode}</span>
                                )}
                                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap">
                                  {item.description}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {fmt(item.currentQty)} {item.unit}
                                </p>
                              </HoverCardContent>
                            </HoverCard>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 overflow-hidden">
                            <span className="text-[12px] text-muted-foreground flex-shrink-0">{fmt(item.currentQty)} {item.unit}</span>
                            <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={item.unit} />
                            {!hasEquipment && (
                              <span className="text-xs text-amber-500 flex items-center gap-0.5 flex-shrink-0">
                                <Info className="w-2.5 h-2.5" /> no equipment
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => addStretch(item.id)}
                          disabled={createMutation.isPending}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[12px] text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-700 transition-colors flex-shrink-0 font-medium"
                          data-testid={`button-add-stretch-${item.id}`}
                        >
                          <Plus className="w-3 h-3" />
                          add stretch
                        </button>
                      </div>

                      {/* Item right — clickable month cells */}
                      <div
                        style={{ width: totalRightW, minWidth: totalRightW, flexShrink: 0, display: "flex" }}
                        className="bg-white dark:bg-gray-950"
                      >
                        {monthHeaders.map(m => (
                          <div
                            key={m.num}
                            style={{ width: colW, minWidth: colW }}
                            onClick={() => addStretch(item.id, m.num)}
                            className="flex-shrink-0 border-r border-slate-100 dark:border-slate-800 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 cursor-pointer transition-colors"
                            title={`Add stretch starting at ${m.label}`}
                            data-testid={`cell-month-${item.id}-${m.num}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Stretch rows — dispatch to StructureLocationRow for imported structure bars */}
                    {itemBars.map((bar, i) =>
                      (bar as any).planningMode === "structure_location" ? (
                        <StructureLocationRow
                          key={bar.id}
                          bar={bar}
                          project={project}
                          projectId={projectId}
                          color={color}
                          totalMonths={totalMonths}
                          colW={colW}
                          onDelete={setDeleteBarId}
                        />
                      ) : (
                        <StretchRow
                          key={bar.id}
                          bar={bar}
                          itemBars={itemBars.filter(b => (b as any).planningMode !== "structure_location")}
                          item={item}
                          project={project}
                          recipesMap={recipesMap}
                          projectId={projectId}
                          color={color}
                          isFirst={i === 0}
                          totalMonths={totalMonths}
                          colW={colW}
                          onDelete={setDeleteBarId}
                          onSplit={bar => splitMutation.mutate(bar)}
                          onBeforeMutate={onBeforeMutate}
                          productivitySettings={productivitySettings}
                        />
                      )
                    )}

                    {/* Total row when ≥ 2 stretches */}
                    {itemBars.length >= 2 && (
                      <div
                        style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: 26 }}
                        className="bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-700"
                      >
                        <div
                          style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
                          className="flex items-center gap-2 px-3 bg-slate-50 dark:bg-slate-900/30 border-r border-slate-200 dark:border-slate-700"
                        >
                          <span className="text-[12px] text-slate-500 font-semibold">
                            Total: {fmtQty(totalPlanned, 1)} {item.unit}
                          </span>
                          <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={item.unit} />
                        </div>
                        <div style={{ width: totalRightW, minWidth: totalRightW, flexShrink: 0 }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteBarId !== null} onOpenChange={o => { if (!o) setDeleteBarId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Stretch?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">This will permanently remove this stretch from the work programme.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBarId(null)} data-testid="button-delete-cancel">Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              onClick={() => deleteBarId && deleteMutation.mutate(deleteBarId)}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Monthly Plan View ────────────────────────────────────────────────────────

function MonthlyPlanView({
  project, items, bars,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
}) {
  const totalMonths = project.totalMonths ?? 12;
  const maxMonth = useMemo(() => {
    const fromBars = bars.length ? Math.ceil(Math.max(...bars.map(b => b.endMonth))) : 0;
    return Math.max(fromBars, totalMonths, 1);
  }, [bars, totalMonths]);

  const monthlyGrid = useMemo(() => {
    const grid: Record<number, Record<number, number>> = {};
    for (const b of bars) {
      if (!grid[b.boqItemId]) grid[b.boqItemId] = {};
      const duration = b.endMonth - b.startMonth;
      if (duration <= 0) continue;
      for (let m = Math.floor(b.startMonth); m < Math.ceil(b.endMonth); m++) {
        const overlap = Math.max(0, Math.min(b.endMonth, m + 1) - Math.max(b.startMonth, m));
        const qty = b.plannedQty * (overlap / duration);
        const calMonth = m; // m is 1-indexed project month — no +1
        grid[b.boqItemId][calMonth] = (grid[b.boqItemId][calMonth] ?? 0) + qty;
      }
    }
    return grid;
  }, [bars]);

  const plannedByItemId = useMemo(() => {
    const m: Record<number, number> = {};
    for (const b of bars) m[b.boqItemId] = (m[b.boqItemId] ?? 0) + b.plannedQty;
    return m;
  }, [bars]);

  const grouped = useMemo(() => {
    const m: Record<string, BoqItemWithCategory[]> = {};
    for (const it of items) {
      // Show if: included in planning OR already has bars (keep programmed items visible)
      if (it.includedInPlanning === false) continue;
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) m[cat] = [];
      m[cat].push(it);
    }
    // Sort items within each category by bill/item code (1.01, 1.02, … 2.01, 10.01)
    for (const cat of Object.keys(m)) {
      m[cat].sort((a, b) => compareItemCode(a.itemCode, b.itemCode));
    }
    return m;
  }, [items]);

  const allCategoryKeys = useMemo(() => {
    const keys = Object.keys(grouped).filter(k => k !== "__uncategorised__");
    // Order categories by the lowest item code they contain, so bills appear
    // in BOQ order (Preliminaries → Site Clearance → Earthwork → …).
    keys.sort((a, b) => compareItemCode(grouped[a][0]?.itemCode, grouped[b][0]?.itemCode));
    if (grouped["__uncategorised__"]?.length) keys.push("__uncategorised__");
    return keys;
  }, [grouped]);

  const months = useMemo(() => Array.from({ length: maxMonth }, (_, i) => i + 1), [maxMonth]);

  if (bars.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Add stretches in the Gantt view first.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="text-sm border-collapse" style={{ minWidth: 200 + maxMonth * 64 + 80 }}>
        {/* thead sticky at top-14 (56px) = below main nav, page-level scroll.
            Using overflow-x-auto (not overflow-auto+maxHeight) so page scroll
            is the scroll context — inner-container sticky is unreliable when
            the page also scrolls. */}
        <thead className="sticky top-14 z-10">
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-20 min-w-[220px]" style={{ background: "#0F5F64" }}>
              BOQ Item
            </th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[72px] whitespace-nowrap">BOQ Qty</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[60px]">Unit</th>
            {months.map(m => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[64px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[80px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {allCategoryKeys.map((cat, catIdx) => {
            const catItems = grouped[cat] ?? [];
            const catLabel = cat === "__uncategorised__" ? "Uncategorised" : cat;
            const color = getCatColor(catIdx);
            const catHasBars = catItems.some(it => monthlyGrid[it.id] && Object.keys(monthlyGrid[it.id]).length > 0);
            if (!catHasBars) return null;

            return [
              <tr key={`cat-${cat}`} style={{ backgroundColor: `${color}12`, position: "sticky", top: 92, zIndex: 5 }}>
                <td
                  colSpan={3 + maxMonth + 1}
                  className="px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: `${color}dd`, color: "#fff" }}
                >
                  {catLabel}
                </td>
              </tr>,
              ...catItems
                .filter(it => monthlyGrid[it.id] && Object.keys(monthlyGrid[it.id]).length > 0)
                .map(item => {
                  const g = monthlyGrid[item.id] ?? {};
                  const rowTotal = plannedByItemId[item.id] ?? 0;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      data-testid={`monthly-row-${item.id}`}
                    >
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-gray-950 z-10 max-w-[320px]">
                        <HoverCard openDelay={120} closeDelay={40}>
                          <HoverCardTrigger asChild>
                            <span className="block truncate cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
                              {item.itemCode ? `[${item.itemCode}] ` : ""}{shortItemName(item.description)}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent align="start" side="bottom" className="w-96 max-w-[90vw]">
                            {item.itemCode && (
                              <span className="font-mono text-xs text-teal-700">{item.itemCode}</span>
                            )}
                            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap">
                              {item.description}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {fmtQty(item.currentQty, 1)} {item.unit}
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600 font-semibold">{fmtQty(item.currentQty, 1)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{item.unit}</td>
                      {months.map(m => {
                        const val = g[m] ?? 0;
                        return (
                          <td
                            key={m}
                            className={`px-2 py-1.5 text-right font-mono ${val > 0 ? "text-teal-700 font-semibold bg-teal-50/60 dark:bg-teal-900/20" : "text-slate-300 dark:text-slate-600"}`}
                          >
                            {val > 0 ? fmtQty(val, 1) : "—"}
                          </td>
                        );
                      })}
                      <td className={`px-3 py-1.5 text-right font-semibold font-mono ${
                        Math.abs(rowTotal - item.currentQty) < 0.01 ? "text-emerald-700"
                        : rowTotal < item.currentQty ? "text-amber-700"
                        : "text-red-700"
                      }`}>
                        {fmtQty(rowTotal, 1)}
                      </td>
                    </tr>
                  );
                }),
            ];
          })}

          {/* Grand total row */}
          {(() => {
            const grandMonthly: Record<number, number> = {};
            let grand = 0;
            for (const b of bars) {
              const duration = b.endMonth - b.startMonth;
              if (duration <= 0) continue;
              for (let m = Math.floor(b.startMonth); m < Math.ceil(b.endMonth); m++) {
                const overlap = Math.max(0, Math.min(b.endMonth, m + 1) - Math.max(b.startMonth, m));
                const calMonth = m; // m is already 1-indexed project month — no +1
                grandMonthly[calMonth] = (grandMonthly[calMonth] ?? 0) + b.plannedQty * (overlap / duration);
              }
              grand += b.plannedQty;
            }
            return (
              <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">TOTAL</td>
                <td />
                <td />
                {months.map(m => {
                  const val = grandMonthly[m] ?? 0;
                  return (
                    <td key={m} className={`px-2 py-2 text-right font-mono text-xs ${val > 0 ? "text-teal-800 dark:text-teal-300" : "text-slate-300 dark:text-slate-600"}`}>
                      {val > 0 ? fmtQty(val, 1) : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-teal-800 dark:text-teal-300 font-mono text-xs">{fmtQty(grand, 1)}</td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

// ─── Plan vs Actual ───────────────────────────────────────────────────────────

function PlanVsActualView({ projectId }: { projectId: number }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/boq/projects", projectId, "plan-vs-actual"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/plan-vs-actual`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>;
  if (!rows.length) return <div className="py-8 text-center text-muted-foreground text-sm">No planned items yet.</div>;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[220px]" style={{ background: "#0F5F64" }}>BOQ Item</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">BOQ Qty</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Planned to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Actual to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">BOQ Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">Planned Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">Actual Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">% Complete</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.boqItemId} className="border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-950 z-10 text-slate-700 dark:text-slate-300 max-w-[320px]">
                <HoverCard openDelay={120} closeDelay={40}>
                  <HoverCardTrigger asChild>
                    <span className="block truncate cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
                      {row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" side="bottom" className="w-96 max-w-[90vw]">
                    {row.itemCode && (
                      <span className="font-mono text-xs text-teal-700">{row.itemCode}</span>
                    )}
                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap">
                      {row.description}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fmtQty(row.currentQty, 1)} {row.unit}
                    </p>
                  </HoverCardContent>
                </HoverCard>
              </td>
              <td className="px-2 py-2 text-right font-mono">{fmtQty(row.currentQty, 1)} {row.unit}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(row.totalPlanned, 1)}</td>
              <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(row.totalActual, 1)}</td>
              <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtQty(row.boqAmount, 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(row.plannedAmount, 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(row.actualAmount, 0)}</td>
              <td className="px-2 py-2 text-right">
                <span className={`font-semibold ${
                  row.percentComplete >= 100 ? "text-emerald-700"
                  : row.percentComplete >= 80 ? "text-teal-700"
                  : row.percentComplete >= 50 ? "text-amber-700"
                  : "text-red-700"
                }`}>
                  {fmtQty(row.percentComplete, 1)}%
                </span>
              </td>
              <td className="px-2 py-2 text-right text-muted-foreground">{row.lastActivityDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold bg-slate-50 dark:bg-slate-800/40">
            <td className="px-3 py-2 sticky left-0 bg-slate-50 dark:bg-slate-800/40">Total</td>
            <td></td><td></td><td></td>
            <td className="px-2 py-2 text-right font-mono">{fmtQty(rows.reduce((s: number, r: any) => s + (r.boqAmount || 0), 0), 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(rows.reduce((s: number, r: any) => s + (r.plannedAmount || 0), 0), 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(rows.reduce((s: number, r: any) => s + (r.actualAmount || 0), 0), 0)}</td>
            <td></td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── StartDateBanner ─────────────────────────────────────────────────────────
// Inline prompt shown in WorkProgramme when no project start date is set.
// Saves directly via the program-settings PUT — no navigation required.

function StartDateBanner({ projectId }: { projectId: number }) {
  const [dateVal, setDateVal] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleSave() {
    if (!dateVal) return;
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/boq/projects/${projectId}/program-settings`, { projectStartDate: dateVal });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "program-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Project start date saved", description: "Gantt bars now show real calendar dates." });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 flex-wrap">
      <CalendarDays className="w-4 h-4 text-blue-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Set a project start date to use real calendar dates</p>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Gantt inputs will switch to date pickers and month headers will show real month names (e.g. "Jun '25").
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="date"
          value={dateVal}
          onChange={e => setDateVal(e.target.value)}
          className="h-8 rounded border border-blue-300 text-sm px-2 bg-white dark:bg-gray-900 dark:border-blue-700 dark:text-slate-200"
          data-testid="input-project-start-date-banner"
        />
        <Button
          size="sm"
          disabled={!dateVal || saving}
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-save-start-date-banner"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CalendarDays className="w-3.5 h-3.5 mr-1" />}
          Set Start Date
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkProgramme() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const [activeTab, setActiveTab] = useState("gantt");
  const [strImportOpen, setStrImportOpen] = useState(false);
  const [seqDialogOpen, setSeqDialogOpen] = useState(false);
  const [seqFronts, setSeqFronts] = useState("");         // "" = auto
  const [seqStagger, setSeqStagger] = useState("1");      // months (0 = concurrent)
  const [seqLag, setSeqLag] = useState("0.25");           // months
  const [seqStrGroups, setSeqStrGroups] = useState("");   // "" = same as road fronts
  const [seqBrgGroups, setSeqBrgGroups] = useState("");   // "" = same as road fronts
  const [seqRulesOpen, setSeqRulesOpen] = useState(false);
  // When true (default), structure-type BOQ items are excluded from auto-sequence
  // so imported per-location bars are not overlaid with auto-generated linear bars.
  // Uncheck only for legacy projects that have no imported structure bars.
  const [seqSkipStructureItems, setSeqSkipStructureItems] = useState(true);

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undoStack = useRef<WorkProgramBarWithItem[][]>([]);
  const redoStack = useRef<WorkProgramBarWithItem[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function pushSnapshot() {
    const current = queryClient.getQueryData<WorkProgramBarWithItem[]>(
      ["/api/boq/projects", projectId, "programme"]
    );
    if (!current) return;
    undoStack.current.push([...current]);
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  const restoreMutation = useMutation({
    mutationFn: (snapBars: WorkProgramBarWithItem[]) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme/restore`, {
        bars: snapBars.map(b => ({
          boqItemId: b.boqItemId,
          reachLabel: b.reachLabel,
          chainageFrom: b.chainageFrom,
          chainageTo: b.chainageTo,
          startMonth: b.startMonth,
          endMonth: b.endMonth,
          durationMode: b.durationMode,
          plannedQty: b.plannedQty,
          isQtyOverride: b.isQtyOverride,
          isDurationOverride: b.isDurationOverride,
          notes: b.notes,
          source: b.source,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
    },
    onError: () => { /* toast handled by parent */ },
  });

  function handleUndo() {
    if (!undoStack.current.length) return;
    const current = queryClient.getQueryData<WorkProgramBarWithItem[]>(
      ["/api/boq/projects", projectId, "programme"]
    );
    if (current) redoStack.current.push([...current]);
    const prev = undoStack.current.pop()!;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    restoreMutation.mutate(prev);
  }

  function handleRedo() {
    if (!redoStack.current.length) return;
    const current = queryClient.getQueryData<WorkProgramBarWithItem[]>(
      ["/api/boq/projects", projectId, "programme"]
    );
    if (current) undoStack.current.push([...current]);
    const next = redoStack.current.pop()!;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    restoreMutation.mutate(next);
  }

  const { data: project } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: progSettings } = useQuery<{
    workingDaysPerMonth: number; shiftHours: number; doubleShift: boolean;
    tipperCapacityT: number; avgTipperSpeedKmHr: number; loadTimeMin: number; unloadTimeMin: number;
    hmpChainageKm: number | null; wmmPlantChainageKm: number | null; quarryChainageKm: number | null;
    borrowChainageKm: number | null; disposalChainageKm: number | null; rmcChainageKm: number | null;
    hmpToSiteKm: number | null; wmmPlantToSiteKm: number | null; quarryToSiteKm: number | null;
    quarryToHmpKm: number | null; quarryToRmcKm: number | null; rmcToSiteKm: number | null;
    borrowToSiteKm: number | null; disposalDistanceKm: number | null;
    productivityMode: string; productivityOverrides: unknown | null;
    sequenceOptions: { fronts?: number | null; staggerMonths?: number; lagMonths?: number; structureGroups?: number | null; bridgeGroups?: number | null } | null;
  }>({
    queryKey: ["/api/boq/projects", projectId, "program-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/program-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isNaN(projectId),
    staleTime: 60_000,
  });

  // Merge program-settings values over legacy project fields for downstream consumers.
  // shiftHours (new name) maps to workingHoursPerDay for backward-compat with planning engine.
  const effectiveProject = project
    ? {
        ...project,
        workingDaysPerMonth: progSettings?.workingDaysPerMonth ?? project.workingDaysPerMonth ?? 25,
        workingHoursPerDay: (progSettings?.shiftHours ?? project.workingHoursPerDay ?? 8) * (progSettings?.doubleShift ? 2 : 1),
        // Legacy chainage fields (kept for backward compat)
        hmpChainageKm: progSettings?.hmpChainageKm ?? project.hmpChainageKm ?? null,
        wmmPlantChainageKm: progSettings?.wmmPlantChainageKm ?? project.wmmPlantChainageKm ?? null,
        quarryChainageKm: progSettings?.quarryChainageKm ?? project.quarryChainageKm ?? null,
        avgTipperSpeedKmHr: progSettings?.avgTipperSpeedKmHr ?? project.avgTipperSpeedKmHr ?? 30,
        // New lead & source distances
        hmpToSiteKm: progSettings?.hmpToSiteKm ?? null,
        wmmPlantToSiteKm: progSettings?.wmmPlantToSiteKm ?? null,
        quarryToSiteKm: progSettings?.quarryToSiteKm ?? null,
        quarryToHmpKm: progSettings?.quarryToHmpKm ?? null,
        quarryToRmcKm: progSettings?.quarryToRmcKm ?? null,
        rmcToSiteKm: progSettings?.rmcToSiteKm ?? null,
        borrowToSiteKm: progSettings?.borrowToSiteKm ?? null,
        disposalDistanceKm: progSettings?.disposalDistanceKm ?? null,
      }
    : project;

  const { data: items = [], isLoading: itemsLoading } = useQuery<BoqItemWithCategory[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: bars = [], isLoading: barsLoading } = useQuery<WorkProgramBarWithItem[]>({
    queryKey: ["/api/boq/projects", projectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/programme`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const itemIds = useMemo(() => items.map(i => i.id), [items]);
  const { data: recipesRaw = [] } = useQuery<Array<BoqItemEquipmentWithMaster & { boqItemId: number }>>({
    queryKey: ["/api/boq/projects", projectId, "item-equipment"],
    queryFn: async () => {
      if (!itemIds.length) return [];
      const results = await Promise.all(
        itemIds.map(id =>
          fetch(`/api/boq/items/${id}/equipment`, { credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then((rows: BoqItemEquipmentWithMaster[]) => rows.map(r => ({ ...r, boqItemId: id }))),
        ),
      );
      return results.flat();
    },
    enabled: itemIds.length > 0,
  });

  const recipesMap = useMemo(() => {
    const m = new Map<number, BoqItemEquipmentWithMaster[]>();
    for (const r of recipesRaw) {
      if (!m.has(r.boqItemId)) m.set(r.boqItemId, []);
      m.get(r.boqItemId)!.push(r);
    }
    return m;
  }, [recipesRaw]);

  const warnings = useMemo(() => {
    const planned: Record<number, number> = {};
    for (const b of bars) planned[b.boqItemId] = (planned[b.boqItemId] ?? 0) + b.plannedQty;
    let under = 0, over = 0, missing = 0;
    for (const it of items) {
      const p = planned[it.id] ?? 0;
      if (p === 0) missing++;
      else if (p < it.currentQty - 0.5) under++;
      else if (p > it.currentQty + 0.5) over++;
    }
    return { under, over, missing };
  }, [items, bars]);

  const autoGenMutation = useMutation({
    mutationFn: (barsPayload: Record<string, unknown>[]) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme/bulk`, { bars: barsPayload }),
    onMutate: pushSnapshot,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({
        title: "Programme generated",
        description: `Created ${(variables as unknown[]).length} bars at Month 1 — drag or set each item's start month to sequence the work.`,
      });
    },
    onError: () => toast({ title: "Auto-generate failed", variant: "destructive" }),
  });

  const autoBuildRecipesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/auto-build-recipes`, {});
      return res.json();
    },
    onSuccess: async (data: { recipied?: number; totalItems?: number; unrecipiedCount?: number }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "item-equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({
        title: "Recipes built",
        description: `${data?.recipied ?? 0} of ${data?.totalItems ?? 0} items got equipment & labour${data?.unrecipiedCount ? ` · ${data.unrecipiedCount} need a work-type` : ""}.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Auto-build recipes failed",
        description: String(err?.message ?? err ?? "Unknown error"),
        variant: "destructive",
      }),
  });

  const autoSequenceMutation = useMutation({
    mutationFn: async (opts: { fronts?: number; staggerMonths: number; lagMonths: number; structureGroups?: number; bridgeGroups?: number; disableStructureFronts?: boolean }) => {
      const body: Record<string, unknown> = { staggerMonths: opts.staggerMonths, lagMonths: opts.lagMonths };
      if (opts.fronts && opts.fronts > 0) body.fronts = opts.fronts;
      if (opts.structureGroups && opts.structureGroups > 0) body.structureGroups = opts.structureGroups;
      if (opts.bridgeGroups && opts.bridgeGroups > 0) body.bridgeGroups = opts.bridgeGroups;
      // Always send disableStructureFronts as an explicit boolean so the server can rely on it
      body.disableStructureFronts = opts.disableStructureFronts !== false;
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/auto-sequence`, body);
      return res.json();
    },
    onMutate: pushSnapshot,
    onSuccess: async (data: { bars?: number; fronts?: number }) => {
      setSeqDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "program-settings"] });
      toast({
        title: "Programme sequenced",
        description: `${data?.bars ?? 0} bars across ${data?.fronts ?? 0} reach-wise fronts, dependency-ordered.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Auto-sequence failed",
        description: String(err?.message ?? err ?? "Unknown error"),
        variant: "destructive",
      }),
  });

  // Pre-populate dialog with last-used sequence options when it opens
  function openSeqDialog() {
    const stored = progSettings?.sequenceOptions;
    if (stored) {
      setSeqFronts(stored.fronts ? String(stored.fronts) : "");
      setSeqStagger(stored.staggerMonths !== undefined ? String(stored.staggerMonths) : "1");
      setSeqLag(String(stored.lagMonths ?? 0.25));
      setSeqStrGroups((stored as any).structureGroups ? String((stored as any).structureGroups) : "");
      setSeqBrgGroups((stored as any).bridgeGroups ? String((stored as any).bridgeGroups) : "");
      if ((stored as any).enableStructureFronts !== undefined) {
        // skip = true means DO NOT enable structure fronts (inverted from stored field)
        setSeqSkipStructureItems(!Boolean((stored as any).enableStructureFronts));
      }
    }
    setSeqDialogOpen(true);
  }

  function runAutoSequence() {
    const fronts = parseInt(seqFronts) || 0;
    // Allow stagger = 0 (concurrent fronts)
    const staggerRaw = parseFloat(seqStagger);
    const stagger = !isNaN(staggerRaw) ? staggerRaw : 1;
    const lagRaw = parseFloat(seqLag);
    const lag = !isNaN(lagRaw) ? lagRaw : 0.25;
    const strGroups = parseInt(seqStrGroups) || 0;
    const brgGroups = parseInt(seqBrgGroups) || 0;
    autoSequenceMutation.mutate({
      fronts: fronts > 0 ? fronts : undefined,
      staggerMonths: stagger,
      lagMonths: lag,
      structureGroups: strGroups > 0 ? strGroups : undefined,
      bridgeGroups: brgGroups > 0 ? brgGroups : undefined,
      disableStructureFronts: seqSkipStructureItems,
    });
  }

  function handleAutoGenerate() {
    if (!effectiveProject) return;
    const programmedIds = new Set(bars.map(b => b.boqItemId));
    const roadLen = effectiveProject.roadLengthKm ?? 0;
    const workingDays = effectiveProject.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT;
    const workingHrs = effectiveProject.workingHoursPerDay ?? WORKING_HRS_DEFAULT;
    const prodSettings: ProductivitySettings | null = progSettings ? {
      mode: (progSettings.productivityMode ?? "snl") as "snl" | "company" | "project",
      overrides: progSettings.productivityOverrides as Record<string, { outputPerHr?: number; unit?: string }> | null,
    } : null;

    // Exclude structure-planned items — either manually tagged or already carrying
    // imported structure-location bars. These must be programmed via Structure Schedule
    // Import at specific chainage locations, not as full-road linear bars.
    const toCreate = items.filter(it =>
      !programmedIds.has(it.id) &&
      (it.currentQty ?? 0) > 0 &&
      (it as any).planningWorkType !== "structure" &&
      !structureImportItemIds.has(it.id),
    );

    const skippedStructure = items.filter(it =>
      !programmedIds.has(it.id) &&
      (it.currentQty ?? 0) > 0 &&
      ((it as any).planningWorkType === "structure" || structureImportItemIds.has(it.id)),
    ).length;

    if (toCreate.length === 0) {
      const msg = skippedStructure > 0
        ? `Every road/linear item is already programmed. ${skippedStructure} structure item(s) were skipped — use "Import Structures" to programme them.`
        : "Every item with a quantity is already programmed.";
      toast({ title: "Nothing to generate", description: msg });
      return;
    }

    const payload = toCreate.map(item => {
      const qty = item.currentQty;
      const equipment: EquipmentProductivity[] = (recipesMap.get(item.id) ?? []).map(e => ({
        outputUnit: e.outputUnit,
        outputTheoretical: e.outputTheoretical,
        outputEfficiency: e.outputEfficiency,
        standardOutputs: e.standardOutputs as Array<{ unit: string; outputPerHr: number }> | null,
        count: e.count ?? 1,
      }));
      const lc = item.layerConfig as LayerConfig | null;
      const itemType = (lc?.mixType ?? lc?.layerType) ?? null;
      const dur = qty > 0 && (equipment.length || prodSettings?.mode === "project")
        ? calculateAutoDurationFull(qty, item.unit, equipment, workingHrs, workingDays, prodSettings, itemType)
        : null;
      const sm = 1;
      const em = dur?.months ? +(sm + dur.months).toFixed(2) : sm + 1;
      return {
        boqItemId: item.id,
        chainageFrom: 0,
        chainageTo: roadLen > 0 ? roadLen : 1,
        startMonth: sm,
        endMonth: em,
        plannedQty: qty,
        isQtyOverride: false,
        isDurationOverride: !dur,
        source: "auto_generate",
      };
    });

    if (skippedStructure > 0) {
      toast({
        title: `${skippedStructure} structure item(s) skipped`,
        description: `Road-style bars were not created for culverts, bridges or other structure items. Use "Import Structures" to schedule them at correct chainage locations.`,
      });
    }

    autoGenMutation.mutate(payload);
  }

  // Cleanup mutation — removes stray auto-sequence / auto-generate bars from structure items.
  // Preserves imported structure_location bars and manually placed bars.
  const cleanStructureBarsMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme/clean-structure-bars`, {}),
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({
        title: data?.deleted > 0 ? `Cleaned ${data.deleted} stray bar(s)` : "Already clean",
        description: data?.message ?? "Structure items now show only imported or manual bars.",
      });
    },
    onError: () => toast({ title: "Cleanup failed", description: "Could not remove stray bars.", variant: "destructive" }),
  });

  // Items that have at least one imported structure-location bar are implicitly
  // structure-planned even if planningWorkType was never set manually.
  const structureImportItemIds = useMemo(
    () => new Set(bars.filter(b => (b as any).source === "structure_import").map(b => b.boqItemId)),
    [bars],
  );

  // Regex kept in sync with the server-side clean endpoint.
  // Legacy bars created before the source column existed often have
  // source="manual" but carry one of these auto-generated label values.
  const AUTO_LABEL_RE = /^(Full Length|Structures|Bridges|Reach \d+|Struct\. Front \d+|Bridge Grp \d+)$/;

  // Show the "Clean structure bars" button when there are stray bars on
  // structure items — uses the same filter logic as the server endpoint.
  const hasStrayStructureBars = useMemo(() => {
    const structureItemIds = new Set([
      ...items.filter(it => (it as any).planningWorkType === "structure").map(it => it.id),
      ...structureImportItemIds,
    ]);
    if (structureItemIds.size === 0) return false;
    return bars.some(b => {
      if (!structureItemIds.has(b.boqItemId)) return false;
      if ((b as any).planningMode === "structure_location") return false;
      const src = (b as any).source as string | null | undefined;
      if (src === "auto-sequence" || src === "auto_generate") return true;
      if (!src) return true; // null = legacy bar
      if (src === "manual" && AUTO_LABEL_RE.test((b as any).reachLabel ?? "")) return true;
      return false;
    });
  }, [items, bars, structureImportItemIds]);

  const isLoading = itemsLoading || barsLoading;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="breadcrumb">
        <Link href="/work-program">
          <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Work Program &amp; BOQ
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <Link href={`/work-program/${projectId}`}>
          <a className="hover:text-slate-700 transition-colors truncate max-w-[180px]">
            {project?.name ?? "…"}
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <span className="text-slate-700 font-medium flex items-center gap-1">
          <CalendarDays className="w-3.5 h-3.5" />
          Work Programme
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Work Programme</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {effectiveProject?.name}
            {effectiveProject?.contractNo ? ` · ${effectiveProject.contractNo}` : ""}
            {effectiveProject?.roadLengthKm ? ` · ${effectiveProject.roadLengthKm} km road` : ""}
            {effectiveProject?.startDate && effectiveProject?.totalMonths
              ? ` · ${monthLabel(1, effectiveProject.startDate)} – ${monthLabel(effectiveProject.totalMonths, effectiveProject.startDate)}`
              : ""}
            {effectiveProject && (
              <span className="ml-1 text-teal-600">
                · {effectiveProject.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT}d/mo · {effectiveProject.workingHoursPerDay ?? WORKING_HRS_DEFAULT}h/d
              </span>
            )}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Click cell to add · Ch inputs auto-calculate qty
            {effectiveProject?.startDate ? " · Date pickers active — AUTO stretches the bar to fit output; FIX locks the window" : " · M# = start month (set a start date in Settings for date pickers)"}
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={() => autoBuildRecipesMutation.mutate()}
              disabled={autoBuildRecipesMutation.isPending}
              data-testid="button-auto-build-recipes"
              title="Classify every BOQ item by work-type and attach equipment + labour from the planning master. Durations and the Gantt come from these."
            >
              {autoBuildRecipesMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-1" />}
              Auto-build recipes
            </Button>
          )}
          {activeTab === "gantt" && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!canUndo || restoreMutation.isPending}
                onClick={handleUndo}
                data-testid="button-undo"
                title="Undo last change"
                className="border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                {restoreMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Undo2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canRedo || restoreMutation.isPending}
                onClick={handleRedo}
                data-testid="button-redo"
                title="Redo"
                className="border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {items.some(it => (it as any).planningWorkType === "structure") && (
            <Button
              variant="outline"
              size="sm"
              className="border-violet-300 text-violet-700 hover:bg-violet-50"
              onClick={() => setStrImportOpen(true)}
              data-testid="button-import-structure-schedule"
              title="Import a per-location structure schedule from Excel. Creates Gantt bars for each structure (bridge, culvert, etc.) at the correct chainage."
            >
              <Building2 className="w-4 h-4 mr-1" />
              Import Structures
            </Button>
          )}
          {hasStrayStructureBars && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => cleanStructureBarsMutation.mutate()}
              disabled={cleanStructureBarsMutation.isPending}
              data-testid="button-clean-structure-bars"
              title="Remove auto-generated road-style bars from structure items (culverts, bridges, etc.). Imported structure-location bars and manually placed bars are preserved."
            >
              {cleanStructureBarsMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Scissors className="w-4 h-4 mr-1" />}
              Clean Structure Bars
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={openSeqDialog}
              disabled={autoSequenceMutation.isPending}
              data-testid="button-auto-sequence"
              title="Open the auto-sequence settings dialog to configure fronts, stagger, and lag, then run the sequencer."
            >
              {autoSequenceMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <ArrowLeftRight className="w-4 h-4 mr-1" />}
              Auto-sequence
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-teal-300 text-teal-700 hover:bg-teal-50"
              onClick={handleAutoGenerate}
              disabled={autoGenMutation.isPending}
              data-testid="button-auto-generate-programme"
              title="Create a bar for every unprogrammed item. Duration is auto-computed from SNL equipment norms; all start at Month 1 — then drag or set each item's start month."
            >
              {autoGenMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-1" />}
              Auto-generate
            </Button>
          )}
          <Link href={`/work-program/${projectId}/demand`}>
            <a>
              <Button variant="outline" size="sm" data-testid="button-bom-demand">
                <BookOpen className="w-4 h-4 mr-1" />
                BOM &amp; Demand
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/settings`}>
            <a>
              <Button variant="outline" size="sm" data-testid="button-programme-settings"
                className="border-teal-200 text-teal-700 hover:bg-teal-50">
                <Settings2 className="w-4 h-4 mr-1" />
                Settings
              </Button>
            </a>
          </Link>
        </div>
      </div>

      {/* Project start date prompt — inline date input to set directly from this page */}
      {project && !effectiveProject?.startDate && (
        <StartDateBanner projectId={projectId} />
      )}

      {/* Warning banner */}
      {(warnings.missing + warnings.under + warnings.over) > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            {warnings.missing > 0 && (
              <p className="text-sm text-amber-700"><strong>{warnings.missing}</strong> item{warnings.missing > 1 ? "s" : ""} not yet programmed</p>
            )}
            {warnings.under > 0 && (
              <p className="text-sm text-amber-700"><strong>{warnings.under}</strong> item{warnings.under > 1 ? "s" : ""} under-planned vs BOQ</p>
            )}
            {warnings.over > 0 && (
              <p className="text-sm text-red-700"><strong>{warnings.over}</strong> item{warnings.over > 1 ? "s" : ""} planned qty exceeds BOQ</p>
            )}
          </div>
        </div>
      )}

      {/* Structure Schedule Import wizard */}
      <StructureImportWizard
        open={strImportOpen}
        onOpenChange={setStrImportOpen}
        projectId={projectId}
        boqItems={items}
        onImported={() =>
          queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] })
        }
      />

      {/* Auto-sequence settings dialog */}
      <Dialog open={seqDialogOpen} onOpenChange={setSeqDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-purple-600" />
              Auto-Sequence Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              The sequencer splits the project into road fronts, assigns structure and bridge items to their
              matching front, and orders all items by MoRTH construction stage within each front.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="seq-fronts" className="text-xs font-medium">Road fronts</Label>
                <Input
                  id="seq-fronts"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Auto"
                  value={seqFronts}
                  onChange={e => setSeqFronts(e.target.value)}
                  data-testid="input-seq-fronts"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Blank = auto from road length</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seq-stagger" className="text-xs font-medium">Front stagger (months)</Label>
                <Input
                  id="seq-stagger"
                  type="number"
                  min={0}
                  max={6}
                  step={0.25}
                  value={seqStagger}
                  onChange={e => setSeqStagger(e.target.value)}
                  data-testid="input-seq-stagger"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">0 = all fronts start together</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seq-lag" className="text-xs font-medium">Stage lag (months)</Label>
                <Input
                  id="seq-lag"
                  type="number"
                  min={0}
                  max={2}
                  step={0.25}
                  value={seqLag}
                  onChange={e => setSeqLag(e.target.value)}
                  data-testid="input-seq-lag"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Handover gap between stages</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="seq-str-groups" className="text-xs font-medium">Structure groups</Label>
                <Input
                  id="seq-str-groups"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Same as road fronts"
                  value={seqStrGroups}
                  onChange={e => setSeqStrGroups(e.target.value)}
                  data-testid="input-seq-str-groups"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Culvert / drain chainage zones. Blank = match road fronts</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seq-brg-groups" className="text-xs font-medium">Bridge groups</Label>
                <Input
                  id="seq-brg-groups"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Same as road fronts"
                  value={seqBrgGroups}
                  onChange={e => setSeqBrgGroups(e.target.value)}
                  data-testid="input-seq-brg-groups"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Bridge chainage zones (independent of road fronts). Blank = match road fronts</p>
              </div>
            </div>

            {/* Skip structure items — checked by default so imported per-location bars are not overlaid */}
            <label className="flex items-start gap-2.5 p-2.5 rounded-md bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={seqSkipStructureItems}
                onChange={e => setSeqSkipStructureItems(e.target.checked)}
                className="mt-0.5"
                data-testid="checkbox-skip-structure-items"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Skip structure-item scheduling (using imported bars)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  When checked, auto-sequence ignores structure-type BOQ items and removes any
                  previously auto-generated bars for them — leaving your imported per-location
                  structure bars untouched. Uncheck only for older projects with no structure import.
                </p>
              </div>
            </label>

            {/* Sequence Rules collapsible */}
            <div className="rounded-md border">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-muted/40"
                onClick={() => setSeqRulesOpen(o => !o)}
                data-testid="button-toggle-seq-rules"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Construction stage order
                </span>
                {seqRulesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {seqRulesOpen && (
                <div className="px-3 pb-3 pt-1 grid grid-cols-3 gap-3 text-xs">
                  {/* Pavement track */}
                  <div>
                    <p className="font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide text-[10px]">Road (pavement)</p>
                    <ol className="space-y-0.5">
                      {SEQUENCE_RULES.pavement.map(r => (
                        <li key={r.stage} className="flex items-start gap-1">
                          <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-px">{r.stage}</span>
                          <span className="text-slate-600 dark:text-slate-400">{r.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {/* Culvert track */}
                  <div>
                    <p className="font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide text-[10px]">Culverts / Drains</p>
                    <ol className="space-y-0.5">
                      {SEQUENCE_RULES.culvert.map(r => (
                        <li key={r.stage} className="flex items-start gap-1">
                          <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-px">{r.stage}</span>
                          <span className="text-slate-600 dark:text-slate-400">{r.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {/* Bridge track */}
                  <div>
                    <p className="font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide text-[10px]">Bridges / Major Structures</p>
                    <ol className="space-y-0.5">
                      {SEQUENCE_RULES.bridge.map(r => (
                        <li key={r.stage} className="flex items-start gap-1">
                          <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-px">{r.stage}</span>
                          <span className="text-slate-600 dark:text-slate-400">{r.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSeqDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={runAutoSequence}
              disabled={autoSequenceMutation.isPending}
              data-testid="button-run-auto-sequence"
            >
              {autoSequenceMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Sequencing…</>
                : <><ArrowLeftRight className="w-3.5 h-3.5 mr-1" />Run Sequence</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <FileSpreadsheet className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-sm">No BOQ items in this project yet.</p>
            <p className="text-sm">Import a BOQ first, then programme the work here.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length > 0 && effectiveProject && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="gantt" className="flex items-center gap-1.5" data-testid="tab-gantt">
              <GanttChartSquare className="w-3.5 h-3.5" /> Gantt
            </TabsTrigger>
            <TabsTrigger value="monthly" className="flex items-center gap-1.5" data-testid="tab-monthly">
              <TableProperties className="w-3.5 h-3.5" /> Monthly Plan
            </TabsTrigger>
            <TabsTrigger value="pva" className="flex items-center gap-1.5" data-testid="tab-pva">
              <ArrowLeftRight className="w-3.5 h-3.5" /> Plan vs Actual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gantt">
            {effectiveProject.totalMonths ? (
              <InlineGanttTable
                project={effectiveProject}
                items={items}
                bars={bars}
                recipesMap={recipesMap}
                projectId={projectId}
                onBeforeMutate={pushSnapshot}
                productivitySettings={progSettings ? {
                  mode: (progSettings.productivityMode ?? "snl") as "snl" | "company" | "project",
                  overrides: progSettings.productivityOverrides as Record<string, { outputPerHr?: number; unit?: string }> | null,
                } : null}
              />
            ) : (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Set the total duration (months) on the project to enable the Gantt view.
              </div>
            )}
          </TabsContent>

          <TabsContent value="monthly">
            <MonthlyPlanView project={effectiveProject} items={items} bars={bars} />
          </TabsContent>

          <TabsContent value="pva">
            <PlanVsActualView projectId={projectId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
