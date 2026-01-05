import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Plus, Zap, Loader2, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { GeneratorLog } from "@shared/schema";

export default function PlantGeneratorLogs() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "export-excel" | "export-pdf" | "print" } | null>(null);
  
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generatorName, setGeneratorName] = useState("600 KVA");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hoursRun, setHoursRun] = useState("");
  const [openingDiesel, setOpeningDiesel] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [closingDiesel, setClosingDiesel] = useState("");

  const { data: logs, isLoading } = useQuery<GeneratorLog[]>({
    queryKey: ["/api/plant-module/generator-logs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/generator-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Generator log recorded successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setGeneratorName("600 KVA");
    setStartTime("");
    setEndTime("");
    setHoursRun("");
    setOpeningDiesel("");
    setDieselIssued("");
    setClosingDiesel("");
  };

  const calculateHours = () => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const diffMins = endMins >= startMins ? endMins - startMins : (24 * 60 - startMins) + endMins;
      return (diffMins / 60).toFixed(1);
    }
    return "";
  };

  const handleSubmit = () => {
    if (!generatorName) return;
    const calculatedHours = hoursRun || calculateHours();
    createMutation.mutate({
      date,
      generatorName,
      startTime,
      endTime,
      hoursRun: calculatedHours ? parseFloat(calculatedHours) : null,
      openingDiesel: openingDiesel ? parseFloat(openingDiesel) : null,
      dieselIssued: dieselIssued ? parseFloat(dieselIssued) : null,
      closingDiesel: closingDiesel ? parseFloat(closingDiesel) : null,
    });
  };

  const calculatedHoursDisplay = calculateHours();

  // Per-action PIN authentication handlers
  const requestPinAuth = (action: typeof pendingAction) => {
    setPendingAction(action);
    setPinAuthTarget("admin");
    setShowPinAuth(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (!pendingAction) return;

    switch (pendingAction.type) {
      case "export-excel":
        exportToExcel();
        break;
      case "export-pdf":
        exportToPDF();
        break;
      case "print":
        handlePrint();
        break;
    }
    setPendingAction(null);
  };

  const handleExportExcelClick = () => {
    requestPinAuth({ type: "export-excel" });
  };

  const handleExportPdfClick = () => {
    requestPinAuth({ type: "export-pdf" });
  };

  const handlePrintClick = () => {
    requestPinAuth({ type: "print" });
  };

  const exportToExcel = async () => {
    if (!logs?.length) return;
    const data = logs.map(log => ({
      Date: log.date,
      Generator: log.generatorName,
      "Start Time": log.startTime || "",
      "End Time": log.endTime || "",
      "Hours Run": log.hoursRun?.toFixed(1) || "",
      "Opening Diesel (L)": log.openingDiesel || 0,
      "Diesel Issued (L)": log.dieselIssued || 0,
      "Diesel Consumed (L)": log.dieselConsumed?.toFixed(1) || 0,
      "Closing Diesel (L)": log.closingDiesel || 0,
      "Efficiency (L/hr)": log.efficiency?.toFixed(2) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Generator Logs");
    
    const defaultFilename = `generator_logs_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{
            description: 'Excel Files',
            accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
          }]
        });
        const writable = await handle.createWritable();
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        await writable.write(buffer);
        await writable.close();
        toast({ title: "File saved successfully" });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    
    XLSX.writeFile(wb, defaultFilename);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = async () => {
    if (!logs?.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Generator Diesel Tracking Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
    
    const tableData = logs.map(log => [
      log.date,
      log.generatorName,
      log.startTime || "-",
      log.endTime || "-",
      log.hoursRun?.toFixed(1) || "-",
      log.openingDiesel || 0,
      log.dieselIssued || 0,
      log.dieselConsumed?.toFixed(1) || 0,
      log.closingDiesel || 0,
      log.efficiency?.toFixed(2) || "-",
    ]);
    
    (doc as any).autoTable({
      startY: 28,
      head: [["Date", "Generator", "Start", "End", "Hours", "Opening (L)", "Issued (L)", "Consumed (L)", "Closing (L)", "L/hr"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
    });
    
    const defaultFilename = `generator_logs_${format(new Date(), "yyyy-MM-dd")}.pdf`;
    
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{
            description: 'PDF Files',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
        const writable = await handle.createWritable();
        const pdfBlob = doc.output('blob');
        await writable.write(pdfBlob);
        await writable.close();
        toast({ title: "File saved successfully" });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    
    doc.save(defaultFilename);
    toast({ title: "Exported to PDF" });
  };

  const handlePrint = () => {
    if (!logs?.length) return;
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Generator Diesel Tracking Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; margin-bottom: 5px; }
            .date { color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Generator Diesel Tracking Report</h1>
          <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Generator</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Opening (L)</th>
                <th>Issued (L)</th>
                <th>Consumed (L)</th>
                <th>Closing (L)</th>
                <th>Efficiency (L/hr)</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td>${log.date}</td>
                  <td>${log.generatorName}</td>
                  <td>${log.startTime || '-'}</td>
                  <td>${log.endTime || '-'}</td>
                  <td>${log.hoursRun?.toFixed(1) || '-'}</td>
                  <td>${log.openingDiesel || 0}</td>
                  <td>${log.dieselIssued || 0}</td>
                  <td>${log.dieselConsumed?.toFixed(1) || 0}</td>
                  <td>${log.closingDiesel || 0}</td>
                  <td>${log.efficiency?.toFixed(2) || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      toast({ title: "Please allow popups to print", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/plant">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Generator Diesel Tracking</h1>
            <p className="text-muted-foreground">Track generator diesel consumption (L/hr)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-generator-log">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Generator Log</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-gen-date" />
              </div>

              <div>
                <Label>Generator</Label>
                <Select value={generatorName} onValueChange={setGeneratorName}>
                  <SelectTrigger data-testid="select-generator">
                    <SelectValue placeholder="Select generator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="600 KVA">600 KVA Generator</SelectItem>
                    <SelectItem value="40-30 KVA">40-30 KVA Generator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-start-time" />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-end-time" />
                </div>
              </div>

              {calculatedHoursDisplay && (
                <p className="text-sm text-muted-foreground">Calculated Hours: <strong>{calculatedHoursDisplay} hrs</strong></p>
              )}

              <div>
                <Label>Hours Run (override)</Label>
                <Input type="number" step="0.1" value={hoursRun} onChange={(e) => setHoursRun(e.target.value)} placeholder="Leave blank to auto-calculate" data-testid="input-hours-run" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Opening (L)</Label>
                  <Input type="number" step="0.1" value={openingDiesel} onChange={(e) => setOpeningDiesel(e.target.value)} placeholder="0" data-testid="input-opening-diesel" />
                </div>
                <div>
                  <Label>Issued (L)</Label>
                  <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="0" data-testid="input-diesel-issued-gen" />
                </div>
                <div>
                  <Label>Closing (L)</Label>
                  <Input type="number" step="0.1" value={closingDiesel} onChange={(e) => setClosingDiesel(e.target.value)} placeholder="0" data-testid="input-closing-diesel" />
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || !generatorName} data-testid="button-save-gen-log">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* PinAuth Modal */}
      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPendingAction(null); }}
        />
      )}

      {/* Export/Print Actions */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!logs?.length} data-testid="button-export-excel">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!logs?.length} data-testid="button-export-pdf">
            <Download className="w-4 h-4" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Generator Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !logs?.length ? (
            <p className="text-muted-foreground text-center py-8">No generator logs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{log.generatorName}</p>
                    <p className="text-sm text-muted-foreground">
                      {log.startTime} - {log.endTime} ({log.hoursRun?.toFixed(1)} hrs)
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs mt-1">
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        Opening: {log.openingDiesel || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                        Issued: {log.dieselIssued || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                        Consumed: {log.dieselConsumed?.toFixed(1) || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        Closing: {log.closingDiesel || ((log.openingDiesel || 0) + (log.dieselIssued || 0) - (log.dieselConsumed || 0)).toFixed(1)} L
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{log.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{log.efficiency?.toFixed(2)} L/hr</p>
                    <p className="text-xs text-muted-foreground">Efficiency</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
