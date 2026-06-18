import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Wrench, Users, Package, Info, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtQty, getEffectiveOutputPerHr } from "@shared/planningEngine";
import type {
  BoqItemWithCategory,
  BoqItemEquipmentWithMaster,
  BoqItemLabourRow,
  BoqItemMaterialsRow,
  InsertBoqItemEquipment,
  InsertBoqItemLabour,
  InsertBoqItemMaterials,
} from "@shared/schema";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PlanningEquipTypeMinimal {
  id: number;
  name: string;
  category: string;
  standardOutputs: Array<{ unit: string; outputPerHr: number }> | null;
}

interface PlanningLabourTypeMinimal {
  id: number;
  designation: string;
  skillTier: string;
}

// ─── Equipment Recipe Tab ───────────────────────────────────────────────────────

interface EquipRow {
  key: string;
  planningEquipTypeId: string;
  equipmentName: string;
  qtyPerBoqUnit: string;
  count: string;
  notes: string;
}

function makeEquipRow(r?: BoqItemEquipmentWithMaster): EquipRow {
  return {
    key: Math.random().toString(36).slice(2),
    planningEquipTypeId: r?.planningEquipmentTypeId ? String(r.planningEquipmentTypeId) : "__manual__",
    equipmentName: r?.equipmentName ?? "",
    qtyPerBoqUnit: r?.qtyPerBoqUnit != null ? String(r.qtyPerBoqUnit) : "",
    count: r?.count != null ? String(r.count) : "1",
    notes: r?.notes ?? "",
  };
}

