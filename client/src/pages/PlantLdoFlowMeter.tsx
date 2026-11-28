import { useState, useMemo, useEffect, useRef } from "react";
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
import { ChevronLeft, ChevronDown, Loader2, Trash2, Download, Printer, Gauge, Pencil, Lock, Ruler, BarChart3, TrendingDown, TrendingUp, Info, Scale, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { openPrintableHtmlOrPreview } from "@/lib/installedApp";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { normalizeWeightUnit } from "@shared/stockUnits";
import { NegativeBalanceBanner } from "@/components/NegativeBalanceBanner";
import { TankStockPositions } from "@/components/TankStockPositions";
import { TANK_STOCK_HEADERS, TANK_STOCK_NOTE, tankStockCells, tankStockExportRows, tankStockPrintTable, visibleTankStockRows } from "@shared/tankAssignment";
import { TankBookStock } from "@/components/TankBookStock";
import { TrackerConsumption } from "@/components/TrackerConsumption";
import { format, parseISO } from "date-fns";
import type { LdoFlowReading, LdoDipReading, TruckDispatch, Party, MixTemplate } from "@shared/schema";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { getLdoVolumeAtDepth, getLdoMaxDepth, getLdoDeadStockDepth, getLdoDeadStockVolume, getLdoUsableVolume } from "@shared/ldo-dip-chart";
import { materialTankLabel } from "@shared/materialMasterFields";
import { computeTankStock } from "@/lib/ldoStock";

const TANK_LABELS: Record<number, string> = { 1: "Boiler Meter", 2: "Dryer Meter" };

type ReadingSource = "shift-log" | "heating-session" | "backfill" | "manual" | "material-receipt" | "material-issue";

const SOURCE_LABELS: Record<ReadingSource, string> = {
  "shift-log": "Shift Log",
  "heating-session": "Heating",
  "backfill": "Backfill",
  "manual": "Manual",
  "material-receipt": "Mat. Receipt",
  "material-issue": "Mat. Issue",
};

function classifyReadingSource(r: { sourceShiftLogId?: number | null; sourceHeatingSessionId?: number | null; sourceMaterialReceiptId?: number | null; sourceMaterialIssueId?: number | null; notes?: string | null }): ReadingSource {
  // Task #239: the "[BACKFILL ...]" notes prefix is the source of truth, so
  // it wins over source IDs. In normal operation backfill rows never have a
  // source ID (the backfill upsert skips owned rows), but if both ever
  // co-exist we still want the row to read as "Backfill" to match the spec.
  if (r.notes && r.notes.toUpperCase().startsWith("[BACKFILL")) return "backfill";
  if (r.sourceShiftLogId != null) return "shift-log";
  if (r.sourceHeatingSessionId != null) return "heating-session";
  if (r.sourceMaterialIssueId != null) return "material-issue";
  if (r.sourceMaterialReceiptId != null) return "material-receipt";
  return "manual";
}

export default function PlantLdoFlowMeter() {
  const { toast } = useToast();
  const { companyShortName, defaultPlantName } = useFeatureFlags();
  const { sectionCan, user, featureCan } = useAuth();
  const canViewNormActual = sectionCan("plant_norm_vs_actual", "view");
  const isOwner = user?.isOwner === true;
  const canCreate = featureCan("plant_receipts", "add");
  const canEdit = featureCan("plant_receipts", "edit");
  const canDelete = isOwner;
  const canExport = featureCan("plant_receipts", "export");
  const { appendOrigin, getPlantBackLink } = useOrigin();
  const searchString = useSearch();
  const sp = new URLSearchParams(searchString || window.location.search);
  const pageRole: "manager" | "admin" | null = isOwner ? "admin" : "manager";
  const isAdmin = isOwner;
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
    setLocation(`/plant/ldo-flow-meter?${next.toString()}`);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReading, setEditingReading] = useState<LdoFlowReading | null>(null);

  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_LDO_FILTER_URL_KEYS = [
    "filterDateFrom", "filterDateTo", "filterTank", "filterSource", "filterDryerSrc",
    "reconDateFrom", "reconDateTo", "reconPartyId", "reconMixTemplateId", "reconSite",
    "dipFilterSource",
    "officialMethod",
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
      filterDryerSrc: "all" as "all" | "T1" | "T2",
      dipFilterSource: "all" as "all" | "hide-backfill" | ReadingSource,
      reconDateFrom: "",
      reconDateTo: "",
      reconPartyId: "all",
      reconMixTemplateId: "all",
      reconSite: "all",
      officialMethod: "dip" as "dip" | "flowmeter",
    },
    { shouldHydrate: !urlHasLdoFilterParams },
  );
  const { filterDateFrom, filterDateTo, filterTank, filterSource, filterDryerSrc, dipFilterSource, reconDateFrom, reconDateTo, reconPartyId, reconMixTemplateId, reconSite, officialMethod } = persistedFilters;
  const setFilterDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateFrom: v }));
  const setFilterDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateTo: v }));
  const setFilterTank = (v: string) => setPersistedFilters((f) => ({ ...f, filterTank: v }));
  const setFilterSource = (v: string) => setPersistedFilters((f) => ({ ...f, filterSource: v as typeof persistedFilters.filterSource }));
  const setFilterDryerSrc = (v: string) => setPersistedFilters((f) => ({ ...f, filterDryerSrc: v as typeof persistedFilters.filterDryerSrc }));
  const setDipFilterSource = (v: string) => setPersistedFilters((f) => ({ ...f, dipFilterSource: v as typeof persistedFilters.dipFilterSource }));
  const setReconDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, reconDateFrom: v }));
  const setReconDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, reconDateTo: v }));
  const setReconPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, reconPartyId: v }));
  const setReconMixTemplateId = (v: string) => setPersistedFilters((f) => ({ ...f, reconMixTemplateId: v }));
  const setReconSite = (v: string) => setPersistedFilters((f) => ({ ...f, reconSite: v }));
  const setOfficialMethod = (v: "dip" | "flowmeter") => setPersistedFilters((f) => ({ ...f, officialMethod: v }));


  const [tankNumber, setTankNumber] = useState("1");
  const [meterReading, setMeterReading] = useState("");
  const [readingType, setReadingType] = useState("opening");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [readingTime, setReadingTime] = useState(format(new Date(), "HH:mm"));
  const [quantityLiters, setQuantityLiters] = useState("");
  const [notes, setNotes] = useState("");
  const [dryerFedFrom, setDryerFedFrom] = useState("TANK_2");

  const [dipDialogOpen, setDipDialogOpen] = useState(sp.get("dipEntry") === "1");
  const [dipEditingReading, setDipEditingReading] = useState<LdoDipReading | null>(null);
  const [dipDeleteConfirmId, setDipDeleteConfirmId] = useState<number | null>(null);
  const [dipTankNumber, setDipTankNumber] = useState(sp.get("tank") === "2" ? "2" : "1");
  const [dipDate, setDipDate] = useState(sp.get("dipDate") || format(new Date(), "yyyy-MM-dd"));
  const [dipTime, setDipTime] = useState(format(new Date(), "HH:mm"));
  const [dipReadingType, setDipReadingType] = useState(sp.get("readingType") === "adhoc" ? "adhoc" : "opening");
  const [dipDepthCm, setDipDepthCm] = useState("");
  const [dipNotes, setDipNotes] = useState("");

  useEffect(() => {
    const entry = new URLSearchParams(searchString || window.location.search);
    if (entry.get("dipEntry") !== "1") return;
    const tank = entry.get("tank"), type = entry.get("readingType"), date = entry.get("dipDate");
    ["dipEntry", "tank", "readingType", "dipDate"].forEach(key => entry.delete(key));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${entry.size ? `?${entry}` : ""}${window.location.hash}`);
    if (dipDialogOpen) return;
    setDipEditingReading(null); setDipTankNumber(tank === "2" ? "2" : "1");
    setDipReadingType(type === "adhoc" ? "adhoc" : "opening");
    setDipDate(date || format(new Date(), "yyyy-MM-dd"));
    setDipTime(format(new Date(), "HH:mm")); setDipDepthCm(""); setDipNotes(""); setDipDialogOpen(true);
  }, [searchString]);

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
  const { data: packedStockPositions } = useQuery<{
    rows: Array<{ materialId: number; materialName: string; packedUnitName: string | null; partyId: number | null; partyName: string; stockUom: string; tank1: number; tank2: number; packed: number; unassigned: number; packedCount: number; total: number; tank1L: number | null; tank2L: number | null; packedL: number | null; totalL: number | null }>;
  }>({ queryKey: ["/api/plant-module/packed-stock-positions"] });
  const [showAllTankPositions, setShowAllTankPositions] = useState(false);
  const ldoPackedPositions = (packedStockPositions?.rows ?? []).filter(row => row.materialName.trim().toUpperCase() === "LDO");
  const visibleLdoPositions = visibleTankStockRows(ldoPackedPositions, showAllTankPositions);

  const balanceToL = (balance: number, uom: string) => {
    const u = normalizeWeightUnit(uom).toUpperCase();
    if (u === "MT") return balance * 1000 / LDO_DENSITY_KG_PER_LITER;
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
  const ldoPackedStockL = useMemo(() => (packedStockPositions?.rows ?? [])
    .filter(row => row.materialName.trim().toUpperCase() === "LDO")
    .reduce((sum, row) => sum + (row.packedL ?? (row.stockUom.toLowerCase().startsWith("lit") ? row.packed : 0)), 0),
  [packedStockPositions]);
  const ldoTankBookStockL = (packedStockPositions?.rows ?? [])
    .filter(row => row.materialName.trim().toUpperCase() === "LDO")
    .reduce((sum, row) => {
      if (row.tank1L != null && row.tank2L != null) return sum + row.tank1L + row.tank2L;
      return sum + balanceToL(row.tank1 + row.tank2, row.stockUom);
    }, 0);

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

  // Task #490 — Detect whether a material-receipt-linked flow reading already
  // exists for the date+tank the user is about to enter a manual receipt for,
  // so we can warn them before they double-count the delivery.
  const hasLinkedReceiptForDateTank = useMemo(() => {
    if (!readings || readingType !== "receipt") return false;
    const tank = parseInt(tankNumber);
    return readings.some(
      r =>
        r.readingType === "receipt" &&
        r.sourceMaterialReceiptId != null &&
        r.date === readingDate &&
        r.tankNumber === tank &&
        r.id !== editingReading?.id,
    );
  }, [readings, readingType, readingDate, tankNumber, editingReading]);

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
      if (filterDryerSrc !== "all") {
        if (filterDryerSrc === "T1") {
          if (r.tankNumber !== 2 || r.dryerFedFrom !== "TANK_1") return false;
        } else if (filterDryerSrc === "T2") {
          if (r.tankNumber !== 2 || r.dryerFedFrom === "TANK_1") return false;
        }
      }
      return true;
    });
  }, [readings, filterDateFrom, filterDateTo, filterTank, filterSource, filterDryerSrc]);

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

  const allMeterDays = useMemo(() => {
    if (!readings) return [];
    const grouped: Record<string, { date: string; entries: LdoFlowReading[] }> = {};
    for (const r of readings) {
      if (!grouped[r.date]) grouped[r.date] = { date: r.date, entries: [] };
      grouped[r.date].entries.push(r);
    }
    const sorted = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
    return sorted.map(day => {
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
  // Keep the existing history export and combined-card period unchanged.
  const dailySummary = useMemo(() => {
    const days = allMeterDays.filter(day => (!filterDateFrom || day.date >= filterDateFrom) && (!filterDateTo || day.date <= filterDateTo));
    return filterDateFrom || filterDateTo ? days : days.slice(0, 15);
  }, [allMeterDays, filterDateFrom, filterDateTo]);

  const totalConsumptionBothTanks = dailySummary.reduce((s, d) => s + d.totalConsumption, 0);

  // Per-tank stock balances. Dryer-meter rows tagged with
  // dryerFedFrom="TANK_1" debit Tank-1 instead of Tank-2.
  const tankStock = useMemo(() => {
    return {
      tank1: computeTankStock(readings, 1),
      tank2: computeTankStock(readings, 2),
    };
  }, [readings]);


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

    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

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

  const varianceData = useMemo(() => {
    if (!dispatches) return [];
    const dispatchByDate: Record<string, { production: number; theoreticalLdo: number }> = {};
    for (const d of dispatches) {
      if (filterDateFrom && d.date < filterDateFrom) continue;
      if (filterDateTo && d.date > filterDateTo) continue;
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

    // Use dip daily summary (official) or flow meter daily summary depending on toggle
    const activeSummary = officialMethod === "dip"
      ? dipDailySummary.map(d => ({
          date: d.date,
          t1Consumption: d.t1Consumption,
          t2Consumption: d.t2Consumption,
          totalConsumption: d.totalConsumed ?? 0,
        }))
      : dailySummary.map(d => ({
          date: d.date,
          t1Consumption: d.t1Consumption,
          t2Consumption: d.t2Consumption,
          totalConsumption: d.totalConsumption,
        }));

    for (const day of activeSummary) {
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
  }, [dispatches, dailySummary, dipDailySummary, officialMethod, filterDateFrom, filterDateTo]);


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

  const ldoDipGroupedDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const r of filteredDipReadings) {
      if (!seen.has(r.date)) { seen.add(r.date); dates.push(r.date); }
    }
    return dates;
  }, [filteredDipReadings]);

  const LDO_DIP_GROUPS_KEY = "open-date-groups:/plant/ldo-dip-readings";
  const [openLdoDipGroups, setOpenLdoDipGroups] = useState<Set<string>>(new Set());
  const ldoDipGroupsInitRef = useRef(false);
  useEffect(() => {
    if (ldoDipGroupsInitRef.current || ldoDipGroupedDates.length === 0) return;
    ldoDipGroupsInitRef.current = true;
    try {
      const stored = sessionStorage.getItem(LDO_DIP_GROUPS_KEY);
      if (stored !== null) {
        const parsed: string[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(d => ldoDipGroupedDates.includes(d));
          setOpenLdoDipGroups(new Set(valid));
          return;
        }
      }
    } catch {
      // ignore malformed sessionStorage value
    }
    setOpenLdoDipGroups(new Set([ldoDipGroupedDates[0]]));
  }, [ldoDipGroupedDates]);

  const toggleLdoDipGroup = (date: string) => {
    setOpenLdoDipGroups(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      try {
        sessionStorage.setItem(LDO_DIP_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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
      let description = err.message;
      let isDuplicate = false;
      try {
        const jsonStr = err.message.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(jsonStr);
        if (parsed?.message) description = parsed.message;
        if (err.message.startsWith("409:")) isDuplicate = true;
      } catch {}
      toast({ title: isDuplicate ? "Duplicate reading" : "Error", description, variant: "destructive" });
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

  function getReadingSourceLabel(r: LdoFlowReading): string {
    const src = classifyReadingSource(r);
    if (src === "material-receipt" && r.sourceMaterialReceiptId) return `From Material Receipt #${r.sourceMaterialReceiptId}`;
    if (src === "material-issue" && r.sourceMaterialIssueId) return `From Material Issue #${r.sourceMaterialIssueId}`;
    return SOURCE_LABELS[src];
  }

  function exportExcel() {
    const data = filteredReadings.map(r => ({
      Date: r.date,
      Time: r.time || "",
      Tank: TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`,
      "Dryer Src": r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← LDO tank 1 (small vertical)" : "",
      "Meter Reading (L)": r.meterReading,
      Type: r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      "Receipt Qty (L)": r.quantityLiters || "",
      Source: getReadingSourceLabel(r),
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
    }));
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Daily Summary");
    if (visibleLdoPositions.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tankStockExportRows(visibleLdoPositions)), "Stock Positions");

    XLSX.writeFile(wb, `ldo_flow_readings_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`LDO Flow Meter Readings - ${companyShortName} Plant`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    const tableData = filteredReadings.map(r => [
      r.date, r.time || "",
      TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`,
      r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← LDO tank 1 (small vertical)" : "",
      r.meterReading.toFixed(3),
      r.readingType.charAt(0).toUpperCase() + r.readingType.slice(1),
      r.quantityLiters ? r.quantityLiters.toFixed(3) : "",
      getReadingSourceLabel(r),
      r.notes || "",
    ]);
    autoTable(doc, {
      head: [["Date", "Time", "Tank", "Dryer Src", "Meter (L)", "Type", "Receipt Qty (L)", "Source", "Notes"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 9 },
    });
    if (visibleLdoPositions.length) {
      doc.addPage(); doc.text(TANK_STOCK_NOTE, 14, 15);
      autoTable(doc, { head: [TANK_STOCK_HEADERS], body: visibleLdoPositions.map(tankStockCells), startY: 24, styles: { fontSize: 9 } });
    }
    doc.save(`ldo_flow_readings_${format(new Date(), "yyyyMMdd")}.pdf`);
  }

  function printData() {
    const printContent = `
      <html><head><title>LDO Flow Meter Readings</title>
      <style>body{font-family:Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px 8px;text-align:left;font-size:12px}th{background:#f0f0f0}.header{margin-bottom:15px}</style></head>
      <body><div class="header"><h2>LDO Flow Meter Readings - ${companyShortName} Plant</h2><p>Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></div>
      <table><tr><th>Date</th><th>Time</th><th>Tank</th><th>Dryer Src</th><th>Meter (L)</th><th>Type</th><th>Receipt Qty (L)</th><th>Source</th><th>Notes</th></tr>
      ${filteredReadings.map(r => `<tr><td>${r.date}</td><td>${r.time || ""}</td><td>${TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`}</td><td>${r.tankNumber === 2 && r.dryerFedFrom === "TANK_1" ? "← LDO tank 1 (small vertical)" : ""}</td><td>${r.meterReading.toFixed(3)}</td><td>${r.readingType}</td><td>${r.quantityLiters ? r.quantityLiters.toFixed(3) : ""}</td><td>${getReadingSourceLabel(r)}</td><td>${r.notes || ""}</td></tr>`).join("")}
      </table>${tankStockPrintTable(visibleLdoPositions)}</body></html>`;
    openPrintableHtmlOrPreview(printContent, "LDO flow meter readings", `ldo-flow-readings-${format(new Date(), "yyyyMMdd")}.html`);
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
        <TankBookStock kind="ldo" plantName={urlPlant} defaultPlantName={defaultPlantName} settingsOnly />
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
          <Button variant="outline" size="sm" data-testid="link-ldo-reconciliation" className="text-sm gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Book vs Physical
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="ldo-tanks">
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

      <Card data-testid="ldo-packed-stock-summary">
        <CardHeader className="pb-2"><CardTitle className="text-base">Whose LDO</CardTitle></CardHeader>
        <CardContent><TankStockPositions rows={ldoPackedPositions} owner={false} showAll={showAllTankPositions} onShowAllChange={setShowAllTankPositions} /></CardContent>
      </Card>
      <NegativeBalanceBanner balances={ldoPartyBalances} parties={parties} material="LDO" testid="banner-negative-ldo" />
      <TrackerConsumption kind="ldo" days={dipDailySummary.map(day => ({
        date: day.date, actual: day.totalConsumed,
      }))} meterDays={allMeterDays.map(day => ({ date: day.date, dryer: day.t2Consumption }))}
        dispatches={dispatches} parties={parties} canViewNormActual={canViewNormActual} canExport={canExport} />

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">Dip readings</CardTitle>
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
              <div className="space-y-1" data-testid="table-dip-readings">
                {ldoDipGroupedDates.map(date => {
                  const isOpen = openLdoDipGroups.has(date);
                  const dateReadings = filteredDipReadings.filter(r => r.date === date);
                  return (
                    <div key={date}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-2 flex-wrap border-b py-2 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => toggleLdoDipGroup(date)}
                        data-testid={`button-toggle-dip-date-${date}`}
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
                            <thead className="sticky top-0 z-10 bg-background">
                              <tr className="border-b">
                                <th className="text-left p-2">Time</th>
                                <th className="text-left p-2">Tank</th>
                                <th className="text-right p-2">Depth (cm)</th>
                                <th className="text-right p-2">Volume (L)</th>
                                <th className="text-left p-2">Type</th>
                                <th className="text-left p-2">Source</th>
                                <th className="text-left p-2">Notes</th>
                                {isAdmin && <th className="text-center p-2">Actions</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {dateReadings.map(r => {
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
                        <td className="p-2">{r.time || "-"}</td>
                        <td className="p-2">
                          <Badge variant={r.tankNumber === 1 ? "default" : "secondary"} data-testid={`badge-dip-tank-${r.id}`}>
                            {TANK_LABELS[r.tankNumber] || `Tank ${r.tankNumber}`}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-medium" data-testid={`text-dip-depth-${r.id}`}>{r.depthCm}</td>
                        <td className="p-2 text-right" data-testid={`text-dip-vol-${r.id}`}>{r.volumeLiters.toFixed(0)}</td>
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">Flow meter readings</CardTitle>
            {canExport && (
              <div className="flex gap-2 flex-wrap">
                {canExport && <><Button variant="outline" size="sm" onClick={() => exportExcel()} data-testid="button-export-excel">
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportPdf()} data-testid="button-export-pdf">
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => printData()} data-testid="button-print">
                  <Printer className="w-4 h-4 mr-1" /> Print
                </Button></>}
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
                <SelectItem value="material-receipt">Only Mat. Receipt</SelectItem>
                <SelectItem value="material-issue">Only Mat. Issue</SelectItem>
                <SelectItem value="manual">Only Manual</SelectItem>
                <SelectItem value="backfill">Only Backfill</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDryerSrc} onValueChange={setFilterDryerSrc}>
              <SelectTrigger className="w-40" data-testid="select-filter-dryer-src">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dryer Src</SelectItem>
                <SelectItem value="T1">LDO tank 1 (small vertical) only</SelectItem>
                <SelectItem value="T2">LDO tank 2 (big horizontal) only</SelectItem>
              </SelectContent>
            </Select>
            {(filterDateFrom || filterDateTo || filterTank !== "all" || filterSource !== "all" || filterDryerSrc !== "all" || reconDateFrom || reconDateTo || reconPartyId !== "all" || reconMixTemplateId !== "all" || reconSite !== "all") && (
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
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Tank</th>
                    <th className="text-left p-2">Dryer src</th>
                    <th className="text-right p-2">Meter reading (L)</th>
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
                            : src === "material-receipt"
                              ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200 no-default-hover-elevate no-default-active-elevate"
                              : src === "material-issue"
                                ? "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200 no-default-hover-elevate no-default-active-elevate"
                                : "no-default-hover-elevate no-default-active-elevate";
                    const srcLabel =
                      src === "material-receipt" && r.sourceMaterialReceiptId
                        ? `From Material Receipt #${r.sourceMaterialReceiptId}`
                        : src === "material-issue" && r.sourceMaterialIssueId
                          ? `From Material Issue #${r.sourceMaterialIssueId}`
                          : SOURCE_LABELS[src];
                    const srcTitle =
                      src === "backfill"
                        ? "Entered via the admin LDO Backfill tool"
                        : src === "shift-log"
                          ? "Auto-created from a plant shift log"
                          : src === "heating-session"
                            ? "Auto-created from a bitumen heating session"
                            : src === "material-receipt"
                              ? `Auto-created from Material Receipt #${r.sourceMaterialReceiptId}`
                              : src === "material-issue"
                                ? `Auto-created from Material Issue #${r.sourceMaterialIssueId}`
                                : "Manually entered on this page";
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
                            className="text-sm border-amber-500 text-amber-700 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate"
                            title="Dryer is fed from LDO tank 1 (small vertical) stock"
                            data-testid={`badge-dryer-src-${r.id}`}
                          >
                            ← LDO tank 1 (small vertical)
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
                        {src === "material-receipt" && r.sourceMaterialReceiptId ? (
                          <Link href={`/plant/material-receipts?highlight=${r.sourceMaterialReceiptId}`}>
                            <Badge
                              variant="secondary"
                              className={`${srcClass} cursor-pointer underline-offset-2 hover:underline`}
                              data-testid={`badge-source-${r.id}`}
                              title={`${srcTitle} — click to view receipt`}
                            >
                              {srcLabel}
                            </Badge>
                          </Link>
                        ) : src === "material-issue" && r.sourceMaterialIssueId ? (
                          <Link href={`/plant/material-issues?highlight=${r.sourceMaterialIssueId}`}>
                            <Badge
                              variant="secondary"
                              className={`${srcClass} cursor-pointer underline-offset-2 hover:underline`}
                              data-testid={`badge-source-${r.id}`}
                              title={`${srcTitle} — click to view issue`}
                            >
                              {srcLabel}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge
                            variant={src === "manual" ? "outline" : "secondary"}
                            className={srcClass}
                            data-testid={`badge-source-${r.id}`}
                            title={srcTitle}
                          >
                            {srcLabel}
                          </Badge>
                        )}
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
              <Label>Reading type</Label>
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
                    <SelectItem value="TANK_2">Tank 2 (big horizontal, default)</SelectItem>
                    <SelectItem value="TANK_1">LDO tank 1 (small vertical)</SelectItem>
                  </SelectContent>
                </Select>
                {dryerFedFrom === "TANK_1" && (
                  <p className="text-sm text-amber-600 mt-1">Consumption will be debited from LDO tank 1 (small vertical) stock.</p>
                )}
              </div>
            )}

            {readingType !== "stock" && (
              <div>
                <Label>Flow meter reading (liters)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={meterReading}
                  onChange={e => setMeterReading(e.target.value)}
                  placeholder="e.g. 15000"
                  data-testid="input-meter-reading"
                />
              </div>
            )}

            {readingType === "receipt" && hasLinkedReceiptForDateTank && (
              <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="warning-linked-receipt">
                <strong>Possible double-count:</strong> A receipt for this date and tank was already auto-created from a Material Receipt entry. Adding another manual receipt row will count this delivery twice. Only proceed if this is a separate, additional delivery.
              </div>
            )}

            {readingType === "receipt" && (
              <div>
                <Label>Receipt quantity (liters) <span className="text-sm text-muted-foreground">- How much LDO was received</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantityLiters}
                  onChange={e => setQuantityLiters(e.target.value)}
                  placeholder="e.g. 5000"
                  data-testid="input-receipt-quantity"
                />
              </div>
            )}

            {readingType === "stock" && (
              <div>
                <Label>Current stock quantity (liters) <span className="text-sm text-muted-foreground">- Physical stock in tank</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantityLiters}
                  onChange={e => setQuantityLiters(e.target.value)}
                  placeholder="e.g. 8000"
                  data-testid="input-stock-quantity"
                />
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
              <Label>Reading type</Label>
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
              <Label>Dip depth (cm)</Label>
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
