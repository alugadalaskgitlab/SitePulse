import { useState, useMemo } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
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
import { ChevronLeft, Loader2, Trash2, Download, Printer, Gauge, Pencil, Lock, Ruler, BarChart3, TrendingDown, TrendingUp, Info, Scale, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { NegativeBalanceBanner } from "@/components/NegativeBalanceBanner";
import { format } from "date-fns";
import type { LdoFlowReading, LdoDipReading, TruckDispatch, Party, MixTemplate } from "@shared/schema";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { getLdoVolumeAtDepth, getLdoMaxDepth, getLdoDeadStockDepth, getLdoDeadStockVolume, getLdoUsableVolume } from "@shared/ldo-dip-chart";
import { computeTankStock } from "@/lib/ldoStock";
import { LdoUsableStockStrip } from "@/components/LdoUsableStockStrip";

const TANK_LABELS: Record<number, string> = { 1: "Boiler Meter", 2: "Dryer Meter" };

type ReadingSource = "shift-log" | "heating-session" | "backfill" | "manual";

const SOURCE_LABELS: Record<ReadingSource, string> = {
  "shift-log": "Shift Log",
  "heating-session": "Heating",
  "backfill": "Backfill",
  "manual": "Manual",
};

function classifyReadingSource(r: { sourceShiftLogId?: number | null; sourceHeatingSessionId?: number | null; notes?: string | null }): ReadingSource {
  // Task #239: the "[BACKFILL ...]" notes prefix is the source of truth, so
  // it wins over source IDs. In normal operation backfill rows never have a
  // source ID (the backfill upsert skips owned rows), but if both ever
  // co-exist we still want the row to read as "Backfill" to match the spec.
  if (r.notes && r.notes.toUpperCase().startsWith("[BACKFILL")) return "backfill";
  if (r.sourceShiftLogId != null) return "shift-log";
  if (r.sourceHeatingSessionId != null) return "heating-session";
  return "manual";
}

export default function PlantLdoFlowMeter() {
  const { toast } = useToast();
  const { sectionCan, isAdmin: isAdminUser } = useAuth();
  const canCreate = sectionCan("plant_stock", "create");
  const canEdit = sectionCan("plant_stock", "edit");
  const canDelete = isAdminUser;
  const canExport = sectionCan("plant_stock", "view_reports");
  const { appendOrigin, getPlantBackLink } = useOrigin();
  const searchString = useSearch();
  const sp = new URLSearchParams(searchString || window.location.search);
  const urlRole = sp.get("role");
  const pageRole: "manager" | "admin" | null = (urlRole === "manager" || urlRole === "admin") ? urlRole : null;
  const isAdmin = pageRole === "admin";
  const urlPlant = sp.get("plant") || "Main Plant";
  const backLink = getPlantBackLink({ defaultTab: "stock", role: pageRole });
  const [, setLocation] = useLocation();

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
    return list.includes(urlPlant) ? list : [...list, urlPlant];
  }, [plantsList, urlPlant]);

  const handlePlantChange = (newPlant: string) => {
    if (newPlant === urlPlant) return;
    const next = new URLSearchParams(searchString || window.location.search);
    next.set("plant", newPlant);
    setLocation(`/plant/ldo-flow-meter?${next.toString()}`);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReading, setEditingReading] = useState<LdoFlowReading | null>(null);

  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_LDO_FILTER_URL_KEYS = [
    "filterDateFrom", "filterDateTo", "filterTank", "filterSource",
    "reconDateFrom", "reconDateTo", "reconPartyId", "reconMixTemplateId", "reconSite",
    "dipFilterSource",
  ];
  const urlHasLdoFilterParams = (() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return PLANT_LDO_FILTER_URL_KEYS.some((k) => sp.has(k));
  })();
  const [persistedFilters, setPersistedFilters, resetPersistedFilters] = usePersistedFilters(
    "plant-ldo-flow-meter:last-filters:v2",
    {
      filterDateFrom: "",
      filterDateTo: "",
      filterTank: "all",
      filterSource: "all" as "all" | "hide-backfill" | ReadingSource,
      dipFilterSource: "all" as "all" | "hide-backfill" | ReadingSource,
      reconDateFrom: "",
      reconDateTo: "",
      reconPartyId: "all",
      reconMixTemplateId: "all",
      reconSite: "all",
    },
    { shouldHydrate: !urlHasLdoFilterParams },
  );
  const { filterDateFrom, filterDateTo, filterTank, filterSource, dipFilterSource, reconDateFrom, reconDateTo, reconPartyId, reconMixTemplateId, reconSite } = persistedFilters;
  const setFilterDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateFrom: v }));
  const setFilterDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateTo: v }));
  const setFilterTank = (v: string) => setPersistedFilters((f) => ({ ...f, filterTank: v }));
  const setFilterSource = (v: string) => setPersistedFilters((f) => ({ ...f, filterSource: v as typeof persistedFilters.filterSource }));
  const setDipFilterSource = (v: string) => setPersistedFilters((f) => ({ ...f, dipFilterSource: v as typeof persistedFilters.dipFilterSource }));
  const setReconDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, reconDateFrom: v }));
  const setReconDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, reconDateTo: v }));
  const setReconPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, reconPartyId: v }));
  const setReconMixTemplateId = (v: string) => setPersistedFilters((f) => ({ ...f, reconMixTemplateId: v }));
  const setReconSite = (v: string) => setPersistedFilters((f) => ({ ...f, reconSite: v }));

  const [ldoCorrTank1L, setLdoCorrTank1L] = useState("");
  const [ldoCorrTank2L, setLdoCorrTank2L] = useState("");
  const [ldoCorrPartyId, setLdoCorrPartyId] = useState<string>("");
  const [ldoCorrDate, setLdoCorrDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [ldoCorrNotes, setLdoCorrNotes] = useState("");
  const [showLdoCorrForm, setShowLdoCorrForm] = useState(false);

  const [tankNumber, setTankNumber] = useState("1");
  const [meterReading, setMeterReading] = useState("");
  const [readingType, setReadingType] = useState("opening");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [quantityLiters, setQuantityLiters] = useState("");
  const [notes, setNotes] = useState("");
  const [dryerFedFrom, setDryerFedFrom] = useState("TANK_2");

  const [dipDialogOpen, setDipDialogOpen] = useState(false);
  const [dipEditingReading, setDipEditingReading] = useState<LdoDipReading | null>(null);
  const [dipDeleteConfirmId, setDipDeleteConfirmId] = useState<number | null>(null);
  const [dipTankNumber, setDipTankNumber] = useState("1");
  const [dipDate, setDipDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dipTime, setDipTime] = useState(format(new Date(), "HH:mm"));
  const [dipReadingType, setDipReadingType] = useState("opening");
  const [dipDepthCm, setDipDepthCm] = useState("");
  const [dipNotes, setDipNotes] = useState("");

  const { data: readings, isLoading } = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings", { plantName: urlPlant }],
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/ldo-flow-readings?plantName=${encodeURIComponent(urlPlant)}`,
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

  const ldoMaterialId = useMemo(() => {
    if (!materials) return null;
    const m = materials.find(m => m.name.toUpperCase() === 'LDO');
    return m?.id ?? null;
  }, [materials]);

  const { data: stockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
  });

  const balanceToL = (balance: number, uom: string) => {
    const u = (uom || "").toUpperCase();
    if (u === "MT" || u === "TON" || u === "TONS") return balance * 1000 / LDO_DENSITY_KG_PER_LITER;
    if (u === "KG") return balance / LDO_DENSITY_KG_PER_LITER;
    return balance; // Liters
  };

  const ldoPartyBalances = useMemo(() => {
    if (!stockBalances || !ldoMaterialId) return [];
    return stockBalances.filter(b => b.materialId === ldoMaterialId);
  }, [stockBalances, ldoMaterialId]);

  const ldoBookStockL = useMemo(() => {
    return ldoPartyBalances.reduce((s, b) => s + balanceToL(b.balance, b.uom), 0);
  }, [ldoPartyBalances]);

  const ldoSelectedPartyBalanceL = useMemo(() => {
    if (!ldoCorrPartyId) return null;
    const b = ldoPartyBalances.find(b => String(b.partyId) === ldoCorrPartyId);
    return b ? balanceToL(b.balance, b.uom) : 0;
  }, [ldoPartyBalances, ldoCorrPartyId]);

  const ldoCorrectionMutation = useMutation({
    mutationFn: async (data: { materialId: number; partyId: number; physicalQty: number; uom: string; date: string; notes: string; correctedBy: string }) => {
      const res = await apiRequest("POST", "/api/plant-module/stock-correction", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      const adjL = (result.adjustment || 0) * 1000 / LDO_DENSITY_KG_PER_LITER;
      const sign = adjL >= 0 ? "+" : "";
      const newL = (result.newBalance || 0) * 1000 / LDO_DENSITY_KG_PER_LITER;
      toast({ title: "LDO stock correction posted", description: `Adjustment: ${sign}${adjL.toFixed(0)} L. Book stock now ${newL.toFixed(0)} L.` });
      setShowLdoCorrForm(false);
      setLdoCorrTank1L("");
      setLdoCorrTank2L("");
      setLdoCorrNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: allReceipts } = useQuery<{ id: number; date: string; materialId: number; quantity: number; uom: string; tankNumber?: number | null }[]>({
    queryKey: ["/api/plant-module/material-receipts"],
  });

  const ldoReceipts = useMemo(() => {
    if (!allReceipts || !ldoMaterialId) return [];
    return allReceipts.filter(r => r.materialId === ldoMaterialId);
  }, [allReceipts, ldoMaterialId]);

  const convertLdoToL = (quantity: number, uom: string): number => {
    const u = uom.toLowerCase();
    if (u === 'liters' || u === 'litres' || u === 'l') return quantity;
    if (u === 'kg') return quantity / LDO_DENSITY_KG_PER_LITER;
    if (u === 'mt' || u === 'ton' || u === 'tons' || u === 't') return (quantity * 1000) / LDO_DENSITY_KG_PER_LITER;
    return quantity;
  };

  const allTimeLdoReceiptsL = useMemo(() => {
    return ldoReceipts.reduce((s, r) => s + convertLdoToL(r.quantity, r.uom), 0);
  }, [ldoReceipts]);

  const ldoReceiptsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of ldoReceipts) {
      const qtyL = convertLdoToL(r.quantity, r.uom);
      map[r.date] = (map[r.date] || 0) + qtyL;
    }
    return map;
  }, [ldoReceipts]);

  const ldoReceiptsByDateTank = useMemo(() => {
    const map: Record<string, { tank1L: number; tank2L: number; unassignedL: number }> = {};
    for (const r of ldoReceipts) {
      if (!map[r.date]) map[r.date] = { tank1L: 0, tank2L: 0, unassignedL: 0 };
      const qtyL = convertLdoToL(r.quantity, r.uom);
      if (r.tankNumber === 1) map[r.date].tank1L += qtyL;
      else if (r.tankNumber === 2) map[r.date].tank2L += qtyL;
      else map[r.date].unassignedL += qtyL;
    }
    return map;
  }, [ldoReceipts]);

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
        // Per-meter daily report: this section is intentionally still
        // grouped by physical meter (tank 1 = boiler-meter, tank 2 =
        // dryer-meter). The per-meter consumption numbers feed the
        // boilerLPerMT / dryerLPerMT efficiency calculations and must
        // stay tied to the meter that recorded them. The dryer-source
        // re-routing is applied at the *stock balance* level only — see
        // `tankStock` and `computeTankStock`.
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

  // Per-tank stock balances. Dryer-meter rows tagged with
  // dryerFedFrom="TANK_1" debit Tank-1 instead of Tank-2.
  const tankStock = useMemo(() => {
    return {
      tank1: computeTankStock(readings, 1),
      tank2: computeTankStock(readings, 2),
    };
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

  const { data: dipReadings, isLoading: dipLoading } = useQuery<LdoDipReading[]>({
    queryKey: ["/api/plant-module/ldo-dip-readings"],
  });

  const deliveryLocations = useMemo(() => {
    if (!dispatches) return [];
    const locs = new Set(dispatches.map(d => d.deliveryLocation).filter(Boolean));
    return [...locs].sort();
  }, [dispatches]);

  const reconciliationData = useMemo(() => {
    if (!dispatches) return null;

    let filtered = [...dispatches];
    if (reconDateFrom) filtered = filtered.filter(d => d.date >= reconDateFrom);
    if (reconDateTo) filtered = filtered.filter(d => d.date <= reconDateTo);
    if (reconPartyId !== "all") filtered = filtered.filter(d => String(d.partyId) === reconPartyId);
    if (reconMixTemplateId !== "all") filtered = filtered.filter(d => String(d.mixTemplateId) === reconMixTemplateId);
    if (reconSite !== "all") filtered = filtered.filter(d => d.deliveryLocation === reconSite);

    const dispatchCount = filtered.length;
    const totalLoadMT = filtered.reduce((s, d) => s + (d.loadWeight || 0), 0);
    const totalTheoreticalL = filtered.reduce((s, d) => s + (d.theoreticalLdoQty || 0), 0);

    let totalActualL = 0;
    for (const d of filtered) {
      if (d.actualLdoQty != null) {
        totalActualL += d.actualLdoQty;
      } else if (d.ldoVariancePercent != null && d.theoreticalLdoQty) {
        totalActualL += d.theoreticalLdoQty * (1 + d.ldoVariancePercent / 100);
      } else {
        totalActualL += d.theoreticalLdoQty || 0;
      }
    }

    const ldoSavedL = totalTheoreticalL - totalActualL;
    const savingsPercent = totalTheoreticalL > 0 ? (ldoSavedL / totalTheoreticalL) * 100 : 0;

    let totalReceiptsL = 0;
    let tank1ReceiptsL = 0;
    let tank2ReceiptsL = 0;
    for (const r of ldoReceipts) {
      const qtyL = convertLdoToL(r.quantity, r.uom);
      if (reconDateFrom && r.date < reconDateFrom) continue;
      if (reconDateTo && r.date > reconDateTo) continue;
      totalReceiptsL += qtyL;
      if (r.tankNumber === 1) tank1ReceiptsL += qtyL;
      else if (r.tankNumber === 2) tank2ReceiptsL += qtyL;
    }

    let latestDipReading: {
      totalL: number; totalUsableL: number;
      totalMT: number; totalUsableMT: number;
      tank1L: number; tank1UsableL: number; tank1MT: number; tank1UsableMT: number; tank1Date: string;
      tank2L: number; tank2UsableL: number; tank2MT: number; tank2UsableMT: number; tank2Date: string;
    } | null = null;

    if (dipReadings && dipReadings.length > 0) {
      const getLatest = (tankNum: number) => {
        let candidates = dipReadings.filter(r => r.tankNumber === tankNum);
        if (reconDateTo) candidates = candidates.filter(r => r.date <= reconDateTo);
        if (candidates.length === 0) return null;
        return candidates.sort((a, b) => {
          const dc = b.date.localeCompare(a.date);
          return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
        })[0];
      };

      const t1 = getLatest(1);
      const t2 = getLatest(2);

      if (t1 || t2) {
        const t1Vol = t1 ? t1.volumeLiters : 0;
        const t1Usable = t1 ? getLdoUsableVolume(1, t1.depthCm) : 0;
        const t2Vol = t2 ? t2.volumeLiters : 0;
        const t2Usable = t2 ? getLdoUsableVolume(2, t2.depthCm) : 0;

        latestDipReading = {
          totalL: t1Vol + t2Vol,
          totalUsableL: t1Usable + t2Usable,
          totalMT: (t1Vol + t2Vol) * LDO_DENSITY_KG_PER_LITER / 1000,
          totalUsableMT: (t1Usable + t2Usable) * LDO_DENSITY_KG_PER_LITER / 1000,
          tank1L: t1Vol, tank1UsableL: t1Usable,
          tank1MT: t1Vol * LDO_DENSITY_KG_PER_LITER / 1000,
          tank1UsableMT: t1Usable * LDO_DENSITY_KG_PER_LITER / 1000,
          tank1Date: t1?.date || "",
          tank2L: t2Vol, tank2UsableL: t2Usable,
          tank2MT: t2Vol * LDO_DENSITY_KG_PER_LITER / 1000,
          tank2UsableMT: t2Usable * LDO_DENSITY_KG_PER_LITER / 1000,
          tank2Date: t2?.date || "",
        };
      }
    }

    return { dispatchCount, totalLoadMT, totalTheoreticalL, totalActualL, ldoSavedL, savingsPercent, totalReceiptsL, tank1ReceiptsL, tank2ReceiptsL, latestDipReading };
  }, [dispatches, reconDateFrom, reconDateTo, reconPartyId, reconMixTemplateId, reconSite, ldoReceipts, dipReadings]);

  const dipDailySummary = useMemo(() => {
    if (!dipReadings || dipReadings.length === 0) return [];

    const grouped: Record<string, LdoDipReading[]> = {};
    for (const r of dipReadings) {
      if (!grouped[r.date]) grouped[r.date] = [];
      grouped[r.date].push(r);
    }

    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a)).slice(0, 10);

    return dates.map(date => {
      const entries = grouped[date];
      const t1Entries = entries.filter(e => e.tankNumber === 1);
      const t2Entries = entries.filter(e => e.tankNumber === 2);

      const getOpenClose = (tankEntries: LdoDipReading[]) => {
        const openings = tankEntries.filter(e => e.readingType === "opening").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        const closings = tankEntries.filter(e => e.readingType === "closing").sort((a, b) => (b.time || "").localeCompare(a.time || ""));
        return { opening: openings[0] || null, closing: closings[0] || null };
      };

      const t1 = getOpenClose(t1Entries);
      const t2 = getOpenClose(t2Entries);

      const t1OpenVol = t1.opening ? t1.opening.volumeLiters : null;
      const t1CloseVol = t1.closing ? t1.closing.volumeLiters : null;
      const t2OpenVol = t2.opening ? t2.opening.volumeLiters : null;
      const t2CloseVol = t2.closing ? t2.closing.volumeLiters : null;

      const receiptEntries1 = t1Entries.filter(e => e.readingType === "receipt");
      const receiptEntries2 = t2Entries.filter(e => e.readingType === "receipt");
      const t1ReceiptVol = receiptEntries1.reduce((s, e) => s + (e.volumeLiters || 0), 0);
      const t2ReceiptVol = receiptEntries2.reduce((s, e) => s + (e.volumeLiters || 0), 0);

      let t1Consumption: number | null = null;
      if (t1OpenVol !== null && t1CloseVol !== null) {
        t1Consumption = t1OpenVol - t1CloseVol + t1ReceiptVol;
      }

      let t2Consumption: number | null = null;
      if (t2OpenVol !== null && t2CloseVol !== null) {
        t2Consumption = t2OpenVol - t2CloseVol + t2ReceiptVol;
      }

      const materialReceiptL = ldoReceiptsByDate[date] || 0;
      const totalConsumed = (t1Consumption || 0) + (t2Consumption || 0);

      return {
        date,
        t1Opening: t1.opening, t1Closing: t1.closing,
        t1ReceiptVol: t1ReceiptVol || null,
        t1Consumption,
        t2Opening: t2.opening, t2Closing: t2.closing,
        t2ReceiptVol: t2ReceiptVol || null,
        t2Consumption,
        materialReceiptL: materialReceiptL || null,
        totalConsumed: totalConsumed || null,
      };
    });
  }, [dipReadings, ldoReceiptsByDate]);

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

  const sortedDipReadings = useMemo(() => {
    if (!dipReadings) return [];
    return [...dipReadings].sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
    });
  }, [dipReadings]);

  const filteredDipReadings = useMemo(() => {
    if (dipFilterSource === "all") return sortedDipReadings;
    return sortedDipReadings.filter(r => {
      const src = classifyReadingSource(r);
      if (dipFilterSource === "hide-backfill") return src !== "backfill";
      return src === dipFilterSource;
    });
  }, [sortedDipReadings, dipFilterSource]);

  const dipCreateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/plant-module/ldo-dip-readings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      toast({ title: "LDO dip reading recorded" });
      resetDipForm();
      setDipDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const dipUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/plant-module/ldo-dip-readings/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      toast({ title: "LDO dip reading updated" });
      resetDipForm();
      setDipEditingReading(null);
      setDipDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const dipDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/plant-module/ldo-dip-readings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      toast({ title: "Dip reading deleted" });
      setDipDeleteConfirmId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const dipCalculatedVolume = useMemo(() => {
    const depth = parseFloat(dipDepthCm);
    if (isNaN(depth) || depth <= 0) return null;
    const tankNum = parseInt(dipTankNumber);
    const volume = getLdoVolumeAtDepth(tankNum, depth);
    const weight = volume * LDO_DENSITY_KG_PER_LITER;
    const usable = getLdoUsableVolume(tankNum, depth);
    return { volume, weight, usable };
  }, [dipDepthCm, dipTankNumber]);

  function resetDipForm() {
    setDipTankNumber("1");
    setDipDate(format(new Date(), "yyyy-MM-dd"));
    setDipTime(format(new Date(), "HH:mm"));
    setDipReadingType("opening");
    setDipDepthCm("");
    setDipNotes("");
  }

  function handleDipTankClick(tankNum: number) {
    setDipEditingReading(null);
    setDipTankNumber(String(tankNum));
    setDipDate(format(new Date(), "yyyy-MM-dd"));
    setDipTime(format(new Date(), "HH:mm"));
    setDipReadingType("opening");
    setDipDepthCm("");
    setDipNotes("");
    setDipDialogOpen(true);
  }

  function handleDipSubmit() {
    const depth = parseFloat(dipDepthCm);
    const tankNum = parseInt(dipTankNumber);
    if (isNaN(depth) || depth <= 0) {
      toast({ title: "Invalid depth", description: "Enter a valid depth in cm", variant: "destructive" });
      return;
    }
    const maxDepth = getLdoMaxDepth(tankNum);
    if (depth > maxDepth) {
      toast({ title: "Depth exceeds tank", description: `Max depth for Tank ${tankNum} is ${maxDepth} cm`, variant: "destructive" });
      return;
    }
    const volume = getLdoVolumeAtDepth(tankNum, depth);
    const weight = volume * LDO_DENSITY_KG_PER_LITER;
    const payload = {
      date: dipDate,
      time: dipTime || null,
      tankNumber: tankNum,
      depthCm: depth,
      volumeLiters: Math.round(volume * 100) / 100,
      weightKg: Math.round(weight * 100) / 100,
      readingType: dipReadingType,
      notes: dipNotes || null,
    };
    if (dipEditingReading) {
      dipUpdateMutation.mutate({ id: dipEditingReading.id, data: payload });
    } else {
      dipCreateMutation.mutate(payload);
    }
  }

  function resetForm() {
    setTankNumber("1");
    setMeterReading("");
    setReadingType("opening");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setReadingTime(format(new Date(), "HH:mm"));
    setQuantityLiters("");
    setNotes("");
    setDryerFedFrom("TANK_2");
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
    setDryerFedFrom("TANK_2");
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
        plantName: urlPlant,
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
      plantName: urlPlant,
      dryerFedFrom: (parseInt(tankNumber) === 2 && (readingType === "opening" || readingType === "closing")) ? dryerFedFrom : null,
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
      setMeterReading(String(reading.meterReading));
      setReadingType(reading.readingType);
      setQuantityLiters(reading.quantityLiters ? String(reading.quantityLiters) : "");
      setNotes(reading.notes || "");
      setDryerFedFrom(reading.dryerFedFrom || "TANK_2");
      setDialogOpen(true);
    }
  }

  function handleDelete(readingId: number) {
    deleteMutation.mutate(readingId);
  }

  function handleDipEdit(readingId: number) {
    const reading = dipReadings?.find(r => r.id === readingId);
    if (reading) {
      setDipEditingReading(reading);
      setDipDate(reading.date);
      setDipTime(reading.time || "");
      setDipTankNumber(String(reading.tankNumber));
      setDipDepthCm(String(reading.depthCm));
      setDipReadingType(reading.readingType);
      setDipNotes(reading.notes || "");
      setDipDialogOpen(true);
    }
  }

  function handleDipDelete(readingId: number) {
    dipDeleteMutation.mutate(readingId);
  }

  function exportExcel() {
    const data = filteredReadings.map(r => ({
      Date: r.date,
      Time: r.time || "",
      Tank: TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`,
      "Dryer Src": r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← T1" : "",
      "Meter Reading (L)": r.meterReading,
      Type: r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      "Receipt Qty (L)": r.quantityLiters || "",
      Source: SOURCE_LABELS[classifyReadingSource(r)],
      Notes: r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LDO Flow Readings");

    const summaryData = dailySummary.map(d => ({
      Date: d.date,
      "Boiler Meter Opening (L)": d.t1Opening?.meterReading ?? "",
      "Boiler Meter Closing (L)": d.t1Closing?.meterReading ?? "",
      "Boiler Meter Consumption (L)": d.t1Consumption ?? "",
      "Dryer Meter Opening (L)": d.t2Opening?.meterReading ?? "",
      "Dryer Meter Closing (L)": d.t2Closing?.meterReading ?? "",
      "Dryer Meter Consumption (L)": d.t2Consumption ?? "",
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
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    const tableData = filteredReadings.map(r => [
      r.date, r.time || "",
      TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`,
      r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← T1" : "",
      r.meterReading.toFixed(3),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      r.quantityLiters ? r.quantityLiters.toFixed(3) : "",
      SOURCE_LABELS[classifyReadingSource(r)],
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Tank", "Dryer Src", "Meter (L)", "Type", "Receipt Qty (L)", "Source", "Notes"]],
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
      <body><div class="header"><h2>LDO Flow Meter Readings - HLC Plant</h2><p>Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></div>
      <table><tr><th>Date</th><th>Time</th><th>Tank</th><th>Dryer Src</th><th>Meter (L)</th><th>Type</th><th>Receipt Qty (L)</th><th>Source</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>${TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`}</td><td>${r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← T1" : ""}</td><td>${r.meterReading.toFixed(3)}</td><td>${r.readingType}</td><td>${r.quantityLiters ? r.quantityLiters.toFixed(3) : ""}</td><td>${SOURCE_LABELS[classifyReadingSource(r)]}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  }

  const dialogTitle = editingReading
    ? "Edit LDO Reading"
    : `Record LDO Reading - ${TANK_LABELS[parseInt(tankNumber)] || `Tank ${tankNumber}`}`;

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
          <h1 className="text-2xl font-bold flex-1">
            LDO Flow Meter Tracker — {urlPlant}
          </h1>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Gauge className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold flex-1" data-testid="text-page-title">
          LDO Flow Meter Tracker — <span data-testid="text-active-plant">{urlPlant}</span>
        </h1>
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Boiler Meter (heats bitumen) and Dryer Meter (heats aggregates) — both meters draw from the main LDO tank.
        </div>
        <Link href={appendOrigin(`/plant/ldo-reconciliation?role=${pageRole}&plant=${encodeURIComponent(urlPlant)}`)}>
          <Button variant="outline" size="sm" data-testid="link-ldo-reconciliation" className="text-xs gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Book vs Physical
          </Button>
        </Link>
      </div>

      {/* Task #255 — Header strip showing the live LDO usable-stock balance
          per physical tank, plus the combined total. Numbers come from
          `computeTankStock` so dryer-meter consumption tagged for Tank-1
          rolls into the Tank-1 figure here. */}
      <LdoUsableStockStrip
        tank1L={tankStock.tank1?.stockL ?? null}
        tank2L={tankStock.tank2?.stockL ?? null}
        tank1AsOf={tankStock.tank1 ? { date: tankStock.tank1.date, time: tankStock.tank1.time } : undefined}
        tank2AsOf={tankStock.tank2 ? { date: tankStock.tank2.date, time: tankStock.tank2.time } : undefined}
      />

      <NegativeBalanceBanner
        balances={ldoPartyBalances}
        parties={parties}
        material="LDO"
        testid="banner-negative-ldo"
      />


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2].map(tankNum => {
          const latestDip = tankNum === 1 ? latestDipTank1 : latestDipTank2;
          const latestFlow = tankNum === 1 ? latestTank1 : latestTank2;
          const stock = tankNum === 1 ? tankStock.tank1 : tankStock.tank2;
          const maxDepth = getLdoMaxDepth(tankNum);
          const deadStockDepth = getLdoDeadStockDepth(tankNum);
          const deadStockVol = getLdoDeadStockVolume(tankNum);
          const depth = latestDip?.depthCm || 0;
          const vol = latestDip?.volumeLiters || 0;
          const usableVol = latestDip ? getLdoUsableVolume(tankNum, depth) : 0;
          const fillPercent = Math.min(100, (depth / maxDepth) * 100);
          const deadStockPercent = (deadStockDepth / maxDepth) * 100;
          const fillColor = tankNum === 1 ? "bg-blue-600/70 dark:bg-blue-500/50" : "bg-amber-700/70 dark:bg-amber-600/50";

          return (
            <Card key={tankNum} className="overflow-visible" data-testid={`tank-card-${tankNum}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{TANK_LABELS[tankNum]}</CardTitle>
                {pageRole && (
                  <div className="flex gap-3 mt-1">
                    <button
                      className="text-sm font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
                      onClick={() => handleDipTankClick(tankNum)}
                      data-testid={`link-dip-reading-t${tankNum}`}
                    >
                      <Ruler className="w-3 h-3 inline mr-1" />Dip Reading
                    </button>
                    <button
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
                      onClick={() => handleTankClick(tankNum)}
                      data-testid={`link-flow-meter-t${tankNum}`}
                    >
                      <Gauge className="w-3 h-3 inline mr-1" />Flow Meter
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {latestDip ? (
                  <div className="flex gap-4 items-end">
                    <div className="relative w-16 h-32 rounded-md border-2 border-muted-foreground/30 overflow-hidden" data-testid={`tank-visual-${tankNum}`}>
                      <div
                        className={`absolute bottom-0 w-full ${fillColor} transition-all duration-500`}
                        style={{ height: `${fillPercent}%` }}
                      />
                      <div
                        className="absolute bottom-0 w-full border-t-2 border-dashed border-red-500/60"
                        style={{ height: `${deadStockPercent}%` }}
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Usable Stock</span>
                        <div data-testid={`text-dip-usable-t${tankNum}`}>
                          <span className="font-bold text-2xl text-green-700 dark:text-green-400">{usableVol.toFixed(0)} L</span>
                        </div>
                      </div>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-sm text-muted-foreground">Total Stock:</span>
                        <span data-testid={`text-dip-volume-t${tankNum}`}>
                          <span className="font-semibold text-base">{vol.toFixed(0)} L</span>
                        </span>
                      </div>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-sm text-muted-foreground">Dip Depth:</span>
                        <span className="text-sm font-semibold" data-testid={`text-dip-depth-t${tankNum}`}>{depth} cm</span>
                      </div>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-sm text-muted-foreground">Dead Stock:</span>
                        <span className="text-sm text-red-500">{deadStockVol.toFixed(0)} L</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Dip: {latestDip.date} {latestDip.time || ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 items-end">
                    <div className="relative w-16 h-32 rounded-md border-2 border-muted-foreground/30 overflow-hidden" data-testid={`tank-visual-${tankNum}`}>
                      <div
                        className="absolute bottom-0 w-full border-t-2 border-dashed border-red-500/60"
                        style={{ height: `${deadStockPercent}%` }}
                      />
                    </div>
                    <div className="flex-1 space-y-1 text-sm">
                      <p className="text-muted-foreground">No dip reading recorded</p>
                      <div className="flex justify-between gap-1 flex-wrap">
                        <span className="text-muted-foreground">Dead:</span>
                        <span className="text-sm text-red-500">{deadStockVol.toFixed(0)} L</span>
                      </div>
                    </div>
                  </div>
                )}
                {latestFlow && (
                  <div className="pt-2 mt-2 border-t text-sm text-muted-foreground">
                    <span>Meter: {latestFlow.meterReading.toFixed(3)} L</span>
                    <span className="ml-2">({latestFlow.date} {latestFlow.time || ""} - {latestFlow.readingType})</span>
                  </div>
                )}
                {stock && (
                  <div className="pt-2 mt-2 border-t space-y-1">
                    <div className="flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Flow Meter Stock</span>
                    </div>
                    <div data-testid={`text-flow-stock-t${tankNum}`}>
                      <span className="font-bold text-xl text-blue-700 dark:text-blue-300">{stock.stockL.toFixed(0)} L</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Based on stock entry of {stock.date} ± receipts & consumption</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Combined Stock & Consumption (Both Tanks)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(latestDipTank1 || latestDipTank2) && (
              <>
                <div className="mb-2">
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Total Usable Stock (Dip)</span>
                  <div data-testid="text-combined-dip-usable">
                    <span className="font-bold text-2xl text-green-700 dark:text-green-400">{(() => {
                      const t1Usable = latestDipTank1 ? getLdoUsableVolume(1, latestDipTank1.depthCm) : 0;
                      const t2Usable = latestDipTank2 ? getLdoUsableVolume(2, latestDipTank2.depthCm) : 0;
                      return (t1Usable + t2Usable).toFixed(0);
                    })()} L</span>
                  </div>
                </div>
                <div className="flex justify-between gap-1 flex-wrap">
                  <span className="text-sm text-muted-foreground">Total Stock (Dip):</span>
                  <span data-testid="text-combined-dip-stock">
                    <span className="font-semibold text-base">{((latestDipTank1?.volumeLiters || 0) + (latestDipTank2?.volumeLiters || 0)).toFixed(0)} L</span>
                  </span>
                </div>
              </>
            )}
            {(tankStock.tank1 || tankStock.tank2) && (
              <>
                <div className="flex items-center gap-1 mt-1">
                  <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Flow Meter Stock</span>
                </div>
                <div data-testid="text-combined-flow-stock">
                  <span className="font-bold text-2xl text-blue-700 dark:text-blue-300">{((tankStock.tank1?.stockL || 0) + (tankStock.tank2?.stockL || 0)).toFixed(0)} L</span>
                </div>
                <div className="text-xs text-muted-foreground flex gap-3">
                  <span>Boiler: {tankStock.tank1 ? `${tankStock.tank1.stockL.toFixed(0)} L` : "—"}</span>
                  <span>Dryer: {tankStock.tank2 ? `${tankStock.tank2.stockL.toFixed(0)} L` : "—"}</span>
                </div>
              </>
            )}
            <div className="border-b my-1" />
            <div className="flex justify-between gap-1 flex-wrap">
              <span className="text-sm text-muted-foreground">Total Consumption:</span>
              <span data-testid="text-combined-consumption">
                {totalConsumptionBothTanks > 0 ? (
                  <span className="font-bold text-lg">{totalConsumptionBothTanks.toFixed(0)} L</span>
                ) : "-"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base font-semibold">LDO Reconciliation</CardTitle>
          </div>
          <p className="text-base text-muted-foreground mt-1">
            Compare theoretical consumption (from mix template LDO norms) vs actual consumption (per dispatch variance) and physical stock (dip readings)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-base">From Date</Label>
              <Input type="date" value={reconDateFrom} onChange={e => setReconDateFrom(e.target.value)} className="w-40" data-testid="input-ldo-recon-date-from" />
            </div>
            <div>
              <Label className="text-base">To Date</Label>
              <Input type="date" value={reconDateTo} onChange={e => setReconDateTo(e.target.value)} className="w-40" data-testid="input-ldo-recon-date-to" />
            </div>
            <div>
              <Label className="text-base">Party</Label>
              <Select value={reconPartyId} onValueChange={setReconPartyId}>
                <SelectTrigger className="w-44" data-testid="select-ldo-recon-party">
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
                <SelectTrigger className="w-44" data-testid="select-ldo-recon-mix">
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
                <SelectTrigger className="w-44" data-testid="select-ldo-recon-site">
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
              <Button variant="outline" size="sm" onClick={() => { setReconDateFrom(""); setReconDateTo(""); setReconPartyId("all"); setReconMixTemplateId("all"); setReconSite("all"); }} data-testid="button-ldo-clear-recon-filters">
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
                    <div className="text-2xl font-bold" data-testid="text-ldo-recon-production">{reconciliationData.totalLoadMT.toFixed(3)} MT</div>
                    <div className="text-base text-muted-foreground">{reconciliationData.dispatchCount} dispatches</div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Theoretical LDO
                      <span title="LDO that should have been consumed as per mix template norms" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-ldo-recon-theoretical">{reconciliationData.totalTheoreticalL.toFixed(0)} L</div>
                    <div className="text-base text-muted-foreground">As per mix template</div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      Actual LDO Used
                      <span title="LDO actually consumed as per the variance % entered during dispatch" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-ldo-recon-actual">{reconciliationData.totalActualL.toFixed(0)} L</div>
                    <div className="text-base text-muted-foreground">As per dispatch variance</div>
                  </CardContent>
                </Card>

                <Card className={`${reconciliationData.ldoSavedL >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                  <CardContent className="p-4 space-y-1">
                    <div className="text-base font-medium text-muted-foreground flex items-center gap-1">
                      {reconciliationData.ldoSavedL >= 0 ? "LDO Saved" : "LDO Excess"}
                      <span title="Difference between theoretical and actual. Positive = saved (used less than template), Negative = excess (used more than template)" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    <div className={`text-2xl font-bold flex items-center gap-1 ${reconciliationData.ldoSavedL >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid="text-ldo-recon-saved">
                      {reconciliationData.ldoSavedL >= 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                      {Math.abs(reconciliationData.ldoSavedL).toFixed(0)} L
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
                      LDO Received (Receipts)
                      <span title="Total LDO received from material receipts" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    {(reconDateFrom || reconDateTo) ? (
                      <>
                        <div className="text-2xl font-bold" data-testid="text-ldo-recon-receipts">{reconciliationData.totalReceiptsL.toFixed(0)} L</div>
                        {(reconciliationData.tank1ReceiptsL > 0 || reconciliationData.tank2ReceiptsL > 0) && (
                          <div className="text-base text-muted-foreground">
                            Boiler: {reconciliationData.tank1ReceiptsL.toFixed(0)} L | Dryer: {reconciliationData.tank2ReceiptsL.toFixed(0)} L
                          </div>
                        )}
                        <div className="text-base text-muted-foreground">
                          {reconDateFrom || "start"} to {reconDateTo || "now"}
                        </div>
                        <div className="text-base text-muted-foreground border-t pt-1 mt-1">
                          All-time total: <span className="font-semibold text-foreground">{allTimeLdoReceiptsL.toFixed(0)} L</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold" data-testid="text-ldo-recon-receipts">{allTimeLdoReceiptsL.toFixed(0)} L</div>
                        {(reconciliationData.tank1ReceiptsL > 0 || reconciliationData.tank2ReceiptsL > 0) && (
                          <div className="text-base text-muted-foreground">
                            Boiler: {reconciliationData.tank1ReceiptsL.toFixed(0)} L | Dryer: {reconciliationData.tank2ReceiptsL.toFixed(0)} L
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
                      <span title="Physical LDO stock in tanks as measured by the latest dip reading per tank" className="cursor-help"><Info className="w-4 h-4" /></span>
                    </div>
                    {reconciliationData.latestDipReading ? (
                      <>
                        <div className="text-2xl font-bold" data-testid="text-ldo-recon-physical-stock">{reconciliationData.latestDipReading.totalL.toFixed(0)} L</div>
                        <div className="text-base font-semibold text-foreground">
                          Usable: {reconciliationData.latestDipReading.totalUsableL.toFixed(0)} L
                        </div>
                        <div className="text-base text-muted-foreground mt-1">
                          Boiler Meter: {reconciliationData.latestDipReading.tank1L.toFixed(0)} L (usable: {reconciliationData.latestDipReading.tank1UsableL.toFixed(0)} L)
                          {reconciliationData.latestDipReading.tank1Date ? ` — ${reconciliationData.latestDipReading.tank1Date}` : ""}
                        </div>
                        <div className="text-base text-muted-foreground">
                          Dryer Meter: {reconciliationData.latestDipReading.tank2L.toFixed(0)} L (usable: {reconciliationData.latestDipReading.tank2UsableL.toFixed(0)} L)
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
                <div><strong>Theoretical</strong> = What the mix template says should have been consumed (template LDO norm x load weight)</div>
                <div><strong>Actual</strong> = What was actually consumed based on the variance % entered during each dispatch</div>
                <div><strong>Saved/Excess</strong> = Theoretical minus Actual. Positive means less LDO was used than the template requires (savings). Negative means more was used (excess).</div>
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

      {dipDailySummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Consumption Summary (Dip-Based, Last 10 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-left p-2 border border-border align-bottom">Date</th>
                    <th colSpan={4} className="text-center p-2 border border-border bg-blue-100 dark:bg-blue-900 font-semibold">Boiler Meter</th>
                    <th colSpan={4} className="text-center p-2 border border-border bg-amber-100 dark:bg-amber-900 font-semibold">Dryer Meter</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom">Mat. Rcpt (L)</th>
                    <th rowSpan={2} className="text-right p-2 border border-border align-bottom font-bold">Total Consumed (L)</th>
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
                  {dipDailySummary.map(day => (
                    <tr key={day.date} data-testid={`row-ldo-dip-daily-${day.date}`}>
                      <td className="p-2 border border-border">{day.date}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Opening ? day.t1Opening.volumeLiters.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1Closing ? day.t1Closing.volumeLiters.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30">{day.t1ReceiptVol ? day.t1ReceiptVol.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-blue-50/50 dark:bg-blue-950/30 font-medium">{day.t1Consumption !== null ? day.t1Consumption.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Opening ? day.t2Opening.volumeLiters.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2Closing ? day.t2Closing.volumeLiters.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30">{day.t2ReceiptVol ? day.t2ReceiptVol.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border bg-amber-50/50 dark:bg-amber-950/30 font-medium">{day.t2Consumption !== null ? day.t2Consumption.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border text-muted-foreground">{day.materialReceiptL ? day.materialReceiptL.toFixed(0) : "-"}</td>
                      <td className="p-2 text-right border border-border font-bold">{day.totalConsumed ? day.totalConsumed.toFixed(0) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {dailySummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Consumption Summary (Flow Meter)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-left p-2 border border-border align-bottom">Date</th>
                    <th colSpan={3} className="text-center p-2 border border-border bg-blue-100 dark:bg-blue-900 font-semibold">Boiler Meter</th>
                    <th colSpan={3} className="text-center p-2 border border-border bg-amber-100 dark:bg-amber-900 font-semibold">Dryer Meter</th>
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

      {/* ── LDO Physical Stock Correction Card ── */}
      {isAdmin && ldoMaterialId && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold">Book vs Physical LDO Stock Correction</CardTitle>
              </div>
              {!showLdoCorrForm && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!ldoCorrPartyId && ldoPartyBalances.length > 0) setLdoCorrPartyId(String(ldoPartyBalances[0].partyId));
                  if (!ldoCorrTank1L) setLdoCorrTank1L(String(Math.round(latestDipTank1?.volumeLiters || 0)));
                  if (!ldoCorrTank2L) setLdoCorrTank2L(String(Math.round(latestDipTank2?.volumeLiters || 0)));
                  setShowLdoCorrForm(true);
                }} data-testid="button-show-ldo-correction-form">
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
                <div className={`font-bold text-lg ${ldoBookStockL < 0 ? "text-red-600" : "text-foreground"}`}>
                  {ldoBookStockL.toFixed(0)} L
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {ldoPartyBalances.map(b => (
                    <div key={b.id} className="flex justify-between gap-2">
                      <span>{parties?.find(p => p.id === b.partyId)?.name ?? `Party ${b.partyId}`}:</span>
                      <span className={balanceToL(b.balance, b.uom) < 0 ? "text-red-500" : ""}>{balanceToL(b.balance, b.uom).toFixed(0)} L</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <div className="text-muted-foreground text-xs mb-1">Physical Stock (Dip)</div>
                <div className="font-bold text-lg text-amber-700 dark:text-amber-400">
                  {latestDipTank1 || latestDipTank2
                    ? `${((latestDipTank1?.volumeLiters || 0) + (latestDipTank2?.volumeLiters || 0)).toFixed(0)} L`
                    : "No dip readings"}
                </div>
                <div className="text-xs text-muted-foreground">Boiler: {(latestDipTank1?.volumeLiters || 0).toFixed(0)} L</div>
                <div className="text-xs text-muted-foreground">Dryer: {(latestDipTank2?.volumeLiters || 0).toFixed(0)} L</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Difference (Physical − Book)</div>
                {(latestDipTank1 || latestDipTank2) ? (() => {
                  const physL = (latestDipTank1?.volumeLiters || 0) + (latestDipTank2?.volumeLiters || 0);
                  const diff = physL - ldoBookStockL;
                  return (
                    <div className={`font-bold text-lg ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-foreground"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(0)} L
                      <span className="text-xs font-normal ml-2 text-muted-foreground">
                        {diff > 0 ? "Surplus" : diff < 0 ? "Deficit — check receipts/consumption" : "Balanced"}
                      </span>
                    </div>
                  );
                })() : <div className="text-muted-foreground">—</div>}
                <div className="text-xs text-muted-foreground mt-1">Post a correction to align a party's book stock with physical measurement</div>
              </div>
            </div>

            {showLdoCorrForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Post Physical LDO Stock Correction</p>

                {/* Party + date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Party to Correct</Label>
                    <Select value={ldoCorrPartyId} onValueChange={id => setLdoCorrPartyId(id)}>
                      <SelectTrigger data-testid="select-ldo-corr-party">
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {parties?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {ldoPartyBalances.find(b => b.partyId === p.id) !== undefined &&
                              ` (${balanceToL(ldoPartyBalances.find(b => b.partyId === p.id)?.balance ?? 0, ldoPartyBalances.find(b => b.partyId === p.id)?.uom ?? "L").toFixed(0)} L)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ldoCorrPartyId && ldoSelectedPartyBalanceL !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Current book stock: <span className={ldoSelectedPartyBalanceL < 0 ? "text-red-500 font-medium" : "font-medium"}>{ldoSelectedPartyBalanceL.toFixed(0)} L</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">As on Date</Label>
                    <Input type="date" value={ldoCorrDate} onChange={e => setLdoCorrDate(e.target.value)} data-testid="input-ldo-corr-date" />
                  </div>
                </div>

                {/* Per-tank inputs */}
                <div>
                  <Label className="text-xs mb-2 block">Physical Stock from Dip Readings (Liters)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Boiler Meter</Label>
                      <Input
                        type="number" step="1" min="0"
                        value={ldoCorrTank1L}
                        onChange={e => setLdoCorrTank1L(e.target.value)}
                        placeholder={String(Math.round(latestDipTank1?.volumeLiters || 0))}
                        data-testid="input-ldo-corr-tank1-l"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Dip: {(latestDipTank1?.volumeLiters || 0).toFixed(0)} L</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Dryer Meter</Label>
                      <Input
                        type="number" step="1" min="0"
                        value={ldoCorrTank2L}
                        onChange={e => setLdoCorrTank2L(e.target.value)}
                        placeholder={String(Math.round(latestDipTank2?.volumeLiters || 0))}
                        data-testid="input-ldo-corr-tank2-l"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Dip: {(latestDipTank2?.volumeLiters || 0).toFixed(0)} L</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground">Total Physical</div>
                      <div className="font-bold text-base">
                        {ldoCorrTank1L || ldoCorrTank2L
                          ? ((parseFloat(ldoCorrTank1L) || 0) + (parseFloat(ldoCorrTank2L) || 0)).toFixed(0)
                          : "—"} L
                      </div>
                    </div>
                    {ldoCorrPartyId && ldoSelectedPartyBalanceL !== null && (ldoCorrTank1L || ldoCorrTank2L) && (
                      <div className={`rounded-lg p-2 text-center ${
                        ((parseFloat(ldoCorrTank1L) || 0) + (parseFloat(ldoCorrTank2L) || 0)) - ldoSelectedPartyBalanceL > 0
                          ? "bg-green-50 dark:bg-green-900/20"
                          : "bg-red-50 dark:bg-red-900/20"
                      }`}>
                        <div className="text-xs text-muted-foreground">Adjustment</div>
                        <div className={`font-bold text-base ${
                          ((parseFloat(ldoCorrTank1L) || 0) + (parseFloat(ldoCorrTank2L) || 0)) - ldoSelectedPartyBalanceL > 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-red-700 dark:text-red-400"
                        }`}>
                          {(() => {
                            const total = (parseFloat(ldoCorrTank1L) || 0) + (parseFloat(ldoCorrTank2L) || 0);
                            const adj = total - ldoSelectedPartyBalanceL;
                            return `${adj > 0 ? "+" : ""}${adj.toFixed(0)} L`;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={ldoCorrNotes} onChange={e => setLdoCorrNotes(e.target.value)} placeholder="e.g. Weekly dip reconciliation — Boiler: 1500L, Dryer: 1000L" data-testid="input-ldo-corr-notes" />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!ldoCorrPartyId || (!ldoCorrTank1L && !ldoCorrTank2L) || ldoCorrectionMutation.isPending}
                    onClick={() => {
                      if (!ldoMaterialId || !ldoCorrPartyId) return;
                      const t1L = parseFloat(ldoCorrTank1L) || 0;
                      const t2L = parseFloat(ldoCorrTank2L) || 0;
                      const totalL = t1L + t2L;
                      const totalMT = totalL * LDO_DENSITY_KG_PER_LITER / 1000;
                      const partyName = parties?.find(p => String(p.id) === ldoCorrPartyId)?.name || `Party ${ldoCorrPartyId}`;
                      ldoCorrectionMutation.mutate({
                        materialId: ldoMaterialId,
                        partyId: parseInt(ldoCorrPartyId),
                        physicalQty: totalMT,
                        uom: "MT",
                        date: ldoCorrDate,
                        notes: ldoCorrNotes || `LDO dip reconciliation — Boiler: ${t1L.toFixed(0)} L, Dryer: ${t2L.toFixed(0)} L (${partyName})`,
                        correctedBy: "admin",
                      });
                    }}
                    data-testid="button-post-ldo-correction"
                  >
                    {ldoCorrectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Correction"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowLdoCorrForm(false); setLdoCorrTank1L(""); setLdoCorrTank2L(""); setLdoCorrNotes(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
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
                    <th className="text-right p-2">Norm (L)</th>
                    <th className="text-right p-2">Actual Boiler (L)</th>
                    <th className="text-right p-2">Actual Dryer (L)</th>
                    <th className="text-right p-2">Actual Total (L)</th>
                    <th className="text-right p-2">L/Ton</th>
                    <th className="text-right p-2">Variance (L)</th>
                    <th className="text-right p-2">Variance %</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.map(row => {
                    const lPerTon = row.production > 0 ? row.actualTotal / row.production : null;
                    const normPerTon = row.production > 0 ? row.theoretical / row.production : null;
                    return (
                    <tr key={row.date} className="border-b" data-testid={`row-ldo-variance-${row.date}`}>
                      <td className="p-2">{row.date}</td>
                      <td className="p-2 text-right">{row.production.toFixed(1)}</td>
                      <td className="p-2 text-right">{row.theoretical.toFixed(1)}</td>
                      <td className="p-2 text-right">{row.actualT1 !== null ? row.actualT1.toFixed(1) : "-"}</td>
                      <td className="p-2 text-right">{row.actualT2 !== null ? row.actualT2.toFixed(1) : "-"}</td>
                      <td className="p-2 text-right font-bold">{row.actualTotal.toFixed(1)}</td>
                      <td className={`p-2 text-right font-semibold ${lPerTon && normPerTon ? (lPerTon > normPerTon ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400") : ""}`}>
                        {lPerTon !== null ? lPerTon.toFixed(2) : "-"}
                        {normPerTon !== null && <span className="text-xs text-muted-foreground ml-0.5">/{normPerTon.toFixed(1)}</span>}
                      </td>
                      <td className={`p-2 text-right font-bold ${row.variance < 0 ? "text-green-600 dark:text-green-400" : row.variance > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {row.variance.toFixed(1)}
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
                    );
                  })}
                  {(() => {
                    const totProd = varianceData.reduce((s, r) => s + r.production, 0);
                    const totTheo = varianceData.reduce((s, r) => s + r.theoretical, 0);
                    const totT1 = varianceData.reduce((s, r) => s + (r.actualT1 || 0), 0);
                    const totT2 = varianceData.reduce((s, r) => s + (r.actualT2 || 0), 0);
                    const totActual = varianceData.reduce((s, r) => s + r.actualTotal, 0);
                    const totVar = totActual - totTheo;
                    const totVarPct = totTheo > 0 ? Math.round((totVar / totTheo) * 1000) / 10 : null;
                    const totLPerTon = totProd > 0 ? totActual / totProd : null;
                    const totNormPerTon = totProd > 0 ? totTheo / totProd : null;
                    const totStatus: "SAVING" | "LOSS" | "OK" = totTheo === 0 ? "OK" : totVar < 0 ? "SAVING" : totVar > 0 ? "LOSS" : "OK";
                    return (
                      <tr className="border-t-2 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{totProd.toFixed(1)}</td>
                        <td className="p-2 text-right">{totTheo.toFixed(1)}</td>
                        <td className="p-2 text-right">{totT1.toFixed(1)}</td>
                        <td className="p-2 text-right">{totT2.toFixed(1)}</td>
                        <td className="p-2 text-right">{totActual.toFixed(1)}</td>
                        <td className={`p-2 text-right ${totLPerTon && totNormPerTon ? (totLPerTon > totNormPerTon ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400") : ""}`}>
                          {totLPerTon !== null ? totLPerTon.toFixed(2) : "-"}
                          {totNormPerTon !== null && <span className="text-xs text-muted-foreground ml-0.5">/{totNormPerTon.toFixed(1)}</span>}
                        </td>
                        <td className={`p-2 text-right ${totVar < 0 ? "text-green-600 dark:text-green-400" : totVar > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {totVar.toFixed(1)}
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
              <CardTitle className="text-sm font-medium">Dip Reading History</CardTitle>
              <div className="flex gap-2 flex-wrap items-center">
                <Select value={dipFilterSource} onValueChange={setDipFilterSource}>
                  <SelectTrigger className="w-48" data-testid="select-dip-filter-source">
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
                {dipFilterSource !== "all" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDipFilterSource("all")}
                    data-testid="button-reset-dip-filter"
                    aria-label="Reset dip filter"
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Reset
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dipLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : sortedDipReadings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-dip-readings">No LDO dip readings recorded yet</div>
            ) : filteredDipReadings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-dip-readings-filtered">No dip readings match the current filter</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-dip-readings">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Tank</th>
                      <th className="text-right p-2">Depth (cm)</th>
                      <th className="text-right p-2">Volume (L)</th>
                      <th className="text-right p-2">Weight (kg)</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Notes</th>
                      {isAdmin && <th className="text-center p-2">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDipReadings.map(r => {
                      const dipSrc = classifyReadingSource(r);
                      const dipSrcClass =
                        dipSrc === "backfill"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 no-default-hover-elevate no-default-active-elevate"
                          : dipSrc === "shift-log"
                            ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 no-default-hover-elevate no-default-active-elevate"
                            : dipSrc === "heating-session"
                              ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200 no-default-hover-elevate no-default-active-elevate"
                              : "no-default-hover-elevate no-default-active-elevate";
                      return (
                      <tr key={r.id} className="border-b" data-testid={`row-dip-${r.id}`}>
                        <td className="p-2">{r.date}</td>
                        <td className="p-2">{r.time || "-"}</td>
                        <td className="p-2">
                          <Badge variant={r.tankNumber === 1 ? "default" : "secondary"} data-testid={`badge-dip-tank-${r.id}`}>
                            {TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-medium" data-testid={`text-dip-depth-${r.id}`}>{r.depthCm}</td>
                        <td className="p-2 text-right" data-testid={`text-dip-vol-${r.id}`}>{r.volumeLiters.toFixed(0)}</td>
                        <td className="p-2 text-right" data-testid={`text-dip-wt-${r.id}`}>{r.weightKg.toFixed(0)}</td>
                        <td className="p-2">
                          <Badge variant="outline" data-testid={`badge-dip-type-${r.id}`}>
                            {r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1)}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={dipSrc === "manual" ? "outline" : "secondary"}
                            className={dipSrcClass}
                            data-testid={`badge-dip-source-${r.id}`}
                            title={
                              dipSrc === "backfill"
                                ? "Entered via the admin LDO Dip Backfill tool"
                                : dipSrc === "shift-log"
                                  ? "Auto-created from a plant shift log"
                                  : dipSrc === "heating-session"
                                    ? "Auto-created from a bitumen heating session"
                                    : "Manually entered on this page"
                            }
                          >
                            {SOURCE_LABELS[dipSrc]}
                          </Badge>
                        </td>
                        <td className="p-2 text-muted-foreground text-sm">{r.notes || "-"}</td>
                        {isAdmin && (
                          <td className="p-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" onClick={() => handleDipEdit(r.id)} data-testid={`button-dip-edit-${r.id}`}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {dipDeleteConfirmId === r.id ? (
                                <>
                                  <Button size="sm" variant="destructive" onClick={() => handleDipDelete(r.id)} data-testid={`button-dip-confirm-delete-${r.id}`}>
                                    Confirm
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setDipDeleteConfirmId(null)}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button size="icon" variant="ghost" onClick={() => setDipDeleteConfirmId(r.id)} data-testid={`button-dip-delete-${r.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">All Flow Readings</CardTitle>
            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => exportExcel()} data-testid="button-export-excel">
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportPdf()} data-testid="button-export-pdf">
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => printData()} data-testid="button-print">
                  <Printer className="w-4 h-4 mr-1" /> Print
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
            <Select value={filterTank} onValueChange={setFilterTank}>
              <SelectTrigger className="w-44" data-testid="select-filter-tank">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tanks</SelectItem>
                <SelectItem value="1">Boiler Meter</SelectItem>
                <SelectItem value="2">Dryer Meter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
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
            {(filterDateFrom || filterDateTo || filterTank !== "all" || filterSource !== "all" || reconDateFrom || reconDateTo || reconPartyId !== "all" || reconMixTemplateId !== "all" || reconSite !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetPersistedFilters}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset filters
              </Button>
            )}
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
                    <th className="text-left p-2">Dryer Src</th>
                    <th className="text-right p-2">Meter Reading (L)</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Qty (L)</th>
                    <th className="text-left p-2">Source</th>
                    <th className="text-left p-2">Notes</th>
                    {isAdmin && <th className="text-center p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.map(r => {
                    const src = classifyReadingSource(r);
                    const srcClass =
                      src === "backfill"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 no-default-hover-elevate no-default-active-elevate"
                        : src === "shift-log"
                          ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 no-default-hover-elevate no-default-active-elevate"
                          : src === "heating-session"
                            ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200 no-default-hover-elevate no-default-active-elevate"
                            : "no-default-hover-elevate no-default-active-elevate";
                    return (
                    <tr key={r.id} className="border-b" data-testid={`row-reading-${r.id}`}>
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.time || "-"}</td>
                      <td className="p-2">
                        <Badge variant={r.tankNumber === 1 ? "default" : "secondary"} data-testid={`badge-tank-${r.id}`}>
                          {TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" && (
                          <Badge
                            variant="outline"
                            className="text-xs border-amber-500 text-amber-700 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate"
                            title="Dryer is fed from Tank 1 stock"
                            data-testid={`badge-dryer-src-${r.id}`}
                          >
                            ← T1
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">{r.readingType === "stock" ? "-" : r.meterReading.toFixed(3)}</td>
                      <td className="p-2">
                        <Badge variant={r.readingType === "opening" ? "default" : r.readingType === "closing" ? "secondary" : r.readingType === "stock" ? "default" : "outline"}
                          className={r.readingType === "stock" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 no-default-hover-elevate no-default-active-elevate" : ""}>
                          {r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{r.quantityLiters ? r.quantityLiters.toFixed(3) : "-"}</td>
                      <td className="p-2">
                        <Badge
                          variant={src === "manual" ? "outline" : "secondary"}
                          className={srcClass}
                          data-testid={`badge-source-${r.id}`}
                          title={
                            src === "backfill"
                              ? "Entered via the admin LDO Backfill tool"
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
                      {isAdmin && (
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(r.id)} data-testid={`button-edit-${r.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {deleteConfirmId === r.id ? (
                              <>
                                <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)} data-testid={`button-confirm-delete-${r.id}`}>
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
                    );
                  })}
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
                {TANK_LABELS[parseInt(tankNumber)] || `Tank ${tankNumber}`}
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

            {tankNumber === "2" && (readingType === "opening" || readingType === "closing") && (
              <div>
                <Label>Dryer fed from</Label>
                <Select value={dryerFedFrom} onValueChange={setDryerFedFrom}>
                  <SelectTrigger data-testid="select-dryer-fed-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TANK_2">Tank 2 — Dryer Tank (default)</SelectItem>
                    <SelectItem value="TANK_1">Tank 1 — Boiler Tank</SelectItem>
                  </SelectContent>
                </Select>
                {dryerFedFrom === "TANK_1" && (
                  <p className="text-xs text-amber-600 mt-1">Consumption will be debited from Tank-1 stock.</p>
                )}
              </div>
            )}

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
                  <p className="text-sm text-muted-foreground mt-1">
                    = {(parseFloat(meterReading) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                  </p>
                )}
              </div>
            )}

            {readingType === "receipt" && (
              <div>
                <Label>Receipt Quantity (Liters) <span className="text-sm text-muted-foreground">- How much LDO was received</span></Label>
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
                  <p className="text-sm text-muted-foreground mt-1">
                    = {(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                  </p>
                )}
              </div>
            )}

            {readingType === "stock" && (
              <div>
                <Label>Current Stock Quantity (Liters) <span className="text-sm text-muted-foreground">- Physical stock in tank</span></Label>
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
                  <p className="text-sm text-muted-foreground mt-1">
                    = {(parseFloat(quantityLiters) * LDO_DENSITY_KG_PER_LITER).toFixed(3)} kg
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value.toUpperCase())} className="uppercase" placeholder="Any observations" data-testid="input-notes" />
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

      <Dialog open={dipDialogOpen} onOpenChange={setDipDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-dip-dialog-title">
              {dipEditingReading
                ? "Edit Dip Reading"
                : `Record Dip Reading - ${TANK_LABELS[parseInt(dipTankNumber)] || `Tank ${dipTankNumber}`}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={dipDate} onChange={e => setDipDate(e.target.value)} data-testid="input-dip-date" />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={dipTime} onChange={e => setDipTime(e.target.value)} data-testid="input-dip-time" />
              </div>
            </div>

            <div>
              <Label>Tank</Label>
              <Select value={dipTankNumber} onValueChange={setDipTankNumber}>
                <SelectTrigger data-testid="select-dip-tank">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Boiler Meter</SelectItem>
                  <SelectItem value="2">Dryer Meter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Reading Type</Label>
              <Select value={dipReadingType} onValueChange={setDipReadingType}>
                <SelectTrigger data-testid="select-dip-reading-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                  <SelectItem value="stock">Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Dip Depth (cm)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                max={getLdoMaxDepth(parseInt(dipTankNumber))}
                value={dipDepthCm}
                onChange={e => setDipDepthCm(e.target.value)}
                placeholder={`Max ${getLdoMaxDepth(parseInt(dipTankNumber))} cm`}
                data-testid="input-dip-depth"
              />
              {dipCalculatedVolume && (
                <div className="mt-2 p-3 rounded-md bg-muted space-y-1 text-sm">
                  <div className="flex justify-between gap-1 flex-wrap">
                    <span className="text-muted-foreground">Total:</span>
                    <span data-testid="text-dip-calc-volume">
                      <span className="font-bold text-base">{dipCalculatedVolume.volume.toFixed(0)} L</span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-1 flex-wrap">
                    <span className="text-muted-foreground">Usable (excl. dead stock):</span>
                    <span data-testid="text-dip-calc-usable">
                      <span className="font-bold text-base text-green-600 dark:text-green-400">{dipCalculatedVolume.usable.toFixed(0)} L</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Input value={dipNotes} onChange={e => setDipNotes(e.target.value.toUpperCase())} className="uppercase" placeholder="Any observations" data-testid="input-dip-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDipDialogOpen(false); setDipEditingReading(null); }} data-testid="button-dip-cancel">Cancel</Button>
            <Button
              onClick={handleDipSubmit}
              disabled={dipCreateMutation.isPending || dipUpdateMutation.isPending || !dipDepthCm}
              data-testid="button-dip-submit"
            >
              {(dipCreateMutation.isPending || dipUpdateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {dipEditingReading ? "Update Dip Reading" : "Record Dip Reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
