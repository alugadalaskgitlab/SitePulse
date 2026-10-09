import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { dprs, progressEntries, auditLogs } from "../shared/schema";
import { parseChainageKm } from "../shared/barSide";
import { readWorkerNames } from "./labourWorkers";

const editable = {
  equipment: "machine vehicleNo operator task entryType startTime endTime openingReading closingReading diesel openingDiesel dieselBalanceInTank dieselBalanceConfirmed dieselNorm expectedDiesel hoursWorked equipmentId plantUsageId usageStatus usageStatusReason dieselSource fuelStation billNumber amountPaid numberOfTrips tripDistance totalKm waterQuantity boqItemId resourceScope structureId",
  labour: "category gender count hours task contractor boqItemId resourceScope structureId workerNames",
  materials: "type material quantity uom vehicleNumber supplier location receiptNumber boqItemId resourceScope structureId",
  sitePurchases: "itemDescription vendor quantity uom amount billNo",
  progress: "activity side width thickness uom noSiteWork noSiteWorkDescription personnelIds boqItemId programmeBarId earthworkArrangementId executedBy layerNo isIncidental incidentalDescription materialOutcome reusableQty",
};
const permitted = ["chainageFrom", "chainageTo", "length", "quantity", "chainageOverrideReason", "lengthOverrideReason", "quantitySource", "quantitySourceNote"];
const empty = (v: any): any => v === "" || v == null ? null
  : Array.isArray(v) ? (v.length ? v.map(empty) : null) : v;
const same = (a: any, b: any) => isDeepStrictEqual(empty(a), empty(b));
function fail(message: string): never { throw new Error(`DPR314_CORRECTION: ${message}`); }
function keysOnly(row: any, keys: string[]) {
  if (!row || typeof row !== "object" || Object.keys(row).some(k => !keys.includes(k))) fail("Unexpected correction fields");
}

/** Pure guard: no inferred replacement identities and no operational writes. */
export function planDpr314Correction(saved: any, form: any, actor: any, confirmation: any) {
  if (actor?.isAdmin !== true || !Number.isInteger(actor.id)) fail("Administrator required");
  if (confirmation?.missingUsageId !== 188 || confirmation?.equipmentLogId !== 741
      || confirmation?.confirmed !== true || typeof confirmation.reason !== "string"
      || confirmation.reason.trim().length < 10 || confirmation.reason.length > 1000) {
    fail("Confirm equipment log 741 / missing usage 188 and enter a correction reason");
  }
  if (saved.id !== 314 || saved.date !== "2026-08-29" || saved.site !== "TAKKADPALLY-SIRUR"
      || saved.dprStatus !== "submitted" || saved.isSuperseded || saved.isDeleted || saved.isCancelled) fail("Target report changed");
  const linked = saved.equipment.find((e: any) => e.id === 741);
  if (!linked || linked.plantUsageId !== 188 || linked.openingReading !== 18147.8
      || linked.closingReading !== 18154.3) fail("Historical equipment identity changed");
  keysOnly(form, ["header", "workType", "structureItems", "progress", "equipment", "labour", "materials", "sitePurchases", "baselineProgress"]);
  keysOnly(form.header, ["date", "site", "engineer", "remarks", "boqProjectId"]);
  if (!Array.isArray(form.baselineProgress) || form.baselineProgress.length !== saved.progress.length) fail("Missing progress baseline");
  saved.progress.forEach((row: any, i: number) => {
    const baseline = form.baselineProgress[i];
    if (baseline.id !== row.id || permitted.some(key => !same(baseline[key], row[key]))) fail("Progress changed since the form was opened; reload safely before correcting");
  });
  for (const key of ["date", "site", "engineer", "remarks", "boqProjectId"]) {
    if (!same(form.header?.[key], saved[key])) fail(`Unrelated header change: ${key}`);
  }
  if (form.workType !== saved.workType || form.workType !== "road") fail("Work type changed");
  if ((form.structureItems ?? []).some((r: any) => r.itemOfWork) || saved.structureItems.length) fail("Structure changes are not allowed");
  for (const section of ["equipment", "labour", "materials", "sitePurchases"] as const) {
    const rows = form[section];
    if (!Array.isArray(rows) || rows.length !== saved[section].length) fail(`${section} rows changed`);
    rows.forEach((row: any, index: number) => {
      const old = saved[section][index];
      keysOnly(row, [...editable[section].split(" "), "persistedId", "editCreationKey", "isNew", "workAssignmentEdited", "activitySegments", "activityAllocations", "breakdowns"]);
      if (row.isNew || row.workAssignmentEdited) fail("Equipment assignment changes are not allowed");
      if (section !== "sitePurchases" && row.persistedId !== old.id) fail(`${section} identity changed`);
      for (const key of editable[section].split(" ")) {
        if (!same(row[key], old[key])) fail(`Unrelated ${section} change: ${key}`);
      }
      for (const key of ["activitySegments", "activityAllocations", "breakdowns"]) {
        if ((row[key]?.length ?? 0) || (old[key]?.length ?? 0)) fail("Child equipment evidence requires ordinary editing");
      }
    });
  }
  if (!Array.isArray(form.progress) || form.progress.length !== saved.progress.length) fail("Progress rows cannot be added or removed");
  const patches = form.progress.map((row: any, index: number) => {
    const old = saved.progress[index];
    keysOnly(row, [...editable.progress.split(" "), ...permitted, "persistedId", "entryKey", "allocations", "uomOverrideReason", "isNew"]);
    if (row.uomOverrideReason || row.isNew) fail("Unrelated progress override");
    if (old.entryKey && row.entryKey !== old.entryKey) fail("Progress entry key changed");
    if (row.persistedId !== old.id) fail("Progress identity changed");
    for (const key of editable.progress.split(" ")) {
      // Legacy nullable booleans are rendered as false by SiteEdit.
      const bool = ["noSiteWork", "isIncidental"].includes(key);
      if (!same(bool ? !!row[key] : row[key], bool ? !!old[key] : old[key])) fail(`Unrelated progress change: ${key}`);
    }
    if ((row.allocations ?? []).length) fail("Cut/fill allocations cannot change");
    const patch: any = {};
    for (const key of permitted) patch[key] = row[key] === "" ? null : row[key] ?? null;
    for (const key of ["length", "quantity"]) {
      if (patch[key] != null && (!Number.isFinite(patch[key]) || patch[key] < 0)) fail(`Invalid ${key}`);
    }
    patch.chainageFromKm = parseChainageKm(patch.chainageFrom);
    patch.chainageToKm = parseChainageKm(patch.chainageTo);
    if (patch.chainageFromKm == null || patch.chainageToKm == null || patch.chainageToKm < patch.chainageFromKm) fail("Invalid chainage");
    if (permitted.some(key => !same(patch[key], old[key])) && !patch.chainageOverrideReason?.trim()) fail("An overlap/correction reason is required for each changed activity");
    return { id: old.id, patch };
  });
  if (!patches.some((p: any, i: number) => permitted.some(key => !same(p.patch[key], saved.progress[i][key])))) fail("No progress correction to save");
  return patches;
}

