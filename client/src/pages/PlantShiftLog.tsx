import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus, Trash2, Save, FileText, Loader2, Pencil, Users, FolderOpen } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { SHIFT_IDLE_REASONS, LABOUR_CATEGORIES, LABOUR_GENDERS, heatingSessionTypeLabel } from "@shared/schema";
import type { PlantShiftLog as PlantShiftLogRow, PlantShiftLogWithDetails, BitumenHeatingSession } from "@shared/schema";
import { getVolumeAtDepth, getUsableVolume, BITUMEN_DENSITY_KG_PER_LITER, LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { getLdoVolumeAtDepth, getLdoDeadStockVolume } from "@shared/ldo-dip-chart";
import DryerSourceFixDialog from "@/components/DryerSourceFixDialog";
import type { DryerSourceFixTarget } from "@/components/DryerSourceFixDialog";

type ManpowerRow = {
  name: string;
  role?: string | null;
  contractorName?: string | null;
  category?: string | null;
  gender?: string | null;
};
type IdleRow = { startTime: string; endTime?: string | null; reason: string; remarks?: string | null };

export default function PlantShiftLog() {
  const { toast } = useToast();
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const [, params] = useRoute("/plant/shift-log/:date");
  const today = format(new Date(), "yyyy-MM-dd");
  const dateParam = params?.date || today;

  // View mode: list when no :date in URL, edit when specific date.
  const [viewMode, setViewMode] = useState<"list" | "edit">(params?.date ? "edit" : "list");
  const [listDateFrom, setListDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [listDateTo, setListDateTo] = useState(today);
  const [listDryerFilter, setListDryerFilter] = useState<"all" | "TANK_1" | "TANK_2">("all");
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const [date, setDate] = useState(dateParam);
  const [shiftCode, setShiftCode] = useState("DAY");
  const [plantStartTime, setPlantStartTime] = useState("");
  const [plantStopTime, setPlantStopTime] = useState("");
  const [weather, setWeather] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [remarks, setRemarks] = useState("");

  const [bitumenTank1Temp, setBitumenTank1Temp] = useState("");
  const [bitumenTank2Temp, setBitumenTank2Temp] = useState("");
  const [bitumenTank1OpeningDip, setBitumenTank1OpeningDip] = useState("");
  const [bitumenTank1ClosingDip, setBitumenTank1ClosingDip] = useState("");
  const [bitumenTank2OpeningDip, setBitumenTank2OpeningDip] = useState("");
  const [bitumenTank2ClosingDip, setBitumenTank2ClosingDip] = useState("");

  const [ldoTank1OpeningMeter, setLdoTank1OpeningMeter] = useState("");
  const [ldoTank1ClosingMeter, setLdoTank1ClosingMeter] = useState("");
  const [ldoTank2OpeningMeter, setLdoTank2OpeningMeter] = useState("");
  const [ldoTank2ClosingMeter, setLdoTank2ClosingMeter] = useState("");
  const [ldoTank1OpeningDip, setLdoTank1OpeningDip] = useState("");
  const [ldoTank1ClosingDip, setLdoTank1ClosingDip] = useState("");
  const [ldoTank2OpeningDip, setLdoTank2OpeningDip] = useState("");
  const [ldoTank2ClosingDip, setLdoTank2ClosingDip] = useState("");
  // Which physical tank fed the dryer this shift; controls which tank's
  // stock balance the dryer-meter consumption debits.
  const [dryerFedFrom, setDryerFedFrom] = useState<"TANK_1" | "TANK_2">("TANK_2");
  // Task #254 — operator toggle: when on, the boiler runs during production
  // and the Boiler Meter opening/closing inputs are shown (auto-fill from the
  // most recent heating session's closing meter). When off, those inputs are
  // hidden and contribute zero to the boiler-LDO total in the daily report.
  const [boilerRunsDuringProduction, setBoilerRunsDuringProduction] = useState(false);
  const [noMainPlantOps, setNoMainPlantOps] = useState(false);
  const [fixDialog, setFixDialog] = useState<{ open: boolean; target: DryerSourceFixTarget | null }>({ open: false, target: null });
  // Step 2 — detect ?focus=dryerFedFrom in URL so we can scroll and highlight
  // the "Which tank feeds the dryer?" field when navigated from a mismatch link.
  const focusDryerParam = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("focus") === "dryerFedFrom";
  }, []);
  const [dryerHighlighted, setDryerHighlighted] = useState(false);
  const dryerFocusRef = useRef<HTMLDivElement | null>(null);

  const [manpower, setManpower] = useState<ManpowerRow[]>([]);
  const [idleEvents, setIdleEvents] = useState<IdleRow[]>([]);

  // Manpower modal
  const [mpDialogOpen, setMpDialogOpen] = useState(false);
  const [mpEditingIdx, setMpEditingIdx] = useState<number | null>(null);
  const [mpDraft, setMpDraft] = useState<ManpowerRow>({ name: "", role: "", contractorName: "", category: "", gender: "" });

  // Idle modal
  const [idleDialogOpen, setIdleDialogOpen] = useState(false);
  const [idleEditingIdx, setIdleEditingIdx] = useState<number | null>(null);
  const [idleDraft, setIdleDraft] = useState<IdleRow>({ startTime: "", endTime: "", reason: "Material Shortage", remarks: "" });

  const openAddManpower = () => {
    setMpEditingIdx(null);
    setMpDraft({ name: "", role: "", contractorName: "", category: "", gender: "" });
    setMpDialogOpen(true);
  };
  const openEditManpower = (idx: number) => {
    setMpEditingIdx(idx);
    setMpDraft({ ...manpower[idx] });
    setMpDialogOpen(true);
  };
  const saveManpowerDraft = () => {
    if (!mpDraft.name?.trim() || !mpDraft.contractorName?.trim() || !mpDraft.category || !mpDraft.gender) {
      toast({ title: "Name, contractor, category, and gender are required", variant: "destructive" });
      return;
    }
    const row: ManpowerRow = {
      name: mpDraft.name.trim(),
      role: mpDraft.role || null,
      contractorName: mpDraft.contractorName.trim().toUpperCase(),
      category: (mpDraft.category || "").toUpperCase(),
      gender: (mpDraft.gender || "").toUpperCase(),
    };
    if (mpEditingIdx === null) setManpower([...manpower, row]);
    else {
      const c = [...manpower]; c[mpEditingIdx] = row; setManpower(c);
    }
    setMpDialogOpen(false);
  };
  const removeManpower = (idx: number) => setManpower(manpower.filter((_, i) => i !== idx));
  const rateCardKeyForRow = (m: ManpowerRow) =>
    m.category && m.gender ? `LAB_${m.category}_${m.gender}` : m.category ? `LAB_${m.category}` : "";

  const openAddIdle = () => {
    setIdleEditingIdx(null);
    setIdleDraft({ startTime: "", endTime: "", reason: "Material Shortage", remarks: "" });
    setIdleDialogOpen(true);
  };
  const openEditIdle = (idx: number) => {
    setIdleEditingIdx(idx);
    setIdleDraft({ ...idleEvents[idx] });
    setIdleDialogOpen(true);
  };
  const saveIdleDraft = () => {
    if (!idleDraft.startTime || !idleDraft.reason) {
      toast({ title: "Start time and reason are required", variant: "destructive" });
      return;
    }
    if (idleEditingIdx === null) setIdleEvents([...idleEvents, idleDraft]);
    else {
      const c = [...idleEvents]; c[idleEditingIdx] = idleDraft; setIdleEvents(c);
    }
    setIdleDialogOpen(false);
  };
  const removeIdle = (idx: number) => setIdleEvents(idleEvents.filter((_, i) => i !== idx));

  const idleMinutes = (e: IdleRow) => {
    if (!e.startTime || !e.endTime) return null;
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : null;
  };

  const [isFinalized, setIsFinalized] = useState(0);
  const [plantName, setPlantName] = useState(() => {
    if (typeof window === "undefined") return "Main Plant";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("plant") || "Main Plant";
  });
  const [savedId, setSavedId] = useState<number | null>(null);
  const [autoFillT1Source, setAutoFillT1Source] = useState<string>("");
  const [autoFillT1ClosingSource, setAutoFillT1ClosingSource] = useState<string>("");
  const [autoFillT2Source, setAutoFillT2Source] = useState<string>("");
  // Track values written by the auto-fill effect so a re-run with a more
  // accurate cutoff (after operator types plantStartTime) can replace them,
  // but a manually-typed value is never overwritten.
  const autoFilledT1ValueRef = useRef<string | null>(null);
  const autoFilledT1ClosingValueRef = useRef<string | null>(null);
  const autoFilledT2ValueRef = useRef<string | null>(null);

  const [autoFillBitumenT1Source, setAutoFillBitumenT1Source] = useState<string>("");
  const [autoFillBitumenT2Source, setAutoFillBitumenT2Source] = useState<string>("");
  const [autoFillLdoDipT1Source, setAutoFillLdoDipT1Source] = useState<string>("");
  const [autoFillLdoDipT2Source, setAutoFillLdoDipT2Source] = useState<string>("");
  const autoFilledBitumenT1Ref = useRef<string | null>(null);
  const autoFilledBitumenT2Ref = useRef<string | null>(null);
  const autoFilledLdoDipT1Ref = useRef<string | null>(null);
  const autoFilledLdoDipT2Ref = useRef<string | null>(null);

  const { data: existing, isLoading } = useQuery<PlantShiftLogWithDetails | undefined>({
    queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName],
    enabled: viewMode === "edit",
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/shift-logs/by-date/${date}?plant=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // List view query: all shift logs in the chosen date range.
  const { data: shiftLogs, isLoading: listLoading } = useQuery<PlantShiftLogRow[]>({
    queryKey: ["/api/plant-module/shift-logs", listDateFrom, listDateTo],
    enabled: viewMode === "list",
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (listDateFrom) qs.set("dateFrom", listDateFrom);
      if (listDateTo) qs.set("dateTo", listDateTo);
      const res = await fetch(`/api/plant-module/shift-logs?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Task #300 — Dryer-source mismatch audit: fetch cross-check data for the
  // visible date range so we can flag shift log rows where saved heating
  // sessions have a different dryerFedFrom value.
  type DryerMismatchRow = {
    date: string;
    plantName: string;
    shiftLogId: number | null;
    shiftLogValue: "TANK_1" | "TANK_2" | null;
    conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    hasMismatch: boolean;
  };
  const { data: dryerMismatchRows } = useQuery<DryerMismatchRow[]>({
    queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches", listDateFrom, listDateTo],
    enabled: viewMode === "list" && !!listDateFrom && !!listDateTo,
    queryFn: async () => {
      const qs = new URLSearchParams({ dateFrom: listDateFrom, dateTo: listDateTo });
      const res = await fetch(`/api/plant-module/heating-sessions/dryer-source-mismatches?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  // Keyed by "date||plantName" for O(1) lookup during row rendering.
  const dryerMismatchByKey = useMemo(() => {
    const map = new Map<string, DryerMismatchRow>();
    for (const r of dryerMismatchRows || []) {
      if (r.hasMismatch) map.set(`${r.date}||${r.plantName}`, r);
    }
    return map;
  }, [dryerMismatchRows]);

  const resetForNew = () => {
    setSavedId(null);
    setIsFinalized(0);
    setShiftCode("DAY");
    setPlantStartTime(""); setPlantStopTime("");
    setWeather(""); setAmbientTemp("");
    setOperatorName(""); setSupervisorName(""); setRemarks("");
    setBitumenTank1Temp(""); setBitumenTank2Temp("");
    setBitumenTank1OpeningDip(""); setBitumenTank1ClosingDip("");
    setBitumenTank2OpeningDip(""); setBitumenTank2ClosingDip("");
    setLdoTank1OpeningMeter(""); setLdoTank1ClosingMeter("");
    setLdoTank2OpeningMeter(""); setLdoTank2ClosingMeter("");
    setLdoTank1OpeningDip(""); setLdoTank1ClosingDip("");
    setLdoTank2OpeningDip(""); setLdoTank2ClosingDip("");
    setDryerFedFrom("TANK_2");
    setBoilerRunsDuringProduction(false);
    setNoMainPlantOps(false);
    setManpower([]); setIdleEvents([]);
    setAutoFillT1Source(""); setAutoFillT1ClosingSource(""); setAutoFillT2Source("");
    autoFilledT1ValueRef.current = null;
    autoFilledT1ClosingValueRef.current = null;
    autoFilledT2ValueRef.current = null;
    setAutoFillBitumenT1Source(""); setAutoFillBitumenT2Source("");
    setAutoFillLdoDipT1Source(""); setAutoFillLdoDipT2Source("");
    autoFilledBitumenT1Ref.current = null; autoFilledBitumenT2Ref.current = null;
    autoFilledLdoDipT1Ref.current = null; autoFilledLdoDipT2Ref.current = null;
  };

  const populateFormFromLog = useCallback((log: PlantShiftLogWithDetails) => {
    setSavedId(log.id);
    setShiftCode(log.shiftCode || "DAY");
    setPlantStartTime(log.plantStartTime || "");
    setPlantStopTime(log.plantStopTime || "");
    setWeather(log.weather || "");
    setAmbientTemp(log.ambientTemp?.toString() || "");
    setOperatorName(log.operatorName || "");
    setSupervisorName(log.supervisorName || "");
    setRemarks(log.remarks || "");
    setBitumenTank1Temp(log.bitumenTank1Temp?.toString() || "");
    setBitumenTank2Temp(log.bitumenTank2Temp?.toString() || "");
    setBitumenTank1OpeningDip(log.bitumenTank1OpeningDip?.toString() || "");
    setBitumenTank1ClosingDip(log.bitumenTank1ClosingDip?.toString() || "");
    setBitumenTank2OpeningDip(log.bitumenTank2OpeningDip?.toString() || "");
    setBitumenTank2ClosingDip(log.bitumenTank2ClosingDip?.toString() || "");
    setLdoTank1OpeningMeter(log.ldoTank1OpeningMeter?.toString() || "");
    setLdoTank1ClosingMeter(log.ldoTank1ClosingMeter?.toString() || "");
    setLdoTank2OpeningMeter(log.ldoTank2OpeningMeter?.toString() || "");
    setLdoTank2ClosingMeter(log.ldoTank2ClosingMeter?.toString() || "");
    setLdoTank1OpeningDip(log.ldoTank1OpeningDip?.toString() || "");
    setLdoTank1ClosingDip(log.ldoTank1ClosingDip?.toString() || "");
    setLdoTank2OpeningDip(log.ldoTank2OpeningDip?.toString() || "");
    setLdoTank2ClosingDip(log.ldoTank2ClosingDip?.toString() || "");
    setDryerFedFrom(log.dryerFedFrom === "TANK_1" ? "TANK_1" : "TANK_2");
    // Task #254 — back-compat: rows saved before the toggle existed default
    // boilerRunsDuringProduction to 0. If they have any T1 reading recorded,
    // treat the toggle as ON so editing+saving doesn't silently null those
    // legacy values (the save payload nulls T1 when the toggle is OFF).
    const legacyHasT1Reading = log.ldoTank1OpeningMeter != null || log.ldoTank1ClosingMeter != null;
    setBoilerRunsDuringProduction(!!log.boilerRunsDuringProduction || legacyHasT1Reading);
    setNoMainPlantOps(!!log.noMainPlantOps);
    setAutoFillT1Source(""); setAutoFillT1ClosingSource(""); setAutoFillT2Source("");
    autoFilledT1ValueRef.current = null;
    autoFilledT1ClosingValueRef.current = null;
    autoFilledT2ValueRef.current = null;
    setAutoFillBitumenT1Source(""); setAutoFillBitumenT2Source("");
    setAutoFillLdoDipT1Source(""); setAutoFillLdoDipT2Source("");
    autoFilledBitumenT1Ref.current = null; autoFilledBitumenT2Ref.current = null;
    autoFilledLdoDipT1Ref.current = null; autoFilledLdoDipT2Ref.current = null;
    setManpower(log.manpower.map(m => ({
      name: m.name,
      role: m.role,
      contractorName: m.contractorName ?? null,
      category: m.category ?? null,
      gender: m.gender ?? null,
    })));
    setIdleEvents(log.idleEvents.map(e => ({
      startTime: e.startTime, endTime: e.endTime, reason: e.reason, remarks: e.remarks,
    })));
    setIsFinalized(log.isFinalized || 0);
    setPlantName(log.plantName || "Main Plant");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditForDate = (d: string, plant: string, row?: PlantShiftLogRow) => {
    setDate(d);
    const resolvedPlant = plant || "Main Plant";
    setPlantName(resolvedPlant);
    resetForNew();

    const cached = queryClient.getQueryData<PlantShiftLogWithDetails | undefined>([
      "/api/plant-module/shift-logs/by-date",
      d,
      resolvedPlant,
    ]);

    if (cached) {
      populateFormFromLog(cached);
    } else if (row) {
      if (row.shiftCode) setShiftCode(row.shiftCode);
      if (row.plantStartTime) setPlantStartTime(row.plantStartTime);
      if (row.plantStopTime) setPlantStopTime(row.plantStopTime);
      if (row.weather) setWeather(row.weather);
      if (row.ambientTemp != null) setAmbientTemp(String(row.ambientTemp));
      if (row.operatorName) setOperatorName(row.operatorName);
      if (row.supervisorName) setSupervisorName(row.supervisorName);
    }

    setViewMode("edit");
  };
  const openNew = () => {
    setDate(today);
    setPlantName("Main Plant");
    resetForNew();
    setViewMode("edit");
  };
  const goBackToList = () => {
    setViewMode("list");
    queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
  };

  useEffect(() => {
    if (!existing) {
      setSavedId(null);
      setIsFinalized(0);
      return;
    }
    populateFormFromLog(existing);
  }, [existing, populateFormFromLog]);

  // Scroll + briefly highlight the "Which tank feeds the dryer?" section when
  // navigated here via ?focus=dryerFedFrom (i.e. from a mismatch fix link).
  useEffect(() => {
    if (!focusDryerParam) return;
    // Wait for the form to render before scrolling.
    const timer = setTimeout(() => {
      dryerFocusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setDryerHighlighted(true);
      setTimeout(() => setDryerHighlighted(false), 2500);
    }, 400);
    return () => clearTimeout(timer);
  }, [focusDryerParam, viewMode]);

  // Task #325 — fetch today's dispatches to compute live L/MT stats in the
  // LDO Flow Meters card. Only active in edit mode (no new API needed).
  const { data: todayDispatches } = useQuery<Array<{ loadWeight: number; plantName: string }>>({
    queryKey: ["/api/plant-module/dispatches", { dateFrom: date, dateTo: date, plant: plantName }],
    enabled: viewMode === "edit" && !!date && !!plantName,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/dispatches?dateFrom=${encodeURIComponent(date)}&dateTo=${encodeURIComponent(date)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
  });
  const numOrNullSafe = (s: string) => (s.trim() === "" ? null : parseFloat(s));
  const dipHint = (cm: string) => {
    if (cm.trim() === "") return null;
    const dipNum = numOrNullSafe(cm);
    if (dipNum === null) return null;
    const totalVol = getVolumeAtDepth(dipNum);
    const usableVol = getUsableVolume(dipNum);
    const deadVol = totalVol - usableVol;
    const totalMt = totalVol * BITUMEN_DENSITY_KG_PER_LITER / 1000;
    const usableMt = usableVol * BITUMEN_DENSITY_KG_PER_LITER / 1000;
    return `Total: ${totalMt.toFixed(2)} MT (${Math.round(totalVol).toLocaleString()} L) — Usable: ${usableMt.toFixed(2)} MT — Dead stock: ${Math.round(deadVol).toLocaleString()} L`;
  };

  const ldoDipHint = (tank: 1 | 2, cm: string) => {
    if (cm.trim() === "") return null;
    const dipNum = numOrNullSafe(cm);
    if (dipNum === null) return null;
    const totalVol = getLdoVolumeAtDepth(tank, dipNum);
    const deadVol = getLdoDeadStockVolume(tank);
    const usableVol = Math.max(0, totalVol - deadVol);
    const totalMt = totalVol * LDO_DENSITY_KG_PER_LITER / 1000;
    const usableMt = usableVol * LDO_DENSITY_KG_PER_LITER / 1000;
    return `Total: ${Math.round(totalVol).toLocaleString()} L (${totalMt.toFixed(3)} MT) — Usable: ${Math.round(usableVol).toLocaleString()} L (${usableMt.toFixed(3)} MT)`;
  };

  const numOrNull = (s: string) => s.trim() === "" ? null : parseFloat(s);

  const editedBy = "operator";

  const incompleteManpower = manpower.filter(
    m => m.name?.trim() && (!m.contractorName?.trim() || !m.category || !m.gender)
  );

  const saveMutation = useMutation({
    mutationFn: async (extra?: { pin?: string }) => {
      if (incompleteManpower.length > 0) {
        throw new Error(
          `${incompleteManpower.length} manpower row(s) are missing Contractor / Category / Gender. ` +
          `Open each row and complete the fields before saving (legacy rows must be backfilled).`
        );
      }
      const payload: Record<string, unknown> = {
        date, shiftCode, plantName,
        plantStartTime: plantStartTime || null,
        plantStopTime: plantStopTime || null,
        weather: weather || null,
        ambientTemp: numOrNull(ambientTemp),
        // Task #253 — bitumenTank{1,2}StockApproxMt removed from the form.
        // The columns remain on the table for audit; existing values are no
        // longer overwritten on save (server-side upsert preserves them).
        operatorName: operatorName || null,
        supervisorName: supervisorName || null,
        remarks: remarks || null,
        bitumenTank1Temp: numOrNull(bitumenTank1Temp),
        bitumenTank2Temp: numOrNull(bitumenTank2Temp),
        bitumenTank1OpeningDip: numOrNull(bitumenTank1OpeningDip),
        bitumenTank1ClosingDip: numOrNull(bitumenTank1ClosingDip),
        bitumenTank2OpeningDip: numOrNull(bitumenTank2OpeningDip),
        bitumenTank2ClosingDip: numOrNull(bitumenTank2ClosingDip),
        // Task #254 — when the boiler-runs-during-production toggle is OFF
        // we explicitly null the Boiler Meter (Tank-1) inputs so they don't
        // contribute phantom litres to the daily report. Dryer Meter (Tank-2)
        // is independent of the toggle.
        ldoTank1OpeningMeter: boilerRunsDuringProduction ? numOrNull(ldoTank1OpeningMeter) : null,
        ldoTank1ClosingMeter: boilerRunsDuringProduction ? numOrNull(ldoTank1ClosingMeter) : null,
        ldoTank2OpeningMeter: numOrNull(ldoTank2OpeningMeter),
        ldoTank2ClosingMeter: numOrNull(ldoTank2ClosingMeter),
        ldoTank1OpeningDip: numOrNull(ldoTank1OpeningDip),
        ldoTank1ClosingDip: numOrNull(ldoTank1ClosingDip),
        ldoTank2OpeningDip: numOrNull(ldoTank2OpeningDip),
        ldoTank2ClosingDip: numOrNull(ldoTank2ClosingDip),
        dryerFedFrom,
        boilerRunsDuringProduction: boilerRunsDuringProduction ? 1 : 0,
        noMainPlantOps,
        manpower: manpower
          .filter(m => m.name?.trim())
          .map(m => ({
            name: m.name.trim().toUpperCase(),
            role: m.role || null,
            contractorName: m.contractorName ? m.contractorName.trim().toUpperCase() : "",
            category: m.category ? m.category.toUpperCase() : "",
            gender: m.gender ? m.gender.toUpperCase() : "",
          })),
        idleEvents: idleEvents.filter(e => e.startTime && e.reason),
        editedBy,
      };
      if (extra?.pin) payload.pin = extra.pin;
      const res = await fetch("/api/plant-module/shift-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 401) {
          if (window.location.pathname !== "/login") window.location.assign("/login");
          throw new Error("Session expired. Please log in again.");
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.code === "FINALIZED_LOCKED") {
            const e = new Error(body.message || "This shift log is finalized and cannot be edited.") as Error & { locked?: boolean };
            e.locked = true;
            throw e;
          }
          throw new Error(body.message || "Forbidden");
        }
        const text = (await res.text().catch(() => "")) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName] });
      setSavedId(data.id);
      setIsFinalized(1);
      toast({ title: "Shift log saved" });
      // Auto-finalize so the operator doesn't need a second click — server no
      // longer requires a PIN. Then return to the list view.
      try {
        await apiRequest("POST", `/api/plant-module/shift-logs/${data.id}/finalize`, { finalizedBy: "operator" });
      } catch { /* save already succeeded */ }
      goBackToList();
      // Cross-check: warn if any heating session for the same date+plant has a
      // different dryerFedFrom (non-blocking — stock routing is unchanged).
      // Fire-and-forget so list navigation is not delayed.
      fetch(
        `/api/plant-module/heating-sessions?date=${encodeURIComponent(date)}&plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" }
      ).then(hsRes => {
        if (!hsRes.ok) return;
        return hsRes.json().then((sessions: Array<{ id?: number; dryerFedFrom?: string }>) => {
          const mismatch = sessions.find(s => s.dryerFedFrom && s.dryerFedFrom !== dryerFedFrom);
          if (mismatch && mismatch.id != null) {
            const slLabel = dryerFedFrom === "TANK_1" ? "Boiler tank" : "Dryer tank";
            const hsLabel = mismatch.dryerFedFrom === "TANK_1" ? "Boiler tank" : "Dryer tank";
            const fixTarget: DryerSourceFixTarget = {
              mode: "heating-session",
              recordId: mismatch.id,
              date,
              suggestedValue: dryerFedFrom as "TANK_1" | "TANK_2",
              currentValue: mismatch.dryerFedFrom as "TANK_1" | "TANK_2",
            };
            toast({
              title: "Dryer-source mismatch",
              description: `This shift log says dryer fed from ${slLabel}, but a heating session for ${date} says ${hsLabel}.`,
              variant: "destructive",
              action: (
                <ToastAction
                  altText="Fix heating session"
                  onClick={() => setFixDialog({ open: true, target: fixTarget })}
                >
                  Fix heating session
                </ToastAction>
              ),
            });
          }
        });
      }).catch(() => { /* non-fatal */ });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Nothing to delete");
      const res = await apiRequest("DELETE", `/api/plant-module/shift-logs/${savedId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      toast({ title: "Shift log deleted" });
      goBackToList();
    },
    onError: (err: any) => {
      if (err?.message === "Cancelled") return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  // Task #332 — Bulk-align dryerFedFrom on conflicting sessions in one click.
  const alignMutation = useMutation({
    mutationFn: async ({ sessionIds, targetValue }: { sessionIds: number[]; targetValue: "TANK_1" | "TANK_2" }) => {
      const res = await apiRequest("PATCH", "/api/plant-module/heating-sessions/align-dryer-source", { sessionIds, targetValue });
      return res.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      const label = variables.targetValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
      toast({ title: `${data.updatedCount} session${data.updatedCount !== 1 ? "s" : ""} aligned to ${label}` });
    },
    onError: (err: any) => {
      toast({ title: "Align failed", description: err.message, variant: "destructive" });
    },
  });

  // Task #353 — Fix shift log to match sessions (bidirectional quick-fix).
  const fixShiftLogMutation = useMutation({
    mutationFn: async ({ shiftLogId, dryerFedFrom }: { shiftLogId: number; dryerFedFrom: "TANK_1" | "TANK_2" }) => {
      const res = await apiRequest("PATCH", `/api/plant-module/shift-logs/${shiftLogId}/dryer-source`, { dryerFedFrom });
      return res.json() as Promise<{ success: boolean }>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      const label = variables.dryerFedFrom === "TANK_1" ? "Boiler tank" : "Dryer tank";
      toast({ title: `Shift log updated to ${label}` });
    },
    onError: (err: any) => {
      toast({ title: "Fix shift log failed", description: err.message, variant: "destructive" });
    },
  });

  // Task #254 — Reactive query: roll up every heating session attributed to
  // this production day (i.e. all sessions since the prior production day,
  // overnight pre-heat included). Drives both the Boiler Meter auto-prefill
  // and the "Heating Sessions for this Production" card. Using useQuery
  // ensures the shift log picks up new/edited sessions via cache
  // invalidation (e.g. after saving a session).
  const { data: heatingSessionsForDate } = useQuery<BitumenHeatingSession[]>({
    queryKey: ["/api/plant-module/heating-sessions", { servedByProductionDate: date, plant: plantName }],
    enabled: viewMode === "edit" && !!date,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/heating-sessions?servedByProductionDate=${date}&plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Task #254 — Auto-fill Boiler Meter opening (only when the operator has
  // toggled "Boiler runs during production" on) from the most recent prior
  // session's closing meter. Falls back to /ldo-meter/last when no session
  // closing is available. Closing is never auto-filled — the operator enters
  // it at end-of-shift. Dryer Meter opening uses yesterday's closing as
  // before (independent of the toggle). Manually-typed values are never
  // overwritten.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;

    // Task #254 — when editing an existing shift log we *normally* never
    // overwrite saved values (`existing` short-circuits below). The one
    // exception is the Boiler Meter Tank-1 opening: if the operator just
    // turned the "Boiler runs during production" toggle ON and the opening
    // field is still empty (e.g. the log was originally saved with the
    // toggle OFF), we still want to auto-fill from the prior session
    // closing. T2 / fallback paths keep the old "skip on edit" behaviour.
    const editingExisting = !!existing;
    const allowT1OpenAutoFillOnEdit =
      editingExisting && boilerRunsDuringProduction && !ldoTank1OpeningMeter;

    // Boiler Meter (Tank-1) opening: only auto-fill when the toggle is on.
    if (boilerRunsDuringProduction && (!editingExisting || allowT1OpenAutoFillOnEdit)) {
      const t1OpenIsEmpty = !ldoTank1OpeningMeter;
      const t1OpenIsAutoFilled = ldoTank1OpeningMeter && ldoTank1OpeningMeter === autoFilledT1ValueRef.current;
      const wantT1Open = t1OpenIsEmpty || t1OpenIsAutoFilled;

      const safe: BitumenHeatingSession[] = Array.isArray(heatingSessionsForDate) ? heatingSessionsForDate : [];
      // Most recent session closing across the production-day attribution
      // window: sort by date desc, then endTime (or startTime) desc.
      const closeCandidates = safe
        .filter(s => s && s.ldoTank1ClosingMeter != null)
        .sort((a, b) => {
          const dCmp = String(b.date || "").localeCompare(String(a.date || ""));
          if (dCmp !== 0) return dCmp;
          return String(b.endTime || b.startTime || "").localeCompare(String(a.endTime || a.startTime || ""));
        });
      const sessClose = closeCandidates[0]?.ldoTank1ClosingMeter;

      if (wantT1Open && typeof sessClose === "number") {
        const next = String(sessClose);
        setLdoTank1OpeningMeter(prev => {
          if (prev && prev !== autoFilledT1ValueRef.current) return prev;
          autoFilledT1ValueRef.current = next;
          setAutoFillT1Source("Last Heating Session Closing");
          return next;
        });
      } else if (wantT1Open && heatingSessionsForDate !== undefined && (!safe.length || closeCandidates.length === 0)) {
        // Fallback: use the most recent meter reading before shift start
        // (yesterday's closing, etc.) once the sessions query has resolved.
        const before = `${date}T${plantStartTime || "23:59"}`;
        type LdoLast = { value: number; source: string };
        fetch(`/api/plant-module/ldo-meter/last?tank=1&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
          .then(r => r.ok ? (r.json() as Promise<LdoLast | null>) : null)
          .then((data) => {
            if (cancelled) return;
            if (data && typeof data.value === "number") {
              const next = String(data.value);
              setLdoTank1OpeningMeter(prev => {
                if (prev && prev !== autoFilledT1ValueRef.current) return prev;
                autoFilledT1ValueRef.current = next;
                setAutoFillT1Source(data.source);
                return next;
              });
            }
          })
          .catch(() => {});
      }
    }
    if (!ldoTank2OpeningMeter) {
      const before = `${date}T00:00`;
      type LdoLastT2 = { value: number; source: string };
      fetch(`/api/plant-module/ldo-meter/last?tank=2&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
        .then(r => r.ok ? (r.json() as Promise<LdoLastT2 | null>) : null)
        .then((data) => {
          if (cancelled) return;
          if (data && typeof data.value === "number") {
            const next = String(data.value);
            setLdoTank2OpeningMeter(prev => {
              if (prev) return prev;
              autoFilledT2ValueRef.current = next;
              setAutoFillT2Source(data.source);
              return next;
            });
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
    // Task #254 — include `boilerRunsDuringProduction` so flipping the toggle
    // ON after the heating-session query has already resolved still triggers
    // the auto-fill of the Boiler Meter Opening from the prior session's
    // closing. Without this dep the effect only ran on initial mount / data
    // load and the operator would have to re-edit something to prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, date, plantName, plantStartTime, heatingSessionsForDate, boilerRunsDuringProduction]);

  // Carry-forward: auto-fill opening dip readings from previous day's closing dip
  useEffect(() => {
    if (!date || existing) return;
    let cancelled = false;
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().slice(0, 10);
    fetch(`/api/plant-module/shift-logs/by-date?date=${prevDateStr}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((prev: { bitumenTank1ClosingDip?: number | null; bitumenTank2ClosingDip?: number | null; ldoTank1ClosingDip?: number | null; ldoTank2ClosingDip?: number | null } | null) => {
        if (cancelled || !prev) return;
        if (prev.bitumenTank1ClosingDip != null) {
          const next = String(prev.bitumenTank1ClosingDip);
          setBitumenTank1OpeningDip(cur => {
            if (cur && cur !== autoFilledBitumenT1Ref.current) return cur;
            autoFilledBitumenT1Ref.current = next;
            setAutoFillBitumenT1Source(`${prevDateStr} closing dip`);
            return next;
          });
        }
        if (prev.bitumenTank2ClosingDip != null) {
          const next = String(prev.bitumenTank2ClosingDip);
          setBitumenTank2OpeningDip(cur => {
            if (cur && cur !== autoFilledBitumenT2Ref.current) return cur;
            autoFilledBitumenT2Ref.current = next;
            setAutoFillBitumenT2Source(`${prevDateStr} closing dip`);
            return next;
          });
        }
        if (prev.ldoTank1ClosingDip != null) {
          const next = String(prev.ldoTank1ClosingDip);
          setLdoTank1OpeningDip(cur => {
            if (cur && cur !== autoFilledLdoDipT1Ref.current) return cur;
            autoFilledLdoDipT1Ref.current = next;
            setAutoFillLdoDipT1Source(`${prevDateStr} closing dip`);
            return next;
          });
        }
        if (prev.ldoTank2ClosingDip != null) {
          const next = String(prev.ldoTank2ClosingDip);
          setLdoTank2OpeningDip(cur => {
            if (cur && cur !== autoFilledLdoDipT2Ref.current) return cur;
            autoFilledLdoDipT2Ref.current = next;
            setAutoFillLdoDipT2Source(`${prevDateStr} closing dip`);
            return next;
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, plantName, existing]);

  // Derived
  const ldoTotal = useMemo(() => {
    const t1Open = parseFloat(ldoTank1OpeningMeter), t1Close = parseFloat(ldoTank1ClosingMeter);
    const t2Open = parseFloat(ldoTank2OpeningMeter), t2Close = parseFloat(ldoTank2ClosingMeter);
    const t1 = (!isNaN(t1Open) && !isNaN(t1Close)) ? Math.max(0, t1Close - t1Open) : null;
    const t2 = (!isNaN(t2Open) && !isNaN(t2Close)) ? Math.max(0, t2Close - t2Open) : null;
    return { t1, t2, total: (t1 || 0) + (t2 || 0) };
  }, [ldoTank1OpeningMeter, ldoTank1ClosingMeter, ldoTank2OpeningMeter, ldoTank2ClosingMeter]);

  // Filter heating sessions to only those within the shift time window.
  // Sessions from prior dates (overnight pre-heating) are always included.
  // Same-date sessions are only shown if they overlap with [plantStartTime, plantStopTime].
  const filteredHeatingSessionsForShiftLog = useMemo(() => {
    const all = Array.isArray(heatingSessionsForDate) ? heatingSessionsForDate : [];
    if (!plantStartTime || !plantStopTime) return all;
    return all.filter(s => {
      if (!s.date || s.date < date) return true; // prior-date pre-heating always shown
      const sStart = s.startTime || "00:00";
      const sEnd = s.endTime || "23:59";
      return sStart <= plantStopTime && sEnd >= plantStartTime;
    });
  }, [heatingSessionsForDate, date, plantStartTime, plantStopTime]);

  // Task #325 — plant run hours derived from header start/stop times.
  const plantRunHours = useMemo(() => {
    if (!plantStartTime || !plantStopTime) return null;
    const [sh, sm] = plantStartTime.split(":").map(Number);
    const [eh, em] = plantStopTime.split(":").map(Number);
    if (isNaN(sh) || isNaN(eh)) return null;
    let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
    if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
  }, [plantStartTime, plantStopTime]);

  // Total MT dispatched today for this plant.
  const totalDispatchedMt = useMemo(() => {
    if (!todayDispatches) return null;
    const rows = todayDispatches.filter(d => d.plantName === plantName);
    if (!rows.length) return null;
    return rows.reduce((sum, d) => sum + (d.loadWeight || 0), 0);
  }, [todayDispatches, plantName]);

  // Six live stats shown below the LDO meter inputs.
  const liveStats = useMemo(() => {
    const boilerL = boilerRunsDuringProduction ? ldoTotal.t1 : null;
    const dryerL = ldoTotal.t2;
    const hrs = plantRunHours;
    const mt = totalDispatchedMt;
    const hasAny = boilerL != null || dryerL != null;
    return {
      boilerLHr: (boilerL != null && hrs && hrs > 0) ? boilerL / hrs : null,
      dryerLHr: (dryerL != null && hrs && hrs > 0) ? dryerL / hrs : null,
      combinedLHr: (hasAny && hrs && hrs > 0) ? ((boilerL ?? 0) + (dryerL ?? 0)) / hrs : null,
      dryerLMt: (dryerL != null && mt && mt > 0) ? dryerL / mt : null,
      boilerLMt: (boilerL != null && mt && mt > 0) ? boilerL / mt : null,
      combinedLMt: (mt && mt > 0 && hasAny)
        ? ((boilerL ?? 0) + (dryerL ?? 0)) / mt : null,
      noDispatches: todayDispatches != null && totalDispatchedMt == null,
    };
  }, [ldoTotal, plantRunHours, totalDispatchedMt, boilerRunsDuringProduction, todayDispatches]);

  if (viewMode === "list") {
    const sorted = (shiftLogs || []).slice()
      .filter(r => listDryerFilter === "all" || r.dryerFedFrom === listDryerFilter)
      .sort(
        (a, b) => b.date.localeCompare(a.date) || (a.shiftCode || "").localeCompare(b.shiftCode || "")
      );
    const grouped: Record<string, PlantShiftLogRow[]> = {};
    for (const r of sorted) (grouped[r.date] = grouped[r.date] || []).push(r);
    return (
      <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={backLink}>
              <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Plant Logs</h1>
              <p className="text-sm text-muted-foreground">Daily plant runs — pick a date to open or start a new log</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">From</Label>
              <Input type="date" value={listDateFrom} onChange={e => setListDateFrom(e.target.value)} className="w-40" data-testid="input-list-from" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">To</Label>
              <Input type="date" value={listDateTo} onChange={e => setListDateTo(e.target.value)} className="w-40" data-testid="input-list-to" />
            </div>
            <Select value={listDryerFilter} onValueChange={v => setListDryerFilter(v as "all" | "TANK_1" | "TANK_2")}>
              <SelectTrigger className="w-36 h-9 text-xs" data-testid="select-dryer-filter">
                <SelectValue placeholder="Dryer fed from" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tanks</SelectItem>
                <SelectItem value="TANK_1">Boiler tank</SelectItem>
                <SelectItem value="TANK_2">Dryer tank</SelectItem>
              </SelectContent>
            </Select>
            <Link href={appendPlantContext("/plant/shift-log-manpower-review", { defaultTab: "operations" })}>
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 dark:text-amber-400" data-testid="link-manpower-review">
                <Users className="w-4 h-4 mr-1" />Review UNKNOWN
              </Button>
            </Link>
            <Button onClick={openNew} data-testid="button-new-shift-log"><Plus className="w-4 h-4 mr-1" />New Log</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Plant Logs {listDateFrom} → {listDateTo}</CardTitle></CardHeader>
          <CardContent>
            {listLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
              !sorted.length ? <p className="text-sm text-muted-foreground">{listDryerFilter !== "all" ? `No plant logs with dryer fed from ${listDryerFilter === "TANK_1" ? "Boiler tank" : "Dryer tank"} in this date range.` : "No plant logs in this date range."}</p> :
              <div className="space-y-4">
                {Object.keys(grouped).map(d => (
                  <div key={d}>
                    <div className="sticky top-14 z-10 bg-background border-b pb-2 mb-3 pt-1">
                      <h3 className="font-semibold text-lg">{format(parseISO(d), "EEEE, dd MMM yyyy")}</h3>
                    </div>
                    <div className="space-y-2">
                      {grouped[d].map(r => {
                        const ldo1 = (r.ldoTank1OpeningMeter != null && r.ldoTank1ClosingMeter != null)
                          ? Math.max(0, r.ldoTank1ClosingMeter - r.ldoTank1OpeningMeter) : null;
                        const ldo2 = (r.ldoTank2OpeningMeter != null && r.ldoTank2ClosingMeter != null)
                          ? Math.max(0, r.ldoTank2ClosingMeter - r.ldoTank2OpeningMeter) : null;
                        const dur = (() => {
                          if (!r.plantStartTime || !r.plantStopTime) return null;
                          const [sh, sm] = r.plantStartTime.split(":").map(Number);
                          const [eh, em] = r.plantStopTime.split(":").map(Number);
                          let mins = (eh * 60 + em) - (sh * 60 + sm);
                          if (mins < 0) mins += 24 * 60;
                          return Math.round((mins / 60) * 100) / 100;
                        })();
                        const ldoLPerHr = (ldo1 != null && dur && dur > 0) ? (ldo1 / dur).toFixed(1) : null;
                        const ldoLPerHrDryer = (ldo2 != null && dur && dur > 0) ? (ldo2 / dur).toFixed(1) : null;
                        const mismatch = dryerMismatchByKey.get(`${r.date}||${r.plantName}`);
                        return (
                          <div key={r.id} className="flex items-start justify-between p-3 rounded-lg bg-muted/50 hover-elevate gap-3" data-testid={`row-shift-log-${r.id}`}>
                            <div className="flex-1 min-w-0">
                              {/* Line 1 — timing + status */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{r.shiftCode}</span>
                                <span className="font-medium text-sm">{r.plantStartTime || "—"} → {r.plantStopTime || "—"}</span>
                                {dur != null && <span className="text-xs text-muted-foreground">({dur} h)</span>}
                                {r.plantName !== "Main Plant" && <span className="text-xs text-muted-foreground">· {r.plantName}</span>}
                                {r.isFinalized
                                  ? <Badge variant="default" className="bg-green-600 text-xs px-1.5 py-0">✓ Done</Badge>
                                  : <Badge variant="secondary" className="text-xs px-1.5 py-0">Draft</Badge>
                                }
                              </div>
                              {/* Line 2 — consumption metrics */}
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs mt-1.5">
                                <span>
                                  <span className="text-muted-foreground">Boiler LDO: </span>
                                  <span className="font-medium">{ldo1 != null ? `${ldo1.toFixed(0)} L` : "—"}</span>
                                  {ldoLPerHr && <span className="text-muted-foreground ml-1">({ldoLPerHr} L/h)</span>}
                                </span>
                                <span>
                                  <span className="text-muted-foreground">Dryer LDO: </span>
                                  <span className="font-medium">{ldo2 != null ? `${ldo2.toFixed(0)} L` : "—"}</span>
                                  {ldoLPerHrDryer && <span className="text-muted-foreground ml-1">({ldoLPerHrDryer} L/h)</span>}
                                </span>
                                <span className="text-muted-foreground">Op: {r.operatorName || "—"}</span>
                                <span className="text-muted-foreground">Supervisor: {r.supervisorName || "—"}</span>
                                <span className="text-muted-foreground">Weather: {r.weather || "—"}</span>
                              </div>
                              {/* Dryer mismatch — guided one-click fix panel */}
                              {mismatch && mismatch.shiftLogValue && (() => {
                                const slValue = mismatch.shiftLogValue;
                                const slLabel = slValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
                                const oppValue = slValue === "TANK_1" ? "TANK_2" : "TANK_1";
                                const oppLabel = slValue === "TANK_1" ? "Dryer tank" : "Boiler tank";
                                const sessionIds = mismatch.conflictingSessions.map(s => s.id);
                                const n = sessionIds.length;
                                return (
                                  <div
                                    className="mt-2 rounded-md border border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20 px-3 py-2 text-xs space-y-1.5"
                                    data-testid={`panel-dryer-mismatch-${r.id}`}
                                  >
                                    <p className="text-red-700 dark:text-red-300 leading-snug">
                                      ⚠ <strong>Dryer source conflict:</strong> This shift log says <strong>{slLabel}</strong>, but {n} heating session{n !== 1 ? "s" : ""} {n !== 1 ? "say" : "says"} <strong>{oppLabel}</strong>.
                                    </p>
                                    <p className="text-red-600 dark:text-red-400 font-medium" data-testid={`text-dryer-mismatch-summary-${r.id}`}>
                                      Shift log: {slLabel} · {n} session{n !== 1 ? "s" : ""} {n !== 1 ? "say" : "says"} {oppLabel}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 text-xs"
                                        disabled={alignMutation.isPending || fixShiftLogMutation.isPending}
                                        onClick={() => alignMutation.mutate({ sessionIds, targetValue: slValue })}
                                        data-testid={`button-fix-sessions-${r.id}`}
                                      >
                                        {alignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                        Fix {n} session{n !== 1 ? "s" : ""} → match shift log ({slLabel})
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs border-red-400 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                                        disabled={alignMutation.isPending || fixShiftLogMutation.isPending}
                                        onClick={() => fixShiftLogMutation.mutate({ shiftLogId: r.id, dryerFedFrom: oppValue })}
                                        data-testid={`button-fix-shiftlog-${r.id}`}
                                      >
                                        {fixShiftLogMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                        Fix shift log → {oppLabel}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Link href={appendPlantContext(`/plant/daily-report/${r.date}`, { defaultTab: "operations" })}>
                                <Button variant="ghost" size="sm" data-testid={`button-daily-report-${r.id}`}>
                                  <FileText className="w-4 h-4 mr-1" />Report
                                </Button>
                              </Link>
                              <Button variant="outline" size="sm" onClick={() => openEditForDate(r.date, r.plantName, r)} data-testid={`button-open-${r.id}`}>
                                <FolderOpen className="w-4 h-4 mr-1" />Open
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>
      <DryerSourceFixDialog
        open={fixDialog.open}
        onOpenChange={(v) => setFixDialog(f => ({ ...f, open: v }))}
        target={fixDialog.target}
      />
    </>
  );
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBackToList} data-testid="button-back-to-list"><ChevronLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">Plant Log</h1>
            <p className="text-sm text-muted-foreground">Operator daily log – plant start/stop, idle events, manpower, fuel meters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized ? <Badge variant="default" className="bg-green-600">Finalized</Badge> : savedId ? <Badge variant="secondary">Draft saved</Badge> : null}
          <Link href={appendPlantContext(`/plant/daily-report/${date}`, { defaultTab: "operations" })}>
            <Button variant="outline" size="sm" data-testid="button-view-daily-report"><FileText className="w-4 h-4 mr-1" />Daily Report</Button>
          </Link>
        </div>
      </div>

      {isLoading && (
        <Card data-testid="loading-shift-log-form">
          <CardContent className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">Loading saved data…</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Header</CardTitle>
            <div className="flex items-center gap-2 rounded border border-dashed border-orange-300 bg-orange-50/40 dark:bg-orange-950/20 px-3 py-2">
              <Switch
                id="no-main-plant-ops"
                checked={noMainPlantOps}
                onCheckedChange={setNoMainPlantOps}
                data-testid="switch-no-main-plant-ops"
              />
              <Label htmlFor="no-main-plant-ops" className="text-xs cursor-pointer">
                No Main Plant Operations
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-date" /></div>
          <div><Label>Shift</Label>
            <Select value={shiftCode} onValueChange={setShiftCode}>
              <SelectTrigger data-testid="select-shift"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="NIGHT">Night</SelectItem>
                <SelectItem value="FULL">Full Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{noMainPlantOps ? "Shift Start" : "Plant Start"}</Label><Input type="time" value={plantStartTime} onChange={e => setPlantStartTime(e.target.value)} data-testid="input-plant-start" /></div>
          <div><Label>{noMainPlantOps ? "Shift End" : "Plant Stop"}</Label><Input type="time" value={plantStopTime} onChange={e => setPlantStopTime(e.target.value)} data-testid="input-plant-stop" /></div>
          <div><Label>Operator</Label><Input value={operatorName} onChange={e => setOperatorName(e.target.value)} data-testid="input-operator" /></div>
          <div><Label>Supervisor</Label><Input value={supervisorName} onChange={e => setSupervisorName(e.target.value)} data-testid="input-supervisor" /></div>
          <div><Label>Weather</Label>
            <Select value={weather} onValueChange={setWeather}>
              <SelectTrigger data-testid="select-weather"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sunny">Sunny</SelectItem>
                <SelectItem value="Cloudy">Cloudy</SelectItem>
                <SelectItem value="Rain">Rain</SelectItem>
                <SelectItem value="Hot">Hot</SelectItem>
                <SelectItem value="Cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Ambient Temp °C</Label><Input type="number" step="0.1" value={ambientTemp} onChange={e => setAmbientTemp(e.target.value)} data-testid="input-ambient-temp" /></div>
          <div><Label>Plant</Label><Input value={plantName} onChange={e => setPlantName(e.target.value)} data-testid="input-plant-name" /></div>
        </CardContent>
      </Card>

      {!isLoading && <>

      {!noMainPlantOps && <Card>
        <CardHeader>
          <CardTitle>Bitumen Tanks (Theoretical)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Bitumen tank 1 — temp (°C)</Label><Input type="number" step="0.1" value={bitumenTank1Temp} onChange={e => setBitumenTank1Temp(e.target.value)} data-testid="input-bitumen-t1-temp" /></div>
          <div>
            <Label>Bitumen tank 1 — opening dip (cm)</Label>
            <Input type="number" step="0.1" value={bitumenTank1OpeningDip} onChange={e => { setBitumenTank1OpeningDip(e.target.value); setAutoFillBitumenT1Source(""); autoFilledBitumenT1Ref.current = null; }} data-testid="input-bitumen-t1-open" />
            {autoFillBitumenT1Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-bitumen-t1-open">Auto-filled from {autoFillBitumenT1Source}</p>}
            {dipHint(bitumenTank1OpeningDip) ? (
              <p className="text-xs font-medium text-foreground mt-1" data-testid="text-bitumen-t1-open-mt">{dipHint(bitumenTank1OpeningDip)}</p>
            ) : (
              !autoFillBitumenT1Source && <p className="text-xs text-foreground/60 mt-1">Dip-stick reading at start of shift, in cm</p>
            )}
          </div>
          <div>
            <Label>Bitumen tank 1 — closing dip (cm)</Label>
            <Input type="number" step="0.1" value={bitumenTank1ClosingDip} onChange={e => setBitumenTank1ClosingDip(e.target.value)} data-testid="input-bitumen-t1-close" />
            {dipHint(bitumenTank1ClosingDip) ? (
              <p className="text-xs font-medium text-foreground mt-1" data-testid="text-bitumen-t1-close-mt">{dipHint(bitumenTank1ClosingDip)}</p>
            ) : (
              <p className="text-xs text-foreground/60 mt-1">Dip-stick reading at end of shift, in cm</p>
            )}
          </div>
          <div />
          <div><Label>Bitumen tank 2 — temp (°C)</Label><Input type="number" step="0.1" value={bitumenTank2Temp} onChange={e => setBitumenTank2Temp(e.target.value)} data-testid="input-bitumen-t2-temp" /></div>
          <div>
            <Label>Bitumen tank 2 — opening dip (cm)</Label>
            <Input type="number" step="0.1" value={bitumenTank2OpeningDip} onChange={e => { setBitumenTank2OpeningDip(e.target.value); setAutoFillBitumenT2Source(""); autoFilledBitumenT2Ref.current = null; }} data-testid="input-bitumen-t2-open" />
            {autoFillBitumenT2Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-bitumen-t2-open">Auto-filled from {autoFillBitumenT2Source}</p>}
            {dipHint(bitumenTank2OpeningDip) ? (
              <p className="text-xs font-medium text-foreground mt-1" data-testid="text-bitumen-t2-open-mt">{dipHint(bitumenTank2OpeningDip)}</p>
            ) : (
              !autoFillBitumenT2Source && <p className="text-xs text-foreground/60 mt-1">Dip-stick reading at start of shift, in cm</p>
            )}
          </div>
          <div>
            <Label>Bitumen tank 2 — closing dip (cm)</Label>
            <Input type="number" step="0.1" value={bitumenTank2ClosingDip} onChange={e => setBitumenTank2ClosingDip(e.target.value)} data-testid="input-bitumen-t2-close" />
            {dipHint(bitumenTank2ClosingDip) ? (
              <p className="text-xs font-medium text-foreground mt-1" data-testid="text-bitumen-t2-close-mt">{dipHint(bitumenTank2ClosingDip)}</p>
            ) : (
              <p className="text-xs text-foreground/60 mt-1">Dip-stick reading at end of shift, in cm</p>
            )}
          </div>
        </CardContent>
      </Card>}

      {!noMainPlantOps && <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>LDO Flow Meters</CardTitle>
              <p className="text-xs text-muted-foreground">Both meters draw from the main LDO tank.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Routes the dryer-meter consumption to the selected tank. */}
              <div
                ref={dryerFocusRef}
                className={`flex items-center gap-2 rounded border border-dashed px-3 py-2 transition-all duration-300 ${
                  dryerHighlighted
                    ? "border-red-500 bg-red-50/70 dark:bg-red-950/30 ring-2 ring-red-400"
                    : "border-blue-300 bg-blue-50/40 dark:bg-blue-950/20"
                }`}
              >
                <Label htmlFor="dryer-fed-from" className="text-xs">Which tank feeds the dryer?</Label>
                <Select value={dryerFedFrom} onValueChange={(v) => setDryerFedFrom(v as "TANK_1" | "TANK_2")}>
                  <SelectTrigger id="dryer-fed-from" className="h-8 w-36" data-testid="select-dryer-fed-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TANK_1">Boiler tank</SelectItem>
                    <SelectItem value="TANK_2">Dryer tank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Task #254 — Boiler-runs-during-production toggle. When off,
                  the Boiler Meter inputs below are hidden and contribute 0 to
                  the daily report's boiler-LDO total (sessions still count). */}
              <div className="flex items-center gap-2 rounded border border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2">
                <Switch
                  id="boiler-runs-during-production"
                  checked={boilerRunsDuringProduction}
                  onCheckedChange={(v) => {
                    setBoilerRunsDuringProduction(!!v);
                    if (!v) {
                      // Clearing the inputs avoids stale numbers if the operator
                      // toggles off after typing — keeps the daily-report total
                      // honest and matches the "contribute zero" rule.
                      setLdoTank1OpeningMeter("");
                      setLdoTank1ClosingMeter("");
                      setAutoFillT1Source("");
                      setAutoFillT1ClosingSource("");
                      autoFilledT1ValueRef.current = null;
                      autoFilledT1ClosingValueRef.current = null;
                    }
                  }}
                  data-testid="switch-boiler-runs-during-production"
                />
                <Label htmlFor="boiler-runs-during-production" className="text-xs cursor-pointer">
                  Boiler runs during production
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {boilerRunsDuringProduction ? (
            <>
              <div>
                <Label>Boiler fuel meter — opening</Label>
                <Input type="number" step="0.01" value={ldoTank1OpeningMeter}
                  onChange={e => { setLdoTank1OpeningMeter(e.target.value); setAutoFillT1Source(""); }}
                  data-testid="input-ldo-t1-open" />
                {autoFillT1Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t1">Auto-filled from {autoFillT1Source}</p>}
              </div>
              <div>
                <Label>Boiler fuel meter — closing</Label>
                <Input type="number" step="0.01" value={ldoTank1ClosingMeter}
                  onChange={e => { setLdoTank1ClosingMeter(e.target.value); setAutoFillT1ClosingSource(""); }}
                  data-testid="input-ldo-t1-close" />
                {autoFillT1ClosingSource && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t1-close">Auto-filled from {autoFillT1ClosingSource}</p>}
              </div>
              <div><Label>Boiler fuel consumed (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t1-consumed">{ldoTotal.t1?.toFixed(2) ?? "—"}</div></div>
              <div />
            </>
          ) : (
            <div className="md:col-span-4 text-xs text-muted-foreground italic" data-testid="text-boiler-meter-hidden">
              Boiler Meter inputs are hidden — turn on "Boiler runs during production" to record the meter opening/closing for this shift. Heating session LDO is still counted in the Daily Plant Report.
            </div>
          )}
          <div>
            <Label>Dryer fuel meter — opening</Label>
            <Input type="number" step="0.01" value={ldoTank2OpeningMeter}
              onChange={e => { setLdoTank2OpeningMeter(e.target.value); setAutoFillT2Source(""); }}
              data-testid="input-ldo-t2-open" />
            {autoFillT2Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t2">Auto-filled from {autoFillT2Source}</p>}
          </div>
          <div><Label>Dryer fuel meter — closing</Label><Input type="number" step="0.01" value={ldoTank2ClosingMeter} onChange={e => setLdoTank2ClosingMeter(e.target.value)} data-testid="input-ldo-t2-close" /></div>
          <div><Label>Dryer fuel consumed (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t2-consumed">{ldoTotal.t2?.toFixed(2) ?? "—"}</div></div>
          <div><Label>Total LDO (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold" data-testid="text-ldo-total">{ldoTotal.total ? ldoTotal.total.toFixed(2) : "—"}</div></div>

          {/* Task #344 — LDO dip-stick readings */}
          <div className="col-span-2 md:col-span-4 border-t pt-3 mt-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">LDO Tank Dip-Stick Readings</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Tank 1 — opening dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank1OpeningDip} onChange={e => { setLdoTank1OpeningDip(e.target.value); setAutoFillLdoDipT1Source(""); autoFilledLdoDipT1Ref.current = null; }} data-testid="input-ldo-dip-t1-open" />
                {autoFillLdoDipT1Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-ldo-dip-t1-open">Auto-filled from {autoFillLdoDipT1Source}</p>}
                {ldoDipHint(1, ldoTank1OpeningDip) ? (
                  <p className="text-xs font-medium text-foreground mt-1" data-testid="text-ldo-dip-t1-open-hint">{ldoDipHint(1, ldoTank1OpeningDip)}</p>
                ) : (
                  !autoFillLdoDipT1Source && <p className="text-xs text-foreground/60 mt-1">Dip-stick at shift start, in cm</p>
                )}
              </div>
              <div>
                <Label>Tank 1 — closing dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank1ClosingDip} onChange={e => setLdoTank1ClosingDip(e.target.value)} data-testid="input-ldo-dip-t1-close" />
                {ldoDipHint(1, ldoTank1ClosingDip) ? (
                  <p className="text-xs font-medium text-foreground mt-1" data-testid="text-ldo-dip-t1-close-hint">{ldoDipHint(1, ldoTank1ClosingDip)}</p>
                ) : (
                  <p className="text-xs text-foreground/60 mt-1">Dip-stick at shift end, in cm</p>
                )}
              </div>
              <div>
                <Label>Tank 2 — opening dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank2OpeningDip} onChange={e => { setLdoTank2OpeningDip(e.target.value); setAutoFillLdoDipT2Source(""); autoFilledLdoDipT2Ref.current = null; }} data-testid="input-ldo-dip-t2-open" />
                {autoFillLdoDipT2Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-ldo-dip-t2-open">Auto-filled from {autoFillLdoDipT2Source}</p>}
                {ldoDipHint(2, ldoTank2OpeningDip) ? (
                  <p className="text-xs font-medium text-foreground mt-1" data-testid="text-ldo-dip-t2-open-hint">{ldoDipHint(2, ldoTank2OpeningDip)}</p>
                ) : (
                  !autoFillLdoDipT2Source && <p className="text-xs text-foreground/60 mt-1">Dip-stick at shift start, in cm</p>
                )}
              </div>
              <div>
                <Label>Tank 2 — closing dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank2ClosingDip} onChange={e => setLdoTank2ClosingDip(e.target.value)} data-testid="input-ldo-dip-t2-close" />
                {ldoDipHint(2, ldoTank2ClosingDip) ? (
                  <p className="text-xs font-medium text-foreground mt-1" data-testid="text-ldo-dip-t2-close-hint">{ldoDipHint(2, ldoTank2ClosingDip)}</p>
                ) : (
                  <p className="text-xs text-foreground/60 mt-1">Dip-stick at shift end, in cm</p>
                )}
              </div>
            </div>
          </div>

          {/* Task #325/#372 — live LDO efficiency stats strip. Updates as the
              operator types closing readings, changes plant start/stop times,
              or when dispatch totals load in the background. */}
          <div className="col-span-2 md:col-span-4 border-t pt-3 mt-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Live LDO Stats</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {([
                { label: "Boiler L/Hr", value: liveStats.boilerLHr, testId: "text-ldo-stat-boiler-lphr" },
                { label: "Dryer L/Hr", value: liveStats.dryerLHr, testId: "text-ldo-stat-dryer-lphr" },
                { label: "Combined L/Hr", value: liveStats.combinedLHr, testId: "text-ldo-stat-combined-lphr" },
                { label: "Boiler L/MT", value: liveStats.boilerLMt, testId: "text-ldo-stat-boiler-lpmt" },
                { label: "Dryer L/MT", value: liveStats.dryerLMt, testId: "text-ldo-stat-dryer-lpmt" },
                { label: "Combined L/MT", value: liveStats.combinedLMt, testId: "text-ldo-stat-combined-lpmt" },
              ] as const).map(({ label, value, testId }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span
                    className={`text-sm font-semibold ${value == null ? "text-muted-foreground" : "text-foreground"}`}
                    data-testid={testId}
                  >
                    {value != null ? value.toFixed(1) : "—"}
                  </span>
                </div>
              ))}
            </div>
            {liveStats.noDispatches && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-ldo-stat-no-dispatches">
                No dispatches logged for {date} — L/MT metrics will appear once production is recorded.
              </p>
            )}
          </div>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Heating Sessions for this Production
              <Badge variant="secondary" data-testid="badge-heating-session-count">
                {filteredHeatingSessionsForShiftLog.length}
              </Badge>
            </CardTitle>
            <Link href={appendPlantContext(`/plant/heating-sessions/${date}`, { defaultTab: "operations" })}>
              <Button size="sm" variant="outline" data-testid="button-open-heating-sessions">
                <Plus className="w-4 h-4 mr-1" />Add / Edit Sessions
              </Button>
            </Link>
          </div>
          {/* Task #254 — make the attribution rule visible to operators. */}
          <p className="text-xs text-muted-foreground">
            {plantStartTime && plantStopTime
              ? `Showing sessions within shift window (${plantStartTime}–${plantStopTime}); prior-date pre-heating always included.`
              : "Includes every heating session run since the previous production day — overnight pre-heating is rolled into this day's totals."}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {!filteredHeatingSessionsForShiftLog.length && (
            <p className="text-sm text-muted-foreground">
              {(heatingSessionsForDate || []).length > filteredHeatingSessionsForShiftLog.length
                ? `No heating sessions fall within the shift window (${plantStartTime}–${plantStopTime}) for ${date}.`
                : `No heating sessions attributed to ${date}. Use "Add / Edit Sessions" to log boiler runs — session values (bitumen temps, hot-oil, DG) feed the Plant Daily Report automatically.`}
            </p>
          )}
          {filteredHeatingSessionsForShiftLog.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Staff</th>
                    <th className="py-2 pr-2 text-right">Boiler LDO (L)</th>
                    <th className="py-2 pr-2 text-right">DG</th>
                    <th className="py-2 pr-2">Hot-Oil End °C</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHeatingSessionsForShiftLog
                    .slice()
                    .sort((a, b) =>
                      String(a.date || "").localeCompare(String(b.date || ""))
                      || (a.startTime || "").localeCompare(b.startTime || "")
                    )
                    .map(s => (
                      <tr key={s.id} className="border-b last:border-b-0" data-testid={`row-shift-heating-${s.id}`}>
                        <td className="py-2 pr-2 whitespace-nowrap text-xs text-muted-foreground" data-testid={`text-shift-heating-date-${s.id}`}>
                          {s.date}
                          {s.date !== date && (
                            <Badge variant="outline" className="ml-1 text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">prior</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"} className="text-xs">
                            {heatingSessionTypeLabel(s.sessionType)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{s.startTime || "—"} → {s.endTime || "—"}</td>
                        <td className="py-2 pr-2">{s.staffName || "—"}</td>
                        <td className="py-2 pr-2 text-right">{s.ldoTank1Consumed?.toFixed(1) ?? "—"}</td>
                        <td className="py-2 pr-2 text-right">
                          {s.generatorLogId != null ? (
                            <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700 dark:text-emerald-400" data-testid={`badge-shift-dg-${s.id}`}>
                              #{s.generatorLogId}
                            </Badge>
                          ) : s.dgMode === "none" ? "—" : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">{s.hotOilTempEnd ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Bitumen tank temperatures and DG runs recorded inside a session are the source of truth for the Daily Plant Report. When the "Boiler runs during production" toggle above is on, the shift's Boiler Meter delta is added on top of these session totals.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manpower ({manpower.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={openAddManpower} data-testid="button-add-manpower"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {manpower.length === 0 && <p className="text-sm text-muted-foreground">No manpower added. Tap "Add" to record a worker for this shift.</p>}
          {manpower.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Contractor</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Gender</th>
                    <th className="py-2 pr-2">Rate-Card Key</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manpower.map((m, i) => (
                    <tr key={i} className="border-b last:border-b-0" data-testid={`row-manpower-${i}`}>
                      <td className="py-2 pr-2 font-medium">{m.name}{m.role ? <span className="text-xs text-muted-foreground"> ({m.role})</span> : null}</td>
                      <td className="py-2 pr-2">{m.contractorName || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.category || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.gender || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2"><Badge variant="outline" className="font-mono text-xs">{rateCardKeyForRow(m) || "—"}</Badge></td>
                      <td className="py-2 pr-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditManpower(i)} data-testid={`button-edit-manpower-${i}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => removeManpower(i)} data-testid={`button-remove-manpower-${i}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!noMainPlantOps && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Idle Events ({idleEvents.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={openAddIdle} data-testid="button-add-idle"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {idleEvents.length === 0 && <p className="text-sm text-muted-foreground">No idle events.</p>}
          {idleEvents.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Start</th>
                    <th className="py-2 pr-2">End</th>
                    <th className="py-2 pr-2">Duration</th>
                    <th className="py-2 pr-2">Reason</th>
                    <th className="py-2 pr-2">Remarks</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {idleEvents.map((ev, i) => {
                    const mins = idleMinutes(ev);
                    return (
                      <tr key={i} className="border-b last:border-b-0" data-testid={`row-idle-${i}`}>
                        <td className="py-2 pr-2">{ev.startTime}</td>
                        <td className="py-2 pr-2">{ev.endTime || <span className="text-muted-foreground italic">ongoing</span>}</td>
                        <td className="py-2 pr-2">{mins != null ? `${mins} min` : "—"}</td>
                        <td className="py-2 pr-2"><Badge variant="outline" className="text-xs">{ev.reason}</Badge></td>
                        <td className="py-2 pr-2 text-muted-foreground">{ev.remarks || "—"}</td>
                        <td className="py-2 pr-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditIdle(i)} data-testid={`button-edit-idle-${i}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => removeIdle(i)} data-testid={`button-remove-idle-${i}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Manpower modal */}
      <Dialog open={mpDialogOpen} onOpenChange={setMpDialogOpen}>
        <DialogContent data-testid="dialog-manpower">
          <DialogHeader><DialogTitle>{mpEditingIdx === null ? "Add Manpower" : "Edit Manpower"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={mpDraft.name} onChange={e => setMpDraft({ ...mpDraft, name: e.target.value })} data-testid="input-mp-name" /></div>
            <div><Label>Role / Trade</Label><Input value={mpDraft.role || ""} onChange={e => setMpDraft({ ...mpDraft, role: e.target.value })} placeholder="e.g. Plant Operator" data-testid="input-mp-role" /></div>
            <div><Label>Contractor *</Label><Input value={mpDraft.contractorName || ""} onChange={e => setMpDraft({ ...mpDraft, contractorName: e.target.value })} placeholder="e.g. RAMU LABOUR CONTRACTOR" data-testid="input-mp-contractor" /></div>
            <div>
              <Label>Category *</Label>
              <Select value={mpDraft.category || ""} onValueChange={v => setMpDraft({ ...mpDraft, category: v })}>
                <SelectTrigger data-testid="select-mp-category"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LABOUR_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gender *</Label>
              <Select value={mpDraft.gender || ""} onValueChange={v => setMpDraft({ ...mpDraft, gender: v })}>
                <SelectTrigger data-testid="select-mp-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LABOUR_GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">
                Vendor Bills (Labour) will pull this row using rate-card key:{" "}
                <Badge variant="outline" className="font-mono text-xs ml-1" data-testid="text-mp-rate-card-key">{rateCardKeyForRow(mpDraft) || "—"}</Badge>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMpDialogOpen(false)} data-testid="button-mp-cancel">Cancel</Button>
            <Button onClick={saveManpowerDraft} data-testid="button-mp-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Idle modal */}
      <Dialog open={idleDialogOpen} onOpenChange={setIdleDialogOpen}>
        <DialogContent data-testid="dialog-idle">
          <DialogHeader><DialogTitle>{idleEditingIdx === null ? "Add Idle Event" : "Edit Idle Event"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start *</Label><Input type="time" value={idleDraft.startTime} onChange={e => setIdleDraft({ ...idleDraft, startTime: e.target.value })} data-testid="input-idle-start" /></div>
            <div><Label>End</Label><Input type="time" value={idleDraft.endTime || ""} onChange={e => setIdleDraft({ ...idleDraft, endTime: e.target.value })} placeholder="(blank if ongoing)" data-testid="input-idle-end" /></div>
            <div className="col-span-2">
              <Label>Reason *</Label>
              <Select value={idleDraft.reason} onValueChange={v => setIdleDraft({ ...idleDraft, reason: v })}>
                <SelectTrigger data-testid="select-idle-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_IDLE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Remarks</Label><Textarea rows={2} value={idleDraft.remarks || ""} onChange={e => setIdleDraft({ ...idleDraft, remarks: e.target.value })} data-testid="input-idle-remarks" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIdleDialogOpen(false)} data-testid="button-idle-cancel">Cancel</Button>
            <Button onClick={saveIdleDraft} data-testid="button-idle-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle>Remarks (End-of-Day)</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Plant conditions, breakdowns, anything notable..." data-testid="input-remarks" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        {savedId && (
          <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={deleteMutation.isPending} data-testid="button-delete">
            <Trash2 className="w-4 h-4 mr-1" />Delete
          </Button>
        )}
        <Button variant="ghost" onClick={goBackToList} data-testid="button-cancel">Cancel</Button>
        <Button onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending} data-testid="button-save">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save & Close
        </Button>
      </div>
      </>}
    </div>
      <DryerSourceFixDialog
        open={fixDialog.open}
        onOpenChange={(v) => setFixDialog(f => ({ ...f, open: v }))}
        target={fixDialog.target}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift log?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the shift log and all associated records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmDelete(false); deleteMutation.mutate(); }}
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
