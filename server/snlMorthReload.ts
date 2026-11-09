import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  boqItems,
  boqProjects,
  snlBoqMappings,
  snlCompositeComponents,
  snlItemEquipment,
  snlItemLabour,
  snlItemMaterials,
  snlItemProductivity,
  snlItems,
  snlSources,
} from "@shared/schema";
import { MORTH_SDB_DISPLAY_NAME, MORTH_SDB_SOURCE_CODE } from "@shared/normBook";
import { db } from "./db";
import { mergeMorthSnlNotes, parseMorthSdbWorkbook, type ParsedMorthItem } from "./snlMorthParser";

type NormRows = {
  productivity: Array<{ projectCategory: string; shiftOutput: number; shiftHours: number; outputUnit: string; derivedPerHour: number | null }>;
  equipment: Array<{ projectCategory: string; sortOrder: number; equipmentType: string; unit: string; quantityPerShift: number | null; shiftOutputRef: number; derivedPerUnit: number | null; notes: string | null }>;
  labour: Array<{ projectCategory: string; sortOrder: number; designation: string; skillTier: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
  materials: Array<{ projectCategory: string; sortOrder: number; materialName: string; materialCategory: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
};

export type MorthReloadChange = {
  code: string;
  status: "added" | "changed" | "unchanged";
  validationStatus: "passing" | "copied" | "rate_only" | "needs_check";
  copyReference?: string;
  costNote?: string;
  validationReasons: string[];
  old: null | { description: string; unit: string; specClause: string | null; notes: string | null; norms: NormRows };
  new: { description: string; unit: string; specClause: string | null; notes: string | null; norms: NormRows };
  reasons: string[];
};

export type MorthReloadValidationItem = {
  code: string;
  title: string;
  unit: string;
  shiftOutput: number;
  reasons: string[];
};

// These workbook items are intentionally priced by market/current rates or
// by references to other chapters and do not define machine/labour/material rows.
const RATE_ONLY_CODES = new Set(["3.26", "5.20", "8.33-ii", "8.38", "8.42", "11.12", "11.13", "12.2", "12.37", "14.12"]);

export function validateParsedMorthItem(item: ParsedMorthItem): {
  status: MorthReloadChange["validationStatus"];
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!item.unit.trim()) reasons.push("Unit is missing.");
  if (!Number.isFinite(item.shiftOutput) || item.shiftOutput <= 0) reasons.push("Taking output must be above 0.");
  if (item.copyError) reasons.push(item.copyError);

  const hasResources = item.equipment.length + item.labour.length + item.materials.length > 0;
  if (hasResources && !reasons.length) {
    return { status: item.copyReference ? "copied" : "passing", reasons: [] };
  }
  if (!hasResources && RATE_ONLY_CODES.has(item.code) && !reasons.length) {
    return { status: "rate_only", reasons: ["Workbook entry is intentionally rate-only and has no resource rows."] };
  }
  if (!hasResources) reasons.push("No machine, labour, or material rows were parsed.");
  return { status: "needs_check", reasons };
}

export function getMorthReloadApplicableCodes(
  changes: Array<Pick<MorthReloadChange, "code" | "status" | "validationStatus">>,
): string[] {
  return changes
    .filter(row => row.status !== "unchanged" && row.validationStatus !== "needs_check")
    .map(row => row.code);
}

const materialCategory = (name: string) =>
  /aggregate|gsb|wmm/i.test(name) ? "AGGREGATE" :
  /cement/i.test(name) ? "CEMENT" :
  /bitumen|emulsion/i.test(name) ? "BITUMEN" : "OTHER";

const skillTier = (name: string) =>
  /mason|operator|fitter|blacksmith|carpenter|sinker|skilled/i.test(name) ? "SKILLED" : "UNSKILLED";
const storedPrecision = (value: number) => Number(value.toFixed(8));

function parsedNorms(item: ParsedMorthItem): NormRows {
  const shiftOutput = item.shiftOutput > 0 ? item.shiftOutput : 1;
  return {
    productivity: [{
      projectCategory: "ALL",
      shiftOutput,
      shiftHours: 8,
      outputUnit: item.unit || "CUM",
      derivedPerHour: storedPrecision(shiftOutput / 8),
    }],
    equipment: item.equipment.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, equipmentType: row.label, unit: row.unit,
      quantityPerShift: row.qty, shiftOutputRef: shiftOutput, derivedPerUnit: storedPrecision(row.qty / shiftOutput),
      notes: row.notes ?? null,
    })),
    labour: item.labour.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, designation: row.label, skillTier: skillTier(row.label), unit: "day",
      quantityPerShift: row.qty, shiftOutputRef: shiftOutput, derivedPerUnit: storedPrecision(row.qty / shiftOutput),
    })),
    materials: item.materials.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, materialName: row.label, materialCategory: materialCategory(row.label),
      unit: row.unit || item.unit || "CUM", quantityPerShift: row.qty, shiftOutputRef: shiftOutput,
      derivedPerUnit: storedPrecision(row.qty / shiftOutput),
    })),
  };
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, part) => {
  if (Array.isArray(part)) return part;
  if (part && typeof part === "object") return Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b)));
  return part;
});

