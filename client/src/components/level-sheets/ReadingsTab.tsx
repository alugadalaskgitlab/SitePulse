import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import {
  calculateLevelSheet,
  convertReadingValues,
  formatChainage,
  formatChainagePair,
  parseChainage,
  toBookChainage,
  toOursChainage,
  type BookChainageSystem,
  type DesignLevelRow,
  type ReadingMode,
  type ReadingPoint,
  type ReadingRow,
} from "@shared/levelSheets";

type PointColumn = { key: string; side: "L" | "CL" | "R"; distanceM: number | null };
export type SheetReadingRow = ReadingRow & { points: Array<ReadingPoint & { columnKey: string }> };
type Header = { tbmName: string; tbmRl: string; initialBackSight: string; closingForeSight: string; closingTbmName?: string; closingTbmRl?: string };
const numericText = (value: unknown) => value == null ? "" : String(value);
const numberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
};
const pointOrder = (side: PointColumn["side"]) => side === "L" ? 0 : side === "CL" ? 1 : 2;
const sortColumns = (columns: PointColumn[]) => columns.slice().sort((a, b) => {
  const side = pointOrder(a.side) - pointOrder(b.side);
  if (side) return side;
  if (a.distanceM == null) return b.distanceM == null ? 0 : -1;
  if (b.distanceM == null) return 1;
  return a.side === "L" ? b.distanceM - a.distanceM : a.distanceM - b.distanceM;
});
function emptyRow(chainageOursKm: number, columns: PointColumn[]): SheetReadingRow {
  return {
    chainageOursKm,
    shift: null,
    points: columns.map(column => ({ ...column, value: null, remark: "", columnKey: column.key })),
  };
}

export function hydrateRows(value: unknown): { columns: PointColumn[]; rows: SheetReadingRow[] } {
  const inputRows = Array.isArray(value) ? value as ReadingRow[] : [];
  const rawColumns = inputRows[0]?.points ?? [{ side: "CL" as const, distanceM: 0, value: null }];
  const seen = new Set<string>();
  let columns = rawColumns.map((point, index) => {
    const key = String(point.columnKey || `${point.side}:${point.distanceM ?? "empty"}:${index}`);
    if (seen.has(key)) return { key: `${key}:${index}`, side: point.side, distanceM: point.distanceM };
    seen.add(key);
    return { key, side: point.side, distanceM: point.distanceM };
  });
  if (!columns.some(column => column.side === "CL")) columns.push({ key: "centre-line", side: "CL", distanceM: 0 });
  columns = sortColumns(columns);
  const rows = inputRows.map(row => ({
    chainageOursKm: Number(row.chainageOursKm),
    shift: row.shift ? { ...row.shift } : null,
    points: columns.map(column => {
      const existing = row.points.find(point => point.columnKey === column.key)
        ?? row.points.find(point => point.side === column.side && point.distanceM === column.distanceM);
      return {
        ...column, value: existing?.value ?? null, remark: existing?.remark ?? "",
        columnKey: column.key,
      };
    }),
  }));
  return { columns, rows: rows.length ? rows : [emptyRow(0, columns)] };
}

