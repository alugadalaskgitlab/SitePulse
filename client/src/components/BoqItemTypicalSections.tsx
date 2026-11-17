import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BoqItemSection, BoqItemWithCategory } from "@shared/schema";
import {
  allocateBoqQuantityToWorkingReaches,
  defaultsToFixedQuantity,
  typicalSectionQuantityPerMetre,
  typicalSectionUnit,
  typicalSectionsValidationError,
  type BoqTypicalSection,
} from "@shared/workingReachValue";

type SectionFormRow = {
  rowKey: string;
  id?: number;
  chainageFrom: string;
  chainageTo: string;
  topWidthM: string;
  thicknessMm: string;
  sideSlope: string;
  note: string;
};

function asFormRows(rows: BoqItemSection[]): SectionFormRow[] {
  return rows.map((row, index) => ({
    rowKey: `saved-${row.id ?? index}`,
    id: row.id,
    chainageFrom: String(row.chainageFrom),
    chainageTo: String(row.chainageTo),
    topWidthM: String(row.topWidthM),
    thicknessMm: row.thicknessMm == null ? "" : String(row.thicknessMm),
    sideSlope: String(row.sideSlope),
    note: row.note ?? "",
  }));
}

function formatQuantity(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
}

function toTypedSection(row: SectionFormRow, unit: string): BoqTypicalSection {
  const sectionUnit = typicalSectionUnit(unit);
  return {
    ...(row.id != null ? { id: row.id } : {}),
    chainageFrom: row.chainageFrom as unknown as number,
    chainageTo: row.chainageTo as unknown as number,
    topWidthM: row.topWidthM as unknown as number,
    thicknessMm: sectionUnit === "CUM" ? row.thicknessMm as unknown as number : null,
    sideSlope: row.sideSlope as unknown as number,
    note: row.note,
  };
}

