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
}

interface ParsedItem {
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

// ─── Row-level helpers ────────────────────────────────────────────────────────

function cell(row: unknown[], col: number): string {
  return String(row[col] ?? '').trim();
}

/** Parse first numeric value from a cell that may contain "6.00x0.65*" or "450 x L" */
function parseQty(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || s === 'input') return null;
  const m = s.match(/^[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/** Detect section headings in column D */
type Section = 'desc' | 'labour' | 'equipment' | 'materials' | 'skip';

function detectSection(d: string): Section | null {
  const lower = d.toLowerCase();
  if (/^\s*a[\s)]/.test(lower) && /labour/i.test(lower)) return 'labour';
  if (/^\s*b[\s)]/.test(lower) && /machin/i.test(lower)) return 'equipment';
  if (/^\s*c[\s)]/.test(lower) && /material/i.test(lower)) return 'materials';
  if (/^\s*[de][\s)]/.test(lower)) return 'skip';     // overhead / profit
  return null;
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
  const m = d.match(/taking\s+output\s*=\s*([\d,]+(?:\.\d+)?)\s*(\S+)/i);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(qty) ? null : { qty, unit: m[2].toUpperCase() };
}

/** Extract unit from "Unit = sqm" */
function parseUnitLine(d: string): string | null {
  const m = d.match(/unit\s*=\s*(\S+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Normalise any sub-variant label in col C to a code-safe slug.
 * The MoRTH SDB uses many notations: "(ii)", "II", "B", "(A)", "Case-II", "New" …
 * ANY non-empty col C on an item-boundary row signals a sub-variant.
 *
 * Case is PRESERVED so that lowercase "(i)"→"i" stays distinct from uppercase "I",
 * reducing (but not eliminating) collisions from 3-level nesting.
 */
function extractVariant(colC: string): string {
  const s = colC.trim();
  if (!s) return '';
  // Remove parentheses, preserve case, collapse whitespace/dashes to single dash
  return s
    .replace(/[()]/g, '')
    .trim()
    .replace(/[\s\-]+/g, '-')
    .replace(/[^\w\-]/g, '')
    .replace(/-+/g, '-');
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
  let section: Section = 'desc';

  // Track last seen base code so we can handle "(i)" variant rows that have
  // col A empty.
  let lastBaseCode = '';
  let lastBaseTitle = '';
  let lastBaseUnit = '';
  // Track if the current item saw any sub-row data (has real content)
  let currentHasData = false;

  function finalise() {
    if (!current) return;
    // Only keep items that have at least one sub-row OR a meaningful unit
    if (currentHasData || current.unit) {
      items.push({ ...current });
    }
    current = null;
    currentHasData = false;
  }

  function startItem(code: string, title: string) {
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

    // ── Detect item / sub-variant boundaries ──────────────────────────────

    const isCode = /^\d+\.?\d*[a-z]?$/.test(colA);
    const variantLabel = extractVariant(colC);
    const isVariant = !!variantLabel;

    if (isCode && !isVariant) {
      // New base item
      lastBaseCode = colA;
      lastBaseTitle = colD || lastBaseTitle;
      lastBaseUnit = '';
      startItem(colA, colD);
      continue;
    }

    if (isVariant) {
      // Capture the unit from the base item before starting sub-variant
      if (current && current.unit) lastBaseUnit = current.unit;
      // Sub-variant: col A may repeat the base code or be empty
      if (isCode) lastBaseCode = colA;
      const varCode = `${lastBaseCode}-${variantLabel}`;
      const varTitle = colD
        ? `${lastBaseTitle}: ${colD}`
        : `${lastBaseTitle} (${variantLabel})`;
      startItem(varCode, varTitle);
      // Inherit parent's unit for all sub-variants
      if (lastBaseUnit && current) current.unit = lastBaseUnit;
      continue;
    }

    // ── Skip "Note" rows (col C = "Note") ─────────────────────────────────
    if (/^note$/i.test(cell(row, 2))) continue;

    // ── Process within current item ────────────────────────────────────────
    if (!current) continue;

    // Detect section changes
    const sec = detectSection(colD);
    if (sec !== null) { section = sec; continue; }

    if (section === 'skip') continue;

    // Description section: pick up unit and output lines
    if (section === 'desc') {
      const u = parseUnitLine(colD);
      if (u) { current.unit = u; continue; }
      const o = parseOutput(colD);
      if (o) {
        current.shiftOutput = o.qty;
        if (!current.unit) current.unit = o.unit;
        continue;
      }
      // Accumulate description text (skip explanatory prose that's too long)
      if (colD && !isNoiseRow(colD) && colD.length > 5 && !current.description) {
        current.description = colD;
      }
      continue;
    }

    // Data row: must have a label and a parseable qty
    if (isNoiseRow(colD)) continue;
    // Skip sub-section headers like "i) Bitumen@..." or "(i) Grading I"
    if (/^[ivx]+[\s)]/i.test(colD) && !colE) continue;

    const qty = parseQty(colF);
    if (qty === null || qty <= 0) continue;
    const unit = colE || (section === 'labour' ? 'day' : section === 'equipment' ? 'hour' : current.unit);

    const subRow: SubRow = { label: colD, unit, qty, ref: colI };

    if (section === 'labour')    { current.labour.push(subRow);    currentHasData = true; }
    if (section === 'equipment') { current.equipment.push(subRow); currentHasData = true; }
    if (section === 'materials') { current.materials.push(subRow); currentHasData = true; }
  }

  finalise();

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

  return items;
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
          unit: 'hrs',
          quantityPerShift: er.qty,
          shiftOutputRef: shiftOutput,
          derivedPerUnit: er.qty / shiftOutput,
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
 * Returns true when sheets named "1" through at least "5" are present.
 */
export function isMorthFormat(wb: XLSX.WorkBook): boolean {
  const names = new Set(wb.SheetNames);
  return ['1', '2', '3', '4', '5'].every(n => names.has(n));
}

/**
 * Parse and import the official MoRTH SDB workbook into the SNL catalog.
 * All items land in source MORTH_SDB_2019, appending to the 18 hand-coded
 * seed items already present.
 */
export async function importMorthSdbXlsx(buffer: Buffer): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const SOURCE_CODE = 'MORTH_SDB_2019';
  const SOURCE_NAME = 'Standard Data Book for Analysis of Rates — 2nd Revision 2019';

  const [source] = await db
    .insert(snlSources)
    .values({
      code: SOURCE_CODE,
      name: SOURCE_NAME,
      authority: 'MoRTH',
      year: 2019,
      isActive: true,
    })
    .onConflictDoUpdate({ target: snlSources.code, set: { name: SOURCE_NAME, year: 2019 } })
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

  // Parse all 16 chapter sheets
  for (let ch = 1; ch <= 16; ch++) {
    const ws = wb.Sheets[String(ch)];
    if (!ws) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    const parsed = parseChapterSheet(rows, ch);
    await upsertParsedItems(source.id, parsed, result);
  }

  return result;
}
