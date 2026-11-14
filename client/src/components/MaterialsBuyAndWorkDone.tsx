import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, Link2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanVsActualRow } from "@shared/schema";
import { getShortName } from "@shared/planningEngine";
import { boqItemDisplayName } from "@/lib/itemName";

export type MaterialPlanRow = {
  materialName: string;
  forLabels: string[];
  uom: string;
  showCft?: boolean;
  sourceType: "plant_mix" | "site" | "mixed";
  hasSiteSupply?: boolean;
  hasPlantMix?: boolean;
  soilValuesMissingCount?: number;
  needToBuy: number | null;
  needToBuyCft: number | null;
  boughtSoFar: number | null;
  boughtSoFarCft: number | null;
  used: number | null;
  usedBySource?: { plant_mix: number; site: number };
  usedCompleteBySource?: { plant_mix: boolean; site: boolean };
  siteIssued?: number | null;
  siteIssuedComplete?: boolean;
  boughtComplete?: boolean;
  usedCft: number | null;
  lyingAtSite?: number | null;
  lyingAtSiteCft?: number | null;
  siteStockWarning?: string | null;
  balanceWorkNeeds?: number | null;
  balanceWorkNeedsCft?: number | null;
  valueOfBalanceWork?: number | null;
  incidentalUsed?: number | null;
  incidentalUsedCft?: number | null;
  atPlantNow: number | null;
  atPlantNowCft: number | null;
  plantStockWarning?: string | null;
  stillToBuy: number | null;
  stillToBuyCft: number | null;
  excess: number | null;
  excessCft: number | null;
  monthlyNeed: Record<string, number | null>;
  lines: Array<{
    boqItemId: number;
    itemCode: string | null;
    description: string;
    itemName: string | null;
    boqQuantity: number;
    boqUom: string;
    reachQuantities?: Array<{ reachId: number | null; label: string; quantity: number; effectiveLengthKm: number }>;
    notNeededQuantity?: number;
    materialNeed: number | null;
    workDoneQuantity?: number;
    shouldHaveUsed?: number | null;
    valueOfBalanceWork?: number | null;
    sourceNote: string | null;
  }>;
  sourceNotes: string[];
  attributions: string[];
  setupAction: "link_master" | "set_values" | null;
  setupItemId: number | null;
  materialMasterId: number | null;
};

export type MaterialPlanResponse = {
  projectId: number;
  projectName: string;
  siteName: string;
  from: string;
  to: string;
  plantStockShared: boolean;
  storeIssuePolicy: string;
  rows: MaterialPlanRow[];
};

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

function shortDescription(row: PlanVsActualRow) {
  return `${row.itemCode ? `[${row.itemCode}] ` : ""}${row.description}`;
}

function shouldHaveUsed(row: MaterialPlanRow): number | null {
  if (!row.lines.length) return null;
  let total = 0;
  for (const line of row.lines) {
    if (line.shouldHaveUsed == null || !Number.isFinite(Number(line.shouldHaveUsed))) return null;
    total += Number(line.shouldHaveUsed);
  }
  return total;
}

function actuallyReceived(row: MaterialPlanRow): number | null {
  const attributions = row.attributions ?? [];
  const hasDispatch = attributions.some(value => value.startsWith("Plant dispatch"));
  const hasSiteReceipt = attributions.some(value => value.startsWith("Bought by"));
  const hasStoreIssue = attributions.some(value => value.startsWith("Used by site (linked"));
  const parts: number[] = [];
  if (row.hasPlantMix || row.sourceType === "plant_mix" || row.sourceType === "mixed") {
    if (!hasDispatch || row.usedCompleteBySource?.plant_mix === false) return null;
    parts.push(Number(row.usedBySource?.plant_mix) || 0);
  }
  if (row.hasSiteSupply || row.sourceType === "site" || row.sourceType === "mixed") {
    if (hasStoreIssue) {
      if (row.siteIssuedComplete === false || row.siteIssued == null) return null;
      parts.push(Number(row.siteIssued) || 0);
    } else if (hasSiteReceipt) {
      if (row.boughtComplete === false || row.boughtSoFar == null) return null;
      parts.push(Number(row.boughtSoFar) || 0);
    } else {
      return null;
    }
  }
  return parts.length ? parts.reduce((sum, value) => sum + value, 0) : null;
}

function differenceText(expected: number | null, actual: number | null, uom: string) {
  if (expected == null || actual == null || !Number.isFinite(expected) || !Number.isFinite(actual)) return "—";
  const difference = actual - expected;
  const amount = Math.abs(difference).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (Math.abs(difference) < 0.005) return `0 ${uom} — matches`;
  return `${difference > 0 ? "+" : "−"}${amount} ${uom} — ${difference > 0 ? "more used" : "less used"}`;
}

