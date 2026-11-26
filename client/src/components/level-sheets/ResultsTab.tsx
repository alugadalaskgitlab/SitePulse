import { useState } from "react";
import { Input } from "./LevelInput";
import {
  formatChainagePair,
  interpolateDesignAt,
  parseChainage, toOursChainage, rangeCalculation,
  type BookChainageSystem,
  type CalculatedPoint,
  type CalculatedSection,
  type DesignLevelRow,
  type LevelSheetCalculation,
} from "@shared/levelSheets";
import type { SheetReadingRow } from "./ReadingsTab";

function fixed(value: number | null | undefined, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function pointLabel(point: { side: string; distanceM: number | null }) {
  return point.side === "CL" ? "CL" : `${point.side}${point.distanceM == null ? "?" : String(point.distanceM)}`;
}

function differenceLabel(point: CalculatedPoint) {
  if (point.comparison === "outside width") return "outside width";
  if (point.differenceMm == null || !point.comparison) return "—";
  const mm = Math.round(point.differenceMm);
  return `${mm > 0 ? "+" : ""}${mm} mm · ${point.comparison}`;
}

function CrossSection({ section, designRows }: { section: CalculatedSection; designRows: DesignLevelRow[] }) {
  const design = interpolateDesignAt(designRows, section.chainageOursKm);
  if (!design) return <p className="text-sm">No design levels cover this chainage.</p>;

  const left = design.topWidthLeftM;
  const right = design.topWidthRightM;
  const domainLeft = left > 0 ? -left : -1;
  const domainRight = right > 0 ? right : 1;
  const designProfile = [
    { x: -left, y: design.centreLevel - design.crossfallLeftPct * left / 100 },
    { x: 0, y: design.centreLevel },
    { x: right, y: design.centreLevel - design.crossfallRightPct * right / 100 },
  ];
  const measured = section.points
    .filter(point => point.rl != null && point.distanceM != null && point.comparison !== "outside width")
    .map(point => ({
      point,
      x: point.side === "L" ? -Math.abs(Number(point.distanceM)) : point.side === "CL" ? 0 : Math.abs(Number(point.distanceM)),
      y: Number(point.rl),
    }))
    .sort((a, b) => a.x - b.x);
  const levels = [...designProfile.map(point => point.y), ...measured.map(point => point.y)];
  const minLevel = Math.min(...levels) - 0.05;
  const maxLevel = Math.max(...levels) + 0.05;
  const yRange = Math.max(maxLevel - minLevel, 0.1);
  const width = 640, height = 250, marginX = 50, marginY = 24;
  const px = (x: number) => marginX + (x - domainLeft) / (domainRight - domainLeft) * (width - marginX * 2);
  const py = (y: number) => height - marginY - (y - minLevel) / yRange * (height - marginY * 2);
  const path = (values: Array<{ x: number; y: number }>) =>
    values.map((point, index) => `${index ? "L" : "M"} ${px(point.x)} ${py(point.y)}`).join(" ");

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">
        Cross-section · top width {fixed(left, 2)} m left + {fixed(right, 2)} m right
      </figcaption>
      <svg className="w-full rounded border bg-white" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Measured and design cross-section">
        <line x1={marginX} y1={height - marginY} x2={width - marginX} y2={height - marginY} stroke="#555" strokeWidth="1" />
        <line x1={px(0)} y1={marginY} x2={px(0)} y2={height - marginY} stroke="#999" strokeWidth="1" />
        <path d={path(designProfile)} fill="none" stroke="#333" strokeDasharray="7 5" strokeWidth="2" />
        {measured.length > 0 && <path d={path(measured)} fill="none" stroke="#000" strokeWidth="2.5" />}
        {measured.map(({ point, x, y }) => (
          <g key={`${point.columnKey ?? pointLabel(point)}:${x}`}>
            <circle cx={px(x)} cy={py(y)} r="4" fill="white" stroke="#000" strokeWidth="2" />
            <text x={px(x)} y={py(y) - 9} textAnchor="middle" fontSize="11" fill="#000">
              {point.differenceMm == null ? "—" : `${Math.round(point.differenceMm) > 0 ? "+" : ""}${Math.round(point.differenceMm)} mm`}
            </text>
          </g>
        ))}
        <text x={marginX} y={height - 5} fontSize="11" fill="#000">L {fixed(left, 2)} m</text>
        <text x={width - marginX} y={height - 5} textAnchor="end" fontSize="11" fill="#000">R {fixed(right, 2)} m</text>
        <text x={width - marginX} y={marginY + 12} textAnchor="end" fontSize="11" fill="#000">{maxLevel.toFixed(3)} RL</text>
        <text x={width - marginX} y={height - marginY - 4} textAnchor="end" fontSize="11" fill="#000">{minLevel.toFixed(3)} RL</text>
      </svg>
      <p className="text-xs">Dashed line: design · solid line: measured</p>
    </figure>
  );
}

