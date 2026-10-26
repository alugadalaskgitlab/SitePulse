import { buildSavedEquipmentHireBillOutput, exportEquipmentHireCalendar, type BillingDailyRow } from "./EquipmentHireBillOutput";
import { Button } from "@/components/ui/button";
import HireMonthlyReview from "./HireMonthlyReview";
import { projectHireReview } from "@shared/vendorBillLayout";
import { SavedHireActivityTable } from "./SavedHireActivityTable";

const show = (v: unknown) => v == null ? "Not established" : String(v);

function savedAdjustmentRows(statements: any[]) {
  return statements.flatMap(statement => {
    const adjustments = statement.calculationSnapshot?.adjustments || {};
    const savedHsdRecovery = adjustments.hsdRecovery ??
      statement.calculationSnapshot?.dieselRecoveryFinalAmount ??
      statement.calculationSnapshot?.diesel?.finalRecoveryAmount;
    const period = [statement.periodFrom, statement.periodTo].filter(Boolean).join(" – ");
    const fields = [
      { key: "breakdownDeduction", label: "Breakdown deduction", kind: "deduction" as const },
      { key: "hsdRecovery", label: "HSD recovery", kind: "deduction" as const, savedValue: savedHsdRecovery, reasonKey: "hsdRecoveryReason" },
      { key: "otherDebit", label: "Other debit / recovery", kind: "deduction" as const, reasonKey: "otherDebitReason" },
      { key: "advanceAdjustment", label: "Advance adjustment", kind: "deduction" as const, reasonKey: "advanceAdjustmentReason", dateKey: "advanceAdjustmentDate" },
      { key: "otherCredit", label: "Other credit", kind: "credit" as const, reasonKey: "otherCreditReason" },
    ];
    return fields.flatMap(field => {
      const rawAmount = field.savedValue ?? adjustments[field.key];
      if (rawAmount == null || rawAmount === "") return [];
      const amount = Number(rawAmount);
      const showZero = field.key === "breakdownDeduction" || field.key === "hsdRecovery";
      if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !showZero)) return [];
      return [{
        period,
        label: field.label,
        amount,
        kind: field.kind,
        reason: field.reasonKey ? String(adjustments[field.reasonKey] || "").trim() : "",
        paymentDate: field.dateKey ? String(adjustments[field.dateKey] || "").trim() : "",
      }];
    });
  });
}

function missingSavedPerformanceFields(rows: BillingDailyRow[]) {
  const measuredRows = rows.filter(row => row.status !== "No Work");
  if (!measuredRows.length) return rows.length ? "No performance measurements are present for the saved no-activity dates."
    : "No dated daily evidence was saved, so daily values remain not recorded.";
  const fields: Array<[string, (row: BillingDailyRow) => boolean]> = [
    ["start/end times", row => !row.performance?.startTime || !row.performance?.endTime],
    ["clock duration", row => row.performance?.clockDuration == null],
    ["opening/closing tank readings", row => row.performance?.openingTank == null || row.performance?.closingTank == null],
    ["diesel-consumed figures", row => row.performance?.dieselConsumed == null],
  ];
  const missingFields = fields.filter(([, missing]) => measuredRows.some(missing)).map(([field]) => field);
  return missingFields.length ? `Not recorded: ${missingFields.join(", ")}.` : "No additional daily fields are unestablished.";
}

