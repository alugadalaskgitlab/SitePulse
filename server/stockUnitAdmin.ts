import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditLogs, parties, plantMaterials, stockBalances, stockLedger } from "../shared/schema";
import { db } from "./db";
import {
  buildStockBalanceRebuildPreview,
  convertStockQuantity,
  convertTransferQuantityBetweenBalances,
  normalizeAllowedWeightUoms,
  normalizeWeightUnit,
  roundStockQuantity,
  stockUnitForMaterial,
  type StockBalanceRebuildPreview,
  type StockLedgerBalanceInput,
  type StockLedgerUnitBlocker,
} from "../shared/stockUnits";

const WEIGHT_ALIASES_SQL = "'T', 'TON', 'TONS', 'TONNE', 'TONNES'";
const UNIT_COLUMNS = [
  ["boq_item_materials", "uom"],
  ["boq_material_mappings", "source_uom"],
  ["internal_requisition_items", "uom"],
  ["material_logs", "uom"],
  ["material_opening_stocks", "uom"],
  ["material_receipts", "uom"],
  ["material_uom_conversions", "from_uom"],
  ["material_uom_conversions", "to_uom"],
  ["pending_plant_receipts", "uom"],
  ["plant_materials", "conversion_to_uom"],
  ["plant_materials", "conversion_from_uom"],
  ["plant_materials", "default_uom"],
  ["purchase_indent_items", "uom"],
  ["site_material_trips", "uom"],
  ["snl_item_equipment", "unit"],
  ["snl_item_materials", "unit"],
  ["snl_item_productivity", "output_unit"],
  ["snl_items", "unit"],
  ["stock_balances", "uom"],
  ["stock_ledger", "uom"],
  ["stock_reconciliation_items", "source_uom"],
  ["stock_reconciliation_items", "base_uom"],
  ["store_grn_items", "uom"],
  ["store_issue_items", "uom"],
  ["store_items", "uom"],
  ["vendor_bill_items", "unit"],
] as const;

type UnitCellChange = {
  table: string;
  column: string;
  id: number;
  original: string;
};
type AllowedUomChange = {
  id: number;
  original: string;
  updated: string;
  aliases: string[];
};

