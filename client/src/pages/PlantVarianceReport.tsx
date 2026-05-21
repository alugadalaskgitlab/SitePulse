import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, TrendingUp, TrendingDown, FileWarning } from "lucide-react";
import { format } from "date-fns";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

export default function PlantVarianceReport() {
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDeliveredTo, setFilterDeliveredTo] = useState("all");
  const [filterTemplateId, setFilterTemplateId] = useState("all");
  const [filterPartyId, setFilterPartyId] = useState("all");

  const { data: dispatches, isLoading } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches/variance-report", filterDateFrom, filterDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/dispatches/variance-report?${params}`);
      return res.json();
    },
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";
  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || `Party #${id}` : "HLC";

  // Distinct delivery sites from fetched dispatches
  const deliveredToOptions = useMemo(() => {
    if (!dispatches) return [];
    const locs = new Set<string>();
    for (const d of dispatches) {
      const loc = (d.deliveryLocation || "").trim();
      if (loc) locs.add(loc.toUpperCase());
    }
    return [...locs].sort();
  }, [dispatches]);

  // Client-side filtering by Dispatched To, Mix Type, Stock Owner
  const displayDispatches = useMemo(() => {
    if (!dispatches) return [];
    return dispatches.filter(d => {
      if (filterDeliveredTo !== "all") {
        const loc = (d.deliveryLocation || "").trim().toUpperCase();
        if (loc !== filterDeliveredTo) return false;
      }
      if (filterTemplateId !== "all" && String(d.mixTemplateId) !== filterTemplateId) return false;
      if (filterPartyId !== "all" && String(d.partyId ?? "") !== filterPartyId) return false;
      return true;
    });
  }, [dispatches, filterDeliveredTo, filterTemplateId, filterPartyId]);

  const formatVariance = (variance: number | null) => {
    if (variance === null || variance === undefined) return null;
    const v = Number(variance);
    if (isNaN(v)) return null;
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}%`;
  };

  const getVarianceColor = (variance: number | null) => {
    if (variance === null || variance === undefined) return "";
    const v = Number(variance);
    if (v > 0) return "text-red-600 dark:text-red-400";
    if (v < 0) return "text-green-600 dark:text-green-400";
    return "";
  };

  const getVarianceBadge = (variance: number | null) => {
    if (variance === null || variance === undefined) return null;
    return <Badge variant="outline" className="gap-1">{formatVariance(variance)}</Badge>;
  };

  const getBitumenDiffKg = (dispatch: TruckDispatch) => {
    const actualPercent = dispatch.actualBitumenPercent;
    const theoreticalPercent = dispatch.theoreticalBitumenPercent;
    if (actualPercent == null || theoreticalPercent == null || !dispatch.loadWeight) return null;
    const actualKg = (dispatch.loadWeight * actualPercent / 100) * 1000;
    const theoreticalKg = (dispatch.loadWeight * theoreticalPercent / 100) * 1000;
    return actualKg - theoreticalKg;
  };

  const formatDiff = (diff: number | null, unit: string) => {
    if (diff === null) return "-";
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(3)} ${unit}`;
  };

  const totalBitumenDiffKg = displayDispatches.reduce((sum, d) => sum + (getBitumenDiffKg(d) || 0), 0);

  const summaryStats = displayDispatches.length > 0 ? {
    totalEntries: displayDispatches.length,
    bitumenOveruse: displayDispatches.filter(d => Number(d.bitumenVariancePercent || 0) > 0).length,
    bitumenUnderuse: displayDispatches.filter(d => Number(d.bitumenVariancePercent || 0) < 0).length,
    avgBitumenVariance: displayDispatches.reduce((sum, d) => sum + Number(d.bitumenVariancePercent || 0), 0) / displayDispatches.length,
  } : null;

  const hasActiveFilter = filterDeliveredTo !== "all" || filterTemplateId !== "all" || filterPartyId !== "all";

  const clearAllFilters = () => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterDeliveredTo("all");
    setFilterTemplateId("all");
    setFilterPartyId("all");
  };

  // Only show templates/parties that appear in the fetched dataset
  const activeTemplateIds = useMemo(() => new Set(dispatches?.map(d => d.mixTemplateId).filter(Boolean)), [dispatches]);
  const activePartyIds = useMemo(() => new Set(dispatches?.map(d => d.partyId ?? null)), [dispatches]);

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-report-title">
            <FileWarning className="w-6 h-6 text-amber-600" />
            Consumption Variance Report
          </h1>
          <p className="text-muted-foreground">Compares actual bitumen consumption (entered during dispatch) vs theoretical (from mix template)</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Date range row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div className="col-span-2 flex items-end">
              {(filterDateFrom || filterDateTo || hasActiveFilter) && (
                <Button variant="outline" onClick={clearAllFilters} data-testid="button-clear-filters">
                  Clear All Filters
                </Button>
              )}
            </div>
          </div>
          {/* Extra filter row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">DISPATCHED TO</Label>
              <Select value={filterDeliveredTo} onValueChange={setFilterDeliveredTo}>
                <SelectTrigger data-testid="select-filter-delivered-to">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {deliveredToOptions.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">MIX TYPE</Label>
              <Select value={filterTemplateId} onValueChange={setFilterTemplateId}>
                <SelectTrigger data-testid="select-filter-template">
                  <SelectValue placeholder="All Mix Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Mix Types</SelectItem>
                  {templates?.filter(t => activeTemplateIds.has(t.id)).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">STOCK OWNER</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {parties?.filter(p => activePartyIds.has(p.id)).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {summaryStats && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Dispatches with Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-total-entries">{summaryStats.totalEntries}</p>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-red-600 dark:text-red-400">{summaryStats.bitumenOveruse} loads over template</span>
                  <span>/</span>
                  <span className="text-green-600 dark:text-green-400">{summaryStats.bitumenUnderuse} loads under template</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Bitumen Variance (Actual vs Template)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {summaryStats.avgBitumenVariance > 0 ? (
                    <TrendingUp className="w-4 h-4 text-red-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  )}
                  <p className="text-2xl font-bold" data-testid="text-avg-bitumen-variance">{formatVariance(summaryStats.avgBitumenVariance)}</p>
                  <span className="text-xs text-muted-foreground">avg</span>
                </div>
                <p className={`text-sm font-mono mt-1 ${totalBitumenDiffKg > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} data-testid="text-total-bitumen-diff">
                  {formatDiff(totalBitumenDiffKg, "Kg")} total {totalBitumenDiffKg > 0 ? "(excess)" : totalBitumenDiffKg < 0 ? "(saved)" : ""}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
            <strong>Reading the numbers:</strong> Negative % (green) = Savings (less bitumen used than template). Positive % (red) = Excess (more bitumen used than template).
            The Kg difference shows the total quantity difference between actual and theoretical bitumen across all shown dispatches.
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Variance Details</CardTitle>
          {hasActiveFilter && displayDispatches.length !== dispatches?.length && (
            <span className="text-xs text-muted-foreground">Showing {displayDispatches.length} of {dispatches?.length} dispatches</span>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading variance data...</p>
          ) : !displayDispatches.length ? (
            <p className="text-center py-8 text-muted-foreground">
              {hasActiveFilter ? "No dispatches match the selected filters." : "No variance entries found. All dispatches are using theoretical consumption values."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Truck</th>
                    <th className="text-left p-2">Mix</th>
                    <th className="text-left p-2">Site</th>
                    <th className="text-left p-2">Owner</th>
                    <th className="text-right p-2">Load (MT)</th>
                    <th className="text-right p-2" title="Bitumen % from the mix template">Template %</th>
                    <th className="text-right p-2" title="Actual bitumen % entered during dispatch">Actual %</th>
                    <th className="text-right p-2" title="Percentage variance: (Actual - Template) / Template × 100">Variance %</th>
                    <th className="text-right p-2" title="Quantity saved or excess in Kg">Saved/Excess (Kg)</th>
                    <th className="text-left p-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {displayDispatches.map((dispatch) => {
                    const bitumenDiff = getBitumenDiffKg(dispatch);
                    return (
                      <tr key={dispatch.id} className="border-b hover:bg-muted/50" data-testid={`row-variance-${dispatch.id}`}>
                        <td className="p-2 whitespace-nowrap">{format(new Date(dispatch.date), "dd MMM")}</td>
                        <td className="p-2 font-mono text-xs">{dispatch.truckNumber}</td>
                        <td className="p-2 text-xs">{getTemplateName(dispatch.mixTemplateId)}</td>
                        <td className="p-2 text-xs text-muted-foreground">{dispatch.deliveryLocation || "-"}</td>
                        <td className="p-2 text-xs">{getPartyName(dispatch.partyId ?? null)}</td>
                        <td className="p-2 text-right font-mono">{dispatch.loadWeight}</td>
                        <td className="p-2 text-right font-mono text-xs">{dispatch.theoreticalBitumenPercent != null ? `${Number(dispatch.theoreticalBitumenPercent).toFixed(2)}%` : "-"}</td>
                        <td className={`p-2 text-right font-mono text-xs font-semibold ${dispatch.actualBitumenPercent != null && dispatch.theoreticalBitumenPercent != null ? (Number(dispatch.actualBitumenPercent) > Number(dispatch.theoreticalBitumenPercent) ? "text-red-600 dark:text-red-400" : Number(dispatch.actualBitumenPercent) < Number(dispatch.theoreticalBitumenPercent) ? "text-green-600 dark:text-green-400" : "") : ""}`}>
                          {dispatch.actualBitumenPercent != null ? `${Number(dispatch.actualBitumenPercent).toFixed(2)}%` : "-"}
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(dispatch.bitumenVariancePercent)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(bitumenDiff)}`}>
                          {formatDiff(bitumenDiff, "Kg")}
                        </td>
                        <td className="p-2 text-xs">
                          {dispatch.adjustedBy ? (
                            <Badge variant="outline" className="text-xs">{dispatch.adjustedBy}</Badge>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {displayDispatches.length > 1 && (() => {
                    const totLoad = displayDispatches.reduce((s, d) => s + (d.loadWeight || 0), 0);
                    const totTheoreticalBitKg = displayDispatches.reduce((s, d) => s + (d.theoreticalBitumenPercent != null && d.loadWeight ? d.loadWeight * Number(d.theoreticalBitumenPercent) / 100 * 1000 : 0), 0);
                    const totActualBitKg = displayDispatches.reduce((s, d) => s + (d.actualBitumenPercent != null && d.loadWeight ? d.loadWeight * Number(d.actualBitumenPercent) / 100 * 1000 : 0), 0);
                    const avgTemplatePercent = totLoad > 0 ? (totTheoreticalBitKg / (totLoad * 1000)) * 100 : 0;
                    const avgActualPercent = totLoad > 0 ? (totActualBitKg / (totLoad * 1000)) * 100 : 0;
                    return (
                      <tr className="border-t-2 font-bold bg-muted/30">
                        <td className="p-2" colSpan={5}>Total / Weighted Avg</td>
                        <td className="p-2 text-right font-mono">{totLoad.toFixed(1)}</td>
                        <td className="p-2 text-right font-mono text-xs">{avgTemplatePercent.toFixed(2)}%</td>
                        <td className={`p-2 text-right font-mono text-xs ${avgActualPercent > avgTemplatePercent ? "text-red-600 dark:text-red-400" : avgActualPercent < avgTemplatePercent ? "text-green-600 dark:text-green-400" : ""}`}>
                          {avgActualPercent.toFixed(2)}%
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(avgTemplatePercent > 0 ? ((avgActualPercent - avgTemplatePercent) / avgTemplatePercent) * 100 : null)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(totalBitumenDiffKg)}`}>
                          {formatDiff(totalBitumenDiffKg, "Kg")}
                        </td>
                        <td className="p-2"></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
