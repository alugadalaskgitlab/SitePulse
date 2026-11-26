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

export type CheckPoint = { chainageOursKm: number; columnKey: string; checked: boolean; checkedRl: number | null };
export type LevelSignature = {
  name: string; designation: string; date: string; imageData: string | null;
  signedAt?: string | null; recordedByUserId?: number | null; recordedByName?: string | null;
};
export type CheckGrid = {
  mode: ReadingMode; fromKm: number | null; toKm: number | null; readings: ReadingRow[];
  header: { tbmName: string; tbmRl: string; initialBackSight: string; closingForeSight: string; closingTbmName: string; closingTbmRl: string };
};
export type CheckDetails = { grid: CheckGrid; signatures: { contractor: LevelSignature | null; checker: LevelSignature | null } };

export function readCheckRecord(value: any): { checkedPoints: CheckPoint[]; checkDetails: CheckDetails | null } {
  return Array.isArray(value) ? { checkedPoints: value, checkDetails: null }
    : value?.version === 2 && Array.isArray(value.points) ? { checkedPoints: value.points, checkDetails: value.details ?? null }
    : { checkedPoints: [], checkDetails: null };
}

export function initialCheckGrid(readings: ReadingRow[], checkedPoints: CheckPoint[], saved?: CheckGrid | null): CheckGrid {
  const chainages = readings.map(row => row.chainageOursKm);
  return {
    mode: saved?.mode ?? "rl", fromKm: saved?.fromKm ?? (chainages.length ? Math.min(...chainages) : null),
    toKm: saved?.toKm ?? (chainages.length ? Math.max(...chainages) : null),
    header: saved?.header ?? { tbmName: "", tbmRl: "", initialBackSight: "", closingForeSight: "", closingTbmName: "", closingTbmRl: "" },
    readings: readings.map(row => ({
      ...row, shift: saved?.readings.find(item => item.chainageOursKm === row.chainageOursKm)?.shift ?? null,
      points: row.points.map(point => {
        const existing = saved?.readings.find(item => item.chainageOursKm === row.chainageOursKm)?.points.find(item => item.columnKey === point.columnKey);
        const legacy = checkedPoints.find(item => item.chainageOursKm === row.chainageOursKm && item.columnKey === point.columnKey);
        return { ...point, value: existing ? existing.value : legacy?.checked ? legacy.checkedRl : null };
      }),
    })),
  };
}

export function checkedGridSummary(grid: CheckGrid, ours: CalculatedSection[]) {
  const calculation = calculateLevelSheet({
    readings: grid.readings, mode: grid.mode, designRows: [], tbmRl: finite(grid.header.tbmRl),
    backsight: finite(grid.header.initialBackSight), closingForesight: finite(grid.header.closingForeSight),
    closingTbmRl: finite(grid.header.closingTbmRl), toleranceAboveMm: 0, toleranceBelowMm: 0,
  });
  const sections = rangeCalculation(calculation, grid.fromKm, grid.toKm).sections;
  const points = sections.flatMap(section => section.points.filter(point => point.rl != null).map(point => {
    const ourPoint = ours.find(row => row.chainageOursKm === section.chainageOursKm)?.points.find(item => item.columnKey === point.columnKey);
    return { chainageOursKm: section.chainageOursKm, columnKey: String(point.columnKey ?? ""), checked: true,
      checkedRl: point.rl!, oursRl: ourPoint?.rl ?? null, differenceMm: ourPoint?.rl == null ? null : (point.rl! - ourPoint.rl) * 1000 };
  }));
  return { points, chainages: new Set(points.map(point => point.chainageOursKm)).size,
    largestDifferenceMm: points.reduce<number | null>((largest, point) => point.differenceMm == null ? largest : Math.max(largest ?? 0, Math.abs(point.differenceMm)), null) };
}

