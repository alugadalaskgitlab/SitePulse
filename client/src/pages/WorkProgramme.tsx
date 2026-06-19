import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Plus, Trash2,
  AlertTriangle, CheckCircle2, Loader2, CalendarDays,
  Scissors, BookOpen, ChevronDown, ChevronUp, Info,
  GanttChartSquare, TableProperties, ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  calculateStretchQty,
  calculateAutoDurationFull,
  monthLabel,
  fmtQty,
  WORKING_DAYS_DEFAULT,
  WORKING_HRS_DEFAULT,
  type EquipmentProductivity,
  type LayerConfig,
} from "@shared/planningEngine";
import type {
  BoqProject,
  BoqItemWithCategory,
  WorkProgramBarWithItem,
  BoqItemEquipmentWithMaster,
} from "@shared/schema";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LEFT_W = 420;       // px left sticky panel
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
    <span className="inline-flex text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
      Not programmed
    </span>
  );
  if (Math.abs(planned - boqQty) < 0.01) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Fully covered
    </span>
  );
  if (planned < boqQty) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Under by {fmtQty(boqQty - planned)} {unit}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Over by {fmtQty(planned - boqQty)} {unit}
    </span>
  );
}

// ─── StretchRow ─────────────────────────────────────────────────────────────────

interface StretchRowProps {
  bar: WorkProgramBarWithItem;
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
}

