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
import { ChevronLeft, Loader2, Trash2, Download, Printer, Droplets, Pencil, Lock, Filter, BarChart3, TrendingDown, TrendingUp, Info, Scale } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { BitumenDipReading, Party, MixTemplate, TruckDispatch } from "@shared/schema";
import {
  BITUMEN_DIP_CHART,
  BITUMEN_DENSITY_KG_PER_LITER,
  DEFAULT_DEAD_STOCK_DEPTH,
  TANK_CAPACITY_LITERS,
  getVolumeAtDepth,
  getDeadStockVolume,
  getUsableVolume,
} from "@shared/bitumen-dip-chart";

export default function PlantBitumenStock() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const searchString = useSearch();
  const urlRole = new URLSearchParams(searchString || window.location.search).get("role");
  const pageRole: "manager" | "admin" | null = (urlRole === "manager" || urlRole === "admin") ? urlRole : null;
  const isAdmin = pageRole === "admin";
  const backLink = appendOrigin(`/plant/dashboard?tab=stock${pageRole ? `&role=${pageRole}` : ""}`);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReading, setEditingReading] = useState<BitumenDipReading | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTank, setFilterTank] = useState("all");

  const [reconDateFrom, setReconDateFrom] = useState("");
  const [reconDateTo, setReconDateTo] = useState("");
  const [reconPartyId, setReconPartyId] = useState("all");
  const [reconMixTemplateId, setReconMixTemplateId] = useState("all");
  const [reconSite, setReconSite] = useState("all");

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "delete" | "edit" | "export-excel" | "export-pdf" | "print"; readingId?: number } | null>(null);

  const [corrTank1MT, setCorrTank1MT] = useState("");
  const [corrTank2MT, setCorrTank2MT] = useState("");
  const [corrPartyId, setCorrPartyId] = useState<string>("");
  const [corrDate, setCorrDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [corrNotes, setCorrNotes] = useState("");
  const [showCorrForm, setShowCorrForm] = useState(false);

  const [tankNumber, setTankNumber] = useState("1");
  const [depthCm, setDepthCm] = useState("");
  const [readingType, setReadingType] = useState("adhoc");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [notes, setNotes] = useState("");

  const { data: readings, isLoading } = useQuery<BitumenDipReading[]>({
    queryKey: ["/api/plant-module/bitumen-dip-readings"],
  });

  const { data: dispatches } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: mixTemplates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: materials } = useQuery<{ id: number; name: string; defaultUom: string }[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const bitumenMaterialId = useMemo(() => {
    if (!materials) return null;
    const m = materials.find(m => m.name.toUpperCase() === 'BITUMEN');
    return m?.id ?? null;
  }, [materials]);

  const { data: allReceipts } = useQuery<{ id: number; date: string; materialId: number; quantity: number; uom: string; tankNumber?: number | null }[]>({
    queryKey: ["/api/plant-module/material-receipts"],
  });

  const { data: stockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
  });

  const bitumenPartyBalances = useMemo(() => {
    if (!stockBalances || !bitumenMaterialId) return [];
    return stockBalances.filter(b => b.materialId === bitumenMaterialId);
  }, [stockBalances, bitumenMaterialId]);

  const bitumenBookStockMT = useMemo(() => {
    return bitumenPartyBalances.reduce((s, b) => s + (b.balance || 0), 0);
  }, [bitumenPartyBalances]);

  const selectedPartyBalance = useMemo(() => {
    if (!corrPartyId) return null;
    const b = bitumenPartyBalances.find(b => String(b.partyId) === corrPartyId);
    return b?.balance ?? 0;
  }, [bitumenPartyBalances, corrPartyId]);

  const correctionMutation = useMutation({
    mutationFn: async (data: { materialId: number; partyId: number; physicalQty: number; uom: string; date: string; notes: string; correctedBy: string }) => {
      const res = await apiRequest("POST", "/api/plant-module/stock-correction", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      const adjMT = result.adjustment?.toFixed(3);
      const sign = result.adjustment >= 0 ? "+" : "";
      toast({ title: "Stock correction posted", description: `Adjustment: ${sign}${adjMT} MT. Book stock now ${result.newBalance?.toFixed(3)} MT.` });
      setShowCorrForm(false);
      setCorrTank1MT("");
      setCorrTank2MT("");
      setCorrNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bitumenReceipts = useMemo(() => {
    if (!allReceipts || !bitumenMaterialId) return [];
    return allReceipts.filter(r => r.materialId === bitumenMaterialId);
  }, [allReceipts, bitumenMaterialId]);

  const filteredReadings = useMemo(() => {
    if (!readings) return [];
    return readings.filter(r => {
      if (filterDateFrom && r.date < filterDateFrom) return false;
      if (filterDateTo && r.date > filterDateTo) return false;
      if (filterTank !== "all" && r.tankNumber !== parseInt(filterTank)) return false;
      return true;
    });
  }, [readings, filterDateFrom, filterDateTo, filterTank]);

  const depthNum = parseFloat(depthCm) || 0;
  const computedVolume = getVolumeAtDepth(depthNum);
  const computedWeight = computedVolume * BITUMEN_DENSITY_KG_PER_LITER;
  const deadStockVolume = getDeadStockVolume();
  const deadStockWeight = deadStockVolume * BITUMEN_DENSITY_KG_PER_LITER;
  const usableVolume = getUsableVolume(depthNum);
  const usableWeight = usableVolume * BITUMEN_DENSITY_KG_PER_LITER;
  const fillPercent = Math.min(100, (depthNum / 250) * 100);
  const deadStockPercent = (DEFAULT_DEAD_STOCK_DEPTH / 250) * 100;

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

  const tank1Volume = latestTank1 ? latestTank1.volumeLiters : 0;
  const tank2Volume = latestTank2 ? latestTank2.volumeLiters : 0;
  const tank1Usable = getUsableVolume(latestTank1?.depthCm || 0);
  const tank2Usable = getUsableVolume(latestTank2?.depthCm || 0);
  const combinedTotal = tank1Volume + tank2Volume;
  const combinedUsable = tank1Usable + tank2Usable;
  const combinedDead = deadStockVolume * 2;

  const convertBitumenToKg = (quantity: number, uom: string): number => {
    const u = uom.toLowerCase();
    if (u === 'mt' || u === 'ton' || u === 'tons' || u === 't') return quantity * 1000;
    if (u === 'kg') return quantity;
    if (u === 'liters' || u === 'litres' || u === 'l') return quantity * BITUMEN_DENSITY_KG_PER_LITER;
    if (u === 'barrels') return quantity * 159 * BITUMEN_DENSITY_KG_PER_LITER;
    return quantity * 1000;
  };

  const allTimeBitumenReceiptsMT = useMemo(() => {
    return bitumenReceipts.reduce((s, r) => s + convertBitumenToKg(r.quantity, r.uom), 0) / 1000;
  }, [bitumenReceipts]);

  const receiptsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of bitumenReceipts) {
      map[r.date] = (map[r.date] || 0) + convertBitumenToKg(r.quantity, r.uom);
    }
    return map;
  }, [bitumenReceipts]);

  const receiptsByDateTank = useMemo(() => {
    const map: Record<string, { tank1Kg: number; tank2Kg: number; unassignedKg: number }> = {};
    for (const r of bitumenReceipts) {
      if (!map[r.date]) map[r.date] = { tank1Kg: 0, tank2Kg: 0, unassignedKg: 0 };
      const kg = convertBitumenToKg(r.quantity, r.uom);
      if (r.tankNumber === 1) map[r.date].tank1Kg += kg;
      else if (r.tankNumber === 2) map[r.date].tank2Kg += kg;
      else map[r.date].unassignedKg += kg;
    }
    return map;
  }, [bitumenReceipts]);

  const dailySummary = useMemo(() => {
    if (!readings) return [];
    const grouped: Record<string, { date: string; entries: BitumenDipReading[] }> = {};
    for (const r of readings) {
      if (!grouped[r.date]) grouped[r.date] = { date: r.date, entries: [] };
      grouped[r.date].entries.push(r);
    }
    return Object.values(grouped)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map(day => {
        const t1Opening = day.entries.find(e => e.tankNumber === 1 && e.readingType === "opening");
        const t1Closing = day.entries.find(e => e.tankNumber === 1 && e.readingType === "closing");
        const t2Opening = day.entries.find(e => e.tankNumber === 2 && e.readingType === "opening");
        const t2Closing = day.entries.find(e => e.tankNumber === 2 && e.readingType === "closing");
        const t1Receipts = day.entries.filter(e => e.tankNumber === 1 && e.readingType === "receipt");
        const t2Receipts = day.entries.filter(e => e.tankNumber === 2 && e.readingType === "receipt");

        const t1ReceiptVol = t1Receipts.reduce((s, r) => s + r.volumeLiters, 0);
        const t2ReceiptVol = t2Receipts.reduce((s, r) => s + r.volumeLiters, 0);

        const materialReceiptKg = receiptsByDate[day.date] || 0;
        const tankReceipts = receiptsByDateTank[day.date] || { tank1Kg: 0, tank2Kg: 0, unassignedKg: 0 };

        let t1Consumption = null as number | null;
        let t2Consumption = null as number | null;

        if (t1Opening && t1Closing) {
          t1Consumption = t1Opening.volumeLiters - t1Closing.volumeLiters + t1ReceiptVol;
        }
        if (t2Opening && t2Closing) {
          t2Consumption = t2Opening.volumeLiters - t2Closing.volumeLiters + t2ReceiptVol;
        }

        const totalConsumptionL = (t1Consumption || 0) + (t2Consumption || 0);
        const totalConsumptionKg = Math.round(totalConsumptionL * BITUMEN_DENSITY_KG_PER_LITER);

        return {
          date: day.date,
          t1Opening, t1Closing, t2Opening, t2Closing,
          t1ReceiptVol, t2ReceiptVol,
          materialReceiptKg,
          tankReceipts,
          t1Consumption, t2Consumption,
          totalConsumption: totalConsumptionL,
          totalConsumptionKg,
        };
      });
  }, [readings, receiptsByDate, receiptsByDateTank]);

  const varianceData = useMemo(() => {
    if (!dispatches || !dailySummary.length) return [];
    const dispatchByDate: Record<string, { production: number; theoretical: number }> = {};
    for (const d of dispatches) {
      if (!dispatchByDate[d.date]) dispatchByDate[d.date] = { production: 0, theoretical: 0 };
      dispatchByDate[d.date].production += d.loadWeight || 0;
      dispatchByDate[d.date].theoretical += d.theoreticalBitumenQty || 0;
    }
    return dailySummary
      .filter(day => dispatchByDate[day.date] && day.totalConsumption > 0)
      .map(day => {
        const dd = dispatchByDate[day.date];
        const actualKg = day.totalConsumption * BITUMEN_DENSITY_KG_PER_LITER;
        const theoreticalKg = dd.theoretical;
        const varianceKg = actualKg - theoreticalKg;
        const variancePercent = theoreticalKg !== 0 ? (varianceKg / theoreticalKg) * 100 : 0;
        return {
          date: day.date,
          productionMT: dd.production,
          theoreticalKg,
          actualKg,
          varianceKg,
          variancePercent,
        };
      });
  }, [dispatches, dailySummary]);

  const deliveryLocations = useMemo(() => {
    if (!dispatches) return [];
    const locs = new Set<string>();
    for (const d of dispatches) {
      if (d.deliveryLocation) locs.add(d.deliveryLocation);
    }
    return Array.from(locs).sort();
  }, [dispatches]);

  const reconciliationData = useMemo(() => {
    if (!dispatches) return null;

    const filtered = dispatches.filter(d => {
      if (reconDateFrom && d.date < reconDateFrom) return false;
      if (reconDateTo && d.date > reconDateTo) return false;
      if (reconPartyId !== "all" && d.partyId !== parseInt(reconPartyId)) return false;
      if (reconMixTemplateId !== "all" && d.mixTemplateId !== parseInt(reconMixTemplateId)) return false;
      if (reconSite !== "all" && d.deliveryLocation !== reconSite) return false;
      return true;
    });

    const totalLoadMT = filtered.reduce((s, d) => s + (d.loadWeight || 0), 0);
    const totalTheoreticalMT = filtered.reduce((s, d) => s + (d.theoreticalBitumenQty || 0), 0);
    const totalActualMT = filtered.reduce((s, d) => {
      if (d.actualBitumenQty != null) return s + d.actualBitumenQty;
      if (d.actualBitumenPercent != null) return s + (d.loadWeight * d.actualBitumenPercent / 100);
      if (d.bitumenVariancePercent != null && d.theoreticalBitumenQty) {
        return s + d.theoreticalBitumenQty * (1 + d.bitumenVariancePercent / 100);
      }
      return s + (d.theoreticalBitumenQty || 0);
    }, 0);
    const bitumenSavedMT = totalTheoreticalMT - totalActualMT;
    const savingsPercent = totalTheoreticalMT > 0 ? (bitumenSavedMT / totalTheoreticalMT) * 100 : 0;

    const filteredReceipts = bitumenReceipts.filter(r => {
      if (reconDateFrom && r.date < reconDateFrom) return false;
      if (reconDateTo && r.date > reconDateTo) return false;
      return true;
    });
    const totalReceiptsKg = filteredReceipts.reduce((s, r) => s + convertBitumenToKg(r.quantity, r.uom), 0);
    const totalReceiptsMT = totalReceiptsKg / 1000;
    const tank1ReceiptsKg = filteredReceipts.filter(r => r.tankNumber === 1).reduce((s, r) => s + convertBitumenToKg(r.quantity, r.uom), 0);
    const tank2ReceiptsKg = filteredReceipts.filter(r => r.tankNumber === 2).reduce((s, r) => s + convertBitumenToKg(r.quantity, r.uom), 0);
    const tank1ReceiptsMT = tank1ReceiptsKg / 1000;
    const tank2ReceiptsMT = tank2ReceiptsKg / 1000;

    let latestDipReading: { tank1MT: number; tank1UsableMT: number; tank1Date?: string; tank1Time?: string; tank2MT: number; tank2UsableMT: number; tank2Date?: string; tank2Time?: string; totalMT: number; totalUsableMT: number; displayDate: string; displayTime?: string } | null = null;
    if (readings && readings.length > 0) {
      const sortByDateTime = (arr: typeof readings) => [...arr].sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        if (dc !== 0) return dc;
        return (b.time || "").localeCompare(a.time || "");
      });

      const tank1Readings = sortByDateTime(readings.filter(r => r.tankNumber === 1));
      const tank2Readings = sortByDateTime(readings.filter(r => r.tankNumber === 2));

      const findLatest = (sorted: typeof readings) => {
        if (sorted.length === 0) return null;
        if (reconDateTo) {
          const inRange = sorted.filter(r => r.date <= reconDateTo);
          return inRange.length > 0 ? inRange[0] : null;
        }
        return sorted[0];
      };

      const t1Latest = findLatest(tank1Readings);
      const t2Latest = findLatest(tank2Readings);

      if (t1Latest || t2Latest) {
        const t1MT = t1Latest ? (t1Latest.weightKg / 1000) : 0;
        const t2MT = t2Latest ? (t2Latest.weightKg / 1000) : 0;
        const t1UsableMT = t1Latest ? (getUsableVolume(t1Latest.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000) : 0;
        const t2UsableMT = t2Latest ? (getUsableVolume(t2Latest.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000) : 0;
        const displayDate = t1Latest && t2Latest
          ? (t1Latest.date > t2Latest.date ? t1Latest.date : t2Latest.date)
          : (t1Latest?.date || t2Latest?.date || "");
        latestDipReading = {
          tank1MT: t1MT,
          tank1UsableMT: t1UsableMT,
          tank1Date: t1Latest?.date,
          tank1Time: t1Latest?.time || undefined,
          tank2MT: t2MT,
          tank2UsableMT: t2UsableMT,
          tank2Date: t2Latest?.date,
          tank2Time: t2Latest?.time || undefined,
          totalMT: t1MT + t2MT,
          totalUsableMT: t1UsableMT + t2UsableMT,
          displayDate,
          displayTime: t1Latest?.time || t2Latest?.time || undefined,
        };
      }
    }

    return {
      dispatchCount: filtered.length,
      totalLoadMT,
      totalTheoreticalMT,
      totalActualMT,
      bitumenSavedMT,
      savingsPercent,
      totalReceiptsMT,
      tank1ReceiptsMT,
      tank2ReceiptsMT,
      latestDipReading,
    };
  }, [dispatches, readings, bitumenReceipts, reconDateFrom, reconDateTo, reconPartyId, reconMixTemplateId, reconSite]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/plant-module/bitumen-dip-readings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Dip reading recorded" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/plant-module/bitumen-dip-readings/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Dip reading updated" });
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
      await apiRequest("DELETE", `/api/plant-module/bitumen-dip-readings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Reading deleted" });
      setDeleteConfirmId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setTankNumber("1");
    setDepthCm("");
    setReadingType("adhoc");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setNotes("");
  }

  function handleTankClick(tankNum: number) {
    setEditingReading(null);
    setTankNumber(String(tankNum));
    setDepthCm("");
    setReadingType("adhoc");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setNotes("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    const depth = parseFloat(depthCm);
    if (!depth || depth < 0 || depth > 250) {
      toast({ title: "Invalid depth", description: "Enter depth between 0 and 250 cm", variant: "destructive" });
      return;
    }
    if ((readingType === "opening" || readingType === "closing") && !readingTime) {
      toast({ title: "Time required", description: "Please enter time for opening/closing readings", variant: "destructive" });
      return;
    }
    const vol = getVolumeAtDepth(depth);
    const wt = vol * BITUMEN_DENSITY_KG_PER_LITER;

    const payload = {
      date: readingDate,
      time: readingTime,
      tankNumber: parseInt(tankNumber),
      depthCm: depth,
      volumeLiters: Math.round(vol),
      weightKg: Math.round(wt),
      readingType,
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
        setDepthCm(String(reading.depthCm));
        setReadingType(reading.readingType);
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
      Tank: `Tank ${r.tankNumber}`,
      "Depth (cm)": r.depthCm,
      "Volume (L)": r.volumeLiters,
      "Weight (MT)": +(r.weightKg / 1000).toFixed(3),
      "Usable (MT)": +(getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3),
      Type: r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      Notes: r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bitumen Dip Readings");
    XLSX.writeFile(wb, `bitumen_dip_readings_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Bitumen Dip Readings - HLC Plant", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    const tableData = filteredReadings.map(r => [
      r.date, r.time || "", `Tank ${r.tankNumber}`, r.depthCm.toString(),
      r.volumeLiters.toFixed(3), (r.weightKg / 1000).toFixed(3),
      (getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Tank", "Depth(cm)", "Volume(L)", "Weight(MT)", "Usable(MT)", "Type", "Notes"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8 },
    });
    doc.save(`bitumen_dip_readings_${format(new Date(), "yyyyMMdd")}.pdf`);
  }

  function printData() {
    const printContent = `
      <html><head><title>Bitumen Dip Readings</title>
      <style>body{font-family:Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px 8px;text-align:left;font-size:12px}th{background:#f0f0f0}.header{margin-bottom:15px}</style></head>
      <body><div class="header"><h2>Bitumen Dip Readings - HLC Plant</h2><p>Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></div>
      <table><tr><th>Date</th><th>Time</th><th>Tank</th><th>Depth(cm)</th><th>Volume(L)</th><th>Weight(MT)</th><th>Usable(MT)</th><th>Type</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>Tank ${r.tankNumber}</td><td>${r.depthCm}</td><td>${r.volumeLiters.toFixed(3)}</td><td>${(r.weightKg / 1000).toFixed(3)}</td><td>${(getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)}</td><td>${r.readingType}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  }

  function TankIndicator({ label, reading, tankNum }: { label: string; reading: BitumenDipReading | null; tankNum: number }) {
    const depth = reading?.depthCm || 0;
    const vol = reading?.volumeLiters || 0;
    const usable = getUsableVolume(depth);
    const fill = Math.min(100, (depth / 250) * 100);

    return (
      <div
        className={pageRole ? "cursor-pointer hover-elevate" : ""}
        onClick={pageRole ? () => handleTankClick(tankNum) : undefined}
        data-testid={`tank-card-${tankNum}`}
      >
        <Card className="overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="relative w-16 h-32 rounded-md border-2 border-muted-foreground/30 overflow-hidden" data-testid={`tank-visual-${tankNum}`}>
                <div
                  className="absolute bottom-0 w-full bg-amber-800/70 dark:bg-amber-600/50 transition-all duration-500"
                  style={{ height: `${fill}%` }}
                />
                <div
                  className="absolute bottom-0 w-full border-t-2 border-dashed border-red-500/60"
                  style={{ height: `${deadStockPercent}%` }}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="mb-2">
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Usable Stock</span>
                  <div>
                    <span className="font-bold text-2xl text-green-700 dark:text-green-400">{(usable * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</span>
                    <span className="text-sm text-muted-foreground ml-1">({usable.toFixed(0)} L)</span>
                  </div>
                </div>
                <div className="flex justify-between gap-1 flex-wrap">
                  <span className="text-sm text-muted-foreground">Total Stock:</span>
                  <span>
                    <span className="font-semibold text-base">{(vol * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</span>
                    <span className="text-sm text-muted-foreground ml-1">({vol.toFixed(0)} L)</span>
                  </span>
                </div>
                <div className="flex justify-between gap-1 flex-wrap">
                  <span className="text-sm text-muted-foreground">Dip Depth:</span>
                  <span className="text-sm font-semibold">{depth} cm</span>
                </div>
                <div className="flex justify-between gap-1 flex-wrap">
                  <span className="text-sm text-muted-foreground">Dead Stock:</span>
                  <span className="text-sm text-red-500">{Math.round(deadStockVolume).toFixed(0)} L</span>
                </div>
                {reading && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Last: {reading.date} {reading.time || ""}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!pageRole) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={appendOrigin("/plant/dashboard?tab=stock")}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Droplets className="w-6 h-6 text-amber-700 dark:text-amber-500" />
          <h1 className="text-2xl font-bold flex-1">Bitumen Stock Tracker</h1>
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

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Droplets className="w-6 h-6 text-amber-700 dark:text-amber-500" />
        <h1 className="text-2xl font-bold flex-1">Bitumen Stock Tracker</h1>
      </div>

      <div className="text-sm text-muted-foreground">
        Tank: 250cm dia x 1060cm length | Capacity: {TANK_CAPACITY_LITERS.toFixed(3)} L | Dead stock at {DEFAULT_DEAD_STOCK_DEPTH} cm = ~{Math.round(deadStockVolume).toFixed(3)} L/tank | Bitumen: {BITUMEN_DENSITY_KG_PER_LITER} kg/L
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TankIndicator label="Tank 1" reading={latestTank1} tankNum={1} />
        <TankIndicator label="Tank 2" reading={latestTank2} tankNum={2} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Combined Stock (Both Tanks)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="mb-2">
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Total Usable Stock</span>
              <div>
                <span className="font-bold text-2xl text-green-700 dark:text-green-400">{(combinedUsable * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</span>
                <span className="text-sm text-muted-foreground ml-1">({combinedUsable.toFixed(0)} L)</span>
              </div>
            </div>
            <div className="flex justify-between gap-1 flex-wrap">
              <span className="text-sm text-muted-foreground">Total Stock:</span>
              <span>
                <span className="font-semibold text-base">{(combinedTotal * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</span>
                <span className="text-sm text-muted-foreground ml-1">({combinedTotal.toFixed(0)} L)</span>
              </span>
            </div>
            <div className="flex justify-between gap-1 flex-wrap">
              <span className="text-sm text-muted-foreground">Dead Stock (2 tanks):</span>
              <span className="text-sm text-red-500">{(combinedDead * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT ({Math.round(combinedDead).toFixed(0)} L)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Physical Stock Correction Card ── */}
      {isAdmin && bitumenMaterialId && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold">Book vs Physical Stock Correction</CardTitle>
              </div>
              {!showCorrForm && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!corrPartyId && bitumenPartyBalances.length > 0) {
                    setCorrPartyId(String(bitumenPartyBalances[0].partyId));
                  }
                  const t1MT = (tank1Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3);
                  const t2MT = (tank2Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3);
                  if (!corrTank1MT) setCorrTank1MT(t1MT);
                  if (!corrTank2MT) setCorrTank2MT(t2MT);
                  setShowCorrForm(true);
                }} data-testid="button-show-correction-form">
                  Post Correction
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-xs mb-1">Total Book Stock (All Parties)</div>
                <div className={`font-bold text-lg ${bitumenBookStockMT < 0 ? "text-red-600" : "text-foreground"}`}>
                  {bitumenBookStockMT.toFixed(3)} MT
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {bitumenPartyBalances.map(b => (
                    <div key={b.id} className="flex justify-between gap-2">
                      <span>{parties?.find(p => p.id === b.partyId)?.name ?? `Party ${b.partyId}`}:</span>
                      <span className={b.balance < 0 ? "text-red-500" : ""}>{b.balance.toFixed(3)} {b.uom}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <div className="text-muted-foreground text-xs mb-1">Physical Stock (Dip)</div>
                <div className="font-bold text-lg text-amber-700 dark:text-amber-400">
                  {latestTank1 || latestTank2 ? `${(combinedTotal * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT` : "No dip readings"}
                </div>
                <div className="text-xs text-muted-foreground">T1: {(tank1Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</div>
                <div className="text-xs text-muted-foreground">T2: {(tank2Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Difference (Physical − Book)</div>
                {(latestTank1 || latestTank2) ? (() => {
                  const physMT = combinedTotal * BITUMEN_DENSITY_KG_PER_LITER / 1000;
                  const diff = physMT - bitumenBookStockMT;
                  return (
                    <div className={`font-bold text-lg ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-foreground"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(3)} MT
                      <span className="text-xs font-normal ml-2 text-muted-foreground">
                        {diff > 0 ? "Surplus (bitumen savings)" : diff < 0 ? "Deficit — check receipts" : "Balanced"}
                      </span>
                    </div>
                  );
                })() : <div className="text-muted-foreground">—</div>}
                <div className="text-xs text-muted-foreground mt-1">Post a correction to align a party's book stock with actual physical measurement</div>
              </div>
            </div>

            {showCorrForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Post Physical Stock Correction</p>

                {/* Party selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Party to Correct</Label>
                    <Select value={corrPartyId} onValueChange={id => setCorrPartyId(id)}>
                      <SelectTrigger data-testid="select-corr-party">
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {parties?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {bitumenPartyBalances.find(b => b.partyId === p.id) !== undefined &&
                              ` (${(bitumenPartyBalances.find(b => b.partyId === p.id)?.balance ?? 0).toFixed(3)} MT)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {corrPartyId && selectedPartyBalance !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Current book stock: <span className={selectedPartyBalance < 0 ? "text-red-500 font-medium" : "font-medium"}>{selectedPartyBalance.toFixed(3)} MT</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">As on Date</Label>
                    <Input type="date" value={corrDate} onChange={e => setCorrDate(e.target.value)} data-testid="input-corr-date" />
                  </div>
                </div>

                {/* Per-tank inputs */}
                <div>
                  <Label className="text-xs mb-2 block">Physical Stock from Dip Readings (MT)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Tank 1</Label>
                      <Input
                        type="number" step="0.001" min="0"
                        value={corrTank1MT}
                        onChange={e => setCorrTank1MT(e.target.value)}
                        placeholder={(tank1Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)}
                        data-testid="input-corr-tank1-mt"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Dip: {(tank1Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Tank 2</Label>
                      <Input
                        type="number" step="0.001" min="0"
                        value={corrTank2MT}
                        onChange={e => setCorrTank2MT(e.target.value)}
                        placeholder={(tank2Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)}
                        data-testid="input-corr-tank2-mt"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Dip: {(tank2Volume * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)} MT</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground">Total Physical</div>
                      <div className="font-bold text-base">
                        {corrTank1MT || corrTank2MT
                          ? ((parseFloat(corrTank1MT) || 0) + (parseFloat(corrTank2MT) || 0)).toFixed(3)
                          : "—"} MT
                      </div>
                    </div>
                    {corrPartyId && selectedPartyBalance !== null && (corrTank1MT || corrTank2MT) && (
                      <div className={`rounded-lg p-2 text-center ${
                        ((parseFloat(corrTank1MT) || 0) + (parseFloat(corrTank2MT) || 0)) - selectedPartyBalance > 0
                          ? "bg-green-50 dark:bg-green-900/20"
                          : "bg-red-50 dark:bg-red-900/20"
                      }`}>
                        <div className="text-xs text-muted-foreground">Adjustment</div>
                        <div className={`font-bold text-base ${
                          ((parseFloat(corrTank1MT) || 0) + (parseFloat(corrTank2MT) || 0)) - selectedPartyBalance > 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-red-700 dark:text-red-400"
                        }`}>
                          {(() => {
                            const total = (parseFloat(corrTank1MT) || 0) + (parseFloat(corrTank2MT) || 0);
                            const adj = total - selectedPartyBalance;
                            return `${adj > 0 ? "+" : ""}${adj.toFixed(3)} MT`;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={corrNotes} onChange={e => setCorrNotes(e.target.value)} placeholder="e.g. Weekly dip reconciliation — T1: 6.5 MT, T2: 4.2 MT" data-testid="input-corr-notes" />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!corrPartyId || (!corrTank1MT && !corrTank2MT) || correctionMutation.isPending}
                    onClick={() => {
                      if (!bitumenMaterialId || !corrPartyId) return;
                      const t1 = parseFloat(corrTank1MT) || 0;
                      const t2 = parseFloat(corrTank2MT) || 0;
                      const total = t1 + t2;
                      const partyName = parties?.find(p => String(p.id) === corrPartyId)?.name || `Party ${corrPartyId}`;
                      correctionMutation.mutate({
                        materialId: bitumenMaterialId,
                        partyId: parseInt(corrPartyId),
                        physicalQty: total,
                        uom: "MT",
                        date: corrDate,
                        notes: corrNotes || `Bitumen dip reconciliation — T1: ${t1.toFixed(3)} MT, T2: ${t2.toFixed(3)} MT (${partyName})`,
                        correctedBy: "admin",
                      });
                    }}
                    data-testid="button-post-correction"
                  >
                    {correctionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Correction"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowCorrForm(false); setCorrTank1MT(""); setCorrTank2MT(""); setCorrNotes(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-base font-semibold">Bitumen Reconciliation</CardTitle>
          </div>
          <p className="text-base text-muted-foreground mt-1">
            Compare theoretical consumption (from mix templates) vs actual consumption (per dispatch variance) and physical stock (dip readings)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-base">From Date</Label>
              <Input type="date" value={reconDateFrom} onChange={e => setReconDateFrom(e.target.value)} className="w-40" data-testid="input-recon-date-from" />
            </div>
            <div>
              <Label className="text-base">To Date</Label>
              <Input type="date" value={reconDateTo} onChange={e => setReconDateTo(e.target.value)} className="w-40" data-testid="input-recon-date-to" />
            </div>
            <div>
              <Label className="text-base">Party</Label>
              <Select value={reconPartyId} onValueChange={setReconPartyId}>
                <SelectTrigger className="w-44" data-testid="select-recon-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-base">Mix Template</Label>
              <Select value={reconMixTemplateId} onValueChange={setReconMixTemplateId}>
                <SelectTrigger className="w-44" data-testid="select-recon-mix">
                  <SelectValue placeholder="All Mixes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Mixes</SelectItem>
                  {mixTemplates?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-base">Site / Location</Label>
              <Select value={reconSite} onValueChange={setReconSite}>
                <SelectTrigger className="w-44" data-testid="select-recon-site">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {deliveryLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(reconDateFrom || reconDateTo || reconPartyId !== "all" || reconMixTemplateId !== "all" || reconSite !== "all") && (
              <Button variant="outline" size="sm" onClick={() => { setReconDateFrom(""); setReconDateTo(""); setReconPartyId("all"); setReconMixTemplateId("all"); setReconSite("all"); }} data-testid="button-clear-recon-filters">
                Clear Filters
              </Button>
            )}
          </div>

          {reconciliationData && reconciliationData.dispatchCount > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Total Production
                      <span title="Total mix dispatched in the selected period" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className="text-2xl font-bold">{reconciliationData.totalLoadMT.toFixed(3)} MT</div>
                    <div className="text-base text-muted-foreground">{reconciliationData.dispatchCount} dispatches</div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Theoretical Bitumen
                      <span title="Bitumen that should have been consumed as per mix template design percentages" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className="text-2xl font-bold">{reconciliationData.totalTheoreticalMT.toFixed(3)} MT</div>
                    <div className="text-base text-muted-foreground">As per mix template</div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Actual Bitumen Used
                      <span title="Bitumen actually consumed as per the variance % entered during dispatch" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className="text-2xl font-bold">{reconciliationData.totalActualMT.toFixed(3)} MT</div>
                    <div className="text-base text-muted-foreground">As per dispatch variance</div>
                  </CardContent>
                </Card>

                <Card className={`${reconciliationData.bitumenSavedMT >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      {reconciliationData.bitumenSavedMT >= 0 ? "Bitumen Saved" : "Bitumen Excess"}
                      <span title="Difference between theoretical and actual. Positive = saved (used less than template), Negative = excess (used more than template)" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className={`text-2xl font-bold flex items-center gap-1 ${reconciliationData.bitumenSavedMT >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {reconciliationData.bitumenSavedMT >= 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                      {Math.abs(reconciliationData.bitumenSavedMT).toFixed(3)} MT
                    </div>
                    <div className="text-base text-muted-foreground">
                      {reconciliationData.savingsPercent >= 0 ? "Savings" : "Excess"}: {Math.abs(reconciliationData.savingsPercent).toFixed(1)}% of theoretical
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="bg-blue-50/50 dark:bg-blue-950/20">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Bitumen Received (Receipts)
                      <span title="Total bitumen received from material receipts" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    {(reconDateFrom || reconDateTo) ? (
                      <>
                        <div className="text-2xl font-bold">{reconciliationData.totalReceiptsMT.toFixed(3)} MT</div>
                        {(reconciliationData.tank1ReceiptsMT > 0 || reconciliationData.tank2ReceiptsMT > 0) && (
                          <div className="text-base text-muted-foreground">
                            T1: {reconciliationData.tank1ReceiptsMT.toFixed(3)} MT | T2: {reconciliationData.tank2ReceiptsMT.toFixed(3)} MT
                          </div>
                        )}
                        <div className="text-base text-muted-foreground">
                          {reconDateFrom || "start"} to {reconDateTo || "now"}
                        </div>
                        <div className="text-base text-muted-foreground border-t pt-1 mt-1">
                          All-time total: <span className="font-semibold text-foreground">{allTimeBitumenReceiptsMT.toFixed(3)} MT</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold">{allTimeBitumenReceiptsMT.toFixed(3)} MT</div>
                        {(reconciliationData.tank1ReceiptsMT > 0 || reconciliationData.tank2ReceiptsMT > 0) && (
                          <div className="text-base text-muted-foreground">
                            T1: {reconciliationData.tank1ReceiptsMT.toFixed(3)} MT | T2: {reconciliationData.tank2ReceiptsMT.toFixed(3)} MT
                          </div>
                        )}
                        <div className="text-base text-muted-foreground">All time</div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-amber-50/50 dark:bg-amber-950/20">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Physical Stock (Dip Reading)
                      <span title="Physical bitumen stock in tanks as measured by the latest dip reading per tank. Each tank's latest reading is found independently." className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    {reconciliationData.latestDipReading ? (
                      <>
                        <div className="text-2xl font-bold">{reconciliationData.latestDipReading.totalMT.toFixed(3)} MT</div>
                        <div className="text-base font-semibold text-foreground">
                          Usable: {reconciliationData.latestDipReading.totalUsableMT.toFixed(3)} MT
                        </div>
                        <div className="text-base text-muted-foreground mt-1">
                          T1: {reconciliationData.latestDipReading.tank1MT.toFixed(3)} MT (usable: {reconciliationData.latestDipReading.tank1UsableMT.toFixed(3)})
                          {reconciliationData.latestDipReading.tank1Date ? ` — ${reconciliationData.latestDipReading.tank1Date}` : ""}
                        </div>
                        <div className="text-base text-muted-foreground">
                          T2: {reconciliationData.latestDipReading.tank2MT.toFixed(3)} MT (usable: {reconciliationData.latestDipReading.tank2UsableMT.toFixed(3)})
                          {reconciliationData.latestDipReading.tank2Date ? ` — ${reconciliationData.latestDipReading.tank2Date}` : ""}
                        </div>
                      </>
                    ) : (
                      <div className="text-base text-muted-foreground">No dip readings available</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="text-base text-muted-foreground bg-muted/30 p-4 rounded-md space-y-1">
                <div className="font-semibold">How to read this:</div>
                <div><strong>Theoretical</strong> = What the mix template says should have been consumed (template bitumen % x load weight)</div>
                <div><strong>Actual</strong> = What was actually consumed based on the variance % entered during each dispatch</div>
                <div><strong>Saved/Excess</strong> = Theoretical minus Actual. Positive means less bitumen was used than the template requires (savings). Negative means more was used (excess).</div>
                <div><strong>Physical Stock</strong> = The actual quantity in tanks measured by dip readings. Use this as a periodic cross-check against calculated stock.</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-base">
              {reconciliationData?.dispatchCount === 0 ? "No dispatches found for selected filters" : "Loading dispatch data..."}
            </div>
          )}
        </CardContent>
      </Card>

      {dailySummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Consumption Summary (Last 10 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-left p-2 border border-border align-bottom">Date</th>
                    <th colSpan={4} className="text-center p-2 border border-border bg-blue-100 dark:bg-blue-900 font-semibold">Tank 1</th>
                    <th colSpan={4} className="text-center p-2 border border-border bg-amber-100 dark:bg-amber-900 font-semibold">Tank 2</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom">Mat. Rcpt (MT)</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom font-bold">Total Consumed (MT)</th>
                  </tr>
                  <tr>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50">Opening</th>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50">Closing</th>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50">Dip Rcpt</th>
                    <th className="text-right p-2 border border-border bg-blue-50 dark:bg-blue-900/50 font-semibold">Consumed</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50">Opening</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50">Closing</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50">Dip Rcpt</th>
                    <th className="text-right p-2 border border-border bg-amber-50 dark:bg-amber-900/50 font-semibold">Consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.map(day => (
                    <tr key={day.date} data-testid={`row-daily-${day.date}`}>
                      <td className="p-2 border border-border">{day.date}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Opening ? (day.t1Opening.volumeLiters * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Closing ? (day.t1Closing.volumeLiters * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1ReceiptVol ? (day.t1ReceiptVol * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30 font-medium">{day.t1Consumption !== null ? (day.t1Consumption * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Opening ? (day.t2Opening.volumeLiters * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Closing ? (day.t2Closing.volumeLiters * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2ReceiptVol ? (day.t2ReceiptVol * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30 font-medium">{day.t2Consumption !== null ? (day.t2Consumption * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border text-muted-foreground">{day.materialReceiptKg ? (day.materialReceiptKg / 1000).toFixed(3) : "-"}</td>
                      <td className="p-2 text-right border border-border font-bold">{day.totalConsumptionKg ? (day.totalConsumptionKg / 1000).toFixed(3) : "-"}</td>
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
            <CardTitle className="text-sm font-medium">Consumption Variance Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Production (MT)</th>
                    <th className="text-right p-2">Theoretical (MT)</th>
                    <th className="text-right p-2">Actual (MT)</th>
                    <th className="text-right p-2">Variance (MT)</th>
                    <th className="text-right p-2">Variance %</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.map(row => (
                    <tr key={row.date} className="border-b" data-testid={`row-variance-${row.date}`}>
                      <td className="p-2">{row.date}</td>
                      <td className="p-2 text-right">{row.productionMT.toFixed(3)}</td>
                      <td className="p-2 text-right">{(row.theoreticalKg / 1000).toFixed(3)}</td>
                      <td className="p-2 text-right">{(row.actualKg / 1000).toFixed(3)}</td>
                      <td className="p-2 text-right">{(row.varianceKg / 1000).toFixed(3)}</td>
                      <td className="p-2 text-right">{row.theoreticalKg !== 0 ? row.variancePercent.toFixed(1) : "-"}%</td>
                      <td className="p-2 text-center" data-testid={`text-variance-status-${row.date}`}>
                        {row.theoreticalKg === 0 ? (
                          <Badge variant="secondary" className="text-xs">OK</Badge>
                        ) : row.varianceKg < 0 ? (
                          <Badge className="text-xs bg-green-600 dark:bg-green-700">SAVING</Badge>
                        ) : row.varianceKg > 0 ? (
                          <Badge variant="destructive" className="text-xs">LOSS</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">OK</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {varianceData.length > 1 && (() => {
                    const totals = varianceData.reduce((acc, r) => ({
                      productionMT: acc.productionMT + r.productionMT,
                      theoreticalKg: acc.theoreticalKg + r.theoreticalKg,
                      actualKg: acc.actualKg + r.actualKg,
                      varianceKg: acc.varianceKg + r.varianceKg,
                    }), { productionMT: 0, theoreticalKg: 0, actualKg: 0, varianceKg: 0 });
                    const totalVariancePercent = totals.theoreticalKg !== 0 ? (totals.varianceKg / totals.theoreticalKg) * 100 : 0;
                    return (
                      <tr className="border-t-2 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{totals.productionMT.toFixed(3)}</td>
                        <td className="p-2 text-right">{(totals.theoreticalKg / 1000).toFixed(3)}</td>
                        <td className="p-2 text-right">{(totals.actualKg / 1000).toFixed(3)}</td>
                        <td className="p-2 text-right">{(totals.varianceKg / 1000).toFixed(3)}</td>
                        <td className="p-2 text-right">{totals.theoreticalKg !== 0 ? totalVariancePercent.toFixed(1) : "-"}%</td>
                        <td className="p-2 text-center">
                          {totals.theoreticalKg === 0 ? (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          ) : totals.varianceKg < 0 ? (
                            <Badge className="text-xs bg-green-600 dark:bg-green-700">SAVING</Badge>
                          ) : totals.varianceKg > 0 ? (
                            <Badge variant="destructive" className="text-xs">LOSS</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
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
            <CardTitle className="text-sm font-medium">All Dip Readings</CardTitle>
            {isAdmin && <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => handlePinAction("export-excel")} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePinAction("export-pdf")} data-testid="button-export-pdf">
                <Download className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePinAction("print")} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </div>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
            <Select value={filterTank} onValueChange={setFilterTank}>
              <SelectTrigger className="w-36" data-testid="select-filter-tank">
                <SelectValue placeholder="All Tanks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tanks</SelectItem>
                <SelectItem value="1">Tank 1</SelectItem>
                <SelectItem value="2">Tank 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filteredReadings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No dip readings recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Tank</th>
                    <th className="text-right p-2">Depth (cm)</th>
                    <th className="text-right p-2">Volume (L)</th>
                    <th className="text-right p-2">Weight (MT)</th>
                    <th className="text-right p-2">Usable (MT)</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Notes</th>
                    {isAdmin && <th className="text-center p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.map(r => (
                    <tr key={r.id} className="border-b" data-testid={`row-reading-${r.id}`}>
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.time || "-"}</td>
                      <td className="p-2"><Badge variant="outline">Tank {r.tankNumber}</Badge></td>
                      <td className="p-2 text-right font-medium">{r.depthCm}</td>
                      <td className="p-2 text-right">{r.volumeLiters.toFixed(3)}</td>
                      <td className="p-2 text-right">{(r.weightKg / 1000).toFixed(3)}</td>
                      <td className="p-2 text-right text-green-600 dark:text-green-400">{(getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)}</td>
                      <td className="p-2">
                        <Badge variant={r.readingType === "opening" ? "default" : r.readingType === "closing" ? "secondary" : r.readingType === "receipt" ? "outline" : "secondary"}>
                          {r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground text-sm">{r.notes || "-"}</td>
                      {isAdmin && <td className="p-2 text-center">
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
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" onClick={() => handlePinAction("edit", r.id)} data-testid={`button-edit-${r.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(r.id)} data-testid={`button-delete-${r.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingReading(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingReading ? "Edit Bitumen Dip Reading" : `Record Bitumen Dip Reading - Tank ${tankNumber}`}
            </DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tank</Label>
                <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium" data-testid="text-tank-number">
                  Tank {tankNumber}
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
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="adhoc">Ad-hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Dip Depth (cm) <span className="text-muted-foreground text-sm">- Enter bitumen depth reading from gauge rod</span></Label>
              <Input
                type="number"
                min="0"
                max="250"
                step="0.5"
                value={depthCm}
                onChange={e => setDepthCm(e.target.value)}
                placeholder="e.g. 125"
                data-testid="input-depth"
              />
            </div>

            {depthNum > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-24 rounded border-2 border-muted-foreground/30 overflow-hidden">
                      <div className="absolute bottom-0 w-full bg-amber-800/70 dark:bg-amber-600/50 transition-all" style={{ height: `${fillPercent}%` }} />
                      <div className="absolute bottom-0 w-full border-t-2 border-dashed border-red-500/60" style={{ height: `${deadStockPercent}%` }} />
                    </div>
                    <div className="flex-1 space-y-1 text-sm">
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-muted-foreground">Total:</span>
                        <span>
                          <span className="font-bold text-base">{(computedWeight / 1000).toFixed(3)} MT</span>
                          <span className="text-sm text-muted-foreground ml-1">({Math.round(computedVolume).toFixed(0)} L)</span>
                        </span>
                      </div>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-muted-foreground">Dead Stock:</span>
                        <span className="text-red-500 text-sm">{(deadStockWeight / 1000).toFixed(3)} MT ({Math.round(deadStockVolume).toFixed(0)} L)</span>
                      </div>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-muted-foreground">Usable:</span>
                        <span>
                          <span className="font-bold text-base text-green-600 dark:text-green-400">{(usableWeight / 1000).toFixed(3)} MT</span>
                          <span className="text-sm text-muted-foreground ml-1">({Math.round(usableVolume).toFixed(0)} L)</span>
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">Fill: {fillPercent.toFixed(1)}%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value.toUpperCase())} className="uppercase" placeholder="Any observations" data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isMutating || !depthCm} data-testid="button-submit-reading">
              {isMutating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingReading ? "Update Reading" : "Record Reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