function EquipmentTab({
  boqItemId,
  boqUnit,
  masterList,
}: {
  boqItemId: number;
  boqUnit: string;
  masterList: PlanningEquipTypeMinimal[];
}) {
  const { toast } = useToast();

  const { data: existing = [], isLoading } = useQuery<BoqItemEquipmentWithMaster[]>({
    queryKey: ["/api/boq/items", boqItemId, "equipment"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/equipment`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const [rows, setRows] = useState<EquipRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setRows(existing.length ? existing.map(makeEquipRow) : []);
      setDirty(false);
    }
  }, [existing, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: InsertBoqItemEquipment[] = rows
        .filter((r) => r.equipmentName.trim() || r.planningEquipTypeId !== "__manual__")
        .map((r, i) => ({
          boqItemId,
          planningEquipmentTypeId: r.planningEquipTypeId !== "__manual__" ? parseInt(r.planningEquipTypeId) : null,
          equipmentMasterId: null,
          equipmentName: r.planningEquipTypeId !== "__manual__"
            ? (masterList.find((m) => m.id === parseInt(r.planningEquipTypeId))?.name ?? r.equipmentName)
            : r.equipmentName.toUpperCase(),
          qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : null,
          count: parseInt(r.count) || 1,
          notes: r.notes || null,
          sortOrder: i,
        }));
      await apiRequest("PUT", `/api/boq/items/${boqItemId}/equipment`, { rows: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", boqItemId, "equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects"] });
      toast({ title: "Equipment recipe saved" });
      setDirty(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  function addRow() {
    setRows((prev) => [...prev, makeEquipRow()]);
    setDirty(true);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setDirty(true);
  }

  function updateRow(key: string, field: keyof EquipRow, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: value };
        if (field === "planningEquipTypeId" && value !== "__manual__") {
          const planType = masterList.find((m) => m.id === parseInt(value));
          if (planType) updated.equipmentName = planType.name;
        }
        return updated;
      }),
    );
    setDirty(true);
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Equipment attached to this BOQ item drives automatic duration calculation in the Work Programme.
      </p>

      {rows.map((row) => {
        const planType = row.planningEquipTypeId !== "__manual__"
          ? masterList.find((m) => m.id === parseInt(row.planningEquipTypeId))
          : null;
        const effOutput = planType
          ? getEffectiveOutputPerHr({
              outputUnit: null,
              outputTheoretical: null,
              outputEfficiency: null,
              standardOutputs: planType.standardOutputs,
              count: 1,
            }, boqUnit)
          : null;

        return (
          <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50/50 dark:bg-slate-900/20 p-3 space-y-2">
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[10px]">EQUIPMENT</Label>
                <Select
                  value={row.planningEquipTypeId}
                  onValueChange={(v) => updateRow(row.key, "planningEquipTypeId", v)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid={`select-equip-master-${row.key}`}>
                    <SelectValue placeholder="Select from planning types…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">— Enter manually —</SelectItem>
                    {masterList.map((m) => {
                      const stdCount = m.standardOutputs?.length ?? 0;
                      const suffix = stdCount > 0
                        ? ` (${stdCount} unit${stdCount !== 1 ? "s" : ""})`
                        : "";
                      return (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}{suffix}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {row.planningEquipTypeId === "__manual__" && (
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Equipment name"
                    value={row.equipmentName}
                    onChange={(e) => updateRow(row.key, "equipmentName", e.target.value)}
                    data-testid={`input-equip-name-${row.key}`}
                  />
                )}
              </div>
              <div>
                <Label className="text-[10px]">QTY / BOQ UNIT</Label>
                <Input
                  type="number" step="0.001" className="h-8 text-xs"
                  placeholder="e.g. 1"
                  value={row.qtyPerBoqUnit}
                  onChange={(e) => updateRow(row.key, "qtyPerBoqUnit", e.target.value)}
                  data-testid={`input-equip-qty-${row.key}`}
                />
              </div>
              <div>
                <Label className="text-[10px]">COUNT</Label>
                <Input
                  type="number" min="1" className="h-8 text-xs"
                  value={row.count}
                  onChange={(e) => updateRow(row.key, "count", e.target.value)}
                  data-testid={`input-equip-count-${row.key}`}
                />
              </div>
              <button
                className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                onClick={() => removeRow(row.key)}
                data-testid={`button-remove-equip-${row.key}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {effOutput !== null && effOutput > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-teal-700">
                <Zap className="w-3 h-3" />
                Auto output for {boqUnit}: {fmtQty(effOutput, 2)} {boqUnit}/hr
              </div>
            )}
            {planType && !(planType.standardOutputs?.length) && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                <Info className="w-3 h-3" />
                No standard outputs on this type — duration auto-calc unavailable.
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="outline" size="sm"
          onClick={addRow}
          className="text-xs h-7"
          data-testid="button-add-equip-row"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Equipment
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-7"
          data-testid="button-save-equip-recipe"
        >
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Labour Recipe Tab ──────────────────────────────────────────────────────────

interface LabRow {
  key: string;
  planningLabourTypeId: string;
  designation: string;
  qtyPerBoqUnit: string;
  notes: string;
}

function makeLabRow(r?: BoqItemLabourRow): LabRow {
  return {
    key: Math.random().toString(36).slice(2),
    planningLabourTypeId: "__manual__",
    designation: r?.designation ?? "",
    qtyPerBoqUnit: r?.qtyPerBoqUnit != null ? String(r.qtyPerBoqUnit) : "",
    notes: r?.notes ?? "",
  };
}

function LabourTab({
  boqItemId,
  boqUnit,
  labourTypeList,
}: {
  boqItemId: number;
  boqUnit: string;
  labourTypeList: PlanningLabourTypeMinimal[];
}) {
  const { toast } = useToast();

  const { data: existing = [], isLoading } = useQuery<BoqItemLabourRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "labour"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/labour`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const [rows, setRows] = useState<LabRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setRows(existing.length ? existing.map(makeLabRow) : []);
      setDirty(false);
    }
  }, [existing, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: InsertBoqItemLabour[] = rows
        .filter((r) => r.designation.trim())
        .map((r, i) => ({
          boqItemId,
          designation: r.designation.trim(),
          qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : null,
          notes: r.notes || null,
          sortOrder: i,
        }));
      await apiRequest("PUT", `/api/boq/items/${boqItemId}/labour`, { rows: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", boqItemId, "labour"] });
      toast({ title: "Labour recipe saved" });
      setDirty(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  function updateLabRow(key: string, field: keyof LabRow, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: value };
        if (field === "planningLabourTypeId" && value !== "__manual__") {
          const lt = labourTypeList.find((l) => l.id === parseInt(value));
          if (lt) updated.designation = lt.designation;
        }
        return updated;
      }),
    );
    setDirty(true);
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Labour gangs required per unit of this BOQ item.</p>

      {rows.map((row) => (
        <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50/50 dark:bg-slate-900/20 p-3 space-y-2">
          <div className="grid grid-cols-[2fr_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-[10px]">LABOUR TYPE</Label>
              <Select
                value={row.planningLabourTypeId}
                onValueChange={(v) => updateLabRow(row.key, "planningLabourTypeId", v)}
              >
                <SelectTrigger className="h-8 text-xs" data-testid={`select-labour-type-${row.key}`}>
                  <SelectValue placeholder="Select from planning types…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Enter manually —</SelectItem>
                  {labourTypeList.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.designation}
                      <span className="text-[10px] text-muted-foreground ml-1">({l.skillTier})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {row.planningLabourTypeId === "__manual__" && (
                <Input
                  className="h-8 text-xs mt-1"
                  placeholder="e.g. Skilled Mason"
                  value={row.designation}
                  onChange={(e) => updateLabRow(row.key, "designation", e.target.value)}
                  data-testid={`input-labour-cat-${row.key}`}
                />
              )}
            </div>
            <div>
              <Label className="text-[10px]">DAYS / BOQ UNIT ({boqUnit})</Label>
              <Input
                type="number" step="0.001" className="h-8 text-xs"
                placeholder="0"
                value={row.qtyPerBoqUnit}
                onChange={(e) => updateLabRow(row.key, "qtyPerBoqUnit", e.target.value)}
                data-testid={`input-labour-qty-${row.key}`}
              />
            </div>
            <button
              className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" className="text-xs h-7"
          onClick={() => { setRows((p) => [...p, makeLabRow()]); setDirty(true); }}
          data-testid="button-add-labour-row"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Labour
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-7"
          data-testid="button-save-labour-recipe"
        >
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Materials Recipe Tab ───────────────────────────────────────────────────────

interface MatRow { key: string; materialName: string; uom: string; qtyPerBoqUnit: string; notes: string; }

function makeMatRow(r?: BoqItemMaterialsRow): MatRow {
  return {
    key: Math.random().toString(36).slice(2),
    materialName: r?.materialName ?? "",
    uom: r?.uom ?? "",
    qtyPerBoqUnit: r?.qtyPerBoqUnit != null ? String(r.qtyPerBoqUnit) : "",
    notes: r?.notes ?? "",
  };
}

function MaterialsTab({ boqItemId, boqUnit }: { boqItemId: number; boqUnit: string }) {
  const { toast } = useToast();

  const { data: existing = [], isLoading } = useQuery<BoqItemMaterialsRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "materials"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/materials`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const [rows, setRows] = useState<MatRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setRows(existing.length ? existing.map(makeMatRow) : []);
      setDirty(false);
    }
  }, [existing, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: InsertBoqItemMaterials[] = rows
        .filter((r) => r.materialName.trim())
        .map((r, i) => ({
          boqItemId,
          materialName: r.materialName.trim(),
          uom: r.uom.trim() || null,
          qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : null,
          notes: r.notes || null,
          sortOrder: i,
        }));
      await apiRequest("PUT", `/api/boq/items/${boqItemId}/materials`, { rows: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", boqItemId, "materials"] });
      toast({ title: "Materials recipe saved" });
      setDirty(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Materials consumed per unit of this BOQ item (drives BOM demand).</p>

      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-[10px]">MATERIAL NAME</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. Bitumen VG-30"
              value={row.materialName}
              onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, materialName: e.target.value } : r)); setDirty(true); }}
              data-testid={`input-mat-name-${row.key}`}
            />
          </div>
          <div>
            <Label className="text-[10px]">UNIT</Label>
            <Input
              className="h-8 text-xs"
              placeholder="MT / m3"
              value={row.uom}
              onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, uom: e.target.value } : r)); setDirty(true); }}
              data-testid={`input-mat-unit-${row.key}`}
            />
          </div>
          <div>
            <Label className="text-[10px]">QTY / BOQ UNIT ({boqUnit})</Label>
            <Input
              type="number" step="0.001" className="h-8 text-xs"
              placeholder="0"
              value={row.qtyPerBoqUnit}
              onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, qtyPerBoqUnit: e.target.value } : r)); setDirty(true); }}
              data-testid={`input-mat-qty-${row.key}`}
            />
          </div>
          <button
            className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" className="text-xs h-7"
          onClick={() => { setRows((p) => [...p, makeMatRow()]); setDirty(true); }}
          data-testid="button-add-mat-row"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Material
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-7"
          data-testid="button-save-mat-recipe"
        >
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Main Dialog ────────────────────────────────────────────────────────────────

