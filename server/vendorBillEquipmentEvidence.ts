import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { dprs, equipmentLogs, equipmentMaster, equipmentUsage } from "@shared/schema";
import { vendorBillItemMatchesSite } from "@shared/siteName";

type Item = {
  category?: string | null; sourceId?: string | number | null; equipmentId?: number | null;
  source?: string | null; date?: string | null; description?: string | null; siteName?: string | null;
  hireStatementId?: number | null; unit?: string | null;
};
export type EvidenceRecord = {
  key: string; site: string | null;
  log: Record<string, unknown>;
  equipment: Record<string, unknown> | null;
};

/** Exact persisted source identity only: never match a machine by name/date. */
export function equipmentEvidenceKey(item: Item): string | null {
  if (item.category?.toLowerCase() !== "equipment") return null;
  const value = item.sourceId != null
    ? String(item.sourceId)
    : String(item.source ?? "").match(/^auto:(dpr_equipment|plant_usage):([1-9]\d*)$/)?.slice(1).join(":");
  return value && /^(dpr_equipment|plant_usage):[1-9]\d*$/.test(value) ? value : null;
}

/**
 * Older ordinary bill rows did not persist source IDs. Match only a unique
 * equipment/date/site/type/description candidate. The generated description
 * ends with live meter hours and optional diesel, so those changing readings
 * are excluded from the stable description key; ambiguous matches remain
 * unavailable. No data is saved.
 */
export function resolveSavedEquipmentEvidenceSources<T extends Item>(items: T[], candidates: Item[]): T[] {
  const text = (value: string | null | undefined) => (value || "").trim().toUpperCase();
  const dateKey = (value: string | Date | null | undefined) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
  const stableDescription = (value: string | null | undefined) =>
    text(value).replace(/\s*\|\s*[\d,.]+\s*(?:HRS?|HOURS?)\b.*$/i, "").trim();
  const entryType = (item: Item) => {
    const match = text(item.description).match(/\b(HOURLY HIRE|DAILY HIRE|TIME\/METER|TRIP BASED)\b/);
    if (match) return match[1];
    const unit = text(item.unit);
    if (unit === "TRIP" || unit === "TRIPS") return "TRIPS";
    if (unit === "DAY" || unit === "DAYS") return "DAYS";
    if (unit === "HRS" || unit === "HR" || unit === "HOUR" || unit === "HOURS") return "HOURS";
    return "";
  };
  return items.map(item => {
    if (item.sourceId != null || item.source !== "auto" || item.hireStatementId != null ||
      item.category?.toLowerCase() !== "equipment" || !item.equipmentId || !item.date ||
      !item.description?.trim() || !item.siteName?.trim()) return item;
    const savedType = entryType(item);
    if (!savedType) return item;
    const matches = candidates.filter(candidate =>
      !!equipmentEvidenceKey(candidate) && candidate.equipmentId === item.equipmentId &&
      dateKey(candidate.date) === dateKey(item.date) && entryType(candidate) === savedType &&
      text(candidate.unit) === text(item.unit) &&
      stableDescription(candidate.description) === stableDescription(item.description) &&
      text(candidate.siteName) === text(item.siteName));
    const keys = Array.from(new Set(matches.map(equipmentEvidenceKey).filter((key): key is string => !!key)));
    return keys.length === 1 ? { ...item, sourceId: keys[0] } : item;
  });
}

/** Pure projection: it cannot change quantities, prices or saved records. */
export function projectEquipmentEvidence<T extends Item>(
  items: T[], records: EvidenceRecord[], permittedSites: string[] | null,
): T[] {
  const dateKey = (value: unknown) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
  const lookup = new Map(records.filter(record => permittedSites === null ||
    permittedSites.some(site => vendorBillItemMatchesSite(record.site, site))).map(record => [record.key, record]));
  return items.map(item => {
    const key = equipmentEvidenceKey(item);
    const record = key ? lookup.get(key) : undefined;
    if (!record || (item.equipmentId != null && record.log.equipmentId != null &&
      Number(item.equipmentId) !== Number(record.log.equipmentId)) ||
      (item.date && record.log.date && dateKey(record.log.date) !== dateKey(item.date))) return item;
    return { ...item, equipmentLogEvidence: { log: record.log, equipment: record.equipment } };
  });
}

/** Batched read-only enrichment, used only by existing bill-form/detail reads. */
export async function attachVendorBillEquipmentEvidence<T extends Item>(
  items: T[], permittedSites: string[] | null,
): Promise<T[]> {
  const keys = Array.from(new Set(items.map(equipmentEvidenceKey).filter((key): key is string => !!key)));
  const ids = (prefix: string) => keys.filter(key => key.startsWith(prefix + ":")).map(key => Number(key.split(":")[1]));
  const logIds = ids("dpr_equipment"), usageIds = ids("plant_usage");
  const records: EvidenceRecord[] = [];
  if (logIds.length) {
    const rows = await db.select({ log: equipmentLogs, equipment: equipmentMaster, site: dprs.site })
      .from(equipmentLogs).innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
      .leftJoin(equipmentMaster, eq(equipmentMaster.id, equipmentLogs.equipmentId))
      .where(inArray(equipmentLogs.id, logIds));
    records.push(...rows.map(row => ({ key: `dpr_equipment:${row.log.id}`, ...row })));
  }
  if (usageIds.length) {
    const rows = await db.select({ usage: equipmentUsage, equipment: equipmentMaster })
      .from(equipmentUsage).leftJoin(equipmentMaster, eq(equipmentMaster.id, equipmentUsage.equipmentId))
      .where(inArray(equipmentUsage.id, usageIds));
    records.push(...rows.map(({ usage, equipment }) => ({
      key: `plant_usage:${usage.id}`, site: usage.plantName, equipment,
      log: { ...usage, diesel: usage.dieselIssued, hoursWorked: usage.hoursOrKmRun,
        dieselBalanceInTank: usage.closingDiesel },
    })));
  }
  return projectEquipmentEvidence(items, records, permittedSites);
}