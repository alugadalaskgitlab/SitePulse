import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, XCircle } from "lucide-react";
import type { RmcBatchRecordWithDesign, RmcCubeTest } from "@shared/schema";

const today = new Date().toISOString().slice(0, 10);

interface DailyReport {
  totalVolumeM3: number;
  batchRecords: RmcBatchRecordWithDesign[];
  gradeBreakdown: { grade: string; volumeM3: number; batches: number }[];
  rawMaterialsReceived: { materialName: string; category: string; totalQty: number; uom: string }[];
  materialConsumed: { materialName: string; consumedQty: number; uom: string }[];
  cubeTests: RmcCubeTest[];
}

export default function RmcDailyReport() {
  const [date, setDate] = useState(today);

  const { data: report, isLoading } = useQuery<DailyReport>({
    queryKey: ["/api/rmc/daily-report", date],
    queryFn: () => apiRequest("GET", `/api/rmc/daily-report?date=${date}`).then(r => r.json()),
    enabled: !!date,
  });

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/plant">
            <Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">RMC Daily Report</h1>
            <p className="text-sm text-muted-foreground">Day-wise summary of production, materials & QC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" data-testid="input-date" />
          {report && (
            <Button variant="outline" onClick={handlePrint} data-testid="btn-print">
              <Printer className="w-4 h-4 mr-2" />Print
            </Button>
          )}
        </div>
      </div>

      <div className="print:block hidden text-center mb-4">
        <h2 className="text-xl font-bold">RMC Daily Production Report — {date}</h2>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">Loading report…</div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-total-volume">{report.totalVolumeM3.toFixed(2)} m³</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Dispatches</p>
                <p className="text-2xl font-bold">{report.batchRecords.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Cube Tests</p>
                <p className="text-2xl font-bold">{report.cubeTests.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Grades Produced</p>
                <p className="text-2xl font-bold">{report.gradeBreakdown.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Grade Breakdown */}
          {report.gradeBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Grade-wise Production</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2">Grade</th>
                      <th className="text-right pb-2">Batches</th>
                      <th className="text-right pb-2">Volume (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.gradeBreakdown.map((g, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 font-semibold">{g.grade}</td>
                        <td className="py-2 text-right">{g.batches}</td>
                        <td className="py-2 text-right font-semibold text-blue-700 dark:text-blue-300">{g.volumeM3.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-muted/30">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right">{report.batchRecords.reduce((s, r) => s + (r.batchesCount ?? 0), 0)}</td>
                      <td className="py-2 text-right text-blue-700 dark:text-blue-300">{report.totalVolumeM3.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Batch Records */}
          {report.batchRecords.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Batch Dispatches</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2">DC#</th>
                      <th className="text-left pb-2">Grade</th>
                      <th className="text-left pb-2">Customer</th>
                      <th className="text-left pb-2">Site</th>
                      <th className="text-right pb-2">Vol (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.batchRecords.map(b => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-1.5 text-muted-foreground">{b.dcNumber || "—"}</td>
                        <td className="py-1.5 font-medium">{b.grade}</td>
                        <td className="py-1.5">{b.customerName || "—"}</td>
                        <td className="py-1.5">{b.deliverySite || "—"}</td>
                        <td className="py-1.5 text-right font-semibold">{b.totalVolumeM3.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Raw Materials — Consumed vs Received */}
          {(report.rawMaterialsReceived.length > 0 || report.materialConsumed.length > 0) && (() => {
            const allMaterials = Array.from(new Set([
              ...report.rawMaterialsReceived.map(r => r.materialName),
              ...report.materialConsumed.map(c => c.materialName),
            ]));
            const receivedMap = new Map(report.rawMaterialsReceived.map(r => [r.materialName, r]));
            const consumedMap = new Map(report.materialConsumed.map(c => [c.materialName, c.consumedQty]));
            return (
              <Card>
                <CardHeader><CardTitle className="text-base">Raw Materials — Received vs Consumed</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-2">Material</th>
                        <th className="text-right pb-2">Received (kg)</th>
                        <th className="text-right pb-2">Consumed (kg)</th>
                        <th className="text-right pb-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allMaterials.map((mat, i) => {
                        const recv = receivedMap.get(mat);
                        const recvQty = recv ? recv.totalQty : 0;
                        const consQty = consumedMap.get(mat) ?? 0;
                        const balance = recvQty - consQty;
                        return (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1.5 font-medium">{mat}</td>
                            <td className="py-1.5 text-right text-green-700 dark:text-green-400">{recvQty > 0 ? recvQty.toFixed(2) : "—"}</td>
                            <td className="py-1.5 text-right text-orange-600 dark:text-orange-400">{consQty > 0 ? consQty.toFixed(2) : "—"}</td>
                            <td className={`py-1.5 text-right font-semibold ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                              {recvQty > 0 || consQty > 0 ? balance.toFixed(2) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {report.materialConsumed.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-3">Consumption figures are computed from mix design proportions × batch volume. Add component proportions to mix designs to see consumption.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Cube Tests */}
          {report.cubeTests.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Cube Test Results</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2">Sample ID</th>
                      <th className="text-right pb-2">Age</th>
                      <th className="text-right pb-2">Strength (MPa)</th>
                      <th className="text-right pb-2">Target</th>
                      <th className="text-center pb-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cubeTests.map(t => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-1.5 font-medium">{t.sampleId}</td>
                        <td className="py-1.5 text-right">{t.ageDays}d</td>
                        <td className="py-1.5 text-right font-semibold">{t.strengthMpa}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{t.targetStrength ?? "—"}</td>
                        <td className="py-1.5 text-center">
                          {t.passFail === "pass" && <CheckCircle className="w-4 h-4 text-green-600 inline" />}
                          {t.passFail === "fail" && <XCircle className="w-4 h-4 text-red-600 inline" />}
                          {!t.passFail && "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {report.batchRecords.length === 0 && report.rawMaterialsReceived.length === 0 && report.cubeTests.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <FileText className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No data recorded for {date}.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
