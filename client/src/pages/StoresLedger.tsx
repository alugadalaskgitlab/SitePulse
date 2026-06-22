import { useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ArrowDownToLine, ArrowUpFromLine, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type LedgerEntry = {
  date: string; docNumber: string; type: "GRN" | "ISSUE";
  qty: number; direction: "in" | "out"; runningBalance: number;
  counterparty: string; purpose?: string;
};
type StockItem = { itemId: number; itemName: string; category: string; uom: string; balance: number };

export default function StoresLedger() {
  const { itemId } = useParams<{ itemId: string }>();
  const _search = useSearch();
  const _backHref = new URLSearchParams(_search).get("returnTo") || "/stores";
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: stock = [] } = useQuery<StockItem[]>({ queryKey: ["/api/stores/stock-summary"] });
  const item = stock.find(s => s.itemId === parseInt(itemId || "0"));

  const { data: ledger = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/stores/ledger", itemId, dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(`/api/stores/ledger/${itemId}${p.toString() ? "?" + p : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!itemId,
  });

  const totalIn = ledger.filter(e => e.direction === "in").reduce((s, e) => s + e.qty, 0);
  const totalOut = ledger.filter(e => e.direction === "out").reduce((s, e) => s + e.qty, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={_backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold leading-tight">{item?.itemName ?? "Stock Ledger"}</h1>
              {item && <p className="text-sm text-muted-foreground">{item.category} · {item.uom}</p>}
            </div>
          </div>
          {item && (
            <div className="text-right">
              <div className="text-xl font-bold">{item.balance.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">{item.uom} in stock</div>
            </div>
          )}
        </div>

        {/* Summary cards */}
        {ledger.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{totalIn.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">{item?.uom} Received</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{totalOut.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">{item?.uom} Issued</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{(totalIn - totalOut).toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">{item?.uom} Balance</div>
            </CardContent></Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">From</Label>
            <Input type="date" className="h-8 w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">To</Label>
            <Input type="date" className="h-8 w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-sm h-8" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
          )}
        </div>

        {/* Ledger table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : ledger.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No ledger entries found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Document</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Party / Purpose</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-green-600">In</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-orange-600">Out</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, i) => (
                    <tr key={i} className="border-b border-muted/50 hover:bg-muted/20" data-testid={`ledger-row-${i}`}>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.date + "T00:00:00"), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {entry.type === "GRN"
                            ? <ArrowDownToLine className="w-3 h-3 text-green-600 flex-shrink-0" />
                            : <ArrowUpFromLine className="w-3 h-3 text-orange-600 flex-shrink-0" />}
                          <span className="font-mono text-sm font-semibold">{entry.docNumber}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        <div>{entry.counterparty || "—"}</div>
                        {entry.purpose && <div className="text-muted-foreground">{entry.purpose}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {entry.direction === "in"
                          ? <span className="text-green-600 font-semibold">{entry.qty.toFixed(2)}</span>
                          : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {entry.direction === "out"
                          ? <span className="text-orange-600 font-semibold">{entry.qty.toFixed(2)}</span>
                          : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">
                        {entry.runningBalance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 border-t font-semibold">
                    <td colSpan={3} className="px-4 py-2.5 text-sm text-right text-muted-foreground">Totals</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">{totalIn.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-600">{totalOut.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{(totalIn - totalOut).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
