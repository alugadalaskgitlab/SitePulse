import { convertSolidQty, normalizeUom } from "./uomConvert";

const WEIGHT_UNIT_ALIASES = new Set(["T", "TON", "TONS", "TONNE", "TONNES"]);
const KILOGRAM_UNITS = new Set(["KG", "KGS", "KGM", "KILOGRAM", "KILOGRAMS"]);

export function normalizeWeightUnit(unit: string | null | undefined): string {
  const trimmed = String(unit ?? "").trim();
  const upper = trimmed.toUpperCase();
  if (WEIGHT_UNIT_ALIASES.has(upper)) return "MT";
  return trimmed;
}

export function normalizeAllowedWeightUoms(value: string): { updated: string; aliases: string[] } {
  let values: string[];
  let json = false;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return { updated: value, aliases: [] };
    values = parsed.map(item => String(item));
    json = true;
  } catch {
    values = value.split(",").map(item => item.trim()).filter(Boolean);
  }

  const aliases: string[] = [];
  const normalized: string[] = [];
  const seenTonneAlias = new Set<string>();
  for (const item of values) {
    const next = normalizeWeightUnit(item);
    if (next !== item) aliases.push(item);
    const upper = item.trim().toUpperCase();
    const isTonneAlias = WEIGHT_UNIT_ALIASES.has(upper) || upper === "MT";
    if (isTonneAlias && seenTonneAlias.has("MT")) continue;
    if (isTonneAlias) seenTonneAlias.add("MT");
    normalized.push(next);
  }
  return {
    updated: aliases.length ? (json ? JSON.stringify(normalized) : normalized.join(", ")) : value,
    aliases,
  };
}

function isKilogramUnit(unit: string): boolean {
  return KILOGRAM_UNITS.has(unit.trim().toUpperCase());
}

export function stockUnitForMaterial(
  material: { defaultUom?: string | null; conversionToUom?: string | null } | null | undefined,
  fallbackUom?: string | null,
): string {
  return normalizeWeightUnit(
    material?.conversionToUom?.trim() ||
    material?.defaultUom?.trim() ||
    fallbackUom?.trim() ||
    "",
  );
}

export function convertStockQuantity(
  quantity: number,
  fromUom: string | null | undefined,
  toUom: string | null | undefined,
  bulkDensity?: number | null,
): number {
  if (!Number.isFinite(quantity)) throw new Error("Stock quantity must be finite.");
  const from = normalizeWeightUnit(fromUom);
  const to = normalizeWeightUnit(toUom);
  if (!from || !to) throw new Error(`Cannot convert stock quantity without both units (${from || "missing"} → ${to || "missing"}).`);
  const fromLabel = from.trim().toUpperCase();
  const toLabel = to.trim().toUpperCase();
  if (fromLabel === toLabel || (isKilogramUnit(from) && isKilogramUnit(to))) return quantity;

  const fromKind = normalizeUom(from);
  const toKind = normalizeUom(to);
  if (fromKind === "MT" && isKilogramUnit(to)) return quantity * 1000;
  if (isKilogramUnit(from) && toKind === "MT") return quantity / 1000;
  if (fromKind === "OTHER" && toKind === "OTHER") {
    throw new Error(`Cannot convert ${from} to ${to}.`);
  }

  const converted = convertSolidQty(quantity, from, to, bulkDensity);
  if (converted == null || !Number.isFinite(converted)) {
    throw new Error(`Cannot convert ${from} to ${to}${bulkDensity && bulkDensity > 0 ? "" : " without a configured material density"}.`);
  }
  return converted;
}

export function roundStockQuantity(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Math.abs(rounded) < 0.000001 ? 0 : rounded;
}

export interface StockLedgerBalanceInput {
  id: number;
  materialId: number;
  partyId: number | null;
  transactionType: string;
  quantityIn: number | string | null;
  quantityOut: number | string | null;
  uom: string | null;
}

export interface StockBalanceInput {
  id: number;
  materialId: number;
  partyId: number | null;
  balance: number | string;
  uom: string | null;
}

export interface StockMaterialInput {
  id: number;
  name: string;
  defaultUom: string | null;
  conversionToUom: string | null;
  bulkDensity: number | string | null;
}

export interface StockBalanceRebuildRow {
  materialId: number;
  materialName: string;
  partyId: number | null;
  partyName: string;
  stockUom: string;
  before: number;
  after: number;
  existingBalanceIds: number[];
  hasLedger: boolean;
}

export interface StockBalanceRebuildPreview {
  rows: StockBalanceRebuildRow[];
  errors: string[];
  blockingLedgerRows: StockLedgerUnitBlocker[];
  canApply: boolean;
}

export interface StockLedgerUnitBlocker {
  ledgerRowId: number;
  materialId: number;
  materialName: string;
  partyId: number | null;
  partyName: string;
  transactionType: string;
  originalUom: string | null;
  targetUom: string;
  message: string;
}