type StockUnitNormalizationPlan = {
  unitCells: UnitCellChange[];
  allowedUoms: AllowedUomChange[];
  balancePreview: StockBalanceRebuildPreview;
  correctionCandidates: StockLedgerUnitBlocker[];
  ledgerCorrections: LedgerUnitCorrection[];
  inputFingerprint: string;
};
type LedgerUnitCorrectionInput = { ledgerRowId: number; uom: string; reason: string };
type LedgerUnitCorrection = {
  ledgerRowId: number;
  originalUom: string | null;
  correctedUom: string;
  reason: string;
};

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readStockPlan(
  executor: any,
  submittedCorrections: LedgerUnitCorrectionInput[] = [],
): Promise<StockUnitNormalizationPlan> {
  const [materials, partiesRows, balances, ledger] = await Promise.all([
    executor.select().from(plantMaterials),
    executor.select().from(parties),
    executor.select().from(stockBalances),
    executor.select().from(stockLedger),
  ]);

  const rebuildInput = {
    materials: materials.map((material: any) => ({
      id: Number(material.id),
      name: String(material.name),
      defaultUom: material.defaultUom ?? null,
      conversionToUom: material.conversionToUom ?? null,
      bulkDensity: material.bulkDensity ?? null,
    })),
    parties: partiesRows.map((party: any) => ({ id: Number(party.id), name: String(party.name) })),
    balances: balances.map((balance: any) => ({
      id: Number(balance.id),
      materialId: Number(balance.materialId),
      partyId: balance.partyId == null ? null : Number(balance.partyId),
      balance: balance.balance,
      uom: balance.uom ?? null,
    })),
    ledger: ledger.map((entry: any) => ({
      id: Number(entry.id),
      materialId: Number(entry.materialId),
      partyId: entry.partyId == null ? null : Number(entry.partyId),
      transactionType: String(entry.transactionType),
      quantityIn: entry.quantityIn,
      quantityOut: entry.quantityOut,
      uom: entry.uom ?? null,
    })),
  };
  const initialBalancePreview = buildStockBalanceRebuildPreview(rebuildInput);
  const blockersById = new Map(initialBalancePreview.blockingLedgerRows.map(row => [row.ledgerRowId, row]));
  const seenCorrectionIds = new Set<number>();
  const ledgerCorrections: LedgerUnitCorrection[] = [];
  for (const submitted of submittedCorrections) {
    const ledgerRowId = Number(submitted.ledgerRowId);
    if (!Number.isInteger(ledgerRowId) || ledgerRowId <= 0 || seenCorrectionIds.has(ledgerRowId)) {
      throw new Error("Each ledger unit correction must identify one unique ledger row.");
    }
    seenCorrectionIds.add(ledgerRowId);
    const blocker = blockersById.get(ledgerRowId);
    if (!blocker) {
      throw new Error(`Ledger row #${ledgerRowId} is no longer blocking the preview. Refresh the preview.`);
    }
    const requestedUom = normalizeWeightUnit(String(submitted.uom ?? "").trim());
    const reason = String(submitted.reason ?? "").trim();
    if (!requestedUom) throw new Error(`Enter a corrected unit for ledger row #${ledgerRowId}.`);
    if (reason.length < 4) throw new Error(`Enter a reason of at least 4 characters for ledger row #${ledgerRowId}.`);
    const correctedUom = requestedUom.toUpperCase() === blocker.targetUom.toUpperCase()
      ? blocker.targetUom
      : requestedUom;
    if (correctedUom.toUpperCase() === normalizeWeightUnit(blocker.originalUom).toUpperCase()) {
      throw new Error(`The corrected unit for ledger row #${ledgerRowId} must differ from its current unit.`);
    }
    ledgerCorrections.push({
      ledgerRowId,
      originalUom: blocker.originalUom,
      correctedUom,
      reason,
    });
  }
  ledgerCorrections.sort((a, b) => a.ledgerRowId - b.ledgerRowId);

  const correctionIds = new Set(ledgerCorrections.map(row => row.ledgerRowId));
  const unitCells: UnitCellChange[] = [];
  for (const [table, column] of UNIT_COLUMNS) {
    const result = await executor.execute(sql.raw(
      `SELECT id, "${column}" AS original FROM "${table}" ` +
      `WHERE upper(trim(COALESCE("${column}", ''))) IN (${WEIGHT_ALIASES_SQL})`,
    ));
    for (const row of result.rows ?? []) {
      const id = Number(row.id);
      // A row corrected to a non-tonne unit is audited as that correction,
      // not also as a tonne-label normalization.
      if (table === "stock_ledger" && correctionIds.has(id)) continue;
      unitCells.push({ table, column, id, original: String(row.original) });
    }
  }

  const allowedResult = await executor.execute(sql`
    SELECT id, allowed_uoms AS original
    FROM plant_materials
    WHERE allowed_uoms IS NOT NULL
  `);
  const allowedUoms: AllowedUomChange[] = [];
  for (const row of allowedResult.rows ?? []) {
    const original = String(row.original);
    const { updated, aliases } = normalizeAllowedWeightUoms(original);
    if (aliases.length) {
      allowedUoms.push({ id: Number(row.id), original, updated, aliases });
    }
  }

  unitCells.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column) || a.id - b.id);
  allowedUoms.sort((a, b) => a.id - b.id);
  const balancePreview = buildStockBalanceRebuildPreview({
    ...rebuildInput,
    ledgerUnitOverrides: Object.fromEntries(ledgerCorrections.map(row => [row.ledgerRowId, row.correctedUom])),
  });
  const inputFingerprint = stableHash({
    materials: [...rebuildInput.materials].sort((a, b) => a.id - b.id),
    parties: [...rebuildInput.parties].sort((a, b) => a.id - b.id),
    balances: [...rebuildInput.balances].sort((a, b) => a.id - b.id),
    ledger: [...rebuildInput.ledger].sort((a, b) => a.id - b.id),
  });
  return {
    unitCells,
    allowedUoms,
    balancePreview,
    correctionCandidates: initialBalancePreview.blockingLedgerRows,
    ledgerCorrections,
    inputFingerprint,
  };
}

