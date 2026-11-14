import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronDown, ChevronRight, CircleDollarSign,
  Loader2, PackageOpen, Printer, Save, Trash2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type WorkValueRow = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  reachId: number | null;
  reachLabel: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  scopeQuantity: number;
  scopeLengthM: number;
  doneQuantity: number;
  balanceQuantity: number;
  rate: number | null;
  isFixed: boolean;
  rowType: string;
  [key: string]: unknown;
};
type MaterialInput = Record<string, any>;
type SavedFundPlan = { id: number; name: string; data: unknown; updatedAt: string };
type WorkValueResponse = {
  totals: { billEstimateWithinBoq: number };
  rows: WorkValueRow[];
  materialItems: MaterialInput[];
};
type WorkPlan = {
  selected: boolean;
  quantity: string;
  length: string;
  otherCostPerUnit: string;
};
type ReachPlan = { start: string; end: string; leaveOut: string };
type SupplierPlan = {
  nameA: string; nameB: string; priceA: string; priceB: string;
  unitA: string; unitB: string;
};
type PlanData = {
  alreadyDone: string;
  works: Record<string, WorkPlan>;
  reaches: Record<string, ReachPlan>;
  suppliers: Record<string, SupplierPlan>;
  recipeOverrides: Record<string, unknown>;
};
type PreviewMaterial = {
  materialName: string;
  uom: string;
  totalQty: number;
  byItem?: Array<{ itemId: number; quantity: number }>;
};
type MaterialPreview = { materials: PreviewMaterial[] };

const money = (value: number) => `₹${Number.isFinite(value) ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}`;
const qtyText = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString("en-IN", { maximumFractionDigits: digits })
  : "—";
const num = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const quantityForLength = (row: WorkValueRow, length: string | number) => {
  const parsedLength = String(length).trim();
  if (!parsedLength) return "";
  const scopeLength = Number(row.scopeLengthM);
  if (!Number.isFinite(scopeLength) || scopeLength <= 0) return "0";
  return String(Number(parsedLength) * (Number(row.scopeQuantity) / scopeLength));
};
const keyFor = (name: string, uom: string) => `${name.trim().toLowerCase()}|${uom.trim().toLowerCase()}`;
const reachKey = (row: WorkValueRow) => row.reachId == null ? "whole-road" : `reach-${row.reachId}`;
const workKey = (row: WorkValueRow) => `${row.boqItemId}|${reachKey(row)}`;
const isBitumenMaterial = (name: string) => /bitum(?:en|inous)|emulsion/i.test(name);
const priceUnits = (name: string, uom: string) => isBitumenMaterial(name) ? ["MT", "kg"] : [uom];
const normalizedUnit = (value: string) => value.trim().toLowerCase().replace(/^₹\s*\/\s*/, "").replace(/^per\s+/, "").replace(/\s+/g, "");
function priceToBomUnit(price: number, priceUnit: string, bomUnit: string, materialName: string) {
  if (!Number.isFinite(price)) return 0;
  if (!isBitumenMaterial(materialName)) return price;
  const from = normalizedUnit(priceUnit);
  const to = normalizedUnit(bomUnit);
  if (["mt", "tonne", "tonnes", "t", "ton", "tons"].includes(to) && ["kg", "kgs", "kilogram", "kilograms"].includes(from)) return price * 1000;
  if (["kg", "kgs", "kilogram", "kilograms"].includes(to) && ["mt", "tonne", "tonnes", "t", "ton", "tons"].includes(from)) return price / 1000;
  return price;
}
function quantityInPriceUnit(quantity: number, bomUnit: string, priceUnit: string, materialName: string) {
  if (!isBitumenMaterial(materialName)) return quantity;
  const from = normalizedUnit(bomUnit);
  const to = normalizedUnit(priceUnit);
  if (["mt", "tonne", "tonnes", "t", "ton", "tons"].includes(from) && ["kg", "kgs", "kilogram", "kilograms"].includes(to)) return quantity * 1000;
  if (["kg", "kgs", "kilogram", "kilograms"].includes(from) && ["mt", "tonne", "tonnes", "t", "ton", "tons"].includes(to)) return quantity / 1000;
  return quantity;
}
const recipeSettingsFor = (item: MaterialInput) => {
  const settings = item.fundPlannerRecipeSettings;
  return settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
};
const materialItemId = (item: MaterialInput) => Number(item.boqItemId ?? item.id);
const RECIPE_SETTING_LABELS: Record<string, string> = {
  layerType: "Layer type", mixType: "Mix type", compactedDensity: "Compacted density",
  bitumenPercent: "Bitumen percent", dryerLdoPerMt: "Dryer LDO / MT", wmmDensity: "WMM density",
  soilLooseFactor: "Soil loose factor", sprayRateKgPerSqm: "Spray rate kg / sqm", waterAddedPerPart: "Water added / part",
};

function initialPlan(rows: WorkValueRow[], response?: WorkValueResponse, latestPlan?: SavedFundPlan): PlanData {
  const works: PlanData["works"] = {};
  const reaches: PlanData["reaches"] = {};
  rows.forEach(row => {
    const id = workKey(row);
    works[id] = {
      selected: Number(row.balanceQuantity) > 0,
      quantity: String(Math.max(0, Number(row.balanceQuantity) || 0)),
      length: "",
      otherCostPerUnit: "0",
    };
    const key = reachKey(row);
    if (key !== "whole-road" && !reaches[key]) {
      reaches[key] = {
        start: row.chainageFrom == null ? "" : String(row.chainageFrom),
        end: row.chainageTo == null ? "" : String(row.chainageTo),
        leaveOut: "0",
      };
    }
  });
  const latestSuppliers = latestPlan?.data && typeof latestPlan.data === "object"
    ? ((latestPlan.data as Record<string, any>).suppliers ?? {})
    : {};
  const suppliers: PlanData["suppliers"] = { ...latestSuppliers };
  (response?.materialItems ?? []).forEach(item => {
    (Array.isArray(item.materials) ? item.materials : []).forEach((material: MaterialInput) => {
      const name = String(material.materialName ?? material.name ?? "");
      const uom = String(material.uom ?? material.unit ?? "");
      const key = keyFor(name, uom);
      if (!name || suppliers[key]) return;
      suppliers[key] = {
        nameA: "", nameB: "", priceA: "", priceB: "",
        unitA: priceUnits(name, uom)[0] ?? uom, unitB: priceUnits(name, uom)[0] ?? uom,
      };
    });
  });
  return {
    alreadyDone: String(response?.totals?.billEstimateWithinBoq ?? 0),
    works, reaches, suppliers, recipeOverrides: {},
  };
}

