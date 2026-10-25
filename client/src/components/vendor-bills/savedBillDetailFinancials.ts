import {
  calculateEquipmentHireFinancials,
  calculateEquipmentHireFinancialsLegacy,
} from "@shared/hireBilling";

type TaxRow = { label: string; amount: number; rate?: number };

type BillDetailTotals = {
  gstRows: TaxRow[];
  totalGst: number;
  tds: number;
  netTotal: number;
};

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed != null) return parsed;
  }
  return null;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Screen-only tax projection for saved bills. It leaves stored bill data,
 * exports, and the shared financial-report calculation untouched.
 */
export function projectSavedHireDetailFinancials<T extends BillDetailTotals>(
  bill: any,
  fallback: T,
): T | null {
  const billType = String(bill?.billType || "").toLowerCase();
  if (!["equipment", "all"].includes(billType)) return null;

  const statements: any[] = Array.isArray(bill?.hireStatements) ? bill.hireStatements : [];
  if (!statements.length) return null;

  const isDraft = String(bill?.status || "").toLowerCase() === "draft" && bill?.isCancelled !== true;
  const billGstRate = firstNumber(bill?.gstRateEquipment) ?? 0;
  const billTdsRate = firstNumber(bill?.tdsRate) ?? 0;
  const items: any[] = Array.isArray(bill?.items) ? bill.items : [];

  let displayedHireGst = 0;
  let displayedHireTds = 0;
  let linkedHireItemAmount = 0;
  let netTaxDelta = 0;

  for (const statement of statements) {
    const snapshot = statement?.calculationSnapshot || {};
    const adjustments = snapshot.adjustments || {};
    const financials = snapshot.financials || {};
    const grossHire = firstNumber(
      financials.grossHire,
      statement?.grossAmount,
      snapshot.grossAmount,
    );
    const breakdownDeduction = firstNumber(
      financials.breakdownDeduction,
      adjustments.breakdownDeduction,
      snapshot.deductionAmount,
    );
    if (grossHire == null || breakdownDeduction == null) return null;

    const current = calculateEquipmentHireFinancials({
      grossHire,
      breakdownDeduction,
      hsdRecovery: firstNumber(financials.hsdRecovery, adjustments.hsdRecovery, snapshot.dieselRecoveryFinalAmount, snapshot.diesel?.finalRecoveryAmount) ?? 0,
      otherDebit: firstNumber(financials.otherDebit, adjustments.otherDebit) ?? 0,
      advanceAdjustment: firstNumber(financials.advanceAdjustment, adjustments.advanceAdjustment) ?? 0,
      otherCredit: firstNumber(financials.otherCredit, adjustments.otherCredit) ?? 0,
      gstRate: billGstRate,
      tdsRate: billTdsRate,
    });

    const savedGst = numberOrNull(financials.gstAmount);
    const savedTds = numberOrNull(financials.tdsAmount);
    if (!isDraft && (savedGst == null || savedTds == null)) return null;

    const savedRates = {
      gstRate: firstNumber(financials.gstRate, billGstRate) ?? 0,
      tdsRate: firstNumber(financials.tdsRate, billTdsRate) ?? 0,
    };
    const savedInput = {
      grossHire,
      breakdownDeduction,
      hsdRecovery: firstNumber(financials.hsdRecovery, adjustments.hsdRecovery, snapshot.dieselRecoveryFinalAmount, snapshot.diesel?.finalRecoveryAmount) ?? 0,
      otherDebit: firstNumber(financials.otherDebit, adjustments.otherDebit) ?? 0,
      advanceAdjustment: firstNumber(financials.advanceAdjustment, adjustments.advanceAdjustment) ?? 0,
      otherCredit: firstNumber(financials.otherCredit, adjustments.otherCredit) ?? 0,
      ...savedRates,
    };
    const savedCalculation = numberOrNull(financials.taxBase) != null
      ? calculateEquipmentHireFinancials(savedInput)
      : calculateEquipmentHireFinancialsLegacy(savedInput);
    const previousGst = savedGst ?? savedCalculation.gstAmount;
    const previousTds = savedTds ?? savedCalculation.tdsAmount;
    const statementGst = isDraft ? current.gstAmount : savedGst!;
    const statementTds = isDraft ? current.tdsAmount : savedTds!;

    const statementId = numberOrNull(statement?.id);
    const linkedItems = statementId == null ? [] : items.filter(item =>
      numberOrNull(item?.hireStatementId) === statementId,
    );
    const lineAmount = linkedItems.length
      ? linkedItems.reduce((sum, item) => sum + (numberOrNull(item?.amount) ?? 0), 0)
      : numberOrNull(statement?.netAmount);
    if (lineAmount == null) return null;

    displayedHireGst += statementGst;
    displayedHireTds += statementTds;
    linkedHireItemAmount += lineAmount;
    if (isDraft) {
      netTaxDelta += (statementGst - previousGst) - (statementTds - previousTds);
    }
  }

  const gstRows = (fallback.gstRows || []).map(row => ({ ...row }));
  const equipmentRowIndex = gstRows.findIndex(row =>
    row.label.toLowerCase().includes("equipment"),
  );
  const ungroupedEquipmentRowIndex =
    billType === "equipment" && gstRows.length === 1 ? 0 : -1;
  const targetGstRowIndex = equipmentRowIndex >= 0
    ? equipmentRowIndex
    : ungroupedEquipmentRowIndex;
  const gstLineDelta = displayedHireGst - linkedHireItemAmount * billGstRate / 100;

  if (targetGstRowIndex >= 0) {
    const row = gstRows[targetGstRowIndex];
    gstRows[targetGstRowIndex] = {
      ...row,
      amount: roundMoney((Number(row.amount) || 0) + gstLineDelta),
    };
  } else if (Math.abs(displayedHireGst) >= 0.005) {
    gstRows.push({
      label: `GST ON EQUIPMENT @ ${billGstRate}%`,
      amount: roundMoney(displayedHireGst),
      rate: billGstRate,
    });
  }

  const netTotal = numberOrNull(bill?.netPayableAmount) ?? fallback.netTotal;
  return {
    ...fallback,
    gstRows,
    totalGst: roundMoney(gstRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
    tds: roundMoney((Number(fallback.tds) || 0) + displayedHireTds - linkedHireItemAmount * billTdsRate / 100),
    netTotal: isDraft ? roundMoney(netTotal + netTaxDelta) : netTotal,
  };
}

export function deduplicateEquipmentHireTerms<T extends {
  equipmentId?: unknown;
  masterReference?: unknown;
  name?: unknown;
}>(terms: T[]): T[] {
  const seen = new Set<string>();
  return terms.filter((term, index) => {
    const equipmentId = term.equipmentId == null ? "" : String(term.equipmentId).trim();
    const masterReference = term.masterReference == null ? "" : String(term.masterReference).trim().toLowerCase();
    const name = term.name == null ? "" : String(term.name).trim().toLowerCase();
    const identity = equipmentId
      ? `equipment:${equipmentId}`
      : masterReference
        ? `master:${masterReference}`
        : name
          ? `name:${name}`
          : `row:${index}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
