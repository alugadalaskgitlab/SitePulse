import { describe, expect, it } from "vitest";
import {
  calculateEquipmentHireFinancials,
  calculateEquipmentHireFinancialsLegacy,
  replaceHireNetAmountsWithTaxBases,
  sumHireTaxBases,
} from "../shared/hireBilling";

describe("equipment hire tax base and net amount", () => {
  it("taxes gross hire less breakdown, not monthly recoveries or advances", () => {
    const result = calculateEquipmentHireFinancials({
      grossHire: 130_000,
      breakdownDeduction: 5_000,
      hsdRecovery: 0,
      otherDebit: 5_000,
      advanceAdjustment: 60_000,
      otherCredit: 0,
      gstRate: 18,
      tdsRate: 2,
      paid: 0,
    });

    expect(result.taxBase).toBe(125_000);
    expect(result.taxableAmount).toBe(60_000);
    expect(result.gstAmount).toBe(22_500);
    expect(result.tdsAmount).toBe(2_500);
    expect(result.invoiceTotal).toBe(82_500);
    expect(result.netPayable).toBe(80_000);
    expect(result.balanceThisBill).toBe(80_000);
  });

  it("keeps a negative monthly net line when an advance exceeds hire", () => {
    const result = calculateEquipmentHireFinancials({
      grossHire: 29_032.26,
      breakdownDeduction: 0,
      advanceAdjustment: 50_000,
      gstRate: 0,
      tdsRate: 0,
      paid: 0,
    });

    expect(result.taxBase).toBe(29_032.26);
    expect(result.taxableAmount).toBe(-20_967.74);
    expect(result.invoiceTotal).toBe(-20_967.74);
    expect(result.netPayable).toBe(-20_967.74);
    expect(result.balanceThisBill).toBe(-20_967.74);
  });

  it("continues to tax a positive gross-minus-breakdown base when net is negative", () => {
    const result = calculateEquipmentHireFinancials({
      grossHire: 29_032.26,
      breakdownDeduction: 0,
      advanceAdjustment: 50_000,
      gstRate: 18,
      tdsRate: 2,
      paid: 0,
    });

    expect(result.taxBase).toBe(29_032.26);
    expect(result.gstAmount).toBe(5_225.81);
    expect(result.tdsAmount).toBe(580.65);
    expect(result.invoiceTotal).toBe(-15_741.93);
    expect(result.netPayable).toBe(-16_322.58);
    expect(result.balanceThisBill).toBe(-16_322.58);
  });

  it("sums the positive tax bases for included months", () => {
    expect(sumHireTaxBases([
      { grossHire: 130_000, breakdownDeduction: 5_000 },
      { grossHire: 29_032.26, breakdownDeduction: 0 },
      { grossHire: 4_000, breakdownDeduction: 5_000 },
    ])).toBe(154_032.26);
  });

  it("replaces saved new-bill hire net lines with their tax bases when totals are approved", () => {
    expect(replaceHireNetAmountsWithTaxBases(10_000, [
      { netAmount: -20_967.74, taxBase: 29_032.26 },
      { netAmount: 8_000, taxBase: 10_000 },
    ])).toBe(62_000);
  });

  it("preserves the previous calculation for saved statement output", () => {
    const savedSnapshotResult = calculateEquipmentHireFinancialsLegacy({
      grossHire: 29_032.26,
      breakdownDeduction: 0,
      advanceAdjustment: 50_000,
      gstRate: 18,
      tdsRate: 2,
      paid: 0,
    });

    expect(savedSnapshotResult.taxableAmount).toBe(0);
    expect(savedSnapshotResult.gstAmount).toBe(0);
    expect(savedSnapshotResult.tdsAmount).toBe(0);
    expect(savedSnapshotResult.netPayable).toBe(0);
    expect(savedSnapshotResult.balanceThisBill).toBe(0);
  });
});
