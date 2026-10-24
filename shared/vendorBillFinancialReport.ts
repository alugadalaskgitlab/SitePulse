import { billReviewAmounts } from "./vendorBillReview";
import { computeBillGstByCategory, aggregateGstBreakdown } from "./vendor-bill-gst";
import { siteMatchesPermitted, vendorBillItemMatchesSite } from "./siteName";

export const taxCategories = ["equipment", "material", "transport", "labour"] as const;
export type TaxCategory = typeof taxCategories[number];
export type BillScope = "unpaid" | "all";

/** Same saved-bill arithmetic used by the bill detail. No postings or writes. */
export function getBillFinancialTotals(bill: any) {
  const categories: Record<string, number> = {};
  for (const item of bill.items || []) categories[item.category || "other"] = (categories[item.category || "other"] || 0) + (Number(item.amount) || 0);
  const grouped = String(bill.billType).toLowerCase() === "all" || Object.values(categories).filter(v => v !== 0).length > 1;
  const totalAmount = Number(bill.totalAmount) || 0;
  const rates = taxCategories.map(c => Number(bill[`gstRate${c[0].toUpperCase()}${c.slice(1)}`]) || 0);
  const gstRows = grouped
    ? taxCategories.map((c, i) => ({ label: `GST ON ${c.toUpperCase()} @ ${rates[i]}%`, amount: (categories[c] || 0) * rates[i] / 100, rate: rates[i] }))
      .filter((row, i) => row.rate > 0 && categories[taxCategories[i]] != null)
    : (() => {
      const rate = rates[taxCategories.indexOf(String(bill.billType || "").toLowerCase() as TaxCategory)] || 0;
      return rate > 0 ? [{ label: `GST @ ${rate}%`, amount: totalAmount * rate / 100, rate }] : [];
    })();
  const totalGst = gstRows.reduce((sum, row) => sum + row.amount, 0);
  let raw = bill.additionalAdjustments ?? bill.additional_adjustments;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  const additional = (Array.isArray(raw) ? raw : []).map((a: any) => ({
    label: String(a?.label ?? a?.reason ?? ""), amount: Number.isFinite(Number(a?.amount)) ? Number(a.amount) : 0,
  }));
  const primaryAdjustment = Number(bill.adjustmentAmount) || 0;
  const additionalTotal = additional.reduce((sum: number, a: any) => sum + a.amount, 0);
  // Preserve the existing bill-detail calculation; tax reporting below never
  // treats this calculated amount as evidence of a recorded deduction.
  const tds = totalAmount * (Number(bill.tdsRate) || 0) / 100;
  return { totalAmount, totalGst, gstRows, primaryAdjustment, additional, additionalTotal, tds,
    netTotal: bill.netPayableAmount == null ? totalAmount + totalGst + primaryAdjustment + additionalTotal - tds : Number(bill.netPayableAmount) };
}

export function billPaymentPosition(bill: any) {
  const amounts = billReviewAmounts(bill, getBillFinancialTotals(bill));
  const contradictory = bill.status === "paid" && amounts.balance != null && Math.abs(amounts.balance) >= 0.005;
  return { ...amounts, contradictory, unconfirmed: amounts.paid == null || contradictory };
}

