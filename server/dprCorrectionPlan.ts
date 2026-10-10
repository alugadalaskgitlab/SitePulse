import { isDeepStrictEqual } from "node:util";
import { parseChainageKm } from "../shared/barSide";
import { computeEquipmentUsage, isMeaningfulEquipmentRow } from "../shared/equipmentUsage";
import { isFilledLabourRow } from "../shared/labourEntry";
import { validateEquipmentActivityAllocations, validateEquipmentActivitySegments } from "../shared/equipmentActivityAllocations";
import { normalizeExcavationMaterialOutcome } from "../shared/cutFillReconciliation";
import { calculateLengthFromChainage } from "../shared/dprGeometry";

export const correctionFields: Record<string, string[]> = Object.fromEntries(Object.entries({
  header: "date site engineer remarks boqProjectId",
  progress: "activity side chainageFrom chainageTo length width thickness quantity uom noSiteWork noSiteWorkDescription personnelIds boqItemId programmeBarId earthworkArrangementId quantitySource quantitySourceNote chainageOverrideReason lengthOverrideReason uomOverrideReason executedBy layerNo isIncidental incidentalDescription materialOutcome reusableQty",
  equipment: "machine vehicleNo operator task entryType startTime endTime openingReading closingReading diesel openingDiesel dieselBalanceInTank dieselBalanceConfirmed dieselNorm expectedDiesel hoursWorked equipmentId plantUsageId usageStatus usageStatusReason dieselSource fuelStation billNumber amountPaid numberOfTrips tripDistance totalKm waterQuantity boqItemId resourceScope structureId",
  labour: "category gender count hours task contractor boqItemId resourceScope structureId workerNames",
  materials: "type material quantity uom vehicleNumber supplier location receiptNumber boqItemId resourceScope structureId",
  sitePurchases: "itemDescription vendor quantity uom amount billNo",
  structureItems: "structureType structureSubType structureName stage itemOfWork quantity uom remarks boqItemId dprConversionFactor structureId",
}).map(([section, fields]) => [section, fields.split(" ")]));

export const correctionSections = Object.keys(correctionFields).filter(s => s !== "header");
const numeric = new Set("length width thickness quantity layerNo reusableQty openingReading closingReading diesel openingDiesel dieselBalanceInTank dieselNorm expectedDiesel hoursWorked amountPaid numberOfTrips tripDistance totalKm waterQuantity count hours amount dprConversionFactor".split(" "));
const booleans = new Set(["noSiteWork", "isIncidental"]);
const defaults: Record<string, any> = {
  "equipment.entryType": "time_meter", "labour.category": "Skilled", "labour.gender": "Male",
  "materials.type": "Received", "progress.uom": "SQM",
};
const nullable = (v: any): any => v === "" || v == null ? null : Array.isArray(v) ? v.map(nullable) : v;
const same = (a: any, b: any) => isDeepStrictEqual(nullable(a), nullable(b));
export type CorrectionChange = { section: string; rowId: number; field: string; oldValue: any; newValue: any; requiresApproval: boolean };
export type CorrectionBlock = { section: string; rowId: number; field: string; message: string };
export function correctionError(message: string, status = 409): never {
  throw Object.assign(new Error(message), { code: "DPR_CORRECTION_CONFLICT", status });
}

/** A raw SiteEdit field is compared against its actual hydration equivalent.
 * Null tank readings remain null; zero is deliberately NOT an empty value. */
function equivalent(section: string, key: string, input: any, old: any) {
  if (same(input, old)) return true;
  if (booleans.has(key) && !input && old == null) return true;
  if (["workerNames", "personnelIds"].includes(key) && !input?.length && !old?.length) return true;
  if (numeric.has(key) && input != null && input !== "" && old != null && old !== "") {
    return Number.isFinite(Number(input)) && Number(input) === Number(old);
  }
  if (old == null || old === "") {
    if (defaults[`${section}.${key}`] === input) return true;
  }
  return false;
}

export function needsApproval(section: string, field: string) {
  if (section === "equipment") return !["operator", "task", "usageStatusReason"].includes(field);
  if (["materials", "sitePurchases", "structureItems"].includes(section)) return true;
  if (section === "labour") return !["task", "workerNames"].includes(field);
  if (section === "progress") return ["length", "width", "thickness", "quantity", "uom", "boqItemId", "programmeBarId", "materialOutcome", "reusableQty", "earthworkArrangementId", "lengthOverrideReason", "uomOverrideReason", "noSiteWork", "isIncidental", "executedBy", "side", "layerNo"].includes(field);
  return false;
}

