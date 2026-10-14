import { billReviewAmounts, summarizeBillReview, vendorStatementBills, previousBillingSummary } from "@shared/vendorBillReview";
import { billPaymentPosition } from "@shared/vendorBillFinancialReport";
import { useQuery } from "@tanstack/react-query";

const money = (value: number | null) => value == null ? "Not established" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Props = { bills: any[]; totals: (bill: any) => any };

export function VendorBillFinancialSummary({ bills, totals }: Props) {
  const rows = bills.map(b => billReviewAmounts(b, totals(b)));
  const summary = summarizeBillReview(rows);
  const provisional = summarizeBillReview(rows.filter(row => row.provisional));
  const unconfirmed = bills.filter(bill => billPaymentPosition(bill).unconfirmed).length;
  const figures = [
    { label: "No. of Bills", value: summary.count.toString(), detail: `${provisional.count} provisional · Draft / Verified` },
    { label: "Total Gross Bill Amount", value: money(summary.gross), detail: "Displayed line-item subtotal" },
    { label: "Paid Amount", value: money(summary.paid), detail: "Recorded payments only" },
    { label: "Total Net Payable / Outstanding", value: money(summary.outstanding), detail: `Vendor credits: ${money(summary.credits)} · not offset` },
  ];
  return <section className="rounded-lg border p-3 space-y-2" aria-label="Filtered bill financial summary">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="font-semibold text-sm">Financial summary · current filters</h2>
      {unconfirmed > 0 && <span role="note" className="text-xs text-amber-700" title="Missing or contradictory recorded payment evidence. Unknown payments and balances are not assumed to be zero.">Unconfirmed: {unconfirmed}</span>}
    </div>
    <div className="overflow-x-auto" role="region" aria-label="Bill summary figures" tabIndex={0}>
      <dl className="grid grid-cols-[minmax(120px,0.6fr)_minmax(200px,1fr)_minmax(160px,0.8fr)_minmax(280px,1.4fr)] min-w-[800px] divide-x">
        {figures.map(({ label, value, detail }, index) =>
          <div key={label} className={index === 0 ? "pr-4" : "px-4"}>
            <dt className="text-xs text-muted-foreground whitespace-nowrap">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums whitespace-nowrap">{value}</dd>
            <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
          </div>)}
      </dl>
    </div>
    <p className="text-xs text-muted-foreground">Draft and Verified values are provisional, not approved for payment. Outstanding includes {money(provisional.outstanding)} provisional; only established positive balances, without credit offsets.</p>
  </section>;
}

