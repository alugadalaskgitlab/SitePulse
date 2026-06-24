import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import {
  ChevronRight, Upload, Pencil, ChevronDown, ChevronUp,
  Plus, Check, Trash2, Loader2, FileSpreadsheet, AlertCircle,
  GitBranch, CalendarDays, Package, Settings2, BookOpen,
  Link2, Link2Off, Clock, RefreshCw, Search, CheckCircle2, X,
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

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtAmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─── Inline Item Edit Dialog ──────────────────────────────────────────────────

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
    unit: item.unit,
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
}: {
  name: string;
  items: BoqItemWithCategory[];
  projectId: number;
  defaultCollapsed?: boolean;
  onOpenRecipe: (item: BoqItemWithCategory) => void;
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

  const subtotal = items.reduce((s, i) => s + (i.clientAmount ?? 0), 0);
  const boqSubtotal = items.reduce((s, i) => s + (i.clientRate ?? 0) * i.boqQty, 0);

  return (
    <Card className="border-slate-200 overflow-hidden" data-testid={`section-category-${name}`}>
      {/* Category header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 flex items-center justify-between text-left"
        data-testid={`button-toggle-category-${name}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">{name}</span>
          <span className="text-sm text-slate-400">{items.length} items</span>
        </div>
        <div className="flex items-center gap-3">
          {boqSubtotal > 0 && (
            <span className="text-sm text-slate-300 hidden sm:block">
              ₹{fmtAmt(boqSubtotal)}
            </span>
          )}
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Items table */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-16">Code</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-12">Unit</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">BOQ Qty</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Curr Qty</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-22">Rate (₹)</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">Amount (₹)</th>
                <th className="px-2 py-2 w-7" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const revised = Math.abs((item.currentQty ?? 0) - (item.boqQty ?? 0)) > 0.001;
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      revised ? "bg-amber-50" : i % 2 === 1 ? "bg-slate-50/40" : ""
                    }`}
                    data-testid={`row-item-${item.id}`}
                  >
                    <td className="px-3 py-1.5 font-mono text-slate-500 whitespace-nowrap">
                      {item.itemCode ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700 max-w-[200px]" title={item.description}>
                      <span className="line-clamp-2">{(item as any).itemName || item.description.slice(0, 40)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{item.unit}</td>
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
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-14">Code</th>
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
                          <td className="px-3 py-1.5 text-slate-700 max-w-[180px]" title={item.description}>
                            <span className="line-clamp-2">{(item as any).itemName || item.description.slice(0, 40)}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{item.unit}</td>
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
  sourceName: string;
  sourceCode: string;
};

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
    queryKey: ["/api/snl/search", searchQ, searchItem?.workCategory],
    queryFn: async () => {
      if (!searchQ.trim() && !searchItem) return [];
      const params = new URLSearchParams({ q: searchQ });
      if (searchItem?.workCategory) params.set("category", searchItem.workCategory);
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
            onClick={() => remapMutation.mutate()}
            className="p-1 rounded hover:bg-teal-600 text-teal-300 hover:text-white transition-colors"
            title="Re-run auto-mapping for all items"
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
              <p className="text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Needs Review
              </p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {needsReview.map(item => (
                  <div key={item.id} className="border border-amber-200 rounded-md bg-amber-50/50 p-2"
                    data-testid={`card-review-item-${item.id}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-mono text-slate-500">{item.itemCode ?? "—"}</p>
                        <p className="text-sm text-slate-700 line-clamp-2" title={item.description}>{(item as any).itemName || item.description.slice(0, 40)}</p>
                        {item.snlItemCode && (
                          <p className="text-[12px] text-amber-700 mt-0.5">
                            Suggestion: <span className="font-mono font-semibold">{item.snlItemCode}</span>
                            {item.snlConfidence != null && (
                              <span className="ml-1 text-muted-foreground">({(item.snlConfidence * 100).toFixed(0)}%)</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      {item.snlItemId && (
                        <button
                          onClick={() => applyMutation.mutate({
                            boqItemId: item.id,
                            snlItemId: item.snlItemId!,
                            workCategory: item.workCategory ?? "MEDIUM",
                          })}
                          disabled={applyMutation.isPending}
                          className="flex-1 text-[12px] font-semibold px-2 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                          data-testid={`button-confirm-mapping-${item.id}`}
                        >
                          <Check className="w-2.5 h-2.5 inline mr-0.5" />
                          Confirm
                        </button>
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
                ))}
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
                  <div key={result.id} className="flex items-start gap-2 p-2 rounded-md border border-transparent hover:bg-slate-50 hover:border-slate-200 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-mono text-teal-700 font-semibold">{result.itemCode}</span>
                        <span className="text-[12px] text-muted-foreground">{result.unit}</span>
                        <span className="text-[12px] text-slate-400">· {result.sourceCode ?? result.sourceName}</span>
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

  // ── Derived values ──
  const groupedByWorkCat = useMemo(() => {
    const map: Record<string, BoqItemWithCategory[]> = {};
    for (const item of items) {
      const key = item.workCategory ?? "__uncategorised__";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  // Standard categories that have items — plus always show all 15 in fixed order
  const workCatSections = useMemo(() => {
    return BOQ_WORK_CATEGORIES.map(cat => ({
      code: cat.code,
      label: cat.label,
      items: groupedByWorkCat[cat.code] ?? [],
    }));
  }, [groupedByWorkCat]);

  const hasUncategorised = !!groupedByWorkCat["__uncategorised__"]?.length;

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
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 truncate">{project.name}</h1>
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
          <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
            {project.contractNo && <span>Contract: {project.contractNo}</span>}
            {project.client && <span>· {project.client}</span>}
            {project.contractor && <span>· {project.contractor}</span>}
            {project.roadLengthKm != null && <span>· {project.roadLengthKm} km</span>}
            {project.startDate && <span>· Start: {project.startDate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>
      </div>

      {/* Summary stats */}
      {(() => {
        const mappedCount    = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "mapped").length;
        const reviewCount    = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "needs_review").length;
        const unmappedCount  = items.filter(i => (i.snlMappingStatus ?? i.mappingStatus) === "unmapped").length;
        const snlFullyMapped = items.length > 0 && mappedCount === items.length;
        const snlNeedsAction = items.length > 0 && (reviewCount > 0 || unmappedCount > 0);

        const tiles: { label: string; value: string; extra?: string; extraCls?: string; onClick?: () => void; highlight?: boolean }[] = [
          { label: "BOQ Items", value: String(items.length) },
          { label: "Work Categories", value: String(workCatSections.filter(s => s.items.length > 0).length + (hasUncategorised ? 1 : 0)) },
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
          },
          { label: "Total BOQ Value", value: totalAmount > 0 ? `₹${(totalAmount / 1e7).toFixed(2)} Cr` : "—" },
        ];

        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tiles.map(({ label, value, extra, extraCls, onClick, highlight }) => (
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

            {workCatSections.filter(sec => sec.items.length > 0).map(sec => (
              <CategorySection
                key={sec.code}
                name={sec.label}
                items={sec.items}
                projectId={projectId}
                defaultCollapsed={false}
                onOpenRecipe={setRecipeItem}
              />
            ))}
            {hasUncategorised && (
              <CategorySection
                name="Uncategorized"
                items={groupedByWorkCat["__uncategorised__"]}
                projectId={projectId}
                defaultCollapsed={false}
                onOpenRecipe={setRecipeItem}
              />
            )}

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
