import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, equipmentMaster, hireStatements, vendorBillItems, vendorBills, vendors } from "../shared/schema";
import { confirmTripHireLink, readTripHireLinks, tripHireReview } from "./tripHireLink";
import { equipmentVendorIdentities } from "./equipmentVendorIdentity";
import { tripHireFingerprint, tripHireRegistration } from "../shared/tripHireLink";

export const tripMasterSelectionSchema = z.object({ equipmentId: z.number().int().positive().nullable() }).strict();
export const tripMasterPartyFields = {
  supplierVendorId: z.number().int().positive().nullable().optional(),
  materialSourceVendorId: z.number().int().positive().nullable().optional(),
};
export type TripMasterSelection = z.infer<typeof tripMasterSelectionSchema> & {
  actor: { id: number; fullName: string | null; isAdmin?: boolean; isOwner?: boolean };
};
const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };

/** Runs under the existing trip transaction and row lock, never as a second save. */
export async function prepareTripMasterSelection(tx: any, next: any, selection: TripMasterSelection, previous?: any) {
  if (next.isCancelled || next.isDeleted || previous?.isCancelled || previous?.isDeleted) fail("Cancelled or deleted trips cannot be edited.");
  for (const key of ["supplierVendorId", "materialSourceVendorId"]) {
    if (previous?.[key] != null && previous[key] !== next[key] &&
        !selection.actor.isAdmin && !selection.actor.isOwner)
      fail("An Administrator/Owner must review a conflicting saved vendor association.", 403);
    if (next[key] == null) continue;
    const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, next[key]));
    if (!vendor?.isActive) fail("Select an active Vendor Master.", 400);
    const nameKey = key === "supplierVendorId" ? "supplier" : "materialSourceSupplier";
    const normal = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!(previous?.[key] === next[key] && previous?.[nameKey] === next[nameKey]) &&
        ![vendor.name, vendor.businessName].filter(Boolean).some(n => normal(n) === normal(next[nameKey])))
      fail("The recorded party does not match the selected Vendor Master.", 400);
  }
  if (next.materialSourceType === "own_source" && next.materialSourceVendorId != null)
    fail("Own Source cannot have a material supplier.", 400);
  const oldLink = previous ? (await readTripHireLinks(tx, [previous.id])).get(previous.id) : null;
  const previousMatches = previous?.vehicleNumber ? (await tx.select().from(equipmentMaster))
    .filter((m: any) => tripHireRegistration(m.registrationNumber) === tripHireRegistration(previous.vehicleNumber)) : [];
  const ids = Array.from(new Set<number>([selection.equipmentId, next.internalEquipmentId,
    previous?.internalEquipmentId, oldLink?.newValues?.equipmentId, ...previousMatches.map((m: any) => m.id)].filter(Boolean))).sort((a,b)=>a-b);
  for (const id of ids) await tx.execute(sql`SELECT pg_advisory_xact_lock(1426, ${id})`);
  const changed = previous && (
    tripHireFingerprint(previous) !== tripHireFingerprint(next) ||
    ["supplierVendorId", "materialSourceVendorId", "internalEquipmentId", "materialSourceType", "materialSourceSupplier"]
      .some(key => (previous[key] ?? null) !== (next[key] ?? null)) ||
    (oldLink?.newValues?.equipmentId ?? previous.internalEquipmentId ?? null) !== selection.equipmentId);
  if (changed && ids.length) {
    const billed = await tx.select({ id: vendorBills.id }).from(vendorBillItems)
      .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId)).where(and(
        inArray(vendorBillItems.equipmentId, ids), inArray(vendorBillItems.date, [previous.date, next.date]),
        sql`${vendorBills.status} NOT IN ('cancelled', 'rejected')`,
      )).limit(1);
    const statements = await tx.select({ id: hireStatements.id }).from(hireStatements).where(and(
      inArray(hireStatements.equipmentId, ids),
      sql`((${hireStatements.periodFrom} <= ${previous.date} AND ${hireStatements.periodTo} >= ${previous.date}) OR (${hireStatements.periodFrom} <= ${next.date} AND ${hireStatements.periodTo} >= ${next.date}))`,
    )).limit(1);
    if (billed.length || statements.length) fail("This vehicle/date has billing evidence. Use the authorised historical correction process.");
  }
  if (selection.equipmentId == null) return;
  const [machine] = await tx.select().from(equipmentMaster).where(eq(equipmentMaster.id, selection.equipmentId));
  if (!machine || machine.isActive === false) fail("Select an active Equipment Master.", 400);
  if (tripHireRegistration(next.vehicleNumber) !== tripHireRegistration(machine.registrationNumber))
    fail("The vehicle registration does not match the selected Equipment Master.");
  if (machine.ownership === "owned") {
    if (next.transportType !== "in_house" || next.internalEquipmentId !== machine.id || next.supplierVendorId != null)
      fail("Owned equipment must use HLC transport, not an outside hire link.");
    return;
  }
  if (machine.ownership !== "hired" || next.transportType === "in_house")
    fail("The transport selection does not match the equipment ownership.");
  const identity = (await equipmentVendorIdentities(tx, [machine])).get(machine.id);
  // A previously reviewed one-time owner is not forced into Vendor Master on reopen.
  if (previous && !changed && (await tripHireReview(tx, next)).confirmation?.valid) return;
  // An explicit outside vendor can be recorded, but does not gain a hire confirmation.
  if (!identity?.auditId && next.supplierVendorId == null) return;
  if (!identity?.vendor?.isActive || identity.vendor.id !== next.supplierVendorId)
    fail("The transporter and confirmed equipment owner differ or need review. Use the authorised identity review.");
}

export async function saveTripMasterSelection(tx: any, trip: any, selection: TripMasterSelection, previous?: any) {
  for (const [key, role] of [["supplierVendorId", "transport"], ["materialSourceVendorId", "materialSource"]]) {
    if ((previous?.[key] ?? null) === (trip[key] ?? null)) continue;
    await tx.insert(auditLogs).values({ module: "vendor_identity", transactionId: trip.id,
      action: "confirm_vendor_identity", userId: selection.actor.id, userName: selection.actor.fullName,
      reason: "Master selected in trip form", oldValues: { role, vendorId: previous?.[key] ?? null },
      newValues: { role, vendorId: trip[key] ?? null } });
  }
  if (selection.equipmentId == null || trip.transportType === "in_house") {
    if (previous && (await readTripHireLinks(tx, [trip.id])).get(trip.id)?.newValues?.equipmentId) {
      await tx.insert(auditLogs).values({ module: "site_material_trips", transactionId: trip.id,
        action: "confirm_hire_equipment", userId: selection.actor.id, userName: selection.actor.fullName,
        reason: "Equipment selection cleared in trip form", newValues: { equipmentId: null } });
    }
    return;
  }
  const review = await tripHireReview(tx, trip);
  if (review.confirmation?.valid && review.confirmation.equipmentId === selection.equipmentId) return;
  if (trip.supplierVendorId == null) return;
  await confirmTripHireLink(tx, trip, { equipmentId: selection.equipmentId,
    reason: "Master selected in trip form", fingerprint: review.fingerprint, version: review.version },
    selection.actor, !previous);
}
