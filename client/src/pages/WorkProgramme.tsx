import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Plus, Pencil, Trash2,
  AlertTriangle, CheckCircle2, Loader2, CalendarDays, BarChart3,
  Scissors, BookOpen, ChevronDown, ChevronUp, Zap, Info,
  GanttChartSquare, TableProperties, ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  calculateStretchQty,
  calculateAutoDurationFull,
  calculateMonthlyDistribution,
  getShortName,
  monthLabel,
  fmtQty,
  WORKING_DAYS_DEFAULT,
  WORKING_HRS_DEFAULT,
  type EquipmentProductivity,
} from "@shared/planningEngine";
import type {
  BoqProject,
  BoqItemWithCategory,
  WorkProgramBarWithItem,
  BoqItemEquipmentWithMaster,
} from "@shared/schema";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_W = 52; // px per month column
const BAR_H = 20;   // px bar height
const ROW_H = 36;   // px row height

// Category color palette (same aesthetic as Road Estimator)
const CAT_COLORS = [
  "#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be185d",
  "#0369a1", "#15803d", "#c2410c", "#0891b2", "#65a30d",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

function getCatColor(index: number) {
  return CAT_COLORS[index % CAT_COLORS.length];
}

function monthOptions(totalMonths: number | null | undefined, startDate: string | null | undefined) {
  const max = totalMonths && totalMonths > 0 ? totalMonths : 60;
  return Array.from({ length: max }, (_, i) => ({
    value: String(i + 1),
    label: monthLabel(i + 1, startDate),
  }));
}

// ─── Bar Gantt Visual ───────────────────────────────────────────────────────────

function GanttBar({
  bar,
  totalMonths,
  color,
  onClick,
}: {
  bar: WorkProgramBarWithItem;
  totalMonths: number;
  color: string;
  onClick?: () => void;
}) {
  const start = bar.startMonth - 1; // 0-indexed
  const end = bar.endMonth;
  const leftPct = (start / totalMonths) * 100;
  const widthPct = ((end - start) / totalMonths) * 100;
  const durationMonths = bar.endMonth - bar.startMonth;
  const label = bar.reachLabel
    ? `${bar.reachLabel} · ${fmtQty(bar.plannedQty, 1)} ${bar.unit}`
    : `${fmtQty(bar.plannedQty, 1)} ${bar.unit}`;

  return (
    <div
      className="absolute top-[7px] rounded cursor-pointer select-none group overflow-hidden"
      style={{
        left: `${leftPct}%`,
        width: `max(${widthPct}%, 4px)`,
        height: BAR_H,
        backgroundColor: color,
        opacity: 0.88,
      }}
      onClick={onClick}
      title={`${bar.reachLabel ?? ""} | Ch: ${bar.chainageFrom ?? "?"} – ${bar.chainageTo ?? "?"} km | ${fmtQty(bar.plannedQty, 1)} ${bar.unit} | ${fmtQty(durationMonths, 1)} months`}
    >
      <div
        className="absolute inset-0 group-hover:bg-white/20 transition-colors rounded"
      />
      <span
        className="absolute left-1 top-0 bottom-0 flex items-center text-white text-[9px] font-semibold whitespace-nowrap overflow-hidden pointer-events-none"
        style={{ maxWidth: "calc(100% - 4px)" }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── BarDialog (Add / Edit) ────────────────────────────────────────────────────

interface BarFormState {
  boqItemId: string;
  reachLabel: string;
  chainageFrom: string;
  chainageTo: string;
  startMonth: string;
  endMonth: string;
  plannedQty: string;
  isQtyOverride: boolean;
  isDurationOverride: boolean;
  notes: string;
}

const EMPTY_FORM: BarFormState = {
  boqItemId: "",
  reachLabel: "",
  chainageFrom: "",
  chainageTo: "",
  startMonth: "1",
  endMonth: "2",
  plannedQty: "",
  isQtyOverride: false,
  isDurationOverride: false,
  notes: "",
};

function BarDialog({
  open,
  onClose,
  projectId,
  items,
  project,
  editBar,
  defaultItemId,
  recipesMap,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  items: BoqItemWithCategory[];
  project: BoqProject | undefined;
  editBar: WorkProgramBarWithItem | null;
  defaultItemId?: number | null;
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<BarFormState>(
    editBar
      ? {
          boqItemId: String(editBar.boqItemId),
          reachLabel: editBar.reachLabel ?? "",
          chainageFrom: editBar.chainageFrom != null ? String(editBar.chainageFrom) : "",
          chainageTo: editBar.chainageTo != null ? String(editBar.chainageTo) : "",
          startMonth: String(editBar.startMonth),
          endMonth: String(editBar.endMonth),
          plannedQty: String(editBar.plannedQty),
          isQtyOverride: editBar.isQtyOverride ?? false,
          isDurationOverride: editBar.isDurationOverride ?? false,
          notes: editBar.notes ?? "",
        }
      : { ...EMPTY_FORM, boqItemId: defaultItemId ? String(defaultItemId) : "" }
  );

  const upd = (k: keyof BarFormState, v: string | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // ── Auto-calculation ──
  const selectedItem = items.find((it) => it.id === parseInt(form.boqItemId));
  const roadLengthKm = project?.roadLengthKm ?? 0;
  const workingDays = project?.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT;
  const workingHrs = project?.workingHoursPerDay ?? WORKING_HRS_DEFAULT;

  const autoStretchQty = useMemo(() => {
    if (!selectedItem) return null;
    if (form.chainageFrom === "" || form.chainageTo === "") return null;
    const cf = parseFloat(form.chainageFrom);
    const ct = parseFloat(form.chainageTo);
    if (isNaN(cf) || isNaN(ct) || ct <= cf) return null;
    if (!roadLengthKm) return selectedItem.currentQty;
    return calculateStretchQty(selectedItem.currentQty, cf, ct, roadLengthKm);
  }, [selectedItem, form.chainageFrom, form.chainageTo, roadLengthKm]);

  const equipment = useMemo((): Array<EquipmentProductivity & { name: string }> => {
    if (!selectedItem) return [];
    const eqs = recipesMap.get(selectedItem.id) ?? [];
    return eqs.map((e) => ({
      name: e.equipmentName,
      outputUnit: e.outputUnit,
      outputTheoretical: e.outputTheoretical,
      outputEfficiency: e.outputEfficiency,
      standardOutputs: e.standardOutputs as Array<{ unit: string; outputPerHr: number }> | null,
      count: e.count ?? 1,
    }));
  }, [selectedItem, recipesMap]);

  const effectiveQty = form.isQtyOverride
    ? (parseFloat(form.plannedQty) || 0)
    : (autoStretchQty ?? (parseFloat(form.plannedQty) || 0));

  const autoDuration = useMemo(() => {
    if (!selectedItem || effectiveQty <= 0 || !equipment.length) return null;
    return calculateAutoDurationFull(effectiveQty, selectedItem.unit, equipment, workingHrs, workingDays);
  }, [selectedItem, effectiveQty, equipment, workingHrs, workingDays]);

  const autoEndMonth = useMemo(() => {
    if (!autoDuration || autoDuration.months <= 0) return null;
    const sm = parseFloat(form.startMonth) || 1;
    return +(sm + autoDuration.months).toFixed(2);
  }, [autoDuration, form.startMonth]);

  // Auto-fill qty when chainage changes (if not overridden)
  const prevAutoQtyRef = useRef<number | null>(null);
  if (!form.isQtyOverride && autoStretchQty !== null && autoStretchQty !== prevAutoQtyRef.current) {
    prevAutoQtyRef.current = autoStretchQty;
    setForm((prev) => ({ ...prev, plannedQty: fmtQty(autoStretchQty, 3) }));
  }

  // Auto-fill end month when duration calculated (if not overridden)
  const prevAutoDurRef = useRef<number | null>(null);
  if (!form.isDurationOverride && autoEndMonth !== null && autoEndMonth !== prevAutoDurRef.current) {
    prevAutoDurRef.current = autoEndMonth;
    setForm((prev) => ({ ...prev, endMonth: String(autoEndMonth) }));
  }

  const months = monthOptions(project?.totalMonths, project?.startDate);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message || "Failed to add stretch", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/boq/programme/bars/${editBar!.id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message || "Failed to update", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || patchMutation.isPending;

  function handleSubmit() {
    if (!form.boqItemId) {
      toast({ title: "Please select a BOQ item", variant: "destructive" }); return;
    }
    const qty = parseFloat(form.plannedQty);
    if (!qty || qty <= 0) {
      toast({ title: "Planned Qty must be > 0", variant: "destructive" }); return;
    }
    const sm = parseFloat(form.startMonth);
    const em = parseFloat(form.endMonth);
    if (isNaN(sm) || isNaN(em) || em < sm) {
      toast({ title: "End month must be ≥ start month", variant: "destructive" }); return;
    }
    const payload: Record<string, unknown> = {
      boqItemId: parseInt(form.boqItemId),
      startMonth: sm,
      endMonth: em,
      plannedQty: qty,
      reachLabel: form.reachLabel.trim() || null,
      chainageFrom: form.chainageFrom !== "" ? parseFloat(form.chainageFrom) : null,
      chainageTo: form.chainageTo !== "" ? parseFloat(form.chainageTo) : null,
      isQtyOverride: form.isQtyOverride,
      isDurationOverride: form.isDurationOverride,
      notes: form.notes.trim() || null,
    };
    if (editBar) patchMutation.mutate(payload);
    else createMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <GanttChartSquare className="w-4 h-4 text-teal-600" />
            {editBar ? "Edit Stretch" : "Add Stretch / Chainage Bar"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* BOQ Item */}
          <div>
            <Label className="text-xs">BOQ ITEM <span className="text-red-500">*</span></Label>
            <Select
              value={form.boqItemId}
              onValueChange={(v) => {
                setForm({ ...EMPTY_FORM, boqItemId: v, startMonth: form.startMonth });
                prevAutoQtyRef.current = null;
                prevAutoDurRef.current = null;
              }}
            >
              <SelectTrigger data-testid="select-bar-item">
                <SelectValue placeholder="Select work item…" />
              </SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.itemCode ? `[${it.itemCode}] ` : ""}{it.description} ({it.unit}) — BOQ {fmtQty(it.currentQty)} {it.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chainage */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">REACH LABEL</Label>
              <Input
                placeholder="e.g. Reach 1"
                value={form.reachLabel}
                onChange={(e) => upd("reachLabel", e.target.value)}
                data-testid="input-bar-reach"
              />
            </div>
            <div>
              <Label className="text-xs">CHAINAGE FROM (km)</Label>
              <Input
                type="number" step="0.001" placeholder="0.000"
                value={form.chainageFrom}
                onChange={(e) => upd("chainageFrom", e.target.value)}
                data-testid="input-bar-chainage-from"
              />
            </div>
            <div>
              <Label className="text-xs">CHAINAGE TO (km)</Label>
              <Input
                type="number" step="0.001" placeholder="0.000"
                value={form.chainageTo}
                onChange={(e) => upd("chainageTo", e.target.value)}
                data-testid="input-bar-chainage-to"
              />
            </div>
          </div>

          {/* Auto Stretch Qty */}
          {autoStretchQty !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-teal-800 dark:text-teal-200">
                  <strong>Auto stretch qty:</strong> {fmtQty(autoStretchQty, 3)} {selectedItem?.unit}
                  {roadLengthKm > 0 && (
                    <span className="ml-1 text-teal-600">
                      ({fmtQty(parseFloat(form.chainageTo) - parseFloat(form.chainageFrom), 3)} km of {roadLengthKm} km)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-teal-700">Override</span>
                <Switch
                  checked={form.isQtyOverride}
                  onCheckedChange={(v) => upd("isQtyOverride", v)}
                  data-testid="switch-qty-override"
                />
              </div>
            </div>
          )}

          {/* Planned Qty */}
          <div>
            <Label className="text-xs">
              PLANNED QTY ({selectedItem?.unit ?? "—"}) <span className="text-red-500">*</span>
              {!form.isQtyOverride && autoStretchQty !== null && (
                <span className="ml-1 text-[10px] text-teal-600">(auto-calculated)</span>
              )}
            </Label>
            <Input
              type="number" placeholder="0"
              value={form.plannedQty}
              readOnly={!form.isQtyOverride && autoStretchQty !== null}
              onChange={(e) => form.isQtyOverride && upd("plannedQty", e.target.value)}
              className={!form.isQtyOverride && autoStretchQty !== null ? "bg-slate-50 cursor-default" : ""}
              data-testid="input-bar-planned-qty"
            />
          </div>

          {/* Equipment auto-duration display */}
          {autoDuration && autoDuration.months > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>Auto duration:</strong> {fmtQty(autoDuration.months, 1)} months
                  {autoDuration.bottleneckEquipment && (
                    <span className="ml-1 text-blue-600">(bottleneck: {autoDuration.bottleneckEquipment})</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-blue-700">Override</span>
                <Switch
                  checked={form.isDurationOverride}
                  onCheckedChange={(v) => upd("isDurationOverride", v)}
                  data-testid="switch-duration-override"
                />
              </div>
            </div>
          )}

          {selectedItem && equipment.length === 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              No equipment configured for this item — duration must be entered manually.
              Duration auto-calculation requires equipment to be set up in the BOQ item recipes.
            </div>
          )}

          {/* Start / End Month */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">START MONTH <span className="text-red-500">*</span></Label>
              <div className="flex gap-1">
                <Select
                  value={String(Math.round(parseFloat(form.startMonth) || 1))}
                  onValueChange={(v) => {
                    upd("startMonth", v);
                    prevAutoDurRef.current = null;
                  }}
                >
                  <SelectTrigger data-testid="select-bar-start-month" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                END MONTH <span className="text-red-500">*</span>
                {!form.isDurationOverride && autoEndMonth !== null && (
                  <span className="ml-1 text-[10px] text-blue-600">(auto)</span>
                )}
              </Label>
              {form.isDurationOverride ? (
                <Select
                  value={String(Math.round(parseFloat(form.endMonth) || 1))}
                  onValueChange={(v) => upd("endMonth", v)}
                >
                  <SelectTrigger data-testid="select-bar-end-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  readOnly
                  value={
                    autoEndMonth !== null
                      ? `${monthLabel(Math.ceil(autoEndMonth), project?.startDate)} (M${fmtQty(autoEndMonth, 1)})`
                      : months.find((m) => m.value === String(Math.round(parseFloat(form.endMonth) || 1)))?.label ?? form.endMonth
                  }
                  className="bg-slate-50 cursor-default"
                  data-testid="input-bar-end-month-display"
                />
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">NOTES</Label>
            <Textarea
              rows={2}
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => upd("notes", e.target.value)}
              data-testid="input-bar-notes"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-bar-cancel">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-teal-700 hover:bg-teal-800 text-white"
            data-testid="button-bar-save"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {editBar ? "Save Changes" : "Add Stretch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Split Dialog ───────────────────────────────────────────────────────────────

function SplitDialog({
  open,
  onClose,
  bar,
  projectId,
  project,
  boqQty,
}: {
  open: boolean;
  onClose: () => void;
  bar: WorkProgramBarWithItem;
  projectId: number;
  project: BoqProject | undefined;
  boqQty: number;
}) {
  const { toast } = useToast();
  const [midChainage, setMidChainage] = useState("");

  const cf = bar.chainageFrom ?? 0;
  const ct = bar.chainageTo ?? (project?.roadLengthKm ?? 0);
  const mid = parseFloat(midChainage);
  const isValid = !isNaN(mid) && mid > cf && mid < ct;
  const roadLengthKm = project?.roadLengthKm ?? 0;

  const leftQty = isValid && roadLengthKm
    ? calculateStretchQty(boqQty, cf, mid, roadLengthKm)
    : null;
  const rightQty = isValid && roadLengthKm
    ? calculateStretchQty(boqQty, mid, ct, roadLengthKm)
    : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const totalLen = ct - cf;
      const leftFraction = totalLen > 0 ? (mid - cf) / totalLen : 0.5;
      const totalDur = bar.endMonth - bar.startMonth;
      const leftEnd = bar.startMonth + totalDur * leftFraction;

      await apiRequest("PATCH", `/api/boq/programme/bars/${bar.id}`, {
        chainageFrom: cf,
        chainageTo: mid,
        endMonth: leftEnd,
        plannedQty: leftQty ?? bar.plannedQty / 2,
        reachLabel: bar.reachLabel ? `${bar.reachLabel}A` : "A",
        isQtyOverride: false,
      });
      await apiRequest("POST", `/api/boq/projects/${projectId}/programme`, {
        boqItemId: bar.boqItemId,
        chainageFrom: mid,
        chainageTo: ct,
        startMonth: leftEnd,
        endMonth: bar.endMonth,
        plannedQty: rightQty ?? bar.plannedQty / 2,
        reachLabel: bar.reachLabel ? `${bar.reachLabel}B` : "B",
        isQtyOverride: false,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch split" });
      onClose();
    },
    onError: () => toast({ title: "Failed to split", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Scissors className="w-4 h-4 text-teal-600" />
            Split Stretch
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Current stretch: {cf} – {ct} km
            {bar.reachLabel ? ` (${bar.reachLabel})` : ""}
          </p>
          <div>
            <Label className="text-xs">SPLIT AT CHAINAGE (km)</Label>
            <Input
              type="number" step="0.001"
              placeholder={`${((cf + ct) / 2).toFixed(3)}`}
              value={midChainage}
              onChange={(e) => setMidChainage(e.target.value)}
              autoFocus
              data-testid="input-split-chainage"
            />
            {midChainage && !isValid && (
              <p className="text-[11px] text-red-600 mt-1">Must be between {cf} and {ct} km</p>
            )}
          </div>
          {isValid && leftQty !== null && rightQty !== null && (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded bg-teal-50 border border-teal-200 px-2 py-1.5">
                <p className="font-semibold text-teal-700">Part A</p>
                <p>{cf} – {mid} km</p>
                <p className="font-mono">{fmtQty(leftQty, 2)} {bar.unit}</p>
              </div>
              <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5">
                <p className="font-semibold text-blue-700">Part B</p>
                <p>{mid} – {ct} km</p>
                <p className="font-mono">{fmtQty(rightQty, 2)} {bar.unit}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="bg-teal-700 hover:bg-teal-800 text-white"
            data-testid="button-split-confirm"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Scissors className="w-4 h-4 mr-1" />}
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

// ─── Gantt View ─────────────────────────────────────────────────────────────────

function GanttView({
  project,
  items,
  bars,
  recipesMap,
  onAddBar,
  onEditBar,
  onSplitBar,
  onDeleteBar,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
  recipesMap: Map<number, BoqItemEquipmentWithMaster[]>;
  onAddBar: (itemId: number) => void;
  onEditBar: (bar: WorkProgramBarWithItem) => void;
  onSplitBar: (bar: WorkProgramBarWithItem) => void;
  onDeleteBar: (barId: number) => void;
}) {
  const totalMonths = project.totalMonths ?? 12;
  const totalWidthPx = totalMonths * MONTH_W;

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
    const cats: Record<string, number> = {};
    for (const it of items) {
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) { m[cat] = []; cats[cat] = it.categoryId ?? 0; }
      m[cat].push(it);
    }
    return m;
  }, [items]);

  const allCategoryKeys = useMemo(() => {
    const keys = Object.keys(grouped).filter((k) => k !== "__uncategorised__");
    keys.sort();
    if (grouped["__uncategorised__"]?.length) keys.push("__uncategorised__");
    return keys;
  }, [grouped]);

  const monthHeaders = useMemo(
    () => Array.from({ length: totalMonths }, (_, i) => ({
      num: i + 1,
      label: monthLabel(i + 1, project.startDate),
    })),
    [totalMonths, project.startDate],
  );

  return (
    <div className="rounded-xl border overflow-hidden bg-white dark:bg-gray-950">
      <div className="flex overflow-hidden">
        {/* ── Left fixed panel ── */}
        <div className="flex-shrink-0 w-[340px] min-w-[340px] border-r border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Left header */}
          <div
            className="h-[44px] flex items-center px-3 border-b border-slate-200 dark:border-slate-700"
            style={{ background: "#0F5F64" }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-white">BOQ Item / Stretch</span>
          </div>

          {allCategoryKeys.map((cat, catIdx) => {
            const catItems = grouped[cat] ?? [];
            const catLabel = cat === "__uncategorised__" ? "Uncategorised" : cat;
            const color = getCatColor(catIdx);
            return (
              <div key={cat}>
                {/* Category row */}
                <div
                  className="h-[28px] flex items-center px-3 border-b border-slate-200 dark:border-slate-700"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <div className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">{catLabel}</span>
                </div>

                {catItems.map((item) => {
                  const itemBars = barsByItemId[item.id] ?? [];
                  const totalPlanned = plannedByItemId[item.id] ?? 0;
                  const hasEquipment = (recipesMap.get(item.id) ?? []).length > 0;

                  return (
                    <div key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                      {/* Item header */}
                      <div
                        className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 group min-h-[44px]"
                        onClick={() => onAddBar(item.id)}
                        title="Click to add stretch"
                        data-testid={`item-row-${item.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            {item.itemCode && (
                              <span className="text-[9px] font-mono text-muted-foreground">{item.itemCode}</span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {getShortName(item.description, 30)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            <span>{fmtQty(item.currentQty, 1)} {item.unit}</span>
                            <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={item.unit} />
                            {!hasEquipment && (
                              <span className="text-amber-600">⚠ no equipment</span>
                            )}
                          </div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Bars for this item */}
                      {itemBars.map((bar) => (
                        <div
                          key={bar.id}
                          className="flex items-center gap-1.5 px-3 py-0.5 bg-slate-50/50 dark:bg-slate-900/20 border-t border-dashed border-slate-100 dark:border-slate-800 min-h-[32px]"
                          data-testid={`bar-left-${bar.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            {bar.reachLabel && (
                              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">{bar.reachLabel}</span>
                            )}
                            <div className="text-[10px] text-muted-foreground flex gap-1.5">
                              {bar.chainageFrom != null && bar.chainageTo != null && (
                                <span>{bar.chainageFrom} – {bar.chainageTo} km</span>
                              )}
                              <span className="font-mono">{fmtQty(bar.plannedQty, 1)} {bar.unit}</span>
                              <span>
                                {monthLabel(Math.ceil(bar.startMonth), project.startDate)} →{" "}
                                {monthLabel(Math.ceil(bar.endMonth), project.startDate)}
                              </span>
                              {(bar.isDurationOverride) && (
                                <span className="text-amber-600 font-semibold">MANUAL</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                                    onClick={() => onEditBar(bar)}
                                    data-testid={`button-edit-bar-${bar.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {bar.chainageFrom != null && bar.chainageTo != null && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                                      onClick={() => onSplitBar(bar)}
                                      data-testid={`button-split-bar-${bar.id}`}
                                    >
                                      <Scissors className="w-3 h-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Split stretch</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    onClick={() => onDeleteBar(bar.id)}
                                    data-testid={`button-delete-bar-${bar.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Right scrollable Gantt ── */}
        <div className="flex-1 overflow-x-auto">
          {/* Month header row */}
          <div
            className="flex border-b border-slate-200 dark:border-slate-700 h-[44px]"
            style={{ background: "#0F5F64", width: totalWidthPx, minWidth: totalWidthPx }}
          >
            {monthHeaders.map((m) => (
              <div
                key={m.num}
                className="flex-shrink-0 flex items-center justify-center text-[10px] font-semibold text-white/90 border-r border-teal-600/50 dark:border-teal-700/50"
                style={{ width: MONTH_W, minWidth: MONTH_W }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Gantt rows */}
          {allCategoryKeys.map((cat, catIdx) => {
            const catItems = grouped[cat] ?? [];
            const color = getCatColor(catIdx);
            return (
              <div key={cat}>
                {/* Category spacer row */}
                <div
                  className="h-[28px] border-b border-slate-200 dark:border-slate-700"
                  style={{ width: totalWidthPx, minWidth: totalWidthPx, backgroundColor: `${color}18` }}
                >
                  {/* month grid lines */}
                  {monthHeaders.map((m) => (
                    <span
                      key={m.num}
                      className="absolute top-0 bottom-0 border-r border-slate-200/40 dark:border-slate-700/40"
                      style={{ left: m.num * MONTH_W }}
                    />
                  ))}
                </div>

                {catItems.map((item) => {
                  const itemBars = barsByItemId[item.id] ?? [];
                  return (
                    <div key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                      {/* Item row (same height as item header in left panel) */}
                      <div
                        className="relative hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors cursor-pointer"
                        style={{ width: totalWidthPx, minWidth: totalWidthPx, height: 44 }}
                        onClick={() => onAddBar(item.id)}
                        title="Click to add stretch"
                      >
                        {/* Month grid lines */}
                        {monthHeaders.map((m) => (
                          <div
                            key={m.num}
                            className="absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800"
                            style={{ left: (m.num - 1) * MONTH_W, width: MONTH_W }}
                          />
                        ))}
                      </div>

                      {/* Bar rows */}
                      {itemBars.map((bar) => (
                        <div
                          key={bar.id}
                          className="relative border-t border-dashed border-slate-100 dark:border-slate-800"
                          style={{ width: totalWidthPx, minWidth: totalWidthPx, height: ROW_H }}
                        >
                          {/* Month grid lines */}
                          {monthHeaders.map((m) => (
                            <div
                              key={m.num}
                              className="absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800"
                              style={{ left: (m.num - 1) * MONTH_W, width: MONTH_W }}
                            />
                          ))}
                          {/* The Gantt bar */}
                          <GanttBar
                            bar={bar}
                            totalMonths={totalMonths}
                            color={color}
                            onClick={() => onEditBar(bar)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Monthly Plan View ──────────────────────────────────────────────────────────

function MonthlyPlanView({
  project,
  items,
  bars,
}: {
  project: BoqProject;
  items: BoqItemWithCategory[];
  bars: WorkProgramBarWithItem[];
}) {
  const totalMonths = project.totalMonths ?? 12;
  const maxMonth = useMemo(() => {
    const fromBars = bars.length ? Math.ceil(Math.max(...bars.map((b) => b.endMonth))) : 0;
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
    const keys = Object.keys(grouped).filter((k) => k !== "__uncategorised__");
    keys.sort();
    if (grouped["__uncategorised__"]?.length) keys.push("__uncategorised__");
    return keys;
  }, [grouped]);

  const months = useMemo(
    () => Array.from({ length: maxMonth }, (_, i) => i + 1),
    [maxMonth],
  );

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
            {months.map((m) => (
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
            const catHasBars = catItems.some((it) => (monthlyGrid[it.id] ? Object.keys(monthlyGrid[it.id]).length > 0 : false));
            if (!catHasBars) return null;

            const catMonthTotals: Record<number, number> = {};
            for (const it of catItems) {
              const g = monthlyGrid[it.id] ?? {};
              for (const [mStr, qty] of Object.entries(g)) {
                catMonthTotals[Number(mStr)] = (catMonthTotals[Number(mStr)] ?? 0) + qty;
              }
            }

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
                .filter((it) => monthlyGrid[it.id] && Object.keys(monthlyGrid[it.id]).length > 0)
                .map((item) => {
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
                      {months.map((m) => {
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

          {/* Grand total */}
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
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                  TOTAL
                </td>
                <td />
                {months.map((m) => {
                  const val = grandMonthly[m] ?? 0;
                  return (
                    <td
                      key={m}
                      className={`px-2 py-2 text-right font-mono text-[11px] ${val > 0 ? "text-teal-800 dark:text-teal-300" : "text-slate-300 dark:text-slate-600"}`}
                    >
                      {val > 0 ? fmtQty(val, 1) : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-teal-800 dark:text-teal-300 font-mono text-[11px]">
                  {fmtQty(grand, 1)}
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

// ─── Plan vs Actual ─────────────────────────────────────────────────────────────

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

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkProgramme() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { toast } = useToast();

  const [addForItemId, setAddForItemId] = useState<number | null>(null);
  const [editBar, setEditBar] = useState<WorkProgramBarWithItem | null>(null);
  const [splitBar, setSplitBar] = useState<WorkProgramBarWithItem | null>(null);
  const [deleteBarId, setDeleteBarId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("gantt");

  // ── Fetch data ──
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

  // Fetch equipment recipes for all items (for auto-duration)
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: recipesRaw = [] } = useQuery<Array<BoqItemEquipmentWithMaster & { boqItemId: number }>>({
    queryKey: ["/api/boq/projects", projectId, "item-equipment"],
    queryFn: async () => {
      if (!itemIds.length) return [];
      const results = await Promise.all(
        itemIds.map((id) =>
          fetch(`/api/boq/items/${id}/equipment`, { credentials: "include" })
            .then((r) => r.ok ? r.json() : [])
            .then((rows: BoqItemEquipmentWithMaster[]) => rows.map((r) => ({ ...r, boqItemId: id }))),
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/programme/bars/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Stretch deleted" });
      setDeleteBarId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  // ── Derived ──
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

  const handleAddBar = useCallback((itemId: number) => {
    setEditBar(null);
    setAddForItemId(itemId);
  }, []);

  const handleEditBar = useCallback((bar: WorkProgramBarWithItem) => {
    setAddForItemId(null);
    setEditBar(bar);
  }, []);

  // ── Render ──
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Work Programme</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project?.name}
            {project?.contractNo ? ` · ${project.contractNo}` : ""}
            {project?.roadLengthKm ? ` · ${project.roadLengthKm} km` : ""}
            {project?.startDate && project?.totalMonths
              ? ` · ${monthLabel(1, project.startDate)} – ${monthLabel(project.totalMonths, project.startDate)}`
              : ""}
            {project && (
              <span className="ml-1 text-teal-600">
                · {project.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT}d/mo · {project.workingHoursPerDay ?? WORKING_HRS_DEFAULT}h/d
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/work-program/${projectId}/demand`}>
            <a>
              <Button variant="outline" size="sm" className="flex-shrink-0" data-testid="button-bom-demand">
                <BookOpen className="w-4 h-4 mr-1" />
                BOM &amp; Demand
              </Button>
            </a>
          </Link>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white flex-shrink-0"
            onClick={() => { setEditBar(null); setAddForItemId(0); }}
            data-testid="button-add-programme-row"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Stretch
          </Button>
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
              <GanttView
                project={project}
                items={items}
                bars={bars}
                recipesMap={recipesMap}
                onAddBar={handleAddBar}
                onEditBar={handleEditBar}
                onSplitBar={(bar) => setSplitBar(bar)}
                onDeleteBar={(id) => setDeleteBarId(id)}
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

      {/* Add / Edit Dialog */}
      {(addForItemId !== null || editBar) && project && (
        <BarDialog
          open
          onClose={() => { setAddForItemId(null); setEditBar(null); }}
          projectId={projectId}
          items={items}
          project={project}
          editBar={editBar}
          defaultItemId={addForItemId && addForItemId > 0 ? addForItemId : null}
          recipesMap={recipesMap}
        />
      )}

      {/* Split Dialog */}
      {splitBar && project && (
        <SplitDialog
          open
          onClose={() => setSplitBar(null)}
          bar={splitBar}
          projectId={projectId}
          project={project}
          boqQty={items.find((it) => it.id === splitBar.boqItemId)?.currentQty ?? 0}
        />
      )}

      {/* Delete Confirm */}
      <Dialog open={deleteBarId !== null} onOpenChange={(o) => { if (!o) setDeleteBarId(null); }}>
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
