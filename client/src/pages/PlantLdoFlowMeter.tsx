import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Loader2, Trash2, Download, Printer, Gauge, Pencil, Lock } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { LdoFlowReading } from "@shared/schema";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

const TANK_LABELS: Record<number, string> = { 1: "Boiler", 2: "Dryer" };

export default function PlantLdoFlowMeter() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const searchString = useSearch();
  const urlRole = new URLSearchParams(searchString || window.location.search).get("role");
  const pageRole: "manager" | "admin" | null = (urlRole === "manager" || urlRole === "admin") ? urlRole : null;
  const isAdmin = pageRole === "admin";
  const backLink = appendOrigin(`/plant/dashboard?tab=stock${pageRole ? `&role=${pageRole}` : ""}`);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReading, setEditingReading] = useState<LdoFlowReading | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTank, setFilterTank] = useState("all");

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "delete" | "edit" | "export-excel" | "export-pdf" | "print"; readingId?: number } | null>(null);

  const [tankNumber, setTankNumber] = useState("1");
  const [meterReading, setMeterReading] = useState("");
  const [readingType, setReadingType] = useState("opening");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [quantityLiters, setQuantityLiters] = useState("");
  const [notes, setNotes] = useState("");

  const { data: readings, isLoading } = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings"],
  });

  const { data: dispatches } = useQuery<{ date: string; loadWeight: number; theoreticalBitumenQty: number | null; theoreticalLdoQty: number | null }[]>({
    queryKey: ["/api/plant-module/dispatches"],
  });

  const { data: materials } = useQuery<{ id: number; name: string; defaultUom: string }[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const ldoMaterialId = useMemo(() => {
    if (!materials) return null;
    const m = materials.find(m => m.name.toUpperCase() === 'LDO');
    return m?.id ?? null;
  }, [materials]);

  const { data: allReceipts } = useQuery<{ id: number; date: string; materialId: number; quantity: number; uom: string }[]>({
    queryKey: ["/api/plant-module/material-receipts"],
  });

  const ldoReceipts = useMemo(() => {
    if (!allReceipts || !ldoMaterialId) return [];
    return allReceipts.filter(r => r.materialId === ldoMaterialId);
  }, [allReceipts, ldoMaterialId]);

  const ldoReceiptsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of ldoReceipts) {
      const qtyL = r.uom === 'Liters' || r.uom === 'L' ? r.quantity : r.uom === 'kg' ? r.quantity / LDO_DENSITY_KG_PER_LITER : r.quantity;
      map[r.date] = (map[r.date] || 0) + qtyL;
    }
    return map;
  }, [ldoReceipts]);

  const filteredReadings = useMemo(() => {
    if (!readings) return [];
    return readings.filter(r => {
      if (filterDateFrom && r.date < filterDateFrom) return false;
      if (filterDateTo && r.date > filterDateTo) return false;
      if (filterTank !== "all" && r.tankNumber !== parseInt(filterTank)) return false;
      return true;
    });
  }, [readings, filterDateFrom, filterDateTo, filterTank]);

  const latestTank1 = useMemo(() => {
    if (!readings) return null;
    const tank1 = readings.filter(r => r.tankNumber === 1);
    if (tank1.length === 0) return null;
    return tank1.sort((a, b) => {
      const dateComp = b.date.localeCompare(a.date);
      if (dateComp !== 0) return dateComp;
      return (b.time || "").localeCompare(a.time || "");
    })[0];
  }, [readings]);

  const latestTank2 = useMemo(() => {
    if (!readings) return null;
    const tank2 = readings.filter(r => r.tankNumber === 2);
    if (tank2.length === 0) return null;
    return tank2.sort((a, b) => {
      const dateComp = b.date.localeCompare(a.date);
      if (dateComp !== 0) return dateComp;
      return (b.time || "").localeCompare(a.time || "");
    })[0];
  }, [readings]);

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
        const t1Entries = day.entries.filter(e => e.tankNumber === 1);
        const t2Entries = day.entries.filter(e => e.tankNumber === 2);

        const t1Openings = t1Entries.filter(e => e.readingType === "opening").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const t1Closings = t1Entries.filter(e => e.readingType === "closing").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const t2Openings = t2Entries.filter(e => e.readingType === "opening").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const t2Closings = t2Entries.filter(e => e.readingType === "closing").sort((a, b) => (a.time || "").localeCompare(b.time || ""));

        const t1Opening = t1Openings[0] || null;
        const t1Closing = t1Closings[t1Closings.length - 1] || null;
        const t2Opening = t2Openings[0] || null;
        const t2Closing = t2Closings[t2Closings.length - 1] || null;

        let t1Consumption = null as number | null;
        let t2Consumption = null as number | null;

        if (t1Opening && t1Closing) {
          t1Consumption = t1Closing.meterReading - t1Opening.meterReading;
        }
        if (t2Opening && t2Closing) {
          t2Consumption = t2Closing.meterReading - t2Opening.meterReading;
        }

        const materialReceiptL = ldoReceiptsByDate[day.date] || 0;
        const totalL = (t1Consumption || 0) + (t2Consumption || 0);

        return {
          date: day.date,
          t1Opening, t1Closing, t2Opening, t2Closing,
          t1Consumption, t2Consumption,
          materialReceiptL,
          totalConsumption: totalL,
          totalConsumptionKg: totalL > 0 ? Math.round(totalL * LDO_DENSITY_KG_PER_LITER) : null,
        };
      });
  }, [readings, ldoReceiptsByDate]);

  const totalConsumptionBothTanks = dailySummary.reduce((s, d) => s + d.totalConsumption, 0);

  const tankStock = useMemo(() => {
    if (!readings) return { tank1: null as { stockL: number; date: string; time?: string } | null, tank2: null as { stockL: number; date: string; time?: string } | null };

    const computeStock = (tankNum: number) => {
      const tankReadings = readings.filter(r => r.tankNumber === tankNum);
      const stockEntries = tankReadings.filter(r => r.readingType === "stock").sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
      });
      if (stockEntries.length === 0) return null;

      const latestStock = stockEntries[0];
      const stockL = latestStock.quantityLiters || 0;
      const stockDateTime = `${latestStock.date}T${latestStock.time || "00:00"}`;

      const receiptsSince = tankReadings
        .filter(r => r.readingType === "receipt" && `${r.date}T${r.time || "00:00"}` > stockDateTime)
        .reduce((s, r) => s + (r.quantityLiters || 0), 0);

      const dateGroups: Record<string, { openings: typeof tankReadings; closings: typeof tankReadings }> = {};
      for (const r of tankReadings) {
        if (r.readingType !== "opening" && r.readingType !== "closing") continue;
        if (r.date < latestStock.date) continue;
        if (r.date === latestStock.date && `${r.date}T${r.time || "00:00"}` <= stockDateTime) continue;
        if (!dateGroups[r.date]) dateGroups[r.date] = { openings: [], closings: [] };
        if (r.readingType === "opening") dateGroups[r.date].openings.push(r);
        else dateGroups[r.date].closings.push(r);
      }

      let consumptionSince = 0;
      for (const [, group] of Object.entries(dateGroups)) {
        if (group.openings.length > 0 && group.closings.length > 0) {
          const openVal = group.openings.sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0].meterReading;
          const closeVal = group.closings.sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0].meterReading;
          const diff = closeVal - openVal;
          if (diff > 0) consumptionSince += diff;
        }
      }

      return {
        stockL: stockL + receiptsSince - consumptionSince,
        date: latestStock.date,
        time: latestStock.time || undefined,
      };
    };

    return { tank1: computeStock(1), tank2: computeStock(2) };
  }, [readings]);

  const varianceData = useMemo(() => {
    if (!dispatches || dailySummary.length === 0) return [];
    const dispatchByDate: Record<string, { production: number; theoreticalLdo: number }> = {};
    for (const d of dispatches) {
      if (!dispatchByDate[d.date]) dispatchByDate[d.date] = { production: 0, theoreticalLdo: 0 };
      dispatchByDate[d.date].production += d.loadWeight || 0;
      dispatchByDate[d.date].theoreticalLdo += d.theoreticalLdoQty || 0;
    }
    const result: {
      date: string;
      production: number;
      theoretical: number;
      actualT1: number | null;
      actualT2: number | null;
      actualTotal: number;
      variance: number;
      variancePercent: number | null;
      status: "SAVING" | "LOSS" | "OK";
    }[] = [];
    for (const day of dailySummary) {
      const dd = dispatchByDate[day.date];
      if (!dd || day.totalConsumption === 0) continue;
      const variance = day.totalConsumption - dd.theoreticalLdo;
      const variancePercent = dd.theoreticalLdo > 0 ? Math.round((variance / dd.theoreticalLdo) * 1000) / 10 : null;
      const status: "SAVING" | "LOSS" | "OK" = dd.theoreticalLdo === 0 ? "OK" : variance < 0 ? "SAVING" : variance > 0 ? "LOSS" : "OK";
      result.push({
        date: day.date,
        production: dd.production,
        theoretical: dd.theoreticalLdo,
        actualT1: day.t1Consumption,
        actualT2: day.t2Consumption,
        actualTotal: day.totalConsumption,
        variance,
        variancePercent,
        status,
      });
    }
    return result.slice(0, 10);
  }, [dispatches, dailySummary]);

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/plant-module/ldo-flow-readings/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      toast({ title: "LDO flow reading updated" });
      resetForm();
      setEditingReading(null);
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
    setTankNumber("1");
    setMeterReading("");
    setReadingType("opening");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setQuantityLiters("");
    setNotes("");
  }

  function handleTankClick(tankNum: number) {
    setEditingReading(null);
    setTankNumber(String(tankNum));
    setMeterReading("");
    setReadingType("opening");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setQuantityLiters("");
    setNotes("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (readingType === "stock") {
      if (!quantityLiters || parseFloat(quantityLiters) < 0) {
        toast({ title: "Invalid stock quantity", description: "Enter the current stock in liters", variant: "destructive" });
        return;
      }
      const payload = {
        date: readingDate,
        time: readingTime,
        tankNumber: parseInt(tankNumber),
        meterReading: 0,
        readingType: "stock",
        quantityLiters: parseFloat(quantityLiters),
        notes: notes || null,
      };
      if (editingReading) {
        updateMutation.mutate({ id: editingReading.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
      return;
    }

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

    const payload = {
      date: readingDate,
      time: readingTime,
      tankNumber: parseInt(tankNumber),
      meterReading: meter,
      readingType,
      quantityLiters: readingType === "receipt" ? parseFloat(quantityLiters) : null,
      notes: notes || null,
    };

    if (editingReading) {
      updateMutation.mutate({ id: editingReading.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
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
    } else if (pendingAction.type === "edit" && pendingAction.readingId) {
      const reading = readings?.find(r => r.id === pendingAction.readingId);
      if (reading) {
        setEditingReading(reading);
        setReadingDate(reading.date);
        setReadingTime(reading.time || "");
        setTankNumber(String(reading.tankNumber));
        setMeterReading(String(reading.meterReading));
        setReadingType(reading.readingType);
        setQuantityLiters(reading.quantityLiters ? String(reading.quantityLiters) : "");
        setNotes(reading.notes || "");
        setDialogOpen(true);
      }
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
      Tank: `Tank ${r.tankNumber} (${TANK_LABELS[r.tankNumber] || ""})`,
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
      "T1 Opening (L)": d.t1Opening?.meterReading ?? "",
      "T1 Closing (L)": d.t1Closing?.meterReading ?? "",
      "T1 Consumption (L)": d.t1Consumption ?? "",
      "T2 Opening (L)": d.t2Opening?.meterReading ?? "",
      "T2 Closing (L)": d.t2Closing?.meterReading ?? "",
      "T2 Consumption (L)": d.t2Consumption ?? "",
      "Total (L)": d.totalConsumption || "",
      "Total (kg)": d.totalConsumptionKg ?? "",
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
      r.date, r.time || "",
      `T${r.tankNumber} (${TANK_LABELS[r.tankNumber] || ""})`,
      r.meterReading.toFixed(3),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      r.quantityLiters ? r.quantityLiters.toFixed(3) : "",
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Tank", "Meter (L)", "Type", "Receipt Qty (L)", "Notes"]],
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
      <table><tr><th>Date</th><th>Time</th><th>Tank</th><th>Meter (L)</th><th>Type</th><th>Receipt Qty (L)</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>T${r.tankNumber} (${TANK_LABELS[r.tankNumber] || ""})</td><td>${r.meterReading.toFixed(3)}</td><td>${r.readingType}</td><td>${r.quantityLiters ? r.quantityLiters.toFixed(3) : ""}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  }

  const dialogTitle = editingReading
    ? "Edit LDO Reading"
    : `Record LDO Reading - Tank ${tankNumber} (${TANK_LABELS[parseInt(tankNumber)] || ""})`;

  const isMutating = createMutation.isPending || updateMutation.isPending;

  if (!pageRole) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={appendOrigin("/plant/dashboard?tab=stock")}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Gauge className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold flex-1">LDO Flow Meter Tracker</h1>
        </div>
        <Card className="py-12">
          <CardContent className="text-center">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-muted-foreground mb-4">Please access this page through the Stock Details tab in the Plant Module</p>
            <Link href={appendOrigin("/plant/dashboard?tab=stock")}>
              <Button data-testid="button-go-to-plant">Go to Plant Module</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
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
      </div>

      <div className="text-sm text-muted-foreground">
        LDO density: {LDO_DENSITY_KG_PER_LITER} kg/L | Tank 1 = Boiler (heats bitumen) | Tank 2 = Dryer (heats aggregates)
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={pageRole ? "cursor-pointer hover-elevate" : ""}
          onClick={pageRole ? () => handleTankClick(1) : undefined}
          data-testid="tank-card-1"
        >
          <Card className="overflow-visible border-l-4 border-l-blue-400 dark:border-l-blue-600" style={{borderRadius: 0}}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tank 1 (Boiler)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tankStock.tank1 ? (
                <div className="space-y-1 text-sm">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-stock-t1">
                    {tankStock.tank1.stockL.toFixed(3)} L
                  </div>
                  <div className="text-sm font-medium">{(tankStock.tank1.stockL * LDO_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</div>
                  <div className="text-xs text-muted-foreground">
                    Stock as of {tankStock.tank1.date} {tankStock.tank1.time || ""}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">No stock recorded</div>
              )}
              {latestTank1 && (
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <span>Meter: {latestTank1.meterReading.toFixed(3)} L</span>
                  <span className="ml-2">({latestTank1.date} {latestTank1.time || ""} - {latestTank1.readingType})</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div
          className={pageRole ? "cursor-pointer hover-elevate" : ""}
          onClick={pageRole ? () => handleTankClick(2) : undefined}
          data-testid="tank-card-2"
        >
          <Card className="overflow-visible border-l-4 border-l-amber-400 dark:border-l-amber-600" style={{borderRadius: 0}}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tank 2 (Dryer)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tankStock.tank2 ? (
                <div className="space-y-1 text-sm">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-stock-t2">
                    {tankStock.tank2.stockL.toFixed(3)} L
                  </div>
                  <div className="text-sm font-medium">{(tankStock.tank2.stockL * LDO_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</div>
                  <div className="text-xs text-muted-foreground">
                    Stock as of {tankStock.tank2.date} {tankStock.tank2.time || ""}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">No stock recorded</div>
              )}
              {latestTank2 && (
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <span>Meter: {latestTank2.meterReading.toFixed(3)} L</span>
                  <span className="ml-2">({latestTank2.date} {latestTank2.time || ""} - {latestTank2.readingType})</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Combined Stock & Consumption</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(tankStock.tank1 || tankStock.tank2) && (
              <>
                <div className="flex justify-between gap-1 flex-wrap">
                  <span className="text-muted-foreground">Total Stock:</span>
                  <span className="font-bold text-green-600 dark:text-green-400" data-testid="text-combined-stock">
                    {((tankStock.tank1?.stockL || 0) + (tankStock.tank2?.stockL || 0)).toFixed(3)} L
                    ({(((tankStock.tank1?.stockL || 0) + (tankStock.tank2?.stockL || 0)) * LDO_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT)
                  </span>
                </div>
                <div className="border-b my-1" />
              </>
            )}
            <div className="flex justify-between gap-1 flex-wrap">
              <span className="text-muted-foreground">Total Consumption (Recent):</span>
              <span className="font-bold" data-testid="text-combined-consumption">
                {totalConsumptionBothTanks > 0 ? `${totalConsumptionBothTanks.toFixed(3)} L` : "-"}
              </span>
            </div>
            <div className="flex justify-between gap-1 flex-wrap">
              <span className="text-muted-foreground">Weight:</span>
              <span className="font-bold">
                {totalConsumptionBothTanks > 0 ? `${(totalConsumptionBothTanks * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg` : "-"}
              </span>
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
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-left p-2 border border-border align-bottom">Date</th>
                    <th colSpan={3} className="text-center p-2 border border-border bg-blue-100 dark:bg-blue-900 font-semibold">Tank 1 (Boiler)</th>
                    <th colSpan={3} className="text-center p-2 border border-border bg-amber-100 dark:bg-amber-900 font-semibold">Tank 2 (Dryer)</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom">Mat. Rcpt (L)</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom font-bold">Total (L)</th>
                  </tr>
                  <tr>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50">Opening</th>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50">Closing</th>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50 font-semibold">Consumed</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50">Opening</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50">Closing</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50 font-semibold">Consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.map(day => (
                    <tr key={day.date} data-testid={`row-daily-${day.date}`}>
                      <td className="p-2 border border-border">{day.date}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Opening?.meterReading?.toFixed(3) ?? "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Closing?.meterReading?.toFixed(3) ?? "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30 font-medium">{day.t1Consumption !== null ? day.t1Consumption.toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Opening?.meterReading?.toFixed(3) ?? "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Closing?.meterReading?.toFixed(3) ?? "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30 font-medium">{day.t2Consumption !== null ? day.t2Consumption.toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border text-muted-foreground">{day.materialReceiptL ? day.materialReceiptL.toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border font-bold">{day.totalConsumption ? day.totalConsumption.toFixed(3) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {varianceData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">LDO Consumption Variance Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Production (MT)</th>
                    <th className="text-right p-2">Theoretical (L)</th>
                    <th className="text-right p-2">Actual T1 (L)</th>
                    <th className="text-right p-2">Actual T2 (L)</th>
                    <th className="text-right p-2">Actual Total (L)</th>
                    <th className="text-right p-2">Variance (L)</th>
                    <th className="text-right p-2">Variance %</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.map(row => (
                    <tr key={row.date} className="border-b" data-testid={`row-ldo-variance-${row.date}`}>
                      <td className="p-2">{row.date}</td>
                      <td className="p-2 text-right">{row.production.toFixed(3)}</td>
                      <td className="p-2 text-right">{row.theoretical.toFixed(3)}</td>
                      <td className="p-2 text-right">{row.actualT1 !== null ? row.actualT1.toFixed(3) : "-"}</td>
                      <td className="p-2 text-right">{row.actualT2 !== null ? row.actualT2.toFixed(3) : "-"}</td>
                      <td className="p-2 text-right font-bold">{row.actualTotal.toFixed(3)}</td>
                      <td className={`p-2 text-right font-bold ${row.variance < 0 ? "text-green-600 dark:text-green-400" : row.variance > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {row.variance.toFixed(3)}
                      </td>
                      <td className={`p-2 text-right ${row.variance < 0 ? "text-green-600 dark:text-green-400" : row.variance > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {row.variancePercent !== null ? `${row.variancePercent}%` : "-"}
                      </td>
                      <td className="p-2 text-center" data-testid={`text-ldo-variance-status-${row.date}`}>
                        {row.status === "SAVING" && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 no-default-hover-elevate no-default-active-elevate">SAVING</Badge>}
                        {row.status === "LOSS" && <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 no-default-hover-elevate no-default-active-elevate">LOSS</Badge>}
                        {row.status === "OK" && <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">OK</Badge>}
                      </td>
                    </tr>
                  ))}
                  {(() => {
                    const totProd = varianceData.reduce((s, r) => s + r.production, 0);
                    const totTheo = varianceData.reduce((s, r) => s + r.theoretical, 0);
                    const totT1 = varianceData.reduce((s, r) => s + (r.actualT1 || 0), 0);
                    const totT2 = varianceData.reduce((s, r) => s + (r.actualT2 || 0), 0);
                    const totActual = varianceData.reduce((s, r) => s + r.actualTotal, 0);
                    const totVar = totActual - totTheo;
                    const totVarPct = totTheo > 0 ? Math.round((totVar / totTheo) * 1000) / 10 : null;
                    const totStatus: "SAVING" | "LOSS" | "OK" = totTheo === 0 ? "OK" : totVar < 0 ? "SAVING" : totVar > 0 ? "LOSS" : "OK";
                    return (
                      <tr className="border-t-2 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{totProd.toFixed(3)}</td>
                        <td className="p-2 text-right">{totTheo.toFixed(3)} ({(totTheo * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg)</td>
                        <td className="p-2 text-right">{totT1.toFixed(3)}</td>
                        <td className="p-2 text-right">{totT2.toFixed(3)}</td>
                        <td className="p-2 text-right">{totActual.toFixed(3)} ({(totActual * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg)</td>
                        <td className={`p-2 text-right ${totVar < 0 ? "text-green-600 dark:text-green-400" : totVar > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {totVar.toFixed(3)}
                        </td>
                        <td className={`p-2 text-right ${totVar < 0 ? "text-green-600 dark:text-green-400" : totVar > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {totVarPct !== null ? `${totVarPct}%` : "-"}
                        </td>
                        <td className="p-2 text-center">
                          {totStatus === "SAVING" && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 no-default-hover-elevate no-default-active-elevate">SAVING</Badge>}
                          {totStatus === "LOSS" && <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 no-default-hover-elevate no-default-active-elevate">LOSS</Badge>}
                          {totStatus === "OK" && <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">OK</Badge>}
                        </td>
                      </tr>
                    );
                  })()}
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
            {isAdmin && (
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
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
            <Select value={filterTank} onValueChange={setFilterTank}>
              <SelectTrigger className="w-44" data-testid="select-filter-tank">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tanks</SelectItem>
                <SelectItem value="1">Tank 1 (Boiler)</SelectItem>
                <SelectItem value="2">Tank 2 (Dryer)</SelectItem>
              </SelectContent>
            </Select>
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
                    <th className="text-left p-2">Tank</th>
                    <th className="text-right p-2">Meter Reading (L)</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Qty (L)</th>
                    <th className="text-left p-2">Notes</th>
                    {isAdmin && <th className="text-center p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.map(r => (
                    <tr key={r.id} className="border-b" data-testid={`row-reading-${r.id}`}>
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.time || "-"}</td>
                      <td className="p-2">
                        <Badge variant={r.tankNumber === 1 ? "default" : "secondary"} data-testid={`badge-tank-${r.id}`}>
                          T{r.tankNumber} ({TANK_LABELS[r.tankNumber]})
                        </Badge>
                      </td>
                      <td className="p-2 text-right font-medium">{r.readingType === "stock" ? "-" : r.meterReading.toFixed(3)}</td>
                      <td className="p-2">
                        <Badge variant={r.readingType === "opening" ? "default" : r.readingType === "closing" ? "secondary" : r.readingType === "stock" ? "default" : "outline"}
                          className={r.readingType === "stock" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 no-default-hover-elevate no-default-active-elevate" : ""}>
                          {r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{r.quantityLiters ? r.quantityLiters.toFixed(3) : "-"}</td>
                      <td className="p-2 text-muted-foreground text-xs">{r.notes || "-"}</td>
                      {isAdmin && (
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" onClick={() => handlePinAction("edit", r.id)} data-testid={`button-edit-${r.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {deleteConfirmId === r.id ? (
                              <>
                                <Button size="sm" variant="destructive" onClick={() => handlePinAction("delete", r.id)} data-testid={`button-confirm-delete-${r.id}`}>
                                  Confirm
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(r.id)} data-testid={`button-delete-${r.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
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
            <DialogTitle>{dialogTitle}</DialogTitle>
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
              <Label>Tank</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium" data-testid="text-tank-number">
                Tank {tankNumber} ({TANK_LABELS[parseInt(tankNumber)] || ""})
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
                  <SelectItem value="stock">Stock Entry (Current quantity in tank)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {readingType !== "stock" && (
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
                    = {(parseFloat(meterReading) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                  </p>
                )}
              </div>
            )}

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
                    = {(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                  </p>
                )}
              </div>
            )}

            {readingType === "stock" && (
              <div>
                <Label>Current Stock Quantity (Liters) <span className="text-xs text-muted-foreground">- Physical stock in tank</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantityLiters}
                  onChange={e => setQuantityLiters(e.target.value)}
                  placeholder="e.g. 8000"
                  data-testid="input-stock-quantity"
                />
                {quantityLiters && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = {(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                    = {(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT
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
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingReading(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isMutating || (readingType === "stock" ? !quantityLiters : !meterReading)} data-testid="button-submit-reading">
              {isMutating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingReading ? "Update Reading" : "Record Reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
