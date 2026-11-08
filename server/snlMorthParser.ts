/**
 * MoRTH Standard Data Book parser
 *
 * Reads the official MoRTH "Standard Data Book for Analysis of Rates —
 * Road and Bridge Works" Excel file, which uses a chapter-per-sheet,
 * narrative-row-per-item layout that the generic 4-sheet SDB importer
 * cannot handle.
 *
 * Sheet names in the workbook: GEN, INPUT, DIR USED ITEMS, SUMMARY, 1…16
 * Only the numeric chapter sheets (1–16) are parsed.
 *
 * Row layout within each chapter sheet:
 *   Row 1 : chapter title
 *   Row 2 : chapter subtitle
 *   Row 3 : column headers (Sr No | Ref | | Description | Unit | Qty | …)
 *   Row 4+: data rows
 *
 * Column mapping (0-indexed):
 *   A (0) : item code  e.g. 5.1  (blank for sub-rows)
 *   B (1) : MoRTH spec clause reference
 *   C (2) : sub-variant marker  e.g. "(i)", "(ii)", "(iii)"
 *   D (3) : description / section header / row label
 *   E (4) : unit
 *   F (5) : quantity
 *   G (6) : "input" (cost — ignored; we want physical norms only)
 *   I (8) : reference code  P&M-xxx / L-xxx / M-xxx
 */

import * as XLSX from 'xlsx';
import { db } from './db';
import {
  snlSources,
  snlItems,
  snlItemProductivity,
  snlItemEquipment,
  snlItemLabour,
  snlItemMaterials,
} from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { ImportResult } from './snlImporter';

// ─── Chapter metadata ─────────────────────────────────────────────────────────

interface ChapterMeta {
  workCategory: string;
  sector: string;
}

const CHAPTER_META: Record<number, ChapterMeta> = {
  1:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  2:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  3:  { workCategory: 'EARTHWORK',        sector: 'ROAD' },
  4:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  5:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  6:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  7:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  8:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  9:  { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  10: { workCategory: 'CROSS_DRAINAGE',   sector: 'STRUCTURES' },
  11: { workCategory: 'CROSS_DRAINAGE',   sector: 'STRUCTURES' },
  12: { workCategory: 'MAJOR_BRIDGES',    sector: 'STRUCTURES' },
  13: { workCategory: 'MAJOR_BRIDGES',    sector: 'STRUCTURES' },
  14: { workCategory: 'MAJOR_BRIDGES',    sector: 'STRUCTURES' },
  15: { workCategory: 'ROAD_WORKS',       sector: 'ROAD' },
  16: { workCategory: 'MISCELLANEOUS',    sector: 'ROAD' },
};

// ─── Parsed intermediate types ────────────────────────────────────────────────

interface SubRow {
  label: string;
  unit: string;
  qty: number;
  ref: string;
  notes?: string;
}

export interface ParsedMorthItem {
  code: string;
  chapterNo: string;
  workCategory: string;
  sector: string;
  title: string;
  description: string;
  unit: string;
  shiftOutput: number;
  labour: SubRow[];
  equipment: SubRow[];
  materials: SubRow[];
}
type ParsedItem = ParsedMorthItem;

// ─── Row-level helpers ────────────────────────────────────────────────────────

function cell(row: unknown[], col: number): string {
  return String(row[col] ?? '').trim();
}

/** Parse numeric factors as a product, while retaining the coefficient in "450 x L". */
function parseQty(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || s === 'input') return null;
  const expression = s.replace(/,/g, '').replace(/×/g, 'x').replace(/\*+$/, '').replace(/\s+/g, '');
  const factors = expression.split(/x/i);
  if (factors.length > 1 && factors.every(part => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(part))) {
    const product = factors.reduce((total, part) => total * Number(part), 1);
    return Number.isFinite(product) ? Number(product.toFixed(6)) : null;
  }
  const m = s.match(/^[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function equipmentUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (/^(?:hr|hrs|hour|hours)$/.test(normalized)) return 'hrs';
  if (/^(?:tonne\.?km|t\.?km)$/.test(normalized)) return 'tonne.km';
  return unit.trim();
}

/** Detect section headings in column D */
type Section = 'desc' | 'labour' | 'equipment' | 'materials' | 'skip';

function detectSection(d: string): Section | null {
  const heading = d.trim().replace(/^\s*[a-z]\s*[).:-]\s*/i, "").toLowerCase();
  if (/^labou?r\b/.test(heading)) return 'labour';
  if (/^machinery\b/.test(heading)) return 'equipment';
  if (/^materials?\b/.test(heading)) return 'materials';
  if (/^\s*[de][\s)]/i.test(d)) return 'skip';     // overhead / profit
  return null;
}

