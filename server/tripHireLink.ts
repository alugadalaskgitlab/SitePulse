import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, equipmentMaster, hireStatements, siteMaterialTrips, vendorBillItems, vendorBills } from "../shared/schema";
import { tripHireFingerprint, tripHireMatch, tripHireRegistration, tripHireVendor, validTripHireLink } from "../shared/tripHireLink";

export const TRIP_HIRE_LINK_ACTION = "confirm_hire_equipment";
export type NewTripHireLink = { equipmentId: number; reason: string; acceptConflict?: boolean;
  actor: { id: number; fullName: string | null } };
export async function readTripHireLinks(executor: any, ids: number[]) {
  const rows = ids.length ? await executor.select().from(auditLogs).where(and(
    eq(auditLogs.module, "site_material_trips"), eq(auditLogs.action, TRIP_HIRE_LINK_ACTION),
    inArray(auditLogs.transactionId, ids),
  )).orderBy(desc(auditLogs.id)) : [];
  const links = new Map<number, any>();
  for (const row of rows) if (!links.has(row.transactionId)) links.set(row.transactionId, row);
  return links;
}
export async function tripHireReview(executor: any, trip: any) {
  const equipment = await executor.select().from(equipmentMaster);
  const link = (await readTripHireLinks(executor, [trip.id])).get(trip.id);
  return {
    ...tripHireMatch(trip, equipment), fingerprint: tripHireFingerprint(trip), version: link?.id ?? null,
    confirmation: link ? { ...link.newValues, actor: link.userName, at: link.createdAt, reason: link.reason,
      valid: validTripHireLink(trip, equipment.find((e: any) => e.id === link.newValues?.equipmentId), link.newValues) } : null,
    equipment: equipment.filter((e: any) => e.ownership === "hired").map((e: any) => ({
      id: e.id, name: e.name, registrationNumber: e.registrationNumber, vendorName: e.vendorName,
      hireBillingBasis: e.hireBillingBasis, hireRate: e.hireRate,
    })),
  };
}
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });
export async function guardTripHireOrdinaryItems(executor: any, items: any[], groups: any[] = [], billId?: number) {
  const ids = Array.from(new Set<number>([...items.map(i => i.equipmentId), ...groups.map(g => g.equipmentId)].filter(Boolean))).sort((a, b) => a - b);
  for (const id of ids) await executor.execute(sql`SELECT pg_advisory_xact_lock(1426, ${id})`);
  for (const item of items.filter(i => !["hire_group", "hire_statement"].includes(i.source) && i.equipmentId && i.date && i.category?.toLowerCase() === "equipment")) {
    const [existing] = await executor.select({ id: hireStatements.id }).from(hireStatements).where(and(
      eq(hireStatements.equipmentId, item.equipmentId), eq(hireStatements.billingBasis, "daily"),
      sql`${hireStatements.periodFrom} <= ${item.date}`, sql`${hireStatements.periodTo} >= ${item.date}`,
      ...(billId ? [sql`(${hireStatements.vendorBillId} IS NULL OR ${hireStatements.vendorBillId} <> ${billId})`] : []),
    )).limit(1);
    if (existing) throw Object.assign(conflict("An existing daily hire statement already covers this vehicle/date."), { code: "CONFLICT" });
  }
}
/** Called inside the trip/bill identity transaction; only appends audit evidence. */
export async function confirmTripHireLink(executor: any, trip: any, input: {
  equipmentId: number; reason: string; acceptConflict?: boolean; fingerprint?: string; version?: number | null;
}, actor: { id: number; fullName: string | null }, isNew = false) {
  if (trip.isCancelled || trip.isDeleted) throw conflict("Cancelled/deleted trips cannot be linked for hire billing.");
  const review = await tripHireReview(executor, trip);
  if (!isNew && (input.fingerprint !== review.fingerprint || input.version !== review.version))
    throw conflict("Trip or confirmation changed. Reload and review again.");
  const equipment = review.equipment.find((e: any) => e.id === input.equipmentId);
  if (!equipment || !tripHireVendor(equipment.vendorName)) throw conflict("Select hired equipment with a recorded vendor.");
  if (!input.reason?.trim()) throw conflict("A confirmation reason/reference is required.");
  if (review.suggestedEquipmentId !== input.equipmentId && !input.acceptConflict)
    throw conflict("Registration or vendor is uncertain. Explicitly acknowledge the identity conflict.");
  const previousId = review.confirmation?.equipmentId;
  for (const id of Array.from(new Set<number>([input.equipmentId, previousId].filter(Boolean))).sort((a, b) => a - b))
    await executor.execute(sql`SELECT pg_advisory_xact_lock(1426, ${id})`);
  if (!isNew) {
    const ids = [input.equipmentId, previousId].filter(Boolean);
    const billed = await executor.select({ id: vendorBills.id }).from(vendorBillItems)
      .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId)).where(and(
        inArray(vendorBillItems.equipmentId, ids), eq(vendorBillItems.date, trip.date),
        sql`${vendorBills.status} NOT IN ('cancelled', 'rejected')`,
      )).limit(1);
    const statements = await executor.select({ id: hireStatements.id }).from(hireStatements).where(and(
      inArray(hireStatements.equipmentId, ids), sql`${hireStatements.periodFrom} <= ${trip.date}`,
      sql`${hireStatements.periodTo} >= ${trip.date}`,
    )).limit(1);
    if (billed.length || statements.length) throw conflict("This vehicle/date has billing evidence. Its hire link cannot be changed.");
  }
  const evidence = { equipmentId: equipment.id, tripFingerprint: review.fingerprint,
    registration: tripHireRegistration(equipment.registrationNumber), vendor: tripHireVendor(equipment.vendorName),
    originalVehicleNumber: trip.vehicleNumber, originalSupplier: trip.supplier,
    manualConflictAccepted: review.suggestedEquipmentId !== equipment.id, previousAuditId: review.version };
  await executor.insert(auditLogs).values({ module: "site_material_trips", transactionId: trip.id,
    action: TRIP_HIRE_LINK_ACTION, userId: actor.id, userName: actor.fullName || `User #${actor.id}`,
    reason: input.reason.trim(), oldValues: review.confirmation, newValues: evidence });
  return evidence;
}