function planToken(plan: StockUnitNormalizationPlan): string {
  return stableHash({
    unitCells: plan.unitCells,
    allowedUoms: plan.allowedUoms,
    balanceRows: plan.balancePreview.rows,
    balanceErrors: plan.balancePreview.errors,
    ledgerCorrections: plan.ledgerCorrections,
    inputFingerprint: plan.inputFingerprint,
  });
}

function summarizeUnitChanges(plan: StockUnitNormalizationPlan) {
  const groups = new Map<string, { table: string; originalUnit: string; rows: Set<string> }>();
  for (const change of plan.unitCells) {
    const key = `${change.table}\0${change.original}`;
    const group = groups.get(key) ?? { table: change.table, originalUnit: change.original, rows: new Set<string>() };
    group.rows.add(`${change.column}:${change.id}`);
    groups.set(key, group);
  }
  for (const change of plan.allowedUoms) {
    for (const unit of change.aliases) {
      const key = `plant_materials\0${unit}`;
      const group = groups.get(key) ?? { table: "plant_materials.allowed_uoms", originalUnit: unit, rows: new Set<string>() };
      group.rows.add(`allowed_uoms:${change.id}`);
      groups.set(key, group);
    }
  }
  return Array.from(groups.values())
    .map(group => ({ table: group.table, originalUnit: group.originalUnit, rowCount: group.rows.size, newUnit: "MT" }))
    .sort((a, b) => a.table.localeCompare(b.table) || a.originalUnit.localeCompare(b.originalUnit));
}

export async function previewStockUnitNormalization(corrections: LedgerUnitCorrectionInput[] = []) {
  const plan = await readStockPlan(db, corrections);
  return {
    token: planToken(plan),
    unitChanges: summarizeUnitChanges(plan),
    balanceRows: plan.balancePreview.rows,
    errors: plan.balancePreview.errors,
    correctionCandidates: plan.correctionCandidates,
    ledgerCorrections: plan.ledgerCorrections,
    canApply: plan.balancePreview.canApply,
  };
}

async function writeBalancePlan(executor: any, preview: StockBalanceRebuildPreview) {
  let updated = 0;
  let created = 0;
  for (const row of preview.rows) {
    const values = {
      balance: row.after,
      uom: row.stockUom,
      lastUpdated: new Date(),
    };
    const existingIds = row.existingBalanceIds;
    if (existingIds.length) {
      await executor.update(stockBalances).set(values).where(eq(stockBalances.id, existingIds[0]));
      updated++;
      if (existingIds.length > 1) {
        await executor.delete(stockBalances).where(inArray(stockBalances.id, existingIds.slice(1)));
      }
    } else if (row.hasLedger) {
      await executor.insert(stockBalances).values({
        materialId: row.materialId,
        partyId: row.partyId,
        ...values,
      });
      created++;
    }
  }
  return { updated, created };
}

