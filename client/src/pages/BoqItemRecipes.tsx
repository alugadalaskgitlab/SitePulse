import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, Loader2, Wrench, Users, Package, Info, Zap,
  ChevronDown, ChevronUp, CheckSquare, Square, List, Sparkles,
  Layers, AlertTriangle, CheckCircle2, Settings2, BookOpen, Search,
  CheckCircle, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  fmtQty,
  getEffectiveOutputPerHr,
  getEffectiveOutputPerHrConverted,
  calculateTipperFleet,
  deriveMaterialsFromLayerConfig,
  LAYER_DENSITY_DEFAULTS,
  WORKING_HRS_DEFAULT,
  WORKING_DAYS_DEFAULT,
  type LayerConfig,
  type UnitConversionContext,
} from "@shared/planningEngine";
import type {
  BoqItemWithCategory,
  BoqItemEquipmentWithMaster,
  BoqItemLabourRow,
  BoqItemMaterialsRow,
  InsertBoqItemEquipment,
  InsertBoqItemLabour,
  InsertBoqItemMaterials,
  BoqMixTemplateLink,
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

interface RecipeMaterialUsed {
  materialName: string;
  uom: string | null;
  useCount: number;
}

interface PlanningMixTemplate {
  id: number;
  name: string;
  mixType: string;
  bitumenPercent: number | null;
}

interface MixTemplateWithComponents {
  template: PlanningMixTemplate;
  components: Array<{ id: number; materialId: number; materialName: string; percent: number | null; uom: string | null }>;
}

// ─── BulkSelectPanel ─────────────────────────────────────────────────────────────

interface BulkSelectPanelProps<T extends { id: number }> {
  items: T[];
  groupBy: (item: T) => string;
  labelOf: (item: T) => string;
  subLabelOf?: (item: T) => string;
  alreadyAddedIds: Set<number>;
  onAdd: (selected: T[]) => void;
  onClose: () => void;
}

function BulkSelectPanel<T extends { id: number }>({
  items, groupBy, labelOf, subLabelOf, alreadyAddedIds, onAdd, onClose,
}: BulkSelectPanelProps<T>) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClickedRef = useRef<number | null>(null);
  const selectableItems = items.filter((i) => !alreadyAddedIds.has(i.id));

  function toggle(id: number, shiftKey: boolean, flatIdx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedRef.current !== null) {
        const lastIdx = selectableItems.findIndex((i) => i.id === lastClickedRef.current);
        const [lo, hi] = [Math.min(lastIdx, flatIdx), Math.max(lastIdx, flatIdx)];
        const rangeItems = selectableItems.slice(lo, hi + 1);
        const allSelected = rangeItems.every((i) => prev.has(i.id));
        rangeItems.forEach((i) => allSelected ? next.delete(i.id) : next.add(i.id));
      } else {
        prev.has(id) ? next.delete(id) : next.add(id);
      }
      lastClickedRef.current = id;
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === selectableItems.length ? new Set() : new Set(selectableItems.map((i) => i.id)));
  }

  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const g = groupBy(item);
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  }

  const selectedItems = items.filter((i) => selected.has(i.id));

  return (
    <div className="border border-teal-200 bg-teal-50/40 dark:bg-teal-950/20 rounded-lg p-3 space-y-2 mt-2" data-testid="bulk-select-panel">
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-1.5 text-[12px] font-medium text-teal-700 hover:text-teal-900" onClick={toggleAll} data-testid="bulk-select-toggle-all">
          {selected.size === selectableItems.length && selectableItems.length > 0 ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
          {selected.size === selectableItems.length && selectableItems.length > 0 ? "Deselect all" : "Select all"}
        </button>
        <span className="text-[12px] text-muted-foreground">Shift+click to range-select</span>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-3 pr-1">
        {Object.entries(groups).map(([groupName, groupItems]) => (
          <div key={groupName}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{groupName}</p>
            <div className="space-y-0.5">
              {groupItems.map((item) => {
                const isAdded = alreadyAddedIds.has(item.id);
                const isChecked = selected.has(item.id);
                const flatIdx = selectableItems.findIndex((si) => si.id === item.id);
                return (
                  <label key={item.id} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs ${isAdded ? "opacity-40 cursor-not-allowed" : isChecked ? "bg-teal-100 dark:bg-teal-900/40 text-teal-900" : "hover:bg-white dark:hover:bg-slate-800"}`} data-testid={`bulk-select-item-${item.id}`}>
                    <input type="checkbox" className="accent-teal-600 w-3 h-3" checked={isChecked} disabled={isAdded} onChange={() => {}} onClick={(e) => { if (!isAdded) toggle(item.id, e.shiftKey, flatIdx); }} />
                    <span className="flex-1 truncate">{labelOf(item)}</span>
                    {subLabelOf && <span className="text-xs text-muted-foreground shrink-0">{subLabelOf(item)}</span>}
                    {isAdded && <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0">added</Badge>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {selectableItems.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">All types already in recipe</p>}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-teal-200">
        <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white text-sm h-7 flex-1" disabled={selected.size === 0} onClick={() => { onAdd(selectedItems); setSelected(new Set()); }} data-testid="bulk-select-add-button">
          <Plus className="w-3.5 h-3.5 mr-1" />{selected.size === 0 ? "Add selected" : `Add ${selected.size} selected`}
        </Button>
        <Button variant="outline" size="sm" className="text-sm h-7" onClick={onClose} data-testid="bulk-select-cancel">Cancel</Button>
      </div>
    </div>
  );
}

// ─── Layer Config Tab ───────────────────────────────────────────────────────────

const LAYER_TYPE_OPTIONS = [
  { value: "none", label: "— None (manual materials) —" },
  { value: "bituminous", label: "Bituminous Mix (BC / DBM / BM / SDBC)" },
  { value: "granular", label: "Granular Layer (GSB / WMM)" },
  { value: "spray_coat", label: "Spray Coat (Tack / Prime / Fog Seal)" },
  { value: "earthwork", label: "Earthwork / Embankment" },
];

function LayerConfigTab({
  item,
  projectId,
  onLayerConfigChange,
  onPendingSave,
}: {
  item: BoqItemWithCategory;
  projectId: number;
  onLayerConfigChange: (lc: LayerConfig | null) => void;
  onPendingSave?: (fn: (() => Promise<void>) | null) => void;
}) {
  const { toast } = useToast();

  const existingLc = (item.layerConfig as LayerConfig | null) ?? null;

  const [layerType, setLayerType] = useState<LayerConfig["layerType"]>(existingLc?.layerType ?? "none");
  const [mixTemplateId, setMixTemplateId] = useState<string>(existingLc?.mixTemplateId ? String(existingLc.mixTemplateId) : "");
  const [thicknessMm, setThicknessMm] = useState<string>(existingLc?.thicknessMm ? String(existingLc.thicknessMm) : "");
  const [densityTPerCum, setDensityTPerCum] = useState<string>(existingLc?.densityTPerCum ? String(existingLc.densityTPerCum) : "");
  const [granularSource, setGranularSource] = useState<"quarry" | "plant">(existingLc?.granularSource ?? "quarry");
  const [coverageRate, setCoverageRate] = useState<string>(existingLc?.coverageRateKgPerSqm ? String(existingLc.coverageRateKgPerSqm) : "");
  const [coverageMaterial, setCoverageMaterial] = useState<string>(existingLc?.coverageMaterialName ?? "Bitumen Emulsion SS-1");

  const { data: mixTemplates = [] } = useQuery<PlanningMixTemplate[]>({
    queryKey: ["/api/planning/mix-templates"],
    queryFn: async () => {
      const res = await fetch("/api/planning/mix-templates", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  // Mix types compatible with each layer category — used for type-safe link filtering
  const LAYER_COMPAT_MIX_TYPES: Record<string, string[]> = {
    bituminous: ["BC", "DBM", "SDBC", "BM"],
    granular:   ["WMM", "WBM", "GSB", "EG"],
    spray_coat: ["BC"],
  };

  const { data: mixLinks = [] } = useQuery<BoqMixTemplateLink[]>({
    queryKey: ["/api/boq/projects", projectId, "mix-links"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/mix-links`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId && ["bituminous", "granular", "spray_coat"].includes(layerType),
  });

  // Auto-select: when a layer type is chosen and no template is selected, pre-populate
  // mixTemplateId from the project mix link whose mixType is compatible with this layer —
  // but only when exactly ONE compatible link exists to avoid incorrect guesses.
  useEffect(() => {
    if (mixTemplateId || !mixLinks.length) return;
    const compatTypes = LAYER_COMPAT_MIX_TYPES[layerType] ?? [];
    if (!compatTypes.length) return;
    const compatLinks = mixLinks.filter(
      lnk => lnk.mixTemplateId != null && compatTypes.includes((lnk.mixType ?? "").toUpperCase())
    );
    if (compatLinks.length === 1) {
      setMixTemplateId(String(compatLinks[0].mixTemplateId));
    }
  }, [mixLinks, layerType, mixTemplateId]);

  const { data: templateDetail } = useQuery<MixTemplateWithComponents>({
    queryKey: ["/api/planning/mix-templates", mixTemplateId, "components"],
    queryFn: async () => {
      const res = await fetch(`/api/planning/mix-templates/${mixTemplateId}/components`, { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    enabled: !!mixTemplateId && layerType === "bituminous",
  });

  // Auto-fill density when mix type is known
  useEffect(() => {
    if (templateDetail?.template.mixType && !densityTPerCum) {
      const def = LAYER_DENSITY_DEFAULTS[templateDetail.template.mixType.toUpperCase()];
      if (def) setDensityTPerCum(String(def));
    }
  }, [templateDetail?.template.mixType]);

  const layerConfig = useMemo((): LayerConfig | null => {
    if (layerType === "none") return null;
    const lc: LayerConfig = { layerType };
    if (layerType === "bituminous") {
      lc.mixTemplateId = mixTemplateId ? parseInt(mixTemplateId) : null;
      // Store the resolved mix type (e.g. "BC", "DBM") so the planning engine can
      // look up the correct productivity override instead of using a generic alias.
      lc.mixType = templateDetail?.template.mixType?.toUpperCase() ?? null;
      lc.thicknessMm = thicknessMm ? parseFloat(thicknessMm) : null;
      lc.densityTPerCum = densityTPerCum ? parseFloat(densityTPerCum) : null;
    }
    if (layerType === "granular") {
      lc.granularSource = granularSource;
      // Resolve WMM/WBM/GSB mix type from a project mix link compatible with granular
      const granularCompatTypes = ["WMM", "WBM", "GSB", "EG"];
      const granularLink = mixLinks.find(
        lnk => lnk.mixTemplateId != null && granularCompatTypes.includes((lnk.mixType ?? "").toUpperCase())
      );
      if (granularLink) {
        lc.mixType = granularLink.mixType?.toUpperCase() ?? null;
        lc.mixTemplateId = granularLink.mixTemplateId ?? null;
      }
    }
    if (layerType === "spray_coat") {
      lc.coverageRateKgPerSqm = coverageRate ? parseFloat(coverageRate) : null;
      lc.coverageMaterialName = coverageMaterial || null;
    }
    return lc;
  }, [layerType, mixTemplateId, thicknessMm, densityTPerCum, granularSource, coverageRate, coverageMaterial, mixLinks, templateDetail]);

  const derivedRows = useMemo(() => {
    if (!layerConfig) return [];
    const tmpl = templateDetail
      ? { bitumenPercent: templateDetail.template.bitumenPercent, components: templateDetail.components.map(c => ({ materialName: c.materialName, percent: c.percent })) }
      : null;
    return deriveMaterialsFromLayerConfig(layerConfig, item.unit, tmpl);
  }, [layerConfig, templateDetail, item.unit]);

  // Dirty tracking — compare serialised current config against the last-saved value
  const lastSavedLcRef = useRef(JSON.stringify(existingLc));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDirty(JSON.stringify(layerConfig) !== lastSavedLcRef.current);
  }, [layerConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/boq/items/${item.id}`, { layerConfig: layerConfig ?? null });
      // Always PUT materials when a layer type is selected so that:
      //  - derived rows are applied, AND
      //  - stale auto-rows are cleared when config produces no rows
      // (Only skip PUT when layerType is "none", i.e. user wants manual materials)
      if (layerType !== "none") {
        const payload: InsertBoqItemMaterials[] = derivedRows.map((r, i) => ({
          boqItemId: item.id,
          materialName: r.materialName,
          uom: r.uom,
          qtyPerBoqUnit: r.qtyPerBoqUnit,
          wastagePct: 0,
          isAuto: true,
          applicationNote: r.applicationNote ?? null,
          sortOrder: i,
        }));
        await apiRequest("PUT", `/api/boq/items/${item.id}/materials`, { rows: payload });
      }
    },
    onSuccess: async () => {
      lastSavedLcRef.current = JSON.stringify(layerConfig);
      setDirty(false);
      onLayerConfigChange(layerConfig);
      if (layerType !== "none") {
        await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id, "materials"] });
        toast({
          title: derivedRows.length > 0
            ? `Layer config saved — ${derivedRows.length} material rows applied`
            : "Layer config saved — auto materials cleared",
        });
      } else {
        toast({ title: "Layer config saved" });
      }
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  // Register/deregister pending-save function so navigation can auto-save
  useEffect(() => {
    onPendingSave?.(dirty ? () => saveMutation.mutateAsync() : null);
  }, [dirty]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Select the layer type to auto-derive material quantities from plant mix templates or standard layer geometry.</p>

      <div className="space-y-1.5">
        <Label className="text-[12px]">LAYER TYPE</Label>
        <Select value={layerType} onValueChange={(v) => setLayerType(v as LayerConfig["layerType"])}>
          <SelectTrigger className="h-8 text-sm" data-testid="select-layer-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYER_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {layerType === "bituminous" && (
        <div className="rounded-lg border border-teal-100 p-3 space-y-3">
          <p className="text-[12px] font-medium text-teal-700">Bituminous Layer Settings</p>

          {/* Mix template links — project-level links defined in Programme Settings */}
          {mixLinks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] text-muted-foreground">Project-linked templates (from Programme Settings):</p>
              <div className="flex flex-wrap gap-1.5">
                {mixLinks.map((lnk) => {
                  const isActive = String(lnk.mixTemplateId) === mixTemplateId;
                  return (
                    <button
                      key={lnk.id}
                      onClick={() => setMixTemplateId(String(lnk.mixTemplateId))}
                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                        isActive
                          ? "bg-teal-600 text-white border-teal-600"
                          : "bg-white text-teal-700 border-teal-300 hover:bg-teal-50"
                      }`}
                      data-testid={`btn-mix-link-${lnk.mixType}`}
                      title={`Use project-linked template for ${lnk.mixType}: ${lnk.mixTemplateName ?? lnk.mixTemplateId}`}
                    >
                      {lnk.mixType}{lnk.mixTemplateName ? ` — ${lnk.mixTemplateName}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <Label className="text-[12px]">MIX TEMPLATE</Label>
              <Select value={mixTemplateId} onValueChange={setMixTemplateId}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-mix-template">
                  <SelectValue placeholder="Select mix template…" />
                </SelectTrigger>
                <SelectContent>
                  {mixTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} ({t.mixType}{t.bitumenPercent ? ` · ${t.bitumenPercent}% bit` : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">THICKNESS (mm)</Label>
              <Input type="number" step="1" min="1" className="h-8 text-sm mt-0.5" placeholder="e.g. 50" value={thicknessMm} onChange={(e) => setThicknessMm(e.target.value)} data-testid="input-thickness-mm" />
            </div>
            <div>
              <Label className="text-[12px]">DENSITY (T/CUM)</Label>
              <Input type="number" step="0.01" min="1" className="h-8 text-sm mt-0.5" placeholder="e.g. 2.40" value={densityTPerCum} onChange={(e) => setDensityTPerCum(e.target.value)} data-testid="input-density" />
            </div>
            <div className="flex items-end pb-0.5">
              {templateDetail?.template.mixType && (
                <span className="text-[12px] text-muted-foreground">
                  Default: {LAYER_DENSITY_DEFAULTS[templateDetail.template.mixType.toUpperCase()] ?? "—"} T/CUM
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {layerType === "granular" && (
        <div className="rounded-lg border border-amber-100 p-3 space-y-2">
          <p className="text-[12px] font-medium text-amber-700">Granular Layer Source</p>
          <div className="flex gap-3">
            {(["quarry", "plant"] as const).map((src) => (
              <button key={src} onClick={() => setGranularSource(src)} className={`flex-1 rounded border text-xs py-2 font-medium transition-colors ${granularSource === src ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:border-amber-400"}`} data-testid={`btn-granular-${src}`}>
                {src === "quarry" ? "Direct from Quarry" : "Processed at WMM Plant"}
              </button>
            ))}
          </div>
        </div>
      )}

      {layerType === "spray_coat" && (
        <div className="rounded-lg border border-blue-100 p-3 space-y-3">
          <p className="text-[12px] font-medium text-blue-700">Spray Coat Settings</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[12px]">COVERAGE RATE (kg/SQM)</Label>
              <Input type="number" step="0.01" min="0.01" className="h-8 text-sm mt-0.5" placeholder="e.g. 0.30" value={coverageRate} onChange={(e) => setCoverageRate(e.target.value)} data-testid="input-coverage-rate" />
            </div>
            <div>
              <Label className="text-[12px]">MATERIAL NAME</Label>
              <Input className="h-8 text-sm mt-0.5" placeholder="e.g. Bitumen Emulsion SS-1" value={coverageMaterial} onChange={(e) => setCoverageMaterial(e.target.value)} data-testid="input-coverage-material" />
            </div>
          </div>
        </div>
      )}

      {layerType === "earthwork" && (
        <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-3 text-xs text-orange-700">
          Will generate: <span className="font-semibold">Soil / Earth — 1.0 CUM / CUM</span>
        </div>
      )}

      {/* Live preview */}
      {derivedRows.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <p className="text-[12px] font-semibold text-teal-700 mb-2 flex items-center gap-1"><Zap className="w-3 h-3" />Derived Material Preview ({item.unit})</p>
          <div className="space-y-1">
            {derivedRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-slate-700">{r.materialName}</span>
                <span className="text-muted-foreground">{fmtQty(r.qtyPerBoqUnit, 4)} {r.uom} / {item.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          size="sm"
          className="text-sm h-7 bg-teal-700 hover:bg-teal-800 text-white"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-layer-config"
        >
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
          {derivedRows.length > 0 ? `Save & Apply (${derivedRows.length} rows)` : "Save Config"}
        </Button>
        {derivedRows.length > 0 && (
          <p className="text-[12px] text-muted-foreground">Saves config and applies {derivedRows.length} material row{derivedRows.length !== 1 ? "s" : ""}</p>
        )}
      </div>
    </div>
  );
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

interface ProgramSettingsMinimal {
  avgTipperSpeedKmHr: number;
  tipperCapacityT: number;
  loadTimeMin: number;
  unloadTimeMin: number;
  hmpChainageKm: number | null;
  wmmPlantChainageKm: number | null;
  quarryChainageKm: number | null;
  borrowChainageKm: number | null;
  disposalChainageKm: number | null;
  rmcChainageKm: number | null;
}

function EquipmentTab({
  boqItemId, boqUnit, masterList, layerConfig, projectId, onPendingSave,
}: {
  boqItemId: number;
  boqUnit: string;
  masterList: PlanningEquipTypeMinimal[];
  layerConfig: LayerConfig | null;
  projectId?: number;
  onPendingSave?: (fn: (() => Promise<void>) | null) => void;
}) {
  const { toast } = useToast();
  const [showPanel, setShowPanel] = useState(false);
  const [showTipperFleet, setShowTipperFleet] = useState(false);
  const [tipperDefaultsApplied, setTipperDefaultsApplied] = useState(false);

  const { data: progSettings } = useQuery<ProgramSettingsMinimal | null>({
    queryKey: ["/api/boq/projects", projectId, "program-settings"],
    queryFn: async () => {
      if (!projectId || projectId <= 0) return null;
      const res = await fetch(`/api/boq/projects/${projectId}/program-settings`, { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    enabled: !!projectId && projectId > 0,
    staleTime: 60_000,
  });

  // Tipper fleet inputs
  const [tipperCapacity, setTipperCapacity] = useState("8");
  const [haulDistance, setHaulDistance] = useState("5");
  const [avgSpeed, setAvgSpeed] = useState("30");
  const [loadTime, setLoadTime] = useState("5");
  const [unloadTime, setUnloadTime] = useState("5");

  useEffect(() => {
    if (progSettings && !tipperDefaultsApplied) {
      setAvgSpeed(String(progSettings.avgTipperSpeedKmHr ?? 30));
      setTipperCapacity(String(progSettings.tipperCapacityT ?? 8));
      setLoadTime(String(progSettings.loadTimeMin ?? 5));
      setUnloadTime(String(progSettings.unloadTimeMin ?? 5));
      const lc = layerConfig;
      let sourceKm: number | null = null;
      if (lc?.layerType === "bituminous") sourceKm = progSettings.hmpChainageKm;
      else if (lc?.layerType === "spray_coat") sourceKm = progSettings.hmpChainageKm;
      else if (lc?.layerType === "granular" && (lc as any).granularSource === "plant") sourceKm = progSettings.wmmPlantChainageKm;
      else if (lc?.layerType === "granular") sourceKm = progSettings.quarryChainageKm;
      else if (lc?.layerType === "earthwork" && (lc as any).earthworkType === "cut") sourceKm = progSettings.disposalChainageKm;
      else if (lc?.layerType === "earthwork") sourceKm = progSettings.borrowChainageKm ?? progSettings.disposalChainageKm;
      else if (lc?.layerType === "concrete") sourceKm = progSettings.rmcChainageKm;
      // null for "none" or unknown types — no auto-fill
      if (sourceKm != null && sourceKm > 0) {
        setHaulDistance(String(sourceKm));
      }
      setTipperDefaultsApplied(true);
    }
  }, [progSettings, layerConfig, tipperDefaultsApplied]);

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
    if (!isLoading) { setRows(existing.length ? existing.map(makeEquipRow) : []); setDirty(false); }
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
          qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : 0,
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

  // Register/deregister pending save with parent dialog so navigation can auto-save
  useEffect(() => {
    onPendingSave?.(dirty ? () => saveMutation.mutateAsync() : null);
  }, [dirty]);

  function updateRow(key: string, field: keyof EquipRow, value: string) {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      if (field === "planningEquipTypeId" && value !== "__manual__") {
        const planType = masterList.find((m) => m.id === parseInt(value));
        if (planType) updated.equipmentName = planType.name;
      }
      return updated;
    }));
    setDirty(true);
  }

  function addFromMaster(selected: PlanningEquipTypeMinimal[]) {
    const newRows = selected.map((m) => ({ key: Math.random().toString(36).slice(2), planningEquipTypeId: String(m.id), equipmentName: m.name, qtyPerBoqUnit: "", count: "1", notes: "" }));
    setRows((prev) => [...prev, ...newRows]);
    setDirty(true);
    setShowPanel(false);
  }

  const alreadyAddedIds = new Set(rows.filter((r) => r.planningEquipTypeId !== "__manual__").map((r) => parseInt(r.planningEquipTypeId)));

  // Conversion context from layerConfig
  const ctx: UnitConversionContext = {
    densityTPerCum: layerConfig?.densityTPerCum ?? null,
    thicknessMm: layerConfig?.thicknessMm ?? null,
  };

  // Calculate converted outputs per row + find bottleneck
  const convertedOutputs = useMemo(() => {
    return rows.map((row) => {
      const planType = row.planningEquipTypeId !== "__manual__" ? masterList.find((m) => m.id === parseInt(row.planningEquipTypeId)) : null;
      if (!planType) return null;
      const eq = { outputUnit: null, outputTheoretical: null, outputEfficiency: null, standardOutputs: planType.standardOutputs, count: parseInt(row.count) || 1 };
      return getEffectiveOutputPerHrConverted(eq, boqUnit, ctx);
    });
  }, [rows, masterList, boqUnit, ctx.densityTPerCum, ctx.thicknessMm]);

  const minOutput = useMemo(() => {
    const vals = convertedOutputs.filter((o) => o && o.outputPerHr > 0).map((o) => o!.outputPerHr);
    return vals.length ? Math.min(...vals) : null;
  }, [convertedOutputs]);

  // Detect tipper rows
  const hasTipper = rows.some((r) => /tipper|truck|dumper/i.test(r.equipmentName));

  // Bottleneck plantOutput for tipper fleet (highest conversion output = paver/spreader)
  const paverOutput = useMemo(() => {
    const vals = convertedOutputs.filter((o) => o && o.outputPerHr > 0).map((o) => o!.outputPerHr);
    return vals.length ? Math.max(...vals) : null;
  }, [convertedOutputs]);

  const tipperResult = useMemo(() => {
    if (!paverOutput) return null;
    return calculateTipperFleet({
      plantOutputMTperHr: (ctx.densityTPerCum ?? 2.35) * paverOutput,
      tipperCapacityMT: parseFloat(tipperCapacity) || 8,
      haulDistanceKm: parseFloat(haulDistance) || 5,
      avgSpeedKmHr: parseFloat(avgSpeed) || 30,
      loadingTimeMins: parseFloat(loadTime) || 5,
      unloadingTimeMins: parseFloat(unloadTime) || 5,
    });
  }, [paverOutput, ctx.densityTPerCum, tipperCapacity, haulDistance, avgSpeed, loadTime, unloadTime]);

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Equipment attached to this BOQ item drives automatic duration calculation in the Work Programme.</p>

      {rows.map((row, idx) => {
        const co = convertedOutputs[idx];
        const isBottleneck = co && co.outputPerHr > 0 && co.outputPerHr === minOutput;
        const planType = row.planningEquipTypeId !== "__manual__" ? masterList.find((m) => m.id === parseInt(row.planningEquipTypeId)) : null;
        return (
          <div key={row.key} className={`rounded-lg border p-3 space-y-2 ${isBottleneck ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-slate-50/50 dark:bg-slate-900/20"}`}>
            {isBottleneck && (
              <div className="flex items-center gap-1 text-[12px] text-amber-700 font-medium">
                <AlertTriangle className="w-3 h-3" /> Bottleneck — limits auto-duration
              </div>
            )}
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[12px]">EQUIPMENT</Label>
                <Select value={row.planningEquipTypeId} onValueChange={(v) => updateRow(row.key, "planningEquipTypeId", v)}>
                  <SelectTrigger className="h-8 text-sm" data-testid={`select-equip-master-${row.key}`}>
                    <SelectValue placeholder="Select from planning types…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">— Enter manually —</SelectItem>
                    {masterList.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {row.planningEquipTypeId === "__manual__" && (
                  <Input className="h-8 text-sm mt-1" placeholder="Equipment name" value={row.equipmentName} onChange={(e) => updateRow(row.key, "equipmentName", e.target.value)} data-testid={`input-equip-name-${row.key}`} />
                )}
              </div>
              <div>
                <Label className="text-[12px]">HRS / BOQ UNIT</Label>
                <Input type="number" step="0.001" className="h-8 text-sm" value={row.qtyPerBoqUnit} onChange={(e) => updateRow(row.key, "qtyPerBoqUnit", e.target.value)} data-testid={`input-equip-qty-${row.key}`} />
              </div>
              <div>
                <Label className="text-[12px]">COUNT</Label>
                <Input type="number" min="1" className="h-8 text-sm" value={row.count} onChange={(e) => updateRow(row.key, "count", e.target.value)} data-testid={`input-equip-count-${row.key}`} />
              </div>
              <button className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }} data-testid={`button-remove-equip-${row.key}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {co && co.outputPerHr > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-[12px] text-teal-700">
                  <Zap className="w-3 h-3" />
                  {co.convertedVia === "converted" && co.nativeUnit
                    ? `${fmtQty(co.outputPerHr / (parseInt(row.count) || 1), 2)} ${co.nativeUnit}/hr → `
                    : ""
                  }
                  <span className="font-semibold">{fmtQty(co.outputPerHr, 2)} {boqUnit}/hr</span>
                </span>
                {co.convertedVia === "converted" && (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-blue-600 border-blue-300">unit-converted</Badge>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors"
                  title={`Auto-fill: 1 ÷ ${fmtQty(co.outputPerHr, 2)} = ${(1 / co.outputPerHr).toFixed(5)} hr/${boqUnit}`}
                  onClick={() => { updateRow(row.key, "qtyPerBoqUnit", (1 / co.outputPerHr).toFixed(5)); setDirty(true); }}
                  data-testid={`button-autofill-equip-${row.key}`}
                >
                  <Zap className="w-2.5 h-2.5" /> Auto-fill
                </button>
              </div>
            )}
            {planType && !(planType.standardOutputs?.length) && (
              <div className="flex items-center gap-1 text-[12px] text-amber-600">
                <Info className="w-3 h-3" /> No standard outputs — duration auto-calc unavailable.
              </div>
            )}
          </div>
        );
      })}

      {showPanel && (
        <BulkSelectPanel items={masterList} groupBy={(m) => m.category} labelOf={(m) => m.name} subLabelOf={(m) => { if (!m.standardOutputs?.length) return ""; const s = m.standardOutputs[0]; return `${s.outputPerHr} ${s.unit}/hr`; }} alreadyAddedIds={alreadyAddedIds} onAdd={addFromMaster} onClose={() => setShowPanel(false)} />
      )}

      {/* Tipper Fleet Check Panel */}
      {hasTipper && rows.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30">
          <button className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-semibold text-blue-700" onClick={() => setShowTipperFleet(p => !p)}>
            <Settings2 className="w-3 h-3" />
            Tipper Fleet Check
            {showTipperFleet ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showTipperFleet && (
            <div className="px-3 pb-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Tipper capacity (MT)", val: tipperCapacity, set: setTipperCapacity, id: "tipper-cap" },
                  { label: "Haul distance (km)", val: haulDistance, set: setHaulDistance, id: "haul-dist" },
                  { label: "Avg speed (km/hr)", val: avgSpeed, set: setAvgSpeed, id: "avg-speed" },
                  { label: "Loading time (min)", val: loadTime, set: setLoadTime, id: "load-time" },
                  { label: "Unload time (min)", val: unloadTime, set: setUnloadTime, id: "unload-time" },
                ].map((f) => (
                  <div key={f.id}>
                    <Label className="text-xs">{f.label.toUpperCase()}</Label>
                    <Input type="number" step="0.1" className="h-7 text-sm" value={f.val} onChange={(e) => f.set(e.target.value)} data-testid={`tipper-${f.id}`} />
                  </div>
                ))}
              </div>
              {tipperResult && (
                <div className={`rounded p-2 text-xs flex flex-wrap gap-4 ${tipperResult.isAdequate ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                  <span>{tipperResult.isAdequate ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-500" />}
                    {tipperResult.isAdequate ? "Adequate" : "Tipper-limited"}
                  </span>
                  <span>Cycle: <strong>{fmtQty(tipperResult.cycleTimeMins, 1)} min</strong></span>
                  <span>Tippers needed: <strong>{tipperResult.tippersNeeded}</strong></span>
                  <span>Delivery rate: <strong>{fmtQty(tipperResult.deliveryRateMTperHr, 1)} MT/hr</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setShowPanel((p) => !p)} className="text-sm h-7 bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-add-from-master-equip">
            <List className="w-3.5 h-3.5 mr-1" />Add from Master
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRows((p) => [...p, makeEquipRow()]); setDirty(true); }} className="text-sm h-7" data-testid="button-add-equip-row">
            <Plus className="w-3.5 h-3.5 mr-1" /> Manual row
          </Button>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="bg-teal-700 hover:bg-teal-800 text-white text-sm h-7" data-testid="button-save-equip-recipe">
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Save
        </Button>
      </div>
    </div>
  );
}

// ─── Labour Recipe Tab ──────────────────────────────────────────────────────────

interface LabRow { key: string; planningLabourTypeId: string; designation: string; qtyPerBoqUnit: string; notes: string; }

function makeLabRow(r?: BoqItemLabourRow): LabRow {
  return { key: Math.random().toString(36).slice(2), planningLabourTypeId: "__manual__", designation: r?.designation ?? "", qtyPerBoqUnit: r?.qtyPerBoqUnit != null ? String(r.qtyPerBoqUnit) : "", notes: r?.notes ?? "" };
}

function LabourTab({ boqItemId, boqUnit, labourTypeList, onPendingSave }: { boqItemId: number; boqUnit: string; labourTypeList: PlanningLabourTypeMinimal[]; onPendingSave?: (fn: (() => Promise<void>) | null) => void }) {
  const { toast } = useToast();
  const [showPanel, setShowPanel] = useState(false);
  const { data: existing = [], isLoading } = useQuery<BoqItemLabourRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "labour"],
    queryFn: async () => { const res = await fetch(`/api/boq/items/${boqItemId}/labour`, { credentials: "include" }); return res.ok ? res.json() : []; },
  });
  const [rows, setRows] = useState<LabRow[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!isLoading) { setRows(existing.length ? existing.map(makeLabRow) : []); setDirty(false); } }, [existing, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: InsertBoqItemLabour[] = rows.filter((r) => r.designation.trim()).map((r, i) => ({
        boqItemId, designation: r.designation.trim(), qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : 0, notes: r.notes || null, sortOrder: i,
      }));
      await apiRequest("PUT", `/api/boq/items/${boqItemId}/labour`, { rows: payload });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", boqItemId, "labour"] }); toast({ title: "Labour recipe saved" }); setDirty(false); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  useEffect(() => {
    onPendingSave?.(dirty ? () => saveMutation.mutateAsync() : null);
  }, [dirty]);

  function updateLabRow(key: string, field: keyof LabRow, value: string) {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      if (field === "planningLabourTypeId" && value !== "__manual__") {
        const lt = labourTypeList.find((l) => l.id === parseInt(value));
        if (lt) updated.designation = lt.designation;
      }
      return updated;
    }));
    setDirty(true);
  }

  function addFromMaster(selected: PlanningLabourTypeMinimal[]) {
    setRows((prev) => [...prev, ...selected.map((l) => ({ key: Math.random().toString(36).slice(2), planningLabourTypeId: String(l.id), designation: l.designation, qtyPerBoqUnit: "", notes: "" }))]);
    setDirty(true);
    setShowPanel(false);
  }

  const existingDesignations = new Set(rows.map((r) => r.designation.toLowerCase()));
  const alreadyAddedIds = new Set(labourTypeList.filter((l) => existingDesignations.has(l.designation.toLowerCase())).map((l) => l.id));

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Labour gangs required per unit of this BOQ item.</p>
      {rows.map((row) => (
        <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="grid grid-cols-[2fr_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-[12px]">LABOUR TYPE</Label>
              <Select value={row.planningLabourTypeId} onValueChange={(v) => updateLabRow(row.key, "planningLabourTypeId", v)}>
                <SelectTrigger className="h-8 text-sm" data-testid={`select-labour-type-${row.key}`}><SelectValue placeholder="Select from planning types…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Enter manually —</SelectItem>
                  {labourTypeList.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.designation} <span className="text-[12px] text-muted-foreground">({l.skillTier})</span></SelectItem>)}
                </SelectContent>
              </Select>
              {row.planningLabourTypeId === "__manual__" && (
                <Input className="h-8 text-sm mt-1" placeholder="e.g. Skilled Mason" value={row.designation} onChange={(e) => updateLabRow(row.key, "designation", e.target.value)} data-testid={`input-labour-cat-${row.key}`} />
              )}
            </div>
            <div>
              <Label className="text-[12px]">DAYS / {boqUnit}</Label>
              <Input type="number" step="0.001" className="h-8 text-sm" value={row.qtyPerBoqUnit} onChange={(e) => updateLabRow(row.key, "qtyPerBoqUnit", e.target.value)} data-testid={`input-labour-qty-${row.key}`} />
            </div>
            <button className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }} data-testid={`button-remove-labour-${row.key}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {showPanel && <BulkSelectPanel items={labourTypeList} groupBy={(l) => l.skillTier} labelOf={(l) => l.designation} alreadyAddedIds={alreadyAddedIds} onAdd={addFromMaster} onClose={() => setShowPanel(false)} />}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setShowPanel((p) => !p)} className="text-sm h-7 bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-add-from-master-labour"><List className="w-3.5 h-3.5 mr-1" />Add from Master</Button>
          <Button variant="outline" size="sm" onClick={() => { setRows((p) => [...p, makeLabRow()]); setDirty(true); }} className="text-sm h-7" data-testid="button-add-labour-row"><Plus className="w-3.5 h-3.5 mr-1" /> Manual row</Button>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="bg-teal-700 hover:bg-teal-800 text-white text-sm h-7" data-testid="button-save-labour-recipe">
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Save
        </Button>
      </div>
    </div>
  );
}

// ─── Materials Recipe Tab ───────────────────────────────────────────────────────

interface MatRow { key: string; materialName: string; uom: string; qtyPerBoqUnit: string; notes: string; applicationNote: string; isAuto: boolean; }

function makeMatRow(r?: BoqItemMaterialsRow): MatRow {
  return { key: Math.random().toString(36).slice(2), materialName: r?.materialName ?? "", uom: r?.uom ?? "", qtyPerBoqUnit: r?.qtyPerBoqUnit != null ? String(r.qtyPerBoqUnit) : "", notes: r?.notes ?? "", applicationNote: r?.applicationNote ?? "", isAuto: r?.isAuto ?? false };
}

function MaterialsTab({ boqItemId, boqUnit, projectId, onPendingSave }: { boqItemId: number; boqUnit: string; projectId: number; onPendingSave?: (fn: (() => Promise<void>) | null) => void }) {
  const { toast } = useToast();
  const { data: existing = [], isLoading } = useQuery<BoqItemMaterialsRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "materials"],
    queryFn: async () => { const res = await fetch(`/api/boq/items/${boqItemId}/materials`, { credentials: "include" }); return res.ok ? res.json() : []; },
  });
  const { data: suggestions = [] } = useQuery<RecipeMaterialUsed[]>({
    queryKey: ["/api/boq/projects", projectId, "recipe-materials-used"],
    queryFn: async () => { const res = await fetch(`/api/boq/projects/${projectId}/recipe-materials-used`, { credentials: "include" }); return res.ok ? res.json() : []; },
    enabled: projectId > 0,
  });
  const [rows, setRows] = useState<MatRow[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!isLoading) { setRows(existing.length ? existing.map(makeMatRow) : []); setDirty(false); } }, [existing, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: InsertBoqItemMaterials[] = rows.filter((r) => r.materialName.trim()).map((r, i) => ({
        boqItemId, materialName: r.materialName.trim(), uom: r.uom.trim() || null, qtyPerBoqUnit: r.qtyPerBoqUnit ? parseFloat(r.qtyPerBoqUnit) : 0,
        notes: r.notes || null, applicationNote: r.applicationNote || null, isAuto: r.isAuto, sortOrder: i,
      }));
      await apiRequest("PUT", `/api/boq/items/${boqItemId}/materials`, { rows: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", boqItemId, "materials"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "recipe-materials-used"] });
      toast({ title: "Materials recipe saved" });
      setDirty(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  useEffect(() => {
    onPendingSave?.(dirty ? () => saveMutation.mutateAsync() : null);
  }, [dirty]);

  function insertSuggestion(s: RecipeMaterialUsed) {
    if (rows.some((r) => r.materialName.toLowerCase() === s.materialName.toLowerCase())) {
      toast({ title: "Already in recipe", variant: "destructive" }); return;
    }
    setRows((prev) => [...prev, { key: Math.random().toString(36).slice(2), materialName: s.materialName, uom: s.uom ?? "", qtyPerBoqUnit: "", notes: "", applicationNote: "", isAuto: false }]);
    setDirty(true);
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  const autoRows = rows.filter((r) => r.isAuto);
  const manualRows = rows.filter((r) => !r.isAuto);
  const filteredSuggestions = suggestions.filter((s) => !rows.some((r) => r.materialName.toLowerCase() === s.materialName.toLowerCase()));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Materials consumed per unit of this BOQ item (drives BOM demand).</p>

      {filteredSuggestions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2">
          <div className="flex items-center gap-1 mb-1.5"><Sparkles className="w-3 h-3 text-amber-600" /><span className="text-[12px] font-medium text-amber-700">Used elsewhere in this project</span></div>
          <div className="flex flex-wrap gap-1.5">
            {filteredSuggestions.map((s) => (
              <button key={s.materialName} onClick={() => insertSuggestion(s)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] bg-white border border-amber-200 hover:border-teal-400 hover:bg-teal-50 transition-colors" data-testid={`suggestion-chip-${s.materialName.replace(/\s+/g, "-").toLowerCase()}`}>
                <Plus className="w-2.5 h-2.5 text-teal-600" />{s.materialName}{s.uom && <span className="text-muted-foreground">({s.uom})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Auto rows (read-only) */}
      {autoRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-1.5 flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> Auto-derived from Layer Config</p>
          {autoRows.map((row) => (
            <div key={row.key} className="rounded border border-teal-100 bg-teal-50/30 px-2.5 py-1.5 mb-1.5">
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-teal-700 border-teal-300 shrink-0">⚙ Auto</Badge>
                  <span className="text-xs text-slate-700 truncate">{row.materialName}</span>
                </div>
                <span className="text-xs text-muted-foreground">{row.uom}</span>
                <span className="text-xs font-mono text-right">{row.qtyPerBoqUnit ? fmtQty(parseFloat(row.qtyPerBoqUnit), 4) : "—"}</span>
                <button className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }} title="Remove auto row" data-testid={`button-remove-auto-mat-${row.key}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {row.applicationNote && (
                <p className="text-[12px] text-blue-600 mt-0.5 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />{row.applicationNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual rows */}
      {manualRows.length > 0 && (
        <div>
          {autoRows.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Manual</p>}
          {manualRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end mb-2">
              <div>
                <Label className="text-[12px]">MATERIAL NAME</Label>
                <Input className="h-8 text-sm" placeholder="e.g. Bitumen VG-30" value={row.materialName} onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, materialName: e.target.value } : r)); setDirty(true); }} data-testid={`input-mat-name-${row.key}`} />
              </div>
              <div>
                <Label className="text-[12px]">UNIT</Label>
                <Input className="h-8 text-sm" placeholder="MT / CUM" value={row.uom} onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, uom: e.target.value } : r)); setDirty(true); }} data-testid={`input-mat-unit-${row.key}`} />
              </div>
              <div>
                <Label className="text-[12px]">QTY / {boqUnit}</Label>
                <Input type="number" step="0.001" className="h-8 text-sm" value={row.qtyPerBoqUnit} onChange={(e) => { setRows((p) => p.map((r) => r.key === row.key ? { ...r, qtyPerBoqUnit: e.target.value } : r)); setDirty(true); }} data-testid={`input-mat-qty-${row.key}`} />
              </div>
              <button className="mb-0.5 p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" onClick={() => { setRows((p) => p.filter((r) => r.key !== row.key)); setDirty(true); }} data-testid={`button-remove-mat-${row.key}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" className="text-sm h-7" onClick={() => { setRows((p) => [...p, makeMatRow()]); setDirty(true); }} data-testid="button-add-mat-row"><Plus className="w-3.5 h-3.5 mr-1" /> Add Material</Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="bg-teal-700 hover:bg-teal-800 text-white text-sm h-7" data-testid="button-save-mat-recipe">
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Save
        </Button>
      </div>
    </div>
  );
}

// ─── Map to Norm Modal ──────────────────────────────────────────────────────────

interface SnlSearchResult {
  id: number;
  itemCode: string;
  shortLabel: string;
  description: string;
  unit: string;
  workCategory: string;
  sourceName: string;
  sourceCode: string;
  shiftOutput: number | null;
  outputUnit: string | null;
  hasGradingVariants: boolean;
  isMixSpecific: boolean;
}

interface SnlMapping {
  id: number;
  boqItemId: number;
  snlItemId: number;
  projectCategory: string;
  gradingVariant: string | null;
  mappedBy: string;
  mappedAt: string;
}

const CATEGORY_LABELS = ["LARGE", "MEDIUM", "SMALL"];
const GRADING_OPTIONS: Record<string, string[]> = {
  "4.01A": ["Grading I", "Grading II", "Grading III"],
  "4.14":  ["Grading I", "Grading II", "Grading III", "Grading IV"],
  "5.04B": ["Grading I", "Grading II"],
  "5.05":  ["Grading A", "Grading B", "Grading C"],
};

function MapToNormModal({ item, onClose }: { item: BoqItemWithCategory; onClose: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selectedSnlId, setSelectedSnlId] = useState<number | null>(null);
  const [projectCategory, setProjectCategory] = useState("MEDIUM");
  const [gradingVariant, setGradingVariant] = useState("");

  const { data: existingMapping } = useQuery<SnlMapping | null>({
    queryKey: ["/api/snl/mappings", item.id],
    queryFn: async () => {
      const res = await fetch(`/api/snl/mappings/${item.id}`, { credentials: "include" });
      return res.ok ? res.json() : null;
    },
  });

  const { data: results = [], isFetching } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/search", q],
    queryFn: async () => {
      const res = await fetch(`/api/snl/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: q.trim().length > 1 || q === "",
  });

  const selectedItem = results.find(r => r.id === selectedSnlId);
  const codePrefix = selectedItem?.itemCode?.split(".").slice(0, 2).join(".") ?? "";
  const gradingOptions = GRADING_OPTIONS[codePrefix] ?? [];

  const applyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/snl/mappings/${item.id}/apply`, {
        snlItemId: selectedSnlId,
        projectCategory,
        gradingVariant: gradingVariant || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/mappings", item.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id, "equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id, "labour"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id, "materials"] });
      toast({ title: "Norms applied — equipment, labour & materials populated from SNL" });
      onClose();
    },
    onError: () => toast({ title: "Failed to apply norms", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/snl/mappings/${item.id}`, undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/mappings", item.id] });
      toast({ title: "Norm mapping removed" });
    },
    onError: () => toast({ title: "Remove failed", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-600" />
            Map to Standard Norm
            <span className="text-sm font-normal text-muted-foreground truncate max-w-[220px]">— {item.description}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Current mapping banner */}
          {existingMapping && (
            <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="text-sm flex-1 text-teal-700">
                Currently mapped · SNL item #{existingMapping.snlItemId} · {existingMapping.projectCategory}{existingMapping.gradingVariant ? ` · ${existingMapping.gradingVariant}` : ""}
              </span>
              <button
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
                className="text-[12px] text-red-600 hover:text-red-800 flex items-center gap-0.5"
                data-testid="button-remove-snl-mapping"
              >
                {removeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Remove
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by item code or description (e.g. DBM, WMM, embankment)…"
              value={q}
              onChange={e => setQ(e.target.value)}
              data-testid="input-norm-search"
            />
            {isFetching && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedSnlId(r.id === selectedSnlId ? null : r.id); setGradingVariant(""); }}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors ${selectedSnlId === r.id ? "border-teal-500 bg-teal-50/60" : "border-slate-200 hover:border-teal-300 hover:bg-slate-50/50"}`}
                  data-testid={`norm-result-${r.id}`}
                >
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[12px] font-mono font-semibold text-teal-700 shrink-0">{r.itemCode}</span>
                      <span className="text-sm font-medium truncate">{r.shortLabel}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">{r.sourceCode}</span>
                      {r.hasGradingVariants && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-300 text-amber-600">grading</Badge>}
                    </div>
                  </div>
                  {r.shiftOutput && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">{r.shiftOutput} {r.outputUnit}/shift</p>
                  )}
                </button>
              ))}
            </div>
          )}
          {q.length > 1 && !isFetching && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">No norms found for "{q}".</p>
          )}
          {q.length === 0 && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">Type to search the norms library (e.g. "WMM", "5.04", "embankment")</p>
          )}

          {/* Apply options — shown when an item is selected */}
          {selectedItem && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3 space-y-3">
              <p className="text-[12px] font-semibold text-teal-700">Apply Options for {selectedItem.itemCode} — {selectedItem.shortLabel}</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">PROJECT CATEGORY</Label>
                  <select
                    value={projectCategory}
                    onChange={e => setProjectCategory(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 mt-0.5"
                    data-testid="select-project-category"
                  >
                    {CATEGORY_LABELS.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="ALL">ALL (average)</option>
                  </select>
                </div>

                {gradingOptions.length > 0 && (
                  <div>
                    <Label className="text-[12px]">GRADING VARIANT</Label>
                    <select
                      value={gradingVariant}
                      onChange={e => setGradingVariant(e.target.value)}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 mt-0.5"
                      data-testid="select-grading-variant"
                    >
                      <option value="">— None / Default —</option>
                      {gradingOptions.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="rounded border border-amber-200 bg-amber-50/40 px-2.5 py-1.5">
                <p className="text-[12px] text-amber-700">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Applying will <strong>replace</strong> all current equipment, labour and materials on this item with norms from {selectedItem.sourceCode}.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t gap-2">
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button
            size="sm"
            disabled={!selectedSnlId || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
            className="bg-teal-600 hover:bg-teal-700 text-white"
            data-testid="button-apply-norm"
          >
            {applyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
            Apply Norms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dialog ────────────────────────────────────────────────────────────────

export function BoqItemRecipeDialog({
  item,
  allItems,
  onClose,
}: {
  item: BoqItemWithCategory;
  allItems?: BoqItemWithCategory[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState("layer-config");
  const [showMapToNorm, setShowMapToNorm] = useState(false);

  // Navigation state — currentItem drives all tab queries via key
  const [currentItem, setCurrentItem] = useState<BoqItemWithCategory>(item);
  const [localLayerConfig, setLocalLayerConfig] = useState<LayerConfig | null>(
    (currentItem.layerConfig as LayerConfig | null) ?? null
  );

  // Tabs register their pending-save function here so navigation can auto-save
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const handlePendingSave = useCallback((fn: (() => Promise<void>) | null) => {
    pendingSaveRef.current = fn;
  }, []);

  // Navigate to another item — auto-saves unsaved changes in the active tab first.
  // If the save fails, navigation is aborted so the user does not lose edits.
  async function goToItem(next: BoqItemWithCategory) {
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current();
        toast({ title: "Changes saved" });
      } catch {
        toast({ title: "Could not save — please try again before navigating", variant: "destructive" });
        return; // abort navigation on save failure
      }
      pendingSaveRef.current = null;
    }
    setCurrentItem(next);
    setLocalLayerConfig((next.layerConfig as LayerConfig | null) ?? null);
  }

  const navList = allItems && allItems.length > 1 ? allItems : null;
  const currentIndex = navList ? navList.findIndex((i) => i.id === currentItem.id) : -1;
  const hasPrev = navList && currentIndex > 0;
  const hasNext = navList && currentIndex < navList.length - 1;

  const { data: masterList = [] } = useQuery<PlanningEquipTypeMinimal[]>({
    queryKey: ["/api/planning/equipment-types"],
    queryFn: async () => { const res = await fetch("/api/planning/equipment-types", { credentials: "include" }); return res.ok ? res.json() : []; },
  });
  const { data: labourTypeList = [] } = useQuery<PlanningLabourTypeMinimal[]>({
    queryKey: ["/api/planning/labour-types"],
    queryFn: async () => { const res = await fetch("/api/planning/labour-types", { credentials: "include" }); return res.ok ? res.json() : []; },
  });

  const { data: existingMapping } = useQuery<{ snlItemId: number; projectCategory: string } | null>({
    queryKey: ["/api/snl/mappings", currentItem.id],
    queryFn: async () => {
      const res = await fetch(`/api/snl/mappings/${currentItem.id}`, { credentials: "include" });
      return res.ok ? res.json() : null;
    },
  });

  const itemLabel = (currentItem as any).itemName || currentItem.description.slice(0, 50);

  return (
    <>
      {showMapToNorm && <MapToNormModal item={currentItem} onClose={() => setShowMapToNorm(false)} />}
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 min-w-0">
              {/* Navigation arrows */}
              {navList && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => hasPrev && goToItem(navList[currentIndex - 1])}
                    disabled={!hasPrev}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous item"
                    data-testid="button-recipe-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {currentIndex + 1} / {navList.length}
                  </span>
                  <button
                    onClick={() => hasNext && goToItem(navList[currentIndex + 1])}
                    disabled={!hasNext}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next item"
                    data-testid="button-recipe-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              <DialogTitle className="text-base flex items-center gap-2 min-w-0">
                <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span className="truncate" title={currentItem.description}>{itemLabel}</span>
                <span className="text-sm font-normal text-muted-foreground flex-shrink-0">({currentItem.unit})</span>
                {existingMapping && (
                  <Badge variant="outline" className="text-xs h-4 px-1.5 border-teal-300 text-teal-700 flex-shrink-0">
                    <BookOpen className="w-2.5 h-2.5 mr-0.5" />SNL
                  </Badge>
                )}
              </DialogTitle>
            </div>
            {currentItem.itemCode && (
              <p className="text-[12px] font-mono text-muted-foreground mt-0.5 ml-1">{currentItem.itemCode}</p>
            )}
          </DialogHeader>
          {/* Key on currentItem.id so all tab state resets when navigating */}
          <div className="flex-1 overflow-y-auto" key={currentItem.id}>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-3">
                <TabsTrigger value="layer-config" className="flex items-center gap-1.5 text-sm"><Layers className="w-3.5 h-3.5" />Layer Config</TabsTrigger>
                <TabsTrigger value="equipment" className="flex items-center gap-1.5 text-sm"><Wrench className="w-3.5 h-3.5" />Equipment</TabsTrigger>
                <TabsTrigger value="labour" className="flex items-center gap-1.5 text-sm"><Users className="w-3.5 h-3.5" />Labour</TabsTrigger>
                <TabsTrigger value="materials" className="flex items-center gap-1.5 text-sm"><Package className="w-3.5 h-3.5" />Materials</TabsTrigger>
              </TabsList>
              <TabsContent value="layer-config"><LayerConfigTab item={currentItem} projectId={currentItem.boqProjectId} onLayerConfigChange={setLocalLayerConfig} onPendingSave={handlePendingSave} /></TabsContent>
              <TabsContent value="equipment"><EquipmentTab boqItemId={currentItem.id} boqUnit={currentItem.unit} masterList={masterList} layerConfig={localLayerConfig} projectId={currentItem.boqProjectId} onPendingSave={handlePendingSave} /></TabsContent>
              <TabsContent value="labour"><LabourTab boqItemId={currentItem.id} boqUnit={currentItem.unit} labourTypeList={labourTypeList} onPendingSave={handlePendingSave} /></TabsContent>
              <TabsContent value="materials"><MaterialsTab boqItemId={currentItem.id} boqUnit={currentItem.unit} projectId={currentItem.boqProjectId} onPendingSave={handlePendingSave} /></TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="pt-2 border-t flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMapToNorm(true)}
              className="text-teal-700 border-teal-300 hover:bg-teal-50"
              data-testid="button-map-to-norm"
            >
              <BookOpen className="w-3.5 h-3.5 mr-1" />
              Map to Norm
            </Button>
            <Button variant="outline" onClick={onClose} size="sm">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Inline Compact Badge ───────────────────────────────────────────────────────

export function BoqItemRecipeBadge({ boqItemId }: { boqItemId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: equipment = [] } = useQuery<BoqItemEquipmentWithMaster[]>({
    queryKey: ["/api/boq/items", boqItemId, "equipment"],
    queryFn: async () => { const res = await fetch(`/api/boq/items/${boqItemId}/equipment`, { credentials: "include" }); return res.ok ? res.json() : []; },
  });
  const { data: materials = [] } = useQuery<BoqItemMaterialsRow[]>({
    queryKey: ["/api/boq/items", boqItemId, "materials"],
    queryFn: async () => { const res = await fetch(`/api/boq/items/${boqItemId}/materials`, { credentials: "include" }); return res.ok ? res.json() : []; },
  });
  const hasData = equipment.length > 0 || materials.length > 0;
  if (!hasData) return null;
  return (
    <div className="mt-1">
      <button className="flex items-center gap-1 text-[12px] text-teal-600 hover:text-teal-800 transition-colors" onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {equipment.length > 0 && <span>{equipment.length} equip</span>}
        {materials.length > 0 && <span>· {materials.length} mat</span>}
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-3 border-l-2 border-teal-100">
          {equipment.map((e) => <p key={e.id} className="text-[12px] text-muted-foreground"><Wrench className="w-2.5 h-2.5 inline mr-0.5" />{e.equipmentName}{e.count && e.count > 1 ? ` ×${e.count}` : ""}</p>)}
          {materials.map((m) => <p key={m.id} className="text-[12px] text-muted-foreground"><Package className="w-2.5 h-2.5 inline mr-0.5" />{m.materialName}{m.qtyPerBoqUnit ? ` — ${fmtQty(m.qtyPerBoqUnit, 3)} ${m.uom ?? ""}` : ""}{m.isAuto && <Badge variant="outline" className="text-[7px] h-3 px-0.5 ml-0.5">⚙</Badge>}</p>)}
        </div>
      )}
    </div>
  );
}