function extractCase(colC: string): "I" | "II" | null {
  const match = colC.trim().match(/^Case\s*[-– ]\s*(I|II)$/i);
  return match ? match[1].toUpperCase() as "I" | "II" : null;
}

/** True when a column-D value is noise we should skip (not a real data row) */
function isNoiseRow(d: string): boolean {
  if (!d) return true;
  const lower = d.toLowerCase();
  return (
    /^(cost\s+for|rate\s+per|taking\s+density|volume\s+of|weight\s+of|total\s+weight|total\s+mix|add\s+\d|or$|\*)/i.test(lower) ||
    /^(note|ref\.|p&m-|l-\d|m-\d)/i.test(lower) ||
    lower === 'say' ||
    /browserslist/i.test(lower)
  );
}

/** Extract output value + unit from "Taking output = 120 cum" */
function parseOutput(d: string): { qty: number; unit: string } | null {
  const outputText = d.match(/taking\s+output\s*(?:=|:)?\s*(.*)$/i)?.[1]
    ?.split(/[:=]/).at(-1)?.trim() ?? "";
  const numeric = outputText.match(/^([\d,]+(?:\.\d+)?)(?:\s*(\S+))?/i);
  if (numeric) {
    const qty = parseFloat(numeric[1].replace(/,/g, ""));
    return Number.isFinite(qty) ? { qty, unit: (numeric[2] ?? "").toUpperCase() } : null;
  }
  if (/^(?:one|a|an)\b/i.test(outputText)) return { qty: 1, unit: "" };
  return null;
}

/** Extract unit from "Unit = sqm" */
function parseUnitLine(d: string): string | null {
  const m = d.match(/unit\s*=\s*(?:\d+(?:\.\d+)?\s*)?(.+?)\s*$/i);
  return m ? m[1].replace(/[.;,]+$/, "").trim().toUpperCase() : null;
}

/**
 * Normalise a col C sub-variant marker to a code-safe slug.
 *
 * Only known variant notation patterns are recognised.  Any other non-empty
 * col C value (e.g. "Note", "Ref.", free-text) returns '' so the row is NOT
 * treated as an item boundary.  Case is preserved so lowercase "(i)"→"i"
 * stays distinct from uppercase "I", reducing collisions in 3-level nesting.
 *
 * Recognised patterns in the MoRTH SDB:
 *   "(i)" / "(ii)" / "(iii)" … — parenthesised Roman numerals (level-1)
 *   "I" / "II" / "III" / "IV" / "V" … — bare uppercase Roman (level-2)
 *   "A" / "B" / "C" … "H" — single uppercase letter (level-3)
 *   "(A)" / "(b)" — parenthesised single letter
 *   "Case-II" / "Case - II" — specific named-case variants
 *   "New" — renewal-rate variant
 */
function extractVariant(colC: string): string {
  const s = colC.trim();
  if (!s) return '';

  // Parenthesised Roman numeral: "(i)", "(ii)", "(iii)" …
  if (/^\([ivxlc]+\)$/i.test(s)) {
    return s.replace(/[()]/g, '');
  }

  // Parenthesised single letter: "(A)", "(b)" …
  if (/^\([a-zA-Z]\)$/.test(s)) {
    return s.replace(/[()]/g, '');
  }

  // Bare uppercase Roman numeral up to 8 chars: I, II, III, IV, V, VI …
  if (/^[IVXLC]{1,8}$/.test(s)) {
    return s;
  }

  // Single uppercase letter: A–H (the book never goes beyond H in this usage)
  if (/^[A-H]$/.test(s)) {
    return s;
  }

  // "Case I", "Case-II" / "Case - II"
  const caseMatch = s.match(/^Case\s*[-–]\s*(I|II)$/i);
  if (caseMatch) {
    return `Case-${caseMatch[1].toUpperCase()}`;
  }

  // "New" keyword used in ch-11
  if (/^New$/i.test(s)) {
    return 'New';
  }

  // Anything else (e.g. "Note", free text) → NOT a variant marker
  return '';
}

type NestedPathPart = { code: string; kind: "case" | "roman" | "letter" | "depth" };

const NESTED_CODE_ROOTS: Record<number, Set<string>> = {
  2: new Set(["2.3"]),
  3: new Set(["3.13"]),
  12: new Set(["12.1"]),
  14: new Set(["14.1"]),
};

