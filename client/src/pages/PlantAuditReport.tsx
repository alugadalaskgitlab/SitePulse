import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Shield, TrendingUp, TrendingDown, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import type { ConsumptionAuditLog, TruckDispatch } from "@shared/schema";

export default function PlantAuditReport() {
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: auditLog, isLoading } = useQuery<ConsumptionAuditLog[]>({
    queryKey: ["/api/plant-module/consumption-audit-log", filterDateFrom, filterDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/consumption-audit-log?${params}`);
      return res.json();
    },
  });

  const { data: dispatches } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches"],
  });

  const getDispatchInfo = (dispatchId: number) => {
    const dispatch = dispatches?.find(d => d.id === dispatchId);
    return dispatch ? {
      date: dispatch.date,
      truckNumber: dispatch.truckNumber,
      loadWeight: dispatch.loadWeight,
    } : null;
  };

  const formatVariance = (variance: number | null) => {
    if (variance === null || variance === undefined) return null;
    const sign = variance > 0 ? "+" : "";
    return `${sign}${variance.toFixed(1)}%`;
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return "text-red-600 dark:text-red-400";
    if (variance < 0) return "text-green-600 dark:text-green-400";
    return "";
  };

  const summaryStats = auditLog ? {
    totalAdjustments: auditLog.length,
    bitumenAdjustments: auditLog.filter(a => a.adjustmentType === "bitumen").length,
    ldoAdjustments: auditLog.filter(a => a.adjustmentType === "ldo").length,
    byOperator: auditLog.filter(a => a.adjustedBy === "operator").length,
    byManager: auditLog.filter(a => a.adjustedBy === "manager").length,
    byAdmin: auditLog.filter(a => a.adjustedBy === "admin").length,
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Consumption Audit Log
          </h1>
          <p className="text-muted-foreground">Complete history of all consumption adjustments (Admin Only)</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">DATE TO</Label>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summaryStats.totalAdjustments}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">By Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Bitumen:</span>
                  <span className="font-medium">{summaryStats.bitumenAdjustments}</span>
                </div>
                <div className="flex justify-between">
                  <span>LDO:</span>
                  <span className="font-medium">{summaryStats.ldoAdjustments}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">By Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Operator:</span>
                  <span className="ml-2 font-medium">{summaryStats.byOperator}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Manager:</span>
                  <span className="ml-2 font-medium">{summaryStats.byManager}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Admin:</span>
                  <span className="ml-2 font-medium">{summaryStats.byAdmin}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading audit log...</p>
          ) : !auditLog?.length ? (
            <p className="text-center py-8 text-muted-foreground">No consumption adjustments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Timestamp</th>
                    <th className="text-left p-2">Dispatch</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Theoretical</th>
                    <th className="text-right p-2">Previous</th>
                    <th className="text-right p-2">New Value</th>
                    <th className="text-right p-2">Variance</th>
                    <th className="text-left p-2">Adjusted By</th>
                    <th className="text-left p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => {
                    const dispatchInfo = getDispatchInfo(entry.dispatchId);
                    return (
                      <tr key={entry.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 text-sm">
                          {entry.createdAt && format(new Date(entry.createdAt), "dd MMM yyyy HH:mm")}
                        </td>
                        <td className="p-2">
                          {dispatchInfo ? (
                            <div className="text-sm">
                              <div className="font-mono">{dispatchInfo.truckNumber}</div>
                              <div className="text-muted-foreground">{dispatchInfo.date} • {dispatchInfo.loadWeight} MT</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">#{entry.dispatchId}</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge variant={entry.adjustmentType === "bitumen" ? "default" : "secondary"}>
                            {entry.adjustmentType.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono text-muted-foreground">
                          {entry.adjustmentType === "bitumen" 
                            ? `${entry.theoreticalValue.toFixed(3)} MT`
                            : `${entry.theoreticalValue.toFixed(3)} L`
                          }
                        </td>
                        <td className="p-2 text-right font-mono">
                          {entry.previousValue 
                            ? (entry.adjustmentType === "bitumen" 
                                ? `${entry.previousValue.toFixed(3)} MT`
                                : `${entry.previousValue.toFixed(3)} L`)
                            : "-"
                          }
                        </td>
                        <td className="p-2 text-right font-mono font-medium">
                          {entry.adjustmentType === "bitumen" 
                            ? `${entry.newValue.toFixed(3)} MT`
                            : `${entry.newValue.toFixed(3)} L`
                          }
                        </td>
                        <td className={`p-2 text-right font-medium ${getVarianceColor(entry.variancePercent)}`}>
                          <span className="flex items-center justify-end gap-1">
                            {entry.variancePercent > 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {formatVariance(entry.variancePercent)}
                          </span>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline">{entry.adjustedBy}</Badge>
                        </td>
                        <td className="p-2 text-muted-foreground text-sm max-w-[150px] truncate">
                          {entry.reason || "-"}
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
    </div>
  );
}
