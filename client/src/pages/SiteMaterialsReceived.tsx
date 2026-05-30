import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { format } from "date-fns";
import { ChevronLeft, Filter, X, Package, Loader2, Truck, Trash2, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";

const MATERIAL_OPTIONS = [
  "WMM", "GSB", "Soil", "Dust", "6MM DOWN", "10/12MM", "20MM", "BC Mix", "DBM Mix",
  "Water", "Bitumen", "Emulsion", "Diesel",
];

export default function SiteMaterialsReceived() {
  const { toast } = useToast();
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const returnTo = sp.get("returnTo") || "/site";

  const today = format(new Date(), "yyyy-MM-dd");

  const mgmtReportSite = sp.get("from") === "management-report" ? (sp.get("site") || null) : null;

  const urlFilterKeys = ["dateFrom", "dateTo", "site", "material", "supplier"];
  const urlHasFilterParams = urlFilterKeys.some((k) => sp.has(k));
  const urlFilterDefaults = urlHasFilterParams ? {
    dateFrom: sp.get("dateFrom") ?? today,
    dateTo: sp.get("dateTo") ?? today,
    site: sp.get("site") ?? "",
    material: sp.get("material") ?? "",
    supplier: sp.get("supplier") ?? "",
  } : {};

  const [filters, setFilters, resetFilters] = usePersistedFilters(
    "site-materials-received:filters:v1",
    {
      dateFrom: today,
      dateTo: today,
      site: "",
      material: "",
      supplier: "",
      ...urlFilterDefaults,
    },
    { shouldHydrate: !urlHasFilterParams },
  );

  const hasActiveFilters =
    filters.dateFrom !== today ||
    filters.dateTo !== today ||
    !!filters.site ||
    !!filters.material ||
    !!filters.supplier;

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.site) params.set("site", filters.site);
    if (filters.material) params.set("material", filters.material);
    if (filters.supplier) params.set("supplier", filters.supplier);
    const qs = params.toString();
    return qs ? `/api/materials-received?${qs}` : "/api/materials-received";
  };

  const { data: trips = [], isLoading } = useQuery<any[]>({
    queryKey: [buildUrl()],
  });

  const { data: supplierList = [] } = useQuery<string[]>({
    queryKey: ["/api/materials/suppliers"],
  });

  const uniqueSites = useMemo(() => {
    const s = new Set<string>();
    trips.forEach((t: any) => { if (t.site) s.add(t.site); });
    return Array.from(s).sort();
  }, [trips]);

  const byMaterial = useMemo(() => {
    const grouped: Record<string, { count: number; totalQty: number; uom: string }> = {};
    trips.forEach((t: any) => {
      const k = t.material;
      if (!k) return;
      if (!grouped[k]) grouped[k] = { count: 0, totalQty: 0, uom: t.uom || "" };
      grouped[k].count++;
      grouped[k].totalQty += Number(t.quantity) || 0;
    });
    return grouped;
  }, [trips]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/site-material-trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0].startsWith("/api/site-material-trips") || q.queryKey[0].startsWith("/api/materials-received"))
      });
      toast({ title: "Deleted", description: "Material entry removed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold">Materials Received</h1>
          </div>
        </div>

        {/* Management Report context banner */}
        {mgmtReportSite && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300" data-testid="banner-management-report">
            <BarChart2 className="w-4 h-4 flex-shrink-0 text-amber-500" />
            <span>From Management Report — Filtered to: <strong>{mgmtReportSite}</strong></span>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto gap-1" data-testid="button-reset-filters">
                  <X className="w-3 h-3" /> Reset
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))} data-testid="input-date-from" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))} data-testid="input-date-to" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Site</Label>
                <Select value={filters.site || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, site: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-site-filter"><SelectValue placeholder="All Sites" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sites</SelectItem>
                    {uniqueSites.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Material</Label>
                <Select value={filters.material || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, material: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-material-filter"><SelectValue placeholder="All Materials" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Materials</SelectItem>
                    {MATERIAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Supplier / Party</Label>
                <Select value={filters.supplier || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, supplier: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-supplier-filter"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Suppliers</SelectItem>
                    {supplierList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {Object.keys(byMaterial).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(byMaterial).map(([material, data]) => (
              <Card key={material} data-testid={`card-material-${material}`}>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">{data.totalQty.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">{data.uom}</div>
                  <div className="font-medium mt-1">{material}</div>
                  <div className="text-xs text-muted-foreground">{data.count} trip{data.count !== 1 ? "s" : ""}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Material Entries ({trips.length})
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No material entries found for the selected filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 border text-xs">Date / Time</th>
                      <th className="text-left p-2 border text-xs">Site</th>
                      <th className="text-left p-2 border text-xs">Vehicle</th>
                      <th className="text-left p-2 border text-xs">Material</th>
                      <th className="text-right p-2 border text-xs">Qty / UOM</th>
                      <th className="text-left p-2 border text-xs">Supplier</th>
                      <th className="text-left p-2 border text-xs">Receipt No.</th>
                      <th className="text-center p-2 border text-xs">Work Type</th>
                      <th className="text-center p-2 border text-xs">Source</th>
                      <th className="text-center p-2 border text-xs w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((trip: any) => (
                      <tr key={`${trip.source}-${trip.id}`} className="border-b hover:bg-muted/30" data-testid={`row-material-${trip.source}-${trip.id}`}>
                        <td className="p-2 border text-xs">
                          <div>{trip.date ? format(new Date(trip.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase() : "-"}</div>
                          {trip.time && <div className="text-muted-foreground">{trip.time}</div>}
                        </td>
                        <td className="p-2 border text-xs">{trip.site || "-"}</td>
                        <td className="p-2 border text-xs">{trip.vehicleNumber || "-"}</td>
                        <td className="p-2 border text-xs font-medium">{trip.material || "-"}</td>
                        <td className="p-2 border text-xs text-right">{trip.quantity} {trip.uom}</td>
                        <td className="p-2 border text-xs">{trip.supplier || "-"}</td>
                        <td className="p-2 border text-xs">{trip.receiptNumber || "-"}</td>
                        <td className="p-2 border text-center">
                          {trip.workType ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${trip.workType === "structure" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"}`}>
                              {trip.workType === "structure" ? "STRUCTURE" : "ROAD"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 border text-center">
                          {trip.source === "dpr" ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">DPR</span>
                          ) : (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${trip.source === "trip" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                              {trip.source === "trip" ? "TRIP" : "EQUIP"}
                            </span>
                          )}
                        </td>
                        <td className="p-2 border text-center">
                          {trip.source === "trip" && (
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => deleteMutation.mutate(trip.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${trip.id}`}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
