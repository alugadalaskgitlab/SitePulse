import { describe, expect, it } from "vitest";
import { getBillFinancialTotals } from "../shared/vendorBillFinancialReport";
import { buildSavedBillPresentationRows } from "../shared/vendorBillPresentation";
import {
  deduplicateEquipmentHireTerms,
  projectSavedHireDetailFinancials,
} from "../client/src/components/vendor-bills/savedBillDetailFinancials";

function makeOrsuBill(status = "draft", gstRateEquipment = 0) {
  const firstStatement = {
    id: 1,
    equipmentId: 7,
    equipmentName: "Excavator",
    grossAmount: 29_032.26,
    netAmount: 29_032.26,
    calculationSnapshot: {
      financials: {
        grossHire: 29_032.26,
        breakdownDeduction: 0,
        hsdRecovery: 0,
        otherDebit: 0,
        advanceAdjustment: 0,
        otherCredit: 0,
        gstRate: gstRateEquipment,
        gstAmount: gstRateEquipment ? 1_451.61 : 0,
        tdsRate: 2,
        tdsAmount: 580.65,
      },
      adjustments: {},
    },
  };
  const secondStatement = {
    id: 2,
    equipmentId: 7,
    equipmentName: "Excavator",
    grossAmount: 125_000,
    netAmount: 15_000,
    calculationSnapshot: {
      financials: {
        grossHire: 125_000,
        breakdownDeduction: 0,
        hsdRecovery: 0,
        otherDebit: 0,
        advanceAdjustment: 110_000,
        otherCredit: 0,
        gstRate: gstRateEquipment,
        gstAmount: gstRateEquipment ? 750 : 0,
        tdsRate: 2,
        tdsAmount: 300,
      },
      adjustments: { advanceAdjustment: 110_000 },
    },
  };

  return {
    billType: "equipment",
    status,
    totalAmount: 44_032.26,
    netPayableAmount: 28_151.61,
    gstRateEquipment,
    tdsRate: 2,
    hireStatements: [firstStatement, secondStatement],
    items: [
      { source: "hire_statement", hireStatementId: 1, category: "equipment", amount: 29_032.26 },
      { source: "hire_statement", hireStatementId: 2, category: "equipment", amount: 15_000 },
    ],
  };
}

function project(bill: ReturnType<typeof makeOrsuBill>) {
  const fallback = getBillFinancialTotals(bill as any);
  const totals = projectSavedHireDetailFinancials(bill, fallback);
  if (!totals) throw new Error("Expected equipment-hire detail totals");
  return totals;
}

describe("saved equipment-hire bill detail financials", () => {
  it("uses gross minus breakdown for draft hire TDS and adjusts only the displayed tax delta", () => {
    const bill = makeOrsuBill();
    const totals = project(bill);
    const rows = buildSavedBillPresentationRows(bill as any, totals);

    expect(totals.tds).toBe(3_080.65);
    expect(totals.netTotal).toBe(25_951.61);
    expect(rows.find(row => row.kind === "tds")?.amount).toBe(-3_080.65);
    expect(rows.find(row => row.kind === "net")?.amount).toBe(25_951.61);
    expect(bill.netPayableAmount).toBe(28_151.61);
  });

  it("calculates draft GST from the same gross-minus-breakdown base", () => {
    const totals = project(makeOrsuBill("draft", 5));
    expect(totals.gstRows.reduce((sum, row) => sum + row.amount, 0)).toBe(7_701.61);
  });

  it("leaves a no-advance draft unchanged when its gross-minus-breakdown tax base equals the current base", () => {
    const bill = {
      billType: "equipment",
      status: "draft",
      totalAmount: 9_032.5,
      netPayableAmount: 8_851.85,
      gstRateEquipment: 0,
      tdsRate: 2,
      hireStatements: [{
        id: 8,
        grossAmount: 10_000,
        netAmount: 9_032.5,
        calculationSnapshot: {
          financials: {
            grossHire: 10_000,
            breakdownDeduction: 967.5,
            advanceAdjustment: 0,
            gstRate: 0,
            gstAmount: 0,
            tdsRate: 2,
            tdsAmount: 180.65,
          },
          adjustments: { breakdownDeduction: 967.5 },
        },
      }],
      items: [{ source: "hire_statement", hireStatementId: 8, category: "equipment", amount: 9_032.5 }],
    };
    const totals = project(bill as any);

    expect(totals.tds).toBe(180.65);
    expect(totals.netTotal).toBe(8_851.85);
  });

  it("preserves approved bill tax and net figures", () => {
    const totals = project(makeOrsuBill("approved", 5));
    expect(totals.gstRows.reduce((sum, row) => sum + row.amount, 0)).toBe(2_201.61);
    expect(totals.tds).toBe(880.65);
    expect(totals.netTotal).toBe(28_151.61);
  });

  it("keeps one terms row per equipment identity while retaining separate machines", () => {
    const terms = deduplicateEquipmentHireTerms([
      { equipmentId: 7, masterReference: "EX-7", name: "Excavator", period: "August" },
      { equipmentId: 7, masterReference: "EX-7", name: "Excavator", period: "September" },
      { equipmentId: 8, masterReference: "EX-8", name: "Excavator", period: "August" },
    ]);

    expect(terms).toHaveLength(2);
    expect(terms.map(term => term.equipmentId)).toEqual([7, 8]);
  });
});
