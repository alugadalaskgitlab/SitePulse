import { and, desc, eq } from "drizzle-orm";
import { auditLogs, vendors } from "../shared/schema";

export const EQUIPMENT_VENDOR_LINK = "confirm_vendor_identity";
export const ownerNameKey = (name: unknown) => String(name ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** Never require registration for a one-time owner, or bypass a reviewed conflict. */
export function dailyHireOwnerEligible(identity: any, transporterVendorId?: number | null) {
  if (identity?.vendor) return !!identity.vendor.isActive &&
    (transporterVendorId == null || transporterVendorId === identity.vendor.id);
  return !identity?.auditId && transporterVendorId == null;
}

/** Explicit identity evidence, never an alias or a rewrite of the owner name. */
export async function equipmentVendorIdentities(executor: any, equipment: any[]) {
  const masters = await executor.select().from(vendors);
  const audits = await executor.select().from(auditLogs).where(and(
    eq(auditLogs.module, "equipment_master"), eq(auditLogs.action, EQUIPMENT_VENDOR_LINK),
  )).orderBy(desc(auditLogs.id));
  const latest = new Map<number, any>();
  for (const audit of audits) if (!latest.has(audit.transactionId)) latest.set(audit.transactionId, audit);
  return new Map<number, any>(equipment.map(e => {
    const audit = latest.get(e.id);
    const vendor = masters.find((v: any) => v.id === audit?.newValues?.vendorId);
    const valid = vendor && ownerNameKey(e.vendorName) === audit.newValues.recordedName;
    return [e.id, { vendor: valid ? vendor : null, auditId: audit?.id ?? null,
      confirmedBy: audit?.userName, confirmedAt: audit?.createdAt, confirmationReason: audit?.reason,
      conflict: audit && !valid ? "Recorded owner changed or linked Vendor Master is missing" : null }];
  }));
}
