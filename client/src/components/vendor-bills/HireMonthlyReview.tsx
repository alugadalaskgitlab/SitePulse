import { MONTHLY_BILL_HEADERS, hireReviewDisclosureLines, hireReviewTable, type HireReview } from "@shared/vendorBillLayout";

export default function HireMonthlyReview({
  review,
  calendars = true,
  groupedReviews = [],
  showEquipmentTerms = true,
  adjustments = [],
}: {
  review: HireReview;
  calendars?: boolean;
  groupedReviews?: HireReview[];
  showEquipmentTerms?: boolean;
  adjustments?: Array<{
    period?: string;
    label: string;
    amount: number;
    kind: "deduction" | "credit";
    reason?: string;
    paymentDate?: string;
  }>;
}) {
  const reviews = [review, ...groupedReviews];
  const commonTerms = reviews.every(item =>
    item.basis === review.basis && item.rate === review.rate && item.divisor === review.divisor);
  const from = reviews.map(item => item.from).filter(Boolean).sort()[0] || review.from;
  const to = reviews.map(item => item.to).filter(Boolean).sort().at(-1) || review.to;
  const rows = reviews.flatMap(item => hireReviewTable(item).map(row => row.slice(1)))
    .map((row, index) => [index + 1, ...row]);
  const disclosures = reviews.flatMap(hireReviewDisclosureLines);
  const money = (value: number | null) => value == null ? "—" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <section className="space-y-3" aria-label={`Equipment hire review · ${review.name}`}>
    {showEquipmentTerms && <div className="rounded border px-3 py-2 text-xs flex flex-wrap gap-x-5 gap-y-2">
      <strong>{review.name}</strong>
      {review.masterReference != null && <span>Equipment Master reference: {review.masterReference}</span>}
      {commonTerms ? <>
        <span>Hire Basis: {review.basis}</span>
        <span>Rate / Unit: {money(review.rate)} / {{ monthly: "Month", daily: "Day", hourly: "Hour", trip: "Trip" }[review.basis] || "—"}</span>
        <span>{from} to {to}</span>
        {review.basis === "monthly" && <span>Monthly divisor: {review.divisor}</span>}
      </> : reviews.map((item, index) => <span key={`${item.from}-${item.to}-${index}`}>
        Saved terms: {item.from} to {item.to} · {item.basis} · {money(item.rate)} / {{ monthly: "Month", daily: "Day", hourly: "Hour", trip: "Trip" }[item.basis] || "—"}{item.basis === "monthly" ? ` · ${item.divisor}` : ""}
      </span>)}
    </div>}
    {calendars && reviews.flatMap((item, reviewIndex) => item.months.map(month => <details key={`${reviewIndex}-${month.key}`} className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Activity Calendar — {month.label} · {review.name}</summary>
      <div className="overflow-x-auto mt-2"><table className="w-full text-xs"><thead><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Recorded activity</th></tr></thead>
        <tbody>{month.days.map(day => <tr key={day.date} className="border-t"><td className="p-2">{day.date}</td><td className="p-2">{day.classification}</td></tr>)}</tbody>
      </table></div>
    </details>))}
    <div className="rounded border p-3 space-y-2">
      <h3 className="font-semibold text-sm">Monthly Billing Summary</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
        <thead className="bg-muted/40"><tr>{MONTHLY_BILL_HEADERS.map(h => <th key={h} className="p-2 text-right first:text-left">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => {
          const isGrossAmount = MONTHLY_BILL_HEADERS[j] === "Gross Amount (₹)";
          return <td key={j} className={`p-2 tabular-nums ${j === 0 || j === 1 ? "text-left" : "text-right"}`}>
            {isGrossAmount && typeof cell === "number" ? money(cell) : cell}
          </td>;
        })}</tr>)}</tbody>
      </table></div>
      {adjustments.length > 0 && <div className="space-y-1 border-t pt-2" data-testid="hire-monthly-adjustments">
        <h4 className="text-xs font-semibold">Recorded deductions / recoveries</h4>
        {adjustments.map((item, index) => <div key={`${item.period}-${item.label}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
          <span>
            {item.period && <span className="text-muted-foreground">{item.period} · </span>}
            {item.label}
            {item.reason && <span className="text-muted-foreground"> · {item.reason}</span>}
            {item.paymentDate && <span className="block text-muted-foreground">Advance payment date: {item.paymentDate}</span>}
          </span>
          <strong className="tabular-nums">{item.kind === "credit" ? "+" : "−"}{money(item.amount)}</strong>
        </div>)}
      </div>}
      {disclosures.map((line, index) => <p key={index}
        className={line.includes("dates require review") ? "rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" : "text-xs text-muted-foreground"}
        data-testid={line.includes("dates require review") ? "hire-review-required-days" : undefined}>{line}</p>)}
      {reviews.length === 1
        ? <p className="text-xs">Recorded period Gross Hire: <strong>{money(review.gross)}</strong></p>
        : <div className="space-y-1 text-xs">{reviews.map((item, index) => <p key={`${item.from}-${item.to}-${index}`}>
          Recorded period Gross Hire ({item.from} to {item.to}): <strong>{money(item.gross)}</strong>
        </p>)}</div>}
    </div>
  </section>;
}