function nestedRootAndParts(codeCell: string, chapterNo: number): { root: string; parts: NestedPathPart[] } | null {
  const match = codeCell.trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match || !NESTED_CODE_ROOTS[chapterNo]?.has(match[1])) return null;
  const [, root, suffix] = match;
  const parts: NestedPathPart[] = [];
  const remainder = suffix.trim();
  const tokenPattern = /Case\s*[-– ]\s*(II|I)\b|\(([A-Za-z]+)\)|(?:^|\s)([A-H])(?=\s|\(|$)|^([A-H])$/gi;
  for (const token of Array.from(remainder.matchAll(tokenPattern))) {
    if (token[1]) {
      parts.push({ code: `Case-${token[1].toUpperCase()}`, kind: "case" });
    } else {
      const value = token[2] ?? token[3] ?? token[4];
      if (!value) continue;
      const kind = /^[pqr]$/.test(value) ? "depth" :
        /^[ivxlc]+$/i.test(value) ? "roman" :
        /^[A-H]$/.test(value) ? "letter" : null;
      if (kind) parts.push({ code: value, kind });
    }
  }
  return { root, parts };
}

function nestedPartFromColumnC(value: string): NestedPathPart | null {
  const caseLabel = extractCase(value);
  if (caseLabel) return { code: `Case-${caseLabel}`, kind: "case" };
  const token = extractVariant(value);
  if (!token) return null;
  const kind = /^[pqr]$/.test(token) ? "depth" :
    /^[ivxlc]+$/i.test(token) ? "roman" :
    /^[A-H]$/.test(token) ? "letter" : null;
  return kind ? { code: token, kind } : null;
}

function samePathPart(a: NestedPathPart, b: NestedPathPart): boolean {
  return a.code === b.code && a.kind === b.kind;
}

function skillTier(designation: string): string {
  return /mason|operator|fitter|blacksmith|carpenter|sinker|skilled/i.test(designation)
    ? 'SKILLED'
    : 'UNSKILLED';
}

function materialCategory(name: string): string {
  if (/aggregate|gsb|wmm/i.test(name)) return 'AGGREGATE';
  if (/cement/i.test(name))           return 'CEMENT';
  if (/bitumen|emulsion/i.test(name)) return 'BITUMEN';
  return 'OTHER';
}

// ─── Sheet parser ─────────────────────────────────────────────────────────────