export function VendorRunningStatement({ bill, bills, totals, loading, error }: Props & { bill: any; loading?: boolean; error?: boolean }) {
  const history = useQuery<any[]>({
    queryKey: ["/api/vendor-bills", bill.id, "statement"],
    enabled: !loading && !error && bill.vendorId != null,
    queryFn: async () => {
      const response = await fetch(`/api/vendor-bills/${bill.id}/statement`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load permitted bill history");
      return response.json();
    },
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  // Never fall back to the ordinary bill list: financial scope can be narrower.
  const previous = history.isSuccess && !history.isFetching ? previousBillingSummary(bill, history.data || [], totals) : null;
  const rows = previous?.rows || [];
  rows.sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)) || a.id - b.id);
  let subtotal = 0;
  let paymentGap = false;
  const latest = rows.at(-1);
  const hasProvisionalRows = rows.some(row => ["draft", "verified"].includes(String(row.status).toLowerCase()));
  return <section className="rounded-lg border p-3 space-y-3" data-testid="vendor-running-statement">
    <h2 className="text-sm font-semibold">Previous Billing Summary</h2>
    {history.isFetching && <p role="status" className="text-xs">Loading permitted bill history…</p>}
    {(error || history.isError) && <p role="alert" className="text-xs">Financial history is unavailable or not permitted. <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button></p>}
    {bill.vendorId == null && !loading && !error &&
      <p className="text-xs text-muted-foreground">Unlinked/free-text vendor: previous balances are unavailable; other names are not assumed to represent the same party.</p>}
    {bill.vendorId != null && history.isSuccess && !history.isFetching && previous && rows.length === 0 &&
      <p className="text-xs text-muted-foreground">No previous bills for this vendor.</p>}
    {history.isSuccess && !history.isFetching && previous && latest && <>
      <p className="text-xs"><strong>Latest previous bill:</strong> {latest.billDate} · {latest.billNo} · {latest.status} · Net value {money(billReviewAmounts(latest, totals(latest)).net)}</p>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {[
          ["Total Gross Bills up to Previous", money(previous.gross)],
          ["Paid up to Previous", money(previous.paid)],
          ["Balance carried up to this bill", money(previous.balance)],
        ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">Confirmed vendor · permitted sites · excludes this bill and later bills{hasProvisionalRows ? " · Draft / Verified values are provisional." : "."}</p>
    <details>
    <summary className="cursor-pointer text-xs font-semibold">View Previous Bills</summary>
    <div className="space-y-3 pt-3">
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr>{["Bill date / bill", "Status", "Net bill value", "Recorded payments", "This bill balance", "Credit", "Calculated cumulative movement*"].map(h => <th className="p-2 text-left" key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const a = billReviewAmounts(row, totals(row));
          paymentGap ||= a.paid == null;
          subtotal += a.net - (a.paid ?? 0);
          return <tr key={row.id} className="border-t align-top">
            <td className="p-2">{row.billDate}<br />{row.billNo}{row.id === bill.id ? " · Current bill" : ""}</td>
            <td className="p-2">{row.status}{a.provisional && <span className="block">Provisional</span>}</td>
            <td className="p-2">{money(a.net)}</td>
            <td className="p-2">{money(a.paid)}<span className="block text-muted-foreground">Cumulative recorded amount; individual payment dates/history: Not established</span>
              {row.paidAt && <span className="block">Paid status recorded: {row.paidAt}</span>}
            </td>
            <td className="p-2">{money(a.balance)}</td><td className="p-2">{money(a.credit)}{a.provisional && a.credit > 0 && " (provisional)"}</td>
            <td className="p-2">{paymentGap ? "Not established" : money(subtotal)}</td>
          </tr>;
        })}</tbody>
      </table></div>
       <p className="text-xs text-muted-foreground">*Calculated movement uses cumulative recorded payments in previous-bill date order; it is not a historical payment-date balance or the vendor's opening/closing account balance. Credits are indicative, not confirmed available for settlement.</p>
      <h3 className="text-sm font-semibold">Recorded adjustments / advance deductions</h3>
      {rows.map(row => {
        const t = totals(row);
        const adjustments = [
          ...(Number(row.adjustmentAmount) ? [{ label: row.adjustmentLabel || "Bill adjustment", amount: Number(row.adjustmentAmount) }] : []),
          ...(t.additional || []),
          ...(row.hireStatements || []).flatMap((statement: any) => {
            const saved = statement.calculationSnapshot?.adjustments;
            if (!saved) return [];
            return ["breakdownDeduction", "hsdRecovery", "otherDebit", "advanceAdjustment", "otherCredit"]
              .filter(key => Number(saved[key])).map(key => ({
                label: `${statement.equipmentName || `Equipment #${statement.equipmentId}`} · ${key}`,
                amount: Number(saved[key]) * (key === "otherCredit" ? 1 : -1), reason: saved[`${key}Reason`],
              }));
          }),
        ];
        return <div key={row.id} className="text-xs"><strong>{row.billNo} · {row.status}</strong>
          {adjustments.length ? adjustments.map((a: any, i: number) => <p key={i}>{a.label || a.description || "Adjustment"}: {money(Number(a.amount))}{a.reason ? ` · ${a.reason}` : ""}</p>) : <p>No separate bill-level adjustment recorded.</p>}
          <p className="text-muted-foreground">Advance payment history / unused advance balance: Not established. Recorded deductions are already included in bill value, not new payments.</p>
        </div>;
      })}
    </div>
    </details></>}
    </section>;
}