export function buildStockBalanceRebuildPreview(input: {
  materials: StockMaterialInput[];
  parties: Array<{ id: number; name: string }>;
  balances: StockBalanceInput[];
  ledger: StockLedgerBalanceInput[];
  ledgerUnitOverrides?: Record<number, string>;
}): StockBalanceRebuildPreview {
  const materials = new Map(input.materials.map(material => [material.id, material]));
  const parties = new Map(input.parties.map(party => [party.id, party.name]));
  const rows = new Map<string, StockBalanceRebuildRow>();
  const errors = new Set<string>();
  const blockingLedgerRows: StockLedgerUnitBlocker[] = [];
  const keyOf = (materialId: number, partyId: number | null) => `${materialId}:${partyId ?? "null"}`;

  const ensureRow = (materialId: number, partyId: number | null, fallbackUom?: string | null) => {
    const key = keyOf(materialId, partyId);
    let row = rows.get(key);
    if (row) return row;
    const material = materials.get(materialId);
    if (!material) {
      errors.add(`Material #${materialId} is missing from the material master.`);
      return null;
    }
    const stockUom = stockUnitForMaterial(material, fallbackUom);
    if (!stockUom) {
      errors.add(`${material.name}: stock unit is not configured.`);
      return null;
    }
    row = {
      materialId,
      materialName: material.name,
      partyId,
      partyName: partyId == null ? "Plant common" : parties.get(partyId) ?? `Party #${partyId}`,
      stockUom,
      before: 0,
      after: 0,
      existingBalanceIds: [],
      hasLedger: false,
    };
    rows.set(key, row);
    return row;
  };

  for (const balance of input.balances) {
    const material = materials.get(balance.materialId);
    const row = ensureRow(balance.materialId, balance.partyId, balance.uom);
    if (!row || !material) continue;
    row.existingBalanceIds.push(balance.id);
    try {
      row.before += convertStockQuantity(Number(balance.balance), balance.uom, row.stockUom, Number(material.bulkDensity) || null);
    } catch (error) {
      errors.add(`${row.materialName} / ${row.partyName}, balance #${balance.id}: ${(error as Error).message}`);
    }
  }

  for (const entry of input.ledger) {
    if (entry.transactionType === "equipment_issue") continue;
    const material = materials.get(entry.materialId);
    const row = ensureRow(entry.materialId, entry.partyId, entry.uom);
    if (!row || !material) continue;
    row.hasLedger = true;
    const quantityIn = Number(entry.quantityIn ?? 0);
    const quantityOut = Number(entry.quantityOut ?? 0);
    const effectiveUom = input.ledgerUnitOverrides?.[entry.id] ?? entry.uom;
    try {
      const stockIn = convertStockQuantity(quantityIn, effectiveUom, row.stockUom, Number(material.bulkDensity) || null);
      const stockOut = convertStockQuantity(quantityOut, effectiveUom, row.stockUom, Number(material.bulkDensity) || null);
      row.after += stockIn - stockOut;
    } catch (error) {
      const message = (error as Error).message;
      errors.add(`${row.materialName} / ${row.partyName}, ledger row #${entry.id}: ${message}`);
      blockingLedgerRows.push({
        ledgerRowId: entry.id,
        materialId: entry.materialId,
        materialName: row.materialName,
        partyId: entry.partyId,
        partyName: row.partyName,
        transactionType: entry.transactionType,
        originalUom: entry.uom == null ? null : String(entry.uom),
        targetUom: row.stockUom,
        message,
      });
    }
  }

  const normalizedRows = Array.from(rows.values())
    .map(row => ({
      ...row,
      before: roundStockQuantity(row.before),
      after: roundStockQuantity(row.after),
      existingBalanceIds: [...row.existingBalanceIds].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName) || a.materialName.localeCompare(b.materialName));

  return {
    rows: normalizedRows,
    errors: Array.from(errors).sort(),
    blockingLedgerRows: blockingLedgerRows.sort((a, b) => a.ledgerRowId - b.ledgerRowId),
    canApply: errors.size === 0,
  };
}

export function convertTransferQuantityBetweenBalances(
  quantity: number,
  enteredUom: string,
  fromBalanceUom: string,
  toBalanceUom: string,
  bulkDensity?: number | null,
): { fromQuantity: number; toQuantity: number; fromUom: string; toUom: string } {
  return {
    fromQuantity: roundStockQuantity(convertStockQuantity(quantity, enteredUom, fromBalanceUom, bulkDensity)),
    toQuantity: roundStockQuantity(convertStockQuantity(quantity, enteredUom, toBalanceUom, bulkDensity)),
    fromUom: normalizeWeightUnit(fromBalanceUom),
    toUom: normalizeWeightUnit(toBalanceUom),
  };
}
