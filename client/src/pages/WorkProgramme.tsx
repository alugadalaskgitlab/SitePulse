import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Plus, Trash2,
  AlertTriangle, CheckCircle2, Loader2, CalendarDays,
  Scissors, BookOpen, ChevronDown, ChevronUp, Info,
  GanttChartSquare, TableProperties, ArrowLeftRight, Settings2, Sparkles,
  Undo2, Redo2, Upload, MapPin, Building2, Handshake,
  Pencil, MoreHorizontal, X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  formatDateForInput,
  fmtQty,
  WORKING_DAYS_DEFAULT,
  WORKING_HRS_DEFAULT,
  type EquipmentProductivity,
  type LayerConfig,
  type ProductivitySettings,
  isEarthworkBoqItem,
  executionArrangementCategoryForItem,
  bituminousItemTypeOf,
} from "@shared/planningEngine";
// 027A: true calendar axis — single source of truth for date↔index↔pixel on the Gantt.
// Aliased to the legacy names so every existing call site uses calendar-true conversion.
import {
  monthIndexToDateCal as monthIndexToDate,
  dateToMonthIndexCal as dateToMonthIndex,
  monthIndexToAxisX,
  axisMonthCount,
  calendarDaysFromIdx,
  displayFinishDateCal,
  finishDateInputToIdx,
} from "@shared/calendarAxis";
import { BarArrangementPanel } from "@/components/BarArrangementPanel";
import { ExecutionStateBadge, useBarExecutionState } from "@/components/ExecutionStateBadge";
import { SEQUENCE_RULES, validateStretches, type RoadStretchInput } from "@shared/programmeSequencer";
import { BAR_SIDES, BAR_SIDE_LABELS, barSideLabel, geometryApplicability, areSidesDistinctCorridors } from "@shared/barSide";
import { isStructureOrLocationScheduledItem, isShoulderDesc, classifyShoulderLayer, SHOULDER_DEPENDENCY_NOTES, SHOULDER_CLASSES, type ShoulderClass } from "@shared/workTypeRecipes";
import { getWorkCategoryLabel } from "@shared/boqWorkCategories";
import { shortItemName } from "@/lib/itemName";
import { PlanVsActualTable } from "@/components/PlanVsActualTable";
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

