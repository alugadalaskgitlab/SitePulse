import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import {
  ChevronRight, Upload, Pencil, ChevronDown, ChevronUp,
  Plus, Check, CheckCheck, Trash2, Loader2, FileSpreadsheet, AlertCircle,
  GitBranch, CalendarDays, Package, Settings2, BookOpen,
  Link2, Link2Off, Clock, RefreshCw, Search, CheckCircle2, X, Sparkles, Zap, Wrench, Layers, ClipboardList, MapPin, Ruler,
} from "lucide-react";
import { BOQ_WORK_CATEGORIES, getWorkCategoryLabel } from "@shared/boqWorkCategories";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BoqImportWizard } from "@/components/BoqImportWizard";
import { BoqItemRecipeDialog } from "@/pages/BoqItemRecipes";
import type { BoqProject, BoqItemWithCategory, BoqRevisionWithItems } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const REV_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "DRAFT", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  active: { label: "ACTIVE", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  superseded: { label: "SUPERSEDED", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

const PROJ_STATUS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-red-50 text-red-600 border-red-200",
};

const MAPPING_STATUS: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  mapped:       { icon: <CheckCircle2 className="w-3 h-3" />, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "SNL Mapped" },
  needs_review: { icon: <Clock className="w-3 h-3" />,        cls: "bg-amber-50 text-amber-700 border-amber-200",   label: "Needs Review" },
  unmapped:     { icon: <Link2Off className="w-3 h-3" />,     cls: "bg-slate-100 text-slate-500 border-slate-200",  label: "Unmapped" },
};

// 06W-HF3: collapse any whitespace runs (incl. embedded line breaks from
// pasted/imported text) to single spaces at display time only — the stored
// value is never modified.
const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

