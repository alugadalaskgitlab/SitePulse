import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, Download, Printer, Gauge } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { LdoFlowReading } from "@shared/schema";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

export default function PlantLdoFlowMeter() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "delete" | "export-excel" | "export-pdf" | "print"; readingId?: number } | null>(null);

  const [meterReading, setMeterReading] = useState("");
  const [readingType, setReadingType] = useState("opening");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [quantityLiters, setQuantityLiters] = useState("");
  const [notes, setNotes] = useState("");

  const { data: readings, isLoading } = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings"],
  });

  const filteredReadings = useMemo(() => {
    if (!readings) return [];
    return readings.filter(r => {
      if (filterDateFrom && r.date < filterDateFrom) return false;
      if (filterDateTo && r.date > filterDateTo) return false;
      return true;
    });
  }, [readings, filterDateFrom, filterDateTo]);

  const dailySummary = useMemo(() => {
    if (!readings) return [];
    const grouped: Record<string, { date: string; entries: LdoFlowReading[] }> = {};
    for (const r of readings) {
      if (!grouped[r.date]) grouped[r.date] = { date: r.date, entries: [] };
      grouped[r.date].entries.push(r);
    }
    return Object.values(grouped)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 15)
      .map(day => {
        const openings = day.entries.filter(e => e.readingType === "opening").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const closings = day.entries.filter(e => e.readingType === "closing").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const receipts = day.entries.filter(e => e.readingType === "receipt");

        const opening = openings[0] || null;
        const closing = closings[closings.length - 1] || null;
        const totalReceipts = receipts.reduce((s, r) => s + (r.quantityLiters || 0), 0);

        let consumption = null as number | null;
        if (opening && closing) {
          consumption = closing.meterReading - opening.meterReading;
        }

        return {
          date: day.date,
          opening,
          closing,
          totalReceipts,
          consumption,
          consumptionKg: consumption !== null ? Math.round(consumption * LDO_DENSITY_KG_PER_LITER) : null,
        };
      });
  }, [readings]);

  const latestReading = readings && readings.length > 0 ? readings[0] : null;
  const totalConsumptionLast30 = dailySummary.reduce((s, d) => s + (d.consumption || 0), 0);
  const totalReceiptsLast30 = dailySummary.reduce((s, d) => s + d.totalReceipts, 0);
  const avgDailyConsumption = dailySummary.filter(d => d.consumption !== null).length > 0
    ? totalConsumptionLast30 / dailySummary.filter(d => d.consumption !== null).length : 0;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/plant-module/ldo-flow-readings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      toast({ title: "LDO flow reading recorded" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/plant-module/ldo-flow-readings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      toast({ title: "Reading deleted" });
      setDeleteConfirmId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setMeterReading("");
    setReadingType("opening");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setQuantityLiters("");
    setNotes("");
  }

  function handleSubmit() {
    const meter = parseFloat(meterReading);
    if (isNaN(meter) || meter < 0) {
      toast({ title: "Invalid meter reading", description: "Enter a valid meter reading in liters", variant: "destructive" });
      return;
    }
    if ((readingType === "opening" || readingType === "closing") && !readingTime) {
      toast({ title: "Time required", description: "Please enter time for opening/closing readings", variant: "destructive" });
      return;
    }
    if (readingType === "receipt" && (!quantityLiters || parseFloat(quantityLiters) <= 0)) {
      toast({ title: "Invalid quantity", description: "Enter receipt quantity in liters", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      date: readingDate,
      time: readingTime,
      meterReading: meter,
      readingType,
      quantityLiters: readingType === "receipt" ? parseFloat(quantityLiters) : null,
      notes: notes || null,
    });
  }

  function handlePinAction(type: string, readingId?: number) {
    setPendingAction({ type: type as any, readingId });
    setPinAuthTarget("admin");
    setShowPinAuth(true);
  }

  function handlePinSuccess(_role: string, _pin: string) {
    setShowPinAuth(false);
    if (!pendingAction) return;
    if (pendingAction.type === "delete" && pendingAction.readingId) {
      deleteMutation.mutate(pendingAction.readingId);
    } else if (pendingAction.type === "export-excel") {
      exportExcel();
    } else if (pendingAction.type === "export-pdf") {
      exportPdf();
    } else if (pendingAction.type === "print") {
      printData();
    }
    setPendingAction(null);
  }

  function exportExcel() {
    const data = filteredReadings.map(r => ({
      Date: r.date,
      Time: r.time || "",
      "Meter Reading (L)": r.meterReading,
      Type: r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      "Receipt Qty (L)": r.quantityLiters || "",
      Notes: r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LDO Flow Readings");

    const summaryData = dailySummary.map(d => ({
      Date: d.date,
      "Opening (L)": d.opening?.meterReading ?? "",
      "Closing (L)": d.closing?.meterReading ?? "",
      "Receipts (L)": d.totalReceipts || "",
      "Consumption (L)": d.consumption ?? "",
      "Consumption (kg)": d.consumptionKg ?? "",
    }));
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Daily Summary");

    XLSX.writeFile(wb, `ldo_flow_readings_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("LDO Flow Meter Readings - HLC Plant", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")} | LDO: ${LDO_DENSITY_KG_PER_LITER} kg/L`, 14, 22);

    const tableData = filteredReadings.map(r => [
      r.date, r.time || "", r.meterReading.toLocaleString(),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      r.quantityLiters ? r.quantityLiters.toLocaleString() : "",
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Meter (L)", "Type", "Receipt Qty (L)", "Notes"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 9 },
    });
    doc.save(`ldo_flow_readings_${format(new Date(), "yyyyMMdd")}.pdf`);
  }

  function printData() {
    const printContent = `
      <html><head><title>LDO Flow Meter Readings</title>
      <style>body{font-family:Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px 8px;text-align:left;font-size:12px}th{background:#f0f0f0}.header{margin-bottom:15px}</style></head>
      <body><div class="header"><h2>LDO Flow Meter Readings - HLC Plant</h2><p>Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")} | LDO: ${LDO_DENSITY_KG_PER_LITER} kg/L</p></div>
      <table><tr><th>Date</th><th>Time</th><th>Meter (L)</th><th>Type</th><th>Receipt Qty (L)</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>${r.meterReading.toLocaleString()}</td><td>${r.readingType}</td><td>${r.quantityLiters ? r.quantityLiters.toLocaleString() : ""}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  }

  if (showPinAuth) {
    return (
      <PinAuth
        targetRole={pinAuthTarget}
        onSuccess={handlePinSuccess}
        onClose={() => { setShowPinAuth(false); setPendingAction(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Gauge className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold flex-1">LDO Flow Meter Tracker</h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-new-reading">
          <Plus className="w-4 h-4 mr-2" /> New Reading
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        LDO density: {LDO_DENSITY_KG_PER_LITER} kg/L | Record flow meter readings to track LDO consumption
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latest Meter Reading</CardTitle>
          </CardHeader>
          <CardContent>
            {latestReading ? (
              <div className="space-y-1 text-sm">
                <div className="text-2xl font-bold" data-testid="text-latest-meter">{latestReading.meterReading.toLocaleString()} L</div>
                <div className="text-muted-foreground">
                  {latestReading.date} {latestReading.time || ""} ({latestReading.readingType})
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No readings yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Daily Consumption</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-consumption">
              {avgDailyConsumption > 0 ? `${Math.round(avgDailyConsumption).toLocaleString()} L` : "-"}
            </div>
            <div className="text-sm text-muted-foreground">
              {avgDailyConsumption > 0 ? `${Math.round(avgDailyConsumption * LDO_DENSITY_KG_PER_LITER).toLocaleString()} kg/day` : "Record opening & closing to track"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Receipts (Recent)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-receipts">
              {totalReceiptsLast30 > 0 ? `${totalReceiptsLast30.toLocaleString()} L` : "-"}
            </div>
            <div className="text-sm text-muted-foreground">
              {totalReceiptsLast30 > 0 ? `${Math.round(totalReceiptsLast30 * LDO_DENSITY_KG_PER_LITER).toLocaleString()} kg` : "No receipts recorded"}
            </div>
          </CardContent>
        </Card>
      </div>

      {dailySummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Consumption Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Opening (L)</th>
                    <th className="text-right p-2">Closing (L)</th>
                    <th className="text-right p-2">Receipts (L)</th>
                    <th className="text-right p-2 font-bold">Consumption (L)</th>
                    <th className="text-right p-2 font-bold">Consumption (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.map(day => (
                    <tr key={day.date} className="border-b" data-testid={`row-daily-${day.date}`}>
                      <td className="p-2">{day.date}</td>
                      <td className="p-2 text-right">{day.opening?.meterReading?.toLocaleString() ?? "-"}</td>
                      <td className="p-2 text-right">{day.closing?.meterReading?.toLocaleString() ?? "-"}</td>
                      <td className="p-2 text-right">{day.totalReceipts ? day.totalReceipts.toLocaleString() : "-"}</td>
                      <td className="p-2 text-right font-bold">{day.consumption !== null ? day.consumption.toLocaleString() : "-"}</td>
                      <td className="p-2 text-right font-bold">{day.consumptionKg !== null ? day.consumptionKg.toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">All Flow Readings</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => handlePinAction("export-excel")} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePinAction("export-pdf")} data-testid="button-export-pdf">
                <Download className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePinAction("print")} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filteredReadings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No LDO flow readings recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-right p-2">Meter Reading (L)</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Receipt Qty (L)</th>
                    <th className="text-left p-2">Notes</th>
                    <th className="text-center p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.map(r => (
                    <tr key={r.id} className="border-b" data-testid={`row-reading-${r.id}`}>
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.time || "-"}</td>
                      <td className="p-2 text-right font-medium">{r.meterReading.toLocaleString()}</td>
                      <td className="p-2">
                        <Badge variant={r.readingType === "opening" ? "default" : r.readingType === "closing" ? "secondary" : "outline"}>
                          {r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{r.quantityLiters ? r.quantityLiters.toLocaleString() : "-"}</td>
                      <td className="p-2 text-muted-foreground text-xs">{r.notes || "-"}</td>
                      <td className="p-2 text-center">
                        {deleteConfirmId === r.id ? (
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="destructive" onClick={() => handlePinAction("delete", r.id)} data-testid={`button-confirm-delete-${r.id}`}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(r.id)} data-testid={`button-delete-${r.id}`}>
                            <Trash2 className="w-4 h-4" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record LDO Flow Meter Reading</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={readingDate} onChange={e => setReadingDate(e.target.value)} data-testid="input-reading-date" />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={readingTime} onChange={e => setReadingTime(e.target.value)} data-testid="input-reading-time" />
              </div>
            </div>

            <div>
              <Label>Reading Type</Label>
              <Select value={readingType} onValueChange={setReadingType}>
                <SelectTrigger data-testid="select-reading-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                  <SelectItem value="receipt">Receipt (New LDO delivery)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Flow Meter Reading (Liters)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={meterReading}
                onChange={e => setMeterReading(e.target.value)}
                placeholder="e.g. 15000"
                data-testid="input-meter-reading"
              />
              {meterReading && (
                <p className="text-xs text-muted-foreground mt-1">
                  = {Math.round(parseFloat(meterReading) * LDO_DENSITY_KG_PER_LITER).toLocaleString()} kg
                </p>
              )}
            </div>

            {readingType === "receipt" && (
              <div>
                <Label>Receipt Quantity (Liters) <span className="text-xs text-muted-foreground">- How much LDO was received</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantityLiters}
                  onChange={e => setQuantityLiters(e.target.value)}
                  placeholder="e.g. 5000"
                  data-testid="input-receipt-quantity"
                />
                {quantityLiters && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = {Math.round(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER).toLocaleString()} kg
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any observations" data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !meterReading} data-testid="button-submit-reading">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Record Reading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
