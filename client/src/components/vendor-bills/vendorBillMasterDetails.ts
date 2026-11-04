import { formatPersonName } from "@shared/personName";

export type VendorMasterBillDetails = {
  name?: string | null;
  businessName?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  contactPersonName?: string | null;
  contactPhone?: string | null;
  panNumber?: string | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
};

export type VendorMasterBillDetailRow = { label: string; value: string };

const valueOf = (value: unknown) => typeof value === "string" ? value.trim() : "";
const row = (label: string, value: unknown): VendorMasterBillDetailRow | null => {
  const clean = valueOf(value);
  return clean ? { label, value: clean } : null;
};

export function vendorBillMasterTopRows(
  details?: VendorMasterBillDetails | null,
): VendorMasterBillDetailRow[] {
  if (!details) return [];
  const businessName = valueOf(details.businessName);
  const masterName = valueOf(details.name);
  const businessNameDiffers = businessName && businessName.toLocaleLowerCase() !== masterName.toLocaleLowerCase();
  return [
    businessNameDiffers ? row("Business name", businessName) : null,
    row("Address", details.address),
    row("GSTIN", details.gstNumber),
    row("Contact person", formatPersonName(details.contactPersonName)),
    row("Phone", details.contactPhone),
  ].filter((item): item is VendorMasterBillDetailRow => item != null);
}

export function vendorBillMasterBottomRows(
  details?: VendorMasterBillDetails | null,
): VendorMasterBillDetailRow[] {
  if (!details) return [];
  return [
    row("PAN", details.panNumber),
    row("Bank account name", details.bankAccountName),
    row("Bank name", details.bankName),
    row("Account number", details.bankAccountNumber),
    row("IFSC", details.bankIfsc),
  ].filter((item): item is VendorMasterBillDetailRow => item != null);
}
