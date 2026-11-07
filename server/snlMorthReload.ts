import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  boqItems,
  boqProjects,
  snlBoqMappings,
  snlItemEquipment,
  snlItemLabour,
  snlItemMaterials,
  snlItemProductivity,
  snlItems,
  snlSources,
} from "@shared/schema";
import { MORTH_SDB_DISPLAY_NAME, MORTH_SDB_SOURCE_CODE } from "@shared/normBook";
import { db } from "./db";
import { parseMorthSdbWorkbook, type ParsedMorthItem } from "./snlMorthParser";

type NormRows = {
  productivity: Array<{ projectCategory: string; shiftOutput: number; shiftHours: number; outputUnit: string; derivedPerHour: number | null }>;
  equipment: Array<{ projectCategory: string; sortOrder: number; equipmentType: string; unit: string; quantityPerShift: number | null; shiftOutputRef: number; derivedPerUnit: number | null }>;
  labour: Array<{ projectCategory: string; sortOrder: number; designation: string; skillTier: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
  materials: Array<{ projectCategory: string; sortOrder: number; materialName: string; materialCategory: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
};

export type MorthReloadChange = {
  code: string;
  status: "added" | "changed" | "unchanged";
  old: null | { description: string; unit: string; norms: NormRows };
  new: { description: string; unit: string; norms: NormRows };
  reasons: string[];
};

const materialCategory = (name: string) =>
  /aggregate|gsb|wmm/i.test(name) ? "AGGREGATE" :
  /cement/i.test(name) ? "CEMENT" :
  /bitumen|emulsion/i.test(name) ? "BITUMEN" : "OTHER";

const skillTier = (name: string) =>
  /mason|operator|fitter|blacksmith|carpenter|sinker|skilled/i.test(name) ? "SKILLED" : "UNSKILLED";

function parsedNorms(item: ParsedMorthItem): NormRows {
  const shiftOutput = item.shiftOutput > 0 ? item.shiftOutput : 1;
  return {
    productivity: [{
      projectCategory: "ALL",
      shiftOutput,
      shiftHours: 8,
      outputUnit: item.unit || "CUM",
      derivedPerHour: shiftOutput / 8,
    }],
    equipment: item.equipment.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, equipmentType: row.label, unit: "hrs",
      quantityPerShift: row.qty, shiftOutputRef: shiftOutput, derivedPerUnit: row.qty / shiftOutput,
    })),
    labour: item.labour.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, designation: row.label, skillTier: skillTier(row.label), unit: "day",
      quantityPerShift: row.qty, shiftOutputRef: shiftOutput, derivedPerUnit: row.qty / shiftOutput,
    })),
    materials: item.materials.map((row, sortOrder) => ({
      projectCategory: "ALL", sortOrder, materialName: row.label, materialCategory: materialCategory(row.label),
      unit: row.unit || item.unit || "CUM", quantityPerShift: row.qty, shiftOutputRef: shiftOutput,
      derivedPerUnit: row.qty / shiftOutput,
    })),
  };
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, part) => {
  if (Array.isArray(part)) return part;
  if (part && typeof part === "object") return Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b)));
  return part;
});

function compareNorms(oldNorms: NormRows, newNorms: NormRows): boolean {
  return stable(oldNorms) === stable(newNorms);
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
  const productivityById = group(productivity);
  const equipmentById = group(equipment);
  const labourById = group(labour);
  const materialsById = group(materials);
  return new Map(items.map(item => [item.itemCode, {
    item,
    norms: {
      productivity: (productivityById.get(item.id) ?? []).map(({ projectCategory, shiftOutput, shiftHours, outputUnit, derivedPerHour }) =>
        ({ projectCategory, shiftOutput, shiftHours, outputUnit, derivedPerHour })),
      equipment: (equipmentById.get(item.id) ?? []).map(({ projectCategory, sortOrder, equipmentType, unit, quantityPerShift, shiftOutputRef, derivedPerUnit }) =>
        ({ projectCategory, sortOrder, equipmentType, unit, quantityPerShift, shiftOutputRef, derivedPerUnit })),
      labour: (labourById.get(item.id) ?? []).map(({ projectCategory, sortOrder, designation, skillTier, unit, quantityPerShift, shiftOutputRef, derivedPerUnit }) =>
        ({ projectCategory, sortOrder, designation, skillTier, unit, quantityPerShift, shiftOutputRef, derivedPerUnit })),
      materials: (materialsById.get(item.id) ?? []).map(({ projectCategory, sortOrder, materialName, materialCategory, unit, quantityPerShift, shiftOutputRef, derivedPerUnit }) =>
        ({ projectCategory, sortOrder, materialName, materialCategory, unit, quantityPerShift, shiftOutputRef, derivedPerUnit })),
    } as NormRows,
  }]));
}