/** Plan only: no replacement of logs, no canonical finalizer or ledger writes. */
export function planDprCorrection(saved: any, form: any) {
  const changes: CorrectionChange[] = [];
  const blocked: CorrectionBlock[] = [];
  const candidate = structuredClone(saved);
  const patches: Record<string, { id: number; values: any }[]> = {};
  const block = (section: string, rowId: number, field: string, message: string) => blocked.push({ section, rowId, field, message });
  if (!saved || saved.dprStatus !== "submitted" || saved.isSuperseded || saved.isDeleted || saved.isCancelled) {
    correctionError("Only the current, active submitted DPR can be corrected. Open its latest version.");
  }
  if (!form || typeof form !== "object") correctionError("A complete correction form is required.", 400);
  const topKeys = new Set(["header", "workType", ...correctionSections, "baselineProgress"]);
  for (const key of Object.keys(form)) if (!topKeys.has(key)) block("header", saved.id, key, "Unexpected form field; reload the current editor.");
  if (form.workType !== saved.workType) block("header", saved.id, "workType", "Changing road/structure classification requires a separately reviewed report, not relabelling existing evidence.");

  for (const section of Object.keys(correctionFields)) {
    const olds = section === "header" ? [saved] : saved[section] ?? [];
    let rows = section === "header" ? [form.header] : form[section];
    if (!olds.length && Array.isArray(rows)) {
      // SiteEdit renders empty input placeholders, not new stored evidence.
      rows = rows.filter((r: any) => r?.persistedId != null
        || (section === "equipment" ? isMeaningfulEquipmentRow(r)
          : section === "labour" ? isFilledLabourRow(r) || r?.workerNames?.length
          : section === "progress" ? Object.entries(r ?? {}).some(([k, v]) => !["entryKey", "uom", "noSiteWork", "isIncidental", "allocations", "personnelIds"].includes(k) && v != null && v !== "")
          : true));
    }
    patches[section] = [];
    if (!Array.isArray(rows) || rows.length !== olds.length) {
      block(section, saved.id, "rows", "Submitted evidence cannot be added or removed through correction. Retain its rows; use the original entry or cancellation workflow for structural changes.");
      continue;
    }
    const ids = new Set<number>();
    rows.forEach((row: any, index: number) => {
      const old = section === "header" ? saved
        : row?.persistedId != null ? olds.find((x: any) => x.id === row.persistedId)
        : section === "sitePurchases" ? olds[index] : undefined;
      if (!row || !old || ids.has(old.id)) {
        block(section, Number(row?.persistedId ?? index), "persistedId", "Saved row identity is missing, duplicated or stale. Reopen the same DPR without discarding your corrections.");
        return;
      }
      ids.add(old.id);
      const extra = new Set(["persistedId", "entryKey", "editCreationKey", "isNew", "workAssignmentEdited", "activitySegments", "activityAllocations", "breakdowns", "allocations"]);
      for (const key of Object.keys(row)) {
        if (!correctionFields[section].includes(key) && !extra.has(key)) block(section, old.id, key, "Unknown submitted field; reload the current editor.");
      }
      for (const key of ["activitySegments", "activityAllocations", "breakdowns", "allocations"]) {
        if (row[key] == null) continue;
        if (!Array.isArray(row[key])) { block(section, old.id, key, "Invalid child evidence."); continue; }
        // Child evidence is retained, not overwritten. Compare the UI projection
        // against the stored projection when it was supplied.
        const project = (v: any): any => Array.isArray(v) ? v.map(project) : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).filter(([k]) => !["id", "persistedId", "equipmentLogId", "segmentId", "dprId", "createdAt", "updatedAt"].includes(k)).map(([k, x]) => [k, project(x)]))
          : nullable(v);
        if (!same(project(row[key]), project(old[key] ?? []))) block(section, old.id, key, "Child assignments, stoppages or cut/fill allocations changed. Correct them in their dedicated reviewed workflow; this save retains existing evidence.");
      }
      if (old.entryKey && row.entryKey && row.entryKey !== old.entryKey) block(section, old.id, "entryKey", "Photo/progress identity cannot change.");
      const values: any = {};
      for (const field of correctionFields[section]) {
        // Optional omitted fields represent no intent; the UI sends explicit
        // null when a measured value is deliberately cleared.
        if (!Object.hasOwn(row, field)) continue;
        let value = nullable(row[field]);
        if (section === "progress" && field === "reusableQty"
            && equivalent(section, "quantity", row.quantity, old.quantity)
            && equivalent(section, "materialOutcome", row.materialOutcome, old.materialOutcome)
            && same(value, normalizeExcavationMaterialOutcome(old.quantity, old.materialOutcome, old.reusableQty).reusableQty)) continue;
        if (section === "progress" && field === "length" && old.length == null
            && same(row.chainageFrom, old.chainageFrom) && same(row.chainageTo, old.chainageTo)
            && !row.lengthOverrideReason
            && same(value, calculateLengthFromChainage(old.chainageFrom ?? "", old.chainageTo ?? ""))) continue;
        if (section === "header" && field === "site") {
          const base = String(old.site).replace(/ – (Edited by|Copy by) .+$/, "").trim();
          if (value === base) continue;
        }
        if (equivalent(section, field, value, old[field])) continue;
        if (["date", "site", "boqProjectId"].includes(field) && section === "header"
            || section === "equipment" && ["equipmentId", "plantUsageId", "machine", "vehicleNo"].includes(field)) {
          block(section, old.id, field, "Operational identity is linked to historical records. Retain the original site/date/project/machine/usage reference.");
          continue;
        }
        if (numeric.has(field) && value != null) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            block(section, old.id, field, "Enter a finite non-negative number, or leave an unrecorded value blank."); continue;
          }
        }
        if (field === "workerNames" || field === "personnelIds") {
          if (!Array.isArray(value) && value != null) { block(section, old.id, field, "A list is required."); continue; }
          value ??= [];
        } else if (value != null && typeof value === "object") {
          block(section, old.id, field, "Invalid field value."); continue;
        }
        values[field] = value;
        changes.push({ section, rowId: old.id, field, oldValue: old[field] ?? null, newValue: value, requiresApproval: needsApproval(section, field) });
      }
      if (section === "header") Object.assign(candidate, values);
      else {
        const target = candidate[section].find((x: any) => x.id === old.id);
        Object.assign(target, values);
        if (section === "progress" && Object.keys(values).some(k => ["chainageFrom", "chainageTo"].includes(k))) {
          values.chainageFromKm = parseChainageKm(target.chainageFrom);
          values.chainageToKm = parseChainageKm(target.chainageTo);
          Object.assign(target, values);
        }
        if (section === "equipment" && Object.keys(values).length) {
          for (const field of ["startTime", "endTime"]) {
            if (Object.hasOwn(values, field) && values[field] != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values[field])) block(section, old.id, field, "Use a valid HH:mm time or leave the unrecorded time blank.");
          }
          if (target.openingReading != null && target.closingReading != null && target.closingReading < target.openingReading) block(section, old.id, "closingReading", "Closing meter must not be below opening meter.");
          const measured = ["startTime", "endTime", "openingReading", "closingReading", "entryType", "numberOfTrips", "tripDistance"];
          for (const field of ["hoursWorked", "expectedDiesel", "totalKm", "dieselNorm"]) {
            if (Object.hasOwn(values, field) && !Object.keys(values).some(k => measured.includes(k))) {
              block(section, old.id, field, "This value is calculated. Correct its source readings/timings instead of overwriting the calculation.");
            }
          }
          if (Object.keys(values).some(k => ["diesel", "dieselSource"].includes(k)) && Number(target.diesel) > 0
              && !["plant_stock", "direct_purchase", "contractor"].includes(target.dieselSource)) {
            block(section, old.id, "dieselSource", "Select the source for the corrected positive diesel quantity.");
          }
          if (Object.keys(values).some(k => measured.includes(k))) {
            const master = saved.correctionEquipmentMasters?.find((e: any) => e.id === target.equipmentId);
            const computed = computeEquipmentUsage(master ?? (target.dieselNorm != null ? { consumptionNorm: target.dieselNorm } : null), target);
            for (const field of ["hoursWorked", "totalKm", "expectedDiesel"] as const) {
              const next = computed[field] ?? null;
              if (!same(next, old[field])) {
                const existing = changes.find(c => c.section === section && c.rowId === old.id && c.field === field);
                if (existing) existing.newValue = next;
                else changes.push({ section, rowId: old.id, field, oldValue: old[field] ?? null, newValue: next, requiresApproval: true });
                values[field] = next;
                target[field] = next;
              }
            }
            try {
              if (target.activitySegments?.length) validateEquipmentActivitySegments(target.activitySegments, target.hoursWorked, target);
              else if (target.activityAllocations?.length) validateEquipmentActivityAllocations(target.activityAllocations, target.hoursWorked, target);
            } catch (error: any) {
              block(section, old.id, "activitySegments", error.message);
            }
          }
          // Missing != zero. Consumption is not invented from a partial pair.
          if (target.openingDiesel != null && target.dieselBalanceInTank != null
              && Number(target.dieselBalanceInTank) > Number(target.openingDiesel) + Number(target.diesel ?? 0)) {
            block(section, old.id, "dieselBalanceInTank", "Closing tank reading exceeds opening plus recorded fuel issued.");
          }
        }
      }
      if (Object.keys(values).length) patches[section].push({ id: old.id, values });
    });
  }
  return { changes, blocked, candidate, patches, requiresApproval: changes.some(c => c.requiresApproval) };
}