export async function applyStockUnitNormalization(token: string, corrections: LedgerUnitCorrectionInput[], actor: {
  userId: number | null;
  userName: string;
  userRole: string;
}) {
  return db.transaction(async tx => {
    await tx.execute(sql`LOCK TABLE stock_ledger IN SHARE MODE`);
    await tx.execute(sql`LOCK TABLE stock_balances IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await readStockPlan(tx, corrections);
    if (planToken(plan) !== token) {
      throw new Error("The data changed after preview. Refresh the preview before applying.");
    }
    if (!plan.balancePreview.canApply) {
      throw new Error("Some ledger quantities cannot be converted safely. Resolve the listed unit or density issues before applying.");
    }

    for (const correction of plan.ledgerCorrections) {
      const updatedRows = await tx.update(stockLedger)
        .set({ uom: correction.correctedUom })
        .where(and(
          eq(stockLedger.id, correction.ledgerRowId),
          correction.originalUom == null
            ? isNull(stockLedger.uom)
            : eq(stockLedger.uom, correction.originalUom),
        ))
        .returning({ id: stockLedger.id });
      if (updatedRows.length !== 1) {
        throw new Error(`Ledger row #${correction.ledgerRowId} changed after preview. Refresh before applying.`);
      }
      await tx.insert(auditLogs).values({
        module: "stock_unit_normalization",
        transactionId: correction.ledgerRowId,
        action: "edit",
        userId: actor.userId,
        userName: actor.userName,
        userRole: actor.userRole,
        oldValues: { table: "stock_ledger", column: "uom", unit: correction.originalUom },
        newValues: { table: "stock_ledger", column: "uom", unit: correction.correctedUom },
        reason: `Unit corrected ${correction.originalUom ?? "missing"} → ${correction.correctedUom}, row #${correction.ledgerRowId}: ${correction.reason}`,
      });
    }

    for (const change of plan.unitCells) {
      await tx.execute(sql.raw(
        `UPDATE "${change.table}" SET "${change.column}" = 'MT' WHERE id = ${Number(change.id)} ` +
        `AND "${change.column}" = ${"'" + change.original.replace(/'/g, "''") + "'"}`,
      ));
      await tx.insert(auditLogs).values({
        module: "stock_unit_normalization",
        transactionId: change.id,
        action: "edit",
        userId: actor.userId,
        userName: actor.userName,
        userRole: actor.userRole,
        oldValues: { table: change.table, column: change.column, unit: change.original },
        newValues: { table: change.table, column: change.column, unit: "MT" },
        reason: `Unit label ${change.original} → MT (STOCK-02)`,
      });
    }
    for (const change of plan.allowedUoms) {
      await tx.update(plantMaterials).set({ allowedUoms: change.updated }).where(eq(plantMaterials.id, change.id));
      for (const alias of change.aliases) {
        await tx.insert(auditLogs).values({
          module: "stock_unit_normalization",
          transactionId: change.id,
          action: "edit",
          userId: actor.userId,
          userName: actor.userName,
          userRole: actor.userRole,
          oldValues: { table: "plant_materials", column: "allowed_uoms", value: change.original },
          newValues: { table: "plant_materials", column: "allowed_uoms", value: change.updated },
          reason: `Unit label ${alias} → MT (STOCK-02)`,
        });
      }
    }
    const balances = await writeBalancePlan(tx, plan.balancePreview);
    for (const row of plan.balancePreview.rows) {
      const transactionId = row.existingBalanceIds[0] ?? row.materialId;
      await tx.insert(auditLogs).values({
        module: "stock_balance_rebuild",
        transactionId,
        action: "edit",
        userId: actor.userId,
        userName: actor.userName,
        userRole: actor.userRole,
        oldValues: { materialId: row.materialId, partyId: row.partyId, quantity: row.before, uom: row.stockUom },
        newValues: { materialId: row.materialId, partyId: row.partyId, quantity: row.after, uom: row.stockUom },
        reason: "STOCK-02: balance rebuilt from unit-converted stock ledger",
      });
    }

    return {
      relabelledRows: plan.unitCells.length + plan.allowedUoms.length,
      correctedLedgerRows: plan.ledgerCorrections.length,
      balanceRowsUpdated: balances.updated,
      balanceRowsCreated: balances.created,
      balanceRows: plan.balancePreview.rows.length,
    };
  });
}

type TransferPair = {
  out: any;
  incoming: any;
  material: any;
  fromParty: any;
  toParty: any;
};

function getTransferPairId(entry: any) {
  return Number(entry.referenceId) > 0 ? Number(entry.referenceId) : null;
}

