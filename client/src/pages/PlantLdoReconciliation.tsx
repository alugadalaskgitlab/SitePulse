import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Loader2, Download, AlertTriangle, TrendingDown, TrendingUp, Minus, Info } from "lucide-react";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import * as XLSX from "xlsx";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

type ReconRow = {
  date: string;
  openingDipL: number | null;
  openingDipMT: number | null;
  meterConsumptionL: number;
  receiptsL: number;
  expectedClosingL: number | null;
  expectedClosingMT: number | null;
  actualClosingDipL: number | null;
  actualClosingDipMT: number | null;
  varianceL: number | null;
  varianceMT: number | null;
  variancePct: number | null;
  hasOpeningDip: boolean;
  hasClosingDip: boolean;
  hasMeterData: boolean;
  missingOpeningTanks: number[];
  missingClosingTanks: number[];
};

function fmt(n: number | null, decimals = 0): string {
  if (n == null) return "–";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMT(n: number | null): string {
  if (n == null) return "–";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function VarianceBadge({ pct, l }: { pct: number | null; l: number | null }) {
  if (pct == null || l == null) return <span className="text-muted-foreground text-xs">N/A</span>;
  const abs = Math.abs(pct);
  if (abs < 0.1) return (
    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 dark:bg-green-950 dark:text-green-300 gap-1">
      <Minus className="h-3 w-3" /> {fmt(l)} L ({pct > 0 ? "+" : ""}{pct}%)
    </Badge>
  );
  if (l > 0) return (
    <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 gap-1">
      <TrendingUp className="h-3 w-3" /> +{fmt(l)} L (+{pct}%)
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 dark:bg-red-950 dark:text-red-300 gap-1">
      <TrendingDown className="h-3 w-3" /> {fmt(l)} L ({pct}%)
    </Badge>
  );
}

export default function PlantLdoReconciliation() {
  const { getPlantBackLink } = useOrigin();
  const { sectionCan } = useAuth();
  const canExport = sectionCan("plant_stock", "view_reports");
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const sp = new URLSearchParams(searchString || window.location.search);
  const urlRole = sp.get("role");
  const pageRole: "manager" | "admin" | null = (urlRole === "manager" || urlRole === "admin") ? urlRole : null;
  const backLink = getPlantBackLink({ defaultTab: "stock", role: pageRole });

  const urlPlant = sp.get("plant") || "Main Plant";

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 13), "yyyy-MM-dd");

  const [plant, setPlant] = useState(urlPlant);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [threshold, setThreshold] = useState("2");
  const [submitted, setSubmitted] = useState(false);
  const [queryParams, setQueryParams] = useState<{ dateFrom: string; dateTo: string; plant: string } | null>(null);

  const { data: plantsList } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      if (!res.ok) return ["Main Plant"];
      return res.json();
    },
  });

  const plantOptions = useMemo(() => {
    const list = plantsList && plantsList.length ? plantsList : ["Main Plant"];
    return list.includes(plant) ? list : [...list, plant];
  }, [plantsList, plant]);

  const { data: rows, isLoading, error } = useQuery<ReconRow[]>({
    queryKey: ["/api/plant-module/ldo-reconciliation", queryParams],
    queryFn: async () => {
      if (!queryParams) return [];
      const qs = new URLSearchParams({
        dateFrom: queryParams.dateFrom,
        dateTo: queryParams.dateTo,
        plant: queryParams.plant,
      });
      const res = await fetch(`/api/plant-module/ldo-reconciliation?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!queryParams,
  });

  const thresholdNum = Math.abs(parseFloat(threshold) || 2);

  const handleRun = () => {
    if (!dateFrom || !dateTo) return;
    setQueryParams({ dateFrom, dateTo, plant });
    setSubmitted(true);
  };

  const handlePlantChange = (newPlant: string) => {
    setPlant(newPlant);
    const next = new URLSearchParams(searchString || window.location.search);
    next.set("plant", newPlant);
    setLocation(`/plant/ldo-reconciliation?${next.toString()}`);
  };

  const summaryStats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const withVariance = rows.filter(r => r.varianceL != null);
    const totalConsumption = rows.reduce((s, r) => s + r.meterConsumptionL, 0);
    const totalReceipts = rows.reduce((s, r) => s + r.receiptsL, 0);
    const netVariance = withVariance.reduce((s, r) => s + (r.varianceL || 0), 0);
    const flaggedCount = withVariance.filter(r => r.variancePct != null && Math.abs(r.variancePct) > thresholdNum).length;
    return { totalConsumption, totalReceipts, netVariance, flaggedCount, withVarianceCount: withVariance.length };
  }, [rows, thresholdNum]);

  const handleExport = () => {
    if (!rows) return;
    const data = rows.map(r => ({
      "Date": r.date,
      "Opening Dip (L)": r.openingDipL ?? "",
      "Opening Dip (MT)": r.openingDipMT ?? "",
      "Meter Consumption (L)": r.meterConsumptionL,
      "Receipts (L)": r.receiptsL,
      "Expected Closing (L)": r.expectedClosingL ?? "",
      "Expected Closing (MT)": r.expectedClosingMT ?? "",
      "Actual Closing Dip (L)": r.actualClosingDipL ?? "",
      "Actual Closing Dip (MT)": r.actualClosingDipMT ?? "",
      "Variance (L)": r.varianceL ?? "",
      "Variance (MT)": r.varianceMT ?? "",
      "Variance (%)": r.variancePct ?? "",
      "Has Opening Dip": r.hasOpeningDip ? "Yes" : "No",
      "Has Closing Dip": r.hasClosingDip ? "Yes" : "No",
      "Has Meter Data": r.hasMeterData ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LDO Reconciliation");
    XLSX.writeFile(wb, `LDO-Reconciliation-${queryParams?.dateFrom}-to-${queryParams?.dateTo}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <a href={backLink} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-xl font-semibold">LDO Reconciliation Report</h1>
            <p className="text-sm text-muted-foreground">Book stock (meter-based) vs Physical stock (dip-stick)</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="recon-plant" className="text-xs">Plant</Label>
                <Select value={plant} onValueChange={handlePlantChange}>
                  <SelectTrigger id="recon-plant" data-testid="select-plant" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plantOptions.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="recon-from" className="text-xs">From</Label>
                <Input
                  id="recon-from"
                  data-testid="input-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="recon-to" className="text-xs">To</Label>
                <Input
                  id="recon-to"
                  data-testid="input-date-to"
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="recon-threshold" className="text-xs">Highlight Threshold (%)</Label>
                <Input
                  id="recon-threshold"
                  data-testid="input-threshold"
                  type="number"
                  min="0"
                  step="0.5"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  className="h-9"
                  placeholder="2"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  data-testid="button-run-report"
                  onClick={handleRun}
                  disabled={!dateFrom || !dateTo || isLoading}
                  className="flex-1 h-9"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run"}
                </Button>
                {canExport && rows && rows.length > 0 && (
                  <Button
                    variant="outline"
                    data-testid="button-export"
                    onClick={handleExport}
                    className="h-9 px-2"
                    title="Export to Excel"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary strip */}
        {summaryStats && rows && rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Total Consumption</p>
                <p className="text-lg font-semibold" data-testid="stat-total-consumption">{fmt(summaryStats.totalConsumption)} L</p>
                <p className="text-xs text-muted-foreground">{fmtMT(summaryStats.totalConsumption * LDO_DENSITY_KG_PER_LITER / 1000)} MT</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Total Receipts</p>
                <p className="text-lg font-semibold" data-testid="stat-total-receipts">{fmt(summaryStats.totalReceipts)} L</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Net Variance</p>
                <p className={`text-lg font-semibold ${summaryStats.netVariance < 0 ? "text-red-600 dark:text-red-400" : summaryStats.netVariance > 0 ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"}`} data-testid="stat-net-variance">
                  {summaryStats.netVariance >= 0 ? "+" : ""}{fmt(summaryStats.netVariance)} L
                </p>
                <p className="text-xs text-muted-foreground">across {summaryStats.withVarianceCount} days with full data</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Days Flagged ({'>'}±{thresholdNum}%)</p>
                <p className={`text-lg font-semibold ${summaryStats.flaggedCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`} data-testid="stat-flagged-days">
                  {summaryStats.flaggedCount}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Legend */}
        {submitted && rows && rows.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700 inline-block" /> Variance &gt; ±{thresholdNum}%</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Missing dip reading</span>
            <span className="flex items-center gap-1"><Info className="h-3 w-3 text-blue-400" /> No meter data (rest day / holiday)</span>
          </div>
        )}

        {/* Table */}
        {submitted && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Daily Reconciliation
                {queryParams && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {queryParams.plant} — {queryParams.dateFrom} to {queryParams.dateTo}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !rows || rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No data for the selected range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Date</th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Opening Dip<br /><span className="text-xs font-normal text-muted-foreground">L / MT</span></th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Meter Use<br /><span className="text-xs font-normal text-muted-foreground">L</span></th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Receipts<br /><span className="text-xs font-normal text-muted-foreground">L</span></th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Exp. Closing<br /><span className="text-xs font-normal text-muted-foreground">L / MT</span></th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Act. Closing Dip<br /><span className="text-xs font-normal text-muted-foreground">L / MT</span></th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Variance</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => {
                        const isFlagged = row.variancePct != null && Math.abs(row.variancePct) > thresholdNum;
                        const isLoss = (row.varianceL ?? 0) < 0;
                        const isGain = (row.varianceL ?? 0) > 0;
                        return (
                          <tr
                            key={row.date}
                            data-testid={`row-recon-${row.date}`}
                            className={[
                              idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                              isFlagged ? "bg-red-50 dark:bg-red-950/30" : "",
                            ].join(" ")}
                          >
                            <td className="px-4 py-2 font-medium whitespace-nowrap">{row.date}</td>

                            {/* Opening Dip */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.hasOpeningDip ? (
                                <>
                                  <span data-testid={`opening-l-${row.date}`}>{fmt(row.openingDipL)}</span>
                                  <br />
                                  <span className="text-xs text-muted-foreground">{fmtMT(row.openingDipMT)}</span>
                                </>
                              ) : (
                                <span className="text-amber-500 flex items-center justify-end gap-1">
                                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                  <span className="text-xs">No dip</span>
                                </span>
                              )}
                              {row.missingOpeningTanks.length > 0 && row.hasOpeningDip && (
                                <span className="text-xs text-amber-500 block">T{row.missingOpeningTanks.join(",")} missing</span>
                              )}
                            </td>

                            {/* Meter Consumption */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.hasMeterData ? (
                                <span data-testid={`consumption-${row.date}`}>{fmt(row.meterConsumptionL)}</span>
                              ) : (
                                <span className="text-muted-foreground/60 flex items-center justify-end gap-1">
                                  <Info className="h-3 w-3" />
                                  <span className="text-xs">0</span>
                                </span>
                              )}
                            </td>

                            {/* Receipts */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.receiptsL > 0 ? (
                                <span className="text-blue-700 dark:text-blue-400 font-medium" data-testid={`receipts-${row.date}`}>+{fmt(row.receiptsL)}</span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </td>

                            {/* Expected Closing */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.expectedClosingL != null ? (
                                <>
                                  <span data-testid={`expected-${row.date}`}>{fmt(row.expectedClosingL)}</span>
                                  <br />
                                  <span className="text-xs text-muted-foreground">{fmtMT(row.expectedClosingMT)}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground text-xs">No opening dip</span>
                              )}
                            </td>

                            {/* Actual Closing Dip */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.hasClosingDip ? (
                                <>
                                  <span data-testid={`actual-${row.date}`}>{fmt(row.actualClosingDipL)}</span>
                                  <br />
                                  <span className="text-xs text-muted-foreground">{fmtMT(row.actualClosingDipMT)}</span>
                                </>
                              ) : (
                                <span className="text-amber-500 flex items-center justify-end gap-1">
                                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                  <span className="text-xs">No closing dip</span>
                                </span>
                              )}
                              {row.missingClosingTanks.length > 0 && row.hasClosingDip && (
                                <span className="text-xs text-amber-500 block">T{row.missingClosingTanks.join(",")} missing</span>
                              )}
                            </td>

                            {/* Variance */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <VarianceBadge pct={row.variancePct} l={row.varianceL} />
                              {row.varianceMT != null && (
                                <p className="text-xs text-muted-foreground mt-0.5">{fmtMT(row.varianceMT)} MT</p>
                              )}
                            </td>

                            {/* Status pill */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {!row.hasOpeningDip && !row.hasClosingDip ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">No Dip Data</Badge>
                              ) : !row.hasClosingDip ? (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Missing Closing</Badge>
                              ) : !row.hasOpeningDip ? (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Missing Opening</Badge>
                              ) : isFlagged && isLoss ? (
                                <Badge variant="outline" data-testid={`status-${row.date}`} className="text-xs text-red-700 border-red-300 bg-red-50 dark:bg-red-950">Loss</Badge>
                              ) : isFlagged && isGain ? (
                                <Badge variant="outline" data-testid={`status-${row.date}`} className="text-xs text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-950">Gain</Badge>
                              ) : (
                                <Badge variant="outline" data-testid={`status-${row.date}`} className="text-xs text-green-700 border-green-300 bg-green-50 dark:bg-green-950">OK</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!submitted && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Select a plant and date range, then click <strong>Run</strong> to generate the report.</p>
          </div>
        )}
      </div>
    </div>
  );
}
