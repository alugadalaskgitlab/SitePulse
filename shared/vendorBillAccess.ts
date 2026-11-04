import type { FeatureAction } from "./featureAccess";

export type VendorBillLifecycleStatus = "draft" | "verified" | "approved" | "paid";

/** The permission required to move a vendor bill into each lifecycle status. */
export function vendorBillStatusAction(status: VendorBillLifecycleStatus): FeatureAction {
  switch (status) {
    case "draft": return "edit";
    case "verified": return "technical_verify";
    case "approved": return "approve";
    case "paid": return "final";
  }
}

export function normalizeVendorBillActorName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleUpperCase()
    : "";
}
