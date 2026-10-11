import { and, eq, gte, lte, sql } from "drizzle-orm";
import { equipmentMaster, hireStatements, siteMaterialTrips, vendorBillItems, vendorBills, vendors } from "../shared/schema";
import { equipmentVendorIdentities, ownerNameKey } from "./equipmentVendorIdentity";
import { readTripHireLinks } from "./tripHireLink";
import { validTripHireLink } from "../shared/tripHireLink";

export async function tripHireEligibility(db: any, vendorName: string, from: string, to: string) {
  const equipment = await db.select().from(equipmentMaster);
  const identities = await equipmentVendorIdentities(db, equipment);
  const selected = (await db.select().from(vendors)).filter((v: any) => ownerNameKey(v.name) === ownerNameKey(vendorName));
  const trips = await db.select().from(siteMaterialTrips).where(and(gte(siteMaterialTrips.date, from), lte(siteMaterialTrips.date, to)));
  const confirmations = await readTripHireLinks(db, trips.map((t: any) => t.id));
  const statements = await db.select().from(hireStatements).where(and(lte(hireStatements.periodFrom, to), gte(hireStatements.periodTo, from)));
  const billed = await db.select({ equipmentId: vendorBillItems.equipmentId, date: vendorBillItems.date, billNo: vendorBills.billNo })
    .from(vendorBillItems).innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
    .where(and(gte(vendorBillItems.date, from), lte(vendorBillItems.date, to), sql`${vendorBills.status} NOT IN ('cancelled', 'rejected')`));
  return trips.flatMap((trip: any) => {
    const confirmation = confirmations.get(trip.id);
    if (!confirmation) return [];
    const machine = equipment.find((e: any) => e.id === confirmation.newValues?.equipmentId);
    const identity = identities.get(machine?.id);
    const reasons: string[] = [];
    if (!validTripHireLink(trip, machine, confirmation.newValues)) reasons.push("Invalid confirmation: trip or equipment identity changed, or trip cancelled/deleted");
    if (!identity?.vendor) reasons.push(identity?.conflict || "Missing Vendor Master link");
    else if (!identity.vendor.isActive) reasons.push("Linked Vendor Master is inactive");
    else if (selected.length !== 1 || selected[0].id !== identity.vendor.id) reasons.push(`Wrong vendor: linked to ${identity.vendor.name}`);
    if (machine?.hireBillingBasis !== "daily" || !(Number(machine?.hireRate) > 0) || !machine?.hireStartDate)
      reasons.push("Missing daily-hire terms");
    if (machine?.hireStartDate && (trip.date < machine.hireStartDate || (machine.hireEndDate && trip.date > machine.hireEndDate)))
      reasons.push("Outside hire period");
    const previous = billed.find((b: any) => b.equipmentId === machine?.id && b.date === trip.date);
    if (previous) reasons.push(`Already billed: ${previous.billNo}`);
    if (statements.some((s: any) => s.equipmentId === machine?.id && s.periodFrom <= trip.date && s.periodTo >= trip.date))
      reasons.push("Overlapping hire statement");
    return [{ tripId: trip.id, date: trip.date, registration: trip.vehicleNumber, recordedOwner: machine?.vendorName,
      vendorId: identity?.vendor?.id, linkedVendor: identity?.vendor?.name, reasons }];
  });
}