export function levelPersonName(name: string) {
  return name.trim().toLocaleLowerCase("en").replace(/(^|[\s.'-])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase("en"));
}

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

export function levelSheetBasisLabel(sheet: { basis?: string | null; checkedByType?: string | null }) {
  if (sheet.basis === "assumed") return "Assumed or agreed";
  if (sheet.checkedByType === "department" || sheet.checkedByType === "consultant") return "Joint (checked by department/consultant)";
  return sheet.basis === "consultant" ? "Consultant" : sheet.basis === "assumed" ? "Assumed or agreed" : "Own levels";
}

export function storedLevelSheetInput(sheet: any): LevelSheetCalcInput {
  return {
    designRows: [], readings: sheet.readings ?? [], mode: sheet.readingMode ?? "rl",
    tbmRl: sheet.tbmRl, backsight: sheet.initialBackSight, closingForesight: sheet.closingForeSight,
    closingTbmRl: sheet.closingTbmRl, toleranceAboveMm: sheet.toleranceAboveMm ?? 0, toleranceBelowMm: sheet.toleranceBelowMm ?? 0,
  };
}

/** Read-only areas of upper minus lower, clipped to each section's shared width. */
export function quantitiesBetweenSheets(lower: LevelSheetCalcInput, upper: LevelSheetCalcInput, fromKm?: number | null, toKm?: number | null) {
  const lowerSections = calculateLevelSheet(lower).sections;
  const upperSections = calculateLevelSheet(upper).sections;
  const key = (km: number) => Math.round(km * 1e6);
  const withinRange = (km: number) => (fromKm == null || km >= fromKm - 1e-9) && (toKm == null || km <= toKm + 1e-9);
  const bottomByKey = new Map(lowerSections.filter(row => withinRange(row.chainageOursKm)).map(row => [key(row.chainageOursKm), row]));
  const topByKey = new Map(upperSections.filter(row => withinRange(row.chainageOursKm)).map(row => [key(row.chainageOursKm), row]));
  const allKeys = [...new Set([...bottomByKey.keys(), ...topByKey.keys()])].sort((a, b) => a - b);
  const skipped = allKeys.filter(value => !bottomByKey.has(value) || !topByKey.has(value)).map(value => (bottomByKey.get(value) ?? topByKey.get(value))!.chainageOursKm);
  const crossSection = (section: CalculatedSection) => section.points
    .filter(point => finite(point.rl) != null && finite(point.distanceM) != null)
    .map(point => ({ x: point.side === "L" ? -Number(point.distanceM) : point.side === "CL" ? 0 : Number(point.distanceM), rl: Number(point.rl) }))
    .sort((a, b) => a.x - b.x);
  const interpolate = (points: Array<{ x: number; rl: number }>, x: number) => {
    const exact = points.find(point => Math.abs(point.x - x) < 1e-9);
    if (exact) return exact.rl;
    const left = points.filter(point => point.x < x).at(-1)!;
    const right = points.find(point => point.x > x)!;
    return left.rl + (right.rl - left.rl) * (x - left.x) / (right.x - left.x);
  };
  const rows = allKeys.filter(value => bottomByKey.has(value) && topByKey.has(value)).map(value => {
    const bottom = bottomByKey.get(value)!;
    const top = topByKey.get(value)!;
    const b = crossSection(bottom);
    const t = crossSection(top);
    const start = Math.max(b[0]?.x ?? Infinity, t[0]?.x ?? Infinity);
    const end = Math.min(b.at(-1)?.x ?? -Infinity, t.at(-1)?.x ?? -Infinity);
    if (b.length < 2 || t.length < 2 || end <= start) return {
      chainageOursKm: bottom.chainageOursKm, widthUsedM: 0, fillSqm: null, cutSqm: null, reason: "No common measured width",
    };
    const offsets = [...new Set([start, end, ...b.map(point => point.x), ...t.map(point => point.x)])].filter(x => x >= start && x <= end).sort((a, b) => a - b);
    // signedAreas calls negative differences fill; supply lower - upper.
    const areas = signedAreas(offsets.map(x => ({ x, difference: interpolate(b, x) - interpolate(t, x) })));
    return { chainageOursKm: bottom.chainageOursKm, widthUsedM: end - start, fillSqm: areas.fill, cutSqm: areas.cut, reason: null };
  });
  let fillCum = 0;
  let cutCum = 0;
  let segments = 0;
  const gaps: Array<{ fromKm: number; toKm: number; distanceM: number }> = [];
  for (let index = 1; index < rows.length; index++) {
    const a = rows[index - 1], b = rows[index];
    const distanceM = (b.chainageOursKm - a.chainageOursKm) * 1000;
    if (distanceM > 50 + 1e-6) gaps.push({ fromKm: a.chainageOursKm, toKm: b.chainageOursKm, distanceM });
    if (a.fillSqm == null || b.fillSqm == null || a.cutSqm == null || b.cutSqm == null) continue;
    fillCum += (a.fillSqm + b.fillSqm) / 2 * distanceM;
    cutCum += (a.cutSqm + b.cutSqm) / 2 * distanceM;
    segments++;
  }
  return { rows, skipped, gaps, fillCum, cutCum, segments };
}

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

export type ConsultantLayerImport = { key: string; layerName: string; offsets: number[]; rows: DesignLevelRow[] };

export function consultantLayoutLayers(matrix: unknown[][], system: BookChainageSystem, offsetM: number): ConsultantLayerImport[] {
  const heading = matrix.findIndex(row => row.some(value => /chainage/i.test(String(value ?? ""))));
  if (heading < 1) return [];
  const labels = matrix[heading];
  const groups = matrix[heading - 1];
  const chainageColumn = labels.findIndex(value => /chainage/i.test(String(value ?? "")));
  const layers: Array<{ key: string; layerName: string; columns: Array<{ index: number; offset: number }> }> = [];
  const standardName = (value: string) => {
    const key = value.trim().replace(/\s+/g, " ");
    if (/^sub\s*grade\s*top$/i.test(key)) return "Subgrade top";
    if (/^(gsb|wmm|bc)\s*top$/i.test(key)) return `${key.split(/\s/)[0].toUpperCase()} top`;
    return /^(ogl|frl)$/i.test(key) ? key.toUpperCase() : key;
  };
  let current: typeof layers[number] | null = null;
  for (let index = 0; index < Math.max(groups.length, labels.length); index++) {
    if (index === chainageColumn) { current = null; continue; }
    const label = String(labels[index] ?? "").trim();
    const group = String(groups[index] ?? "").trim();
    if (/diff/i.test(label) || /diff/i.test(group)) { current = null; continue; }
    if (/^(OGL|FRL)$/i.test(label)) {
      layers.push({ key: String(index), layerName: standardName(label), columns: [{ index, offset: 0 }] });
      current = null;
    } else {
      if (group) {
        current = { key: String(index), layerName: standardName(group), columns: [] };
        layers.push(current);
      }
      const offset = finite(label.replace(/−/g, "-"));
      if (label !== "" && offset != null && current) current.columns.push({ index, offset });
      else if (!label) current = null;
    }
  }
  const valid = layers.filter(layer => layer.columns.some(column => column.offset === 0));
  if (!valid.some(layer => layer.columns.length > 1)) return []; // Not this layout; retain the simple importer.
  return valid.map(layer => {
    const offsets = layer.columns.map(column => column.offset).sort((a, b) => a - b);
    const centre = layer.columns.find(column => column.offset === 0)!;
    const left = layer.columns.find(column => column.offset === offsets[0]);
    const right = layer.columns.find(column => column.offset === offsets.at(-1));
    const rows: DesignLevelRow[] = [];
    for (let index = heading + 1; index < matrix.length; index++) {
      const raw = matrix[index];
      const chainage = raw[chainageColumn];
      if (chainage == null || chainage === "" || !raw.some((value, i) => layer.columns.some(column => column.index === i) && value !== "" && value != null)) continue;
      // Bare figures in consultant-layout files are metres. Slash/plus are km/metres.
      const text = String(chainage).trim();
      const parsed = /[+/]/.test(text) ? parseChainage(text) : finite(chainage) == null ? null : Number(chainage) / 1000;
      const centreLevel = finite(raw[centre.index]);
      const leftLevel = left ? finite(raw[left.index]) : centreLevel;
      const rightLevel = right ? finite(raw[right.index]) : centreLevel;
      if (parsed == null || centreLevel == null || leftLevel == null || rightLevel == null) throw new Error(`Row ${index + 1}, ${layer.layerName}: check chainage and levels.`);
      const topWidthLeftM = Math.max(0, -(offsets[0] ?? 0));
      const topWidthRightM = Math.max(0, offsets.at(-1) ?? 0);
      rows.push({
        chainageOursKm: toOursChainage(parsed, system, offsetM), centreLevel,
        crossfallLeftPct: topWidthLeftM ? (centreLevel - leftLevel) / topWidthLeftM * 100 : 0,
        crossfallRightPct: topWidthRightM ? (centreLevel - rightLevel) / topWidthRightM * 100 : 0,
        topWidthLeftM, topWidthRightM, source: "EXCEL",
      });
    }
    return { key: layer.key, layerName: layer.layerName, offsets, rows };
  });
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
  const exact = rows.find(row => designChainageKey(row.chainageOursKm) === designChainageKey(chainageOursKm));
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
      if (!design) {
        return { ...point, rl, designLevel: null, differenceMm: null, comparison: null };
      }
      const width = point.side === "L" ? design.topWidthLeftM : point.side === "R" ? design.topWidthRightM : 0;
      if (Math.abs(distanceM) > width + 1e-9) {
        return { ...point, rl, designLevel: null, differenceMm: null, comparison: "outside width" };
      }
      const crossfall = point.side === "L" ? design.crossfallLeftPct : point.side === "R" ? design.crossfallRightPct : 0;
      const designLevel = design.centreLevel - crossfall * Math.abs(distanceM) / 100;
      const differenceMm = rl == null ? null : (rl - designLevel) * 1000;
      const comparison = differenceMm == null ? null : differenceMm < -input.toleranceBelowMm
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
    closingErrorMm: input.mode !== "staff" || lastHi == null || finite(input.closingForesight) == null || finite(input.closingTbmRl ?? input.tbmRl) == null
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

export function designChainageKey(km: number) { return String(Math.fround(km)); }

export function createRangeReadings(fromKm: number, toKm: number, intervalM: number, left: number[], right: number[]): ReadingRow[] {
  if (![fromKm, toKm, intervalM].every(Number.isFinite) || toKm < fromKm || intervalM <= 0) {
    throw new Error("Enter a valid From–To range and an interval greater than zero.");
  }
  if ([...left, ...right].some(value => !Number.isFinite(value) || value <= 0 || value > 1000)
    || new Set(left).size !== left.length || new Set(right).size !== right.length || left.length + right.length > 79) {
    throw new Error("Enter distinct positive distances on each side, with no more than 80 points including CL.");
  }
  const lengthM = (toKm - fromKm) * 1000;
  const count = Math.floor(lengthM / intervalM + 1e-8) + 1;
  if (count > 500) throw new Error("Use 500 chainages or fewer.");
  const chainages = Array.from({ length: count }, (_, index) => Number((fromKm + index * intervalM / 1000).toFixed(9)));
  if (toKm - chainages.at(-1)! > 1e-8) chainages.push(toKm);
  if (chainages.length > 500) throw new Error("Use 500 chainages or fewer.");
  const points: ReadingPoint[] = [
    ...left.slice().sort((a, b) => b - a).map(distanceM => ({ side: "L" as const, distanceM, columnKey: `L:${distanceM}`, value: null })),
    { side: "CL", distanceM: 0, columnKey: "CL:0", value: null },
    ...right.slice().sort((a, b) => a - b).map(distanceM => ({ side: "R" as const, distanceM, columnKey: `R:${distanceM}`, value: null })),
  ];
  return chainages.map(chainageOursKm => ({ chainageOursKm, points: points.map(point => ({ ...point })) }));
}

export function rangeCalculation(calculation: LevelSheetCalculation, from: number | null, to: number | null): LevelSheetCalculation {
  const sections = calculation.sections.filter(row => (from == null || row.chainageOursKm >= from - 1e-8) && (to == null || row.chainageOursKm <= to + 1e-8));
  let cutVolumeCum = 0, fillVolumeCum = 0, volumeSegments = 0;
  const uncalculatedSections: number[] = [];
  for (let index = 1; index < sections.length; index++) {
    const a = sections[index - 1], b = sections[index], length = (b.chainageOursKm - a.chainageOursKm) * 1000;
    if (a.cutAreaSqm == null || b.cutAreaSqm == null || a.fillAreaSqm == null || b.fillAreaSqm == null) {
      uncalculatedSections.push(a.chainageOursKm); continue;
    }
    if (length <= 0) continue;
    cutVolumeCum += (a.cutAreaSqm + b.cutAreaSqm) / 2 * length;
    fillVolumeCum += (a.fillAreaSqm + b.fillAreaSqm) / 2 * length;
    volumeSegments++;
  }
  const points = sections.flatMap(section => section.points);
  return { ...calculation, sections, cutVolumeCum, fillVolumeCum, volumeSegments, uncalculatedSections,
    pointsWithin: points.filter(point => point.comparison === "Within").length,
    pointsHigh: points.filter(point => point.comparison === "High").length,
    pointsLow: points.filter(point => point.comparison === "Low").length,
    comparedPoints: points.filter(point => point.differenceMm != null).length };
}

export function assumedDesignReadings(rows: ReadingRow[], designRows: DesignLevelRow[], flatBeyondWidth: boolean): ReadingRow[] {
  return rows.map(row => {
    const design = interpolateDesignAt(designRows, row.chainageOursKm);
    if (!design) throw new Error(`No design rows here: ${formatChainage(row.chainageOursKm)}.`);
    return { ...row, shift: null, points: row.points.map(point => {
      if (point.distanceM == null) throw new Error("Enter every point distance.");
      const width = point.side === "L" ? design.topWidthLeftM : point.side === "R" ? design.topWidthRightM : 0;
      const distance = Math.abs(point.distanceM);
      if (distance > width + 1e-8 && !flatBeyondWidth) throw new Error("Outside layer width — choose flat edge carry or reduce the distances.");
      const crossfall = point.side === "L" ? design.crossfallLeftPct : point.side === "R" ? design.crossfallRightPct : 0;
      return { ...point, value: design.centreLevel - crossfall * Math.min(distance, width) / 100, remark: "Made from design levels" };
    }) };
  });
}

export function repeatedDesignChainages<T extends { chainageOursKm: number }>(rows: T[]) {
  const groups = new Map<string, Array<{ row: T; index: number }>>();
  rows.forEach((row, index) => {
    const key = designChainageKey(row.chainageOursKm);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ row, index });
  });
  return [...groups].filter(([, entries]) => entries.length > 1).map(([key, entries]) => ({ key, entries }));
}

export function resolveDesignChainages<T extends { chainageOursKm: number }>(rows: T[], choices: Record<string, number | null> = {}) {
  const repeats = new Map(repeatedDesignChainages(rows).map(group => [group.key, group]));
  for (const group of repeats.values()) {
    const choice = choices[group.key];
    if (choice != null && !group.entries.some(entry => entry.index === choice)) throw new Error("Choose one of the repeated rows or keep neither.");
  }
  return rows.filter((row, index) => {
    const key = designChainageKey(row.chainageOursKm);
    return !repeats.has(key) || choices[key] === index;
  });
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
