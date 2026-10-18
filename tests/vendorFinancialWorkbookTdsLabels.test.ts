import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { billPaymentPosition, getBillFinancialTotals } from "../shared/vendorBillFinancialReport";
import { buildVendorFinancialWorkbook } from "../server/vendorFinancialWorkbook";

const bill = {
  id: 58,
  billNo: "SYNTHETIC-VB-0058",
  billDate: "2026-10-12",
  vendorName: "SYNTHETIC HIRE VENDOR",
  billType: "EQUIPMENT",
  status: "draft",
  totalAmount: 120000,
  netPayableAmount: null,
  amountPaid: 0,
  adjustmentAmount: 0,
  additionalAdjustments: [{ label: "Separate operational adjustment", amount: -10000 }],
  tdsRate: 2,
  tdsAmount: null,
  items: [{ category: "equipment", amount: 120000, source: "hire_statement", siteName: "SYNTHETIC SITE" }],
  hireStatements: [{
    calculationSnapshot: {
      financials: {
        taxableAmount: 120000,
        tdsRate: 2,
        tdsAmount: 2400,
      },
    },
  }],
};

describe("Vendor financial workbook TDS labels", () => {
  it("shows the recorded TDS separately and keeps the existing adjustments figure unchanged", () => {
    const workbook = buildVendorFinancialWorkbook([bill]);
    const vendorRows = xlsx.utils.sheet_to_json<any[]>(workbook.Sheets["Vendor Bills"], { header: 1, raw: true });
    const tdsRows = xlsx.utils.sheet_to_json<any[]>(workbook.Sheets["TDS (IT) Register"], { header: 1, raw: true });
    const vendorHeaders = vendorRows[0] as string[];
    const tdsHeaders = tdsRows[0] as string[];
    const vendorBill = vendorRows[1] as any[];
    const tdsBill = tdsRows[1] as any[];

    expect(vendorHeaders).toContain("TDS deducted");
    expect(tdsHeaders).toContain("TDS deducted");
    expect(tdsHeaders).not.toContain("Actual recorded deduction");
    expect(vendorBill[vendorHeaders.indexOf("TDS deducted")]).toBe(2400);
    expect(tdsBill[tdsHeaders.indexOf("TDS deducted")]).toBe(2400);
    expect(tdsBill[tdsHeaders.indexOf("Evidence")]).toBe("From linked hire statement");

    const position = billPaymentPosition(bill);
    const totals = getBillFinancialTotals(bill);
    expect(vendorBill[vendorHeaders.indexOf("Adjustments/deductions")]).toBe(position.net - position.gross - position.gst);
    expect(position).toMatchObject({ gross: 120000, gst: 0, net: 107600, paid: 0, balance: 107600 });
    expect(totals.additionalTotal).toBe(-10000);
  });
});
