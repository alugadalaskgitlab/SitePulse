import { Fragment } from "react";
import { billReviewAmounts, previousBillingSummary, summarizeBillReview } from "@shared/vendorBillReview";
import { billPaymentPosition, getBillFinancialTotals } from "@shared/vendorBillFinancialReport";
import type { PreviousBillingContext } from "@shared/vendorBillPreviousContext";
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

export function VendorRunningStatement({ bill, bills, loading, error }: { bill: any; bills: any[]; loading?: boolean; error?: boolean }) {
  const history = useQuery<PreviousBillingContext>({
    queryKey: ["/api/vendor-bills", bill.id, "previous-bills"],
    enabled: !loading && !error && bill.vendorId != null,
    queryFn: async () => {
      const response = await fetch(`/api/vendor-bills/${bill.id}/previous-bills`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load permitted bill history");
      return response.json();
    },
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const previous = history.isSuccess && !history.isFetching ? history.data : null;
  const rows = previous?.rows || [];
  const excludedRows = previous
    ? previousBillingSummary(bill, bills, getBillFinancialTotals).excludedRows
    : [];
  const sameDateExcluded = excludedRows.filter(row =>
    String(row.billDate || "").slice(0, 10) === String(bill.billDate || "").slice(0, 10)
  );
  const laterDateExcluded = excludedRows.filter(row => !sameDateExcluded.includes(row));
  const unlinkedExcluded = bill.vendorId == null ? [] : bills.filter(row =>
    row.vendorId == null && String(row.vendorName ?? "") === String(bill.vendorName ?? "")
  );
  const latest = rows.at(-1);
  const hasProvisionalRows = rows.some(row => ["draft", "verified"].includes(String(row.status).toLowerCase()));
  return <section className="rounded-lg border p-3 space-y-3" data-testid="vendor-running-statement">
    <h2 className="text-sm font-semibold">Previous Billing Summary</h2>
    {history.isFetching && <p role="status" className="text-xs">Loading permitted bill history…</p>}
    {(error || history.isError) && <p role="alert" className="text-xs">Financial history is unavailable or not permitted. <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button></p>}
    {bill.vendorId == null && !loading && !error &&
      <p className="text-xs text-muted-foreground">Unlinked/free-text vendor: previous balances are unavailable; other names are not assumed to represent the same party.</p>}
    {unlinkedExcluded.length > 0 && !loading && !error &&
      <p role="note" className="text-xs text-amber-800">
        {unlinkedExcluded.length} {unlinkedExcluded.length === 1 ? "bill" : "bills"} excluded — not linked to this vendor: {unlinkedExcluded.map(row => row.billNo).join(", ")}.
      </p>}
    {history.isSuccess && !history.isFetching && sameDateExcluded.length > 0 &&
      <p role="note" className="text-xs text-amber-800">
        {sameDateExcluded.length} {sameDateExcluded.length === 1 ? "bill" : "bills"} excluded — {sameDateExcluded.map(row => row.billNo).join(", ")}, same bill date, counted as later.
      </p>}
    {history.isSuccess && !history.isFetching && laterDateExcluded.length > 0 &&
      <p role="note" className="text-xs text-amber-800">
        {laterDateExcluded.length} {laterDateExcluded.length === 1 ? "bill" : "bills"} excluded — {laterDateExcluded.map(row => row.billNo).join(", ")}, later bill date, counted as later.
      </p>}
    {bill.vendorId != null && history.isSuccess && !history.isFetching && previous && rows.length === 0 &&
      <p className="text-xs text-muted-foreground">No previous bills for this vendor.</p>}
    {history.isSuccess && !history.isFetching && previous && latest && <>
      <p className="text-xs"><strong>Latest previous bill:</strong> {latest.billDate} · {latest.billNo} · {latest.status} · Net value {money(latest.net)}</p>
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
         <thead><tr>{["Bill date / bill", "Bill period", "Status", "Net bill value", "Recorded payments", "This bill balance", "Credit", "Running balance before this bill"].map(h => <th className="p-2 text-left" key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
           return <Fragment key={row.id}>
             <tr className="border-t align-top">
               <td className="p-2">{row.billDate}<br />{row.billNo}{row.id === bill.id ? " · Current bill" : ""}</td>
               <td className="p-2">{row.periodFrom || "Not recorded"} – {row.periodTo || "Not recorded"}</td>
                <td className="p-2">{row.status}{row.provisional && <span className="block">Provisional</span>}</td>
                <td className="p-2">{money(row.net)}</td>
                <td className="p-2">{money(row.paid)}<span className="block text-muted-foreground">Cumulative recorded amount; individual payment dates/history: Not established</span>
                 {row.paidAt && <span className="block">Paid status recorded: {row.paidAt}</span>}
               </td>
                <td className="p-2">{money(row.balance)}</td>
                <td className="p-2">{money(row.credit)}{row.provisional && row.credit > 0 && " (provisional)"}</td>
                <td className="p-2">{money(row.runningBalance)}</td>
             </tr>
             <tr className="border-t bg-muted/10">
               <td colSpan={8} className="px-3 py-2">
                 <p className="font-semibold">Recorded adjustments / advance deductions</p>
                  {row.adjustments.length
                    ? row.adjustments.map((adjustment, index) =>
                      <p key={index}>{adjustment.label || "Adjustment"}: {money(Number(adjustment.amount))}{adjustment.reason ? ` · ${adjustment.reason}` : ""}</p>)
                   : <p>No separate bill-level adjustment recorded.</p>}
                 <p className="mt-1 text-muted-foreground">Advance payment history / unused advance balance: Not established. Recorded deductions are already included in bill value, not new payments.</p>
               </td>
             </tr>
           </Fragment>;
        })}</tbody>
      </table></div>
       <p className="text-xs text-muted-foreground">*Calculated movement uses cumulative recorded payments in previous-bill date order; it is not a historical payment-date balance or the vendor's opening/closing account balance. Credits are indicative, not confirmed available for settlement.</p>
    </div>
    </details></>}
    </section>;
}
