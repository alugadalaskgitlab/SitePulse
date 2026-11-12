export type SourceTransportTrip = {
  id: number;
  date: string | Date;
  site: string;
  material: string;
  supplier: string | null;
  supplierVendorId: number | null;
  materialSourceSupplier: string | null;
  materialSourceType: string | null;
  materialSourceLabel: string | null;
  materialSourceVendorId: number | null;
  vehicleNumber: string | null;
  transportType: string | null;
  internalEquipmentId: number | null;
  quantity?: number;
  uom?: string;
  receiptNumber?: string | null;
  time?: string | null;
  location?: string | null;
  indentId?: number | null;
  indentItemId?: number | null;
  piTransactionId?: number | null;
  pendingReceiptId?: number | null;
  boqProjectId?: number | null;
  boqItemId?: number | null;
  programmeBarId?: number | null;
  earthworkArrangementId?: number | null;
  unloadedAt?: string | null;
  yardLabel?: string | null;
  isCancelled?: boolean | null;
  isDeleted?: boolean | null;
};

export type HiredEquipmentCandidate = {
  id: number;
  registrationNumber: string | null;
  vendorId: number | null;
  ownership: string;
  isActive?: boolean | null;
};

export type SourceTransportBillStatus = {
  billNo: string;
  status: string;
  billDate?: string | Date | null;
};

export function sourceTransportBillDecision(bills: SourceTransportBillStatus[]) {
  const active = bills.filter((bill) => !["cancelled", "rejected"].includes(String(bill.status).toLowerCase()));
  const ranked = [...active].sort((a, b) => {
    const rank = (status: string) => {
      const key = String(status).toLowerCase();
      return key === "paid" ? 4 : key === "approved" ? 3 : key === "verified" ? 2 : 1;
    };
    return rank(b.status) - rank(a.status) ||
      String(b.billDate ?? "").localeCompare(String(a.billDate ?? ""));
  });
  const lockedBill = ranked.find((bill) => ["approved", "paid"].includes(String(bill.status).toLowerCase())) ?? null;
  const warningBills = ranked.filter((bill) => ["draft", "verified"].includes(String(bill.status).toLowerCase()));
  return { lockedBill, warningBills };
}

/**
 * A preview fingerprint is an optimistic concurrency token, not a secret.
 * It deliberately includes the immutable identifying facts and every role
 * field this workflow can update, so Apply cannot silently use stale preview
 * data after another edit.
 */
export function siteMaterialTripSourceTransportFingerprint(trip: SourceTransportTrip): string {
  return JSON.stringify([
    trip.id,
    String(trip.date),
    trip.time ?? null,
    trip.site,
    trip.material,
    trip.supplier,
    trip.supplierVendorId,
    trip.materialSourceSupplier,
    trip.materialSourceType,
    trip.materialSourceLabel,
    trip.materialSourceVendorId,
    trip.vehicleNumber,
    trip.transportType,
    trip.internalEquipmentId,
    trip.quantity ?? null,
    trip.uom ?? null,
    trip.receiptNumber ?? null,
    trip.location ?? null,
    trip.indentId ?? null,
    trip.indentItemId ?? null,
    trip.piTransactionId ?? null,
    trip.pendingReceiptId ?? null,
    trip.boqProjectId ?? null,
    trip.boqItemId ?? null,
    trip.programmeBarId ?? null,
    trip.earthworkArrangementId ?? null,
    trip.unloadedAt ?? null,
    trip.yardLabel ?? null,
    !!trip.isCancelled,
    !!trip.isDeleted,
  ]);
}

function alphanumeric(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Propose only a unique active hired vehicle owned by this trip's transporter.
 * Full normalized registrations are preferred; a four-digit suffix is used
 * only when it identifies exactly one candidate. The caller supplies only
 * candidates whose audited owner identity matches the trip's transporter.
 */
export function matchUniqueHiredEquipment(
  vehicleNumber: unknown,
  transporterVendorId: number | null,
  candidates: HiredEquipmentCandidate[],
): { match: HiredEquipmentCandidate | null; reason: "exact" | "last_four" | "missing" | "no_match" | "ambiguous" } {
  const registration = alphanumeric(vehicleNumber);
  if (!registration || transporterVendorId == null) return { match: null, reason: "missing" };
  const eligible = candidates.filter((candidate) =>
    candidate.ownership === "hired" &&
    candidate.isActive !== false &&
    candidate.vendorId === transporterVendorId &&
    !!alphanumeric(candidate.registrationNumber)
  );
  const exact = eligible.filter((candidate) => alphanumeric(candidate.registrationNumber) === registration);
  if (exact.length === 1) return { match: exact[0], reason: "exact" };
  if (exact.length > 1) return { match: null, reason: "ambiguous" };

  const shortNumber = digits(vehicleNumber).slice(-4);
  if (shortNumber.length !== 4) return { match: null, reason: "no_match" };
  const suffixMatches = eligible.filter((candidate) => digits(candidate.registrationNumber).endsWith(shortNumber));
  if (suffixMatches.length === 1) return { match: suffixMatches[0], reason: "last_four" };
  if (suffixMatches.length > 1) return { match: null, reason: "ambiguous" };
  return { match: null, reason: "no_match" };
}

export function sourceTransportRoleChanged(
  current: Pick<SourceTransportTrip,
    "materialSourceSupplier" | "materialSourceType" | "materialSourceLabel" |
    "materialSourceVendorId" | "transportType" | "internalEquipmentId">,
  next: Pick<SourceTransportTrip,
    "materialSourceSupplier" | "materialSourceType" | "materialSourceLabel" |
    "materialSourceVendorId" | "transportType" | "internalEquipmentId">,
): boolean {
  return current.materialSourceSupplier !== next.materialSourceSupplier ||
    current.materialSourceType !== next.materialSourceType ||
    current.materialSourceLabel !== next.materialSourceLabel ||
    current.materialSourceVendorId !== next.materialSourceVendorId ||
    current.transportType !== next.transportType ||
    current.internalEquipmentId !== next.internalEquipmentId;
}
