import { and, gte, lte } from "drizzle-orm";
import { equipmentMaster, siteMaterialTrips, vendors } from "../shared/schema";
import { equipmentVendorIdentities, ownerNameKey, dailyHireOwnerEligible } from "./equipmentVendorIdentity";
import { readTripHireLinks } from "./tripHireLink";
import { validTripHireLink, tripHireRegistration } from "../shared/tripHireLink";
import { dailyHireBilledDays } from "./dailyHireBilledDays";

export async function tripHireEligibility(db: any, vendorName: string, from: string, to: string, excludeBillId?: number) {
  const equipment = await db.select().from(equipmentMaster);
  const identities = await equipmentVendorIdentities(db, equipment);
  const selected = (await db.select().from(vendors)).filter((v: any) => ownerNameKey(v.name) === ownerNameKey(vendorName));
  const trips = await db.select().from(siteMaterialTrips).where(and(gte(siteMaterialTrips.date, from), lte(siteMaterialTrips.date, to)));
  const confirmations = await readTripHireLinks(db, trips.map((t: any) => t.id));
  const billedByEquipment = new Map<number, Awaited<ReturnType<typeof dailyHireBilledDays>>>();
  for (const e of equipment) {
    if (e.hireBillingBasis === "daily") billedByEquipment.set(e.id, await dailyHireBilledDays(db, e.id, from, to, excludeBillId));
  }
  return trips.flatMap((trip: any) => {
    const confirmation = confirmations.get(trip.id);
    const matches = equipment.filter((e: any) => tripHireRegistration(trip.vehicleNumber) &&
      tripHireRegistration(e.registrationNumber) === tripHireRegistration(trip.vehicleNumber));
    const machine = confirmation ? equipment.find((e: any) => e.id === confirmation.newValues?.equipmentId)
      : matches.length === 1 ? matches[0] : undefined;
    if (!confirmation && !machine) return [];
    const identity = identities.get(machine?.id);
    const reasons: string[] = [];
    if (!confirmation) reasons.push("Hire Billing Link not confirmed — open this trip in Material Trip Register and confirm its hired vehicle.");
    else if (!validTripHireLink(trip, machine, confirmation.newValues)) reasons.push("Invalid confirmation: trip or equipment identity changed, or trip cancelled/deleted — review the original trip and reconfirm its Hire Billing Link.");
    if (identity?.auditId && !identity?.vendor) reasons.push(`${identity.conflict} — an Administrator/Owner must reconfirm Equipment owner in Vendor Master → Link Vendors.`);
    else if (!identity?.vendor && ownerNameKey(machine?.vendorName) !== ownerNameKey(vendorName)) reasons.push("Missing Vendor Master link — confirm the equipment owner in Vendor Master → Link Vendors, or select its recorded owner for one-time free-text billing.");
    else if (identity?.vendor && !identity.vendor.isActive) reasons.push("Linked Vendor Master is inactive — ask an Administrator/Owner to review that master.");
    else if (identity?.vendor && (selected.length !== 1 || selected[0].id !== identity.vendor.id)) reasons.push(`Wrong vendor: linked to ${identity.vendor.name} — select that reviewed vendor in Equipment Hire.`);
    if (!dailyHireOwnerEligible(identity, trip.supplierVendorId) && trip.supplierVendorId != null)
      reasons.push("Reviewed trip transporter and equipment owner do not agree — an Administrator/Owner must review both roles in Vendor Master → Link Vendors.");
    if (machine?.hireBillingBasis !== "daily" || !(Number(machine?.hireRate) > 0) || !machine?.hireStartDate)
      reasons.push("Missing daily-hire terms — set Daily Hire, a positive daily rate and hire start date in Equipment Master.");
    if (machine?.hireStartDate && (trip.date < machine.hireStartDate || (machine.hireEndDate && trip.date > machine.hireEndDate)))
      reasons.push("Outside hire period — check the agreed hire dates in Equipment Master.");
    const billedDays = billedByEquipment.get(machine?.id) || [];
    const previous = billedDays.find(b => b.date === trip.date);
    if (previous) reasons.push(`Already billed: ${previous.billNo} — exclude this date with a reason.`);
    return [{ tripId: trip.id, date: trip.date, registration: trip.vehicleNumber, recordedOwner: machine?.vendorName,
      equipmentId: machine?.id, billedDays, vendorId: identity?.vendor?.id, linkedVendor: identity?.vendor?.name, reasons }];
  });
}
