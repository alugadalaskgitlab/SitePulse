import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TripDailyHireReview({ group, equipment, result, activities, onChange, onRemove }: {
  group: any; equipment: any; result: any; activities: any[];
  onChange: (patch: any) => void; onRemove: () => void;
}) {
  const decisions = group.dailyDecisions ?? [];
  const days = result?.payableDays ?? [];
  const change = (date: string, patch: any) => {
    const previous = decisions.find((d: any) => d.date === date) || { date, decision: "full_day", reason: "" };
    onChange({ dailyDecisions: [...decisions.filter((d: any) => d.date !== date), { ...previous, ...patch }] });
  };
  return <section className="space-y-3 rounded border p-3" data-testid={`daily-trip-hire-${group.equipmentId}`}>
    <div className="flex justify-between gap-2">
      <strong>{equipment?.registrationNumber || equipment?.name} · {equipment?.vendorName} · Daily hire</strong>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove hire group</Button>
    </div>
    <p className="text-xs text-muted-foreground">Trips support attendance only. Each vehicle/date earns at most one hire day, including dates also present in DPR or equipment usage. Review each trip-backed day and enter a reason. No hours, readings or diesel are inferred.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left"><th>Date / evidence</th><th>Trips</th><th>Hire day</th><th>Reason</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>{days.map((day: any) => {
        const trips = activities.filter(a => a.confirmedForDailyHire && a.businessDate === day.date);
        const decision = decisions.find((d: any) => d.date === day.date);
        return <tr key={day.date} className="border-t">
          <td className="p-2">{day.date}<div className="flex flex-wrap gap-1 text-xs">
            {trips.map(t => <a key={t.sourceId} className="underline" target="_blank" rel="noreferrer"
              href={`/site/material-trips?hireDate=${day.date}&hireVehicle=${encodeURIComponent(t.vehicleNumber || equipment?.registrationNumber || "")}`}>
              Trip #{t.sourceId}
            </a>)}
            {!trips.length && <span>DPR / equipment usage</span>}
          </div></td>
          <td className="p-2">{trips.length}</td>
          <td className="p-2"><select aria-label={`Hire decision ${day.date}`} value={decision?.decision || ""}
            className="rounded border bg-background p-1" onChange={e => change(day.date, { decision: e.target.value })}>
            <option value="" disabled>Review day</option><option value="full_day">Full day (1)</option>
            <option value="half_day">Half day (0.5)</option><option value="exclude">Excluded (0)</option>
          </select></td>
          <td className="p-2"><Input aria-label={`Hire reason ${day.date}`} value={decision?.reason || ""}
            onChange={e => change(day.date, { reason: e.target.value })} placeholder="Review reason / reference" /></td>
          <td className="p-2">{Number(group.rate).toLocaleString("en-IN")}</td>
          <td className="p-2">{(Number(group.rate) * day.fraction).toLocaleString("en-IN")}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="font-medium">{result?.quantity ?? 0} hire days · ₹{Number(result?.grossAmount ?? 0).toLocaleString("en-IN")}</p>
    <p className="text-xs text-muted-foreground">Existing bills are checked again on save. Already-billed dates must be excluded; an overlapping hire statement blocks a second bill.</p>
  </section>;
}