async function listTransferPairs(executor: any): Promise<TransferPair[]> {
  const [all, materials, partiesRows] = await Promise.all([
    executor.select().from(stockLedger).where(eq(stockLedger.transactionType, "transfer")),
    executor.select().from(plantMaterials),
    executor.select().from(parties),
  ]);
  const materialById = new Map<number, any>(materials.map((row: any): [number, any] => [Number(row.id), row]));
  const partyById = new Map<number, any>(partiesRows.map((row: any): [number, any] => [Number(row.id), row]));
  const used = new Set<number>();
  const pairs: TransferPair[] = [];
  const byRef = new Map<number, any[]>();
  for (const entry of all) {
    const ref = getTransferPairId(entry);
    if (ref == null) continue;
    const list = byRef.get(ref) ?? [];
    list.push(entry);
    byRef.set(ref, list);
  }
  for (const entries of Array.from(byRef.values())) {
    const outs = entries.filter((entry: any) => numberOrZero(entry.quantityOut) > 0 && numberOrZero(entry.quantityIn) === 0);
    const ins = entries.filter((entry: any) => numberOrZero(entry.quantityIn) > 0 && numberOrZero(entry.quantityOut) === 0);
    if (entries.length !== 2 || outs.length !== 1 || ins.length !== 1) continue;
    const out = outs[0];
    const incoming = ins[0];
    if (out.materialId !== incoming.materialId || out.partyId === incoming.partyId) continue;
    const material = materialById.get(Number(out.materialId));
    const fromPartyId = out.partyId == null ? null : Number(out.partyId);
    const toPartyId = incoming.partyId == null ? null : Number(incoming.partyId);
    const fromParty = fromPartyId === null ? { id: null, name: "Plant common" } : partyById.get(fromPartyId);
    const toParty = toPartyId === null ? { id: null, name: "Plant common" } : partyById.get(toPartyId);
    if (!material || !fromParty || !toParty) continue;
    pairs.push({ out, incoming, material, fromParty, toParty });
    used.add(Number(out.id));
    used.add(Number(incoming.id));
  }

  // Legacy transfer rows have no reference id. Pair only when reciprocal party
  // names, material, date, quantity and unit identify exactly one counterpart.
  const legacyOut = all.filter((entry: any) =>
    entry.referenceId == null && !used.has(Number(entry.id)) &&
    numberOrZero(entry.quantityOut) > 0 && numberOrZero(entry.quantityIn) === 0,
  );
  const legacyIn = all.filter((entry: any) =>
    entry.referenceId == null && !used.has(Number(entry.id)) &&
    numberOrZero(entry.quantityIn) > 0 && numberOrZero(entry.quantityOut) === 0,
  );
  const candidates = legacyOut.map((out: any) => {
    const fromParty = out.partyId == null ? { id: null, name: "Plant common" } : partyById.get(Number(out.partyId));
    const possible = legacyIn.filter((incoming: any) => {
      if (incoming.materialId !== out.materialId || incoming.date !== out.date || incoming.partyId === out.partyId) return false;
      const toParty = incoming.partyId == null ? { id: null, name: "Plant common" } : partyById.get(Number(incoming.partyId));
      const material = materialById.get(Number(out.materialId));
      if (!fromParty || !toParty || !material ||
          !String(out.notes ?? "").includes(`Transfer → ${toParty.name}`) ||
          !String(incoming.notes ?? "").includes(`Transfer from ${fromParty.name}`)) return false;
      try {
        const density = Number(material.bulkDensity) || null;
        const outQty = convertStockQuantity(numberOrZero(out.quantityOut), out.uom, "MT", density);
        const inQty = convertStockQuantity(numberOrZero(incoming.quantityIn), incoming.uom, "MT", density);
        return Math.abs(outQty - inQty) < 0.000001;
      } catch {
        return false;
      }
    });
    return { out, possible };
  });
  for (const candidate of candidates) {
    if (candidate.possible.length !== 1) continue;
    const incoming = candidate.possible[0];
    const reverseCount = candidates.filter((other: any) => other.possible.length === 1 && other.possible[0].id === incoming.id).length;
    if (reverseCount !== 1 || used.has(Number(candidate.out.id)) || used.has(Number(incoming.id))) continue;
    const material = materialById.get(Number(candidate.out.materialId));
    const fromParty = candidate.out.partyId == null ? { id: null, name: "Plant common" } : partyById.get(Number(candidate.out.partyId));
    const toParty = incoming.partyId == null ? { id: null, name: "Plant common" } : partyById.get(Number(incoming.partyId));
    if (!material || !fromParty || !toParty) continue;
    pairs.push({ out: candidate.out, incoming, material, fromParty, toParty });
    used.add(Number(candidate.out.id));
    used.add(Number(incoming.id));
  }
  return pairs.sort((a, b) => String(b.out.date).localeCompare(String(a.out.date)) || Number(b.out.id) - Number(a.out.id));
}

