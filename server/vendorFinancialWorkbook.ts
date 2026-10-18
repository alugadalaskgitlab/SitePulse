import * as xlsx from "xlsx";
import { billPaymentPosition, getBillFinancialTotals, computeBillGstByCategory, taxCategories, summarizeFinancialTaxes, recordedReportTds } from "../shared/vendorBillFinancialReport";

const missing = "Not established";
const recordedNumber = (value: any): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const sum = (values: any[]) => values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);

/** Bills are selected and authorised before this function. Never loads more data. */
export function buildVendorFinancialWorkbook(bills: any[], sites: { id: number; name: string }[] = []) {
  const workbook = xlsx.utils.book_new();
  const identity = (bill: any) => [bill.id, bill.billNo, bill.billDate, bill.vendorName,
    sites.find(s => s.id === bill.siteId)?.name || [...new Set((bill.items || []).map((i: any) => i.siteName).filter(Boolean))].join("; "),
    bill.billType, bill.status];
  const identityHeaders = ["Bill ID", "Bill No", "Bill Date", "Vendor", "Site", "Category", "Status"];
  const note = "Saved bills only. Draft/Verified values are provisional. Not established means missing evidence, not zero. Positive balances and credits are separate; no offsets. Totals sum known amounts only.";
  const paymentGap = bills.some(b => billPaymentPosition(b).unconfirmed);
  const tdsGap = summarizeFinancialTaxes(bills).total.incomplete;
  const append = (name: string, headers: string[], rows: any[][], totalColumns: number[]) => {
    const totals = headers.map((_, index) => index === 0 ? "TOTAL RECORDED" : totalColumns.includes(index) ? sum(rows.map(r => r[index])) : "");
    const sheet = xlsx.utils.aoa_to_sheet([headers, ...rows, totals, [], [note],
      ...(paymentGap ? [["Unconfirmed payment evidence exists; paid totals exclude unknown payments."]] : []),
      ...(tdsGap ? [["TDS information is incomplete; no deductions inferred from percentages."]] : [])]);
    sheet["!cols"] = headers.map(h => ({ wch: Math.max(16, Math.min(h.length + 2, 34)) }));
    sheet["!autofilter"] = { ref: xlsx.utils.encode_range({ r: 0, c: 0 }, { r: rows.length, c: headers.length - 1 }) };
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  };
  append("Vendor Bills", [...identityHeaders, "Gross amount", "GST", "TDS deducted", "Adjustments/deductions", "Net bill value", "Recorded paid amount", "Positive outstanding", "Negative credit", "Payment evidence"],
    bills.map(b => {
      const a = billPaymentPosition(b);
      const tds = recordedReportTds(b).amount;
      return [...identity(b), a.gross, a.gst, tds ?? missing, a.net - a.gross - a.gst, a.net, a.paid ?? missing,
        a.balance == null ? missing : a.outstanding, a.balance == null && a.credit === 0 ? missing : -a.credit,
        a.unconfirmed ? (a.contradictory ? "Unconfirmed — Paid status contradicts payments" : "Unconfirmed — missing payment evidence") : "Recorded"];
    }), [7, 8, 9, 10, 11, 12, 13, 14]);
  append("GST Register", [...identityHeaders, "Taxable/subtotal", ...taxCategories.flatMap(c => [`${c} GST rate (%)`, `${c} GST amount`]), "Total GST"],
    bills.map(b => {
      const gst = computeBillGstByCategory(b);
      return [...identity(b), getBillFinancialTotals(b).totalAmount,
        ...taxCategories.flatMap(c => [b[`gstRate${c[0].toUpperCase()}${c.slice(1)}`] ?? "Not recorded", gst[c]]),
        taxCategories.reduce((total, c) => total + gst[c], 0)];
    }), [7, 9, 11, 13, 15, 16]);
  append("TDS (IT) Register", [...identityHeaders, "Recorded TDS rate (%)", "Recorded taxable/base amount", "TDS deducted", "Evidence"],
    bills.map(b => {
      const snapshots = (b.hireStatements || []).map((s: any) => s.calculationSnapshot?.financials);
      const bases = snapshots.map((s: any) => recordedNumber(s?.taxableAmount));
      const rates = [...new Set(snapshots.map((s: any) => recordedNumber(s?.tdsRate)).filter((v: any) => v != null))];
      const amount = recordedReportTds(b).amount;
      return [...identity(b), rates.length ? rates.join("; ") : b.tdsRate ?? "Not recorded",
        recordedNumber(b.tdsBaseAmount) ?? (bases.length && bases.every((v: any) => v != null) ? sum(bases) : missing),
        amount ?? missing, amount == null ? "No recorded TDS amount" : snapshots.length && b.tdsAmount == null ? "From linked hire statement" : "Recorded on vendor bill"];
    }), [8, 9]);
  const tax = summarizeFinancialTaxes(bills);
  if (tax.unallocated !== 0) xlsx.utils.sheet_add_aoa(workbook.Sheets["TDS (IT) Register"], [["Recorded deduction category split is not established; no proportional allocation has been inferred."]], { origin: -1 });
  return workbook;
}
