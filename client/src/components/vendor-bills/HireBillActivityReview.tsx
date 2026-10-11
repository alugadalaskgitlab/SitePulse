import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasIncludedOperationalTripOnSameDay } from "./equipmentHireUi";

export function HireBillActivityReview({ group, activities, result, onChange }: {
  group: any; activities: any[]; result: any; onChange: (patch: any) => void;
}) {
  const changeTrip = (activity: any, patch: any) => {
    const previous = group.tripDecisions.find((d: any) => d.source === activity.source && d.sourceId === activity.sourceId);
    onChange({ tripDecisions: [
      ...group.tripDecisions.filter((d: any) => d.source !== activity.source || d.sourceId !== activity.sourceId),
      { source: activity.source, sourceId: activity.sourceId, ...previous, ...patch },
    ] });
  };
  return <div className="space-y-3 rounded border p-3" data-testid={`hire-activity-${group.id}`}>
    <h4 className="text-sm font-semibold">Activity review · {group.basis === "trip" ? "Recorded trips" : group.basis === "hourly" ? "Recorded working hours" : "Daily attendance"}</h4>
    <p className="text-xs text-muted-foreground">{group.basis === "daily" ? "Use the date-wise daily review below for Full/Half/Excluded decisions. Recorded trips support attendance only." : group.basis === "trip"
      ? "Accept or exclude each recorded trip. Delivery evidence needs a reason and must not duplicate operational trips."
      : "Only actual recorded working hours are used. Trips never imply hours; missing hours remain unavailable."}</p>
    {!activities.length && <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">No operational activity is recorded for this equipment and billing period. No trips or hours will be invented.</p>}
    {group.basis !== "daily" && <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{["Date", "Source", "Recorded quantity", ...(group.basis === "trip" ? ["Decision", "Corrected trips", "Reason / reference"] : [])].map(label =>
        <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{activities.map(activity => {
        const decision = group.tripDecisions.find((d: any) => d.source === activity.source && d.sourceId === activity.sourceId);
        const tripCandidate = activity.entryType === "trip_based";
        const counterpart = (activity.source === "site_material_trip" || activity.source === "bulk_transport_trip") &&
          hasIncludedOperationalTripOnSameDay(activities, group.tripDecisions, activity);
        return <tr key={`${activity.source}:${activity.sourceId}`} className="border-t align-top">
          <td className="p-2 whitespace-nowrap">{activity.businessDate}</td><td className="p-2">{activity.source.replaceAll("_", " ")} #{activity.sourceId}</td>
          <td className="p-2">{group.basis === "trip" ? activity.numberOfTrips ?? "Unavailable" : activity.hoursOrKmRun ?? "Unavailable"}</td>
          {group.basis === "trip" && <>
            <td className="p-2">{tripCandidate ? <select className="rounded border bg-background p-1"
              aria-label={`Trip decision ${activity.source} ${activity.sourceId}`} value={decision?.selected === true ? "accept" : decision?.selected === false ? "exclude" : ""}
              onChange={e => changeTrip(activity, { selected: e.target.value === "accept" })}>
              <option value="" disabled>Review trip</option><option value="accept">Accept</option><option value="exclude">Exclude</option>
            </select> : "Not trip evidence"}
            {tripCandidate && counterpart && <label className="mt-2 flex gap-1"><input type="checkbox" checked={decision?.separateFromOperational === true}
              onChange={e => changeTrip(activity, { separateFromOperational: e.target.checked })} />Separate from same-day operational trip</label>}
            </td>
            <td className="p-2">{tripCandidate && <Input type="number" min="0" step="1" aria-label={`Corrected trips ${activity.source} ${activity.sourceId}`}
              value={decision?.correctedTrips ?? ""} placeholder={String(activity.numberOfTrips ?? "")}
              onChange={e => changeTrip(activity, { correctedTrips: e.target.value === "" ? undefined : Number(e.target.value) })} />}</td>
            <td className="p-2">{tripCandidate && <Input aria-label={`Trip reason ${activity.source} ${activity.sourceId}`} value={decision?.remarks || ""}
              onChange={e => changeTrip(activity, { remarks: e.target.value })} />}</td>
          </>}
        </tr>;
      })}</tbody>
    </table></div>}
    {!!result?.exceptions?.length && <div className="space-y-2">
      <h4 className="text-xs font-semibold">Exceptions and deductions</h4>
      {result.exceptions.map((exception: any, index: number) => {
        const matches = (d: any) => d.sourceType === exception.sourceType && d.sourceId === exception.sourceId &&
          d.exceptionType === exception.exceptionType && d.date === exception.date;
        const decision = group.exceptionDecisions.find(matches);
        const change = (patch: any) => onChange({ exceptionDecisions: [...group.exceptionDecisions.filter((d: any) => !matches(d)),
          { sourceType: exception.sourceType, sourceId: exception.sourceId, exceptionType: exception.exceptionType, date: exception.date, ...decision, ...patch }] });
        return <div key={index} className="grid gap-2 rounded border p-2 md:grid-cols-3">
          <p className="text-xs">{exception.date} · {exception.description}</p>
          <select className="rounded border bg-background p-1 text-xs" aria-label={`Exception decision ${index}`} value={decision?.decision || ""}
            onChange={e => change({ decision: e.target.value })}><option value="" disabled>Review exception</option>
            <option value="none">No deduction</option><option value="full_day">Full deduction</option><option value="half_day">Half deduction</option><option value="manual">Manual deduction</option></select>
          <div>{decision?.decision === "manual" && <Input type="number" min="0" step="0.01" aria-label={`Deduction amount ${index}`}
            value={decision.manualDeductionAmount ?? ""} onChange={e => change({ manualDeductionAmount: Number(e.target.value) })} />}
            <Input aria-label={`Exception reason ${index}`} placeholder="Reason / reference" value={decision?.remarks || ""} onChange={e => change({ remarks: e.target.value })} /></div>
        </div>;
      })}
    </div>}
    {(Number(result?.diesel?.suggestedExcess || 0) > 0 || group.dieselRecoveryDecision) && <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-semibold">Existing HSD recovery review</p>
      <p className="text-xs text-muted-foreground">Suggested recovery: {result?.diesel?.suggestedRecoveryAmount == null ? "Rate unavailable; enter an agreed amount" : `₹${Number(result.diesel.suggestedRecoveryAmount).toLocaleString("en-IN")}`}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={result?.diesel?.suggestedRecoveryAmount == null}
          onClick={() => onChange({ dieselRecoveryDecision: "accept", dieselRecoveryFinalAmount: Number(result.diesel.suggestedRecoveryAmount) })}>Accept suggested</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ dieselRecoveryDecision: "edit" })}>Edit recovery</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ dieselRecoveryDecision: "ignore", dieselRecoveryFinalAmount: 0 })}>No recovery</Button>
      </div>
      {group.dieselRecoveryDecision && <p className="text-xs">Decision: {group.dieselRecoveryDecision}</p>}
      {group.dieselRecoveryDecision === "edit" && <div className="grid gap-2 md:grid-cols-2">
        <Input type="number" min="0" step="0.01" aria-label="Final HSD recovery amount" value={group.dieselRecoveryFinalAmount ?? ""}
          onChange={e => onChange({ dieselRecoveryFinalAmount: e.target.value === "" ? undefined : Number(e.target.value) })} />
        <Input aria-label="HSD recovery reason" placeholder="Reason / reference" value={group.dieselRecoveryRemarks || ""}
          onChange={e => onChange({ dieselRecoveryRemarks: e.target.value })} />
      </div>}
    </div>}
  </div>;
}
