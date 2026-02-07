import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ShoppingCart, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface SitePurchaseItem {
  id: number;
  dprId: number;
  itemDescription: string;
  quantity: number | null;
  uom: string | null;
  vendor: string | null;
  billNo: string | null;
  amount: number | null;
  date: string;
  site: string;
  engineer: string;
}

export default function SitePurchasesReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  const queryString = new URLSearchParams({
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
    ...(siteFilter && siteFilter !== "all" && { site: siteFilter }),
  }).toString();

  const { data: purchases, isLoading } = useQuery<SitePurchaseItem[]>({
    queryKey: ["/api/site-purchases", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/site-purchases?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch site purchases");
      return res.json();
    },
  });

  const { data: dprs } = useQuery<any[]>({
    queryKey: ["/api/dprs"],
  });

  const uniqueSites = Array.from(new Set(dprs?.map(d => d.site).filter(Boolean) || [])).sort();

  const totalAmount = purchases?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
  const totalItems = purchases?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/site/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Site Purchases Report</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  data-testid="input-date-to"
                />
              </div>
              <div>
                <Label className="text-xs">Site</Label>
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger data-testid="select-site-filter">
                    <SelectValue placeholder="All Sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {uniqueSites.map(site => (
                      <SelectItem key={site} value={site}>{site}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Purchases</p>
              <p className="text-2xl font-bold" data-testid="text-total-items">{totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-teal-600" data-testid="text-total-amount">
                {totalAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : !purchases?.length ? (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-data">
                No site purchases found for the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-purchases">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Site</th>
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-left p-2 font-medium">Vendor</th>
                      <th className="text-left p-2 font-medium">Bill No</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-left p-2 font-medium">UOM</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                      <th className="text-left p-2 font-medium">Reported By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{format(new Date(p.date), "dd-MMM-yyyy")}</td>
                        <td className="p-2">{p.site}</td>
                        <td className="p-2">{p.itemDescription}</td>
                        <td className="p-2">{p.vendor || "-"}</td>
                        <td className="p-2">{p.billNo || "-"}</td>
                        <td className="p-2 text-right">{p.quantity ?? "-"}</td>
                        <td className="p-2">{p.uom || "-"}</td>
                        <td className="p-2 text-right">{p.amount ? p.amount.toLocaleString("en-IN") : "-"}</td>
                        <td className="p-2">{p.engineer}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-bold">
                      <td colSpan={7} className="p-2 text-right">Total:</td>
                      <td className="p-2 text-right">{totalAmount.toLocaleString("en-IN")}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
