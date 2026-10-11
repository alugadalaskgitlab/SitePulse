import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, siteMaterialTrips, vendors } from "../shared/schema";
import { readTripHireLinks } from "./tripHireLink";

export const tripIdentityLinksInput = z.object({
  supplierVendorId: z.number().int().positive().optional(),
  materialSourceVendorId: z.number().int().positive().optional(),
  expectedSupplierVendorId: z.number().int().positive().nullable(),
  expectedMaterialSourceVendorId: z.number().int().positive().nullable(),
  expectedSupplier: z.string().nullable(),
  expectedMaterialSourceSupplier: z.string().nullable(),
  reason: z.string().trim().min(3).max(2000),
}).strict();

/** Caller holds the trip row lock and has checked Admin/Owner and site access. */
export async function confirmTripPartyIdentities(tx: any, trip: any, input: z.infer<typeof tripIdentityLinksInput>, actor: any) {
  const fail = (message: string) => { throw Object.assign(new Error(message), { status: 409 }); };
  if (trip.isCancelled || trip.isDeleted) fail("Cancelled/deleted trips cannot be linked.");
  if ((trip.supplier ?? null) !== input.expectedSupplier ||
      (trip.materialSourceSupplier ?? null) !== input.expectedMaterialSourceSupplier)
    fail("Recorded parties changed. Reload and review.");
  if ((trip.supplierVendorId ?? null) !== input.expectedSupplierVendorId ||
      (trip.materialSourceVendorId ?? null) !== input.expectedMaterialSourceVendorId)
    fail("Party links changed. Reload and review.");
  const existingVehicle = (await readTripHireLinks(tx, [trip.id])).get(trip.id)?.newValues?.equipmentId;
  if (existingVehicle) await tx.execute(sql`SELECT pg_advisory_xact_lock(1426, ${existingVehicle})`);
  const patch: Record<string, number> = {};
  for (const [key, role, name] of [
    ["supplierVendorId", "transport", trip.supplier],
    ["materialSourceVendorId", "materialSource", trip.materialSourceSupplier],
  ] as const) {
    const targetId = input[key];
    if (targetId === undefined || targetId === trip[key]) continue;
    if (!name?.trim()) fail("The selected party has no recorded name; use the authorised role correction first.");
    if (key === "materialSourceVendorId" && trip.materialSourceType === "own_source") fail("Own Source has no material vendor.");
    if (key === "supplierVendorId" && trip.transportType === "in_house") fail("Own-vehicle transport has no external transporter.");
    const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, targetId));
    if (!vendor?.isActive) fail("Select an active Vendor Master.");
    patch[key] = targetId;
    await tx.insert(auditLogs).values({ module: "vendor_identity", transactionId: trip.id,
      action: "confirm_vendor_identity", userId: actor.id, userName: actor.fullName,
      reason: input.reason, oldValues: { role, recordedName: name, vendorId: trip[key] ?? null },
      newValues: { role, recordedName: name, vendorId: targetId } });
  }
  if (Object.keys(patch).length) await tx.update(siteMaterialTrips).set(patch).where(eq(siteMaterialTrips.id, trip.id));
  return { ...trip, ...patch };
}