export interface FinancialFilters {
  scope?: BillScope; dateFrom?: string; dateTo?: string; vendor?: string;
  status?: string; category?: string; party?: string; site?: string;
}
/** Input must already be authorised. One selection for UI and every workbook sheet. */
export function filterFinancialBills<T extends Record<string, any>>(bills: T[], filters: FinancialFilters, sites: { id: number; name: string }[] = []): T[] {
  const selectedVendor = filters.vendor && filters.vendor !== "all" ? filters.vendor.trim().toUpperCase() : null;
  const matchingVendorIds = selectedVendor ? new Set(bills
    .filter(bill => bill.vendorId != null && (
      String(bill.vendorName || "").trim().toUpperCase() === selectedVendor ||
      (Array.isArray(bill.vendorAliasNames) && bill.vendorAliasNames.some((name: unknown) => String(name).trim().toUpperCase() === selectedVendor))
    ))
    .map(bill => Number(bill.vendorId))) : new Set<number>();
  const selectedVendorId = matchingVendorIds.size === 1 ? Array.from(matchingVendorIds)[0] : null;

  return bills.filter(bill => {
    const requestingVoided = filters.status === "voided";
    if (requestingVoided ? bill.isCancelled !== true : bill.isCancelled === true) return false;
    const rawFrom = bill.periodFrom == null || bill.periodFrom === "" ? null : String(bill.periodFrom).slice(0, 10);
    const rawTo = bill.periodTo == null || bill.periodTo === "" ? null : String(bill.periodTo).slice(0, 10);
    const hasPeriod = rawFrom != null || rawTo != null;
    const periodFrom = hasPeriod ? rawFrom : String(bill.billDate || "").slice(0, 10);
    const periodTo = hasPeriod ? rawTo : String(bill.billDate || "").slice(0, 10);
    if (filters.dateFrom && periodTo && periodTo < filters.dateFrom) return false;
    if (filters.dateTo && periodFrom && periodFrom > filters.dateTo) return false;
    if (selectedVendor) {
      const exactName = String(bill.vendorName || "").trim().toUpperCase() === selectedVendor;
      if (selectedVendorId != null) {
        if (bill.vendorId == null ? !exactName : Number(bill.vendorId) !== selectedVendorId) return false;
      } else if (!exactName) return false;
    }
    if (filters.status && filters.status !== "all" && filters.status !== "voided" && bill.status !== filters.status) return false;
    if (filters.category && filters.category !== "all" && String(bill.billType || "").toLowerCase() !== (filters.category === "combined" ? "all" : filters.category)) return false;
    if (filters.party && filters.party !== "all" && !bill.items?.some((item: any) => item.suppliedTo === filters.party)) return false;
    if (filters.site) {
      const header = sites.find(s => s.id === bill.siteId)?.name;
      if (!(header && siteMatchesPermitted(header, [filters.site])) && !bill.items?.some((item: any) => vendorBillItemMatchesSite(item.siteName, filters.site!))) return false;
    }
    if (requestingVoided) return true;
    if (filters.scope === "unpaid") {
      const position = billPaymentPosition(bill);
      if (position.net < 0 || position.credit > 0) return false;
      return position.balance == null || position.outstanding >= 0.005;
    }
    return true;
  });
}

type TaxCell = { amount: number; incomplete: boolean };
export function recordedReportTds(bill: any): { amount: number | null; incomplete: boolean } {
  const number = (value: any) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const explicit = number(bill.tdsAmount);
  if (explicit != null) return { amount: explicit, incomplete: false };
  const amounts = (bill.hireStatements || []).map((s: any) => number(s.calculationSnapshot?.financials?.tdsAmount));
  const known = amounts.filter((a: number | null) => a != null);
  const uncoveredItems = (bill.items || []).some((i: any) => !["hire_group", "hire_statement"].includes(i.source));
  return {
    amount: known.length ? known.reduce((sum: number, a: number) => sum + a, 0) : null,
    incomplete: !amounts.length || known.length !== amounts.length || uncoveredItems,
  };
}
export function summarizeFinancialTaxes(bills: any[]) {
  const gst = aggregateGstBreakdown(bills);
  const tds = Object.fromEntries(taxCategories.map(c => [c, { amount: 0, incomplete: false }])) as Record<TaxCategory, TaxCell>;
  const total: TaxCell = { amount: 0, incomplete: false };
  let unallocated = 0;
  for (const bill of bills) {
    const evidence = recordedReportTds(bill);
    const recorded = evidence.amount;
    const categories = taxCategories.filter(c => String(bill.billType).toLowerCase() === c || bill.items?.some((i: any) => String(i.category).toLowerCase() === c));
    const snapshotOnly = bill.tdsAmount == null && (bill.hireStatements || []).length > 0;
    total.amount += recorded ?? 0;
    total.incomplete ||= evidence.incomplete;
    if (snapshotOnly && categories.some(c => c !== "equipment")) {
      // Hire evidence establishes equipment deductions only, never the tax
      // position of other lines on a combined bill.
      tds.equipment.amount += recorded ?? 0;
      tds.equipment.incomplete ||= evidence.incomplete;
      for (const c of categories) if (c !== "equipment") tds[c].incomplete = true;
      total.incomplete = true;
    } else if (categories.length === 1) {
      tds[categories[0]].amount += recorded ?? 0;
      tds[categories[0]].incomplete ||= evidence.incomplete;
    } else {
      // A whole-bill deduction does not establish its category split.
      for (const c of categories) tds[c].incomplete ||= recorded !== 0;
      if (recorded != null) unallocated += recorded;
    }
  }
  return { gst, tds, total, unallocated };
}

export { computeBillGstByCategory };
