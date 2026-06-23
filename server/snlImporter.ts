/**
 * SDB xlsx importer — reads the 4-sheet format (Items / Equipment / Labour / Materials)
 * and upserts into the existing snl_* catalog tables.
 *
 * Used by:
 *   - POST /api/snl/import  (admin one-off upload)
 *   - seedSnlFromBundles()  (startup auto-seed)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  const n = parseFloat(String(v ?? ''));
  return isNaN(n) ? null : n;
}

function boolVal(v: unknown): boolean {
  const s = String(v ?? '').toUpperCase().trim();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

function equipmentSpec(label: string): string | null {
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

function skillTier(designation: string): string {
  const lower = designation.toLowerCase();
  if (/mason|operator|fitter|blacksmith|carpenter|sinker|skilled/.test(lower)) return 'SKILLED';
  return 'UNSKILLED';
}

function materialCategory(name: string): string {
  if (/aggregate|gsb|wmm/i.test(name)) return 'AGGREGATE';
  if (/cement/i.test(name)) return 'CEMENT';
  if (/bitumen|emulsion/i.test(name)) return 'BITUMEN';
  return 'OTHER';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  sourceName: string;
  sourceCode: string;
  itemsInserted: number;
  itemsUpdated: number;
  equipment: number;
  labour: number;
  materials: number;
  errors: string[];
}

export interface ImportOptions {
  sourceName?: string;
  sourceCode?: string;
  year?: number;
  defaultSector?: string;
}

// ─── Main importer ────────────────────────────────────────────────────────────

export async function importSdbXlsx(
  buffer: Buffer,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const itemsSheet = wb.Sheets['Items'];
  const equipSheet = wb.Sheets['Equipment'];
  const labourSheet = wb.Sheets['Labour'];
  const materialsSheet = wb.Sheets['Materials'];

  if (!itemsSheet) throw new Error('Missing "Items" sheet in xlsx');

  const itemRows: Record<string, unknown>[] =
    XLSX.utils.sheet_to_json(itemsSheet, { raw: false });
  const equipRows: Record<string, unknown>[] = equipSheet
    ? XLSX.utils.sheet_to_json(equipSheet, { raw: false })
    : [];
  const labourRows: Record<string, unknown>[] = labourSheet
    ? XLSX.utils.sheet_to_json(labourSheet, { raw: false })
    : [];
  const materialsRows: Record<string, unknown>[] = materialsSheet
    ? XLSX.utils.sheet_to_json(materialsSheet, { raw: false })
    : [];

  // Index sub-rows by item code
  const equipByCode = new Map<string, Record<string, unknown>[]>();
  for (const r of equipRows) {
    const code = String(r.code ?? '').trim();
    if (!code) continue;
    if (!equipByCode.has(code)) equipByCode.set(code, []);
    equipByCode.get(code)!.push(r);
  }
  const labourByCode = new Map<string, Record<string, unknown>[]>();
  for (const r of labourRows) {
    const code = String(r.code ?? '').trim();
    if (!code) continue;
    if (!labourByCode.has(code)) labourByCode.set(code, []);
    labourByCode.get(code)!.push(r);
  }
  const materialsByCode = new Map<string, Record<string, unknown>[]>();
  for (const r of materialsRows) {
    const code = String(r.code ?? '').trim();
    if (!code) continue;
    if (!materialsByCode.has(code)) materialsByCode.set(code, []);
    materialsByCode.get(code)!.push(r);
  }

  // Detect sector from first data row
  const firstSector = itemRows[0]
    ? String(itemRows[0].sector ?? opts.defaultSector ?? 'ROAD').trim()
    : (opts.defaultSector ?? 'ROAD');

  const sourceCode = opts.sourceCode ?? `SDB_${firstSector}`;
  const sourceName = opts.sourceName ?? `SDB ${firstSector}`;
  const year = opts.year ?? new Date().getFullYear();

  // Upsert the source record
  const [source] = await db
    .insert(snlSources)
    .values({ code: sourceCode, name: sourceName, authority: 'Government', year, isActive: true })
    .onConflictDoUpdate({ target: snlSources.code, set: { name: sourceName, year } })
    .returning();

  const result: ImportResult = {
    sourceName,
    sourceCode,
    itemsInserted: 0,
    itemsUpdated: 0,
    equipment: 0,
    labour: 0,
    materials: 0,
    errors: [],
  };

  for (let i = 0; i < itemRows.length; i++) {
    const row = itemRows[i];
    try {
      const code = String(row.code ?? '').trim();
      if (!code) { result.errors.push(`Items row ${i + 2}: missing code`); continue; }

      const description = String(row.description ?? '').trim();
      if (!description) { result.errors.push(`Items row ${i + 2} (${code}): missing description`); continue; }

      const unit = String(row.unit ?? 'CUM').trim();
      const itemSector = String(row.sector ?? firstSector).trim();
      const chapter = String(row.chapter ?? '').trim() || null;
      const shiftHours = num(row.shift_hours) ?? 8;
      const isMixSpecific = boolVal(row.is_mix_specific);

      // shift_output comes from the first Equipment row for this code (all carry the item output)
      const eqRows = equipByCode.get(code) ?? [];
      const shiftOutput = eqRows.length > 0 ? (num(eqRows[0].shift_output) ?? 1) : 1;
      const derivedPerHour = shiftHours > 0 ? shiftOutput / shiftHours : null;

      // Upsert snl_items
      const existing = await db
        .select({ id: snlItems.id })
        .from(snlItems)
        .where(and(eq(snlItems.sourceId, source.id), eq(snlItems.itemCode, code)))
        .limit(1);

      let itemId: number;
      if (existing.length > 0) {
        itemId = existing[0].id;
        await db
          .update(snlItems)
          .set({
            description,
            shortLabel: description.slice(0, 60),
            unit,
            workCategory: itemSector,
            sector: itemSector,
            chapterNo: chapter,
            isMixSpecific,
            isActive: true,
          })
          .where(eq(snlItems.id, itemId));
        result.itemsUpdated++;
      } else {
        const [inserted] = await db
          .insert(snlItems)
          .values({
            sourceId: source.id,
            itemCode: code,
            description,
            shortLabel: description.slice(0, 60),
            unit,
            workCategory: itemSector,
            sector: itemSector,
            chapterNo: chapter,
            isMixSpecific,
            isActive: true,
          })
          .returning({ id: snlItems.id });
        itemId = inserted.id;
        result.itemsInserted++;
      }

      // Delete all child rows for a clean refresh
      await db.delete(snlItemProductivity).where(eq(snlItemProductivity.itemId, itemId));
      await db.delete(snlItemEquipment).where(eq(snlItemEquipment.itemId, itemId));
      await db.delete(snlItemLabour).where(eq(snlItemLabour.itemId, itemId));
      await db.delete(snlItemMaterials).where(eq(snlItemMaterials.itemId, itemId));

      // Productivity (required for auto-duration)
      await db.insert(snlItemProductivity).values({
        itemId,
        projectCategory: 'ALL',
        shiftOutput,
        shiftHours,
        outputUnit: unit,
        derivedPerHour,
      });

      // Equipment rows
      for (let j = 0; j < eqRows.length; j++) {
        const er = eqRows[j];
        const label = String(er.equipment_label ?? '').trim();
        if (!label) continue;
        await db.insert(snlItemEquipment).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          equipmentType: label,
          equipmentSpec: equipmentSpec(label),
          unit: 'hrs',
          quantityPerShift: num(er.qty_per_shift) ?? 1,
          shiftOutputRef: num(er.shift_output) ?? shiftOutput,
          derivedPerUnit: num(er.hrs_per_unit),
        });
        result.equipment++;
      }

      // Labour rows
      const lbRows = labourByCode.get(code) ?? [];
      for (let j = 0; j < lbRows.length; j++) {
        const lr = lbRows[j];
        const designation = String(lr.designation ?? '').trim();
        if (!designation) continue;
        await db.insert(snlItemLabour).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          designation,
          skillTier: skillTier(designation),
          unit: 'day',
          quantityPerShift: num(lr.qty_per_shift) ?? 1,
          shiftOutputRef: num(lr.shift_output) ?? shiftOutput,
          derivedPerUnit: num(lr.days_per_unit),
        });
        result.labour++;
      }

      // Material rows
      const matRows = materialsByCode.get(code) ?? [];
      for (let j = 0; j < matRows.length; j++) {
        const mr = matRows[j];
        const matName = String(mr.material_name ?? '').trim();
        if (!matName) continue;
        const qtyPerUnit = num(mr.qty_per_item_unit);
        const matUnit = String(mr.unit ?? unit).trim();
        const qtyPerShift = qtyPerUnit != null
          ? Math.round(qtyPerUnit * shiftOutput * 10000) / 10000
          : 0;
        await db.insert(snlItemMaterials).values({
          itemId,
          projectCategory: 'ALL',
          sortOrder: j,
          materialName: matName,
          materialCategory: materialCategory(matName),
          unit: matUnit,
          quantityPerShift: qtyPerShift,
          shiftOutputRef: shiftOutput,
          derivedPerUnit: qtyPerUnit,
          isDesignSpecific: boolVal(mr.is_project_specific),
        });
        result.materials++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Items row ${i + 2}: ${msg}`);
    }
  }

  return result;
}

// ─── Template generator ───────────────────────────────────────────────────────

export function buildImportTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  // READ_ME
  const readme = XLSX.utils.aoa_to_sheet([
    ['SDB Import Template'],
    [''],
    ['Fill the 4 sheets below with your SDB data. code links all sheets.'],
    ['sector values: ROAD | STRUCTURE | IRRIGATION | GATES_HOIST | BUILDING | WATER | ELECTRICAL'],
    ['is_mix_specific: TRUE or FALSE'],
    ['is_project_specific: TRUE or FALSE'],
    ['hrs_per_unit / days_per_unit / qty_per_item_unit: per BOQ unit (already computed)'],
  ]);
  XLSX.utils.book_append_sheet(wb, readme, 'READ_ME');

  // Items
  const itemsData = [
    ['code', 'description', 'unit', 'sector', 'chapter', 'shift_hours', 'is_mix_specific', 'notes'],
    ['1.1', 'Loading and Unloading of Stone Aggregate', 'cum', 'ROAD', '1', '8', 'FALSE', 'Sample row'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemsData), 'Items');

  // Equipment
  const equipData = [
    ['code', 'equipment_label', 'count', 'shift_output', 'output_unit', 'qty_per_shift', 'hrs_per_unit', 'ref'],
    ['1.1', 'Tipper 5.5 tonnes capacity', '1', '5.5', 'cum', '0.33', '0.06', 'P&M-048'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(equipData), 'Equipment');

  // Labour
  const labourData = [
    ['code', 'designation', 'count', 'qty_per_shift', 'days_per_unit', 'ref'],
    ['1.1', 'Mate', '1', '0.11', '0.02', 'L-12'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(labourData), 'Labour');

  // Materials
  const materialsData = [
    ['code', 'material_name', 'unit', 'qty_per_item_unit', 'is_project_specific', 'ref'],
    ['1.1', 'Supply of quarried stone 150-200mm', 'cum', '1.1', 'FALSE', 'M-002'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(materialsData), 'Materials');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