export async function saveDpr314Correction(database: any, form: any, actor: any, confirmation: any,
  validate: (candidate: any, original: any) => Promise<void>) {
  return database.transaction(async (tx: any) => {
    // Match ordinary DPR lock ordering: project, then DPR. No usage finalizer.
    await tx.execute(sql`SELECT id FROM boq_projects WHERE id = (SELECT boq_project_id FROM dprs WHERE id = 314) FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM dprs WHERE id = 314 FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM equipment_logs WHERE dpr_id=314 ORDER BY id FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM progress_entries WHERE dpr_id=314 ORDER BY id FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM vendor_bills WHERE id=48 FOR SHARE`);
    await tx.execute(sql`SELECT id FROM vendor_bill_items WHERE id=438 FOR SHARE`);
    const saved = await tx.query.dprs.findFirst({
      where: eq(dprs.id, 314),
      with: { progress: true, equipment: true, labour: true, materials: true, sitePurchases: true, structureItems: true },
    });
    if (!saved) fail("Report missing");
    saved.labour = await readWorkerNames(tx, saved.labour);
    const patches = planDpr314Correction(saved, form, actor, confirmation);
    const evidence = await tx.execute(sql`SELECT
      NOT EXISTS(SELECT 1 FROM equipment_usage WHERE id=188 OR source_usage_id=188) AS missing,
      EXISTS(SELECT 1 FROM vendor_bill_items i JOIN vendor_bills b ON b.id=i.bill_id
        WHERE i.id=438 AND i.bill_id=48 AND i.source='auto:dpr_equipment:741'
          AND i.qty=6.5 AND i.amount=5850 AND b.status='paid') AS paid,
      NOT EXISTS(SELECT 1 FROM equipment_activity_allocations WHERE equipment_log_id IN (SELECT id FROM equipment_logs WHERE dpr_id=314)) AS no_allocations,
      NOT EXISTS(SELECT 1 FROM equipment_activity_segments WHERE equipment_log_id IN (SELECT id FROM equipment_logs WHERE dpr_id=314)) AS no_segments`);
    const guard = evidence.rows?.[0] ?? evidence[0];
    if (!guard?.missing || !guard?.paid || !guard?.no_allocations || !guard?.no_segments) fail("Linked evidence changed; correction stopped");
    const after = saved.progress.map((row: any, i: number) => ({ ...row, ...patches[i].patch }));
    const candidate = { ...saved, progress: after.map((row: any) => ({ ...row, persistedId: row.id })) };
    await validate(candidate, saved);
    candidate.progress.forEach((row: any, i: number) => {
      const original = { ...after[i], persistedId: after[i].id };
      for (const key of ["quantitySource", "chainageReviewStatus"]) {
        if (!same(row[key], original[key])) {
          patches[i].patch[key] = row[key];
          after[i][key] = row[key];
          original[key] = row[key];
        }
      }
      if (!isDeepStrictEqual(row, original)) fail("Validation requires additional progress changes; correction stopped");
    });
    // Validators may enrich their temporary candidate; only the explicit
    // approved fields are written, preserving every row identity and history.
    for (const { id, patch } of patches) {
      await tx.update(progressEntries).set(patch).where(eq(progressEntries.id, id));
    }
    await tx.insert(auditLogs).values({
      module: "dpr", transactionId: 314, action: "admin_chainage_correction",
      userId: actor.id, userName: actor.fullName || actor.username || `Administrator ${actor.id}`,
      userRole: "admin", reason: confirmation.reason.trim(),
      oldValues: { progress: saved.progress, equipmentLogId: 741, missingUsageId: 188 },
      newValues: { progress: after, equipmentLogId: 741, retainedMissingUsageId: 188 },
      stockImpact: "None. Equipment, usage, diesel, stock, movement, hire and paid bill records preserved.",
    });
    return { ...saved, progress: after };
  });
}