/** Only persisted bill/statement evidence; deliberately has no live-data query. */
export default function SavedBillCalendars({ bill, canExport = false }: { bill: any; canExport?: boolean }) {
  const statements: any[] = bill.hireStatements || [];
  const statementGroups = new Map<string, any[]>();
  for (const statement of statements) {
    const key = Number(statement.equipmentId) > 0
      ? `equipment-${statement.equipmentId}`
      : `statement-${statement.id ?? statementGroups.size}`;
    statementGroups.set(key, [...(statementGroups.get(key) || []), statement]);
  }
  const covered = new Set(statements.map(s => Number(s.equipmentId)));
  const legacyItems = (bill.items || []).filter((item: any) => item.category?.toLowerCase() === "equipment" && !covered.has(Number(item.equipmentId)));
  const legacyGroups = new Map<string, any[]>();
  for (const item of legacyItems) {
    const key = item.equipmentId ? `equipment-${item.equipmentId}` : `item-${item.id}`;
    legacyGroups.set(key, [...(legacyGroups.get(key) || []), item]);
  }
  if (!statements.length && !legacyGroups.size) return null;
  return <section className="space-y-3" aria-label="Saved equipment activity calendars">
    {Array.from(statementGroups, ([groupKey, equipmentStatements]) => {
      const reviews = equipmentStatements.map(statement => projectHireReview(statement, bill));
      const outputs = equipmentStatements.map((statement, index) =>
        buildSavedEquipmentHireBillOutput({
          ...bill, netPayableAmount: undefined, hireStatements: [statement], hireReview: reviews[index],
        }));
      const output = outputs.find(Boolean) || null;
      const name = reviews[0]?.name || equipmentStatements[0].equipmentName || `Equipment #${equipmentStatements[0].equipmentId}`;
      const rows = outputs.flatMap(result => result?.rows || [])
        .sort((a, b) => a.date.localeCompare(b.date));
      const allFrozenRows = outputs.length > 0 && outputs.every(result => result?.hasFrozenDailyRows);
      const periods = equipmentStatements.map(statement => ({
        from: statement.periodFrom || bill.periodFrom || "",
        to: statement.periodTo || bill.periodTo || "",
      })).filter(period => period.from && period.to);
      const periodFrom = periods.map(period => period.from).sort()[0] || "";
      const periodTo = periods.map(period => period.to).sort().at(-1) || "";
      const displayData = output ? {
        ...output.data,
        equipmentName: name,
        periodFrom,
        periodTo,
      } : null;
      const periodDetails = equipmentStatements.map((statement, index) => {
        const snapshot = statement.calculationSnapshot || {};
        const decisions = [
          ...(snapshot.dailyDecisions || []), ...(snapshot.exceptionDecisions || []), ...(snapshot.tripDecisions || []),
          ...(snapshot.decisions?.daily || []), ...(snapshot.decisions?.trip || []),
        ];
        return {
          statement, snapshot, review: reviews[index],
          output: outputs[index],
          periodDecisions: decisions.filter((decision: any) =>
            !(decision.date || decision.businessDate || decision.exceptionDate || decision.key)),
        };
      });
      const activityMonthGroups = new Map<string, {
        key: string;
        label: string;
        rows: BillingDailyRow[];
        hasFrozenRows: boolean;
      }>();
      const monthLabel = (key: string) => {
        const [year, month] = key.split("-").map(Number);
        if (!year || !month || month < 1 || month > 12) return key;
        return new Date(Date.UTC(year, month - 1, 1))
          .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
      };
      for (const review of reviews) {
        for (const month of review.months || []) {
          const key = String(month.key || month.from?.slice(0, 7) || "");
          if (key && !activityMonthGroups.has(key)) {
            activityMonthGroups.set(key, {
              key,
              label: month.label || monthLabel(key),
              rows: [],
              hasFrozenRows: false,
            });
          }
        }
      }
      for (const result of outputs) {
        if (!result) continue;
        for (const row of result.rows || []) {
          const key = String(row.date || "").slice(0, 7);
          if (!/^\d{4}-\d{2}$/.test(key)) continue;
          const group = activityMonthGroups.get(key) || {
            key,
            label: monthLabel(key),
            rows: [],
            hasFrozenRows: false,
          };
          group.rows.push(row);
          group.hasFrozenRows ||= Boolean(result.hasFrozenDailyRows);
          activityMonthGroups.set(key, group);
        }
      }
      const activityMonths = Array.from(activityMonthGroups.values())
        .sort((a, b) => a.key.localeCompare(b.key));
      const adjustments = savedAdjustmentRows(equipmentStatements);
      return <div className="space-y-3" key={groupKey}>
        {reviews.some(review => review.months.length > 0) &&
          <HireMonthlyReview
            review={reviews[0]}
            groupedReviews={reviews.slice(1)}
            calendars={false}
            showEquipmentTerms={false}
            adjustments={adjustments}
          />}
        <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold text-sm">Monthly activity · {name}</summary>
        <div className="space-y-3 pt-3">
          {activityMonths.map(month => <section key={month.key}
            className="space-y-2 rounded border p-3"
            data-testid="saved-hire-activity-month-section">
            <h4 className="text-sm font-semibold">Detailed activity · {name} · {month.label}</h4>
            {!month.hasFrozenRows && <p className="text-sm text-amber-700">
              Complete frozen performance rows are unavailable for this legacy bill. Saved working-sheet values appear in the daily table. {missingSavedPerformanceFields(month.rows)}
            </p>}
            {month.rows.length > 0
              ? <SavedHireActivityTable
                rows={month.rows}
                isTripBased={reviews.some(review => String(review.basis).toLowerCase() === "trip")}
              />
              : !month.hasFrozenRows && <p className="text-xs text-muted-foreground">No dated daily evidence was saved for this month.</p>}
          </section>)}
          {canExport && allFrozenRows && displayData?.periodFrom && displayData?.periodTo && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(displayData, rows, "pdf")}>Export Calendar PDF</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(displayData, rows, "xlsx")}>Export Calendar Excel</Button>
          </div>}
          {periodDetails.map(({ statement, snapshot, periodDecisions }, index) => <div className="contents" key={`saved-period-${statement.id ?? index}`}>
            {periodDecisions.length > 0 && <div><h4 className="text-xs font-semibold">Period-level saved billing decisions · {statement.periodFrom || "Not established"} to {statement.periodTo || "Not established"}</h4>
              {periodDecisions.map((d: any, i: number) => <p className="text-xs" key={i}>{d.sourceId || "Period"} · {d.decision || d.action || d.resolution} · {d.reason || "Reason not recorded"}</p>)}
            </div>}
          </div>)}
        </div>
      </details></div>;
    })}
    {Array.from(legacyGroups, ([key, items]) => <div className="space-y-3" key={key}>
      <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-semibold text-sm">Available saved bill lines · {items[0].description || "Equipment"}</summary>
      <div className="space-y-2 pt-3">
        <p className="text-sm text-amber-700">Frozen activity/breakdown evidence is unavailable for this legacy/itemized bill. Working hours, idle days, diesel and historical decisions: Not established. Current activity has not been used to reconstruct history.</p>
        <p className="text-xs">Saved period: {bill.periodFrom || "Not established"} to {bill.periodTo || "Not established"}. Available saved bill lines:</p>
        {items.map((item: any, i: number) => <p className="text-xs" key={item.id || i}>{item.date} · {item.description} · {show(item.qty)} {item.unit} × {show(item.rate)} = {show(item.amount)}</p>)}
      </div>
    </details></div>)}
  </section>;
}
