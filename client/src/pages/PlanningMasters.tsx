import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, Settings, Wrench, Users, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlanningEquipmentType, PlanningLabourType } from "@shared/schema";

const CANONICAL_UNITS = ["CUM", "SQM", "MT", "RM", "HECT", "KL", "LS", "NOS"] as const;

const EQUIP_CATEGORIES = ["Earthwork", "Paving", "Transport", "Plant", "Support", "Other"];
const LABOUR_TIERS = ["Unskilled", "Semi-skilled", "Skilled", "Supervisory", "Other"];

// ─── Equipment Type Edit Dialog ─────────────────────────────────────────────

function EquipTypeDialog({
  item,
  onClose,
}: {
  item: PlanningEquipmentType | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "General");
  const [outputMap, setOutputMap] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (item?.standardOutputs) {
      for (const o of item.standardOutputs) m[o.unit] = String(o.outputPerHr);
    }
    return m;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const standardOutputs = CANONICAL_UNITS
        .filter((u) => outputMap[u] && parseFloat(outputMap[u]) > 0)
        .map((u) => ({ unit: u, outputPerHr: parseFloat(outputMap[u]) }));
      const payload = { name: name.trim(), category, standardOutputs, isActive: true };
      if (item) {
        await apiRequest("PATCH", `/api/planning/equipment-types/${item.id}`, payload);
      } else {
        await apiRequest("POST", "/api/planning/equipment-types", payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/planning/equipment-types"] });
      toast({ title: item ? "Equipment type updated" : "Equipment type added" });
      onClose();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-teal-600" />
            {item ? "Edit Equipment Type" : "Add Equipment Type"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                className="h-8 text-sm mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Excavator"
                data-testid="input-equip-type-name"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-sm mt-1" data-testid="select-equip-type-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIP_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Standard Outputs (per hour)</Label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-2 pb-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Unit</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Output / hr</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Daily (8 hrs)</span>
              </div>
              {CANONICAL_UNITS.map((unit) => {
                const val = outputMap[unit] ?? "";
                const num = val ? parseFloat(val) : 0;
                return (
                  <div key={unit} className="grid grid-cols-[1fr_1.5fr_1fr] gap-2 items-center">
                    <Label className="text-xs font-semibold text-slate-600">{unit}</Label>
                    <Input
                      type="number" step="0.1" min="0"
                      className="h-7 text-xs"
                      value={val}
                      onChange={(e) => setOutputMap((p) => ({ ...p, [unit]: e.target.value }))}
                      placeholder="—"
                      data-testid={`input-plan-equip-output-${unit}`}
                    />
                    <span className={`text-[11px] text-right ${num > 0 ? "text-teal-600 font-medium" : "text-muted-foreground"}`}>
                      {num > 0 ? (num * 8).toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
            data-testid="button-save-equip-type"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {item ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Labour Type Edit Dialog ─────────────────────────────────────────────────

function LabourTypeDialog({
  item,
  onClose,
}: {
  item: PlanningLabourType | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [designation, setDesignation] = useState(item?.designation ?? "");
  const [skillTier, setSkillTier] = useState(item?.skillTier ?? "Skilled");
  const [outputMap, setOutputMap] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (item?.standardOutputs) {
      for (const o of item.standardOutputs) m[o.unit] = String(o.outputPerDay);
    }
    return m;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const standardOutputs = CANONICAL_UNITS
        .filter((u) => outputMap[u] && parseFloat(outputMap[u]) > 0)
        .map((u) => ({ unit: u, outputPerDay: parseFloat(outputMap[u]) }));
      const payload = { designation: designation.trim(), skillTier, standardOutputs, isActive: true };
      if (item) {
        await apiRequest("PATCH", `/api/planning/labour-types/${item.id}`, payload);
      } else {
        await apiRequest("POST", "/api/planning/labour-types", payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/planning/labour-types"] });
      toast({ title: item ? "Labour type updated" : "Labour type added" });
      onClose();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            {item ? "Edit Labour Type" : "Add Labour Type"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Designation</Label>
              <Input
                className="h-8 text-sm mt-1"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Mason"
                data-testid="input-labour-type-designation"
              />
            </div>
            <div>
              <Label className="text-xs">Skill Tier</Label>
              <Select value={skillTier} onValueChange={setSkillTier}>
                <SelectTrigger className="h-8 text-sm mt-1" data-testid="select-labour-type-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABOUR_TIERS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productivity (per person-day)</Label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-2 pb-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Unit</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Output / day</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Monthly (26 days)</span>
              </div>
              {CANONICAL_UNITS.map((unit) => {
                const val = outputMap[unit] ?? "";
                const num = val ? parseFloat(val) : 0;
                return (
                  <div key={unit} className="grid grid-cols-[1fr_1.5fr_1fr] gap-2 items-center">
                    <Label className="text-xs font-semibold text-slate-600">{unit}</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      className="h-7 text-xs"
                      value={val}
                      onChange={(e) => setOutputMap((p) => ({ ...p, [unit]: e.target.value }))}
                      placeholder="—"
                      data-testid={`input-plan-labour-output-${unit}`}
                    />
                    <span className={`text-[11px] text-right ${num > 0 ? "text-teal-600 font-medium" : "text-muted-foreground"}`}>
                      {num > 0 ? (num * 26).toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={() => saveMutation.mutate()}
            disabled={!designation.trim() || saveMutation.isPending}
            data-testid="button-save-labour-type"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {item ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Equipment Types Tab ─────────────────────────────────────────────────────

function EquipmentTypesTab() {
  const { toast } = useToast();
  const [dialogItem, setDialogItem] = useState<PlanningEquipmentType | null | "new">(undefined as any);

  const { data: types = [], isLoading } = useQuery<PlanningEquipmentType[]>({
    queryKey: ["/api/planning/equipment-types"],
    queryFn: async () => {
      const res = await fetch("/api/planning/equipment-types?includeInactive=true", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planning/equipment-types/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/planning/equipment-types"] });
      toast({ title: "Equipment type deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const grouped = EQUIP_CATEGORIES.reduce<Record<string, PlanningEquipmentType[]>>((acc, cat) => {
    acc[cat] = types.filter((t) => t.category === cat);
    return acc;
  }, {});
  const uncategorised = types.filter((t) => !EQUIP_CATEGORIES.includes(t.category));
  if (uncategorised.length) grouped["Other"] = [...(grouped["Other"] ?? []), ...uncategorised];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="bg-teal-700 hover:bg-teal-800 text-white"
          onClick={() => setDialogItem("new")}
          data-testid="button-add-equip-type"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Equipment Type
        </Button>
      </div>

      {EQUIP_CATEGORIES.map((cat) => {
        const rows = grouped[cat] ?? [];
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">{cat}</h3>
            <div className="space-y-1.5">
              {rows.map((t) => (
                <EquipTypeRow
                  key={t.id}
                  item={t}
                  onEdit={() => setDialogItem(t)}
                  onDelete={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {types.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No equipment types defined yet. Click "Add Equipment Type" to get started.</p>
      )}

      {dialogItem !== undefined && (
        <EquipTypeDialog
          item={dialogItem === "new" ? null : dialogItem}
          onClose={() => setDialogItem(undefined as any)}
        />
      )}
    </div>
  );
}

function EquipTypeRow({ item, onEdit, onDelete }: { item: PlanningEquipmentType; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const outputCount = item.standardOutputs?.length ?? 0;

  return (
    <div className={`rounded-lg border ${item.isActive ? "border-slate-200 bg-white dark:bg-slate-900/30" : "border-slate-100 bg-slate-50 opacity-60 dark:bg-slate-900/10"} px-3 py-2`}>
      <div className="flex items-center gap-2">
        <Wrench className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
        <span className="text-sm font-medium flex-1">{item.name}</span>
        {outputCount > 0 ? (
          <button
            className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-800"
            onClick={() => setExpanded((p) => !p)}
            data-testid={`button-expand-equip-${item.id}`}
          >
            {outputCount} output{outputCount !== 1 ? "s" : ""}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">no outputs</span>
        )}
        <button
          className="p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
          onClick={onEdit}
          data-testid={`button-edit-equip-type-${item.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          onClick={onDelete}
          data-testid={`button-delete-equip-type-${item.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && item.standardOutputs && item.standardOutputs.length > 0 && (
        <div className="mt-2 pl-5 flex flex-wrap gap-1.5">
          {item.standardOutputs.map((o) => (
            <Badge key={o.unit} variant="secondary" className="text-[10px] font-medium">
              {o.unit}: {o.outputPerHr}/hr · {(o.outputPerHr * 8).toFixed(0)}/day
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Labour Types Tab ─────────────────────────────────────────────────────────

function LabourTypesTab() {
  const { toast } = useToast();
  const [dialogItem, setDialogItem] = useState<PlanningLabourType | null | "new">(undefined as any);

  const { data: types = [], isLoading } = useQuery<PlanningLabourType[]>({
    queryKey: ["/api/planning/labour-types"],
    queryFn: async () => {
      const res = await fetch("/api/planning/labour-types?includeInactive=true", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planning/labour-types/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/planning/labour-types"] });
      toast({ title: "Labour type deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const grouped = LABOUR_TIERS.reduce<Record<string, PlanningLabourType[]>>((acc, tier) => {
    acc[tier] = types.filter((t) => t.skillTier === tier);
    return acc;
  }, {});
  const uncategorised = types.filter((t) => !LABOUR_TIERS.includes(t.skillTier));
  if (uncategorised.length) grouped["Other"] = [...(grouped["Other"] ?? []), ...uncategorised];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="bg-teal-700 hover:bg-teal-800 text-white"
          onClick={() => setDialogItem("new")}
          data-testid="button-add-labour-type"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Labour Type
        </Button>
      </div>

      {LABOUR_TIERS.map((tier) => {
        const rows = grouped[tier] ?? [];
        if (!rows.length) return null;
        return (
          <div key={tier}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">{tier}</h3>
            <div className="space-y-1.5">
              {rows.map((t) => (
                <LabourTypeRow
                  key={t.id}
                  item={t}
                  onEdit={() => setDialogItem(t)}
                  onDelete={() => { if (confirm(`Delete "${t.designation}"?`)) deleteMutation.mutate(t.id); }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {types.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No labour types defined yet. Click "Add Labour Type" to get started.</p>
      )}

      {dialogItem !== undefined && (
        <LabourTypeDialog
          item={dialogItem === "new" ? null : dialogItem}
          onClose={() => setDialogItem(undefined as any)}
        />
      )}
    </div>
  );
}

function LabourTypeRow({ item, onEdit, onDelete }: { item: PlanningLabourType; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const outputCount = item.standardOutputs?.length ?? 0;

  return (
    <div className={`rounded-lg border ${item.isActive ? "border-slate-200 bg-white dark:bg-slate-900/30" : "border-slate-100 bg-slate-50 opacity-60 dark:bg-slate-900/10"} px-3 py-2`}>
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
        <span className="text-sm font-medium flex-1">{item.designation}</span>
        {outputCount > 0 ? (
          <button
            className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-800"
            onClick={() => setExpanded((p) => !p)}
            data-testid={`button-expand-labour-${item.id}`}
          >
            {outputCount} unit{outputCount !== 1 ? "s" : ""}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">supervisory / no output</span>
        )}
        <button
          className="p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
          onClick={onEdit}
          data-testid={`button-edit-labour-type-${item.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          onClick={onDelete}
          data-testid={`button-delete-labour-type-${item.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && item.standardOutputs && item.standardOutputs.length > 0 && (
        <div className="mt-2 pl-5 flex flex-wrap gap-1.5">
          {item.standardOutputs.map((o) => (
            <Badge key={o.unit} variant="secondary" className="text-[10px] font-medium">
              {o.unit}: {o.outputPerDay}/day · {(o.outputPerDay * 26).toFixed(0)}/mo
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlanningMasters() {
  const [tab, setTab] = useState("equipment");

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/20">
          <Settings className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Planning Masters</h1>
          <p className="text-sm text-muted-foreground">
            Equipment and labour type catalogues used by BOQ Item Recipes and Work Programme duration calculations.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="equipment" className="flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> Equipment Types
          </TabsTrigger>
          <TabsTrigger value="labour" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Labour Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipment">
          <EquipmentTypesTab />
        </TabsContent>
        <TabsContent value="labour">
          <LabourTypesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
