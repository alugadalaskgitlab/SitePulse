import type { PermissionMatrix } from "./permissions";

/** Deliberate exception to the ordinary Administrator bypass. */
export function canViewVendorFinancials(user: { isOwner?: boolean } | null | undefined, permissions?: Partial<PermissionMatrix>) {
  return !!user && (!!user.isOwner || permissions?.vendor_financials?.view === true);
}

/** Selected sites constrain even administrators for financial reporting. */
export function vendorFinancialSiteIds(user: { isOwner?: boolean; allSitesAccess?: boolean; isAdmin?: boolean }, selected: number[]) {
  if (user.isOwner || user.allSitesAccess) return null;
  if (selected.length) return selected;
  return user.isAdmin ? null : [];
}

/** Only persisted amounts, never a deduction inferred from a percentage. */
export function recordedVendorTds(bill: any): number | null {
  if (bill.tdsAmount != null && Number.isFinite(Number(bill.tdsAmount))) return Number(bill.tdsAmount);
  const statements = bill.hireStatements || [];
  if (!statements.length) return null;
  const amounts = statements.map((s: any) => s.calculationSnapshot?.financials?.tdsAmount);
  if (amounts.some((v: any) => v == null || !Number.isFinite(Number(v)))) return null;
  return amounts.reduce((sum: number, value: any) => sum + Number(value), 0);
}