export function BoqItemRecipeDialog({
  item,
  onClose,
}: {
  item: BoqItemWithCategory;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("equipment");

  const { data: masterList = [] } = useQuery<PlanningEquipTypeMinimal[]>({
    queryKey: ["/api/planning/equipment-types"],
    queryFn: async () => {
      const res = await fetch("/api/planning/equipment-types", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: labourTypeList = [] } = useQuery<PlanningLabourTypeMinimal[]>({
    queryKey: ["/api/planning/labour-types"],
    queryFn: async () => {
      const res = await fetch("/api/planning/labour-types", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-600" />
            Item Recipes — {item.description}
            <span className="text-xs font-normal text-muted-foreground">({item.unit})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="equipment" className="flex items-center gap-1.5 text-xs">
                <Wrench className="w-3.5 h-3.5" /> Equipment
              </TabsTrigger>
              <TabsTrigger value="labour" className="flex items-center gap-1.5 text-xs">
                <Users className="w-3.5 h-3.5" /> Labour
              </TabsTrigger>
              <TabsTrigger value="materials" className="flex items-center gap-1.5 text-xs">
                <Package className="w-3.5 h-3.5" /> Materials
              </TabsTrigger>
            </TabsList>

            <TabsContent value="equipment">
              <EquipmentTab boqItemId={item.id} boqUnit={item.unit} masterList={masterList} />
            </TabsContent>
            <TabsContent value="labour">
              <LabourTab boqItemId={item.id} boqUnit={item.unit} labourTypeList={labourTypeList} />
            </TabsContent>
            <TabsContent value="materials">
              <MaterialsTab boqItemId={item.id} boqUnit={item.unit} />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose} size="sm">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline Compact Badge (for item list) ───────────────────────────────────────

export function BoqItemRecipeBadge({
  boqItemId,
}: {
  boqItemId: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: equipment = [] } = useQuery<BoqItemEquipmentWithMaster[]>({
    queryKey: ["/api/boq/items", boqItemId, "equipment"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/equipment`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: materials = [] } = useQuery<BoqItemMaterialsRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "materials"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/materials`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const hasData = equipment.length > 0 || materials.length > 0;
  if (!hasData) return null;

  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-800 transition-colors"
        onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {equipment.length > 0 && <span>{equipment.length} equip</span>}
        {materials.length > 0 && <span>· {materials.length} mat</span>}
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-3 border-l-2 border-teal-100">
          {equipment.map((e) => (
            <p key={e.id} className="text-[10px] text-muted-foreground">
              <Wrench className="w-2.5 h-2.5 inline mr-0.5" />
              {e.equipmentName}
              {e.count && e.count > 1 ? ` ×${e.count}` : ""}
            </p>
          ))}
          {materials.map((m) => (
            <p key={m.id} className="text-[10px] text-muted-foreground">
              <Package className="w-2.5 h-2.5 inline mr-0.5" />
              {m.materialName}
              {m.qtyPerBoqUnit ? ` — ${fmtQty(m.qtyPerBoqUnit, 3)} ${m.uom ?? ""}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