export async function previewMorthReload(buffer: Buffer) {
  const parsed = parseMorthSdbWorkbook(buffer);
  const [source] = await db.select().from(snlSources).where(eq(snlSources.code, MORTH_SDB_SOURCE_CODE)).limit(1);
  const current = source ? await loadCurrentRows(source.id) : new Map<string, any>();
  const changes: MorthReloadChange[] = parsed.map(item => {
    const prior = current.get(item.code);
    const nextNorms = parsedNorms(item);
    if (!prior) return {
      code: item.code,
      status: "added",
      old: null,
      new: { description: item.description || item.title, unit: item.unit || "CUM", norms: nextNorms },
      reasons: ["New MoRTH item"],
    };
    const next = { description: item.description || item.title, unit: item.unit || "CUM", norms: nextNorms };
    const old = { description: prior.item.description, unit: prior.item.unit, norms: prior.norms };
    const reasons = [
      old.description !== next.description ? "Description changed" : "",
      old.unit !== next.unit ? "Unit changed" : "",
      !compareNorms(old.norms, next.norms) ? "Productivity or resource rows changed" : "",
    ].filter(Boolean);
    return { code: item.code, status: reasons.length ? "changed" : "unchanged", old, new: next, reasons };
  });
  const fingerprint = createHash("sha256").update(stable({
    sourceId: source?.id ?? null,
    changes,
  })).digest("hex");
  return {
    sourceCode: MORTH_SDB_SOURCE_CODE,
    sourceName: MORTH_SDB_DISPLAY_NAME,
    fingerprint,
    parsedCount: parsed.length,
    counts: {
      added: changes.filter(row => row.status === "added").length,
      changed: changes.filter(row => row.status === "changed").length,
      unchanged: changes.filter(row => row.status === "unchanged").length,
      preservedOutsideWorkbook: Math.max(0, current.size - parsed.length),
    },
    changes,
  };
}

export async function applyMorthReload(buffer: Buffer, expectedFingerprint: string) {
  const preview = await previewMorthReload(buffer);
  if (!expectedFingerprint || preview.fingerprint !== expectedFingerprint) {
    throw new Error("The MoRTH book or current rows changed after preview. Review a fresh change list before applying.");
  }
  const parsed = parseMorthSdbWorkbook(buffer);
  const changedCodes = preview.changes.filter(row => row.status !== "unchanged").map(row => row.code);

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
      const shiftOutput = item.shiftOutput > 0 ? item.shiftOutput : 1;
      const [saved] = await tx.insert(snlItems).values({
        sourceId: source.id,
        itemCode: item.code,
        description: item.description || item.title,
        shortLabel: item.title.slice(0, 80),
        unit: item.unit || "CUM",
        workCategory: item.workCategory,
        sector: item.sector,
        chapterNo: item.chapterNo,
        isActive: true,
      }).onConflictDoUpdate({
        target: [snlItems.sourceId, snlItems.itemCode],
        set: {
          description: item.description || item.title,
          shortLabel: item.title.slice(0, 80),
          unit: item.unit || "CUM",
          workCategory: item.workCategory,
          sector: item.sector,
          chapterNo: item.chapterNo,
          isActive: true,
        },
      }).returning({ id: snlItems.id });
      if (changedCodes.includes(item.code)) changedIds.push(saved.id);

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

  const affected = applied.changedIds.length
    ? await db.select({
        boqItemId: boqItems.id,
        itemCode: boqItems.itemCode,
        description: boqItems.description,
        projectId: boqProjects.id,
        projectName: boqProjects.name,
      }).from(snlBoqMappings)
        .innerJoin(boqItems, eq(boqItems.id, snlBoqMappings.boqItemId))
        .leftJoin(boqProjects, eq(boqProjects.id, boqItems.boqProjectId))
        .where(and(
          inArray(snlBoqMappings.snlItemId, applied.changedIds),
          eq(boqItems.recipeManualOverride, false),
        ))
    : [];
  return {
    sourceCode: MORTH_SDB_SOURCE_CODE,
    sourceName: MORTH_SDB_DISPLAY_NAME,
    appliedCount: parsed.length,
    changedCount: preview.counts.added + preview.counts.changed,
    affectedBoqItems: affected,
  };
}
