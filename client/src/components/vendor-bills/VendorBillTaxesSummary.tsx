import { summarizeFinancialTaxes, taxCategories } from "@shared/vendorBillFinancialReport";

type TaxCell = { amount: number; incomplete: boolean };
const money = (amount: number) => `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayCell = ({ amount, incomplete }: TaxCell) =>
  incomplete ? (amount === 0 ? "Not established" : `${money(amount)}*`) : money(amount);

export function VendorBillTaxesSummary({ bills }: { bills: any[] }) {
  const { gst, tds, total, unallocated } = summarizeFinancialTaxes(bills);
  const incomplete = total.incomplete || taxCategories.some(category => tds[category].incomplete);
  const rows = [
    { label: "GST", cells: taxCategories.map(category => ({ amount: gst[category], incomplete: false })), total: { amount: gst.total, incomplete: false } },
    { label: "TDS (IT)", cells: taxCategories.map(category => tds[category]), total },
    { label: "Total", cells: taxCategories.map(category => ({ amount: gst[category] + tds[category].amount, incomplete: tds[category].incomplete })), total: { amount: gst.total + total.amount, incomplete: total.incomplete } },
  ];

  return <section className="rounded-lg border p-3 space-y-2" aria-label="Filtered bill taxes summary">
    <h2 className="font-semibold text-sm">Taxes summary · current filters</h2>
    <div className="overflow-x-auto" role="region" aria-label="Bill tax figures" tabIndex={0}>
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr>
          <th scope="col" className="p-2 text-left font-medium text-muted-foreground">Tax</th>
          {taxCategories.map(category => <th scope="col" key={category} className="p-2 text-right font-medium text-muted-foreground">{category[0].toUpperCase() + category.slice(1)}</th>)}
          <th scope="col" className="p-2 text-right font-medium text-muted-foreground">Total</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className={`border-t ${row.label === "Total" ? "font-semibold" : ""}`}>
          <th scope="row" className="p-2 text-left font-medium whitespace-nowrap">{row.label}</th>
          {[...row.cells, row.total].map((cell, index) => <td key={index} className="p-2 text-right tabular-nums whitespace-nowrap">{displayCell(cell)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">Total adds GST and recorded TDS for reporting only, not an additional bill liability.</p>
    {incomplete && <p role="note" className="text-xs text-muted-foreground">Not established: missing deduction or category evidence. *Known subtotal only; incomplete amounts are not assumed to be zero.</p>}
    {unallocated !== 0 && <p role="note" className="text-xs text-muted-foreground">Recorded TDS of {money(unallocated)} is included in Total; its category split is not established.</p>}
  </section>;
}
