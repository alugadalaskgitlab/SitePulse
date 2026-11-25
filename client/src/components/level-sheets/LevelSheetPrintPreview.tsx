import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatChainagePair,
  type BookChainageSystem,
  type LevelSheetCalculation,
} from "@shared/levelSheets";
import type { SheetReadingRow } from "./ReadingsTab";

const upper = (value: unknown) => String(value ?? "").toLocaleUpperCase("en");
const pointName = (point: { side: string; distanceM: number | null }) =>
  point.side === "CL" ? "CL" : `${point.side}${point.distanceM == null ? "?" : String(point.distanceM)}`;

export function LevelSheetPrintPreview({ siteName, itemLabel, layerName, sheetDate, instrument, tbmName, tbmRl,
  closingErrorMm, readings, calculation, settings, staffNames, checkedByType, checkedByName, checkedByDesignation,
  checkedDate, basisLabel = "Own levels", closingTbmName, closingTbmRl,
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
}) {
  const [open, setOpen] = useState(false);
  const pointColumns = readings[0]?.points ?? [];

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
            <p>Closing error: {closingErrorMm == null ? "—" : `${Math.round(closingErrorMm)} mm`}</p>
            <p>Basis: {basisLabel}</p>
            {closingTbmName && <p>Closing TBM: {upper(closingTbmName)} · RL {closingTbmRl ? Number(closingTbmRl).toFixed(3) : "—"}</p>}
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
                  const raw = original?.points.find(value => value.columnKey === column.columnKey)?.value;
                  return <td key={column.columnKey ?? index}>
                    {point ? <>
                      <span>RL {point.rl == null ? "—" : point.rl.toFixed(3)}</span>
                      <br />D {point.designLevel == null ? "—" : point.designLevel.toFixed(3)}
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
            <p>Chainages: {readings.length}</p>
          </section>
          <section className="grid gap-4 text-sm sm:grid-cols-2">
            <div><p>Taken by: {staffNames.length ? staffNames.map(upper).join(", ") : "—"}</p><div className="print-signature">Signature / date</div></div>
            <div><p>Checked by: {checkedByType === "not_checked" ? "Not checked yet" : `${upper(checkedByType)} · ${upper(checkedByName)}`}</p>
              <p>Designation: {checkedByDesignation || "—"} · Date: {checkedDate || "—"}</p><div className="print-signature">Signature / date</div></div>
          </section>
        </article>
      </DialogContent>
    </Dialog>
  </>;
}