function normalizeStoredRealValues(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.fround(value) : value;
  if (Array.isArray(value)) return value.map(normalizeStoredRealValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalizeStoredRealValues(nested)]),
    );
  }
  return value;
}

export function morthNormRowsEqualAtDatabasePrecision(oldNorms: unknown, newNorms: unknown): boolean {
  return JSON.stringify(normalizeStoredRealValues(oldNorms)) === JSON.stringify(normalizeStoredRealValues(newNorms));
}

function compareNorms(oldNorms: NormRows, newNorms: NormRows): boolean {
  return morthNormRowsEqualAtDatabasePrecision(oldNorms, newNorms);
}

async function loadCurrentRows(sourceId: number) {
  const items = await db.select().from(snlItems).where(eq(snlItems.sourceId, sourceId));
  if (!items.length) return new Map<string, any>();
  const ids = items.map(row => row.id);
  const [productivity, equipment, labour, materials] = await Promise.all([
    db.select().from(snlItemProductivity).where(inArray(snlItemProductivity.itemId, ids)),
    db.select().from(snlItemEquipment).where(inArray(snlItemEquipment.itemId, ids)),
    db.select().from(snlItemLabour).where(inArray(snlItemLabour.itemId, ids)),
    db.select().from(snlItemMaterials).where(inArray(snlItemMaterials.itemId, ids)),
  ]);
  const group = <T extends { itemId: number }>(rows: T[]) => {
    const map = new Map<number, T[]>();
    for (const row of rows) map.set(row.itemId, [...(map.get(row.itemId) ?? []), row]);
    return map;
  };
  const ordered = <T extends { sortOrder?: number; projectCategory?: string }>(rows: T[]) =>
    [...rows].sort((a, b) =>
      (a.projectCategory ?? "").localeCompare(b.projectCategory ?? "") ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  const productivityById = group(productivity);
  const equipmentById = group(equipment);
  const labourById = group(labour);
  const materialsById = group(materials);
  return new Map(items.map(item => [item.itemCode, {
    item,
    norms: {
      productivity: [...(productivityById.get(item.id) ?? [])]
        .sort((a, b) => a.projectCategory.localeCompare(b.projectCategory) || a.shiftOutput - b.shiftOutput)
        .map(({ projectCategory, shiftOutput, shiftHours, outputUnit, derivedPerHour }) =>
        ({ projectCategory, shiftOutput, shiftHours, outputUnit, derivedPerHour })),
      equipment: ordered(equipmentById.get(item.id) ?? []).map(({ projectCategory, sortOrder, equipmentType, unit, quantityPerShift, shiftOutputRef, derivedPerUnit, notes }) =>
        ({ projectCategory, sortOrder, equipmentType, unit, quantityPerShift, shiftOutputRef, derivedPerUnit, notes: notes ?? null })),
      labour: ordered(labourById.get(item.id) ?? []).map(({ projectCategory, sortOrder, designation, skillTier, unit, quantityPerShift, shiftOutputRef, derivedPerUnit }) =>
        ({ projectCategory, sortOrder, designation, skillTier, unit, quantityPerShift, shiftOutputRef, derivedPerUnit })),
      materials: ordered(materialsById.get(item.id) ?? []).map(({ projectCategory, sortOrder, materialName, materialCategory, unit, quantityPerShift, shiftOutputRef, derivedPerUnit }) =>
        ({ projectCategory, sortOrder, materialName, materialCategory, unit, quantityPerShift, shiftOutputRef, derivedPerUnit })),
    } as NormRows,
  }]));
}

export async function previewMorthReload(buffer: Buffer) {
  const parsed = parseMorthSdbWorkbook(buffer);
  const [source] = await db.select().from(snlSources).where(eq(snlSources.code, MORTH_SDB_SOURCE_CODE)).limit(1);
  const current = source ? await loadCurrentRows(source.id) : new Map<string, any>();
  const changes: MorthReloadChange[] = parsed.map(item => {
    const validation = validateParsedMorthItem(item);
    const prior = current.get(item.code);
    const nextNorms = parsedNorms(item);
    const notes = mergeMorthSnlNotes(prior?.item.notes, item);
    if (!prior) return {
      code: item.code,
      status: "added",
      validationStatus: validation.status,
      copyReference: item.copyReference,
      costNote: item.costNote,
      validationReasons: validation.reasons,
      old: null,
      new: { description: item.description || item.title, unit: item.unit || "CUM", specClause: item.specClause ?? null, notes, norms: nextNorms },
      reasons: ["New MoRTH item", ...(item.specClause ? ["Spec clause added"] : [])],
    };
    const next = { description: item.description || item.title, unit: item.unit || "CUM", specClause: item.specClause ?? null, notes, norms: nextNorms };
    const old = { description: prior.item.description, unit: prior.item.unit, specClause: prior.item.specClause ?? null, notes: prior.item.notes ?? null, norms: prior.norms };
    const reasons = [
      old.description !== next.description ? "Description changed" : "",
      old.unit !== next.unit ? "Unit changed" : "",
      old.specClause !== next.specClause
        ? old.specClause == null && next.specClause != null
          ? "Spec clause added"
          : next.specClause == null
            ? "Spec clause removed"
            : "Spec clause changed"
        : "",
      old.notes !== next.notes ? "Estimator note changed" : "",
      !compareNorms({ productivity: old.norms.productivity, equipment: [], labour: [], materials: [] }, { productivity: next.norms.productivity, equipment: [], labour: [], materials: [] }) ? "Productivity changed" : "",
      !compareNorms({ productivity: [], equipment: old.norms.equipment, labour: [], materials: [] }, { productivity: [], equipment: next.norms.equipment, labour: [], materials: [] }) ? "Machine rows changed" : "",
      !compareNorms({ productivity: [], equipment: [], labour: old.norms.labour, materials: [] }, { productivity: [], equipment: [], labour: next.norms.labour, materials: [] }) ? "Labour rows changed" : "",
      !compareNorms({ productivity: [], equipment: [], labour: [], materials: old.norms.materials }, { productivity: [], equipment: [], labour: [], materials: next.norms.materials }) ? "Material rows changed" : "",
    ].filter(Boolean);
    return {
      code: item.code,
      status: reasons.length ? "changed" : "unchanged",
      validationStatus: validation.status,
      copyReference: item.copyReference,
      costNote: item.costNote,
      validationReasons: validation.reasons,
      old,
      new: next,
      reasons,
    };
  });
  const fingerprint = createHash("sha256").update(stable({
    sourceId: source?.id ?? null,
    changes,
  })).digest("hex");
  const parsedCodes = new Set(parsed.map(item => item.code));
  const preservedOutsideWorkbookItems = [...current.entries()]
    .filter(([code]) => !parsedCodes.has(code))
    .map(([code, row]) => ({ code, description: row.item.description, unit: row.item.unit }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const statusByCode = new Map(changes.map(change => [change.code, change.validationStatus]));
  const validationItems: MorthReloadValidationItem[] = parsed.map(item => ({
    code: item.code,
    title: item.title,
    unit: item.unit,
    shiftOutput: item.shiftOutput,
    reasons: validateParsedMorthItem(item).reasons,
  }));
  const rateOnlyItems = validationItems.filter(item => statusByCode.get(item.code) === "rate_only");
  const needsCheckItems = validationItems.filter(item => statusByCode.get(item.code) === "needs_check");
  return {
    sourceCode: MORTH_SDB_SOURCE_CODE,
    sourceName: MORTH_SDB_DISPLAY_NAME,
    fingerprint,
    parsedCount: parsed.length,
    counts: {
      added: changes.filter(row => row.status === "added").length,
      changed: changes.filter(row => row.status === "changed").length,
      unchanged: changes.filter(row => row.status === "unchanged").length,
      preservedOutsideWorkbook: preservedOutsideWorkbookItems.length,
      passed: changes.filter(row => row.validationStatus === "passing").length,
      copiedFromAnotherItem: changes.filter(row => row.validationStatus === "copied").length,
      rateOnly: rateOnlyItems.length,
      needsCheck: needsCheckItems.length,
    },
    rateOnlyItems,
    copiedItems: changes
      .filter(change => change.validationStatus === "copied")
      .map(change => ({
        code: change.code,
        title: change.new.description,
        unit: change.new.unit,
        copyReference: change.copyReference!,
        costNote: change.costNote ?? null,
      })),
    needsCheckItems,
    preservedOutsideWorkbookItems,
    changes,
  };
}

export async function applyMorthReload(buffer: Buffer, expectedFingerprint: string) {
  const preview = await previewMorthReload(buffer);
  if (!expectedFingerprint || preview.fingerprint !== expectedFingerprint) {
    throw new Error("The MoRTH book or current rows changed after preview. Review a fresh change list before applying.");
  }
  const parsed = parseMorthSdbWorkbook(buffer);
  const changedCodes = new Set(getMorthReloadApplicableCodes(preview.changes));
  const notesByCode = new Map(preview.changes.map(change => [change.code, change.new.notes]));

  const applied = await db.transaction(async tx => {
    const [source] = await tx.insert(snlSources).values({
      code: MORTH_SDB_SOURCE_CODE,
      name: MORTH_SDB_DISPLAY_NAME,
      authority: "MoRTH",
      year: 2003,
      isActive: true,
    }).onConflictDoUpdate({
      target: snlSources.code,
      set: { name: MORTH_SDB_DISPLAY_NAME, authority: "MoRTH", year: 2003, isActive: true },
    }).returning();
    const changedIds: number[] = [];
    for (const item of parsed) {
      if (!changedCodes.has(item.code)) continue;
      const shiftOutput = item.shiftOutput > 0 ? item.shiftOutput : 1;
      const [saved] = await tx.insert(snlItems).values({
        sourceId: source.id,
        itemCode: item.code,
        description: item.description || item.title,
        shortLabel: item.title.slice(0, 80),
        unit: item.unit || "CUM",
        specClause: item.specClause ?? null,
        workCategory: item.workCategory,
        sector: item.sector,
        chapterNo: item.chapterNo,
        notes: notesByCode.get(item.code) ?? null,
        isActive: true,
      }).onConflictDoUpdate({
        target: [snlItems.sourceId, snlItems.itemCode],
        set: {
          description: item.description || item.title,
          shortLabel: item.title.slice(0, 80),
          unit: item.unit || "CUM",
          specClause: item.specClause ?? null,
          workCategory: item.workCategory,
          sector: item.sector,
          chapterNo: item.chapterNo,
          notes: notesByCode.get(item.code) ?? null,
          isActive: true,
        },
      }).returning({ id: snlItems.id });
      if (changedCodes.has(item.code)) changedIds.push(saved.id);

      await tx.delete(snlItemProductivity).where(eq(snlItemProductivity.itemId, saved.id));
      await tx.delete(snlItemEquipment).where(eq(snlItemEquipment.itemId, saved.id));
      await tx.delete(snlItemLabour).where(eq(snlItemLabour.itemId, saved.id));
      await tx.delete(snlItemMaterials).where(eq(snlItemMaterials.itemId, saved.id));
      const norms = parsedNorms(item);
      if (norms.productivity.length) await tx.insert(snlItemProductivity).values(norms.productivity.map(row => ({ itemId: saved.id, ...row })));
      if (norms.equipment.length) await tx.insert(snlItemEquipment).values(norms.equipment.map(row => ({ itemId: saved.id, ...row })));
      if (norms.labour.length) await tx.insert(snlItemLabour).values(norms.labour.map(row => ({ itemId: saved.id, ...row })));
      if (norms.materials.length) await tx.insert(snlItemMaterials).values(norms.materials.map(row => ({ itemId: saved.id, isDesignSpecific: false, ...row })));
    }
    return { sourceId: source.id, changedIds };
  });

  const affectedBoqItems: Array<{
    boqItemId: number;
    itemCode: string | null;
    description: string;
    projectId: number | null;
    projectName: string | null;
    recipeManualOverride: boolean | null;
    linkedAs: string[];
  }> = [];
  if (applied.changedIds.length) {
    const [singleLinks, componentLinks] = await Promise.all([
      db.select({
        boqItemId: boqItems.id,
        itemCode: boqItems.itemCode,
        description: boqItems.description,
        projectId: boqProjects.id,
        projectName: boqProjects.name,
        recipeManualOverride: boqItems.recipeManualOverride,
      }).from(snlBoqMappings)
        .innerJoin(boqItems, eq(boqItems.id, snlBoqMappings.boqItemId))
        .leftJoin(boqProjects, eq(boqProjects.id, boqItems.boqProjectId))
        .where(inArray(snlBoqMappings.snlItemId, applied.changedIds)),
      db.select({
        boqItemId: boqItems.id,
        itemCode: boqItems.itemCode,
        description: boqItems.description,
        projectId: boqProjects.id,
        projectName: boqProjects.name,
        recipeManualOverride: boqItems.recipeManualOverride,
        componentTag: snlCompositeComponents.componentTag,
      }).from(snlCompositeComponents)
        .innerJoin(boqItems, eq(boqItems.id, snlCompositeComponents.boqItemId))
        .leftJoin(boqProjects, eq(boqProjects.id, boqItems.boqProjectId))
        .where(inArray(snlCompositeComponents.snlItemId, applied.changedIds)),
    ]);
    const byBoqItem = new Map<number, typeof affectedBoqItems[number]>();
    for (const row of singleLinks) {
      byBoqItem.set(row.boqItemId, { ...row, linkedAs: ["norm"] });
    }
    for (const row of componentLinks) {
      const existing = byBoqItem.get(row.boqItemId);
      if (existing) existing.linkedAs.push(`component ${row.componentTag}`);
      else byBoqItem.set(row.boqItemId, { ...row, linkedAs: [`component ${row.componentTag}`] });
    }
    affectedBoqItems.push(...byBoqItem.values());
  }
  return {
    sourceCode: MORTH_SDB_SOURCE_CODE,
    sourceName: MORTH_SDB_DISPLAY_NAME,
    appliedCount: changedCodes.size,
    changedCount: changedCodes.size,
    skippedNeedsCheckCount: preview.changes.filter(row =>
      row.status !== "unchanged" && row.validationStatus === "needs_check",
    ).length,
    affectedBoqItems,
  };
}
