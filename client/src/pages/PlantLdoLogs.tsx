import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Droplets, Loader2, TrendingUp, TrendingDown, Download, Printer } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LdoLog } from "@shared/schema";
import { DEFAULT_LDO_NORM } from "@shared/schema";

export default function PlantLdoLogs() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "export-excel" | "export-pdf" | "print" } | null>(null);
  const [openingStock, setOpeningStock] = useState("");
  const [ldoReceived, setLdoReceived] = useState("");
  const [ldoConsumed, setLdoConsumed] = useState("");
  const [closingStock, setClosingStock] = useState("");
  const [tonsProduced, setTonsProduced] = useState("");

  const { data: logs, isLoading } = useQuery<LdoLog[]>({
    queryKey: ["/api/plant-module/ldo-logs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/ldo-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "LDO log recorded successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setOpeningStock("");
    setLdoReceived("");
    setLdoConsumed("");
    setClosingStock("");
    setTonsProduced("");
  };

  const handleSubmit = () => {
    createMutation.mutate({
      date,
      openingStock: openingStock ? parseFloat(openingStock) : null,
      ldoReceived: ldoReceived ? parseFloat(ldoReceived) : null,
      ldoConsumed: ldoConsumed ? parseFloat(ldoConsumed) : null,
      closingStock: closingStock ? parseFloat(closingStock) : null,
      tonsProduced: tonsProduced ? parseFloat(tonsProduced) : null,
    });
  };

  const expectedLdo = tonsProduced ? parseFloat(tonsProduced) * DEFAULT_LDO_NORM : 0;

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

  // Build filename with timestamp
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    return `SiteLog_Plant_LdoLogs_${timestamp}.${extension}`;
  };

  // Universal download function that works on all devices including iPad
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const exportToExcel = async () => {
    if (!logs?.length) return;
    try {
      const data = logs.map(log => ({
        Date: log.date,
        "Opening Stock (L)": log.openingStock || 0,
        "LDO Received (L)": log.ldoReceived || 0,
        "LDO Consumed (L)": log.ldoConsumed || 0,
        "Closing Stock (L)": log.closingStock || 0,
        "Tons Produced (MT)": log.tonsProduced || 0,
        "Expected LDO (L)": log.expectedLdo?.toFixed(3) || 0,
        "Efficiency (L/ton)": log.efficiency?.toFixed(3) || 0,
        "Variance (L)": log.variance?.toFixed(3) || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "LDO Logs");
      
      const filename = buildFilename("xlsx");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
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
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerDownload(blob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const exportToPDF = async () => {
    if (!logs?.length) return;
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("LDO Consumption Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      
      const tableData = logs.map(log => [
        log.date,
        log.openingStock?.toString() || "-",
        log.ldoReceived?.toString() || "-",
        log.ldoConsumed?.toString() || "-",
        log.closingStock?.toString() || "-",
        log.tonsProduced?.toFixed(3) || "-",
        log.expectedLdo?.toFixed(3) || "-",
        log.efficiency?.toFixed(3) || "-",
        log.variance?.toFixed(3) || "-",
      ]);
      
      autoTable(doc, {
        startY: 28,
        head: [["Date", "Open(L)", "Recv(L)", "Cons(L)", "Close(L)", "Prod(MT)", "Expect(L)", "Eff(L/ton)", "Var(L)"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      
      const filename = buildFilename("pdf");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
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
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!logs?.length) return;
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>LDO Consumption Report</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 11px; }
            .header { margin-bottom: 15px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 18px; }
            .date { color: #666; margin: 0; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 6px 4px; text-align: left; font-size: 9px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px;">
            <img src="${window.location.origin}/hlc-logo.jpg" style="height: 50px; margin-bottom: 5px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">High Lane Constructions Pvt Ltd</h2>
          </div>
          <div class="header">
            <h1>LDO Consumption Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Open (L)</th>
                <th>Recv (L)</th>
                <th>Cons (L)</th>
                <th>Close (L)</th>
                <th>Prod (MT)</th>
                <th>Expect (L)</th>
                <th>Eff (L/ton)</th>
                <th>Var (L)</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td>${log.date}</td>
                  <td>${log.openingStock || '-'}</td>
                  <td>${log.ldoReceived || '-'}</td>
                  <td>${log.ldoConsumed || '-'}</td>
                  <td>${log.closingStock || '-'}</td>
                  <td>${log.tonsProduced?.toFixed(3) || '-'}</td>
                  <td>${log.expectedLdo?.toFixed(3) || '-'}</td>
                  <td>${log.efficiency?.toFixed(3) || '-'}</td>
                  <td>${log.variance?.toFixed(3) || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
        </body>
      </html>
    `;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">LDO Consumption Tracking</h1>
            <p className="text-muted-foreground">Track LDO usage vs production (L/ton)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-ldo-log">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record LDO Consumption</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-ldo-date" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Stock (L)</Label>
                  <Input type="number" step="0.1" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" data-testid="input-ldo-opening" />
                </div>
                <div>
                  <Label>LDO Received (L)</Label>
                  <Input type="number" step="0.1" value={ldoReceived} onChange={(e) => setLdoReceived(e.target.value)} placeholder="0" data-testid="input-ldo-received" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>LDO Consumed (L)</Label>
                  <Input type="number" step="0.1" value={ldoConsumed} onChange={(e) => setLdoConsumed(e.target.value)} placeholder="0" data-testid="input-ldo-consumed" />
                </div>
                <div>
                  <Label>Closing Stock (L)</Label>
                  <Input type="number" step="0.1" value={closingStock} onChange={(e) => setClosingStock(e.target.value)} placeholder="0" data-testid="input-ldo-closing" />
                </div>
              </div>

              <div>
                <Label>Tons Produced (MT)</Label>
                <Input type="number" step="0.1" value={tonsProduced} onChange={(e) => setTonsProduced(e.target.value)} placeholder="Total production for the day" data-testid="input-tons-produced" />
              </div>

              {tonsProduced && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  <p>Expected LDO (@ {DEFAULT_LDO_NORM} L/ton): <strong>{expectedLdo.toFixed(3)} L</strong></p>
                  {ldoConsumed && (
                    <p>Variance: <strong className={parseFloat(ldoConsumed) > expectedLdo ? "text-destructive" : "text-green-600"}>
                      {(expectedLdo - parseFloat(ldoConsumed)).toFixed(3)} L
                    </strong></p>
                  )}
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending} data-testid="button-save-ldo-log">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* PIN Auth Modal */}
      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPendingAction(null); }}
        />
      )}

      {/* Export/Print Actions - Always visible, PIN required on click */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
        <span className="text-sm text-muted-foreground">Admin PIN required for Export and Print</span>
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
            <Droplets className="w-5 h-5" />
            LDO Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !logs?.length ? (
            <p className="text-muted-foreground text-center py-8">No LDO logs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const variance = log.variance || 0;
                const isExcess = variance < 0;
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{log.date}</p>
                      <p className="text-sm text-muted-foreground">
                        Production: {log.tonsProduced?.toFixed(3)} MT | Consumed: {log.ldoConsumed?.toFixed(3)} L
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Opening: {log.openingStock} L + Received: {log.ldoReceived} L | Closing: {log.closingStock} L
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expected: {log.expectedLdo?.toFixed(3)} L (@ {DEFAULT_LDO_NORM} L/ton)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">{log.efficiency?.toFixed(3)} L/ton</p>
                      <Badge variant="secondary" className="gap-1 mt-1">
                        {isExcess ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(variance).toFixed(3)} L {isExcess ? "excess" : "saved"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
