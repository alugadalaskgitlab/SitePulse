import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatChainagePair,
  formatChainage, toBookChainage, initialCheckGrid, checkedGridSummary, levelPersonName, rangeCalculation,
  type CheckDetails,
  type BookChainageSystem,
  type LevelSheetCalculation,
} from "@shared/levelSheets";
import type { SheetReadingRow } from "./ReadingsTab";

const upper = (value: unknown) => String(value ?? "").toLocaleUpperCase("en");
const pointName = (point: { side: string; distanceM: number | null }) =>
  point.side === "CL" ? "CL" : `${point.side}${point.distanceM == null ? "?" : String(point.distanceM)}`;

export function LevelSheetPrintPreview({ siteName, itemLabel, layerName, sheetDate, instrument, tbmName, tbmRl,
  closingErrorMm, readings, calculation: wholeCalculation, settings, staffNames, checkedByType, checkedByName, checkedByDesignation,
  checkedDate, basisLabel = "Own levels", closingTbmName, closingTbmRl, readingMode = "rl", checkedPoints = [], checkDetails,
}: {
  siteName: string;
  itemLabel: string;
  layerName: string;
  sheetDate: string;
  instrument: string;
  tbmName: string;
  tbmRl: string;
  closingErrorMm: number | null;
  readings: SheetReadingRow[];
  calculation: LevelSheetCalculation;
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  staffNames: string[];
  checkedByType: "not_checked" | "department" | "consultant";
  checkedByName: string;
  checkedByDesignation: string;
  checkedDate: string;
  basisLabel?: string;
  closingTbmName?: string;
  closingTbmRl?: string;
  readingMode?: "rl" | "staff";
  checkedPoints?: Array<{ chainageOursKm: number; columnKey: string; checked: boolean; checkedRl: string | number | null }>;
  checkDetails?: CheckDetails | null;
}) {
  const [open, setOpen] = useState(false);
  const pointColumns = readings[0]?.points ?? [];
  const grid = initialCheckGrid(readings, checkedPoints.map(point => ({ ...point, checkedRl: point.checkedRl === "" || point.checkedRl == null ? null : Number(point.checkedRl) })), checkDetails?.grid);
  const summary = checkedGridSummary(grid, wholeCalculation.sections);
  const calculation = checkedByType === "not_checked" ? wholeCalculation : rangeCalculation(wholeCalculation, grid.fromKm, grid.toKm);
  const book = (value: number | null) => value == null ? "—" : formatChainage(toBookChainage(value, settings.bookChainageSystem, settings.consultantOffsetM));

  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>Print preview</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Level sheet print preview</DialogTitle>
          <DialogDescription>Black-and-white level readings and quantities.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end print:hidden">
          <Button type="button" onClick={() => window.print()}>Print</Button>
        </div>
        <style>{`
          @page { size: A4 portrait; margin: 12mm; }
          @media print {
            body * { visibility: hidden !important; }
            #level-sheet-print-area, #level-sheet-print-area * { visibility: visible !important; }
            #level-sheet-print-area { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; color: #000 !important; background: #fff !important; font-size: 9pt !important; }
            #level-sheet-print-area table { border-collapse: collapse !important; width: 100% !important; }
            #level-sheet-print-area th, #level-sheet-print-area td { border: 1px solid #000 !important; background: transparent !important; color: #000 !important; padding: 3px !important; }
            #level-sheet-print-area .print-signature { display: block !important; margin-top: 16mm !important; border-top: 1px solid #000 !important; padding-top: 2mm !important; }
            #level-sheet-print-area .print-no-fill { background: transparent !important; box-shadow: none !important; }
          }
        `}</style>
        <article id="level-sheet-print-area" className="mx-auto w-full max-w-4xl space-y-3 text-black">
          <header className="border-b border-black pb-2 text-center">
            <h1 className="text-xl font-bold">Level sheet</h1>
            <p className="font-semibold">{upper(siteName)}</p>
            <p>{itemLabel ? upper(itemLabel) : "BOQ item not selected"} · {upper(layerName)}</p>
          </header>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:grid-cols-4">
            <p>Date: {sheetDate}</p><p>Instrument: {instrument || "—"}</p>
            <p>TBM: {tbmName || "—"}</p><p>Known TBM RL: {tbmRl || "—"}</p>
            {readingMode === "staff" && <p>Closing error: {closingErrorMm == null ? "—" : `${Math.round(closingErrorMm)} mm`}</p>}
            <p>Basis: {basisLabel}</p>
            {readings.some(row => row.points.some(point => point.remark === "Made from design levels")) && <p>Made from design levels</p>}
            {readingMode === "staff" && closingTbmName && <p>Closing TBM: {upper(closingTbmName)} · RL {closingTbmRl ? Number(closingTbmRl).toFixed(3) : "—"}</p>}
          </div>
          <table className="w-full border-collapse text-xs">
            <thead><tr>
              <th>Chainage</th>
              {pointColumns.map((point, index) => <th key={point.columnKey ?? index}>{pointName(point)}</th>)}
              <th>Cut (sqm)</th><th>Fill (sqm)</th><th>Section</th>
            </tr></thead>
            <tbody>{calculation.sections.map(section => {
              const original = readings.find(row => row.chainageOursKm === section.chainageOursKm);
              return <tr key={section.chainageOursKm}>
                <td>{formatChainagePair(section.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</td>
                {pointColumns.map((column, index) => {
                  const point = section.points.find(value => value.columnKey === column.columnKey) ?? section.points[index];
                  const theirs = checkedByType === "not_checked" ? undefined : summary.points.find(value => value.chainageOursKm === section.chainageOursKm && value.columnKey === column.columnKey);
                  const raw = original?.points.find(value => value.columnKey === column.columnKey)?.value;
                  return <td key={column.columnKey ?? index}>
                    {point ? <>
                      <span>Ours {point.rl == null ? "—" : point.rl.toFixed(3)}</span>
                      <br />Design {point.designLevel == null ? "—" : point.designLevel.toFixed(3)}
                      <br />Theirs {theirs == null ? "—" : theirs.checkedRl.toFixed(3)}
                      <br />Difference {theirs?.differenceMm == null ? "—" : `${theirs.differenceMm > 0 ? "+" : ""}${Math.round(theirs.differenceMm)} mm`}
                      <br />{point.differenceMm == null ? (point.comparison === "outside width" ? "outside width" : "—")
                        : `${point.differenceMm > 0 ? "+" : ""}${Math.round(point.differenceMm)} mm · ${point.comparison}`}
                      {raw != null && point.rl !== raw && <><br />Entered {Number(raw).toFixed(3)}</>}
                    </> : "—"}
                  </td>;
                })}
                <td>{section.cutAreaSqm == null ? "—" : section.cutAreaSqm.toFixed(2)}</td>
                <td>{section.fillAreaSqm == null ? "—" : section.fillAreaSqm.toFixed(2)}</td>
                <td>{section.status ?? "—"}</td>
              </tr>;
            })}</tbody>
          </table>
          <section className="flex flex-wrap gap-x-6 gap-y-1 border-y border-black py-2 text-sm">
            <p>Points within: {calculation.pointsWithin} of {calculation.comparedPoints}</p>
            <p>High: {calculation.pointsHigh}</p><p>Low: {calculation.pointsLow}</p>
            <p>Cut: {calculation.volumeSegments ? calculation.cutVolumeCum.toFixed(1) : "—"} cum</p>
            <p>Fill: {calculation.volumeSegments ? calculation.fillVolumeCum.toFixed(1) : "—"} cum</p>
            <p>Chainages: {calculation.sections.length}</p>
          </section>
          <p className="text-sm">Taken by: {staffNames.length ? staffNames.map(levelPersonName).join(", ") : "—"}</p>
          <p className="text-sm">Checked by: {checkedByType === "not_checked" ? "Not checked yet" : `${checkedByType} · ${levelPersonName(checkedByName)}`}</p>
          {checkedByType !== "not_checked" && <p>Offered {book(grid.fromKm)} to {book(grid.toKm)} · checked {summary.points.length} points at {summary.chainages} chainages · largest difference {summary.largestDifferenceMm == null ? "—" : Math.round(summary.largestDifferenceMm)} mm</p>}
          <section className="grid grid-cols-2 gap-4 text-sm">
            {(["contractor", "checker"] as const).map(key => {
              const signature = checkDetails?.signatures[key];
              const name = signature?.name || (key === "checker" ? checkedByName : staffNames.join(", "));
              return <div key={key} style={{ breakInside: "avoid" }}>
                <p className="text-xs">{key === "contractor" ? "For the contractor (HLC)" : "For the department / consultant"}</p>
                <p className="text-lg font-semibold">{name ? levelPersonName(name) : "Name: ____________________"}</p>
                <p>Designation: {signature?.designation || (key === "checker" ? checkedByDesignation : "") || "____________________"}</p>
                <p>Date: {signature?.date || (key === "checker" ? checkedDate : "") || "____________________"}</p>
                {signature?.imageData ? <img className="h-20 w-full object-contain" src={signature.imageData} alt={`${key} signature`} /> : <div className="print-signature">Signature</div>}
                {signature?.signedAt && <p className="text-xs">Signed {new Date(signature.signedAt).toLocaleString()} · Recorded by {levelPersonName(signature.recordedByName ?? "")}</p>}
              </div>;
            })}
          </section>
        </article>
      </DialogContent>
    </Dialog>
  </>;
}
