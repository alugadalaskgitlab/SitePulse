import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  equipmentMaster,
  hireStatements,
  siteMaterialTrips,
  vendorBillItems,
  vendorBills,
  vendors,
} from "../shared/schema";
import {
  matchUniqueHiredEquipment,
  siteMaterialTripSourceTransportFingerprint,
  sourceTransportBillDecision,
  type HiredEquipmentCandidate,
} from "../shared/siteMaterialTripSourceTransport";
import { classifyTripRoles } from "../shared/tripTransportRoles";
import { tripBillIdentity } from "../shared/vendorBillArrangement";
import { siteMatchesPermitted } from "../shared/siteName";
import { db } from "./db";
import { equipmentVendorIdentities } from "./equipmentVendorIdentity";
import { resolveVendorNameMatch } from "./vendorNameResolution";
import { confirmTripHireLink, readTripHireLinks, tripHireReview } from "./tripHireLink";

type PermittedSites = string[] | null | undefined;
type Actor = { userId: number; userName: string; userRole?: string | null };
type MaterialSourceChoice =
  | { type: "own_source"; label: string }
  | { type: "vendor"; vendorId: number };
type TransportChoice = { type: "agency_vendor" } | { type: "in_house" };

const conflict = (message: string) => Object.assign(new Error(message), { code: "SOURCE_TRANSPORT_CONFLICT" });
const badRequest = (message: string) => Object.assign(new Error(message), { code: "BAD_REQUEST" });
const nameKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const registrationKey = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function assertTripIds(tripIds: number[]) {
  const ids = tripIds.map(Number);
  if (!ids.length || ids.length > 1000 ||
      ids.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(ids).size !== ids.length) {
    throw badRequest("Choose between 1 and 1,000 unique trips.");
  }
  return ids.sort((a, b) => a - b);
}

function billStatusRank(status: string) {
  return status === "paid" ? 4 : status === "approved" ? 3 : status === "verified" ? 2 : 1;
}

async function loadActiveTripBillLinks(executor: any, tripIds: number[]) {
  if (!tripIds.length) return new Map<number, any[]>();
  const rows = await executor.select({
    source: vendorBillItems.source,
    billNo: vendorBills.billNo,
    status: vendorBills.status,
    billDate: vendorBills.billDate,
  }).from(vendorBillItems)
    .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
    .where(and(
      sql`lower(coalesce(${vendorBillItems.source}, '')) LIKE 'auto:site_material_trip%'`,
      sql`coalesce(${vendorBills.isDeleted}, false) = false`,
      sql`coalesce(${vendorBills.isCancelled}, false) = false`,
    ));
  const byTrip = new Map<number, any[]>();
  for (const row of rows) {
    const identity = tripBillIdentity(row.source);
    const status = String(row.status ?? "draft").toLowerCase();
    if (!identity || !tripIds.includes(identity.tripId) || ["cancelled", "rejected"].includes(status)) continue;
    const list = byTrip.get(identity.tripId) ?? [];
    list.push({ billNo: row.billNo, status, billDate: row.billDate, role: identity.role });
    byTrip.set(identity.tripId, list);
  }
  byTrip.forEach((list: any[]) => list.sort((a: any, b: any) =>
    billStatusRank(b.status) - billStatusRank(a.status) ||
    String(b.billDate ?? "").localeCompare(String(a.billDate ?? ""))
  ));
  return byTrip;
}

async function transporterVendorId(executor: any, trip: any): Promise<number | null> {
  if (trip.supplierVendorId != null) return Number(trip.supplierVendorId);
  const name = String(trip.supplier ?? "").trim();
  if (!name) return null;
  const match = await resolveVendorNameMatch(name, executor);
  return match?.vendorId ?? null;
}

function siteAllowed(site: string, permittedSiteNames: PermittedSites) {
  if (permittedSiteNames == null) return true;
  if (permittedSiteNames.length === 0) return false;
  return siteMatchesPermitted(site, permittedSiteNames);
}

