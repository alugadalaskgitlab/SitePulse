import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Plus, Pencil, Trash2,
  AlertTriangle, CheckCircle2, Loader2, CalendarDays, BarChart3,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BoqProject, BoqItemWithCategory, WorkProgramBarWithItem } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

function monthLabel(month: number, startDate: string | null | undefined): string {
  if (!startDate) return `M${month}`;
  try {
    const d = new Date(startDate + "T00:00:00");
    d.setMonth(d.getMonth() + (month - 1));
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  } catch {
    return `M${month}`;
  }
}

function monthOptions(totalMonths: number | null | undefined, startDate: string | null | undefined) {
  const max = totalMonths && totalMonths > 0 ? totalMonths : 60;
  return Array.from({ length: max }, (_, i) => ({
    value: String(i + 1),
    label: monthLabel(i + 1, startDate),
  }));
}

// Monthly qty distribution: spread plannedQty evenly across months in bar span
function barMonthlyQty(bar: WorkProgramBarWithItem, month: number): number {
  if (month < bar.startMonth || month > bar.endMonth) return 0;
  const span = bar.endMonth - bar.startMonth + 1;
  return bar.plannedQty / span;
}

// ─── Add/Edit Dialog ──────────────────────────────────────────────────────────

interface BarFormState {
  boqItemId: string;
  reachLabel: string;
  chainageFrom: string;
  chainageTo: string;
  startMonth: string;
  endMonth: string;
  plannedQty: string;
  notes: string;
}

const EMPTY_FORM: BarFormState = {
  boqItemId: "",
  reachLabel: "",
  chainageFrom: "",
  chainageTo: "",
  startMonth: "1",
  endMonth: "1",
  plannedQty: "",
  notes: "",
};

