export type BillPresentationKind =
  | "gross" | "deduction" | "credit" | "gst" | "tds" | "net";

export type BillPresentationRow = {
  label: string;
  amount: number;
  reason?: string;
  kind: BillPresentationKind;
};

const numberOrNull = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const closeTo = (a: number, b: number) => Math.abs(a - b) < 0.005;

function exceptionEvidence(snapshot: any, types: string[], fallbackReason?: unknown) {
  const exceptions = (Array.isArray(snapshot?.exceptions) ? snapshot.exceptions : [])
    .filter((entry: any) => types.includes(String(entry?.exceptionType || "").toLowerCase().replace(/-/g, "_")));
  if (exceptions.length) {
    return exceptions.map((entry: any) => [
      entry.date || entry.exceptionDate || entry.businessDate ? `Date: ${entry.date || entry.exceptionDate || entry.businessDate}` : "Date: Not recorded",
      entry.decision ? `Decision: ${entry.decision}` : "Decision: Not recorded",
      entry.reason || entry.description || entry.remarks ? `Reason: ${entry.reason || entry.description || entry.remarks}` : null,
    ].filter(Boolean).join(" · ")).join("\n");
  }
  return [
    "Date: Not recorded",
    "Decision: Not recorded",
    `Reason: ${String(fallbackReason || "Not recorded")}`,
  ].join(" · ");
}

function storedStatementRows(bill: any) {
  const statements: any[] = Array.isArray(bill?.hireStatements) ? bill.hireStatements : [];
  if (!statements.length) return null;
  const items: any[] = Array.isArray(bill?.items) ? bill.items : [];
  const hireItems = items.filter(item => ["hire_statement", "hire_group"].includes(String(item?.source || "")));
  const otherItems = items.filter(item => !["hire_statement", "hire_group"].includes(String(item?.source || "")));
  const byStatementId = new Map<number, any[]>();
  for (const item of hireItems) {
    const id = numberOrNull(item.hireStatementId);
    if (id == null) continue;
    byStatementId.set(id, [...(byStatementId.get(id) || []), item]);
  }
  const linked = statements.every(statement => {
    const id = numberOrNull(statement.id);
    const net = numberOrNull(statement.netAmount);
    const matches = id == null ? [] : byStatementId.get(id) || [];
    return net != null && matches.length === 1 && closeTo(Number(matches[0].amount), net);
  }) && hireItems.length === statements.length;
  const grossAmounts = statements.map(statement =>
    numberOrNull(statement.grossAmount ?? statement.calculationSnapshot?.financials?.grossHire ?? statement.calculationSnapshot?.grossAmount));
  const netAmounts = statements.map(statement => numberOrNull(statement.netAmount));
  if (!linked || grossAmounts.some(value => value == null) || netAmounts.some(value => value == null)) return null;

  const nonHireGross = otherItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const gross = grossAmounts.reduce<number>((sum, value) => sum + value!, nonHireGross);
  const statementNet = netAmounts.reduce<number>((sum, value) => sum + value!, nonHireGross);
  const totalAmount = numberOrNull(bill.totalAmount);
  if (totalAmount == null || !closeTo(statementNet, totalAmount)) return null;

  const collected = new Map<string, { amount: number; reasons: string[]; kind: "deduction" | "credit" }>();
  const push = (label: string, value: number, reason: string, kind: "deduction" | "credit") => {
    if (Math.abs(value) < 0.005) return;
    const current = collected.get(label) || { amount: 0, reasons: [], kind };
    current.amount += value;
    if (reason && !current.reasons.includes(reason)) current.reasons.push(reason);
    collected.set(label, current);
  };

  let statementComponentsReconcile = true;
  for (const statement of statements) {
    const snapshot = statement.calculationSnapshot || {};
    const adjustments = snapshot.adjustments || {};
    const financials = snapshot.financials || {};
    const saved = (field: string) => numberOrNull(adjustments[field] ?? financials[field]) ?? 0;
    const grossAmount = numberOrNull(statement.grossAmount ?? financials.grossHire ?? snapshot.grossAmount)!;
    const netAmount = numberOrNull(statement.netAmount)!;
    if (snapshot.taxRuleVersion === "hire_advance_tax_01") {
      const breakdown = saved("breakdownDeduction");
      push("Breakdown deduction", -breakdown,
        exceptionEvidence(snapshot, ["breakdown"], adjustments.breakdownDeductionReason) + ` · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`,
        "deduction");
      push("HSD recovery", -saved("hsdRecovery"),
        `${String(adjustments.hsdRecoveryReason || "Reason: Not recorded")} · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`,
        "deduction");
      push("Other debit / recovery", -saved("otherDebit"),
        `${String(adjustments.otherDebitReason || "Reason: Not recorded")} · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`,
        "deduction");
      const advanceRecovery = saved("advanceRecovery");
      const proposal = snapshot.advanceLedgerProposal || {};
      push("Vendor advance recovered", -advanceRecovery,
        `Opening balance: ${Number(proposal.openingBalance || 0).toFixed(2)} · Closing balance: ${Number(proposal.closingBalance || 0).toFixed(2)} · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`,
        "deduction");
      push("Other credit", saved("otherCredit"),
        `${String(adjustments.otherCreditReason || "Reason: Not recorded")} · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`,
        "credit");
      if (!closeTo(grossAmount - netAmount, breakdown)) statementComponentsReconcile = false;
      continue;
    }
    const exceptionRows: any[] = Array.isArray(snapshot.exceptions) ? snapshot.exceptions : [];
    const operatorExceptions = exceptionRows.filter((entry: any) =>
      ["operator_unavailable", "driver_unavailable"].includes(String(entry?.exceptionType || "").toLowerCase().replace(/-/g, "_")) &&
      (Number(entry?.deductionAmount) || 0) > 0);
    const operatorAmount = operatorExceptions.reduce((sum: number, entry: any) => sum + Number(entry.deductionAmount), 0);
    const breakdown = saved("breakdownDeduction");
    const hsd = saved("hsdRecovery");
    const otherDebit = saved("otherDebit");
    const advance = saved("advanceAdjustment");
    const credit = saved("otherCredit");
    const storedDelta = grossAmount - netAmount;
    const standardDelta = breakdown + hsd + otherDebit + advance - credit;
    const operatorIsIncluded = operatorAmount > 0 && operatorAmount <= otherDebit + 0.005 &&
      closeTo(storedDelta, standardDelta);
    const operatorIsSeparate = operatorAmount > 0 && closeTo(storedDelta, standardDelta + operatorAmount);
    const detailSuffix = ` · ${statement.equipmentName || `Equipment #${statement.equipmentId}`}`;
    const exceptionReason = (types: string[], fallback?: unknown) => `${exceptionEvidence(snapshot, types, fallback)}${detailSuffix}`;

    push("Breakdown deduction", -breakdown, exceptionReason(["breakdown"], adjustments.breakdownDeductionReason), "deduction");
    if (operatorIsIncluded || operatorIsSeparate) {
      push("Operator / driver unavailable", -operatorAmount,
        exceptionReason(["operator_unavailable", "driver_unavailable"], "Not recorded"), "deduction");
    }
    const remainingOtherDebit = operatorIsIncluded ? Math.max(0, otherDebit - operatorAmount) : otherDebit;
    push("Other debit", -remainingOtherDebit,
      `${exceptionEvidence(snapshot, [], adjustments.otherDebitReason)}${detailSuffix}`, "deduction");
    push("HSD recovery", -hsd, `${String(adjustments.hsdRecoveryReason || "Reason: Not recorded")} · Date/decision: Not recorded${detailSuffix}`, "deduction");
    push("Advance adjustment", -advance, `${String(adjustments.advanceAdjustmentReason || "Reason: Not recorded")} · Date/decision: Not recorded${detailSuffix}`, "deduction");
    push("Other credit", credit, `${String(adjustments.otherCreditReason || "Reason: Not recorded")} · Date/decision: Not recorded${detailSuffix}`, "credit");

    const deltaShown = breakdown + hsd + remainingOtherDebit + advance - credit + (operatorIsSeparate ? operatorAmount : 0);
    if (!closeTo(storedDelta, deltaShown)) statementComponentsReconcile = false;
  }

  if (!statementComponentsReconcile) {
    const savedNetAdjustment = statementNet - gross;
    return {
      gross,
      rows: savedNetAdjustment === 0 ? [] : [{
        label: "Recorded hire deductions / credits (component detail not reconciled)",
        amount: savedNetAdjustment,
        reason: "Saved gross and statement net retained; component categories are not re-derived.",
        kind: savedNetAdjustment < 0 ? "deduction" as const : "credit" as const,
      }],
    };
  }
  return {
    gross,
    rows: Array.from(collected, ([label, row]) => ({
      label, amount: row.amount, reason: row.reasons.join("\n"), kind: row.kind,
    })),
  };
}

