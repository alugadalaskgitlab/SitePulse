import { useState } from "react";
import { BillDateGroupRows, type IndexedBillItem } from "./_BillDateGroups";
import { Button } from "./_Button";
import { Badge } from "./_Badge";
import "./_group.css";

type SampleItem = {
  date: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
};

const sampleItems: SampleItem[] = [
  { date: "2026-03-16", description: "MASON — DRAIN WALL WORK", qty: 8, unit: "DAY", rate: 875, amount: 7000 },
  { date: "2026-03-16", description: "HELPER — DRAIN WALL WORK", qty: 12, unit: "DAY", rate: 625, amount: 7500 },
  { date: "2026-03-17", description: "MASON — CULVERT SHUTTERING", qty: 6, unit: "DAY", rate: 875, amount: 5250 },
  { date: "2026-03-17", description: "HELPER — CULVERT SHUTTERING", qty: 10, unit: "DAY", rate: 625, amount: 6250 },
];
const labourItems: SampleItem[] = [
  { date: "2026-03-18", description: "HELPER — MATERIAL UNLOADING", qty: 7, unit: "DAY", rate: 625, amount: 4375 },
  { date: "2026-03-18", description: "MASON — PATCH REPAIR", qty: 3, unit: "DAY", rate: 875, amount: 2625 },
];
const formatCurrency = (amount: number) =>
  amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (date: string | null | undefined) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Missing date";

function TableHead() {
  return (
    <thead>
      <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
        <th className="px-2 py-2 text-left w-8">#</th>
        <th className="px-2 py-2 text-left w-24">Date</th>
        <th className="px-2 py-2 text-center w-16">Type</th>
        <th className="px-2 py-2 text-left">Description</th>
        <th className="px-2 py-2 text-left w-24">Qty</th>
        <th className="px-2 py-2 text-left w-16">Unit</th>
        <th className="px-2 py-2 text-right w-32">Rate (₹)</th>
        <th className="px-2 py-2 text-right w-36">Amount (₹)</th>
      </tr>
    </thead>
  );
}

function renderRow(item: SampleItem, idx: number) {
  return (
    <tr key={idx} className="border-b" data-testid={`sample-item-${idx}`}>
      <td className="px-2 py-1.5">{idx + 1}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(item.date)}</td>
      <td className="px-2 py-1.5 text-center text-xs">LABOUR</td>
      <td className="px-2 py-1.5">{item.description}</td>
      <td className="px-2 py-1.5">{item.qty}</td>
      <td className="px-2 py-1.5">{item.unit}</td>
      <td className="px-2 py-1.5 text-right">{formatCurrency(item.rate)}</td>
      <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(item.amount)}</td>
    </tr>
  );
}

export default function Proposed() {
  const [items, setItems] = useState(sampleItems);
  const [showLabour, setShowLabour] = useState(true);
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({
    "preview:2026-03-16": true,
    "preview:2026-03-17": false,
  });

  function removeGroup(group: Array<IndexedBillItem<SampleItem>>, label: string) {
    if (window.confirm(`Remove ${label}? This affects sample data only.`)) {
      const removedItems = new Set(group.map(({ item }) => item));
      setItems(current => current.filter(item => !removedItems.has(item)));
    }
  }

  const grp = { key: "other", label: "Manual / Other", items: labourItems };
  const grpTotal = grp.items.reduce((sum, item) => sum + item.amount, 0);
  const totalColSpan = 8;
  const badgeClass = "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600";

  return (
    <main className="vb28-preview">
      <div className="vb28-container">
        <header className="mb-5">
          <h1 className="text-xl font-semibold">Proposed placement</h1>
          <p className="mt-1 text-sm text-muted-foreground">Preview only · sample data</p>
        </header>
        <section aria-label="Date groups" className="rounded-md border bg-card">
          {/* Preserve the real vendor-bill table's 800px minimum and horizontal overflow. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <TableHead />
              <tbody>
                <BillDateGroupRows
                  items={items.map((item, idx) => ({ item, idx }))}
                  scope="preview"
                  totalColumns={totalColSpan}
                  totalBillItems={items.length}
                  expansionMode="auto"
                  expansionOverrides={expansionOverrides}
                  onToggle={(key, expanded) => setExpansionOverrides(current => ({ ...current, [key]: expanded }))}
                  onRemoveGroup={removeGroup}
                  renderRow={renderRow}
                  formatDate={formatDate}
                  formatAmount={formatCurrency}
                />
                {items.length === 0 && (
                  <tr><td colSpan={totalColSpan} className="px-3 py-6 text-muted-foreground">Sample date groups removed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-label="Labour-source header example" className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">Labour-source header</h2>
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <TableHead />
              <tbody>
                {showLabour ? (
                  <>
                    {/* Extracted from VendorBills.tsx 3787–3798; no toggle added. */}
                    <tr className="border-b bg-muted/20">
                      <td colSpan={totalColSpan} className="px-3 py-1.5 text-sm uppercase tracking-wider" data-testid={`row-labour-source-${grp.key}`}>
                        <Badge variant="outline" className={`text-[12px] mr-2 ${badgeClass} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-labour-source-${grp.key}`}>
                          {grp.label}
                        </Badge>
                        <span className="text-muted-foreground normal-case">
                          {grp.items.length} row{grp.items.length !== 1 ? "s" : ""} · Rs. {formatCurrency(grpTotal)}
                        </span>
                        <div className="mt-3 flex justify-end border-t pt-3 normal-case tracking-normal">
                          <Button type="button" variant="ghost" size="sm" className="min-h-[44px] text-destructive"
                            onClick={() => {
                              if (window.confirm(`Remove ${grp.label}? This affects sample data only.`)) setShowLabour(false);
                            }}>Remove Group</Button>
                        </div>
                      </td>
                    </tr>
                    {grp.items.map(renderRow)}
                  </>
                ) : (
                  <tr><td colSpan={totalColSpan} className="px-3 py-6 text-muted-foreground">Sample labour group removed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}