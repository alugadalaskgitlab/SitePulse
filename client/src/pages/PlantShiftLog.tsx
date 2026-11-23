import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useFormDraft } from "@/hooks/use-form-draft";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { DraftRestoredBanner } from "@/components/DraftRestoredBanner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronDown, Plus, Trash2, Save, FileText, Loader2, Pencil, Users, FolderOpen, X, Download } from "lucide-react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import * as XLSX from "xlsx";
import { format, parseISO, subDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { SHIFT_IDLE_REASONS, LABOUR_CATEGORIES, LABOUR_GENDERS, heatingSessionTypeLabel } from "@shared/schema";
import type { PlantShiftLog as PlantShiftLogRow, PlantShiftLogWithDetails, BitumenHeatingSession, Personnel } from "@shared/schema";
import { getVolumeAtDepth, getUsableVolume, BITUMEN_DENSITY_KG_PER_LITER, LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { getLdoVolumeAtDepth, getLdoDeadStockVolume } from "@shared/ldo-dip-chart";
import { calculatePlantLdo, formatStoppedTime } from "@shared/plantLdoAccounting";
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

import { ReportExportGate } from "@/components/ReportExportGate";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";

export default function PlantShiftLog() {
  const { toast } = useToast();
  const { defaultPlantName } = useFeatureFlags();
  const { featureCan, user } = useAuth();
  const canVerify = featureCan("hmp_rmc", "verify");
  const canAddPlantReceipt = featureCan("plant_receipts", "add");
  const canEditPlantDay = featureCan("hmp_rmc", "add") || featureCan("hmp_rmc", "edit");
  const { isFromPortal, appendPlantContext, getPlantBackLink } = useOrigin();
  const [, params] = useRoute("/plant/shift-log/:date");
  const [currentLocation] = useLocation();
  const today = format(new Date(), "yyyy-MM-dd");
  const dateParam = params?.date || today;

  // View mode: list when no :date in URL, edit when specific date.
  const [viewMode, setViewMode] = useState<"list" | "edit">(params?.date ? "edit" : "list");
  const [listDateFrom, setListDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [listDateTo, setListDateTo] = useState(today);
  const [listDryerFilter, setListDryerFilter] = useState<"all" | "TANK_1" | "TANK_2">("all");
  // Always return to operations tab — shift logs live on the operations tab regardless
  // of which tab the user may have arrived from.
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const [date, setDate] = useState(dateParam);
  const [shiftCode, setShiftCode] = useState("DAY");
  const [plantStartTime, setPlantStartTime] = useState("");
  const [plantStopTime, setPlantStopTime] = useState("");
  const [weather, setWeather] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const operatorPrefillRef = useRef<{ date: string; applied: boolean }>({ date: "", applied: false });
  const [supervisorName, setSupervisorName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

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
  const [dryerFedFrom, setDryerFedFrom] = useState<"TANK_1" | "TANK_2" | null>(null);
  const [dryerFedFromNote, setDryerFedFromNote] = useState("");
  // Task #254 — operator toggle: when on, the boiler runs during production
  // and the Boiler Meter opening/closing inputs are shown (auto-fill from the
  // most recent heating session's closing meter). When off, those inputs are
  // hidden and contribute zero to the boiler-LDO total in the daily report.
  const [boilerRunsDuringProduction, setBoilerRunsDuringProduction] = useState(false);
  const [noMainPlantOps, setNoMainPlantOps] = useState(false);
  const [fixDialog, setFixDialog] = useState<{ open: boolean; target: DryerSourceFixTarget | null }>({ open: false, target: null });
  const [postSaveWarnings, setPostSaveWarnings] = useState<string[]>([]);
  // Step 2 — detect ?focus=dryerFedFrom in URL so we can scroll and highlight
  // the "Which tank feeds the dryer?" field when navigated from a mismatch link.
  const focusDryerParam = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("focus") === "dryerFedFrom";
  }, []);
  const [dryerHighlighted, setDryerHighlighted] = useState(false);
  const dryerFocusRef = useRef<HTMLDivElement | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const [manpower, setManpower] = useState<ManpowerRow[]>([]);
  const [idleEvents, setIdleEvents] = useState<IdleRow[]>([]);
  const [dgReadings, setDgReadings] = useState<Array<{
    equipmentId: number;
    equipmentName: string;
    openingReading: string;
    closingReading: string;
    openingDiesel: string;
    closingDiesel: string;
    prefillFrom?: string | null;
  }>>([]);

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
      contractorName: mpDraft.contractorName.trim(),
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
    setIdleDraft({ startTime: format(new Date(), "HH:mm"), endTime: "", reason: "Material Shortage", remarks: "" });
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
    if (typeof window === "undefined") return defaultPlantName;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("plant") || defaultPlantName;
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
  const { data: plantSettings } = useQuery<{
    dgProductionEquipmentIds?: string | null;
  }>({
    queryKey: ["/api/plant-module/plant-settings", plantName],
    enabled: viewMode === "edit" && !!plantName,
    queryFn: async () => {
      const response = await fetch(`/api/plant-module/plant-settings/${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load plant settings.");
      return response.json();
    },
  });
  const { data: previousShiftLog } = useQuery<PlantShiftLogRow | null>({
    queryKey: ["/api/plant-module/shift-logs/previous-before", date, plantName],
    enabled: viewMode === "edit" && !isLoading && !existing && !!date && !!plantName,
    queryFn: async () => {
      const response = await fetch(
        `/api/plant-module/shift-logs/previous-before/${encodeURIComponent(date)}?plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Could not load the previous shift log.");
      return response.json();
    },
  });

  const { data: personnelList = [] } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel", "includeInactive"],
    queryFn: async () => {
      const response = await fetch("/api/personnel?includeInactive=true", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load personnel.");
      return response.json();
    },
  });
  const linkedOperatorName = personnelList.find(person => person.id === user?.personnelId)?.name ?? "";

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

  // Collapsible date groups for the list view — mirrors PlantHeatingSessions.tsx.
  // Sorted date keys drive first-visit default and sessionStorage restoration.
  const listGroupedDates = useMemo(() => {
    const sorted = (shiftLogs || []).slice()
      .filter(r => listDryerFilter === "all" || r.dryerFedFrom === listDryerFilter)
      .sort((a, b) => b.date.localeCompare(a.date) || (a.shiftCode || "").localeCompare(b.shiftCode || ""));
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const r of sorted) { if (!seen.has(r.date)) { seen.add(r.date); dates.push(r.date); } }
    return dates;
  }, [shiftLogs, listDryerFilter]);

  const SHIFT_LOG_GROUPS_KEY = `open-date-groups:${currentLocation.split("?")[0]}`;
  const [openDateGroups, setOpenDateGroups] = useState<Set<string>>(new Set());
  const initialOpenSetRef = useRef(false);
  useEffect(() => {
    if (initialOpenSetRef.current || listGroupedDates.length === 0) return;
    initialOpenSetRef.current = true;
    try {
      const stored = sessionStorage.getItem(SHIFT_LOG_GROUPS_KEY);
      if (stored !== null) {
        const parsed: string[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(d => listGroupedDates.includes(d));
          setOpenDateGroups(new Set(valid));
          return;
        }
      }
    } catch {
      // ignore malformed sessionStorage value
    }
    // Fallback: open most-recent date on first visit
    setOpenDateGroups(new Set([listGroupedDates[0]]));
  }, [listGroupedDates]);

  const toggleDateGroup = (date: string) => {
    setOpenDateGroups(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      try {
        sessionStorage.setItem(SHIFT_LOG_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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
    operatorPrefillRef.current = { date, applied: false };
    setCloseReason(""); setMoreDetailsOpen(false);
    setBitumenTank1Temp(""); setBitumenTank2Temp("");
    setBitumenTank1OpeningDip(""); setBitumenTank1ClosingDip("");
    setBitumenTank2OpeningDip(""); setBitumenTank2ClosingDip("");
    setLdoTank1OpeningMeter(""); setLdoTank1ClosingMeter("");
    setLdoTank2OpeningMeter(""); setLdoTank2ClosingMeter("");
    setLdoTank1OpeningDip(""); setLdoTank1ClosingDip("");
    setLdoTank2OpeningDip(""); setLdoTank2ClosingDip("");
    setDryerFedFrom(null);
    setDryerFedFromNote("");
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
    setCloseReason((log as any).closeReason || "");
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
    setDryerFedFrom(log.dryerFedFrom === "TANK_1" || log.dryerFedFrom === "TANK_2" ? log.dryerFedFrom : null);
    setDryerFedFromNote("");
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
    setPlantName(log.plantName || defaultPlantName);
    operatorPrefillRef.current = { date: log.date, applied: true };
  }, [defaultPlantName]);

  useEffect(() => {
    if (operatorPrefillRef.current.date !== date) {
      operatorPrefillRef.current = { date, applied: false };
    }
    if (viewMode !== "edit" || isLoading || existing || !linkedOperatorName || operatorPrefillRef.current.applied) return;
    if (!operatorName.trim()) setOperatorName(linkedOperatorName);
    operatorPrefillRef.current.applied = true;
  }, [date, viewMode, isLoading, existing, linkedOperatorName]);

  useEffect(() => {
    if (viewMode !== "edit" || isLoading || existing || !previousShiftLog?.dryerFedFrom) return;
    if (dryerFedFrom) return;
    setDryerFedFrom(previousShiftLog.dryerFedFrom as "TANK_1" | "TANK_2");
    setDryerFedFromNote("Same as previous day");
  }, [viewMode, isLoading, existing, previousShiftLog, dryerFedFrom]);

  type ShiftLogFormData = {
    shiftCode: string; plantStartTime: string; plantStopTime: string;
    weather: string; ambientTemp: string; operatorName: string; supervisorName: string; remarks: string; closeReason: string;
    bitumenTank1Temp: string; bitumenTank2Temp: string;
    bitumenTank1OpeningDip: string; bitumenTank1ClosingDip: string;
    bitumenTank2OpeningDip: string; bitumenTank2ClosingDip: string;
    ldoTank1OpeningMeter: string; ldoTank1ClosingMeter: string;
    ldoTank2OpeningMeter: string; ldoTank2ClosingMeter: string;
    ldoTank1OpeningDip: string; ldoTank1ClosingDip: string;
    ldoTank2OpeningDip: string; ldoTank2ClosingDip: string;
    dryerFedFrom: "TANK_1" | "TANK_2" | null; boilerRunsDuringProduction: boolean; noMainPlantOps: boolean;
    manpower: ManpowerRow[]; idleEvents: IdleRow[];
  };

  const onRestoreDraft = useCallback((d: ShiftLogFormData) => {
    if (d.shiftCode !== undefined) setShiftCode(d.shiftCode);
    if (d.plantStartTime !== undefined) setPlantStartTime(d.plantStartTime);
    if (d.plantStopTime !== undefined) setPlantStopTime(d.plantStopTime);
    if (d.weather !== undefined) setWeather(d.weather);
    if (d.ambientTemp !== undefined) setAmbientTemp(d.ambientTemp);
    if (d.operatorName !== undefined) setOperatorName(d.operatorName);
    if (d.supervisorName !== undefined) setSupervisorName(d.supervisorName);
    if (d.remarks !== undefined) setRemarks(d.remarks);
    if (d.closeReason !== undefined) setCloseReason(d.closeReason);
    if (d.bitumenTank1Temp !== undefined) setBitumenTank1Temp(d.bitumenTank1Temp);
    if (d.bitumenTank2Temp !== undefined) setBitumenTank2Temp(d.bitumenTank2Temp);
    if (d.bitumenTank1OpeningDip !== undefined) setBitumenTank1OpeningDip(d.bitumenTank1OpeningDip);
    if (d.bitumenTank1ClosingDip !== undefined) setBitumenTank1ClosingDip(d.bitumenTank1ClosingDip);
    if (d.bitumenTank2OpeningDip !== undefined) setBitumenTank2OpeningDip(d.bitumenTank2OpeningDip);
    if (d.bitumenTank2ClosingDip !== undefined) setBitumenTank2ClosingDip(d.bitumenTank2ClosingDip);
    if (d.ldoTank1OpeningMeter !== undefined) setLdoTank1OpeningMeter(d.ldoTank1OpeningMeter);
    if (d.ldoTank1ClosingMeter !== undefined) setLdoTank1ClosingMeter(d.ldoTank1ClosingMeter);
    if (d.ldoTank2OpeningMeter !== undefined) setLdoTank2OpeningMeter(d.ldoTank2OpeningMeter);
    if (d.ldoTank2ClosingMeter !== undefined) setLdoTank2ClosingMeter(d.ldoTank2ClosingMeter);
    if (d.ldoTank1OpeningDip !== undefined) setLdoTank1OpeningDip(d.ldoTank1OpeningDip);
    if (d.ldoTank1ClosingDip !== undefined) setLdoTank1ClosingDip(d.ldoTank1ClosingDip);
    if (d.ldoTank2OpeningDip !== undefined) setLdoTank2OpeningDip(d.ldoTank2OpeningDip);
    if (d.ldoTank2ClosingDip !== undefined) setLdoTank2ClosingDip(d.ldoTank2ClosingDip);
    if (d.dryerFedFrom !== undefined) setDryerFedFrom(d.dryerFedFrom);
    if (d.boilerRunsDuringProduction !== undefined) setBoilerRunsDuringProduction(d.boilerRunsDuringProduction);
    if (d.noMainPlantOps !== undefined) setNoMainPlantOps(d.noMainPlantOps);
    if (Array.isArray(d.manpower)) setManpower(d.manpower);
    if (Array.isArray(d.idleEvents)) setIdleEvents(d.idleEvents);
    setDraftRestored(true);
  }, []);

  const formData = useMemo<ShiftLogFormData>(() => ({
    shiftCode, plantStartTime, plantStopTime, weather, ambientTemp,
    operatorName, supervisorName, remarks, closeReason,
    bitumenTank1Temp, bitumenTank2Temp,
    bitumenTank1OpeningDip, bitumenTank1ClosingDip,
    bitumenTank2OpeningDip, bitumenTank2ClosingDip,
    ldoTank1OpeningMeter, ldoTank1ClosingMeter,
    ldoTank2OpeningMeter, ldoTank2ClosingMeter,
    ldoTank1OpeningDip, ldoTank1ClosingDip,
    ldoTank2OpeningDip, ldoTank2ClosingDip,
    dryerFedFrom, boilerRunsDuringProduction, noMainPlantOps,
    manpower, idleEvents,
  }), [shiftCode, plantStartTime, plantStopTime, weather, ambientTemp,
    operatorName, supervisorName, remarks, closeReason,
    bitumenTank1Temp, bitumenTank2Temp,
    bitumenTank1OpeningDip, bitumenTank1ClosingDip,
    bitumenTank2OpeningDip, bitumenTank2ClosingDip,
    ldoTank1OpeningMeter, ldoTank1ClosingMeter,
    ldoTank2OpeningMeter, ldoTank2ClosingMeter,
    ldoTank1OpeningDip, ldoTank1ClosingDip,
    ldoTank2OpeningDip, ldoTank2ClosingDip,
    dryerFedFrom, boilerRunsDuringProduction, noMainPlantOps,
    manpower, idleEvents]);

  const { clearDraft, wasRestoredRef, lastSavedAt, draftSavedAt } = useFormDraft<ShiftLogFormData>(
    `sl-draft:${date}:${plantName}`,
    formData,
    onRestoreDraft,
    { enabled: viewMode === "edit" && !!date, initialized: !isLoading },
  );

  // Auto-dismiss the "Draft restored" banner after 8 seconds.
  useEffect(() => {
    if (!draftRestored) return;
    const t = setTimeout(() => setDraftRestored(false), 8000);
    return () => clearTimeout(t);
  }, [draftRestored]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setDraftRestored(false);
    if (existing) populateFormFromLog(existing);
    else resetForNew();
  }, [clearDraft, existing, populateFormFromLog]);

  const openEditForDate = (d: string, plant: string, row?: PlantShiftLogRow) => {
    setDate(d);
    const resolvedPlant = plant || defaultPlantName;
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
    setPlantName(defaultPlantName);
    resetForNew();
    setViewMode("edit");
  };
  const goBackToList = () => {
    setViewMode("list");
    queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
  };

  useEffect(() => {
    if (isLoading) return; // Wait until server data has resolved
    if (!existing) {
      setSavedId(null);
      setIsFinalized(0);
      return;
    }
    if (wasRestoredRef.current) {
      // Draft from localStorage takes priority over server data. Sync only
      // the identity/finalization fields that the draft doesn't carry.
      setSavedId(existing.id);
      setIsFinalized(existing.isFinalized || 0);
      return;
    }
    populateFormFromLog(existing);
  }, [existing, isLoading, populateFormFromLog]);


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
  const { data: dgServerRows } = useQuery<Array<{
    equipmentId: number;
    equipmentName: string;
    usage: any;
    openingMeterPrefill: number | null;
    openingDieselPrefill: number | null;
    prefillFrom: string | null;
  }>>({
    queryKey: ["/api/plant-module/shift-logs/dg-readings", date, plantName],
    enabled: viewMode === "edit" && !!date && !!plantName,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(
        `/api/plant-module/shift-logs/${encodeURIComponent(date)}/dg-readings?plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Could not load DG readings.");
      return response.json();
    },
  });
  useEffect(() => {
    if (!dgServerRows) return;
    setDgReadings(dgServerRows.map(({ equipmentId, equipmentName, usage, openingMeterPrefill, openingDieselPrefill, prefillFrom }) => ({
      equipmentId,
      equipmentName,
      openingReading: (usage?.openingReading ?? openingMeterPrefill) == null ? "" : String(usage?.openingReading ?? openingMeterPrefill),
      closingReading: usage?.closingReading == null ? "" : String(usage.closingReading),
      openingDiesel: (usage?.openingDiesel ?? openingDieselPrefill) == null ? "" : String(usage?.openingDiesel ?? openingDieselPrefill),
      closingDiesel: usage?.dieselBalanceInTank == null ? "" : String(usage.dieselBalanceInTank),
      prefillFrom,
    })));
  }, [dgServerRows]);
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
  const plantStoppedMinutes = idleEvents.reduce((total, event) => {
    if (!event.startTime || !event.endTime) return total;
    const [sh, sm] = event.startTime.split(":").map(Number);
    const [eh, em] = event.endTime.split(":").map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(eh)) return total;
    let minutes = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
    if (minutes < 0) minutes += 1440;
    return total + minutes;
  }, 0);
  const missingClosingReadings = useMemo(() => {
    const missing: string[] = [];
    if (!bitumenTank1ClosingDip.trim()) missing.push("Bitumen tank 1 closing dip");
    if (!bitumenTank2ClosingDip.trim()) missing.push("Bitumen tank 2 closing dip");
    if (!ldoTank1OpeningDip.trim()) missing.push("Tank 1 opening dip");
    if (!ldoTank1ClosingDip.trim()) missing.push("Tank 1 closing dip");
    if (!ldoTank2OpeningDip.trim()) missing.push("Tank 2 opening dip");
    if (!ldoTank2ClosingDip.trim()) missing.push("Tank 2 closing dip");
    for (const dg of dgReadings) {
      if (!dg.closingReading.trim()) missing.push(`${dg.equipmentName} closing hour meter`);
      if (!dg.closingDiesel.trim()) missing.push(`${dg.equipmentName} closing diesel level`);
    }
    return missing;
  }, [
    bitumenTank1ClosingDip,
    bitumenTank2ClosingDip,
    ldoTank1OpeningDip,
    ldoTank1ClosingDip,
    ldoTank2OpeningDip,
    ldoTank2ClosingDip,
    dgReadings,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (extra?: { pin?: string; effectiveDryerFedFrom?: "TANK_1" | "TANK_2" }) => {
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
        closeReason: closeReason.trim() || null,
        bitumenTank1Temp: numOrNull(bitumenTank1Temp),
        bitumenTank2Temp: numOrNull(bitumenTank2Temp),
        bitumenTank1OpeningDip: numOrNull(bitumenTank1OpeningDip),
        bitumenTank1ClosingDip: numOrNull(bitumenTank1ClosingDip),
        bitumenTank2OpeningDip: numOrNull(bitumenTank2OpeningDip),
        bitumenTank2ClosingDip: numOrNull(bitumenTank2ClosingDip),
        // Complete meter pairs are an automatic fallback/override; they are
        // saved as entered regardless of the legacy display toggle.
        ldoTank1OpeningMeter: numOrNull(ldoTank1OpeningMeter),
        ldoTank1ClosingMeter: numOrNull(ldoTank1ClosingMeter),
        ldoTank2OpeningMeter: numOrNull(ldoTank2OpeningMeter),
        ldoTank2ClosingMeter: numOrNull(ldoTank2ClosingMeter),
        ldoTank1OpeningDip: numOrNull(ldoTank1OpeningDip),
        ldoTank1ClosingDip: numOrNull(ldoTank1ClosingDip),
        ldoTank2OpeningDip: numOrNull(ldoTank2OpeningDip),
        ldoTank2ClosingDip: numOrNull(ldoTank2ClosingDip),
        dryerFedFrom: extra?.effectiveDryerFedFrom ?? dryerFedFrom ?? "TANK_2",
        boilerRunsDuringProduction: boilerRunsDuringProduction ? 1 : 0,
        noMainPlantOps,
        manpower: manpower
          .filter(m => m.name?.trim())
          .map(m => ({
            name: m.name.trim(),
            role: m.role || null,
            contractorName: m.contractorName ? m.contractorName.trim() : "",
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
      try {
        await apiRequest("POST", `/api/plant-module/shift-logs/${encodeURIComponent(date)}/dg-readings`, {
          plantName,
          readings: dgReadings.map(reading => ({
            equipmentId: reading.equipmentId,
            openingReading: reading.openingReading.trim() === "" ? null : Number(reading.openingReading),
            closingReading: reading.closingReading.trim() === "" ? null : Number(reading.closingReading),
            openingDiesel: reading.openingDiesel.trim() === "" ? null : Number(reading.openingDiesel),
            closingDiesel: reading.closingDiesel.trim() === "" ? null : Number(reading.closingDiesel),
          })),
        });
      } catch (error: any) {
        setSavedId(data.id);
        toast({
          title: "Shift log saved, but DG readings need attention",
          description: error?.message || "Retry saving the DG readings.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/dg-readings", date, plantName] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/reconciliation", date, plantName] });
      // Clear the draft now that data is safely on the server.
      clearDraft();
      setSavedId(data.id);
      // Task #434 — surface any LDO dip vs meter divergence warnings
      setPostSaveWarnings(Array.isArray(data.divergenceWarnings) ? data.divergenceWarnings : []);
      let finalized = Number(data.isFinalized) === 1;
      if (!finalized && canVerify) {
        try {
          await apiRequest("POST", `/api/plant-module/shift-logs/${data.id}/finalize`, { finalizedBy: "operator" });
          finalized = true;
          queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/reconciliation", date, plantName] });
        } catch { /* the saved log remains pending verification */ }
      }
      setIsFinalized(finalized ? 1 : 0);
      toast({
        title: finalized ? "Shift log saved" : "Shift log saved — pending verification",
      });
      if (!canVerify) goBackToList();
      // Cross-check: warn if any heating session for the same date+plant has a
      // different dryerFedFrom (non-blocking — stock routing is unchanged).
      // Fire-and-forget so list navigation is not delayed.
      fetch(
        `/api/plant-module/heating-sessions?date=${encodeURIComponent(date)}&plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" }
      ).then(hsRes => {
        if (!hsRes.ok) return;
        return hsRes.json().then((sessions: Array<{ id?: number; dryerFedFrom?: string }>) => {
          const savedDryerFedFrom: "TANK_1" | "TANK_2" = data.dryerFedFrom === "TANK_1" ? "TANK_1" : "TANK_2";
          const mismatches = sessions.filter(s => s.dryerFedFrom && s.dryerFedFrom !== savedDryerFedFrom && s.id != null);
          if (mismatches.length > 0) {
            const firstMismatch = mismatches[0];
            const slLabel = savedDryerFedFrom === "TANK_1" ? "Tank 1 (small vertical)" : "Tank 2 (big horizontal)";
            const hsLabel = firstMismatch.dryerFedFrom === "TANK_1" ? "Tank 1 (small vertical)" : "Tank 2 (big horizontal)";
            const fixTarget: DryerSourceFixTarget = {
              mode: "heating-session",
              sessionIds: mismatches.map(s => s.id as number),
              date,
              suggestedValue: savedDryerFedFrom,
              currentValue: firstMismatch.dryerFedFrom as "TANK_1" | "TANK_2",
            };
            const sessionWord = mismatches.length === 1 ? "a heating session" : `${mismatches.length} heating sessions`;
            const fixLabel = mismatches.length === 1 ? "Fix heating session" : `Fix ${mismatches.length} heating sessions`;
            toast({
              title: "Dryer-source mismatch",
              description: `This shift log says dryer fed from ${slLabel}, but ${sessionWord} for ${date} says ${hsLabel}.`,
              variant: "destructive",
              action: (
                <ToastAction
                  altText={fixLabel}
                  onClick={() => setFixDialog({ open: true, target: fixTarget })}
                >
                  {fixLabel}
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

  const handleSaveShiftLog = (extra?: { effectiveDryerFedFrom?: "TANK_1" | "TANK_2" }) => {
    if (canVerify && missingClosingReadings.length > 0 && !closeReason.trim()) {
      toast({
        title: "Reason required to close with missing readings",
        description: `Missing: ${missingClosingReadings.join(", ")}. Enter a reason before closing the day.`,
        variant: "destructive",
      });
      setMoreDetailsOpen(true);
      return;
    }
    saveMutation.mutate(extra);
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDryerMissing, setConfirmDryerMissing] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Nothing to delete");
      const res = await apiRequest("DELETE", `/api/plant-module/shift-logs/${savedId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      toast({ title: "Shift log deleted" });
      goBackToList();
    },
    onError: (err: any) => {
      if (err?.message === "Cancelled") return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });


  // Task #254 — Reactive query: roll up every heating session attributed to
  // this production day (i.e. all sessions since the prior production day,
  // overnight pre-heat included). Drives both the Boiler Meter auto-prefill
  // and the "Heating Sessions for this Production" card. Using useQuery
  // ensures the shift log picks up new/edited sessions via cache
  // invalidation (e.g. after saving a session).
  const { data: heatingSessionsForDate } = useQuery<Array<BitumenHeatingSession & { countsForDate?: string | null }>>({
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
  const { data: dipsOnlyFuelInputs } = useQuery<{ receiptLitres: number; transferLitres: number }>({
    queryKey: ["/api/plant-module/shift-logs/dips-only-inputs", date, plantName],
    enabled: viewMode === "edit" && !!date && !!plantName,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/shift-logs/${encodeURIComponent(date)}/dips-only-inputs?plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Could not load LDO receipts and transfers.");
      return res.json();
    },
  });
  const { data: ldoDaySummary } = useQuery<{
    ldo?: {
      openingGap?: {
        previousAt: string;
        currentAt: string;
        unaccountedLitres: number;
      } | null;
    };
    boilerHeating?: { idleDates?: string[] };
  }>({
    queryKey: ["/api/plant-module/daily-reports", date, plantName, "ldo-summary"],
    enabled: viewMode === "edit" && !!date && !!plantName,
    queryFn: async () => {
      const response = await fetch(
        `/api/plant-module/daily-reports/${encodeURIComponent(date)}?plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  const { data: reconciliationData, isLoading: reconciliationLoading, error: reconciliationError } = useQuery<any>({
    queryKey: ["/api/plant-module/shift-logs/reconciliation", date, plantName],
    enabled: viewMode === "edit" && !!date && canVerify,
    queryFn: async () => {
      const response = await fetch(
        `/api/plant-module/shift-logs/${encodeURIComponent(date)}/reconciliation?plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Could not load reconciliation.");
      return response.json();
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
    if (!date || existing || !previousShiftLog) return;
        const prev = previousShiftLog;
        const previousDate = String(prev.date || "");
        if (prev.bitumenTank1ClosingDip != null) {
          const next = String(prev.bitumenTank1ClosingDip);
          setBitumenTank1OpeningDip(cur => {
            if (cur && cur !== autoFilledBitumenT1Ref.current) return cur;
            autoFilledBitumenT1Ref.current = next;
            setAutoFillBitumenT1Source(`${previousDate} closing dip`);
            return next;
          });
        }
        if (prev.bitumenTank2ClosingDip != null) {
          const next = String(prev.bitumenTank2ClosingDip);
          setBitumenTank2OpeningDip(cur => {
            if (cur && cur !== autoFilledBitumenT2Ref.current) return cur;
            autoFilledBitumenT2Ref.current = next;
            setAutoFillBitumenT2Source(`${previousDate} closing dip`);
            return next;
          });
        }
        if (prev.ldoTank1ClosingDip != null) {
          const next = String(prev.ldoTank1ClosingDip);
          setLdoTank1OpeningDip(cur => {
            if (cur && cur !== autoFilledLdoDipT1Ref.current) return cur;
            autoFilledLdoDipT1Ref.current = next;
            setAutoFillLdoDipT1Source(`${previousDate} closing dip`);
            return next;
          });
        }
        if (prev.ldoTank2ClosingDip != null) {
          const next = String(prev.ldoTank2ClosingDip);
          setLdoTank2OpeningDip(cur => {
            if (cur && cur !== autoFilledLdoDipT2Ref.current) return cur;
            autoFilledLdoDipT2Ref.current = next;
            setAutoFillLdoDipT2Source(`${previousDate} closing dip`);
            return next;
          });
        }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, previousShiftLog, existing]);

  // Derived
  // The server applies the single canonical assignment rule to every
  // production-day session query. Do not re-filter it by the calendar date.
  const filteredHeatingSessionsForShiftLog = heatingSessionsForDate || [];

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
    return rows.reduce((sum, d) => sum + Number(d.loadWeight || 0), 0);
  }, [todayDispatches, plantName]);

  const ldoAccounting = useMemo(() => {
    const sessions = heatingSessionsForDate || [];
    const preheatHours = sessions.reduce((sum, session) => {
      if (session.durationHours != null) return sum + Number(session.durationHours);
      const start = session.startTime?.split(":").map(Number);
      const end = session.endTime?.split(":").map(Number);
      if (!start || !end || !Number.isFinite(start[0]) || !Number.isFinite(end[0])) return sum;
      let minutes = end[0] * 60 + (end[1] || 0) - (start[0] * 60 + (start[1] || 0));
      if (minutes < 0) minutes += 1440;
      return sum + minutes / 60;
    }, 0);
    const nightsCount = new Set(sessions
      .filter(session => session.date < date ||
        (session.date === date && !!plantStartTime && !!session.endTime && session.endTime <= plantStartTime))
      .map(session => session.date)).size;
    return calculatePlantLdo({
      tank1OpeningDipCm: numOrNull(ldoTank1OpeningDip),
      tank1ClosingDipCm: numOrNull(ldoTank1ClosingDip),
      tank2OpeningDipCm: numOrNull(ldoTank2OpeningDip),
      tank2ClosingDipCm: numOrNull(ldoTank2ClosingDip),
      receiptsLitres: dipsOnlyFuelInputs?.receiptLitres ?? 0,
      dryerMeterOpening: numOrNull(ldoTank2OpeningMeter),
      dryerMeterClosing: numOrNull(ldoTank2ClosingMeter),
      boilerMeterOpening: numOrNull(ldoTank1OpeningMeter),
      boilerMeterClosing: numOrNull(ldoTank1ClosingMeter),
      boilerMeterLitres:
        numOrNull(ldoTank1OpeningMeter) != null && numOrNull(ldoTank1ClosingMeter) != null
          ? null
          : sessions.some(session => session.ldoTank1OpeningMeter != null && session.ldoTank1ClosingMeter != null)
            ? sessions.reduce((sum, session) => {
                if (session.ldoTank1OpeningMeter == null || session.ldoTank1ClosingMeter == null) return sum;
                return sum + Math.max(0, Number(session.ldoTank1ClosingMeter) - Number(session.ldoTank1OpeningMeter));
              }, 0)
            : null,
      preheatLitres: sessions.reduce((sum, session) => sum + Number(session.ldoTank1Consumed || 0), 0),
      preheatHours,
      preheatSessionCount: sessions.length,
      nightsCount,
      plantRunHours,
      dispatchedMt: totalDispatchedMt,
    });
  }, [
    heatingSessionsForDate, date, plantStartTime, ldoTank1OpeningDip, ldoTank1ClosingDip,
    ldoTank2OpeningDip, ldoTank2ClosingDip, dipsOnlyFuelInputs, ldoTank1OpeningMeter,
    ldoTank1ClosingMeter, ldoTank2OpeningMeter, ldoTank2ClosingMeter, plantRunHours,
    totalDispatchedMt,
  ]);

  const exportShiftLogsToExcel = useCallback(() => {
    const rows = (shiftLogs || [])
      .filter(r => listDryerFilter === "all" || r.dryerFedFrom === listDryerFilter)
      .sort((a, b) => b.date.localeCompare(a.date) || (a.shiftCode || "").localeCompare(b.shiftCode || ""));
    if (!rows.length) return;
    const data = rows.map(r => {
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
      const boilerLPerH = (ldo1 != null && dur && dur > 0) ? parseFloat((ldo1 / dur).toFixed(1)) : "";
      const dryerLPerH = (ldo2 != null && dur && dur > 0) ? parseFloat((ldo2 / dur).toFixed(1)) : "";
      return {
        Date: r.date,
        Plant: r.plantName || defaultPlantName,
        Shift: r.shiftCode || "",
        "Plant Start": r.plantStartTime || "",
        "Plant Stop": r.plantStopTime || "",
        "Duration (h)": dur ?? "",
        Operator: r.operatorName || "",
        Supervisor: r.supervisorName || "",
        Weather: r.weather || "",
        Status: r.isFinalized ? "Finalized" : "Draft",
        "Boiler LDO (L)": ldo1 != null ? parseFloat(ldo1.toFixed(0)) : "",
        "Dryer LDO (L)": ldo2 != null ? parseFloat(ldo2.toFixed(0)) : "",
        "Boiler L/h": boilerLPerH,
        "Dryer L/h": dryerLPerH,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plant Shift Logs");
    const filename = `PlantShiftLogs_${listDateFrom}_to_${listDateTo}.xlsx`;
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast({ title: "Export started", description: `${rows.length} row${rows.length === 1 ? "" : "s"} exported.` });
  }, [shiftLogs, listDryerFilter, listDateFrom, listDateTo, toast]);

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
        {postSaveWarnings.length > 0 && (
          <div className="rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-4 flex gap-3 items-start" data-testid="banner-divergence-warnings">
            <span className="text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-yellow-800 dark:text-yellow-300 text-sm mb-1">Flow meter variance from dip reading — stock computed from dip</p>
              <ul className="space-y-1">
                {postSaveWarnings.map((w, i) => (
                  <li key={i} className="text-yellow-700 dark:text-yellow-400 text-sm" data-testid={`text-divergence-warning-${i}`}>{w}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setPostSaveWarnings([])}
              className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 shrink-0"
              aria-label="Dismiss warnings"
              data-testid="button-dismiss-warnings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={backLink}>
              <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">HMP shift logs</h1>
              <p className="text-sm text-muted-foreground">Daily shift runs — pick a date to open or start a new log</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-sm whitespace-nowrap">From</Label>
              <Input type="date" value={listDateFrom} onChange={e => setListDateFrom(e.target.value)} className="w-40" data-testid="input-list-from" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-sm whitespace-nowrap">To</Label>
              <Input type="date" value={listDateTo} onChange={e => setListDateTo(e.target.value)} className="w-40" data-testid="input-list-to" />
            </div>
            <Select value={listDryerFilter} onValueChange={v => setListDryerFilter(v as "all" | "TANK_1" | "TANK_2")}>
              <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-dryer-filter">
                <SelectValue placeholder="Dryer fed from" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tanks</SelectItem>
                <SelectItem value="TANK_1">Tank 1 (small vertical)</SelectItem>
                <SelectItem value="TANK_2">Tank 2 (big horizontal)</SelectItem>
              </SelectContent>
            </Select>
            <Link href={appendPlantContext("/plant/shift-log-manpower-review", { forceTab: "operations" })}>
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 dark:text-amber-400" data-testid="link-manpower-review">
                <Users className="w-4 h-4 mr-1" />Review UNKNOWN
              </Button>
            </Link>
            <ReportExportGate sections={["plant_shift_logs"]}><Button variant="outline" size="sm" onClick={exportShiftLogsToExcel} disabled={!sorted.length} data-testid="button-export-shift-logs">
              <Download className="w-4 h-4 mr-1" />Excel
            </Button></ReportExportGate>
            <Button onClick={openNew} data-testid="button-new-shift-log"><Plus className="w-4 h-4 mr-1" />New Log</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Plant Logs {listDateFrom} → {listDateTo}</CardTitle></CardHeader>
          <CardContent>
            {listLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
              !sorted.length ? <p className="text-sm text-muted-foreground">{listDryerFilter !== "all" ? `No plant logs with dryer fed from ${listDryerFilter === "TANK_1" ? "Tank 1 (small vertical)" : "Tank 2 (big horizontal)"} in this date range.` : "No plant logs in this date range."}</p> :
              <div className="space-y-1">
                {Object.keys(grouped).map(d => {
                  const isOpen = openDateGroups.has(d);
                  return (
                  <div key={d}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="sticky top-14 z-10 bg-background w-full flex items-center gap-2 border-b pb-2 mb-3 pt-1 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleDateGroup(d)}
                      data-testid={`button-toggle-date-${d}`}
                    >
                      <ChevronDown
                        className="w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform duration-200"
                        style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                      <h3 className="font-semibold text-lg">{format(parseISO(d), "EEEE, dd MMM yyyy")}</h3>
                      <span className="text-sm text-muted-foreground ml-1">({grouped[d].length} log{grouped[d].length !== 1 ? "s" : ""})</span>
                    </button>
                    {isOpen && <div className="space-y-2">
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
                                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{r.shiftCode}</span>
                                <span className="font-medium text-sm">{r.plantStartTime || "—"} → {r.plantStopTime || "—"}</span>
                                {dur != null && <span className="text-sm text-muted-foreground">({dur} h)</span>}
                                {r.plantName !== defaultPlantName && <span className="text-sm text-muted-foreground">· {r.plantName}</span>}
                                {r.isFinalized
                                  ? <Badge variant="default" className="bg-green-600 text-sm px-1.5 py-0">✓ Done</Badge>
                                  : <Badge variant="secondary" className="text-sm px-1.5 py-0">Draft</Badge>
                                }
                                {mismatch && mismatch.shiftLogValue && (mismatch.shiftLogId === null || mismatch.shiftLogId === r.id) && (() => {
                                  const slValue = mismatch.shiftLogValue;
                                  const oppValue = slValue === "TANK_1" ? "TANK_2" : "TANK_1";
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setFixDialog({
                                        open: true,
                                        target: {
                                          mode: "shift-log",
                                          recordId: r.id,
                                          date: r.date,
                                          currentValue: slValue,
                                          suggestedValue: oppValue,
                                        },
                                      })}
                                      className="inline-flex items-center gap-1 rounded px-1.5 py-0 text-sm font-medium bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700 dark:hover:bg-orange-900/50 cursor-pointer"
                                      data-testid={`badge-dryer-mismatch-${r.id}`}
                                    >
                                      ⚠ Dryer source conflict
                                    </button>
                                  );
                                })()}
                              </div>
                              {/* Line 2 — consumption metrics */}
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mt-1.5">
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
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Link href={appendPlantContext(`/plant/daily-report/${r.date}`, { forceTab: "operations" })}>
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
                    </div>}
                  </div>
                  );
                })}
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
            <h1 className="text-2xl font-bold">HMP shift log</h1>
            <p className="text-sm text-muted-foreground">Operator daily log – plant start/stop, idle events, manpower, fuel meters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized ? <Badge variant="default" className="bg-green-600">Finalized</Badge> : savedId ? <Badge variant="secondary">Draft saved</Badge> : null}
          {!!isFinalized && savedId && (
            <EditPermissionButton
              recordType="plant_shift_log"
              recordId={savedId}
              onEditGranted={() => setIsFinalized(0)}
              label="Request Edit"
              size="sm"
            />
          )}
          <AutoSaveIndicator lastSavedAt={lastSavedAt} />
          <Link href={appendPlantContext(`/plant/daily-report/${date}`, { forceTab: "operations" })}>
            <Button variant="outline" size="sm" data-testid="button-view-daily-report"><FileText className="w-4 h-4 mr-1" />Daily Report</Button>
          </Link>
        </div>
      </div>

      <DraftRestoredBanner
        show={draftRestored}
        draftSavedAt={draftSavedAt}
        onDismiss={() => setDraftRestored(false)}
        onDiscard={discardDraft}
        discardLabel="Discard draft"
      />

      {isLoading && (
        <Card data-testid="loading-shift-log-form">
          <CardContent className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">Loading saved data…</span>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-shift-start-end">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>Start and end of day</CardTitle>
            <div className="flex items-center gap-2 rounded border border-dashed border-orange-300 bg-orange-50/40 dark:bg-orange-950/20 px-3 py-2">
              <Switch
                id="no-main-plant-ops"
                checked={noMainPlantOps}
                onCheckedChange={setNoMainPlantOps}
                data-testid="switch-no-main-plant-ops"
              />
              <Label htmlFor="no-main-plant-ops" className="text-sm cursor-pointer">
                No {defaultPlantName} Operations
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div><Label>{noMainPlantOps ? "Shift start" : "Plant start"}</Label><Input type="time" value={plantStartTime} onChange={e => setPlantStartTime(e.target.value)} data-testid="input-plant-start" /></div>
            <div><Label>{noMainPlantOps ? "Shift end" : "Plant stop"}</Label><Input type="time" value={plantStopTime} onChange={e => setPlantStopTime(e.target.value)} data-testid="input-plant-stop" /></div>
            <div><Label>Operator</Label><Input value={operatorName} onChange={e => setOperatorName(e.target.value)} data-testid="input-operator" /></div>
            <div><Label>Plant</Label><Input value={plantName} onChange={e => setPlantName(e.target.value)} data-testid="input-plant-name" /></div>
          </div>

          <details
            className="rounded-md border px-3 py-2"
            open={moreDetailsOpen}
            onToggle={(event) => setMoreDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
            data-testid="details-shift-more"
          >
            <summary className="cursor-pointer text-sm font-medium">More details</summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
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
              <div><Label>Ambient temperature °C</Label><Input type="number" step="0.1" value={ambientTemp} onChange={e => setAmbientTemp(e.target.value)} data-testid="input-ambient-temp" /></div>
              <div><Label>Bitumen tank 1 — temp (°C)</Label><Input type="number" step="0.1" value={bitumenTank1Temp} onChange={e => setBitumenTank1Temp(e.target.value)} data-testid="input-bitumen-t1-temp" /></div>
              <div><Label>Bitumen tank 2 — temp (°C)</Label><Input type="number" step="0.1" value={bitumenTank2Temp} onChange={e => setBitumenTank2Temp(e.target.value)} data-testid="input-bitumen-t2-temp" /></div>
              <div className="flex items-center gap-2 rounded border border-dashed border-amber-300 px-3 py-2">
                <Switch
                  id="boiler-runs-during-production"
                  checked={boilerRunsDuringProduction}
                  onCheckedChange={setBoilerRunsDuringProduction}
                  data-testid="switch-boiler-runs-during-production"
                />
                <Label htmlFor="boiler-runs-during-production" className="text-sm cursor-pointer">
                  Boiler runs during production
                </Label>
              </div>
              <div><Label>Boiler meter — opening</Label><Input type="number" step="0.01" value={ldoTank1OpeningMeter} onChange={e => setLdoTank1OpeningMeter(e.target.value)} data-testid="input-ldo-t1-open" /></div>
              <div><Label>Boiler meter — closing</Label><Input type="number" step="0.01" value={ldoTank1ClosingMeter} onChange={e => setLdoTank1ClosingMeter(e.target.value)} data-testid="input-ldo-t1-close" /></div>
            </div>
          </details>

          {!noMainPlantOps && <div className="space-y-3 rounded-md border p-3" data-testid="section-opening-readings">
            <h3 className="font-medium">Opening readings</h3>
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <div
                ref={dryerFocusRef}
                className={`flex items-center gap-2 rounded border border-dashed px-3 py-2 transition-all duration-300 ${
                  dryerHighlighted
                    ? "border-red-500 bg-red-50/70 dark:bg-red-950/30 ring-2 ring-red-400"
                    : "border-blue-300 bg-blue-50/40 dark:bg-blue-950/20"
                }`}
              >
                <Label htmlFor="dryer-fed-from" className="text-sm">Which tank feeds the dryer?</Label>
                <Select value={dryerFedFrom ?? ""} onValueChange={(value) => { setDryerFedFrom(value as "TANK_1" | "TANK_2"); setDryerFedFromNote(""); }}>
                  <SelectTrigger id="dryer-fed-from" className="h-8 w-36" data-testid="select-dryer-fed-from">
                    <SelectValue placeholder="Select tank…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TANK_1">Tank 1 (small vertical)</SelectItem>
                    <SelectItem value="TANK_2">Tank 2 (big horizontal)</SelectItem>
                  </SelectContent>
                </Select>
                {dryerFedFromNote && <p className="text-xs text-muted-foreground">{dryerFedFromNote}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Bitumen tank 1 — opening dip (cm)", value: bitumenTank1OpeningDip, set: setBitumenTank1OpeningDip, testId: "input-bitumen-t1-open", source: autoFillBitumenT1Source, sourceId: "text-autofill-bitumen-t1-open", hintId: "text-bitumen-t1-open-mt", hint: dipHint(bitumenTank1OpeningDip), onEdit: () => { setAutoFillBitumenT1Source(""); autoFilledBitumenT1Ref.current = null; } },
                { label: "Bitumen tank 2 — opening dip (cm)", value: bitumenTank2OpeningDip, set: setBitumenTank2OpeningDip, testId: "input-bitumen-t2-open", source: autoFillBitumenT2Source, sourceId: "text-autofill-bitumen-t2-open", hintId: "text-bitumen-t2-open-mt", hint: dipHint(bitumenTank2OpeningDip), onEdit: () => { setAutoFillBitumenT2Source(""); autoFilledBitumenT2Ref.current = null; } },
              ].map(({ label, value, set, testId, source, sourceId, hintId, hint, onEdit }) => (
                <div key={testId}>
                  <Label>{label}</Label>
                  <Input type="number" step="0.1" value={value} onChange={event => { set(event.target.value); onEdit(); }} data-testid={testId} />
                  {source && <p className="mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid={sourceId}>Auto-filled from {source}</p>}
                  {hint && <p className="mt-1 text-sm font-medium" data-testid={hintId}>{hint}</p>}
                </div>
              ))}
              <div>
                <Label>Tank 1 (small vertical) — opening dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank1OpeningDip} onChange={event => { setLdoTank1OpeningDip(event.target.value); setAutoFillLdoDipT1Source(""); autoFilledLdoDipT1Ref.current = null; }} data-testid="input-ldo-dip-t1-open-main" />
                {ldoDipHint(1, ldoTank1OpeningDip) && <p className="mt-1 text-sm font-medium" data-testid="text-ldo-dip-t1-open-litres">{ldoDipHint(1, ldoTank1OpeningDip)}</p>}
              </div>
              <div>
                <Label>Tank 2 (big horizontal) — opening dip (cm)</Label>
                <Input type="number" step="0.1" value={ldoTank2OpeningDip} onChange={event => { setLdoTank2OpeningDip(event.target.value); setAutoFillLdoDipT2Source(""); autoFilledLdoDipT2Ref.current = null; }} data-testid="input-ldo-dip-t2-open-main" />
                {ldoDipHint(2, ldoTank2OpeningDip) && <p className="mt-1 text-sm font-medium" data-testid="text-ldo-dip-t2-open-litres">{ldoDipHint(2, ldoTank2OpeningDip)}</p>}
              </div>
              <div>
                <Label>Dryer fuel meter — opening</Label>
                <Input type="number" step="0.01" value={ldoTank2OpeningMeter} onChange={event => { setLdoTank2OpeningMeter(event.target.value); setAutoFillT2Source(""); }} data-testid="input-ldo-t2-open" />
                {autoFillT2Source && <p className="mt-1 text-xs text-blue-600 dark:text-blue-400" data-testid="text-autofill-t2">Auto-filled from {autoFillT2Source}</p>}
              </div>
              {dgReadings.map((reading, index) => <div key={`open-${reading.equipmentId}`} className="rounded border p-2">
                <p className="mb-2 text-sm font-medium">{reading.equipmentName}</p>
                {reading.prefillFrom && <p className="mb-2 text-xs text-muted-foreground">Opening values prefilled from {reading.prefillFrom}.</p>}
                <Label htmlFor={`dg-${reading.equipmentId}-openingReading`}>Opening hour meter</Label>
                <Input id={`dg-${reading.equipmentId}-openingReading`} type="number" min="0" step="0.1" value={reading.openingReading}
                  onChange={event => setDgReadings(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, openingReading: event.target.value } : row))}
                  data-testid={`input-dg-${reading.equipmentId}-openingReading`} />
                <Label htmlFor={`dg-${reading.equipmentId}-openingDiesel`} className="mt-2 block">Opening diesel level (L)</Label>
                <Input id={`dg-${reading.equipmentId}-openingDiesel`} type="number" min="0" step="0.1" value={reading.openingDiesel}
                  onChange={event => setDgReadings(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, openingDiesel: event.target.value } : row))}
                  data-testid={`input-dg-${reading.equipmentId}-openingDiesel`} />
              </div>)}
            </div>
          </div>}

          <div className="space-y-3 rounded-md border p-3" data-testid="section-closing-readings">
            <h3 className="font-medium">Closing readings</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {!noMainPlantOps && <>
                <div>
                  <Label>Bitumen tank 1 — closing dip (cm)</Label>
                  <Input type="number" step="0.1" value={bitumenTank1ClosingDip} onChange={event => setBitumenTank1ClosingDip(event.target.value)} data-testid="input-bitumen-t1-close" />
                  {dipHint(bitumenTank1ClosingDip) && <p className="mt-1 text-sm font-medium" data-testid="text-bitumen-t1-close-mt">{dipHint(bitumenTank1ClosingDip)}</p>}
                </div>
                <div>
                  <Label>Bitumen tank 2 — closing dip (cm)</Label>
                  <Input type="number" step="0.1" value={bitumenTank2ClosingDip} onChange={event => setBitumenTank2ClosingDip(event.target.value)} data-testid="input-bitumen-t2-close" />
                  {dipHint(bitumenTank2ClosingDip) && <p className="mt-1 text-sm font-medium" data-testid="text-bitumen-t2-close-mt">{dipHint(bitumenTank2ClosingDip)}</p>}
                </div>
                <div>
                  <Label>Tank 1 (small vertical) — closing dip (cm)</Label>
                  <Input type="number" step="0.1" value={ldoTank1ClosingDip} onChange={event => { setLdoTank1ClosingDip(event.target.value); setAutoFillLdoDipT1Source(""); autoFilledLdoDipT1Ref.current = null; }} data-testid="input-ldo-dip-t1-close-main" />
                  {ldoDipHint(1, ldoTank1ClosingDip) && <p className="mt-1 text-sm font-medium" data-testid="text-ldo-dip-t1-close-litres">{ldoDipHint(1, ldoTank1ClosingDip)}</p>}
                </div>
                <div>
                  <Label>Tank 2 (big horizontal) — closing dip (cm)</Label>
                  <Input type="number" step="0.1" value={ldoTank2ClosingDip} onChange={event => { setLdoTank2ClosingDip(event.target.value); setAutoFillLdoDipT2Source(""); autoFilledLdoDipT2Ref.current = null; }} data-testid="input-ldo-dip-t2-close-main" />
                  {ldoDipHint(2, ldoTank2ClosingDip) && <p className="mt-1 text-sm font-medium" data-testid="text-ldo-dip-t2-close-litres">{ldoDipHint(2, ldoTank2ClosingDip)}</p>}
                </div>
                <div>
                  <Label>Dryer fuel meter — closing</Label>
                  <Input type="number" step="0.01" value={ldoTank2ClosingMeter} onChange={event => setLdoTank2ClosingMeter(event.target.value)} data-testid="input-ldo-t2-close" />
                </div>
              </>}
              {dgReadings.map((reading, index) => <div key={`close-${reading.equipmentId}`} className="rounded border p-2">
                <p className="mb-2 text-sm font-medium">{reading.equipmentName}</p>
                <Label htmlFor={`dg-${reading.equipmentId}-closingReading`}>Closing hour meter</Label>
                <Input id={`dg-${reading.equipmentId}-closingReading`} type="number" min="0" step="0.1" value={reading.closingReading}
                  onChange={event => setDgReadings(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, closingReading: event.target.value } : row))}
                  data-testid={`input-dg-${reading.equipmentId}-closingReading`} />
                <Label htmlFor={`dg-${reading.equipmentId}-closingDiesel`} className="mt-2 block">Closing diesel level (L)</Label>
                <Input id={`dg-${reading.equipmentId}-closingDiesel`} type="number" min="0" step="0.1" value={reading.closingDiesel}
                  onChange={event => setDgReadings(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, closingDiesel: event.target.value } : row))}
                  data-testid={`input-dg-${reading.equipmentId}-closingDiesel`} />
              </div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Quick plant actions">
        {canEditPlantDay && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 whitespace-normal py-2 text-center"
            onClick={openAddIdle}
            data-testid="button-quick-plant-stopped"
          >
            Plant stopped
          </Button>
        )}
      </div>

      {!isLoading && <>

      {!noMainPlantOps && <Card>
        <CardHeader>
          <CardTitle>LDO consumption summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              title: `1. Pre-heat — ${ldoAccounting.preheatSessionCount} sessions / ${ldoAccounting.nightsCount} nights`,
              value: `${ldoAccounting.preheatLitres.toFixed(1)} L · ${ldoAccounting.preheatHours?.toFixed(1) ?? "—"} h · ${ldoAccounting.preheatLitresPerHour?.toFixed(1) ?? "—"} L/h`,
              testId: "ldo-summary-preheat",
            },
            {
              title: `2. Boiler during production${ldoAccounting.boilerMeterUsed ? " (meter)" : ""}`,
              value: `${plantRunHours?.toFixed(1) ?? "—"} h · ${ldoAccounting.boilerDuringProductionLitres?.toFixed(1) ?? "—"} L · ${ldoAccounting.boilerDuringProductionLitresPerHour?.toFixed(1) ?? "—"} L/h`,
              testId: "ldo-summary-boiler-production",
            },
            {
              title: "3. Dryer — flow meter",
              value: `${ldoAccounting.dryerLitres?.toFixed(1) ?? "—"} L${(totalDispatchedMt || 0) > 0 ? ` · ${ldoAccounting.dryerLitresPerMt?.toFixed(2) ?? "—"} L/MT` : ""}`,
              testId: "ldo-summary-dryer",
            },
            ...((totalDispatchedMt || 0) > 0 ? [{
              title: "4. Boiler, including pre-heat",
              value: `${ldoAccounting.boilerLitresPerMt?.toFixed(2) ?? "—"} L/MT`,
              testId: "ldo-summary-boiler-per-mt",
            }] : []),
            {
              title: `${(totalDispatchedMt || 0) > 0 ? "5" : "4"}. Total LDO`,
              value: `${ldoAccounting.totalLitres?.toFixed(1) ?? "—"} L${(totalDispatchedMt || 0) > 0 ? ` · ${ldoAccounting.totalLitresPerMt?.toFixed(2) ?? "—"} L/MT` : ""}`,
              testId: "ldo-summary-total",
            },
            {
              title: "6. Plant stops",
              value: `${idleEvents.length} events · ${formatStoppedTime(plantStoppedMinutes)} h:mm`,
              testId: "ldo-summary-stops",
            },
          ].map((line) => (
            <div key={line.testId} className="flex flex-col gap-1 border-b pb-2 sm:flex-row sm:items-center sm:justify-between" data-testid={line.testId}>
              <span className="font-medium">{line.title}</span>
              <span className="text-sm tabular-nums">{line.value}</span>
            </div>
          ))}
          {ldoAccounting.preheatSessionCount > 1 && (
            <p className="text-xs text-muted-foreground" data-testid="ldo-summary-idle-sessions">
              {(() => {
                const sessions = heatingSessionsForDate || [];
                const sessionDates = Array.from(new Set(sessions.map(session => session.date))).sort();
                const idleDates = ldoDaySummary?.boilerHeating?.idleDates || [];
                const first = sessionDates[0];
                const last = sessionDates[sessionDates.length - 1];
                const allSessionsIdle = sessionDates.length > 0 && sessionDates.every(sessionDate => idleDates.includes(sessionDate));
                const dateRange = first
                  ? first === last
                    ? format(parseISO(first), "dd MMM")
                    : `${format(parseISO(first), "dd MMM")}–${format(parseISO(last), "dd MMM")}`
                  : "before production";
                return `Includes ${ldoAccounting.preheatSessionCount} heating sessions (${dateRange}${allSessionsIdle ? ", plant idle" : ""}), ${ldoAccounting.preheatLitres.toFixed(0)} L.`;
              })()}
            </p>
          )}
          {ldoAccounting.checkDipsOrDryerMeter && (
            <p className="rounded border border-amber-400 p-2 text-sm font-medium" data-testid="warning-dips-only-fuel-reconciliation">
              Check dips / dryer meter
            </p>
          )}
          {ldoDaySummary?.ldo?.openingGap && (
            <p className="rounded border border-amber-400 p-2 text-sm font-medium" data-testid="warning-ldo-opening-gap">
              {Math.abs(ldoDaySummary.ldo.openingGap.unaccountedLitres).toFixed(1)} L unaccounted between {ldoDaySummary.ldo.openingGap.previousAt} and plant start ({ldoDaySummary.ldo.openingGap.currentAt}) — check dips.
            </p>
          )}
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
            {(() => {
              const base = appendPlantContext(`/plant/heating-sessions/${date}`, { forceTab: "operations" });
              const sep = base.includes("?") ? "&" : "?";
              const returnTo = `/plant/shift-log/${date}?plant=${encodeURIComponent(plantName)}`;
              return (
                <Link href={`${base}${sep}returnTo=${encodeURIComponent(returnTo)}`}>
                  <Button size="sm" variant="outline" data-testid="button-open-heating-sessions">
                    <Plus className="w-4 h-4 mr-1" />Add / Edit Sessions
                  </Button>
                </Link>
              );
            })()}
          </div>
          {/* Task #254 — make the attribution rule visible to operators. */}
          <p className="text-sm text-muted-foreground">
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
                  <tr className="text-left text-sm text-muted-foreground border-b">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Staff</th>
                    <th className="py-2 pr-2 text-right">Boiler LDO (L)</th>
                    <th className="py-2 pr-2 text-right">DG</th>
                    <th className="py-2 pr-2">Hot-oil end °C</th>
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
                        <td className="py-2 pr-2 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-shift-heating-date-${s.id}`}>
                          {s.date}
                          {s.date !== date && (
                            <Badge variant="outline" className="ml-1 text-[12px] border-amber-400 text-amber-700 dark:text-amber-400">prior</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"} className="text-sm">
                            {heatingSessionTypeLabel(s.sessionType)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{s.startTime || "—"} → {s.endTime || "—"}</td>
                        <td className="py-2 pr-2">{s.staffName || "—"}</td>
                        <td className="py-2 pr-2 text-right">{s.ldoTank1Consumed?.toFixed(1) ?? "—"}</td>
                        <td className="py-2 pr-2 text-right">
                          {s.generatorLogId != null ? (
                            <Badge variant="outline" className="text-sm border-emerald-400 text-emerald-700 dark:text-emerald-400" data-testid={`badge-shift-dg-${s.id}`}>
                              #{s.generatorLogId}
                            </Badge>
                          ) : s.dgMode === "none" ? "—" : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">{s.hotOilTempEnd ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-sm text-muted-foreground mt-2">
                Bitumen tank temperatures and DG runs recorded inside a session are the source of truth for the Daily Plant Report. When the "Boiler runs during production" toggle above is on, the shift's Boiler Meter delta is added on top of these session totals.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {moreDetailsOpen && <Card>
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
                  <tr className="text-left text-sm text-muted-foreground border-b">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Contractor</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Gender</th>
                    <th className="py-2 pr-2">Rate-card key</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manpower.map((m, i) => (
                    <tr key={i} className="border-b last:border-b-0" data-testid={`row-manpower-${i}`}>
                      <td className="py-2 pr-2 font-medium">{m.name}{m.role ? <span className="text-sm text-muted-foreground"> ({m.role})</span> : null}</td>
                      <td className="py-2 pr-2">{m.contractorName || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.category || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.gender || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2"><Badge variant="outline" className="font-mono text-sm">{rateCardKeyForRow(m) || "—"}</Badge></td>
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
      </Card>}

      <Card id="plant-idle-events">
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
                  <tr className="text-left text-sm text-muted-foreground border-b">
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
                        <td className="py-2 pr-2"><Badge variant="outline" className="text-sm">{ev.reason}</Badge></td>
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
      </Card>

      {/* Manpower modal */}
      <Dialog open={mpDialogOpen} onOpenChange={setMpDialogOpen}>
        <DialogContent data-testid="dialog-manpower">
          <DialogHeader><DialogTitle>{mpEditingIdx === null ? "Add manpower" : "Edit manpower"}</DialogTitle></DialogHeader>
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
              <p className="text-sm text-muted-foreground">
                Vendor Bills (Labour) will pull this row using rate-card key:{" "}
                <Badge variant="outline" className="font-mono text-sm ml-1" data-testid="text-mp-rate-card-key">{rateCardKeyForRow(mpDraft) || "—"}</Badge>
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
          <DialogHeader><DialogTitle>{idleEditingIdx === null ? "Add idle event" : "Edit idle event"}</DialogTitle></DialogHeader>
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

      {canVerify && (
        <Card data-testid="card-end-of-day-reconciliation">
          <CardHeader><CardTitle>End-of-day reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {reconciliationLoading && <p className="text-sm text-muted-foreground">Loading reconciliation…</p>}
            {reconciliationError && <p className="text-sm text-destructive">Reconciliation could not be loaded.</p>}
            {reconciliationData?.reconciliation && (() => {
              const report = reconciliationData.reconciliation;
              const bitumen = report.bitumen || {};
              const ldo = report.ldo || {};
              const number = (value: unknown, digits = 2) =>
                value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(digits);
              return (
                <>
                  <div>
                    <h3 className="font-medium">Bitumen (MT)</h3>
                    <p className="text-sm text-muted-foreground">
                      Opening {number(bitumen.openingMT, 3)} + received {number(bitumen.receivedMT, 3)} − closing {number(bitumen.closingMT, 3)} = actual {number(bitumen.actualUsedMT, 3)}
                    </p>
                    <p className="text-sm">Theoretical {number(bitumen.theoreticalMT, 3)} · Difference {number(bitumen.differenceMT, 3)} MT</p>
                  </div>
                  <div>
                    <h3 className="font-medium">LDO (L)</h3>
                    <p className="text-sm text-muted-foreground">
                      Boiler during production {number(ldo.boilerLitres, 1)} L · Dryer {number(ldo.dryerLitres, 1)} L · Pre-heat {number(ldo.heatingSessionLitres, 1)} L
                    </p>
                    <p className="text-sm">
                      Total {number(ldo.totalLitres, 1)} L · Theoretical {number(ldo.theoreticalLitres, 1)} L · Difference {number(ldo.differenceLitres, 1)} L · {number(ldo.litresPerMT, 3)} L/MT
                    </p>
                  </div>
                  {Array.isArray(report.generators) && report.generators.length > 0 && (
                    <div>
                      <h3 className="font-medium">DG</h3>
                      <div className="space-y-1">
                        {report.generators.map((generator: any) => (
                          <p key={generator.id} className="text-sm">
                            {generator.generatorName}: {number(generator.hoursRun, 2)} hours · {number(generator.consumed, 1)} L · {number(generator.lPerHr, 2)} L/hour
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(report.byPartyAndMix) && report.byPartyAndMix.length > 0 && (
                    <div>
                      <h3 className="font-medium">Trucks by party/job and mix</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-left"><th className="py-1 pr-3">Party/job</th><th className="py-1 pr-3">Mix</th><th className="py-1 pr-3">Trucks</th><th className="py-1 text-right">MT</th></tr></thead>
                          <tbody>
                            {report.byPartyAndMix.map((row: any, index: number) => (
                              <tr key={`${row.partyName}-${row.mixName}-${index}`} className="border-b last:border-0">
                                <td className="py-1 pr-3">{row.partyName}</td><td className="py-1 pr-3">{row.mixName}</td>
                                <td className="py-1 pr-3">{row.loads}</td><td className="py-1 text-right">{number(row.mt, 3)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {Array.isArray(report.missingReadings) && report.missingReadings.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20" data-testid="list-missing-plant-readings">
                      <h3 className="font-medium">Missing readings</h3>
                      <ul className="list-disc pl-5 text-sm">
                        {report.missingReadings.map((item: string) => <li key={item}>{item}</li>)}
                      </ul>
                      {report.closeReason && <p className="mt-2 text-sm">Close reason: {report.closeReason}</p>}
                    </div>
                  )}
                </>
              );
            })()}
            {canVerify && missingClosingReadings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                <p className="font-medium">Missing closing readings</p>
                <ul className="list-disc pl-5 text-sm">
                  {missingClosingReadings.map(item => <li key={item}>{item}</li>)}
                </ul>
                <Label htmlFor="plant-close-reason" className="mt-2 block">Reason for closing without these readings</Label>
                <Textarea
                  id="plant-close-reason"
                  rows={2}
                  value={closeReason}
                  onChange={event => setCloseReason(event.target.value)}
                  placeholder="Required to close the day"
                  data-testid="input-plant-close-reason"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        <Button
          onClick={() => {
            if (!noMainPlantOps && dryerFedFrom === null) {
              setConfirmDryerMissing(true);
            } else {
              handleSaveShiftLog();
            }
          }}
          disabled={saveMutation.isPending}
          data-testid="button-save"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {canVerify ? "Close day" : "Save shift log"}
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

      <AlertDialog open={confirmDryerMissing} onOpenChange={setConfirmDryerMissing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dryer feed tank not selected</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't selected which tank feeds the dryer this shift. LDO stock consumption will be recorded against Tank 2 (big horizontal) by default, which may produce incorrect stock balances if the dryer is actually fed from Tank 1 (small vertical).
              <br /><br />
              Please go back and select the correct tank, or confirm to proceed with Tank 2 as the default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-dryer-missing-cancel">Go back and select</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmDryerMissing(false); handleSaveShiftLog({ effectiveDryerFedFrom: "TANK_2" }); }}
              data-testid="button-dryer-missing-confirm"
            >
              Proceed with Tank 2
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