function normalizePlanData(raw: unknown, rows: WorkValueRow[], response?: WorkValueResponse, latestPlan?: SavedFundPlan): PlanData {
  const base = initialPlan(rows, response, latestPlan);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, any>;
  const savedWorks = data.works && typeof data.works === "object" ? data.works : {};
  const works = { ...base.works };
  Object.entries(works).forEach(([id, fallback]) => {
    const saved = savedWorks[id];
    if (!saved) return;
    works[id] = {
      ...fallback,
      selected: typeof saved.selected === "boolean" ? saved.selected : fallback.selected,
      quantity: String(saved.quantity ?? saved.plannedQuantity ?? fallback.quantity),
      length: String(saved.length ?? fallback.length),
      otherCostPerUnit: String(saved.otherCostPerUnit ?? "0"),
    };
  });
  return {
    alreadyDone: String(data.alreadyDone ?? base.alreadyDone),
    works,
    reaches: { ...base.reaches, ...(data.reaches && typeof data.reaches === "object" ? data.reaches : {}) },
    suppliers: { ...base.suppliers, ...(data.suppliers && typeof data.suppliers === "object" ? data.suppliers : {}) },
    recipeOverrides: data.recipeOverrides && typeof data.recipeOverrides === "object" ? data.recipeOverrides : {},
  };
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">{children}</span>;
}

