import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Droplets, Loader2, TrendingUp, TrendingDown, Download, Printer, Zap, Pencil, Users, BarChart3 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LdoLog, LdoFlowReading, LdoDipReading } from "@shared/schema";
import { DEFAULT_LDO_NORM } from "@shared/schema";
import { computeTankStock } from "@/lib/ldoStock";
import { getLdoUsableVolume } from "@shared/ldo-dip-chart";
import { LdoUsableStockStrip } from "@/components/LdoUsableStockStrip";

type DailySummary = {
  openingStockL: number | null;
  ldoReceivedL: number;
  ldoConsumedL: number;
  closingStockL: number | null;
  tonsProducedMT: number;
  hasFlowReadings: boolean;
};

type AutoFilledFields = Set<'openingStock' | 'ldoReceived' | 'ldoConsumed' | 'closingStock' | 'tonsProduced'>;

export default function PlantLdoLogs() {
  const { toast } = useToast();
  const { sectionCan } = useAuth();
  const canCreate = sectionCan("plant_stock", "create");
  const canEdit = sectionCan("plant_stock", "edit");
  const canExport = sectionCan("plant_stock", "view_reports");
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LdoLog | null>(null);
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [openingStock, setOpeningStock] = useState("");
  const [ldoReceived, setLdoReceived] = useState("");
  const [ldoConsumed, setLdoConsumed] = useState("");
  const [closingStock, setClosingStock] = useState("");
  const [tonsProduced, setTonsProduced] = useState("");
  const [autoFilledFields, setAutoFilledFields] = useState<AutoFilledFields>(new Set());
  const [summaryLoading, setSummaryLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks fields the user edited WHILE a summary fetch was in-flight so the
  // response doesn't clobber values they typed before the response arrived.
  const dirtyWhileFetchingRef = useRef<Set<string>>(new Set());

  const clearFieldAutoFill = (field: 'openingStock' | 'ldoReceived' | 'ldoConsumed' | 'closingStock' | 'tonsProduced') => {
    setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field); return next; });
    dirtyWhileFetchingRef.current.add(field);
  };

  // Task #479 — Auto-fill from meter readings when dialog opens or date changes
  // Skip auto-fill when editing an existing entry (fields are pre-populated)
  useEffect(() => {
    if (!dialogOpen) return;
    if (!date) return;
    if (editingLog) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dirtyWhileFetchingRef.current = new Set();

    setSummaryLoading(true);
    setAutoFilledFields(new Set());

    fetch(`/api/plant-module/ldo-logs/daily-summary?date=${date}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<DailySummary> : Promise.reject(new Error("non-ok")))
      .then((s: DailySummary) => {
        const dirty = dirtyWhileFetchingRef.current;
        const filled = new Set<'openingStock' | 'ldoReceived' | 'ldoConsumed' | 'closingStock' | 'tonsProduced'>();
        // Always write all managed fields (or clear them) so switching dates
        // never leaves stale values from a previous date. Fields the user
        // typed while the fetch was in-flight (dirty) are left as-is.
        if (!dirty.has('openingStock')) {
          if (s.hasFlowReadings && s.openingStockL !== null) {
            setOpeningStock(String(Math.round(s.openingStockL * 10) / 10));
            filled.add('openingStock');
          } else { setOpeningStock(""); }
        }
        // Show "0" (not blank) for received/consumed when flow readings exist
        // so a valid zero-consumption day is distinguishable from "no data".
        if (!dirty.has('ldoReceived')) {
          if (s.hasFlowReadings) {
            setLdoReceived(s.ldoReceivedL > 0 ? String(Math.round(s.ldoReceivedL * 10) / 10) : "0");
            filled.add('ldoReceived');
          } else { setLdoReceived(""); }
        }
        if (!dirty.has('ldoConsumed')) {
          if (s.hasFlowReadings) {
            setLdoConsumed(s.ldoConsumedL > 0 ? String(Math.round(s.ldoConsumedL * 10) / 10) : "0");
            filled.add('ldoConsumed');
          } else { setLdoConsumed(""); }
        }
        if (!dirty.has('closingStock')) {
          if (s.hasFlowReadings && s.closingStockL !== null) {
            setClosingStock(String(Math.round(s.closingStockL * 10) / 10));
            filled.add('closingStock');
          } else { setClosingStock(""); }
        }
        // Tons produced: show "0" when flow readings exist so zero-production
        // shifts are clearly marked as checked (not "unknown").
        if (!dirty.has('tonsProduced')) {
          if (s.hasFlowReadings || s.tonsProducedMT > 0) {
            setTonsProduced(s.tonsProducedMT > 0 ? String(Math.round(s.tonsProducedMT * 1000) / 1000) : "0");
            filled.add('tonsProduced');
          } else { setTonsProduced(""); }
        }
        setAutoFilledFields(filled);
        setSummaryLoading(false);
      })
      // Don't clear the loading spinner for AbortErrors — those mean a newer
      // request is in-flight and will clear it when it resolves.
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== 'AbortError') setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [dialogOpen, date]);

  // Task #255 — Pull dip readings (authoritative physical stock) for the header
  // strip. Same queryKey as PlantLdoFlowMeter so React Query reuses the cache.
  const { data: dipReadings } = useQuery<LdoDipReading[]>({
    queryKey: ["/api/plant-module/ldo-dip-readings"],
  });
  const latestDipTank1 = useMemo(() => {
    if (!dipReadings) return null;
    const tank1 = dipReadings.filter(r => r.tankNumber === 1);
    if (tank1.length === 0) return null;
    return tank1.sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
    })[0];
  }, [dipReadings]);
  const latestDipTank2 = useMemo(() => {
    if (!dipReadings) return null;
    const tank2 = dipReadings.filter(r => r.tankNumber === 2);
    if (tank2.length === 0) return null;
    return tank2.sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
    })[0];
  }, [dipReadings]);

  // Flow readings still needed for other computations on this page.
  const { data: flowReadings } = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings"],
  });
  const tankStock = {
    tank1: computeTankStock(flowReadings, 1),
    tank2: computeTankStock(flowReadings, 2),
  };

  const { data: logs, isLoading } = useQuery<LdoLog[]>({
    queryKey: ["/api/plant-module/ldo-logs"],
  });

  const [ldoTab, setLdoTab] = useState<"actual" | "contractor" | "efficiency">("actual");
  const [contractorFrom, setContractorFrom] = useState("");
  const [contractorTo, setContractorTo] = useState("");

  type ContractorRow = { partyId: number | null; partyName: string; loads: number; totalMt: number; theoreticalLdoL: number; actualLdoL: number };
  const contractorQKey = ["/api/plant-module/ldo-reports/contractor", contractorFrom, contractorTo];
  const { data: contractorData, isLoading: contractorLoading } = useQuery<ContractorRow[]>({
    queryKey: contractorQKey,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (contractorFrom) qs.set("dateFrom", contractorFrom);
      if (contractorTo) qs.set("dateTo", contractorTo);
      const res = await fetch(`/api/plant-module/ldo-reports/contractor?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
    enabled: ldoTab === "contractor" || ldoTab === "efficiency",
  });

  const totalTheoretical = contractorData?.reduce((s, r) => s + r.theoreticalLdoL, 0) ?? 0;
  const totalActualDip = logs?.reduce((s, l) => s + (l.ldoConsumed ?? 0), 0) ?? 0;

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/ldo-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "LDO log recorded successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "";
      if (message.startsWith("409:") || message.includes("already exists")) {
        toast({
          title: "Duplicate entry",
          description: `An LDO log for ${date} already exists. Please edit the existing entry instead.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to save LDO log",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { date: string; openingStock: number | null; ldoReceived: number | null; ldoConsumed: number | null; closingStock: number | null; tonsProduced: number | null } }) =>
      apiRequest("PATCH", `/api/plant-module/ldo-logs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "LDO log updated successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "";
      if (message.startsWith("409:") || message.includes("already exists")) {
        toast({
          title: "Duplicate entry",
          description: `An LDO log for ${date} already exists.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to update LDO log",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setOpeningStock("");
    setLdoReceived("");
    setLdoConsumed("");
    setClosingStock("");
    setTonsProduced("");
    setAutoFilledFields(new Set());
    setSummaryLoading(false);
    setEditingLog(null);
  };

  const openEditDialog = (log: LdoLog) => {
    setEditingLog(log);
    setDate(log.date);
    setOpeningStock(log.openingStock != null ? String(log.openingStock) : "");
    setLdoReceived(log.ldoReceived != null ? String(log.ldoReceived) : "");
    setLdoConsumed(log.ldoConsumed != null ? String(log.ldoConsumed) : "");
    setClosingStock(log.closingStock != null ? String(log.closingStock) : "");
    setTonsProduced(log.tonsProduced != null ? String(log.tonsProduced) : "");
    setAutoFilledFields(new Set());
    setDialogOpen(true);
  };

  const doSave = () => {
    const payload = {
      date,
      openingStock: openingStock ? parseFloat(openingStock) : null,
      ldoReceived: ldoReceived ? parseFloat(ldoReceived) : null,
      ldoConsumed: ldoConsumed ? parseFloat(ldoConsumed) : null,
      closingStock: closingStock ? parseFloat(closingStock) : null,
      tonsProduced: tonsProduced ? parseFloat(tonsProduced) : null,
    };
    if (editingLog) {
      editMutation.mutate({ id: editingLog.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleSubmit = () => {
    if (editingLog) {
      doSave();
      return;
    }
    const duplicate = logs?.some((log) => log.date === date);
    if (duplicate) {
      setDuplicateWarningOpen(true);
    } else {
      doSave();
    }
  };

  const expectedLdo = tonsProduced ? parseFloat(tonsProduced) * DEFAULT_LDO_NORM : 0;

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
        {/* Task #255 — Header strip mirrors the LDO Flow Meter page so
            operators see the same per-tank usable balance regardless of
            which LDO screen they land on. */}
        <div className="w-full sm:w-auto sm:min-w-[28rem] order-last sm:order-none">
          <LdoUsableStockStrip
            tank1L={latestDipTank1 ? getLdoUsableVolume(1, latestDipTank1.depthCm) : null}
            tank2L={latestDipTank2 ? getLdoUsableVolume(2, latestDipTank2.depthCm) : null}
            tank1AsOf={latestDipTank1 ? { date: latestDipTank1.date, time: latestDipTank1.time || undefined } : undefined}
            tank2AsOf={latestDipTank2 ? { date: latestDipTank2.date, time: latestDipTank2.time || undefined } : undefined}
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          {canCreate && (
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-ldo-log">
                <Plus className="w-4 h-4" /> New Entry
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingLog ? "Edit LDO Entry" : "Record LDO Consumption"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => { if (!editingLog) { setDate(e.target.value); setAutoFilledFields(new Set()); } }}
                  readOnly={!!editingLog}
                  className={editingLog ? "opacity-60 cursor-not-allowed" : ""}
                  data-testid="input-ldo-date"
                />
              </div>

              {summaryLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-summary-loading">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Computing values from meter readings…
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Stock (L)</Label>
                  <Input
                    type="number" step="0.1"
                    value={openingStock}
                    onChange={(e) => { setOpeningStock(e.target.value); clearFieldAutoFill('openingStock'); }}
                    placeholder="0"
                    data-testid="input-ldo-opening"
                  />
                  {autoFilledFields.has('openingStock') && (
                    <p className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="hint-opening-autofill">
                      <Zap className="w-3 h-3" /> from meter readings
                    </p>
                  )}
                </div>
                <div>
                  <Label>LDO Received (L)</Label>
                  <Input
                    type="number" step="0.1"
                    value={ldoReceived}
                    onChange={(e) => { setLdoReceived(e.target.value); clearFieldAutoFill('ldoReceived'); }}
                    placeholder="0"
                    data-testid="input-ldo-received"
                  />
                  {autoFilledFields.has('ldoReceived') && (
                    <p className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="hint-received-autofill">
                      <Zap className="w-3 h-3" /> from meter readings
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>LDO Consumed (L)</Label>
                  <Input
                    type="number" step="0.1"
                    value={ldoConsumed}
                    onChange={(e) => { setLdoConsumed(e.target.value); clearFieldAutoFill('ldoConsumed'); }}
                    placeholder="0"
                    data-testid="input-ldo-consumed"
                  />
                  {autoFilledFields.has('ldoConsumed') && (
                    <p className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="hint-consumed-autofill">
                      <Zap className="w-3 h-3" /> from meter readings
                    </p>
                  )}
                </div>
                <div>
                  <Label>Closing Stock (L)</Label>
                  <Input
                    type="number" step="0.1"
                    value={closingStock}
                    onChange={(e) => { setClosingStock(e.target.value); clearFieldAutoFill('closingStock'); }}
                    placeholder="0"
                    data-testid="input-ldo-closing"
                  />
                  {autoFilledFields.has('closingStock') && (
                    <p className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="hint-closing-autofill">
                      <Zap className="w-3 h-3" /> from meter readings
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label>Tons Produced (MT)</Label>
                <Input
                  type="number" step="0.1"
                  value={tonsProduced}
                  onChange={(e) => { setTonsProduced(e.target.value); clearFieldAutoFill('tonsProduced'); }}
                  placeholder="Total production for the day"
                  data-testid="input-tons-produced"
                />
                {autoFilledFields.has('tonsProduced') && (
                  <p className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="hint-tons-autofill">
                    <Zap className="w-3 h-3" /> from dispatch records
                  </p>
                )}
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

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || editMutation.isPending || isLoading} data-testid="button-save-ldo-log">
                {(createMutation.isPending || editMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingLog ? "Update Entry" : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <AlertDialog open={duplicateWarningOpen} onOpenChange={setDuplicateWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate date</AlertDialogTitle>
            <AlertDialogDescription>
              A log for <strong>{date}</strong> already exists. Save another entry anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-duplicate-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setDuplicateWarningOpen(false); doSave(); }}
              data-testid="button-duplicate-confirm"
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={ldoTab} onValueChange={(v) => setLdoTab(v as typeof ldoTab)}>
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-ldo-reports">
          <TabsTrigger value="actual" className="gap-1.5" data-testid="tab-actual">
            <Droplets className="w-4 h-4" /> Actual Consumption
          </TabsTrigger>
          <TabsTrigger value="contractor" className="gap-1.5" data-testid="tab-contractor">
            <Users className="w-4 h-4" /> Contractor Norms
          </TabsTrigger>
          <TabsTrigger value="efficiency" className="gap-1.5" data-testid="tab-efficiency">
            <BarChart3 className="w-4 h-4" /> Efficiency
          </TabsTrigger>
        </TabsList>

        {/* ── Tab A: Actual Dip-Based Consumption ── */}
        <TabsContent value="actual" className="space-y-4 mt-4">
          {canExport && (
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground flex-1">Plant LDO logs — actual dip-based consumption (internal tracking)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="gap-1" onClick={exportToExcel} disabled={!logs?.length} data-testid="button-export-excel">
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={exportToPDF} disabled={!logs?.length} data-testid="button-export-pdf">
                  <Download className="w-4 h-4" /> Export PDF
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print">
                  <Printer className="w-4 h-4" /> Print
                </Button>
              </div>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5" />
                Actual Plant Consumption (Dip-Based)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : !logs?.length ? (
                <p className="text-muted-foreground text-center py-8">No LDO logs recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const variance = log.variance || 0;
                    const isExcess = variance < 0;
                    return (
                      <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{log.date}</p>
                          <p className="text-sm text-muted-foreground">
                            Production: {log.tonsProduced?.toFixed(3)} MT | Consumed (dip): {log.ldoConsumed?.toFixed(3)} L
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Opening: {log.openingStock} L + Received: {log.ldoReceived} L | Closing: {log.closingStock} L
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Norm: {log.expectedLdo?.toFixed(3)} L (@ {DEFAULT_LDO_NORM} L/ton)
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <p className="text-lg font-bold text-primary">{log.efficiency?.toFixed(3)} L/ton</p>
                          <Badge variant="secondary" className="gap-1">
                            {isExcess ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(variance).toFixed(3)} L {isExcess ? "excess" : "saved"}
                          </Badge>
                          {canEdit && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                              onClick={() => openEditDialog(log)} data-testid={`button-edit-ldo-log-${log.id}`}>
                              <Pencil className="w-3 h-3" /> Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab B: Contractor LDO Norm (Billing/Commercial) ── */}
        <TabsContent value="contractor" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground flex-1">Theoretical LDO billed to each contractor based on dispatch norms (MT × L/ton norm)</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="date" value={contractorFrom} onChange={e => setContractorFrom(e.target.value)} className="w-36 h-8 text-sm" placeholder="From" data-testid="input-contractor-from" />
              <Input type="date" value={contractorTo} onChange={e => setContractorTo(e.target.value)} className="w-36 h-8 text-sm" placeholder="To" data-testid="input-contractor-to" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Contractor LDO Consumption (Norm-Based)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contractorLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : !contractorData?.length ? (
                <p className="text-muted-foreground text-center py-8">No dispatch data found for the selected period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-left">
                        <th className="py-2 pr-4 font-medium">Contractor / Party</th>
                        <th className="py-2 pr-4 font-medium text-right">Loads</th>
                        <th className="py-2 pr-4 font-medium text-right">Production (MT)</th>
                        <th className="py-2 pr-4 font-medium text-right">Theoretical LDO (L)</th>
                        <th className="py-2 font-medium text-right">Actual LDO Billed (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractorData.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-contractor-ldo-${i}`}>
                          <td className="py-2 pr-4 font-medium">{row.partyName}</td>
                          <td className="py-2 pr-4 text-right">{row.loads}</td>
                          <td className="py-2 pr-4 text-right">{row.totalMt.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-right">{row.theoreticalLdoL.toFixed(1)}</td>
                          <td className="py-2 text-right">{row.actualLdoL.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2 pr-4">Total</td>
                        <td className="py-2 pr-4 text-right">{contractorData.reduce((s, r) => s + r.loads, 0)}</td>
                        <td className="py-2 pr-4 text-right">{contractorData.reduce((s, r) => s + r.totalMt, 0).toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">{totalTheoretical.toFixed(1)}</td>
                        <td className="py-2 text-right">{contractorData.reduce((s, r) => s + r.actualLdoL, 0).toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="text-xs text-muted-foreground mt-3">
                    Contractor stock uses theoretical norms (MT × {DEFAULT_LDO_NORM} L/ton). Actual dip consumption is tracked separately as HLC internal.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab C: Efficiency / Variance (Theoretical vs Actual Dip) ── */}
        <TabsContent value="efficiency" className="space-y-4 mt-4">
          <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            Variance = Contractor norm (theoretical dispatch-based) vs Actual plant consumption (dip-based).
            Use the Contractor date range above to align periods.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-1">Contractor Norm (Theoretical)</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-theoretical-total">{totalTheoretical.toFixed(1)} L</p>
                <p className="text-xs text-muted-foreground mt-1">Sum of dispatch norms</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-1">Actual Plant (Dip-Based)</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-actual-dip-total">{totalActualDip.toFixed(1)} L</p>
                <p className="text-xs text-muted-foreground mt-1">Sum of LDO log entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-1">Savings / Excess</p>
                {totalTheoretical > 0 ? (
                  <>
                    <p className={`text-2xl font-bold ${totalTheoretical > totalActualDip ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
                      data-testid="text-variance-total">
                      {(totalTheoretical - totalActualDip).toFixed(1)} L
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalTheoretical > totalActualDip ? "Actual less than norm — efficient" : "Actual exceeds norm — investigate"}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm mt-2">Select contractor date range</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4" /> Per-Day Actual Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!logs?.length ? (
                <p className="text-muted-foreground text-center py-8">No LDO logs recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-left">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium text-right">Prod (MT)</th>
                        <th className="py-2 pr-4 font-medium text-right">Norm (L)</th>
                        <th className="py-2 pr-4 font-medium text-right">Actual Dip (L)</th>
                        <th className="py-2 pr-4 font-medium text-right">Savings (L)</th>
                        <th className="py-2 font-medium text-right">Efficiency (L/MT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const savings = (log.expectedLdo ?? 0) - (log.ldoConsumed ?? 0);
                        return (
                          <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 pr-4">{log.date}</td>
                            <td className="py-2 pr-4 text-right">{log.tonsProduced?.toFixed(2) ?? "—"}</td>
                            <td className="py-2 pr-4 text-right">{log.expectedLdo?.toFixed(1) ?? "—"}</td>
                            <td className="py-2 pr-4 text-right">{log.ldoConsumed?.toFixed(1) ?? "—"}</td>
                            <td className={`py-2 pr-4 text-right font-medium ${savings >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                              {savings >= 0 ? "+" : ""}{savings.toFixed(1)}
                            </td>
                            <td className="py-2 text-right">{log.efficiency?.toFixed(3) ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
