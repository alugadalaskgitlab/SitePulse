import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, ChevronDown, Loader2, Trash2, Download, Printer, Droplets, Pencil, Lock, Filter, BarChart3, TrendingDown, TrendingUp, Info, Scale, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { openPrintableHtmlOrPreview } from "@/lib/installedApp";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { NegativeBalanceBanner } from "@/components/NegativeBalanceBanner";
import { TankStockPositions } from "@/components/TankStockPositions";
import { TANK_STOCK_HEADERS, TANK_STOCK_NOTE, tankStockCells, tankStockExportRows, tankStockPrintTable, visibleTankStockRows } from "@shared/tankAssignment";
import { TankBookStock } from "@/components/TankBookStock";
import { TrackerConsumption } from "@/components/TrackerConsumption";
import { format, parseISO } from "date-fns";
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

type ReadingSource = "shift-log" | "heating-session" | "backfill" | "manual";

const SOURCE_LABELS: Record<ReadingSource, string> = {
  "shift-log": "Shift Log",
  "heating-session": "Heating",
  "backfill": "Backfill",
  "manual": "Manual",
};

function classifyReadingSource(r: { sourceShiftLogId?: number | null; sourceHeatingSessionId?: number | null; notes?: string | null }): ReadingSource {
  if (r.notes && r.notes.toUpperCase().startsWith("[BACKFILL")) return "backfill";
  if (r.sourceShiftLogId != null) return "shift-log";
  if (r.sourceHeatingSessionId != null) return "heating-session";
  return "manual";
}

