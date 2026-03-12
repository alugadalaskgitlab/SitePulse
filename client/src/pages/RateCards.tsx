import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { ChevronLeft, Loader2, Save, Lock, Search } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";

type DiscoveredItem = {
  itemKey: string;
  itemLabel: string;
  category: string;
  unit: string;
  rate: number | null;
  rateCardId: number | null;
};

const getCategoryBadgeClass = (cat: string) => {
  switch (cat) {
    case "equipment": return "bg-blue-600 text-white border-blue-700";
    case "material": return "bg-amber-600 text-white border-amber-700";
    case "transport": return "bg-purple-600 text-white border-purple-700";
    default: return "bg-gray-500 text-white border-gray-600";
  }
};

export default function RateCards() {
  const { toast } = useToast();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedVendor = params.get("vendorName") || "";

  const [authenticated, setAuthenticated] = useState(false);
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState(preselectedVendor);
  const [rates, setRates] = useState<Record<string, number | string>>({});
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const { data: vendorNames = [] } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const { data: discoveredItems = [], isLoading: isDiscovering } = useQuery<DiscoveredItem[]>({
    queryKey: ["/api/vendor-rate-cards/discover", selectedVendor],
    enabled: !!selectedVendor,
    queryFn: async () => {
      const r = await fetch(`/api/vendor-rate-cards/discover?vendorName=${encodeURIComponent(selectedVendor)}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Failed to discover items" }));
        throw new Error(err.message || "Failed to discover items");
      }
      return r.json();
    },
  });

  useEffect(() => {
    if (discoveredItems.length > 0) {
      const rateMap: Record<string, number | string> = {};
      discoveredItems.forEach(item => {
        if (item.rate !== null) {
          rateMap[item.itemKey] = item.rate;
        }
      });
      setRates(rateMap);
    }
  }, [discoveredItems]);

  const bulkSaveMutation = useMutation({
    mutationFn: (items: any[]) => apiRequest("POST", "/api/vendor-rate-cards/bulk-upsert", { items }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/discover", selectedVendor] });
      const savedCount = variables.filter((i: any) => i.rate && i.rate > 0).length;
      toast({ title: `${savedCount} rate(s) saved` });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to save rates", variant: "destructive" }),
  });

  const handleSaveAll = () => {
    const items = discoveredItems.map(item => ({
      vendorName: selectedVendor,
      category: item.category,
      itemKey: item.itemKey,
      itemLabel: item.itemLabel,
      unit: item.unit,
      rate: parseFloat(String(rates[item.itemKey] || 0)) || 0,
    })).filter(i => i.rate > 0);

    if (items.length === 0) {
      toast({ title: "No rates to save — enter at least one rate", variant: "destructive" });
      return;
    }
    bulkSaveMutation.mutate(items);
  };

  const filteredItems = useMemo(() => {
    return discoveredItems.filter(item => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [discoveredItems, categoryFilter, searchFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    discoveredItems.forEach(item => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [discoveredItems]);

  const filledCount = useMemo(() => {
    return Object.values(rates).filter(r => parseFloat(String(r)) > 0).length;
  }, [rates]);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto p-8 space-y-4">
        <div className="text-center space-y-2">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">RATE CARD MANAGEMENT</h1>
          <p className="text-sm text-muted-foreground">Manager or Admin PIN required to access rate cards</p>
        </div>
        {showPinAuth && (
          <PinAuth
            targetRole="any"
            onSuccess={() => { setAuthenticated(true); setShowPinAuth(false); }}
            onClose={() => setShowPinAuth(false)}
          />
        )}
        {!showPinAuth && (
          <div className="text-center space-y-2">
            <Button onClick={() => setShowPinAuth(true)} data-testid="button-retry-pin">
              ENTER PIN
            </Button>
            <div>
              <Link href="/plant/vendor-bills">
                <Button variant="ghost" size="sm">BACK TO VENDOR BILLS</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/plant/vendor-bills">
          <Button variant="ghost" size="icon" data-testid="button-back-rate-cards">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold" data-testid="text-rate-cards-title">VENDOR RATE CARDS</h1>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-xs uppercase font-semibold">Select Vendor</Label>
            <Select value={selectedVendor} onValueChange={(v) => { setSelectedVendor(v); setRates({}); setCategoryFilter("all"); setSearchFilter(""); }}>
              <SelectTrigger data-testid="select-vendor">
                <SelectValue placeholder="Choose a vendor..." />
              </SelectTrigger>
              <SelectContent>
                {vendorNames.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedVendor && isDiscovering && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Discovering items for {selectedVendor}...</span>
        </div>
      )}

      {selectedVendor && !isDiscovering && discoveredItems.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No items found for {selectedVendor}. This vendor has no equipment, materials, or transport entries in the system yet.
          </CardContent>
        </Card>
      )}

      {selectedVendor && !isDiscovering && discoveredItems.length > 0 && (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{discoveredItems.length} ITEMS FOUND</span>
                  <Badge variant="outline" className="text-[10px] bg-green-600 text-white border-green-700 no-default-hover-elevate no-default-active-elevate">
                    {filledCount} RATES SET
                  </Badge>
                  {Object.entries(categoryCounts).map(([cat, count]) => (
                    <Badge key={cat} variant="outline" className={`text-[10px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}>
                      {cat.toUpperCase()}: {count}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search items..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="pl-8 uppercase w-48"
                      data-testid="input-search-items"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-36" data-testid="select-filter-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL CATEGORIES</SelectItem>
                      <SelectItem value="equipment">EQUIPMENT</SelectItem>
                      <SelectItem value="material">MATERIAL</SelectItem>
                      <SelectItem value="transport">TRANSPORT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">ITEM</th>
                    <th className="px-3 py-2 text-left text-xs w-28">CATEGORY</th>
                    <th className="px-3 py-2 text-left text-xs w-20">UNIT</th>
                    <th className="px-3 py-2 text-right text-xs w-36">RATE (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr key={item.itemKey} className="border-t hover:bg-muted/30" data-testid={`row-discovered-item-${idx}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.itemLabel}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}>
                          {item.category.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rates[item.itemKey] ?? ""}
                          onChange={e => setRates(prev => ({ ...prev, [item.itemKey]: e.target.value }))}
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          placeholder="0.00"
                          className="text-right font-mono w-full"
                          data-testid={`input-rate-${idx}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSaveAll}
              disabled={bulkSaveMutation.isPending}
              data-testid="button-save-all-rates"
            >
              {bulkSaveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              SAVE ALL RATES
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
