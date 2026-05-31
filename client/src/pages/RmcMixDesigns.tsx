import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { RmcMixDesign } from "@shared/schema";

const GRADES = ["M10","M15","M20","M25","M30","M35","M40","M45","M50","M55","M60"];

function defaultForm() {
  return {
    grade: "M25",
    plantName: "Main Plant",
    cementContent: "",
    wcr: "",
    admixtureName: "",
    admixtureDosage: "",
    targetStrength: "",
    notes: "",
    isActive: 1,
    componentProportions: { cement: "", fineAgg: "", coarseAgg10: "", coarseAgg20: "" },
  };
}

export default function RmcMixDesigns() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canCreate = sectionCan("plant_production", "create");
  const canEdit = sectionCan("plant_production", "edit");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm());

  const { data: designs = [], isLoading } = useQuery<RmcMixDesign[]>({
    queryKey: ["/api/rmc/mix-designs"],
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = editingId
        ? await apiRequest("PATCH", `/api/rmc/mix-designs/${editingId}`, payload)
        : await apiRequest("POST", "/api/rmc/mix-designs", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/mix-designs"] });
      toast({ title: editingId ? "Mix design updated" : "Mix design created" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/rmc/mix-designs/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/mix-designs"] });
      toast({ title: "Mix design deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setOpen(true);
  }

  function openEdit(d: RmcMixDesign) {
    setEditingId(d.id);
    const cp = (d.componentProportions as any) ?? {};
    setForm({
      grade: d.grade,
      plantName: d.plantName,
      cementContent: d.cementContent?.toString() ?? "",
      wcr: d.wcr?.toString() ?? "",
      admixtureName: d.admixtureName ?? "",
      admixtureDosage: d.admixtureDosage?.toString() ?? "",
      targetStrength: d.targetStrength?.toString() ?? "",
      notes: d.notes ?? "",
      isActive: d.isActive ?? 1,
      componentProportions: {
        cement: cp.cement?.toString() ?? "",
        fineAgg: cp.fineAgg?.toString() ?? "",
        coarseAgg10: cp.coarseAgg10?.toString() ?? "",
        coarseAgg20: cp.coarseAgg20?.toString() ?? "",
      },
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      grade: form.grade,
      plantName: form.plantName,
      cementContent: form.cementContent ? Number(form.cementContent) : null,
      wcr: form.wcr ? Number(form.wcr) : null,
      admixtureName: form.admixtureName || null,
      admixtureDosage: form.admixtureDosage ? Number(form.admixtureDosage) : null,
      targetStrength: form.targetStrength ? Number(form.targetStrength) : null,
      notes: form.notes || null,
      isActive: form.isActive,
      componentProportions: {
        cement: form.componentProportions.cement ? Number(form.componentProportions.cement) : null,
        fineAgg: form.componentProportions.fineAgg ? Number(form.componentProportions.fineAgg) : null,
        coarseAgg10: form.componentProportions.coarseAgg10 ? Number(form.componentProportions.coarseAgg10) : null,
        coarseAgg20: form.componentProportions.coarseAgg20 ? Number(form.componentProportions.coarseAgg20) : null,
      },
    };
    upsertMutation.mutate(payload);
  }

  function setCP(key: string, val: string) {
    setForm(f => ({ ...f, componentProportions: { ...f.componentProportions, [key]: val } }));
  }

  const formTotalWeight = (
    (parseFloat(form.componentProportions.cement) || 0) +
    (parseFloat(form.componentProportions.fineAgg) || 0) +
    (parseFloat(form.componentProportions.coarseAgg10) || 0) +
    (parseFloat(form.componentProportions.coarseAgg20) || 0)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/plant/rmc">
            <Button variant="ghost" size="icon" data-testid="btn-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">RMC Mix Designs</h1>
            <p className="text-sm text-muted-foreground">Manage approved concrete mix design grades</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={openCreate} data-testid="btn-add-mix-design">
            <Plus className="w-4 h-4 mr-2" /> Add Mix Design
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground p-8 text-center">Loading…</div>
      ) : designs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FlaskConical className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No mix designs yet. Add one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map(d => {
            const cp = (d.componentProportions as any) ?? {};
            return (
              <Card key={d.id} data-testid={`card-mix-design-${d.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{d.grade}</CardTitle>
                    <Badge variant={d.isActive ? "default" : "secondary"}>
                      {d.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.plantName}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {d.targetStrength && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target fck</span>
                      <span className="font-semibold">{d.targetStrength} MPa</span>
                    </div>
                  )}
                  {d.cementContent && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cement</span>
                      <span>{d.cementContent} kg/m³</span>
                    </div>
                  )}
                  {d.wcr && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">W/C Ratio</span>
                      <span>{d.wcr}</span>
                    </div>
                  )}
                  {d.admixtureName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Admixture</span>
                      <span>{d.admixtureName}{d.admixtureDosage ? ` @ ${d.admixtureDosage}%` : ""}</span>
                    </div>
                  )}
                  {(cp.cement || cp.fineAgg || cp.coarseAgg10 || cp.coarseAgg20) && (() => {
                    const total = (Number(cp.cement) || 0) + (Number(cp.fineAgg) || 0) + (Number(cp.coarseAgg10) || 0) + (Number(cp.coarseAgg20) || 0);
                    return (
                      <div className="mt-2 pt-2 border-t text-xs">
                        <p className="text-muted-foreground font-medium mb-1">Proportions (kg/m³)</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {cp.cement && <div>Cement: {cp.cement}</div>}
                          {cp.fineAgg && <div>Fine Agg: {cp.fineAgg}</div>}
                          {cp.coarseAgg10 && <div>CA 10mm: {cp.coarseAgg10}</div>}
                          {cp.coarseAgg20 && <div>CA 20mm: {cp.coarseAgg20}</div>}
                        </div>
                        {total > 0 && (
                          <div className="flex justify-between mt-1.5 pt-1.5 border-t font-semibold" data-testid={`text-card-total-weight-${d.id}`}>
                            <span className="text-muted-foreground">Total</span>
                            <span>{total.toFixed(1)} kg/m³</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {d.notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{d.notes}</p>}
                  <div className="flex gap-2 pt-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => openEdit(d)} data-testid={`btn-edit-mix-${d.id}`}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="outline" size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`Delete ${d.grade}?`)) deleteMutation.mutate(d.id); }}
                        data-testid={`btn-delete-mix-${d.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Mix Design" : "New Mix Design"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Grade *</Label>
                <Select value={form.grade} onValueChange={v => setForm(f => ({ ...f, grade: v }))}>
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Plant Name</Label>
                <Input value={form.plantName} onChange={e => setForm(f => ({ ...f, plantName: e.target.value }))} data-testid="input-plant-name" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Cement (kg/m³)</Label>
                <Input type="number" step="0.01" value={form.cementContent} onChange={e => setForm(f => ({ ...f, cementContent: e.target.value }))} data-testid="input-cement-content" />
              </div>
              <div className="space-y-1">
                <Label>W/C Ratio</Label>
                <Input type="number" step="0.01" value={form.wcr} onChange={e => setForm(f => ({ ...f, wcr: e.target.value }))} data-testid="input-wcr" />
              </div>
              <div className="space-y-1">
                <Label>Target fck (MPa)</Label>
                <Input type="number" step="0.1" value={form.targetStrength} onChange={e => setForm(f => ({ ...f, targetStrength: e.target.value }))} data-testid="input-target-strength" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Admixture Name</Label>
                <Input value={form.admixtureName} onChange={e => setForm(f => ({ ...f, admixtureName: e.target.value }))} data-testid="input-admixture-name" placeholder="e.g. Conplast SP430" />
              </div>
              <div className="space-y-1">
                <Label>Admixture Dosage (%)</Label>
                <Input type="number" step="0.01" value={form.admixtureDosage} onChange={e => setForm(f => ({ ...f, admixtureDosage: e.target.value }))} data-testid="input-admixture-dosage" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Component Proportions (kg/m³)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cement</Label>
                  <Input type="number" step="0.1" value={form.componentProportions.cement} onChange={e => setCP("cement", e.target.value)} data-testid="input-cp-cement" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fine Aggregate</Label>
                  <Input type="number" step="0.1" value={form.componentProportions.fineAgg} onChange={e => setCP("fineAgg", e.target.value)} data-testid="input-cp-fine-agg" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Coarse Agg 10mm</Label>
                  <Input type="number" step="0.1" value={form.componentProportions.coarseAgg10} onChange={e => setCP("coarseAgg10", e.target.value)} data-testid="input-cp-ca10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Coarse Agg 20mm</Label>
                  <Input type="number" step="0.1" value={form.componentProportions.coarseAgg20} onChange={e => setCP("coarseAgg20", e.target.value)} data-testid="input-cp-ca20" />
                </div>
              </div>
              {formTotalWeight > 0 && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t bg-muted/40 rounded px-2 py-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Total Weight</span>
                  <span className="text-sm font-bold" data-testid="text-total-weight">{formTotalWeight.toFixed(1)} kg/m³</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="textarea-notes" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.isActive.toString()} onValueChange={v => setForm(f => ({ ...f, isActive: Number(v) }))}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Active</SelectItem>
                  <SelectItem value="0">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} data-testid="btn-save-mix-design">
                {upsertMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