async function buildPreview(executor: any, trips: any[], permittedSiteNames: PermittedSites) {
  const equipment = await executor.select().from(equipmentMaster);
  const identities = await equipmentVendorIdentities(executor, equipment);
  const vendorsList = await executor.select().from(vendors);
  const ids = trips.map((trip) => trip.id);
  const billsByTrip = await loadActiveTripBillLinks(executor, ids);
  const sites = Array.from(new Set(trips.map((trip) => trip.site)));
  const sourceLabels = sites.length ? await executor.select({
    label: siteMaterialTrips.materialSourceLabel,
  }).from(siteMaterialTrips).where(and(
    inArray(siteMaterialTrips.site, sites),
    eq(siteMaterialTrips.materialSourceType, "own_source"),
    sql`coalesce(trim(${siteMaterialTrips.materialSourceLabel}), '') <> ''`,
    sql`coalesce(${siteMaterialTrips.isCancelled}, false) = false`,
    sql`coalesce(${siteMaterialTrips.isDeleted}, false) = false`,
  )) : [];
  const sourcePlaceSuggestions: string[] = Array.from(new Set<string>(sourceLabels
    .map((row: any) => String(row.label).trim())))
    .sort((a: string, b: string) => a.localeCompare(b));
  const rows: any[] = [];
  const excluded: any[] = [];
  const transporterIdCache = new Map<string, number | null>();

  for (const trip of trips) {
    const linkedBills = billsByTrip.get(trip.id) ?? [];
    const { lockedBill, warningBills } = sourceTransportBillDecision(linkedBills);
    if (lockedBill) {
      excluded.push({
        tripId: trip.id,
        billNo: lockedBill.billNo,
        status: lockedBill.status,
        reason: `Already on ${lockedBill.status} bill #${lockedBill.billNo}`,
      });
      continue;
    }
    if (trip.isCancelled || trip.isDeleted) {
      excluded.push({ tripId: trip.id, reason: "Cancelled or deleted trip" });
      continue;
    }
    if (!siteAllowed(trip.site, permittedSiteNames)) {
      excluded.push({ tripId: trip.id, reason: "Outside your site access" });
      continue;
    }

    const transporterKey = nameKey(trip.supplier);
    let ownerVendorId: number | null = trip.supplierVendorId == null ? null : Number(trip.supplierVendorId);
    if (ownerVendorId == null && transporterKey) {
      if (!transporterIdCache.has(transporterKey)) {
        transporterIdCache.set(transporterKey, await transporterVendorId(executor, trip));
      }
      ownerVendorId = transporterIdCache.get(transporterKey) ?? null;
    }
    const hiredCandidates = equipment
      .filter((entry: any) => entry.ownership === "hired" && Number(entry.isActive ?? 0) === 1)
      .map((entry: any) => ({
        id: Number(entry.id),
        name: entry.name,
        registrationNumber: entry.registrationNumber,
        vendorName: entry.vendorName,
        vendorId: identities.get(entry.id)?.vendor?.id ?? null,
        vendor: identities.get(entry.id)?.vendor?.name ?? null,
        ownership: entry.ownership,
        isActive: Number(entry.isActive ?? 0) === 1,
      }));
    const transporterEquipment = ownerVendorId == null ? [] : hiredCandidates.filter((entry: any) =>
      entry.vendorId === ownerVendorId && identities.get(entry.id)?.vendor?.isActive
    );
    const match = matchUniqueHiredEquipment(trip.vehicleNumber, ownerVendorId, transporterEquipment);
    const ownedEquipment = equipment.filter((entry: any) =>
      entry.ownership === "owned" &&
      Number(entry.isActive ?? 0) === 1 &&
      registrationKey(entry.registrationNumber) === registrationKey(trip.vehicleNumber) &&
      !!registrationKey(trip.vehicleNumber)
    ).map((entry: any) => ({
      id: Number(entry.id),
      name: entry.name,
      registrationNumber: entry.registrationNumber,
      ownership: entry.ownership,
    }));
    const agencyBlockedReason = !String(trip.supplier ?? "").trim()
      ? "No transporter is recorded; the agency transport role cannot be confirmed without changing the trip."
      : null;
    const bills = warningBills;
    rows.push({
      trip,
      fingerprint: siteMaterialTripSourceTransportFingerprint(trip),
      transporterVendorId: ownerVendorId,
      currentRole: classifyTripRoles(trip),
      proposedEquipment: match.match ? {
        id: match.match.id,
        name: hiredCandidates.find((entry: any) => entry.id === match.match!.id)?.name,
        registrationNumber: match.match.registrationNumber,
        linkedVendorName: hiredCandidates.find((entry: any) => entry.id === match.match!.id)?.vendor,
        matchReason: match.reason,
      } : null,
      equipmentMatchReason: match.reason,
      equipmentChoices: transporterEquipment.map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        registrationNumber: entry.registrationNumber,
        ownerVendorId: entry.vendorId,
        linkedVendorName: entry.vendor,
      })),
      ownedEquipmentChoices: ownedEquipment,
      bill: bills[0] ?? null,
      bills,
      agencyBlockedReason,
    });
  }
  return {
    rows,
    excluded,
    sourcePlaceSuggestions,
    vendors: vendorsList.filter((vendor: any) => vendor.isActive).map((vendor: any) => ({
      id: vendor.id, name: vendor.name,
    })),
  };
}