function StretchRow({
  bar, item, project, recipesMap, projectId, color, isFirst, totalMonths, colW, onDelete, onSplit,
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

  // Sync from DB when not dirty
  useEffect(() => {
    if (dirty.current) return;
    setCf(bar.chainageFrom != null ? String(bar.chainageFrom) : "");
    setCt(bar.chainageTo != null ? String(bar.chainageTo) : "");
    setStartM(String(+(bar.startMonth).toFixed(1)));
    // back-calc mult from updated bar
    const len = (bar.chainageTo ?? 0) - (bar.chainageFrom ?? 0);
    if (len > 0 && bar.plannedQty > 0) {
      setMult(String(+(bar.plannedQty / len).toFixed(4)));
    } else if (roadLen > 0 && boqQty > 0) {
      setMult(String(+(boqQty / roadLen).toFixed(4)));
    }
  }, [bar.chainageFrom, bar.chainageTo, bar.startMonth, bar.plannedQty]);

  const cfNum = parseFloat(cf);
  const ctNum = parseFloat(ct);
  const multNum = parseFloat(mult);
  const smNum = parseFloat(startM) || 1;
  const validCh = !isNaN(cfNum) && !isNaN(ctNum) && ctNum > cfNum;

  // Auto qty from chainage × editable multiplier
  const autoQty = useMemo(() => {
    if (!validCh) return null;
    const stretchLen = ctNum - cfNum;
    if (!isNaN(multNum) && multNum > 0) return +(stretchLen * multNum).toFixed(4);
    if (roadLen > 0) return calculateStretchQty(boqQty, cfNum, ctNum, roadLen);
    return boqQty;
  }, [validCh, cfNum, ctNum, multNum, roadLen, boqQty]);

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

  const effectiveQty = autoQty ?? bar.plannedQty;
  const autoDuration = useMemo(() => {
    if (effectiveQty <= 0 || !equipment.length) return null;
    return calculateAutoDurationFull(effectiveQty, item.unit, equipment, workingHrs, workingDays);
  }, [effectiveQty, item.unit, equipment, workingHrs, workingDays]);

  const autoEnd = autoDuration?.months ? +(smNum + autoDuration.months).toFixed(2) : null;

  // Haul distance from bar chainage mid to source (HMP / WMM plant / quarry)
  const haulDistanceKm = useMemo(() => {
    if (!validCh) return null;
    const barMidKm = (cfNum + ctNum) / 2;
    const lc = item.layerConfig as LayerConfig | null;
    if (!lc) return null;
    let sourceKm: number | null = null;
    if (lc.layerType === "bituminous") sourceKm = project.hmpChainageKm ?? null;
    else if (lc.layerType === "granular" && lc.granularSource === "plant") sourceKm = project.wmmPlantChainageKm ?? null;
    else if (lc.layerType === "granular") sourceKm = project.quarryChainageKm ?? null;
    if (sourceKm == null) return null;
    return Math.abs(barMidKm - sourceKm);
  }, [validCh, cfNum, ctNum, item.layerConfig, project.hmpChainageKm, project.wmmPlantChainageKm, project.quarryChainageKm]);

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
    dirty.current = false;
    const qty = autoQty ?? bar.plannedQty;
    const em = autoEnd ?? bar.endMonth;
    const isOverride = !!(autoQty != null && defaultRate != null && Math.abs(multNum - defaultRate) > 0.0001);
    patch.mutate({
      chainageFrom: validCh ? cfNum : bar.chainageFrom,
      chainageTo: validCh ? ctNum : bar.chainageTo,
      plannedQty: qty,
      startMonth: smNum,
      endMonth: em,
      isQtyOverride: isOverride,
      isDurationOverride: !autoDuration,
    });
  }

  // ── Bar positioning: use LIVE local draft values for immediate visual feedback ──
  const liveStart = smNum;
  const liveEnd = autoEnd ?? bar.endMonth;
  const liveQty = autoQty ?? bar.plannedQty;
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
        style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
        className={`flex items-center gap-1 px-1.5 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 ${
          patch.isPending ? "opacity-70" : ""
        }`}
      >
        {/* Split indicator */}
        <div
          className="flex-shrink-0 self-stretch w-0.5 mr-0.5"
          style={{ backgroundColor: isFirst ? "transparent" : color, opacity: 0.5 }}
        />
        {!isFirst && (
          <span className="text-[10px] text-orange-500 font-medium flex-shrink-0 w-8">(split)</span>
        )}

        {/* Chainage inputs */}
        <span className="text-[11px] text-slate-400 flex-shrink-0">Ch</span>
        <input
          type="number" step="0.001"
          value={cf}
          onChange={e => { dirty.current = true; setCf(e.target.value); }}
          onBlur={save}
          className="w-[52px] text-[11px] font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-cf-${bar.id}`}
        />
        <span className="text-[11px] text-slate-400 flex-shrink-0">to</span>
        <input
          type="number" step="0.001"
          value={ct}
          onChange={e => { dirty.current = true; setCt(e.target.value); }}
          onBlur={save}
          className="w-[52px] text-[11px] font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          placeholder="0.000"
          data-testid={`input-ct-${bar.id}`}
        />

        {/* @ multiplier — editable, defaults to boqQty/roadLen */}
        <span className="text-[11px] text-slate-400 flex-shrink-0">@</span>
        <input
          type="number" step="0.0001" min="0.0001"
          value={mult}
          onChange={e => { dirty.current = true; setMult(e.target.value); }}
          onBlur={save}
          className={`w-[42px] text-[11px] font-mono border-b bg-transparent text-center focus:outline-none focus:border-teal-500 dark:text-slate-200 ${
            defaultRate != null && !isNaN(multNum) && Math.abs(multNum - defaultRate) > 0.0001
              ? "border-orange-400 text-orange-600 dark:text-orange-400"
              : "border-slate-300 dark:border-slate-600"
          }`}
          title={defaultRate != null ? `Default rate: ${fmtQty(defaultRate, 4)} ${item.unit}/km` : "Multiplier (qty per km)"}
          data-testid={`input-mult-${bar.id}`}
        />

        {/* Live qty display — orange = auto from chainage×mult */}
        <span
          className={`text-[11px] font-bold w-[54px] text-right flex-shrink-0 font-mono ${
            autoQty != null ? "text-orange-600 dark:text-orange-400" : "text-slate-600 dark:text-slate-300"
          }`}
          title={autoQty != null ? "Auto-calculated: chainage × multiplier" : "Saved quantity"}
        >
          {fmtQty(liveQty, 1)}
        </span>

        {/* Start month input */}
        <span className="text-[11px] text-slate-400 flex-shrink-0 ml-1">M</span>
        <input
          type="number" min="0.1" max="120" step="0.1"
          value={startM}
          onChange={e => { dirty.current = true; setStartM(e.target.value); }}
          onBlur={save}
          className="w-[36px] text-[11px] font-mono border-b border-slate-300 bg-transparent text-center focus:outline-none focus:border-teal-500 dark:border-slate-600 dark:text-slate-200"
          title="Start month (decimal OK, e.g. 1.5)"
          data-testid={`input-sm-${bar.id}`}
        />

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
        style={{ width: totalMonths * colW, minWidth: totalMonths * colW, position: "relative", flexShrink: 0 }}
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

        {/* Gantt bar */}
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
          title={`Ch ${validCh ? cfNum : (bar.chainageFrom ?? "?")} – ${validCh ? ctNum : (bar.chainageTo ?? "?")} km | ${fmtQty(liveQty, 1)} ${bar.unit} | M${fmtQty(liveStart, 1)} → M${fmtQty(liveEnd, 1)} (${fmtQty(durationMonths, 2)} mo)${autoDuration?.bottleneckEquipment ? ` | Bottleneck: ${autoDuration.bottleneckEquipment}` : ""}${haulDistanceKm != null ? ` | Haul: ${fmtQty(haulDistanceKm, 1)} km` : ""}`}
        >
          <div className="absolute inset-0 group-hover:bg-white/15 rounded" />
          {barWidth > 30 && (
            <span className="absolute left-1.5 top-0 bottom-0 flex items-center text-white text-[11px] font-semibold whitespace-nowrap overflow-hidden pointer-events-none leading-none">
              {barWidth > 110
                ? `${fmtQty(liveQty, 1)} ${bar.unit}`
                : barWidth > 55
                  ? `${fmtQty(liveQty, 1)}`
                  : ""}
            </span>
          )}
        </div>

        {/* Duration label below bar */}
        {barWidth > 20 && (
          <div
            className="absolute text-[11px] font-semibold pointer-events-none select-none whitespace-nowrap overflow-hidden text-center"
            style={{
              left: barLeft,
              width: Math.max(barWidth, 36),
              top: 33,
              color: color,
              opacity: 0.85,
            }}
          >
            {Math.round(durationMonths * workingDays)}d
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InlineGanttTable ────────────────────────────────────────────────────────────

function InlineGanttTable({
  project,
  items,
  bars,
  recipesMap,
  projectId,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
  projectId: number;
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

  const grouped = useMemo(() => {
    const m: Record<string, BoqItemWithCategory[]> = {};
    for (const it of items) {
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) m[cat] = [];
      m[cat].push(it);
    }
    return m;
  }, [items]);

  const allCategoryKeys = useMemo(() => {
    const keys = Object.keys(grouped).filter(k => k !== "__uncategorised__");
    keys.sort();
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
    },
    onError: () => toast({ title: "Failed to add stretch", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/programme/bars/${id}`),
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
      const leftQty = roadLen > 0 ? calculateStretchQty(bar.boqItem?.currentQty ?? bar.plannedQty * 2, cf, mid, roadLen) : bar.plannedQty * leftFraction;
      const rightQty = roadLen > 0 ? calculateStretchQty(bar.boqItem?.currentQty ?? bar.plannedQty * 2, mid, ct, roadLen) : bar.plannedQty * (1 - leftFraction);

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
    const qty = roadLen > 0
      ? calculateStretchQty(item.currentQty, cfVal, ctVal, roadLen)
      : item.currentQty;

    // auto-duration
    const equipment = (recipesMap.get(itemId) ?? []).map(e => ({
      name: e.equipmentName,
      outputUnit: e.outputUnit,
      outputTheoretical: e.outputTheoretical,
      outputEfficiency: e.outputEfficiency,
      standardOutputs: e.standardOutputs as Array<{ unit: string; outputPerHr: number }> | null,
      count: e.count ?? 1,
    }));
    const dur = qty > 0 && equipment.length
      ? calculateAutoDurationFull(qty, item.unit, equipment, workingHrs, workingDays)
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
    <div className="rounded-xl border overflow-hidden bg-white dark:bg-gray-950">
      <div className="overflow-x-auto">
        {/* ── Header row ── */}
        <div
          style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: 44 }}
          className="border-b border-slate-700"
        >
          {/* Left header */}
          <div
            style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 20, background: "#0F5F64" }}
            className="flex items-center px-3 border-r border-teal-700"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">
              BOQ Item / Stretch
            </span>
            <span className="ml-auto text-[9px] text-white/50 font-normal normal-case tracking-normal">
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
                className="relative flex items-center justify-center text-[10px] font-semibold text-white/90 border-r border-teal-600/50 flex-shrink-0 select-none"
              >
                {m.label}
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
              {/* Category header row */}
              <div
                style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: CAT_H }}
                className="border-b border-slate-200 dark:border-slate-700"
              >
                <div
                  style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10, backgroundColor: `${color}18` }}
                  className="flex items-center gap-2 px-3 cursor-pointer border-r border-slate-200 dark:border-slate-700"
                  onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider flex-1 truncate" style={{ color }}>
                    {catLabel}
                  </span>
                  <span className="text-[10px] text-slate-500 flex-shrink-0">{catItems.length}</span>
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
                      style={{ display: "flex", minWidth: LEFT_W + totalRightW, height: ITEM_H }}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      {/* Item left */}
                      <div
                        style={{ width: LEFT_W, minWidth: LEFT_W, position: "sticky", left: 0, zIndex: 10 }}
                        className="flex items-center gap-2 px-3 bg-white dark:bg-gray-950 border-r border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.itemCode && (
                              <span className="text-[9px] font-mono text-muted-foreground">{item.itemCode}</span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{fmt(item.currentQty)} {item.unit}</span>
                            <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={item.unit} />
                            {!hasEquipment && (
                              <span className="text-[9px] text-amber-500 flex items-center gap-0.5">
                                <Info className="w-2.5 h-2.5" /> no equipment
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => addStretch(item.id)}
                          disabled={createMutation.isPending}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-700 transition-colors flex-shrink-0 font-medium"
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

                    {/* Stretch rows */}
                    {itemBars.map((bar, i) => (
                      <StretchRow
                        key={bar.id}
                        bar={bar}
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
                      />
                    ))}

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
                          <span className="text-[10px] text-slate-500 font-semibold">
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
        const calMonth = m + 1;
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
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) m[cat] = [];
      m[cat].push(it);
    }
    return m;
  }, [items]);

  const allCategoryKeys = useMemo(() => {
    const keys = Object.keys(grouped).filter(k => k !== "__uncategorised__");
    keys.sort();
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
      <table className="text-xs border-collapse" style={{ minWidth: 200 + maxMonth * 64 + 80 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-20 min-w-[220px]" style={{ background: "#0F5F64" }}>
              BOQ Item
            </th>
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
              <tr key={`cat-${cat}`} style={{ backgroundColor: `${color}12` }}>
                <td
                  colSpan={2 + maxMonth + 1}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sticky left-0 z-10"
                  style={{ backgroundColor: `${color}18`, color }}
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
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-gray-950 z-10">
                        {item.itemCode ? `[${item.itemCode}] ` : ""}{item.description}
                      </td>
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
                const calMonth = m + 1;
                grandMonthly[calMonth] = (grandMonthly[calMonth] ?? 0) + b.plannedQty * (overlap / duration);
              }
              grand += b.plannedQty;
            }
            return (
              <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">TOTAL</td>
                <td />
                {months.map(m => {
                  const val = grandMonthly[m] ?? 0;
                  return (
                    <td key={m} className={`px-2 py-2 text-right font-mono text-[11px] ${val > 0 ? "text-teal-800 dark:text-teal-300" : "text-slate-300 dark:text-slate-600"}`}>
                      {val > 0 ? fmtQty(val, 1) : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-teal-800 dark:text-teal-300 font-mono text-[11px]">{fmtQty(grand, 1)}</td>
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
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[220px]" style={{ background: "#0F5F64" }}>BOQ Item</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">BOQ Qty</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Planned to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Actual to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">% Complete</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.boqItemId} className="border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-950 z-10 text-slate-700 dark:text-slate-300">
                {row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}
              </td>
              <td className="px-2 py-2 text-right font-mono">{fmtQty(row.currentQty, 1)} {row.unit}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(row.totalPlanned, 1)}</td>
              <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(row.totalActual, 1)}</td>
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
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkProgramme() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const [activeTab, setActiveTab] = useState("gantt");

  const { data: project } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

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
      else if (p < it.currentQty - 0.01) under++;
      else if (p > it.currentQty + 0.01) over++;
    }
    return { under, over, missing };
  }, [items, bars]);

  const isLoading = itemsLoading || barsLoading;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="breadcrumb">
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
          <p className="text-xs text-muted-foreground mt-0.5">
            {project?.name}
            {project?.contractNo ? ` · ${project.contractNo}` : ""}
            {project?.roadLengthKm ? ` · ${project.roadLengthKm} km road` : ""}
            {project?.startDate && project?.totalMonths
              ? ` · ${monthLabel(1, project.startDate)} – ${monthLabel(project.totalMonths, project.startDate)}`
              : ""}
            {project && (
              <span className="ml-1 text-teal-600">
                · {project.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT}d/mo · {project.workingHoursPerDay ?? WORKING_HRS_DEFAULT}h/d
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Click cell to add · Ch inputs auto-calculate qty · M# = start month
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/work-program/${projectId}/demand`}>
            <a>
              <Button variant="outline" size="sm" data-testid="button-bom-demand">
                <BookOpen className="w-4 h-4 mr-1" />
                BOM &amp; Demand
              </Button>
            </a>
          </Link>
        </div>
      </div>

      {/* Warning banner */}
      {(warnings.missing + warnings.under + warnings.over) > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            {warnings.missing > 0 && (
              <p className="text-xs text-amber-700"><strong>{warnings.missing}</strong> item{warnings.missing > 1 ? "s" : ""} not yet programmed</p>
            )}
            {warnings.under > 0 && (
              <p className="text-xs text-amber-700"><strong>{warnings.under}</strong> item{warnings.under > 1 ? "s" : ""} under-planned vs BOQ</p>
            )}
            {warnings.over > 0 && (
              <p className="text-xs text-red-700"><strong>{warnings.over}</strong> item{warnings.over > 1 ? "s" : ""} planned qty exceeds BOQ</p>
            )}
          </div>
        </div>
      )}

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
            <p className="text-xs">Import a BOQ first, then programme the work here.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length > 0 && project && (
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
            {project.totalMonths ? (
              <InlineGanttTable
                project={project}
                items={items}
                bars={bars}
                recipesMap={recipesMap}
                projectId={projectId}
              />
            ) : (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Set the total duration (months) on the project to enable the Gantt view.
              </div>
            )}
          </TabsContent>

          <TabsContent value="monthly">
            <MonthlyPlanView project={project} items={items} bars={bars} />
          </TabsContent>

          <TabsContent value="pva">
            <PlanVsActualView projectId={projectId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
