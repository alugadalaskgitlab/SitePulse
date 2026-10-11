import { billReviewAmounts, summarizeBillReview, vendorStatementBills } from "@shared/vendorBillReview";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const money = (value: number | null) => value == null ? "Not established" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Props = { bills: any[]; totals: (bill: any) => any };

export function VendorBillFinancialSummary({ bills, totals }: Props) {
  const summary = summarizeBillReview(bills.map(b => billReviewAmounts(b, totals(b))));
  const figures = [
    ["Number of bills", summary.count.toString()], ["Gross amount", money(summary.gross)],
    ["Deductions / adjustments (signed, incl. TDS)", money(summary.adjustments)],
    ["GST", money(summary.gst)], ["Net bill value", money(summary.net)], ["Recorded payments", money(summary.paid)],
    ["Positive outstanding", money(summary.outstanding)], ["Negative balances / vendor credits", money(summary.credits)],
    ["Approved unpaid — eligible for payment", money(summary.eligible)],
  ];
  return <section className="rounded-lg border p-3 space-y-2" aria-label="Filtered bill financial summary">
    <h2 className="font-semibold text-sm">Financial summary · current filters</h2>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{figures.map(([label, value]) =>
      <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">Gross is the displayed line-item subtotal. Draft and Verified values are provisional. Credits are shown separately, never offset across bills or vendors.</p>
    {summary.unknownPayments > 0 && <p className="text-xs text-amber-700">Payment totals/balances are not established for {summary.unknownPayments} bill(s). Their unrecorded payments and unknown positive balances are excluded from payment and payable totals, not assumed to be zero.</p>}
  </section>;
}

export function VendorRunningStatement({ bill, bills, totals, loading, error }: Props & { bill: any; loading?: boolean; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const permittedRows = vendorStatementBills(bill, bills);
  const history = useQuery<any[]>({
    queryKey: ["/api/vendor-bills", "running-statement", bill.id, permittedRows.map(row => row.id)],
    enabled: open && !loading && !error,
    queryFn: () => Promise.all(permittedRows.filter(row => row.id !== bill.id).map(async row => {
      // Existing detail endpoint independently re-checks site access on every GET.
      const response = await fetch(`/api/vendor-bills/${row.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load permitted bill history");
      return response.json();
    })),
    retry: false,
  });
  const rows = vendorStatementBills(bill, history.data || permittedRows).filter(row => row.id !== bill.id);
  // The selected detail is already permission scoped; retain it if the list has not refreshed yet.
  if (!rows.some(row => row.id === bill.id)) rows.push(bill);
  rows.sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)) || a.id - b.id);
  let subtotal = 0;
  let paymentGap = false;
  return <details className="rounded-lg border p-3" data-testid="vendor-running-statement" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Vendor Statement</summary>
    <div className="space-y-3 pt-3">
      <p className="text-xs">Read-only, permitted-site information — not an accounting ledger. Historical opening balance: <strong>Not established</strong>. No advances or credits are automatically carried forward or consumed.</p>
      {bill.vendorId == null && <p className="text-xs text-amber-700">Unlinked/free-text vendor: only this bill is shown. Other names are not assumed to represent the same party.</p>}
      {(loading || (open && history.isFetching)) && <p role="status">Loading permitted bill history…</p>}
      {(error || history.isError) && <p role="alert">Full bill history could not be loaded. Displayed list details may be incomplete. <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button></p>}
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
      <p className="text-xs text-muted-foreground">*Calculated movement in bill-date order using current cumulative recorded payments, including provisional amounts; not historical payment-date balances or the vendor's opening/closing account balance. Later bills are shown after the current bill. Credits are indicative, not confirmed available for settlement.</p>
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
  </details>;
}
