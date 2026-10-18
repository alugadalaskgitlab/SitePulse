import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { billPaymentPosition, filterFinancialBills, getBillFinancialTotals, summarizeFinancialTaxes, taxCategories } from "../shared/vendorBillFinancialReport";
import { summarizeBillReview } from "../shared/vendorBillReview";
import { buildVendorFinancialWorkbook } from "../server/vendorFinancialWorkbook";

const bill = (id: number, patch: Record<string, any> = {}) => ({
  id, billNo: `VB-${id}`, billDate: "2026-10-01", vendorName: "ACME", siteId: 1, billType: "EQUIPMENT",
  totalAmount: 1000, amountPaid: 0, status: "approved", items: [{ category: "equipment", amount: 1000, siteName: "SITE A", suppliedTo: "Own" }],
  ...patch,
});
const sites = [{ id: 1, name: "SITE A" }, { id: 2, name: "SITE B" }];
const fixture = [
  bill(1, { status: "draft" }), bill(2, { status: "verified" }), bill(3),
  bill(4, { status: "paid", amountPaid: 1000 }), bill(5, { status: "paid", amountPaid: 300 }),
  bill(6, { status: "paid", amountPaid: null }), bill(7, { netPayableAmount: -100 }),
  bill(8, { amountPaid: 1200 }), bill(9, { amountPaid: null }), bill(10, { netPayableAmount: 0 }),
];
describe("one saved-bill financial selection", () => {
  it("Unpaid retains provisional, partial, contradicting and unknown balances; not settled or credits", () => {
    expect(filterFinancialBills(fixture, { scope: "unpaid" }).map(b => b.id)).toEqual([1, 2, 3, 5, 6, 9]);
    expect(filterFinancialBills(fixture, { scope: "all" })).toHaveLength(10);
  });
  it.each(["draft", "verified", "approved", "paid"])("includes a partial payment independent of %s status", status => {
    expect(filterFinancialBills([bill(1, { status, amountPaid: 25 })], { scope: "unpaid" })).toHaveLength(1);
  });
  it("distinguishes missing from known zero and flags contradictory Paid status", () => {
    expect(billPaymentPosition(fixture[4])).toMatchObject({ paid: 300, outstanding: 700, unconfirmed: true, contradictory: true });
    expect(billPaymentPosition(fixture[5])).toMatchObject({ paid: null, balance: null, unconfirmed: true });
    expect(billPaymentPosition(bill(1))).toMatchObject({ paid: 0, outstanding: 1000, unconfirmed: false });
  });
  it.each([undefined, null, "", "not-a-number"])("does not treat missing/invalid amount %s as zero", amountPaid => {
    expect(billPaymentPosition(bill(1, { amountPaid })).paid).toBeNull();
  });
  it("combines every existing filter with scope using the same selection", () => {
    const rows = [bill(1), bill(2, { vendorName: "OTHER" }), bill(3, { billDate: "2026-09-01" }),
      bill(4, { status: "draft" }), bill(5, { billType: "material" }),
      bill(6, { siteId: 2, items: [{ category: "equipment", siteName: "SITE B", suppliedTo: "Own" }] }),
      bill(7, { items: [{ category: "equipment", siteName: "SITE A", suppliedTo: "Contractor" }] }), bill(8, { amountPaid: 1000 })];
    const filters = { scope: "unpaid" as const, dateFrom: "2026-10-01", dateTo: "2026-10-01", vendor: "ACME", status: "approved", category: "equipment", party: "Own", site: "SITE A" };
    expect(filterFinancialBills(rows, filters, sites).map(b => b.id)).toEqual([1]);
    expect(filterFinancialBills(rows, { ...filters, scope: "all" }, sites).map(b => b.id)).toEqual([1, 8]);
  });
  it("matches overlapping billed periods and falls back to bill date only when no period is recorded", () => {
    const rows = [
      bill(1, { billDate: "2026-10-12", periodFrom: "2026-09-01", periodTo: "2026-09-30" }),
      bill(2, { billDate: "2026-08-19", periodFrom: "2026-07-19", periodTo: "2026-07-31" }),
      bill(3, { billDate: "2026-08-15", periodFrom: null, periodTo: null }),
    ];
    expect(filterFinancialBills(rows, { dateFrom: "2026-08-01", dateTo: "2026-09-30" }).map(row => row.id)).toEqual([1, 3]);
  });
  it("matches a linked vendor across aliases but keeps unlinked names exact", () => {
    const rows = [
      bill(1, { vendorId: 7, vendorName: "ACME LIMITED", vendorAliasNames: ["ACME LIMITED", "ACME LTD"] }),
      bill(2, { vendorId: 7, vendorName: "A.C.M.E.", vendorAliasNames: ["ACME LIMITED", "ACME LTD"] }),
      bill(3, { vendorId: null, vendorName: "ACME LTD" }),
      bill(4, { vendorId: null, vendorName: "ACME LIMITED" }),
      bill(5, { vendorId: 8, vendorName: "OTHER", vendorAliasNames: ["OTHER"] }),
    ];
    expect(filterFinancialBills(rows, { vendor: "ACME LTD" }).map(row => row.id)).toEqual([1, 2, 3]);
  });
  it("matches bill-detail math with GST, deductions, additional adjustments and partial payment", () => {
    const row = bill(1, { gstRateEquipment: 18, tdsRate: 2, adjustmentAmount: -100,
      additionalAdjustments: [{ label: "Deduction", amount: -50 }, { label: "Credit", amount: 25 }], amountPaid: 300 });
    expect(getBillFinancialTotals(row)).toMatchObject({ totalAmount: 1000, totalGst: 180, primaryAdjustment: -100, additionalTotal: -25, tds: 20, netTotal: 1035 });
    expect(billPaymentPosition(row).outstanding).toBe(735);
    // Saved net value already incorporates hire recoveries/advance deductions.
    expect(billPaymentPosition({ ...row, netPayableAmount: 700 }).outstanding).toBe(400);
  });
  it("sums only established positive balances without offsetting vendor credits", () => {
    const summary = summarizeBillReview(fixture.map(billPaymentPosition));
    expect(summary.outstanding).toBe(3700);
    expect(summary.credits).toBe(300);
    expect(summary.unknownPayments).toBe(2);
  });
});
describe("category tax evidence and three-sheet workbook", () => {
  it.each(taxCategories)("preserves GST and recorded TDS for %s", category => {
    const rows = [bill(1, { billType: category.toUpperCase(), items: [{ category, amount: 1000 }], [`gstRate${category[0].toUpperCase()}${category.slice(1)}`]: 18, tdsAmount: 20 })];
    const tax = summarizeFinancialTaxes(rows);
    expect(tax.gst[category]).toBe(180);
    expect(tax.tds[category]).toEqual({ amount: 20, incomplete: false });
    expect(tax.total).toEqual({ amount: 20, incomplete: false });
  });
  it("never converts a TDS percentage into a recorded deduction", () => {
    expect(summarizeFinancialTaxes([bill(1, { tdsRate: 2 })]).total).toEqual({ amount: 0, incomplete: true });
    expect(summarizeFinancialTaxes([bill(1, { tdsRate: 2, tdsAmount: 0 })]).total).toEqual({ amount: 0, incomplete: false });
  });
  it("retains known snapshot deductions but labels incomplete coverage", () => {
    const row = bill(1, { hireStatements: [
      { calculationSnapshot: { financials: { tdsAmount: 17 } } }, {},
    ] });
    expect(summarizeFinancialTaxes([row])).toMatchObject({
      total: { amount: 17, incomplete: true }, tds: { equipment: { amount: 17, incomplete: true } },
    });
  });
  it("does not allocate combined bill TDS proportionally or call snapshot-only tax complete", () => {
    const mixed = bill(1, { billType: "ALL", items: [{ category: "equipment", amount: 500 }, { category: "material", amount: 500 }], tdsAmount: 20 });
    expect(summarizeFinancialTaxes([mixed])).toMatchObject({ unallocated: 20, total: { amount: 20, incomplete: false }, tds: { material: { amount: 0, incomplete: true } } });
    const partial = { ...mixed, tdsAmount: undefined, hireStatements: [{ calculationSnapshot: { financials: { tdsAmount: 10 } } }] };
    expect(summarizeFinancialTaxes([partial])).toMatchObject({ total: { amount: 10, incomplete: true }, tds: { equipment: { amount: 10 }, material: { incomplete: true } } });
  });
  it.each(["unpaid", "all"] as const)("round-trips Excel with identical filtered IDs on all sheets for %s", scope => {
    const selected = filterFinancialBills(fixture, { scope });
    const workbook = buildVendorFinancialWorkbook(selected, sites);
    const reloaded = xlsx.read(xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    expect(reloaded.SheetNames).toEqual(["Vendor Bills", "GST Register", "TDS (IT) Register"]);
    for (const name of reloaded.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(reloaded.Sheets[name], { header: 1 }) as any[][];
      expect(rows.filter(r => typeof r[0] === "number").map(r => r[0])).toEqual(selected.map(b => b.id));
    }
    const main = xlsx.utils.sheet_to_json(reloaded.Sheets["Vendor Bills"], { header: 1 }) as any[][];
    const mainHeaders = main[0] as string[];
    expect(main.find(r => r[0] === 6)?.[mainHeaders.indexOf("Recorded paid amount")]).toBe("Not established");
    const tax = xlsx.utils.sheet_to_json(reloaded.Sheets["TDS (IT) Register"], { header: 1 }) as any[][];
    expect(tax.find(r => r[0] === 1)?.[9]).toBe("Not established");
  });
  it("exports frozen TDS rate, base and actual amount without recalculating", () => {
    const row = bill(1, { tdsRate: 9, hireStatements: [{ calculationSnapshot: { financials: { tdsRate: 2, taxableAmount: 850, tdsAmount: 17 } } }] });
    const book = buildVendorFinancialWorkbook([row]);
    const rows = xlsx.utils.sheet_to_json(book.Sheets["TDS (IT) Register"], { header: 1 }) as any[][];
    expect(rows[1].slice(7, 10)).toEqual(["2", 850, 17]);
  });
});