export function MaterialsBuyAndWorkDone({
  projectId,
  projectStartDate,
  workRows,
  workLoading,
  canEditDemandSource,
  onLinkMaster,
}: {
  projectId: number;
  projectStartDate?: string | null;
  workRows: PlanVsActualRow[];
  workLoading: boolean;
  canEditDemandSource: boolean;
  onLinkMaster: (boqItemId: number) => void;
}) {
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const from = fromOverride ?? (projectStartDate ? projectStartDate.slice(0, 10) : localDate(monthStart));
  const [to, setTo] = useState(localDate(today));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const reportQuery = useQuery<MaterialPlanResponse>({
    queryKey: ["/api/boq/projects", projectId, "material-buy-use", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/boq/projects/${projectId}/material-buy-use?${params}`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not load material buy/use.");
      return body;
    },
    enabled: Number.isSafeInteger(projectId) && from <= to,
  });
  const rows = reportQuery.data?.rows ?? [];
  const displayRows = useMemo(() => rows.map(row => ({
    row,
    expected: shouldHaveUsed(row),
    actual: actuallyReceived(row),
  })), [rows]);

  const workExport = useMemo(() => workRows.map((row) => ({
    "BOQ item": shortDescription(row),
    "BOQ qty": `${row.currentQty} ${row.unit}`,
    "Done (DPR)": row.actualIncomplete || row.totalActual == null ? "Incomplete" : `${row.totalActual} ${row.unit}`,
    "% done": row.actualIncomplete || row.percentComplete == null ? "Incomplete" : `${row.percentComplete}%`,
    Balance: row.actualIncomplete || row.totalActual == null ? "Incomplete" : `${Math.max(0, row.currentQty - row.totalActual)} ${row.unit}`,
  })), [workRows]);

  const exportExcel = () => {
    if (!reportQuery.data) return;
    const materialExport = displayRows.map(({ row, expected, actual }) => ({
      Material: row.materialName,
      "Should have used": expected == null ? "—" : `${expected.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`,
      "Actually received/dispatched": actual == null ? "—" : `${actual.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`,
      Difference: differenceText(expected, actual, row.uom),
      "BOQ items": row.lines.map(line =>
        `${line.itemCode ? `[${line.itemCode}] ` : ""}${line.itemName || line.description} · ${line.materialNeed == null ? "—" : `${line.materialNeed} ${row.uom}`}`,
      ).join("; "),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(materialExport), "Materials buy and use");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(workExport), "Work done");
    XLSX.writeFile(workbook, `plan-vs-actual-${projectId}-${from}-${to}.xlsx`);
  };

  const exportPdf = () => {
    if (!reportQuery.data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setTextColor(35);
    doc.setFontSize(14);
    doc.text(`${reportQuery.data.projectName} — Plan vs Actual`, 12, 14);
    doc.setFontSize(8);
    doc.text(`Actuals ${from}–${to} · Plant stock is shared across projects and is not reserved.`, 12, 20);
    autoTable(doc, {
      startY: 24,
      head: [["Material", "Should have used", "Actually received / dispatched to site", "Difference"]],
      body: displayRows.map(({ row, expected, actual }) => [
        row.materialName,
        expected == null ? "—" : `${expected.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`,
        actual == null ? "—" : `${actual.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`,
        differenceText(expected, actual, row.uom),
      ]),
      styles: { fontSize: 6.5, textColor: [40, 40, 40], lineColor: [175, 175, 175] },
      headStyles: { fillColor: [230, 230, 230], textColor: [20, 20, 20], lineColor: [145, 145, 145] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 8, right: 8 },
    });
    const nextY = (doc as any).lastAutoTable?.finalY ?? 30;
    autoTable(doc, {
      startY: nextY + 7,
      head: [["BOQ item", "BOQ qty", "Done (DPR)", "% done", "Balance"]],
      body: workExport.map((row) => [row["BOQ item"], row["BOQ qty"], row["Done (DPR)"], row["% done"], row.Balance]),
      styles: { fontSize: 7, textColor: [40, 40, 40], lineColor: [175, 175, 175] },
      headStyles: { fillColor: [230, 230, 230], textColor: [20, 20, 20], lineColor: [145, 145, 145] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 8, right: 8 },
    });
    doc.save(`plan-vs-actual-${projectId}-${from}-${to}.pdf`);
  };

  const toggleExpanded = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="space-y-5" data-testid="materials-buy-use-work-done">
      <section className="rounded-lg border bg-white p-3 dark:bg-slate-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Material plan vs actual</h3>
            <p className="max-w-3xl text-xs text-slate-500">
              Should have used uses submitted work and its saved recipe/geometry. Actual is project-linked receipts or issues, or plant dispatches for plant mixes. Positive difference means actual received or dispatched is higher than calculated use.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">Actuals from<Input aria-label="Actuals from" type="date" value={from} onChange={(event) => setFromOverride(event.target.value)} className="mt-1 h-8 w-36 text-xs" /></label>
            <label className="text-xs text-slate-500">To<Input aria-label="Actuals to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-8 w-36 text-xs" /></label>
            <Button size="sm" variant="outline" onClick={exportExcel} disabled={!reportQuery.data} data-testid="export-plan-excel">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={!reportQuery.data} data-testid="export-plan-pdf">
              <FileText className="mr-1.5 h-4 w-4" /> Greyscale PDF
            </Button>
          </div>
        </div>
        {reportQuery.isLoading && <p className="py-5 text-center text-sm text-slate-500">Loading materials…</p>}
        {reportQuery.isError && <p className="py-3 text-sm text-red-700">{(reportQuery.error as Error).message}</p>}
        {reportQuery.data && (
          <div className="mt-3 overflow-auto rounded-md border">
            <table className="min-w-[900px] w-full text-xs" data-testid="table-materials-buy-use">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="sticky left-0 bg-slate-100 px-2 py-2 dark:bg-slate-800">Material</th>
                  <th className="px-2 py-2 text-right">Should have used</th>
                  <th className="px-2 py-2 text-right">Actually received / dispatched to site</th>
                  <th className="px-2 py-2 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ row, expected, actual }) => {
                  const isExpanded = expanded.has(row.materialName);
                  return (
                    <Fragment key={`${row.materialMasterId ?? row.materialName}-${row.uom}`}>
                      <tr className="border-t align-top hover:bg-slate-50 dark:hover:bg-slate-900" data-testid={`buy-use-row-${row.materialName}-${row.sourceType}`}>
                        <td className="sticky left-0 bg-white px-2 py-2 dark:bg-slate-950">
                          <div className="flex items-start gap-1.5">
                            <button type="button" onClick={() => toggleExpanded(row.materialName)} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${row.materialName}`} className="mt-0.5 text-slate-500">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <span title={row.materialName}>
                              <span className="font-medium text-slate-800 dark:text-slate-100">{getShortName(row.materialName, 36)}</span>
                              {row.forLabels.length > 0 && <span className="block text-[10px] text-slate-500">for: {row.forLabels.slice(0, 3).join(", ")}</span>}
                              {row.setupAction === "link_master" && canEditDemandSource && row.setupItemId != null && (
                                <button type="button" className="mt-1 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-800" onClick={() => onLinkMaster(row.setupItemId!)}>
                                  <Link2 className="h-3 w-3" /> Link to master
                                </button>
                              )}
                              {row.setupAction === "set_values" && (
                                <a className="mt-1 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-800" href="/plant/dashboard#material-master">
                                  <Settings2 className="h-3 w-3" /> Set values
                                </a>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                          {expected == null ? "—" : `${expected.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                          {actual == null ? "—" : `${actual.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-semibold">{differenceText(expected, actual, row.uom)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t bg-teal-50/40 dark:bg-teal-950/20">
                           <td colSpan={4} className="px-4 py-2">
                            <div className="space-y-1">
                              {row.lines.map((line, index) => (
                                 <p key={`${line.boqItemId}-${index}`} className="text-[11px] text-slate-700 dark:text-slate-300" title={line.description}>
                                    {line.itemCode ? `[${line.itemCode}] ` : ""}{getShortName(boqItemDisplayName({ description: line.description, displayName: line.itemName }), 48)} · scope {line.boqQuantity.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {line.boqUom} → recipe need {line.materialNeed == null ? "—" : `${line.materialNeed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`}
                                  {line.sourceNote && <span className="ml-1 text-slate-500">· {line.sourceNote}</span>}
                                </p>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No material demand found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-3 dark:bg-slate-950">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Work done</h3>
        {workLoading && <p className="py-5 text-center text-sm text-slate-500">Loading work…</p>}
        {!workLoading && (
          <div className="mt-3 overflow-auto rounded-md border">
            <table className="min-w-[720px] w-full text-xs" data-testid="table-work-done">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="px-2 py-2">BOQ item</th><th className="px-2 py-2 text-right">BOQ qty</th>
                  <th className="px-2 py-2 text-right">Done (DPR)</th><th className="px-2 py-2 text-right">% done</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {workRows.map((row) => {
                  const incomplete = row.actualIncomplete || row.totalActual == null || row.percentComplete == null;
                  return (
                    <tr key={row.boqItemId} className="border-t" data-testid={`work-done-row-${row.boqItemId}`}>
                      <td className="px-2 py-2">{shortDescription(row)}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.currentQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {row.unit}</td>
                      <td className="px-2 py-2 text-right font-mono">{incomplete ? "Incomplete" : `${row.totalActual!.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.unit}`}</td>
                      <td className="px-2 py-2 text-right font-mono">{incomplete ? "Incomplete" : `${row.percentComplete!.toFixed(1)}%`}</td>
                      <td className="px-2 py-2 text-right font-mono">{incomplete ? "Incomplete" : `${Math.max(0, row.currentQty - row.totalActual!).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.unit}`}</td>
                    </tr>
                  );
                })}
                {workRows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No BOQ progress rows found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