export async function previewSiteMaterialTripSourceTransport(
  tripIds: number[],
  permittedSiteNames: PermittedSites,
) {
  const ids = assertTripIds(tripIds);
  if (permittedSiteNames?.length === 0) throw conflict("The selected trips are outside your site access.");
  const trips = await db.select().from(siteMaterialTrips)
    .where(inArray(siteMaterialTrips.id, ids))
    .orderBy(asc(siteMaterialTrips.id));
  if (trips.length !== ids.length) throw conflict("A selected trip no longer exists. Refresh and review again.");
  if (trips.some((trip) => !siteAllowed(trip.site, permittedSiteNames))) {
    throw conflict("The selected trips are outside your site access.");
  }
  return buildPreview(db, trips, permittedSiteNames);
}

export async function applySiteMaterialTripSourceTransport(input: {
  tripIds: number[];
  materialSource: MaterialSourceChoice;
  transport: TransportChoice;
  equipmentByTripId: Record<string, number | null>;
  reason: string;
  expectedFingerprints: Record<string, string>;
  permittedSiteNames?: string[] | null;
  actor: Actor;
}) {
  const ids = assertTripIds(input.tripIds);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) throw badRequest("Enter a reason (at least 3 characters).");
  if (!input.expectedFingerprints || ids.some((id) => !input.expectedFingerprints[String(id)])) {
    throw badRequest("Refresh the preview before applying this change.");
  }
  if (input.materialSource.type === "own_source" && !input.materialSource.label.trim()) {
    throw badRequest("Enter the own-source place name.");
  }

  return db.transaction(async (tx) => {
    if (input.permittedSiteNames?.length === 0) throw conflict("The selected trips are outside your site access.");
    const trips = await tx.select().from(siteMaterialTrips)
      .where(inArray(siteMaterialTrips.id, ids))
      .orderBy(asc(siteMaterialTrips.id))
      .for("update");
    if (trips.length !== ids.length || trips.some((trip) =>
      !siteAllowed(trip.site, input.permittedSiteNames) || trip.isCancelled || trip.isDeleted
    )) {
      throw conflict("A selected trip is no longer available in your site access. Refresh and review again.");
    }
    for (const trip of trips) {
      if (siteMaterialTripSourceTransportFingerprint(trip) !== input.expectedFingerprints[String(trip.id)]) {
        throw conflict(`Trip #${trip.id} changed after preview. Refresh and review again.`);
      }
    }
    const billStatusMap = await loadActiveTripBillLinks(tx, ids);
    const billLocked = trips.flatMap((trip) => (billStatusMap.get(trip.id) ?? [])
      .filter((bill) => ["approved", "paid"].includes(bill.status))
      .map((bill) => ({ tripId: trip.id, ...bill })));
    if (billLocked.length) {
      throw conflict(`Trip #${billLocked[0].tripId} is already on ${billLocked[0].status} bill #${billLocked[0].billNo}.`);
    }

    let materialVendor: any = null;
    if (input.materialSource.type === "vendor") {
      [materialVendor] = await tx.select().from(vendors).where(and(
        eq(vendors.id, input.materialSource.vendorId),
        eq(vendors.isActive, true),
      )).limit(1);
      if (!materialVendor) throw conflict("Choose an active Vendor Master entry.");
    }

    const equipment = await tx.select().from(equipmentMaster);
    const identities = await equipmentVendorIdentities(tx, equipment);
    const equipmentById = new Map(equipment.map((entry: any) => [Number(entry.id), entry]));
    const previousLinks = await readTripHireLinks(tx, ids);
    const updates: { trip: any; next: any; sourceEquipmentId: number | null }[] = [];

    for (const trip of trips) {
      const equipmentId = input.equipmentByTripId?.[String(trip.id)] == null
        ? null : Number(input.equipmentByTripId[String(trip.id)]);
      let materialSourceSupplier: string | null;
      let materialSourceType: "vendor" | "own_source";
      let materialSourceLabel: string | null;
      let materialSourceVendorId: number | null;
      if (input.materialSource.type === "own_source") {
        materialSourceSupplier = null;
        materialSourceType = "own_source";
        materialSourceLabel = input.materialSource.label.trim();
        materialSourceVendorId = null;
      } else {
        materialSourceType = "vendor";
        materialSourceLabel = null;
        materialSourceVendorId = materialVendor.id;
        // If the selected vendor is already the recorded transporter, retain
        // the trip's established alias spelling so the shared role classifier
        // can recognize the same party without rewriting transporter facts.
        const recordedTransporterId = trip.supplierVendorId ?? (await transporterVendorId(tx, trip));
        materialSourceSupplier = recordedTransporterId === materialVendor.id
          ? (trip.supplier || materialVendor.name)
          : materialVendor.name;
      }

      let transportType: "agency_vendor" | "in_house";
      let internalEquipmentId: number | null;
      if (input.transport.type === "in_house") {
        if (String(trip.supplier ?? "").trim() || trip.supplierVendorId != null) {
          throw conflict(`Trip #${trip.id} already records a transporter; in-house cannot be set without changing that fact.`);
        }
        if (!equipmentId) throw conflict(`Choose an owned Equipment Master vehicle for trip #${trip.id}.`);
        const selected = equipmentById.get(equipmentId) as any;
        if (!selected || selected.ownership !== "owned" || Number(selected.isActive ?? 0) !== 1 ||
            registrationKey(selected.registrationNumber) !== registrationKey(trip.vehicleNumber)) {
          throw conflict(`The selected owned vehicle does not exactly match trip #${trip.id}'s recorded registration.`);
        }
        transportType = "in_house";
        internalEquipmentId = equipmentId;
      } else {
        if (!String(trip.supplier ?? "").trim()) {
          throw conflict(`Trip #${trip.id} has no recorded transporter. This tool will not add or change a transporter name.`);
        }
        transportType = "agency_vendor";
        internalEquipmentId = null;
        if (equipmentId) {
          const selected = equipmentById.get(equipmentId) as any;
          const transporterId = trip.supplierVendorId ?? (await transporterVendorId(tx, trip));
          const ownerIdentity = identities.get(equipmentId)?.vendor;
          if (!selected || selected.ownership !== "hired" || Number(selected.isActive ?? 0) !== 1 ||
              !ownerIdentity?.isActive || ownerIdentity.id !== transporterId) {
            throw conflict(`The selected hired vehicle for trip #${trip.id} does not belong to its recorded transporter.`);
          }
        }
      }

      const next = {
        materialSourceSupplier,
        materialSourceType,
        materialSourceLabel,
        materialSourceVendorId,
        transportType,
        internalEquipmentId,
      };
      const role = classifyTripRoles({ ...trip, ...next });
      if (role === "unresolved") {
        throw conflict(`The selected source and transport leave trip #${trip.id} unresolved. Review the vendor identities and choices.`);
      }
      updates.push({ trip, next, sourceEquipmentId: input.transport.type === "agency_vendor" ? equipmentId : null });
    }

    let updatedCount = 0;
    for (const { trip, next, sourceEquipmentId } of updates) {
      const [updated] = await tx.update(siteMaterialTrips)
        .set(next)
        .where(eq(siteMaterialTrips.id, trip.id))
        .returning();
      if (!updated) throw conflict(`Trip #${trip.id} could not be updated.`);
      await tx.insert(auditLogs).values({
        module: "site_material_trips",
        transactionId: trip.id,
        action: "edit",
        userId: input.actor.userId,
        userName: input.actor.userName,
        userRole: input.actor.userRole ?? null,
        oldValues: {
          materialSourceSupplier: trip.materialSourceSupplier,
          materialSourceType: trip.materialSourceType,
          materialSourceLabel: trip.materialSourceLabel,
          materialSourceVendorId: trip.materialSourceVendorId,
          transportType: trip.transportType,
          internalEquipmentId: trip.internalEquipmentId,
        },
        newValues: next,
        reason,
      });

      const previousLink = previousLinks.get(trip.id);
      const previousEquipmentId = previousLink?.newValues?.equipmentId ?? null;
      if (sourceEquipmentId != null) {
        const review = await tripHireReview(tx, updated);
        await confirmTripHireLink(tx, updated, {
          equipmentId: sourceEquipmentId,
          reason,
          acceptConflict: true,
          fingerprint: review.fingerprint,
          version: review.version,
        }, { id: input.actor.userId, fullName: input.actor.userName });
      } else if (previousEquipmentId != null) {
        const existingBill = await tx.select({ id: vendorBillItems.id })
          .from(vendorBillItems)
          .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
          .where(and(
            eq(vendorBillItems.equipmentId, Number(previousEquipmentId)),
            eq(vendorBillItems.date, trip.date),
            sql`${vendorBills.status} NOT IN ('cancelled', 'rejected')`,
            sql`coalesce(${vendorBills.isDeleted}, false) = false`,
            sql`coalesce(${vendorBills.isCancelled}, false) = false`,
          )).limit(1);
        const existingStatement = await tx.select({ id: hireStatements.id })
          .from(hireStatements)
          .where(and(
            eq(hireStatements.equipmentId, Number(previousEquipmentId)),
            sql`${hireStatements.periodFrom} <= ${trip.date}`,
            sql`${hireStatements.periodTo} >= ${trip.date}`,
          )).limit(1);
        if (existingBill.length || existingStatement.length) {
          throw conflict(`The hired-equipment link for trip #${trip.id} has billing evidence and cannot be cleared.`);
        }
        await tx.insert(auditLogs).values({
          module: "site_material_trips",
          transactionId: trip.id,
          action: "confirm_hire_equipment",
          userId: input.actor.userId,
          userName: input.actor.userName,
          userRole: input.actor.userRole ?? null,
          oldValues: previousLink.newValues,
          newValues: { equipmentId: null, previousAuditId: previousLink.id, cleared: true },
          reason,
        });
      }
      updatedCount += 1;
    }
    return { updatedCount };
  });
}
