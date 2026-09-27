import type { CreateDprRequest } from "./schema";
import { normalizeDprSiteName } from "./dprBoqSelection";
import { evaluateDprSubmitReadiness } from "./dprSubmitReadiness";
import { isMeaningfulEquipmentRow } from "./equipmentUsage";

export const DPR_SECTIONS = ["activity", "equipment", "labour", "materials"] as const;
export type DprSection = typeof DPR_SECTIONS[number];
export type DprSectionContext = { site: string; date: string; workType: string; boqProjectId: number | null };
export type DprSectionState = { state: "empty" | "incomplete" | "ready"; label: string; issues?: any[] };
export type DprSectionSnapshot = {
  dpr: any;
  context: DprSectionContext;
  sectionTokens: Record<DprSection, string>;
  headerToken: string;
  sections: Record<DprSection, DprSectionState>;
};
export type DprSectionResolution = {
  kind: "new" | "existing" | "choose";
  snapshot?: DprSectionSnapshot;
  candidates?: Array<DprSectionContext & { id: number; engineer: string; lastEditedAt: any; createdAt: any }>;
};
export const DPR_SECTION_FIELDS: Record<DprSection, readonly string[]> = {
  activity: ["progress", "structureItems", "cutFillConsumptions", "remarks"],
  equipment: ["equipment"],
  labour: ["labour"],
  materials: ["materials", "sitePurchases"],
};
export function normalizeDprSectionContext(value: any): DprSectionContext {
  return {
    site: normalizeDprSiteName(value.site),
    date: String(value.date ?? "").slice(0, 10),
    workType: value.workType || "road",
    boqProjectId: value.boqProjectId == null ? null : Number(value.boqProjectId),
  };
}
export function pickDprSectionPayload(section: DprSection, form: any): Partial<CreateDprRequest> {
  return Object.fromEntries(DPR_SECTION_FIELDS[section]
    .filter(key => form[key] !== undefined).map(key => [key, form[key]]));
}
export function dprSectionStates(dpr: any): Record<DprSection, DprSectionState> {
  const readiness = evaluateDprSubmitReadiness(dpr);
  const meaningful = (row: any, keys: string[]) => keys.some(key => {
    const value = row[key];
    return typeof value === "string" ? value.trim() !== "" : Boolean(value);
  });
  const present: Record<DprSection, boolean> = {
    activity: (dpr.progress ?? []).some((r: any) => meaningful(r, ["activity", "boqItemId", "noSiteWork", "isIncidental"]))
      || (dpr.structureItems ?? []).some((r: any) => meaningful(r, ["structureName", "itemOfWork", "boqItemId"])),
    equipment: (dpr.equipment ?? []).some(isMeaningfulEquipmentRow),
    labour: (dpr.labour ?? []).some((r: any) => meaningful(r, ["category", "count"])),
    materials: (dpr.materials ?? []).some((r: any) => meaningful(r, ["material", "quantity"]))
      || (dpr.sitePurchases ?? []).some((r: any) => meaningful(r, ["itemDescription", "quantity", "vendor", "amount"])),
  };
  return Object.fromEntries(DPR_SECTIONS.map(section => {
    const issues = readiness.mandatory.filter(issue => issue.section === (section === "activity" ? "activities" : section));
    const state = !present[section] ? "empty" : issues.length ? "incomplete" : "ready";
    return [section, { state, label: state === "empty" ? "Not yet entered" : state === "incomplete" ? "Needs completion" : "Ready", issues }];
  })) as Record<DprSection, DprSectionState>;
}