import type { DieselReceiptState } from "@shared/dieselReceiptStatus";

export type DieselRegisterStatus = "Raised" | "Approved" | "Purchased" | "Partly Received" | "Received";

/**
 * Register labels deliberately mirror the requirement lifecycle.  Receipt
 * progress refines a completed purchase; it does not create a new stored
 * lifecycle state.
 */
export function deriveDieselRegisterStatus(
  requirementStatus: string | null | undefined,
  receipt?: Pick<DieselReceiptState, "status"> | null,
): DieselRegisterStatus {
  if (requirementStatus === "purchased") {
    if (receipt?.status === "partly_received") return "Partly Received";
    if (receipt?.status === "fully_received") return "Received";
    return "Purchased";
  }
  if (requirementStatus === "approved") return "Approved";
  return "Raised";
}

export function dieselRegisterStatusClass(status: DieselRegisterStatus): string {
  switch (status) {
    case "Received": return "bg-green-50 text-green-700 border-green-300";
    case "Partly Received": return "bg-amber-50 text-amber-700 border-amber-300";
    case "Purchased": return "bg-blue-50 text-blue-700 border-blue-300";
    case "Approved": return "bg-violet-50 text-violet-700 border-violet-300";
    default: return "bg-slate-50 text-slate-700 border-slate-300";
  }
}