export default function FundPlanner({ projectId, canSave }: { projectId: number; canSave: boolean }) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const workKey = ["/api/boq/projects", projectId, "work-value"];
  const plansKey = ["/api/boq/projects", projectId, "fund-plans"];

  const workQuery = useQuery<WorkValueResponse>({
    queryKey: workKey,
    enabled: Number.isInteger(projectId) && projectId > 0,
    queryFn: async () => (await apiRequest("GET", `/api/boq/projects/${projectId}/work-value`)).json(),
  });
  const plansQuery = useQuery<{ plans: SavedFundPlan[] }>({
    queryKey: plansKey,
    enabled: Number.isInteger(projectId) && projectId > 0,
    queryFn: async () => (await apiRequest("GET", `/api/boq/projects/${projectId}/fund-plans`)).json(),
  });
  const rows = useMemo(
    () => (workQuery.data?.rows ?? []).filter(row =>
      row.rowType === "working_reach" && Number(row.balanceQuantity) > 0 && (row.reachId != null || row.isFixed),
    ),
    [workQuery.data?.rows],
  );
  const latestPlan = useMemo(
    () => [...(plansQuery.data?.plans ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [plansQuery.data?.plans],
  );
  const groups = useMemo(() => {
    const byReach = new Map<string, { key: string; label: string; rows: WorkValueRow[]; start: number | null; end: number | null }>();
    rows.forEach(row => {
      const key = reachKey(row);
      const group = byReach.get(key) ?? {
        key,
        label: key === "whole-road" ? "Whole road · fixed items" : row.reachLabel || "Working reach",
        rows: [],
        start: row.chainageFrom,
        end: row.chainageTo,
      };
      group.rows.push(row);
      if (group.start == null && row.chainageFrom != null) group.start = row.chainageFrom;
      if (group.end == null && row.chainageTo != null) group.end = row.chainageTo;
      byReach.set(key, group);
    });
    return Array.from(byReach.values()).sort((a, b) => {
      if (a.key === "whole-road") return 1;
      if (b.key === "whole-road") return -1;
      return (a.start ?? 0) - (b.start ?? 0);
    });
  }, [rows]);

  useEffect(() => {
    if (!workQuery.data) return;
    const saved = plansQuery.data?.plans?.find(item => String(item.id) === selectedPlanId);
    setPlan(normalizePlanData(saved?.data, rows, workQuery.data, latestPlan));
  }, [workQuery.data, plansQuery.data, selectedPlanId, rows, latestPlan]);

  const updatePlan = (updater: (current: PlanData) => PlanData) => setPlan(current => current ? updater(current) : current);
  const previewMutation = useMutation({
    mutationFn: async (payload: { works: Array<{ itemId: number; quantity: number }>; recipeOverrides: Record<string, unknown> }) =>
      (await apiRequest("POST", `/api/boq/projects/${projectId}/fund-plan-material-preview`, payload)).json() as Promise<MaterialPreview>,
  });
  const selectedWorks = useMemo(() => {
    const quantities = new Map<number, number>();
    rows.forEach(row => {
      const rowPlan = plan?.works[workKey(row)];
      if (!rowPlan?.selected) return;
      const quantity = num(rowPlan.quantity);
      if (quantity > 0) quantities.set(row.boqItemId, (quantities.get(row.boqItemId) ?? 0) + quantity);
    });
    return Array.from(quantities, ([itemId, quantity]) => ({ itemId, quantity }));
  }, [rows, plan?.works]);
  const previewSignature = JSON.stringify({ works: selectedWorks, overrides: plan?.recipeOverrides ?? {} });
  useEffect(() => {
    if (!plan || !workQuery.data) return;
    const payload = JSON.parse(previewSignature);
    previewMutation.mutate(payload);
    // Only the stable serialized payload should trigger a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSignature, projectId, !!workQuery.data]);

  const preview = previewMutation.data;
  const materials = preview?.materials ?? [];
  const selectedItemIds = new Set(selectedWorks.map(work => work.itemId));
  const supplierDetails = (material: PreviewMaterial) => {
    const key = keyFor(material.materialName, material.uom);
    const units = priceUnits(material.materialName, material.uom);
    const saved = plan?.suppliers[key];
    return {
      nameA: String(saved?.nameA ?? ""),
      nameB: String(saved?.nameB ?? ""),
      priceA: String(saved?.priceA ?? ""),
      priceB: String(saved?.priceB ?? ""),
      unitA: units.includes(String(saved?.unitA ?? "")) ? String(saved?.unitA) : units[0] ?? material.uom,
      unitB: units.includes(String(saved?.unitB ?? "")) ? String(saved?.unitB) : units[0] ?? material.uom,
    };
  };
  const supplierQuote = (material: PreviewMaterial) => {
    const supplier = supplierDetails(material);
    const units = priceUnits(material.materialName, material.uom);
    const unitA = units.includes(supplier.unitA) ? supplier.unitA : units[0] ?? material.uom;
    const unitB = units.includes(supplier.unitB) ? supplier.unitB : units[0] ?? material.uom;
    const hasA = supplier.priceA.trim() !== "";
    const hasB = supplier.priceB.trim() !== "";
    const priceA = hasA ? num(supplier.priceA) : null;
    const priceB = hasB ? num(supplier.priceB) : priceA;
    const rateA = priceA == null ? null : priceToBomUnit(priceA, unitA, material.uom, material.materialName);
    const effectiveUnitB = hasB ? unitB : unitA;
    const rateB = priceB == null ? null : priceToBomUnit(priceB, effectiveUnitB, material.uom, material.materialName);
    const costA = rateA == null ? null : Number(material.totalQty) * rateA;
    const costB = rateB == null ? null : Number(material.totalQty) * rateB;
    const cheaper = costA == null ? (costB == null ? null : "B" as const)
      : costB == null ? "A" as const
      : costA <= costB ? "A" as const : "B" as const;
    const cheaperCost = cheaper === "A" ? costA : cheaper === "B" ? costB : null;
    const otherCost = cheaper === "A" ? costB : cheaper === "B" ? costA : null;
    const cheaperRate = cheaper === "A" ? rateA : cheaper === "B" ? rateB : null;
    const cheaperName = cheaper === "A" ? (supplier.nameA || "Supplier A") : cheaper === "B" ? (supplier.nameB || "Supplier B") : "";
    return {
      supplier, units, unitA, unitB, effectiveUnitB, hasA, hasB, priceA, priceB, rateA, rateB,
      costA, costB, cheaper, cheaperCost, cheaperRate, cheaperName,
      savings: cheaperCost != null && otherCost != null ? Math.max(0, otherCost - cheaperCost) : null,
    };
  };
  const itemMaterialCosts = useMemo(() => {
    const costs: Record<number, { A: number; B: number; best: number }> = {};
    materials.forEach(material => {
      const quote = supplierQuote(material);
      if (quote.cheaperRate == null) return;
      material.byItem?.forEach(part => {
        const qty = Number(part.quantity) || 0;
        if (!rows.some(row => row.boqItemId === part.itemId && plan?.works[workKey(row)]?.selected)) return;
        const entry = costs[part.itemId] ?? { A: 0, B: 0, best: 0 };
        entry.A += qty * (quote.rateA ?? 0);
        entry.B += qty * (quote.rateB ?? 0);
        entry.best += qty * quote.cheaperRate!;
        costs[part.itemId] = entry;
      });
    });
    return costs;
  // Supplier fields and plans are intentionally read from the current plan snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, plan?.suppliers, plan?.works, rows]);
  const rowFinancials = (row: WorkValueRow) => {
    const work = plan?.works[workKey(row)];
    const quantity = work?.selected ? num(work.quantity) : 0;
    const bill = quantity * Number(row.rate ?? 0);
    const itemSelectedQuantity = rows
      .filter(other => other.boqItemId === row.boqItemId)
      .reduce((sum, other) => {
        const otherPlan = plan?.works[workKey(other)];
        return sum + (otherPlan?.selected ? num(otherPlan.quantity) : 0);
      }, 0);
    const share = itemSelectedQuantity > 0 ? quantity / itemSelectedQuantity : 0;
    const itemCosts = itemMaterialCosts[row.boqItemId] ?? { A: 0, B: 0, best: 0 };
    const costs = { A: itemCosts.A * share, B: itemCosts.B * share, best: itemCosts.best * share };
    const materialsCost = costs.best;
    const otherCost = quantity * num(work?.otherCostPerUnit);
    return { quantity, bill, costA: costs.A, costB: costs.B, materialsCost, otherCost, margin: bill - materialsCost - otherCost };
  };
  const summary = useMemo(() => {
    let bill = 0;
    let costs = 0;
    let otherCosts = 0;
    rows.forEach(row => {
      const financial = rowFinancials(row);
      bill += financial.bill;
      otherCosts += financial.otherCost;
    });
    const materialsCost = materials.reduce((sum, material) => sum + (supplierQuote(material).cheaperCost ?? 0), 0);
    costs = materialsCost + otherCosts;
    const alreadyDone = num(plan?.alreadyDone);
    return { bill, alreadyDone, total: bill + alreadyDone, arrange: costs, margin: bill - costs };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, plan?.works, plan?.alreadyDone, plan?.suppliers, materials]);

  const invalidateAfterWrite = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: plansKey }),
      queryClient.invalidateQueries({ queryKey: workKey }),
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "materials"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "fund-plan-material-preview"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: async ({ name, data, id }: { name: string; data: PlanData; id?: number }) => {
      const response = id
        ? await apiRequest("PUT", `/api/boq/projects/${projectId}/fund-plans/${id}`, { name, data })
        : await apiRequest("POST", `/api/boq/projects/${projectId}/fund-plans`, { name, data });
      return { result: await response.json().catch(() => null), name, id };
    },
    onSuccess: async ({ result, name, id: existingId }) => {
      await invalidateAfterWrite();
      if (!existingId && result?.id != null) setSelectedPlanId(String(result.id));
      else if (!existingId) {
        const refreshed = await queryClient.fetchQuery<{ plans: SavedFundPlan[] }>({
          queryKey: plansKey,
          queryFn: async () => (await apiRequest("GET", `/api/boq/projects/${projectId}/fund-plans`)).json(),
        });
        const created = refreshed.plans?.find(item => item.name === name);
        if (created) setSelectedPlanId(String(created.id));
      }
      toast({ title: existingId ? "Fund plan saved" : "Fund plan created" });
      setSaveAsOpen(false);
    },
    onError: error => toast({ title: "Could not save fund plan", description: error.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/boq/projects/${projectId}/fund-plans/${id}`),
    onSuccess: async () => {
      await invalidateAfterWrite();
      setSelectedPlanId("");
      setDeleteOpen(false);
      toast({ title: "Fund plan deleted" });
    },
    onError: error => toast({ title: "Could not delete fund plan", description: error.message, variant: "destructive" }),
  });
  const currentSavedPlan = plansQuery.data?.plans?.find(item => String(item.id) === selectedPlanId);
  const saveCurrent = () => {
    if (!plan || !currentSavedPlan) return;
    saveMutation.mutate({ id: currentSavedPlan.id, name: currentSavedPlan.name, data: plan });
  };
  const createPlan = () => {
    if (!plan || !planName.trim()) return;
    saveMutation.mutate({ name: planName.trim(), data: plan });
  };
  const applyLength = (groupKey: string, length: number) => {
    updatePlan(current => {
      const works = { ...current.works };
      const group = groups.find(item => item.key === groupKey);
      group?.rows.forEach(row => {
        const id = workKey(row);
        if (works[id]?.selected && !row.isFixed) {
          const appliedLength = String(Math.max(0, length));
          works[id] = { ...works[id], length: appliedLength, quantity: quantityForLength(row, appliedLength) };
        }
      });
      return { ...current, works };
    });
  };
  const updateSupplier = (key: string, patch: Partial<SupplierPlan>) => updatePlan(current => ({
    ...current, suppliers: { ...current.suppliers, [key]: { ...(current.suppliers[key] ?? { nameA: "", nameB: "", priceA: "", priceB: "", unitA: "", unitB: "" }), ...patch } },
  }));
  const formatKm = (value: number | null) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });

  if (workQuery.isLoading || plansQuery.isLoading) {
    return <section className="space-y-3 p-3" aria-label="Loading fund planner">
      <div className="h-24 animate-pulse rounded-md bg-stone-100" />
      <div className="h-40 animate-pulse rounded-md bg-stone-100" />
      <div className="h-40 animate-pulse rounded-md bg-stone-100" />
    </section>;
  }
  if (workQuery.isError || plansQuery.isError) {
    const error = workQuery.error ?? plansQuery.error;
    return <section className="m-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
      <p className="font-semibold">Fund planner could not load.</p>
      <p className="mt-1">{error instanceof Error ? error.message : "Please try again."}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => { workQuery.refetch(); plansQuery.refetch(); }}>Retry</Button>
    </section>;
  }
  if (!plan || !workQuery.data) return null;

  return (
    <section className="min-h-[60vh] bg-[#f5f4f0] text-stone-900 print:min-h-0 print:bg-white print:text-black" data-testid="fund-planner">
      <div className="mx-auto max-w-[1600px] px-3 pb-8 pt-3 sm:px-5 print:px-0 print:py-0">
        <div className="mb-3 flex flex-col gap-3 border-b border-stone-300 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Work programme / funds</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Fund planner</h2>
            <p className="mt-1 max-w-xl text-xs text-stone-600">Balance selected reach work against supplier commitments and cash to arrange.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select aria-label="Select saved fund plan" value={selectedPlanId} onChange={event => setSelectedPlanId(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 text-sm sm:w-56 sm:flex-none" data-testid="select-fund-plan">
              <option value="">New unsaved plan</option>
              {(plansQuery.data?.plans ?? []).map(saved => <option key={saved.id} value={String(saved.id)}>{saved.name}</option>)}
            </select>
            {canSave && (currentSavedPlan ? <>
              <Button variant="outline" size="sm" disabled={saveMutation.isPending} onClick={saveCurrent} data-testid="button-save-fund-plan">
                {saveMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save
              </Button>
              <Button size="sm" className="bg-stone-900 text-white hover:bg-stone-700" onClick={() => { setPlanName(""); setSaveAsOpen(true); }} data-testid="button-save-fund-plan-as">Save as new</Button>
              <Button variant="outline" size="icon" aria-label="Delete selected plan" onClick={() => setDeleteOpen(true)} data-testid="button-delete-fund-plan"><Trash2 className="h-4 w-4" /></Button>
            </> : <Button size="sm" className="bg-stone-900 text-white hover:bg-stone-700" onClick={() => { setPlanName(""); setSaveAsOpen(true); }} data-testid="button-save-fund-plan">
              <Save className="mr-1 h-4 w-4" />Save plan
            </Button>)}
            <Button variant="outline" size="sm" onClick={() => window.print()} className="ml-auto sm:ml-0" data-testid="button-print-fund-plan"><Printer className="mr-1 h-4 w-4" />Print</Button>
          </div>
        </div>

        <div className="sticky top-0 z-20 -mx-3 mb-4 border-y border-stone-400 bg-[#f5f4f0]/95 px-3 py-2 shadow-sm backdrop-blur-sm sm:-mx-5 sm:px-5 print:static print:border-2 print:bg-white print:shadow-none">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
            <SummaryMetric label="Bill for ticked work" value={money(summary.bill)} />
            <div>
              <FieldLabel>Already done</FieldLabel>
              <Input aria-label="Already done bill estimate" type="number" min="0" step="0.01" value={plan.alreadyDone}
                onChange={event => updatePlan(current => ({ ...current, alreadyDone: event.target.value }))}
                className="mt-1 h-7 max-w-36 border-stone-300 bg-white px-2 font-mono text-sm print:border-0 print:p-0" data-testid="input-already-done" />
            </div>
            <SummaryMetric label="Total bill after this" value={money(summary.total)} strong />
            <SummaryMetric label="Money to arrange" value={money(summary.arrange)} />
            <SummaryMetric label="Margin" value={money(summary.margin)} strong />
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-[11px] text-stone-600">
          <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-stone-700" />
          <span>Already done is prefilled from Work value’s bill estimate within BOQ. Planned bill uses selected quantities × BOQ rate; money to arrange and margin use the cheaper supplier price for each material, plus other costs.</span>
        </div>

        <div className="space-y-4">
          {groups.map(group => {
            const reach = plan.reaches[group.key] ?? { start: group.start == null ? "" : String(group.start), end: group.end == null ? "" : String(group.end), leaveOut: "0" };
            const stretchLength = Math.max(0, (num(reach.end) - num(reach.start)) * 1000 - num(reach.leaveOut));
            return <section key={group.key} className="overflow-hidden rounded-md border border-stone-300 bg-white" data-testid={`fund-reach-${group.key}`}>
              <header className="flex flex-col gap-3 border-b border-stone-300 bg-[#eeece6] px-3 py-3 sm:flex-row sm:items-center sm:justify-between print:bg-white">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <p className="mt-0.5 text-[10px] text-stone-600">
                    {group.key === "whole-road" ? "Whole road · fixed items" : `Ch ${formatKm(group.start)} km → ${formatKm(group.end)} km`}
                    <span className="ml-2 font-mono">{group.rows.length} item{group.rows.length === 1 ? "" : "s"}</span>
                  </p>
                </div>
                {group.key !== "whole-road" && group.rows.some(row => !row.isFixed) && <div className="grid grid-cols-2 gap-2 print:hidden sm:flex sm:items-end">
                  <label><FieldLabel>Stretch start (km)</FieldLabel><Input type="number" step="0.001" value={reach.start} onChange={event => updatePlan(current => ({ ...current, reaches: { ...current.reaches, [group.key]: { ...reach, start: event.target.value } } }))} className="mt-1 h-8 w-full font-mono text-xs sm:w-24" /></label>
                  <label><FieldLabel>Stretch end (km)</FieldLabel><Input type="number" step="0.001" value={reach.end} onChange={event => updatePlan(current => ({ ...current, reaches: { ...current.reaches, [group.key]: { ...reach, end: event.target.value } } }))} className="mt-1 h-8 w-full font-mono text-xs sm:w-24" /></label>
                  <label><FieldLabel>Leave-out (m)</FieldLabel><Input type="number" min="0" value={reach.leaveOut} onChange={event => updatePlan(current => ({ ...current, reaches: { ...current.reaches, [group.key]: { ...reach, leaveOut: event.target.value } } }))} className="mt-1 h-8 w-full font-mono text-xs sm:w-24" /></label>
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:block">
                    <div className="sm:max-w-60"><FieldLabel>Stretch length</FieldLabel><p className="mt-1 font-mono text-[10px] font-semibold sm:text-xs">Stretch from {reach.start || "—"} km to {reach.end || "—"} km, leave out {reach.leaveOut || "0"} m = {qtyText(stretchLength)} m</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyLength(group.key, stretchLength)} className="h-8 whitespace-nowrap text-[11px]" data-testid={`button-apply-length-${group.key}`}>Use for ticked rows</Button>
                  </div>
                </div>}
              </header>

              <div className="hidden overflow-x-auto lg:block print:block">
                <table className="w-full min-w-[1120px] border-collapse text-[11px] print:min-w-0 print:text-[9px]" data-testid={`table-fund-works-${group.key}`}>
                  <thead><tr className="border-b bg-stone-50 text-left text-[9px] uppercase tracking-wide text-stone-500">
                    <th className="px-2 py-2">Use</th><th className="px-2 py-2">Item</th><th className="px-2 py-2 text-right">Balance</th><th className="px-2 py-2 text-right">Length m</th><th className="px-2 py-2 text-right">Planned qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Bill</th><th className="px-2 py-2 text-right">Materials A</th><th className="px-2 py-2 text-right">Materials B</th><th className="px-2 py-2 text-right">Other / unit</th><th className="px-2 py-2 text-right">Margin</th>
                  </tr></thead>
                  <tbody>{group.rows.map(row => <WorkRow key={workKey(row)} row={row} plan={plan} updatePlan={updatePlan} financial={rowFinancials(row)} />)}</tbody>
                </table>
              </div>
              <div className="divide-y divide-stone-200 lg:hidden print:hidden">
                {group.rows.map(row => <WorkCard key={workKey(row)} row={row} plan={plan} updatePlan={updatePlan} financial={rowFinancials(row)} />)}
              </div>
              {!group.rows.length && <p className="px-4 py-8 text-center text-sm text-stone-500">No work is available in this group.</p>}
            </section>;
          })}
          {!rows.length && <div className="rounded-md border border-dashed border-stone-400 bg-white px-4 py-10 text-center">
            <PackageOpen className="mx-auto h-7 w-7 text-stone-400" /><p className="mt-2 text-sm font-semibold">No working reach rows found</p>
            <p className="mt-1 text-xs text-stone-500">Work value has no items available for a fund plan.</p>
          </div>}
        </div>

        <section className="mt-5 overflow-hidden rounded-md border border-stone-300 bg-white" data-testid="fund-materials">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 bg-[#eeece6] px-3 py-3 print:bg-white">
            <div><h3 className="text-sm font-semibold">Materials needed</h3><p className="mt-0.5 text-[10px] text-stone-600">Preview from selected work and its recipe; compare supplier totals before arranging cash.</p></div>
            {previewMutation.isPending && <span className="inline-flex items-center gap-1 text-[10px] text-stone-500"><Loader2 className="h-3 w-3 animate-spin" />Updating preview</span>}
          </div>
          {previewMutation.isError ? <div className="p-4 text-xs text-red-800" role="alert">Material preview unavailable. {(previewMutation.error as Error).message}</div>
            : previewMutation.isPending && !previewMutation.data ? <div className="space-y-2 p-4"><div className="h-5 animate-pulse rounded bg-stone-100" /><div className="h-5 animate-pulse rounded bg-stone-100" /></div>
            : materials.length === 0 ? <div className="px-4 py-7 text-center text-xs text-stone-500">Tick work with a material recipe to see the required quantities.</div>
            : <div className="divide-y divide-stone-200">
              {materials.map((material, index) => {
                const key = keyFor(material.materialName, material.uom);
                const supplier = supplierDetails(material);
                const quote = supplierQuote(material);
                const fromItems = (material.byItem ?? []).reduce((sum, part) => sum + (selectedItemIds.has(part.itemId) ? 1 : 0), 0);
                const formula = (price: number | null, unit: string, cost: number | null) => {
                  if (price == null || cost == null) return "Add a price to estimate";
                  const convertedQty = quantityInPriceUnit(Number(material.totalQty), material.uom, unit, material.materialName);
                  return `${qtyText(convertedQty, 3)} ${unit} × ${money(price)} / ${unit} = ${money(cost)}`;
                };
                return <article key={`${key}-${index}`} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(140px,1fr)_120px_minmax(280px,1.8fr)_160px] sm:items-center" data-testid={`fund-material-${index}`}>
                  <div className="min-w-0"><p className="truncate text-xs font-semibold" title={material.materialName}>{material.materialName}</p><p className="mt-0.5 text-[10px] text-stone-500">{fromItems} contributing item{fromItems === 1 ? "" : "s"}</p></div>
                  <div className="sm:text-right"><FieldLabel>Total needed</FieldLabel><p className="mt-1 font-mono text-xs">{qtyText(material.totalQty, 3)} {material.uom}</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["A", "B"] as const).map(which => {
                      const nameKey = `name${which}` as const;
                      const priceKey = `price${which}` as const;
                      const unitKey = `unit${which}` as const;
                      const units = priceUnits(material.materialName, material.uom);
                      const total = which === "A" ? quote.costA : quote.costB;
                      const price = which === "A" ? quote.priceA : quote.priceB;
                      const unit = which === "A" ? quote.unitA : quote.unitB;
                      const title = supplier[nameKey] || `Supplier ${which}`;
                      return <div key={which} className={`rounded border p-2 ${quote.cheaper === which ? "border-stone-700 bg-stone-50" : "border-stone-200"}`}>
                        <div className="flex items-center justify-between gap-1"><span className="truncate text-[9px] font-bold uppercase tracking-wide text-stone-500">{title}{quote.cheaper === which && <span className="ml-1 text-stone-900">· lower</span>}</span></div>
                        <Input aria-label={`Supplier ${which} name for ${material.materialName}`} value={supplier[nameKey]} onChange={event => updateSupplier(key, { [nameKey]: event.target.value })} className="mt-1 h-7 px-2 text-[11px]" placeholder={`Supplier ${which} name`} />
                        <div className="mt-1 flex gap-1">
                          <Input aria-label={`Supplier ${which} price for ${material.materialName}`} type="number" min="0" step="0.01" value={supplier[priceKey]} onChange={event => updateSupplier(key, { [priceKey]: event.target.value })} className="h-7 min-w-0 px-2 font-mono text-[11px]" placeholder="Price" />
                          <select aria-label={`Supplier ${which} price unit for ${material.materialName}`} value={unit} onChange={event => updateSupplier(key, { [unitKey]: event.target.value })} className="h-7 max-w-24 rounded border border-stone-300 bg-white px-1 text-[10px]">
                            {units.map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </div>
                        <p className="mt-1 break-words font-mono text-[9px] leading-snug text-stone-600">{formula(price, which === "B" ? quote.effectiveUnitB : unit, total)}</p>
                        {which === "B" && !quote.hasB && quote.priceA != null && <p className="mt-0.5 text-[9px] text-stone-500">Blank price uses Supplier A’s rate.</p>}
                      </div>;
                    })}
                  </div>
                  <div className="rounded bg-[#f5f4f0] px-2 py-2 text-right">
                    <FieldLabel>Cheaper supplier</FieldLabel>
                    <p className="mt-1 truncate text-xs font-semibold" title={quote.cheaperName || undefined}>{quote.cheaperName || "Price needed"}</p>
                    <p className="mt-1 font-mono text-[10px]">{quote.cheaperCost == null ? "—" : money(quote.cheaperCost)} total</p>
                    <p className="mt-0.5 text-[9px] text-stone-600">{quote.savings == null ? "Savings unavailable" : `${money(quote.savings)} saved vs other supplier`}</p>
                  </div>
                </article>;
              })}
            </div>}
          <details className="border-t border-stone-300 print:hidden" open={overridesOpen} onToggle={event => setOverridesOpen((event.currentTarget as HTMLDetailsElement).open)}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs font-semibold">
              {overridesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Plan-only recipe overrides
              <span className="font-normal text-stone-500">Saved with this plan; does not change the BOQ recipe.</span>
            </summary>
            {overridesOpen && <RecipeOverrides
              items={workQuery.data.materialItems ?? []}
              rows={rows}
              overrides={plan.recipeOverrides}
              onChange={recipeOverrides => updatePlan(current => ({ ...current, recipeOverrides }))}
            />}
          </details>
        </section>

        <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{currentSavedPlan ? "Save as a new plan" : "Save fund plan"}</DialogTitle></DialogHeader>
            <div className="space-y-2"><Label htmlFor="fund-plan-name">Plan name</Label><Input id="fund-plan-name" autoFocus value={planName} onChange={event => setPlanName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") createPlan(); }} placeholder="e.g. Reach 01 — May funding" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setSaveAsOpen(false)}>Cancel</Button><Button onClick={createPlan} disabled={!planName.trim() || saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : currentSavedPlan ? "Create plan" : "Save plan"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete this fund plan?</DialogTitle></DialogHeader>
            <p className="text-sm text-stone-600">“{currentSavedPlan?.name}” will be removed. This cannot be undone.</p>
            <DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep plan</Button><Button variant="destructive" onClick={() => currentSavedPlan && deleteMutation.mutate(currentSavedPlan.id)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Delete plan"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

function RecipeOverrides({
  items,
  rows,
  overrides,
  onChange,
}: {
  items: MaterialInput[];
  rows: WorkValueRow[];
  overrides: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const rowById = new Map(rows.map(row => [row.boqItemId, row]));
  const eligibleItemIds = new Set(rows.map(row => row.boqItemId));
  const settingsItems = items.filter(item =>
    eligibleItemIds.has(materialItemId(item)) &&
    Object.keys(recipeSettingsFor(item)).some(field => recipeSettingsFor(item)[field] != null),
  );
  const numericFields = new Set(["compactedDensity", "bitumenPercent", "dryerLdoPerMt", "wmmDensity", "soilLooseFactor", "sprayRateKgPerSqm", "waterAddedPerPart"]);

  const changeField = (id: number, field: string, defaultValue: unknown, value: string) => {
    const itemKey = String(id);
    const current = overrides[itemKey] && typeof overrides[itemKey] === "object"
      ? { ...(overrides[itemKey] as Record<string, unknown>) }
      : {};
    if (value === "") delete current[field];
    else {
      const nextValue = numericFields.has(field) ? Number(value) : value;
      if (numericFields.has(field) && !Number.isFinite(nextValue as number)) return;
      if (String(nextValue) === String(defaultValue)) delete current[field];
      else current[field] = nextValue;
    }
    const next = { ...overrides };
    if (Object.keys(current).length) next[itemKey] = current;
    else delete next[itemKey];
    onChange(next);
  };

  if (!settingsItems.length) {
    return <p className="px-3 pb-3 text-xs text-stone-500">No recipe settings are available to override.</p>;
  }
  return <div className="space-y-3 px-3 pb-3">
    <p className="text-[10px] text-stone-600">These values affect this plan’s material preview only. Original recipe settings remain unchanged.</p>
    {settingsItems.map((item, index) => {
      const id = materialItemId(item);
      if (!Number.isFinite(id)) return null;
      const settings = recipeSettingsFor(item);
      const override = overrides[String(id)] && typeof overrides[String(id)] === "object"
        ? overrides[String(id)] as Record<string, unknown>
        : {};
      const row = rowById.get(id);
      const itemName = row
        ? `${row.itemCode ? `[${row.itemCode}] ` : ""}${row.description}`
        : String(item.description ?? item.itemName ?? `BOQ item ${id}`);
      return <fieldset key={`${id}-${index}`} className="rounded border border-stone-300 p-3">
        <legend className="max-w-full px-1 text-xs font-semibold">{itemName}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(settings).filter(([field, defaultValue]) => numericFields.has(field) && defaultValue != null).map(([field, defaultValue]) => {
            const value = override[field] ?? defaultValue;
            const changed = override[field] != null && String(override[field]) !== String(defaultValue);
            const isNumeric = numericFields.has(field);
            return <label key={field} className="min-w-0">
              <span className="flex min-h-6 items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-stone-500">
                {RECIPE_SETTING_LABELS[field] ?? field}
                {changed && <span className="whitespace-nowrap normal-case tracking-normal text-stone-800">changed from recipe</span>}
              </span>
              <Input
                type={isNumeric ? "number" : "text"}
                step={isNumeric ? "any" : undefined}
                value={String(value)}
                aria-label={`${RECIPE_SETTING_LABELS[field] ?? field} override for ${itemName}`}
                onChange={event => changeField(id, field, defaultValue, event.target.value)}
                className="mt-1 h-8 font-mono text-xs"
              />
            </label>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}

function SummaryMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><FieldLabel>{label}</FieldLabel><p className={`mt-1 font-mono text-sm ${strong ? "font-bold text-stone-950" : "font-semibold text-stone-800"}`}>{value}</p></div>;
}

function WorkRow({ row, plan, updatePlan, financial }: {
  row: WorkValueRow;
  plan: PlanData;
  updatePlan: (updater: (current: PlanData) => PlanData) => void;
  financial: { quantity: number; bill: number; costA: number; costB: number; otherCost: number; margin: number };
}) {
  const id = workKey(row);
  const work = plan.works[id] ?? { selected: false, quantity: "0", length: "", otherCostPerUnit: "0" };
  const over = num(work.quantity) > Number(row.balanceQuantity) + 0.0001;
  const patch = (values: Partial<WorkPlan>) => updatePlan(current => ({ ...current, works: { ...current.works, [id]: { ...work, ...values } } }));
  return <tr className={`border-b border-stone-100 align-middle ${work.selected ? "bg-white" : "bg-stone-50/60"}`}>
    <td className="px-2 py-2"><input aria-label={`Include ${row.description}`} type="checkbox" checked={work.selected} onChange={event => patch({ selected: event.target.checked })} className="h-4 w-4 accent-stone-800" /></td>
    <td className="max-w-[250px] px-2 py-2"><p className="truncate font-medium" title={row.description}>{row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}</p><p className="mt-0.5 text-[9px] text-stone-500">{row.unit}{row.isFixed ? " · fixed" : ""}</p></td>
    <td className="px-2 py-2 text-right font-mono">{qtyText(Number(row.balanceQuantity), 3)} {row.unit}</td>
    <td className="px-2 py-2 text-right">{row.isFixed ? <span className="text-[9px] font-semibold uppercase text-stone-500">Fixed</span> : <Input aria-label={`Length for ${row.description}`} type="number" min="0" value={work.length} onChange={event => patch({ length: event.target.value, quantity: quantityForLength(row, event.target.value) })} className="ml-auto h-7 w-20 text-right font-mono text-[10px]" />}</td>
    <td className="px-2 py-2 text-right"><Input type="number" min="0" step="any" value={work.quantity} onChange={event => patch({ quantity: event.target.value, length: "" })} className={`ml-auto h-7 w-24 text-right font-mono text-[10px] ${over ? "border-amber-500 bg-amber-50" : ""}`} />{over && <span className="mt-1 flex items-center justify-end gap-1 text-[9px] font-semibold text-amber-800"><AlertTriangle className="h-3 w-3" />Over balance</span>}</td>
    <td className="px-2 py-2 text-right font-mono">{row.rate == null ? "—" : money(Number(row.rate))}</td>
    <td className="px-2 py-2 text-right font-mono font-semibold">{money(financial.bill)}</td>
    <td className="px-2 py-2 text-right font-mono">{money(financial.costA)}</td>
    <td className="px-2 py-2 text-right font-mono">{money(financial.costB)}</td>
    <td className="px-2 py-2 text-right"><Input type="number" min="0" step="0.01" value={work.otherCostPerUnit} onChange={event => patch({ otherCostPerUnit: event.target.value })} className="ml-auto h-7 w-20 text-right font-mono text-[10px]" /></td>
    <td className="px-2 py-2 text-right font-mono font-semibold">{money(financial.margin)}</td>
  </tr>;
}

function WorkCard({ row, plan, updatePlan, financial }: {
  row: WorkValueRow;
  plan: PlanData;
  updatePlan: (updater: (current: PlanData) => PlanData) => void;
  financial: { quantity: number; bill: number; costA: number; costB: number; otherCost: number; margin: number };
}) {
  const id = workKey(row);
  const work = plan.works[id] ?? { selected: false, quantity: "0", length: "", otherCostPerUnit: "0" };
  const over = num(work.quantity) > Number(row.balanceQuantity) + 0.0001;
  const patch = (values: Partial<WorkPlan>) => updatePlan(current => ({ ...current, works: { ...current.works, [id]: { ...work, ...values } } }));
  return <article className={`p-3 ${work.selected ? "bg-white" : "bg-stone-50/70"}`} data-testid={`fund-work-card-${id}`}>
    <div className="flex items-start gap-2">
      <input aria-label={`Include ${row.description}`} type="checkbox" checked={work.selected} onChange={event => patch({ selected: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-stone-800" />
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-snug">{row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}</p><p className="mt-1 text-[10px] text-stone-500">{row.unit}{row.isFixed ? " · fixed" : ""} · rate {row.rate == null ? "—" : money(Number(row.rate))}</p></div>
      <p className="shrink-0 font-mono text-xs font-semibold">{money(financial.bill)}</p>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
      <div><FieldLabel>Balance</FieldLabel><p className="mt-1 font-mono text-[11px]">{qtyText(Number(row.balanceQuantity), 3)} {row.unit}</p></div>
      {row.isFixed ? <div><FieldLabel>Length</FieldLabel><p className="mt-1 text-[11px] font-semibold uppercase text-stone-500">Fixed</p></div> : <label><FieldLabel>Length (m)</FieldLabel><Input aria-label={`Length for ${row.description}`} type="number" min="0" value={work.length} onChange={event => patch({ length: event.target.value, quantity: quantityForLength(row, event.target.value) })} className="mt-1 h-8 font-mono text-xs" /></label>}
      <label><FieldLabel>Planned quantity</FieldLabel><Input aria-label={`Planned quantity for ${row.description}`} type="number" min="0" step="any" value={work.quantity} onChange={event => patch({ quantity: event.target.value, length: "" })} className={`mt-1 h-8 font-mono text-xs ${over ? "border-amber-500 bg-amber-50" : ""}`} />{over && <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800"><AlertTriangle className="h-3 w-3" />Over balance</span>}</label>
      <label><FieldLabel>Other cost / unit</FieldLabel><Input aria-label={`Other cost per unit for ${row.description}`} type="number" min="0" step="0.01" value={work.otherCostPerUnit} onChange={event => patch({ otherCostPerUnit: event.target.value })} className="mt-1 h-8 font-mono text-xs" /></label>
      <div><FieldLabel>Material cost · A / B</FieldLabel><p className="mt-1 font-mono text-[11px]">{money(financial.costA)} / {money(financial.costB)}</p></div>
      <div><FieldLabel>Margin · cheaper materials</FieldLabel><p className="mt-1 font-mono text-xs font-semibold">{money(financial.margin)}</p></div>
    </div>
    {over && <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">Planned quantity exceeds the current work-value balance.</p>}
  </article>;
}
