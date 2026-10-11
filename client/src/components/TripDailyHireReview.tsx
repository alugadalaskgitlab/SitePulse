import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TripDailyHireReview({ group, equipment, result, activities, billedDays = [], onChange, onRemove }: {
  group: any; equipment: any; result: any; activities: any[];
  billedDays?: { date: string; billNo: string; billId?: number }[];
  onChange: (patch: any) => void; onRemove: () => void;
}) {
  const decisions = group.dailyDecisions ?? [];
  const days = result?.payableDays ?? [];
  const evidenceFor = (date: string) => activities.filter(a =>
    a.businessDate?.slice(0, 10) === date &&
    (a.equipmentId == null || String(a.equipmentId) === String(group.equipmentId)));
  const tripsFor = (date: string) => evidenceFor(date).filter(a =>
    a.source === "site_material_trip" && a.confirmedForDailyHire);
  const billsFor = (date: string) => billedDays.filter(b => b.date.slice(0, 10) === date);
  const change = (date: string, patch: any) => {
    if (billsFor(date).length && patch.decision && patch.decision !== "exclude") return;
    const previous = decisions.find((d: any) => d.date === date) ||
      { date, decision: tripsFor(date).length || billsFor(date).length ? "" : "full_day", reason: "" };
    onChange({ dailyDecisions: [...decisions.filter((d: any) => d.date !== date), { ...previous, ...patch }] });
  };
  const reviewRows = days.map((day: any) => {
    const trips = tripsFor(day.date);
    const evidence = evidenceFor(day.date);
    const bills = billsFor(day.date);
    const decision = decisions.find((d: any) => d.date === day.date);
    const blocked = bills.length > 0;
    const hasChoice = ["full_day", "half_day", "exclude"].includes(decision?.decision);
    const needsReview = blocked
      ? decision?.decision !== "exclude" || !decision?.reason?.trim()
      : trips.length > 0 && (!hasChoice || !decision?.reason?.trim());
    const fraction = blocked || needsReview ? 0 : hasChoice
      ? decision.decision === "exclude" ? 0 : decision.decision === "half_day" ? 0.5 : 1
      : day.fraction;
    return { day, trips, bills, decision, blocked, needsReview, fraction,
      dpr: evidence.filter(a => a.source === "dpr_log"),
      usage: evidence.filter(a => a.source === "plant_usage") };
  });
  const pendingCount = reviewRows.filter((row: any) => row.needsReview).length;
  const reviewedQuantity = reviewRows.reduce((sum: number, row: any) => sum + row.fraction, 0);
  const adjustSummary = pendingCount > 0 || reviewRows.some((row: any) => row.blocked);
  return <section className="space-y-3 rounded border p-3" data-testid={`daily-trip-hire-${group.equipmentId}`}>
    <div className="flex justify-between gap-2">
      <strong>{equipment?.registrationNumber || equipment?.name} · {equipment?.linkedVendorName || equipment?.vendorName} · Daily hire</strong>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove hire group</Button>
    </div>
    <p className="text-xs text-muted-foreground">Trips support attendance only. Each vehicle/date earns at most one hire day, including dates also present in DPR or equipment usage. Review each trip-backed day and enter a reason. No hours, readings or diesel are inferred.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left"><th scope="col">Date</th><th scope="col">Vehicle</th><th scope="col">Trips</th><th scope="col">DPR activity</th><th scope="col">Full/Half/Excluded</th><th scope="col">Reason</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead>
      <tbody>{reviewRows.map(({ day, trips, bills, decision, blocked, needsReview, fraction, dpr, usage }: any) =>
        <tr key={day.date} className="border-t align-top">
          <td className="p-2 whitespace-nowrap">{day.date}
            {bills.map((bill: any, index: number) => <div key={`${bill.billId ?? bill.billNo}-${index}`} className="text-xs text-muted-foreground">
              Already billed: {bill.billId != null
                ? <a className="underline" href={`/plant/vendor-bills?billId=${bill.billId}`} target="_blank" rel="noreferrer">{bill.billNo}</a>
                : <span>{bill.billNo}</span>}
            </div>)}
          </td>
          <td className="p-2">{equipment?.registrationNumber || trips[0]?.vehicleNumber || equipment?.name || "—"}</td>
          <td className="p-2">{trips.reduce((sum: number, t: any) => sum + Number(t.numberOfTrips ?? 1), 0)}
            <div className="flex flex-wrap gap-1 text-xs">
            {trips.map((t: any) => <a key={`${t.source}:${t.sourceId}`} className="underline" target="_blank" rel="noreferrer"
              href={`/site/material-trips?hireDate=${day.date}&hireVehicle=${encodeURIComponent(t.vehicleNumber || equipment?.registrationNumber || "")}`}>
              Trip #{t.sourceId}
            </a>)}
          </div></td>
          <td className="p-2 text-xs">
            <div>DPR: {dpr.length}</div>
            {dpr.map((a: any) => <div key={`dpr:${a.sourceId}`}>{a.dprId != null ? `DPR #${a.dprId} · ` : ""}Log #{a.sourceId}{a.task ? ` · ${a.task}` : ""}</div>)}
            <div className="mt-1">Standalone equipment: {usage.length}</div>
            {usage.map((a: any) => <div key={`usage:${a.sourceId}`}>Usage #{a.sourceId}{a.task ? ` · ${a.task}` : ""}</div>)}
          </td>
          <td className="p-2"><select aria-label={`Hire decision ${day.date}`} value={blocked && decision?.decision !== "exclude" ? "" : decision?.decision || ""}
            className="rounded border bg-background p-1" onChange={e => change(day.date, { decision: e.target.value })}>
            <option value="" disabled>{blocked ? "Exclude billed date" : "Review day"}</option><option value="full_day" disabled={blocked}>Full day (1)</option>
            <option value="half_day" disabled={blocked}>Half day (0.5)</option><option value="exclude">Excluded (0)</option>
          </select>{blocked && <p className="mt-1 text-xs text-muted-foreground">Select Excluded and enter a reason.</p>}</td>
          <td className="p-2"><Input aria-label={`Hire reason ${day.date}`} value={decision?.reason || ""}
            required={trips.length > 0 || blocked} aria-required={trips.length > 0 || blocked}
            onChange={e => change(day.date, { reason: e.target.value })} placeholder="Review reason / reference" />
            {(trips.length > 0 || blocked) && !decision?.reason?.trim() && <p className="mt-1 text-xs text-muted-foreground">Reason required.</p>}
          </td>
          <td className="p-2">{Number(group.rate).toLocaleString("en-IN")}</td>
          <td className="p-2 whitespace-nowrap">{blocked ? "0" : needsReview ? "Needs review" : (Number(group.rate) * fraction).toLocaleString("en-IN")}</td>
        </tr>
      )}</tbody>
    </table></div>
    <p className="font-medium">{adjustSummary ? reviewedQuantity : result?.quantity ?? 0} hire days · ₹{Number(adjustSummary ? reviewedQuantity * Number(group.rate) : result?.grossAmount ?? 0).toLocaleString("en-IN")}{pendingCount > 0 ? ` · ${pendingCount} ${pendingCount === 1 ? "day needs" : "days need"} review` : ""}</p>
    <p className="text-xs text-muted-foreground">Existing bills are checked again on save. Already-billed dates must be excluded; an overlapping hire statement blocks a second bill.</p>
  </section>;
}
