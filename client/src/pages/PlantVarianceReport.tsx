import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, AlertTriangle, TrendingUp, TrendingDown, FileWarning, Lock } from "lucide-react";
import { format } from "date-fns";
import { PinAuth } from "@/components/PinAuth";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

export default function PlantVarianceReport() {
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "stock" });
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: dispatches, isLoading } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches/variance-report", filterDateFrom, filterDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/dispatches/variance-report?${params}`);
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
    enabled: isAuthenticated,
  });

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
    enabled: isAuthenticated,
  });
  
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle>Variance Report Access</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">Enter Admin PIN to view variance report</p>
          </CardHeader>
          <CardContent>
            <PinAuth
              targetRole="admin"
              onSuccess={() => setIsAuthenticated(true)}
              onClose={() => window.history.back()}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";

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
    const absVariance = Math.abs(Number(variance));
    
    if (absVariance > 10) {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> {formatVariance(variance)}</Badge>;
    } else if (absVariance > 5) {
      return <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{formatVariance(variance)}</Badge>;
    } else {
      return <Badge variant="outline" className="gap-1">{formatVariance(variance)}</Badge>;
    }
  };

  const getBitumenDiffKg = (dispatch: TruckDispatch) => {
    const actualPercent = dispatch.actualBitumenPercent;
    const theoreticalPercent = dispatch.theoreticalBitumenPercent;
    if (actualPercent == null || theoreticalPercent == null || !dispatch.loadWeight) return null;
    const actualKg = (dispatch.loadWeight * actualPercent / 100) * 1000;
    const theoreticalKg = (dispatch.loadWeight * theoreticalPercent / 100) * 1000;
    return actualKg - theoreticalKg;
  };

  const getLdoDiffLiters = (dispatch: TruckDispatch) => {
    const actualLdo = dispatch.actualLdoQty;
    const theoreticalLdo = dispatch.theoreticalLdoQty;
    if (actualLdo == null || theoreticalLdo == null) return null;
    return actualLdo - theoreticalLdo;
  };

  const getActualLdoPerTon = (dispatch: TruckDispatch) => {
    if (dispatch.actualLdoQty == null || !dispatch.loadWeight || dispatch.loadWeight === 0) return null;
    return dispatch.actualLdoQty / dispatch.loadWeight;
  };

  const getTheoreticalLdoPerTon = (dispatch: TruckDispatch) => {
    if (dispatch.theoreticalLdoQty == null || !dispatch.loadWeight || dispatch.loadWeight === 0) return null;
    return dispatch.theoreticalLdoQty / dispatch.loadWeight;
  };

  const formatDiff = (diff: number | null, unit: string) => {
    if (diff === null) return "-";
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(3)} ${unit}`;
  };

  const totalBitumenDiffKg = dispatches?.reduce((sum, d) => sum + (getBitumenDiffKg(d) || 0), 0) || 0;
  const totalLdoDiffL = dispatches?.reduce((sum, d) => sum + (getLdoDiffLiters(d) || 0), 0) || 0;

  const summaryStats = dispatches ? {
    totalEntries: dispatches.length,
    bitumenOveruse: dispatches.filter(d => Number(d.bitumenVariancePercent || 0) > 0).length,
    bitumenUnderuse: dispatches.filter(d => Number(d.bitumenVariancePercent || 0) < 0).length,
    ldoOveruse: dispatches.filter(d => Number(d.ldoVariancePercent || 0) > 0).length,
    ldoUnderuse: dispatches.filter(d => Number(d.ldoVariancePercent || 0) < 0).length,
    avgBitumenVariance: dispatches.length > 0 
      ? dispatches.reduce((sum, d) => sum + Number(d.bitumenVariancePercent || 0), 0) / dispatches.length 
      : 0,
    avgLdoVariance: dispatches.length > 0 
      ? dispatches.reduce((sum, d) => sum + Number(d.ldoVariancePercent || 0), 0) / dispatches.length 
      : 0,
  } : null;

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
          <p className="text-muted-foreground">Compares actual consumption (entered during dispatch) vs theoretical (from mix template)</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
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
              <Button variant="outline" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {summaryStats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Dispatches with Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-total-entries">{summaryStats.totalEntries}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>Bitumen:</span>
                    <span className="text-red-600 dark:text-red-400">{summaryStats.bitumenOveruse} loads over template</span>
                    <span>/</span>
                    <span className="text-green-600 dark:text-green-400">{summaryStats.bitumenUnderuse} loads under template</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>LDO:</span>
                    <span className="text-red-600 dark:text-red-400">{summaryStats.ldoOveruse} loads over template</span>
                    <span>/</span>
                    <span className="text-green-600 dark:text-green-400">{summaryStats.ldoUnderuse} loads under template</span>
                  </div>
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
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">LDO Variance (Actual vs Template)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {summaryStats.avgLdoVariance > 0 ? (
                    <TrendingUp className="w-4 h-4 text-red-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  )}
                  <p className="text-2xl font-bold" data-testid="text-avg-ldo-variance">{formatVariance(summaryStats.avgLdoVariance)}</p>
                  <span className="text-xs text-muted-foreground">avg</span>
                </div>
                <p className={`text-sm font-mono mt-1 ${totalLdoDiffL > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} data-testid="text-total-ldo-diff">
                  {formatDiff(totalLdoDiffL, "L")} total {totalLdoDiffL > 0 ? "(excess)" : totalLdoDiffL < 0 ? "(saved)" : ""}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
            <strong>Reading the numbers:</strong> Negative % (green) = Savings (less material used than template). Positive % (red) = Excess (more material used than template). 
            The Kg/L difference shows the total quantity difference between actual and theoretical consumption across all dispatches.
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Variance Details</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading variance data...</p>
          ) : !dispatches?.length ? (
            <p className="text-center py-8 text-muted-foreground">No variance entries found. All dispatches are using theoretical consumption values.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Truck</th>
                    <th className="text-left p-2">Mix</th>
                    <th className="text-right p-2">Load (MT)</th>
                    <th className="text-right p-2" title="Bitumen % from the mix template">Template %</th>
                    <th className="text-right p-2" title="Actual bitumen % entered during dispatch">Actual %</th>
                    <th className="text-right p-2" title="Percentage variance: (Actual - Template) / Template × 100">Variance %</th>
                    <th className="text-right p-2" title="Quantity saved or excess in Kg">Saved/Excess (Kg)</th>
                    <th className="text-right p-2" title="Theoretical LDO from mix template (liters)">LDO Norm (L)</th>
                    <th className="text-right p-2" title="Actual LDO entered during dispatch (liters)">LDO Actual (L)</th>
                    <th className="text-right p-2" title="Actual LDO per ton / Template LDO per ton">L/ton</th>
                    <th className="text-right p-2" title="LDO variance percentage">LDO Var %</th>
                    <th className="text-right p-2" title="LDO quantity saved or excess in liters">Saved/Excess (L)</th>
                    <th className="text-left p-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((dispatch) => {
                    const bitumenDiff = getBitumenDiffKg(dispatch);
                    const ldoDiff = getLdoDiffLiters(dispatch);
                    const actualLpt = getActualLdoPerTon(dispatch);
                    const theoreticalLpt = getTheoreticalLdoPerTon(dispatch);
                    return (
                      <tr key={dispatch.id} className="border-b hover:bg-muted/50" data-testid={`row-variance-${dispatch.id}`}>
                        <td className="p-2 whitespace-nowrap">{format(new Date(dispatch.date), "dd MMM")}</td>
                        <td className="p-2 font-mono text-xs">{dispatch.truckNumber}</td>
                        <td className="p-2 text-xs">{getTemplateName(dispatch.mixTemplateId)}</td>
                        <td className="p-2 text-right font-mono">{dispatch.loadWeight}</td>
                        <td className="p-2 text-right font-mono text-xs">{dispatch.theoreticalBitumenPercent != null ? `${Number(dispatch.theoreticalBitumenPercent).toFixed(2)}%` : "-"}</td>
                        <td className={`p-2 text-right font-mono text-xs font-semibold ${dispatch.actualBitumenPercent != null && dispatch.theoreticalBitumenPercent != null ? (Number(dispatch.actualBitumenPercent) > Number(dispatch.theoreticalBitumenPercent) ? "text-red-600 dark:text-red-400" : Number(dispatch.actualBitumenPercent) < Number(dispatch.theoreticalBitumenPercent) ? "text-green-600 dark:text-green-400" : "") : ""}`}>
                          {dispatch.actualBitumenPercent != null ? `${Number(dispatch.actualBitumenPercent).toFixed(2)}%` : "-"}
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(dispatch.bitumenVariancePercent)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(bitumenDiff)}`}>
                          {formatDiff(bitumenDiff, "Kg")}
                        </td>
                        <td className="p-2 text-right font-mono text-xs text-muted-foreground">{dispatch.theoreticalLdoQty != null ? Number(dispatch.theoreticalLdoQty).toFixed(1) : "-"}</td>
                        <td className={`p-2 text-right font-mono text-xs font-semibold ${dispatch.actualLdoQty != null && dispatch.theoreticalLdoQty != null ? (Number(dispatch.actualLdoQty) > Number(dispatch.theoreticalLdoQty) ? "text-red-600 dark:text-red-400" : Number(dispatch.actualLdoQty) < Number(dispatch.theoreticalLdoQty) ? "text-green-600 dark:text-green-400" : "") : ""}`}>
                          {dispatch.actualLdoQty != null ? Number(dispatch.actualLdoQty).toFixed(1) : "-"}
                        </td>
                        <td className="p-2 text-right font-mono text-xs">
                          {actualLpt != null ? (
                            <span>{actualLpt.toFixed(2)}<span className="text-muted-foreground">/{theoreticalLpt?.toFixed(1)}</span></span>
                          ) : "-"}
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(dispatch.ldoVariancePercent)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(ldoDiff)}`}>
                          {formatDiff(ldoDiff, "L")}
                        </td>
                        <td className="p-2 text-xs">
                          {dispatch.adjustedBy ? (
                            <Badge variant="outline" className="text-xs">{dispatch.adjustedBy}</Badge>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {dispatches.length > 1 && (() => {
                    const totLoad = dispatches.reduce((s, d) => s + (d.loadWeight || 0), 0);
                    const totTheoreticalBitKg = dispatches.reduce((s, d) => s + (d.theoreticalBitumenPercent != null && d.loadWeight ? d.loadWeight * Number(d.theoreticalBitumenPercent) / 100 * 1000 : 0), 0);
                    const totActualBitKg = dispatches.reduce((s, d) => s + (d.actualBitumenPercent != null && d.loadWeight ? d.loadWeight * Number(d.actualBitumenPercent) / 100 * 1000 : 0), 0);
                    const avgTemplatePercent = totLoad > 0 ? (totTheoreticalBitKg / (totLoad * 1000)) * 100 : 0;
                    const avgActualPercent = totLoad > 0 ? (totActualBitKg / (totLoad * 1000)) * 100 : 0;
                    const totLdoNorm = dispatches.reduce((s, d) => s + (d.theoreticalLdoQty != null ? Number(d.theoreticalLdoQty) : 0), 0);
                    const totLdoActual = dispatches.reduce((s, d) => s + (d.actualLdoQty != null ? Number(d.actualLdoQty) : 0), 0);
                    const avgLptActual = totLoad > 0 && totLdoActual > 0 ? totLdoActual / totLoad : null;
                    const avgLptNorm = totLoad > 0 && totLdoNorm > 0 ? totLdoNorm / totLoad : null;
                    return (
                      <tr className="border-t-2 font-bold bg-muted/30">
                        <td className="p-2" colSpan={3}>Total / Weighted Avg</td>
                        <td className="p-2 text-right font-mono">{totLoad.toFixed(1)}</td>
                        <td className="p-2 text-right font-mono text-xs">{avgTemplatePercent.toFixed(2)}%</td>
                        <td className={`p-2 text-right font-mono text-xs ${avgActualPercent > avgTemplatePercent ? "text-red-600 dark:text-red-400" : avgActualPercent < avgTemplatePercent ? "text-green-600 dark:text-green-400" : ""}`}>
                          {avgActualPercent.toFixed(2)}%
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(avgTemplatePercent > 0 ? ((avgActualPercent - avgTemplatePercent) / avgTemplatePercent) * 100 : null)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(totalBitumenDiffKg)}`}>
                          {formatDiff(totalBitumenDiffKg, "Kg")}
                        </td>
                        <td className="p-2 text-right font-mono text-xs text-muted-foreground">{totLdoNorm.toFixed(1)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${totLdoActual > totLdoNorm ? "text-red-600 dark:text-red-400" : totLdoActual < totLdoNorm ? "text-green-600 dark:text-green-400" : ""}`}>
                          {totLdoActual.toFixed(1)}
                        </td>
                        <td className="p-2 text-right font-mono text-xs">
                          {avgLptActual != null ? (
                            <span>{avgLptActual.toFixed(2)}<span className="text-muted-foreground">/{avgLptNorm?.toFixed(1)}</span></span>
                          ) : "-"}
                        </td>
                        <td className="p-2 text-right">{getVarianceBadge(totLdoNorm > 0 ? ((totLdoActual - totLdoNorm) / totLdoNorm) * 100 : null)}</td>
                        <td className={`p-2 text-right font-mono text-xs ${getVarianceColor(totalLdoDiffL)}`}>
                          {formatDiff(totalLdoDiffL, "L")}
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