function CoverageBadge({ planned, boqQty, unit, isStructureItem }: { planned: number; boqQty: number; unit: string; isStructureItem?: boolean }) {
  if (planned === 0) {
    const full = isStructureItem
      ? "Not programmed — schedule/location required."
      : "Not programmed";
    const compact = isStructureItem ? "Not programmed" : full;
    return (
      <span
        title={full}
        className="inline-flex max-w-[220px] shrink truncate whitespace-nowrap text-[12px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"
      >
        {compact}
      </span>
    );
  }
  const diff = planned - boqQty;
  const absDiff = Math.abs(diff);
  // Treat differences < 0.5 unit as "fully covered" to avoid showing "Over/Under by 0"
  // due to floating-point rounding when the gap is smaller than display precision.
  if (absDiff < 0.5) return (
    <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3 shrink-0" /> Fully covered
    </span>
  );
  if (diff < 0) return (
    <span title={`Under by ${fmtQty(absDiff)} ${unit}`} className="inline-flex items-center gap-1 max-w-[200px] shrink truncate whitespace-nowrap text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3 shrink-0" /> Under by {fmtQty(absDiff)} {unit}
    </span>
  );
  return (
    <span title={`Over by ${fmtQty(absDiff)} ${unit}`} className="inline-flex items-center gap-1 max-w-[200px] shrink truncate whitespace-nowrap text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3 shrink-0" /> Over by {fmtQty(absDiff)} {unit}
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
  /** 029A: deliberate edit mode — parent allows one active editor at a time. */
  isEditing: boolean;
  onRequestEdit: (barId: number) => void;
  onCloseEdit: (barId: number) => void;
  registerEditorApi: (api: StretchEditorApi | null) => void;
}

/** 029A: imperative handle the active editor row exposes to the parent so the
 *  one-editor-at-a-time guard can Save / Discard on the user's behalf. */
export interface StretchEditorApi {
  /** Returns true if the save was actually dispatched (false = blocked by validation). */
  save: () => boolean;
  cancel: () => void;
  isDirty: () => boolean;
}

function StretchRow({
  bar, itemBars, item, project, recipesMap, projectId, color, isFirst, totalMonths, colW, onDelete, onSplit,
  onBeforeMutate,
  productivitySettings,
  isEditing, onRequestEdit, onCloseEdit, registerEditorApi,
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

  // Instruction 026 §7: per-bar execution-arrangement panel (earthwork bars only)
  const [showArrangements, setShowArrangements] = useState(false);
  // Instruction 028: category resolution — earthwork OR bituminous bars get the
  // arrangement affordances; everything else stays untouched.
  const arrangementCategory = useMemo<"earthwork" | "bituminous" | null>(() => {
    try {
      return executionArrangementCategoryForItem(item as any);
    } catch { return null; }
  }, [item]);
  const arrangementItemType = useMemo<string | null>(() => {
    if (arrangementCategory !== "bituminous") return null;
    try { return bituminousItemTypeOf(item as any); } catch { return null; }
  }, [item, arrangementCategory]);
  const isEarthworkBar = arrangementCategory != null;

  // Instruction 027 §1-2: compact execution-state badge per arrangement-eligible bar
  const executionState = useBarExecutionState({
    projectId,
    barId: bar.id,
    boqItemId: bar.boqItemId,
    barPlannedQty: Number(bar.plannedQty ?? 0),
    unit: (bar as any).canonicalUnit ?? bar.unit ?? "CUM",
    enabled: isEarthworkBar,
    category: arrangementCategory,
    itemType: arrangementItemType,
  });

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
  // 029A: execution priority (Batch 029 sequenceOrder) editable in edit mode.
  const [prio, setPrio] = useState(() =>
    (bar as any).sequenceOrder != null ? String((bar as any).sequenceOrder) : "");
  // 030A: side + planned geometry (edit-mode local state). "" = Unspecified.
  const [sideVal, setSideVal] = useState<string>(() => (bar as any).side ?? "");
  const [widthStr, setWidthStr] = useState<string>(() =>
    (bar as any).plannedWidthM != null ? String((bar as any).plannedWidthM) : "");
  const [thickStr, setThickStr] = useState<string>(() =>
    (bar as any).plannedThicknessMm != null ? String((bar as any).plannedThicknessMm) : "");

  // Structure-aware mode: for bridge/CD/culvert items, qty is entered directly per location.
  const isStructure = isStructureOrLocationScheduledItem(item as any, {
    hasStructureImportBar: itemBars.some(b => (b as any).source === "structure_import"),
  });
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
    setPrio((bar as any).sequenceOrder != null ? String((bar as any).sequenceOrder) : "");
    setSideVal((bar as any).side ?? "");
    setWidthStr((bar as any).plannedWidthM != null ? String((bar as any).plannedWidthM) : "");
    setThickStr((bar as any).plannedThicknessMm != null ? String((bar as any).plannedThicknessMm) : "");
  }, [bar.chainageFrom, bar.chainageTo, bar.startMonth, bar.endMonth, bar.durationMode, bar.plannedQty, (bar as any).sequenceOrder, (bar as any).side, (bar as any).plannedWidthM, (bar as any).plannedThicknessMm]);

  // 030A: which geometry fields are relevant to this bar's layer type.
  // Structure/location bars use location identity — no road-side geometry.
  const geomApp = useMemo(() => {
    if (isStructure) return { side: false, width: false, thickness: false, suggestQty: false };
    return geometryApplicability((item.layerConfig as LayerConfig | null)?.layerType ?? null);
  }, [isStructure, item.layerConfig]);

  const cfNum = parseFloat(cf);
  const ctNum = parseFloat(ct);
  const multNum = parseFloat(mult);
  // 027A Part 0.2: validate RAW values before any fallback is applied, so a
  // missing/unparseable date can never be silently rendered at a default position.
  const smRawNum = parseFloat(startM);
  const startDateInvalid = !Number.isFinite(smRawNum);
  const smNum = Number.isFinite(smRawNum) ? smRawNum : 1; // fallback only for downstream math; rendering/saving is gated on validity
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

  // ── 030A: suggested calculated quantity (constant cross-section only) ──────
  // length(m) × width(m) [× thickness(m) for CUM]. Only offered when the unit is
  // a plain area/volume unit — MT would need a configured density (never guessed).
  // Never overwrites the manual quantity: the user must click to apply.
  const suggestedQty = useMemo(() => {
    if (!geomApp.suggestQty || isStructure || !validCh) return null;
    const wNum = parseFloat(widthStr);
    if (!Number.isFinite(wNum) || wNum <= 0) return null;
    const lenM = (ctNum - cfNum) * 1000;
    const unit = ((item as any).canonicalUnit ?? item.unit ?? "").toUpperCase();
    if (unit === "SQM") return +(lenM * wNum).toFixed(2);
    if (unit === "CUM") {
      const tNum = parseFloat(thickStr);
      if (!Number.isFinite(tNum) || tNum <= 0) return null;
      return +(lenM * wNum * (tNum / 1000)).toFixed(2);
    }
    return null; // MT etc. — needs a configured density (030B territory)
  }, [geomApp.suggestQty, isStructure, validCh, cfNum, ctNum, widthStr, thickStr, item]);

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
      effectiveQty, (item as any).canonicalUnit ?? item.unit, equipment, workingHrs, workingDays,
      productivitySettings, itemType,
    );
  }, [effectiveQty, (item as any).canonicalUnit ?? item.unit, equipment, workingHrs, workingDays, productivitySettings, itemType]);

  // ── Chainage overlap detection (side-aware — mirrors validateStretches) ────
  // "overlap": genuine conflict (same side / full_width / both_sides sharing chainage)
  // "confirm_side": chainage shared but at least one side is unspecified — the
  //   check can't decide; ask the user to confirm side instead of crying overlap.
  // null: no conflict (incl. distinct corridors like LHS vs RHS — normal planning).
  const chainageOverlapKind = useMemo((): "overlap" | "confirm_side" | null => {
    if (!validCh) return null;
    // Live edited side while in edit mode (empty = unspecified); persisted side otherwise.
    const mySide = isEditing ? (sideVal || null) : ((bar as any).side ?? null);
    let needsSideConfirm = false;
    for (const b of itemBars) {
      if (b.id === bar.id) continue;
      const bcf = b.chainageFrom ?? 0;
      const bct = b.chainageTo ?? 0;
      if (bct <= bcf) continue;
      // Two intervals [cfNum, ctNum) and [bcf, bct) overlap if bcf < ctNum && bct > cfNum
      if (!(bcf < ctNum && bct > cfNum)) continue;
      const otherSide = (b as any).side ?? null;
      if (areSidesDistinctCorridors(mySide, otherSide)) continue; // e.g. LHS vs RHS — not an overlap
      if (mySide == null || otherSide == null) { needsSideConfirm = true; continue; }
      return "overlap";
    }
    return needsSideConfirm ? "confirm_side" : null;
  }, [itemBars, bar.id, bar, validCh, cfNum, ctNum, isEditing, sideVal]);

  // ── Duration preservation (Rule 4) ────────────────────────────────────────
  const autoDurationMonths = (autoDuration?.months ?? 0) > 0 ? autoDuration!.months : null;
  const savedDurationMonths = bar.endMonth - bar.startMonth;
  const endMRawNum = parseFloat(endM);
  // Finish is user-controlled only in fixed mode; in auto mode it is derived.
  const endDateInvalid = durationModeState === "fixed" && !Number.isFinite(endMRawNum);
  const endMNum = Number.isFinite(endMRawNum) ? endMRawNum : (smNum + 1); // fallback only for downstream math

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
    // Part 0.2: never persist invented fallback dates — block save while the
    // raw start/finish values are missing, unparseable, or reversed.
    if (startDateInvalid || endDateInvalid || (durationModeState === "fixed" && endMRawNum < smRawNum)) return false;
    onBeforeMutate?.();
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
    // Persisted endDate = INCLUSIVE displayed finish (boundary − 1 day, clamped
    // to >= start) so consumers like SiteEntry (date <= endDate) match the UI.
    const endDateVal = project.startDate
      ? formatDateForInput(displayFinishDateCal(em, project.startDate, smNum))
      : null;
    // 029A: execution priority (Batch 029 sequenceOrder) persists with the row save.
    const prioTrim = prio.trim();
    const prioNum = prioTrim === "" ? null : parseInt(prioTrim, 10);
    patch.mutate({
      chainageFrom: validCh ? cfNum : bar.chainageFrom,
      chainageTo: validCh ? ctNum : bar.chainageTo,
      plannedQty: qty,
      startMonth: smNum,
      endMonth: em,
      isQtyOverride,
      isDurationOverride,
      durationMode: durationModeState,
      sequenceOrder: prioNum != null && Number.isFinite(prioNum) && prioNum > 0 ? prioNum : null,
      // 030A: side + planned geometry. "" = Unspecified → null (never silently Full Width).
      ...(geomApp.side ? { side: sideVal || null } : {}),
      ...(geomApp.width ? { plannedWidthM: widthStr.trim() !== "" && Number.isFinite(parseFloat(widthStr)) && parseFloat(widthStr) > 0 ? parseFloat(widthStr) : null } : {}),
      ...(geomApp.thickness ? { plannedThicknessMm: thickStr.trim() !== "" && Number.isFinite(parseFloat(thickStr)) && parseFloat(thickStr) > 0 ? parseFloat(thickStr) : null } : {}),
      ...(startDateVal != null ? { startDate: startDateVal, endDate: endDateVal } : {}),
    }, {
      // 029A §8: successful save returns the row to read mode.
      onSuccess: () => onCloseEdit(bar.id),
    });
    return true;
  }

  // 029A §7: Cancel restores every persisted value and exits edit mode.
  function cancelEdit() {
    dirty.current = false;
    setCf(bar.chainageFrom != null ? String(bar.chainageFrom) : "");
    setCt(bar.chainageTo != null ? String(bar.chainageTo) : "");
    setStartM(String(+(bar.startMonth).toFixed(1)));
    setEndM(String(+(bar.endMonth).toFixed(1)));
    setDurationModeState((bar.durationMode as "auto" | "fixed") ?? "auto");
    lockedDurationRef.current = bar.endMonth - bar.startMonth;
    const len0 = (bar.chainageTo ?? 0) - (bar.chainageFrom ?? 0);
    if (len0 > 0 && bar.plannedQty > 0) setMult(String(+(bar.plannedQty / len0).toFixed(4)));
    else if (roadLen > 0 && boqQty > 0) setMult(String(+(boqQty / roadLen).toFixed(4)));
    if (isStructure) setStructQtyStr(bar.plannedQty > 0 ? String(bar.plannedQty) : "");
    setPrio((bar as any).sequenceOrder != null ? String((bar as any).sequenceOrder) : "");
    setSideVal((bar as any).side ?? "");
    setWidthStr((bar as any).plannedWidthM != null ? String((bar as any).plannedWidthM) : "");
    setThickStr((bar as any).plannedThicknessMm != null ? String((bar as any).plannedThicknessMm) : "");
    onCloseEdit(bar.id);
  }

  // 029A §5: while editing, expose Save/Cancel/isDirty to the parent's
  // one-active-editor guard (refs keep the latest closures without re-registering).
  const saveRef = useRef(save); saveRef.current = save;
  const cancelRef = useRef(cancelEdit); cancelRef.current = cancelEdit;
  useEffect(() => {
    if (!isEditing) return;
    registerEditorApi({
      save: () => saveRef.current() === true,
      cancel: () => cancelRef.current(),
      isDirty: () => dirty.current,
    });
    return () => registerEditorApi(null);
  }, [isEditing, registerEditorApi]);

  // 029A review fix: warn on full page unload while an edit has unsaved changes.
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditing]);

  // ── Bar positioning: uses live draft start + effective duration ─────────────
  // 027A: with a project start date, position by TRUE calendar dates on the
  // calendar-month axis (same colW columns as the header). Without a start
  // date, fall back to the legacy equal-month formula.
  const liveStart = smNum;
  const liveEnd = +(smNum + effectiveDurationMonths).toFixed(2);
  const liveQty = effectiveQty;
  // Part 0.2: distinct, raw-value-based validation (checked BEFORE fallbacks apply)
  const dateIssue: string | null =
    startDateInvalid && endDateInvalid ? "Programme dates incomplete"
    : startDateInvalid ? "Invalid start date"
    : endDateInvalid ? "Invalid finish date"
    : durationModeState === "fixed" && endMRawNum < smRawNum ? "Finish date precedes start date"
    : isNaN(liveEnd) || liveEnd < liveStart ? "Invalid finish date"
    : null;
  const datesInvalid = dateIssue !== null;
  const barLeft = !datesInvalid && project.startDate
    ? Math.max(0, monthIndexToAxisX(liveStart, project.startDate, colW))
    : Math.max(0, (liveStart - 1) * colW);
  const barWidth = !datesInvalid && project.startDate
    ? Math.max(4, monthIndexToAxisX(liveEnd, project.startDate, colW) - barLeft)
    : Math.max(4, (liveEnd - liveStart) * colW);
  const durationMonths = liveEnd - liveStart;
  // Calendar duration (inclusive; stored end index = exclusive boundary — see calendarAxis.ts)
  const calDays = !datesInvalid && project.startDate
    ? calendarDaysFromIdx(liveStart, liveEnd, project.startDate)
    : null;

  // 029A §3: read-mode exception list — only warnings that actually triggered.
  // Critical issues (invalid dates, on hold) stay individually visible; the
  // non-critical ones collapse into one compact indicator when several apply.
  const readWarnings = useMemo(() => {
    const w: Array<{ short: string; full: string }> = [];
    if (chainageOverlapKind === "overlap") w.push({
      short: "overlap",
      full: "Chainage overlaps another stretch of this BOQ item on the same corridor — adjust from/to values or set distinct sides",
    });
    if (chainageOverlapKind === "confirm_side") w.push({
      short: "confirm side",
      full: "Shares chainage with another stretch but a side is unspecified — set the side on both stretches so overlap can be checked",
    });
    if (requiredOutput?.exceedsCapacity) w.push({
      short: "capacity",
      full: `Required output exceeds normal equipment capacity (${requiredOutput.capacityPct ?? "?"}%)${
        requiredOutput.additionalEquipmentNeeded ? ` — need +${requiredOutput.additionalEquipmentNeeded} more ${requiredOutput.bottleneckEquipmentName}` : ""}`,
    });
    return w;
  }, [chainageOverlapKind, requiredOutput]);

  return (
    <div
      style={{ display: "flex", alignItems: "stretch", minHeight: ROW_H }}
      className="border-b border-dashed border-slate-100 dark:border-slate-800"
      data-testid={`stretch-row-${bar.id}`}
    >
      {/* ── Left sticky panel. minHeight (not fixed height) + flex-wrap so chainage,
          qty, date, badges, and toggle wrap onto a 2nd line instead of clipping/
          overlapping at narrow widths. ── */}
      <div
        style={{ width: LEFT_W, minWidth: LEFT_W, maxWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
        className={`group flex items-center gap-1 flex-wrap px-1.5 py-1 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 ${
          patch.isPending ? "opacity-70" : ""
        } ${isEditing ? "ring-1 ring-inset ring-teal-300 dark:ring-teal-700 bg-teal-50/30 dark:bg-teal-950/20" : ""}`}
        onDoubleClick={() => { if (!isEditing) onRequestEdit(bar.id); }}
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

        {isEditing ? (<>
        {/* ── 029A Part B: deliberate edit mode — all fields local until Save ── */}
        {/* Chainage inputs */}
        <span className="text-xs text-slate-400 flex-shrink-0">Ch</span>
        <input
          type="number" step="0.001"
          value={cf}
          onChange={e => { dirty.current = true; setCf(e.target.value); }}
          className="w-[52px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-cf-${bar.id}`}
        />
        <span className="text-xs text-slate-400 flex-shrink-0">to</span>
        <input
          type="number" step="0.001"
          value={ct}
          onChange={e => { dirty.current = true; setCt(e.target.value); }}
          className="w-[52px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-ct-${bar.id}`}
        />

        {/* Chainage overlap warning (side-aware) */}
        {chainageOverlapKind === "overlap" && (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5 flex-shrink-0"
            title="Chainage overlaps another stretch of this item on the same corridor. Adjust from/to values or set distinct sides (e.g. LHS / RHS)."
          >
            <AlertTriangle className="w-2.5 h-2.5" />overlap
          </span>
        )}
        {chainageOverlapKind === "confirm_side" && (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 flex-shrink-0"
            title="Shares chainage with another stretch, but a side is unspecified. Set the side on both stretches so the overlap check can decide."
          >
            <AlertTriangle className="w-2.5 h-2.5" />confirm side
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
                  className={`w-[42px] text-xs font-mono border-b bg-transparent text-center focus:outline-none focus:border-teal-500 dark:text-slate-200 ${
                defaultRate != null && !isNaN(multNum) && Math.abs(multNum - defaultRate) > 0.0001
                  ? "border-orange-400 text-orange-600 dark:text-orange-400"
                  : "border-slate-300 dark:border-slate-600"
              }`}
              title={defaultRate != null ? `Default rate: ${fmtQty(defaultRate, 4)} ${(item as any).canonicalUnit ?? item.unit}/km` : "Multiplier (qty per km)"}
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

        {/* 030A: geometry-based suggestion — applied only on explicit click */}
        {suggestedQty != null && Math.abs(suggestedQty - liveQty) > Math.max(0.01, liveQty * 0.001) && (
          <button
            onClick={() => {
              const len = ctNum - cfNum;
              if (len <= 0) return;
              if (!window.confirm(`Replace quantity ${fmtQty(liveQty, 1)} with the geometry-based ${fmtQty(suggestedQty, 1)} ${(item as any).canonicalUnit ?? item.unit} (length × width${thickStr ? " × thickness" : ""})?`)) return;
              dirty.current = true;
              setMult(String(+(suggestedQty / len).toFixed(4)));
            }}
            className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 flex-shrink-0 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300"
            title={`Geometry suggests ${fmtQty(suggestedQty, 1)} ${(item as any).canonicalUnit ?? item.unit} (Ch length × width${thickStr ? " × thickness" : ""}). Click to apply — never applied automatically.`}
            data-testid={`button-suggest-qty-${bar.id}`}
          >
            ≈ {fmtQty(suggestedQty, 1)}?
          </button>
        )}

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
              // Part 0.2: don't act while dates are invalid (would seed fallbacks)
              if (startDateInvalid) return;
              // 029A §7: mode change stays LOCAL until Save — no partial commits.
              dirty.current = true;
              const next = durationModeState === "auto" ? "fixed" : "auto";
              if (next === "fixed") {
                // Seed endM from current auto end and lock the duration
                lockedDurationRef.current = effectiveDurationMonths;
                setEndM(String(+(smNum + effectiveDurationMonths).toFixed(1)));
              }
              setDurationModeState(next);
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
            → {datesInvalid
              ? "Invalid finish date"
              : formatDateForInput(displayFinishDateCal(liveEnd, project.startDate, liveStart))}
            {calDays != null && <span className="text-slate-500"> · {calDays}d</span>}
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
                  ? formatDateForInput(displayFinishDateCal(endMNum, project.startDate, smNum))
                  : ""
              }
              onChange={e => {
                dirty.current = true;
                if (e.target.value && project.startDate) {
                  // Typed finish date is INCLUSIVE → store the exclusive boundary index
                  const idx = finishDateInputToIdx(e.target.value, project.startDate);
                  setEndM(String(+idx.toFixed(2)));
                  // Update locked duration so subsequent start shifts use new window length
                  lockedDurationRef.current = Math.max(0.1, idx - smNum);
                }
              }}
                  className="w-[108px] text-xs border-b border-violet-400 bg-transparent text-center focus:outline-none focus:border-violet-600 dark:text-slate-200 ml-0.5"
              title="Stretch end date (fixed duration)"
              data-testid={`input-end-date-${bar.id}`}
            />
            {calDays != null && (
              <span className="text-xs text-slate-400 flex-shrink-0" title="Calendar duration (inclusive)">
                · {calDays}d
              </span>
            )}
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
              `Requires ${fmtQty(requiredOutput.monthlyOutput, 1)} ${(bar as any).canonicalUnit ?? bar.unit}/month`,
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
              {fmtQty(requiredOutput.monthlyOutput, 1)}/{((bar as any).canonicalUnit ?? bar.unit).toLowerCase() || "unit"}/mo
              {requiredOutput.capacityPct != null && (
                <span className="opacity-75"> ({requiredOutput.capacityPct}%)</span>
              )}
            </span>
          </span>
        )}

        {/* 029A §6 / 029B: execution STAGE (sequenceOrder — may be shared by parallel stretches) */}
        <span className="text-xs text-slate-400 flex-shrink-0 ml-0.5" title="Execution stage — 1 mobilises first; stretches sharing a stage start together">S</span>
        <input
          type="number" min="1" step="1"
          value={prio}
          onChange={e => { dirty.current = true; setPrio(e.target.value); }}
          className="w-[30px] text-xs font-mono border-b border-purple-300 bg-transparent text-center focus:outline-none focus:border-purple-500 dark:border-purple-700 dark:text-slate-200"
          placeholder="—"
          title="Execution stage (blank = chainage order). The same stage on two stretches is normal — they run in parallel."
          data-testid={`input-priority-${bar.id}`}
        />

        {/* Shoulder sequencing: plain-language dependency note (detail/edit view only) */}
        {isShoulderDesc(item.description ?? "") && (() => {
          const persisted = ((item as any).shoulderLayerClass ?? "").trim().toLowerCase();
          const cls: ShoulderClass = (SHOULDER_CLASSES as readonly string[]).includes(persisted)
            ? (persisted as ShoulderClass)
            : classifyShoulderLayer(item.description ?? "");
          const isReview = cls === "unclassified";
          return (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded px-1 py-0.5 flex-shrink-0 border ${
                isReview
                  ? "text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-700"
                  : "text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-900/20 dark:border-teal-800"
              }`}
              title={isReview
                ? "The shoulder's construction layer could not be determined from the description — confirm it so sequencing can stage it correctly."
                : "Shoulder sequencing dependency (follows this stretch's own preceding layer)"}
              data-testid={`shoulder-note-${bar.id}`}
            >
              {SHOULDER_DEPENDENCY_NOTES[cls]}
            </span>
          );
        })()}

        {/* 030A: side + planned geometry (relevance depends on layer type) */}
        {geomApp.side && (
          <select
            value={sideVal}
            onChange={e => { dirty.current = true; setSideVal(e.target.value); }}
            className={`text-[11px] border-b bg-transparent focus:outline-none focus:border-teal-500 dark:text-slate-200 ml-0.5 flex-shrink-0 ${
              sideVal === "" ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-slate-300 dark:border-slate-600"
            }`}
            title={sideVal === "" ? "Side unspecified — Side Review Required" : "Executed side for this stretch"}
            data-testid={`select-side-${bar.id}`}
          >
            <option value="">Side: —</option>
            {BAR_SIDES.map(s => (
              <option key={s} value={s}>{BAR_SIDE_LABELS[s]}</option>
            ))}
          </select>
        )}
        {geomApp.width && (
          <>
            <span className="text-xs text-slate-400 flex-shrink-0 ml-0.5" title="Planned executed width (m)">W</span>
            <input
              type="number" step="0.01" min="0"
              value={widthStr}
              onChange={e => { dirty.current = true; setWidthStr(e.target.value); }}
              className="w-[44px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
              placeholder="m"
              title="Planned executed width in metres (optional)"
              data-testid={`input-width-${bar.id}`}
            />
          </>
        )}
        {geomApp.thickness && (
          <>
            <span className="text-xs text-slate-400 flex-shrink-0" title="Planned executed thickness (mm) — planning value, independent of the BOQ design thickness">T</span>
            <input
              type="number" step="1" min="0"
              value={thickStr}
              onChange={e => { dirty.current = true; setThickStr(e.target.value); }}
              className="w-[44px] text-xs font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
              placeholder="mm"
              title="Planned executed thickness in mm (optional — never auto-synced with BOQ design thickness)"
              data-testid={`input-thickness-${bar.id}`}
            />
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Saving indicator */}
        {patch.isPending && <Loader2 className="w-3 h-3 animate-spin text-teal-500 flex-shrink-0 mr-0.5" />}

        {/* 029A §7: explicit Save / Cancel — nothing commits until Save */}
        <button
          onClick={save}
          disabled={patch.isPending || datesInvalid}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 flex-shrink-0"
          title={datesInvalid ? dateIssue ?? "Fix dates before saving" : "Save changes"}
          data-testid={`button-save-${bar.id}`}
        >
          <CheckCircle2 className="w-3 h-3" /> Save
        </button>
        <button
          onClick={cancelEdit}
          disabled={patch.isPending}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 flex-shrink-0"
          title="Discard changes and restore saved values"
          data-testid={`button-cancel-${bar.id}`}
        >
          <X className="w-3 h-3" /> Cancel
        </button>
        </>) : (<>
        {/* ── 029A Part A: clean read mode — no live inputs, no permanent icons ── */}
        {((bar as any).sequenceOrder != null || (bar as any).executionFront) && (
          <span
            className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1 flex-shrink-0 dark:bg-purple-900/30 dark:text-purple-300"
            title={`${(bar as any).sequenceOrder != null ? `Execution stage ${(bar as any).sequenceOrder} — lower mobilises first; stretches sharing a stage start together.` : ""}${(bar as any).executionFront ? ` Front: ${(bar as any).executionFront}` : ""}`.trim()}
            data-testid={`text-priority-${bar.id}`}
          >
            {(bar as any).sequenceOrder != null ? `S${(bar as any).sequenceOrder}` : ""}
            {(bar as any).executionFront ? `${(bar as any).sequenceOrder != null ? " · " : ""}${(bar as any).executionFront}` : ""}
          </span>
        )}
        {!isStructure && (bar.chainageFrom != null || bar.chainageTo != null) && (
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300 flex-shrink-0" data-testid={`text-chainage-${bar.id}`}>
            Ch {bar.chainageFrom ?? "?"}–{bar.chainageTo ?? "?"}
          </span>
        )}
        {/* 030A: side + geometry in the read summary.
            029B Part B: the side indicator renders on EVERY non-structure bar,
            even when the BOQ item's layerType is unclassified — only structure/
            location-scheduled bars suppress it. geometryApplicability() still
            governs width/thickness elsewhere, just not this indicator. */}
        {!isStructure && (bar as any).side != null && (
          <span
            className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 flex-shrink-0 dark:bg-sky-900/30 dark:text-sky-300"
            title={`Planned side: ${barSideLabel((bar as any).side)}${(bar as any).plannedWidthM != null ? ` · width ${(bar as any).plannedWidthM} m` : ""}${(bar as any).plannedThicknessMm != null ? ` · thickness ${(bar as any).plannedThicknessMm} mm` : ""}`}
            data-testid={`text-side-${bar.id}`}
          >
            {barSideLabel((bar as any).side)}
            {(bar as any).plannedWidthM != null ? ` · ${Number((bar as any).plannedWidthM).toFixed(2)} m` : ""}
          </span>
        )}
        {!isStructure && (bar as any).side == null && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 flex-shrink-0 dark:bg-amber-900/30 dark:text-amber-300"
            title="No side recorded for this road bar (legacy or unspecified). The bar stays fully usable — confirm the side when convenient."
            data-testid={`badge-side-review-${bar.id}`}
          >
            Side Review Required
          </span>
        )}
        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200 flex-shrink-0" data-testid={`text-qty-${bar.id}`}>
          {fmtQty(bar.plannedQty, 1)} {(bar as any).canonicalUnit ?? bar.unit}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono flex-shrink-0 whitespace-nowrap" data-testid={`text-dates-${bar.id}`}>
          {project.startDate && !datesInvalid
            ? `${formatDateForInput(monthIndexToDate(bar.startMonth, project.startDate))} → ${formatDateForInput(displayFinishDateCal(bar.endMonth, project.startDate, bar.startMonth))}`
            : `M${fmtQty(bar.startMonth, 1)} → M${fmtQty(bar.endMonth, 1)}`}
        </span>
        <span className="text-[11px] text-slate-400 flex-shrink-0" title="Duration">
          {calDays != null ? `${calDays}d` : `${fmtQty(bar.endMonth - bar.startMonth, 1)} mo`}
        </span>
        {durationModeState === "fixed" && (
          <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1 flex-shrink-0 dark:bg-violet-900/30 dark:text-violet-300" title="Fixed window — finish date locked">
            FIX
          </span>
        )}

        {/* Critical warning — individually visible (029A §3) */}
        {datesInvalid && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 py-0.5 flex-shrink-0" data-testid={`warning-date-${bar.id}`}>
            <AlertTriangle className="w-2.5 h-2.5" /> {dateIssue}
          </span>
        )}
        {/* Non-critical warnings — single shows inline, several collapse to a count */}
        {readWarnings.length === 1 && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5 flex-shrink-0"
            title={readWarnings[0].full}
            data-testid={`warning-row-${bar.id}`}
          >
            <AlertTriangle className="w-2.5 h-2.5" /> {readWarnings[0].short}
          </span>
        )}
        {readWarnings.length > 1 && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5 flex-shrink-0"
            title={readWarnings.map(w => `• ${w.full}`).join("\n")}
            data-testid={`warning-row-${bar.id}`}
          >
            <AlertTriangle className="w-2.5 h-2.5" /> {readWarnings.length} warnings
          </span>
        )}

        <div className="flex-1" />

        {/* Meaningful execution/arrangement state (029A §2) */}
        {isEarthworkBar && executionState && (
          <span className="flex-shrink-0 mr-0.5">
            <ExecutionStateBadge
              result={executionState}
              compact
              onClick={() => setShowArrangements(true)}
              testId={`badge-execution-state-${bar.id}`}
            />
          </span>
        )}

        {/* 029A Part C: hover/focus actions (desktop) — hidden on touch widths */}
        <button
          onClick={() => onRequestEdit(bar.id)}
          className="hidden md:inline-flex p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          title="Edit this stretch"
          aria-label="Edit stretch"
          data-testid={`button-edit-${bar.id}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
        {isEarthworkBar && (
          <button
            onClick={() => setShowArrangements(true)}
            className="hidden md:inline-flex p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            title="Execution arrangements for this stretch"
            aria-label="Execution arrangements"
            data-testid={`button-arrangements-${bar.id}`}
          >
            <Handshake className="w-3 h-3" />
          </button>
        )}
        {!isStructure && (
          <button
            onClick={() => onSplit(bar)}
            className="hidden md:inline-flex p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            title="Split stretch at midpoint"
            aria-label="Split stretch"
            data-testid={`button-split-${bar.id}`}
          >
            <Scissors className="w-3 h-3" />
          </button>
        )}
        {/* Persistent ⋯ menu — same actions, reachable by touch/keyboard (029A §10-12) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex-shrink-0"
              title="More actions"
              aria-label="Stretch actions"
              data-testid={`button-more-${bar.id}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          {/* 029C Part G: keep the row menu fully on-screen — collisionPadding
              stops it hiding under the sticky Gantt header / viewport edges. */}
          <DropdownMenuContent align="end" className="w-44 z-[60]" collisionPadding={12}>
            <DropdownMenuItem onClick={() => onRequestEdit(bar.id)} data-testid={`menu-edit-${bar.id}`}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            {isEarthworkBar && (
              <DropdownMenuItem onClick={() => setShowArrangements(true)} data-testid={`menu-arrangements-${bar.id}`}>
                <Handshake className="w-3.5 h-3.5 mr-2" /> Arrangements
              </DropdownMenuItem>
            )}
            {!isStructure && (
              <DropdownMenuItem onClick={() => onSplit(bar)} data-testid={`menu-split-${bar.id}`}>
                <Scissors className="w-3.5 h-3.5 mr-2" /> Split at midpoint
              </DropdownMenuItem>
            )}
            {!isStructure && geomApp.side && (
              <DropdownMenuItem
                onClick={async () => {
                  // 030A: preview → confirm → commit. The original bar becomes
                  // the LHS half (all DPR/arrangement links stay on it); RHS is
                  // inserted as a new manual bar over the same chainage.
                  try {
                    const parts = [{ side: "lhs" }, { side: "rhs" }];
                    const prevRes = await apiRequest("POST", `/api/boq/programme/bars/${bar.id}/split-by-side`, { preview: true, parts });
                    const prev = await prevRes.json();
                    const allocTxt = (prev.allocation ?? []).map((a: any) => `${barSideLabel(a.side)}: ${fmtQty(a.qty, 1)}`).join(" · ");
                    const linkTxt = [
                      prev.linkedDprProgressCount > 0 ? `${prev.linkedDprProgressCount} DPR progress link(s) stay on the LHS bar` : null,
                      (prev.linkedArrangementIds ?? []).length > 0 ? `${prev.linkedArrangementIds.length} arrangement(s) stay on the LHS bar` : null,
                    ].filter(Boolean).join("; ");
                    if (!window.confirm(`Split this bar into LHS + RHS over the same chainage?\n\nQuantity split (equal — adjust after if the sides differ): ${allocTxt}${linkTxt ? `\n${linkTxt}` : ""}`)) return;
                    await apiRequest("POST", `/api/boq/programme/bars/${bar.id}/split-by-side`, { parts });
                    await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
                  } catch (e: any) {
                    window.alert(`Split by side failed: ${e?.message ?? e}`);
                  }
                }}
                data-testid={`menu-split-side-${bar.id}`}
              >
                <Scissors className="w-3.5 h-3.5 mr-2" /> Split into LHS / RHS
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(bar.id)}
              className="text-red-600 focus:text-red-700"
              data-testid={`menu-delete-${bar.id}`}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </>)}
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
            className="absolute top-0 bottom-0 border-r-2 border-slate-300 dark:border-slate-600"
            style={{ left: i * colW, width: colW }}
          />
        ))}

        {/* 027A §19: invalid dates → clear warning instead of a misleading bar */}
        {datesInvalid ? (
          <div
            className="absolute top-2 left-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5"
            data-testid={`bar-invalid-${bar.id}`}
          >
            {dateIssue}
          </div>
        ) : (
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
            const qty = `${fmtQty(liveQty, 1)} ${(bar as any).canonicalUnit ?? bar.unit}`;
            const span = project.startDate && !datesInvalid
              ? `${formatDateForInput(monthIndexToDate(liveStart, project.startDate))} → ${formatDateForInput(displayFinishDateCal(liveEnd, project.startDate, liveStart))} · ${calDays} cal days · ${(durationMonths * workingDays).toFixed(1)} work days`
              : `M${fmtQty(liveStart, 1)} → M${fmtQty(liveEnd, 1)} (${fmtQty(durationMonths, 2)} mo)`;
            const extras = [
              `Mode: ${durationModeState === "fixed" ? "FIX" : "AUTO"}`,
              requiredOutput ? `Daily output: ${fmtQty(requiredOutput.dailyOutput, 1)}/day` : null,
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
                {fmtQty(liveQty, 1)} {(bar as any).canonicalUnit ?? bar.unit} · {calDays != null ? `${calDays}d` : `${(durationMonths * workingDays).toFixed(1)}wd`}
                {autoDuration?.bottleneckEquipment && (
                  <span className="opacity-70 font-normal"> · {autoDuration.bottleneckEquipment}</span>
                )}
              </span>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Instruction 026 §7: per-stretch execution-arrangement panel */}
      {isEarthworkBar && showArrangements && (
        <BarArrangementPanel
          open={showArrangements}
          onClose={() => setShowArrangements(false)}
          projectId={projectId}
          barId={bar.id}
          boqItemId={bar.boqItemId}
          barLabel={`${shortItemName(item.description)} — ${bar.reachLabel ?? `Ch ${bar.chainageFrom ?? "?"}–${bar.chainageTo ?? "?"}`}`}
          barPlannedQty={Number(bar.plannedQty ?? 0)}
          unit={(bar as any).canonicalUnit ?? bar.unit ?? ""}
          workCategory={arrangementCategory ?? "earthwork"}
          bituminousItemType={arrangementItemType}
        />
      )}
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
  // Part 0.2: validate stored values before rendering — never invent a position
  const slocDateIssue: string | null =
    !Number.isFinite(liveStart) && !Number.isFinite(liveEnd) ? "Programme dates incomplete"
    : !Number.isFinite(liveStart) ? "Invalid start date"
    : !Number.isFinite(liveEnd) ? "Invalid finish date"
    : liveEnd < liveStart ? "Finish date precedes start date"
    : null;
  // 027A: calendar-true positioning when the project has a start date
  const barLeft   = project.startDate
    ? Math.max(0, monthIndexToAxisX(liveStart, project.startDate, colW))
    : Math.max(0, (liveStart - 1) * colW);
  const barWidth  = project.startDate
    ? Math.max(4, monthIndexToAxisX(liveEnd, project.startDate, colW) - barLeft)
    : Math.max(4, (liveEnd - liveStart) * colW);

  return (
    <div
      style={{ display: "flex", alignItems: "stretch", minHeight: ROW_H }}
      className="border-b border-dashed border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/10"
      data-testid={`structure-loc-row-${bar.id}`}
    >
      {/* ── Left sticky panel (read-only — re-import to change values) ── */}
      <div
        style={{ width: LEFT_W, minWidth: LEFT_W, maxWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
        className="flex flex-col justify-center gap-1 px-2 py-1.5 border-r border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/30"
      >
        {/* Row 1: icon + structure name + chainage */}
        <div className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-violet-500 flex-shrink-0" />
          <span
            className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate min-w-0"
            title={b.structureId ?? ""}
          >
            {b.structureId ?? b.reachLabel ?? "—"}
          </span>
          {b.structureChainageKm != null && (
            <span className="text-[10px] text-violet-500 font-mono flex-shrink-0 ml-auto whitespace-nowrap">
              Km {Number(b.structureChainageKm).toFixed(3)}
            </span>
          )}
        </div>
        {/* Row 2: structure type + BOQ item code + sub-item + qty (wraps onto its own line rather than clipping/overlapping) */}
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          {b.structureLocType && (
            <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1 border border-violet-200 flex-shrink-0 capitalize max-w-[140px] truncate" title={b.structureLocType}>
              {b.structureLocType}
            </span>
          )}
          {(bar as any).itemCode && (
            <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 max-w-[90px] truncate" title={(bar as any).itemCode}>
              {(bar as any).itemCode}
            </span>
          )}
          {b.boqSubItem && (
            <span className="text-[10px] bg-violet-50 text-violet-600 rounded px-1 border border-violet-200 flex-shrink-0 font-mono max-w-[80px] truncate" title={b.boqSubItem}>
              {b.boqSubItem}
            </span>
          )}
          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-300 flex-shrink-0 ml-auto whitespace-nowrap">
            {fmtQty(bar.plannedQty, 2)} {(bar as any).canonicalUnit ?? (bar as any).unit ?? ""}
          </span>
        </div>
        {/* Row 3: start date + duration + delete */}
        <div className="flex items-center gap-1 min-w-0">
          {bar.startDate && (
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0 whitespace-nowrap">
              {String(bar.startDate).slice(0, 10)}
            </span>
          )}
          {b.durationDays != null && (
            <span className="text-[10px] text-slate-400 flex-shrink-0 whitespace-nowrap">
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
            className="absolute top-0 bottom-0 border-r-2 border-violet-300 dark:border-violet-700/60"
            style={{ left: i * colW, width: colW }}
          />
        ))}
        {slocDateIssue ? (
          <div
            className="absolute top-2 left-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5"
            data-testid={`sloc-invalid-${bar.id}`}
          >
            {slocDateIssue}
          </div>
        ) : (
        <div
          className="absolute rounded overflow-hidden select-none"
          style={{ top: 7, left: barLeft, width: barWidth, height: 24, backgroundColor: "#7c3aed", opacity: 0.80 }}
          title={`${b.structureId ?? ""} | ${fmtQty(bar.plannedQty, 1)} ${(bar as any).canonicalUnit ?? (bar as any).unit ?? ""} | M${fmtQty(liveStart, 1)} → M${fmtQty(liveEnd, 1)}`}
        >
          {barWidth >= 50 && (
            <div className="absolute inset-0 flex items-center px-1.5 pointer-events-none overflow-hidden">
              <span className="text-white text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis opacity-90 drop-shadow-sm">
                {fmtQty(bar.plannedQty, 1)} {(bar as any).canonicalUnit ?? (bar as any).unit ?? ""}
              </span>
            </div>
          )}
        </div>
        )}
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
  chainageKm?: number;
  chainageFromKm?: number | null;
  chainageToKm?: number | null;
  chainageMissing?: boolean;
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
  sheetName?: string;   // which sheet this row came from (matrix format)
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
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedSheetNames, setParsedSheetNames] = useState<string[]>([]);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [parsing, setParsing] = useState(false);
  const [missingDatesInfo, setMissingDatesInfo] = useState<{ missingDateRows: number; totalRows: number } | null>(null);

  function reset() {
    setStep(1);
    setRows([]);
    setParseError(null);
    setParseWarnings([]);
    setParsedSheetNames([]);
    setParsing(false);
    setMissingDatesInfo(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Upload file to server for authoritative BOQ matching and XLSX parsing.
  // Server applies priority: P1 code+subItem, P2 code (strip leading zeros), P3 description.
  async function parseFile(file: File) {
    setParsing(true);
    setParseError(null);
    setParseWarnings([]);
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
        throw new Error(err?.hint ? `${err.error} — ${err.hint}` : (err?.error ?? `Server error ${res.status}`));
      }
      const data: {
        sheetNames?: string[];
        sheetName?: string;
        rows: StructureScheduleRow[];
        totalRows: number;
        warnings?: string[];
      } = await res.json();
      if (!data.rows?.length) throw new Error("No data rows could be read. Check column headers and that quantity cells are numeric.");
      setRows(data.rows);
      setParsedSheetNames(data.sheetNames ?? (data.sheetName ? [data.sheetName] : []));
      setParseWarnings(data.warnings ?? []);
      setStep(2);
    } catch (e: any) {
      setParseError(e?.message ?? String(e));
    } finally {
      setParsing(false);
    }
  }

  const importMutation = useMutation({
    mutationFn: async (onMissingDates?: "unscheduled" | "auto_sequence" | "cancel") => {
      const res = await fetch(`/api/boq/projects/${projectId}/import-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rows: rows.map(r => ({
            structureId:    r.structureId,
            structureType:  r.structureType,
            chainageKm:     r.chainageKm,
            chainageFromKm: r.chainageFromKm,
            chainageToKm:   r.chainageToKm,
            chainageMissing: r.chainageMissing,
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
          onMissingDates,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.requiresDecision) {
        return { requiresDecision: true, missingDateRows: data.missingDateRows, totalRows: data.totalRows };
      }
      if (!res.ok) throw new Error(data?.error ?? `Server error ${res.status}`);
      return data;
    },
    onSuccess: (data: {
      requiresDecision?: boolean; missingDateRows?: number; totalRows?: number; cancelled?: boolean;
      created?: number; skipped?: number; total?: number; warnings?: string[]; unmatchedBoqRows?: number;
      uomMismatchRows?: number; overPlannedItems?: unknown[];
      autoSequenceSummary?: { updated: number; structures: number; fronts: number; needsReviewCount: number } | null;
    }) => {
      if (data.requiresDecision) {
        setMissingDatesInfo({ missingDateRows: data.missingDateRows ?? 0, totalRows: data.totalRows ?? 0 });
        return;
      }
      if (data.cancelled) return;
      onImported();
      onOpenChange(false);
      reset();
      const parts: string[] = [`${data.created ?? 0} bars created`];
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      if (data.uomMismatchRows) parts.push(`${data.uomMismatchRows} UOM mismatch(es)`);
      if (data.overPlannedItems?.length) parts.push(`${data.overPlannedItems.length} over-planned BOQ item(s)`);
      if (data.autoSequenceSummary) {
        parts.push(`${data.autoSequenceSummary.updated} auto-sequenced across ${data.autoSequenceSummary.structures} structure(s)`);
      }
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
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Upload an Excel workbook prepared as a <strong>section-wise matrix</strong> — BOQ items as rows, structures as columns.
              </p>
              <div className="rounded-md bg-violet-50 border border-violet-200 p-3 space-y-1.5 text-xs">
                <p className="font-semibold text-violet-800">Sheet names the app recognises:</p>
                <div className="flex flex-wrap gap-1">
                  {["Culverts","Minor_Bridges","Major_Bridges","Structures","Bridges","Cross_Drainage"].map(s => (
                    <code key={s} className="text-violet-700 font-mono bg-white border border-violet-200 px-1.5 py-0.5 rounded">{s}</code>
                  ))}
                </div>
                <p className="text-violet-700 mt-1">Include only the sheets that apply to your project. Each sheet must have:</p>
                <ul className="list-disc list-inside text-violet-700 space-y-0.5 ml-1">
                  <li>Columns A–D: <em>BOQ Code · BOQ Sub Item · BOQ Description · UOM</em></li>
                  <li>Column E onward: one column per structure — structure ID in row 1</li>
                  <li>A <em>Structure Type</em> row and a <em>Chainage Km</em> row immediately after the header</li>
                  <li>BOQ quantity rows below — leave blank where a BOQ item doesn't apply to a structure</li>
                </ul>
                <p className="text-violet-500 text-[11px]">Legacy flat format (sheet named <code className="font-mono">Structure_Schedule_Import</code>) is still supported.</p>
              </div>
            </div>

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
            {/* Sheet summary */}
            {parsedSheetNames.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-violet-700 flex-wrap">
                <span className="font-semibold">Sheets read:</span>
                {parsedSheetNames.map(s => (
                  <code key={s} className="bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded font-mono">{s}</code>
                ))}
              </div>
            )}

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

            {/* Parse warnings (e.g. BC qty on pipe culvert) */}
            {parseWarnings.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 space-y-0.5">
                <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{parseWarnings.length} warning(s) — import is not blocked</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1 max-h-20 overflow-auto">
                  {parseWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="border rounded-lg overflow-auto max-h-64 text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                  <tr>
                    {parsedSheetNames.length > 1 && (
                      <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Sheet</th>
                    )}
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Structure ID</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Type</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Chainage</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">BOQ Code</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Description</th>
                    <th className="px-2 py-1.5 border-b font-semibold text-slate-600">Qty</th>
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
                      {parsedSheetNames.length > 1 && (
                        <td className="px-2 py-1 border-b text-violet-700 font-mono truncate max-w-[80px]" title={r.sheetName}>{r.sheetName ?? "—"}</td>
                      )}
                      <td className="px-2 py-1 border-b truncate max-w-[110px]" title={r.structureId}>{r.structureId || "—"}</td>
                      <td className="px-2 py-1 border-b truncate max-w-[80px]">{r.structureType || "—"}</td>
                      <td className="px-2 py-1 border-b font-mono">
                        {r.chainageMissing || (r.chainageFromKm == null && !r.chainageKm)
                          ? <span className="text-amber-600 font-semibold" title="No chainage found — will be imported as needs-review">⚠ missing</span>
                          : (() => {
                              const from = r.chainageFromKm ?? r.chainageKm ?? null;
                              const to = r.chainageToKm ?? from;
                              if (from == null) return "—";
                              return to != null && to !== from
                                ? `${from.toFixed(3)}–${to.toFixed(3)}`
                                : from.toFixed(3);
                            })()}
                      </td>
                      <td className="px-2 py-1 border-b font-mono">{r.boqItemCode || "—"}</td>
                      <td className="px-2 py-1 border-b truncate max-w-[140px]" title={r.boqDescription}>{r.boqDescription || "—"}</td>
                      <td className="px-2 py-1 border-b font-mono whitespace-nowrap">{r.plannedQty > 0 ? fmtQty(r.plannedQty, 2) : "—"} {r.uom}</td>
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

            {missingDatesInfo && (
              <div className="rounded-md bg-amber-50 border border-amber-300 p-3 text-sm text-amber-800 space-y-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {missingDatesInfo.missingDateRows} of {missingDatesInfo.totalRows} row(s) have no usable start date
                </p>
                <p className="text-xs text-amber-700">
                  Quantities will still be imported as-is. Choose how to place these bars on the programme:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={() => importMutation.mutate("unscheduled")}
                    disabled={importMutation.isPending}
                    data-testid="button-import-as-unscheduled"
                  >
                    Import as unscheduled
                  </Button>
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => importMutation.mutate("auto_sequence")}
                    disabled={importMutation.isPending}
                    data-testid="button-import-auto-sequence"
                  >
                    Auto-sequence now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-amber-700"
                    onClick={() => { importMutation.mutate("cancel"); setMissingDatesInfo(null); }}
                    disabled={importMutation.isPending}
                    data-testid="button-import-cancel-decision"
                  >
                    Cancel import
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { if (step === 2) setStep(1); else onOpenChange(false); }}>
            {step === 2 ? "← Back" : "Cancel"}
          </Button>
          {step === 2 && matchedCount > 0 && !missingDatesInfo && (
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => importMutation.mutate(undefined)}
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
  editorGuardRef,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
  projectId: number;
  productivitySettings?: ProductivitySettings | null;
  onBeforeMutate?: () => void;
  /** 029A review fix: lets the page ask "is a stretch editor dirty?" before leaving. */
  editorGuardRef?: React.MutableRefObject<(() => boolean) | null>;
}) {
  const { toast } = useToast();
  const totalMonths = project.totalMonths ?? 12;
  // 027A: full calendar-month columns — a mid-month project start needs one
  // extra column so the programme window fits on the calendar axis.
  const axisMonths = axisMonthCount(project.startDate, totalMonths);
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

  // ── 029A §4-5: one active editor at a time, with an unsaved-changes guard ──
  const [editingBarId, setEditingBarId] = useState<number | null>(null);
  const [pendingEditBarId, setPendingEditBarId] = useState<number | null>(null);
  const editorApiRef = useRef<StretchEditorApi | null>(null);
  const registerEditorApi = useCallback((api: StretchEditorApi | null) => {
    editorApiRef.current = api;
  }, []);
  // Expose a dirty-check to the page so tab switches / toolbar navigation can warn.
  useEffect(() => {
    if (!editorGuardRef) return;
    editorGuardRef.current = () => !!editorApiRef.current?.isDirty();
    return () => { editorGuardRef.current = null; };
  }, [editorGuardRef]);
  const requestEdit = useCallback((barId: number) => {
    setEditingBarId(current => {
      if (current === null || current === barId) return barId;
      // Another row is being edited: close silently if unchanged, else ask.
      if (!editorApiRef.current?.isDirty()) return barId;
      setPendingEditBarId(barId);
      return current; // stay until the user chooses Save / Discard / Stay
    });
  }, []);
  // Review fix: switching rows after Save/Discard happens only when the editor
  // actually closes (save success or cancel) — never on a failed/blocked save.
  const pendingSwitchRef = useRef<number | null>(null);
  const closeEdit = useCallback((barId: number) => {
    setEditingBarId(current => {
      if (current !== barId) return current;
      const next = pendingSwitchRef.current;
      pendingSwitchRef.current = null;
      return next;
    });
  }, []);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const barsByItemId = useMemo(() => {
    const m: Record<number, WorkProgramBarWithItem[]> = {};
    for (const b of bars) {
      if (!m[b.boqItemId]) m[b.boqItemId] = [];
      m[b.boqItemId].push(b);
    }
    // Instruction 029 Part B: within an item, order stretch rows by execution
    // priority (sequenceOrder) when set; bars without one fall back to chainage
    // order so structure-import and legacy bars keep their positions.
    for (const id of Object.keys(m)) {
      m[Number(id)].sort((a, b) => {
        const sa = (a as any).sequenceOrder, sb = (b as any).sequenceOrder;
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        if (sa != null && sb == null) return -1;
        if (sa == null && sb != null) return 1;
        return (a.chainageFrom ?? 0) - (b.chainageFrom ?? 0);
      });
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
      // Fallback chain: persisted workCategory → imported categoryName → uncategorised.
      // Using workCategory as the primary key ensures items appear under their correct
      // operational group even when the imported BOQ has no categoryId / categoryName.
      const cat = it.workCategory
        ? `wc:${it.workCategory}`
        : it.categoryName
          ? `cat:${it.categoryName}`
          : "__uncategorised__";
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
    () => Array.from({ length: axisMonths }, (_, i) => ({ num: i + 1, label: monthLabel(i + 1, project.startDate) })),
    [axisMonths, project.startDate],
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
    const isStructItem = isStructureOrLocationScheduledItem(item as any, { hasStructureImportBar: structureImportItemIds.has(item.id) });
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
      ? calculateAutoDurationFull(qty, (item as any).canonicalUnit ?? item.unit, equipment, workingHrs, workingDays,
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

  const totalRightW = axisMonths * colW;

  // 029A Part E: preserve gantt scroll position per project across navigation.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoredRef = useRef(false);
  // Review fix: re-run restoration when the project changes in-place.
  useEffect(() => { scrollRestoredRef.current = false; }, [projectId]);
  useEffect(() => {
    if (scrollRestoredRef.current || !scrollRef.current || bars.length === 0) return;
    try {
      const saved = sessionStorage.getItem(`wp-scroll-${projectId}`);
      if (saved) {
        const { top, left } = JSON.parse(saved);
        scrollRef.current.scrollTop = top ?? 0;
        scrollRef.current.scrollLeft = left ?? 0;
      }
    } catch { /* ignore */ }
    scrollRestoredRef.current = true;
  }, [bars.length, projectId]);
  const handleGanttScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!scrollRestoredRef.current) return;
    try {
      sessionStorage.setItem(
        `wp-scroll-${projectId}`,
        JSON.stringify({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }),
      );
    } catch { /* ignore */ }
  }, [projectId]);

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-950" style={{ overflow: "clip" }}>
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }} ref={scrollRef} onScroll={handleGanttScroll}>
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
                className="relative flex items-center justify-center text-[12px] font-semibold text-white/90 border-r-2 border-teal-300/80 flex-shrink-0 select-none overflow-hidden"
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
          const catLabel = cat === "__uncategorised__"
            ? "Uncategorised"
            : cat.startsWith("wc:")
              ? getWorkCategoryLabel(cat.slice(3))
              : cat.startsWith("cat:")
                ? cat.slice(4)
                : cat;
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
                    {/* Item header row — minHeight only (not fixed) so long descriptions,
                        structure tags, and warning badges can wrap onto a 2nd line instead
                        of clipping/overlapping. Flexbox default align-items:stretch makes the
                        right-side month cells grow to match automatically. */}
                    <div
                      style={{ display: "flex", alignItems: "stretch", minWidth: LEFT_W + totalRightW, minHeight: ITEM_H }}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      {/* Item left */}
                      <div
                        style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-950 border-r border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.itemCode && (
                              <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{item.itemCode}</span>
                            )}
                            <HoverCard openDelay={120} closeDelay={40}>
                              <HoverCardTrigger asChild>
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate min-w-0 cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
                                  {(item as any).displayName || shortItemName(item.description)}
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
                                  {fmt(item.currentQty)} {(item as any).canonicalUnit ?? item.unit}
                                </p>
                              </HoverCardContent>
                            </HoverCard>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap min-w-0">
                            <span className="text-[12px] text-muted-foreground flex-shrink-0 whitespace-nowrap">{fmt(item.currentQty)} {(item as any).canonicalUnit ?? item.unit}</span>
                            <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={(item as any).canonicalUnit ?? item.unit} isStructureItem={isStructureOrLocationScheduledItem(item as any, { hasStructureImportBar: structureImportItemIds.has(item.id) })} />
                            {!hasEquipment && (
                              <span className="text-xs text-amber-500 flex items-center gap-0.5 flex-shrink-0 whitespace-nowrap">
                                <Info className="w-2.5 h-2.5" /> no equipment
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => addStretch(item.id)}
                          disabled={createMutation.isPending}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[12px] text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-700 transition-colors flex-shrink-0 font-medium self-center"
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
                            className="flex-shrink-0 border-r-2 border-slate-300 dark:border-slate-600 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 cursor-pointer transition-colors"
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
                          totalMonths={axisMonths}
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
                          totalMonths={axisMonths}
                          colW={colW}
                          onDelete={setDeleteBarId}
                          onSplit={bar => splitMutation.mutate(bar)}
                          onBeforeMutate={onBeforeMutate}
                          productivitySettings={productivitySettings}
                          isEditing={editingBarId === bar.id}
                          onRequestEdit={requestEdit}
                          onCloseEdit={closeEdit}
                          registerEditorApi={registerEditorApi}
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
                            Total: {fmtQty(totalPlanned, 1)} {(item as any).canonicalUnit ?? item.unit}
                          </span>
                          <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={(item as any).canonicalUnit ?? item.unit} isStructureItem={isStructureOrLocationScheduledItem(item as any, { hasStructureImportBar: structureImportItemIds.has(item.id) })} />
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

      {/* 029A §5: unsaved-changes guard when switching to another row's editor */}
      <Dialog open={pendingEditBarId !== null} onOpenChange={o => { if (!o) setPendingEditBarId(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-unsaved-changes">
          <DialogHeader>
            <DialogTitle className="text-base">Unsaved changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            The stretch you are editing has unsaved changes. Save them before switching, or discard them?
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { pendingSwitchRef.current = null; setPendingEditBarId(null); }}
              data-testid="button-unsaved-stay"
            >
              Stay
            </Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => {
                // cancel() closes the editor; closeEdit picks up the pending switch.
                pendingSwitchRef.current = pendingEditBarId;
                editorApiRef.current?.cancel();
                setPendingEditBarId(null);
              }}
              data-testid="button-unsaved-discard"
            >
              Discard
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                // Only switch if the save actually dispatched AND then succeeds
                // (closeEdit fires from the mutation's onSuccess).
                pendingSwitchRef.current = pendingEditBarId;
                const dispatched = editorApiRef.current?.save();
                if (!dispatched) {
                  pendingSwitchRef.current = null; // blocked by validation — stay
                  return;
                }
                setPendingEditBarId(null);
              }}
              data-testid="button-unsaved-save"
            >
              Save &amp; switch
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
      // Fallback chain: persisted workCategory → imported categoryName → uncategorised.
      const cat = it.workCategory
        ? `wc:${it.workCategory}`
        : it.categoryName
          ? `cat:${it.categoryName}`
          : "__uncategorised__";
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
    <div className="overflow-auto rounded-xl border max-h-[70vh]">
      <table className="text-sm border-collapse" style={{ minWidth: 200 + maxMonth * 64 + 80 }}>
        {/* Sticky is applied per-<th> (not on <thead> itself) at top-0,
            relative to the max-h-[70vh]/overflow-auto wrapper div, which is
            the actual scrolling container (consistent with the demand
            tables in WorkDemand.tsx). IMPORTANT: an `overflow-x-auto`-only
            wrapper (no explicit max-height) does NOT reliably create a
            working sticky scroll context — browsers force its overflow-y to
            "auto" too, but with no height constraint it never actually
            scrolls internally, so a `top-14`-style offset (meant for
            page-level scroll) never sticks and body rows bleed above the
            header. Always pair sticky headers with an explicit
            `max-h-[...]` + `overflow-auto` wrapper and `top-0`. Sticky
            positioning directly on a <thead> element is also unreliable
            across browsers (Firefox/Safari can fail to clip body rows
            underneath it); sticking each <th> individually works
            consistently in every browser. The category-band <tr> (colored
            bill/category divider rows in the body) is intentionally NOT
            sticky — an earlier attempt made it sticky under the header,
            but stacking a second sticky row directly beneath already-sticky
            <th>s caused it to render on top of / slice through whichever
            data row happened to be scrolling past at that exact position,
            since the two sticky elements don't hand off cleanly. Keeping
            the category band in normal flow avoids that overlap entirely;
            it now simply scrolls past like a normal row. */}
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[220px]" style={{ background: "#0F5F64" }}>
              BOQ Item
            </th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[72px] whitespace-nowrap sticky top-0 z-20" style={{ background: "#0F5F64" }}>BOQ Qty</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[60px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Unit</th>
            {months.map(m => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[64px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[80px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {allCategoryKeys.map((cat, catIdx) => {
            const catItems = grouped[cat] ?? [];
            const catLabel = cat === "__uncategorised__"
              ? "Uncategorised"
              : cat.startsWith("wc:")
                ? getWorkCategoryLabel(cat.slice(3))
                : cat.startsWith("cat:")
                  ? cat.slice(4)
                  : cat;
            const color = getCatColor(catIdx);
            const catHasBars = catItems.some(it => monthlyGrid[it.id] && Object.keys(monthlyGrid[it.id]).length > 0);
            if (!catHasBars) return null;

            return [
              <tr key={`cat-${cat}`} style={{ backgroundColor: `${color}12` }}>
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
                              {item.itemCode ? `[${item.itemCode}] ` : ""}{(item as any).displayName || shortItemName(item.description)}
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
                              {fmtQty(item.currentQty, 1)} {(item as any).canonicalUnit ?? item.unit}
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600 font-semibold">{fmtQty(item.currentQty, 1)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{(item as any).canonicalUnit ?? item.unit}</td>
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
// Task #1240: this page now renders the SHARED PlanVsActualTable component
// (client/src/components/PlanVsActualTable.tsx) so it stays perfectly in
// sync with WorkDemand.tsx's Plan vs Actual tab — both are fed by the same
// `/api/boq/projects/:id/plan-vs-actual` endpoint via one component.

// ─── Shortage Indicator (Task #1240) ───────────────────────────────────────
// Proactive, read-only badge outside the demand page — surfaces near-term
// material shortfalls (current-month-or-earlier) right on the Work Programme
// header so users don't have to open the BOM & Demand page to notice risk.
function ShortageIndicatorBadge({ projectId }: { projectId: number }) {
  const { data } = useQuery<{ rows: { nearTermShortfall?: number; shortfall: number }[] }>({
    queryKey: ["/api/boq/projects", projectId, "shortage-check"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/shortage-check`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const nearTermCount = data?.rows?.filter(r => (r.nearTermShortfall ?? 0) > 0).length ?? 0;
  if (!nearTermCount) return null;

  return (
    <Link href={`/work-program/${projectId}/demand?tab=procurement`}>
      <a
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 hover:bg-red-100 transition-colors"
        data-testid="badge-shortage-indicator"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        {nearTermCount} material{nearTermCount > 1 ? "s" : ""} at risk this month
      </a>
    </Link>
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
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  // 029A Part E: remember the active tab per project so returning from
  // Earthwork Control / Settings lands the user where they left off.
  const [activeTab, setActiveTab] = useState(() => {
    try { return sessionStorage.getItem(`wp-tab-${params.id}`) || "gantt"; }
    catch { return "gantt"; }
  });
  const ganttEditorGuardRef = useRef<(() => boolean) | null>(null);
  const confirmLeaveEditor = useCallback(() => {
    if (!ganttEditorGuardRef.current?.()) return true;
    return window.confirm("You have unsaved stretch edits. Leave anyway and discard them?");
  }, []);
  const handleTabChange = useCallback((tab: string) => {
    if (!confirmLeaveEditor()) return;
    setActiveTab(tab);
    try { sessionStorage.setItem(`wp-tab-${params.id}`, tab); } catch { /* ignore */ }
  }, [params.id, confirmLeaveEditor]);
  // Rehydrate the remembered tab when navigating between projects in-place.
  useEffect(() => {
    try { setActiveTab(sessionStorage.getItem(`wp-tab-${params.id}`) || "gantt"); } catch { /* ignore */ }
  }, [params.id]);
  const [strImportOpen, setStrImportOpen] = useState(false);
  // ── 030A: PM/Admin bulk side confirmation for null-side road bars ─────────
  const [bulkSideOpen, setBulkSideOpen] = useState(false);
  const [bulkSideChoice, setBulkSideChoice] = useState("full_width");
  const [bulkSideSelected, setBulkSideSelected] = useState<Set<number>>(new Set());
  const [seqDialogOpen, setSeqDialogOpen] = useState(false);
  const [seqFronts, setSeqFronts] = useState("");         // "" = auto
  const [seqStagger, setSeqStagger] = useState("1");      // months (0 = concurrent)
  const [seqLag, setSeqLag] = useState("0.25");           // months
  const [seqStrGroups, setSeqStrGroups] = useState("");   // "" = same as road fronts
  const [seqBrgGroups, setSeqBrgGroups] = useState("");   // "" = same as road fronts
  const [seqRulesOpen, setSeqRulesOpen] = useState(false);
  // ── Instruction 029: editable stretch table + pre-regeneration confirmation ──
  // Each row is kept as strings for smooth editing; converted on submit.
  type SeqStretchRow = { label: string; from: string; to: string; priority: string; qtyPct: string; side: string; front: string; widthM: string };
  // 029C Part D — explicit override reason when the preview shows overallocation
  const [seqOverallocReason, setSeqOverallocReason] = useState("");
  const [seqStretches, setSeqStretches] = useState<SeqStretchRow[]>([]);
  const [seqRegenSummary, setSeqRegenSummary] = useState<{
    toRecreate: number; preservedUpdated: number; newBars: number;
    blocked: Array<{ barId: number; boqItemId: number; reachLabel: string | null; arrangementIds: number[] }>;
    stretchGaps: Array<{ from: number; to: number }>;
    // 029C Part F — compact quantity preview + conflicts
    allocationPreview?: Array<{
      boqItemId: number; description: string; unit: string; boqQty: number;
      totalAllocated: number; unallocated: number; overallocated: number;
      programmedPct: number | null;
      rows: Array<{ reachLabel: string | null; side: string | null; qty: number; rule: string; note: string | null }>;
    }>;
    overallocatedItems?: Array<{ boqItemId: number; description: string; boqQty: number; planned: number; excess: number }>;
    qtyConflicts?: Array<{ barId: number; reachLabel: string | null; keptQty: number; autoQty: number }>;
  } | null>(null);
  const [seqDryRunPending, setSeqDryRunPending] = useState(false);
  // When true (default), structure-type BOQ items are excluded from auto-sequence
  // so imported per-location bars are not overlaid with auto-generated linear bars.
  // Uncheck only for legacy projects that have no imported structure bars.
  const [seqSkipStructureItems, setSeqSkipStructureItems] = useState(true);
  // Any change to the sequencing inputs invalidates a previously fetched
  // pre-regeneration summary — the user must re-run the dry-run check so the
  // confirmation always reflects the inputs that will actually be submitted.
  useEffect(() => {
    setSeqRegenSummary(null);
    setSeqOverallocReason("");
  }, [seqStretches, seqFronts, seqStagger, seqLag, seqStrGroups, seqBrgGroups, seqSkipStructureItems]);

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
    onSuccess: async (data: { recipied?: number; snlRecipied?: number; totalItems?: number; unrecipiedCount?: number; unrecipied?: Array<{ id: number; description: string; workCategory: string | null; reason: string; suggestion: string }> }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "item-equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      const snlNote = data?.snlRecipied ? ` (${data.snlRecipied} from SDB norms)` : "";
      let skipNote = "";
      if (data?.unrecipiedCount && data.unrecipiedCount > 0) {
        const items = data.unrecipied ?? [];
        if (items.length === 1) {
          skipNote = ` · 1 item needs attention: "${(items[0].description ?? "").slice(0, 60)}" — ${items[0].reason}`;
        } else {
          skipNote = ` · ${data.unrecipiedCount} items need attention — open BOQ Item Review to assign Work Categories or run SNL Auto-Map.`;
        }
      }
      toast({
        title: "Recipes built",
        description: `${data?.recipied ?? 0} of ${data?.totalItems ?? 0} items got equipment & labour${snlNote}.${skipNote}`,
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
    mutationFn: async (opts: { fronts?: number; staggerMonths: number; lagMonths: number; structureGroups?: number; bridgeGroups?: number; disableStructureFronts?: boolean; stretches?: RoadStretchInput[] }) => {
      const body: Record<string, unknown> = { staggerMonths: opts.staggerMonths, lagMonths: opts.lagMonths };
      if (opts.fronts && opts.fronts > 0) body.fronts = opts.fronts;
      if (opts.structureGroups && opts.structureGroups > 0) body.structureGroups = opts.structureGroups;
      if (opts.bridgeGroups && opts.bridgeGroups > 0) body.bridgeGroups = opts.bridgeGroups;
      // Always send disableStructureFronts as an explicit boolean so the server can rely on it
      body.disableStructureFronts = opts.disableStructureFronts !== false;
      if (opts.stretches && opts.stretches.length > 0) body.stretches = opts.stretches; // Instruction 029
      // 029C Part D — explicit overallocation override reason (audited server-side)
      if ((opts as any).overallocationOverrideReason) body.overallocationOverrideReason = (opts as any).overallocationOverrideReason;
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/auto-sequence`, body);
      return res.json();
    },
    onMutate: pushSnapshot,
    onSuccess: async (data: {
      bars?: number;
      fronts?: number;
      regenSummary?: { blocked?: Array<{ reachLabel: string | null; arrangementIds: number[] }>; preservedUpdated?: number; stretchGaps?: Array<{ from: number; to: number }> };
      unclassifiedCount?: number;
      unclassifiedItems?: {
        id: number;
        description: string;
        workCategory: string | null;
        unit: string;
        resolvedWorkType: string | null;
        skipReason: string;
      }[];
    }) => {
      setSeqDialogOpen(false);
      setSeqRegenSummary(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "program-settings"] });
      // Instruction 029 Part D — surface blocked (arrangement-linked) bars loudly
      if (data?.regenSummary?.blocked?.length) {
        const labels = data.regenSummary.blocked.map(b => b.reachLabel ?? `bar ${ (b as any).barId }`).join(", ");
        toast({
          title: `${data.regenSummary.blocked.length} bar(s) kept unchanged`,
          description: `Linked to earthwork arrangements and no new stretch overlaps them: ${labels}. Adjust stretch chainages or unlink the arrangement first.`,
          variant: "destructive",
        });
      }
      let skipNote = "";
      if (data?.unclassifiedCount) {
        const count = data.unclassifiedCount;
        if (count === 1 && data.unclassifiedItems?.[0]) {
          const u = data.unclassifiedItems[0];
          const cat = u.workCategory ? ` (${u.workCategory})` : "";
          skipNote = ` · 1 item skipped${cat}: ${u.skipReason}`;
        } else {
          skipNote = ` · ${count} item(s) skipped — no recognised work type or stage. Open BOQ Item Review to assign Work Categories.`;
        }
      }
      toast({
        title: "Programme sequenced",
        description: `${data?.bars ?? 0} bars across ${data?.fronts ?? 0} reach-wise fronts, dependency-ordered.${skipNote}`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Auto-sequence failed",
        description: String(err?.message ?? err ?? "Unknown error"),
        variant: "destructive",
      }),
  });

  // ── 030A: null-side road bars eligible for bulk side confirmation ─────────
  const nullSideRoadBars = useMemo(() => {
    const itemById = new Map(items.map(it => [it.id, it]));
    return bars.filter(b => {
      if ((b as any).side != null) return false;
      if ((b as any).planningMode === "structure_location") return false;
      const it = itemById.get(b.boqItemId);
      if (!it) return false;
      if (isStructureOrLocationScheduledItem(it as any, { hasStructureImportBar: false })) return false;
      return geometryApplicability((it.layerConfig as LayerConfig | null)?.layerType ?? null).side;
    });
  }, [bars, items]);

  const bulkSideMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/boq/projects/${projectId}/programme/bulk-side`, {
      barIds: Array.from(bulkSideSelected),
      side: bulkSideChoice,
    }),
    onSuccess: async (res: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      setBulkSideOpen(false);
      setBulkSideSelected(new Set());
      toast({ title: "Sides confirmed", description: `${res?.updated ?? "Selected"} bar(s) updated.` });
    },
    onError: (err: any) => toast({ title: "Bulk side confirmation failed", description: String(err?.message ?? err), variant: "destructive" }),
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
      // Instruction 029 — always hydrate the stretch table from persisted
      // settings (empty when none saved) so stale in-memory rows never leak
      // into a later run and silently override the legacy equal-split path.
      const savedStretches = (stored as any).stretches;
      setSeqStretches(Array.isArray(savedStretches) && savedStretches.length > 0
        ? savedStretches.map((s: any) => ({
            label: s.label ?? "",
            from: s.chainageFrom != null ? String(s.chainageFrom) : "",
            to: s.chainageTo != null ? String(s.chainageTo) : "",
            priority: s.priority != null ? String(s.priority) : "",
            qtyPct: s.manualQtyFraction != null ? String(+(s.manualQtyFraction * 100).toFixed(2)) : "",
            side: s.side ?? "", // 030A
            front: s.front ?? "", // 029B
            widthM: s.plannedWidthM != null ? String(s.plannedWidthM) : "", // 029C
          }))
        : []);
    } else {
      setSeqStretches([]);
    }
    setSeqRegenSummary(null);
    setSeqDialogOpen(true);
  }

  // ── Instruction 029: stretch-table helpers ────────────────────────────────
  const projChFromKm = (effectiveProject as any)?.chainageFrom ?? 0;
  const projChToKm = (effectiveProject as any)?.chainageTo
    ?? (projChFromKm + (effectiveProject?.roadLengthKm ?? 0));

  /** Equal-split starting point: N rows over the real project chainage range. */
  function fillEqualStretches(countRaw?: number) {
    const count = Math.max(1, Math.min(10, countRaw ?? (parseInt(seqFronts) || 2)));
    const from = projChFromKm, to = projChToKm;
    const len = Math.max(0, to - from) / count;
    setSeqStretches(Array.from({ length: count }, (_, i) => ({
      label: "",
      from: (from + i * len).toFixed(3),
      to: (from + (i + 1) * len).toFixed(3),
      priority: String(i + 1),
      qtyPct: "",
      side: "",
      front: "",
      widthM: "",
    })));
  }

  /** Convert editable rows → payload; null when the table is empty (legacy mode). */
  function stretchesPayload(): RoadStretchInput[] | null {
    if (seqStretches.length === 0) return null;
    // 029B: executionOrder = row position within its stage (display-only tiebreaker).
    const stageCounters = new Map<number, number>();
    return seqStretches.map((r, i) => {
      const stage = parseInt(r.priority) || i + 1;
      const orderInStage = (stageCounters.get(stage) ?? 0) + 1;
      stageCounters.set(stage, orderInStage);
      return {
        label: r.label.trim() || null,
        chainageFrom: parseFloat(r.from),
        chainageTo: parseFloat(r.to),
        priority: stage,
        manualQtyFraction: r.qtyPct.trim() !== "" && parseFloat(r.qtyPct) > 0
          ? Math.min(100, parseFloat(r.qtyPct)) / 100
          : null,
        side: r.side || null, // 030A — optional per-stretch side, carried onto road bars
        front: r.front.trim() || null, // 029B — execution front label
        executionOrder: orderInStage,  // 029B — derived from row position within stage
        plannedWidthM: r.widthM.trim() !== "" && parseFloat(r.widthM) > 0 ? parseFloat(r.widthM) : null, // 029C
      };
    });
  }

  // 029C Part B: reject non-integer Stage values with a message instead of
  // silently truncating via parseInt.
  const seqStageErrors = useMemo(() => {
    const errs: string[] = [];
    seqStretches.forEach((r, i) => {
      const raw = r.priority.trim();
      if (raw === "") return; // blank = default (row order)
      if (!/^\d+$/.test(raw) || parseInt(raw, 10) < 1) {
        errs.push(`Row ${i + 1}: Stage "${raw}" is invalid — must be a whole number ≥ 1 (e.g. 1, 2, 3).`);
      }
    });
    return errs;
  }, [seqStretches]);

  // 029C Part B: front suggestions — defaults + labels already used in this project.
  const frontSuggestions = useMemo(() => {
    const set = new Set<string>(["Front A", "Front B", "Front C"]);
    for (const b of bars) {
      const f = (b as any).executionFront;
      if (typeof f === "string" && f.trim()) set.add(f.trim());
    }
    for (const r of seqStretches) if (r.front.trim()) set.add(r.front.trim());
    return Array.from(set);
  }, [bars, seqStretches]);

  /** Live validation for the dialog — overlaps/errors block, gaps + warnings inform. */
  const seqStretchValidation = useMemo(() => {
    const payload = seqStretches.length > 0
      ? seqStretches.map((r, i) => ({
          label: r.label.trim() || null,
          chainageFrom: parseFloat(r.from),
          chainageTo: parseFloat(r.to),
          priority: parseInt(r.priority) || i + 1,
          side: r.side || null,       // 029B Part D — side-aware overlap validation
          front: r.front.trim() || null, // 029B Part C — same-stage/front warning
        }))
      : [];
    if (payload.length === 0) return { errors: [], overlaps: [], gaps: [], warnings: [] };
    return validateStretches(payload, projChFromKm, projChToKm);
  }, [seqStretches, projChFromKm, projChToKm]);

  // One-sided stretch (LHS/RHS) with no opposite-side row overlapping its
  // chainage → non-blocking hint: half the quantity will stay unallocated.
  const seqMissingOppositeSide = useMemo(() => {
    const rows = seqStretches.map((r, i) => ({
      label: r.label.trim() || `Reach ${parseInt(r.priority) || i + 1}`,
      from: parseFloat(r.from),
      to: parseFloat(r.to),
      side: r.side || null,
    })).filter(r => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from);
    const opp: Record<string, string> = { lhs: "rhs", rhs: "lhs" };
    const hints: string[] = [];
    for (const r of rows) {
      if (!r.side || !(r.side in opp)) continue;
      const hasOpposite = rows.some(o =>
        o !== r && o.side === opp[r.side!] &&
        Math.min(o.to, r.to) - Math.max(o.from, r.from) > 0,
      );
      if (!hasOpposite) {
        hints.push(
          `${r.label} is ${r.side.toUpperCase()} only — the other half of the quantity over Km ${r.from}–${r.to} will stay unallocated (shown in the preview). Add a matching ${opp[r.side]!.toUpperCase()} stretch now or later, or choose Full Width.`,
        );
      }
    }
    return hints;
  }, [seqStretches]);

  function seqBodyOpts() {
    const fronts = parseInt(seqFronts) || 0;
    // Allow stagger = 0 (concurrent fronts)
    const staggerRaw = parseFloat(seqStagger);
    const stagger = !isNaN(staggerRaw) ? staggerRaw : 1;
    const lagRaw = parseFloat(seqLag);
    const lag = !isNaN(lagRaw) ? lagRaw : 0.25;
    const strGroups = parseInt(seqStrGroups) || 0;
    const brgGroups = parseInt(seqBrgGroups) || 0;
    return {
      fronts: fronts > 0 ? fronts : undefined,
      staggerMonths: stagger,
      lagMonths: lag,
      structureGroups: strGroups > 0 ? strGroups : undefined,
      bridgeGroups: brgGroups > 0 ? brgGroups : undefined,
      disableStructureFronts: seqSkipStructureItems,
      stretches: stretchesPayload() ?? undefined,
    };
  }

  // Instruction 029 Part D — two-phase flow: dry-run first for the
  // pre-regeneration summary, then explicit confirmation applies it.
  async function runAutoSequence() {
    if (seqStretchValidation.errors.length > 0 || seqStretchValidation.overlaps.length > 0 || seqStageErrors.length > 0) return; // blocked in UI
    const opts = seqBodyOpts();
    setSeqDryRunPending(true);
    try {
      const body: Record<string, unknown> = {
        staggerMonths: opts.staggerMonths, lagMonths: opts.lagMonths,
        disableStructureFronts: opts.disableStructureFronts !== false, dryRun: true,
      };
      if (opts.fronts) body.fronts = opts.fronts;
      if (opts.structureGroups) body.structureGroups = opts.structureGroups;
      if (opts.bridgeGroups) body.bridgeGroups = opts.bridgeGroups;
      if (opts.stretches) body.stretches = opts.stretches;
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/auto-sequence`, body);
      const data = await res.json();
      setSeqRegenSummary(data?.regenSummary ?? { toRecreate: 0, preservedUpdated: 0, newBars: data?.wouldCreateBars ?? 0, blocked: [], stretchGaps: [] });
    } catch (err: any) {
      toast({ title: "Auto-sequence check failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setSeqDryRunPending(false);
    }
  }

  function confirmAutoSequence() {
    // 029C Part D — pass the explicit override reason when the preview showed overallocation
    const opts: Record<string, unknown> = { ...seqBodyOpts() };
    if (seqOverallocReason.trim()) opts.overallocationOverrideReason = seqOverallocReason.trim();
    autoSequenceMutation.mutate(opts as any);
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
      !isStructureOrLocationScheduledItem(it as any, { hasStructureImportBar: structureImportItemIds.has(it.id) }),
    );

    const skippedStructure = items.filter(it =>
      !programmedIds.has(it.id) &&
      (it.currentQty ?? 0) > 0 &&
      isStructureOrLocationScheduledItem(it as any, { hasStructureImportBar: structureImportItemIds.has(it.id) }),
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
        ? calculateAutoDurationFull(qty, (item as any).canonicalUnit ?? item.unit, equipment, workingHrs, workingDays, prodSettings, itemType)
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
      ...items
        .filter(it => isStructureOrLocationScheduledItem(it as any, { hasStructureImportBar: structureImportItemIds.has(it.id) }))
        .map(it => it.id),
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

  const unscheduledStructureBars = useMemo(
    () => bars.filter(b => (b as any).planningMode === "structure_location" && ((b as any).scheduled === false || (b as any).needsReview === true)),
    [bars],
  );

  // 029A §15: Structures menu items are always present — enable state only.
  const hasStructureItems = useMemo(
    () => items.some(it => isStructureOrLocationScheduledItem(it as any, { hasStructureImportBar: structureImportItemIds.has(it.id) })),
    [items, structureImportItemIds],
  );

  const rescheduleStructuresMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/auto-sequence-structures`, { scope: "unscheduled" });
      return res.json();
    },
    onSuccess: async (data: { updated: number; structures: number; fronts: number; needsReviewCount: number }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({
        title: "Structure bars sequenced",
        description: `${data.updated} bar(s) placed across ${data.structures} structure(s) / ${data.fronts} front(s)`
          + (data.needsReviewCount ? ` — ${data.needsReviewCount} used default durations (needs review)` : ""),
      });
    },
    onError: (err: any) =>
      toast({ title: "Auto-sequence failed", description: String(err?.message ?? err), variant: "destructive" }),
  });

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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Work Programme</h1>
            <ShortageIndicatorBadge projectId={projectId} />
          </div>
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
        {/* ── 029A Part D: stable primary toolbar — layout never rearranges with
            project conditions; conditional state only affects enabled/disabled,
            counts and attention indicators inside the menus. ── */}
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={!canUndo || restoreMutation.isPending || activeTab !== "gantt"}
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
            disabled={!canRedo || restoreMutation.isPending || activeTab !== "gantt"}
            onClick={handleRedo}
            data-testid="button-redo"
            title="Redo"
            className="border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
            onClick={openSeqDialog}
            disabled={autoSequenceMutation.isPending || items.length === 0}
            data-testid="button-auto-sequence"
            title={items.length === 0 ? "Import BOQ items first" : "Open the auto-sequence settings dialog to configure fronts, stretches, stagger, and lag, then run the sequencer."}
          >
            {autoSequenceMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              : <ArrowLeftRight className="w-4 h-4 mr-1" />}
            Auto-sequence
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-teal-300 text-teal-700 hover:bg-teal-50"
            onClick={handleAutoGenerate}
            disabled={autoGenMutation.isPending || items.length === 0}
            data-testid="button-auto-generate-programme"
            title={items.length === 0 ? "Import BOQ items first" : "Create a bar for every unprogrammed item. Duration is auto-computed from SNL equipment norms; all start at Month 1 — then drag or set each item's start month."}
          >
            {autoGenMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              : <Sparkles className="w-4 h-4 mr-1" />}
            Auto-generate
          </Button>
          <Link href={`/work-program/${projectId}/demand`}>
            <a onClick={e => { if (!confirmLeaveEditor()) e.preventDefault(); }}>
              <Button variant="outline" size="sm" data-testid="button-bom-demand">
                <BookOpen className="w-4 h-4 mr-1" />
                BOM &amp; Demand
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/scope`}>
            <a onClick={e => { if (!confirmLeaveEditor()) e.preventDefault(); }}>
              <Button variant="outline" size="sm" data-testid="button-project-scope"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <MapPin className="w-4 h-4 mr-1" />
                Scope
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/settings`}>
            <a onClick={e => { if (!confirmLeaveEditor()) e.preventDefault(); }}>
              <Button variant="outline" size="sm" data-testid="button-programme-settings"
                className="border-teal-200 text-teal-700 hover:bg-teal-50">
                <Settings2 className="w-4 h-4 mr-1" />
                Settings
              </Button>
            </a>
          </Link>

          {/* Structures menu — one stable home for all structure actions (029A §15) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-violet-300 text-violet-700 hover:bg-violet-50 relative"
                data-testid="button-structures-menu"
              >
                <Building2 className="w-4 h-4 mr-1" />
                Structures
                {(unscheduledStructureBars.length > 0 || hasStrayStructureBars) && (
                  <span
                    className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold"
                    title={`${unscheduledStructureBars.length > 0 ? `${unscheduledStructureBars.length} imported bar(s) need scheduling. ` : ""}${hasStrayStructureBars ? "Stray road-style bars on structure items." : ""}`}
                    data-testid="badge-structures-attention"
                  >
                    {unscheduledStructureBars.length > 0 ? unscheduledStructureBars.length : "!"}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-xs">Structure schedule</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!hasStructureItems}
                onClick={() => setStrImportOpen(true)}
                title={!hasStructureItems ? "No structure/point-location BOQ items in this project" : undefined}
                data-testid="button-import-structure-schedule"
              >
                <Upload className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Import Structures</span>
                  {!hasStructureItems && <span className="text-[10px] text-slate-400">No structure items in this project</span>}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={unscheduledStructureBars.length === 0 || rescheduleStructuresMutation.isPending}
                onClick={() => rescheduleStructuresMutation.mutate()}
                data-testid="button-auto-sequence-structures"
              >
                <Building2 className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Auto-sequence imported bars{unscheduledStructureBars.length > 0 ? ` (${unscheduledStructureBars.length})` : ""}</span>
                  {unscheduledStructureBars.length === 0 && <span className="text-[10px] text-slate-400">All imported structure bars are scheduled</span>}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasStrayStructureBars || cleanStructureBarsMutation.isPending}
                onClick={() => cleanStructureBarsMutation.mutate()}
                data-testid="button-clean-structure-bars"
              >
                <Scissors className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Clean Structure Bars</span>
                  {!hasStrayStructureBars && <span className="text-[10px] text-slate-400">No stray road-style bars on structure items</span>}
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More menu — less-frequent non-structure actions (029A §16) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-slate-300 text-slate-600" data-testid="button-toolbar-more">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                disabled={items.length === 0 || autoBuildRecipesMutation.isPending}
                onClick={() => autoBuildRecipesMutation.mutate()}
                title="Classify every BOQ item by work-type and attach equipment + labour from the planning master. Durations and the Gantt come from these."
                data-testid="button-auto-build-recipes"
              >
                {autoBuildRecipesMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                Auto-build recipes
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={nullSideRoadBars.length === 0}
                onClick={() => {
                  setBulkSideSelected(new Set(nullSideRoadBars.map(b => b.id)));
                  setBulkSideOpen(true);
                }}
                title="Set the side (Full Width / LHS / RHS / Both Sides) on legacy road bars that have no side recorded. Reviewed batch action — nothing is set automatically."
                data-testid="button-bulk-side"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                Confirm bar sides{nullSideRoadBars.length > 0 ? ` (${nullSideRoadBars.length})` : ""}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 030A: bulk side confirmation dialog ── */}
      <Dialog open={bulkSideOpen} onOpenChange={setBulkSideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm bar sides</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            These road bars have no side recorded (shown as “Side Review Required”). Pick the bars and the side to apply.
            Bars stay fully usable either way — this is a reviewed correction, never automatic.
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
            {nullSideRoadBars.map(b => (
              <label key={b.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`bulk-side-row-${b.id}`}>
                <input
                  type="checkbox"
                  checked={bulkSideSelected.has(b.id)}
                  onChange={e => setBulkSideSelected(prev => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(b.id); else next.delete(b.id);
                    return next;
                  })}
                />
                <span className="font-mono">{(b as any).reachLabel ?? `#${b.id}`}</span>
                <span className="text-muted-foreground">Ch {b.chainageFrom ?? "?"}–{b.chainageTo ?? "?"}</span>
                <span className="text-muted-foreground truncate">{shortItemName(items.find(it => it.id === b.boqItemId) as any)}</span>
              </label>
            ))}
            {nullSideRoadBars.length === 0 && <p className="text-xs text-muted-foreground">No bars need side confirmation.</p>}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Side to apply</Label>
            <select
              value={bulkSideChoice}
              onChange={e => setBulkSideChoice(e.target.value)}
              className="h-8 text-xs rounded border border-input bg-transparent px-2"
              data-testid="select-bulk-side"
            >
              {(["full_width", "lhs", "rhs", "both_sides"] as const).map(sd => (
                <option key={sd} value={sd}>{BAR_SIDE_LABELS[sd]}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulkSideOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={bulkSideSelected.size === 0 || bulkSideMutation.isPending}
              onClick={() => bulkSideMutation.mutate()}
              data-testid="button-bulk-side-apply"
            >
              {bulkSideMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Apply to {bulkSideSelected.size} bar(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        {/* 029B Part A: viewport-safe height — the body scrolls, the footer stays visible */}
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-purple-600" />
              Auto-Sequence Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto overflow-x-auto flex-1 min-h-0 pr-1">
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

            {/* ── Instruction 029: real stretch table ─────────────────────── */}
            <div className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Road stretches (chainage + execution stage/front)</Label>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]"
                    onClick={() => fillEqualStretches()} data-testid="button-seq-equal-split">
                    Equal split
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]"
                    onClick={() => setSeqStretches(s => [...s, { label: "", from: "", to: "", priority: String(s.length + 1), qtyPct: "", side: "", front: "", widthM: "" }])}
                    data-testid="button-seq-add-stretch">
                    + Row
                  </Button>
                  {seqStretches.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground"
                      onClick={() => setSeqStretches([])} data-testid="button-seq-clear-stretches">
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {seqStretches.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  No stretch rows — the road will be divided equally by front count. Click “Equal split” to
                  edit real chainages and set execution priority per stretch.
                </p>
              ) : (
                <div className="space-y-1">
                  {/* 029C Part B: persistently visible helper text (tooltips stay as supplementary) */}
                  <p className="text-[10px] text-muted-foreground bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1" data-testid="text-stage-front-help">
                    <b>Stage</b> controls when a reach starts — reaches sharing a stage start together. <b>Front</b> identifies the crew or resource group executing it, e.g. Front A, Front B. <b>Width</b> (optional, m): when LHS and RHS reaches have identical boundaries and both widths set, quantity splits by width instead of 50:50.
                  </p>
                  <datalist id="front-suggestions">
                    {frontSuggestions.map(f => <option key={f} value={f} />)}
                  </datalist>
                  <div className="grid grid-cols-[1fr_62px_62px_44px_66px_50px_50px_78px_24px] gap-1 text-[10px] font-medium text-muted-foreground px-0.5">
                    <span>Label (optional)</span><span>Km from</span><span>Km to</span><span title="Execution stage — stretches sharing a stage start together (parallel work)">Stage</span><span title="Execution front / crew label (optional). Same stage + same front = double-booking warning.">Front</span><span title="Manual allocation — fraction of BOQ item quantity (%). Overrides all automatic side allocation.">Qty %</span><span title="Planned width (m) — used only for the automatic width-matched LHS/RHS split">Width</span><span>Side</span><span />
                  </div>
                  {seqStretches.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_62px_62px_44px_66px_50px_50px_78px_24px] gap-1 items-center">
                      <Input value={r.label} placeholder={`Reach ${r.priority || i + 1}`} className="h-7 text-xs"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        data-testid={`input-stretch-label-${i}`} />
                      <Input value={r.from} type="number" step={0.001} className="h-7 text-xs"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, from: e.target.value } : x))}
                        data-testid={`input-stretch-from-${i}`} />
                      <Input value={r.to} type="number" step={0.001} className="h-7 text-xs"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, to: e.target.value } : x))}
                        data-testid={`input-stretch-to-${i}`} />
                      <Input value={r.priority} type="number" min={1} step={1} className="h-7 text-xs"
                        title="Execution stage — the same stage on two rows is normal (they mobilise together)"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, priority: e.target.value } : x))}
                        data-testid={`input-stretch-priority-${i}`} />
                      <Input value={r.front} placeholder="—" className="h-7 text-xs" list="front-suggestions"
                        title="Execution front / crew label (optional), e.g. Front A, Front B"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, front: e.target.value } : x))}
                        data-testid={`input-stretch-front-${i}`} />
                      <Input value={r.qtyPct} type="number" min={0} max={100} placeholder="auto" className="h-7 text-xs"
                        title="Manual allocation — fraction of BOQ item quantity (%). Blank = automatic. Overrides all automatic side allocation."
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, qtyPct: e.target.value } : x))}
                        data-testid={`input-stretch-qty-${i}`} />
                      <Input value={r.widthM} type="number" min={0} step={0.1} placeholder="—" className="h-7 text-xs"
                        title="Planned width (m) — used only for the automatic width-matched LHS/RHS split"
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, widthM: e.target.value } : x))}
                        data-testid={`input-stretch-width-${i}`} />
                      <select value={r.side} className="h-7 text-[11px] rounded border border-input bg-transparent px-1"
                        title="Optional side for this stretch — carried onto every road bar it generates. Blank = unspecified."
                        onChange={e => setSeqStretches(s => s.map((x, j) => j === i ? { ...x, side: e.target.value } : x))}
                        data-testid={`select-stretch-side-${i}`}>
                        <option value="">—</option>
                        {BAR_SIDES.map(sd => <option key={sd} value={sd}>{BAR_SIDE_LABELS[sd]}</option>)}
                      </select>
                      <button type="button" className="text-slate-400 hover:text-red-500 text-xs"
                        onClick={() => setSeqStretches(s => s.filter((_, j) => j !== i))}
                        data-testid={`button-stretch-remove-${i}`}>✕</button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    Stage 1 mobilises first — independent of chainage position. Stretches sharing a stage start together (e.g. LHS + RHS in parallel). Reordering stages never changes chainages.
                  </p>
                  {seqStageErrors.length > 0 && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5" data-testid="text-stage-errors">
                      {seqStageErrors.map((e, i) => <p key={`se${i}`}>• {e}</p>)}
                    </div>
                  )}
                  {(seqStretchValidation.errors.length > 0 || seqStretchValidation.overlaps.length > 0) && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5" data-testid="text-stretch-errors">
                      {seqStretchValidation.errors.map((e, i) => <p key={`e${i}`}>• {e}</p>)}
                      {seqStretchValidation.overlaps.map((o, i) => (
                        <p key={`o${i}`}>• {o.aLabel} and {o.bLabel} overlap between Km {o.overlapFrom} and Km {o.overlapTo}</p>
                      ))}
                    </div>
                  )}
                  {seqStretchValidation.gaps.length > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400" data-testid="text-stretch-gaps">
                      ⚠ Uncovered chainage: {seqStretchValidation.gaps.map(g => `Km ${g.from}–${g.to}`).join(", ")} (allowed — gap will simply not be programmed)
                    </p>
                  )}
                  {(seqStretchValidation as any).warnings?.length > 0 && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5" data-testid="text-stretch-warnings">
                      {(seqStretchValidation as any).warnings.map((w: string, i: number) => <p key={`w${i}`}>⚠ {w}</p>)}
                    </div>
                  )}
                  {seqMissingOppositeSide.length > 0 && (
                    <div className="text-[11px] text-sky-700 dark:text-sky-400 space-y-0.5" data-testid="text-missing-opposite-side">
                      {seqMissingOppositeSide.map((h, i) => <p key={`ms${i}`}>ℹ {h}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Instruction 029 Part D: pre-regeneration summary ─────────── */}
            {seqRegenSummary && (
              <div className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-2.5 space-y-1" data-testid="panel-regen-summary">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Review before regenerating</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {seqRegenSummary.newBars} new bars will be created · {seqRegenSummary.toRecreate} existing auto bars replaced
                  {seqRegenSummary.preservedUpdated > 0 && <> · <b>{seqRegenSummary.preservedUpdated} arrangement-linked bar(s) preserved</b> (updated in place, links kept)</>}
                </p>
                {seqRegenSummary.blocked.length > 0 && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    {seqRegenSummary.blocked.length} bar(s) linked to earthwork arrangements have no overlapping new stretch and will be KEPT UNCHANGED: {seqRegenSummary.blocked.map(b => b.reachLabel ?? `#${b.barId}`).join(", ")}
                  </p>
                )}
                {/* ── 029C Part F: quantity allocation preview ─────────────── */}
                {(seqRegenSummary.allocationPreview?.length ?? 0) > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-purple-100 dark:border-purple-900 rounded bg-white/60 dark:bg-slate-950/40" data-testid="panel-allocation-preview">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        <tr>
                          <th className="text-left px-1.5 py-1 font-medium">Item</th>
                          <th className="text-right px-1.5 py-1 font-medium">BOQ qty</th>
                          <th className="text-right px-1.5 py-1 font-medium">Programmed</th>
                          <th className="text-right px-1.5 py-1 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seqRegenSummary.allocationPreview!.map(ap => (
                          <tr key={ap.boqItemId} className="border-t border-slate-100 dark:border-slate-800 align-top">
                            <td className="px-1.5 py-0.5">
                              <span className="line-clamp-1">{ap.description}</span>
                              {ap.rows.some(rw => rw.note) && (
                                <span className="text-amber-600 dark:text-amber-400 block">{ap.rows.find(rw => rw.note)?.note}</span>
                              )}
                            </td>
                            <td className="px-1.5 py-0.5 text-right whitespace-nowrap">{ap.boqQty.toLocaleString()} {ap.unit}</td>
                            <td className="px-1.5 py-0.5 text-right whitespace-nowrap">{ap.totalAllocated.toLocaleString()}</td>
                            <td className="px-1.5 py-0.5 text-right whitespace-nowrap">
                              {ap.overallocated > 0
                                ? <span className="text-red-600 dark:text-red-400 font-medium">over by {ap.overallocated.toLocaleString()}</span>
                                : ap.programmedPct != null
                                  ? <span className={ap.unallocated > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                                      {ap.programmedPct}% programmed{ap.unallocated > 0 ? ` · ${(100 - ap.programmedPct).toFixed(1)}% not yet allocated` : ""}
                                    </span>
                                  : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(seqRegenSummary.qtyConflicts?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400" data-testid="text-qty-conflicts">
                    ⚠ {seqRegenSummary.qtyConflicts!.length} preserved bar(s) have a manually set quantity that will be KEPT (not overwritten by the automatic calculation): {seqRegenSummary.qtyConflicts!.map(c => `${c.reachLabel ?? `#${c.barId}`} (kept ${c.keptQty.toLocaleString()}, auto ${c.autoQty.toLocaleString()})`).join("; ")}
                  </p>
                )}
                {(seqRegenSummary.overallocatedItems?.length ?? 0) > 0 && (
                  <div className="space-y-1" data-testid="panel-overallocation">
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                      Planned quantity exceeds the BOQ quantity for {seqRegenSummary.overallocatedItems!.length} item(s). Generation is blocked unless you provide an explicit override reason.
                    </p>
                    <Input
                      value={seqOverallocReason}
                      placeholder="Override reason (required to proceed despite overallocation)"
                      className="h-7 text-xs"
                      onChange={e => setSeqOverallocReason(e.target.value)}
                      data-testid="input-overalloc-reason"
                    />
                  </div>
                )}
              </div>
            )}

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
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setSeqDialogOpen(false)}>
              Cancel
            </Button>
            {seqRegenSummary ? (
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={confirmAutoSequence}
                disabled={autoSequenceMutation.isPending
                  || ((seqRegenSummary.overallocatedItems?.length ?? 0) > 0 && !seqOverallocReason.trim())}
                data-testid="button-confirm-auto-sequence"
              >
                {autoSequenceMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Sequencing…</>
                  : <><ArrowLeftRight className="w-3.5 h-3.5 mr-1" />Confirm & Generate</>}
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={runAutoSequence}
                disabled={seqDryRunPending || seqStretchValidation.errors.length > 0 || seqStretchValidation.overlaps.length > 0 || seqStageErrors.length > 0}
                data-testid="button-run-auto-sequence"
              >
                {seqDryRunPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Checking…</>
                  : <><ArrowLeftRight className="w-3.5 h-3.5 mr-1" />Run Sequence</>}
              </Button>
            )}
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
        <Tabs value={activeTab} onValueChange={handleTabChange}>
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
                editorGuardRef={ganttEditorGuardRef}
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
            <PlanVsActualTable projectId={projectId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
