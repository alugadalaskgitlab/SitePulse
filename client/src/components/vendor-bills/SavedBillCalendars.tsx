import { buildSavedEquipmentHireBillOutput, EquipmentHireDailyTable, exportEquipmentHireCalendar, type BillingDailyRow } from "./EquipmentHireBillOutput";
import { EquipmentHirePeriodTotals } from "./DraftEquipmentHireCalendar";
import { Button } from "@/components/ui/button";
import HireMonthlyReview from "./HireMonthlyReview";
import { projectHireReview } from "@shared/vendorBillLayout";

const show = (v: unknown) => v == null ? "Not established" : String(v);

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
      const someFrozenRows = outputs.some(result => result?.hasFrozenDailyRows);
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
      return <div className="space-y-3" key={groupKey}>
        {reviews.some(review => review.months.length > 0) &&
          <HireMonthlyReview review={reviews[0]} groupedReviews={reviews.slice(1)} calendars={false} />}
        <p className="text-sm font-semibold">{name} · {periodDetails.map(({ statement }) =>
          `${statement.periodFrom || bill.periodFrom}–${statement.periodTo || bill.periodTo} · ${statement.billingBasis} · Saved rate ${show(statement.rate)}`).join(" · ")}</p>
        <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold text-sm">Detailed recorded evidence · {name}</summary>
        <div className="space-y-3 pt-3">
          <p className="text-xs">Saved evidence · {bill.status} · {periodFrom || "Not established"} to {periodTo || "Not established"}. Current equipment activity is not substituted.</p>
          {allFrozenRows && output && <EquipmentHirePeriodTotals rows={rows} dieselResponsibility={output.data.dieselResponsibility} />}
          {!allFrozenRows && periodDetails.map(({ statement, output: statementOutput }) => statementOutput?.hasFrozenDailyRows &&
            <div className="space-y-1" key={`period-totals-${statement.id}`}>
              <p className="text-xs font-semibold">Saved performance totals · {statement.periodFrom || "Not established"} to {statement.periodTo || "Not established"}</p>
              <EquipmentHirePeriodTotals rows={statementOutput.rows} dieselResponsibility={statementOutput.data.dieselResponsibility} />
            </div>)}
          {!allFrozenRows && <p className="text-sm text-amber-700">Complete frozen performance rows are unavailable for this legacy bill. Saved working-sheet values appear in the daily table. {missingSavedPerformanceFields(rows)}</p>}
          {rows.length ? <>
            {output && <EquipmentHireDailyTable rows={rows} dieselResponsibility={output.data.dieselResponsibility}
              consumptionNorm={output.data.consumptionNorm} meterType={output.data.meterType} consumptionRateUnit={output.data.consumptionRateUnit} />}
            {canExport && allFrozenRows && displayData?.periodFrom && displayData?.periodTo && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(displayData, rows, "pdf")}>Export Calendar PDF</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(displayData, rows, "xlsx")}>Export Calendar Excel</Button>
            </div>}
          </> : !someFrozenRows && <p className="text-xs text-muted-foreground">No dated daily evidence was saved for this bill.</p>}
          {periodDetails.map(({ statement, snapshot, periodDecisions }, index) => <div className="contents" key={`saved-period-${statement.id ?? index}`}>
            <p className="text-xs" key={`totals-${statement.id ?? index}`}>Saved period totals ({statement.periodFrom || "Not established"} to {statement.periodTo || "Not established"}) — Quantity: {show(statement.quantity ?? snapshot.quantity)} · Gross hire: {show(statement.grossAmount ?? snapshot.grossAmount)} · Deductions: {show(statement.deductionAmount ?? snapshot.deductionAmount)} · Net: {show(statement.netAmount ?? snapshot.netAmount)}</p>
            {periodDecisions.length > 0 && <div><h4 className="text-xs font-semibold">Period-level saved billing decisions · {statement.periodFrom || "Not established"} to {statement.periodTo || "Not established"}</h4>
              {periodDecisions.map((d: any, i: number) => <p className="text-xs" key={i}>{d.sourceId || "Period"} · {d.decision || d.action || d.resolution} · {d.reason || "Reason not recorded"}</p>)}
            </div>}
            {Object.entries(snapshot.adjustments || {}).filter(([key]) => !key.toLowerCase().includes("reason")).map(([key, value]) =>
              <p className="text-xs" key={`${statement.id ?? index}-${key}`}>{key}: {show(value)}{snapshot.adjustments[`${key}Reason`] ? ` · ${snapshot.adjustments[`${key}Reason`]}` : ""}</p>)}
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
