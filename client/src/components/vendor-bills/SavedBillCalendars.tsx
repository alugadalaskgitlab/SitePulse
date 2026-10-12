import { buildSavedEquipmentHireBillOutput, EquipmentHireDailyTable, exportEquipmentHireCalendar } from "./EquipmentHireBillOutput";
import { EquipmentHirePeriodTotals } from "./DraftEquipmentHireCalendar";
import HireActivityBreakdownCalendar from "./HireActivityBreakdownCalendar";
import { Button } from "@/components/ui/button";
import HireMonthlyReview from "./HireMonthlyReview";
import { projectHireReview } from "@shared/vendorBillLayout";

const show = (v: unknown) => v == null ? "Not established" : String(v);

/** Only persisted bill/statement evidence; deliberately has no live-data query. */
export default function SavedBillCalendars({ bill, canExport = false }: { bill: any; canExport?: boolean }) {
  const statements: any[] = bill.hireStatements || [];
  const covered = new Set(statements.map(s => Number(s.equipmentId)));
  const legacyItems = (bill.items || []).filter((item: any) => item.category?.toLowerCase() === "equipment" && !covered.has(Number(item.equipmentId)));
  const legacyGroups = new Map<string, any[]>();
  for (const item of legacyItems) {
    const key = item.equipmentId ? `equipment-${item.equipmentId}` : `item-${item.id}`;
    legacyGroups.set(key, [...(legacyGroups.get(key) || []), item]);
  }
  if (!statements.length && !legacyGroups.size) return null;
  return <section className="space-y-3" aria-label="Saved equipment activity calendars">
    {statements.map((statement, index) => {
      const snapshot = statement.calculationSnapshot || {};
      const output = buildSavedEquipmentHireBillOutput({ ...bill, netPayableAmount: undefined, hireStatements: [statement] });
      const days: any[] = snapshot.workingSheet || [];
      const completeWorkingSheet = days.length > 0 && days.every(d =>
        typeof d.hours === "number" && typeof d.trips === "number" && typeof d.downtimeHours === "number" &&
        ["openingReadings", "closingReadings", "siteLocations", "activityDescriptions", "maintenanceDescriptions", "movementReferences"].every(key => Array.isArray(d[key])));
      const decisions = [
        ...(snapshot.dailyDecisions || []), ...(snapshot.exceptionDecisions || []), ...(snapshot.tripDecisions || []),
      ];
      const name = statement.equipmentName || snapshot.equipmentName || `Equipment #${statement.equipmentId}`;
      return <div className="space-y-3" key={statement.id || index}>
        <HireMonthlyReview review={projectHireReview(statement, bill)} />
        <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold text-sm">Detailed recorded evidence · {name}</summary>
        <div className="space-y-3 pt-3">
          <p className="text-xs">Saved evidence · {bill.status} · {statement.periodFrom || bill.periodFrom} to {statement.periodTo || bill.periodTo}. Current equipment activity is not substituted.</p>
          {output?.hasFrozenDailyRows ? <>
            <EquipmentHirePeriodTotals rows={output.rows} dieselResponsibility={output.data.dieselResponsibility} />
            <EquipmentHireDailyTable rows={output.rows} dieselResponsibility={output.data.dieselResponsibility}
              consumptionNorm={output.data.consumptionNorm} meterType={output.data.meterType} consumptionRateUnit={output.data.consumptionRateUnit} />
            {canExport && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(output.data, output.rows, "pdf")}>Export Calendar PDF</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => exportEquipmentHireCalendar(output.data, output.rows, "xlsx")}>Export Calendar Excel</Button>
            </div>}
          </> : <p className="text-sm text-amber-700">Complete frozen daily activity is unavailable for this legacy bill. Missing hours, trips, diesel and idle/breakdown details are not established; available saved information is shown below.</p>}
          {completeWorkingSheet ? <HireActivityBreakdownCalendar days={days} tripApplicable={days.some(d => d.trips > 0)}
            showFuel={String(snapshot.terms?.dieselResponsibility || statement.dieselResponsibility).toLowerCase() !== "vendor"}
            consumptionNorm={snapshot.terms?.consumptionNorm} meterType={snapshot.terms?.meterType} formatDate={date => date} />
          : days.length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr>{["Date", "Activity / hours", "Trips", "Breakdown hours", "Recorded details", "Payable quantity"].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
            <tbody>{days.map((d: any, i: number) => <tr key={i} className="border-t">
              <td className="p-2">{show(d.date)}</td><td className="p-2">{show(d.hours ?? d.runtimeHours ?? d.hoursWorked)}</td>
              <td className="p-2">{show(d.trips ?? d.numberOfTrips)}</td><td className="p-2">{show(d.downtimeHours)}</td>
              <td className="p-2">{(d.maintenanceDescriptions || []).join("; ") || show(d.activity ?? d.status ?? d.description)}</td>
              <td className="p-2">{show(d.payableQuantity ?? d.quantity)}</td>
            </tr>)}</tbody>
          </table></div>}
          <p className="text-xs">Saved period totals — Quantity: {show(statement.quantity ?? snapshot.quantity)} · Gross hire: {show(statement.grossAmount ?? snapshot.grossAmount)} · Deductions: {show(statement.deductionAmount ?? snapshot.deductionAmount)} · Net: {show(statement.netAmount ?? snapshot.netAmount)}</p>
          <h4 className="text-xs font-semibold">Saved billing decisions</h4>
          {decisions.length ? decisions.map((d: any, i: number) => <p className="text-xs" key={i}>{d.date || d.key || d.sourceId || "Period"} · {d.decision || d.action || d.resolution} · {d.reason || "Reason not recorded"}</p>)
            : <p className="text-xs text-muted-foreground">No separate decisions recorded.</p>}
          {Object.entries(snapshot.adjustments || {}).filter(([key]) => !key.toLowerCase().includes("reason")).map(([key, value]) =>
            <p className="text-xs" key={key}>{key}: {show(value)}{snapshot.adjustments[`${key}Reason`] ? ` · ${snapshot.adjustments[`${key}Reason`]}` : ""}</p>)}
        </div>
      </details></div>;
    })}
    {Array.from(legacyGroups, ([key, items]) => <div className="space-y-3" key={key}>
      <HireMonthlyReview review={projectHireReview({
        equipmentName: items[0].description || "Equipment", equipmentId: items[0].equipmentId,
        periodFrom: bill.periodFrom, periodTo: bill.periodTo,
      }, bill)} />
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
