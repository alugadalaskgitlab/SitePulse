import { MONTHLY_BILL_HEADERS, hireReviewTable, type HireReview } from "@shared/vendorBillLayout";

export default function HireMonthlyReview({ review, calendars = true }: { review: HireReview; calendars?: boolean }) {
  const money = (value: number | null) => value == null ? "—" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <section className="space-y-3" aria-label={`Equipment hire review · ${review.name}`}>
    <div className="rounded border px-3 py-2 text-xs flex flex-wrap gap-x-5 gap-y-2">
      <strong>{review.name}</strong><span>Hire Basis: {review.basis}</span>
      {review.masterReference != null && <span>Equipment Master reference: {review.masterReference}</span>}
      <span>Rate / Unit: {money(review.rate)} / {{ monthly: "Month", daily: "Day", hourly: "Hour", trip: "Trip" }[review.basis] || "—"}</span>
      <span>{review.from} to {review.to}</span>
      {review.basis === "monthly" && <span>Monthly divisor: {review.divisor}</span>}
    </div>
    {calendars && review.months.map(month => <details key={month.key} className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Activity Calendar — {month.label} · {review.name}</summary>
      <p className="text-xs text-muted-foreground mt-2">Recorded evidence only. Missing activity is not Idle or Breakdown.</p>
      <div className="overflow-x-auto mt-2"><table className="w-full text-xs"><thead><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Recorded activity</th></tr></thead>
        <tbody>{month.days.map(day => <tr key={day.date} className="border-t"><td className="p-2">{day.date}</td><td className="p-2">{day.classification}</td></tr>)}</tbody>
      </table></div>
    </details>)}
    <div className="rounded border p-3 space-y-2">
      <h3 className="font-semibold text-sm">Monthly Billing Summary</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
        <thead className="bg-muted/40"><tr>{MONTHLY_BILL_HEADERS.map(h => <th key={h} className="p-2 text-right first:text-left">{h}</th>)}</tr></thead>
        <tbody>{hireReviewTable(review).map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => <td key={j} className="p-2 text-right first:text-left tabular-nums">{j === 6 && typeof cell === "number" ? money(cell) : cell}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="text-xs text-muted-foreground">{review.note}</p>
      {review.months.some(m => m.unknown > 0) && <p className="text-xs text-muted-foreground">{review.months.filter(m => m.unknown > 0).map(m => `${m.label}: ${m.unknown} dates require review`).join(" · ")}. Contractual hire does not establish activity on these dates.</p>}
      <p className="text-xs">Recorded period Gross Hire: <strong>{money(review.gross)}</strong>{review.deduction != null && review.deduction !== 0 && <> · Recorded breakdown / other deduction: {money(review.deduction)} (included only once in financial totals)</>}</p>
    </div>
  </section>;
}
