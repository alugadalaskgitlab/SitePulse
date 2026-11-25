export type BookChainageSystem = "ours" | "consultant";
export type ReadingMode = "rl" | "staff";
export type DesignSource = "EXCEL" | "TYPED";
export type PointSide = "L" | "CL" | "R";

export const LEVEL_SHEET_FALLBACK_LAYERS = [
  "OGL / initial", "Embankment layer 1", "Embankment layer 2", "Embankment layer 3",
  "Subgrade layer 1", "Subgrade layer 2", "GSB", "WMM", "BC",
] as const;

export type DesignLevelRow = {
  id?: number;
  chainageOursKm: number;
  centreLevel: number;
  crossfallLeftPct: number;
  crossfallRightPct: number;
  topWidthLeftM: number;
  topWidthRightM: number;
  source: DesignSource;
};

export type ReadingPoint = {
  columnKey?: string | null;
  side: PointSide;
  distanceM: number | null;
  value: number | null;
  remark?: string | null;
};

export type InstrumentShift = { foresight: number | null; backsight: number | null };

export type ReadingRow = {
  chainageOursKm: number;
  shift?: InstrumentShift | null;
  points: ReadingPoint[];
};

export type LevelSheetCalcInput = {
  designRows: DesignLevelRow[];
  readings: ReadingRow[];
  mode: ReadingMode;
  tbmRl?: number | null;
  backsight?: number | null;
  closingForesight?: number | null;
  closingTbmRl?: number | null;
  toleranceAboveMm: number;
  toleranceBelowMm: number;
};

export type CalculatedPoint = ReadingPoint & {
  rl: number | null;
  designLevel: number | null;
  differenceMm: number | null;
  comparison: "Within" | "High" | "Low" | "outside width" | null;
};

export type CalculatedSection = {
  chainageOursKm: number;
  hi: number | null;
  shiftCpRl: number | null;
  points: CalculatedPoint[];
  cutAreaSqm: number | null;
  fillAreaSqm: number | null;
  status: "Within" | "Cut" | "Fill" | null;
};

export type LevelSheetCalculation = {
  sections: CalculatedSection[];
  closingErrorMm: number | null;
  cutVolumeCum: number;
  fillVolumeCum: number;
  volumeSegments: number;
  uncalculatedSections: number[];
  pointsWithin: number;
  pointsHigh: number;
  pointsLow: number;
  comparedPoints: number;
};