export function BoqItemTypicalSections({
  item,
  projectId,
  unit,
  fixedQuantityMode,
  scopeSegments,
  canEdit,
}: {
  item: BoqItemWithCategory;
  projectId: number;
  unit: string;
  fixedQuantityMode: "default" | "fixed" | "share";
  scopeSegments: any[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const { data: savedRows = [], isLoading, isError, error } = useQuery<BoqItemSection[]>({
    queryKey: ["/api/boq/items", item.id, "sections"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/items/${item.id}/sections`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load typical sections.");
      return response.json();
    },
  });
  const [rows, setRows] = useState<SectionFormRow[]>([]);
  const [nextLocalId, setNextLocalId] = useState(1);
  useEffect(() => setRows(asFormRows(savedRows)), [savedRows]);

  const sectionUnit = typicalSectionUnit(unit);
  const typedRows = useMemo(() => rows.map(row => toTypedSection(row, unit)), [rows, unit]);
  const validationError = rows.length ? typicalSectionsValidationError(unit, typedRows) : null;
  const completeRows = rows
    .map((row, index) => ({ row, index, section: toTypedSection(row, unit) }))
    .filter(({ section }) => typicalSectionQuantityPerMetre(unit, section) != null
      && rowHasValidChainage(section));
  const completeSections = completeRows.map(({ section }) => section);
  const completeRowsError = completeSections.length
    ? typicalSectionsValidationError(unit, completeSections)
    : null;
  const fixed = fixedQuantityMode === "fixed"
    || (fixedQuantityMode === "default" && (item.fixedQuantity ?? defaultsToFixedQuantity({
      unit,
      itemName: item.itemName,
      workCategory: item.workCategory,
      planningWorkType: item.planningWorkType,
      layerConfig: item.layerConfig as Record<string, unknown> | null,
    })));
  const allocation = !fixed && completeSections.length > 0 && !completeRowsError
    ? allocateBoqQuantityToWorkingReaches({
      boqItemId: item.id,
      categoryId: item.categoryId,
      isLinear: !["structure", "non_linear"].includes(String(item.layerConfig?.layerType ?? item.workCategory ?? "").toLowerCase()),
      currentQty: Number(item.currentQty) || 0,
      unit,
      fixedQuantity: false,
      fixedQuantityReachId: item.fixedQuantityReachId,
      itemName: item.itemName,
      planningWorkType: item.planningWorkType,
      workCategory: item.workCategory,
      layerConfig: item.layerConfig as Record<string, unknown> | null,
    }, scopeSegments, completeSections)
    : null;
  const resultByRowIndex = new Map<number, { quantityPerMetre: number; stretchQuantity: number }>();
  for (const result of allocation?.sectionResults ?? []) {
    const sourceRow = completeRows[result.sectionIndex];
    if (sourceRow) resultByRowIndex.set(sourceRow.index, result);
  }
  const sectionQuantity = allocation?.sectionResults?.reduce((sum, row) => sum + row.stretchQuantity, 0) ?? 0;
  const hasUnsavedChanges = JSON.stringify(rows) !== JSON.stringify(asFormRows(savedRows));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sections = rows.map(row => ({
        ...(row.id != null ? { id: row.id } : {}),
        chainageFrom: row.chainageFrom,
        chainageTo: row.chainageTo,
        topWidthM: row.topWidthM,
        thicknessMm: sectionUnit === "CUM" ? row.thicknessMm : null,
        sideSlope: row.sideSlope,
        note: row.note.trim() || null,
      }));
      const response = await apiRequest("PUT", `/api/boq/items/${item.id}/sections`, { projectId, sections });
      return response.json() as Promise<BoqItemSection[]>;
    },
    onSuccess: async saved => {
      setRows(asFormRows(saved));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/boq/items", item.id, "sections"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "bom"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "work-value"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "material-buy-use"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/boq/projects/${projectId}/scope-alignment/preview`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/reports/material-balance", projectId] }),
      ]);
      toast({ title: "Typical sections saved" });
    },
    onError: error => toast({
      title: "Could not save typical sections",
      description: error instanceof Error ? error.message : "Check the section values and try again.",
      variant: "destructive",
    }),
  });

  function updateRow(rowKey: string, field: keyof Omit<SectionFormRow, "rowKey" | "id">, value: string) {
    setRows(current => current.map(row => row.rowKey === rowKey ? { ...row, [field]: value } : row));
  }

  return (
    <section className="space-y-3 rounded-md border p-3" data-testid="boq-typical-sections">
      <div>
        <h3 className="text-sm font-semibold">Typical section (optional)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          For CUM: q/m = (top width + side slope × thickness) × thickness. For SQM: q/m = width.
          Chainages are in km. Unsectioned lengths keep the current length-share.
        </p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading typical sections…</p> : null}
      {isError ? <p className="text-sm text-red-700" role="alert">{error instanceof Error ? error.message : "Could not load typical sections."}</p> : null}
      {!sectionUnit && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Typical sections are available only for CUM and SQM items. Existing rows, if any, are not applied to this unit.
        </p>
      )}
      {sectionUnit && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-1.5 py-2 font-medium">From km</th>
                  <th className="px-1.5 py-2 font-medium">To km</th>
                  <th className="px-1.5 py-2 font-medium">Top width m</th>
                  {sectionUnit === "CUM" && <th className="px-1.5 py-2 font-medium">Thickness mm</th>}
                  {sectionUnit === "CUM" && <th className="px-1.5 py-2 font-medium">Side slope</th>}
                  <th className="px-1.5 py-2 font-medium">Note</th>
                  <th className="px-1.5 py-2 text-right font-medium">Quantity per metre</th>
                  <th className="px-1.5 py-2 text-right font-medium">Stretch quantity</th>
                  {canEdit && <th className="w-8 px-1 py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const section = toTypedSection(row, unit);
                  const quantityPerMetre = typicalSectionQuantityPerMetre(unit, section);
                  const result = resultByRowIndex.get(index);
                  return (
                    <tr key={row.rowKey} className="border-b last:border-0">
                      <td className="p-1">
                        <Input aria-label={`Section ${index + 1} from km`} type="number" step="any" min="0"
                          value={row.chainageFrom} disabled={!canEdit || !sectionUnit}
                          onChange={event => updateRow(row.rowKey, "chainageFrom", event.target.value)} />
                      </td>
                      <td className="p-1">
                        <Input aria-label={`Section ${index + 1} to km`} type="number" step="any" min="0"
                          value={row.chainageTo} disabled={!canEdit || !sectionUnit}
                          onChange={event => updateRow(row.rowKey, "chainageTo", event.target.value)} />
                      </td>
                      <td className="p-1">
                        <Input aria-label={`Section ${index + 1} top width`} type="number" step="any" min="0"
                          value={row.topWidthM} disabled={!canEdit}
                          onChange={event => updateRow(row.rowKey, "topWidthM", event.target.value)} />
                      </td>
                      {sectionUnit === "CUM" && <>
                        <td className="p-1">
                          <Input aria-label={`Section ${index + 1} thickness`} type="number" step="any" min="0"
                            value={row.thicknessMm} disabled={!canEdit}
                            onChange={event => updateRow(row.rowKey, "thicknessMm", event.target.value)} />
                        </td>
                        <td className="p-1">
                          <Input aria-label={`Section ${index + 1} side slope`} type="number" step="any" min="0"
                            value={row.sideSlope} disabled={!canEdit}
                            onChange={event => updateRow(row.rowKey, "sideSlope", event.target.value)} />
                        </td>
                      </>}
                      <td className="p-1">
                        <Input aria-label={`Section ${index + 1} note`} maxLength={1000}
                          value={row.note} disabled={!canEdit}
                          onChange={event => updateRow(row.rowKey, "note", event.target.value)} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        {quantityPerMetre == null ? "—" : `${formatQuantity(quantityPerMetre, 4)} ${sectionUnit.toLowerCase()}/m`}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        {fixed ? "Not applied" : result ? `${formatQuantity(result.stretchQuantity)} ${sectionUnit.toLowerCase()}` : "—"}
                      </td>
                      {canEdit && <td className="p-1 text-right">
                        <Button type="button" size="icon" variant="ghost" aria-label={`Remove section ${index + 1}`}
                          onClick={() => setRows(current => current.filter(candidate => candidate.rowKey !== row.rowKey))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>}
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={canEdit ? 9 : 8} className="py-3 text-center text-muted-foreground">
                  No typical sections entered.
                </td></tr>}
              </tbody>
            </table>
          </div>
          {validationError && rows.length > 0 && (
            <p className="text-xs text-red-700" role="alert" data-testid="typical-section-validation">{validationError}</p>
          )}
          {fixed && rows.length > 0 && (
            <p className="text-xs text-amber-800">This item uses a fixed quantity; typical sections do not change its planning quantity.</p>
          )}
          {rows.length > 0 && !fixed && !validationError && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" data-testid="typical-section-totals">
              <span>Section quantity: {formatQuantity(sectionQuantity)} {sectionUnit.toLowerCase()}</span>
              <span>BOQ quantity: {formatQuantity(Number(item.currentQty) || 0)} {sectionUnit.toLowerCase()}</span>
              <span className={allocation?.overBoqQuantity ? "font-medium text-amber-800" : "text-muted-foreground"}>
                {allocation?.overBoqQuantity
                  ? `${formatQuantity(allocation.overBoqQuantity)} ${sectionUnit.toLowerCase()} more than BOQ`
                  : `${formatQuantity(Math.max(0, (Number(item.currentQty) || 0) - sectionQuantity))} ${sectionUnit.toLowerCase()} less than BOQ`}
              </span>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" size="sm"
                onClick={() => {
                  setRows(current => [...current, {
                    rowKey: `new-${nextLocalId}`, chainageFrom: "", chainageTo: "",
                    topWidthM: "", thicknessMm: "", sideSlope: "2", note: "",
                  }]);
                  setNextLocalId(value => value + 1);
                }}
                data-testid="button-add-typical-section">
                <Plus className="mr-1 h-4 w-4" /> Add section
              </Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!hasUnsavedChanges || saveMutation.isPending}
                  onClick={() => setRows(asFormRows(savedRows))} data-testid="button-cancel-typical-sections">
                  <RotateCcw className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button type="button" size="sm" disabled={!hasUnsavedChanges || !!validationError || saveMutation.isPending || isError}
                  onClick={() => saveMutation.mutate()} data-testid="button-save-typical-sections">
                  <Save className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save sections"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function rowHasValidChainage(section: BoqTypicalSection): boolean {
  return Number.isFinite(Number(section.chainageFrom))
    && Number.isFinite(Number(section.chainageTo))
    && Number(section.chainageFrom) >= 0
    && Number(section.chainageTo) > Number(section.chainageFrom);
}