/** Presentation rows only. Net and tax values are supplied by the existing bill-detail financial path. */
export function buildSavedBillPresentationRows(bill: any, totals: any): BillPresentationRow[] {
  const statement = storedStatementRows(bill);
  const gross = statement?.gross ?? (Number(totals.totalAmount) || 0);
  const rows: BillPresentationRow[] = [{ label: "Gross", amount: gross, kind: "gross" }];
  if (statement) rows.push(...statement.rows);

  for (const row of totals.gstRows || []) {
    if (Math.abs(Number(row.amount) || 0) >= 0.005) {
      rows.push({ label: row.label, amount: Number(row.amount), kind: "gst" });
    }
  }
  const primary = Number(totals.primaryAdjustment) || 0;
  if (Math.abs(primary) >= 0.005) {
    const label = String(bill.adjustmentLabel || "Bill adjustment");
    rows.push({ label, amount: primary, reason: `Reason: ${label}`, kind: primary < 0 ? "deduction" : "credit" });
  }
  for (const adjustment of totals.additional || []) {
    const amount = Number(adjustment.amount) || 0;
    if (Math.abs(amount) < 0.005) continue;
    const label = String(adjustment.label || (amount < 0 ? "Additional deduction" : "Additional credit"));
    rows.push({ label, amount, reason: `Reason: ${label}`, kind: amount < 0 ? "deduction" : "credit" });
  }
  const tds = -(Number(totals.tds) || 0);
  if (Math.abs(tds) >= 0.005) {
    rows.push({ label: `IT TDS @ ${Number(bill.tdsRate) || 0}%`, amount: tds, kind: "tds" });
  }
  rows.push({ label: "NET PAYABLE", amount: Number(totals.netTotal) || 0, kind: "net" });
  return rows;
}

export function savedBillHireFinancialRows(bill: any, totals: any) {
  return buildSavedBillPresentationRows(bill, totals)
    .filter(row => row.kind === "gross" || row.kind === "deduction" || row.kind === "credit")
    .filter(row => row.kind === "gross" || Math.abs(row.amount) >= 0.005)
    .map(({ label, amount, reason }) => ({ label, amount, reason }));
}
