export type VendorBillSettlementType = "rounded_off" | "carried_forward";

export type VendorBillSettlementInput = {
  type: VendorBillSettlementType;
  amount: number;
  reason: string;
};

export function canRoundOffVendorBill(
  isOwner: boolean,
  difference: number,
  limit: number,
): boolean {
  return isOwner || (Number.isFinite(difference) && Number.isFinite(limit) &&
    limit >= 0 && Math.abs(difference) <= limit + 0.0001);
}

export function hasVendorBillCentPrecision(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.0000001;
}

export function vendorBillDifference(netPayable: number, amountPaid: number): number {
  return Math.round((netPayable - amountPaid + Number.EPSILON) * 100) / 100;
}

export function vendorBillBalance(
  netPayable: number,
  amountPaid: number | null,
  settlementType?: string | null,
): number | null {
  if (amountPaid == null || !Number.isFinite(amountPaid)) return null;
  if (settlementType === "rounded_off") return 0;
  return vendorBillDifference(netPayable, amountPaid);
}

export function vendorBillSettlementLine(bill: {
  settlementType?: string | null;
  settlementAmount?: number | string | null;
  settlementReason?: string | null;
}): string | null {
  if (bill.settlementType !== "rounded_off" && bill.settlementType !== "carried_forward") return null;
  const amount = Number(bill.settlementAmount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const value = Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reason = String(bill.settlementReason || "").trim();
  if (bill.settlementType === "rounded_off") return `Rounded off ₹${value}${reason ? ` — ${reason}` : ""}`;
  return `₹${value}${amount < 0 ? " advance" : ""} carried to next bill${reason ? ` — ${reason}` : ""}`;
}