export async function getCorrectableStockTransfers() {
  const pairs = await listTransferPairs(db);
  const correctedRows = await db.select({ transactionId: auditLogs.transactionId }).from(auditLogs)
    .where(eq(auditLogs.module, "stock_transfer_correction"));
  const correctedIds = new Set(correctedRows.map((row: any) => Number(row.transactionId)));
  return pairs.filter(({ out }) => !correctedIds.has(Number(out.id))).map(({ out, incoming, material, fromParty, toParty }) => ({
    outId: Number(out.id),
    inId: Number(incoming.id),
    materialId: Number(material.id),
    materialName: String(material.name),
    date: String(out.date),
    fromPartyId: fromParty.id == null ? null : Number(fromParty.id),
    fromPartyName: String(fromParty.name),
    toPartyId: toParty.id == null ? null : Number(toParty.id),
    toPartyName: String(toParty.name),
    quantity: numberOrZero(out.quantityOut),
    uom: String(out.uom ?? ""),
    receivedQuantity: numberOrZero(incoming.quantityIn),
    receivedUom: String(incoming.uom ?? ""),
    notes: String(out.notes ?? ""),
    linkedByReference: getTransferPairId(out) != null,
  }));
}

export async function getStockTransferCorrectionHistory() {
  return db.select().from(auditLogs)
    .where(eq(auditLogs.module, "stock_transfer_correction"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
}

export async function correctStockTransfer(input: {
  outId: number;
  inId: number;
  quantity: number;
  uom: string;
  fromPartyId?: number | null;
  toPartyId?: number | null;
  reason: string;
  actor: { userId: number | null; userName: string; userRole: string };
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Enter a transfer quantity greater than zero.");
  const reason = input.reason.trim();
  if (reason.length < 4) throw new Error("Enter a reason of at least 4 characters.");

  return db.transaction(async tx => {
    const locked = await tx.execute(sql`
      SELECT * FROM stock_ledger
      WHERE id IN (${input.outId}, ${input.inId})
      FOR UPDATE
    `);
    const entries = locked.rows ?? [];
    const out = entries.find((row: any) => Number(row.id) === input.outId) as any;
    const incoming = entries.find((row: any) => Number(row.id) === input.inId) as any;
    if (!out || !incoming || out.transaction_type !== "transfer" || incoming.transaction_type !== "transfer" ||
        Number(out.material_id) !== Number(incoming.material_id) ||
        Number(out.party_id) === Number(incoming.party_id) ||
        numberOrZero(out.quantity_out) <= 0 || numberOrZero(out.quantity_in) !== 0 ||
        numberOrZero(incoming.quantity_in) <= 0 || numberOrZero(incoming.quantity_out) !== 0) {
      throw new Error("Those rows are not a valid outgoing/incoming transfer pair.");
    }
    const oldFromPartyId = out.party_id == null ? null : Number(out.party_id);
    const oldToPartyId = incoming.party_id == null ? null : Number(incoming.party_id);
    if (out.reference_id != null && Number(out.reference_id) !== input.outId) {
      throw new Error("The selected transfer pair has changed. Refresh the list.");
    }
    const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, Number(out.material_id)));
    if (!material) throw new Error("The transfer material no longer exists.");
    const fromPartyId = input.fromPartyId === undefined ? oldFromPartyId : input.fromPartyId;
    const toPartyId = input.toPartyId === undefined ? oldToPartyId : input.toPartyId;
    if (fromPartyId === toPartyId) throw new Error("Choose different source and destination parties.");
    const [fromParty] = fromPartyId === null
      ? []
      : await tx.select().from(parties).where(eq(parties.id, fromPartyId));
    const [toParty] = toPartyId === null
      ? []
      : await tx.select().from(parties).where(eq(parties.id, toPartyId));
    const [oldFromParty] = oldFromPartyId === null
      ? []
      : await tx.select().from(parties).where(eq(parties.id, oldFromPartyId));
    const [oldToParty] = oldToPartyId === null
      ? []
      : await tx.select().from(parties).where(eq(parties.id, oldToPartyId));
    if ((fromPartyId !== null && !fromParty) || (toPartyId !== null && !toParty)) {
      throw new Error("The selected source or destination party no longer exists.");
    }
    const alreadyCorrected = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(
      eq(auditLogs.module, "stock_transfer_correction"),
      eq(auditLogs.transactionId, input.outId),
    )).limit(1);
    if (alreadyCorrected.length) throw new Error("This transfer already has a correction. Review its history before making another change.");
    const density = Number(material.bulkDensity) || null;
    const balanceRows = await tx.select().from(stockBalances).where(eq(stockBalances.materialId, Number(out.material_id)));
    const fromBalance = balanceRows.find(row => row.partyId === fromPartyId);
    const toBalance = balanceRows.find(row => row.partyId === toPartyId);
    const fromUom = normalizeWeightUnit(fromBalance?.uom || stockUnitForMaterial(material, out.uom));
    const toUom = normalizeWeightUnit(toBalance?.uom || stockUnitForMaterial(material, incoming.uom));
    const converted = convertTransferQuantityBetweenBalances(input.quantity, input.uom, fromUom, toUom, density);

    const stamp = new Date().toISOString();
    const linkId = input.outId;
    await tx.insert(stockLedger).values([
      {
        date: String(out.date).slice(0, 10),
        partyId: oldFromPartyId,
        materialId: Number(out.material_id),
        transactionType: "transfer_correction",
        referenceId: linkId,
        quantityIn: String(out.quantity_out),
        quantityOut: "0",
        uom: String(out.uom ?? fromUom),
        notes: `STOCK-02 correction reversal for transfer #${linkId} [${stamp}] — ${reason}`,
      },
      {
        date: String(incoming.date).slice(0, 10),
        partyId: oldToPartyId,
        materialId: Number(incoming.material_id),
        transactionType: "transfer_correction",
        referenceId: linkId,
        quantityIn: "0",
        quantityOut: String(incoming.quantity_in),
        uom: String(incoming.uom ?? toUom),
        notes: `STOCK-02 correction reversal for transfer #${linkId} [${stamp}] — ${reason}`,
      },
      {
        date: String(out.date).slice(0, 10),
        partyId: fromPartyId,
        materialId: Number(out.material_id),
        transactionType: "transfer_correction",
        referenceId: linkId,
        quantityIn: "0",
        quantityOut: String(converted.fromQuantity),
        uom: converted.fromUom,
        notes: `STOCK-02 corrected transfer #${linkId} → ${toParty?.name ?? "Plant common"} [${stamp}] — ${reason}`,
      },
      {
        date: String(incoming.date).slice(0, 10),
        partyId: toPartyId,
        materialId: Number(incoming.material_id),
        transactionType: "transfer_correction",
        referenceId: linkId,
        quantityIn: String(converted.toQuantity),
        quantityOut: "0",
        uom: converted.toUom,
        notes: `STOCK-02 corrected transfer #${linkId} from ${fromParty?.name ?? "Plant common"} [${stamp}] — ${reason}`,
      },
    ]);

    const [materials, partiesRows, balances, ledger] = await Promise.all([
      tx.select().from(plantMaterials),
      tx.select().from(parties),
      tx.select().from(stockBalances),
      tx.select().from(stockLedger),
    ]);
    const balancePreview = buildStockBalanceRebuildPreview({
      materials: materials.map((row: any) => ({
        id: Number(row.id),
        name: String(row.name),
        defaultUom: row.defaultUom ?? null,
        conversionToUom: row.conversionToUom ?? null,
        bulkDensity: row.bulkDensity ?? null,
      })),
      parties: partiesRows.map((row: any) => ({ id: Number(row.id), name: String(row.name) })),
      balances: balances.map((row: any) => ({
        id: Number(row.id),
        materialId: Number(row.materialId),
        partyId: row.partyId == null ? null : Number(row.partyId),
        balance: row.balance,
        uom: row.uom ?? null,
      })),
      ledger: ledger.map((row: any) => ({
        id: Number(row.id),
        materialId: Number(row.materialId),
        partyId: row.partyId == null ? null : Number(row.partyId),
        transactionType: String(row.transactionType),
        quantityIn: row.quantityIn,
        quantityOut: row.quantityOut,
        uom: row.uom ?? null,
      })),
    });
    if (balancePreview.errors.length) throw new Error(`Transfer correction cannot rebuild stock: ${balancePreview.errors.join("; ")}`);
    const affectedPartyIds = new Set<number | null>([
      oldFromPartyId,
      oldToPartyId,
      fromPartyId,
      toPartyId,
    ]);
    const affectedBalanceRows = balancePreview.rows.filter(row =>
      row.materialId === Number(out.material_id) && affectedPartyIds.has(row.partyId),
    );
    if (affectedBalanceRows.length !== affectedPartyIds.size) throw new Error("The corrected transfer balance groups could not be rebuilt.");
    const sourceBalanceRow = affectedBalanceRows.find(row => row.partyId === fromPartyId);
    const destinationBalanceRow = affectedBalanceRows.find(row => row.partyId === toPartyId);
    if (!sourceBalanceRow || !destinationBalanceRow) throw new Error("The corrected source and destination balances could not be rebuilt.");
    if (/^(diesel|hsd)$/i.test(String(material.name).trim()) &&
        affectedBalanceRows.some(row => row.after < 0)) {
      throw new Error("This correction would make Diesel/HSD stock negative.");
    }

    for (const balanceRow of affectedBalanceRows) {
      const condition = balanceRow.partyId === null
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, balanceRow.materialId))
        : and(eq(stockBalances.partyId, balanceRow.partyId), eq(stockBalances.materialId, balanceRow.materialId));
      const existingRows = await tx.select().from(stockBalances).where(condition);
      if (existingRows.length) {
        await tx.update(stockBalances).set({
          balance: String(balanceRow.after),
          uom: balanceRow.stockUom,
          lastUpdated: new Date(),
        }).where(eq(stockBalances.id, existingRows[0].id));
        if (existingRows.length > 1) {
          await tx.delete(stockBalances).where(inArray(stockBalances.id, existingRows.slice(1).map((row: any) => row.id)));
        }
      } else {
        await tx.insert(stockBalances).values({
          materialId: balanceRow.materialId,
          partyId: balanceRow.partyId,
          balance: String(balanceRow.after),
          uom: balanceRow.stockUom,
        });
      }
    }

    await tx.insert(auditLogs).values({
      module: "stock_transfer_correction",
      transactionId: linkId,
      action: "edit",
      userId: input.actor.userId,
      userName: input.actor.userName,
      userRole: input.actor.userRole,
      oldValues: {
        outId: input.outId,
        inId: input.inId,
        sentQuantity: numberOrZero(out.quantity_out),
        sentUom: out.uom,
        receivedQuantity: numberOrZero(incoming.quantity_in),
        receivedUom: incoming.uom,
        fromPartyId: oldFromPartyId,
        fromPartyName: oldFromParty?.name ?? "Plant common",
        toPartyId: oldToPartyId,
        toPartyName: oldToParty?.name ?? "Plant common",
      },
      newValues: {
        quantity: input.quantity,
        enteredUom: normalizeWeightUnit(input.uom),
        fromQuantity: converted.fromQuantity,
        fromUom: converted.fromUom,
        toQuantity: converted.toQuantity,
        toUom: converted.toUom,
        fromPartyId,
        fromPartyName: fromParty?.name ?? "Plant common",
        toPartyId,
        toPartyName: toParty?.name ?? "Plant common",
      },
      reason,
      stockImpact: `Append-only transfer correction; old transfer retained; corrected source ${converted.fromQuantity} ${converted.fromUom}, destination ${converted.toQuantity} ${converted.toUom}.`,
    });

    return {
      transferId: linkId,
      fromQuantity: converted.fromQuantity,
      fromUom: converted.fromUom,
      toQuantity: converted.toQuantity,
      toUom: converted.toUom,
      fromPartyId,
      fromPartyName: fromParty?.name ?? "Plant common",
      toPartyId,
      toPartyName: toParty?.name ?? "Plant common",
      sourceAfter: sourceBalanceRow.after,
      destinationAfter: destinationBalanceRow.after,
    };
  });
}

export function canonicalMaterialStockUom(material: {
  defaultUom?: string | null;
  conversionToUom?: string | null;
}, fallback?: string | null) {
  return stockUnitForMaterial(material, fallback);
}
