import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import { Link, useLocation, useSearch } from "wouter";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronLeft, ChevronRight, Plus, Truck, Loader2, Lock, Trash2, Edit, Download, Printer, AlertTriangle, ChevronsUpDown, Check, X, BarChart2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { format } from "date-fns";
import { formatPersonName } from "@shared/personName";
import { cn } from "@/lib/utils";
import type { Party, MixTemplate, TruckDispatch, MixType, Site, EquipmentMasterType, PlantSettings } from "@shared/schema";

function dispatchProPlainReason(value: string | null | undefined): string {
  if (!value) return "Required dispatch details are missing.";
  if (/expected\s+string|null.*string|invalid.*string/i.test(value)) return "DispatchPro refused a blank field. Retry after the DispatchPro update.";
  if (/timeout|network|fetch|ECONN|socket/i.test(value)) return "Could not reach DispatchPro. Try again.";
  if (/auth|token|credential|unauthor/i.test(value)) return "DispatchPro connection needs attention.";
  return "Could not send to DispatchPro. Try again.";
}

function dispatchProSentText(dispatch: TruckDispatch): string {
  const parts = [`DispatchPro challan ${dispatch.dispatchProChallanNo || "—"}`];
  if (dispatch.dispatchProArrivedAt) parts.push(`Arrived ${format(new Date(dispatch.dispatchProArrivedAt), "dd MMM HH:mm")}`);
  if (dispatch.dispatchProLeftAt) parts.push(`Unloaded ${format(new Date(dispatch.dispatchProLeftAt), "dd MMM HH:mm")}`);
  return parts.join(" · ");
}

function istDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function istDateTimeLabel(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dispatchDateTime(date: string, time: string | null | undefined): number | null {
  if (!date || !time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const timestamp = new Date(`${date}T${match[1].padStart(2, "0")}:${match[2]}:00+05:30`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function durationLabel(start: number | null, end: string | Date | null | undefined): string {
  if (start == null || !end) return "";
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!Number.isFinite(endMs) || endMs < start) return "";
  const minutes = Math.floor((endMs - start) / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function dispatchPlainStatus(dispatch: TruckDispatch): string {
  if (dispatch.dispatchProLeftAt) return "Unloaded";
  if (dispatch.dispatchProArrivedAt) return "Arrived";
  return dispatch.dispatchProSyncStatus === "sent" ? "Sent" : "Not sent to DispatchPro";
}

export default function PlantDispatches() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { sectionCan, featureCan, user } = useAuth();
  const { companyName, companyShortName, logoFile } = useFeatureFlags();
  const canCreate = featureCan("hmp_rmc", "add");
  const canEdit = featureCan("hmp_rmc", "edit");
  const canOverrideTolerance = featureCan("hmp_rmc", "verify");
  const canExport = sectionCan("plant_production", "export");
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastSavedDispatch, setLastSavedDispatch] = useState<TruckDispatch | null>(null);
  const [editingDispatch, setEditingDispatch] = useState<TruckDispatch | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  
  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_DISPATCHES_FILTER_URL_KEYS = [
    "filterDateFrom", "filterDateTo", "filterPartyId", "filterMixType", "filterVehicle", "filterOwner", "filterPlantName", "plantId",
  ];
  const mgmtReportPlant = (() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("from") === "management-report" ? (sp.get("filterPlantName") || null) : null;
  })();
  const mgmtReportPlantId = (() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("from") !== "management-report") return null;
    const raw = sp.get("plantId");
    return raw ? Number(raw) : null;
  })();

  const urlHasDispatchFilterParams = (() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return PLANT_DISPATCHES_FILTER_URL_KEYS.some((k) => sp.has(k));
  })();
  const urlDispatchFilterDefaults = (() => {
    if (typeof window === "undefined" || !urlHasDispatchFilterParams) return {};
    const sp = new URLSearchParams(window.location.search);
    return {
      filterDateFrom: sp.get("filterDateFrom") ?? "",
      filterDateTo: sp.get("filterDateTo") ?? "",
      filterPartyId: sp.get("filterPartyId") ?? "all",
      filterMixType: sp.get("filterMixType") ?? "all",
      filterVehicle: sp.get("filterVehicle") ?? "all",
      filterOwner: sp.get("filterOwner") ?? "all",
      filterPlantName: sp.get("filterPlantName") ?? "all",
    };
  })();
  // Date filters are session-only — not persisted to localStorage.
  // Persisting absolute date ranges causes historical data to disappear on the
  // next visit if the saved range no longer covers any records (e.g. a "today"
  // range saved via a management-report deep-link on June 1 would hide all
  // Feb-March records on every subsequent plain visit).
  const [filterDateFrom, setFilterDateFrom] = useState<string>(
    urlDispatchFilterDefaults.filterDateFrom ?? ""
  );
  const [filterDateTo, setFilterDateTo] = useState<string>(
    urlDispatchFilterDefaults.filterDateTo ?? ""
  );

  // v2: removed filterDateFrom/filterDateTo from persisted state (see above)
  const [persistedFilters, setPersistedFilters, resetPersistedFilters] = usePersistedFilters(
    "plant-dispatches:last-filters:v2",
    {
      filterPartyId: urlDispatchFilterDefaults.filterPartyId ?? "all",
      filterMixType: urlDispatchFilterDefaults.filterMixType ?? "all",
      filterVehicle: urlDispatchFilterDefaults.filterVehicle ?? "all",
      filterOwner: urlDispatchFilterDefaults.filterOwner ?? "all",
      filterPlantName: urlDispatchFilterDefaults.filterPlantName ?? "all",
    },
    { shouldHydrate: !urlHasDispatchFilterParams },
  );
  const { filterPartyId, filterMixType, filterVehicle, filterOwner, filterPlantName } = persistedFilters;
  const setFilterPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, filterPartyId: v }));
  const setFilterMixType = (v: string) => setPersistedFilters((f) => ({ ...f, filterMixType: v }));
  const setFilterVehicle = (v: string) => setPersistedFilters((f) => ({ ...f, filterVehicle: v }));
  const setFilterOwner = (v: string) => setPersistedFilters((f) => ({ ...f, filterOwner: v }));
  const setFilterPlantName = (v: string) => setPersistedFilters((f) => ({ ...f, filterPlantName: v }));
  
  const authenticatedRole = "manager";
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [mixTemplateId, setMixTemplateId] = useState<string>("");
  const [truckNumber, setTruckNumber] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverMobile, setDriverMobile] = useState("");
  const [actualBitumenPercent, setActualBitumenPercent] = useState("");
  const [actualLdoLiters, setActualLdoLiters] = useState("");
  const [actualAdjustmentReason, setActualAdjustmentReason] = useState("");
  const [bitumenTankNumber, setBitumenTankNumber] = useState("1");
  const [ldoTankNumber, setLdoTankNumber] = useState("1");
  const [transportEquipmentId, setTransportEquipmentId] = useState<number | null>(null);
  const [truckComboOpen, setTruckComboOpen] = useState(false);
  const [overrideTolerance, setOverrideTolerance] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [dispatchDefaultsAvailable, setDispatchDefaultsAvailable] = useState(false);
  const [primaryFieldsExpanded, setPrimaryFieldsExpanded] = useState(false);
  const [partyChangeConfirmation, setPartyChangeConfirmation] = useState<{
    newPartyId: string;
    lastPartyId: string;
    previousSelectionPartyId: string;
    previousSelectionMixId: string;
  } | null>(null);
  
  // Tolerance constant (±10%)
  const TOLERANCE_PERCENT = 10;

  interface DispatchFormData {
    date: string;
    time: string;
    partyId: string;
    mixTemplateId: string;
    truckNumber: string;
    loadWeight: string;
    deliveryLocation: string;
    ownerName: string;
    driverName: string;
    driverMobile: string;
    actualBitumenPercent: string;
    actualLdoLiters: string;
    bitumenTankNumber: string;
    ldoTankNumber: string;
  }

  const formData = useMemo<DispatchFormData>(() => ({
    date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, ownerName, driverName, driverMobile, actualBitumenPercent, actualLdoLiters, bitumenTankNumber, ldoTankNumber
  }), [date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, ownerName, driverName, driverMobile, actualBitumenPercent, actualLdoLiters, bitumenTankNumber, ldoTankNumber]);

  const handleRestoreDraft = useCallback((data: DispatchFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMixTemplateId(data.mixTemplateId);
    setTruckNumber(data.truckNumber);
    setLoadWeight(data.loadWeight);
    setDeliveryLocation(data.deliveryLocation);
    setOwnerName(data.ownerName || "");
    setDriverName(data.driverName || "");
    setDriverMobile(data.driverMobile || "");
    setActualBitumenPercent(data.actualBitumenPercent);
    setActualLdoLiters(data.actualLdoLiters || "");
    setBitumenTankNumber(data.bitumenTankNumber || "1");
    setLdoTankNumber(data.ldoTankNumber || "1");
  }, []);

  const { hasDraft, draftAge, lastSavedAt, isDirty, restoreDraft, discardDraft, clearDraft } = useAutosave<DispatchFormData>({
    formKey: "plant-dispatch-new",
    data: formData,
    enabled: dialogOpen && !editingDispatch,
    onRestore: handleRestoreDraft,
  });

  const [, setLocation] = useLocation();
  const { confirmLeave } = useBeforeUnload(isDirty);

  // Deep-link edit support: ?edit=<dispatchId>
  const searchString = useSearch();
  const editId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("edit");
    return v ? parseInt(v, 10) : null;
  }, [searchString]);
  const [autoEditDone, setAutoEditDone] = useState(false);

  const { data: dispatches, isLoading } = useQuery<Array<TruckDispatch & { supplyOrderNo?: string | null }>>({
    queryKey: ["/api/plant-module/dispatches"],
    refetchInterval: 15_000,
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });
  const { data: supplyAlertLines = [] } = useQuery<Array<{
    orderId: number | null; orderNo: string | null; partyName: string; materialName: string;
    stockAvailable: number | null; dailyNeed: number | null; daysLeft: number | null; uom: string;
    alertType: string; title?: string; message: string; partyId?: number | null;
  }>>({
    queryKey: ["/api/plant-module/supply-orders/active-alerts"],
    queryFn: async () => {
      const response = await fetch("/api/plant-module/supply-orders/active-alerts", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: canCreate,
    refetchInterval: 60_000,
  });

  const dispatchesForPartyDefaults = useMemo(() => {
    const byId = new Map<number, TruckDispatch>();
    for (const dispatch of dispatches || []) byId.set(dispatch.id, dispatch);
    if (lastSavedDispatch) byId.set(lastSavedDispatch.id, lastSavedDispatch);
    return [...byId.values()];
  }, [dispatches, lastSavedDispatch]);

  const latestDispatchForDate = useCallback((targetDate: string) => {
    return dispatchesForPartyDefaults
      .filter(dispatch =>
        dispatch.date === targetDate &&
        (filterPlantName === "all" || dispatch.plantName === filterPlantName) &&
        (!editingDispatch || dispatch.id !== editingDispatch.id)
      )
      .slice()
      .sort((a, b) =>
        (b.time || "").localeCompare(a.time || "") ||
        b.id - a.id
      )[0] || null;
  }, [dispatchesForPartyDefaults, editingDispatch, filterPlantName]);

  // Fetch plant settings so we can resolve plantId → plantName from URL params
  const { data: plantSettingsList } = useQuery<PlantSettings[]>({
    queryKey: ["/api/plant-module/plant-settings"],
    enabled: !!mgmtReportPlantId,
  });

  // When navigated from Management Report with a plantId URL param, resolve the
  // plant name from plant settings and pre-set the active plant filter. This
  // fires once after settings load and only if filterPlantName is still unset.
  const plantIdFilterApplied = useRef(false);
  useEffect(() => {
    if (plantIdFilterApplied.current) return;
    if (!mgmtReportPlantId || !plantSettingsList) return;
    const plant = plantSettingsList.find((p) => p.id === mgmtReportPlantId);
    if (plant) {
      setFilterPlantName(plant.plantName);
      plantIdFilterApplied.current = true;
    }
  }, [mgmtReportPlantId, plantSettingsList]);

  // Resolved label for the management-report banner when navigating without filterPlantName.
  // Priority: active filterPlantName → mgmtReportPlant from URL → looked-up name → numeric ID fallback.
  const resolvedMgmtPlantLabel = (() => {
    if (filterPlantName !== "all") return filterPlantName;
    if (mgmtReportPlant) return mgmtReportPlant;
    if (mgmtReportPlantId) {
      const found = plantSettingsList?.find((p) => p.id === mgmtReportPlantId);
      return found ? found.plantName : String(mgmtReportPlantId);
    }
    return null;
  })();

  const { data: bitumenTankBalances } = useQuery<{ tank1: number; tank2: number; total: number }>({
    queryKey: ["/api/plant-module/bitumen-tank-balances"],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/bitumen-tank-balances`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bitumen tank balances");
      return res.json();
    },
    enabled: dialogOpen,
    refetchInterval: dialogOpen ? 30000 : false,
  });

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: mixTypes } = useQuery<MixType[]>({
    queryKey: ["/api/plant-module/mix-types"],
  });

  const { data: sitesList } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const { data: equipmentList } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const filteredSites = useMemo(() => {
    if (!sitesList) return [];
    if (!partyId) return sitesList.filter(s => s.isActive !== 0);
    const pid = parseInt(partyId);
    return sitesList.filter(s => s.isActive !== 0 && (!s.partyId || s.partyId === pid));
  }, [sitesList, partyId]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!partyId) return templates;
    const pid = parseInt(partyId);
    return templates.filter(t => t.partyId == null || t.partyId === pid);
  }, [templates, partyId]);

  // Shortage confirmation state — shown when the owner's stock can't cover
  // a dispatch and the operator must explicitly approve borrowing from HLC.
  type ShortageInfo = {
    needsConfirmation: true;
    ownerPartyId: number;
    ownerPartyName: string;
    fallbackPartyId: number | null;
    fallbackPartyName: string | null;
    shortages: { materialId: number; materialName: string; required: number; available: number; shortfall: number; uom: string }[];
  };
  type DispatchPayload = Record<string, unknown>;
  type DispatchResult = { __confirmationRequired: true } | Record<string, unknown>;
  const [pendingDispatchPayload, setPendingDispatchPayload] = useState<DispatchPayload | null>(null);
  const [shortageInfo, setShortageInfo] = useState<ShortageInfo | null>(null);

  const createMutation = useMutation<DispatchResult, Error, DispatchPayload>({
    mutationFn: async (data) => {
      // Custom fetch so HTTP 409 (owner-stock shortage) can be surfaced
      // structurally to the UI instead of being thrown.
      const res = await fetch("/api/plant-module/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.status === 409) {
        const body = (await res.json()) as ShortageInfo;
        setPendingDispatchPayload(data);
        setShortageInfo(body);
        return { __confirmationRequired: true };
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: async (result) => {
      if ("__confirmationRequired" in result && result.__confirmationRequired) return;
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      const savedDispatch = (result as any).dispatch as TruckDispatch | undefined;
      if (savedDispatch?.id) {
        setLastSavedDispatch(savedDispatch);
        resetForm();
        const now = new Date();
        const today = format(now, "yyyy-MM-dd");
        setDate(today);
        setTime(format(now, "HH:mm"));
        if (savedDispatch.date === today) {
          setPartyId(String(savedDispatch.partyId));
          setMixTemplateId(String(savedDispatch.mixTemplateId));
          setDeliveryLocation(savedDispatch.deliveryLocation || "");
          setBitumenTankNumber(String(savedDispatch.bitumenTankNumber || 1));
          setLdoTankNumber(String(savedDispatch.ldoTankNumber || 1));
          setDispatchDefaultsAvailable(true);
          setPrimaryFieldsExpanded(false);
        }
        setDialogOpen(true);
      } else {
        setDialogOpen(false);
      }
      const borrowingCount = (result as any).borrowings?.length ?? 0;
      toast({
        title: "Dispatch recorded successfully",
        ...(borrowingCount > 0 ? { description: `${borrowingCount} material line${borrowingCount === 1 ? "" : "s"} borrowed from HLC; awaiting review.` } : {}),
      });
    },
  });

  const confirmHlcBorrow = () => {
    if (!pendingDispatchPayload) return;
    createMutation.mutate({ ...pendingDispatchPayload, allowHlcFallback: true });
    setShortageInfo(null);
    setPendingDispatchPayload(null);
  };

  const cancelHlcBorrow = () => {
    setShortageInfo(null);
    setPendingDispatchPayload(null);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/dispatches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      setEditingDispatch(null);
      resetForm();
      toast({ title: "Dispatch updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/dispatches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDeleteConfirmId(null);
      toast({ title: "Dispatch deleted successfully" });
    },
  });

  const retryDispatchProMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/plant-module/dispatches/${id}/dispatchpro/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      toast({ title: "DispatchPro retry queued" });
    },
    onError: (error: Error) => toast({ title: "Retry could not be queued", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMixTemplateId("");
    setTruckNumber("");
    setLoadWeight("");
    setDeliveryLocation("");
    setOwnerName("");
    setDriverName("");
    setDriverMobile("");
    setActualBitumenPercent("");
    setActualLdoLiters("");
    setActualAdjustmentReason("");
    setBitumenTankNumber("1");
    setLdoTankNumber("1");
    setTransportEquipmentId(null);
    setEditingDispatch(null);
    setOverrideTolerance(false);
    setMoreDetailsOpen(false);
    setDispatchDefaultsAvailable(false);
    setPrimaryFieldsExpanded(false);
    setPartyChangeConfirmation(null);
  };

  const openNewDispatchDialog = () => {
    resetForm();
    const now = new Date();
    const day = format(now, "yyyy-MM-dd");
    const latestToday = latestDispatchForDate(day);
    setDate(day);
    setTime(format(now, "HH:mm"));
    if (latestToday) {
      setPartyId(String(latestToday.partyId));
      setMixTemplateId(String(latestToday.mixTemplateId));
      setDeliveryLocation(latestToday.deliveryLocation || "");
      setBitumenTankNumber(String(latestToday.bitumenTankNumber || 1));
      setLdoTankNumber(String(latestToday.ldoTankNumber || 1));
      setDispatchDefaultsAvailable(true);
    }
    setDialogOpen(true);
  };

  const openEditDialog = (dispatch: TruckDispatch) => {
    setEditingDispatch(dispatch);
    setDate(dispatch.date);
    setTime(dispatch.time || "");
    setPartyId(String(dispatch.partyId));
    setMixTemplateId(String(dispatch.mixTemplateId));
    setTruckNumber(dispatch.truckNumber);
    setLoadWeight(String(dispatch.loadWeight));
    setDeliveryLocation(dispatch.deliveryLocation || "");
    setOwnerName(dispatch.ownerName || "");
    setDriverName(dispatch.driverName || "");
    setDriverMobile((dispatch as any).driverMobile || "");
    setActualBitumenPercent(dispatch.actualBitumenPercent != null ? String(dispatch.actualBitumenPercent) : "");
    setActualLdoLiters(dispatch.actualLdoQty != null ? String(dispatch.actualLdoQty) : "");
    setActualAdjustmentReason("");
    setBitumenTankNumber(dispatch.bitumenTankNumber ? String(dispatch.bitumenTankNumber) : "1");
    setLdoTankNumber(dispatch.ldoTankNumber ? String(dispatch.ldoTankNumber) : "1");
    setTransportEquipmentId(dispatch.transportEquipmentId || null);
    setOverrideTolerance(false);
    setMoreDetailsOpen(true);
    setDispatchDefaultsAvailable(true);
    setPrimaryFieldsExpanded(true);
    setDialogOpen(true);
  };

  // Calculate theoretical values for validation
  const theoreticalValues = useMemo(() => {
    const template = templates?.find(t => t.id === parseInt(mixTemplateId));
    const weight = parseFloat(loadWeight) || 0;
    if (!template || !weight) return null;
    
    const bitumenPercent = template.bitumenPercent || 0;
    const ldoNorm = template.ldoNorm || 6;
    const theoreticalBitumenQty = (weight * bitumenPercent) / 100;
    const theoreticalLdoQty = weight * ldoNorm;
    
    return {
      bitumenPercent,
      bitumenQty: theoreticalBitumenQty,
      ldoQty: theoreticalLdoQty,
      ldoNorm,
    };
  }, [templates, mixTemplateId, loadWeight]);
  
  // Validate actual values against tolerance
  const validationStatus = useMemo(() => {
    if (!theoreticalValues) return { bitumen: "ok", ldo: "ok" };
    
    const result = { bitumen: "ok" as "ok" | "warning" | "error", ldo: "ok" as "ok" | "warning" | "error" };
    
    // Check bitumen (guard against divide-by-zero)
    if (actualBitumenPercent && theoreticalValues.bitumenPercent > 0) {
      const actualPercent = parseFloat(actualBitumenPercent);
      const variance = ((actualPercent - theoreticalValues.bitumenPercent) / theoreticalValues.bitumenPercent) * 100;
      if (!isNaN(variance)) {
        if (Math.abs(variance) > TOLERANCE_PERCENT) {
          result.bitumen = "error";
        } else if (Math.abs(variance) > 5) {
          result.bitumen = "warning";
        }
      }
    }
    
    // Check LDO against theoretical norm — derive L/ton from entered liters ÷ load weight
    const weight = parseFloat(loadWeight) || 0;
    if (actualLdoLiters && weight > 0 && theoreticalValues.ldoNorm > 0) {
      const actualRate = parseFloat(actualLdoLiters) / weight;
      const variance = ((actualRate - theoreticalValues.ldoNorm) / theoreticalValues.ldoNorm) * 100;
      if (!isNaN(variance)) {
        if (Math.abs(variance) > TOLERANCE_PERCENT) {
          result.ldo = "error";
        } else if (Math.abs(variance) > 5) {
          result.ldo = "warning";
        }
      }
    }
    
    return result;
  }, [theoreticalValues, actualBitumenPercent, actualLdoLiters, loadWeight, TOLERANCE_PERCENT]);

  const actualConsumptionChanged = !!editingDispatch && (
    (actualBitumenPercent ? Number(actualBitumenPercent) : null) !== (editingDispatch.actualBitumenPercent ?? null) ||
    (actualLdoLiters ? Number(actualLdoLiters) : null) !== (editingDispatch.actualLdoQty ?? null)
  );
  
  // Check if values exceed tolerance (block submission unless admin override is active)
  const hasToleranceViolation = validationStatus.bitumen === "error" || validationStatus.ldo === "error";
  const hasToleranceError = hasToleranceViolation && !overrideTolerance;

  // Auto-clear the override checkbox when values drift back within tolerance so
  // no false override audit entry is stamped on a compliant save.
  useEffect(() => {
    if (!hasToleranceViolation && overrideTolerance) {
      setOverrideTolerance(false);
    }
  }, [hasToleranceViolation, overrideTolerance]);

  const showPrimaryFields = !!editingDispatch
    || !dispatchDefaultsAvailable
    || !partyId
    || !mixTemplateId
    || primaryFieldsExpanded;
  const dispatchPartyName = parties?.find(party => String(party.id) === partyId)?.name || "Choose party/job";
  const dispatchMixName = templates?.find(template => String(template.id) === mixTemplateId)?.name || "Choose mix";
  const selectedParty = parties?.find(party => String(party.id) === partyId);
  const selectedPartyAlertStatus = selectedParty
    ? selectedParty.dispatchProSiteId?.trim()
      ? "Alerts to site: on"
      : "Not linked — no site alert"
    : "Select a party to see site-alert status";

  const applyPartySelection = (nextPartyId: string) => {
    setPartyId(nextPartyId);
    setDeliveryLocation("");
    if (mixTemplateId && templates) {
      const template = templates.find(item => item.id === Number(mixTemplateId));
      if (template && template.partyId != null && template.partyId !== Number(nextPartyId)) {
        setMixTemplateId("");
      }
    }
  };

  const handlePartySelection = (nextPartyId: string) => {
    const previousDispatch = !editingDispatch ? latestDispatchForDate(date) : null;
    if (previousDispatch && String(previousDispatch.partyId) !== nextPartyId) {
      setPartyId(nextPartyId);
      setPartyChangeConfirmation({
        newPartyId: nextPartyId,
        lastPartyId: String(previousDispatch.partyId),
        previousSelectionPartyId: partyId,
        previousSelectionMixId: mixTemplateId,
      });
      return;
    }
    applyPartySelection(nextPartyId);
  };

  const cancelPartyChange = () => {
    if (partyChangeConfirmation) {
      setPartyId(partyChangeConfirmation.previousSelectionPartyId);
      setMixTemplateId(partyChangeConfirmation.previousSelectionMixId);
    }
    setPartyChangeConfirmation(null);
  };

  const confirmPartyChange = () => {
    if (partyChangeConfirmation) applyPartySelection(partyChangeConfirmation.newPartyId);
    setPartyChangeConfirmation(null);
  };

  const handleSubmit = () => {
    if (!partyId || !mixTemplateId || !truckNumber || !loadWeight) return;

    const nextActualBitumenPercent = actualBitumenPercent ? Number(actualBitumenPercent) : null;
    const nextActualLdoQty = actualLdoLiters ? Number(actualLdoLiters) : null;
    const actualConsumptionChanged = !!editingDispatch && (
      nextActualBitumenPercent !== (editingDispatch.actualBitumenPercent ?? null) ||
      nextActualLdoQty !== (editingDispatch.actualLdoQty ?? null)
    );
    if (actualConsumptionChanged && !actualAdjustmentReason.trim()) {
      toast({
        title: "Reason required",
        description: "Enter a reason for changing actual bitumen or LDO.",
        variant: "destructive",
      });
      setMoreDetailsOpen(true);
      return;
    }
    
    // Block submission if actual values exceed tolerance
    if (hasToleranceError) {
      toast({
        title: "Tolerance Exceeded",
        description: "Actual consumption values must be within ±10% of theoretical. Please adjust or contact admin.",
        variant: "destructive",
      });
      return;
    }
    
    const weight = parseFloat(loadWeight) || 0;
    const actualLdoQty = actualLdoLiters ? parseFloat(actualLdoLiters) : null;

    if (editingDispatch) {
      updateMutation.mutate({
        id: editingDispatch.id,
        data: {
          date,
          time,
          partyId: parseInt(partyId),
          mixTemplateId: parseInt(mixTemplateId),
          truckNumber,
          loadWeight: weight,
          deliveryLocation,
          ownerName: ownerName || null,
          driverName: driverName || null,
          driverMobile: driverMobile || null,
          actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
          actualLdoQty,
          adjustmentReason: actualConsumptionChanged ? actualAdjustmentReason.trim() : undefined,
          adjustedBy: authenticatedRole,
          bitumenTankNumber: parseInt(bitumenTankNumber) || 1,
          ldoTankNumber: parseInt(ldoTankNumber) || 1,
          transportEquipmentId: transportEquipmentId || null,
          overrideTolerance: overrideTolerance || undefined,
        }
      });
    } else {
      createMutation.mutate({
        date,
        time,
        partyId: parseInt(partyId),
        mixTemplateId: parseInt(mixTemplateId),
        truckNumber,
        loadWeight: weight,
        deliveryLocation,
        ownerName: ownerName || null,
        driverName: driverName || null,
        driverMobile: driverMobile || null,
        actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
        actualLdoQty,
        bitumenTankNumber: parseInt(bitumenTankNumber) || 1,
        ldoTankNumber: parseInt(ldoTankNumber) || 1,
        transportEquipmentId: transportEquipmentId || null,
        overrideTolerance: overrideTolerance || undefined,
      });
    }
  };

  const handleEditClick = (dispatch: TruckDispatch) => openEditDialog(dispatch);
  const handleDeleteClick = (dispatchId: number) => setDeleteConfirmId(dispatchId);

  // Auto-open edit dialog from ?edit=<id> deep link
  useEffect(() => {
    if (editId != null && dispatches && !autoEditDone) {
      const target = dispatches.find(d => d.id === editId);
      if (target) {
        setAutoEditDone(true);
        openEditDialog(target);
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        history.replaceState(null, "", url.toString());
      }
    }
  }, [editId, dispatches, autoEditDone]);

  // When the page was opened via a deep-link ?edit= (e.g. from the stock ledger),
  // navigate back to the origin page once the user closes the dialog.
  useEffect(() => {
    if (autoEditDone && !dialogOpen) {
      setLocation(backLink);
    }
  }, [autoEditDone, dialogOpen]);
  const handleExportExcelClick = () => exportToExcel();
  const handleExportPdfClick = () => exportToPDF();
  const handlePrintClick = () => handlePrint();

  const selectedTemplate = templates?.find(t => t.id === parseInt(mixTemplateId));
  const uniqueVehicles = Array.from(new Set(
    (dispatches || [])
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""))
      .map(d => d.truckNumber)
  ));
  const uniqueOwners = Array.from(new Set(dispatches?.map(d => d.ownerName).filter(Boolean) || [])).sort() as string[];

  // Filter dispatches
  const filteredDispatches = dispatches?.filter(d => {
    if (filterDateFrom && d.date < filterDateFrom) return false;
    if (filterDateTo && d.date > filterDateTo) return false;
    if (filterPartyId !== "all" && d.partyId !== parseInt(filterPartyId)) return false;
    if (filterPlantName !== "all" && d.plantName !== filterPlantName) return false;
    if (filterMixType !== "all") {
      const template = templates?.find(t => t.id === d.mixTemplateId);
      if (template?.mixType?.toUpperCase() !== filterMixType) return false;
    }
    if (filterVehicle !== "all" && d.truckNumber !== filterVehicle) return false;
    if (filterOwner !== "all" && d.ownerName !== filterOwner) return false;
    return true;
  }) || [];

  const isFiltered = filterDateFrom || filterDateTo || filterPartyId !== "all" || filterMixType !== "all" || filterVehicle !== "all" || filterOwner !== "all" || filterPlantName !== "all";

  const allTotals = useMemo(() => {
    const all = dispatches || [];
    return {
      count: all.length,
      loadWeight: all.reduce((sum, d) => sum + (d.loadWeight || 0), 0),
      bitumen: all.reduce((sum, d) => sum + (d.theoreticalBitumenQty || 0), 0),
      ldo: all.reduce((sum, d) => sum + (d.theoreticalLdoQty || 0), 0),
    };
  }, [dispatches]);

  const filteredTotals = useMemo(() => {
    return {
      count: filteredDispatches.length,
      loadWeight: filteredDispatches.reduce((sum, d) => sum + (d.loadWeight || 0), 0),
      bitumen: filteredDispatches.reduce((sum, d) => sum + (d.theoreticalBitumenQty || 0), 0),
      ldo: filteredDispatches.reduce((sum, d) => sum + (d.theoreticalLdoQty || 0), 0),
    };
  }, [filteredDispatches]);

  const statementMixTotals = useMemo(() => {
    const totals = new Map<string, { mix: string; loads: number; mt: number }>();
    for (const dispatch of filteredDispatches) {
      const template = templates?.find(t => t.id === dispatch.mixTemplateId);
      const mix = template?.name || template?.mixType || "Unknown mix";
      const current = totals.get(mix) || { mix, loads: 0, mt: 0 };
      current.loads += 1;
      current.mt += Number(dispatch.loadWeight) || 0;
      totals.set(mix, current);
    }
    return Array.from(totals.values()).sort((a, b) => a.mix.localeCompare(b.mix));
  }, [filteredDispatches, templates]);

  // Group filtered dispatches by date
  const groupedDispatches = filteredDispatches.reduce((acc, dispatch) => {
    const dateKey = dispatch.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(dispatch);
    return acc;
  }, {} as Record<string, Array<TruckDispatch & { supplyOrderNo?: string | null }>>);

  // Sort dates descending, and entries within each date by time descending
  const sortedDates = Object.keys(groupedDispatches).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Unknown";
  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";

  const exportDateRange = (() => {
    const dates = filteredDispatches.map(row => row.date).filter(Boolean).sort();
    return {
      from: filterDateFrom || dates[0] || "all",
      to: filterDateTo || dates[dates.length - 1] || "all",
    };
  })();
  const exportPartyName = filterPartyId !== "all"
    ? getPartyName(Number(filterPartyId))
    : "ALL PARTIES";
  const exportPrintedOn = istDateTimeLabel(new Date());

  // Filenames follow the same naming rule for both the dispatch log and party statement.
  const buildFilename = (extension: string) => {
    const safeParty = exportPartyName.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "PARTY";
    return `${safeParty}_${exportDateRange.from}_${exportDateRange.to}.${extension}`;
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

  // Export functions
  const exportToExcel = async () => {
    try {
      const data = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        const dispatchAt = dispatchDateTime(d.date, d.time);
        const arrival = d.dispatchProArrivedAt || null;
        const unloaded = d.dispatchProLeftAt || null;
        return {
          Date: istDateLabel(d.date),
          "Dispatch time": d.time || "",
          Challan: d.dispatchProChallanNo || "",
          Truck: d.truckNumber,
          Owner: d.ownerName || "",
          Driver: d.driverName || "",
          "Driver mobile": d.driverMobile || "",
          Mix: template?.name || template?.mixType || "",
          "Load (MT)": Number(d.loadWeight) || 0,
          Status: dispatchPlainStatus(d),
          "Arrived at": istDateTimeLabel(arrival),
          "Received by": d.dispatchProArrivedByName || "",
          "Unloaded at": istDateTimeLabel(unloaded),
          "Released by": d.dispatchProLeftByName || "",
          "Travel time": durationLabel(dispatchAt, arrival),
          "Time at site": arrival ? durationLabel(new Date(arrival).getTime(), unloaded) : "",
          "Bitumen (MT)": Number(d.theoreticalBitumenQty) || 0,
          "LDO (L)": Number(d.theoreticalLdoQty) || 0,
        };
      });
      const notUnloaded = filteredDispatches.filter(d => !d.dispatchProLeftAt);
      const mainHeaders = [
        "Date", "Dispatch time", "Challan", "Truck", "Owner", "Driver", "Driver mobile",
        "Mix", "Load (MT)", "Status", "Arrived at", "Received by", "Unloaded at",
        "Released by", "Travel time", "Time at site",
      ];
      const ws = XLSX.utils.aoa_to_sheet([
        [companyName],
        [filterPartyId !== "all" ? exportPartyName : "Dispatch log — all parties"],
        [`Date range: ${exportDateRange.from} to ${exportDateRange.to}`],
        [`Printed on ${exportPrintedOn}`],
        [],
        [...mainHeaders, "Bitumen (MT)", "LDO (L)"],
        ...data.map(row => mainHeaders.map(header => (row as Record<string, unknown>)[header] ?? "").concat([
          row["Bitumen (MT)"],
          row["LDO (L)"],
        ])),
        [],
        ["Totals"],
        ["Trucks", filteredTotals.count],
        ["Total load (MT)", Number(filteredTotals.loadWeight.toFixed(3))],
        ["Not yet unloaded", `${notUnloaded.length} trucks · ${notUnloaded.reduce((sum, d) => sum + (Number(d.loadWeight) || 0), 0).toFixed(3)} MT`],
        [],
        ["MT by mix"],
        ["Mix", "Trucks", "MT"],
        ...statementMixTotals.map(row => [row.mix, row.loads, Number(row.mt.toFixed(3))]),
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, filterPartyId !== "all" ? "Party statement" : "Dispatch log");
      
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
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const title = filterPartyId !== "all" ? "Party daily statement" : "Dispatch log";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(companyName, 10, 10);
      doc.setFontSize(10);
      doc.text(`${title} — ${exportPartyName}`, 10, 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Date range: ${exportDateRange.from} to ${exportDateRange.to}`, 10, 21);
      doc.text(`Printed on ${exportPrintedOn}`, 10, 26);

      const tableData = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        const dispatchAt = dispatchDateTime(d.date, d.time);
        const arrival = d.dispatchProArrivedAt || null;
        const unloaded = d.dispatchProLeftAt || null;
        return [
          istDateLabel(d.date),
          d.time || "",
          d.dispatchProChallanNo || "",
          d.truckNumber,
          d.ownerName || "",
          d.driverName || "",
          d.driverMobile || "",
          template?.name || template?.mixType || "",
          Number(d.loadWeight) || 0,
          dispatchPlainStatus(d),
          istDateTimeLabel(arrival),
          d.dispatchProArrivedByName || "",
          istDateTimeLabel(unloaded),
          d.dispatchProLeftByName || "",
          durationLabel(dispatchAt, arrival),
          arrival ? durationLabel(new Date(arrival).getTime(), unloaded) : "",
        ];
      });
      const headers = [
        "Date", "Dispatch time", "Challan", "Truck", "Owner", "Driver", "Driver mobile",
        "Mix", "Load (MT)", "Status", "Arrived at", "Received by", "Unloaded at",
        "Released by", "Travel time", "Time at site",
      ];
      const notUnloaded = filteredDispatches.filter(d => !d.dispatchProLeftAt);
      autoTable(doc, {
        startY: 30,
        head: [headers],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [80, 80, 80], lineWidth: 0.2, fontStyle: "bold" },
        styles: { fontSize: 5.5, textColor: [0, 0, 0], lineColor: [160, 160, 160], lineWidth: 0.1, cellPadding: 1 },
        margin: { left: 8, right: 8, bottom: 12 },
        horizontalPageBreak: false,
        showHead: "everyPage",
      });
      const summaryTop = ((doc as any).lastAutoTable?.finalY || 30) + 5;
      autoTable(doc, {
        startY: summaryTop,
        head: [["Summary", "Value"]],
        body: [
          ["Total trucks", String(filteredTotals.count)],
          ["Total load (MT)", filteredTotals.loadWeight.toFixed(3)],
          ["Not yet unloaded", `${notUnloaded.length} trucks · ${notUnloaded.reduce((sum, d) => sum + (Number(d.loadWeight) || 0), 0).toFixed(3)} MT`],
        ],
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [80, 80, 80], lineWidth: 0.2 },
        styles: { fontSize: 7, textColor: [0, 0, 0], lineColor: [160, 160, 160], lineWidth: 0.1, cellPadding: 1 },
        margin: { left: 8, right: 8, bottom: 12 },
        showHead: "everyPage",
      });
      autoTable(doc, {
        startY: ((doc as any).lastAutoTable?.finalY || summaryTop) + 3,
        head: [["MT by mix", "Trucks", "MT"]],
        body: statementMixTotals.map(row => [row.mix, String(row.loads), row.mt.toFixed(3)]),
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [80, 80, 80], lineWidth: 0.2 },
        styles: { fontSize: 7, textColor: [0, 0, 0], lineColor: [160, 160, 160], lineWidth: 0.1, cellPadding: 1 },
        margin: { left: 8, right: 8, bottom: 12 },
        showHead: "everyPage",
      });

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text(`Page ${page} of ${pageCount}`, doc.internal.pageSize.getWidth() - 8, doc.internal.pageSize.getHeight() - 5, { align: "right" });
      }

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
    const statementTitle = filterPartyId !== "all" ? "Party daily statement" : "Plant production and dispatches report";
    const mixTotalsRows = statementMixTotals.map(row => `
      <tr><td>${row.mix}</td><td>${row.loads}</td><td>${row.mt.toFixed(3)}</td></tr>
    `).join("");
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mix Dispatches Report</title>
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
            <img src="${window.location.origin}/${logoFile}" style="height: 50px; margin-bottom: 5px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">${companyName}</h2>
          </div>
          <div class="header">
            <h1>${statementTitle}</h1>
            ${filterPartyId !== "all" ? `<p class="date">Party: ${formatPersonName(getPartyName(Number(filterPartyId)))}</p>` : ""}
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Challan</th>
                <th>Vehicle</th>
                <th>Party / job</th>
                <th>Mix</th>
                <th>Load (MT)</th>
                <th>Arrived</th>
                <th>Unloaded</th>
              </tr>
            </thead>
            <tbody>
              ${filteredDispatches.map(d => {
                const template = templates?.find(t => t.id === d.mixTemplateId);
                return `
                <tr>
                  <td>${d.date}</td>
                  <td>${d.time || '-'}</td>
                  <td>${d.dispatchProChallanNo || '-'}</td>
                  <td>${d.truckNumber}</td>
                <td>${formatPersonName(getPartyName(d.partyId))}</td>
                  <td>${template?.name || template?.mixType || '-'}</td>
                  <td>${d.loadWeight}</td>
                  <td>${d.dispatchProArrivedAt ? format(new Date(d.dispatchProArrivedAt), "dd MMM HH:mm") : '-'}</td>
                  <td>${d.dispatchProLeftAt ? format(new Date(d.dispatchProLeftAt), "dd MMM HH:mm") : '-'}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
          <h2 style="font-size:12px;margin:16px 0 6px">Totals by mix</h2>
          <table>
            <thead><tr><th>Mix</th><th>Loads</th><th>Total (MT)</th></tr></thead>
            <tbody>${mixTotalsRows}</tbody>
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
      {/* Management Report context banner */}
      {(mgmtReportPlant || mgmtReportPlantId) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300" data-testid="banner-management-report">
          <BarChart2 className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <span>
            From Management Report
            {resolvedMgmtPlantLabel
              ? <> — Filtered to plant: <strong>{resolvedMgmtPlantLabel}</strong></>
              : null}
          </span>
        </div>
      )}

      {supplyAlertLines.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {supplyAlertLines.map((line, index) => (
            <p key={`${line.alertType}-${line.orderId ?? line.partyId}-${index}`}>
              {line.message}{" "}
              {line.orderId && line.orderNo && <a className="font-semibold underline" href={`/plant/supply-orders?orderId=${line.orderId}`}>Open {line.orderNo}</a>}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Mix dispatches</h1>
            <p className="text-muted-foreground">Record outgoing bituminous mix loads by party/job</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          {canCreate && (
            <Button className="gap-2" onClick={openNewDispatchDialog} data-testid="button-add-dispatch">
              <Plus className="w-4 h-4" /> New Dispatch
            </Button>
          )}
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDispatch ? "Edit dispatch" : "Record production dispatch"}</DialogTitle>
            </DialogHeader>
            <div className="rounded-md border bg-muted/20 p-3" data-testid="text-dispatch-defaults">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-tight" data-testid="text-dispatch-party-name">
                    {dispatchPartyName}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground" data-testid="text-dispatch-mix-tank">
                    {dispatchMixName} · Bitumen tank {bitumenTankNumber}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-party-alert-status">
                    {selectedPartyAlertStatus}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setPrimaryFieldsExpanded(true)}
                  data-testid="button-change-dispatch-party-mix"
                >
                  Change
                </Button>
              </div>
            </div>
            {!editingDispatch && lastSavedDispatch && (() => {
              const saved = dispatches?.find(dispatch => dispatch.id === lastSavedDispatch.id) || lastSavedDispatch;
              return (
                <div className="rounded-md border px-3 py-2 text-sm" role="status" data-testid="text-last-saved-dispatch">
                  <span className="font-medium">Last saved:</span> {saved.truckNumber} · {saved.loadWeight} MT
                  {" · "}
                  {saved.dispatchProSyncStatus === "sent"
                    ? dispatchProSentText(saved)
                    : saved.dispatchProSyncStatus === "waiting"
                      ? `Not sent to DispatchPro — ${dispatchProPlainReason(saved.dispatchProLastError)}`
                      : saved.dispatchProSyncStatus === "not_updated"
                        ? `Not sent to DispatchPro — ${dispatchProPlainReason(saved.dispatchProLastError)}`
                        : saved.dispatchProSyncStatus === "not_sent"
                          ? `Not sent to DispatchPro — ${dispatchProPlainReason(saved.dispatchProLastError)}`
                          : "Party not linked to a DispatchPro site"}
                </div>
              );
            })()}
            {hasDraft && !editingDispatch && (
              <DraftRestoreBanner
                draftAge={draftAge}
                onRestore={restoreDraft}
                onDiscard={discardDraft}
              />
            )}
            <div className="space-y-4 pt-4">
              {showPrimaryFields ? (
                <div className="space-y-4 rounded-md border p-3" data-testid="section-dispatch-party-mix">
                  <div>
                    <Label>Party/job <span className="text-destructive">*</span></Label>
                    <Select value={partyId} onValueChange={handlePartySelection}>
                      <SelectTrigger data-testid="select-dispatch-party" aria-required="true">
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {parties?.map((party) => (
                          <SelectItem key={party.id} value={String(party.id)} className="entity-name" data-testid={`option-dispatch-party-${party.id}`}>
                            <div className="flex min-w-0 flex-col">
                              <span>{party.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {party.dispatchProSiteId?.trim() ? "Alerts to site: on" : "Not linked — no site alert"}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Mix template <span className="text-destructive">*</span></Label>
                    <Select
                      value={mixTemplateId}
                      onValueChange={(val) => {
                        if (editingDispatch && val !== mixTemplateId) {
                          setActualBitumenPercent("");
                          setActualLdoLiters("");
                          setActualAdjustmentReason("");
                        }
                        setMixTemplateId(val);
                      }}
                    >
                      <SelectTrigger data-testid="select-mix-template" aria-required="true">
                        <SelectValue placeholder="Select mix template" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredTemplates.map((template) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            {template.name} ({template.mixType} - {template.bitumenPercent}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Theoretical bitumen: {selectedTemplate.bitumenPercent}%
                      </p>
                    )}
                  </div>
                  {dispatchDefaultsAvailable && primaryFieldsExpanded && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={!partyId || !mixTemplateId}
                      onClick={() => setPrimaryFieldsExpanded(false)}
                      data-testid="button-dispatch-party-mix-done"
                    >
                      Done
                    </Button>
                  )}
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-expanded={moreDetailsOpen}
                onClick={() => setMoreDetailsOpen(open => !open)}
                data-testid="button-dispatch-more-details"
              >
                {moreDetailsOpen ? "Hide more details" : "More details"}
                <span aria-hidden="true">{moreDetailsOpen ? "−" : "+"}</span>
              </Button>
              {moreDetailsOpen && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-dispatch-date" />
                    </div>
                    <div>
                      <Label>Time</Label>
                      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-dispatch-time" />
                    </div>
                  </div>

                </>
              )}

              <div>
                <Label>Truck / Vehicle</Label>
                <Popover open={truckComboOpen} onOpenChange={setTruckComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={truckComboOpen}
                      className="w-full justify-between font-normal"
                      data-testid="input-truck-number"
                    >
                      {truckNumber || "Select or type truck number..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or type truck number..."
                        value={truckNumber}
                        onValueChange={(val) => {
                          setTruckNumber(val);
                          setTransportEquipmentId(null);
                        }}
                        data-testid="input-truck-search"
                      />
                      <CommandList>
                        <CommandEmpty>
                          {truckNumber ? (
                            <button
                              className="w-full text-left px-2 py-1.5 text-sm cursor-pointer"
                              onClick={() => {
                                setTruckComboOpen(false);
                              }}
                              data-testid="button-use-custom-truck"
                            >
                              Use "{truckNumber}" as custom entry
                            </button>
                          ) : (
                            "Type a truck number or search equipment..."
                          )}
                        </CommandEmpty>
                        {uniqueVehicles.length > 0 && (
                          <CommandGroup heading="Recent trip vehicles">
                            {uniqueVehicles.slice(0, 10).map((vehicle) => (
                              <CommandItem
                                key={`recent-${vehicle}`}
                                value={`recent ${vehicle}`}
                                onSelect={() => {
                                  setTruckNumber(vehicle);
                                  const equipment = equipmentList?.find(item => item.registrationNumber === vehicle);
                                  setTransportEquipmentId(equipment?.id ?? null);
                                  if (equipment?.vendorName && !ownerName) setOwnerName(equipment.vendorName);
                                  setTruckComboOpen(false);
                                }}
                              >
                                {vehicle}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        <CommandGroup heading="Equipment Master">
                          {(equipmentList || [])
                            .filter(eq => eq.isActive === 1)
                            .filter(eq => {
                              if (!truckNumber) return true;
                              const search = truckNumber.toLowerCase();
                              return (
                                eq.name?.toLowerCase().includes(search) ||
                                eq.registrationNumber?.toLowerCase().includes(search) ||
                                eq.vendorName?.toLowerCase().includes(search)
                              );
                            })
                            .map((eq) => (
                              <CommandItem
                                key={eq.id}
                                value={`${eq.name} ${eq.registrationNumber || ""} ${eq.vendorName || ""}`}
                                onSelect={() => {
                                  setTruckNumber(eq.registrationNumber || eq.name);
                                  setTransportEquipmentId(eq.id);
                                  if (eq.vendorName && !ownerName) {
                                  setOwnerName(eq.vendorName);
                                  }
                                  setTruckComboOpen(false);
                                }}
                                data-testid={`option-equipment-${eq.id}`}
                              >
                                <Check className={cn("mr-2 h-4 w-4", transportEquipmentId === eq.id ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="font-medium entity-name">{eq.name} {eq.registrationNumber ? `(${eq.registrationNumber})` : ""}</span>
                                  {eq.vendorName && <span className="text-sm text-muted-foreground">{eq.vendorName}</span>}
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {transportEquipmentId && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Linked to Equipment Master #{transportEquipmentId}
                  </p>
                )}
              </div>

              <div>
                <Label>Load weight (MT)</Label>
                <Input type="number" step="0.1" value={loadWeight} onChange={(e) => setLoadWeight(e.target.value)} placeholder="e.g., 20.5" data-testid="input-load-weight" />
              </div>

              {moreDetailsOpen && (
                <>
              <div>
                <Label>Delivery site (optional)</Label>
                <Select value={deliveryLocation || "__none__"} onValueChange={(v) => setDeliveryLocation(v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="input-delivery-location">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {filteredSites.map(s => (
                      <SelectItem key={s.id} value={s.name} className="entity-name">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Bitumen tank</Label>
                    {bitumenTankBalances && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${bitumenTankNumber === "1" ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400' : 'bg-muted text-muted-foreground'}`}>
                          T1: {bitumenTankBalances.tank1.toFixed(2)}T
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${bitumenTankNumber === "2" ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 ring-1 ring-purple-400' : 'bg-muted text-muted-foreground'}`}>
                          T2: {bitumenTankBalances.tank2.toFixed(2)}T
                        </span>
                      </div>
                    )}
                  </div>
                  <Select value={bitumenTankNumber} onValueChange={setBitumenTankNumber}>
                    <SelectTrigger data-testid="select-bitumen-tank">
                      <SelectValue placeholder="Select tank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">
                        Tank 1{bitumenTankBalances ? ` — ${bitumenTankBalances.tank1.toFixed(2)} MT` : ""}
                      </SelectItem>
                      <SelectItem value="2">
                        Tank 2{bitumenTankBalances ? ` — ${bitumenTankBalances.tank2.toFixed(2)} MT` : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {(() => {
                    if (!bitumenTankBalances || !theoreticalValues) return null;
                    const totalAvailable = bitumenTankBalances.total;
                      const selectedBalance = bitumenTankNumber === "1" ? bitumenTankBalances.tank1 : bitumenTankBalances.tank2;
                      const otherTankNum = bitumenTankNumber === "1" ? "2" : "1";
                      const otherBalance = bitumenTankNumber === "1" ? bitumenTankBalances.tank2 : bitumenTankBalances.tank1;
                      const needed = theoreticalValues.bitumenQty;
                      if (needed <= 0) return null;
                      if (totalAvailable < needed) {
                        return (
                          <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>
                              Total bitumen stock is only <strong>{totalAvailable.toFixed(3)} MT</strong> — need {needed.toFixed(3)} MT.
                              {(selectedBalance < needed && otherBalance >= needed)
                                ? <> Tank {otherTankNum} ({otherBalance.toFixed(3)} MT) may have enough — verify levels.</>
                                : <> Check physical tank levels.</>
                              }
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                </div>
                <div>
                  <Label>LDO Tank</Label>
                  <Select value={ldoTankNumber} onValueChange={setLdoTankNumber}>
                    <SelectTrigger data-testid="select-ldo-tank">
                      <SelectValue placeholder="Select tank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Boiler Meter</SelectItem>
                      <SelectItem value="2">Dryer Meter</SelectItem>
                    </SelectContent>
                  </Select>
                  {theoreticalValues && (
                    <p className="text-sm text-muted-foreground mt-1" data-testid="text-ldo-theoretical-qty">
                      Deduction: <span className="font-mono font-semibold text-foreground">{theoreticalValues.ldoQty.toFixed(1)} L</span>
                      {" "}({theoreticalValues.ldoNorm} L/MT × {loadWeight} MT)
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Owner name (optional)</Label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Vehicle owner" data-testid="input-owner-name" />
                </div>
                <div>
                  <Label>Driver name (optional)</Label>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" data-testid="input-driver-name" />
                </div>
              </div>
              <div>
                <Label>Driver mobile (optional)</Label>
                <Input
                  type="tel"
                  value={driverMobile}
                  onChange={(e) => setDriverMobile(e.target.value)}
                  placeholder="Driver mobile"
                  data-testid="input-driver-mobile"
                />
              </div>

              {/* Theoretical Values Display */}
              {theoreticalValues && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-sm font-medium mb-2">Theoretical Consumption (from mix formula)</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Bitumen: <span className="font-mono">{theoreticalValues.bitumenPercent}%</span> = <span className="font-mono">{theoreticalValues.bitumenQty.toFixed(3)} MT</span></div>
                    <div>LDO: <span className="font-mono">{theoreticalValues.ldoNorm} L/MT</span> = <span className="font-mono font-semibold">{theoreticalValues.ldoQty.toFixed(1)} L</span></div>
                  </div>
                </div>
              )}

              {/* Actual usage remains visible only to an engineer/Owner editing an existing dispatch. */}
              {editingDispatch && canOverrideTolerance && <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>
                    Actual LDO (Liters){" "}
                    <span className="font-normal text-muted-foreground text-sm">(optional)</span>
                  </Label>
                  {validationStatus.ldo !== "ok" && (
                    <Badge variant={validationStatus.ldo === "error" ? "destructive" : "secondary"} className="text-sm">
                      {validationStatus.ldo === "error" ? "Exceeds ±10%" : "Variance"}
                    </Badge>
                  )}
                </div>
                <Input
                  type="number"
                  step="1"
                  value={actualLdoLiters}
                  onChange={(e) => setActualLdoLiters(e.target.value)}
                  placeholder={theoreticalValues ? `Theoretical: ${theoreticalValues.ldoQty.toFixed(1)} L` : "Leave blank to use theoretical"}
                  className={validationStatus.ldo === "error" ? "border-red-500" : validationStatus.ldo === "warning" ? "border-amber-500" : ""}
                  data-testid="input-actual-ldo"
                />
                {actualLdoLiters && parseFloat(loadWeight) > 0 ? (
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-actual-ldo-total">
                    Rate: <span className="font-mono">{(parseFloat(actualLdoLiters) / parseFloat(loadWeight)).toFixed(2)} L/MT</span>
                    {theoreticalValues && (
                      <span className="ml-2">(norm {theoreticalValues.ldoNorm} L/MT)</span>
                    )}
                  </p>
                ) : theoreticalValues ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Leave blank to use theoretical: <span className="font-mono">{theoreticalValues.ldoQty.toFixed(1)} L</span>
                  </p>
                ) : null}
              </div>}

              {/* Verification permission can override LDO tolerance on new dispatches */}
              {!editingDispatch && validationStatus.ldo === "error" && canOverrideTolerance && (
                <div className="p-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideTolerance}
                      onChange={(e) => setOverrideTolerance(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600"
                      data-testid="checkbox-override-tolerance"
                    />
                    <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      Admin Override — record this out-of-tolerance LDO value
                      <span className="block text-sm font-normal text-orange-600 dark:text-orange-400 mt-0.5">
                        The deviation will be flagged in the audit log for traceability.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {editingDispatch && canOverrideTolerance && (
                <div className={`p-3 rounded-lg border ${hasToleranceError ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Actual Consumption (Manager/Admin)</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Actual bitumen %</Label>
                        {validationStatus.bitumen !== "ok" && (
                          <Badge variant={validationStatus.bitumen === "error" ? "destructive" : "secondary"} className="text-sm">
                            {validationStatus.bitumen === "error" ? "Exceeds ±10%" : "Variance"}
                          </Badge>
                        )}
                      </div>
                      <Input 
                        type="number" 
                        step="0.1" 
                        value={actualBitumenPercent} 
                        onChange={(e) => setActualBitumenPercent(e.target.value)} 
                        placeholder={theoreticalValues ? `Theoretical: ${theoreticalValues.bitumenPercent}%` : "Leave blank to use theoretical"} 
                        className={validationStatus.bitumen === "error" ? "border-red-500" : validationStatus.bitumen === "warning" ? "border-amber-500" : ""}
                        data-testid="input-actual-bitumen" 
                      />
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-2">
                    Tolerance: ±{TOLERANCE_PERCENT}% from theoretical. Stock deduction uses theoretical values. Adjustments are logged for audit.
                  </p>
                  {actualConsumptionChanged && (
                    <div className="mt-3">
                      <Label htmlFor="dispatch-adjustment-reason">Reason for actual consumption change</Label>
                      <Textarea
                        id="dispatch-adjustment-reason"
                        value={actualAdjustmentReason}
                        onChange={(event) => setActualAdjustmentReason(event.target.value)}
                        placeholder="Required when changing actual bitumen or LDO"
                        data-testid="input-dispatch-adjustment-reason"
                      />
                    </div>
                  )}

                  {hasToleranceViolation && canOverrideTolerance && (
                    <div className="mt-3 p-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overrideTolerance}
                          onChange={(e) => setOverrideTolerance(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600"
                          data-testid="checkbox-override-tolerance"
                        />
                        <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                          Admin Override — record this out-of-tolerance value
                          <span className="block text-sm font-normal text-orange-600 dark:text-orange-400 mt-0.5">
                            The deviation will be flagged in the audit log for traceability.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
                </>
              )}

              <div className="space-y-1.5">
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !partyId || !mixTemplateId || !truckNumber || !loadWeight || hasToleranceError} data-testid="button-save-dispatch">
                  {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingDispatch ? "Update Dispatch" : "Save Dispatch"}
                </Button>
                {!editingDispatch && <AutoSaveIndicator lastSavedAt={lastSavedAt} className="justify-center w-full" />}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Export/Print Actions */}
      {canExport && (
        <div className="flex flex-wrap items-center gap-2 p-4 rounded-lg bg-muted/50">
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredDispatches.length} data-testid="button-export-excel">
            <Download className="w-4 h-4" /> {filterPartyId !== "all" ? "Statement Excel" : "Export Excel"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredDispatches.length} data-testid="button-export-pdf">
            <Download className="w-4 h-4" /> {filterPartyId !== "all" ? "Statement PDF" : "Export PDF"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          {isFiltered && (
            <div className="flex justify-end mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { resetPersistedFilters(); setFilterDateFrom(""); setFilterDateTo(""); }}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset filters
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">PARTY</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)} className="entity-name">{party.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">MIX TYPE</Label>
              <Select value={filterMixType} onValueChange={setFilterMixType}>
                <SelectTrigger data-testid="select-filter-mix-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {mixTypes?.map(type => (
                    <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">VEHICLE NO</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger data-testid="select-filter-vehicle">
                  <SelectValue placeholder="All Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {uniqueVehicles.map(vehicle => (
                    <SelectItem key={vehicle} value={vehicle}>{vehicle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">OWNER</Label>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger data-testid="select-filter-owner">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {uniqueOwners.map(owner => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals Summary */}
      {dispatches && dispatches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isFiltered ? (
            <>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED DISPATCHES</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-count">{filteredTotals.count}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.count} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED LOAD (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-load">{filteredTotals.loadWeight.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.loadWeight.toFixed(3)} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED BITUMEN (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-bitumen">{filteredTotals.bitumen.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.bitumen.toFixed(3)} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED LDO (L)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-ldo">{filteredTotals.ldo.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.ldo.toFixed(3)} total</p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL DISPATCHES</p>
                  <p className="text-2xl font-bold" data-testid="text-total-count">{allTotals.count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL LOAD (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-load">{allTotals.loadWeight.toFixed(3)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL BITUMEN (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-bitumen">{allTotals.bitumen.toFixed(3)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL LDO (L)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-ldo">{allTotals.ldo.toFixed(3)}</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this dispatch? This will reverse the stock ledger entries.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Dispatch Log
            {filteredDispatches.length > 0 && (
              <Badge variant="secondary">{filteredDispatches.length} records</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredDispatches.length ? (
            <p className="text-muted-foreground text-center py-8">
              {dispatches?.length ? "No dispatches match the current filters." : "No dispatches recorded yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayDispatches = groupedDispatches[dateKey].sort((a, b) => (b.time || "").localeCompare(a.time || ""));
                return (
                  <div key={dateKey}>
                    <div className="sticky top-14 z-10 bg-background border-b pb-2 mb-3 pt-1">
                      <h3 className="font-semibold text-lg">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    </div>
                    <div className="space-y-2">
                      {dayDispatches.map((dispatch) => {
                        const template = templates?.find(t => t.id === dispatch.mixTemplateId);
                        return (
                          <div key={dispatch.id} className="rounded-lg bg-muted/50 overflow-hidden">
                            {(() => {
                              const isExpanded = expandedIds.has(dispatch.id);
                              return (
                            <>
                            <div
                              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                              onClick={() => setExpandedIds(prev => { const s = new Set(prev); s.has(dispatch.id) ? s.delete(dispatch.id) : s.add(dispatch.id); return s; })}
                            >
                              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
                              <div className="flex-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-sm min-w-0">
                                <span className="font-semibold">{dispatch.truckNumber}</span>
                                <span className="font-medium">{dispatch.loadWeight} MT</span>
                                <Badge variant="outline" className="text-sm">{template?.mixType || "-"}</Badge>
                                <span className="text-sm text-muted-foreground">{getPartyName(dispatch.partyId)}</span>
                                <Badge variant={dispatch.supplyOrderNo ? "secondary" : "outline"} className="text-xs">
                                  {dispatch.supplyOrderNo ? `Order ${dispatch.supplyOrderNo}` : "No order"}
                                </Badge>
                                {dispatch.dispatchProSyncStatus === "sent" && (
                                  <span className="text-xs text-muted-foreground">{dispatchProSentText(dispatch)}</span>
                                )}
                                {dispatch.dispatchProSyncStatus !== "sent" && (
                                  <span className={`text-xs ${dispatch.dispatchProSyncStatus ? "text-destructive" : "text-muted-foreground"}`}>
                                    {parties?.find(p => p.id === dispatch.partyId)?.dispatchProSiteId?.trim()
                                      ? `Not sent to DispatchPro — ${dispatchProPlainReason(dispatch.dispatchProLastError)}`
                                      : "Party not linked to a DispatchPro site"}
                                  </span>
                                )}
                                {dispatch.ownerName && <span className="text-sm text-muted-foreground">{dispatch.ownerName}</span>}
                                {dispatch.time && <span className="text-sm text-muted-foreground">{dispatch.time}</span>}
                                {((dispatch.bitumenVariancePercent != null && Number(dispatch.bitumenVariancePercent) !== 0) ||
                                  (dispatch.ldoVariancePercent != null && Number(dispatch.ldoVariancePercent) !== 0)) && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                <EditPermissionButton
                                  recordType="truck_dispatch"
                                  recordId={dispatch.id}
                                  onEditGranted={() => handleEditClick(dispatch)}
                                  size="sm"
                                />
                                {canEdit && (
                                  <>
                                    <Button size="icon" variant="ghost" onClick={() => handleEditClick(dispatch)} data-testid={`button-edit-dispatch-${dispatch.id}`}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(dispatch.id)} data-testid={`button-delete-dispatch-${dispatch.id}`}>
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            {isExpanded && (
                            <div className="px-4 pb-4 pt-3 border-t border-border/50">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground text-sm block">Time</span>
                                <span className="font-medium">{dispatch.time || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Truck</span>
                                <span className="font-medium">{dispatch.truckNumber}</span>
                                {dispatch.transportEquipmentId && (() => {
                                  const eq = equipmentList?.find(e => e.id === dispatch.transportEquipmentId);
                                  if (!eq) return null;
                                  const ownerInfo = eq.ownershipStatus === "hired" && eq.vendorName ? `HIRED: ${eq.vendorName}` : `${companyShortName} OWN`;
                                  return (
                                    <span className="text-sm text-muted-foreground block"><span className="entity-name">{eq.name}{eq.registrationNumber ? ` (${eq.registrationNumber})` : ""}</span> — {ownerInfo}</span>
                                  );
                                })()}
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Load</span>
                                <span className="font-medium">{dispatch.loadWeight} MT</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Mix</span>
                                <Badge variant="outline" className="text-sm">{template?.mixType || "-"}</Badge>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Party</span>
                                <span className="font-medium">{getPartyName(dispatch.partyId)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Site</span>
                                <span className="font-medium">{dispatch.deliveryLocation || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Owner</span>
                                <span className="font-medium" data-testid={`text-owner-${dispatch.id}`}>{dispatch.ownerName || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Driver</span>
                                <span className="font-medium" data-testid={`text-driver-${dispatch.id}`}>{dispatch.driverName || "-"}</span>
                              </div>
                              {(() => {
                                const partyLinked = !!parties?.find(p => p.id === dispatch.partyId)?.dispatchProSiteId;
                                const status = dispatch.dispatchProSyncStatus;
                                return (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground text-sm block">DispatchPro</span>
                                    {status === "sent" ? (
                                      <p className="font-medium" data-testid={`text-dispatchpro-sent-${dispatch.id}`}>{dispatchProSentText(dispatch)}</p>
                                    ) : !partyLinked ? (
                                      <p className="font-medium">
                                        Party not linked to a DispatchPro site.
                                        {user?.isOwner && <> <Link className="underline" href="/masters/section/parties">Link party in Masters</Link></>}
                                      </p>
                                    ) : (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-destructive">
                                          {status === "waiting" ? "Waiting to send" : "Not sent to DispatchPro"} — {dispatchProPlainReason(dispatch.dispatchProLastError)}
                                        </p>
                                        {(status === "not_sent" || status === "not_updated") && canOverrideTolerance && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="ml-2 h-7"
                                        onClick={() => retryDispatchProMutation.mutate(dispatch.id)}
                                        disabled={retryDispatchProMutation.isPending}
                                        data-testid={`button-dispatchpro-retry-${dispatch.id}`}
                                      >
                                        Retry
                                      </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              <div>
                                <span className="text-muted-foreground text-sm block">Bitumen (MT)</span>
                                <span className="font-medium">{dispatch.theoreticalBitumenQty?.toFixed(3) || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">LDO (L)</span>
                                <span className="font-medium">{dispatch.theoreticalLdoQty?.toFixed(3) || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Tanks</span>
                                <span className="font-medium text-sm">B{dispatch.bitumenTankNumber || 1} / L{dispatch.ldoTankNumber || 1}</span>
                              </div>
                              {((dispatch.bitumenVariancePercent != null && Number(dispatch.bitumenVariancePercent) !== 0) ||
                                (dispatch.ldoVariancePercent != null && Number(dispatch.ldoVariancePercent) !== 0)) && (
                                <div className="flex items-center" title="Variance recorded — see Variance Report for details" data-testid={`indicator-variance-${dispatch.id}`}>
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                </div>
                              )}
                            </div>
                            </div>
                            )}
                            </>
                            );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={partyChangeConfirmation !== null} onOpenChange={(open) => { if (!open) cancelPartyChange(); }}>
        <DialogContent className="max-w-md" data-testid="dialog-party-change-confirmation">
          <DialogHeader>
            <DialogTitle>Confirm party for this truck</DialogTitle>
          </DialogHeader>
          {partyChangeConfirmation && (
            <DialogDescription className="text-sm" data-testid="text-party-change-confirmation">
              This truck is for{" "}
              <span className="font-semibold">
                {parties?.find(party => String(party.id) === partyChangeConfirmation.newPartyId)?.name || "the selected party"}
              </span>
              , the last truck was for{" "}
              <span className="font-semibold">
                {parties?.find(party => String(party.id) === partyChangeConfirmation.lastPartyId)?.name || "another party"}
              </span>
              . Continue?
            </DialogDescription>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelPartyChange} data-testid="button-party-change-go-back">
              Go back
            </Button>
            <Button onClick={confirmPartyChange} data-testid="button-party-change-confirm">
              Yes, this party
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner-stock shortage confirmation — operator must explicitly OK borrowing from HLC */}
      <Dialog open={!!shortageInfo} onOpenChange={(o) => { if (!o) cancelHlcBorrow(); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-stock-shortage">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Owner stock is short
            </DialogTitle>
          </DialogHeader>
          {shortageInfo && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{shortageInfo.ownerPartyName}</span> does not have enough
                stock for this dispatch. The shortfall would have to be borrowed from{" "}
                <span className="font-semibold">{shortageInfo.fallbackPartyName || companyShortName}</span>.
              </p>
              <div className="rounded-md border bg-muted/40">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/60">
                    <tr>
                      <th className="text-left p-2">Material</th>
                      <th className="text-right p-2">Required</th>
                      <th className="text-right p-2">Owner has</th>
                      <th className="text-right p-2 text-amber-700 dark:text-amber-400">Borrow from {companyShortName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortageInfo.shortages.map((s) => (
                      <tr key={s.materialId} className="border-b last:border-0" data-testid={`row-shortage-${s.materialId}`}>
                        <td className="p-2 font-medium entity-name">{s.materialName}</td>
                        <td className="p-2 text-right tabular-nums">{s.required.toFixed(3)} {s.uom}</td>
                        <td className="p-2 text-right tabular-nums">{s.available.toFixed(3)} {s.uom}</td>
                        <td className="p-2 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                          {s.shortfall.toFixed(3)} {s.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                Borrowed quantities will be tagged "(Borrowed from {companyShortName})" in the stock ledger so they remain
                visible for later reconciliation. If this is wrong, cancel and check whether a recent
                receipt is missing for {shortageInfo.ownerPartyName}.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelHlcBorrow} data-testid="button-cancel-borrow">
              Cancel dispatch
            </Button>
            <Button
              onClick={confirmHlcBorrow}
              disabled={createMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-borrow"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Borrow from {companyShortName} and save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
