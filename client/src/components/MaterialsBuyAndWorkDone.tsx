import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, Link2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanVsActualRow } from "@shared/schema";

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
  usedCft: number | null;
  atPlantNow: number | null;
  atPlantNowCft: number | null;
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
    materialNeed: number | null;
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

function quantity(value: number | null, uom: string, cft: number | null, showCft: boolean) {
  if (value == null || !Number.isFinite(value)) return "—";
  const primary = `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${uom}`;
  return showCft ? `${primary} · ${cft == null ? "—" : `≈ ${cft.toLocaleString("en-IN", { maximumFractionDigits: 0 })} CFT`}` : primary;
}

function shouldShowCft(row: MaterialPlanRow) {
  return row.showCft ?? (/cum loose/i.test(row.uom) || /aggregate|sand|dust|filler/i.test(row.materialName));
}

function shortDescription(row: PlanVsActualRow) {
  return `${row.itemCode ? `[${row.itemCode}] ` : ""}${row.description}`;
}

function materialUseText(row: MaterialPlanRow, value: number | null) {
  return quantity(value, row.uom, row.usedCft, row.showCft ?? (/cum loose/i.test(row.uom) || /aggregate|sand|dust|filler/i.test(row.materialName)));
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
  const [byMonth, setByMonth] = useState(false);
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
  const months = useMemo(() => {
    const values = new Set<number>();
    for (const row of rows) for (const month of Object.keys(row.monthlyNeed)) values.add(Number(month));
    return Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  }, [rows]);

  const workExport = useMemo(() => workRows.map((row) => ({
    "BOQ item": shortDescription(row),
    "BOQ qty": `${row.currentQty} ${row.unit}`,
    "Done (DPR)": row.actualIncomplete || row.totalActual == null ? "Incomplete" : `${row.totalActual} ${row.unit}`,
    "% done": row.actualIncomplete || row.percentComplete == null ? "Incomplete" : `${row.percentComplete}%`,
    Balance: row.actualIncomplete || row.totalActual == null ? "Incomplete" : `${Math.max(0, row.currentQty - row.totalActual)} ${row.unit}`,
  })), [workRows]);

  const exportExcel = () => {
    if (!reportQuery.data) return;
    const materialExport = rows.map((row) => ({
      Material: row.materialName,
      For: row.forLabels.join(", "),
      Unit: row.uom,
      "Need to buy": byMonth
        ? months.map((month) => {
          const value = row.monthlyNeed[String(month)];
          return `P${month}: ${value == null ? "—" : quantity(value, row.uom, null, false)}`;
        }).join(" · ")
        : quantity(row.needToBuy, row.uom, row.needToBuyCft, shouldShowCft(row)),
      "Bought so far": row.hasSiteSupply || row.sourceType === "site" || row.sourceType === "mixed"
        ? quantity(row.boughtSoFar, row.uom, row.boughtSoFarCft, shouldShowCft(row))
        : "—",
      "At plant now": row.hasPlantMix || row.sourceType === "plant_mix" || row.sourceType === "mixed"
        ? quantity(row.atPlantNow, row.uom, row.atPlantNowCft, shouldShowCft(row))
        : "—",
      Used: materialUseText(row, row.used),
      "Still to buy": row.excess != null
        ? `Excess ${quantity(row.excess, row.uom, row.excessCft, shouldShowCft(row))}`
        : quantity(row.stillToBuy, row.uom, row.stillToBuyCft, shouldShowCft(row)),
      Source: [
        ...row.sourceNotes,
        ...(row.soilValuesMissingCount
          ? [`${row.soilValuesMissingCount} item${row.soilValuesMissingCount === 1 ? "" : "s"} need soil values`]
          : []),
      ].join("; "),
      Attribution: row.attributions.join(", "),
      "BOQ items": row.lines.map((line) => `${line.itemCode ? `[${line.itemCode}] ` : ""}${line.itemName || line.description} · ${line.boqQuantity} ${line.boqUom} → ${line.materialNeed == null ? "—" : `${line.materialNeed} ${row.uom}`}`).join("; "),
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
      head: [["Material", "For", "Attribution", byMonth ? "Need by programme month" : "Need to buy", "Bought so far / At plant now", "Used", "Still to buy"]],
      body: rows.map((row) => [
        row.materialName,
        row.forLabels.join(", "),
        row.attributions.join(", "),
        byMonth
          ? months.map((month) => {
            const value = row.monthlyNeed[String(month)];
            return `P${month}: ${value == null ? "—" : quantity(value, row.uom, null, false)}`;
          }).join("\n")
          : quantity(row.needToBuy, row.uom, row.needToBuyCft, shouldShowCft(row)),
        [
          row.hasSiteSupply || row.sourceType === "site" || row.sourceType === "mixed"
            ? `Bought: ${quantity(row.boughtSoFar, row.uom, row.boughtSoFarCft, shouldShowCft(row))}`
            : null,
          row.hasPlantMix || row.sourceType === "plant_mix" || row.sourceType === "mixed"
            ? `At plant: ${quantity(row.atPlantNow, row.uom, row.atPlantNowCft, shouldShowCft(row))}`
            : null,
        ].filter(Boolean).join("\n"),
        materialUseText(row, row.used),
        row.excess != null
          ? `Excess ${quantity(row.excess, row.uom, row.excessCft, shouldShowCft(row))}`
          : quantity(row.stillToBuy, row.uom, row.stillToBuyCft, shouldShowCft(row)),
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
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Materials: buy and use</h3>
            <p className="text-xs text-slate-500">Plant stock is shared across projects and is not reserved.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">Actuals from<Input aria-label="Actuals from" type="date" value={from} onChange={(event) => setFromOverride(event.target.value)} className="mt-1 h-8 w-36 text-xs" /></label>
            <label className="text-xs text-slate-500">To<Input aria-label="Actuals to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-8 w-36 text-xs" /></label>
            <Button size="sm" variant={byMonth ? "default" : "outline"} onClick={() => setByMonth((value) => !value)} data-testid="toggle-plan-by-month">
              {byMonth ? "By month ✓" : "By month"}
            </Button>
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
            <table className="min-w-[920px] w-full text-xs" data-testid="table-materials-buy-use">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="sticky left-0 bg-slate-100 px-2 py-2 dark:bg-slate-800">Material</th>
                  <th className="px-2 py-2">Need to buy</th>
                  <th className="px-2 py-2">{rows.some((row) => row.hasPlantMix || row.sourceType === "plant_mix" || row.sourceType === "mixed") ? "Bought so far / At plant now" : "Bought so far"}</th>
                  <th className="px-2 py-2">Used</th>
                  <th className="px-2 py-2">Still to buy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expanded.has(row.materialName);
                  const showCft = shouldShowCft(row);
                  const needDisplay = byMonth
                    ? months.map((month) => {
                      const value = row.monthlyNeed[String(month)];
                      return value == null ? null : `P${month}: ${quantity(value, row.uom, null, false)}`;
                    }).filter(Boolean).join(" · ") || "—"
                    : quantity(row.needToBuy, row.uom, row.needToBuyCft, showCft);
                  const remainingDisplay = row.excess != null
                    ? `Excess ${quantity(row.excess, row.uom, row.excessCft, showCft)}`
                    : quantity(row.stillToBuy, row.uom, row.stillToBuyCft, showCft);
                  return (
                    <Fragment key={`${row.materialMasterId ?? row.materialName}-${row.uom}`}>
                      <tr className="border-t align-top hover:bg-slate-50 dark:hover:bg-slate-900" data-testid={`buy-use-row-${row.materialName}-${row.sourceType}`}>
                        <td className="sticky left-0 bg-white px-2 py-2 dark:bg-slate-950">
                          <div className="flex items-start gap-1.5">
                            <button type="button" onClick={() => toggleExpanded(row.materialName)} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${row.materialName}`} className="mt-0.5 text-slate-500">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <span>
                              <span className="font-medium text-slate-800 dark:text-slate-100">{row.materialName}</span>
                              {row.forLabels.length > 0 && <span className="block text-[10px] text-slate-500">for: {row.forLabels.slice(0, 3).join(", ")}</span>}
                              {row.sourceNotes.length > 0 && <span className="block text-[10px] text-slate-500">{row.sourceNotes.join(" · ")}</span>}
                              {!!row.soilValuesMissingCount && <span className="block text-[10px] text-amber-700">{row.soilValuesMissingCount} item{row.soilValuesMissingCount === 1 ? "" : "s"} need soil values</span>}
                              {row.attributions.map((attribution) => (
                                <span key={attribution} className="block text-[10px] text-slate-500">{attribution}</span>
                              ))}
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
                        <td className="whitespace-nowrap px-2 py-2 font-mono">{needDisplay}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono">
                          {(row.hasSiteSupply || row.sourceType === "site" || row.sourceType === "mixed") && <span className="block">Bought: {quantity(row.boughtSoFar, row.uom, row.boughtSoFarCft, showCft)}</span>}
                          {(row.hasPlantMix || row.sourceType === "plant_mix" || row.sourceType === "mixed") && <span className="block">At plant now: {quantity(row.atPlantNow, row.uom, row.atPlantNowCft, showCft)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono">{quantity(row.used, row.uom, row.usedCft, showCft)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono font-semibold">{remainingDisplay}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t bg-teal-50/40 dark:bg-teal-950/20">
                          <td colSpan={5} className="px-4 py-2">
                            <div className="space-y-1">
                              {row.lines.map((line, index) => (
                                <p key={`${line.boqItemId}-${index}`} className="text-[11px] text-slate-700 dark:text-slate-300">
                                  {line.itemCode ? `[${line.itemCode}] ` : ""}{line.itemName || line.description} · {line.boqQuantity.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {line.boqUom} → {line.materialNeed == null ? "—" : `${line.materialNeed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.uom}`}
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
                {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No material demand found.</td></tr>}
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
