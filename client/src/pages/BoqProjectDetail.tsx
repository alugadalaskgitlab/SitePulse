import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import {
  ChevronRight, Upload, Pencil, ChevronDown, ChevronUp,
  Plus, Check, Trash2, Loader2, FileSpreadsheet, AlertCircle,
  GitBranch, CalendarDays, Package, Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
    unit: item.unit,
    itemCode: item.itemCode ?? "",
    clientRate: item.clientRate != null ? String(item.clientRate) : "",
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
    patchMutation.mutate({
      description: form.description.trim(),
      unit: form.unit.trim(),
      itemCode: form.itemCode.trim() || null,
      clientRate: rate,
      clientAmount,
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
            <Label className="text-xs">DESCRIPTION <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              data-testid="input-edit-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">UNIT <span className="text-red-500">*</span></Label>
              <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                data-testid="input-edit-unit" />
            </div>
            <div>
              <Label className="text-xs">ITEM CODE</Label>
              <Input value={form.itemCode} onChange={e => setForm(p => ({ ...p, itemCode: e.target.value }))}
                placeholder="e.g. 1.01" data-testid="input-edit-code" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">CLIENT RATE (₹)</Label>
              <Input type="number" value={form.clientRate}
                onChange={e => setForm(p => ({ ...p, clientRate: e.target.value }))}
                placeholder="0.00" data-testid="input-edit-rate" />
            </div>
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
}: {
  name: string;
  items: BoqItemWithCategory[];
  projectId: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editItem, setEditItem] = useState<BoqItemWithCategory | null>(null);
  const [recipeItem, setRecipeItem] = useState<BoqItemWithCategory | null>(null);

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
          <span className="text-xs text-slate-400">{items.length} items</span>
        </div>
        <div className="flex items-center gap-3">
          {boqSubtotal > 0 && (
            <span className="text-xs text-slate-300 hidden sm:block">
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
          <table className="min-w-full text-xs">
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
                    <td className="px-3 py-1.5 text-slate-700 max-w-[200px]">
                      <span className="line-clamp-2">{item.description}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{item.unit}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                      {fmt(item.boqQty)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${revised ? "text-amber-700" : "text-slate-700"}`}>
                      {fmt(item.currentQty)}
                      {revised && <span className="ml-1 text-amber-500 text-[10px]">↕</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{fmt(item.clientRate)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">
                      {fmtAmt(item.clientAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center gap-0.5 justify-center">
                        <button
                          onClick={() => setRecipeItem(item)}
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
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Subtotal row */}
              {subtotal > 0 && (
                <tr className="bg-slate-100 border-t border-slate-200">
                  <td colSpan={6} className="px-3 py-1.5 text-right text-xs font-semibold text-slate-600">
                    Subtotal
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-800">
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
      {recipeItem && (
        <BoqItemRecipeDialog item={recipeItem} onClose={() => setRecipeItem(null)} />
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
              <Label className="text-xs">REVISION LABEL <span className="text-red-500">*</span></Label>
              <Input value={label} onChange={e => setLabel(e.target.value)}
                placeholder='e.g. Rev 1 — Additional earthwork quantities'
                data-testid="input-revision-label" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">NOTES</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Reason for revision, reference document, etc."
                data-testid="input-revision-notes" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">
              BOQ ITEMS — Enter Revised Qty and Change Reason for items you want to revise
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Only rows with a Change Reason will be included in this revision.{" "}
              <span className="font-semibold text-slate-700">{changedItems.length}</span> item(s) selected.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="min-w-full text-xs">
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
                          <td className="px-3 py-1.5 text-slate-700 max-w-[180px]">
                            <span className="line-clamp-2">{item.description}</span>
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
                              className="h-6 text-xs text-right w-20 ml-auto"
                              data-testid={`input-rev-qty-${item.id}`}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={row?.changeReason ?? ""}
                              onChange={e => setRow(item.id, "changeReason", e.target.value)}
                              placeholder="Enter reason to include"
                              className={`h-6 text-xs w-40 ${hasReason ? "border-purple-300" : ""}`}
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
          className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
          onClick={() => setShowNew(true)}
          data-testid="button-new-revision">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Revision
        </Button>
      </div>

      {revisions.length === 0 ? (
        <div className="text-center py-8 space-y-2 text-muted-foreground text-xs">
          <GitBranch className="w-8 h-8 text-slate-200 mx-auto" />
          <p>No revisions yet</p>
          <p className="text-[11px]">Create a revision to adjust BOQ quantities</p>
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
                      <span className="text-xs font-mono text-muted-foreground">Rev {rev.revisionNo}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.cls}`}>
                        {st.label}
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">{rev.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {rev.createdBy ? `${rev.createdBy} · ` : ""}
                      {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString("en-IN") : ""}
                      {rev.approvedBy ? ` · Approved by ${rev.approvedBy}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{rev.items.length} item(s) revised</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    {rev.status === "draft" && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmActivate(rev); }}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
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
                    <table className="min-w-full text-xs">
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
                            <td className="px-3 py-1 text-slate-500 text-[10px] max-w-[120px] truncate">{ri.changeReason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {expanded && rev.notes && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground italic">{rev.notes}</p>
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
              <p className="text-xs text-muted-foreground">Any previously active revision will be marked Superseded.</p>
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
  const [hmp, setHmp] = useState(project.hmpChainageKm != null ? String(project.hmpChainageKm) : "");
  const [wmm, setWmm] = useState(project.wmmPlantChainageKm != null ? String(project.wmmPlantChainageKm) : "");
  const [quarry, setQuarry] = useState(project.quarryChainageKm != null ? String(project.quarryChainageKm) : "");
  const [speed, setSpeed] = useState(project.avgTipperSpeedKmHr != null ? String(project.avgTipperSpeedKmHr) : "30");

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/boq/projects/${project.id}`, {
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
            Planning Source Settings
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Chainage distances from mid-project to each supply source, used to auto-compute tipper fleet size in the Work Programme.
        </p>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px]">HMP CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-xs mt-0.5"
                placeholder="e.g. 8.5"
                value={hmp}
                onChange={(e) => setHmp(e.target.value)}
                data-testid="input-hmp-chainage"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">Hot Mix Plant → site</p>
            </div>
            <div>
              <Label className="text-[10px]">WMM PLANT CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-xs mt-0.5"
                placeholder="e.g. 5.0"
                value={wmm}
                onChange={(e) => setWmm(e.target.value)}
                data-testid="input-wmm-chainage"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">WMM Plant → site</p>
            </div>
            <div>
              <Label className="text-[10px]">QUARRY CHAINAGE (km)</Label>
              <Input
                type="number" step="0.1" min="0"
                className="h-8 text-xs mt-0.5"
                placeholder="e.g. 12.0"
                value={quarry}
                onChange={(e) => setQuarry(e.target.value)}
                data-testid="input-quarry-chainage"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">Quarry → site</p>
            </div>
            <div>
              <Label className="text-[10px]">AVG TIPPER SPEED (km/hr)</Label>
              <Input
                type="number" step="1" min="1"
                className="h-8 text-xs mt-0.5"
                placeholder="30"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                data-testid="input-tipper-speed"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">Default: 30 km/hr</p>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-project-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Save Settings
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
  const [showSettings, setShowSettings] = useState(false);

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
  const grouped = useMemo(() => {
    const map: Record<string, BoqItemWithCategory[]> = {};
    for (const item of items) {
      const cat = item.categoryName ?? "__uncategorised__";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [items]);

  const categoryKeys = Object.keys(grouped).filter(k => k !== "__uncategorised__").sort();
  const hasUncategorised = !!grouped["__uncategorised__"]?.length;

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
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="breadcrumb">
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
              className={`text-xs flex-shrink-0 ${PROJ_STATUS[project.status] ?? PROJ_STATUS.draft}`}>
              {project.status.toUpperCase()}
            </Badge>
            {activeRevision && (
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                {activeRevision.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            {project.contractNo && <span>Contract: {project.contractNo}</span>}
            {project.client && <span>· {project.client}</span>}
            {project.contractor && <span>· {project.contractor}</span>}
            {project.roadLengthKm != null && <span>· {project.roadLengthKm} km</span>}
            {project.startDate && <span>· Start: {project.startDate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-200 text-slate-600 hover:bg-slate-50 h-8"
            onClick={() => setShowSettings(true)}
            data-testid="button-project-settings"
            title="Planning source settings (chainage, tipper speed)"
          >
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            Settings
          </Button>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "BOQ Items", value: String(items.length) },
          { label: "Categories", value: String(categoryKeys.length + (hasUncategorised ? 1 : 0)) },
          { label: "Revisions", value: String(revisions.length) },
          { label: "Total BOQ Value", value: totalAmount > 0 ? `₹${(totalAmount / 1e7).toFixed(2)} Cr` : "—" },
        ].map(({ label, value }) => (
          <Card key={label} className="border-slate-200">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                  ? <span className="ml-2 text-xs font-normal text-muted-foreground">(Original BOQ)</span>
                  : <span className="ml-2 text-xs font-normal text-purple-600">({activeRevision.label})</span>
                }
              </h2>
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-600 font-semibold">Amber rows</span> = revised qty
              </p>
            </div>

            {categoryKeys.map(cat => (
              <CategorySection key={cat} name={cat} items={grouped[cat]} projectId={projectId} />
            ))}
            {hasUncategorised && (
              <CategorySection
                name="Uncategorised"
                items={grouped["__uncategorised__"]}
                projectId={projectId}
              />
            )}

            {/* Grand total */}
            {totalAmount > 0 && (
              <div className="flex justify-end mt-2">
                <div className="bg-slate-800 rounded-lg px-5 py-2.5 text-white text-sm flex items-center gap-4">
                  <span className="text-slate-400 text-xs">Total Contract Value</span>
                  <span className="font-bold">₹{fmtAmt(totalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Revision panel ── */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <RevisionPanel
              projectId={projectId}
              revisions={revisions}
              items={items}
              onActivated={() => void refetchItems()}
            />
          </div>
        </div>
      )}

      {/* Import Wizard */}
      {showImport && (
        <BoqImportWizard
          projectId={projectId}
          projectName={project.name}
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* Planning Settings Dialog */}
      {showSettings && (
        <ProjectSettingsDialog
          project={project}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
