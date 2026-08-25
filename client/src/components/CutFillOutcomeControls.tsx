import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  buildCutFillFormContext,
  projectFormLedger,
  provisionalLedger,
  type CutFillSourceOption,
  type LedgerAllocation,
} from "@/lib/cutFillLedger";
import type { CutFillConsumptionInput } from "@shared/cutFillReconciliation";

type Props = {
  quantity: number | null;
  outcome: string | null;
  reusableQty: number | null;
  onOutcomeChange: (value: string | null, reusableQty: number | null) => void;
  sources?: CutFillSourceOption[];
  allocations?: LedgerAllocation[];
  onAllocationsChange?: (value: LedgerAllocation[]) => void;
  projectId?: number | null;
  sourceBoqItemId?: number | null;
  fillMode?: boolean;
  arrangementId?: number | null;
  formRows?: Array<{ entryKey: string; boqItemId: number | null; quantity: number | null; allocations?: LedgerAllocation[]; reusableQty?: number | null }>;
  boqItems?: any[];
  currentEntryKey?: string;
  editOriginalConsumptions?: CutFillConsumptionInput[];
};

export function CutFillOutcomeControls({
  quantity,
  outcome,
  reusableQty,
  onOutcomeChange,
  sources: providedSources = [],
  allocations = [],
  onAllocationsChange,
  projectId,
  sourceBoqItemId,
  fillMode = false,
  arrangementId,
  formRows = [],
  boqItems = [],
  currentEntryKey,
  editOriginalConsumptions = [],
}: Props) {
  const { data: arrangement } = useQuery<any>({
    queryKey: ["/api/earthwork-arrangements", arrangementId],
    queryFn: async () => { const r = await fetch(`/api/earthwork-arrangements/${arrangementId}`, { credentials: "include" }); return r.ok ? r.json() : null; },
    enabled: fillMode && !!arrangementId,
  });
  const { data: sourceData } = useQuery<{ sources: CutFillSourceOption[] }>({
    queryKey: ["/api/boq/projects", projectId, "cut-fill-sources"],
    queryFn: async () => { const r = await fetch(`/api/boq/projects/${projectId}/cut-fill-sources`, { credentials: "include" }); return r.ok ? r.json() : { sources: [] }; },
    enabled: !!projectId && fillMode,
  });
  const { data: reconciliation } = useQuery<any>({
    queryKey: ["/api/boq/projects", projectId, "cut-fill-reconciliation"],
    queryFn: async () => { const r = await fetch(`/api/boq/projects/${projectId}/cut-fill-reconciliation`, { credentials: "include" }); return r.ok ? r.json() : null; },
    enabled: !!projectId && fillMode,
  });
  const effectiveSourceBoqItemId = sourceBoqItemId ?? (arrangement?.sourceExcavationBoqItemId != null ? Number(arrangement.sourceExcavationBoqItemId) : null);
  const effectiveRows = formRows.length
    ? formRows
    : [{ entryKey: currentEntryKey ?? "current", boqItemId: null, quantity, allocations, reusableQty }];
  const formContext = useMemo(() => buildCutFillFormContext(
    effectiveRows,
    boqItems,
    sourceData?.sources ?? [],
    reconciliation?.openingBalances ?? [],
    { editOriginalConsumptions },
  ), [effectiveRows, boqItems, sourceData, reconciliation, editOriginalConsumptions]);
  const sources = useMemo(() => [...providedSources, ...formContext.sources]
    .filter((source, index, all) =>
      all.findIndex(item => item.key === source.key) === index
      && (effectiveSourceBoqItemId == null || source.sourceBoqItemId === effectiveSourceBoqItemId),
    ), [providedSources, formContext.sources, effectiveSourceBoqItemId]);
  const isExcavation = !fillMode;
  const rowLedger = useMemo(
    () => Object.fromEntries(projectFormLedger(effectiveRows, sources).map(result => [result.entryKey, result])),
    [effectiveRows, sources],
  );
  const ledger = rowLedger[currentEntryKey ?? effectiveRows[0]?.entryKey ?? "current"]
    ?? provisionalLedger(quantity ?? 0, sources, allocations);
  if (fillMode && (!arrangement || arrangement.arrangementType !== "reused_excavated" || arrangement.sourceExcavationBoqItemId == null)) return null;
  return (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 p-2 space-y-2" data-testid="cut-fill-controls">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-semibold text-amber-900">{fillMode ? "Reused excavation consumption" : "Excavated material outcome"}</Label>
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">Physical ledger only</Badge>
      </div>
      {isExcavation && (
        <Select value={outcome ?? "unset"} onValueChange={value => {
          const next = value === "unset" ? null : value;
          onOutcomeChange(next, next === "fully_reusable" ? quantity : next === "unsuitable" ? 0 : reusableQty);
        }}>
          <SelectTrigger className="h-8 text-[11px] bg-white"><SelectValue placeholder="Select outcome" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">Not recorded</SelectItem>
            <SelectItem value="fully_reusable">Fully reusable</SelectItem>
            <SelectItem value="partly_reusable">Partly reusable</SelectItem>
            <SelectItem value="unsuitable">Unsuitable</SelectItem>
          </SelectContent>
        </Select>
      )}
      {outcome === "partly_reusable" && (
        <Input className="h-8 text-[11px] bg-white" type="number" min={0} max={quantity ?? undefined}
          value={reusableQty ?? ""} placeholder={`Reusable quantity (0–${quantity ?? 0})`}
          onChange={event => onOutcomeChange(outcome, event.target.value === "" ? null : Number(event.target.value))} />
      )}
      {onAllocationsChange && (
        <div className="border-t border-amber-200 pt-2 space-y-1">
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>Fill required <b className="font-mono">{ledger.required.toLocaleString()}</b></span>
            <span>Available <b className="font-mono">{ledger.available.toLocaleString()}</b></span>
            <span>Allocated <b className="font-mono">{ledger.allocated.toLocaleString()}</b></span>
            <span className={ledger.uncovered ? "text-amber-800 font-semibold" : "text-emerald-700"}>Uncovered <b className="font-mono">{ledger.uncovered.toLocaleString()}</b></span>
          </div>
          {sources.length === 0 && (
            <p className="text-[10px] text-amber-800">
              No confirmed reusable excavation is available for this source item. Ask the Project Manager to review the activation date or opening balance.
            </p>
          )}
          {sources.map(source => {
            const current = allocations.find(a => a.sourceKey === source.key)?.quantity ?? 0;
            return <div key={source.key} className="flex items-center gap-2">
              <span className="text-[10px] flex-1 truncate" title={source.label}>{source.label} · {source.availableQty.toLocaleString()} available</span>
              <Input className="h-7 w-24 text-[11px] bg-white" type="number" min={0} value={current || ""}
                onChange={event => {
                  const quantityValue = Number(event.target.value) || 0;
                  const rest = allocations.filter(a => a.sourceKey !== source.key);
                  onAllocationsChange([...rest, ...(quantityValue > 0 ? [{ sourceKey: source.key, sourceEntryKey: source.sourceEntryKey ?? null, openingBalanceId: source.openingBalanceId ?? null, quantity: quantityValue }] : [])]);
                }} />
            </div>;
          })}
        </div>
      )}
    </div>
  );
}