export default function PlantBitumenStock() {
  const { toast } = useToast();
  const { sectionCan, featureCan, user } = useAuth();
  const canViewNormActual = sectionCan("plant_norm_vs_actual", "view");
  const { companyName, companyShortName, defaultPlantName, logoFile, ownCompanyPartyId, ownCompanyPartyName } = useFeatureFlags();
  const canCreate = featureCan("plant_receipts", "add");
  const canEdit = featureCan("plant_receipts", "edit");
  const canDelete = featureCan("hmp_rmc", "cancel");
  const canExport = featureCan("plant_receipts", "export");
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const searchString = useSearch();
  const sp = new URLSearchParams(searchString || window.location.search);
  const pageRole: "manager" | "admin" | null = user?.isOwner ? "admin" : "manager";
  const urlPlant = sp.get("plant") || defaultPlantName;
  const backLink = getPlantBackLink({ defaultTab: "stock", role: pageRole });
  const [, setLocation] = useLocation();

  const { data: plantsList } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      if (!res.ok) return [defaultPlantName];
      return res.json();
    },
  });

  const plantOptions = useMemo(() => {
    const list = plantsList && plantsList.length ? plantsList : [defaultPlantName];
    return list.includes(urlPlant) ? list : [...list, urlPlant];
  }, [plantsList, urlPlant, defaultPlantName]);

  const handlePlantChange = (newPlant: string) => {
    if (newPlant === urlPlant) return;
    const next = new URLSearchParams(searchString || window.location.search);
    next.set("plant", newPlant);
    setLocation(`/plant/bitumen-stock?${next.toString()}`);
  };
  const [dialogOpen, setDialogOpen] = useState(sp.get("dipEntry") === "1");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReading, setEditingReading] = useState<BitumenDipReading | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTank, setFilterTank] = useState("all");
  const [filterSource, setFilterSource] = useState<"all" | "hide-backfill" | ReadingSource>("all");

  const [reconDateFrom, setReconDateFrom] = useState("");
  const [reconDateTo, setReconDateTo] = useState("");
  const [reconPartyId, setReconPartyId] = useState("all");
  const [reconMixTemplateId, setReconMixTemplateId] = useState("all");
  const [reconSite, setReconSite] = useState("all");



  const [tankNumber, setTankNumber] = useState(sp.get("tank") === "2" ? "2" : "1");
  const [depthCm, setDepthCm] = useState("");
  const [readingType, setReadingType] = useState(sp.get("readingType") === "opening" ? "opening" : "adhoc");
  const [readingDate, setReadingDate] = useState(sp.get("dipDate") || format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const entry = new URLSearchParams(searchString || window.location.search);
    if (entry.get("dipEntry") !== "1") return;
    const tank = entry.get("tank"), type = entry.get("readingType"), date = entry.get("dipDate");
    ["dipEntry", "tank", "readingType", "dipDate"].forEach(key => entry.delete(key));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${entry.size ? `?${entry}` : ""}${window.location.hash}`);
    if (dialogOpen) return; // Never discard an already open editor.
    setEditingReading(null); setTankNumber(tank === "2" ? "2" : "1");
    setReadingType(type === "opening" ? "opening" : "adhoc");
    setReadingDate(date || format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm")); setDepthCm(""); setNotes(""); setDialogOpen(true);
  }, [searchString]);

  const { data: readings, isLoading } = useQuery<BitumenDipReading[]>({
    queryKey: ["/api/plant-module/bitumen-dip-readings", { plantName: urlPlant }],
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/bitumen-dip-readings?plantName=${encodeURIComponent(urlPlant)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
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
  const { data: packedStockPositions } = useQuery<{ rows?: Array<{
    materialId: number; materialName: string; partyId: number | null; partyName: string;
    stockUom: string; tank1Mt: number | null; tank2Mt: number | null; packedMt: number | null;
    packedCount: number; totalMt: number | null; tank1: number; tank2: number; unassigned: number; total: number;
  }>; canDecant?: boolean }>({ queryKey: ["/api/plant-module/packed-stock-positions"] });
  const bitumenPackedPositions = (packedStockPositions?.rows ?? []).filter(row => /bitumen/i.test(row.materialName));
  const [showAllTankPositions, setShowAllTankPositions] = useState(false);
  const visibleBitumenPositions = visibleTankStockRows(bitumenPackedPositions, showAllTankPositions);

  const bitumenPartyBalances = useMemo(() => {
    if (!stockBalances || !bitumenMaterialId) return [];
    return stockBalances.filter(b => b.materialId === bitumenMaterialId);
  }, [stockBalances, bitumenMaterialId]);

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
      if (filterSource !== "all") {
        const src = classifyReadingSource(r);
        if (filterSource === "hide-backfill") {
          if (src === "backfill") return false;
        } else if (src !== filterSource) {
          return false;
        }
      }
      return true;
    });
  }, [readings, filterDateFrom, filterDateTo, filterTank, filterSource]);

  const bitumenDipGroupedDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const r of filteredReadings) {
      if (!seen.has(r.date)) { seen.add(r.date); dates.push(r.date); }
    }
    return dates;
  }, [filteredReadings]);

  const BITUMEN_DIP_GROUPS_KEY = "open-date-groups:/plant/bitumen-stock";
  const [openBitumenDipGroups, setOpenBitumenDipGroups] = useState<Set<string>>(new Set());
  const bitumenDipGroupsInitRef = useRef(false);
  useEffect(() => {
    if (bitumenDipGroupsInitRef.current || bitumenDipGroupedDates.length === 0) return;
    bitumenDipGroupsInitRef.current = true;
    try {
      const stored = sessionStorage.getItem(BITUMEN_DIP_GROUPS_KEY);
      if (stored !== null) {
        const parsed: string[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(d => bitumenDipGroupedDates.includes(d));
          setOpenBitumenDipGroups(new Set(valid));
          return;
        }
      }
    } catch {
      // ignore malformed sessionStorage value
    }
    setOpenBitumenDipGroups(new Set([bitumenDipGroupedDates[0]]));
  }, [bitumenDipGroupedDates]);

  const toggleBitumenDipGroup = (date: string) => {
    setOpenBitumenDipGroups(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      try {
        sessionStorage.setItem(BITUMEN_DIP_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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
      // theoreticalBitumenQty is stored in MT; convert to Kg here so it
      // matches actualKg (derived from dip-volume × density) and the
      // display which divides both by 1000 to render as MT.
      dispatchByDate[d.date].theoretical += (d.theoreticalBitumenQty || 0) * 1000;
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

  async function bitumenDipFetch(method: string, url: string, data: any) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (res.status === 401 && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(body.message || "Request failed"), { status: res.status });
    }
    return body;
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => bitumenDipFetch("POST", "/api/plant-module/bitumen-dip-readings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Dip reading recorded" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        toast({ title: "Reading already exists", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      bitumenDipFetch("PATCH", `/api/plant-module/bitumen-dip-readings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Dip reading updated" });
      resetForm();
      setEditingReading(null);
      setDialogOpen(false);
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        toast({ title: "Reading already exists", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
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
      plantName: urlPlant,
    };

    if (editingReading) {
      updateMutation.mutate({ id: editingReading.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleEdit(readingId: number) {
    const reading = readings?.find(r => r.id === readingId);
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
  }

  function handleDelete(readingId: number) {
    deleteMutation.mutate(readingId);
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
      Source: SOURCE_LABELS[classifyReadingSource(r)],
      Notes: r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bitumen Dip Readings");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tankStockExportRows(visibleBitumenPositions)), "Stock Positions");
    XLSX.writeFile(wb, `bitumen_dip_readings_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  async function exportPdf() {
    let logoDataUrl: string | null = null;
    let logoAspect = 1.5;
    try {
      const resp = await fetch(`${window.location.origin}/${logoFile}`);
      if (resp.ok) {
        const blob = await resp.blob();
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        logoAspect = await new Promise<number>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
          img.onerror = () => resolve(1.5);
          img.src = logoDataUrl!;
        });
      }
    } catch {}

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    let curY = 8;
    const logoH = 12;
    const logoW = logoH * logoAspect;
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "JPEG", (pageWidth - logoW) / 2, curY, logoW, logoH);
      curY += logoH + 3;
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, pageWidth / 2, curY + 5, { align: "center" });
    curY += 9;
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.5);
    doc.line(14, curY, pageWidth - 14, curY);
    curY += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text(`Bitumen Dip Readings — ${urlPlant}`, 14, curY);
    curY += 7;
    doc.setFontSize(9);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, curY);
    curY += 6;

    const tableData = filteredReadings.map(r => [
      r.date, r.time || "", `Tank ${r.tankNumber}`, r.depthCm.toString(),
      r.volumeLiters.toFixed(3), (r.weightKg / 1000).toFixed(3),
      (getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      SOURCE_LABELS[classifyReadingSource(r)],
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Tank", "Depth(cm)", "Volume(L)", "Weight(MT)", "Usable(MT)", "Type", "Source", "Notes"]],
      body: tableData,
      startY: curY,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [180, 120, 30] },
      margin: { left: 14, right: 14 },
    });
    if (visibleBitumenPositions.length > 0) {
      doc.addPage();
      doc.text(TANK_STOCK_NOTE, 14, 15);
      autoTable(doc, {
        startY: 24,
        head: [TANK_STOCK_HEADERS],
        body: visibleBitumenPositions.map(tankStockCells),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [180, 120, 30] },
        margin: { left: 14, right: 14 },
      });
    }
    doc.save(`bitumen_dip_readings_${format(new Date(), "yyyyMMdd")}.pdf`);
  }

  function printData() {
    const printContent = `
      <html><head><title>Bitumen Dip Readings</title>
      <style>body{font-family:Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px 8px;text-align:left;font-size:12px}th{background:#f0f0f0}.header{margin-bottom:15px}</style></head>
      <body><div class="header"><h2>Bitumen Dip Readings - ${companyShortName} Plant</h2><p>Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></div>
      <table><tr><th>Date</th><th>Time</th><th>Tank</th><th>Depth(cm)</th><th>Volume(L)</th><th>Weight(MT)</th><th>Usable(MT)</th><th>Type</th><th>Source</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>Tank ${r.tankNumber}</td><td>${r.depthCm}</td><td>${r.volumeLiters.toFixed(3)}</td><td>${(r.weightKg / 1000).toFixed(3)}</td><td>${(getUsableVolume(r.depthCm) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3)}</td><td>${r.readingType}</td><td>${SOURCE_LABELS[classifyReadingSource(r)]}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table>
      ${tankStockPrintTable(visibleBitumenPositions)}
      </body></html>`;
    openPrintableHtmlOrPreview(printContent, "Bitumen dip readings", `bitumen-dip-readings-${format(new Date(), "yyyyMMdd")}.html`);
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
          <h1 className="text-2xl font-bold flex-1">
            Bitumen Stock Tracker — {urlPlant}
          </h1>
        </div>
        <Card className="py-12">
          <CardContent className="text-center">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access restricted</h3>
            <p className="text-muted-foreground mb-4">Please access this page through the HMP Plant hub</p>
            <Link href="/plant/hub">
              <Button data-testid="button-go-to-plant">Go to HMP Plant</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
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
        <h1 className="text-2xl font-bold flex-1" data-testid="text-page-title">
          Bitumen Stock Tracker — <span data-testid="text-active-plant">{urlPlant}</span>
        </h1>
        <TankBookStock kind="bitumen" plantName={urlPlant} defaultPlantName={defaultPlantName} settingsOnly />
        {plantOptions.length > 1 && (
          <select
            value={urlPlant}
            onChange={e => handlePlantChange(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
            data-testid="select-plant"
            aria-label="Switch plant"
          >
            {plantOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Tank: 250cm dia x 1060cm length | Capacity: {TANK_CAPACITY_LITERS.toFixed(3)} L | Dead stock at {DEFAULT_DEAD_STOCK_DEPTH} cm = ~{Math.round(deadStockVolume).toFixed(3)} L/tank | Bitumen: {BITUMEN_DENSITY_KG_PER_LITER} kg/L
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="bitumen-tanks">
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

      <Card data-testid="bitumen-ledger-stock-positions">
        <CardHeader className="pb-2"><CardTitle className="text-base">Whose bitumen</CardTitle></CardHeader>
        <CardContent><TankStockPositions rows={bitumenPackedPositions} owner={false} showAll={showAllTankPositions} onShowAllChange={setShowAllTankPositions} /></CardContent>
      </Card>
      <NegativeBalanceBanner balances={bitumenPartyBalances} parties={parties} material="Bitumen" testid="banner-negative-bitumen" />
      <TrackerConsumption kind="bitumen" days={dailySummary.map(day => ({
        date: day.date,
        actual: day.t1Consumption == null && day.t2Consumption == null ? null : day.totalConsumption * BITUMEN_DENSITY_KG_PER_LITER / 1000,
      }))} dispatches={dispatches} parties={parties} canViewNormActual={canViewNormActual} canExport={canExport} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">Dip readings</CardTitle>
            {canExport && <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={exportExcel} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf} data-testid="button-export-pdf">
                <Download className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={printData} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </div>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
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
            <Select value={filterSource} onValueChange={v => setFilterSource(v as typeof filterSource)}>
              <SelectTrigger className="w-48" data-testid="select-filter-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="hide-backfill">Hide Backfill rows</SelectItem>
                <SelectItem value="shift-log">Only Shift Log</SelectItem>
                <SelectItem value="heating-session">Only Heating</SelectItem>
                <SelectItem value="manual">Only Manual</SelectItem>
                <SelectItem value="backfill">Only Backfill</SelectItem>
              </SelectContent>
            </Select>
            {(filterDateFrom || filterDateTo || filterTank !== "all" || filterSource !== "all") && (
              <button
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterTank("all"); setFilterSource("all"); }}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5" /> Reset filters
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filteredReadings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No dip readings recorded yet</div>
          ) : (
            <div className="space-y-1">
              {bitumenDipGroupedDates.map(date => {
                const isOpen = openBitumenDipGroups.has(date);
                const dateReadings = filteredReadings.filter(r => r.date === date);
                return (
                  <div key={date}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-2 flex-wrap border-b py-2 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleBitumenDipGroup(date)}
                      data-testid={`button-toggle-date-${date}`}
                    >
                      <ChevronDown
                        className="w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform duration-200"
                        style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                      <h3 className="font-semibold">{format(parseISO(date), "EEEE, dd MMM yyyy")}</h3>
                      <Badge variant="secondary" className="text-sm no-default-hover-elevate no-default-active-elevate">
                        {dateReadings.length} reading{dateReadings.length !== 1 ? "s" : ""}
                      </Badge>
                    </button>
                    {isOpen && (
                      <div className="overflow-x-auto pt-1 pb-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Time</th>
                              <th className="text-left p-2">Tank</th>
                              <th className="text-right p-2">Depth (cm)</th>
                              <th className="text-right p-2">Volume (L)</th>
                              <th className="text-right p-2">Weight (MT)</th>
                              <th className="text-right p-2">Usable (MT)</th>
                              <th className="text-left p-2">Type</th>
                              <th className="text-left p-2">Source</th>
                              <th className="text-left p-2">Notes</th>
                                {canDelete && <th className="text-center p-2">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {dateReadings.map(r => {
                    const src = classifyReadingSource(r);
                    const srcClass =
                      src === "backfill"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                        : src === "shift-log"
                          ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
                          : src === "heating-session"
                            ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200"
                            : "";
                    return (
                    <tr key={r.id} className="border-b" data-testid={`row-reading-${r.id}`}>
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
                      <td className="p-2">
                        <Badge
                          variant={src === "manual" ? "outline" : "secondary"}
                          className={srcClass}
                          data-testid={`badge-source-${r.id}`}
                          title={
                            src === "backfill"
                              ? "Entered via the admin Bitumen Backfill tool"
                              : src === "shift-log"
                                ? "Auto-created from a plant shift log"
                                : src === "heating-session"
                                  ? "Auto-created from a bitumen heating session"
                                  : "Manually entered on this page"
                          }
                        >
                          {SOURCE_LABELS[src]}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground text-sm">{r.notes || "-"}</td>
                              {canDelete && <td className="p-2 text-center">
                        {deleteConfirmId === r.id ? (
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)} data-testid={`button-confirm-delete-${r.id}`}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            {canEdit && (
                              <Button size="icon" variant="ghost" onClick={() => handleEdit(r.id)} data-testid={`button-edit-${r.id}`}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(r.id)} data-testid={`button-delete-${r.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>}
                    </tr>
                    );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <Label>Reading type</Label>
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
              <Label>Dip depth (cm) <span className="text-muted-foreground text-sm">- Enter bitumen depth reading from gauge rod</span></Label>
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
