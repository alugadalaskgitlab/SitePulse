import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, ChevronRight, Plus, ClipboardList, ArrowDownToLine, ArrowUpFromLine, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function StoresHome() {
  const { user } = useAuth();
  const { data: stock = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/stores/stock-summary"] });

  const lowStock = stock.filter(s => s.isLowStock);
  const totalItems = stock.length;
  const totalLow = lowStock.length;

  const byCategory = stock.reduce<Record<string, any[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm md:text-base tracking-tight">Stores</span>
            <span className="ml-2 text-slate-400 text-xs hidden sm:inline">Inventory & Issue Tracking</span>
          </div>
        </div>
        <Link href="/">
          <Button variant="ghost" size="icon" className="w-9 h-9 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-600" data-testid="button-home">
            <Home className="w-5 h-5" />
          </Button>
        </Link>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-5">
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalItems}</div>
              <div className="text-xs text-muted-foreground mt-1">Active Items</div>
            </CardContent>
          </Card>
          <Card className={totalLow > 0 ? "border-red-300 dark:border-red-800" : ""}>
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${totalLow > 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}>{totalLow}</div>
              <div className="text-xs text-muted-foreground mt-1">Low Stock</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{Object.keys(byCategory).length}</div>
              <div className="text-xs text-muted-foreground mt-1">Categories</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/stores/grns/new">
            <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm hover:border-green-400 hover:shadow-md transition-all cursor-pointer" data-testid="button-new-grn">
              <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <ArrowDownToLine className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">New GRN</p>
                <p className="text-xs text-slate-500">Goods Received Note</p>
              </div>
              <Plus className="w-4 h-4 text-slate-300 group-hover:text-green-500 ml-auto" />
            </button>
          </Link>
          <Link href="/stores/issues/new">
            <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm hover:border-orange-400 hover:shadow-md transition-all cursor-pointer" data-testid="button-new-issue">
              <div className="w-9 h-9 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                <ArrowUpFromLine className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">New Issue</p>
                <p className="text-xs text-slate-500">Issue Voucher</p>
              </div>
              <Plus className="w-4 h-4 text-slate-300 group-hover:text-orange-500 ml-auto" />
            </button>
          </Link>
          <Link href="/stores/items">
            <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer" data-testid="button-item-master">
              <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Item Master</p>
                <p className="text-xs text-slate-500">Manage catalogue</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 ml-auto" />
            </button>
          </Link>
        </div>

        {/* Low stock alerts */}
        {lowStock.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Low Stock Alerts</span>
            </div>
            <div className="space-y-2">
              {lowStock.map(s => (
                <Link href={`/stores/ledger/${s.itemId}`} key={s.itemId}>
                  <div className="flex items-center justify-between py-1.5 cursor-pointer hover:opacity-80" data-testid={`low-stock-${s.itemId}`}>
                    <div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.itemName}</span>
                      <span className="ml-2 text-xs text-slate-500">{s.category}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">{s.balance.toFixed(2)} {s.uom}</span>
                      <span className="ml-1 text-xs text-slate-400">(min: {s.minStockQty})</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Stock by category */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Current Stock</h3>
            <div className="flex gap-2">
              <Link href="/stores/grns">
                <Button variant="outline" size="sm" className="text-xs h-7" data-testid="button-view-grns">GRN History</Button>
              </Link>
              <Link href="/stores/issues">
                <Button variant="outline" size="sm" className="text-xs h-7" data-testid="button-view-issues">Issue History</Button>
              </Link>
            </div>
          </div>
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading stock...</div>
          ) : stock.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No items yet. Add items to the catalogue first, then record GRNs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Item</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Category</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Balance</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">UOM</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s, i) => (
                    <tr key={s.itemId} className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${s.isLowStock ? "bg-red-50/50 dark:bg-red-950/10" : ""}`} data-testid={`row-stock-${s.itemId}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{s.itemName}</td>
                      <td className="px-4 py-2.5 text-slate-500">{s.category}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{s.balance.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{s.uom}</td>
                      <td className="px-4 py-2.5 text-center">
                        {s.isLowStock ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">LOW</span>
                        ) : s.balance === 0 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">NIL</span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Link href={`/stores/ledger/${s.itemId}`}>
                          <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-ledger-${s.itemId}`}>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