export function parseChainage(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim().replace(/,/g, ".");
  if (!text) return null;
  const plus = text.match(/^(-?\d+)\s*[+/]\s*(\d+(?:\.\d+)?)$/);
  const parsed = plus ? Number(plus[1]) + Number(plus[2]) / 1000 : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatChainage(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  let km = Math.floor(absolute + 1e-10);
  let metres = Math.round((absolute - km) * 1000);
  if (metres >= 1000) {
    km += 1;
    metres = 0;
  }
  return `${sign}${km}+${String(metres).padStart(3, "0")}`;
}

export const TBM_IMPORT_FIELDS = ["name", "chainage", "rl", "easting", "northing", "description"] as const;
export type TbmImportMapping = Record<typeof TBM_IMPORT_FIELDS[number], number>;

export function detectTbmHeading(matrix: unknown[][]) {
  const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const headingIndex = matrix.findIndex(row => {
    const labels = row.map(norm);
    return labels.some(label => label.includes("chainage"))
      && labels.some(label => /^rls?$/.test(label))
      && labels.some(label => /tbm/.test(label));
  });
  if (headingIndex < 0) throw new Error("Could not find a heading row with Chainage, RL and TBM.");
  const headers = matrix[headingIndex].map(value => String(value ?? "").trim());
  const patterns = [/tbm/i, /chainage/i, /^rls?$/i, /east/i, /north/i, /remark|description/i];
  const mapping = Object.fromEntries(TBM_IMPORT_FIELDS.map((key, index) =>
    [key, headers.findIndex(header => patterns[index].test(header))],
  )) as TbmImportMapping;
  return { headers, mapping, rows: matrix.slice(headingIndex + 1).filter(row => row.some(value => String(value ?? "").trim())) };
}

export function normalizeTbmImport(
  rows: unknown[][], mapping: TbmImportMapping, system: BookChainageSystem, offsetM: number,
) {
  return rows.map((row, index) => {
    const name = String(row[mapping.name] ?? "").trim();
    const bookKm = parseChainage(row[mapping.chainage]);
    const rl = finite(row[mapping.rl]);
    if (!name || bookKm == null || rl == null) throw new Error(`Row ${index + 1}: name, chainage and RL are required.`);
    return {
      name, chainageOursKm: toOursChainage(bookKm, system, offsetM), rl,
      easting: finite(row[mapping.easting]), northing: finite(row[mapping.northing]),
      description: String(row[mapping.description] ?? "").trim(),
    };
  });
}

export function repeatedTbmNames(names: string[]) {
  const keys = names.map(name => name.trim().toLocaleLowerCase("en"));
  return names.map((name, index) => !name.trim() || keys.indexOf(keys[index]) !== keys.lastIndexOf(keys[index]));
}

export function toOursChainage(
  bookKm: number,
  system: BookChainageSystem,
  consultantOffsetM: number,
): number {
  return system === "consultant" ? bookKm - consultantOffsetM / 1000 : bookKm;
}

export function toBookChainage(
  oursKm: number,
  system: BookChainageSystem,
  consultantOffsetM: number,
): number {
  return system === "consultant" ? oursKm + consultantOffsetM / 1000 : oursKm;
}

export function formatChainagePair(
  oursKm: number,
  system: BookChainageSystem,
  consultantOffsetM: number,
): string {
  const consultantKm = toBookChainage(oursKm, "consultant", consultantOffsetM);
  return `ours ${formatChainage(oursKm)} · consultant ${formatChainage(consultantKm)}`;
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const result = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

export function interpolateDesignAt(
  designRows: DesignLevelRow[],
  chainageOursKm: number,
): Omit<DesignLevelRow, "id" | "chainageOursKm" | "source"> | null {
  const rows = designRows
    .filter(row => Number.isFinite(row.chainageOursKm))
    .slice()
    .sort((a, b) => a.chainageOursKm - b.chainageOursKm);
  if (!rows.length) return null;
  const exact = rows.find(row => Math.abs(row.chainageOursKm - chainageOursKm) < 1e-9);
  if (exact) {
    return {
      centreLevel: exact.centreLevel,
      crossfallLeftPct: exact.crossfallLeftPct,
      crossfallRightPct: exact.crossfallRightPct,
      topWidthLeftM: exact.topWidthLeftM,
      topWidthRightM: exact.topWidthRightM,
    };
  }
  const left = rows.filter(row => row.chainageOursKm < chainageOursKm).at(-1);
  const right = rows.find(row => row.chainageOursKm > chainageOursKm);
  if (!left || !right) return null;
  const fraction = (chainageOursKm - left.chainageOursKm) / (right.chainageOursKm - left.chainageOursKm);
  const lerp = (a: number, b: number) => a + (b - a) * fraction;
  return {
    centreLevel: lerp(left.centreLevel, right.centreLevel),
    crossfallLeftPct: lerp(left.crossfallLeftPct, right.crossfallLeftPct),
    crossfallRightPct: lerp(left.crossfallRightPct, right.crossfallRightPct),
    topWidthLeftM: lerp(left.topWidthLeftM, right.topWidthLeftM),
    topWidthRightM: lerp(left.topWidthRightM, right.topWidthRightM),
  };
}

function hiBySection(readings: ReadingRow[], input: Pick<LevelSheetCalcInput, "tbmRl" | "backsight">) {
  const sorted = readings.slice().sort((a, b) => a.chainageOursKm - b.chainageOursKm);
  const start = finite(input.tbmRl);
  const bs = finite(input.backsight);
  let hi = start == null || bs == null ? null : start + bs;
  return sorted.map(row => {
    let cpRl: number | null = null;
    if (row.shift) {
      const fs = finite(row.shift.foresight);
      const newBs = finite(row.shift.backsight);
      if (fs != null && newBs != null && hi != null) {
        cpRl = hi - fs;
        hi = cpRl + newBs;
      } else {
        // A partial change-point entry must not silently keep using the old HI.
        hi = null;
      }
    }
    return { row, hi, cpRl };
  });
}

function signedAreas(points: Array<{ x: number; difference: number }>) {
  if (!points.length) return { cut: null, fill: null };
  const cut: number[] = [];
  const fill: number[] = [];
  const integrate = (x0: number, d0: number, x1: number, d1: number) => {
    const width = x1 - x0;
    if (width <= 0) return;
    if (d0 >= 0 && d1 >= 0) {
      cut.push((d0 + d1) * width / 2);
    } else if (d0 <= 0 && d1 <= 0) {
      fill.push((-d0 - d1) * width / 2);
    } else {
      const fraction = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
      const leftWidth = width * fraction;
      const rightWidth = width - leftWidth;
      if (d0 > 0) {
        cut.push(d0 * leftWidth / 2);
        fill.push(-d1 * rightWidth / 2);
      } else {
        fill.push(-d0 * leftWidth / 2);
        cut.push(d1 * rightWidth / 2);
      }
    }
  };
  if (points.length === 1) {
    return { cut: 0, fill: 0 };
  }
  for (let i = 0; i < points.length - 1; i++) {
    integrate(points[i].x, points[i].difference, points[i + 1].x, points[i + 1].difference);
  }
  return { cut: cut.reduce((sum, value) => sum + value, 0), fill: fill.reduce((sum, value) => sum + value, 0) };
}

function calculateSectionArea(points: CalculatedPoint[], widthLeft: number | null, widthRight: number | null) {
  if (widthLeft == null || widthRight == null) return { cut: null, fill: null };
  const usable = points
    .filter(point => point.differenceMm != null && point.comparison !== "outside width" && point.distanceM != null)
    .map(point => ({
      x: point.side === "L" ? -Math.abs(Number(point.distanceM)) : point.side === "CL" ? 0 : Math.abs(Number(point.distanceM)),
      difference: Number(point.differenceMm) / 1000,
    }))
    .filter(point => point.x >= -widthLeft && point.x <= widthRight)
    .sort((a, b) => a.x - b.x);
  if (!usable.length) return { cut: null, fill: null };
  const first = usable[0];
  const last = usable[usable.length - 1];
  const withEdges = [
    { x: -widthLeft, difference: first.difference },
    ...usable,
    { x: widthRight, difference: last.difference },
  ].filter((point, index, rows) => index === 0 || Math.abs(point.x - rows[index - 1].x) > 1e-9);
  return signedAreas(withEdges);
}

export function calculateLevelSheet(input: LevelSheetCalcInput): LevelSheetCalculation {
  const sorted = input.readings.slice().sort((a, b) => a.chainageOursKm - b.chainageOursKm);
  const heights = hiBySection(sorted, input);
  let lastHi: number | null = null;
  const sections: CalculatedSection[] = heights.map(({ row, hi, cpRl }) => {
    lastHi = hi;
    const design = interpolateDesignAt(input.designRows, row.chainageOursKm);
    const points: CalculatedPoint[] = row.points.map(point => {
      const value = finite(point.value);
      const rl = input.mode === "rl" ? value : hi != null && value != null ? hi - value : null;
      const distanceM = finite(point.distanceM);
      if (distanceM == null) {
        return { ...point, rl, designLevel: null, differenceMm: null, comparison: null };
      }
      if (!design || rl == null) {
        return { ...point, rl, designLevel: null, differenceMm: null, comparison: null };
      }
      const width = point.side === "L" ? design.topWidthLeftM : point.side === "R" ? design.topWidthRightM : 0;
      if (Math.abs(distanceM) > width + 1e-9) {
        return { ...point, rl, designLevel: null, differenceMm: null, comparison: "outside width" };
      }
      const crossfall = point.side === "L" ? design.crossfallLeftPct : point.side === "R" ? design.crossfallRightPct : 0;
      const designLevel = design.centreLevel - crossfall * Math.abs(distanceM) / 100;
      const differenceMm = (rl - designLevel) * 1000;
      const comparison = differenceMm < -input.toleranceBelowMm
        ? "Low"
        : differenceMm > input.toleranceAboveMm ? "High" : "Within";
      return { ...point, rl, designLevel, differenceMm, comparison };
    });
    const area = calculateSectionArea(points, design?.topWidthLeftM ?? null, design?.topWidthRightM ?? null);
    const comparable = points.filter(point => point.differenceMm != null);
    const status = !comparable.length ? null
      : comparable.every(point => point.comparison === "Within") ? "Within"
      : (area.cut ?? 0) >= (area.fill ?? 0) ? "Cut" : "Fill";
    return {
      chainageOursKm: row.chainageOursKm, hi, shiftCpRl: cpRl, points,
      cutAreaSqm: area.cut, fillAreaSqm: area.fill, status,
    };
  });
  let cutVolumeCum = 0;
  let fillVolumeCum = 0;
  let volumeSegments = 0;
  const uncalculatedSections: number[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const first = sections[i], second = sections[i + 1];
    const lengthM = Math.abs(second.chainageOursKm - first.chainageOursKm) * 1000;
    if (lengthM <= 0 || first.cutAreaSqm == null || second.cutAreaSqm == null
        || first.fillAreaSqm == null || second.fillAreaSqm == null) {
      uncalculatedSections.push(first.chainageOursKm);
      continue;
    }
    cutVolumeCum += (first.cutAreaSqm + second.cutAreaSqm) / 2 * lengthM;
    fillVolumeCum += (first.fillAreaSqm + second.fillAreaSqm) / 2 * lengthM;
    volumeSegments++;
  }
  const points = sections.flatMap(section => section.points);
  return {
    sections,
    closingErrorMm: lastHi == null || finite(input.closingForesight) == null || finite(input.closingTbmRl ?? input.tbmRl) == null
      ? null
      : (lastHi - Number(input.closingForesight) - Number(input.closingTbmRl ?? input.tbmRl)) * 1000,
    cutVolumeCum,
    fillVolumeCum,
    volumeSegments,
    uncalculatedSections,
    pointsWithin: points.filter(point => point.comparison === "Within").length,
    pointsHigh: points.filter(point => point.comparison === "High").length,
    pointsLow: points.filter(point => point.comparison === "Low").length,
    comparedPoints: points.filter(point => point.differenceMm != null).length,
  };
}

export function convertReadingValues(
  rows: ReadingRow[],
  from: ReadingMode,
  to: ReadingMode,
  setup: Pick<LevelSheetCalcInput, "tbmRl" | "backsight">,
): ReadingRow[] {
  if (from === to) return rows.map(row => ({ ...row, points: row.points.map(point => ({ ...point })) }));
  const heights = hiBySection(rows, setup);
  if (heights.some(({ row }) => row.points.some(point => point.value != null))
      && heights.some(({ hi, row }) => hi == null && row.points.some(point => point.value != null))) {
    throw new Error("Enter the TBM level and back sight before changing reading mode.");
  }
  const hiByChainage = new Map(heights.map(({ row, hi }) => [row.chainageOursKm, hi]));
  return rows.map(row => {
    const hi = hiByChainage.get(row.chainageOursKm);
    if (row.points.some(point => point.value != null) && hi == null) {
      throw new Error("A staff reading cannot be converted without its instrument height.");
    }
    return {
      ...row,
      points: row.points.map(point => ({
        ...point,
        value: point.value == null || hi == null
          ? point.value
          : hi - point.value,
      })),
    };
  });
}

export function deriveDesignRowsFromFrl(
  sourceRows: DesignLevelRow[],
  depthM: number,
): DesignLevelRow[] {
  if (!Number.isFinite(depthM) || depthM < 0 || depthM > 20) throw new Error("Enter a depth from 0 to 20 m.");
  return sourceRows.map(row => ({
    ...row,
    id: undefined,
    centreLevel: row.centreLevel - depthM,
    source: "TYPED",
  }));
}

export function normalizeDesignImportRows(
  rows: Array<Record<string, unknown>>,
  columns: {
    chainage: string; centreLevel: string; crossfallLeft: string; crossfallRight: string;
    topWidthLeft: string; topWidthRight: string;
  },
  system: BookChainageSystem,
  consultantOffsetM: number,
): DesignLevelRow[] {
  return rows.map(row => {
    const bookKm = parseChainage(row[columns.chainage]);
    const values = {
      centreLevel: finite(row[columns.centreLevel]),
      crossfallLeftPct: finite(row[columns.crossfallLeft]),
      crossfallRightPct: finite(row[columns.crossfallRight]),
      topWidthLeftM: finite(row[columns.topWidthLeft]),
      topWidthRightM: finite(row[columns.topWidthRight]),
    };
    if (bookKm == null || Object.values(values).some(value => value == null)) {
      throw new Error("Every imported design row needs chainage, level, cross-fall and both widths.");
    }
    return {
      chainageOursKm: toOursChainage(bookKm, system, consultantOffsetM),
      centreLevel: Number(values.centreLevel),
      crossfallLeftPct: Number(values.crossfallLeftPct),
      crossfallRightPct: Number(values.crossfallRightPct),
      topWidthLeftM: Number(values.topWidthLeftM),
      topWidthRightM: Number(values.topWidthRightM),
      source: "EXCEL",
    };
  });
}