export function ReadingsTab({ rows, onRowsChange, mode, onModeChange, designRows, settings, header, onHeaderChange, toleranceAboveMm, toleranceBelowMm, allowedClosingErrorMm, resetKey, readOnly, tbms = [], onOpenTbms }: {
  onOpenTbms?: () => void;
  tbms?: Array<{ id: number; name: string; rl: number; active: boolean; chainageOursKm?: number }>;
  rows: SheetReadingRow[];
  onRowsChange: (rows: SheetReadingRow[]) => void;
  mode: ReadingMode;
  onModeChange: (mode: ReadingMode) => void;
  designRows: DesignLevelRow[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  header: Header;
  onHeaderChange: (header: Header) => void;
  toleranceAboveMm: number;
  toleranceBelowMm: number;
  allowedClosingErrorMm: number;
  resetKey: number | null;
  readOnly: boolean;
}) {
  const [columns, setColumns] = useState<PointColumn[]>(() => hydrateRows(rows).columns);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [selectedChainage, setSelectedChainage] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState(false);
  const [manualFinish, setManualFinish] = useState(false);
  useEffect(() => {
    const hydrated = hydrateRows(rows);
    setColumns(hydrated.columns);
    if (JSON.stringify(hydrated.rows) !== JSON.stringify(rows)) onRowsChange(hydrated.rows);
    // Only re-hydrate on a sheet switch / restored reading set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, rows.length, rows[0]?.chainageOursKm]);

  const orderedColumns = useMemo(() => sortColumns(columns), [columns]);
  const leftColumns = orderedColumns.filter(column => column.side === "L");
  const rightColumns = orderedColumns.filter(column => column.side === "R");
  const calculation = useMemo(() => calculateLevelSheet({
    designRows,
    readings: rows,
    mode,
    tbmRl: numberOrNull(header.tbmRl),
    backsight: numberOrNull(header.initialBackSight),
    closingForesight: numberOrNull(header.closingForeSight),
    closingTbmRl: numberOrNull(header.closingTbmRl ?? ""),
    toleranceAboveMm,
    toleranceBelowMm,
  }), [designRows, rows, mode, header.tbmRl, header.initialBackSight, header.closingForeSight, header.closingTbmRl, toleranceAboveMm, toleranceBelowMm]);
  const calculationByChainage = new Map(calculation.sections.map(section => [section.chainageOursKm, section]));

  const addColumn = (side: "L" | "R") => {
    const key = `${side.toLowerCase()}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    const column: PointColumn = { key, side, distanceM: null };
    const next = sortColumns([...columns, column]);
    setColumns(next);
    onRowsChange(rows.map(row => ({
      ...row,
      points: [...row.points, { ...column, value: null, remark: "", columnKey: key }],
    })) as SheetReadingRow[]);
  };
  const removeColumn = (key: string) => {
    setColumns(current => current.filter(column => column.key !== key));
    onRowsChange(rows.map(row => ({ ...row, points: row.points.filter(point => point.columnKey !== key) })) as SheetReadingRow[]);
  };
  const setDistance = (column: PointColumn, raw: string) => {
    const distanceM = numberOrNull(raw);
    if (raw.trim() && distanceM == null) return;
    if (distanceM != null && column.side === "CL" && distanceM !== 0) return;
    if (distanceM === 0 && column.side !== "CL") {
      setDuplicateMessage("Left and right distances must be greater than 0 m.");
      return;
    }
    const duplicate = distanceM != null && column.side !== "CL" && columns.some(other =>
      other.key !== column.key && other.side === column.side && other.distanceM != null && Math.abs(other.distanceM - distanceM) < 1e-9,
    );
    if (duplicate) {
      setDuplicateMessage(`${column.side} ${distanceM} m is already there.`);
      return;
    }
    setDuplicateMessage("");
    setColumns(current => sortColumns(current.map(other => other.key === column.key ? { ...other, distanceM } : other)));
    onRowsChange(rows.map(row => ({
      ...row,
      points: row.points.map(point => point.columnKey === column.key ? { ...point, distanceM } : point),
    })) as SheetReadingRow[]);
  };
  const setPointValue = (rowIndex: number, columnKey: string, value: string) => {
    const parsed = numberOrNull(value);
    if (value.trim() && parsed == null) return;
    onRowsChange(rows.map((row, index) => index === rowIndex ? {
      ...row,
      points: row.points.map(point => point.columnKey === columnKey ? { ...point, value: parsed } : point),
    } : row) as SheetReadingRow[]);
  };
  const setPointRemark = (rowIndex: number, columnKey: string, remark: string) => {
    onRowsChange(rows.map((row, index) => index === rowIndex ? {
      ...row,
      points: row.points.map(point => point.columnKey === columnKey ? { ...point, remark } : point),
    } : row) as SheetReadingRow[]);
  };
  const setChainage = (rowIndex: number, value: string) => {
    const bookKm = parseChainage(value);
    if (bookKm == null) return;
    const ours = toOursChainage(bookKm, settings.bookChainageSystem, Number(settings.consultantOffsetM));
    onRowsChange(rows.map((row, index) => index === rowIndex ? { ...row, chainageOursKm: ours } : row) as SheetReadingRow[]);
  };
  const setShift = (rowIndex: number, key: "foresight" | "backsight", value: string) => {
    const parsed = numberOrNull(value);
    if (value.trim() && parsed == null) return;
    onRowsChange(rows.map((row, index) => index === rowIndex ? {
      ...row,
      shift: { ...(row.shift ?? { foresight: null, backsight: null }), [key]: parsed },
    } : row) as SheetReadingRow[]);
  };
  const addNextChainage = () => {
    const last = rows.at(-1)?.chainageOursKm ?? 0;
    const next = last + 0.01;
    onRowsChange([...rows, emptyRow(next, orderedColumns)]);
  };
  const switchMode = (next: ReadingMode) => {
    if (next === mode) return;
    try {
      const converted = convertReadingValues(rows, mode, next, {
        tbmRl: numberOrNull(header.tbmRl), backsight: numberOrNull(header.initialBackSight),
      });
      onRowsChange(converted as SheetReadingRow[]);
      onModeChange(next);
    } catch (error) {
      setDuplicateMessage(error instanceof Error ? error.message : "Could not change reading mode.");
    }
  };
  const totalWidth = Math.max(orderedColumns.length * 104 + 250, 700);
  const checkError = calculation.closingErrorMm;
  const tbmPicker = (finish = false) => {
    const name = finish ? header.closingTbmName || header.tbmName : header.tbmName;
    const rl = finish ? header.closingTbmRl || header.tbmRl : header.tbmRl;
    const active = tbms.filter(row => row.active);
    const selected = !(finish ? manualFinish : manualStart) && active.find(row => row.name === name && Number(row.rl) === Number(rl));
    return <div className="space-y-2">
      <label className="block text-sm">{finish ? "Finish on TBM" : "Start from TBM"}
        <select aria-label={finish ? "Finish on TBM" : "Start from TBM"} className="block w-full rounded border p-2" disabled={readOnly}
          value={selected?.id ?? "manual"} onChange={event => {
            const row = active.find(row => String(row.id) === event.target.value);
            if (finish) setManualFinish(!row); else setManualStart(!row);
            if (finish) onHeaderChange({ ...header, closingTbmName: row?.name ?? "", closingTbmRl: row ? Number(row.rl).toFixed(3) : "" });
            else onHeaderChange({ ...header, tbmName: row?.name ?? "", tbmRl: row ? Number(row.rl).toFixed(3) : "",
              ...(!header.closingTbmName || header.closingTbmName === header.tbmName ? { closingTbmName: row?.name ?? "", closingTbmRl: row ? Number(row.rl).toFixed(3) : "" } : {}) });
          }}>
          {active.map(row => <option key={row.id} value={row.id}>{row.name.toUpperCase()} · {row.chainageOursKm == null ? "" : formatChainage(row.chainageOursKm)} · {Number(row.rl).toFixed(3)}</option>)}
          <option value="manual">Type a TBM</option>
        </select>
      </label>
      {!finish && !active.length && <p className="text-sm">No TBMs saved for this site — <button type="button" className="underline" onClick={onOpenTbms}>add or import them in the TBMs tab</button></p>}
      {!selected && <label className="block text-sm">TBM name<Input aria-label={finish ? "Finish TBM name" : "TBM name"} value={name ?? ""} disabled={readOnly}
        onChange={event => onHeaderChange({ ...header, [finish ? "closingTbmName" : "tbmName"]: event.target.value })} /></label>}
      <label className="block text-sm">Known level (RL)<Input aria-label={finish ? "Finish TBM RL" : "Known TBM RL"} inputMode="decimal" value={rl ?? ""} disabled={readOnly} readOnly={!!selected}
        onChange={event => { if (!selected) onHeaderChange({ ...header, [finish ? "closingTbmRl" : "tbmRl"]: event.target.value }); }} /></label>
    </div>;
  };

  return (
    <div className="space-y-4">
      {mode === "staff" ? <div className="space-y-3 rounded border p-3">
        {tbmPicker()}
        <label className="block text-sm">Staff reading on the start TBM (BS)<Input inputMode="decimal" value={header.initialBackSight} onChange={event => onHeaderChange({ ...header, initialBackSight: event.target.value })} disabled={readOnly} /></label>
      </div> : <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span>TBM name</span><Input value={header.tbmName} onChange={event => onHeaderChange({ ...header, tbmName: event.target.value })} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Known TBM RL</span><Input inputMode="decimal" value={header.tbmRl} onChange={event => onHeaderChange({ ...header, tbmRl: event.target.value })} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Back sight on TBM</span><Input inputMode="decimal" value={header.initialBackSight} onChange={event => onHeaderChange({ ...header, initialBackSight: event.target.value })} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Closing fore sight on TBM</span><Input inputMode="decimal" value={header.closingForeSight} onChange={event => onHeaderChange({ ...header, closingForeSight: event.target.value })} disabled={readOnly} /></label>
      </div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Reading mode">
          <Button type="button" size="sm" variant={mode === "rl" ? "default" : "outline"} onClick={() => switchMode("rl")} disabled={readOnly}>Enter RLs</Button>
          <Button type="button" size="sm" variant={mode === "staff" ? "default" : "outline"} onClick={() => switchMode("staff")} disabled={readOnly}>Enter staff readings</Button>
        </div>
        {mode === "staff" && <p className="text-xs text-muted-foreground">
          Instrument height (HI) {header.tbmRl && header.initialBackSight
            ? (Number(header.tbmRl.replace(",", ".")) + Number(header.initialBackSight.replace(",", "."))).toFixed(3)
            : "—"}
        </p>}
      </div>
      {duplicateMessage && <p role="alert" className="text-sm text-destructive">{duplicateMessage}</p>}

      <div className="overflow-x-auto rounded border" style={{ maxWidth: "100%" }}>
        <table className="table-fixed border-collapse text-sm" style={{ width: totalWidth }}>
          <thead>
            <tr className="h-10 border-b bg-muted/30">
              <th rowSpan={2} className="sticky left-0 z-20 w-[150px] min-w-[150px] border-r bg-background p-2 text-left">Chainage</th>
              <th colSpan={Math.max(1, leftColumns.length)} className="border-r p-1 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span>← Left of centre (m)</span>
                </div>
              </th>
              <th rowSpan={2} className="w-[104px] border-r bg-muted/20 p-1 text-center"><div className="flex items-center justify-center">
                <button type="button" aria-label="Add point left of centre" onClick={() => addColumn("L")} disabled={readOnly} className="p-1 text-xs">+L</button>
                <span>CL</span>
                <button type="button" aria-label="Add point right of centre" onClick={() => addColumn("R")} disabled={readOnly} className="p-1 text-xs">+R</button>
              </div></th>
              <th colSpan={Math.max(1, rightColumns.length)} className="p-1 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span>Right of centre (m) →</span>
                </div>
              </th>
              <th rowSpan={2} className="w-[100px] border-l p-2 text-center">Section</th>
            </tr>
            <tr className="border-b bg-background">
              {leftColumns.length ? leftColumns.map(column => <th key={column.key} className="w-[104px] min-w-[104px] border-r p-1">
                <div className="relative">
                  {column.side !== "CL" && <button type="button" className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5" aria-label={`Remove ${column.side} point ${column.distanceM ?? "empty"}`} onClick={() => removeColumn(column.key)} disabled={readOnly}><X className="h-3 w-3" /></button>}
                  <Input className="h-8 w-full text-center" aria-label={`${column.side} point distance ${column.key}`} value={numericText(column.distanceM)}
                    inputMode="decimal" onChange={event => setDistance(column, event.target.value)} placeholder={column.side === "CL" ? "0" : "m"} disabled={readOnly || column.side === "CL"} />
                  {column.side === "CL" && <span className="block text-[10px] text-muted-foreground">centre</span>}
                </div>
              </th>) : <th className="w-[104px] min-w-[104px] border-r p-1" aria-hidden="true" />}
              {rightColumns.length ? rightColumns.map(column => <th key={column.key} className="w-[104px] min-w-[104px] border-r p-1">
                <div className="relative">
                  <button type="button" className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5" aria-label={`Remove R point ${column.distanceM ?? "empty"}`} onClick={() => removeColumn(column.key)} disabled={readOnly}><X className="h-3 w-3" /></button>
                  <Input className="h-8 w-full text-center" aria-label={`R point distance ${column.key}`} value={numericText(column.distanceM)}
                    inputMode="decimal" onChange={event => setDistance(column, event.target.value)} placeholder="m" disabled={readOnly} />
                </div>
              </th>) : <th className="w-[104px] min-w-[104px] p-1" aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const section = calculationByChainage.get(row.chainageOursKm);
              return <tr key={`${row.chainageOursKm}:${rowIndex}`} className="border-b align-top">
                <td onClick={() => setSelectedChainage(row.chainageOursKm)} className={`sticky left-0 z-10 min-w-[150px] border-r bg-background p-2 ${selectedChainage === row.chainageOursKm ? "ring-2 ring-inset ring-primary" : ""}`}>
                  <Input aria-label={`Reading chainage ${rowIndex + 1}`} className="h-8 w-[132px]" value={formatChainage(toBookChainage(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM)))}
                    inputMode="decimal" onChange={event => setChainage(rowIndex, event.target.value)} disabled={readOnly} />
                  <span className="mt-1 block whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{formatChainagePair(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</span>
                  {row.shift && <p className="text-[10px]">Instrument moved{section?.shiftCpRl == null ? "" : ` · Turning point level (RL) ${section.shiftCpRl.toFixed(3)}`}</p>}
                </td>
                {orderedColumns.map(column => {
                  const point = row.points.find(item => item.columnKey === column.key);
                  const calculated = section?.points.find(item => item.columnKey === column.key);
                  return <td key={column.key} className="w-[104px] min-w-[104px] border-r p-1">
                    <label className="text-[10px]">{mode === "staff" ? "Staff reading" : "Level (RL)"}<Input className="h-8 w-full text-center" aria-label={`Reading ${rowIndex + 1} ${column.side} ${column.distanceM ?? ""}`} inputMode="decimal"
                      value={numericText(point?.value)} onChange={event => setPointValue(rowIndex, column.key, event.target.value)} disabled={readOnly} />
                    </label>
                    {point && <Input className="mt-1 h-7 w-full text-center text-[10px]" aria-label={`Remark ${rowIndex + 1} ${column.side} ${column.distanceM ?? ""}`}
                      placeholder="Remark" value={point.remark ?? ""} onChange={event => setPointRemark(rowIndex, column.key, event.target.value)} disabled={readOnly} />}
                    {calculated?.rl != null && mode === "staff" && <p className="mt-1 text-[10px]">RL {calculated.rl.toFixed(3)}</p>}
                    {calculated?.comparison === "outside width" && <p className="mt-1 text-[10px] font-medium">Outside width</p>}
                    {calculated?.differenceMm != null && <>
                      <p className="mt-1 text-[10px]">D {calculated.designLevel?.toFixed(3)}</p>
                      <p className={`text-[10px] font-semibold ${calculated.comparison === "Within" ? "" : "underline"}`}>
                        {calculated.differenceMm > 0 ? "+" : ""}{Math.round(calculated.differenceMm)} mm · {calculated.comparison}
                      </p>
                    </>}
                  </td>;
                })}
                <td className="border-l p-2 text-center font-semibold">{section?.status ?? "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === "staff" && <Button variant="outline" disabled={readOnly || selectedChainage == null} onClick={() => onRowsChange(rows.map(row => row.chainageOursKm === selectedChainage ? { ...row, shift: row.shift ?? { foresight: null, backsight: null } } : row))}>Moved the level instrument?</Button>}
        <Button type="button" variant="outline" onClick={addNextChainage} disabled={readOnly}><Plus className="mr-2 h-4 w-4" /> Next chainage</Button>
      </div>
      {mode === "staff" && rows.map((row, rowIndex) => row.chainageOursKm === selectedChainage && row.shift ? <div key={rowIndex} className="space-y-2 rounded border p-3">
        <p className="text-sm">Instrument moved before {formatChainage(row.chainageOursKm)}</p>
        <label className="block text-sm">Reading on the turning point before moving (FS)<Input aria-label={`Change-point foresight ${rowIndex + 1}`} inputMode="decimal" value={numericText(row.shift.foresight)} onChange={event => setShift(rowIndex, "foresight", event.target.value)} disabled={readOnly} /></label>
        <label className="block text-sm">Reading on the same point after moving (BS)<Input aria-label={`New back sight ${rowIndex + 1}`} inputMode="decimal" value={numericText(row.shift.backsight)} onChange={event => setShift(rowIndex, "backsight", event.target.value)} disabled={readOnly} /></label>
        <Button variant="outline" disabled={readOnly} onClick={() => onRowsChange(rows.map((current, index) => index === rowIndex ? { ...current, shift: null } : current))}>Remove shift</Button>
      </div> : null)}
      {mode === "staff" && <div className="space-y-3 rounded border p-3">
        {tbmPicker(true)}
        <label className="block text-sm">Staff reading on the finish TBM (FS)<Input inputMode="decimal" value={header.closingForeSight} onChange={event => onHeaderChange({ ...header, closingForeSight: event.target.value })} disabled={readOnly} /></label>
        <p className="text-sm">{checkError == null ? "Enter the finish reading to check the levels." : Math.abs(checkError) <= allowedClosingErrorMm
          ? `Levels check OK — closed within ${Math.abs(checkError).toFixed(1)} mm (allowed ${allowedClosingErrorMm} mm)`
          : `Levels do not close — off by ${Math.abs(checkError).toFixed(1)} mm (allowed ${allowedClosingErrorMm} mm). Take the levels again.`}</p>
      </div>}
    </div>
  );
}