// 06W-HF3: Project header extracted for testability. Layout fix: the action
// block was `flex-shrink-0` with no wrap (~10 buttons ≈ wider than a laptop
// content area), which starved the `flex-1 min-w-0` title column to ~0px —
// the title ellipsed to one character and the summary line wrapped one word
// per line. The action block now wraps and may shrink; the title column keeps
// a readable minimum width; the outer row wraps only when genuinely too narrow.
export function ProjectHeader({ project, activeRevision, children }: {
  project: {
    name: string;
    status: string;
    contractNo?: string | null;
    client?: string | null;
    contractor?: string | null;
    roadLengthKm?: number | string | null;
    startDate?: string | null;
  };
  activeRevision?: { label: string } | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid="project-header">
      <div className="flex-1 min-w-[min(280px,100%)]" data-testid="project-header-titleblock">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-slate-800 truncate" data-testid="text-project-title">{project.name}</h1>
          <Badge variant="outline"
            className={`text-sm flex-shrink-0 ${PROJ_STATUS[project.status] ?? PROJ_STATUS.draft}`}>
            {project.status.toUpperCase()}
          </Badge>
          {activeRevision && (
            <Badge variant="outline" className="text-sm flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200">
              {activeRevision.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap" data-testid="text-project-summary">
          {project.contractNo && <span>Contract: {oneLine(project.contractNo)}</span>}
          {project.client && <span>· {oneLine(project.client)}</span>}
          {project.contractor && <span>· {oneLine(project.contractor)}</span>}
          {project.roadLengthKm != null && <span>· {project.roadLengthKm} km</span>}
          {project.startDate && <span>· Start: {project.startDate}</span>}
        </div>
      </div>
      {/* flex-[3_1_0%] + min-w floor: the hypothetical main size is 420px (not
          the ~1100px max-content of all buttons), so this block stays BESIDE
          the title on desktop/laptop lines and wraps its buttons internally;
          it only drops below the title when the row is narrower than
          280px (title min) + 420px (actions min), i.e. true mobile widths. */}
      <div className="flex-[3_1_0%] min-w-[min(420px,100%)] flex flex-wrap items-center justify-end gap-2" data-testid="project-header-actions">
        {children}
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtAmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─── Inline Item Edit Dialog ──────────────────────────────────────────────────

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

function ItemEditDialog({
  item,
  onClose,
  projectId,
}: {
  item: BoqItemWithCategory;
  onClose: () => void;
  projectId: number;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    description: item.description,
    itemName: (item as any).itemName ?? "",
    unit: (item as any).canonicalUnit ?? item.unit,
    itemCode: item.itemCode ?? "",
    clientRate: item.clientRate != null ? String(item.clientRate) : "",
    workCategory: item.workCategory ?? "__none__",
    dprConversionFactor: (item as any).dprConversionFactor != null ? String((item as any).dprConversionFactor) : "",
  });

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/boq/items/${item.id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      toast({ title: "Item updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  function handleSave() {
    if (!form.description.trim() || !form.unit.trim()) {
      toast({ title: "Description and Unit are required", variant: "destructive" });
      return;
    }
    const rate = form.clientRate !== "" ? parseFloat(form.clientRate) : null;
    const clientAmount = rate != null ? Math.round(rate * item.currentQty * 100) / 100 : null;
    const convFactor = form.dprConversionFactor !== "" ? parseFloat(form.dprConversionFactor) : null;
    patchMutation.mutate({
      description: form.description.trim(),
      itemName: form.itemName.trim() || null,
      unit: form.unit.trim(),
      itemCode: form.itemCode.trim() || null,
      clientRate: rate,
      clientAmount,
      workCategory: form.workCategory === "__none__" ? null : form.workCategory,
      dprConversionFactor: convFactor,
    });
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Pencil className="w-4 h-4 text-blue-600" />
            Edit Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">DESCRIPTION <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              data-testid="input-edit-description"
            />
          </div>
          <div>
            <Label className="text-sm">SHORT NAME <span className="text-slate-400 font-normal">(for Gantt/tables — auto-filled if blank)</span></Label>
            <Input
              value={form.itemName}
              onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))}
              placeholder="e.g. BC 40mm, DBM, WMM"
              data-testid="input-edit-item-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">UNIT <span className="text-red-500">*</span></Label>
              <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                data-testid="input-edit-unit" />
            </div>
            <div>
              <Label className="text-sm">ITEM CODE</Label>
              <Input value={form.itemCode} onChange={e => setForm(p => ({ ...p, itemCode: e.target.value }))}
                placeholder="e.g. 1.01" data-testid="input-edit-code" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">CLIENT RATE (₹)</Label>
              <Input type="number" value={form.clientRate}
                onChange={e => setForm(p => ({ ...p, clientRate: e.target.value }))}
                placeholder="0.00" data-testid="input-edit-rate" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">WORK CATEGORY</Label>
              <Select
                value={form.workCategory}
                onValueChange={v => setForm(p => ({ ...p, workCategory: v }))}
              >
                <SelectTrigger className="mt-0.5" data-testid="select-edit-work-category">
                  <SelectValue placeholder="— Uncategorised —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-muted-foreground">— Uncategorised —</SelectItem>
                  {BOQ_WORK_CATEGORIES.map(cat => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-sm">DPR → BOQ CONVERSION FACTOR</Label>
            <Input
              type="number"
              step="any"
              value={form.dprConversionFactor}
              onChange={e => setForm(p => ({ ...p, dprConversionFactor: e.target.value }))}
              placeholder="Leave blank for 1 (no conversion)"
              data-testid="input-edit-conv-factor"
            />
            {/* Unit-pair suggestions based on current BOQ unit */}
            {(() => {
              const u = form.unit.trim().toUpperCase();
              const suggestions: { label: string; factor: string }[] = [];
              if (u === "HA" || u === "HECTARE" || u === "HECTARES") {
                suggestions.push({ label: "SQM → Ha  (÷10000)", factor: "0.0001" });
              } else if (u === "KM" || u === "KMS") {
                suggestions.push({ label: "m → km  (÷1000)", factor: "0.001" });
                suggestions.push({ label: "RMT → km  (÷1000)", factor: "0.001" });
              } else if (u === "MT" || u === "TON" || u === "TONS") {
                suggestions.push({ label: "kg → MT  (÷1000)", factor: "0.001" });
              } else if (u === "SQM" || u === "M2") {
                suggestions.push({ label: "Same unit — no conversion", factor: "1" });
              } else if (u === "CUM" || u === "M3") {
                suggestions.push({ label: "Same unit — no conversion", factor: "1" });
              } else if (u === "RMT" || u === "RM") {
                suggestions.push({ label: "Same unit — no conversion", factor: "1" });
              }
              if (suggestions.length === 0) return (
                <p className="text-xs text-slate-400 mt-1">Multiplies DPR quantities before summing actuals. Common: SQM→Ha = 0.0001 · m→km = 0.001 · same unit = 1</p>
              );
              return (
                <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-400">Quick fill:</span>
                  {suggestions.map(s => (
                    <button
                      key={s.factor}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, dprConversionFactor: s.factor }))}
                      className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      data-testid={`preset-conv-${s.factor}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-edit-cancel">Cancel</Button>
          <Button onClick={handleSave} disabled={patchMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-edit-save">
            {patchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Section (collapsible items table) ────────────────────────────────

function CategorySection({
  name,
  items,
  projectId,
  defaultCollapsed = false,
  onOpenRecipe,
  programmeStatus,
}: {
  name: string;
  items: BoqItemWithCategory[];
  projectId: number;
  defaultCollapsed?: boolean;
  onOpenRecipe: (item: BoqItemWithCategory) => void;
  programmeStatus: Record<number, { status: string; relevantBarId?: number | null }>;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editItem, setEditItem] = useState<BoqItemWithCategory | null>(null);
  const { toast } = useToast();
  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/items/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      toast({ title: "Item deleted" });
    },
    onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
  });
  const planToggleMutation = useMutation({
    mutationFn: ({ id, includedInPlanning }: { id: number; includedInPlanning: boolean }) =>
      apiRequest("PATCH", `/api/boq/items/${id}/planning-include`, { includedInPlanning }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "bom"] });
    },
    onError: () => toast({ title: "Failed to update planning flag", variant: "destructive" }),
  });

  const workTypeMutation = useMutation({
    mutationFn: ({ id, planningWorkType }: { id: number; planningWorkType: string }) =>
      apiRequest("PATCH", `/api/boq/items/${id}/work-type`, { planningWorkType }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
    },
    onError: () => toast({ title: "Failed to update work type", variant: "destructive" }),
  });

  const categoryId = items[0]?.categoryId ?? null;
  const allIncluded = items.every(it => it.includedInPlanning !== false);
  const anyExcluded = items.some(it => it.includedInPlanning === false);
  const planBulkMutation = useMutation({
    mutationFn: (includedInPlanning: boolean) =>
      apiRequest("PATCH", `/api/boq/projects/${projectId}/planning-include-bulk`, { categoryId, includedInPlanning }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "bom"] });
    },
    onError: () => toast({ title: "Failed to update category planning flag", variant: "destructive" }),
  });

  const subtotal = items.reduce((s, i) => s + (i.clientAmount ?? 0), 0);
  const boqSubtotal = items.reduce((s, i) => s + (i.clientRate ?? 0) * i.boqQty, 0);

  return (
    <Card className="border-slate-200" data-testid={`section-category-${name}`}>
      {/* Category header — sticky below main nav (top-14 = 56px).
          NOTE: overflow-hidden removed from Card — any overflow on an ancestor
          breaks position:sticky by capping the sticky container to that element. */}
      <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between sticky top-14 z-10 rounded-t-xl">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 flex-1 text-left"
          data-testid={`button-toggle-category-${name}`}
        >
          <span className="text-sm font-semibold text-white">{name}</span>
          <span className="text-sm text-slate-400">{items.length} items</span>
          {anyExcluded && (
            <span className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded-full">
              {items.filter(it => it.includedInPlanning !== false).length}/{items.length} in plan
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {boqSubtotal > 0 && (
            <span className="text-sm text-slate-300 hidden sm:block">
              ₹{fmtAmt(boqSubtotal)}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); planBulkMutation.mutate(!allIncluded); }}
            disabled={planBulkMutation.isPending}
            title={allIncluded ? "Exclude all items in this category from Gantt/BOM" : "Include all items in this category in Gantt/BOM"}
            data-testid={`button-plan-bulk-${name}`}
            className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
              allIncluded
                ? "border-teal-400/50 text-teal-300 hover:bg-teal-800/30"
                : "border-amber-400/50 text-amber-300 hover:bg-amber-800/30"
            }`}
          >
            {allIncluded ? "Exclude all" : "Include all"}
          </button>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Items table */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-20">Item No.</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-12">Unit</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">BOQ Qty</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Curr Qty</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-22">Rate (₹)</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">Amount (₹)</th>
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-12" title="Include in Gantt / BOM planning">Plan</th>
                <th className="px-2 py-2 w-7" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const revised = Math.abs((item.currentQty ?? 0) - (item.boqQty ?? 0)) > 0.001;
                const excluded = item.includedInPlanning === false;
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 last:border-0 transition-opacity ${
                      excluded
                        ? "opacity-45 bg-slate-50"
                        : revised ? "bg-amber-50" : i % 2 === 1 ? "bg-slate-50/40" : ""
                    }`}
                    data-testid={`row-item-${item.id}`}
                  >
                    <td className="px-3 py-1.5 font-mono text-slate-500 whitespace-nowrap">
                      {item.itemCode ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700 max-w-[460px]" title={item.description}>
                       <span className="block whitespace-normal leading-snug text-justify">{item.description}</span>
                       {(() => {
                         const status = programmeStatus[item.id]?.status ?? "not_programmed";
                         const info: Record<string, { label: string; cls: string }> = {
                           not_programmed: { label: "Not Programmed", cls: "bg-slate-100 text-slate-500 border-slate-200" },
                           planned: { label: "Planned", cls: "bg-sky-50 text-sky-700 border-sky-200" },
                           in_progress: { label: "In Progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                           delayed: { label: "Delayed", cls: "bg-red-50 text-red-700 border-red-200" },
                           completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                         };
                         const s = info[status] ?? info.not_programmed;
                         return (
                           <Link href={`/work-program/${projectId}/programme?item=${item.id}`}
                             className={`inline-flex mt-1 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${s.cls}`}
                             title={`Open programme for item ${item.itemCode ?? item.id}`}>
                             {s.label}
                           </Link>
                         );
                       })()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{(item as any).canonicalUnit ?? item.unit}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                      {fmt(item.boqQty)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${revised ? "text-amber-700" : "text-slate-700"}`}>
                      {fmt(item.currentQty)}
                      {revised && <span className="ml-1 text-amber-500 text-[12px]">↕</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{fmt(item.clientRate)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">
                      {fmtAmt(item.clientAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => planToggleMutation.mutate({ id: item.id, includedInPlanning: !item.includedInPlanning })}
                          disabled={planToggleMutation.isPending}
                          title={item.includedInPlanning ? "Included in Gantt/BOM — click to exclude" : "Excluded from Gantt/BOM — click to include"}
                          data-testid={`button-plan-toggle-${item.id}`}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-bold transition-colors ${
                            item.includedInPlanning
                              ? "bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100"
                              : "bg-slate-100 border-slate-300 text-slate-400 hover:bg-slate-200"
                          }`}
                        >
                          {item.includedInPlanning ? "✓" : "−"}
                        </button>
                        <button
                          onClick={() => workTypeMutation.mutate({
                            id: item.id,
                            planningWorkType: (item as any).planningWorkType === "structure" ? "road" : "structure",
                          })}
                          disabled={workTypeMutation.isPending}
                          title={(item as any).planningWorkType === "structure"
                            ? "Structure/bridge item — qty entered per location (click to switch to Road)"
                            : "Road/linear item — qty auto-distributed by chainage (click to switch to Structure)"}
                          data-testid={`button-work-type-${item.id}`}
                          className={`inline-flex items-center justify-center px-1 h-5 rounded border text-[10px] font-semibold transition-colors ${
                            (item as any).planningWorkType === "structure"
                              ? "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100"
                              : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                          }`}
                        >
                          {(item as any).planningWorkType === "structure" ? "Str" : "Rd"}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center gap-0.5 justify-center">
                        {(() => {
                          const ms = item.snlMappingStatus ?? item.mappingStatus ?? "unmapped";
                          const mInfo = MAPPING_STATUS[ms] ?? MAPPING_STATUS.unmapped;
                          return (
                            <span
                              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-xs font-medium ${mInfo.cls}`}
                              title={mInfo.label + (item.snlItemCode ? ` — ${item.snlItemCode}` : "") + (item.snlConfidence != null ? ` (${(item.snlConfidence * 100).toFixed(0)}%)` : "")}
                              data-testid={`badge-mapping-${item.id}`}
                            >
                              {mInfo.icon}
                            </span>
                          );
                        })()}
                        <button
                          onClick={() => onOpenRecipe(item)}
                          className="p-1 rounded hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors"
                          title="Edit recipes (equipment / labour / materials)"
                          data-testid={`button-recipe-item-${item.id}`}
                        >
                          <Package className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Edit item"
                          data-testid={`button-edit-item-${item.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${(item as any).itemName || item.description.slice(0, 50)}"?\nThis removes the item and its Gantt stretches. This cannot be undone.`)) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                          disabled={deleteItemMutation.isPending}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete item"
                          data-testid={`button-delete-item-${item.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Subtotal row */}
              {subtotal > 0 && (
                <tr className="bg-slate-100 border-t border-slate-200">
                  <td colSpan={6} className="px-3 py-1.5 text-right text-sm font-semibold text-slate-600">
                    Subtotal
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-bold text-slate-800">
                    ₹{fmtAmt(subtotal)}
                  </td>
                  <td />
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <ItemEditDialog item={editItem} projectId={projectId} onClose={() => setEditItem(null)} />
      )}
    </Card>
  );
}

// ─── New Revision Dialog ───────────────────────────────────────────────────────

function NewRevisionDialog({
  projectId,
  items,
  onClose,
}: {
  projectId: number;
  items: BoqItemWithCategory[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  // Per-item state: { [itemId]: { revisedQty: string, changeReason: string } }
  const [rows, setRows] = useState<Record<number, { revisedQty: string; changeReason: string }>>(() =>
    Object.fromEntries(items.map(it => [it.id, { revisedQty: String(it.currentQty ?? 0), changeReason: "" }]))
  );

  const createMutation = useMutation({
    mutationFn: (data: unknown) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/revisions`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "revisions"] });
      toast({ title: "Revision created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create revision", variant: "destructive" }),
  });

  const changedItems = items.filter(it => rows[it.id]?.changeReason?.trim());

  function handleSubmit() {
    if (!label.trim()) {
      toast({ title: "Revision label is required", variant: "destructive" });
      return;
    }
    if (changedItems.length === 0) {
      toast({ title: "At least one item must have a Change Reason", variant: "destructive" });
      return;
    }
    const payload = {
      label: label.trim(),
      notes: notes.trim() || undefined,
      createdBy: user?.fullName || user?.email || undefined,
      items: changedItems.map(it => ({
        boqItemId: it.id,
        revisedQty: parseFloat(rows[it.id].revisedQty) || 0,
        changeReason: rows[it.id].changeReason.trim(),
      })),
    };
    createMutation.mutate(payload);
  }

  function setRow(id: number, field: "revisedQty" | "changeReason", val: string) {
    setRows(p => ({ ...p, [id]: { ...p[id], [field]: val } }));
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            New BOQ Revision
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-sm">REVISION LABEL <span className="text-red-500">*</span></Label>
              <Input value={label} onChange={e => setLabel(e.target.value)}
                placeholder='e.g. Rev 1 — Additional earthwork quantities'
                data-testid="input-revision-label" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">NOTES</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Reason for revision, reference document, etc."
                data-testid="input-revision-notes" />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1.5">
              BOQ ITEMS — Enter Revised Qty and Change Reason for items you want to revise
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Only rows with a Change Reason will be included in this revision.{" "}
              <span className="font-semibold text-slate-700">{changedItems.length}</span> item(s) selected.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-16">Item No.</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-12">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Curr Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">Revised Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-44">Change Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const row = rows[item.id];
                      const hasReason = !!row?.changeReason?.trim();
                      return (
                        <tr key={item.id}
                          className={`border-b border-slate-100 last:border-0 ${hasReason ? "bg-purple-50" : i % 2 === 1 ? "bg-slate-50/40" : ""}`}
                          data-testid={`row-rev-item-${item.id}`}
                        >
                          <td className="px-3 py-1.5 font-mono text-slate-500">{item.itemCode ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-700 max-w-[400px]" title={item.description}>
                            <span className="block whitespace-normal leading-snug text-justify">{item.description}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{(item as any).canonicalUnit ?? item.unit}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-medium">
                            {fmt(item.currentQty)}
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              value={row?.revisedQty ?? ""}
                              onChange={e => setRow(item.id, "revisedQty", e.target.value)}
                              className="h-6 text-sm text-right w-20 ml-auto"
                              data-testid={`input-rev-qty-${item.id}`}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={row?.changeReason ?? ""}
                              onChange={e => setRow(item.id, "changeReason", e.target.value)}
                              placeholder="Enter reason to include"
                              className={`h-6 text-sm w-40 ${hasReason ? "border-purple-300" : ""}`}
                              data-testid={`input-rev-reason-${item.id}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-rev-cancel">Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || changedItems.length === 0}
            className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-rev-create">
            {createMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating…</>
              : <><GitBranch className="w-4 h-4 mr-1" /> Create Revision ({changedItems.length} items)</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SNL Mapping Panel ─────────────────────────────────────────────────────────

type SnlSearchResult = {
  id: number;
  itemCode: string;
  shortLabel: string | null;
  description: string;
  unit: string;
  workCategory: string;
  sector?: string | null;
  categoryMatchStatus?: "match" | "secondary" | "mismatch" | "unknown";
  sourceName: string;
  sourceCode: string;
};

type CompositeComponent = {
  id: number;
  componentIndex: number;
  componentTag: string;
  componentDescription: string;
  snlItemId: number | null;
  snlItemCode: string | null;
  snlItemDescription: string | null;
  confidenceScore: number | null;
  status: string;
  notes: string | null;
};

function CompositeReviewCard({
  item,
  projectId,
  onMapped,
}: {
  item: BoqItemWithCategory;
  projectId: number;
  onMapped: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [searchCompId, setSearchCompId] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [selectedSnlId, setSelectedSnlId] = useState<number | null>(null);

  const { data: components = [], refetch: refetchComponents } = useQuery<CompositeComponent[]>({
    queryKey: ["/api/boq/items", item.id, "components"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${item.id}/components`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load components");
      return res.json();
    },
    enabled: expanded,
  });

  const searchingComp = components.find(c => c.id === searchCompId);
  const { data: searchResults = [], isFetching: searching } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/search", searchQ, item.workCategory, item.description],
    queryFn: async () => {
      if (!searchQ.trim()) return [];
      const params = new URLSearchParams({ q: searchQ });
      if (item.workCategory) params.set("category", item.workCategory);
      if (item.description) params.set("boqDesc", item.description);
      const res = await fetch(`/api/snl/search?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchCompId != null && searchQ.length >= 2,
  });

  const mapMutation = useMutation({
    mutationFn: ({ compId, snlItemId }: { compId: number; snlItemId: number }) =>
      apiRequest("POST", `/api/boq/items/${item.id}/components/${compId}/map`, { snlItemId }),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.allDone) {
        toast({ title: "All components confirmed — recipe applied!" });
        queryClient.invalidateQueries({ queryKey: ["/api/boq/items"] });
        onMapped();
      } else {
        toast({ title: "Component confirmed" });
        refetchComponents();
      }
      setSearchCompId(null);
      setSearchQ("");
      setSelectedSnlId(null);
    },
    onError: () => toast({ title: "Failed to confirm component", variant: "destructive" }),
  });

  const allMapped = components.length > 0 && components.every(c => c.status === "mapped");
  const mappedCount = components.filter(c => c.status === "mapped").length;

  return (
    <div className="border rounded-md border-purple-200 bg-purple-50/40" data-testid={`card-composite-item-${item.id}`}>
      {/* Header */}
      <button
        className="w-full flex items-start gap-2 p-2 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`toggle-composite-${item.id}`}
      >
        <Layers className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-slate-400 leading-tight">{item.itemCode ?? "—"} · boq#{item.id}</p>
          <p className="text-[12px] text-slate-700 leading-snug line-clamp-2 mt-0.5" title={item.description}>{item.description}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">
              COMPOSITE
            </span>
            {components.length > 0 && (
              <span className="text-[11px] text-slate-500">
                {mappedCount}/{components.length} components confirmed
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0 mt-1" />}
      </button>

      {/* Expanded component list */}
      {expanded && (
        <div className="border-t border-purple-100 px-2 pb-2 space-y-1.5 pt-1.5">
          {components.length === 0 && (
            <p className="text-[12px] text-slate-400 text-center py-2">Loading components…</p>
          )}
          {components.map((comp, idx) => {
            const conf = comp.confidenceScore ?? 0;
            const noConfirm = conf < 0.40 || !comp.snlItemId; // <40%: hide Confirm button
            const lowConf = conf < 0.50; // 40–49%: show Confirm with warning style
            const isMapped = comp.status === "mapped";
            return (
              <div
                key={comp.id}
                className={`rounded border p-1.5 ${isMapped ? "border-emerald-200 bg-emerald-50/60" : noConfirm ? "border-orange-200 bg-orange-50/40" : "border-amber-200 bg-amber-50/50"}`}
                data-testid={`card-composite-comp-${comp.id}`}
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 leading-none mt-0.5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-slate-600">
                      <span className="font-mono text-purple-700">{comp.componentTag}</span>
                      {comp.componentDescription && (
                        <span className="text-slate-400 font-normal ml-1">— {comp.componentDescription}</span>
                      )}
                    </p>
                    {comp.snlItemCode && !isMapped && (
                      <p className={`text-[11px] mt-0.5 ${lowConf ? "text-orange-700" : "text-amber-700"}`}>
                        SNL: <span className="font-mono">{comp.snlItemCode}</span>
                        <span className={`ml-1 px-1 py-0.5 rounded text-[10px] font-bold ${lowConf ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>
                          {(conf * 100).toFixed(0)}%
                        </span>
                        {comp.snlItemDescription && (
                          <span className="block text-[11px] text-slate-500 line-clamp-1 mt-0.5">{comp.snlItemDescription}</span>
                        )}
                      </p>
                    )}
                    {isMapped && comp.snlItemCode && (
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        <Check className="w-2.5 h-2.5 inline mr-0.5" />
                        SNL: <span className="font-mono">{comp.snlItemCode}</span>
                      </p>
                    )}
                  </div>
                </div>
                {!isMapped && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {comp.snlItemId && !noConfirm && (
                      <button
                        onClick={() => mapMutation.mutate({ compId: comp.id, snlItemId: comp.snlItemId! })}
                        disabled={mapMutation.isPending}
                        className={`flex-1 text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors disabled:opacity-50 ${lowConf ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100" : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
                        data-testid={`button-confirm-comp-${comp.id}`}
                      >
                        <Check className="w-2.5 h-2.5 inline mr-0.5" />
                        Confirm
                      </button>
                    )}
                    {noConfirm && !comp.snlItemId && (
                      <span className="flex-1 text-center text-[11px] text-orange-700 px-2 py-0.5 rounded border border-orange-200 bg-orange-50">
                        Search Required
                      </span>
                    )}
                    {noConfirm && comp.snlItemId && (
                      <span className="flex-1 text-center text-[11px] text-orange-700 px-2 py-0.5 rounded border border-orange-200 bg-orange-50">
                        Score too low — search manually
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setSearchCompId(comp.id);
                        setSearchQ(comp.componentDescription || comp.componentTag);
                        setSelectedSnlId(null);
                      }}
                      className="flex-1 text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                      data-testid={`button-search-comp-${comp.id}`}
                    >
                      <Search className="w-2.5 h-2.5 inline mr-0.5" />
                      Search
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Search dialog for a specific component */}
      {searchCompId != null && searchingComp && (
        <Dialog open onOpenChange={o => { if (!o) { setSearchCompId(null); setSearchQ(""); setSelectedSnlId(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                Find SNL for component: <span className="font-mono text-purple-700">{searchingComp.componentTag}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">{searchingComp.componentDescription}</p>
              <Input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search SNL items…"
                data-testid="input-comp-search-query"
              />
              {searching && <p className="text-[12px] text-muted-foreground">Searching…</p>}
              {!searching && searchResults.length === 0 && searchQ.length >= 2 && (
                <p className="text-[12px] text-muted-foreground">No results</p>
              )}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    className={`w-full text-left px-2 py-1.5 rounded border text-[12px] transition-colors ${selectedSnlId === r.id ? "border-teal-400 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}
                    onClick={() => setSelectedSnlId(r.id)}
                    data-testid={`option-comp-snl-${r.id}`}
                  >
                    <p className="font-semibold text-slate-700"><span className="font-mono text-teal-700">{r.itemCode}</span> — {r.shortLabel || r.description.slice(0, 50)}</p>
                    {r.description && r.shortLabel && (
                      <p className="text-slate-400 line-clamp-1 mt-0.5">{r.description}</p>
                    )}
                    <p className="text-[11px] text-slate-400">{r.sourceName} · {r.unit}</p>
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setSearchCompId(null); setSearchQ(""); setSelectedSnlId(null); }}>Cancel</Button>
              <Button
                disabled={!selectedSnlId || mapMutation.isPending}
                onClick={() => { if (selectedSnlId) mapMutation.mutate({ compId: searchCompId, snlItemId: selectedSnlId }); }}
                data-testid="button-apply-comp-snl"
              >
                {mapMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SnlMappingPanel({
  projectId,
  items,
  onMapped,
  onClose,
}: {
  projectId: number;
  items: BoqItemWithCategory[];
  onMapped: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const needsReview = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "needs_review");
  const unmapped    = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "unmapped");
  const mapped      = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "mapped");

  const [searchItem, setSearchItem] = useState<BoqItemWithCategory | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const remapMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/boq/projects/${projectId}/remap`, {}),
    onSuccess: () => {
      toast({ title: "Auto-mapping re-run — refreshing items…" });
      setTimeout(onMapped, 1500);
    },
    onError: () => toast({ title: "Remap failed", variant: "destructive" }),
  });

  const autoMapAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/snl/auto-map-all`, {});
      return res.json() as Promise<{ autoMapped: number; needsReview: number; unmapped: number }>;
    },
    onSuccess: (d) => {
      toast({ title: `Auto-mapped ${d.autoMapped} items. ${d.needsReview} need review. ${d.unmapped} unmapped.` });
      onMapped();
    },
    onError: () => toast({ title: "Auto-map failed", variant: "destructive" }),
  });

  const confirmReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/snl/confirm-review`, {});
      return res.json() as Promise<{ confirmed: number; skipped: number }>;
    },
    onSuccess: (d) => {
      toast({ title: `Confirmed ${d.confirmed} suggestion${d.confirmed === 1 ? "" : "s"}.${d.skipped > 0 ? ` ${d.skipped} skipped (low confidence).` : ""}` });
      onMapped();
    },
    onError: () => toast({ title: "Confirm review failed", variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: ({ boqItemId, snlItemId, workCategory }: { boqItemId: number; snlItemId: number; workCategory: string }) =>
      apiRequest("POST", `/api/snl/mappings/${boqItemId}/apply`, {
        snlItemId,
        projectCategory: "MEDIUM",
        gradingVariant: null,
      }),
    onSuccess: async () => {
      toast({ title: "SNL mapping applied" });
      setSearchItem(null);
      setSearchQ("");
      onMapped();
    },
    onError: () => toast({ title: "Failed to apply mapping", variant: "destructive" }),
  });

  const { data: searchResults = [], isFetching: searching } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/search", searchQ, searchItem?.workCategory, searchItem?.description],
    queryFn: async () => {
      if (!searchQ.trim() && !searchItem) return [];
      const params = new URLSearchParams({ q: searchQ });
      if (searchItem?.workCategory) params.set("category", searchItem.workCategory);
      if (searchItem?.description) params.set("boqDesc", searchItem.description);
      const res = await fetch(`/api/snl/search?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: !!searchItem,
  });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col h-full" data-testid="panel-snl-mapping">
      {/* Floating panel header */}
      <div className="bg-teal-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Link2 className="w-3.5 h-3.5 text-teal-300" />
          <span className="text-sm font-semibold text-white">SNL Mapping</span>
          <span className={`text-[12px] px-1.5 py-0.5 rounded font-semibold ${
            mapped.length === items.length
              ? "bg-emerald-700 text-emerald-100"
              : "bg-amber-600 text-amber-100"
          }`}>
            {mapped.length}/{items.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => autoMapAllMutation.mutate()}
            disabled={autoMapAllMutation.isPending || mapped.length === items.length}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50"
            title="Auto-map all remaining unmapped items"
            data-testid="button-auto-map-all"
          >
            {autoMapAllMutation.isPending
              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
              : <Zap className="w-2.5 h-2.5" />}
            Auto-map
          </button>
          <button
            onClick={() => remapMutation.mutate()}
            className="p-1 rounded hover:bg-teal-600 text-teal-300 hover:text-white transition-colors"
            title="Re-run full auto-mapping (resets all auto mappings)"
            disabled={remapMutation.isPending}
            data-testid="button-remap"
          >
            <RefreshCw className={`w-3 h-3 ${remapMutation.isPending ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-teal-600 text-teal-300 hover:text-white transition-colors"
            title="Close panel"
            data-testid="button-close-snl-panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Mapped", count: mapped.length, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
              { label: "Review", count: needsReview.length, cls: "text-amber-700 bg-amber-50 border-amber-200" },
              { label: "Unmapped", count: unmapped.length, cls: "text-slate-600 bg-slate-50 border-slate-200" },
            ].map(s => (
              <div key={s.label} className={`rounded border px-2 py-1.5 ${s.cls}`}>
                <div className="text-base font-bold">{s.count}</div>
                <div className="text-[12px]">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Needs Review items */}
          {needsReview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Needs Review
                </p>
                <button
                  onClick={() => confirmReviewMutation.mutate()}
                  disabled={confirmReviewMutation.isPending}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  data-testid="button-confirm-all-review"
                >
                  {confirmReviewMutation.isPending
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : <CheckCheck className="w-2.5 h-2.5" />}
                  Confirm All
                </button>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {needsReview.map(item => {
                  // Composite items get their own expandable sub-card per detected layer
                  if (item.isComposite) {
                    return (
                      <CompositeReviewCard
                        key={item.id}
                        item={item}
                        projectId={projectId}
                        onMapped={onMapped}
                      />
                    );
                  }
                  // Standard single-SNL review card
                  const conf = item.snlConfidence ?? 0;
                  const noConfirm = conf < 0.40; // <40%: hide Confirm button entirely
                  const lowConf = conf < 0.50;   // 40–49%: show Confirm with warning style
                  return (
                  <div key={item.id} className={`border rounded-md p-2 ${noConfirm ? "border-orange-200 bg-orange-50/40" : "border-amber-200 bg-amber-50/50"}`}
                    data-testid={`card-review-item-${item.id}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {/* BOQ identity — show itemCode + full description so the exact row is clear */}
                        <p className="text-[11px] font-mono text-slate-400 leading-tight">{item.itemCode ?? "—"} · boq#{item.id}</p>
                        <p className="text-[12px] text-slate-700 leading-snug line-clamp-2 mt-0.5" title={item.description}>{item.description}</p>
                        {item.snlItemCode && (
                          <div className="mt-1">
                            <p className={`text-[11px] font-semibold ${lowConf ? "text-orange-700" : "text-amber-700"}`}>
                              SNL: <span className="font-mono">{item.snlItemCode}</span>
                              <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold ${lowConf ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>
                                {(conf * 100).toFixed(0)}%{lowConf ? " — low" : ""}
                              </span>
                            </p>
                            {item.snlItemDescription && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5" title={item.snlItemDescription}>
                                {item.snlItemDescription}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      {item.snlItemId && !noConfirm && (
                        <button
                          onClick={() => applyMutation.mutate({
                            boqItemId: item.id,
                            snlItemId: item.snlItemId!,
                            workCategory: item.workCategory ?? "MEDIUM",
                          })}
                          disabled={applyMutation.isPending}
                          className={`flex-1 text-[12px] font-semibold px-2 py-1 rounded border transition-colors ${lowConf ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100" : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
                          data-testid={`button-confirm-mapping-${item.id}`}
                        >
                          <Check className="w-2.5 h-2.5 inline mr-0.5" />
                          Confirm
                        </button>
                      )}
                      {noConfirm && (
                        <span className="flex-1 text-center text-[11px] text-orange-700 font-semibold px-2 py-1 rounded border border-orange-200 bg-orange-50">
                          Score too low — search manually
                        </span>
                      )}
                      <button
                        onClick={() => { setSearchItem(item); setSearchQ(item.description.slice(0, 30)); }}
                        className="flex-1 text-[12px] px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                        data-testid={`button-search-mapping-${item.id}`}
                      >
                        <Search className="w-2.5 h-2.5 inline mr-0.5" />
                        Search
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unmapped items */}
          {unmapped.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Unmapped ({unmapped.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {unmapped.map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
                    data-testid={`row-unmapped-${item.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-mono text-muted-foreground">{item.itemCode ?? "—"}</p>
                      <p className="text-sm text-slate-600 line-clamp-1" title={item.description}>{(item as any).itemName || item.description.slice(0, 40)}</p>
                    </div>
                    <button
                      onClick={() => { setSearchItem(item); setSearchQ(item.description.slice(0, 30)); }}
                      className="text-[12px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 flex-shrink-0 transition-colors"
                      data-testid={`button-map-unmapped-${item.id}`}
                    >
                      Map
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mapped.length === items.length && items.length > 0 && (
            <div className="text-center py-3 space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm text-emerald-700 font-semibold">All items mapped!</p>
            </div>
          )}
        </div>

      {/* Search modal */}
      {searchItem && (
        <Dialog open onOpenChange={o => { if (!o) { setSearchItem(null); setSearchQ(""); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4 text-teal-600" />
                Find SNL Item
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-md px-3 py-2 text-sm">
                <span className="text-muted-foreground">BOQ: </span>
                <span className="font-mono">{searchItem.itemCode ?? "—"}</span>
                <span className="mx-1 text-muted-foreground">—</span>
                <span className="text-slate-700 line-clamp-1">{searchItem.description}</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search SNL by code or description…"
                  className="pl-8 text-sm"
                  data-testid="input-snl-search"
                />
              </div>
              {searching && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</div>}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {searchResults.map(result => (
                  <div key={result.id} className={`flex items-start gap-2 p-2 rounded-md border transition-colors hover:bg-slate-50 ${result.categoryMatchStatus === "mismatch" ? "border-yellow-200 bg-yellow-50/40" : result.categoryMatchStatus === "secondary" ? "border-orange-100 bg-orange-50/20" : "border-transparent hover:border-slate-200"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-mono text-teal-700 font-semibold">{result.itemCode}</span>
                        <span className="text-[12px] text-muted-foreground">{result.unit}</span>
                        <span className="text-[12px] text-slate-400">· {result.sourceCode ?? result.sourceName}</span>
                        {result.sector && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{result.sector}</span>
                        )}
                        {result.categoryMatchStatus === "mismatch" && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">⚠ Sector mismatch</span>
                        )}
                        {result.categoryMatchStatus === "secondary" && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700">Cross-sector</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2">{result.description}</p>
                    </div>
                    <button
                      onClick={() => applyMutation.mutate({
                        boqItemId: searchItem.id,
                        snlItemId: result.id,
                        workCategory: searchItem.workCategory ?? "MEDIUM",
                      })}
                      disabled={applyMutation.isPending}
                      className="flex-shrink-0 text-[12px] px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold transition-colors"
                      data-testid={`button-apply-snl-${result.id}`}
                    >
                      {applyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                    </button>
                  </div>
                ))}
                {!searching && searchResults.length === 0 && searchQ.trim() && (
                  <p className="text-sm text-muted-foreground text-center py-4">No SNL items found. Try a different search term.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setSearchItem(null); setSearchQ(""); }}
                data-testid="button-close-snl-search">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Revision Panel ────────────────────────────────────────────────────────────

function RevisionPanel({
  projectId,
  revisions,
  items,
  onActivated,
}: {
  projectId: number;
  revisions: BoqRevisionWithItems[];
  items: BoqItemWithCategory[];
  onActivated: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmActivate, setConfirmActivate] = useState<BoqRevisionWithItems | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoqRevisionWithItems | null>(null);

  const toggleExpand = (id: number) =>
    setExpandedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const activateMutation = useMutation({
    mutationFn: ({ id, approvedBy }: { id: number; approvedBy: string }) =>
      apiRequest("PATCH", `/api/boq/revisions/${id}/activate`, { approvedBy }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "revisions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects"] });
      toast({ title: "Revision activated — quantities updated" });
      setConfirmActivate(null);
      onActivated();
    },
    onError: () => toast({ title: "Failed to activate revision", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/boq/revisions/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "revisions"] });
      toast({ title: "Revision deleted" });
      setConfirmDelete(null);
    },
    onError: () => toast({ title: "Failed to delete revision", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <GitBranch className="w-4 h-4 text-purple-600" />
          Revisions
        </h2>
        <Button size="sm" variant="outline"
          className="h-7 text-sm border-purple-200 text-purple-700 hover:bg-purple-50"
          onClick={() => setShowNew(true)}
          data-testid="button-new-revision">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Revision
        </Button>
      </div>

      {revisions.length === 0 ? (
        <div className="text-center py-8 space-y-2 text-muted-foreground text-sm">
          <GitBranch className="w-8 h-8 text-slate-200 mx-auto" />
          <p>No revisions yet</p>
          <p className="text-xs">Create a revision to adjust BOQ quantities</p>
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map(rev => {
            const st = REV_STATUS[rev.status] ?? REV_STATUS.draft;
            const expanded = expandedIds.has(rev.id);
            return (
              <Card key={rev.id} className="border-slate-200 overflow-hidden"
                data-testid={`card-revision-${rev.id}`}>
                <div
                  className="px-3 py-2.5 flex items-start gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(rev.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-muted-foreground">Rev {rev.revisionNo}</span>
                      <Badge variant="outline" className={`text-[12px] px-1.5 py-0 ${st.cls}`}>
                        {st.label}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{rev.label}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {rev.createdBy ? `${rev.createdBy} · ` : ""}
                      {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString("en-IN") : ""}
                      {rev.approvedBy ? ` · Approved by ${rev.approvedBy}` : ""}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{rev.items.length} item(s) revised</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    {rev.status === "draft" && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmActivate(rev); }}
                          className="px-2 py-0.5 text-[12px] font-semibold rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
                          data-testid={`button-activate-${rev.id}`}
                        >
                          Activate
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDelete(rev); }}
                          className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          data-testid={`button-delete-revision-${rev.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {expanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </div>

                {/* Expanded items */}
                {expanded && rev.items.length > 0 && (
                  <div className="border-t border-slate-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Item</th>
                          <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground w-20">Rev Qty</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rev.items.map(ri => (
                          <tr key={ri.id} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-700 max-w-[150px] truncate">{ri.description}</td>
                            <td className="px-3 py-1 text-right font-semibold text-purple-700">{fmt(ri.revisedQty)} {ri.unit}</td>
                            <td className="px-3 py-1 text-slate-500 text-[12px] max-w-[120px] truncate">{ri.changeReason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {expanded && rev.notes && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    <p className="text-[12px] text-muted-foreground italic">{rev.notes}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New revision dialog */}
      {showNew && (
        <NewRevisionDialog
          projectId={projectId}
          items={items}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Activate confirm dialog */}
      {confirmActivate && (
        <Dialog open onOpenChange={o => { if (!o) setConfirmActivate(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Activate Revision?</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm text-slate-600">
              <p>This will activate <strong>{confirmActivate.label}</strong> and update current quantities for {confirmActivate.items.length} item(s).</p>
              <p className="text-sm text-muted-foreground">Any previously active revision will be marked Superseded.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmActivate(null)}
                data-testid="button-activate-cancel">Cancel</Button>
              <Button
                onClick={() => activateMutation.mutate({
                  id: confirmActivate.id,
                  approvedBy: user?.fullName || user?.email || "Unknown",
                })}
                disabled={activateMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-activate-confirm"
              >
                {activateMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><Check className="w-4 h-4 mr-1" /> Activate</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <Dialog open onOpenChange={o => { if (!o) setConfirmDelete(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Revision?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              This will permanently delete <strong>{confirmDelete.label}</strong> (Rev {confirmDelete.revisionNo}). This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}
                data-testid="button-delete-cancel">Cancel</Button>
              <Button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-delete-confirm"
              >
                {deleteMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><Trash2 className="w-4 h-4 mr-1" /> Delete</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Project Settings Dialog ─────────────────────────────────────────────────

function ProjectSettingsDialog({
  project,
  onClose,
}: {
  project: BoqProject;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [workingDays, setWorkingDays] = useState(project.workingDaysPerMonth != null ? String(project.workingDaysPerMonth) : "26");
  const [workingHrs, setWorkingHrs] = useState(project.workingHoursPerDay != null ? String(project.workingHoursPerDay) : "8");
  const [hmp, setHmp] = useState(project.hmpChainageKm != null ? String(project.hmpChainageKm) : "");
  const [wmm, setWmm] = useState(project.wmmPlantChainageKm != null ? String(project.wmmPlantChainageKm) : "");
  const [quarry, setQuarry] = useState(project.quarryChainageKm != null ? String(project.quarryChainageKm) : "");
  const [speed, setSpeed] = useState(project.avgTipperSpeedKmHr != null ? String(project.avgTipperSpeedKmHr) : "30");

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/boq/projects/${project.id}`, {
        workingDaysPerMonth: parseInt(workingDays) || 26,
        workingHoursPerDay: parseInt(workingHrs) || 8,
        hmpChainageKm: hmp ? parseFloat(hmp) : null,
        wmmPlantChainageKm: wmm ? parseFloat(wmm) : null,
        quarryChainageKm: quarry ? parseFloat(quarry) : null,
        avgTipperSpeedKmHr: speed ? parseFloat(speed) : 30,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", project.id] });
      toast({ title: "Project settings saved" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-teal-600" />
            Planning Settings
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Schedule defaults and source chainages for Work Programme calculations.
        </p>
        <div className="space-y-3 pt-1">
          {/* Schedule defaults */}
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Schedule Defaults</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">WORKING DAYS / MONTH</Label>
              <Input
                type="number" step="1" min="1" max="31"
                className="h-8 text-sm mt-0.5"
                placeholder="26"
                value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
                data-testid="input-working-days"
              />
            </div>
            <div>
              <Label className="text-[12px]">WORKING HOURS / DAY</Label>
              <Input
                type="number" step="0.5" min="1" max="24"
                className="h-8 text-sm mt-0.5"
                placeholder="8"
                value={workingHrs}
                onChange={(e) => setWorkingHrs(e.target.value)}
                data-testid="input-working-hours"
              />
            </div>
          </div>
          {/* Source chainages */}
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Source Chainages</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">HMP CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-sm mt-0.5"
                placeholder="e.g. 8.5"
                value={hmp}
                onChange={(e) => setHmp(e.target.value)}
                data-testid="input-hmp-chainage"
              />
            </div>
            <div>
              <Label className="text-[12px]">WMM PLANT CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-sm mt-0.5"
                placeholder="e.g. 5.0"
                value={wmm}
                onChange={(e) => setWmm(e.target.value)}
                data-testid="input-wmm-chainage"
              />
            </div>
            <div>
              <Label className="text-[12px]">QUARRY CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-sm mt-0.5"
                placeholder="e.g. 12.0"
                value={quarry}
                onChange={(e) => setQuarry(e.target.value)}
                data-testid="input-quarry-chainage"
              />
            </div>
            <div>
              <Label className="text-[12px]">AVG TIPPER SPEED (km/hr)</Label>
              <Input
                type="number" step="1" min="1"
                className="h-8 text-sm mt-0.5"
                placeholder="30"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                data-testid="input-tipper-speed"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-sm">Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white text-sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-project-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BoqProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const projectId = parseInt(params.id);
  const [showImport, setShowImport] = useState(false);
  const [recipeItem, setRecipeItem] = useState<BoqItemWithCategory | null>(null);
  const [snlFloatingOpen, setSnlFloatingOpen] = useState(false);
  const [dismissedExclusionBanner, setDismissedExclusionBanner] = useState(false);

  // ── Data fetching ──
  const { data: project, isLoading: projLoading } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery<BoqItemWithCategory[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: revisions = [], isLoading: revsLoading } = useQuery<BoqRevisionWithItems[]>({
    queryKey: ["/api/boq/projects", projectId, "revisions"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/revisions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: programmeStatus = [] } = useQuery<Array<{ boqItemId: number; status: string; relevantBarId?: number | null }>>({
    queryKey: ["/api/boq/projects", projectId, "programme-status"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/programme-status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load programme status");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });
  const programmeStatusMap = useMemo(
    () => Object.fromEntries(programmeStatus.map(s => [s.boqItemId, s])),
    [programmeStatus],
  );

  // Deep-link: open the Layer Config dialog for ?recipeItem=<id> (from BOM "Configure" buttons)
  useEffect(() => {
    if (!items.length) return;
    const rid = new URLSearchParams(window.location.search).get("recipeItem");
    if (!rid) return;
    const target = items.find(it => String(it.id) === rid);
    if (target) {
      setRecipeItem(target);
      navigate(`/work-program/${projectId}`, { replace: true });
    }
  }, [items]);

  const zeroQtyItems = items.filter(i => (i.boqQty ?? 0) <= 0);
  const cleanupZeroQtyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/boq/projects/${projectId}/cleanup-zero-qty`, {});
      return res.json();
    },
    onSuccess: async (data: { deleted: number }) => {
      await refetchItems();
      toast({ title: "Cleanup done", description: `Removed ${data.deleted} zero-quantity item${data.deleted === 1 ? "" : "s"}.` });
    },
    onError: () => toast({ title: "Cleanup failed", variant: "destructive" }),
  });

  const remapMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/boq/projects/${projectId}/remap`, {}),
    onSuccess: async () => {
      toast({ title: "Re-mapping BOQ → SNL…", description: "Auto-matching items against the Standard Norms Library." });
      await new Promise((r) => setTimeout(r, 1200));
      await refetchItems();
      toast({ title: "Re-map complete ✓" });
    },
    onError: () => toast({ title: "Re-map failed", variant: "destructive" }),
  });

  // ── Derived values ──
  // Group strictly by the BOQ's OWN bill structure as imported from Excel,
  // keeping the raw Bill/Schedule number separate from its section title.
  // Only falls back to the standardized work category / "Uncategorized" when an item
  // genuinely has no bill assigned.
  const billSections = useMemo(() => {
    const map = new Map<string, { name: string; order: number; items: BoqItemWithCategory[] }>();
    for (const item of items) {
      const sectionTitle = item.categoryName?.trim() || "";
      const sourceBillNo = item.categorySourceBillNo?.trim() || "";
      const name =
        ([sourceBillNo, sectionTitle].filter(Boolean).join(" · ")) ||
        getWorkCategoryLabel(item.workCategory) ||
        "Uncategorized";
      const so = item.categorySortOrder ?? item.sortOrder ?? Number.MAX_SAFE_INTEGER;
      let bucket = map.get(name);
      if (!bucket) { bucket = { name, order: so, items: [] }; map.set(name, bucket); }
      bucket.items.push(item);
      if (so < bucket.order) bucket.order = so;
    }
    const sections = [...map.values()];
    // Bills appear in their original Excel order (by first row's sortOrder).
    sections.sort((a, b) => a.order - b.order);
    // Within a bill keep the file order, then fall back to item-code order.
    for (const s of sections) {
      s.items.sort((a, b) => {
        const ao = a.excelRow ?? a.sortOrder ?? 0, bo = b.excelRow ?? b.sortOrder ?? 0;
        if (ao !== bo) return ao - bo;
        return compareItemCode(a.itemCode, b.itemCode);
      });
    }
    return sections;
  }, [items]);

  const totalAmount = items.reduce((s, i) => s + (i.clientAmount ?? 0), 0);
  const activeRevision = revisions.find(r => r.status === "active");

  const isLoading = projLoading || itemsLoading || revsLoading;

  function handleImportSuccess(result: { created: number; categories: string[] }) {
    setShowImport(false);
    void refetchItems();
    toast({
      title: `BOQ Imported — ${result.created} items added`,
      description: result.categories.length > 0
        ? `Categories: ${result.categories.join(", ")}`
        : "No categories detected.",
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20 space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto" />
        <p className="text-slate-600">Project not found.</p>
        <Button variant="outline" onClick={() => navigate("/work-program")}
          data-testid="button-back-notfound">
          ← Back to Projects
        </Button>
      </div>
    );
  }

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
        <span className="text-slate-700 font-medium truncate max-w-[200px]">{project.name}</span>
      </nav>

      {/* Project header */}
      <ProjectHeader project={project} activeRevision={activeRevision}>
          <Link href={`/work-program/${projectId}/settings`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-600 hover:bg-slate-50 h-8"
                data-testid="button-project-settings"
                title="Program settings (schedule, tipper fleet, source chainages, productivity mode)"
              >
                <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                Settings
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/scope`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8"
                data-testid="button-project-scope"
                title="Project scope — corridor, working reaches, exclusions & withdrawals"
              >
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                Scope
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/geometry`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 h-8"
                data-testid="button-road-geometry"
                title="Road geometry & quantities — typical section, layer thicknesses, geometry vs BOQ preview"
              >
                <Ruler className="w-3.5 h-3.5 mr-1.5" />
                Geometry
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/programme`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-teal-200 text-teal-700 hover:bg-teal-50 h-8"
                data-testid="button-work-programme"
              >
                <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                Work Programme
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/demand`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-purple-200 text-purple-700 hover:bg-purple-50 h-8"
                data-testid="button-bom-demand"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                BOM &amp; Demand
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/resource-review`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-200 text-blue-700 hover:bg-blue-50 h-8"
                data-testid="button-resource-review"
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" />
                Resource Review
              </Button>
            </a>
          </Link>
          <Link href={`/work-program/${projectId}/item-review`}>
            <a>
              <Button
                variant="outline"
                size="sm"
                className="border-teal-200 text-teal-700 hover:bg-teal-50 h-8"
                data-testid="button-item-review"
              >
                <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                Item Review
              </Button>
            </a>
          </Link>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-teal-300 text-teal-700 hover:bg-teal-50 h-8"
              onClick={() => remapMutation.mutate()}
              disabled={remapMutation.isPending}
              data-testid="button-remap-all-header"
              title="Re-run BOQ → SNL auto-mapping for all items"
            >
              {remapMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Re-map All
            </Button>
          )}
          {zeroQtyItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50 h-8"
              onClick={() => {
                if (window.confirm(`Delete ${zeroQtyItems.length} zero-quantity item(s) from this BOQ? This cannot be undone.`)) {
                  cleanupZeroQtyMutation.mutate();
                }
              }}
              disabled={cleanupZeroQtyMutation.isPending}
              data-testid="button-cleanup-zero-qty"
              title="Remove all items with zero quantity from this project"
            >
              {cleanupZeroQtyMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Remove zero-qty ({zeroQtyItems.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-blue-200 text-blue-700 hover:bg-blue-50 h-8"
            onClick={() => setShowImport(true)}
            data-testid="button-import-boq-header"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import BOQ
          </Button>
      </ProjectHeader>

      {/* Exclusion warning banner */}
      {!dismissedExclusionBanner && (() => {
        const excludedCount = items.filter(it => it.includedInPlanning === false).length;
        if (!excludedCount) return null;
        return (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200" data-testid="banner-excluded-items">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 flex-1">
              <span className="font-semibold">{excludedCount} item{excludedCount > 1 ? "s" : ""} excluded from the work programme.</span>{" "}
              Any existing Gantt bars for these items are retained in the database and will reappear if you re-include them. Use the ✓/− toggles on each item row to change inclusion.
            </p>
            <button
              onClick={() => setDismissedExclusionBanner(true)}
              className="text-amber-500 hover:text-amber-700 flex-shrink-0"
              aria-label="Dismiss"
              data-testid="button-dismiss-exclusion-banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* Summary stats */}
      {(() => {
        const mappedCount    = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "mapped").length;
        const reviewCount    = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "needs_review").length;
        const unmappedCount  = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "unmapped").length;
        const snlFullyMapped = items.length > 0 && mappedCount === items.length;
        const snlNeedsAction = items.length > 0 && (reviewCount > 0 || unmappedCount > 0);

        const autoConfItems = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "mapped" && i.snlConfidence != null);
        const avgConfidence = autoConfItems.length > 0
          ? Math.round((autoConfItems.reduce((s, i) => s + (i.snlConfidence ?? 0), 0) / autoConfItems.length) * 100)
          : null;

        const tiles: { label: string; value: string; extra?: string; extraCls?: string; onClick?: () => void; highlight?: boolean; confidence?: number }[] = [
          { label: "BOQ Items", value: String(items.length) },
          { label: "Bills / Categories", value: String(billSections.length) },
          { label: "Revisions", value: String(revisions.length) },
          {
            label: "SNL Mapped",
            value: items.length > 0 ? `${mappedCount} / ${items.length}` : "—",
            extra: reviewCount > 0
              ? `${reviewCount} need review`
              : unmappedCount > 0
                ? `${unmappedCount} unmapped`
                : snlFullyMapped ? "All mapped ✓" : undefined,
            extraCls: snlNeedsAction ? "text-amber-600" : "text-emerald-600",
            highlight: snlNeedsAction,
            onClick: items.length > 0 ? () => setSnlFloatingOpen(true) : undefined,
            confidence: avgConfidence ?? undefined,
          },
          { label: "Total BOQ Value", value: totalAmount > 0 ? `₹${(totalAmount / 1e7).toFixed(2)} Cr` : "—" },
        ];

        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tiles.map(({ label, value, extra, extraCls, onClick, highlight, confidence }) => (
              <Card
                key={label}
                className={`border-slate-200 transition-colors ${onClick ? "cursor-pointer hover:border-teal-400 hover:shadow-sm" : ""} ${highlight ? "border-amber-300 bg-amber-50/40" : ""}`}
                onClick={onClick}
                data-testid={label === "SNL Mapped" ? "tile-snl-mapped" : undefined}
              >
                <CardContent className="py-3 px-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${highlight ? "text-amber-700" : "text-slate-800"}`}>{value}</p>
                  {extra && <p className={`text-[12px] mt-0.5 ${extraCls ?? ""}`}>{extra}</p>}
                  {confidence != null && (
                    <Badge variant="outline" className="mt-1 text-[10px] bg-teal-50 border-teal-200 text-teal-700 inline-flex items-center gap-1 px-1.5 py-0">
                      <Sparkles className="w-2.5 h-2.5" /> {confidence}% avg confidence
                    </Badge>
                  )}
                  {onClick && (
                    <p className="text-[11px] text-teal-600 mt-0.5 opacity-70">
                      {highlight ? "Click to review →" : "Click to view →"}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Main two-column layout */}
      {items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileSpreadsheet className="w-14 h-14 text-slate-200 mx-auto" />
          <p className="font-semibold text-slate-600">No BOQ items yet</p>
          <p className="text-sm text-muted-foreground">Import an Excel BOQ to get started</p>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setShowImport(true)} data-testid="button-import-boq-empty">
            <Upload className="w-4 h-4 mr-1.5" /> Import BOQ from Excel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* ── Left: Items table ── */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">
                BOQ Items
                {!activeRevision
                  ? <span className="ml-2 text-sm font-normal text-muted-foreground">(Original BOQ)</span>
                  : <span className="ml-2 text-sm font-normal text-purple-600">({activeRevision.label})</span>
                }
              </h2>
              <p className="text-sm text-muted-foreground">
                <span className="text-amber-600 font-semibold">Amber rows</span> = revised qty
              </p>
            </div>

            {billSections.map(sec => (
              <CategorySection
                key={sec.name}
                name={sec.name}
                items={sec.items}
                projectId={projectId}
                defaultCollapsed={false}
                onOpenRecipe={setRecipeItem}
                programmeStatus={programmeStatusMap}
              />
            ))}

            {/* Grand total */}
            {totalAmount > 0 && (
              <div className="flex justify-end mt-2">
                <div className="bg-slate-800 rounded-lg px-5 py-2.5 text-white text-sm flex items-center gap-4">
                  <span className="text-slate-400 text-sm">Total Contract Value</span>
                  <span className="font-bold">₹{fmtAmt(totalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Revision panel only (SNL is now a floating overlay) ── */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0">
            <RevisionPanel
              projectId={projectId}
              revisions={revisions}
              items={items}
              onActivated={() => void refetchItems()}
            />
          </div>
        </div>
      )}

      {/* ── Floating SNL Mapping panel ── */}
      {snlFloatingOpen && items.length > 0 && (
        <div
          className="fixed right-5 top-20 z-50 w-80 xl:w-96 rounded-xl shadow-2xl border border-slate-200 bg-white dark:bg-gray-950 overflow-hidden flex flex-col"
          style={{ maxHeight: "calc(100vh - 6rem)" }}
          data-testid="floating-snl-panel"
        >
          <SnlMappingPanel
            projectId={projectId}
            items={items}
            onMapped={() => { void refetchItems(); }}
            onClose={() => setSnlFloatingOpen(false)}
          />
        </div>
      )}

      {/* Import Wizard */}
      {showImport && (
        <BoqImportWizard
          projectId={projectId}
          projectName={project.name}
          existingItemCount={items.length}
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* Item Recipe Dialog — lifted here so it has access to all items for navigation */}
      {recipeItem && (
        <BoqItemRecipeDialog
          item={recipeItem}
          allItems={items}
          onClose={() => setRecipeItem(null)}
        />
      )}

      {/* Planning Settings are now at /work-program/:id/settings (BoqProgramSettings page) */}
    </div>
  );
}