export function ResultsTab({ readings: allReadings, calculation: fullCalculation, designRows, settings, readingMode }: {
  readings: SheetReadingRow[];
  calculation: LevelSheetCalculation;
  designRows: DesignLevelRow[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  readingMode: "rl" | "staff";
}) {
  const [selectedChainage, setSelectedChainage] = useState<number | null>(null);
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const convert = (value: string) => { const km = parseChainage(value); return km == null ? null : toOursChainage(km, settings.bookChainageSystem, settings.consultantOffsetM); };
  const fromKm = convert(from), toKm = convert(to);
  const invalid = (!!from.trim() && fromKm == null) || (!!to.trim() && toKm == null) || (fromKm != null && toKm != null && fromKm > toKm);
  const calculation = rangeCalculation(fullCalculation, invalid ? Infinity : fromKm, toKm);
  const readings = allReadings.filter(row => calculation.sections.some(section => section.chainageOursKm === row.chainageOursKm));
  const sectionByChainage = new Map(calculation.sections.map(section => [section.chainageOursKm, section]));
  const pointColumns = readings[0]?.points ?? [];
  const section = selectedChainage == null ? null : sectionByChainage.get(selectedChainage) ?? null;
  const chainages = readings.map(row => row.chainageOursKm);
  const lengthM = chainages.length < 2 ? 0 : (Math.max(...chainages) - Math.min(...chainages)) * 1000;

  return (
    <section className="space-y-4" aria-label="Results and quantities">
      <div className="flex flex-wrap gap-3">
        <label>From chainage<Input aria-label="Result From chainage" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>To chainage<Input aria-label="Result To chainage" value={to} onChange={event => setTo(event.target.value)} /></label>
      </div>
      {invalid && <p role="alert">Enter a valid From–To range.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border p-3"><span className="text-xs">Points within</span><strong className="block">{calculation.pointsWithin} of {calculation.comparedPoints}</strong></div>
        <div className="rounded border p-3"><span className="text-xs">Points high / low</span><strong className="block">{calculation.pointsHigh} / {calculation.pointsLow}</strong></div>
        <div className="rounded border p-3"><span className="text-xs">Cut / fill</span><strong className="block">{calculation.volumeSegments ? `${calculation.cutVolumeCum.toFixed(1)} / ${calculation.fillVolumeCum.toFixed(1)} cum` : "—"}</strong></div>
        <div className="rounded border p-3"><span className="text-xs">Chainages / length</span><strong className="block">{readings.length} / {lengthM.toFixed(1)} m</strong></div>
      </div>

      <p className="text-sm">Volume totals use {calculation.volumeSegments} complete segment{calculation.volumeSegments === 1 ? "" : "s"}. Points within tolerance: {calculation.pointsWithin} of {calculation.comparedPoints}.</p>
      {calculation.uncalculatedSections.length > 0 && (
        <p className="rounded border p-2 text-sm">No volume for segments starting at: {calculation.uncalculatedSections.map(km =>
          formatChainagePair(km, settings.bookChainageSystem, Number(settings.consultantOffsetM)),
        ).join("; ")}.</p>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead><tr className="border-b text-left">
            <th className="p-2">Chainage</th>
            {pointColumns.map((point, index) => <th key={point.columnKey ?? index} className="border-l p-2">{pointLabel(point)}</th>)}
            <th className="border-l p-2">Cut (sqm)</th><th className="p-2">Fill (sqm)</th><th className="p-2">Section</th>
          </tr></thead>
          <tbody>
            {calculation.sections.map(sectionRow => (
              <tr key={sectionRow.chainageOursKm} className="border-b align-top">
                <td className="p-2">
                  <button type="button" className="text-left underline" onClick={() => setSelectedChainage(sectionRow.chainageOursKm)}>
                    {formatChainagePair(sectionRow.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}
                  </button>
                </td>
                {pointColumns.map((column, index) => {
                  const point = sectionRow.points.find(value => value.columnKey === column.columnKey)
                    ?? sectionRow.points[index];
                  return <td key={column.columnKey ?? index} className="border-l p-2">
                    {point ? <>
                      <span className="block">{readingMode === "staff" ? `RL ${fixed(point.rl, 3)}` : `RL ${fixed(point.value, 3)}`}</span>
                      <span className="block text-xs">{differenceLabel(point)}</span>
                    </> : "—"}
                  </td>;
                })}
                <td className="border-l p-2">{fixed(sectionRow.cutAreaSqm, 2)}</td>
                <td className="p-2">{fixed(sectionRow.fillAreaSqm, 2)}</td>
                <td className="p-2 font-medium">{sectionRow.status ?? "—"}</td>
              </tr>
            ))}
            {calculation.sections.length === 0 && <tr><td colSpan={pointColumns.length + 4} className="p-4 text-center">Enter readings to see results.</td></tr>}
          </tbody>
        </table>
      </div>

      {section && <div className="rounded border p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{formatChainagePair(section.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</h3>
          <button type="button" className="text-sm underline" onClick={() => setSelectedChainage(null)}>Close cross-section</button>
        </div>
        <CrossSection section={section} designRows={designRows} />
      </div>}
    </section>
  );
}