function parseChapterSheet(
  rows: unknown[][],
  chapterNo: number,
): ParsedItem[] {
  const meta = CHAPTER_META[chapterNo] ?? { workCategory: 'MISCELLANEOUS', sector: 'ROAD' };
  const chStr = String(chapterNo);

  const items: ParsedItem[] = [];

  let current: ParsedItem | null = null;
  const getCurrent = (): ParsedItem | null => current;
  let section: Section = 'desc';

  // Track last seen base code so we can handle "(i)" variant rows that have
  // col A empty.
  let lastBaseCode = '';
  let lastBaseTitle = '';
  let lastBaseUnit = '';
  const titleByCode = new Map<string, string>();
  const nestedPathByCode = new Map<string, NestedPathPart[]>();
  const nestedItemByCode = new Map<string, ParsedItem>();
  let currentNestedRoot: string | null = null;
  let currentNestedParts: NestedPathPart[] = [];
  let lastCaseBaseCode = '';
  let lastCaseBaseTitle = '';
  let lastWbmMethodCode = "";
  let lastWbmShiftOutput = 0;
  let pendingEquipmentAlternative = false;
  // Track if the current item saw any sub-row data (has real content)
  let currentHasData = false;

  function finalise() {
    if (!current) return;
    // Only keep items that have at least one sub-row OR a meaningful unit
    if (currentHasData || current.unit) {
      items.push({ ...current });
      if (currentNestedRoot) {
        const code = current.code;
        nestedPathByCode.set(code, currentNestedParts.map(part => ({ ...part })));
        nestedItemByCode.set(code, { ...current });
      }
    }
    current = null;
    currentHasData = false;
    currentNestedRoot = null;
    currentNestedParts = [];
  }

  function startItem(code: string, title: string, nested?: { root: string; parts: NestedPathPart[] }) {
    finalise();
    current = {
      code,
      chapterNo: chStr,
      workCategory: meta.workCategory,
      sector: meta.sector,
      title,
      description: '',
      unit: '',
      shiftOutput: 0,
      labour: [],
      equipment: [],
      materials: [],
    };
    section = 'desc';
    pendingEquipmentAlternative = false;
    if (nested) {
      currentNestedRoot = nested.root;
      currentNestedParts = nested.parts.map(part => ({ ...part }));
      titleByCode.set(code, title);
      nestedPathByCode.set(code, currentNestedParts.map(part => ({ ...part })));
      const parentCodes = [
        nested.root,
        ...nested.parts.map((_, index) =>
          `${nested.root}-${nested.parts.slice(0, index + 1).map(part => part.code).join("-")}`,
        ),
      ];
      for (let index = parentCodes.length - 1; index >= 0; index--) {
        if (parentCodes[index] === code) continue;
        const parent = nestedItemByCode.get(parentCodes[index]);
        if (parent) {
          current.unit = parent.unit;
          current.shiftOutput = parent.shiftOutput;
          break;
        }
      }
      lastBaseCode = nested.root;
      lastBaseTitle = titleByCode.get(nested.root) ?? lastBaseTitle;
    } else {
      currentNestedRoot = null;
      currentNestedParts = [];
    }
  }

  function startNestedItem(root: string, parts: NestedPathPart[], rowTitle: string) {
    const code = [root, ...parts.map(part => part.code)].join("-");
    let title = titleByCode.get(root) ?? lastBaseTitle;
    for (let index = 0; index < parts.length; index++) {
      const prefixCode = [root, ...parts.slice(0, index + 1).map(part => part.code)].join("-");
      const savedTitle = titleByCode.get(prefixCode);
      if (savedTitle) title = savedTitle;
      else if (index === parts.length - 1 && rowTitle) title = `${title} — ${rowTitle.replace(/[\s:;.-]+$/, "").trim()}`;
    }
    if (parts.length && rowTitle) {
      const finalPartCode = [root, ...parts.map(part => part.code)].join("-");
      const existingTitle = titleByCode.get(finalPartCode);
      if (!existingTitle || existingTitle === titleByCode.get(root)) {
        const parentCode = [root, ...parts.slice(0, -1).map(part => part.code)].join("-");
        const parentTitle = titleByCode.get(parentCode) ?? titleByCode.get(root) ?? lastBaseTitle;
        title = `${parentTitle} — ${rowTitle.replace(/[\s:;.-]+$/, "").trim()}`;
      }
    }
    titleByCode.set(code, title);
    startItem(code, title, { root, parts });
  }

  function resolveNestedPath(
    root: string,
    explicitParts: NestedPathPart[],
    marker: NestedPathPart | null,
    hasExplicitRoot: boolean,
  ): NestedPathPart[] {
    let parts = explicitParts.map(part => ({ ...part }));
    if (!parts.length && !hasExplicitRoot && currentNestedRoot === root) {
      parts = currentNestedParts.map(part => ({ ...part }));
    }
    if (marker && !parts.some(part => samePathPart(part, marker))) {
      if (marker.kind === "roman") {
        const last = parts.at(-1);
        if (marker.code === marker.code.toUpperCase()) parts = [];
        else if (last?.kind === "roman") parts.pop();
        else if (last?.kind !== "letter" && last?.kind !== "case") {
          const casePrefix = parts.findIndex(part => part.kind === "case");
          parts = casePrefix >= 0 ? parts.slice(0, casePrefix + 1) : [];
        }
      } else if (marker.kind === "letter") {
        const romanIndex = parts.map(part => part.kind).lastIndexOf("roman");
        if (romanIndex >= 0) parts = parts.slice(0, romanIndex + 1);
      } else if (marker.kind === "depth") {
        while (parts.at(-1)?.kind === "depth") parts.pop();
      }
      parts.push(marker);
    }
    return parts;
  }

  // Skip the first 3 header rows (chapter title, subtitle, column headers)
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const colA = cell(row, 0);
    const colC = cell(row, 2);
    const colD = cell(row, 3);
    const colE = cell(row, 4);
    const colF = row[5];
    const colI = cell(row, 8);

    // ── Skip "Note" rows FIRST (col C = "Note" / "Notes") ─────────────────
    // This must run before variant detection so "Note" in col C is never
    // mistaken for a sub-variant marker.
    if (/^notes?$/i.test(colC)) continue;

    // ── Detect item / sub-variant boundaries ──────────────────────────────

    const spacedCode = colA.match(/^(\d+(?:\.\d+)?)[ \t]+([A-H])$/i);
    const isCode = /^\d+\.?\d*[a-z]?$/i.test(colA);
    const activeBeforeBoundary = getCurrent();
    const current128Case = activeBeforeBoundary?.code.match(/^12\.8-([C-H])$/i);
    const caseLetter = spacedCode?.[1] === "12.8"
      ? spacedCode[2].toUpperCase()
      : current128Case?.[1]?.toUpperCase();
    const caseLabel = caseLetter && /^[C-H]$/.test(caseLetter) ? extractCase(colC) : null;
    const variantLabel = extractVariant(colC);
    const isVariant = !!variantLabel;

    // Chapters 2.3, 3.13, 12.1, and 14.1 use nested heading rows. Preserve every
    // path level (including a roman heading followed by a letter or p/q/r row)
    // rather than flattening a child onto the nearest numeric code.
    const nestedIdentity = nestedRootAndParts(colA, chapterNo);
    const activeNestedRoot = currentNestedRoot;
    const nestedMarker = nestedPartFromColumnC(colC);
    const nestedRoot = nestedIdentity?.root ??
      (activeNestedRoot && nestedMarker ? activeNestedRoot : null);
    if (nestedRoot) {
      const parts = resolveNestedPath(
        nestedRoot,
        nestedIdentity?.parts ?? [],
        nestedMarker,
        !!nestedIdentity,
      );
      const isRootBoundary = nestedIdentity && parts.length === 0 && !nestedMarker;
      const rowHasNestedHeading = nestedIdentity
        ? !isRootBoundary
        : !!nestedMarker;
      if (isRootBoundary) {
        lastBaseCode = nestedRoot;
        lastBaseTitle = colD.replace(/[\s.]+$/, "") || lastBaseTitle;
        lastBaseUnit = "";
        titleByCode.set(nestedRoot, lastBaseTitle);
        startItem(nestedRoot, lastBaseTitle, { root: nestedRoot, parts: [] });
        continue;
      }
      if (rowHasNestedHeading) {
        const rowTitle = colD || parts.at(-1)?.code || nestedRoot;
        startNestedItem(nestedRoot, parts, rowTitle);
        continue;
      }
    }

    // Case I/II rows are independent norm variants. In this workbook the
    // "Case II" rows for 12.8 C–H put the spaced child code in column A, while
    // the section headings (Labour/Machinery/Material) can appear in any order.
    if (caseLabel) {
      const caseBaseCode = `12.8-${caseLetter}`;
      const caseBaseTitle = titleByCode.get(caseBaseCode) || lastBaseTitle;
      const inheritedUnit = activeBeforeBoundary?.unit || lastBaseUnit;
      const detail = colD && !/^\s*[a-z]\s*[).:-]/i.test(colD) ? colD : `Case ${caseLabel}`;
      const caseTitle = `${caseBaseTitle} — Case ${caseLabel}${detail === `Case ${caseLabel}` ? "" : `: ${detail}`}`;
      const caseCode = caseLabel === "I" ? caseBaseCode : `${caseBaseCode}-Case-II`;
      // The letter row (C–H) is a structural heading immediately before Case I.
      // It may inherit the previous variant's unit, but it has no resource rows;
      // discard that empty placeholder so Case I keeps the canonical code.
      if (caseLabel === "I" && activeBeforeBoundary?.code === caseBaseCode && !currentHasData) {
        current = null;
        currentHasData = false;
      }
      startItem(caseCode, caseTitle);
      const caseItem = getCurrent();
      if (caseItem && inheritedUnit) caseItem.unit = inheritedUnit;
      continue;
    }

    if (isCode && !isVariant) {
      // New base item
      lastBaseCode = colA;
      lastBaseTitle = colD || lastBaseTitle;
      lastBaseUnit = '';
      lastCaseBaseCode = colA;
      lastCaseBaseTitle = lastBaseTitle;
      titleByCode.set(colA, lastBaseTitle);
      startItem(colA, colD);
      continue;
    }

    if (isVariant) {
      const wbmMethodStart = chapterNo === 4 &&
        (colA === "4.9" || lastBaseCode === "4.9") &&
        /^[AB]$/.test(variantLabel);
      const wbmMaterialGrade = chapterNo === 4 &&
        /^4\.9[AB]$/i.test(colA) &&
        /^\((i|ii|iii)\)$/i.test(colC) &&
        !!lastWbmMethodCode;
      // Capture the unit from the base item before starting sub-variant
      const activeBeforeVariant = getCurrent();
      if (activeBeforeVariant && activeBeforeVariant.unit) lastBaseUnit = activeBeforeVariant.unit;
      // Sub-variant: col A may repeat the base code or be empty
      if (isCode) {
        // The workbook writes the WBM grading code as "4.9A" under the
        // already active 4.9-A / 4.9-B work item. Keep that parent identity so
        // the material rows stay distinguishable by work method.
        lastBaseCode = wbmMaterialGrade ? lastWbmMethodCode : colA;
      }
      const varCode = `${lastBaseCode}-${variantLabel}`;
      const varTitle = colD
        ? `${lastBaseTitle}: ${colD}`
        : `${lastBaseTitle} (${variantLabel})`;
      titleByCode.set(varCode, varTitle);
      lastCaseBaseCode = varCode;
      lastCaseBaseTitle = varTitle;
      startItem(varCode, varTitle);
      if (wbmMethodStart) {
        lastWbmMethodCode = varCode;
        lastWbmShiftOutput = 0;
      }
      const startedVariant = getCurrent();
      if (wbmMaterialGrade && startedVariant) {
        section = "materials";
        startedVariant.shiftOutput = lastWbmShiftOutput;
      }
      // Inherit parent's unit for all sub-variants
      if (lastBaseUnit && startedVariant) startedVariant.unit = lastBaseUnit;
      continue;
    }

    // ── Process within current item ────────────────────────────────────────
    const activeItem = getCurrent();
    if (!activeItem) continue;

    // Detect section changes
    const sec = detectSection(colD);
    if (sec !== null) {
      section = sec;
      if (section !== 'equipment') pendingEquipmentAlternative = false;
      continue;
    }

    if (section === 'skip') continue;

    // An "or" row in Machinery introduces an alternative, not another machine
    // to add to demand. Keep the alternative as a note on the first norm row.
    if (section === 'equipment' && /^or\b/i.test(colD)) {
      pendingEquipmentAlternative = activeItem.equipment.length > 0;
      continue;
    }

    // Description section: pick up unit and output lines
    if (section === 'desc') {
      const u = parseUnitLine(colD);
      if (u) { activeItem.unit = u; continue; }
      const o = parseOutput(colD);
      if (o) {
        activeItem.shiftOutput = o.qty;
        if (activeItem.code === lastWbmMethodCode) lastWbmShiftOutput = o.qty;
        if (!activeItem.unit) activeItem.unit = o.unit;
        continue;
      }
      // Accumulate description text (skip explanatory prose that's too long)
      if (colD && !isNoiseRow(colD) && colD.length > 5 && !activeItem.description) {
        activeItem.description = colD;
      }
      continue;
    }

    // Data row: must have a label and a parseable qty
    if (isNoiseRow(colD)) continue;
    // Skip sub-section headers like "i) Bitumen@..." or "(i) Grading I"
    if (/^[ivx]+[\s)]/i.test(colD) && !colE) continue;

    const qty = parseQty(colF);
    if (qty === null || qty <= 0) continue;
    const rawUnit = colE || (section === 'labour' ? 'day' : section === 'equipment' ? 'hour' : activeItem.unit);
    const unit = section === 'equipment' ? equipmentUnit(rawUnit) : rawUnit;

    const subRow: SubRow = { label: colD, unit, qty, ref: colI };

    if (section === 'labour')    { activeItem.labour.push(subRow);    currentHasData = true; }
    if (section === 'equipment') {
      if (pendingEquipmentAlternative) {
        const firstNorm = activeItem.equipment[activeItem.equipment.length - 1];
        if (firstNorm) {
          const altUnit = unit === 'hrs' ? 'hr' : unit;
          const alternative = `Alternative only: ${subRow.label} — ${subRow.qty} ${altUnit}`;
          firstNorm.notes = [firstNorm.notes, alternative].filter(Boolean).join("; ");
        }
        pendingEquipmentAlternative = false;
      } else {
        if (unit === 'tonne.km') {
          subRow.notes = `Carrying by lead: ${qty} tonne.km per shift per km lead`;
        }
        activeItem.equipment.push(subRow);
      }
      currentHasData = true;
    }
    if (section === 'materials') { activeItem.materials.push(subRow); currentHasData = true; }
  }

  finalise();

  // The workbook's Modified Binder entry is a market-rate material quoted per
  // tonne and intentionally has no separate "Taking output" line.
  const modifiedBinder = items.find(item => item.code === "5.20");
  if (modifiedBinder?.unit && modifiedBinder.shiftOutput <= 0) modifiedBinder.shiftOutput = 1;

  // ── Post-process: ensure all codes within this chapter are unique ───────
  // 3-level nesting can produce the same slug at different depths (e.g. "A"
  // under both "I" and "II" both map to "<base>-A"). Append a counter to
  // resolve collisions so DB upserts never overwrite unrelated items.
  const codeOccurrences = new Map<string, number>();
  for (const item of items) {
    const orig = item.code;
    const seen = codeOccurrences.get(orig) ?? 0;
    codeOccurrences.set(orig, seen + 1);
    if (seen > 0) {
      item.code = `${orig}-${seen + 1}`;
    }
  }

  // Nested sub-cases with no resource rows of their own inherit missing
  // categories from the nearest ancestor that has them. This includes the
  // 14.1 p/q/r formwork-rate rows; their identity and output remain separate.
  const itemByCode = new Map(items.map(item => [item.code, item]));
  for (const item of items) {
    const nested = Array.from(nestedPathByCode.entries()).find(([code]) => code === item.code);
    if (nested) {
      const [code, parts] = nested;
      if (!parts.length) continue;
      const root = code.split("-")[0];
      const ancestors = [
        ...parts.slice(0, -1).map((_part: NestedPathPart, index: number) =>
          `${root}-${parts.slice(0, index + 1).map(part => part.code).join("-")}`,
        ).reverse(),
        root,
      ];
      const parent = ancestors.map((parentCode: string) => itemByCode.get(parentCode)).find(candidate =>
        !!candidate && (candidate.equipment.length || candidate.labour.length || candidate.materials.length),
      );
      if (parent) {
        if (!item.equipment.length && parent.equipment.length) item.equipment = parent.equipment.map((row: SubRow) => ({ ...row }));
        if (!item.labour.length && parent.labour.length) item.labour = parent.labour.map((row: SubRow) => ({ ...row }));
        if (!item.materials.length && parent.materials.length) item.materials = parent.materials.map((row: SubRow) => ({ ...row }));
      }
      const parentWithOutput = ancestors.map((parentCode: string) => itemByCode.get(parentCode)).find(candidate =>
        !!candidate && candidate.shiftOutput > 0,
      );
      if (item.shiftOutput <= 0 && parentWithOutput) item.shiftOutput = parentWithOutput.shiftOutput;
      if (!item.unit) {
        const parentWithUnit = ancestors.map((parentCode: string) => itemByCode.get(parentCode)).find(candidate =>
          !!candidate && !!candidate.unit,
        );
        if (parentWithUnit) item.unit = parentWithUnit.unit;
      }
      continue;
    }

    // Keep the legacy 4.1/5.6/5.8 grading inheritance behavior.
    const match = item.code.match(/^(.*)-([ivxlc]+)$/);
    if (!match || !/grading/i.test(item.title)) continue;
    const parentRef = match[1].match(/^(\d+(?:\.\d+)?)([A-H])$/i);
    const parentCode = parentRef ? `${parentRef[1]}-${parentRef[2].toUpperCase()}` : match[1];
    const parent = itemByCode.get(parentCode);
    if (!parent) continue;
    if (!item.equipment.length && parent.equipment.length) item.equipment = parent.equipment.map(row => ({ ...row }));
    if (!item.labour.length && parent.labour.length) item.labour = parent.labour.map(row => ({ ...row }));
    if (!item.materials.length && parent.materials.length) item.materials = parent.materials.map(row => ({ ...row }));
    if (item.shiftOutput <= 0 && parent.shiftOutput > 0) item.shiftOutput = parent.shiftOutput;
    if (!item.unit && parent.unit) item.unit = parent.unit;
  }

  return items.filter(item => {
    const hasResources = item.equipment.length || item.labour.length || item.materials.length;
    if (hasResources) return true;
    // Heading-only parent rows are not independent norms when their child
    // cases contain the actual resources.
    return !items.some(candidate => candidate.code.startsWith(`${item.code}-`));
  });
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertParsedItems(
  sourceId: number,
  items: ParsedItem[],
  result: ImportResult,
): Promise<void> {
  for (const item of items) {
    try {
      const shiftOutput = item.shiftOutput > 0 ? item.shiftOutput : 1;
      const shiftHours = 8;
      const derivedPerHour = shiftOutput / shiftHours;

      const existing = await db
        .select({ id: snlItems.id })
        .from(snlItems)
        .where(and(eq(snlItems.sourceId, sourceId), eq(snlItems.itemCode, item.code)))
        .limit(1);

      let itemId: number;
      const descFull = item.description || item.title;
      const shortLbl = item.title.slice(0, 80);

      if (existing.length > 0) {
        itemId = existing[0].id;
        await db.update(snlItems).set({
          description: descFull,
          shortLabel: shortLbl,
          unit: item.unit || 'CUM',
          workCategory: item.workCategory,
          sector: item.sector,
          chapterNo: item.chapterNo,
          isActive: true,
        }).where(eq(snlItems.id, itemId));
        result.itemsUpdated++;
      } else {
        const [ins] = await db.insert(snlItems).values({
          sourceId,
          itemCode: item.code,
          description: descFull,
          shortLabel: shortLbl,
          unit: item.unit || 'CUM',
          workCategory: item.workCategory,
          sector: item.sector,
          chapterNo: item.chapterNo,
          isActive: true,
        }).returning({ id: snlItems.id });
        itemId = ins.id;
        result.itemsInserted++;
      }

      // Replace all child rows for a clean refresh
      await db.delete(snlItemProductivity).where(eq(snlItemProductivity.itemId, itemId));
      await db.delete(snlItemEquipment).where(eq(snlItemEquipment.itemId, itemId));
      await db.delete(snlItemLabour).where(eq(snlItemLabour.itemId, itemId));
      await db.delete(snlItemMaterials).where(eq(snlItemMaterials.itemId, itemId));

      await db.insert(snlItemProductivity).values({
        itemId,
        projectCategory: 'ALL',
        shiftOutput,
        shiftHours,
        outputUnit: item.unit || 'CUM',
        derivedPerHour,
      });

      for (let j = 0; j < item.equipment.length; j++) {
        const er = item.equipment[j];
        await db.insert(snlItemEquipment).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          equipmentType: er.label,
          equipmentSpec: null,
          unit: er.unit,
          quantityPerShift: er.qty,
          shiftOutputRef: shiftOutput,
          derivedPerUnit: er.qty / shiftOutput,
          notes: er.notes ?? null,
        });
        result.equipment++;
      }

      for (let j = 0; j < item.labour.length; j++) {
        const lr = item.labour[j];
        await db.insert(snlItemLabour).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          designation: lr.label,
          skillTier: skillTier(lr.label),
          unit: 'day',
          quantityPerShift: lr.qty,
          shiftOutputRef: shiftOutput,
          derivedPerUnit: lr.qty / shiftOutput,
        });
        result.labour++;
      }

      for (let j = 0; j < item.materials.length; j++) {
        const mr = item.materials[j];
        const qtyPerUnit = mr.qty / shiftOutput;
        await db.insert(snlItemMaterials).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          materialName: mr.label,
          materialCategory: materialCategory(mr.label),
          unit: mr.unit || item.unit || 'CUM',
          quantityPerShift: mr.qty,
          shiftOutputRef: shiftOutput,
          derivedPerUnit: qtyPerUnit,
          isDesignSpecific: false,
        });
        result.materials++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Item ${item.code}: ${msg}`);
    }
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Detect whether a workbook is the official MoRTH chapter-per-sheet format.
 * Returns true when at least 12 of the 16 chapter sheets ("1"–"16") are
 * present.  Checking 12/16 avoids false positives on non-MoRTH uploads while
 * tolerating minor sheet-naming variations in reissued editions.
 */
export function isMorthFormat(wb: XLSX.WorkBook): boolean {
  const names = new Set(wb.SheetNames);
  let count = 0;
  for (let n = 1; n <= 16; n++) {
    if (names.has(String(n))) count++;
  }
  return count >= 12;
}

export function parseMorthSdbWorkbook(buffer: Buffer): ParsedMorthItem[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!isMorthFormat(wb)) throw new Error("This is not a MoRTH chapter-per-sheet workbook.");
  const parsed: ParsedMorthItem[] = [];
  for (let chapterNo = 1; chapterNo <= 16; chapterNo++) {
    const worksheet = wb.Sheets[String(chapterNo)];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
    parsed.push(...parseChapterSheet(rows, chapterNo));
  }
  return parsed;
}

/**
 * Parse and import the official MoRTH SDB workbook into the SNL catalog.
 * All items land in source MORTH_SDB_2019, appending to the 18 hand-coded
 * seed items already present.
 */
export async function importMorthSdbXlsx(buffer: Buffer): Promise<ImportResult> {
  const parsedItems = parseMorthSdbWorkbook(buffer);

  const SOURCE_CODE = 'MORTH_SDB_2019';
  const SOURCE_NAME = 'MoRTH Standard Data Book (2003)';

  const [source] = await db
    .insert(snlSources)
    .values({
      code: SOURCE_CODE,
      name: SOURCE_NAME,
      authority: 'MoRTH',
      year: 2003,
      isActive: true,
    })
    .onConflictDoUpdate({ target: snlSources.code, set: { name: SOURCE_NAME, year: 2003 } })
    .returning();

  const result: ImportResult = {
    sourceName: SOURCE_NAME,
    sourceCode: SOURCE_CODE,
    itemsInserted: 0,
    itemsUpdated: 0,
    equipment: 0,
    labour: 0,
    materials: 0,
    errors: [],
  };

  await upsertParsedItems(source.id, parsedItems, result);

  return result;
}