function BarDialog({
  open,
  onClose,
  projectId,
  items,
  startDate,
  totalMonths,
  editBar,
  defaultItemId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  items: BoqItemWithCategory[];
  startDate: string | null | undefined;
  totalMonths: number | null | undefined;
  editBar: WorkProgramBarWithItem | null;
  defaultItemId?: number | null;
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
          notes: editBar.notes ?? "",
        }
      : { ...EMPTY_FORM, boqItemId: defaultItemId ? String(defaultItemId) : "" }
  );

  const months = monthOptions(totalMonths, startDate);

  const upd = (k: keyof BarFormState, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/programme`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Programme row added" });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: e.message || "Failed to add row", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/boq/programme/bars/${editBar!.id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Programme row updated" });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: e.message || "Failed to update row", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || patchMutation.isPending;

  function handleSubmit() {
    if (!form.boqItemId) {
      toast({ title: "Please select a BOQ item", variant: "destructive" });
      return;
    }
    if (!form.plannedQty || parseFloat(form.plannedQty) <= 0) {
      toast({ title: "Planned Qty must be > 0", variant: "destructive" });
      return;
    }
    const sm = parseInt(form.startMonth);
    const em = parseInt(form.endMonth);
    if (em < sm) {
      toast({ title: "End month must be ≥ start month", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      boqItemId: parseInt(form.boqItemId),
      startMonth: sm,
      endMonth: em,
      plannedQty: parseFloat(form.plannedQty),
      reachLabel: form.reachLabel.trim() || null,
      chainageFrom: form.chainageFrom !== "" ? parseFloat(form.chainageFrom) : null,
      chainageTo: form.chainageTo !== "" ? parseFloat(form.chainageTo) : null,
      notes: form.notes.trim() || null,
    };
    if (editBar) {
      patchMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editBar ? "Edit Programme Row" : "Add Programme Row"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* BOQ Item */}
          <div>
            <Label className="text-xs">BOQ ITEM <span className="text-red-500">*</span></Label>
            <Select value={form.boqItemId} onValueChange={v => upd("boqItemId", v)}>
              <SelectTrigger data-testid="select-bar-item">
                <SelectValue placeholder="Select item…" />
              </SelectTrigger>
              <SelectContent>
                {items.map(it => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.itemCode ? `[${it.itemCode}] ` : ""}{it.description} ({it.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reach Label + Chainage */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Label className="text-xs">REACH / STRETCH</Label>
              <Input
                placeholder="e.g. Reach 1"
                value={form.reachLabel}
                onChange={e => upd("reachLabel", e.target.value)}
                data-testid="input-bar-reach"
              />
            </div>
            <div>
              <Label className="text-xs">CHAINAGE FROM (km)</Label>
              <Input
                type="number"
                placeholder="0.000"
                value={form.chainageFrom}
                onChange={e => upd("chainageFrom", e.target.value)}
                data-testid="input-bar-chainage-from"
              />
            </div>
            <div>
              <Label className="text-xs">CHAINAGE TO (km)</Label>
              <Input
                type="number"
                placeholder="0.000"
                value={form.chainageTo}
                onChange={e => upd("chainageTo", e.target.value)}
                data-testid="input-bar-chainage-to"
              />
            </div>
          </div>

          {/* Months + Qty */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">START MONTH <span className="text-red-500">*</span></Label>
              <Select value={form.startMonth} onValueChange={v => upd("startMonth", v)}>
                <SelectTrigger data-testid="select-bar-start-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">END MONTH <span className="text-red-500">*</span></Label>
              <Select value={form.endMonth} onValueChange={v => upd("endMonth", v)}>
                <SelectTrigger data-testid="select-bar-end-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">PLANNED QTY <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                value={form.plannedQty}
                onChange={e => upd("plannedQty", e.target.value)}
                data-testid="input-bar-planned-qty"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">NOTES</Label>
            <Textarea
              rows={2}
              placeholder="Optional notes for this programme row"
              value={form.notes}
              onChange={e => upd("notes", e.target.value)}
              data-testid="input-bar-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-bar-cancel">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-teal-700 hover:bg-teal-800 text-white"
            data-testid="button-bar-save"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {editBar ? "Save Changes" : "Add Row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Coverage badge ───────────────────────────────────────────────────────

function CoverageBadge({ planned, boqQty, unit }: { planned: number; boqQty: number; unit: string }) {
  if (planned === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
        Not programmed
      </span>
    );
  }
  if (Math.abs(planned - boqQty) < 0.001) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Fully covered
      </span>
    );
  }
  if (planned < boqQty) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
        <AlertTriangle className="w-3 h-3" />
        Under by {fmt(boqQty - planned)} {unit}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-3 h-3" />
      Over by {fmt(planned - boqQty)} {unit}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkProgramme() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { toast } = useToast();

  const [addForItemId, setAddForItemId] = useState<number | null>(null);
  const [editBar, setEditBar] = useState<WorkProgramBarWithItem | null>(null);
  const [deleteBarId, setDeleteBarId] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(true);

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/programme/bars/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "programme"] });
      toast({ title: "Row deleted" });
      setDeleteBarId(null);
    },
    onError: () => toast({ title: "Failed to delete row", variant: "destructive" }),
  });

  // ── Derived values ──
  const itemsById = useMemo(() => {
    const m: Record<number, BoqItemWithCategory> = {};
    for (const it of items) m[it.id] = it;
    return m;
  }, [items]);

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

  const warnings = useMemo(() => {
    let under = 0, over = 0, missing = 0;
    for (const it of items) {
      const planned = plannedByItemId[it.id] ?? 0;
      if (planned === 0) missing++;
      else if (planned < it.currentQty - 0.001) under++;
      else if (planned > it.currentQty + 0.001) over++;
    }
    return { under, over, missing };
  }, [items, plannedByItemId]);

  // Monthly summary
  const maxMonth = useMemo(() => {
    if (bars.length === 0) return project?.totalMonths ?? 12;
    const fromBars = Math.max(...bars.map(b => b.endMonth));
    const fromProject = project?.totalMonths ?? 0;
    return Math.max(fromBars, fromProject, 1);
  }, [bars, project]);

  const monthlyGrid = useMemo(() => {
    const grid: Record<number, Record<number, number>> = {};
    for (const b of bars) {
      if (!grid[b.boqItemId]) grid[b.boqItemId] = {};
      const span = b.endMonth - b.startMonth + 1;
      const perMonth = b.plannedQty / span;
      for (let m = b.startMonth; m <= b.endMonth; m++) {
        grid[b.boqItemId][m] = (grid[b.boqItemId][m] ?? 0) + perMonth;
      }
    }
    return grid;
  }, [bars]);

  // Group items by category for display
  const grouped = useMemo(() => {
    const m: Record<string, BoqItemWithCategory[]> = {};
    for (const it of items) {
      const cat = it.categoryName ?? "__uncategorised__";
      if (!m[cat]) m[cat] = [];
      m[cat].push(it);
    }
    return m;
  }, [items]);
  const categoryKeys = Object.keys(grouped).filter(k => k !== "__uncategorised__").sort();
  const allCategoryKeys = [...categoryKeys, ...(grouped["__uncategorised__"]?.length ? ["__uncategorised__"] : [])];

  const isLoading = itemsLoading || barsLoading;
  const months = monthOptions(project?.totalMonths, project?.startDate);

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
          <h1 className="text-xl font-bold text-slate-800">Work Programme</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project?.name}
            {project?.contractNo ? ` · ${project.contractNo}` : ""}
            {project?.startDate && project?.totalMonths
              ? ` · ${monthLabel(1, project.startDate)} – ${monthLabel(project.totalMonths, project.startDate)}`
              : ""}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-teal-700 hover:bg-teal-800 text-white flex-shrink-0"
          onClick={() => { setEditBar(null); setAddForItemId(0); }}
          data-testid="button-add-programme-row"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Row
        </Button>
      </div>

      {/* Warning banner */}
      {(warnings.missing + warnings.under + warnings.over) > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-0.5">
            {warnings.missing > 0 && (
              <p className="text-xs text-amber-700">
                <strong>{warnings.missing} item{warnings.missing > 1 ? "s" : ""}</strong> not yet programmed
              </p>
            )}
            {warnings.under > 0 && (
              <p className="text-xs text-amber-700">
                <strong>{warnings.under} item{warnings.under > 1 ? "s" : ""}</strong> under-planned vs BOQ quantity
              </p>
            )}
            {warnings.over > 0 && (
              <p className="text-xs text-red-700">
                <strong>{warnings.over} item{warnings.over > 1 ? "s" : ""}</strong> planned quantity exceeds BOQ
              </p>
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

      {/* Main programme table */}
      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <FileSpreadsheet className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-sm">No BOQ items in this project yet.</p>
            <p className="text-xs">Import a BOQ first, then programme the work here.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          {/* Table header */}
          <div className="bg-[#0F5F64] text-white px-4 py-2.5 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-wide">
            <span>Item / Reach</span>
            <span>Chainage</span>
            <span>Start</span>
            <span>End</span>
            <span>Planned Qty</span>
            <span>Coverage</span>
            <span className="w-14" />
          </div>

          {allCategoryKeys.map(cat => {
            const catItems = grouped[cat] ?? [];
            const catLabel = cat === "__uncategorised__" ? "Uncategorised" : cat;
            return (
              <div key={cat}>
                {/* Category separator */}
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-1.5 border-y border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{catLabel}</span>
                </div>

                {catItems.map(item => {
                  const itemBars = barsByItemId[item.id] ?? [];
                  const totalPlanned = plannedByItemId[item.id] ?? 0;

                  return (
                    <div key={item.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      {/* Item header row */}
                      <div className="px-4 py-2 bg-white dark:bg-gray-950 flex items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.itemCode && (
                              <span className="text-[10px] font-mono text-muted-foreground">{item.itemCode}</span>
                            )}
                            <span className="text-xs font-semibold text-slate-800">{item.description}</span>
                            <span className="text-[10px] text-muted-foreground">({item.unit})</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                            <span>BOQ Qty: <strong>{fmt(item.currentQty)}</strong></span>
                            <span>Programmed: <strong className={
                              totalPlanned === 0 ? "text-slate-500"
                              : Math.abs(totalPlanned - item.currentQty) < 0.001 ? "text-emerald-700"
                              : totalPlanned < item.currentQty ? "text-amber-700"
                              : "text-red-700"
                            }>{fmt(totalPlanned)}</strong></span>
                            <CoverageBadge planned={totalPlanned} boqQty={item.currentQty} unit={item.unit} />
                          </div>
                        </div>
                        <button
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-0.5 flex-shrink-0"
                          onClick={() => { setEditBar(null); setAddForItemId(item.id); }}
                          data-testid={`button-add-bar-item-${item.id}`}
                        >
                          <Plus className="w-3 h-3" /> Add bar
                        </button>
                      </div>

                      {/* Programme bars for this item */}
                      {itemBars.length === 0 ? (
                        <div className="px-6 py-2 text-[11px] text-muted-foreground italic bg-slate-50/60 dark:bg-slate-900/30">
                          No programme rows yet
                        </div>
                      ) : (
                        itemBars.map(bar => (
                          <div
                            key={bar.id}
                            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-4 py-1.5 bg-slate-50/40 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                            data-testid={`row-bar-${bar.id}`}
                          >
                            <div className="min-w-0">
                              {bar.reachLabel ? (
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{bar.reachLabel}</span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">—</span>
                              )}
                              {bar.notes && (
                                <p className="text-[10px] text-muted-foreground truncate">{bar.notes}</p>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {bar.chainageFrom != null || bar.chainageTo != null
                                ? `${bar.chainageFrom ?? "?"} – ${bar.chainageTo ?? "?"}`
                                : "—"}
                            </div>
                            <span className="text-xs font-mono text-slate-600">
                              {monthLabel(bar.startMonth, project?.startDate)}
                            </span>
                            <span className="text-xs font-mono text-slate-600">
                              {monthLabel(bar.endMonth, project?.startDate)}
                            </span>
                            <span className="text-xs font-semibold text-slate-800">
                              {fmt(bar.plannedQty)} <span className="font-normal text-muted-foreground">{bar.unit}</span>
                            </span>
                            <span />
                            <div className="flex items-center gap-1 w-14 justify-end">
                              <button
                                className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                                onClick={() => { setEditBar(bar); setShowAddDialog(true); }}
                                data-testid={`button-edit-bar-${bar.id}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                onClick={() => setDeleteBarId(bar.id)}
                                data-testid={`button-delete-bar-${bar.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly Summary */}
      {!isLoading && bars.length > 0 && (
        <Card className="overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-slate-800 cursor-pointer select-none"
            onClick={() => setShowSummary(s => !s)}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Summary</span>
              <span className="text-[11px] text-muted-foreground">
                ({maxMonth} month{maxMonth !== 1 ? "s" : ""} · planned qty distributed evenly across bar span)
              </span>
            </div>
            {showSummary
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>

          {showSummary && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="text-left px-3 py-2 font-semibold text-slate-600 border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 min-w-[200px]">
                      BOQ Item
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200 dark:border-slate-700 text-right min-w-[70px]">
                      Unit
                    </th>
                    {months.slice(0, maxMonth).map(m => (
                      <th
                        key={m.value}
                        className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200 dark:border-slate-700 text-right whitespace-nowrap min-w-[60px]"
                      >
                        {m.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-semibold text-teal-700 border-b border-slate-200 dark:border-slate-700 text-right min-w-[80px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allCategoryKeys.map(cat => {
                    const catItems = grouped[cat] ?? [];
                    const catLabel = cat === "__uncategorised__" ? "Uncategorised" : cat;
                    // Category monthly totals
                    const catMonthTotals: Record<number, number> = {};
                    let catTotal = 0;
                    for (const it of catItems) {
                      const g = monthlyGrid[it.id] ?? {};
                      for (let m = 1; m <= maxMonth; m++) {
                        catMonthTotals[m] = (catMonthTotals[m] ?? 0) + (g[m] ?? 0);
                      }
                      catTotal += plannedByItemId[it.id] ?? 0;
                    }
                    const catHasBars = catItems.some(it => (barsByItemId[it.id] ?? []).length > 0);
                    if (!catHasBars) return null;

                    return [
                      // Category header row
                      <tr key={`cat-${cat}`} className="bg-slate-100/70 dark:bg-slate-800/50">
                        <td
                          colSpan={2 + maxMonth + 1}
                          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky left-0 bg-slate-100/70 dark:bg-slate-800/50"
                        >
                          {catLabel}
                        </td>
                      </tr>,
                      // Item rows
                      ...catItems
                        .filter(it => (barsByItemId[it.id] ?? []).length > 0)
                        .map(item => {
                          const g = monthlyGrid[item.id] ?? {};
                          const rowTotal = plannedByItemId[item.id] ?? 0;
                          return (
                            <tr
                              key={item.id}
                              className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                              data-testid={`summary-row-${item.id}`}
                            >
                              <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-gray-950 z-10">
                                <span className="font-medium">{item.itemCode ? `[${item.itemCode}] ` : ""}{item.description}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right text-muted-foreground">{item.unit}</td>
                              {months.slice(0, maxMonth).map(m => {
                                const mNum = parseInt(m.value);
                                const val = g[mNum] ?? 0;
                                return (
                                  <td
                                    key={m.value}
                                    className={`px-2 py-1.5 text-right font-mono ${val > 0 ? "text-teal-700 font-semibold bg-teal-50/60 dark:bg-teal-900/20" : "text-slate-300"}`}
                                  >
                                    {val > 0 ? fmt(val, 1) : "—"}
                                  </td>
                                );
                              })}
                              <td className={`px-3 py-1.5 text-right font-semibold font-mono ${
                                Math.abs(rowTotal - item.currentQty) < 0.001
                                  ? "text-emerald-700"
                                  : rowTotal < item.currentQty
                                  ? "text-amber-700"
                                  : "text-red-700"
                              }`}>
                                {fmt(rowTotal, 1)}
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
                      const span = b.endMonth - b.startMonth + 1;
                      const perM = b.plannedQty / span;
                      for (let m = b.startMonth; m <= b.endMonth; m++) {
                        grandMonthly[m] = (grandMonthly[m] ?? 0) + perM;
                      }
                      grand += b.plannedQty;
                    }
                    return (
                      <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                        <td className="px-3 py-2 text-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                          TOTAL
                        </td>
                        <td />
                        {months.slice(0, maxMonth).map(m => {
                          const mNum = parseInt(m.value);
                          const val = grandMonthly[mNum] ?? 0;
                          return (
                            <td
                              key={m.value}
                              className={`px-2 py-2 text-right font-mono text-[11px] ${val > 0 ? "text-teal-800" : "text-slate-300"}`}
                            >
                              {val > 0 ? fmt(val, 1) : "—"}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right text-teal-800 font-mono text-[11px]">
                          {fmt(grand, 1)}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Add/Edit Dialog */}
      {(addForItemId !== null || editBar) && (
        <BarDialog
          open
          onClose={() => { setAddForItemId(null); setEditBar(null); }}
          projectId={projectId}
          items={items}
          startDate={project?.startDate}
          totalMonths={project?.totalMonths}
          editBar={editBar}
          defaultItemId={addForItemId && addForItemId > 0 ? addForItemId : null}
        />
      )}

      {/* Delete Confirm */}
      <Dialog open={deleteBarId !== null} onOpenChange={o => { if (!o) setDeleteBarId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Programme Row?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">This will permanently remove this row from the work programme.</p>
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
